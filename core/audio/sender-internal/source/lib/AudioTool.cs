using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

// Minimal, dependency-free audio helper for the WeChat native-voice feasibility test.
// Playback: WinMM waveOut (device-selected, OS shared-mode engine handles format conversion).
// Recording: WinMM waveIn (device-selected) for loopback verification only.
// No COM, no resampling code, no default-device changes.
public static class AudioTool
{
    // ---------------- interop structs ----------------
    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    public struct WAVEFORMATEX
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
    public struct WAVEHDR
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
    public struct WAVEOUTCAPS
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

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct WAVEINCAPS
    {
        public ushort wMid;
        public ushort wPid;
        public uint vDriverVersion;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string szPname;
        public uint dwFormats;
        public ushort wChannels;
        public ushort wReserved1;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct MMTIME
    {
        public uint wType;
        public uint u0;
        public uint u1;
    }

    public delegate void WaveOutProc(IntPtr hwo, uint msg, IntPtr dwInstance, IntPtr dwParam1, IntPtr dwParam2);
    public delegate void WaveInProc(IntPtr hwi, uint msg, IntPtr dwInstance, IntPtr dwParam1, IntPtr dwParam2);

    [DllImport("winmm.dll", CharSet = CharSet.Unicode)]
    public static extern int waveOutGetNumDevs();
    [DllImport("winmm.dll", CharSet = CharSet.Unicode)]
    public static extern int waveOutGetDevCaps(IntPtr uDeviceID, ref WAVEOUTCAPS caps, int cbCaps);
    [DllImport("winmm.dll")]
    public static extern int waveOutOpen(out IntPtr hWaveOut, uint uDeviceID, ref WAVEFORMATEX lpFormat,
        WaveOutProc dwCallback, IntPtr dwInstance, uint dwFlags);
    [DllImport("winmm.dll")]
    public static extern int waveOutPrepareHeader(IntPtr h, IntPtr lpWaveOutHdr, int cbHdr);
    [DllImport("winmm.dll")]
    public static extern int waveOutWrite(IntPtr h, IntPtr lpWaveOutHdr, int cbHdr);
    [DllImport("winmm.dll")]
    public static extern int waveOutUnprepareHeader(IntPtr h, IntPtr lpWaveOutHdr, int cbHdr);
    [DllImport("winmm.dll")]
    public static extern int waveOutReset(IntPtr h);
    [DllImport("winmm.dll")]
    public static extern int waveOutClose(IntPtr h);
    [DllImport("winmm.dll")]
    public static extern int waveOutGetPosition(IntPtr h, ref MMTIME t, int cbT);
    [DllImport("winmm.dll")]
    public static extern int waveOutGetErrorText(int mmrError, StringBuilder pszText, int cchText);

    [DllImport("winmm.dll", CharSet = CharSet.Unicode)]
    public static extern int waveInGetNumDevs();
    [DllImport("winmm.dll", CharSet = CharSet.Unicode)]
    public static extern int waveInGetDevCaps(IntPtr uDeviceID, ref WAVEINCAPS caps, int cbCaps);
    [DllImport("winmm.dll")]
    public static extern int waveInOpen(out IntPtr hWaveIn, uint uDeviceID, ref WAVEFORMATEX lpFormat,
        WaveInProc dwCallback, IntPtr dwInstance, uint dwFlags);
    [DllImport("winmm.dll")]
    public static extern int waveInPrepareHeader(IntPtr h, IntPtr lpWaveInHdr, int cbHdr);
    [DllImport("winmm.dll")]
    public static extern int waveInUnprepareHeader(IntPtr h, IntPtr lpWaveInHdr, int cbHdr);
    [DllImport("winmm.dll")]
    public static extern int waveInAddBuffer(IntPtr h, IntPtr lpWaveInHdr, int cbHdr);
    [DllImport("winmm.dll")]
    public static extern int waveInStart(IntPtr h);
    [DllImport("winmm.dll")]
    public static extern int waveInStop(IntPtr h);
    [DllImport("winmm.dll")]
    public static extern int waveInReset(IntPtr h);
    [DllImport("winmm.dll")]
    public static extern int waveInClose(IntPtr h);

    const uint CALLBACK_FUNCTION = 0x00030000;
    const int WOM_DONE = 0x3BD;
    const int WIM_DATA = 0x3C0;
    const uint WHDR_DONE = 0x00000001;
    const uint TIME_SAMPLES = 0x0002;
    const int WAVE_FORMAT_PCM = 1;
    const int WAVE_FORMAT_IEEE_FLOAT = 3;
    const int WAVE_FORMAT_EXTENSIBLE = 0xFFFE;

    // keep delegates alive for the lifetime of the process
    static WaveOutProc _outProc;
    static WaveInProc _inProc;
    static ManualResetEvent _outDone;
    static ManualResetEvent _inDone;
    static int _outCbCount;
    static int _inCbCount;

    // ---------------- errors ----------------
    public static string Err(int hr)
    {
        var sb = new StringBuilder(256);
        try { waveOutGetErrorText(hr, sb, 256); } catch { }
        string t = sb.ToString();
        return "0x" + hr.ToString("X8") + (string.IsNullOrEmpty(t) ? "" : " (" + t + ")");
    }

    // ---------------- device enumeration ----------------
    public static string[] RenderDevices()
    {
        int n = waveOutGetNumDevs();
        var list = new List<string>();
        for (int i = 0; i < n; i++)
        {
            var c = new WAVEOUTCAPS();
            c.szPname = "";
            int hr = waveOutGetDevCaps((IntPtr)i, ref c, Marshal.SizeOf(typeof(WAVEOUTCAPS)));
            list.Add(i + " | " + (hr == 0 ? c.szPname : "hr=" + hr) + " | ch=" + c.wChannels);
        }
        return list.ToArray();
    }

    public static string[] CaptureDevices()
    {
        int n = waveInGetNumDevs();
        var list = new List<string>();
        for (int i = 0; i < n; i++)
        {
            var c = new WAVEINCAPS();
            c.szPname = "";
            int hr = waveInGetDevCaps((IntPtr)i, ref c, Marshal.SizeOf(typeof(WAVEINCAPS)));
            list.Add(i + " | " + (hr == 0 ? c.szPname : "hr=" + hr) + " | ch=" + c.wChannels);
        }
        return list.ToArray();
    }

    static string RenderName(int idx)
    {
        var c = new WAVEOUTCAPS();
        c.szPname = "";
        int hr = waveOutGetDevCaps((IntPtr)idx, ref c, Marshal.SizeOf(typeof(WAVEOUTCAPS)));
        return hr == 0 ? c.szPname : "(unknown)";
    }

    static string CaptureName(int idx)
    {
        var c = new WAVEINCAPS();
        c.szPname = "";
        int hr = waveInGetDevCaps((IntPtr)idx, ref c, Marshal.SizeOf(typeof(WAVEINCAPS)));
        return hr == 0 ? c.szPname : "(unknown)";
    }

    // nameContains: required substring (case-insensitive). nameExcludes: optional.
    public static int FindRender(string nameContains, string nameExcludes)
    {
        int n = waveOutGetNumDevs();
        for (int i = 0; i < n; i++)
        {
            string nm = RenderName(i);
            if (nm.IndexOf(nameContains, StringComparison.OrdinalIgnoreCase) < 0) continue;
            if (!string.IsNullOrEmpty(nameExcludes) && nm.IndexOf(nameExcludes, StringComparison.OrdinalIgnoreCase) >= 0) continue;
            return i;
        }
        return -1;
    }

    public static int FindCapture(string nameContains, string nameExcludes)
    {
        int n = waveInGetNumDevs();
        for (int i = 0; i < n; i++)
        {
            string nm = CaptureName(i);
            if (nm.IndexOf(nameContains, StringComparison.OrdinalIgnoreCase) < 0) continue;
            if (!string.IsNullOrEmpty(nameExcludes) && nm.IndexOf(nameExcludes, StringComparison.OrdinalIgnoreCase) >= 0) continue;
            return i;
        }
        return -1;
    }

    // ---------------- WAV parsing ----------------
    public static string Describe(string wavPath)
    {
        WAVEFORMATEX f;
        byte[] data;
        string err;
        if (!LoadWav(wavPath, out f, out data, out err)) return "ERROR: " + err;
        double ms = f.nAvgBytesPerSec == 0 ? 0 : (data.Length * 1000.0 / f.nAvgBytesPerSec);
        return string.Format(
            "file={0}\n  formatTag=0x{1:X4} channels={2} rate={3} bits={4} blockAlign={5} avgBytes/s={6}\n  dataBytes={7} durationMs={8:F1}",
            wavPath, f.wFormatTag, f.nChannels, f.nSamplesPerSec, f.wBitsPerSample, f.nBlockAlign,
            f.nAvgBytesPerSec, data.Length, ms);
    }

    public static bool LoadWav(string path, out WAVEFORMATEX fmt, out byte[] data, out string err)
    {
        fmt = new WAVEFORMATEX();
        data = null;
        err = null;
        byte[] all;
        try { all = File.ReadAllBytes(path); }
        catch (Exception e) { err = "read failed: " + e.Message; return false; }
        if (all.Length < 44) { err = "file too small"; return false; }
        if (Encoding.ASCII.GetString(all, 0, 4) != "RIFF" || Encoding.ASCII.GetString(all, 8, 4) != "WAVE")
        { err = "not a RIFF/WAVE file"; return false; }

        bool haveFmt = false, haveData = false;
        int fmtOff = -1, fmtLen = 0, dataOff = -1, dataLen = 0;
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
        if (!haveFmt) { err = "no fmt chunk"; return false; }
        if (!haveData) { err = "no data chunk"; return false; }
        if (fmtLen < 16 || fmtOff + 16 > all.Length) { err = "bad fmt chunk"; return false; }
        if (dataOff + dataLen > all.Length) dataLen = all.Length - dataOff;

        fmt.wFormatTag = BitConverter.ToUInt16(all, fmtOff + 0);
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

    // ---------------- playback ----------------
    // deviceIndex: 0..N-1, or -1 for WAVE_MAPPER (system default)
    public static string Play(string wavPath, int deviceIndex, int extraTimeoutMs)
    {
        WAVEFORMATEX fmt;
        byte[] data;
        string err;
        if (!LoadWav(wavPath, out fmt, out data, out err)) return "PLAY ABORT: " + err;

        double expectedMs = fmt.nAvgBytesPerSec == 0 ? 0 : (data.Length * 1000.0 / fmt.nAvgBytesPerSec);
        var sb = new StringBuilder();
        string devName = deviceIndex < 0 ? "(default WAVE_MAPPER)" : RenderName(deviceIndex);
        sb.AppendLine("--- PLAY ---");
        sb.AppendLine("deviceIndex=" + deviceIndex + " name=" + devName);
        sb.AppendLine("format tag=0x" + fmt.wFormatTag.ToString("X4") + " ch=" + fmt.nChannels +
                      " rate=" + fmt.nSamplesPerSec + " bits=" + fmt.wBitsPerSample);
        sb.AppendLine("bytes=" + data.Length + " expectedMs=" + expectedMs.ToString("F1"));

        if (deviceIndex < 0) deviceIndex = -1;
        if (deviceIndex >= 0 && deviceIndex >= waveOutGetNumDevs()) { sb.AppendLine("RESULT: FAIL device index out of range"); return sb.ToString(); }

        _outDone = new ManualResetEvent(false);
        _outCbCount = 0;
        if (_outProc == null) _outProc = new WaveOutProc(OnWaveOut);

        IntPtr h = IntPtr.Zero;
        IntPtr dataPtr = IntPtr.Zero;
        IntPtr hdrPtr = IntPtr.Zero;
        bool prepared = false;
        int hrOpen = -1, hrPrep = -1, hrWrite = -1;
        var sw = System.Diagnostics.Stopwatch.StartNew();
        long doneAtMs = -1;
        try
        {
            hrOpen = waveOutOpen(out h, unchecked((uint)deviceIndex), ref fmt, _outProc, IntPtr.Zero, CALLBACK_FUNCTION);
            sb.AppendLine("waveOutOpen hr=" + Err(hrOpen));
            if (hrOpen != 0) { sb.AppendLine("RESULT: FAIL open"); return sb.ToString(); }

            dataPtr = Marshal.AllocHGlobal(data.Length);
            Marshal.Copy(data, 0, dataPtr, data.Length);

            var hdr = new WAVEHDR();
            hdr.lpData = dataPtr;
            hdr.dwBufferLength = (uint)data.Length;
            hdrPtr = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(WAVEHDR)));
            Marshal.StructureToPtr(hdr, hdrPtr, false);

            hrPrep = waveOutPrepareHeader(h, hdrPtr, Marshal.SizeOf(typeof(WAVEHDR)));
            sb.AppendLine("waveOutPrepareHeader hr=" + Err(hrPrep));
            if (hrPrep != 0) { sb.AppendLine("RESULT: FAIL prepare"); return sb.ToString(); }
            prepared = true;

            sw.Restart();
            hrWrite = waveOutWrite(h, hdrPtr, Marshal.SizeOf(typeof(WAVEHDR)));
            sb.AppendLine("waveOutWrite hr=" + Err(hrWrite));
            if (hrWrite != 0) { sb.AppendLine("RESULT: FAIL write"); return sb.ToString(); }

            bool signalled = _outDone.WaitOne((int)expectedMs + 5000 + extraTimeoutMs);
            doneAtMs = sw.ElapsedMilliseconds;
            sb.AppendLine("doneEvent=" + signalled + " wallMs=" + doneAtMs + " callbacks=" + _outCbCount);

            // confirm WHDR_DONE flag from the driver's copy of the header
            var after = (WAVEHDR)Marshal.PtrToStructure(hdrPtr, typeof(WAVEHDR));
            sb.AppendLine("WHDR_DONE=" + ((after.dwFlags & WHDR_DONE) != 0) + " flags=0x" + after.dwFlags.ToString("X8"));

            if (!signalled)
            {
                int hrReset = waveOutReset(h);
                sb.AppendLine("TIMEOUT -> waveOutReset hr=" + Err(hrReset) + " then wait=" + _outDone.WaitOne(3000));
            }

            // drain: after WOM_DONE the buffer is returned; verify position
            var pos = new MMTIME();
            pos.wType = TIME_SAMPLES;
            int hrPos = waveOutGetPosition(h, ref pos, Marshal.SizeOf(typeof(MMTIME)));
            double playedMs = (fmt.nSamplesPerSec == 0) ? 0 : (pos.u0 * 1000.0 / fmt.nSamplesPerSec);
            sb.AppendLine("waveOutGetPosition hr=" + Err(hrPos) + " posSamples=" + pos.u0 + " posMs=" + playedMs.ToString("F1"));
            bool durOk = Math.Abs(playedMs - expectedMs) <= Math.Max(120.0, expectedMs * 0.08) || Math.Abs(doneAtMs - expectedMs) <= 150.0;
            sb.AppendLine("durationCheck=" + (durOk ? "OK" : "MISMATCH"));
            sb.AppendLine("RESULT: " + ((signalled && after.dwFlags != 0) ? "OK" : "INCOMPLETE"));
            return sb.ToString();
        }
        catch (Exception e)
        {
            sb.AppendLine("EXCEPTION: " + e.Message);
            return sb.ToString();
        }
        finally
        {
            try
            {
                if (h != IntPtr.Zero && prepared)
                {
                    // make sure the buffer is no longer owned by the driver
                    _outDone.WaitOne(1500);
                    waveOutUnprepareHeader(h, hdrPtr, Marshal.SizeOf(typeof(WAVEHDR)));
                }
                if (h != IntPtr.Zero) waveOutClose(h);
            }
            catch { }
            try { if (hdrPtr != IntPtr.Zero) Marshal.FreeHGlobal(hdrPtr); } catch { }
            try { if (dataPtr != IntPtr.Zero) Marshal.FreeHGlobal(dataPtr); } catch { }
            h = IntPtr.Zero;
            prepared = false;
            sb.AppendLine("cleanup: handleClosed=True");
        }
    }

    static void OnWaveOut(IntPtr h, uint msg, IntPtr inst, IntPtr p1, IntPtr p2)
    {
        Interlocked.Increment(ref _outCbCount);
        if (msg == WOM_DONE)
        {
            var e = _outDone;
            if (e != null) e.Set();
        }
    }

    static void OnWaveIn(IntPtr h, uint msg, IntPtr inst, IntPtr p1, IntPtr p2)
    {
        Interlocked.Increment(ref _inCbCount);
        if (msg == WIM_DATA)
        {
            var e = _inDone;
            if (e != null) e.Set();
        }
    }

    // ---------------- recording ----------------
    // records `seconds` of audio from deviceIndex into outWavPath (48k/16bit/stereo, falling back to 44.1k)
    public static string Record(string outWavPath, int deviceIndex, int seconds)
    {
        var sb = new StringBuilder();
        string devName = deviceIndex < 0 ? "(default)" : CaptureName(deviceIndex);
        sb.AppendLine("--- RECORD ---");
        sb.AppendLine("deviceIndex=" + deviceIndex + " name=" + devName);

        int[] rates = new int[] { 48000, 44100 };
        WAVEFORMATEX fmt = new WAVEFORMATEX();
        IntPtr h = IntPtr.Zero;
        int hrOpen = -1;
        if (_inProc == null) _inProc = new WaveInProc(OnWaveIn);

        foreach (int rate in rates)
        {
            fmt.wFormatTag = WAVE_FORMAT_PCM;
            fmt.nChannels = 2;
            fmt.nSamplesPerSec = (uint)rate;
            fmt.wBitsPerSample = 16;
            fmt.nBlockAlign = (ushort)(2 * 2);
            fmt.nAvgBytesPerSec = (uint)(rate * 4);
            fmt.cbSize = 0;
            hrOpen = waveInOpen(out h, unchecked((uint)deviceIndex), ref fmt, _inProc, IntPtr.Zero, CALLBACK_FUNCTION);
            sb.AppendLine("waveInOpen @" + rate + "Hz hr=" + Err(hrOpen));
            if (hrOpen == 0) break;
            h = IntPtr.Zero;
        }
        if (hrOpen != 0) { sb.AppendLine("RESULT: FAIL open"); return sb.ToString(); }

        int bufSize = (int)fmt.nAvgBytesPerSec * seconds;
        IntPtr dataPtr = IntPtr.Zero, hdrPtr = IntPtr.Zero;
        bool prepared = false;
        try
        {
            dataPtr = Marshal.AllocHGlobal(bufSize);
            for (int i = 0; i < bufSize; i += 4096) Marshal.WriteByte(dataPtr, i, 0);

            var hdr = new WAVEHDR();
            hdr.lpData = dataPtr;
            hdr.dwBufferLength = (uint)bufSize;
            hdrPtr = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(WAVEHDR)));
            Marshal.StructureToPtr(hdr, hdrPtr, false);

            int hrPrep = waveInPrepareHeader(h, hdrPtr, Marshal.SizeOf(typeof(WAVEHDR)));
            sb.AppendLine("waveInPrepareHeader hr=" + Err(hrPrep));
            if (hrPrep != 0) { sb.AppendLine("RESULT: FAIL prepare"); return sb.ToString(); }
            prepared = true;

            _inDone = new ManualResetEvent(false);
            _inCbCount = 0;

            int hrAdd = waveInAddBuffer(h, hdrPtr, Marshal.SizeOf(typeof(WAVEHDR)));
            sb.AppendLine("waveInAddBuffer hr=" + Err(hrAdd));
            if (hrAdd != 0) { sb.AppendLine("RESULT: FAIL addBuffer"); return sb.ToString(); }

            var sw = System.Diagnostics.Stopwatch.StartNew();
            int hrStart = waveInStart(h);
            sb.AppendLine("waveInStart hr=" + Err(hrStart));

            bool signalled = _inDone.WaitOne((seconds + 4) * 1000);
            long wallMs = sw.ElapsedMilliseconds;
            sb.AppendLine("dataEvent=" + signalled + " wallMs=" + wallMs + " callbacks=" + _inCbCount);

            waveInStop(h);
            waveInReset(h);
            int hrUnprep0 = 0;
            hrUnprep0 = waveInUnprepareHeader(h, hdrPtr, Marshal.SizeOf(typeof(WAVEHDR)));
            prepared = false;
            sb.AppendLine("waveInUnprepareHeader hr=" + Err(hrUnprep0));

            var after = (WAVEHDR)Marshal.PtrToStructure(hdrPtr, typeof(WAVEHDR));
            int got = (int)after.dwBytesRecorded;
            sb.AppendLine("bytesRecorded=" + got + " of " + bufSize);

            byte[] pcm = new byte[got];
            Marshal.Copy(dataPtr, pcm, 0, got);
            WriteWav(outWavPath, fmt, pcm);
            sb.AppendLine("wrote=" + outWavPath + " bytes=" + got);
            sb.AppendLine("RESULT: " + (signalled ? "OK" : "INCOMPLETE"));
            return sb.ToString();
        }
        catch (Exception e)
        {
            sb.AppendLine("EXCEPTION: " + e.Message);
            return sb.ToString();
        }
        finally
        {
            try
            {
                if (h != IntPtr.Zero)
                {
                    if (prepared) { waveInReset(h); waveInUnprepareHeader(h, hdrPtr, Marshal.SizeOf(typeof(WAVEHDR))); }
                    waveInClose(h);
                }
            }
            catch { }
            try { if (hdrPtr != IntPtr.Zero) Marshal.FreeHGlobal(hdrPtr); } catch { }
            try { if (dataPtr != IntPtr.Zero) Marshal.FreeHGlobal(dataPtr); } catch { }
        }
    }

    static void WriteWav(string path, WAVEFORMATEX fmt, byte[] pcm)
    {
        using (var fs = new FileStream(path, FileMode.Create, FileAccess.Write))
        using (var w = new BinaryWriter(fs))
        {
            int dataLen = pcm.Length;
            w.Write(Encoding.ASCII.GetBytes("RIFF"));
            w.Write(36 + dataLen);
            w.Write(Encoding.ASCII.GetBytes("WAVE"));
            w.Write(Encoding.ASCII.GetBytes("fmt "));
            w.Write(16);
            w.Write(fmt.wFormatTag);
            w.Write(fmt.nChannels);
            w.Write(fmt.nSamplesPerSec);
            w.Write(fmt.nAvgBytesPerSec);
            w.Write(fmt.nBlockAlign);
            w.Write(fmt.wBitsPerSample);
            w.Write(Encoding.ASCII.GetBytes("data"));
            w.Write(dataLen);
            w.Write(pcm);
        }
    }

    // play a wav to one device while recording another device (loopback evidence)
    public static string PlayAndRecord(string playWav, int playDev, string recWav, int recDev, int recSeconds)
    {
        string recResult = null;
        var t = new Thread(() => { recResult = Record(recWav, recDev, recSeconds); });
        t.IsBackground = true;
        t.Start();
        Thread.Sleep(700);
        string playResult = Play(playWav, playDev, 0);
        t.Join(recSeconds * 1000 + 8000);
        return playResult + "\n" + recResult;
    }
}
