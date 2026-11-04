# Crash-recovery companion for voice-sender.ps1.
# If a send job dies hard (killed process, power loss, host restart) it cannot run its own
# finally block, leaving the default capture device pointing at CABLE Output.
# This tool restores the snapshot that voice-sender.ps1 wrote before switching anything.
# It never touches WeChat and never sends messages.
param(
  [switch]$Status,
  [string]$JsonOut = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Add-Type -LiteralPath (Join-Path (Join-Path $root 'lib') 'AudioPolicy.cs')

$sessionFile = Join-Path (Join-Path $root 'run') 'active-session.json'
$out = [ordered]@{
  action        = if ($Status) { 'status' } else { 'restore' }
  snapshot_found = $false
  snapshot      = $null
  current_before = @()
  current_after  = @()
  restored      = $false
  ok            = $false
  note          = ''
}

function Read-Snapshot {
  if (-not (Test-Path $sessionFile)) { return $null }
  return ([System.IO.File]::ReadAllText($sessionFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json)
}

try {
  $snap = Read-Snapshot
  $out.current_before = @(0, 1, 2 | ForEach-Object { [AudioPolicy]::DefaultId(1, $_) })
  if (-not $snap) {
    $out.note = 'no pending snapshot (nothing to restore)'
    Write-Output 'no pending snapshot — default capture devices are whatever Windows has now:'
    for ($r = 0; $r -lt 3; $r++) { Write-Output ("  role$r = " + $out.current_before[$r]) }
  }
  else {
    $out.snapshot_found = $true
    $out.snapshot = $snap
    Write-Output ('snapshot written at ' + $snap.written_at + ' by pid ' + $snap.pid + ' for chat ' + $snap.chat)
    Write-Output ('snapshot ids: ' + ($snap.capture_ids -join ' ; '))
    Write-Output ('current ids : ' + ($out.current_before -join ' ; '))
    if ($Status) {
      $out.note = 'status only, nothing changed'
    }
    else {
      $ids = @($snap.capture_ids)
      if ($ids.Count -ne 3) { throw 'snapshot does not contain 3 role ids' }
      for ($r = 0; $r -lt 3; $r++) {
        if ($ids[$r]) {
          $hr = [AudioPolicy]::SetDefault($ids[$r], $r)
          Write-Output ("  restore role$r hr=0x" + $hr.ToString('X8'))
        }
      }
      Start-Sleep -Milliseconds 800
      $after = @(0, 1, 2 | ForEach-Object { [AudioPolicy]::DefaultId(1, $_) })
      $out.current_after = $after
      $allOk = $true
      for ($r = 0; $r -lt 3; $r++) { if ($after[$r] -ne $ids[$r]) { $allOk = $false } }
      $out.restored = $true
      $out.ok = $allOk
      Write-Output ('after       : ' + ($after -join ' ; '))
      Write-Output ('verified    : ' + $allOk)
      if ($allOk) {
        Remove-Item $sessionFile -Force -ErrorAction SilentlyContinue
        Write-Output 'snapshot cleared'
      } else {
        $out.note = 'restore did not verify — check devices manually'
      }
    }
  }
}
catch {
  $out.note = $_.Exception.Message
  Write-Output ('ERROR: ' + $_.Exception.Message)
}

if ($JsonOut) {
  $json = $out | ConvertTo-Json -Depth 6
  $dir = Split-Path -Parent $JsonOut
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  [System.IO.File]::WriteAllText($JsonOut, $json, (New-Object System.Text.UTF8Encoding($false)))
}
exit 0
