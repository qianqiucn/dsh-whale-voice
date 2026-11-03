# WeChat native voice sender (standalone module).
# Sends ONE native voice bubble to ONE verified chat by driving the WeChat client UI:
#   right-Alt push-to-talk -> confirm RECORDING -> pre silence -> play wav into CABLE Input
#   -> post silence -> release (send) -> verify a new voice bubble appeared.
# Never touches WeChatAgent, the hook DLL, DSH sessions or the message protocol.
param(
  [Parameter(Mandatory = $true)][string]$Request,
  [Parameter(Mandatory = $true)][string]$JsonOut,
  [string]$ProgressFile = '',
  [string]$CancelFile = '',
  [string]$GlobalCancelFile = ''
)

$ErrorActionPreference = 'Stop'
$script:ModuleRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:LibDir = Join-Path $script:ModuleRoot 'lib'

Add-Type -LiteralPath (Join-Path $script:LibDir 'AudioTool.cs')
Add-Type -LiteralPath (Join-Path $script:LibDir 'AudioPolicy.cs')
Add-Type -LiteralPath (Join-Path $script:LibDir 'AsyncPlayer.cs')
Add-Type -LiteralPath (Join-Path $script:LibDir 'SessionGuard.cs')
Invoke-Expression ([System.IO.File]::ReadAllText((Join-Path $script:LibDir 'WeChatUia.ps1'), [System.Text.Encoding]::UTF8))
Invoke-Expression ([System.IO.File]::ReadAllText((Join-Path $script:LibDir 'FocusPolicy.ps1'), [System.Text.Encoding]::UTF8))
Invoke-Expression ([System.IO.File]::ReadAllText((Join-Path $script:LibDir 'CancelPolicy.ps1'), [System.Text.Encoding]::UTF8))

# Progress markers consumed by the Node service to drive its state machine.
# Only real observations are written here (recording UI seen / release issued / bubble seen).
function Write-Phase([string]$phase) {
  if (-not $ProgressFile) { return }
  try {
    [System.IO.File]::AppendAllText($ProgressFile, ($phase + "`n"), (New-Object System.Text.UTF8Encoding($false)))
  } catch { }
}

function Read-JsonFile([string]$path) {
  if (-not (Test-Path $path)) { throw "missing json: $path" }
  return ([System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8) | ConvertFrom-Json)
}

function Write-JsonFile([string]$path, $obj) {
  $json = $obj | ConvertTo-Json -Depth 8
  $dir = Split-Path -Parent $path
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  [System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding($false)))
}

# ---------------- config / request ----------------
$cfg = Read-JsonFile (Join-Path $script:ModuleRoot 'config.json')
$req = Read-JsonFile $Request

function Pick($name, $default) {
  $v = $req.PSObject.Properties[$name]
  if ($v -and $null -ne $v.Value) { return $v.Value }
  $c = $cfg.PSObject.Properties[$name]
  if ($c -and $null -ne $c.Value) { return $c.Value }
  return $default
}

$wav = [string]$req.wav
$chat = [string]$req.chat
$preMs = [int](Pick 'voice_pre_silence_ms' 1000)
$postMs = [int](Pick 'voice_post_silence_ms' 1000)
$maxRecordMs = [int](Pick 'voice_max_record_ms' 50000)
$confirmTimeoutMs = [int](Pick 'voice_record_confirm_timeout_ms' 2500)
$cancelConfirmMs = [int](Pick 'voice_cancel_confirm_ms' 800)
$bubbleWaitMs = [int](Pick 'voice_bubble_wait_ms' 3500)
$playExtraMs = [int](Pick 'voice_play_timeout_extra_ms' 3000)
$renderName = [string](Pick 'voice_render_device' 'CABLE Input')
$captureName = [string](Pick 'voice_capture_device' 'CABLE Output')
$requireForeground = [bool](Pick 'voice_require_foreground' $true)
$focusIdleMs = [int](Pick 'voice_focus_require_idle_ms' 1500)
$autoMode = [string](Pick 'voice_auto_mode' 'manual')
if ($autoMode -notin @('manual', 'auto', 'disabled')) { $autoMode = 'manual' }
$autoFindWindow = [bool](Pick 'voice_auto_find_window' $true)
$autoOpenChat = [bool](Pick 'voice_auto_open_chat' $false)
$autoRestoreMinimized = [bool](Pick 'voice_auto_restore_minimized' $true)
$pauseWhenFullscreen = [bool](Pick 'voice_pause_when_fullscreen' $true)
$allowGroupAuto = [bool](Pick 'voice_allow_group_auto' $false)
$wechatProcessPath = [string](Pick 'wechat_process_path' '')
$target = $req.PSObject.Properties['target']
$targetKind = 'private'
$targetIdentityVerified = $false
if ($target -and $target.Value) {
  $tv = $target.Value
  if ($tv.PSObject.Properties['kind'] -and $tv.kind) { $targetKind = [string]$tv.kind }
  if ($tv.PSObject.Properties['identityVerified']) { $targetIdentityVerified = [bool]$tv.identityVerified }
}
if (-not $CancelFile -and $req.PSObject.Properties['cancel_file']) { $CancelFile = [string]$req.cancel_file }
if (-not $GlobalCancelFile -and $req.PSObject.Properties['global_cancel_file']) { $GlobalCancelFile = [string]$req.global_cancel_file }
$cancelAfter = ''
if ($req.PSObject.Properties['cancel_after']) { $cancelAfter = [string]$req.cancel_after }
$reqAutomation = $req.PSObject.Properties['automation']
if ($reqAutomation -and $reqAutomation.Value) {
  $ra = $reqAutomation.Value
  if ($ra.PSObject.Properties['mode'] -and $ra.mode) { $autoMode = [string]$ra.mode }
  if ($ra.PSObject.Properties['autoFindWindow']) { $autoFindWindow = [bool]$ra.autoFindWindow }
  if ($ra.PSObject.Properties['autoOpenChat']) { $autoOpenChat = [bool]$ra.autoOpenChat }
  if ($ra.PSObject.Properties['autoRestoreMinimized']) { $autoRestoreMinimized = [bool]$ra.autoRestoreMinimized }
  if ($ra.PSObject.Properties['pauseWhenFullscreen']) { $pauseWhenFullscreen = [bool]$ra.pauseWhenFullscreen }
}
if ($autoMode -notin @('manual', 'auto', 'disabled')) { $autoMode = 'manual' }
$enabled = [bool](Pick 'voice_enabled' $true)
$reqAllowed = @()
if ($req.PSObject.Properties['voice_allowed_chats'] -and $null -ne $req.voice_allowed_chats) { $reqAllowed = @($req.voice_allowed_chats) }
$cfgAllowed = @()
if ($cfg.PSObject.Properties['voice_allowed_chats'] -and $null -ne $cfg.voice_allowed_chats) { $cfgAllowed = @($cfg.voice_allowed_chats) }
$hasWhitelist = ($reqAllowed.Count -gt 0) -or ($cfgAllowed.Count -gt 0)
$allowed = @()
if ($reqAllowed.Count -gt 0 -and $cfgAllowed.Count -gt 0) {
  # Defense in depth: request (service) and local config must BOTH allow the chat.
  $allowed = @($reqAllowed | Where-Object { $cfgAllowed -contains $_ })
} elseif ($reqAllowed.Count -gt 0) {
  $allowed = @($reqAllowed)
} else {
  $allowed = @($cfgAllowed)
}

$startedAt = (Get-Date)
$result = [ordered]@{
  status           = 'UNKNOWN'
  reason           = ''
  chat             = $chat
  wav              = $wav
  audio_ms         = 0
  pre_silence_ms   = $preMs
  post_silence_ms  = $postMs
  max_record_ms    = $maxRecordMs
  recording_confirmed_ms = -1
  record_total_ms  = -1
  play             = ''
  bubbles_before    = 0
  bubbles_after     = 0
  bubble_name      = ''
  cancel_stage     = ''
  auto_mode        = $autoMode
  restore_ok       = $false
  restore_error    = ''
  restore_before   = @()
  restore_after    = @()
  timeline         = @()
  started_at       = $startedAt.ToString('o')
  finished_at      = ''
}

$script:altDown = $false
$script:recording = $false
$script:cancelUnconfirmed = $false
$script:cancelBubbleAppeared = $false
$script:bubbleBaseline = -1
$script:cancelFile = $CancelFile
$script:globalCancelFile = $GlobalCancelFile
$script:sessionFile = Join-Path (Join-Path $script:ModuleRoot 'run') 'active-session.json'
$script:timeline = New-Object System.Collections.ArrayList

function Note([string]$msg) {
  $ms = [int]((Get-Date) - $startedAt).TotalMilliseconds
  [void]$script:timeline.Add(("{0,6}ms {1}" -f $ms, $msg))
}

$script:cancelRequested = $false
$script:cancelStage = ''
$script:cancelAfterSend = $false
$script:sending = $false
function Test-CancelRequested {
  # The per-job file is written by the queue's emergency/manual cancel path. The global file
  # is written by the hotkey host even if the Node service is busy; only signals newer than
  # this job's start are honored, so a stale stop does not cancel a later task.
  if ($script:cancelFile -and (Test-Path -LiteralPath $script:cancelFile)) { return $true }
  if (-not $script:globalCancelFile -or -not (Test-Path -LiteralPath $script:globalCancelFile)) { return $false }
  try {
    $raw = [System.IO.File]::ReadAllText($script:globalCancelFile, [System.Text.Encoding]::UTF8)
    $obj = $raw | ConvertFrom-Json
    $at = $null
    if ($obj.PSObject.Properties['at'] -and $obj.at) { $at = [datetimeoffset]::Parse([string]$obj.at) }
    if ($at -and $at.UtcDateTime -ge $startedAt.ToUniversalTime()) { return $true }
    $mtime = (Get-Item -LiteralPath $script:globalCancelFile).LastWriteTimeUtc
    return ($mtime -ge $startedAt.ToUniversalTime())
  } catch {
    # An unreadable emergency signal is fail-closed: do not start/send.
    return $true
  }
}

function Set-CancelStage([string]$stage) {
  if (-not $script:cancelStage) { $script:cancelStage = $stage }
}

function Test-Anomaly($win, [string]$expectedChat, $hwnd) {
  $g = [SessionGuard]::Check()
  if ($g -notlike 'OK*') { return ('desktop_not_interactive:' + $g) }
  if (-not $win) { return 'window_gone' }
  $t = Get-ChatTitle $win
  if ($t -ne $expectedChat) { return ('chat_changed:' + $t) }
  if ($requireForeground -and -not [WxInput]::IsForeground($hwnd)) { return 'foreground_lost' }
  return $null
}

function Stop-Recording([string]$why) {
  if (-not $script:altDown) { return $true }
  Note ("cancel requested: " + $why)
  # The verified safe cancellation is Backspace while recording. It must run BEFORE the
  # right-Alt release, otherwise the release itself would send the message.
  try { [WxInput]::Backspace() } catch { }
  Start-Sleep -Milliseconds 200
  try { [WxInput]::RAltUp() } catch { }
  $script:altDown = $false
  $script:recording = $false
  # Confirm the recording UI is gone. If it is not, we cannot prove the message was NOT sent.
  $deadline = (Get-Date).AddMilliseconds($cancelConfirmMs)
  $cleared = $false
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 120
    $w = Get-WeChatWindow
    if ($w) {
      $st = Test-RecordingState $w
      if (-not $st.Active) { $cleared = $true; break }
    }
  }
  if (-not $cleared) { $script:cancelUnconfirmed = $true }
  # A disappearing recording UI does NOT prove the message was not sent: count voice bubbles
  # against the baseline captured at preflight. A new bubble means the cancel failed.
  if ($script:bubbleBaseline -ge 0) {
    Start-Sleep -Milliseconds 400
    $w2 = Get-WeChatWindow
    if ($w2) {
      $nowCount = @(Get-VoiceBubbles $w2).Count
      if ($nowCount -gt $script:bubbleBaseline) {
        $script:cancelUnconfirmed = $true
        $script:cancelBubbleAppeared = $true
        Note ('cancel leaked a bubble: before=' + $script:bubbleBaseline + ' now=' + $nowCount)
      } else {
        Note ('cancel bubble check ok: before=' + $script:bubbleBaseline + ' now=' + $nowCount)
      }
    }
  }
  Note ('cancel confirmed=' + $cleared)
  return $cleared
}

function Set-UserCancelResult([string]$stage) {
  $result.cancel_stage = $stage
  if ($stage -eq 'UNKNOWN') {
    $result.status = 'UNKNOWN'
    $result.reason = 'USER_CANCELLED:cancel_unconfirmed'
  } else {
    $result.status = 'CANCELLED'
    $result.reason = 'USER_CANCELLED:' + $stage
  }
}

function Invoke-CancelStop([string]$why) {
  $wasRecording = [bool]$script:recording
  if (-not $script:altDown) {
    $stage = Get-CancelOutcome -AltDown $false -WasRecording $wasRecording -Cleared $true -BubbleAppeared $false -Sending $false -CancelRequested $true
    Set-CancelStage $stage
    return $stage
  }
  $cleared = Stop-Recording $why
  $stage = Get-CancelOutcome -AltDown $true -WasRecording $wasRecording -Cleared ([bool]$cleared) -BubbleAppeared ([bool]$script:cancelBubbleAppeared) -Sending $false -CancelRequested $true
  Set-CancelStage $stage
  return $stage
}

$mutex = $null
$script:origIds = @()
try {
    # ---------------- preflight ----------------
    if (-not $enabled) { $result.status = 'REJECTED'; $result.reason = 'voice_disabled'; throw 'voice disabled' }

    # Fail-closed desktop/session preflight: locked screen, disconnected RDP, other session,
    # non-Default input desktop or missing foreground window all refuse to start.
    $guard = [SessionGuard]::Check()
    Note ('desktop guard: ' + $guard)
    if ($guard -notlike 'OK*') {
      $result.status = 'REJECTED'
      $result.reason = ('desktop_not_interactive:' + $guard)
      throw 'desktop not interactive'
    }
    if (-not $wav -or -not (Test-Path $wav)) { $result.status = 'REJECTED'; $result.reason = 'wav_missing'; throw 'wav missing' }
    if (-not $chat) { $result.status = 'REJECTED'; $result.reason = 'chat_missing'; throw 'chat missing' }
    if (-not $hasWhitelist -or ($allowed -notcontains $chat)) { $result.status = 'REJECTED'; $result.reason = 'chat_not_allowed'; throw 'chat not in whitelist' }

    $mutex = New-Object System.Threading.Mutex($false, 'Local\WeChatVoiceSender')
    if (-not $mutex.WaitOne(0)) { $result.status = 'REJECTED'; $result.reason = 'busy'; throw 'another voice job running' }

    $desc = [AsyncPlayer]::Describe($wav)
    Note ('wav ' + $desc)
    if ($desc -like 'ERROR*') { $result.status = 'REJECTED'; $result.reason = 'wav_invalid'; throw $desc }
    $m = [regex]::Match($desc, 'durationMs=([0-9.]+)')
    $audioMs = if ($m.Success) { [int][double]$m.Groups[1].Value } else { 0 }
    $result.audio_ms = $audioMs
    if ($audioMs -le 0) { $result.status = 'REJECTED'; $result.reason = 'wav_zero_length'; throw 'zero length' }

    $expectedRecord = $audioMs + $preMs + $postMs + 400
    $result.record_total_ms = -1
    if ($expectedRecord -gt $maxRecordMs) {
      $result.status = 'REJECTED'
      $result.reason = ('audio_too_long:{0}ms+{1}+{2}>max{3}' -f $audioMs, $preMs, $postMs, $maxRecordMs)
      throw 'audio too long'
    }

    $cableIdx = [AsyncPlayer]::FindRender($renderName, '16')
    if ($cableIdx -lt 0) { $result.status = 'REJECTED'; $result.reason = 'render_device_missing'; throw 'CABLE Input missing' }
    $cableCaptureId = [AudioPolicy]::FindCaptureId($captureName)
    if (-not $cableCaptureId) { $result.status = 'REJECTED'; $result.reason = 'capture_device_missing'; throw 'CABLE Output missing' }
    Note ('renderIdx=' + $cableIdx + ' captureId=' + $cableCaptureId)

    if ($autoMode -eq 'disabled') {
      $result.status = 'REJECTED'; $result.reason = 'ui_automation_disabled'; throw 'UI automation disabled'
    }

    # ---------------- locate / verify WeChat, target, foreground ----------------
    $winInfo = Get-WeChatWindowInfo -ExpectedProcessPath $wechatProcessPath
    if (-not $winInfo.Found) {
      $result.status = 'REJECTED'; $result.reason = $winInfo.Reason; throw 'wechat main window not found'
    }
    $win = $winInfo.Window
    $hwnd = Get-WeChatHwnd $win
    $wxSession = [SessionGuard]::WindowSession($hwnd)
    $mySession = [SessionGuard]::CurrentSession()
    if ($wxSession -ne $mySession) {
      $result.status = 'REJECTED'
      $result.reason = ('wechat_window_in_other_session:wx=' + $wxSession + ',me=' + $mySession)
      throw 'wechat window is not on the interactive desktop'
    }
    if ($win.IsMinimized) {
      if ($autoMode -eq 'auto' -and $autoRestoreMinimized) {
        $restore = Restore-WeChatWindow $win
        if (-not $restore.ok) {
          $result.status = 'FAILED'; $result.reason = ('wechat_restore_failed:' + $restore.reason); throw 'wechat restore failed'
        }
        Note 'wechat restored from minimized state'
      } else {
        $result.status = 'REJECTED'; $result.reason = 'wechat_minimized_manual_required'; throw 'wechat minimized'
      }
    }

    $liveChat = Get-ChatTitle $win
    if ($autoMode -eq 'auto') { Write-Phase 'NAVIGATING' }
    if ($liveChat -ne $chat) {
      if ($autoMode -eq 'auto' -and $autoOpenChat) {
        if ($targetKind -eq 'group') {
          $result.status = 'REJECTED'; $result.reason = 'group_ui_identity_unverified'; throw 'group auto-open refuses name-only identity'
        }
        $opened = Open-WeChatChat $win $chat
        if (-not $opened.ok) {
          $result.status = 'REJECTED'; $result.reason = ('target_navigation_failed:' + $opened.reason); throw 'target navigation failed'
        }
        Note ('target chat opened: ' + $chat)
      } else {
        $result.status = 'REJECTED'; $result.reason = ('target_mismatch:' + $liveChat); throw 'target chat mismatch'
      }
    }
    $winInfo = Get-WeChatWindowInfo -ExpectedProcessPath $wechatProcessPath
    if (-not $winInfo.Found) { $result.status = 'REJECTED'; $result.reason = $winInfo.Reason; throw 'wechat main window lost' }
    $win = $winInfo.Window
    $hwnd = Get-WeChatHwnd $win
    $targetCheck = Test-WeChatTarget $win $chat $targetKind $targetIdentityVerified
    if (-not $targetCheck.ok) {
      $result.status = 'REJECTED'; $result.reason = ('target_verify_failed:' + $targetCheck.reason); throw 'target verification failed'
    }
    Write-Phase 'TARGET_VERIFIED'

    $wechatForeground = [WxInput]::IsForeground($hwnd)
    $fullscreen = Test-FullscreenForeground
    $focusGuard = Test-FocusGuard -IsForeground $wechatForeground -IdleMs ([WxInput]::IdleMs()) -IdleThreshold $focusIdleMs -RequireForeground $requireForeground -Mode $autoMode -Fullscreen ([bool]$fullscreen.fullscreen) -PauseWhenFullscreen $pauseWhenFullscreen
    if (-not $focusGuard.Allowed) {
      $result.status = 'FAILED'; $result.reason = $focusGuard.Reason; throw ('focus guard: ' + $focusGuard.Reason)
    }
    if ($focusGuard.NeedsActivation) {
      $activation = Activate-WeChatWindow $win 4
      if (-not $activation.ok) {
        $result.status = 'FAILED'; $result.reason = 'FOREGROUND_ACTIVATION_DENIED'; throw 'foreground activation denied'
      }
      Note 'wechat activated by auto mode'
    }
    if ($requireForeground -and -not [WxInput]::IsForeground($hwnd)) {
      $result.status = 'FAILED'; $result.reason = 'not_foreground'; throw 'wechat not foreground'
    }
    $winInfo = Get-WeChatWindowInfo -ExpectedProcessPath $wechatProcessPath
    if (-not $winInfo.Found) { $result.status = 'FAILED'; $result.reason = $winInfo.Reason; throw 'wechat main window lost after activation' }
    $win = $winInfo.Window
    $targetCheck = Test-WeChatTarget $win $chat $targetKind $targetIdentityVerified
    if (-not $targetCheck.ok) {
      $result.status = 'FAILED'; $result.reason = ('target_changed:' + $targetCheck.reason); throw 'target changed before recording'
    }
    $vb = Get-VoiceButton $win
    if (-not $vb) { $result.status = 'REJECTED'; $result.reason = 'voice_button_missing'; throw 'voice button missing' }
    $bubblesBefore = @(Get-VoiceBubbles $win)
    $result.bubbles_before = $bubblesBefore.Count
    $script:bubbleBaseline = $bubblesBefore.Count
    Note ('preflight ok: chat=' + $targetCheck.title + ' bubblesBefore=' + $bubblesBefore.Count + ' auto=' + $autoMode)

    if (Test-CancelRequested) {
      Set-CancelStage 'CANCELLED_BEFORE_UI'
      $result.status = 'CANCELLED'; $result.reason = 'USER_CANCELLED:CANCELLED_BEFORE_UI'
      throw 'cancelled before devices/UI'
    }

    # ---------------- snapshot + switch capture (only after target verification) ----------------
    for ($role = 0; $role -lt 3; $role++) { $script:origIds += [AudioPolicy]::DefaultId(1, $role) }
    $result.restore_before = @($script:origIds)
    Note ('original capture ids: ' + ($script:origIds -join ' ; '))

    # write a crash-recovery snapshot BEFORE touching any device, so a killed process can be undone
    $snapshot = [ordered]@{
      written_at   = (Get-Date).ToString('o')
      pid          = $PID
      chat         = $chat
      wav          = $wav
      capture_ids  = @($script:origIds)
      switched_to  = $cableCaptureId
    }
    Write-JsonFile $script:sessionFile $snapshot

    $null = [AudioPolicy]::SetAllRoles($cableCaptureId, 1)
    Start-Sleep -Milliseconds 700
    $ok = $true
    for ($role = 0; $role -lt 3; $role++) { if ([AudioPolicy]::DefaultId(1, $role) -ne $cableCaptureId) { $ok = $false } }
    if (-not $ok) { $result.status = 'FAILED'; $result.reason = 'capture_switch_failed'; throw 'capture default not switched' }
    Note 'capture default switched to CABLE Output'

    # ---------------- focus + re-verify immediately before recording ----------------
    if ($requireForeground -and -not [WxInput]::IsForeground($hwnd)) {
      if ($autoMode -eq 'auto') {
        $activation = Activate-WeChatWindow $win 2
        if (-not $activation.ok) {
          $result.status = 'FAILED'; $result.reason = 'FOREGROUND_ACTIVATION_DENIED'; throw 'foreground activation denied before recording'
        }
      } else {
        $result.status = 'FAILED'; $result.reason = 'not_foreground'; throw 'wechat not foreground before recording'
      }
    }
    $winInfo = Get-WeChatWindowInfo -ExpectedProcessPath $wechatProcessPath
    if (-not $winInfo.Found) { $result.status = 'FAILED'; $result.reason = $winInfo.Reason; throw 'wechat window gone before recording' }
    $win = $winInfo.Window
    $targetCheck = Test-WeChatTarget $win $chat $targetKind $targetIdentityVerified
    if (-not $targetCheck.ok) {
      $result.status = 'FAILED'; $result.reason = ('target_changed:' + $targetCheck.reason); throw 'chat changed before recording'
    }
    if (Test-CancelRequested) {
      Set-CancelStage 'CANCELLED_BEFORE_UI'
      $result.status = 'CANCELLED'; $result.reason = 'USER_CANCELLED:CANCELLED_BEFORE_UI'
      throw 'cancelled before recording'
    }
    Note 'wechat focused and target re-verified'
    if (Test-CancelRequested) {
      Set-UserCancelResult 'CANCELLED_BEFORE_UI'
      throw 'USER_CANCELLED before recording'
    }

    # ---------------- start recording ----------------
    [WxInput]::RAltDown()
    $script:altDown = $true
    Note 'right Alt down'

    $confirmStart = Get-Date
    $script:recording = $false
    while (((Get-Date) - $confirmStart).TotalMilliseconds -lt $confirmTimeoutMs) {
      Start-Sleep -Milliseconds 120
      if (Test-CancelRequested) {
        $stage = Invoke-CancelStop 'user_cancelled'
        Set-UserCancelResult $stage
        throw ('USER_CANCELLED while confirming recording: ' + $stage)
      }
      $win = Get-WeChatWindow
      $st = Test-RecordingState $win
      if ($st.Active) { $script:recording = $true; break }
    }
    $result.recording_confirmed_ms = [int]((Get-Date) - $confirmStart).TotalMilliseconds
    if (-not $script:recording) {
      Stop-Recording 'recording_not_confirmed'
      $result.status = 'FAILED'
      $result.reason = 'recording_not_confirmed'
      throw 'recording state not confirmed'
    }
    Note ('recording confirmed in ' + $result.recording_confirmed_ms + 'ms')
    Write-Phase 'RECORDING'

    # ---------------- pre silence (inside recording) ----------------
    $preEnd = (Get-Date).AddMilliseconds($preMs)
    $anomaly = $null
    while ((Get-Date) -lt $preEnd) {
      Start-Sleep -Milliseconds 100
      if (Test-CancelRequested) {
        $stage = Invoke-CancelStop 'user_cancelled'
        Set-UserCancelResult $stage
        throw ('USER_CANCELLED during pre silence: ' + $stage)
      }
      $win = Get-WeChatWindow
      $anomaly = Test-Anomaly $win $chat $hwnd
      if ($anomaly) { break }
    }
    if ($anomaly) {
      Stop-Recording $anomaly
      $result.status = 'CANCELLED'
      $result.reason = $anomaly
      throw ('cancelled during pre silence: ' + $anomaly)
    }
    Note ('pre silence done (' + $preMs + 'ms)')

    # ---------------- play ----------------
    $err = [AsyncPlayer]::Start($wav, $cableIdx)
    if ($err -ne '') {
      Stop-Recording 'play_start_failed'
      $result.status = 'FAILED'
      $result.reason = 'play_start_failed:' + $err
      throw $err
    }
    Note 'playback started'
    $playDeadline = (Get-Date).AddMilliseconds($audioMs + $playExtraMs)
    $anomaly = $null
    while ([AsyncPlayer]::IsPlaying -and (Get-Date) -lt $playDeadline) {
      Start-Sleep -Milliseconds 100
      if (Test-CancelRequested) {
        $abort = [AsyncPlayer]::Abort()
        Note ('playback aborted by user cancel: ' + $abort)
        $stage = Invoke-CancelStop 'user_cancelled'
        Set-UserCancelResult $stage
        throw ('USER_CANCELLED during playback: ' + $stage)
      }
      $win = Get-WeChatWindow
      $anomaly = Test-Anomaly $win $chat $hwnd
      if ($anomaly) { break }
    }
    if ($anomaly) {
      $abort = [AsyncPlayer]::Abort()
      Note ('playback aborted: ' + $abort)
      Stop-Recording $anomaly
      $result.status = 'CANCELLED'
      $result.reason = $anomaly
      throw ('cancelled during playback: ' + $anomaly)
    }
    $playReport = [AsyncPlayer]::WaitForDone(4000)
    $result.play = $playReport
    Note ('playback finished: ' + $playReport)

    # ---------------- post silence (buffer drain then fixed wait) ----------------
    $postEnd = (Get-Date).AddMilliseconds($postMs)
    $anomaly = $null
    while ((Get-Date) -lt $postEnd) {
      Start-Sleep -Milliseconds 100
      if (Test-CancelRequested) {
        $stage = Invoke-CancelStop 'user_cancelled'
        Set-UserCancelResult $stage
        throw ('USER_CANCELLED during post silence: ' + $stage)
      }
      $win = Get-WeChatWindow
      $anomaly = Test-Anomaly $win $chat $hwnd
      if ($anomaly) { break }
    }
    if ($anomaly) {
      Stop-Recording $anomaly
      $result.status = 'CANCELLED'
      $result.reason = $anomaly
      throw ('cancelled during post silence: ' + $anomaly)
    }
    Note ('post silence done (' + $postMs + 'ms)')

    # ---------------- final verify then release ----------------
    if (Test-CancelRequested) {
      $stage = Invoke-CancelStop 'user_cancelled'
      Set-UserCancelResult $stage
      throw ('USER_CANCELLED before release: ' + $stage)
    }
    $win = Get-WeChatWindow
    $anomaly = Test-Anomaly $win $chat $hwnd
    if ($anomaly) {
      Stop-Recording $anomaly
      $result.status = 'CANCELLED'
      $result.reason = $anomaly
      throw ('cancelled before release: ' + $anomaly)
    }
    Write-Phase 'SENDING'
    $script:sending = $true
    [WxInput]::RAltUp()
    $script:altDown = $false
    $script:recording = $false
    Note 'right Alt released (send)'

    # ---------------- verify bubble ----------------
    $bubbleDeadline = (Get-Date).AddMilliseconds($bubbleWaitMs)
    $newBubbles = @()
    while ((Get-Date) -lt $bubbleDeadline) {
      Start-Sleep -Milliseconds 150
      if (Test-CancelRequested) {
        # The release already happened. A cancellation request here cannot prove the voice
        # was not sent, so never claim a rollback; only record the stage for diagnostics.
        $script:cancelAfterSend = $true
        Set-CancelStage 'UNKNOWN'
        Note 'cancel requested after SENDING; preserving terminal outcome'
      }
      $win = Get-WeChatWindow
      $now = @(Get-VoiceBubbles $win)
      if ($now.Count -gt $bubblesBefore.Count) {
        $newBubbles = @($now | Select-Object -Skip $bubblesBefore.Count)
        break
      }
    }
    $win = Get-WeChatWindow
    $bubblesAfter = @(Get-VoiceBubbles $win)
    $result.bubbles_after = $bubblesAfter.Count
    if ($newBubbles.Count -gt 0) {
      $result.bubble_name = $newBubbles[0].Name
      $result.status = 'SENT_LOCAL'
      $result.reason = ('bubble:' + $result.bubble_name)
    } elseif ($script:cancelAfterSend) {
      $result.status = 'UNKNOWN'
      $result.reason = 'USER_CANCELLED:UNKNOWN_AFTER_SEND'
      $result.cancel_stage = 'UNKNOWN'
    } else {
      $result.status = 'UNKNOWN'
      $result.reason = 'no_new_bubble_detected'
    }
    Note ('bubbles after = ' + $bubblesAfter.Count + ' new=' + $newBubbles.Count)
}
catch {
    $msg = $_.Exception.Message
    Note ('exception: ' + $msg)
    if ($result.status -eq 'UNKNOWN' -and -not $script:cancelStage -and -not $script:sending) {
      $result.status = 'FAILED'; $result.reason = $msg
    }
    try { if ($script:altDown) { Stop-Recording 'exception' } } catch { }
}
finally {
    # Never release the push-to-talk key without trying the verified cancel first: a bare
    # release would send whatever was recorded.
    try {
      if ($script:altDown) {
        $cancelOk = Stop-Recording 'finally'
        if (-not $cancelOk) {
          $result.status = 'UNKNOWN'
          $result.reason = 'cancel_unconfirmed:' + $result.reason
        }
      }
    } catch { }
    if ($script:cancelUnconfirmed) {
      $result.status = 'UNKNOWN'
      if ($result.reason -notlike 'cancel_unconfirmed*') { $result.reason = 'cancel_unconfirmed:' + $result.reason }
    }
    # always restore capture defaults
    if ($script:origIds.Count -eq 3) { Write-Phase 'RESTORING' }
    try {
      if ($script:origIds.Count -eq 3) {
        for ($role = 0; $role -lt 3; $role++) {
          if ($script:origIds[$role]) { $null = [AudioPolicy]::SetDefault($script:origIds[$role], $role) }
        }
        Start-Sleep -Milliseconds 700
        $after = @()
        $allOk = $true
        for ($role = 0; $role -lt 3; $role++) {
          $now = [AudioPolicy]::DefaultId(1, $role)
          $after += $now
          if ($now -ne $script:origIds[$role]) { $allOk = $false }
        }
        $result.restore_after = @($after)
        $result.restore_ok = $allOk
        Note ('restore ok=' + $allOk)
        if ($allOk -and (Test-Path $script:sessionFile)) {
          Remove-Item $script:sessionFile -Force -ErrorAction SilentlyContinue
          Note 'recovery snapshot cleared'
        }
      } elseif ($script:origIds.Count -eq 0) {
        # Rejected before any capture switch: nothing changed, so restore_ok is true.
        $result.restore_ok = $true
        Note 'no capture switch was made; nothing to restore'
      }
    } catch { Note ('restore error: ' + $_.Exception.Message); $result.restore_error = $_.Exception.Message }
    try { if ($mutex) { $mutex.ReleaseMutex(); $mutex.Dispose() } } catch { }
    $result.timeline = @($script:timeline)
    $result.cancel_bubble_appeared = $script:cancelBubbleAppeared
    $result.cancel_stage = $script:cancelStage
    Write-Phase ([string]$result.status)
    $result.finished_at = (Get-Date).ToString('o')
    try { Write-JsonFile $JsonOut $result } catch { Write-Output ('JSON WRITE FAILED: ' + $_.Exception.Message) }
}

Write-Output ("STATUS=" + $result.status + " REASON=" + $result.reason)
exit 0
