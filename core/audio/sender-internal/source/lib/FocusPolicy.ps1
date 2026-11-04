# Pure focus policy (no UI calls). Loaded by voice-sender.ps1 and unit-tested with fake inputs.
#
# V2: normal keyboard/mouse activity is NOT a rejection condition. IdleMs is accepted only as
# diagnostic input and never changes the decision. The real gates are:
#   - interactive desktop / secure desktop (SessionGuard, checked elsewhere),
#   - the correct WeChat main window and verified target chat,
#   - foreground ownership immediately before recording,
#   - optional full-screen game protection.
function Test-FocusGuard {
  param(
    [bool]$IsForeground,
    [int]$IdleMs = 0,
    [int]$IdleThreshold = 0,
    [bool]$RequireForeground = $true,
    [string]$Mode = 'manual',
    [bool]$Fullscreen = $false,
    [bool]$PauseWhenFullscreen = $true
  )

  if (-not $RequireForeground) {
    return [pscustomobject]@{
      Allowed = $true; NeedsActivation = $false; Reason = 'not_required'; IdleMs = $IdleMs
    }
  }
  if ($IsForeground) {
    return [pscustomobject]@{
      Allowed = $true; NeedsActivation = $false; Reason = 'already_foreground'; IdleMs = $IdleMs
    }
  }
  if ($Fullscreen -and $PauseWhenFullscreen) {
    return [pscustomobject]@{
      Allowed = $false; NeedsActivation = $false; Reason = 'fullscreen_protected'; IdleMs = $IdleMs
    }
  }
  if ($Mode -eq 'auto') {
    # Auto mode may perform a bounded activation; it must still verify the HWND afterwards.
    return [pscustomobject]@{
      Allowed = $true; NeedsActivation = $true; Reason = 'activation_required'; IdleMs = $IdleMs
    }
  }
  # Manual mode: user must put WeChat in front. This is a foreground requirement, not an
  # idle-time requirement; a mouse move or a recent keypress is irrelevant.
  return [pscustomobject]@{
    Allowed = $false; NeedsActivation = $false; Reason = 'not_foreground'; IdleMs = $IdleMs
  }
}
