# Global emergency-stop hotkey host.
#
# This process owns RegisterHotKey + the WM_HOTKEY message loop. It is deliberately separate
# from the PowerShell voice worker: a stuck recording/playback worker must never be needed to
# receive the stop key. On hotkey it atomically publishes a signal file; the Node service reads
# that file and drives the single queue-owned cancellation path.
param(
  [Parameter(Mandatory = $true)][string]$SignalFile,
  [Parameter(Mandatory = $true)][string]$StatusFile,
  [string]$LogFile = '',
  [string]$Accelerator = 'Ctrl+Shift+F12',
  [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'

Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class HotkeyApi {
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool UnregisterHotKey(IntPtr hWnd, int id);
  [DllImport("user32.dll")]
  public static extern bool GetMessage(out MSG msg, IntPtr hWnd, uint min, uint max);
  [DllImport("user32.dll")]
  public static extern bool TranslateMessage(ref MSG msg);
  [DllImport("user32.dll")]
  public static extern IntPtr DispatchMessage(ref MSG msg);
  [StructLayout(LayoutKind.Sequential)]
  public struct MSG {
    public IntPtr hwnd;
    public uint message;
    public UIntPtr wParam;
    public IntPtr lParam;
    public uint time;
    public int ptX;
    public int ptY;
    public uint lPrivate;
  }
  public const uint MOD_ALT = 0x0001;
  public const uint MOD_CONTROL = 0x0002;
  public const uint MOD_SHIFT = 0x0004;
  public const uint MOD_WIN = 0x0008;
  public const int WM_HOTKEY = 0x0312;
}
'@

function Write-JsonAtomic([string]$path, $value) {
  $dir = Split-Path -Parent $path
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $tmp = $path + '.tmp-' + $PID + '-' + [guid]::NewGuid().ToString('N')
  [System.IO.File]::WriteAllText($tmp, ($value | ConvertTo-Json -Depth 6), (New-Object System.Text.UTF8Encoding($false)))
  Move-Item -LiteralPath $tmp -Destination $path -Force
}

function Write-HotkeyLog([string]$msg) {
  if (-not $LogFile) { return }
  try {
    $line = (Get-Date).ToString('o') + ' ' + $msg + "`n"
    [System.IO.File]::AppendAllText($LogFile, $line, (New-Object System.Text.UTF8Encoding($false)))
  } catch { }
}

function Parse-Accelerator([string]$text) {
  $mods = [uint32]0
  $vk = [uint32]0
  foreach ($token in ($text -split '\+')) {
    $t = $token.Trim()
    if ($t -eq '') { continue }
    switch -Regex ($t) {
      '^(Ctrl|Control)$' { $mods = $mods -bor [HotkeyApi]::MOD_CONTROL; continue }
      '^Shift$' { $mods = $mods -bor [HotkeyApi]::MOD_SHIFT; continue }
      '^Alt$' { $mods = $mods -bor [HotkeyApi]::MOD_ALT; continue }
      '^Win$' { $mods = $mods -bor [HotkeyApi]::MOD_WIN; continue }
      '^F([1-9]|1[0-9]|2[0-4])$' {
        $n = [int]$Matches[1]
        $vk = [uint32](0x70 + ($n - 1))
        continue
      }
      '^[A-Za-z]$' { $vk = [uint32][char]::ToUpperInvariant($t[0]); continue }
      default { throw ('unsupported accelerator token: ' + $t) }
    }
  }
  if ($vk -eq 0) { throw 'accelerator has no key' }
  return @{ mods = $mods; vk = $vk }
}

$id = 0x5757
$startedAt = (Get-Date).ToString('o')
$status = [ordered]@{
  ok = $false
  registered = $false
  accelerator = $Accelerator
  pid = $PID
  startedAt = $startedAt
  lastTriggeredAt = $null
  error = ''
}
$signalSeq = 0
$timer = $null

try {
  $parsed = Parse-Accelerator $Accelerator
  $ok = [HotkeyApi]::RegisterHotKey([IntPtr]::Zero, $id, $parsed.mods, $parsed.vk)
  $err = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
  $status.registered = [bool]$ok
  $status.ok = [bool]$ok
  $status.mods = [int]$parsed.mods
  $status.vk = [int]$parsed.vk
  if (-not $ok) {
    $status.error = 'register_failed:' + $err
    Write-JsonAtomic $StatusFile $status
    Write-HotkeyLog ('register failed err=' + $err)
    exit 2
  }
  Write-JsonAtomic $StatusFile $status
  Write-HotkeyLog ('registered ' + $Accelerator)

  if ($SelfTest) {
    Start-Sleep -Milliseconds 150
    [void][HotkeyApi]::UnregisterHotKey([IntPtr]::Zero, $id)
    $status.registered = $false
    $status.ok = $true
    $status.error = ''
    $status.selfTest = $true
    Write-JsonAtomic $StatusFile $status
    Write-HotkeyLog 'self-test registered and unregistered'
    exit 0
  }

  while ($true) {
    $msg = New-Object HotkeyApi+MSG
    $got = [HotkeyApi]::GetMessage([ref]$msg, [IntPtr]::Zero, 0, 0)
    if ($got -eq $false -or [int]$got -eq -1) { break }
    if ($msg.message -eq [HotkeyApi]::WM_HOTKEY -and $msg.wParam.ToUInt64() -eq [uint64]$id) {
      $signalSeq += 1
      $now = (Get-Date).ToString('o')
      $status.lastTriggeredAt = $now
      $status.seq = $signalSeq
      Write-JsonAtomic $SignalFile ([ordered]@{
        source = 'hotkey'
        reason = 'USER_CANCELLED'
        accelerator = $Accelerator
        at = $now
        seq = $signalSeq
        hostPid = $PID
      })
      Write-JsonAtomic $StatusFile $status
      Write-HotkeyLog ('triggered seq=' + $signalSeq)
    }
    [void][HotkeyApi]::TranslateMessage([ref]$msg)
    [void][HotkeyApi]::DispatchMessage([ref]$msg)
  }
} catch {
  $status.registered = $false
  $status.ok = $false
  $status.error = $_.Exception.Message
  try { Write-JsonAtomic $StatusFile $status } catch { }
  Write-HotkeyLog ('fatal: ' + $_.Exception.Message)
  exit 3
} finally {
  if ($timer) { $timer.Dispose() }
  try { [void][HotkeyApi]::UnregisterHotKey([IntPtr]::Zero, $id) } catch { }
  try {
    $status.registered = $false
    if (-not $status.error) { $status.error = 'host_stopped' }
    Write-JsonAtomic $StatusFile $status
    Write-HotkeyLog 'unregistered'
  } catch { }
}
