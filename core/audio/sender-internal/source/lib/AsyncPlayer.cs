using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

// Non-blocking, device-targeted WAV playback (WinMM waveOut) so the caller can keep
// watching the WeChat window while the audio is playing, and can abort mid-play.
public static class AsyncPlayer
{
    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    struct WAVEFORMATEX
    {
        public ushort wFormatTag;
        public ushort nChannels;
        public uint nSamplesPerSec;
        public uint nAvgBytesPerSec;
        public ushort nBlockAlign;
        public ushort wBitsPerSample;
        public ushort cbSize;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct WAVEHDR
    {
        public IntPtr lpData;
        public uint dwBufferLength;
        public uint dwBytesRecorded;
        public IntPtr dwUser;
        public uint dwFlags;
        public uint dwLoops;
        public IntPtr lpNext;
        public IntPtr reserved;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct WAVEOUTCAPS
    {
        public ushort wMid;
        public ushort wPid;
        public uint vDriverVersion;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string szPname;
        public uint dwFormats;
        public ushort wChannels;
        public ushort wReserved1;
        public uint dwSupport;
    }

    delegate void WaveOutProc(IntPtr hwo, uint msg, IntPtr dwInstance, IntPtr dwParam1, IntPtr dwParam2);

    [DllImport("winmm.dll", CharSet = CharSet.Unicode)]
    static extern int waveOutGetNumDevs();
    [DllImport("winmm.dll", CharSet = CharSet.Unicode)]
    static extern int waveOutGetDevCaps(IntPtr uDeviceID, ref WAVEOUTCAPS caps, int cbCaps);
    [DllImport("winmm.dll")]
    static extern int waveOutOpen(out IntPtr h, uint uDeviceID, ref WAVEFORMATEX fmt, WaveOutProc cb, IntPtr inst, uint flags);
    [DllImport("winmm.dll")]
    static extern int waveOutPrepareHeader(IntPtr h, IntPtr hdr, int cb);
    [DllImport("winmm.dll")]
    static extern int waveOutWrite(IntPtr h, IntPtr hdr, int cb);
    [DllImport("winmm.dll")]
    static extern int waveOutUnprepareHeader(IntPtr h, IntPtr hdr, int cb);
    [DllImport("winmm.dll")]
    static extern int waveOutReset(IntPtr h);
    [DllImport("winmm.dll")]
    static extern int waveOutClose(IntPtr h);
    [DllImport("winmm.dll")]
    static extern int waveOutGetPosition(IntPtr h, ref MMTIME t, int cb);

    [StructLayout(LayoutKind.Sequential)]
    struct MMTIME { public uint wType; public uint u0; public uint u1; }

    const uint CALLBACK_FUNCTION = 0x00030000;
    const int WOM_DONE = 0x3BD;
    const uint TIME_SAMPLES = 0x0002;

    static IntPtr _h = IntPtr.Zero;
    static IntPtr _dataPtr = IntPtr.Zero;
    static IntPtr _hdrPtr = IntPtr.Zero;
    static ManualResetEvent _done;
    static WaveOutProc _proc;
    static volatile bool _playing;
    static long _startTicks;
    static int _rate;
    static long _expectedMs;
    static int _deviceIndex = -1;
    static string _report = "";
    static readonly object _sync = new object();

    public static string DeviceName(int idx)
    {
        var c = new WAVEOUTCAPS();
        c.szPname = "";
        int hr = waveOutGetDevCaps((IntPtr)idx, ref c, Marshal.SizeOf(typeof(WAVEOUTCAPS)));
        return hr == 0 ? c.szPname : "(unknown)";
    }

    public static int FindRender(string contains, string excludes)
    {
        int n = waveOutGetNumDevs();
        for (int i = 0; i < n; i++)
        {
            string nm = DeviceName(i);
            if (nm.IndexOf(contains, StringComparison.OrdinalIgnoreCase) < 0) continue;
            if (!string.IsNullOrEmpty(excludes) && nm.IndexOf(excludes, StringComparison.OrdinalIgnoreCase) >= 0) continue;
            return i;
        }
        return -1;
    }

    static bool LoadWav(string path, out WAVEFORMATEX fmt, out byte[] data, out string err)
    {
        fmt = new WAVEFORMATEX();
        data = null;
        err = null;
        byte[] all;
        try { all = File.ReadAllBytes(path); }
        catch (Exception e) { err = "read failed: " + e.Message; return false; }
        if (all.Length < 44) { err = "file too small"; return false; }
        if (Encoding.ASCII.GetString(all, 0, 4) != "RIFF") { err = "not RIFF"; return false; }
        bool haveFmt = false, haveData = false;
        int fmtOff = 0, fmtLen = 0, dataOff = 0, dataLen = 0;
        int p = 12;
        while (p + 8 <= all.Length)
        {
            string id = Encoding.ASCII.GetString(all, p, 4);
            int len = BitConverter.ToInt32(all, p + 4);
            int body = p + 8;
            if (len < 0) len = 0;
            if (id == "fmt ") { fmtOff = body; fmtLen = len; haveFmt = true; }
            else if (id == "data") { dataOff = body; dataLen = len; haveData = true; }
            p = body + len + (len & 1);
            if (haveFmt && haveData) break;
        }
        if (!haveFmt || !haveData) { err = "missing chunks"; return false; }
        if (fmtLen < 16) { err = "bad fmt"; return false; }
        if (dataOff + dataLen > all.Length) dataLen = all.Length - dataOff;
        fmt.wFormatTag = BitConverter.ToUInt16(all, fmtOff);
        fmt.nChannels = BitConverter.ToUInt16(all, fmtOff + 2);
        fmt.nSamplesPerSec = BitConverter.ToUInt32(all, fmtOff + 4);
        fmt.nAvgBytesPerSec = BitConverter.ToUInt32(all, fmtOff + 8);
        fmt.nBlockAlign = BitConverter.ToUInt16(all, fmtOff + 12);
        fmt.wBitsPerSample = BitConverter.ToUInt16(all, fmtOff + 14);
        fmt.cbSize = (ushort)(fmtLen >= 18 ? BitConverter.ToUInt16(all, fmtOff + 16) : 0);
        data = new byte[dataLen];
        Array.Copy(all, dataOff, data, 0, dataLen);
        return true;
    }

    // returns "" on success, error text otherwise
    public static string Start(string wavPath, int deviceIndex)
    {
        lock (_sync)
        {
            if (_playing) return "already playing";
            WAVEFORMATEX fmt;
            byte[] data;
            string err;
            if (!LoadWav(wavPath, out fmt, out data, out err)) return "wav error: " + err;
            _expectedMs = fmt.nAvgBytesPerSec == 0 ? 0 : (long)(data.Length * 1000.0 / fmt.nAvgBytesPerSec);
            _rate = (int)fmt.nSamplesPerSec;
            _deviceIndex = deviceIndex;
            _report = "";
            _done = new ManualResetEvent(false);
            if (_proc == null) _proc = new WaveOutProc(OnWaveOut);

            int hr = waveOutOpen(out _h, unchecked((uint)deviceIndex), ref fmt, _proc, IntPtr.Zero, CALLBACK_FUNCTION);
            if (hr != 0) { _report = "waveOutOpen hr=0x" + hr.ToString("X8"); return _report; }

            _dataPtr = Marshal.AllocHGlobal(data.Length);
            Marshal.Copy(data, 0, _dataPtr, data.Length);
            var hdr = new WAVEHDR();
            hdr.lpData = _dataPtr;
            hdr.dwBufferLength = (uint)data.Length;
            _hdrPtr = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(WAVEHDR)));
            Marshal.StructureToPtr(hdr, _hdrPtr, false);
            int hr2 = waveOutPrepareHeader(_h, _hdrPtr, Marshal.SizeOf(typeof(WAVEHDR)));
            if (hr2 != 0) { _report = "prepare hr=0x" + hr2.ToString("X8"); Cleanup(); return _report; }

            _startTicks = System.Diagnostics.Stopwatch.GetTimestamp();
            _playing = true;
            int hr3 = waveOutWrite(_h, _hdrPtr, Marshal.SizeOf(typeof(WAVEHDR)));
            if (hr3 != 0) { _report = "write hr=0x" + hr3.ToString("X8"); _playing = false; Cleanup(); return _report; }
            return "";
        }
    }

    public static bool IsPlaying { get { return _playing; } }

    public static long ExpectedMs { get { return _expectedMs; } }

    public static long ElapsedMs
    {
        get
        {
            if (_startTicks == 0) return 0;
            return (long)((System.Diagnostics.Stopwatch.GetTimestamp() - _startTicks) * 1000.0 / System.Diagnostics.Stopwatch.Frequency);
        }
    }

    static void OnWaveOut(IntPtr h, uint msg, IntPtr inst, IntPtr p1, IntPtr p2)
    {
        if (msg == WOM_DONE)
        {
            _playing = false;
            var e = _done;
            if (e != null) e.Set();
        }
    }

    static void Cleanup()
    {
        try
        {
            if (_h != IntPtr.Zero && _hdrPtr != IntPtr.Zero) waveOutUnprepareHeader(_h, _hdrPtr, Marshal.SizeOf(typeof(WAVEHDR)));
        }
        catch { }
        try { if (_h != IntPtr.Zero) waveOutClose(_h); } catch { }
        _h = IntPtr.Zero;
        try { if (_hdrPtr != IntPtr.Zero) Marshal.FreeHGlobal(_hdrPtr); } catch { }
        _hdrPtr = IntPtr.Zero;
        try { if (_dataPtr != IntPtr.Zero) Marshal.FreeHGlobal(_dataPtr); } catch { }
        _dataPtr = IntPtr.Zero;
        _playing = false;
        _startTicks = 0;
    }

    // wait for natural completion
    public static string WaitForDone(int timeoutMs)
    {
        var e = _done;
        bool ok = e != null && e.WaitOne(timeoutMs);
        long wall = ElapsedMs;
        string pos = "";
        try
        {
            var t = new MMTIME();
            t.wType = TIME_SAMPLES;
            if (_h != IntPtr.Zero && waveOutGetPosition(_h, ref t, Marshal.SizeOf(typeof(MMTIME))) == 0)
                pos = " posMs=" + (t.u0 * 1000.0 / (_rate == 0 ? 48000 : _rate)).ToString("F1");
        }
        catch { }
        Cleanup();
        _report = "doneEvent=" + ok + " expectedMs=" + _expectedMs + " wallMs=" + wall + pos + " device=" + _deviceIndex;
        return _report;
    }

    // abort playback immediately
    public static string Abort()
    {
        lock (_sync)
        {
            try { if (_h != IntPtr.Zero) waveOutReset(_h); } catch { }
            // waveOutReset is asynchronous: give the driver a moment to hand the buffer back,
            // then close the handle so a later send cannot inherit a half-open device.
            var e = _done;
            try { if (e != null) e.WaitOne(300); } catch { }
            long wall = ElapsedMs;
            Cleanup();
            return "aborted at wallMs=" + wall;
        }
    }

    public static string Describe(string wavPath)
    {
        WAVEFORMATEX fmt;
        byte[] data;
        string err;
        if (!LoadWav(wavPath, out fmt, out data, out err)) return "ERROR " + err;
        double ms = fmt.nAvgBytesPerSec == 0 ? 0 : (data.Length * 1000.0 / fmt.nAvgBytesPerSec);
        return "tag=0x" + fmt.wFormatTag.ToString("X4") + " ch=" + fmt.nChannels + " rate=" + fmt.nSamplesPerSec +
               " bits=" + fmt.wBitsPerSample + " bytes=" + data.Length + " durationMs=" + ms.ToString("F1");
    }
}
