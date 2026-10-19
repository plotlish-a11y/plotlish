// English Reader Studio V2.6 Alpha -- WASAPI system loopback recorder.
// Uses only Windows Core Audio COM and .NET Framework. No microphone / paid API.
// Source is compiled on the user's Windows PC by Windows PowerShell Add-Type.
using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Runtime.InteropServices;

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
internal class MMDeviceEnumeratorCom { }

[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDeviceEnumerator {
    [PreserveSig] int EnumAudioEndpoints(int flow, int stateMask, out IntPtr devices);
    [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice device);
    [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
    [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr callback);
    [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr callback);
}

[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDevice {
    [PreserveSig] int Activate(ref Guid iid, uint clsCtx, IntPtr activationParams,
                                [MarshalAs(UnmanagedType.IUnknown)] out object interfacePointer);
    [PreserveSig] int OpenPropertyStore(int access, out IntPtr store);
    [PreserveSig] int GetId(out IntPtr id);
    [PreserveSig] int GetState(out uint state);
}

[ComImport, Guid("1CB9AD4C-DBFA-4C32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IAudioClient {
    [PreserveSig] int Initialize(int shareMode, uint streamFlags, long bufferDuration,
                                 long periodicity, IntPtr format, ref Guid sessionGuid);
    [PreserveSig] int GetBufferSize(out uint frames);
    [PreserveSig] int GetStreamLatency(out long latency);
    [PreserveSig] int GetCurrentPadding(out uint padding);
    [PreserveSig] int IsFormatSupported(int shareMode, IntPtr format, out IntPtr closestMatch);
    [PreserveSig] int GetMixFormat(out IntPtr format);
    [PreserveSig] int GetDevicePeriod(out long defaultPeriod, out long minPeriod);
    [PreserveSig] int Start();
    [PreserveSig] int Stop();
    [PreserveSig] int Reset();
    [PreserveSig] int SetEventHandle(IntPtr eventHandle);
    [PreserveSig] int GetService(ref Guid iid, out IntPtr service);
}

[ComImport, Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IAudioCaptureClient {
    [PreserveSig] int GetBuffer(out IntPtr data, out uint frames, out uint flags,
                                out ulong devicePosition, out ulong qpcPosition);
    [PreserveSig] int ReleaseBuffer(uint frames);
    [PreserveSig] int GetNextPacketSize(out uint frames);
}

public class CaptureReport {
    public bool ok;
    public string message;
    public string file;
    public string format;
    public double durationSec;
    public double peak;
    public double rms;
    public long bytes;
}

public static class WASAPILoopback {
    static readonly object Sync = new object();
    static volatile bool StopFlag;
    static Thread Worker;
    static ManualResetEvent Started;
    static string OutputFile;
    static Exception WorkerError;
    static CaptureReport LastReport;
    static volatile bool Active;
    const uint AUDCLNT_STREAMFLAGS_LOOPBACK = 0x00020000;

    static void Check(int hr, string operation) {
        if (hr < 0) Marshal.ThrowExceptionForHR(hr);
    }
    public static bool IsRecording { get { return Active; } }
    public static CaptureReport Last { get { return LastReport; } }
    public static CaptureReport Start(string path) {
        lock (Sync) {
            if (Worker != null && Worker.IsAlive) throw new InvalidOperationException("已经有一个内录任务正在进行。");
            OutputFile = path;
            StopFlag = false;
            Active = false;
            WorkerError = null;
            LastReport = null;
            Started = new ManualResetEvent(false);
            Worker = new Thread(CaptureWorker);
            Worker.IsBackground = true;
            Worker.SetApartmentState(ApartmentState.MTA);
            Worker.Start();
        }
        if (!Started.WaitOne(TimeSpan.FromSeconds(8))) {
            StopFlag = true;
            throw new Exception("WASAPI 设备启动超时，请检查 Windows 默认扬声器。");
        }
        if (WorkerError != null) throw new Exception("无法启动系统数字内录：" + WorkerError.Message);
        CaptureReport status = new CaptureReport();
        status.ok = true;
        status.message = "系统输出音轨正在录制。请播放在线英语；请勿同时播放其他系统声音。";
        return status;
    }
    public static CaptureReport Stop() {
        Thread worker;
        lock (Sync) {
            worker = Worker;
            if (worker == null) throw new Exception("还没有开始内录。");
            StopFlag = true;
        }
        if (!worker.Join(10000)) throw new Exception("内录设备未及时停止，请关闭启动器并重试。");
        if (WorkerError != null) throw new Exception("系统内录错误：" + WorkerError.Message);
        if (LastReport == null) throw new Exception("内录结束，但没有得到音频状态。");
        return LastReport;
    }
    static void SafeRelease(object com) {
        if (com != null && Marshal.IsComObject(com)) Marshal.ReleaseComObject(com);
    }
    static void CaptureWorker() {
        IMMDeviceEnumerator enumerator = null;
        IMMDevice device = null;
        IAudioClient audio = null;
        IAudioCaptureClient capture = null;
        IntPtr mixPtr = IntPtr.Zero;
        FileStream fs = null;
        BinaryWriter bw = null;
        bool audioStarted = false;
        long frameCount = 0;
        long sampleCount = 0;
        double squareSum = 0;
        double peak = 0;
        int bytesPerFrame = 0, samplingRate = 0, channelCount = 0, bits = 0, formatCode = 0;
        int fmtLen = 0;
        string readableFormat = "";
        try {
            enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorCom();
            Check(enumerator.GetDefaultAudioEndpoint(0, 1, out device), "Default Audio Endpoint");
            Guid clientId = new Guid("1CB9AD4C-DBFA-4C32-B178-C2F568A703B2");
            object obj;
            Check(device.Activate(ref clientId, 23, IntPtr.Zero, out obj), "Activate AudioClient");
            audio = (IAudioClient)obj;
            Check(audio.GetMixFormat(out mixPtr), "GetMixFormat");
            formatCode = (ushort)Marshal.ReadInt16(mixPtr, 0);
            channelCount = (ushort)Marshal.ReadInt16(mixPtr, 2);
            samplingRate = Marshal.ReadInt32(mixPtr, 4);
            bytesPerFrame = (ushort)Marshal.ReadInt16(mixPtr, 12);
            bits = (ushort)Marshal.ReadInt16(mixPtr, 14);
            int extra = (ushort)Marshal.ReadInt16(mixPtr, 16);
            if (extra > 1024 || extra < 0 || channelCount < 1 || channelCount > 16 ||
                samplingRate < 8000 || samplingRate > 384000 || bytesPerFrame <= 0)
                throw new Exception("默认音频格式不受支持。");
            fmtLen = 18 + extra;
            byte[] fmt = new byte[fmtLen];
            Marshal.Copy(mixPtr, fmt, 0, fmtLen);
            int sampleCode = formatCode;
            if (formatCode == 65534 && extra >= 22) sampleCode = (int)BitConverter.ToUInt32(fmt, 24);
            readableFormat = samplingRate + "Hz / " + channelCount + "ch / " + bits + "bit / " + (sampleCode == 3 ? "float" : "PCM");
            Guid empty = Guid.Empty;
            Check(audio.Initialize(0, AUDCLNT_STREAMFLAGS_LOOPBACK, 0, 0, mixPtr, ref empty), "Initialize loopback");
            Guid captureId = new Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317");
            IntPtr svc;
            Check(audio.GetService(ref captureId, out svc), "GetService CaptureClient");
            try { capture = (IAudioCaptureClient)Marshal.GetObjectForIUnknown(svc); }
            finally { Marshal.Release(svc); }
            fs = new FileStream(OutputFile, FileMode.CreateNew, FileAccess.Write, FileShare.Read);
            bw = new BinaryWriter(fs);
            // WAV container with the Windows mix format (supports WAVEFORMATEXTENSIBLE).
            int pad = fmtLen % 2;
            bw.Write(Encoding.ASCII.GetBytes("RIFF"));
            bw.Write(0); // patch RIFF size on stop
            bw.Write(Encoding.ASCII.GetBytes("WAVEfmt "));
            bw.Write(fmtLen);
            bw.Write(fmt);
            if (pad != 0) bw.Write((byte)0);
            bw.Write(Encoding.ASCII.GetBytes("data"));
            long sizePos = fs.Position;
            bw.Write(0); // patch data size on stop
            Check(audio.Start(), "AudioClient.Start");
            audioStarted = true;
            Active = true;
            Started.Set();
            byte[] raw = new byte[65536];
            while (!StopFlag) {
                uint available;
                Check(capture.GetNextPacketSize(out available), "GetNextPacketSize");
                if (available == 0) { Thread.Sleep(12); continue; }
                while (available > 0 && !StopFlag) {
                    IntPtr data;
                    uint frames, flags;
                    ulong dp, qp;
                    Check(capture.GetBuffer(out data, out frames, out flags, out dp, out qp), "GetBuffer");
                    try {
                        int count = checked((int)frames * bytesPerFrame);
                        if (raw.Length < count) raw = new byte[count];
                        bool silence = (flags & 0x2) != 0 || data == IntPtr.Zero;
                        if (silence) Array.Clear(raw, 0, count);
                        else Marshal.Copy(data, raw, 0, count);
                        bw.Write(raw, 0, count);
                        frameCount += frames;
                        if (!silence) {
                            // Measure signal; do not confuse an allocated audio track with actual audio.
                            int bytesPerSample = bytesPerFrame / channelCount;
                            if (bytesPerSample >= 2) {
                                for (int p = 0; p + bytesPerSample <= count; p += bytesPerSample) {
                                    double v = 0;
                                    if (sampleCode == 3 && bytesPerSample == 4) v = BitConverter.ToSingle(raw, p);
                                    else if (bytesPerSample == 2) v = BitConverter.ToInt16(raw, p) / 32768.0;
                                    else if (bytesPerSample == 3) {
                                        int z = raw[p] | (raw[p+1]<<8) | (raw[p+2]<<16);
                                        if ((z & 0x800000) != 0) z |= unchecked((int)0xff000000);
                                        v = z / 8388608.0;
                                    } else if (bytesPerSample == 4) v = BitConverter.ToInt32(raw, p) / 2147483648.0;
                                    v = Math.Max(-1.0, Math.Min(1.0, v));
                                    if (double.IsNaN(v)) v = 0;
                                    sampleCount++;
                                    squareSum += v * v;
                                    if (Math.Abs(v) > peak) peak = Math.Abs(v);
                                }
                            }
                        }
                    } finally { Check(capture.ReleaseBuffer(frames), "ReleaseBuffer"); }
                    Check(capture.GetNextPacketSize(out available), "GetNextPacketSize");
                }
            }
            if (audioStarted) { audio.Stop(); audioStarted = false; }
            // Finish RIFF sizes; reject files larger than the 4-GB WAV RIFF limit.
            long end = fs.Position;
            if (end > uint.MaxValue) throw new Exception("音频文件超过 WAV 格式大小上限。");
            fs.Position = 4; bw.Write((uint)(end - 8));
            fs.Position = sizePos; bw.Write((uint)(end - (sizePos+4)));
            bw.Flush();
            CaptureReport result = new CaptureReport();
            result.durationSec = samplingRate == 0 ? 0 : (double)frameCount / samplingRate;
            result.peak = peak;
            result.rms = sampleCount > 0 ? Math.Sqrt(squareSum / sampleCount) : 0;
            result.bytes = end;
            result.format = readableFormat;
            result.file = OutputFile;
            result.ok = result.durationSec >= 0.5 && result.rms > 0.0002 && result.peak > 0.001;
            result.message = result.ok ? "捕获到非静音系统音轨。请试听确认是否确为英语人声。" :
                "未检测到有效声音；音频不会导入项目。请检查默认扬声器或声音输出设备。";
            LastReport = result;
        } catch (Exception ex) {
            WorkerError = ex;
            Started.Set();
        } finally {
            Active = false;
            try { if (audioStarted) audio.Stop(); } catch {}
            if (bw != null) bw.Dispose(); else if (fs != null) fs.Dispose();
            if (mixPtr != IntPtr.Zero) Marshal.FreeCoTaskMem(mixPtr);
            SafeRelease(capture); SafeRelease(audio); SafeRelease(device); SafeRelease(enumerator);
        }
    }
}
