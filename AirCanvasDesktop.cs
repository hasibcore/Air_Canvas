using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

namespace AirCanvas
{
    static class Program
    {
        private static HttpListener _listener;
        private static int _port = 3001;
        private static string _distDir;

        [STAThread]
        static void Main()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                _distDir = Path.Combine(baseDir, "dist");

                // 1. Launch native input receiver if present
                string serverExe = Path.Combine(baseDir, "AirCanvasServer.exe");
                if (File.Exists(serverExe) && Process.GetProcessesByName("AirCanvasServer").Length == 0)
                {
                    try
                    {
                        Process.Start(new ProcessStartInfo
                        {
                            FileName = serverExe,
                            WindowStyle = ProcessWindowStyle.Normal,
                            UseShellExecute = true
                        });
                    }
                    catch { }
                }

                // 2. Start embedded static HTTP server for production assets
                if (Directory.Exists(_distDir))
                {
                    StartStaticFileServer();
                }

                string url = "http://localhost:" + _port + "/";

                // 3. Open in standalone Edge App window (Chromium application frame)
                string edgePath = @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe";
                if (!File.Exists(edgePath))
                {
                    edgePath = @"C:\Program Files\Microsoft\Edge\Application\msedge.exe";
                }

                if (File.Exists(edgePath))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = edgePath,
                        Arguments = "--app=\"" + url + "\" --window-size=1280,850",
                        UseShellExecute = true
                    });
                }
                else
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = url,
                        UseShellExecute = true
                    });
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Error launching Air Canvas: " + ex.Message, "Air Canvas Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        static void StartStaticFileServer()
        {
            for (int p = 3001; p <= 3020; p++)
            {
                try
                {
                    var listener = new HttpListener();
                    listener.Prefixes.Add("http://localhost:" + p + "/");
                    listener.Prefixes.Add("http://127.0.0.1:" + p + "/");
                    listener.Start();
                    _listener = listener;
                    _port = p;
                    new Thread(ListenLoop) { IsBackground = true }.Start();
                    break;
                }
                catch
                {
                    // Port might already be bound, try next
                }
            }
        }

        static void ListenLoop()
        {
            while (_listener != null && _listener.IsListening)
            {
                try
                {
                    HttpListenerContext ctx = _listener.GetContext();
                    ThreadPool.QueueUserWorkItem((state) => HandleRequest(ctx));
                }
                catch { break; }
            }
        }

        static void HandleRequest(HttpListenerContext ctx)
        {
            try
            {
                string rawUrl = ctx.Request.Url.AbsolutePath.TrimStart('/');
                if (string.IsNullOrEmpty(rawUrl)) rawUrl = "index.html";

                string filePath = Path.Combine(_distDir, rawUrl.Replace('/', Path.DirectorySeparatorChar));

                // SPA fallback for routing
                if (!File.Exists(filePath))
                {
                    filePath = Path.Combine(_distDir, "index.html");
                }

                if (File.Exists(filePath))
                {
                    byte[] bytes = File.ReadAllBytes(filePath);
                    string ext = Path.GetExtension(filePath).ToLowerInvariant();
                    string mime = "application/octet-stream";
                    if (ext == ".html") mime = "text/html; charset=utf-8";
                    else if (ext == ".js") mime = "application/javascript";
                    else if (ext == ".css") mime = "text/css";
                    else if (ext == ".svg") mime = "image/svg+xml";
                    else if (ext == ".png") mime = "image/png";
                    else if (ext == ".jpg" || ext == ".jpeg") mime = "image/jpeg";
                    else if (ext == ".json") mime = "application/json";
                    else if (ext == ".ico") mime = "image/x-icon";
                    else if (ext == ".woff2") mime = "font/woff2";

                    ctx.Response.ContentType = mime;
                    ctx.Response.ContentLength64 = bytes.Length;
                    ctx.Response.OutputStream.Write(bytes, 0, bytes.Length);
                }
                else
                {
                    ctx.Response.StatusCode = 404;
                }
            }
            catch { }
            finally
            {
                try { ctx.Response.OutputStream.Close(); } catch { }
            }
        }
    }
}
