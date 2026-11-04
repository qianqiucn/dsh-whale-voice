using System;
using System.Runtime.InteropServices;

// Reads and (only when explicitly asked) changes the Windows default audio endpoints
// through the documented MMDevice enumerator plus the legacy IPolicyConfig client.
public static class AudioPolicy
{
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    class MMDeviceEnumeratorComObject { }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDeviceEnumerator
    {
        int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
        int GetDevice(string id, out IMMDevice device);
        int RegisterEndpointNotificationCallback(IntPtr client);
        int UnregisterEndpointNotificationCallback(IntPtr client);
    }

    [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDeviceCollection
    {
        int GetCount(out int count);
        int Item(int index, out IMMDevice device);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDevice
    {
        int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
        int OpenPropertyStore(int access, out IPropertyStore store);
        int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
        int GetState(out int state);
    }

    [ComImport, Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IPropertyStore
    {
        int GetCount(out int count);
        int GetAt(int index, out PROPERTYKEY key);
        int GetValue(ref PROPERTYKEY key, out PROPVARIANT value);
        int SetValue(ref PROPERTYKEY key, ref PROPVARIANT value);
        int Commit();
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct PROPERTYKEY { public Guid fmtid; public int pid; }

    [StructLayout(LayoutKind.Explicit)]
    public struct PROPVARIANT
    {
        [FieldOffset(0)] public short vt;
        [FieldOffset(8)] public IntPtr pointerValue;
    }

    [ComImport, Guid("f8679f50-850a-41cf-9c72-430f290290c8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IPolicyConfig
    {
        int GetMixFormat([MarshalAs(UnmanagedType.LPWStr)] string deviceName, out IntPtr format);
        int GetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string deviceName, int bDefault, out IntPtr format);
        int ResetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string deviceName);
        int SetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string deviceName, IntPtr endPointFormat, IntPtr mixFormat);
        int GetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string deviceName, int bDefault, out long defaultPeriod, out long minimumPeriod);
        int SetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string deviceName, ref long period);
        int GetShareMode([MarshalAs(UnmanagedType.LPWStr)] string deviceName, out IntPtr mode);
        int SetShareMode([MarshalAs(UnmanagedType.LPWStr)] string deviceName, IntPtr mode);
        int GetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string deviceName, ref PROPERTYKEY key, out PROPVARIANT value);
        int SetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string deviceName, ref PROPERTYKEY key, ref PROPVARIANT value);
        int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string deviceName, int role);
        int SetEndpointVisibility([MarshalAs(UnmanagedType.LPWStr)] string deviceName, int visible);
    }

    [ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")]
    class PolicyConfigClient { }

    const int FLOW_RENDER = 0;
    const int FLOW_CAPTURE = 1;
    const int STATE_ACTIVE = 1;

    static IMMDeviceEnumerator Enumerator()
    {
        return (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
    }

    public static string FriendlyName(IMMDevice dev)
    {
        IPropertyStore ps;
        dev.OpenPropertyStore(0, out ps);
        var k = new PROPERTYKEY();
        k.fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0");
        k.pid = 14;
        PROPVARIANT v;
        ps.GetValue(ref k, out v);
        if (v.vt == 31) return Marshal.PtrToStringUni(v.pointerValue);
        return "(?)";
    }

    // edge: 0 = console/default, 1 = multimedia, 2 = communications
    public static string[] Defaults()
    {
        var r = new string[6];
        var en = Enumerator();
        string[] flowName = new string[] { "render", "capture" };
        for (int f = 0; f < 2; f++)
        {
            for (int role = 0; role < 3; role++)
            {
                IMMDevice d;
                int hr = en.GetDefaultAudioEndpoint(f, role, out d);
                if (hr != 0) { r[f * 3 + role] = flowName[f] + " role" + role + " = (hr=" + hr + ")"; continue; }
                string id;
                d.GetId(out id);
                r[f * 3 + role] = flowName[f] + " role" + role + " = " + FriendlyName(d) + " | id=" + id;
            }
        }
        return r;
    }

    public static string DefaultId(int flow, int role)
    {
        IMMDevice d;
        var en = Enumerator();
        int hr = en.GetDefaultAudioEndpoint(flow, role, out d);
        if (hr != 0) return null;
        string id;
        d.GetId(out id);
        return id;
    }

    public static string[] List(int flow)
    {
        var en = Enumerator();
        IMMDeviceCollection col;
        int hr = en.EnumAudioEndpoints(flow, STATE_ACTIVE, out col);
        if (hr != 0) return new string[] { "enum hr=" + hr };
        int n;
        col.GetCount(out n);
        var res = new string[n];
        for (int i = 0; i < n; i++)
        {
            IMMDevice d;
            col.Item(i, out d);
            string id;
            d.GetId(out id);
            res[i] = FriendlyName(d) + " | id=" + id;
        }
        return res;
    }

    // Set the endpoint for one role. Returns the HRESULT.
    public static int SetDefault(string endpointId, int role)
    {
        var pc = (IPolicyConfig)(new PolicyConfigClient());
        return pc.SetDefaultEndpoint(endpointId, role);
    }

    public static string SetAllRoles(string endpointId, int flow)
    {
        var sb = new System.Text.StringBuilder();
        for (int role = 0; role < 3; role++)
        {
            int hr = SetDefault(endpointId, role);
            sb.AppendLine("  set role" + role + " (" + (role == 0 ? "console" : role == 1 ? "multimedia" : "communications") + ") hr=0x" + hr.ToString("X8"));
        }
        return sb.ToString();
    }

    public static string FindCaptureId(string namePart)
    {
        var en = Enumerator();
        IMMDeviceCollection col;
        en.EnumAudioEndpoints(FLOW_CAPTURE, STATE_ACTIVE, out col);
        int n;
        col.GetCount(out n);
        for (int i = 0; i < n; i++)
        {
            IMMDevice d;
            col.Item(i, out d);
            if (FriendlyName(d).IndexOf(namePart, StringComparison.OrdinalIgnoreCase) >= 0)
            {
                string id;
                d.GetId(out id);
                return id;
            }
        }
        return null;
    }
}
