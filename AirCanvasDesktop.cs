// ==============================================================================
// AirCanvasDesktop.cs
// Standalone Windows GUI Desktop Application & Local Asset Server (v2.0.3 PRO)
// Native Pen Injector + Built-in WinForms Host Window + Embedded HTTP/WS Server
// ==============================================================================

using System;
using System.Collections.Generic;
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
        private static Form _hostForm;
        private static Label _statusBannerLabel;
        private static Label _ipValueLabel;
        private static Label _packetsLabel;

        [STAThread]
        public static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                _distDir = Path.Combine(baseDir, "dist");

                // 1. Start Native Pen Digitizer Server (TCP 9090 + UDP 9091 + Firewall + ADB Reverse)
                Thread srvThread = new Thread(() =>
                {
                    try
                    {
                        AirCanvasServer.StartServerBackground();
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine("[AirCanvasServer Error] " + ex.Message);
                    }
                });
                srvThread.IsBackground = true;
                srvThread.Start();

                // 2. Always Start Embedded HTTP/WebSocket Server (serves dist/ if present, or built-in HTML dashboard if standalone AirCanvas.exe)
                StartEmbeddedHttpServer();

                // 3. Setup System Tray Icon
                SetupSystemTray(baseDir);

                // 4. If dist/ exists, also launch the full Web Studio window in Edge/Chrome app mode
                if (Directory.Exists(_distDir))
                {
                    string targetUrl = "http://127.0.0.1:" + _httpPort + "/";
                    LaunchAppWindow(targetUrl);
                }

                // 5. Run Native Windows Host Control Window so user ALWAYS sees PC IP:9090 and Live 2-Device Connection Status
                _hostForm = CreateHostControlForm(baseDir);
                Application.Run(_hostForm);
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Error launching Air Canvas: " + ex.Message,
                    "Air Canvas v2.0.3",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }

        private static Form CreateHostControlForm(string baseDir)
        {
            Form form = new Form();
            form.Text = "Air Canvas v" + AirCanvasServer.VERSION + " — Windows PC Host & 2-Device Connector";
            form.Size = new Size(560, 410);
            form.FormBorderStyle = FormBorderStyle.FixedSingle;
            form.MaximizeBox = false;
            form.StartPosition = FormStartPosition.CenterScreen;
            form.BackColor = Color.FromArgb(12, 14, 24);
            form.ForeColor = Color.White;

            string icoPath = Path.Combine(baseDir, "app.ico");
            if (File.Exists(icoPath))
            {
                try { form.Icon = new Icon(icoPath); } catch { }
            }

            Label titleLbl = new Label();
            titleLbl.Text = "AIR CANVAS v" + AirCanvasServer.VERSION + " — PC HOST SERVER";
            titleLbl.Font = new Font("Segoe UI", 12F, FontStyle.Bold);
            titleLbl.ForeColor = Color.FromArgb(0, 229, 255);
            titleLbl.Location = new Point(20, 18);
            titleLbl.Size = new Size(500, 26);
            form.Controls.Add(titleLbl);

            _statusBannerLabel = new Label();
            _statusBannerLabel.Text = "WAITING FOR ANDROID / TABLET TO CONNECT (PORT 9090)...";
            _statusBannerLabel.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
            _statusBannerLabel.BackColor = Color.FromArgb(24, 30, 52);
            _statusBannerLabel.ForeColor = Color.FromArgb(255, 214, 0);
            _statusBannerLabel.TextAlign = ContentAlignment.MiddleLeft;
            _statusBannerLabel.Padding = new Padding(12, 0, 0, 0);
            _statusBannerLabel.Location = new Point(20, 52);
            _statusBannerLabel.Size = new Size(505, 44);
            form.Controls.Add(_statusBannerLabel);

            Label ipHeaderLbl = new Label();
            ipHeaderLbl.Text = "ENTER THIS PC LOCAL IP & PORT IN YOUR ANDROID APK (OR TAP AUTO-DETECT):";
            ipHeaderLbl.Font = new Font("Segoe UI", 8.5F, FontStyle.Bold);
            ipHeaderLbl.ForeColor = Color.FromArgb(170, 180, 200);
            ipHeaderLbl.Location = new Point(20, 110);
            ipHeaderLbl.Size = new Size(505, 20);
            form.Controls.Add(ipHeaderLbl);

            string primaryIp = AirCanvasServer.GetPrimaryLocalIp();
            _ipValueLabel = new Label();
            _ipValueLabel.Text = "IP: " + primaryIp + "    |    Port: 9090    |    PIN: 1234";
            _ipValueLabel.Font = new Font("Consolas", 13F, FontStyle.Bold);
            _ipValueLabel.BackColor = Color.FromArgb(18, 22, 38);
            _ipValueLabel.ForeColor = Color.FromArgb(0, 230, 118);
            _ipValueLabel.TextAlign = ContentAlignment.MiddleCenter;
            _ipValueLabel.Location = new Point(20, 134);
            _ipValueLabel.Size = new Size(505, 48);
            form.Controls.Add(_ipValueLabel);

            List<string> allIps = AirCanvasServer.GetAllLocalIpsList();
            Label allIpsLbl = new Label();
            allIpsLbl.Text = "All PC Adapters: " + string.Join(", ", allIps.ToArray()) + "  •  USB ADB: 127.0.0.1:9090";
            allIpsLbl.Font = new Font("Segoe UI", 8.5F, FontStyle.Regular);
            allIpsLbl.ForeColor = Color.FromArgb(140, 155, 180);
            allIpsLbl.Location = new Point(20, 188);
            allIpsLbl.Size = new Size(505, 22);
            form.Controls.Add(allIpsLbl);

            _packetsLabel = new Label();
            _packetsLabel.Text = "1:1 Working Area: Auto-Detect PC App  •  Packets Received: 0";
            _packetsLabel.Font = new Font("Segoe UI", 9F, FontStyle.Regular);
            _packetsLabel.ForeColor = Color.FromArgb(180, 195, 220);
            _packetsLabel.Location = new Point(20, 214);
            _packetsLabel.Size = new Size(505, 22);
            form.Controls.Add(_packetsLabel);

            Button copyBtn = new Button();
            copyBtn.Text = "Copy IP:9090";
            copyBtn.Font = new Font("Segoe UI", 9.5F, FontStyle.Bold);
            copyBtn.BackColor = Color.FromArgb(0, 229, 255);
            copyBtn.ForeColor = Color.Black;
            copyBtn.FlatStyle = FlatStyle.Flat;
            copyBtn.Location = new Point(20, 250);
            copyBtn.Size = new Size(155, 40);
            copyBtn.Click += (s, e) =>
            {
                try
                {
                    Clipboard.SetText(AirCanvasServer.GetPrimaryLocalIp() + ":9090");
                    copyBtn.Text = "Copied!";
                }
                catch { }
            };
            form.Controls.Add(copyBtn);

            Button studioBtn = new Button();
            studioBtn.Text = "Open Web Studio";
            studioBtn.Font = new Font("Segoe UI", 9.5F, FontStyle.Bold);
            studioBtn.BackColor = Color.FromArgb(32, 42, 72);
            studioBtn.ForeColor = Color.White;
            studioBtn.FlatStyle = FlatStyle.Flat;
            studioBtn.Location = new Point(190, 250);
            studioBtn.Size = new Size(165, 40);
            studioBtn.Click += (s, e) => LaunchAppWindow("http://127.0.0.1:" + _httpPort + "/");
            form.Controls.Add(studioBtn);

            Button fwBtn = new Button();
            fwBtn.Text = "Unblock Firewall & USB";
            fwBtn.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            fwBtn.BackColor = Color.FromArgb(32, 42, 72);
            fwBtn.ForeColor = Color.FromArgb(0, 230, 118);
            fwBtn.FlatStyle = FlatStyle.Flat;
            fwBtn.Location = new Point(370, 250);
            fwBtn.Size = new Size(155, 40);
            fwBtn.Click += (s, e) =>
            {
                AirCanvasServer.EnsureFirewallRules();
                AirCanvasServer.StartUsbAdbAutoReverse();
                MessageBox.Show(
                    "Windows Firewall rules for TCP 9090, TCP 3005, and UDP 9091 + USB ADB Reverse have been refreshed!\n\nPC Local IP: " + AirCanvasServer.GetPrimaryLocalIp() + ":9090",
                    "Air Canvas Firewall & USB Ready",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
            };
            form.Controls.Add(fwBtn);

            Label helpLbl = new Label();
            helpLbl.Text = "Tip: Open the Air Canvas Android app on the same Wi-Fi — it will auto-detect and connect to " + primaryIp + ":9090 automatically, or enter " + primaryIp + " and port 9090.";
            helpLbl.Font = new Font("Segoe UI", 8.5F, FontStyle.Regular);
            helpLbl.ForeColor = Color.FromArgb(145, 160, 185);
            helpLbl.Location = new Point(20, 305);
            helpLbl.Size = new Size(505, 48);
            form.Controls.Add(helpLbl);

            System.Windows.Forms.Timer uiTimer = new System.Windows.Forms.Timer();
            uiTimer.Interval = 500;
            uiTimer.Tick += (s, e) =>
            {
                try
                {
                    int tablets = AirCanvasServer.GetConnectedTabletCount();
                    string curIp = AirCanvasServer.GetPrimaryLocalIp();
                    _ipValueLabel.Text = "IP: " + curIp + "    |    Port: 9090    |    PIN: 1234";
                    if (tablets > 0)
                    {
                        _statusBannerLabel.Text = "CONNECTED: Android Tablet (" + AirCanvasServer.LastConnectedTabletEndpoint + ") • LIVE";
                        _statusBannerLabel.BackColor = Color.FromArgb(14, 58, 42);
                        _statusBannerLabel.ForeColor = Color.FromArgb(0, 230, 118);
                    }
                    else
                    {
                        _statusBannerLabel.Text = "READY & LISTENING ON " + curIp + ":9090 — OPEN ANDROID APP TO CONNECT";
                        _statusBannerLabel.BackColor = Color.FromArgb(24, 30, 52);
                        _statusBannerLabel.ForeColor = Color.FromArgb(255, 214, 0);
                    }
                    _packetsLabel.Text = "1:1 Working Area: " + (AirCanvasServer.ActiveWorkArea.DetectedAppName ?? "Auto-Detect") +
                                         "  •  Packets Received: " + AirCanvasServer.TotalPacketsReceived;
                }
                catch { }
            };
            uiTimer.Start();

            return form;
        }

        private static void StartEmbeddedHttpServer()
        {
            for (int p = 3005; p <= 3050; p++)
            {
                try
                {
                    var listener = new TcpListener(IPAddress.Any, p);
                    listener.Start();
                    _httpListener = listener;
                    _httpPort = p;
                    Thread listenThread = new Thread(HttpListenLoop);
                    listenThread.IsBackground = true;
                    listenThread.Start();
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
                    Thread t = new Thread(() => HandleClientHttpRequest(client));
                    t.IsBackground = true;
                    t.Start();
                }
                catch
                {
                    break;
                }
            }
        }

        private static void HandleClientHttpRequest(TcpClient client)
        {
            NetworkStream stream = null;
            try
            {
                client.NoDelay = true;
                stream = client.GetStream();

                byte[] buffer = new byte[8192];
                int bytesRead = stream.Read(buffer, 0, buffer.Length);
                if (bytesRead <= 0)
                {
                    try { client.Close(); } catch { }
                    return;
                }

                string requestText = Encoding.UTF8.GetString(buffer, 0, bytesRead);

                // Support WebSocket connections directly on the Desktop HTTP Port (3005) as well as Port 9090
                if (requestText.IndexOf("Upgrade: websocket", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    AirCanvasServer.HandleWebSocketStream(client, stream, requestText);
                    return;
                }

                string[] lines = requestText.Split(new[] { "\r\n" }, StringSplitOptions.None);
                if (lines.Length == 0)
                {
                    try { client.Close(); } catch { }
                    return;
                }

                string[] requestLine = lines[0].Split(' ');
                if (requestLine.Length < 2)
                {
                    try { client.Close(); } catch { }
                    return;
                }

                string rawPath = requestLine[1].Split('?')[0].TrimStart('/');

                // LAN Discovery / Network-Info Endpoint for Mobile Pair Detection
                if (rawPath == "api/network-info" || rawPath == "api/ip")
                {
                    string primaryIp = AirCanvasServer.GetPrimaryLocalIp();
                    string allIpsJson = AirCanvasServer.GetAllLocalIpsJsonArray();
                    int connectedTablets = AirCanvasServer.GetConnectedTabletCount();
                    string json = "{\"ip\":\"" + primaryIp + "\",\"allIps\":" + allIpsJson + ",\"webPort\":" + _httpPort + ",\"serverPort\":9090,\"pin\":\"1234\",\"connectedTablets\":" + connectedTablets + ",\"version\":\"" + AirCanvasServer.VERSION + "\"}";
                    byte[] jsonBytes = Encoding.UTF8.GetBytes(json);
                    string header = "HTTP/1.1 200 OK\r\n" +
                                    "Content-Type: application/json; charset=utf-8\r\n" +
                                    "Content-Length: " + jsonBytes.Length + "\r\n" +
                                    "Access-Control-Allow-Origin: *\r\n" +
                                    "Connection: close\r\n\r\n";
                    byte[] hBytes = Encoding.UTF8.GetBytes(header);
                    stream.Write(hBytes, 0, hBytes.Length);
                    stream.Write(jsonBytes, 0, jsonBytes.Length);
                    try { client.Close(); } catch { }
                    return;
                }

                if (string.IsNullOrEmpty(rawPath)) rawPath = "index.html";

                if (Directory.Exists(_distDir))
                {
                    string localPath = Path.Combine(_distDir, rawPath.Replace('/', Path.DirectorySeparatorChar));

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
                        try { client.Close(); } catch { }
                        return;
                    }
                }

                // Built-in Standalone HTML Dashboard when AirCanvas.exe is downloaded directly without dist/ folder
                string ipNow = AirCanvasServer.GetPrimaryLocalIp();
                string fallbackHtml = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Air Canvas v" + AirCanvasServer.VERSION + "</title>" +
                    "<style>body{background:#0A0A14;color:#fff;font-family:Segoe UI,sans-serif;padding:32px;max-width:680px;margin:0 auto;}" +
                    ".card{background:#141628;border:1px solid #00E5FF55;border-radius:14px;padding:24px;margin-top:20px;}" +
                    ".ip{font-size:28px;font-weight:bold;color:#00E676;font-family:Consolas,monospace;margin:12px 0;}</style></head><body>" +
                    "<h2 style='color:#00E5FF;margin:0'>Air Canvas v" + AirCanvasServer.VERSION + " — Windows PC Host</h2>" +
                    "<div class='card'><div id='st' style='color:#FFD600;font-weight:bold'>Listening for Android Tablet on Port 9090...</div>" +
                    "<div class='ip'>IP: " + ipNow + "  |  Port: 9090</div>" +
                    "<p style='color:#aaa;font-size:14px'>Open the Air Canvas app on your Android phone/tablet on the same Wi-Fi. It will auto-detect and connect to <b>" + ipNow + ":9090</b> automatically.</p></div>" +
                    "<script>setInterval(function(){fetch('/api/network-info').then(function(r){return r.json()}).then(function(d){" +
                    "var el=document.getElementById('st');if(d.connectedTablets>0){el.style.color='#00E676';el.innerText='CONNECTED ('+d.connectedTablets+' Tablet Active on '+d.ip+':9090)';}" +
                    "else{el.style.color='#FFD600';el.innerText='Waiting for Android / Tablet on '+d.ip+':9090...';}});},1000);</script></body></html>";
                byte[] htmlBytes = Encoding.UTF8.GetBytes(fallbackHtml);
                string htmlHeader = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: " + htmlBytes.Length + "\r\nConnection: close\r\n\r\n";
                byte[] htmlHeaderBytes = Encoding.UTF8.GetBytes(htmlHeader);
                stream.Write(htmlHeaderBytes, 0, htmlHeaderBytes.Length);
                stream.Write(htmlBytes, 0, htmlBytes.Length);
                try { client.Close(); } catch { }
            }
            catch
            {
                try { client.Close(); } catch { }
            }
        }

        private static void LaunchAppWindow(string url)
        {
            try
            {
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
                _trayIcon.Text = "Air Canvas v" + AirCanvasServer.VERSION + " - Wireless Graphics Tablet";

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
                contextMenu.Items.Add("🖥️ Show PC Host Control Panel", null, (s, e) =>
                {
                    if (_hostForm != null)
                    {
                        _hostForm.Show();
                        _hostForm.WindowState = FormWindowState.Normal;
                        _hostForm.BringToFront();
                    }
                });
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
                _trayIcon.DoubleClick += (s, e) =>
                {
                    if (_hostForm != null)
                    {
                        _hostForm.Show();
                        _hostForm.WindowState = FormWindowState.Normal;
                        _hostForm.BringToFront();
                    }
                };
                _trayIcon.Visible = true;
            }
            catch { }
        }
    }
}
