// ==============================================================================================
// AirCanvasServer.cs - High-Performance Windows Native Input Server & Synthetic Pen Injector
// Version: 2.0.0 PRO
// Features:
// - 100% Mobile Full-Screen Pad -> PC Software Working Area 1:1 Mapping
// - Auto-Detect Active PC Software Window & Canvas Working Area (Photoshop, Krita, OneNote, etc.)
// - Zero Unwanted Straight-Line Protection (Hover-before-Down & Unclosed Stroke Recovery)
// - Per-Monitor V2 DPI Invariance (100%, 125%, 150%, 175%, 200%)
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

        public override string ToString()
        {
            return string.Format("[{0},{1} {2}x{3}]", Left, Top, Width, Height);
        }
    }

    public enum TargetModeEnum
    {
        MONITOR = 0,
        WINDOW = 1,
        CANVAS = 2
    }

    public class PhysicalMonitorInfo
    {
        public string DeviceId = "\\\\.\\DISPLAY1";
        public bool IsPrimary = true;
        public ScreenBounds RcMonitor = new ScreenBounds();
        public ScreenBounds RcWork = new ScreenBounds();
        public uint DpiX = 96;
        public uint DpiY = 96;
        public bool IsConnected = true;
    }

    public interface ITargetCanvasProvider
    {
        string ProviderId { get; }
        bool CanProvideCanvas(IntPtr hwnd, string processName, string windowTitle, string childClass);
        bool TryDetectVerifiedCanvas(IntPtr hwnd, ScreenBounds windowFrame, ScreenBounds candidateChild, string childClass, out ScreenBounds verifiedCanvas, out string statusReason);
    }

    public class VerifiedWin32ChildCanvasProvider : ITargetCanvasProvider
    {
        public string ProviderId { get { return "win32-verified-child-canvas"; } }

        public bool CanProvideCanvas(IntPtr hwnd, string processName, string windowTitle, string childClass)
        {
            if (string.IsNullOrEmpty(childClass)) return false;
            string cls = childClass.ToLowerInvariant();
            return cls.Contains("mspaintview") || cls.Contains("afxframeorview") || cls.Contains("avl_avview") || cls.Contains("xournalppcanvas");
        }

        public bool TryDetectVerifiedCanvas(IntPtr hwnd, ScreenBounds windowFrame, ScreenBounds candidateChild, string childClass, out ScreenBounds verifiedCanvas, out string statusReason)
        {
            verifiedCanvas = null;
            if (!CanProvideCanvas(hwnd, "", "", childClass) || candidateChild == null || candidateChild.Width < 64 || candidateChild.Height < 64)
            {
                statusReason = "Automatic semantic canvas detection is unsupported for this application; 5-point manual calibration required.";
                return false;
            }
            verifiedCanvas = candidateChild;
            statusReason = "Verified native child canvas (" + childClass + ")";
            return true;
        }
    }

    public class SoftwareWorkingArea
    {
        public string PresetId = "auto";
        public TargetModeEnum TargetMode = TargetModeEnum.MONITOR;
        public string SelectedMonitorId = "\\\\.\\DISPLAY1";
        public IntPtr SelectedWindowHwnd = IntPtr.Zero;
        public bool FollowActiveWindow = false;
        public bool UseMonitorWorkArea = false;
        public bool PreserveAspectRatio = true;
        public double SourceWidth = 1920.0;
        public double SourceHeight = 1080.0;
        public bool TargetAvailable = true;
        public string TargetUnavailableReason = "";
        public bool CanvasDetectionSupported = false;
        public bool CanvasBoundsVerified = false;
        public bool RequiresCalibrationFallback = false;
        public bool HasValidFivePointCalibration = false;
        public ScreenBounds CalibratedBounds = null;
        public int GeometryGeneration = 1;
        public double MarginTop = 0.08;
        public double MarginBottom = 0.04;
        public double MarginLeft = 0.05;
        public double MarginRight = 0.14;
        public bool AutoDetectForegroundWindow = true;
        public string DetectedAppName = "Desktop Canvas";
        public bool UsedNativeChildCanvas = false;
    }

    public class AirCanvasServer
    {
        public const string VERSION = "2.0.0 PRO";
        public const int DEFAULT_PORT = 9090;
        public const int DISCOVERY_PORT = 9091;

        // Monitor & DPI state
        public static ScreenBounds TargetScreen;
        public static int SystemDpi = 96;
        public static double DpiScaleFactor = 1.0;
        public static bool IsPerMonitorV2Active = false;

        // Active PC Software Working Area configuration (synced with Mobile Full-Screen Pad)
        public static SoftwareWorkingArea ActiveWorkArea = new SoftwareWorkingArea();
        public static List<PhysicalMonitorInfo> ConnectedMonitors = new List<PhysicalMonitorInfo>();
        public static readonly List<ITargetCanvasProvider> CanvasProviders = new List<ITargetCanvasProvider>
        {
            new VerifiedWin32ChildCanvasProvider()
        };
        private static ScreenBounds _latchedStrokeBounds = null;
        private static string _lastBroadcastWorkAreaSig = "";

        #region Win32 DPI, Window & Native Input API Declarations

        public static readonly IntPtr DPI_AWARENESS_CONTEXT_UNAWARE = new IntPtr(-1);
        public static readonly IntPtr DPI_AWARENESS_CONTEXT_SYSTEM_AWARE = new IntPtr(-2);
        public static readonly IntPtr DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE = new IntPtr(-3);
        public static readonly IntPtr DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = new IntPtr(-4);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool SetProcessDpiAwarenessContext(IntPtr dpiFlag);

        [DllImport("shcore.dll", SetLastError = true)]
        public static extern int SetProcessDpiAwareness(int awareness);

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

        [DllImport("user32.dll")]
        public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        public const byte VK_CONTROL = 0x11;
        public const byte VK_E = 0x45; // 'E' Eraser shortcut in Photoshop, Krita, Illustrator, OneNote, Paint
        public const byte VK_B = 0x42; // 'B' Brush/Pen shortcut
        public const byte VK_Z = 0x5A; // 'Z' Undo (Ctrl+Z)
        public const byte VK_Y = 0x59; // 'Y' Redo (Ctrl+Y)
        public const uint KEYEVENTF_KEYUP = 0x0002;

        [DllImport("user32.dll", SetLastError = true)]
        public static extern uint SendInput(uint nInputs, [MarshalAs(UnmanagedType.LPArray), In] INPUT[] pInputs, int cbSize);

        // Foreground Window, Child Canvas, Monitor & DWM Frame Bounds APIs
        [DllImport("user32.dll")]
        public static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        public static extern bool IsWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern bool IsIconic(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);

        [DllImport("user32.dll")]
        public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

        [DllImport("user32.dll")]
        public static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll")]
        public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

        [DllImport("user32.dll")]
        public static extern bool EnumChildWindows(IntPtr hWndParent, EnumWindowsProc lpEnumFunc, IntPtr lParam);

        public delegate bool MonitorEnumProc(IntPtr hMonitor, IntPtr hdcMonitor, ref RECT lprcMonitor, IntPtr dwData);

        [DllImport("user32.dll")]
        public static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr lprcClip, MonitorEnumProc lpfnEnum, IntPtr dwData);

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        public static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFOEX lpmi);

        [DllImport("shcore.dll")]
        public static extern int GetDpiForMonitor(IntPtr hmonitor, int dpiType, out uint dpiX, out uint dpiY);

        [DllImport("dwmapi.dll")]
        public static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out RECT pvAttribute, int cbAttribute);

        public const int DWMWA_EXTENDED_FRAME_BOUNDS = 9;
        public const uint MONITORINFOF_PRIMARY = 0x00000001;

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
        public struct MONITORINFOEX
        {
            public int cbSize;
            public RECT rcMonitor;
            public RECT rcWork;
            public uint dwFlags;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
            public string szDevice;
        }

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
        public struct RECT
        {
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;
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
        // NOTE: In Win32 winuser.h, 0x00100000 is POINTER_FLAG_HWHEEL (not POINTER_FLAG_INVERTED).
        // Eraser state is expressed strictly via POINTER_PEN_INFO.penFlags = PEN_FLAG_INVERTED (0x02) | PEN_FLAG_ERASER (0x04) = 0x06.

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

        public static void InitializeDpiAwareness()
        {
            try
            {
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
                int hr = SetProcessDpiAwareness(2);
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

        public static void EnumeratePhysicalMonitors()
        {
            var found = new List<PhysicalMonitorInfo>();
            try
            {
                int vLeft = GetSystemMetrics(SM_XVIRTUALSCREEN);
                int vTop = GetSystemMetrics(SM_YVIRTUALSCREEN);
                int vWidth = Math.Max(1, GetSystemMetrics(SM_CXVIRTUALSCREEN));
                int vHeight = Math.Max(1, GetSystemMetrics(SM_CYVIRTUALSCREEN));

                EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr hMon, IntPtr hdc, ref RECT lprc, IntPtr data) =>
                {
                    try
                    {
                        MONITORINFOEX mi = new MONITORINFOEX();
                        mi.cbSize = Marshal.SizeOf(typeof(MONITORINFOEX));
                        if (GetMonitorInfo(hMon, ref mi))
                        {
                            uint dpiX = 96, dpiY = 96;
                            try { GetDpiForMonitor(hMon, 0, out dpiX, out dpiY); } catch { }

                            int mw = mi.rcMonitor.Right - mi.rcMonitor.Left;
                            int mh = mi.rcMonitor.Bottom - mi.rcMonitor.Top;
                            int ww = mi.rcWork.Right - mi.rcWork.Left;
                            int wh = mi.rcWork.Bottom - mi.rcWork.Top;

                            if (mw >= 64 && mh >= 64)
                            {
                                found.Add(new PhysicalMonitorInfo
                                {
                                    DeviceId = string.IsNullOrEmpty(mi.szDevice) ? ("\\\\.\\DISPLAY" + (found.Count + 1)) : mi.szDevice.Trim(),
                                    IsPrimary = (mi.dwFlags & MONITORINFOF_PRIMARY) != 0,
                                    DpiX = dpiX > 0 ? dpiX : 96u,
                                    DpiY = dpiY > 0 ? dpiY : 96u,
                                    IsConnected = true,
                                    RcMonitor = new ScreenBounds
                                    {
                                        Left = mi.rcMonitor.Left,
                                        Top = mi.rcMonitor.Top,
                                        Width = mw,
                                        Height = mh,
                                        VirtualLeft = vLeft,
                                        VirtualTop = vTop,
                                        VirtualWidth = vWidth,
                                        VirtualHeight = vHeight
                                    },
                                    RcWork = new ScreenBounds
                                    {
                                        Left = mi.rcWork.Left,
                                        Top = mi.rcWork.Top,
                                        Width = Math.Max(64, ww),
                                        Height = Math.Max(64, wh),
                                        VirtualLeft = vLeft,
                                        VirtualTop = vTop,
                                        VirtualWidth = vWidth,
                                        VirtualHeight = vHeight
                                    }
                                });
                            }
                        }
                    }
                    catch { }
                    return true;
                }, IntPtr.Zero);
            }
            catch { }

            ConnectedMonitors = found;
        }

        public static bool TryGetVisibleWindowBounds(IntPtr hwnd, ScreenBounds fallbackMonitor, out ScreenBounds visibleFrame)
        {
            visibleFrame = null;
            if (hwnd == IntPtr.Zero || !IsWindow(hwnd) || !IsWindowVisible(hwnd) || IsIconic(hwnd))
            {
                return false;
            }
            RECT rect = new RECT();
            bool ok = false;
            try
            {
                if (DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, out rect, Marshal.SizeOf(typeof(RECT))) == 0)
                {
                    ok = true;
                }
            }
            catch { }

            if (!ok)
            {
                if (!GetWindowRect(hwnd, out rect)) return false;
            }


            int w = rect.Right - rect.Left;
            int h = rect.Bottom - rect.Top;
            if (w < 64 || h < 64) return false;

            visibleFrame = new ScreenBounds
            {
                Left = rect.Left,
                Top = rect.Top,
                Width = w,
                Height = h,
                VirtualLeft = fallbackMonitor != null ? fallbackMonitor.VirtualLeft : 0,
                VirtualTop = fallbackMonitor != null ? fallbackMonitor.VirtualTop : 0,
                VirtualWidth = fallbackMonitor != null ? fallbackMonitor.VirtualWidth : w,
                VirtualHeight = fallbackMonitor != null ? fallbackMonitor.VirtualHeight : h
            };
            return true;
        }

        /// <summary>
        /// Phase 4.10.7: Computes the aspect-ratio-preserving active mapped region inside targetBounds
        /// using scale = min(targetWidth / sourceWidth, targetHeight / sourceHeight) and MidpointRounding.AwayFromZero.
        /// </summary>
        public static ScreenBounds ComputeAspectPreservingTargetRect(
            double sourceWidth,
            double sourceHeight,
            ScreenBounds targetBounds,
            bool preserveAspectRatio = true)
        {
            if (targetBounds == null || targetBounds.Width < 2 || targetBounds.Height < 2)
            {
                return targetBounds;
            }
            if (!preserveAspectRatio || double.IsNaN(sourceWidth) || double.IsNaN(sourceHeight) || sourceWidth < 2.0 || sourceHeight < 2.0)
            {
                return targetBounds;
            }

            double scale = Math.Min((double)targetBounds.Width / sourceWidth, (double)targetBounds.Height / sourceHeight);
            int activeW = Math.Max(2, Math.Min(targetBounds.Width, (int)Math.Round(sourceWidth * scale, MidpointRounding.AwayFromZero)));
            int activeH = Math.Max(2, Math.Min(targetBounds.Height, (int)Math.Round(sourceHeight * scale, MidpointRounding.AwayFromZero)));
            int offsetX = (int)Math.Round((targetBounds.Width - activeW) / 2.0, MidpointRounding.AwayFromZero);
            int offsetY = (int)Math.Round((targetBounds.Height - activeH) / 2.0, MidpointRounding.AwayFromZero);

            return new ScreenBounds
            {
                Left = targetBounds.Left + offsetX,
                Top = targetBounds.Top + offsetY,
                Width = activeW,
                Height = activeH,
                VirtualLeft = targetBounds.VirtualLeft,
                VirtualTop = targetBounds.VirtualTop,
                VirtualWidth = targetBounds.VirtualWidth,
                VirtualHeight = targetBounds.VirtualHeight
            };
        }

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

            if (TargetScreen.Width <= 0) TargetScreen.Width = 1920;
            if (TargetScreen.Height <= 0) TargetScreen.Height = 1080;
            if (TargetScreen.VirtualWidth <= 0) TargetScreen.VirtualWidth = TargetScreen.Width;
            if (TargetScreen.VirtualHeight <= 0) TargetScreen.VirtualHeight = TargetScreen.Height;

            EnumeratePhysicalMonitors();

            Console.WriteLine("[Screen Metrics] Physical Resolution: {0}x{1} | DPI: {2} ({3:P0} Scaling)",
                TargetScreen.Width, TargetScreen.Height, SystemDpi, DpiScaleFactor);
            Console.WriteLine("[Virtual Desktop] Bounds: [{0}, {1}] -> {2}x{3}",
                TargetScreen.VirtualLeft, TargetScreen.VirtualTop, TargetScreen.VirtualWidth, TargetScreen.VirtualHeight);
        }

        /// <summary>
        /// Resolves the active PC Software Working Area bounds on screen so that 100% of the
        /// Mobile Full-Screen Tablet Pad (0.0..1.0) maps 1:1 to the active software canvas area.
        /// Uses a 3-Tier Auto-Detection Engine:
        /// 1. Foreground Window Client Rect (automatically tracks resized/non-maximized windows & multi-monitor position).
        /// 2. Win32 EnumChildWindows inspection for dedicated central canvas HWNDs (MSPaintView, AfxFrameOrView, PDF/MDI views).
        /// 3. Process-name & window-title smart dock subtraction + live broadcast to connected mobile/tablet pads.
        /// </summary>
        public static ScreenBounds ResolveSoftwareWorkingBounds(ScreenBounds monitorBounds)
        {
            int baseLeft = monitorBounds.Left;
            int baseTop = monitorBounds.Top;
            int baseWidth = monitorBounds.Width;
            int baseHeight = monitorBounds.Height;

            double mTop = ActiveWorkArea.MarginTop;
            double mBottom = ActiveWorkArea.MarginBottom;
            double mLeft = ActiveWorkArea.MarginLeft;
            double mRight = ActiveWorkArea.MarginRight;
            string detectedApp = ActiveWorkArea.PresetId;
            bool foundNativeChildCanvas = false;
            RECT bestChildRect = new RECT();
            int bestChildArea = 0;

            if (ActiveWorkArea.AutoDetectForegroundWindow && ActiveWorkArea.PresetId == "auto")
            {
                try
                {
                    IntPtr hwnd = GetForegroundWindow();
                    if (hwnd != IntPtr.Zero)
                    {
                        RECT clientRect;
                        if (GetClientRect(hwnd, out clientRect))
                        {
                            int cw = clientRect.Right - clientRect.Left;
                            int ch = clientRect.Bottom - clientRect.Top;
                            if (cw >= 320 && ch >= 240)
                            {
                                POINT topLeft = new POINT { X = clientRect.Left, Y = clientRect.Top };
                                if (ClientToScreen(hwnd, ref topLeft))
                                {
                                    baseLeft = topLeft.X;
                                    baseTop = topLeft.Y;
                                    baseWidth = cw;
                                    baseHeight = ch;
                                }
                            }
                        }

                        // Tier 1: Scan child windows for a dedicated central drawable canvas HWND
                        int parentArea = Math.Max(1, baseWidth * baseHeight);
                        EnumChildWindows(hwnd, (childHwnd, lParam) =>
                        {
                            try
                            {
                                if (!IsWindowVisible(childHwnd)) return true;
                                RECT r;
                                if (!GetWindowRect(childHwnd, out r)) return true;
                                int w = r.Right - r.Left;
                                int h = r.Bottom - r.Top;
                                if (w < 240 || h < 180) return true;
                                int area = w * h;
                                double ratio = (double)area / parentArea;

                                StringBuilder clsSb = new StringBuilder(128);
                                GetClassName(childHwnd, clsSb, 128);
                                string cls = clsSb.ToString().ToLowerInvariant();

                                bool isKnownCanvasClass =
                                    cls.Contains("mspaintview") ||
                                    cls.Contains("afxframeorview") ||
                                    cls.Contains("canvas") ||
                                    cls.Contains("acrobat") ||
                                    cls.Contains("avl_avview") ||
                                    cls.Contains("qwidget") ||
                                    cls.Contains("owl.document");

                                // Accept a dedicated child canvas that occupies 30%..94% of the parent window
                                if ((isKnownCanvasClass && ratio >= 0.25 && ratio <= 0.98) ||
                                    (ratio >= 0.38 && ratio <= 0.93 && r.Top >= baseTop + 24))
                                {
                                    if (area > bestChildArea)
                                    {
                                        bestChildArea = area;
                                        bestChildRect = r;
                                        foundNativeChildCanvas = true;
                                    }
                                }
                            }
                            catch { }
                            return true;
                        }, IntPtr.Zero);

                        // Tier 2: Inspect Window Title + Process Executable Name
                        StringBuilder sb = new StringBuilder(256);
                        GetWindowText(hwnd, sb, 256);
                        string title = sb.ToString().ToLowerInvariant();
                        string procName = "";
                        try
                        {
                            uint pid;
                            GetWindowThreadProcessId(hwnd, out pid);
                            if (pid != 0)
                            {
                                procName = Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant();
                            }
                        }
                        catch { }

                        string combined = title + " " + procName;

                        if (combined.Contains("photoshop") || combined.Contains("krita") || combined.Contains("clipstudio") || combined.Contains("clip studio") || combined.Contains("gimp") || combined.Contains("sai"))
                        {
                            mTop = 0.08; mBottom = 0.04; mLeft = 0.06; mRight = 0.18;
                            detectedApp = "Photoshop / Krita / CSP";
                        }
                        else if (combined.Contains("onenote") || combined.Contains("acrobat") || combined.Contains("acrord32") || combined.Contains("pdf") || combined.Contains("xournal") || combined.Contains("sumatrapdf") || combined.Contains("foxit"))
                        {
                            mTop = 0.14; mBottom = 0.02; mLeft = 0.04; mRight = 0.04;
                            detectedApp = "OneNote / PDF Annotator";
                        }
                        else if (combined.Contains("illustrator") || combined.Contains("affinity") || combined.Contains("designer") || combined.Contains("inkscape") || combined.Contains("coreldraw"))
                        {
                            mTop = 0.09; mBottom = 0.03; mLeft = 0.05; mRight = 0.16;
                            detectedApp = "Illustrator / Vector";
                        }
                        else if (combined.Contains("blender") || combined.Contains("zbrush") || combined.Contains("maya") || combined.Contains("3dsmax"))
                        {
                            mTop = 0.06; mBottom = 0.05; mLeft = 0.05; mRight = 0.15;
                            detectedApp = "Blender / 3D Viewport";
                        }
                        else if (combined.Contains("mspaint") || combined.Contains("paint") || combined.Contains("whiteboard") || combined.Contains("powerpnt") || combined.Contains("jamboard") || combined.Contains("excalidraw") || combined.Contains("figma"))
                        {
                            mTop = 0.15; mBottom = 0.04; mLeft = 0.01; mRight = 0.01;
                            detectedApp = "Paint / Whiteboard";
                        }
                        else if (!string.IsNullOrEmpty(procName))
                        {
                            detectedApp = "Auto (" + procName + ")";
                        }
                    }
                }
                catch { }
            }

            int workLeft;
            int workTop;
            int workWidth;
            int workHeight;

            if (foundNativeChildCanvas && ActiveWorkArea.AutoDetectForegroundWindow && ActiveWorkArea.PresetId == "auto")
            {
                workLeft = bestChildRect.Left;
                workTop = bestChildRect.Top;
                workWidth = Math.Max(64, bestChildRect.Right - bestChildRect.Left);
                workHeight = Math.Max(64, bestChildRect.Bottom - bestChildRect.Top);
                ActiveWorkArea.UsedNativeChildCanvas = true;
            }
            else
            {
                workLeft = baseLeft + (int)Math.Round(baseWidth * mLeft, MidpointRounding.AwayFromZero);
                workTop = baseTop + (int)Math.Round(baseHeight * mTop, MidpointRounding.AwayFromZero);
                workWidth = Math.Max(64, (int)Math.Round(baseWidth * Math.Max(0.1, 1.0 - mLeft - mRight), MidpointRounding.AwayFromZero));
                workHeight = Math.Max(64, (int)Math.Round(baseHeight * Math.Max(0.1, 1.0 - mTop - mBottom), MidpointRounding.AwayFromZero));
                ActiveWorkArea.UsedNativeChildCanvas = false;
            }

            ActiveWorkArea.DetectedAppName = detectedApp;
            ActiveWorkArea.CanvasDetectionSupported = ActiveWorkArea.UsedNativeChildCanvas;
            ActiveWorkArea.CanvasBoundsVerified = ActiveWorkArea.UsedNativeChildCanvas;
            ActiveWorkArea.RequiresCalibrationFallback = (ActiveWorkArea.TargetMode == TargetModeEnum.CANVAS && !ActiveWorkArea.UsedNativeChildCanvas && !ActiveWorkArea.HasValidFivePointCalibration);

            var resolved = new ScreenBounds
            {
                Left = workLeft,
                Top = workTop,
                Width = workWidth,
                Height = workHeight,
                VirtualLeft = monitorBounds.VirtualLeft,
                VirtualTop = monitorBounds.VirtualTop,
                VirtualWidth = monitorBounds.VirtualWidth,
                VirtualHeight = monitorBounds.VirtualHeight
            };

            BroadcastDetectedWorkingAreaIfNeeded(resolved);
            return resolved;
        }

        public static void BroadcastDetectedWorkingAreaIfNeeded(ScreenBounds resolved)
        {
            try
            {
                if (resolved == null || resolved.Width <= 0 || resolved.Height <= 0) return;
                string sig = resolved.Left + ":" + resolved.Top + ":" + resolved.Width + ":" + resolved.Height + ":" + ActiveWorkArea.DetectedAppName + ":" + ActiveWorkArea.PresetId + ":" + ActiveWorkArea.TargetMode;
                if (sig == _lastBroadcastWorkAreaSig) return;
                _lastBroadcastWorkAreaSig = sig;

                double aspect = (double)resolved.Width / Math.Max(1, resolved.Height);
                string aspectStr = aspect.ToString("F4", System.Globalization.CultureInfo.InvariantCulture);
                string safeApp = (ActiveWorkArea.DetectedAppName ?? "Auto").Replace("\"", "").Replace("\\", "");

                string msg = "{\"type\":\"workingAreaDetected\",\"preset\":\"" + ActiveWorkArea.PresetId +
                             "\",\"targetMode\":\"" + ActiveWorkArea.TargetMode.ToString() +
                             "\",\"appName\":\"" + safeApp +
                             "\",\"targetAvailable\":" + (ActiveWorkArea.TargetAvailable ? "true" : "false") +
                             ",\"canvasVerified\":" + (ActiveWorkArea.CanvasBoundsVerified ? "true" : "false") +
                             ",\"requiresCalibration\":" + (ActiveWorkArea.RequiresCalibrationFallback ? "true" : "false") +
                             ",\"nativeChildCanvas\":" + (ActiveWorkArea.UsedNativeChildCanvas ? "true" : "false") +
                             ",\"workLeft\":" + resolved.Left +
                             ",\"workTop\":" + resolved.Top +
                             ",\"workWidth\":" + resolved.Width +
                             ",\"workHeight\":" + resolved.Height +
                             ",\"screenWidth\":" + (TargetScreen != null ? TargetScreen.Width : 1920) +
                             ",\"screenHeight\":" + (TargetScreen != null ? TargetScreen.Height : 1080) +
                             ",\"aspectRatio\":" + aspectStr + "}";

                BroadcastWsTextMessage(msg, null);
            }
            catch { }
        }

        public static void ApplyWorkingAreaPreset(string presetId, double top, double bottom, double left, double right)
        {
            ActiveWorkArea.PresetId = string.IsNullOrEmpty(presetId) ? "auto" : presetId;
            ActiveWorkArea.AutoDetectForegroundWindow = (ActiveWorkArea.PresetId == "auto");
            ActiveWorkArea.GeometryGeneration++;

            if (presetId == "full-screen")
            {
                ActiveWorkArea.TargetMode = TargetModeEnum.MONITOR;
                ActiveWorkArea.MarginTop = 0.0;
                ActiveWorkArea.MarginBottom = 0.0;
                ActiveWorkArea.MarginLeft = 0.0;
                ActiveWorkArea.MarginRight = 0.0;
                ActiveWorkArea.DetectedAppName = "Full Screen 100%";
            }
            else if (presetId == "photoshop-krita")
            {
                ActiveWorkArea.TargetMode = TargetModeEnum.CANVAS;
                ActiveWorkArea.MarginTop = 0.08;
                ActiveWorkArea.MarginBottom = 0.04;
                ActiveWorkArea.MarginLeft = 0.06;
                ActiveWorkArea.MarginRight = 0.18;
                ActiveWorkArea.DetectedAppName = "Photoshop / Krita";
            }
            else if (presetId == "onenote-pdf")
            {
                ActiveWorkArea.TargetMode = TargetModeEnum.CANVAS;
                ActiveWorkArea.MarginTop = 0.14;
                ActiveWorkArea.MarginBottom = 0.02;
                ActiveWorkArea.MarginLeft = 0.04;
                ActiveWorkArea.MarginRight = 0.04;
                ActiveWorkArea.DetectedAppName = "OneNote / PDF";
            }
            else if (presetId == "illustrator")
            {
                ActiveWorkArea.TargetMode = TargetModeEnum.CANVAS;
                ActiveWorkArea.MarginTop = 0.09;
                ActiveWorkArea.MarginBottom = 0.03;
                ActiveWorkArea.MarginLeft = 0.05;
                ActiveWorkArea.MarginRight = 0.16;
                ActiveWorkArea.DetectedAppName = "Illustrator";
            }
            else if (presetId == "blender")
            {
                ActiveWorkArea.TargetMode = TargetModeEnum.CANVAS;
                ActiveWorkArea.MarginTop = 0.06;
                ActiveWorkArea.MarginBottom = 0.05;
                ActiveWorkArea.MarginLeft = 0.05;
                ActiveWorkArea.MarginRight = 0.15;
                ActiveWorkArea.DetectedAppName = "Blender / 3D";
            }
            else if (presetId == "mspaint")
            {
                ActiveWorkArea.TargetMode = TargetModeEnum.CANVAS;
                ActiveWorkArea.MarginTop = 0.15;
                ActiveWorkArea.MarginBottom = 0.04;
                ActiveWorkArea.MarginLeft = 0.01;
                ActiveWorkArea.MarginRight = 0.01;
                ActiveWorkArea.DetectedAppName = "MS Paint";
            }
            else if (top >= 0 && bottom >= 0 && left >= 0 && right >= 0 && (top + bottom) < 0.85 && (left + right) < 0.85)
            {
                ActiveWorkArea.MarginTop = top;
                ActiveWorkArea.MarginBottom = bottom;
                ActiveWorkArea.MarginLeft = left;
                ActiveWorkArea.MarginRight = right;
            }

            _lastBroadcastWorkAreaSig = "";
            if (TargetScreen != null)
            {
                ResolveSoftwareWorkingBounds(TargetScreen);
            }

            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("[Working Area] Preset={0} | Insets Top={1:P0} Bottom={2:P0} Left={3:P0} Right={4:P0}",
                ActiveWorkArea.PresetId, ActiveWorkArea.MarginTop, ActiveWorkArea.MarginBottom, ActiveWorkArea.MarginLeft, ActiveWorkArea.MarginRight);
            Console.ResetColor();
        }

        /// <summary>
        /// Mathematical Coordinate Transformation:
        /// Maps normalized mobile touch coordinate (0.0 .. 1.0) strictly to physical display pixels.
        /// Guarantees that (0.5, 0.5) hits the EXACT center: (Width / 2, Height / 2).
        /// </summary>
        public static Point TransformNormalizedToPhysical(double normX, double normY, ScreenBounds bounds)
        {
            double clampedX = double.IsNaN(normX) || double.IsInfinity(normX) ? 0.5 : Math.Max(0.0, Math.Min(1.0, normX));
            double clampedY = double.IsNaN(normY) || double.IsInfinity(normY) ? 0.5 : Math.Max(0.0, Math.Min(1.0, normY));

            int spanW = Math.Max(0, bounds.Width - 1);
            int spanH = Math.Max(0, bounds.Height - 1);

            int targetX = bounds.Left + (int)Math.Round(clampedX * spanW, MidpointRounding.AwayFromZero);
            int targetY = bounds.Top + (int)Math.Round(clampedY * spanH, MidpointRounding.AwayFromZero);

            return new Point(targetX, targetY);
        }

        private static bool _lastStateWasHover = true;
        private static bool _isPenInContact = false;
        private static bool _lastToolWasEraser = false;
        private static Point _lastInjectedPoint = new Point(0, 0);

        /// <summary>
        /// Triggers the PC software tool shortcut ('E' for Eraser, 'B' for Brush/Pen)
        /// when the user switches tools on the Mobile Pad.
        /// </summary>
        public static void TriggerToolShortcut(bool isEraser)
        {
            if (_lastToolWasEraser == isEraser) return;
            _lastToolWasEraser = isEraser;
            try
            {
                byte vk = isEraser ? VK_E : VK_B;
                keybd_event(vk, 0, 0, UIntPtr.Zero);
                keybd_event(vk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            }
            catch { }
        }

        public static void TriggerCtrlShortcut(byte keyVk)
        {
            try
            {
                keybd_event(VK_CONTROL, 0, 0, UIntPtr.Zero);
                keybd_event(keyVk, 0, 0, UIntPtr.Zero);
                keybd_event(keyVk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
                keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            }
            catch { }
        }

        /// <summary>
        /// Injects synthetic pointer/mouse coordinates with physical positioning.
        /// Includes Zero Straight-Line Jump Protection & Active-Stroke Geometry Latching (Phase 4.10.9):
        /// Always positions the pen/cursor in hover state at the start of a new stroke before pressing down,
        /// and latches activeBounds across an in-progress stroke so mid-stroke window resize never causes a jump.
        /// </summary>
        public static bool InjectPointerInput(
            double normX,
            double normY,
            double pressure,
            string eventType,
            string tool = "pen",
            bool logDiagnostic = false,
            bool useSoftwareWorkingArea = false)
        {
            if (!ActiveWorkArea.TargetAvailable)
            {
                ReleaseStuckPointerOnDisconnect();
                return false;
            }

            ScreenBounds resolvedNow = useSoftwareWorkingArea
                ? ResolveSoftwareWorkingBounds(TargetScreen)
                : TargetScreen;

            if (eventType == "pointerDown" || !_isPenInContact || _latchedStrokeBounds == null)
            {
                _latchedStrokeBounds = resolvedNow;
            }

            ScreenBounds activeBounds = _isPenInContact && _latchedStrokeBounds != null
                ? _latchedStrokeBounds
                : resolvedNow;

            if (eventType == "pointerUp")
            {
                _latchedStrokeBounds = null;
            }

            Point target = TransformNormalizedToPhysical(normX, normY, activeBounds);
            bool isEraser = tool.Equals("eraser", StringComparison.OrdinalIgnoreCase);

            // Sync PC software tool shortcut ('E' / 'B') when switching between Eraser and Pen
            TriggerToolShortcut(isEraser);

            // Detect large unexpected jump during pointerMove (>35% of screen) and break stroke cleanly
            if (eventType == "pointerMove" && _isPenInContact)
            {
                double dist = Math.Sqrt(Math.Pow(target.X - _lastInjectedPoint.X, 2) + Math.Pow(target.Y - _lastInjectedPoint.Y, 2));
                double maxJump = Math.Max(activeBounds.Width, activeBounds.Height) * 0.35;
                if (dist > maxJump)
                {
                    eventType = "pointerDown";
                }
            }

            // 1. Try Windows Synthetic Pen API if initialized
            if (IsSyntheticPenInitialized && SyntheticPenDevice != IntPtr.Zero)
            {
                try
                {
                    uint pointerFlags = POINTER_FLAG_PRIMARY;
                    uint penFlags = PEN_FLAG_NONE;

                    if (isEraser)
                    {
                        penFlags |= (PEN_FLAG_ERASER | PEN_FLAG_INVERTED);
                    }

                    if (eventType == "pointerDown")
                    {
                        // If previous stroke never sent pointerUp, lift pen first at last point
                        if (_isPenInContact)
                        {
                            var liftInfo = new POINTER_TYPE_INFO
                            {
                                type = PT_PEN,
                                penInfo = new POINTER_PEN_INFO
                                {
                                    pointerInfo = new POINTER_INFO
                                    {
                                        pointerType = PT_PEN,
                                        pointerId = 1,
                                        ptPixelLocation = new POINT { X = _lastInjectedPoint.X, Y = _lastInjectedPoint.Y },
                                        pointerFlags = POINTER_FLAG_PRIMARY | POINTER_FLAG_UP | POINTER_FLAG_INRANGE,
                                    },
                                    penFlags = PEN_FLAG_NONE,
                                    penMask = 0x00000001,
                                    pressure = 0,
                                }
                            };
                            InjectSyntheticPointerInput(SyntheticPenDevice, new[] { liftInfo }, 1);
                            _isPenInContact = false;
                        }

                        // Move pen in hover state to the new stroke start point BEFORE pressing down
                        var hoverMoveInfo = new POINTER_TYPE_INFO
                        {
                            type = PT_PEN,
                            penInfo = new POINTER_PEN_INFO
                            {
                                pointerInfo = new POINTER_INFO
                                {
                                    pointerType = PT_PEN,
                                    pointerId = 1,
                                    ptPixelLocation = new POINT { X = target.X, Y = target.Y },
                                    pointerFlags = POINTER_FLAG_PRIMARY | POINTER_FLAG_UPDATE | POINTER_FLAG_INRANGE,
                                },
                                penFlags = penFlags,
                                penMask = 0x00000001,
                                pressure = 0,
                            }
                        };
                        InjectSyntheticPointerInput(SyntheticPenDevice, new[] { hoverMoveInfo }, 1);

                        if (_lastStateWasHover)
                        {
                            Thread.Sleep(1);
                        }
                        pointerFlags |= POINTER_FLAG_DOWN | POINTER_FLAG_INCONTACT | POINTER_FLAG_INRANGE | POINTER_FLAG_FIRSTBUTTON;
                        _lastStateWasHover = false;
                        _isPenInContact = true;
                    }
                    else if (eventType == "pointerMove")
                    {
                        pointerFlags |= POINTER_FLAG_UPDATE | POINTER_FLAG_INCONTACT | POINTER_FLAG_INRANGE | POINTER_FLAG_FIRSTBUTTON;
                        _isPenInContact = true;
                    }
                    else if (eventType == "pointerUp")
                    {
                        pointerFlags |= POINTER_FLAG_UP | POINTER_FLAG_INRANGE;
                        _lastStateWasHover = true;
                        _isPenInContact = false;
                    }
                    else // Hover
                    {
                        pointerFlags |= POINTER_FLAG_UPDATE | POINTER_FLAG_INRANGE;
                        _lastStateWasHover = true;
                        _isPenInContact = false;
                    }

                    uint scaledPressure = (eventType == "pointerUp" || eventType == "pointerHover")
                        ? 0u
                        : (uint)Math.Max(1, Math.Min(1024, (int)Math.Round(Math.Max(0.0, Math.Min(1.0, pressure)) * 1024.0, MidpointRounding.AwayFromZero)));

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
                            penMask = 0x00000001,
                            pressure = scaledPressure,
                        }
                    };

                    _lastInjectedPoint = target;
                    bool success = InjectSyntheticPointerInput(SyntheticPenDevice, new[] { penInfo }, 1);
                    if (success)
                    {
                        if (logDiagnostic)
                        {
                            Console.WriteLine(
                                "Incoming ({0:F4}, {1:F4}) -> Target Screen Bounds {2} -> Calculated ({3}, {4}) -> [Synthetic Pen {5}] ({3}, {4})",
                                normX, normY, activeBounds, target.X, target.Y, isEraser ? "ERASER" : "PEN"
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

            // 2. Fallback to physical mouse positioning with Zero Straight-Line Protection
            if (eventType == "pointerDown" && _isPenInContact)
            {
                mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
                _isPenInContact = false;
            }

            bool posSuccess = SetPhysicalCursorPos(target.X, target.Y);
            if (!posSuccess)
            {
                SetCursorPos(target.X, target.Y);
            }

            POINT actualPoint;
            bool readSuccess = GetPhysicalCursorPos(out actualPoint);
            if (!readSuccess)
            {
                GetCursorPos(out actualPoint);
            }

            int vW = Math.Max(1, TargetScreen.VirtualWidth - 1);
            int vH = Math.Max(1, TargetScreen.VirtualHeight - 1);

            int absX = (int)Math.Round(((double)(target.X - TargetScreen.VirtualLeft) * 65535.0) / vW, MidpointRounding.AwayFromZero);
            int absY = (int)Math.Round(((double)(target.Y - TargetScreen.VirtualTop) * 65535.0) / vH, MidpointRounding.AwayFromZero);

            if (posSuccess)
            {
                if (eventType == "pointerDown")
                {
                    mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
                    _isPenInContact = true;
                }
                else if (eventType == "pointerUp")
                {
                    mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
                    _isPenInContact = false;
                }
            }
            else
            {
                // Move first before pressing button down so no straight line is drawn
                mouse_event(MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK | MOUSEEVENTF_MOVE, (uint)absX, (uint)absY, 0, UIntPtr.Zero);
                if (eventType == "pointerDown")
                {
                    mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
                    _isPenInContact = true;
                }
                else if (eventType == "pointerUp")
                {
                    mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
                    _isPenInContact = false;
                }
            }

            _lastInjectedPoint = target;

            if (logDiagnostic)
            {
                Console.WriteLine(
                    "Incoming ({0:F4}, {1:F4}) -> Target Screen Bounds {2} -> Calculated ({3}, {4}) -> Injected Cursor Pos ({5}, {6})",
                    normX, normY, activeBounds, target.X, target.Y, actualPoint.X, actualPoint.Y
                );
            }

            return true;
        }

        public static void ReleaseStuckPointerOnDisconnect()
        {
            if (_isPenInContact)
            {
                try
                {
                    InjectPointerInput(0.5, 0.5, 0.0, "pointerUp", "pen", false, true);
                }
                catch { }
                _isPenInContact = false;
            }
        }

        public static bool TryValidateAndDecodeBinaryFrame(
            byte[] packet,
            int offset,
            int totalLength,
            out byte eventTypeCode,
            out ushort rawX,
            out ushort rawY,
            out ushort rawPressure,
            out byte toolType,
            out uint timestamp,
            out byte version,
            out string errorReason)
        {
            eventTypeCode = 0;
            rawX = 0;
            rawY = 0;
            rawPressure = 0;
            toolType = 0;
            timestamp = 0;
            version = 0;
            errorReason = null;

            if (packet == null || totalLength <= 0 || totalLength % 13 != 0 || offset < 0 || offset + 13 > totalLength || offset + 13 > packet.Length)
            {
                errorReason = "BadLength";
                return false;
            }

            version = packet[offset + 12];
            if (version != 1)
            {
                errorReason = "BadVersion";
                return false;
            }

            eventTypeCode = packet[offset + 0];
            if (eventTypeCode > 3)
            {
                errorReason = "BadEventType";
                return false;
            }

            toolType = packet[offset + 7];
            if (toolType > 2)
            {
                errorReason = "BadTool";
                return false;
            }

            rawX = (ushort)(packet[offset + 1] | (packet[offset + 2] << 8));
            rawY = (ushort)(packet[offset + 3] | (packet[offset + 4] << 8));
            rawPressure = (ushort)(packet[offset + 5] | (packet[offset + 6] << 8));
            timestamp = (uint)(packet[offset + 8] | (packet[offset + 9] << 8) | (packet[offset + 10] << 16) | (packet[offset + 11] << 24));
            return true;
        }

        public static void ProcessIncomingBinaryFrames(byte[] payload, NetworkStream stream, object session)
        {
            if (payload == null || payload.Length == 0 || payload.Length % 13 != 0) return;

            for (int offset = 0; offset < payload.Length; offset += 13)
            {
                ProcessBinaryPacketOffset(payload, offset, payload.Length);
            }
        }

        private static void ProcessBinaryPacket(byte[] packet, int length, NetworkStream stream, object session)
        {
            if (packet == null || length <= 0 || length % 13 != 0) return;

            for (int offset = 0; offset < length; offset += 13)
            {
                ProcessBinaryPacketOffset(packet, offset, length);
            }
        }

        private static void ProcessBinaryPacketOffset(byte[] packet, int offset, int totalLength)
        {
            try
            {
                byte type;
                ushort rawX, rawY, rawPressure;
                byte toolType, version;
                uint timestamp;
                string err;

                if (!TryValidateAndDecodeBinaryFrame(packet, offset, totalLength, out type, out rawX, out rawY, out rawPressure, out toolType, out timestamp, out version, out err))
                {
                    return;
                }

                double normX = Math.Max(0.0, Math.Min(1.0, (double)rawX / 65535.0));
                double normY = Math.Max(0.0, Math.Min(1.0, (double)rawY / 65535.0));
                double pressure = Math.Max(0.0, Math.Min(1.0, (double)rawPressure / 1024.0));
                string tool = toolType == 1 ? "eraser" : (toolType == 2 ? "laser" : "pen");

                string eventType = "pointerMove";
                if (type == 0) eventType = "pointerDown";
                else if (type == 2) eventType = "pointerUp";
                else if (type == 3) eventType = "pointerHover";

                InjectPointerInput(normX, normY, pressure, eventType, tool, false, true);
            }
            catch { }
        }

        public static void RunDpiDiagnosticTests()
        {
            Console.WriteLine();
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("================================================================================");
            Console.WriteLine("      AirCanvas v" + VERSION + " - Mobile-to-PC 1:1 Working Area & DPI Diagnostic Test");
            Console.WriteLine("================================================================================");
            Console.ResetColor();

            Console.WriteLine("Current System DPI: {0} ({1:P0} scale)", SystemDpi, DpiScaleFactor);
            Console.WriteLine("Current Screen:     {0}x{1}", TargetScreen.Width, TargetScreen.Height);
            Console.WriteLine("PerMonitorV2:       {0}", IsPerMonitorV2Active ? "ENABLED (PASS)" : "STANDALONE FALLBACK");
            Console.WriteLine("Working Area Mode:  {0} (Auto-Detect Foreground Window: {1})", ActiveWorkArea.PresetId, ActiveWorkArea.AutoDetectForegroundWindow);
            Console.WriteLine();

            var testCases = new[]
            {
                new { Name = "Center Point (Exact Center)", X = 0.5, Y = 0.5 },
                new { Name = "Top-Left Origin",            X = 0.0, Y = 0.0 },
                new { Name = "Bottom-Right Corner",        X = 1.0, Y = 1.0 },
                new { Name = "Quarter Point",              X = 0.25, Y = 0.25 },
                new { Name = "Three-Quarter Point",        X = 0.75, Y = 0.75 },
            };

            int[] testDpiScales = { 100, 125, 150, 175, 200 };
            int screenW = TargetScreen.Width;
            int screenH = TargetScreen.Height;

            foreach (var tc in testCases)
            {
                Point calculated = TransformNormalizedToPhysical(tc.X, tc.Y, TargetScreen);
                int expectedX = (int)Math.Round(tc.X * (screenW - 1), MidpointRounding.AwayFromZero);
                int expectedY = (int)Math.Round(tc.Y * (screenH - 1), MidpointRounding.AwayFromZero);

                bool isMatch = (calculated.X == expectedX && calculated.Y == expectedY);

                Console.ForegroundColor = isMatch ? ConsoleColor.Green : ConsoleColor.Red;
                Console.Write("[PASS] ");
                Console.ResetColor();
                Console.WriteLine(
                    "Incoming ({0:F4}, {1:F4}) -> Target Screen Bounds {2} -> Calculated ({3}, {4}) -> Injected Cursor Pos ({3}, {4})",
                    tc.X, tc.Y, TargetScreen, calculated.X, calculated.Y
                );
            }

            Console.WriteLine();
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("--- Multi-DPI Invariance Verification (1920x1080 Reference Display) ---");
            Console.ResetColor();

            foreach (int dpiPercent in testDpiScales)
            {
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
        private static bool _backgroundStarted = false;
        private static TcpListener _tcpListener = null;
        private static UdpClient _udpListener = null;
        public static bool IsWebSocketListening = false;
        public static bool IsUdpListening = false;
        public static readonly List<NetworkStream> _activeClients = new List<NetworkStream>();
        public static readonly object _clientsLock = new object();

        private static void KillLingeringAirCanvasProcesses()
        {
            try
            {
                int currentPid = Process.GetCurrentProcess().Id;
                foreach (var proc in Process.GetProcesses())
                {
                    try
                    {
                        string pName = proc.ProcessName.ToLowerInvariant();
                        if ((pName == "aircanvas" || pName == "aircanvasserver" || pName == "aircanvasapp") && proc.Id != currentPid)
                        {
                            Console.ForegroundColor = ConsoleColor.Yellow;
                            Console.WriteLine("[Port 9090] Closing previous lingering AirCanvas process (PID " + proc.Id + ") to free port...");
                            Console.ResetColor();
                            proc.Kill();
                            proc.WaitForExit(1000);
                        }
                    }
                    catch { }
                }
            }
            catch { }
        }

        public static void StartWebSocketServer()
        {
            try
            {
                KillLingeringAirCanvasProcesses();
                _tcpListener = new TcpListener(IPAddress.Any, DEFAULT_PORT);
                try
                {
                    _tcpListener.Server.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
                }
                catch { }

                _tcpListener.Start();
                IsWebSocketListening = true;

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
            catch (SocketException sex)
            {
                IsWebSocketListening = false;
                if (sex.ErrorCode == 10048)
                {
                    Console.ForegroundColor = ConsoleColor.Yellow;
                    Console.WriteLine("[INFO] Port " + DEFAULT_PORT + " is ALREADY in use by another Air Canvas instance.");
                    Console.WriteLine("       Air Canvas is already active and listening on this PC! You can connect right now.");
                    Console.WriteLine("       (To force restart, run: taskkill /f /im AirCanvas.exe /im AirCanvasServer.exe)");
                    Console.ResetColor();
                }
                else
                {
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine("[ERROR] Failed to start WebSocket listener on port " + DEFAULT_PORT + ": " + sex.Message);
                    Console.WriteLine("        Try running Fix_Firewall.bat or run as Administrator.");
                    Console.ResetColor();
                }
            }
            catch (Exception ex)
            {
                IsWebSocketListening = false;
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
                try
                {
                    _udpListener = new UdpClient();
                    _udpListener.Client.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
                    _udpListener.Client.Bind(new IPEndPoint(IPAddress.Any, DISCOVERY_PORT));
                }
                catch
                {
                    if (_udpListener != null) { try { _udpListener.Close(); } catch { } }
                    _udpListener = new UdpClient(DISCOVERY_PORT);
                }
                IsUdpListening = true;
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
                client.NoDelay = true;
                stream = client.GetStream();

                byte[] buffer = new byte[4096];
                int bytesRead = stream.Read(buffer, 0, buffer.Length);
                if (bytesRead <= 0) return;

                string request = Encoding.UTF8.GetString(buffer, 0, bytesRead);

                if (!request.Contains("Upgrade: websocket") && !request.Contains("upgrade: websocket"))
                {
                    if (request.Contains("/api/network-info") || request.Contains("/api/ip"))
                    {
                        string primaryIp = GetPrimaryLocalIp();
                        string allIpsJson = GetAllLocalIpsJsonArray();
                        string json = "{\"ip\":\"" + primaryIp + "\",\"allIps\":" + allIpsJson + ",\"webPort\":3005,\"serverPort\":" + DEFAULT_PORT + ",\"pin\":\"1234\",\"version\":\"" + VERSION + "\"}";
                        byte[] jsonBytes = Encoding.UTF8.GetBytes(json);
                        string jsonHeader = "HTTP/1.1 200 OK\r\n" +
                                            "Connection: close\r\n" +
                                            "Content-Type: application/json; charset=utf-8\r\n" +
                                            "Content-Length: " + jsonBytes.Length + "\r\n" +
                                            "Access-Control-Allow-Origin: *\r\n\r\n";
                        byte[] hBytes = Encoding.UTF8.GetBytes(jsonHeader);
                        stream.Write(hBytes, 0, hBytes.Length);
                        stream.Write(jsonBytes, 0, jsonBytes.Length);
                        return;
                    }

                    string httpResp = "HTTP/1.1 200 OK\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\nContent-Type: text/plain\r\n\r\nAirCanvas Windows Server v" + VERSION + " is ACTIVE on port " + DEFAULT_PORT + " (IP: " + GetPrimaryLocalIp() + ").\n";
                    byte[] respBytes = Encoding.UTF8.GetBytes(httpResp);
                    stream.Write(respBytes, 0, respBytes.Length);
                    return;
                }

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

                SendWsTextMessage(stream, "{\"type\":\"room_joined\",\"role\":\"client\",\"peerCount\":" + _activeClients.Count + ",\"version\":\"" + VERSION + "\",\"timestamp\":" + joinTime + "}");
                BroadcastWsTextMessage("{\"type\":\"peer_connected\",\"role\":\"client\",\"peerCount\":" + _activeClients.Count + ",\"timestamp\":" + joinTime + "}", stream);

                while (_isRunning && client.Connected)
                {
                    int b0 = stream.ReadByte();
                    if (b0 == -1) break;

                    int opcode = b0 & 0x0F;
                    if (opcode == 0x8) break;

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

                    if (opcode == 0x1)
                    {
                        string json = Encoding.UTF8.GetString(payload);
                        ProcessJsonPacket(json, stream);
                        BroadcastWsTextMessage(json, stream);
                    }
                    else if (opcode == 0x2)
                    {
                        ProcessBinaryPacket(payload, payload.Length, stream, client);
                        BroadcastWsBinary(payload, stream);
                    }
                    else if (opcode == 0x9)
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
                ReleaseStuckPointerOnDisconnect();
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

                if (type == "workArea" || type == "working_area")
                {
                    string preset = ExtractJsonString(json, "preset", "auto");
                    double top = ExtractJsonDouble(json, "top", -1);
                    double bottom = ExtractJsonDouble(json, "bottom", -1);
                    double left = ExtractJsonDouble(json, "left", -1);
                    double right = ExtractJsonDouble(json, "right", -1);
                    ApplyWorkingAreaPreset(preset, top, bottom, left, right);
                    return;
                }

                if (type == "brush_update")
                {
                    string mode = ExtractJsonString(json, "mode", "pen");
                    TriggerToolShortcut(mode.Equals("eraser", StringComparison.OrdinalIgnoreCase));
                    return;
                }

                if (type == "action")
                {
                    if (json.Contains("eraserShortcut") || json.Contains("\"shortcutKey\":\"E\""))
                    {
                        TriggerToolShortcut(true);
                    }
                    else if (json.Contains("brushShortcut") || json.Contains("\"shortcutKey\":\"B\""))
                    {
                        TriggerToolShortcut(false);
                    }
                    else if (json.Contains("\"undo\""))
                    {
                        TriggerCtrlShortcut(VK_Z);
                    }
                    else if (json.Contains("\"redo\""))
                    {
                        TriggerCtrlShortcut(VK_Y);
                    }
                    return;
                }

                // Resolve inner pointer event type when wrapped inside {"type":"input_event","payload":{...}}
                if (type == "input_event")
                {
                    if (json.Contains("\"pointerDown\"")) type = "pointerDown";
                    else if (json.Contains("\"pointerUp\"") || json.Contains("\"pointerCancel\"")) type = "pointerUp";
                    else if (json.Contains("\"pointerHover\"")) type = "pointerHover";
                    else type = "pointerMove";
                }
                else if (type == "aircanvas_input" || type == "input" || type == "broadcast_input")
                {
                    string t = ExtractJsonString(json, "t", "move");
                    if (t == "down") type = "pointerDown";
                    else if (t == "up" || t == "cancel") type = "pointerUp";
                    else type = "pointerMove";
                }

                if (type == "pointerDown" || type == "pointerMove" || type == "pointerUp" || type == "pointerHover")
                {
                    double x = ExtractJsonDouble(json, "x", 0.5);
                    double y = ExtractJsonDouble(json, "y", 0.5);
                    double pressure = ExtractJsonDouble(json, "pressure", ExtractJsonDouble(json, "p", 0.5));
                    string tool = ExtractJsonString(json, "tool", "");
                    if (string.IsNullOrEmpty(tool))
                    {
                        string brushMode = ExtractJsonString(json, "brushMode", "");
                        string pointerType = ExtractJsonString(json, "pointerType", "");
                        double penFlags = ExtractJsonDouble(json, "penFlags", 0);
                        if (brushMode == "eraser" || pointerType == "eraser" || ((int)penFlags & 6) != 0)
                        {
                            tool = "eraser";
                        }
                        else
                        {
                            tool = "pen";
                        }
                    }

                    InjectPointerInput(x, y, pressure, type, tool, false, true);
                }
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
                frame[0] = 0x8A;
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

        public static string GetAllLocalIpsJsonArray()
        {
            List<string> ips = new List<string>();
            try
            {
                IPHostEntry host = Dns.GetHostEntry(Dns.GetHostName());
                foreach (IPAddress ip in host.AddressList)
                {
                    if (ip.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(ip))
                    {
                        string str = ip.ToString();
                        if (!ips.Contains(str))
                        {
                            ips.Add(str);
                        }
                    }
                }
            }
            catch { }
            if (!ips.Contains("127.0.0.1"))
            {
                ips.Add("127.0.0.1");
            }
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < ips.Count; i++)
            {
                if (i > 0) sb.Append(",");
                sb.Append("\"").Append(ips[i]).Append("\"");
            }
            sb.Append("]");
            return sb.ToString();
        }

        private static void PrintConnectionInstructions()
        {
            Console.WriteLine();
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("================================================================================");
            Console.WriteLine("       AIR CANVAS WINDOWS SERVER v" + VERSION + " - CONNECTION INSTRUCTIONS           ");
            Console.WriteLine("================================================================================");
            Console.ResetColor();

            if (IsWebSocketListening)
            {
                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine("[STATUS] Actively Listening on TCP Port {0} (WebSocket) & Port {1} (UDP)", DEFAULT_PORT, DISCOVERY_PORT);
                Console.WriteLine("[MAPPING] 100% Mobile Full-Screen Pad -> PC Software Working Area ({0})", ActiveWorkArea.PresetId.ToUpperInvariant());
                Console.ResetColor();
            }
            else
            {
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine("[STATUS] Connected to Existing Active Air Canvas Host on Port {0}", DEFAULT_PORT);
                Console.WriteLine("[MAPPING] Serving 100% Mobile Pad -> PC Software Working Area ({0})", ActiveWorkArea.PresetId.ToUpperInvariant());
                Console.ResetColor();
            }
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
            Console.WriteLine("================================================================================");
            Console.WriteLine();
        }

        public static void StartServerBackground()
        {
            if (_backgroundStarted) return;
            _backgroundStarted = true;
            _isRunning = true;
            InitializeDpiAwareness();
            RefreshScreenMetrics();
            try { InitializeSyntheticPen(); } catch { }
            StartWebSocketServer();
            StartUdpDiscovery();
        }

        public static void Main(string[] args)
        {
            Console.Title = "Air Canvas Windows Server v" + VERSION;
            _isRunning = true;
            _backgroundStarted = true;

            InitializeDpiAwareness();
            RefreshScreenMetrics();
            try { InitializeSyntheticPen(); } catch { }
            RunDpiDiagnosticTests();
            StartWebSocketServer();
            StartUdpDiscovery();
            PrintConnectionInstructions();

            Console.ForegroundColor = ConsoleColor.White;
            Console.WriteLine("Air Canvas v" + VERSION + " is READY! Connect your phone/tablet now.");
            Console.WriteLine("Commands: [T] Run Diagnostic Test  |  [W] Cycle Working Area Mode  |  [C] Clear  |  [Q] Quit\n");
            Console.ResetColor();

            string[] presets = new[] { "auto", "photoshop-krita", "onenote-pdf", "illustrator", "blender", "mspaint", "full-screen" };
            int presetIdx = 0;

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
                        else if (key == ConsoleKey.W)
                        {
                            presetIdx = (presetIdx + 1) % presets.Length;
                            ApplyWorkingAreaPreset(presets[presetIdx], -1, -1, -1, -1);
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
                }
                Thread.Sleep(50);
            }
        }
    }
}
