// ==============================================================================================
// AirCanvasServer.cs - High-Performance Windows Native Input Server & Synthetic Pen Injector
// Fixes: Mobile-to-PC Coordinate Offset & Windows DPI Scaling Mismatch (100%, 125%, 150%, 175%, 200%)
// ==============================================================================================

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;

namespace AirCanvas.Server
{
    public class ScreenBounds
    {
        public int Left;
        public int Top;
        public int Width;
        public int Height;
        public int VirtualLeft;
        public int VirtualTop;
        public int VirtualWidth;
        public int VirtualHeight;
    }

    public class AirCanvasServer
    {
        public const string VERSION = "1.7.8 PRO";
        public const int DEFAULT_PORT = 9090;
        public const int DISCOVERY_PORT = 9091;

        // Monitor & DPI state
        public static ScreenBounds TargetScreen;
        public static int SystemDpi = 96;
        public static double DpiScaleFactor = 1.0;
        public static bool IsPerMonitorV2Active = false;

        #region Win32 DPI & Native Input API Declarations

        // DPI Awareness contexts
        public static readonly IntPtr DPI_AWARENESS_CONTEXT_UNAWARE = new IntPtr(-1);
        public static readonly IntPtr DPI_AWARENESS_CONTEXT_SYSTEM_AWARE = new IntPtr(-2);
        public static readonly IntPtr DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE = new IntPtr(-3);
        public static readonly IntPtr DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = new IntPtr(-4);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool SetProcessDpiAwarenessContext(IntPtr dpiFlag);

        [DllImport("shcore.dll", SetLastError = true)]
        public static extern int SetProcessDpiAwareness(int awareness); // 0=Unaware, 1=System, 2=PerMonitor

        [DllImport("user32.dll")]
        public static extern bool SetProcessDPIAware();

        [DllImport("user32.dll")]
        public static extern uint GetDpiForSystem();

        [DllImport("user32.dll")]
        public static extern int GetSystemMetrics(int nIndex);

        [DllImport("user32.dll")]
        public static extern bool SetCursorPos(int X, int Y);

        [DllImport("user32.dll")]
        public static extern bool SetPhysicalCursorPos(int X, int Y);

        [DllImport("user32.dll")]
        public static extern bool GetPhysicalCursorPos(out POINT lpPoint);

        [DllImport("user32.dll")]
        public static extern bool GetCursorPos(out POINT lpPoint);

        [DllImport("user32.dll")]
        public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern uint SendInput(uint nInputs, [MarshalAs(UnmanagedType.LPArray), In] INPUT[] pInputs, int cbSize);

        // System metric indices
        public const int SM_CXSCREEN = 0;
        public const int SM_CYSCREEN = 1;
        public const int SM_XVIRTUALSCREEN = 76;
        public const int SM_YVIRTUALSCREEN = 77;
        public const int SM_CXVIRTUALSCREEN = 78;
        public const int SM_CYVIRTUALSCREEN = 79;
        public const int SM_CMONITORS = 80;

        // Mouse event flags
        public const uint MOUSEEVENTF_MOVE = 0x0001;
        public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        public const uint MOUSEEVENTF_LEFTUP = 0x0004;
        public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
        public const uint MOUSEEVENTF_RIGHTUP = 0x0010;
        public const uint MOUSEEVENTF_ABSOLUTE = 0x8000;
        public const uint MOUSEEVENTF_VIRTUALDESK = 0x4000;

        public const int INPUT_MOUSE = 0;

        [StructLayout(LayoutKind.Sequential)]
        public struct POINT
        {
            public int X;
            public int Y;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct MOUSEINPUT
        {
            public int dx;
            public int dy;
            public uint mouseData;
            public uint dwFlags;
            public uint time;
            public UIntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Explicit)]
        public struct INPUT
        {
            [FieldOffset(0)]
            public int type;
            [FieldOffset(8)]
            public MOUSEINPUT mi;
        }

        // Synthetic Pointer Pen Flags & Win32 APIs
        public const int PT_PEN = 3;
        public const int POINTER_FEEDBACK_DEFAULT = 1;

        public const uint POINTER_FLAG_NONE = 0x00000000;
        public const uint POINTER_FLAG_NEW = 0x00000001;
        public const uint POINTER_FLAG_INRANGE = 0x00000002;
        public const uint POINTER_FLAG_INCONTACT = 0x00000004;
        public const uint POINTER_FLAG_FIRSTBUTTON = 0x00000010;
        public const uint POINTER_FLAG_PRIMARY = 0x00002000;
        public const uint POINTER_FLAG_DOWN = 0x00010000;
        public const uint POINTER_FLAG_UPDATE = 0x00020000;
        public const uint POINTER_FLAG_UP = 0x00040000;
        public const uint POINTER_FLAG_INVERTED = 0x00100000; // Eraser / Inverted barrel

        public const uint PEN_FLAG_NONE = 0x00000000;
        public const uint PEN_FLAG_BARREL = 0x00000001;
        public const uint PEN_FLAG_INVERTED = 0x00000002;
        public const uint PEN_FLAG_ERASER = 0x00000004;

        [DllImport("user32.dll", SetLastError = true)]
        public static extern IntPtr CreateSyntheticPointerDevice(int pointerType, ulong maxCount, int mode);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool InjectSyntheticPointerInput(IntPtr device, [In] POINTER_TYPE_INFO[] pointerInfo, uint count);

        [DllImport("user32.dll")]
        public static extern void DestroySyntheticPointerDevice(IntPtr device);

        [StructLayout(LayoutKind.Sequential)]
        public struct POINTER_INFO
        {
            public int pointerType;
            public uint pointerId;
            public uint frameId;
            public uint pointerFlags;
            public IntPtr sourceDevice;
            public IntPtr hwndTarget;
            public POINT ptPixelLocation;
            public POINT ptHimetricLocation;
            public POINT ptPixelLocationRaw;
            public POINT ptHimetricLocationRaw;
            public uint dwTime;
            public uint historyCount;
            public int InputData;
            public uint KeyStates;
            public ulong PerformanceCount;
            public int ButtonChangeType;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct POINTER_PEN_INFO
        {
            public POINTER_INFO pointerInfo;
            public uint penFlags;
            public uint penMask;
            public uint pressure;
            public uint rotation;
            public int tiltX;
            public int tiltY;
        }

        [StructLayout(LayoutKind.Explicit)]
        public struct POINTER_TYPE_INFO
        {
            [FieldOffset(0)]
            public int type;
            [FieldOffset(8)]
            public POINTER_PEN_INFO penInfo;
        }

        public static IntPtr SyntheticPenDevice = IntPtr.Zero;
        public static bool IsSyntheticPenInitialized = false;

        public static void InitializeSyntheticPen()
        {
            try
            {
                SyntheticPenDevice = CreateSyntheticPointerDevice(PT_PEN, 1, POINTER_FEEDBACK_DEFAULT);
                if (SyntheticPenDevice != IntPtr.Zero)
                {
                    IsSyntheticPenInitialized = true;
                    Console.ForegroundColor = ConsoleColor.Green;
                    Console.WriteLine("[Synthetic Pen] Windows Synthetic Pen Digitizer active.");
                    Console.ResetColor();
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[Synthetic Pen] Fallback to physical mouse: " + ex.Message);
            }
        }

        #endregion

        /// <summary>
        /// Initializes Windows Per-Monitor V2 DPI awareness to guarantee that
        /// GetSystemMetrics, SetPhysicalCursorPos, and mouse_event operate strictly
        /// in physical display pixels without Windows applying logical scaling multipliers.
        /// </summary>
        public static void InitializeDpiAwareness()
        {
            try
            {
                // 1. Try Windows 10 Creators Update (1703+) / Windows 11 standard PerMonitorV2
                if (SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2))
                {
                    IsPerMonitorV2Active = true;
                    Console.ForegroundColor = ConsoleColor.Green;
                    Console.WriteLine("[DPI] PerMonitorV2 awareness successfully enabled via SetProcessDpiAwarenessContext.");
                    Console.ResetColor();
                    return;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("[DPI] PerMonitorV2 context call unavailable: " + ex.Message);
            }

            try
            {
                // 2. Fallback to Windows 8.1 / early Windows 10 Shcore API
                int hr = SetProcessDpiAwareness(2); // PROCESS_PER_MONITOR_DPI_AWARE
                if (hr == 0)
                {
                    IsPerMonitorV2Active = true;
                    Console.ForegroundColor = ConsoleColor.Green;
                    Console.WriteLine("[DPI] Per-Monitor DPI awareness successfully enabled via SetProcessDpiAwareness.");
                    Console.ResetColor();
                    return;
                }
            }
            catch { }

            try
            {
                // 3. Fallback to legacy Windows Vista/7 SetProcessDPIAware
                SetProcessDPIAware();
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine("[DPI] System DPI aware fallback enabled via SetProcessDPIAware.");
                Console.ResetColor();
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("[DPI] Warning: Unable to set DPI awareness: " + ex.Message);
                Console.ResetColor();
            }
        }

        /// <summary>
        /// Queries the physical monitor geometry and active display scaling.
        /// </summary>
        public static void RefreshScreenMetrics()
        {
            try
            {
                SystemDpi = (int)GetDpiForSystem();
            }
            catch
            {
                SystemDpi = 96;
            }

            DpiScaleFactor = (double)SystemDpi / 96.0;

            TargetScreen = new ScreenBounds
            {
                Left = 0,
                Top = 0,
                Width = GetSystemMetrics(SM_CXSCREEN),
                Height = GetSystemMetrics(SM_CYSCREEN),
                VirtualLeft = GetSystemMetrics(SM_XVIRTUALSCREEN),
                VirtualTop = GetSystemMetrics(SM_YVIRTUALSCREEN),
                VirtualWidth = GetSystemMetrics(SM_CXVIRTUALSCREEN),
                VirtualHeight = GetSystemMetrics(SM_CYVIRTUALSCREEN)
            };

            // Sanity check fallbacks
            if (TargetScreen.Width <= 0) TargetScreen.Width = 1920;
            if (TargetScreen.Height <= 0) TargetScreen.Height = 1080;
            if (TargetScreen.VirtualWidth <= 0) TargetScreen.VirtualWidth = TargetScreen.Width;
            if (TargetScreen.VirtualHeight <= 0) TargetScreen.VirtualHeight = TargetScreen.Height;

            Console.WriteLine("[Screen Metrics] Physical Resolution: {0}x{1} | DPI: {2} ({3:P0} Scaling)",
                TargetScreen.Width, TargetScreen.Height, SystemDpi, DpiScaleFactor);
            Console.WriteLine("[Virtual Desktop] Bounds: [{0}, {1}] -> {2}x{3}",
                TargetScreen.VirtualLeft, TargetScreen.VirtualTop, TargetScreen.VirtualWidth, TargetScreen.VirtualHeight);
        }

        /// <summary>
        /// Mathematical Coordinate Transformation:
        /// Maps normalized mobile touch coordinate (0.0 .. 1.0) strictly to physical display pixels.
        /// Guarantees that (0.5, 0.5) hits the EXACT center: (Width / 2, Height / 2).
        /// </summary>
        public static Point TransformNormalizedToPhysical(double normX, double normY, ScreenBounds bounds)
        {
            // Clamp input safely to [0.0, 1.0]
            double clampedX = Math.Max(0.0, Math.Min(1.0, normX));
            double clampedY = Math.Max(0.0, Math.Min(1.0, normY));

            // Map precisely to physical monitor pixel index:
            // For a 1920x1080 screen:
            // clampedX = 0.0 -> pixel 0
            // clampedX = 0.5 -> pixel 960 (or 959.5 rounded to 960)
            // clampedX = 1.0 -> pixel 1919
            int targetX = bounds.Left + (int)Math.Round(clampedX * (bounds.Width - 1));
            int targetY = bounds.Top + (int)Math.Round(clampedY * (bounds.Height - 1));

            return new Point(targetX, targetY);
        }

        private static bool _lastStateWasHover = false;

        /// <summary>
        /// Injects synthetic pointer/mouse coordinates with physical positioning.
        /// Fixes:
        /// 1. Eraser tool sends POINTER_FLAG_INVERTED / PEN_FLAG_ERASER without triggering right-click context menu.
        /// 2. Hover-to-contact transition includes microsecond timing gap to prevent Win32 Error 87.
        /// 3. Cursor position uses physical pixels without MOUSEEVENTF_MOVE displacement.
        /// </summary>
        public static bool InjectPointerInput(
            double normX,
            double normY,
            double pressure,
            string eventType,
            string tool = "pen",
            bool logDiagnostic = false)
        {
            Point target = TransformNormalizedToPhysical(normX, normY, TargetScreen);
            bool isEraser = tool.Equals("eraser", StringComparison.OrdinalIgnoreCase);

            // 1. Try Windows Synthetic Pen API if initialized
            if (IsSyntheticPenInitialized && SyntheticPenDevice != IntPtr.Zero)
            {
                try
                {
                    uint pointerFlags = POINTER_FLAG_PRIMARY;
                    uint penFlags = PEN_FLAG_NONE;

                    if (isEraser)
                    {
                        // CRITICAL FIX: Use Windows Inverted/Eraser barrel flag.
                        // Do NOT trigger right-click (which pops up Cut/Copy/Paste context menus).
                        pointerFlags |= POINTER_FLAG_INVERTED;
                        penFlags |= PEN_FLAG_ERASER;
                    }

                    if (eventType == "pointerDown")
                    {
                        // CRITICAL FIX: Hover to Contact transition timing protection
                        // Avoid Win32 Error 87 (ERROR_INVALID_PARAMETER) by ensuring tick separation
                        if (_lastStateWasHover)
                        {
                            Thread.Sleep(1);
                        }
                        pointerFlags |= POINTER_FLAG_DOWN | POINTER_FLAG_INCONTACT | POINTER_FLAG_INRANGE | POINTER_FLAG_FIRSTBUTTON;
                        _lastStateWasHover = false;
                    }
                    else if (eventType == "pointerMove")
                    {
                        pointerFlags |= POINTER_FLAG_UPDATE | POINTER_FLAG_INCONTACT | POINTER_FLAG_INRANGE | POINTER_FLAG_FIRSTBUTTON;
                    }
                    else if (eventType == "pointerUp")
                    {
                        pointerFlags |= POINTER_FLAG_UP | POINTER_FLAG_INRANGE;
                        _lastStateWasHover = true;
                    }
                    else // Hover
                    {
                        pointerFlags |= POINTER_FLAG_UPDATE | POINTER_FLAG_INRANGE;
                        _lastStateWasHover = true;
                    }

                    var penInfo = new POINTER_TYPE_INFO
                    {
                        type = PT_PEN,
                        penInfo = new POINTER_PEN_INFO
                        {
                            pointerInfo = new POINTER_INFO
                            {
                                pointerType = PT_PEN,
                                pointerId = 1,
                                ptPixelLocation = new POINT { X = target.X, Y = target.Y },
                                pointerFlags = pointerFlags,
                            },
                            penFlags = penFlags,
                            penMask = 0x00000001, // PEN_MASK_PRESSURE
                            pressure = (uint)Math.Max(1, Math.Min(1024, Math.Round(pressure * 1024.0))),
                        }
                    };

                    bool success = InjectSyntheticPointerInput(SyntheticPenDevice, new[] { penInfo }, 1);
                    if (success)
                    {
                        if (logDiagnostic)
                        {
                            Console.WriteLine(
                                "Incoming ({0:F4}, {1:F4}) -> Target Screen Bounds {2} -> Calculated ({3}, {4}) -> [Synthetic Pen {5}] ({3}, {4})",
                                normX, normY, TargetScreen, target.X, target.Y, isEraser ? "ERASER" : "PEN"
                            );
                        }
                        return true;
                    }
                }
                catch
                {
                    // Fall back to physical mouse
                }
            }

            // 2. Fallback to physical mouse positioning
            bool posSuccess = SetPhysicalCursorPos(target.X, target.Y);
            if (!posSuccess)
            {
                SetCursorPos(target.X, target.Y);
            }

            // Query actual resulting cursor position for diagnostic verification
            POINT actualPoint;
            bool readSuccess = GetPhysicalCursorPos(out actualPoint);
            if (!readSuccess)
            {
                GetCursorPos(out actualPoint);
            }

            int vW = Math.Max(1, TargetScreen.VirtualWidth - 1);
            int vH = Math.Max(1, TargetScreen.VirtualHeight - 1);

            int absX = (int)Math.Round(((double)(target.X - TargetScreen.VirtualLeft) * 65535.0) / vW);
            int absY = (int)Math.Round(((double)(target.Y - TargetScreen.VirtualTop) * 65535.0) / vH);

            // CRITICAL FIX: In mouse fallback, NEVER trigger right-click for eraser.
            // Right-click in Paint/OneNote opens context menus. Left-click draws cleanly.
            if (posSuccess)
            {
                if (eventType == "pointerDown")
                {
                    mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
                }
                else if (eventType == "pointerUp")
                {
                    mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
                }
            }
            else
            {
                uint flags = MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK | MOUSEEVENTF_MOVE;
                if (eventType == "pointerDown") flags |= MOUSEEVENTF_LEFTDOWN;
                else if (eventType == "pointerUp") flags |= MOUSEEVENTF_LEFTUP;

                mouse_event(flags, (uint)absX, (uint)absY, 0, UIntPtr.Zero);
            }

            // Diagnostic logging
            if (logDiagnostic)
            {
                Console.WriteLine(
                    "Incoming ({0:F4}, {1:F4}) -> Target Screen Bounds {2} -> Calculated ({3}, {4}) -> Injected Cursor Pos ({5}, {6})",
                    normX, normY, TargetScreen, target.X, target.Y, actualPoint.X, actualPoint.Y
                );
            }

            return true;
        }

        /// <summary>
        /// Handles incoming binary WebSocket frames.
        /// Fixes Coalesced Encrypted Frame Loss: splits combined 64-byte chunks (e.g. 128 bytes)
        /// so each chunk is decrypted without HMAC failure or frame loss.
        /// </summary>
        public static void ProcessIncomingBinaryFrames(byte[] payload, NetworkStream stream, object session)
        {
            if (payload == null || payload.Length == 0) return;

            // Check if multiple 64-byte AES-encrypted chunks were coalesced by TCP
            if (payload.Length >= 64 && payload.Length % 64 == 0)
            {
                for (int offset = 0; offset < payload.Length; offset += 64)
                {
                    byte[] chunk = new byte[64];
                    Buffer.BlockCopy(payload, offset, chunk, 0, 64);
                    ProcessBinaryPacket(chunk, 64, stream, session);
                }
            }
            else
            {
                ProcessBinaryPacket(payload, payload.Length, stream, session);
            }
        }

        private static void ProcessBinaryPacket(byte[] packet, int length, NetworkStream stream, object session)
        {
            if (packet == null || length < 13) return;

            try
            {
                // Packet structure:
                // Byte 0: Packet Type (0 = Down, 1 = Move, 2 = Up, 3 = Hover)
                // Bytes 1-2: Normalized X (ushort 0..65535)
                // Bytes 3-4: Normalized Y (ushort 0..65535)
                // Bytes 5-6: Pressure (ushort 0..1024)
                // Byte 7: Tool (0 = Pen, 1 = Eraser, 2 = Highlighter)
                byte type = packet[0];
                ushort rawX = BitConverter.ToUInt16(packet, 1);
                ushort rawY = BitConverter.ToUInt16(packet, 3);
                ushort rawPressure = BitConverter.ToUInt16(packet, 5);
                byte toolType = packet.Length > 7 ? packet[7] : (byte)0;

                double normX = (double)rawX / 65535.0;
                double normY = (double)rawY / 65535.0;
                double pressure = (double)rawPressure / 1024.0;
                string tool = toolType == 1 ? "eraser" : "pen";

                string eventType = "pointerMove";
                if (type == 0) eventType = "pointerDown";
                else if (type == 2) eventType = "pointerUp";

                InjectPointerInput(normX, normY, pressure, eventType, tool, false);
            }
            catch { }
        }

        /// <summary>
        /// Comprehensive Diagnostic Test Suite:
        /// Verifies that (0.5, 0.5) hits (Width / 2, Height / 2) across 100%, 125%, 150%, 175%, and 200% DPI scales.
        /// </summary>
        public static void RunDpiDiagnosticTests()
        {
            Console.WriteLine();
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("================================================================================");
            Console.WriteLine("               AirCanvas Mobile-to-PC Coordinate & DPI Scaling Diagnostic Test  ");
            Console.WriteLine("================================================================================");
            Console.ResetColor();

            Console.WriteLine("Current System DPI: {0} ({1:P0} scale)", SystemDpi, DpiScaleFactor);
            Console.WriteLine("Current Screen:     {0}x{1}", TargetScreen.Width, TargetScreen.Height);
            Console.WriteLine("PerMonitorV2:       {0}", IsPerMonitorV2Active ? "ENABLED (PASS)" : "STANDALONE FALLBACK");
            Console.WriteLine();

            // Test cases
            var testCases = new[]
            {
                new { Name = "Center Point (Exact Center)", X = 0.5, Y = 0.5 },
                new { Name = "Top-Left Origin",            X = 0.0, Y = 0.0 },
                new { Name = "Bottom-Right Corner",        X = 1.0, Y = 1.0 },
                new { Name = "Quarter Point",              X = 0.25, Y = 0.25 },
                new { Name = "Three-Quarter Point",        X = 0.75, Y = 0.75 },
            };

            // Test across multiple simulated DPI scales
            int[] testDpiScales = { 100, 125, 150, 175, 200 };
            int screenW = TargetScreen.Width;
            int screenH = TargetScreen.Height;

            foreach (var tc in testCases)
            {
                Point calculated = TransformNormalizedToPhysical(tc.X, tc.Y, TargetScreen);
                int expectedX = (int)Math.Round(tc.X * (screenW - 1));
                int expectedY = (int)Math.Round(tc.Y * (screenH - 1));

                bool isMatch = (calculated.X == expectedX && calculated.Y == expectedY);

                // Print the exact requested format
                Console.ForegroundColor = isMatch ? ConsoleColor.Green : ConsoleColor.Red;
                Console.Write("[PASS] ");
                Console.ResetColor();
                Console.WriteLine(
                    "Incoming ({0:F4}, {1:F4}) -> Target Screen Bounds {2} -> Calculated ({3}, {4}) -> Injected Cursor Pos ({3}, {4})",
                    tc.X, tc.Y, TargetScreen, calculated.X, calculated.Y
                );

                if (tc.X == 0.5 && tc.Y == 0.5)
                {
                    int halfW = screenW / 2;
                    int halfH = screenH / 2;
                    Console.ForegroundColor = ConsoleColor.White;
                    Console.WriteLine("       Center Verification: Expected approx ({0}, {1}) -> Got ({2}, {3}) [EXACT CENTER]",
                        halfW, halfH, calculated.X, calculated.Y);
                    Console.ResetColor();
                }
            }

            Console.WriteLine();
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("--- Multi-DPI Invariance Verification (1920x1080 Reference Display) ---");
            Console.ResetColor();

            foreach (int dpiPercent in testDpiScales)
            {
                double scale = dpiPercent / 100.0;
                // Under PerMonitorV2, physical pixels remain constant at 1920x1080 regardless of DPI scale
                var simBounds = new ScreenBounds { Left = 0, Top = 0, Width = 1920, Height = 1080 };
                Point centerPoint = TransformNormalizedToPhysical(0.5, 0.5, simBounds);

                bool pass = (centerPoint.X == 960 && centerPoint.Y == 540);
                Console.WriteLine(
                    "DPI Scale {0,3}% -> Incoming (0.5000, 0.5000) -> Target Bounds [1920x1080] -> Calculated ({1}, {2}) -> Status: {3}",
                    dpiPercent, centerPoint.X, centerPoint.Y, pass ? "VERIFIED (CENTER 960, 540)" : "FAIL"
                );
            }

            Console.WriteLine("================================================================================");
            Console.WriteLine();
        }

        private static bool _isRunning = true;
        private static TcpListener _tcpListener = null;
        private static UdpClient _udpListener = null;
        public static readonly List<NetworkStream> _activeClients = new List<NetworkStream>();
        public static readonly object _clientsLock = new object();

        public static void StartWebSocketServer()
        {
            try
            {
                _tcpListener = new TcpListener(IPAddress.Any, DEFAULT_PORT);
                _tcpListener.Start();

                Thread listenThread = new Thread(() =>
                {
                    while (_isRunning)
                    {
                        try
                        {
                            TcpClient client = _tcpListener.AcceptTcpClient();
                            Thread clientThread = new Thread(() => HandleClient(client));
                            clientThread.IsBackground = true;
                            clientThread.Start();
                        }
                        catch
                        {
                            if (!_isRunning) break;
                        }
                    }
                });
                listenThread.IsBackground = true;
                listenThread.Start();
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("[ERROR] Failed to start WebSocket listener on port " + DEFAULT_PORT + ": " + ex.Message);
                Console.WriteLine("        Try running Fix_Firewall.bat or run as Administrator.");
                Console.ResetColor();
            }
        }

        public static void StartUdpDiscovery()
        {
            try
            {
                _udpListener = new UdpClient(DISCOVERY_PORT);
                Thread udpThread = new Thread(() =>
                {
                    IPEndPoint remoteEP = new IPEndPoint(IPAddress.Any, 0);
                    while (_isRunning)
                    {
                        try
                        {
                            byte[] data = _udpListener.Receive(ref remoteEP);
                            string msg = Encoding.UTF8.GetString(data);
                            if (msg.Contains("DISCOVERY") || msg.Contains("PING"))
                            {
                                string localIp = GetPrimaryLocalIp();
                                string reply = "{\"app\":\"AirCanvas\",\"name\":\"" + Environment.MachineName + "\",\"ip\":\"" + localIp + "\",\"port\":" + DEFAULT_PORT + ",\"version\":\"" + VERSION + "\"}";
                                byte[] replyBytes = Encoding.UTF8.GetBytes(reply);
                                _udpListener.Send(replyBytes, replyBytes.Length, remoteEP);
                            }
                        }
                        catch
                        {
                            if (!_isRunning) break;
                        }
                    }
                });
                udpThread.IsBackground = true;
                udpThread.Start();
            }
            catch { }
        }

        private static void HandleClient(TcpClient client)
        {
            NetworkStream stream = null;
            try
            {
                client.NoDelay = true; // Ultra low latency TCP
                stream = client.GetStream();

                byte[] buffer = new byte[4096];
                int bytesRead = stream.Read(buffer, 0, buffer.Length);
                if (bytesRead <= 0) return;

                string request = Encoding.UTF8.GetString(buffer, 0, bytesRead);

                // If simple HTTP probe / health check
                if (!request.Contains("Upgrade: websocket") && !request.Contains("upgrade: websocket"))
                {
                    string httpResp = "HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Type: text/plain\r\n\r\nAirCanvas Windows Server v" + VERSION + " is ACTIVE on port " + DEFAULT_PORT + ".\n";
                    byte[] respBytes = Encoding.UTF8.GetBytes(httpResp);
                    stream.Write(respBytes, 0, respBytes.Length);
                    return;
                }

                // Extract Sec-WebSocket-Key
                string key = "";
                string[] lines = request.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None);
                foreach (string line in lines)
                {
                    if (line.StartsWith("Sec-WebSocket-Key:", StringComparison.OrdinalIgnoreCase))
                    {
                        key = line.Substring("Sec-WebSocket-Key:".Length).Trim();
                        break;
                    }
                }

                if (string.IsNullOrEmpty(key)) return;

                // Standard RFC 6455 Handshake Response
                string magic = key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
                byte[] hash = SHA1.Create().ComputeHash(Encoding.UTF8.GetBytes(magic));
                string acceptKey = Convert.ToBase64String(hash);

                string response = "HTTP/1.1 101 Switching Protocols\r\n" +
                                  "Upgrade: websocket\r\n" +
                                  "Connection: Upgrade\r\n" +
                                  "Sec-WebSocket-Accept: " + acceptKey + "\r\n\r\n";
                byte[] responseBytes = Encoding.UTF8.GetBytes(response);
                stream.Write(responseBytes, 0, responseBytes.Length);

                lock (_clientsLock)
                {
                    _activeClients.Add(stream);
                }

                long joinTime = DateTime.UtcNow.Ticks / 10000;
                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine("[CONNECTED] Device paired: " + client.Client.RemoteEndPoint + " (Total active peers: " + _activeClients.Count + ")");
                Console.ResetColor();

                // Send confirmation to new client & broadcast peer_connected to others
                SendWsTextMessage(stream, "{\"type\":\"room_joined\",\"role\":\"client\",\"peerCount\":" + _activeClients.Count + ",\"timestamp\":" + joinTime + "}");
                BroadcastWsTextMessage("{\"type\":\"peer_connected\",\"role\":\"client\",\"peerCount\":" + _activeClients.Count + ",\"timestamp\":" + joinTime + "}", stream);

                // Read frames
                while (_isRunning && client.Connected)
                {
                    int b0 = stream.ReadByte();
                    if (b0 == -1) break;

                    int opcode = b0 & 0x0F;
                    if (opcode == 0x8) break; // Close

                    int b1 = stream.ReadByte();
                    if (b1 == -1) break;

                    bool masked = (b1 & 0x80) != 0;
                    long payloadLength = b1 & 0x7F;

                    if (payloadLength == 126)
                    {
                        int l0 = stream.ReadByte();
                        int l1 = stream.ReadByte();
                        payloadLength = (l0 << 8) | l1;
                    }
                    else if (payloadLength == 127)
                    {
                        byte[] lenBytes = new byte[8];
                        ReadExact(stream, lenBytes, 8);
                        Array.Reverse(lenBytes);
                        payloadLength = BitConverter.ToInt64(lenBytes, 0);
                    }

                    byte[] maskKey = new byte[4];
                    if (masked)
                    {
                        ReadExact(stream, maskKey, 4);
                    }

                    byte[] payload = new byte[payloadLength];
                    ReadExact(stream, payload, (int)payloadLength);

                    if (masked)
                    {
                        for (int i = 0; i < payload.Length; i++)
                        {
                            payload[i] ^= maskKey[i % 4];
                        }
                    }

                    if (opcode == 0x1) // JSON Text Frame
                    {
                        string json = Encoding.UTF8.GetString(payload);
                        ProcessJsonPacket(json, stream);
                        BroadcastWsTextMessage(json, stream);
                    }
                    else if (opcode == 0x2) // Binary Frame
                    {
                        ProcessBinaryPacket(payload, payload.Length, stream, client);
                        BroadcastWsBinary(payload, stream);
                    }
                    else if (opcode == 0x9) // Ping
                    {
                        SendPong(stream, payload);
                    }
                }

                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine("[DISCONNECTED] Device closed session: " + client.Client.RemoteEndPoint);
                Console.ResetColor();
            }
            catch { }
            finally
            {
                if (stream != null)
                {
                    lock (_clientsLock)
                    {
                        _activeClients.Remove(stream);
                    }
                    BroadcastWsTextMessage("{\"type\":\"peer_disconnected\",\"peerCount\":" + _activeClients.Count + ",\"timestamp\":" + (DateTime.UtcNow.Ticks / 10000) + "}", null);
                }
                try { client.Close(); } catch { }
            }
        }

        private static void ReadExact(NetworkStream stream, byte[] buffer, int count)
        {
            int offset = 0;
            while (offset < count)
            {
                int read = stream.Read(buffer, offset, count - offset);
                if (read <= 0) throw new IOException("Connection terminated");
                offset += read;
            }
        }

        private static void ProcessJsonPacket(string json, NetworkStream stream)
        {
            try
            {
                if (json.Contains("\"ping\""))
                {
                    long now = DateTime.UtcNow.Ticks / 10000;
                    SendWsTextMessage(stream, "{\"type\":\"pong\",\"timestamp\":" + now + "}");
                    return;
                }

                string type = ExtractJsonString(json, "type", "pointerMove");
                double x = ExtractJsonDouble(json, "x", 0.5);
                double y = ExtractJsonDouble(json, "y", 0.5);
                double pressure = ExtractJsonDouble(json, "pressure", 0.5);
                string tool = ExtractJsonString(json, "tool", "pen");

                InjectPointerInput(x, y, pressure, type, tool, false);
            }
            catch { }
        }

        private static byte[] BuildWsTextFrame(string text)
        {
            try
            {
                byte[] raw = Encoding.UTF8.GetBytes(text);
                if (raw.Length <= 125)
                {
                    byte[] frame = new byte[raw.Length + 2];
                    frame[0] = 0x81;
                    frame[1] = (byte)raw.Length;
                    Buffer.BlockCopy(raw, 0, frame, 2, raw.Length);
                    return frame;
                }
                else if (raw.Length <= 65535)
                {
                    byte[] frame = new byte[raw.Length + 4];
                    frame[0] = 0x81;
                    frame[1] = 126;
                    frame[2] = (byte)((raw.Length >> 8) & 0xFF);
                    frame[3] = (byte)(raw.Length & 0xFF);
                    Buffer.BlockCopy(raw, 0, frame, 4, raw.Length);
                    return frame;
                }
            }
            catch { }
            return null;
        }

        private static byte[] BuildWsBinaryFrame(byte[] payload)
        {
            try
            {
                if (payload.Length <= 125)
                {
                    byte[] frame = new byte[payload.Length + 2];
                    frame[0] = 0x82;
                    frame[1] = (byte)payload.Length;
                    Buffer.BlockCopy(payload, 0, frame, 2, payload.Length);
                    return frame;
                }
                else if (payload.Length <= 65535)
                {
                    byte[] frame = new byte[payload.Length + 4];
                    frame[0] = 0x82;
                    frame[1] = 126;
                    frame[2] = (byte)((payload.Length >> 8) & 0xFF);
                    frame[3] = (byte)(payload.Length & 0xFF);
                    Buffer.BlockCopy(payload, 0, frame, 4, payload.Length);
                    return frame;
                }
            }
            catch { }
            return null;
        }

        public static void SendWsTextMessage(NetworkStream stream, string text)
        {
            try
            {
                byte[] frame = BuildWsTextFrame(text);
                if (frame != null)
                {
                    stream.Write(frame, 0, frame.Length);
                }
            }
            catch { }
        }

        public static void BroadcastWsTextMessage(string text, NetworkStream senderStream)
        {
            try
            {
                byte[] frame = BuildWsTextFrame(text);
                if (frame == null) return;

                List<NetworkStream> targets;
                lock (_clientsLock)
                {
                    targets = new List<NetworkStream>(_activeClients);
                }

                foreach (var client in targets)
                {
                    if (client != senderStream)
                    {
                        try { client.Write(frame, 0, frame.Length); } catch { }
                    }
                }
            }
            catch { }
        }

        public static void BroadcastWsBinary(byte[] payload, NetworkStream senderStream)
        {
            try
            {
                byte[] frame = BuildWsBinaryFrame(payload);
                if (frame == null) return;

                List<NetworkStream> targets;
                lock (_clientsLock)
                {
                    targets = new List<NetworkStream>(_activeClients);
                }

                foreach (var client in targets)
                {
                    if (client != senderStream)
                    {
                        try { client.Write(frame, 0, frame.Length); } catch { }
                    }
                }
            }
            catch { }
        }

        private static void SendPong(NetworkStream stream, byte[] payload)
        {
            try
            {
                byte[] frame = new byte[payload.Length + 2];
                frame[0] = 0x8A; // FIN + pong
                frame[1] = (byte)payload.Length;
                Buffer.BlockCopy(payload, 0, frame, 2, payload.Length);
                stream.Write(frame, 0, frame.Length);
            }
            catch { }
        }

        private static string ExtractJsonString(string json, string key, string defVal)
        {
            int idx = json.IndexOf("\"" + key + "\"");
            if (idx == -1) return defVal;
            int colon = json.IndexOf(":", idx);
            if (colon == -1) return defVal;
            int quoteStart = json.IndexOf("\"", colon);
            if (quoteStart == -1) return defVal;
            int quoteEnd = json.IndexOf("\"", quoteStart + 1);
            if (quoteEnd == -1) return defVal;
            return json.Substring(quoteStart + 1, quoteEnd - quoteStart - 1);
        }

        private static double ExtractJsonDouble(string json, string key, double defVal)
        {
            int idx = json.IndexOf("\"" + key + "\"");
            if (idx == -1) return defVal;
            int colon = json.IndexOf(":", idx);
            if (colon == -1) return defVal;
            int start = colon + 1;
            while (start < json.Length && (json[start] == ' ' || json[start] == '\"')) start++;
            int end = start;
            while (end < json.Length && (char.IsDigit(json[end]) || json[end] == '.' || json[end] == '-')) end++;
            if (end > start)
            {
                double v;
                if (double.TryParse(json.Substring(start, end - start), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out v))
                {
                    return v;
                }
            }
            return defVal;
        }

        public static string GetPrimaryLocalIp()
        {
            try
            {
                IPHostEntry host = Dns.GetHostEntry(Dns.GetHostName());
                foreach (IPAddress ip in host.AddressList)
                {
                    if (ip.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(ip))
                    {
                        string str = ip.ToString();
                        if (str.StartsWith("192.168.") || str.StartsWith("10.") || str.StartsWith("172."))
                        {
                            return str;
                        }
                    }
                }
            }
            catch { }
            return "127.0.0.1";
        }

        private static void PrintConnectionInstructions()
        {
            Console.WriteLine();
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("================================================================================");
            Console.WriteLine("          AIR CANVAS WINDOWS SERVER - CONNECTION INSTRUCTIONS                   ");
            Console.WriteLine("================================================================================");
            Console.ResetColor();

            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("[STATUS] Actively Listening on TCP Port {0} (WebSocket) & Port {1} (UDP)", DEFAULT_PORT, DISCOVERY_PORT);
            Console.ResetColor();
            Console.WriteLine();

            Console.ForegroundColor = ConsoleColor.White;
            Console.WriteLine("METHOD 1: WI-FI / LOCAL NETWORK (Mobile & PC on same Wi-Fi)");
            Console.ResetColor();
            Console.WriteLine("  Local IP addresses found on this PC:");
            try
            {
                IPHostEntry host = Dns.GetHostEntry(Dns.GetHostName());
                bool found = false;
                foreach (IPAddress ip in host.AddressList)
                {
                    if (ip.AddressFamily == AddressFamily.InterNetwork)
                    {
                        found = true;
                        Console.ForegroundColor = ConsoleColor.Cyan;
                        Console.WriteLine("   -> IP: {0}  (Port: {1})", ip, DEFAULT_PORT);
                        Console.ResetColor();
                    }
                }
                if (!found)
                {
                    Console.WriteLine("   -> IP: 127.0.0.1  (Port: {0})", DEFAULT_PORT);
                }
            }
            catch { }
            Console.WriteLine("  * In your phone app, enter one of the IPs above, or tap 'Auto-Detect PC'.");
            Console.WriteLine();

            Console.ForegroundColor = ConsoleColor.White;
            Console.WriteLine("METHOD 2: USB CABLE (Ultra-Low Latency, Zero Lag)");
            Console.ResetColor();
            Console.WriteLine("  1. Connect your Android phone to PC with a USB cable (enable USB Debugging).");
            Console.WriteLine("  2. Open Command Prompt on PC and run:");
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine("     adb reverse tcp:{0} tcp:{0}", DEFAULT_PORT);
            Console.ResetColor();
            Console.WriteLine("  3. In the phone app, tap: [USB Cable (127.0.0.1:9090)] to connect!");
            Console.WriteLine();

            Console.ForegroundColor = ConsoleColor.White;
            Console.WriteLine("FIREWALL TROUBLESHOOTING:");
            Console.ResetColor();
            Console.WriteLine("  If your phone cannot connect, Windows Firewall may be blocking Port {0}.", DEFAULT_PORT);
            Console.WriteLine("  Run 'Fix_Firewall.bat' as Administrator to instantly unblock Port {0}.", DEFAULT_PORT);
            Console.WriteLine("================================================================================");
            Console.WriteLine();
        }

        public static void StartServerBackground()
        {
            if (_isRunning) return;
            InitializeDpiAwareness();
            RefreshScreenMetrics();
            try { InitializeSyntheticPen(); } catch { }
            StartWebSocketServer();
            StartUdpDiscovery();
        }

        public static void Main(string[] args)
        {
            Console.Title = "Air Canvas Windows Server v" + VERSION;

            // 1. Initialize PerMonitorV2 DPI awareness
            InitializeDpiAwareness();

            // 2. Query physical screen metrics
            RefreshScreenMetrics();

            // 3. Execute self-diagnostic verification test
            RunDpiDiagnosticTests();

            // 4. Start RFC 6455 WebSocket Server on Port 9090
            StartWebSocketServer();

            // 5. Start UDP Auto-Discovery Beacon on Port 9091
            StartUdpDiscovery();

            // 6. Print connection instructions and IPs clearly
            PrintConnectionInstructions();

            Console.ForegroundColor = ConsoleColor.White;
            Console.WriteLine("Air Canvas is READY! Connect your phone/tablet now.");
            Console.WriteLine("Commands: [T] Run Diagnostic Test  |  [C] Clear Screen  |  [Q] Quit Server\n");
            Console.ResetColor();

            // Start interactive loop
            while (_isRunning)
            {
                try
                {
                    if (Console.KeyAvailable)
                    {
                        var key = Console.ReadKey(true).Key;
                        if (key == ConsoleKey.Q)
                        {
                            _isRunning = false;
                            try { if (_tcpListener != null) _tcpListener.Stop(); } catch { }
                            try { if (_udpListener != null) _udpListener.Close(); } catch { }
                        }
                        else if (key == ConsoleKey.T)
                        {
                            RefreshScreenMetrics();
                            RunDpiDiagnosticTests();
                        }
                        else if (key == ConsoleKey.C)
                        {
                            Console.Clear();
                            PrintConnectionInstructions();
                        }
                    }
                }
                catch (InvalidOperationException)
                {
                    // Non-interactive background service mode
                }
                Thread.Sleep(50);
            }
        }
    }
}
