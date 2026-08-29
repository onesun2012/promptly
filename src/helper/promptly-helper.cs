// Promptly Helper - selection detection pipeline (M1)
//
// Runs as a separate process so a crash here never takes down the Electron app
// (SPEC A3 Helper Lifecycle). Protocol: JSON-over-stdio with the envelope from
// SPEC appendix C. Events on stdout; diagnostics on stderr; commands on stdin.
// Config arrives as argv at spawn (M1 simplification); stdin carries only the
// "captureNow" / "shutdown" commands.
// Compiled with the Windows-inbox .NET Framework csc.exe (C# 5 syntax only!),
// so there are zero redistribution dependencies (SPEC §2A helper choice).

using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Automation;
using System.Windows.Automation.Text;
using System.Windows.Forms;

namespace Promptly.Helper
{
    internal static class Program
    {
        private const int MaxTextLength = 100000;

        private static readonly object ConsoleLock = new object();
        private static int sessionSeq;
        private static Config config = new Config();
        private static MouseWatcher watcher;

        internal static int Main(string[] args)
        {
            ParseArgs(args);

            AppDomain.CurrentDomain.ProcessExit += OnProcessExit;
            Console.CancelKeyPress += delegate { Cleanup(); };

            Emit("hello", Json.Obj("helperVersion", Json.Str("0.1.0"), "pid", Json.Num(Process.GetCurrentProcess().Id)));
            Log("helper started pid=" + Process.GetCurrentProcess().Id + " electronPid=" + config.ElectronPid);

            StartStdinReader();
            StartHeartbeat();

            watcher = new MouseWatcher(config);
            watcher.SelectionTriggered += OnSelectionTriggered;
            watcher.StateChanged += OnStateChanged;
            watcher.RunMessageLoop(); // blocks forever

            return 0;
        }

        // ---- stdin commands -------------------------------------------------

        private static void StartStdinReader()
        {
            var reader = new Thread(delegate()
            {
                try
                {
                    string line;
                    while ((line = Console.ReadLine()) != null)
                    {
                        string cmd = line.Trim();
                        if (cmd == "shutdown")
                        {
                            Log("shutdown command received");
                            Cleanup();
                            Environment.Exit(0);
                        }
                        else if (cmd == "captureNow")
                        {
                            TriggerFromCursor();
                        }
                    }
                    // stdin closed: parent died or closed the pipe - do not linger.
                    Log("stdin closed, exiting");
                    Cleanup();
                    Environment.Exit(0);
                }
                catch (Exception ex)
                {
                    Log("stdin reader error: " + ex.Message);
                }
            });
            reader.IsBackground = true;
            reader.Start();
        }

        // ---- heartbeat -------------------------------------------------------

        private static void StartHeartbeat()
        {
            var heartbeat = new Thread(delegate()
            {
                while (true)
                {
                    Thread.Sleep(5000);
                    Emit("heartbeat", Json.Obj("pid", Json.Num(Process.GetCurrentProcess().Id)));
                }
            });
            heartbeat.IsBackground = true;
            heartbeat.Start();
        }

        // ---- pipeline entry --------------------------------------------------

        private static void OnStateChanged(string state, string detail)
        {
            Emit("state", Json.Obj("state", Json.Str(state), "detail", Json.Str(detail == null ? "" : detail)));
        }

        private static void OnSelectionTriggered(SelectionSession session)
        {
            if (session.LockedPid == (uint)config.ElectronPid || session.LockedPid == (uint)NativeSelfPid())
            {
                // A4-4: Promptly's own windows never trigger a selection.
                Fail(session, "suppressed", "own window");
                return;
            }
            if (config.IsBlacklisted(session.ProcessName))
            {
                Fail(session, "blacklisted", session.ProcessName);
                return;
            }
            var worker = new Thread(delegate() { RunCapturePipeline(session); });
            worker.SetApartmentState(ApartmentState.STA); // UIA + Clipboard want STA
            worker.IsBackground = true;
            worker.Start();
        }

        private static void TriggerFromCursor()
        {
            POINT p;
            if (!GetCursorPos(out p)) return;
            IntPtr hwnd = GetForegroundWindow();
            SelectionSession session = SelectionSession.FromWindow(hwnd, p, 0);
            OnSelectionTriggered(session);
        }

        // ---- capture pipeline (STA thread) -----------------------------------

        private static void RunCapturePipeline(SelectionSession session)
        {
            string decision = "unknown"; // SAFE | SENSITIVE | UNKNOWN (SPEC A1 three-state)
            try
            {
                string uiaText;
                string uiaDecision;
                TryUiaCapture(session, out uiaText, out uiaDecision);
                decision = uiaDecision;

                if (decision == "sensitive")
                {
                    Fail(session, "sensitive_blocked", "UIA reported a sensitive field");
                    return;
                }

                if (decision == "safe" && !string.IsNullOrEmpty(uiaText))
                {
                    EmitCaptured(session, uiaText, "uia", decision);
                    return;
                }

                // UIA unavailable or empty selection.
                if (decision != "safe")
                {
                    // A4-3: UNKNOWN is BLOCKED - never touch the clipboard.
                    Fail(session, "uia_unsupported", "decision=" + decision);
                    return;
                }

                // decision == safe but empty selection -> clipboard fallback.
                string cbText;
                string failReason;
                if (TryClipboardFallback(session, out cbText, out failReason))
                {
                    EmitCaptured(session, cbText, "clipboard", decision);
                }
                else
                {
                    Fail(session, failReason, "clipboard fallback failed");
                }
            }
            catch (Exception ex)
            {
                Log("pipeline error: " + ex);
                Fail(session, "internal_error", ex.Message);
            }
        }

        // ---- UIA capture ------------------------------------------------------

        private static void TryUiaCapture(SelectionSession session, out string text, out string decision)
        {
            text = null;
            decision = "unknown";

            try
            {
                AutomationElement focused = null;
                try { focused = AutomationElement.FocusedElement; } catch { }

                if (focused == null)
                {
                    decision = "unknown";
                    return;
                }

                // Focus must still belong to the window we locked at MOUSE_DOWN,
                // otherwise the session context is stale (focus moved elsewhere).
                if (focused.Current.ProcessId != (int)session.LockedPid)
                {
                    decision = "unknown";
                    return;
                }

                if (IsSensitive(focused))
                {
                    decision = "sensitive";
                    return;
                }

                object pattern;
                if (focused.TryGetCurrentPattern(TextPattern.Pattern, out pattern))
                {
                    var tp = (TextPattern)pattern;
                    TextPatternRange[] ranges = tp.GetSelection();
                    if (ranges != null && ranges.Length > 0)
                    {
                        string t = ranges[0].GetText(MaxTextLength);
                        if (!string.IsNullOrEmpty(t))
                        {
                            text = t;
                            decision = "safe";
                            return;
                        }
                    }
                }

                // Element identified and not sensitive, but no TextPattern/empty
                // selection (WPS, some Office surfaces) -> SAFE, try fallback.
                decision = "safe";
            }
            catch (Exception ex)
            {
                Log("uia capture error: " + ex.Message);
                decision = "unknown";
            }
        }

        private static bool IsSensitive(AutomationElement element)
        {
            try
            {
                AutomationElement el = element;
                TreeWalker walker = TreeWalker.ControlViewWalker;
                int depth = 0;
                while (el != null && depth < 6)
                {
                    object v = el.GetCurrentPropertyValue(AutomationElement.IsPasswordProperty, true);
                    if (v is bool && (bool)v) return true;
                    el = walker.GetParent(el);
                    depth++;
                }
            }
            catch
            {
                return false; // cannot determine here; caller-level UNKNOWN rules apply
            }
            return false;
        }

        // ---- clipboard fallback -----------------------------------------------

        private static bool TryClipboardFallback(SelectionSession session, out string text, out string failReason)
        {
            text = null;
            failReason = null;

            IDataObject backup = null;
            try
            {
                for (int i = 0; i < 3 && backup == null; i++)
                {
                    try { backup = Clipboard.GetDataObject(); }
                    catch { Thread.Sleep(30); }
                }
                if (backup == null)
                {
                    failReason = "clipboard_failed";
                    return false;
                }

                string marker = "PROMPTLY_MARKER_" + Guid.NewGuid().ToString("N");
                Clipboard.SetText(marker);
                long seqMarker = GetClipboardSequenceNumber();

                ReleaseModifiersAndCopy();
                Log("clipboard fallback: copy sent (pid=" + session.LockedPid + " app=" + session.ProcessName + ")");

                string copied = null;
                long seqRead = 0;
                int waited = 0;
                while (waited <= config.TimeoutMs)
                {
                    Thread.Sleep(config.PollIntervalMs);
                    waited += config.PollIntervalMs;
                    if (GetClipboardSequenceNumber() != seqMarker)
                    {
                        Thread.Sleep(20); // let the source app finish writing
                        copied = SafeGetText();
                        seqRead = GetClipboardSequenceNumber();
                        break;
                    }
                }

                bool userModified = false;
                if (copied != null && copied != marker)
                {
                    text = copied.Length > MaxTextLength ? copied.Substring(0, MaxTextLength) : copied;
                    // Race rule (A4-5): if the clipboard changed again after our
                    // read, the user copied something themselves - keep theirs.
                    userModified = GetClipboardSequenceNumber() != seqRead;
                }

                RestoreClipboard(backup, userModified);

                if (text == null)
                {
                    failReason = "timeout";
                    return false;
                }
                return true;
            }
            catch (Exception ex)
            {
                Log("clipboard fallback error: " + ex.Message);
                if (backup != null) RestoreClipboard(backup, false);
                failReason = "clipboard_failed";
                return false;
            }
        }

        private static string SafeGetText()
        {
            for (int i = 0; i < 3; i++)
            {
                try { return Clipboard.GetText(); }
                catch { Thread.Sleep(20); }
            }
            return null;
        }

        private static void RestoreClipboard(IDataObject backup, bool userModified)
        {
            if (userModified)
            {
                Log("clipboard race detected: user copied during fallback, keeping user clipboard");
                return;
            }
            for (int i = 0; i < 5; i++)
            {
                try
                {
                    Clipboard.SetDataObject(backup, true, 3, 40);
                    Log("clipboard restored");
                    return;
                }
                catch { Thread.Sleep(40); }
            }
            Log("clipboard restore failed after retries");
        }

        private static void ReleaseModifiersAndCopy()
        {
            ReleaseIfDown(VK_SHIFT);
            ReleaseIfDown(VK_MENU);
            ReleaseIfDown(VK_CONTROL);
            Thread.Sleep(15);
            SendKey(VK_CONTROL, false);
            SendKey(VK_C, false);
            SendKey(VK_C, true);
            SendKey(VK_CONTROL, true);
        }

        // ---- protocol ---------------------------------------------------------

        private static void EmitCaptured(SelectionSession s, string text, string method, string decision)
        {
            Emit("selectionCaptured", Json.Obj(
                "text", Json.Str(text),
                "app", Json.Str(s.ProcessName),
                "windowTitle", Json.Str(s.Title),
                "sensitive", Json.Str(decision),
                "method", Json.Str(method),
                "displacementPx", Json.Num(s.DisplacementPx),
                "cursor", Json.Obj("x", Json.Num(s.Point.X), "y", Json.Num(s.Point.Y))));
        }

        private static void Fail(SelectionSession s, string reason, string detail)
        {
            Log("no action: " + reason + " (" + detail + ")");
            Emit("captureFailed", Json.Obj(
                "reason", Json.Str(reason),
                "app", Json.Str(s == null ? "" : s.ProcessName)));
        }

        private static void Emit(string type, string payloadJson)
        {
            string env = "{\"version\":1,\"requestId\":" + Json.Str("") +
                         ",\"sessionId\":" + Json.Str("sid_" + Interlocked.Increment(ref sessionSeq)) +
                         ",\"type\":" + Json.Str(type) +
                         ",\"timestamp\":" + DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() +
                         ",\"payload\":" + payloadJson + "}";
            lock (ConsoleLock)
            {
                Console.Out.WriteLine(env);
                Console.Out.Flush();
            }
        }

        private static void Log(string msg)
        {
            lock (ConsoleLock)
            {
                Console.Error.WriteLine(DateTime.UtcNow.ToString("HH:mm:ss.fff") + " [helper] " + msg);
            }
        }

        private static void ParseArgs(string[] args)
        {
            for (int i = 0; i < args.Length - 1; i++)
            {
                string k = args[i];
                string v = args[i + 1];
                try
                {
                    if (k == "--pid") config.ElectronPid = int.Parse(v);
                    else if (k == "--threshold") config.DisplacementPx = int.Parse(v);
                    else if (k == "--poll") config.PollIntervalMs = int.Parse(v);
                    else if (k == "--timeout") config.TimeoutMs = int.Parse(v);
                    else if (k == "--blacklist") config.SetBlacklist(v);
                }
                catch { }
            }
        }

        private static void OnProcessExit(object sender, EventArgs e)
        {
            Cleanup();
        }

        private static void Cleanup()
        {
            if (watcher != null) watcher.Dispose();
        }

        private static int NativeSelfPid()
        {
            return Process.GetCurrentProcess().Id;
        }

        // ---- win32 / interop ---------------------------------------------------

        [DllImport("user32.dll")]
        private static extern long GetClipboardSequenceNumber();

        [DllImport("user32.dll")]
        private static extern bool GetCursorPos(out POINT p);

        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr handle);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool QueryFullProcessImageName(IntPtr hProcess, uint flags, StringBuilder name, ref uint size);

        [StructLayout(LayoutKind.Sequential)]
        internal struct POINT
        {
            public int X;
            public int Y;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct KEYBDINPUT
        {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct MOUSEINPUT
        {
            public int dx;
            public int dy;
            public uint mouseData;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Explicit)]
        private struct INPUTUNION
        {
            [FieldOffset(0)] public MOUSEINPUT mi;
            [FieldOffset(0)] public KEYBDINPUT ki;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct INPUT
        {
            public uint type;
            public INPUTUNION u;
        }

        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint SendInput(uint count, INPUT[] inputs, int size);

        [DllImport("user32.dll")]
        private static extern short GetAsyncKeyState(int key);

        private const uint INPUT_KEYBOARD = 1;
        private const uint KEYEVENTF_KEYUP = 2;
        private const int VK_SHIFT = 0x10;
        private const int VK_CONTROL = 0x11;
        private const int VK_MENU = 0x12;
        private const int VK_C = 0x43;

        private static void SendKey(ushort vk, bool up)
        {
            var input = new INPUT();
            input.type = INPUT_KEYBOARD;
            input.u.ki.wVk = vk;
            if (up) input.u.ki.dwFlags = KEYEVENTF_KEYUP;
            SendInput(1, new INPUT[] { input }, Marshal.SizeOf(typeof(INPUT)));
        }

        private static void ReleaseIfDown(int vk)
        {
            if ((GetAsyncKeyState(vk) & 0x8000) != 0) SendKey((ushort)vk, true);
        }

        // ---- nested types -------------------------------------------------------

        private class Config
        {
            public int ElectronPid = -1;
            public int DisplacementPx = 6;
            public int PollIntervalMs = 15;
            public int TimeoutMs = 300;
            private string[] blacklist = new string[0];

            public void SetBlacklist(string csv)
            {
                if (string.IsNullOrEmpty(csv))
                {
                    blacklist = new string[0];
                    return;
                }
                blacklist = csv.ToLowerInvariant().Split(new char[] { ',' }, StringSplitOptions.RemoveEmptyEntries);
            }

            public bool IsBlacklisted(string processName)
            {
                if (processName == null) return false;
                string lower = processName.ToLowerInvariant();
                foreach (string b in blacklist)
                {
                    if (lower == b || lower.EndsWith("." + b, StringComparison.Ordinal)) return true;
                }
                return false;
            }
        }

        internal sealed class SelectionSession
        {
            public IntPtr Hwnd;
            public uint LockedPid;
            public string ProcessName = "";
            public string Title = "";
            public POINT Point;
            public int DisplacementPx;

            public static SelectionSession FromWindow(IntPtr hwnd, POINT point, int displacement)
            {
                var s = new SelectionSession();
                s.Hwnd = hwnd;
                s.Point = point;
                s.DisplacementPx = displacement;
                if (hwnd != IntPtr.Zero)
                {
                    uint pid = 0;
                    GetWindowThreadProcessId(hwnd, out pid);
                    s.LockedPid = pid;
                    var sb = new StringBuilder(512);
                    GetWindowText(hwnd, sb, 512);
                    s.Title = sb.ToString();
                    s.ProcessName = QueryProcessName(pid);
                }
                return s;
            }

            private static string QueryProcessName(uint pid)
            {
                IntPtr handle = OpenProcess(0x1000 /* PROCESS_QUERY_LIMITED_INFORMATION */, false, pid);
                if (handle == IntPtr.Zero) return "";
                try
                {
                    var sb = new StringBuilder(1024);
                    uint size = (uint)sb.Capacity;
                    if (QueryFullProcessImageName(handle, 0, sb, ref size))
                    {
                        string full = sb.ToString();
                        int slash = full.LastIndexOf('\\');
                        return slash >= 0 ? full.Substring(slash + 1) : full;
                    }
                    return "";
                }
                finally { CloseHandle(handle); }
            }
        }

        private sealed class MouseWatcher : IDisposable
        {
            private const int WH_MOUSE_LL = 14;
            private const int WM_MOUSEMOVE = 0x0200;
            private const int WM_LBUTTONDOWN = 0x0201;
            private const int WM_LBUTTONUP = 0x0202;

            private readonly Config config;
            private IntPtr hook = IntPtr.Zero;
            private NativeHookProc hookProc;
            private POINT downPoint;
            private bool isDown;
            private int displacement;

            public event Action<SelectionSession> SelectionTriggered;
            public event Action<string, string> StateChanged;

            public MouseWatcher(Config config)
            {
                this.config = config;
                hookProc = HookProc;
            }

            public void RunMessageLoop()
            {
                hook = SetWindowsHookEx(WH_MOUSE_LL, hookProc, GetModuleHandle(null), 0);
                if (hook == IntPtr.Zero) throw new Exception("SetWindowsHookEx failed: " + Marshal.GetLastWin32Error());
                Log("mouse hook installed");

                MSG msg;
                while (GetMessage(out msg, IntPtr.Zero, 0, 0))
                {
                    TranslateMessage(ref msg);
                    DispatchMessage(ref msg);
                }
            }

            private IntPtr HookProc(int code, uint wParam, IntPtr lParam)
            {
                if (code >= 0)
                {
                    var info = (MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(MSLLHOOKSTRUCT));
                    if (wParam == WM_LBUTTONDOWN)
                    {
                        isDown = true;
                        displacement = 0;
                        downPoint.X = info.X;
                        downPoint.Y = info.Y;
                        RaiseState("MOUSE_DOWN", "");
                    }
                    else if (wParam == WM_MOUSEMOVE && isDown)
                    {
                        int dx = info.X - downPoint.X;
                        int dy = info.Y - downPoint.Y;
                        int d = Math.Abs(dx) > Math.Abs(dy) ? Math.Abs(dx) : Math.Abs(dy);
                        if (d > displacement)
                        {
                            bool wasBelow = displacement < config.DisplacementPx;
                            displacement = d;
                            if (wasBelow && displacement >= config.DisplacementPx) RaiseState("SELECTING", d + "px");
                        }
                    }
                    else if (wParam == WM_LBUTTONUP && isDown)
                    {
                        isDown = false;
                        if (displacement >= config.DisplacementPx)
                        {
                            RaiseState("MOUSE_UP", displacement + "px");
                            var pt = new POINT();
                            pt.X = info.X;
                            pt.Y = info.Y;
                            SelectionSession session = SelectionSession.FromWindow(GetForegroundWindow(), pt, displacement);
                            if (SelectionTriggered != null) SelectionTriggered(session);
                        }
                        else
                        {
                            RaiseState("IDLE", "click without selection");
                        }
                    }
                }
                return CallNextHookEx(hook, code, wParam, lParam);
            }

            private void RaiseState(string state, string detail)
            {
                if (StateChanged != null) StateChanged(state, detail);
            }

            public void Dispose()
            {
                if (hook != IntPtr.Zero)
                {
                    UnhookWindowsHookEx(hook);
                    hook = IntPtr.Zero;
                }
            }

            private delegate IntPtr NativeHookProc(int code, uint wParam, IntPtr lParam);

            [DllImport("user32.dll", SetLastError = true)]
            private static extern IntPtr SetWindowsHookEx(int idHook, NativeHookProc proc, IntPtr module, uint threadId);

            [DllImport("user32.dll", SetLastError = true)]
            private static extern bool UnhookWindowsHookEx(IntPtr hook);

            [DllImport("user32.dll")]
            private static extern IntPtr CallNextHookEx(IntPtr hook, int code, uint wParam, IntPtr lParam);

            [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
            private static extern IntPtr GetModuleHandle(string name);

            [StructLayout(LayoutKind.Sequential)]
            private struct MSG
            {
                public IntPtr hwnd;
                public uint message;
                public IntPtr wParam;
                public IntPtr lParam;
                public uint time;
                public int ptX;
                public int ptY;
            }

            [StructLayout(LayoutKind.Sequential)]
            private struct MSLLHOOKSTRUCT
            {
                public int X;
                public int Y;
                public uint mouseData;
                public uint flags;
                public uint time;
                public IntPtr extraInfo;
            }

            [DllImport("user32.dll")]
            private static extern bool GetMessage(out MSG msg, IntPtr hWnd, uint min, uint max);

            [DllImport("user32.dll")]
            private static extern bool TranslateMessage(ref MSG msg);

            [DllImport("user32.dll")]
            private static extern IntPtr DispatchMessage(ref MSG msg);
        }
    }

    // Minimal JSON value writers (C# 5 compatible, no dependencies).
    internal static class Json
    {
        internal static string Obj(params object[] pairs)
        {
            var sb = new StringBuilder();
            sb.Append('{');
            for (int i = 0; i < pairs.Length; i += 2)
            {
                if (i > 0) sb.Append(',');
                sb.Append('"').Append(Escape((string)pairs[i])).Append("\":");
                sb.Append(pairs[i + 1]);
            }
            sb.Append('}');
            return sb.ToString();
        }

        internal static string Str(string s)
        {
            if (s == null) return "\"\"";
            return "\"" + Escape(s) + "\"";
        }

        internal static string Num(long n)
        {
            return n.ToString(System.Globalization.CultureInfo.InvariantCulture);
        }

        internal static string Escape(string s)
        {
            var sb = new StringBuilder(s.Length + 8);
            foreach (char c in s)
            {
                switch (c)
                {
                    case '\\': sb.Append("\\\\"); break;
                    case '"': sb.Append("\\\""); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < ' ') sb.Append("\\u").Append(((int)c).ToString("x4"));
                        else sb.Append(c);
                        break;
                }
            }
            return sb.ToString();
        }
    }
}
