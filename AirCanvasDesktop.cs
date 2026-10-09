// ==============================================================================
// AirCanvasDesktop.cs
// Standalone Windows GUI Desktop Application & Local Asset Server
// Native Pen Injector + Embedded Zero-Config Static Server + Edge App Mode Frame
// ==============================================================================

using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using AirCanvas.Server;

namespace AirCanvas
{
    public static class Program
    {
        private static TcpListener _httpListener;
        private static int _httpPort = 3005;
        private static string _distDir;
        private static NotifyIcon _trayIcon;
        private static Process _appProcess;

        [STAThread]
        public static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                _distDir = Path.Combine(baseDir, "dist");

                // 1. Start Native Pen Digitizer Server in Background
                new Thread(() =>
                {
                    try
                    {
                        AirCanvasServer.StartServerBackground();
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine("[AirCanvasServer Error] " + ex.Message);
                    }
                })
                { IsBackground = true }.Start();

                // 2. Start Embedded Static HTTP Server via standard TcpListener (Zero-admin permissions required)
                if (Directory.Exists(_distDir))
                {
                    StartEmbeddedHttpServer();
                }

                // 3. Setup System Tray Icon
                SetupSystemTray(baseDir);

                // 4. Open Standalone Desktop App Window
                string targetUrl = "http://127.0.0.1:" + _httpPort + "/";
                LaunchAppWindow(targetUrl);

                // Keep Windows Form message pump alive
                Application.Run();
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Error launching Air Canvas: " + ex.Message,
                    "Air Canvas",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }

        private static void StartEmbeddedHttpServer()
        {
            // Find free port between 3005 and 3050 and bind to IPAddress.Any for Wi-Fi mobile client access
            for (int p = 3005; p <= 3050; p++)
            {
                try
                {
                    var listener = new TcpListener(IPAddress.Any, p);
                    listener.Start();
                    _httpListener = listener;
                    _httpPort = p;
                    new Thread(HttpListenLoop) { IsBackground = true }.Start();
                    break;
                }
                catch
                {
                    // Port in use, try next
                }
            }
        }

        private static void HttpListenLoop()
        {
            while (_httpListener != null)
            {
                try
                {
                    TcpClient client = _httpListener.AcceptTcpClient();
                    ThreadPool.QueueUserWorkItem((state) => HandleClientHttpRequest((TcpClient)state), client);
                }
                catch
                {
                    break;
                }
            }
        }

        private static void HandleClientHttpRequest(TcpClient client)
        {
            try
            {
                using (client)
                using (NetworkStream stream = client.GetStream())
                {
                    byte[] buffer = new byte[8192];
                    int bytesRead = stream.Read(buffer, 0, buffer.Length);
                    if (bytesRead <= 0) return;

                    string requestText = Encoding.UTF8.GetString(buffer, 0, bytesRead);
                    string[] lines = requestText.Split(new[] { "\r\n" }, StringSplitOptions.None);
                    if (lines.Length == 0) return;

                    string[] requestLine = lines[0].Split(' ');
                    if (requestLine.Length < 2) return;

                    string rawPath = requestLine[1].Split('?')[0].TrimStart('/');

                    // LAN Discovery / Network-Info Endpoint for Mobile Pair Detection
                    if (rawPath == "api/network-info" || rawPath == "api/ip")
                    {
                        string primaryIp = AirCanvasServer.GetPrimaryLocalIp();
                        string json = "{\"ip\":\"" + primaryIp + "\",\"allIps\":[\"" + primaryIp + "\"],\"webPort\":" + _httpPort + ",\"serverPort\":9090,\"pin\":\"1234\"}";
                        byte[] jsonBytes = Encoding.UTF8.GetBytes(json);
                        string header = "HTTP/1.1 200 OK\r\n" +
                                        "Content-Type: application/json; charset=utf-8\r\n" +
                                        "Content-Length: " + jsonBytes.Length + "\r\n" +
                                        "Access-Control-Allow-Origin: *\r\n" +
                                        "Connection: close\r\n\r\n";
                        byte[] hBytes = Encoding.UTF8.GetBytes(header);
                        stream.Write(hBytes, 0, hBytes.Length);
                        stream.Write(jsonBytes, 0, jsonBytes.Length);
                        return;
                    }

                    if (string.IsNullOrEmpty(rawPath)) rawPath = "index.html";

                    string localPath = Path.Combine(_distDir, rawPath.Replace('/', Path.DirectorySeparatorChar));

                    // Single Page Application (SPA) routing fallback
                    if (!File.Exists(localPath))
                    {
                        localPath = Path.Combine(_distDir, "index.html");
                    }

                    if (File.Exists(localPath))
                    {
                        byte[] fileBytes = File.ReadAllBytes(localPath);
                        string ext = Path.GetExtension(localPath).ToLowerInvariant();
                        string contentType = "application/octet-stream";

                        if (ext == ".html") contentType = "text/html; charset=utf-8";
                        else if (ext == ".js" || ext == ".mjs") contentType = "application/javascript; charset=utf-8";
                        else if (ext == ".css") contentType = "text/css; charset=utf-8";
                        else if (ext == ".svg") contentType = "image/svg+xml";
                        else if (ext == ".png") contentType = "image/png";
                        else if (ext == ".jpg" || ext == ".jpeg") contentType = "image/jpeg";
                        else if (ext == ".json") contentType = "application/json";
                        else if (ext == ".ico") contentType = "image/x-icon";
                        else if (ext == ".woff2") contentType = "font/woff2";
                        else if (ext == ".woff") contentType = "font/woff";
                        else if (ext == ".apk") contentType = "application/vnd.android.package-archive";
                        else if (ext == ".zip") contentType = "application/zip";

                        string header = "HTTP/1.1 200 OK\r\n" +
                                        "Content-Type: " + contentType + "\r\n" +
                                        "Content-Length: " + fileBytes.Length + "\r\n" +
                                        "Connection: close\r\n" +
                                        "Access-Control-Allow-Origin: *\r\n\r\n";

                        byte[] headerBytes = Encoding.UTF8.GetBytes(header);
                        stream.Write(headerBytes, 0, headerBytes.Length);
                        stream.Write(fileBytes, 0, fileBytes.Length);
                    }
                    else
                    {
                        string notFound = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                        byte[] notFoundBytes = Encoding.UTF8.GetBytes(notFound);
                        stream.Write(notFoundBytes, 0, notFoundBytes.Length);
                    }
                }
            }
            catch { }
        }

        private static void LaunchAppWindow(string url)
        {
            try
            {
                // Prefer Microsoft Edge in frameless Standalone App mode
                string edgePath = @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe";
                if (!File.Exists(edgePath))
                {
                    edgePath = @"C:\Program Files\Microsoft\Edge\Application\msedge.exe";
                }

                if (File.Exists(edgePath))
                {
                    var psi = new ProcessStartInfo
                    {
                        FileName = edgePath,
                        Arguments = "--app=\"" + url + "\" --window-size=1360,860",
                        UseShellExecute = true
                    };
                    _appProcess = Process.Start(psi);
                    return;
                }

                // Check Google Chrome as fallback
                string chromePath = @"C:\Program Files\Google\Chrome\Application\chrome.exe";
                if (!File.Exists(chromePath))
                {
                    chromePath = @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe";
                }

                if (File.Exists(chromePath))
                {
                    var psi = new ProcessStartInfo
                    {
                        FileName = chromePath,
                        Arguments = "--app=\"" + url + "\" --window-size=1360,860",
                        UseShellExecute = true
                    };
                    _appProcess = Process.Start(psi);
                    return;
                }

                // Default system browser fallback
                Process.Start(new ProcessStartInfo
                {
                    FileName = url,
                    UseShellExecute = true
                });
            }
            catch { }
        }

        private static void SetupSystemTray(string baseDir)
        {
            try
            {
                _trayIcon = new NotifyIcon();
                _trayIcon.Text = "Air Canvas - Wireless Graphics Tablet";

                // Load custom app icon if available
                string icoPath = Path.Combine(baseDir, "app.ico");
                if (File.Exists(icoPath))
                {
                    _trayIcon.Icon = new Icon(icoPath);
                }
                else
                {
                    _trayIcon.Icon = SystemIcons.Application;
                }

                var contextMenu = new ContextMenuStrip();
                contextMenu.Items.Add("🎨 Open Drawing Studio", null, (s, e) => LaunchAppWindow("http://127.0.0.1:" + _httpPort + "/?view=studio"));
                contextMenu.Items.Add("📱 Open Tablet Mode", null, (s, e) => LaunchAppWindow("http://127.0.0.1:" + _httpPort + "/?view=tablet"));
                contextMenu.Items.Add("🌉 Dual-Device Bridge", null, (s, e) => LaunchAppWindow("http://127.0.0.1:" + _httpPort + "/?view=bridge"));
                contextMenu.Items.Add(new ToolStripSeparator());
                contextMenu.Items.Add("❌ Exit Air Canvas", null, (s, e) =>
                {
                    try { _trayIcon.Visible = false; } catch { }
                    try { if (_httpListener != null) _httpListener.Stop(); } catch { }
                    Application.Exit();
                    Environment.Exit(0);
                });

                _trayIcon.ContextMenuStrip = contextMenu;
                _trayIcon.DoubleClick += (s, e) => LaunchAppWindow("http://127.0.0.1:" + _httpPort + "/");
                _trayIcon.Visible = true;
            }
            catch { }
        }
    }
}
