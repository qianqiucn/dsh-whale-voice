# Read-only WeChat discovery/identity probe. Never activates, clicks, types or opens a chat.
param([string]$ExpectedProcessPath = '')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$uia = [System.IO.File]::ReadAllText((Join-Path $root 'lib\WeChatUia.ps1'), [System.Text.Encoding]::UTF8)
Invoke-Expression $uia
Add-Type -LiteralPath (Join-Path (Join-Path $root 'lib') 'SessionGuard.cs')

$out = [ordered]@{
  ok = $false
  found = $false
  reason = ''
  title = ''
  hwnd = 0
  pid = 0
  minimized = $false
  foreground = $false
  fullscreen = $null
  desktop = $null
  candidates = 0
  sessionItems = 0
  targetSession = 0
}
try {
  $desk = [SessionGuard]::Check()
  $out.desktop = $desk
  $out.fullscreen = Test-FullscreenForeground
  $info = Get-WeChatWindowInfo -ExpectedProcessPath $ExpectedProcessPath
  $out.candidates = @($info.Candidates).Count
  if (-not $info.Found) {
    $out.reason = $info.Reason
  } else {
    $facts = Get-WeChatWindowFacts $info.Window
    $out.ok = $true
    $out.found = $true
    $out.reason = 'ok'
    $out.title = $facts.title
    $out.hwnd = $facts.hwnd
    $out.pid = $facts.pid
    $out.minimized = $facts.minimized
    $out.foreground = $facts.foreground
    $out.sessionItems = @(Get-WeChatSessionItems $info.Window).Count
    $out.targetSession = @(Find-WeChatSessionItem $info.Window $facts.title).Count
  }
} catch {
  $out.reason = $_.Exception.Message
}
$out | ConvertTo-Json -Depth 6 -Compress
