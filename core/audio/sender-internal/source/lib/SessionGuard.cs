using System;
using System.Runtime.InteropServices;
using System.Text;

// Interactive-desktop / session guard.
// Fail-closed by design: every unexpected condition returns FAIL with a reason.
public static class SessionGuard
{
    [DllImport("user32.dll", SetLastError = true)]
    static extern IntPtr OpenInputDesktop(uint dwFlags, bool fInherit, uint dwDesiredAccess);
    [DllImport("user32.dll", SetLastError = true)]
    static extern bool CloseDesktop(IntPtr hDesktop);
    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool GetUserObjectInformation(IntPtr hObj, int nIndex, StringBuilder pvInfo, int nLength, out int lpnLengthNeeded);
    [DllImport("user32.dll")]
    static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", SetLastError = true)]
    static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("kernel32.dll")]
    static extern uint GetCurrentProcessId();
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool ProcessIdToSessionId(uint dwProcessId, out uint pSessionId);
    [DllImport("kernel32.dll")]
    static extern uint WTSGetActiveConsoleSessionId();
    [DllImport("wtsapi32.dll", SetLastError = true)]
    static extern bool WTSQuerySessionInformation(IntPtr hServer, uint sessionId, int wtsInfoClass, out IntPtr ppBuffer, out uint pBytesReturned);
    [DllImport("wtsapi32.dll")]
    static extern void WTSFreeMemory(IntPtr pMemory);

    const uint DESKTOP_READOBJECTS = 0x0001;
    const uint DESKTOP_SWITCHDESKTOP = 0x0100;
    const int UOI_NAME = 2;
    const int WTSConnectState = 8;
    const uint WTS_CURRENT_SERVER_HANDLE = 0;

    // WTS_CONNECTSTATE_CLASS
    const int WTSActive = 0;

    static string DesktopName(out bool opened)
    {
        opened = false;
        IntPtr h = OpenInputDesktop(0, false, DESKTOP_READOBJECTS | DESKTOP_SWITCHDESKTOP);
        if (h == IntPtr.Zero) return "err=" + Marshal.GetLastWin32Error();
        try
        {
            var sb = new StringBuilder(256);
            int needed;
            if (!GetUserObjectInformation(h, UOI_NAME, sb, sb.Capacity * 2, out needed)) return "info_err=" + Marshal.GetLastWin32Error();
            opened = true;
            return sb.ToString();
        }
        finally
        {
            CloseDesktop(h);
        }
    }

    static int ConnectState(uint sessionId)
    {
        IntPtr buf;
        uint bytes;
        if (!WTSQuerySessionInformation(IntPtr.Zero, sessionId, WTSConnectState, out buf, out bytes)) return -1;
        try
        {
            if (bytes < 4) return -1;
            return Marshal.ReadInt32(buf);
        }
        finally
        {
            WTSFreeMemory(buf);
        }
    }

    /// <summary>
    /// Returns a single line: "OK|session=1|console=1|state=0|desktop=Default|fg=1234"
    /// or "FAIL|reason=..." — callers must treat anything but OK as non-interactive.
    /// </summary>
    public static string Check()
    {
        try
        {
            uint pid = GetCurrentProcessId();
            uint mySession;
            if (!ProcessIdToSessionId(pid, out mySession)) return "FAIL|reason=session_lookup_failed";

            uint console = WTSGetActiveConsoleSessionId();
            if (console == 0xFFFFFFFF) return "FAIL|reason=no_active_console";

            int state = ConnectState(mySession);
            if (state < 0) return "FAIL|reason=wts_query_failed";
            if (state != WTSActive) return "FAIL|reason=session_not_active:state=" + state;

            bool opened;
            string desk = DesktopName(out opened);
            if (!opened) return "FAIL|reason=input_desktop_unavailable:" + desk;
            if (!string.Equals(desk, "Default", StringComparison.OrdinalIgnoreCase))
            {
                return "FAIL|reason=desktop_not_default:" + desk;
            }

            IntPtr fg = GetForegroundWindow();
            if (fg == IntPtr.Zero) return "FAIL|reason=no_foreground_window";
            uint fgPid;
            GetWindowThreadProcessId(fg, out fgPid);
            if (fgPid == 0) return "FAIL|reason=foreground_pid_unknown";

            uint fgSession;
            if (ProcessIdToSessionId(fgPid, out fgSession) && fgSession != mySession)
            {
                return "FAIL|reason=foreground_in_other_session";
            }

            return "OK|session=" + mySession + "|console=" + console + "|state=" + state + "|desktop=" + desk + "|fg=" + fgPid;
        }
        catch (Exception e)
        {
            return "FAIL|reason=exception:" + e.GetType().Name;
        }
    }

    /// <summary>Session id of the current process; 0xFFFFFFFF when unknown.</summary>
    public static uint CurrentSession()
    {
        try
        {
            uint sid;
            return ProcessIdToSessionId(GetCurrentProcessId(), out sid) ? sid : 0xFFFFFFFF;
        }
        catch
        {
            return 0xFFFFFFFF;
        }
    }

    /// <summary>Session id of a specific HWND; 0xFFFFFFFF when it cannot be determined.</summary>
    public static uint WindowSession(IntPtr hWnd)    {
        try
        {
            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);
            if (pid == 0) return 0xFFFFFFFF;
            uint sid;
            return ProcessIdToSessionId(pid, out sid) ? sid : 0xFFFFFFFF;
        }
        catch
        {
            return 0xFFFFFFFF;
        }
    }
}
