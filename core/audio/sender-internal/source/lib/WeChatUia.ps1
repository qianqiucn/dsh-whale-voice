# WeChat UI Automation helpers for the voice sender (target: agent-managed WeChat 4.1.10.27).
# Every click comes from a UIA element's own rectangle; no blind coordinates.
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class WxInput {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, IntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, IntPtr e);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr pid);
  [DllImport("user32.dll", EntryPoint = "GetWindowThreadProcessId")] public static extern uint GetWindowThreadProcessIdOut(IntPtr h, out uint pid);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint attach, uint attachTo, bool fAttach);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
  [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFO info);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int index);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO {
    public uint cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags;
  }
  public static string WindowClass(IntPtr h) {
    var sb = new StringBuilder(256); GetClassName(h, sb, sb.Capacity); return sb.ToString();
  }
  public static string WindowTitle(IntPtr h) {
    var sb = new StringBuilder(512); GetWindowText(h, sb, sb.Capacity); return sb.ToString();
  }
  public static RECT WindowRect(IntPtr h) { RECT r; GetWindowRect(h, out r); return r; }
  public static RECT MonitorRect(IntPtr h) {
    RECT r = new RECT();
    IntPtr mon = MonitorFromWindow(h, 2); // MONITOR_DEFAULTTONEAREST
    if (mon == IntPtr.Zero) return r;
    MONITORINFO mi = new MONITORINFO(); mi.cbSize = (uint)Marshal.SizeOf(typeof(MONITORINFO));
    if (GetMonitorInfo(mon, ref mi)) return mi.rcMonitor;
    return r;
  }
  public static bool IsFullscreenWindow(IntPtr h) {
    if (h == IntPtr.Zero) return false;
    RECT w = WindowRect(h); RECT m = MonitorRect(h);
    int ww = w.Right - w.Left; int wh = w.Bottom - w.Top;
    int mw = m.Right - m.Left; int mh = m.Bottom - m.Top;
    if (mw <= 0 || mh <= 0 || ww <= 0 || wh <= 0) return false;
    // A maximized normal app still has a caption. Games that grab the whole monitor
    // (borderless/fullscreen) do not; this avoids pausing for a maximized browser/DSH.
    int style = GetWindowLong(h, -16);
    if ((style & 0x00C00000) != 0) return false;
    // 96% tolerance covers borderless fullscreen and maximized borderless games.
    return ww >= mw * 0.96 && wh >= mh * 0.96;
  }
  public static bool IsShellWindow(IntPtr h) {
    string c = WindowClass(h);
    return c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd" || c == "Shell_SecondaryTrayWnd";
  }
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
  [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  public static uint IdleMs() {
    LASTINPUTINFO lii = new LASTINPUTINFO();
    lii.cbSize = (uint)Marshal.SizeOf(lii);
    if (!GetLastInputInfo(ref lii)) return 0;
    return unchecked((uint)Environment.TickCount - lii.dwTime);
  }
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  public const uint KEYUP = 0x0002;
  public const uint EXTENDED = 0x0001;
  public const byte VK_RMENU = 0xA5;
  public const byte VK_BACK = 0x08;
  public static void RAltDown() { keybd_event(VK_RMENU, 0, EXTENDED, IntPtr.Zero); }
  public static void RAltUp() { keybd_event(VK_RMENU, 0, EXTENDED | KEYUP, IntPtr.Zero); }
  public static void Backspace() {
    keybd_event(VK_BACK, 0, 0, IntPtr.Zero);
    System.Threading.Thread.Sleep(40);
    keybd_event(VK_BACK, 0, KEYUP, IntPtr.Zero);
  }
  public static void Click(int x, int y) {
    SetCursorPos(x, y);
    System.Threading.Thread.Sleep(50);
    mouse_event(0x0002, 0, 0, 0, IntPtr.Zero);
    System.Threading.Thread.Sleep(50);
    mouse_event(0x0004, 0, 0, 0, IntPtr.Zero);
  }
  public static bool IsForeground(IntPtr h) { return GetForegroundWindow() == h; }
  public static uint ForegroundPid() {
    IntPtr h = GetForegroundWindow();
    uint pid;
    GetWindowThreadProcessIdOut(h, out pid);
    return pid;
  }
  public static void ToForeground(IntPtr h) {
    if (IsIconic(h)) { ShowWindow(h, 9); System.Threading.Thread.Sleep(300); }
    IntPtr fg = GetForegroundWindow();
    uint fgThread = fg == IntPtr.Zero ? 0 : GetWindowThreadProcessId(fg, IntPtr.Zero);
    uint myThread = GetCurrentThreadId();
    bool attached = false;
    if (fgThread != 0 && fgThread != myThread) attached = AttachThreadInput(myThread, fgThread, true);
    try { BringWindowToTop(h); SetForegroundWindow(h); }
    finally { if (attached) AttachThreadInput(myThread, fgThread, false); }
  }
}
'@

function Resolve-WeChatElement($win) {
  if ($null -eq $win) { return $null }
  if ($win.PSObject.Properties['Element']) { return $win.Element }
  return $win
}

function Get-WeChatCandidates {
  param([string]$ExpectedProcessPath = '')
  $result = @()
  try {
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty, 'mmui::MainWindow')
    foreach ($e in $root.FindAll([System.Windows.Automation.TreeScope]::Children, $cond)) {
      $procId = [int]$e.Current.ProcessId
      $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
      if (-not $p) { continue }
      $path = ''
      try { $path = [string]$p.Path } catch { }
      if ([string]::IsNullOrWhiteSpace($path)) { continue }
      $expected = if ($ExpectedProcessPath) { [System.IO.Path]::GetFullPath($ExpectedProcessPath) } else { '' }
      $identityOk = if ($expected) {
        [string]::Equals([System.IO.Path]::GetFullPath($path), $expected, [System.StringComparison]::OrdinalIgnoreCase)
      } else {
        $p.ProcessName -eq 'Weixin' -and $path -match '\\state\\hook\\[^\\]+\\Weixin\.exe$'
      }
      if (-not $identityOk) { continue }

      $hwnd = [IntPtr][int]$e.Current.NativeWindowHandle
      if ($hwnd -eq [IntPtr]::Zero -or -not [WxInput]::IsWindow($hwnd)) { continue }
      $class = [string]$e.Current.ClassName
      if ($class -ne 'mmui::MainWindow') { continue }

      $chatEl = Find-ByElementIdSuffix $e 'current_chat_name_label'
      $sessionEl = Find-ByElementId $e 'session_list'
      # A login screen, a picker or a hidden tool window must never be accepted as the main UI.
      if (-not $chatEl -and -not $sessionEl) { continue }

      $result += [pscustomobject]@{
        Element      = $e
        Hwnd         = $hwnd
        Pid          = $procId
        ProcessPath  = $path
        ClassName    = $class
        IsVisible    = [bool][WxInput]::IsWindowVisible($hwnd)
        IsMinimized  = [bool][WxInput]::IsIconic($hwnd)
        IsForeground = [bool][WxInput]::IsForeground($hwnd)
        ChatTitle    = [string](Get-ChatTitle $e)
        HasSessionList = [bool]$sessionEl
        HasChatTitle = [bool]$chatEl
        Title        = [string][WxInput]::WindowTitle($hwnd)
      }
    }
  } catch { }
  return @($result)
}

function Get-WeChatWindowInfo {
  param([string]$ExpectedProcessPath = '')
  $c = @(Get-WeChatCandidates -ExpectedProcessPath $ExpectedProcessPath)
  if ($c.Count -eq 1) {
    return [pscustomobject]@{
      Found = $true; Reason = ''; Window = $c[0]; Candidates = $c
    }
  }
  return [pscustomobject]@{
    Found = $false
    Reason = $(if ($c.Count -eq 0) { 'wechat_main_window_missing' } else { 'wechat_main_window_ambiguous' })
    Window = $null
    Candidates = $c
  }
}

function Get-WeChatWindow {
  param([string]$ExpectedProcessPath = '')
  $info = Get-WeChatWindowInfo -ExpectedProcessPath $ExpectedProcessPath
  if ($info.Found) { return $info.Window.Element }
  return $null
}

function Get-WeChatHwnd($win) {
  if ($null -eq $win) { return ([IntPtr]::Zero) }
  $el = Resolve-WeChatElement $win
  if ($null -eq $el) { return ([IntPtr]::Zero) }
  if ($win.PSObject.Properties['Hwnd']) { return [IntPtr]$win.Hwnd }
  return [IntPtr][int]$el.Current.NativeWindowHandle
}

function Restore-WeChatWindow($win) {
  $el = Resolve-WeChatElement $win
  $hwnd = Get-WeChatHwnd $win
  if ($hwnd -eq [IntPtr]::Zero) { return [pscustomobject]@{ ok = $false; reason = 'window_gone' } }
  if (-not [WxInput]::IsIconic($hwnd)) { return [pscustomobject]@{ ok = $true; restored = $false; reason = 'not_minimized' } }
  [void][WxInput]::ShowWindow($hwnd, 9) # SW_RESTORE
  Start-Sleep -Milliseconds 350
  if ([WxInput]::IsIconic($hwnd)) { return [pscustomobject]@{ ok = $false; reason = 'restore_failed' } }
  return [pscustomobject]@{ ok = $true; restored = $true; reason = 'restored' }
}

function Activate-WeChatWindow($win, [int]$Attempts = 4) {
  $hwnd = Get-WeChatHwnd $win
  if ($hwnd -eq [IntPtr]::Zero) { return [pscustomobject]@{ ok = $false; reason = 'window_gone' } }
  for ($i = 0; $i -lt $Attempts; $i++) {
    [WxInput]::ToForeground($hwnd)
    Start-Sleep -Milliseconds 300
    if ([WxInput]::IsForeground($hwnd)) { return [pscustomobject]@{ ok = $true; reason = 'foreground' } }
  }
  return [pscustomobject]@{ ok = $false; reason = 'FOREGROUND_ACTIVATION_DENIED' }
}

function Test-FullscreenForeground {
  $fg = [WxInput]::GetForegroundWindow()
  if ($fg -eq [IntPtr]::Zero) { return [pscustomobject]@{ fullscreen = $false; reason = 'no_foreground' } }
  if ([WxInput]::IsShellWindow($fg)) { return [pscustomobject]@{ fullscreen = $false; reason = 'shell' } }
  $class = [WxInput]::WindowClass($fg)
  if ($class -eq 'mmui::MainWindow') { return [pscustomobject]@{ fullscreen = $false; reason = 'wechat' } }
  $fgPid = 0
  [void][WxInput]::GetWindowThreadProcessIdOut($fg, [ref]$fgPid)
  $fgProc = Get-Process -Id $fgPid -ErrorAction SilentlyContinue
  if ($fgProc -and $fgProc.ProcessName -in @('Weixin', 'WeChat')) {
    return [pscustomobject]@{ fullscreen = $false; reason = 'wechat_app'; hwnd = $fg; class = $class }
  }
  $full = [bool][WxInput]::IsFullscreenWindow($fg)
  return [pscustomobject]@{
    fullscreen = $full
    hwnd = $fg
    class = $class
    title = [WxInput]::WindowTitle($fg)
    reason = $(if ($full) { 'fullscreen_foreground' } else { 'windowed_foreground' })
  }
}

function Test-WeChatTarget($win, [string]$name, [string]$kind = 'private', [bool]$identityVerified = $false) {
  $el = Resolve-WeChatElement $win
  if (-not $el) { return [pscustomobject]@{ ok = $false; reason = 'window_gone'; title = '' } }
  $title = [string](Get-ChatTitle $el)
  $items = @(Find-WeChatSessionItem $el $name)
  if ($title -ne $name) { return [pscustomobject]@{ ok = $false; reason = ('target_mismatch:' + $title); title = $title; matches = $items.Count } }
  if ($items.Count -ne 1) { return [pscustomobject]@{ ok = $false; reason = ('target_session_items:' + $items.Count); title = $title; matches = $items.Count } }
  if ($kind -eq 'group' -and -not $identityVerified) {
    # The WeChat UIA tree exposes a display name, not a stable group id. Do not guess.
    return [pscustomobject]@{ ok = $false; reason = 'group_identity_unverified'; title = $title; matches = $items.Count }
  }
  if ($kind -eq 'group') {
    # A config boolean is not enough: no UI element in this client proves the real group id.
    return [pscustomobject]@{ ok = $false; reason = 'group_ui_identity_unverified'; title = $title; matches = $items.Count }
  }
  return [pscustomobject]@{ ok = $true; reason = 'verified'; title = $title; matches = $items.Count }
}

function Get-WeChatWindowFacts($win) {
  $el = Resolve-WeChatElement $win
  if (-not $el) { return [pscustomobject]@{ found = $false; reason = 'window_gone' } }
  $hwnd = Get-WeChatHwnd $win
  return [pscustomobject]@{
    found = $true
    hwnd = $hwnd.ToInt64()
    pid = [int]$el.Current.ProcessId
    class = [string]$el.Current.ClassName
    title = [string](Get-ChatTitle $el)
    foreground = [bool][WxInput]::IsForeground($hwnd)
    minimized = [bool][WxInput]::IsIconic($hwnd)
    visible = [bool][WxInput]::IsWindowVisible($hwnd)
    fullscreen = (Test-FullscreenForeground)
  }
}

function Get-WeChatSearchBox($win) {
  $el = Resolve-WeChatElement $win
  if (-not $el) { return $null }
  $all = $el.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($e in $all) {
    if ($e.Current.ControlType.ProgrammaticName -ne 'ControlType.Edit') { continue }
    if ($e.Current.ClassName -eq 'mmui::XValidatorTextEdit' -or $e.Current.Name -eq '搜索') { return $e }
  }
  return $null
}

function Get-WeChatSessionList($win) {
  $el = Resolve-WeChatElement $win
  if (-not $el) { return $null }
  return Find-ByElementId $el 'session_list'
}

function Get-WeChatSessionItems($win) {
  $list = Get-WeChatSessionList $win
  $result = @()
  if (-not $list) { return $result }
  $items = $list.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($e in $items) {
    if ($e.Current.ControlType.ProgrammaticName -ne 'ControlType.ListItem') { continue }
    $id = [string]$e.Current.AutomationId
    if (-not ($id.StartsWith('session_item_'))) { continue }
    $name = $id.Substring('session_item_'.Length)
    $r = $e.Current.BoundingRectangle
    $result += [pscustomobject]@{
      Element = $e; Id = $id; Name = $name; DisplayName = [string]$e.Current.Name
      X = [int]$r.X; Y = [int]$r.Y; W = [int]$r.Width; H = [int]$r.Height
      Offscreen = [bool]$e.Current.IsOffscreen
    }
  }
  return @($result)
}

function Find-WeChatSessionItem($win, [string]$name) {
  $items = @(Get-WeChatSessionItems $win)
  return @($items | Where-Object { $_.Id -eq ('session_item_' + $name) })
}

function Select-WeChatSessionItem($item) {
  if (-not $item -or -not $item.Element) { return $false }
  $e = $item.Element
  try {
    $p = $e.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
    if ($p) { $p.Select(); return $true }
  } catch { }
  try {
    $p = $e.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    if ($p) { $p.Invoke(); return $true }
  } catch { }
  return $false
}

function Open-WeChatChat($win, [string]$name) {
  $el = Resolve-WeChatElement $win
  if (-not $el) { return [pscustomobject]@{ ok = $false; reason = 'window_gone' } }
  if ((Get-ChatTitle $el) -eq $name) { return [pscustomobject]@{ ok = $true; alreadyOpen = $true; reason = 'already_open' } }

  $search = Get-WeChatSearchBox $el
  if (-not $search) { return [pscustomobject]@{ ok = $false; reason = 'search_box_missing' } }
  try {
    $vp = $search.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    if (-not $vp) { return [pscustomobject]@{ ok = $false; reason = 'search_value_pattern_unavailable' } }
    $vp.SetValue($name)
  } catch {
    return [pscustomobject]@{ ok = $false; reason = 'search_failed' }
  }
  Start-Sleep -Milliseconds 700

  $matches = @(Find-WeChatSessionItem $el $name)
  if ($matches.Count -eq 0) {
    try { $vp.SetValue('') } catch { }
    return [pscustomobject]@{ ok = $false; reason = 'target_not_found' }
  }
  if ($matches.Count -gt 1) {
    try { $vp.SetValue('') } catch { }
    return [pscustomobject]@{ ok = $false; reason = 'target_ambiguous' }
  }
  if (-not (Select-WeChatSessionItem $matches[0])) {
    try { $vp.SetValue('') } catch { }
    return [pscustomobject]@{ ok = $false; reason = 'target_not_selectable' }
  }
  Start-Sleep -Milliseconds 650
  $verified = ((Get-ChatTitle $el) -eq $name)
  try { $vp.SetValue('') } catch { }
  if (-not $verified) { return [pscustomobject]@{ ok = $false; reason = 'target_changed_after_open' } }
  return [pscustomobject]@{ ok = $true; alreadyOpen = $false; reason = 'opened' }
}

function Find-ByElementId($win, [string]$id) {
  $win = Resolve-WeChatElement $win
  if (-not $win) { return $null }
  $c = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty, $id)
  return $win.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $c)
}

function Find-ByElementIdSuffix($win, [string]$suffix) {
  $win = Resolve-WeChatElement $win
  if (-not $win) { return $null }
  $all = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($e in $all) { if ($e.Current.AutomationId -and $e.Current.AutomationId.EndsWith($suffix)) { return $e } }
  return $null
}

function Get-ElementText($el) {
  if (-not $el) { return $null }
  $v = $null
  try { $vp = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern); $v = $vp.Current.Value } catch { }
  if ([string]::IsNullOrEmpty($v)) { $v = $el.Current.Name }
  return $v
}

function Get-ChatTitle($win) {
  $win = Resolve-WeChatElement $win
  if (-not $win) { return $null }
  $el = Find-ByElementIdSuffix $win 'current_chat_name_label'
  if (-not $el) { return $null }
  return Get-ElementText $el
}

function Get-VoiceButton($win) {
  $win = Resolve-WeChatElement $win
  if (-not $win) { return $null }
  $all = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($e in $all) { if ($e.Current.Name -match '发语音') { return $e } }
  return $null
}

function Get-MessageItems($win) {
  $win = Resolve-WeChatElement $win
  if (-not $win) { return @() }
  $ml = Find-ByElementId $win 'chat_message_list'
  $list = @()
  if (-not $ml) { return $list }
  $items = $ml.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($e in $items) {
    if ($e.Current.ControlType.ProgrammaticName -eq 'ControlType.ListItem') {
      $r = $e.Current.BoundingRectangle
      $list += [pscustomobject]@{ Name = $e.Current.Name; X = [int]$r.X; Y = [int]$r.Y; W = [int]$r.Width; H = [int]$r.Height }
    }
  }
  return $list
}

# Recording state evidence: WeChat shows a wave view while recording plus the cancel hint.
function Test-RecordingState($win) {
  $win = Resolve-WeChatElement $win
  if (-not $win) { return @{ Active = $false; Hints = @() } }
  $all = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  $hints = @()
  foreach ($e in $all) {
    $id = $e.Current.AutomationId
    $nm = $e.Current.Name
    if ($id -and $id -match 'wave view|send_icon_root_view') { $hints += $id }
    if ($nm -and $nm.Length -le 24 -and ($nm -match '退格|取消|发送语音')) { $hints += $nm }
  }
  return @{ Active = ($hints.Count -gt 0); Hints = $hints }
}

function Get-VoiceBubbles($win) {
  $list = @()
  foreach ($m in (Get-MessageItems $win)) {
    if ($m.Name -match '^语音') { $list += $m }
  }
  return $list
}
