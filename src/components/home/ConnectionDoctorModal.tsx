import React, { useState, useEffect } from 'react';
import {
  X,
  Wifi,
  Cable,
  QrCode,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Download,
  HelpCircle,
  ExternalLink,
  Smartphone,
  Monitor,
  Terminal,
  ShieldCheck,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { ConnectionManager } from '../../services/connectionManager.ts';
import QRCode from 'qrcode';

interface ConnectionDoctorModalProps {
  isOpen: boolean;
  onClose: () => void;
  connection: ConnectionManager;
  onOpenDrawingScreen?: () => void;
}

export const ConnectionDoctorModal: React.FC<ConnectionDoctorModalProps> = ({
  isOpen,
  onClose,
  connection,
  onOpenDrawingScreen,
}) => {
  const [activeTab, setActiveTab] = useState<'wifi' | 'usb' | 'qr'>('wifi');
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [customIp, setCustomIp] = useState(connection.localIp);
  const [isDetectingIp, setIsDetectingIp] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const adbCommand = 'adb reverse tcp:9090 tcp:9090';

  useEffect(() => {
    if (!isOpen) return;
    setCustomIp(connection.localIp);
    generateQr(connection.localIp);
  }, [isOpen, connection.localIp]);

  const generateQr = (ip: string) => {
    const targetUrl = `aircanvas://connect?ip=${encodeURIComponent(ip)}&port=${connection.serverPort}&pin=${connection.pairingPin}`;
    QRCode.toDataURL(targetUrl, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: {
        dark: '#05050e',
        light: '#ffffff',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error(err));
  };

  if (!isOpen) return null;

  const handleCopy = (text: string, id: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedCmd(id);
      setTimeout(() => setCopiedCmd(null), 2200);
    } catch {
      setCopiedCmd(id);
      setTimeout(() => setCopiedCmd(null), 2200);
    }
  };

  const handleDetectIp = async () => {
    setIsDetectingIp(true);
    const detected = await connection.autoDetectLocalIp();
    setIsDetectingIp(false);
    if (detected) {
      setCustomIp(detected);
      connection.setLocalIp(detected);
      generateQr(detected);
    }
  };

  const handleSaveIp = (ip: string) => {
    const clean = ip.trim();
    if (clean) {
      setCustomIp(clean);
      connection.setLocalIp(clean);
      generateQr(clean);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col text-slate-100">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60 sticky top-0 z-10 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-emerald-500 flex items-center justify-center text-slate-950 shadow-md">
              <Zap className="w-5 h-5 font-black" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Connection Doctor & Troubleshooter</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30">
                  Step-by-Step
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Fix device connection issues across Same Wi-Fi, USB Cable, and QR Code
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="p-4 border-b border-slate-800/80 bg-slate-950/40">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('wifi')}
              className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                activeTab === 'wifi'
                  ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 font-bold shadow'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <Wifi className="w-4 h-4 text-emerald-400" />
                <span>1. Same Wi-Fi</span>
              </div>
              <span className="text-[9px] text-slate-400">Wireless LAN Direct</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('usb')}
              className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                activeTab === 'usb'
                  ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300 font-bold shadow'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <Cable className="w-4 h-4 text-cyan-400" />
                <span>2. USB Cable</span>
              </div>
              <span className="text-[9px] text-slate-400">0ms Zero-Lag • 240Hz</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('qr')}
              className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                activeTab === 'qr'
                  ? 'bg-purple-500/15 border-purple-500/50 text-purple-300 font-bold shadow'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <QrCode className="w-4 h-4 text-purple-400" />
                <span>3. QR Code</span>
              </div>
              <span className="text-[9px] text-slate-400">1-Tap Camera Scan</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 text-xs">
          {activeTab === 'wifi' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Step 1: PC IP Check */}
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-[10px] flex items-center justify-center">
                      1
                    </span>
                    <h4 className="font-bold text-white text-sm">
                      Check your PC&apos;s Local Wi-Fi IP Address
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={handleDetectIp}
                    disabled={isDetectingIp}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-semibold flex items-center gap-1.5 transition-all"
                  >
                    <RefreshCw className={`w-3 h-3 ${isDetectingIp ? 'animate-spin' : ''}`} />
                    <span>{isDetectingIp ? 'Detecting...' : 'Auto-Detect IP'}</span>
                  </button>
                </div>

                <p className="text-slate-400 leading-relaxed">
                  Your phone and PC must be connected to the <strong className="text-slate-200">same Wi-Fi router</strong>.
                  Enter your PC&apos;s current IP address below:
                </p>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={customIp}
                    onChange={(e) => setCustomIp(e.target.value)}
                    placeholder="e.g. 192.168.1.100"
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveIp(customIp)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-all"
                  >
                    Set IP
                  </button>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px] text-slate-400 space-y-1">
                  <div className="text-slate-300 font-semibold flex items-center gap-1">
                    <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                    <span>How to find your PC IP in Windows:</span>
                  </div>
                  <p>
                    Open CMD (Command Prompt), type <code className="text-cyan-300 bg-slate-950 px-1.5 py-0.5 rounded font-mono">ipconfig</code> and press Enter. Look for <strong className="text-slate-200">IPv4 Address</strong> (usually starting with 192.168.x.x or 10.x.x.x).
                  </p>
                </div>
              </div>

              {/* Step 2: Windows Firewall */}
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-[10px] flex items-center justify-center">
                    2
                  </span>
                  <h4 className="font-bold text-white text-sm">
                    Allow Windows Firewall Port 9090
                  </h4>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Windows Defender Firewall may block incoming connections on port 9090. Run <strong className="text-slate-200">Fix_Firewall.bat</strong> to unblock it instantly:
                </p>
                <div className="flex items-center gap-2">
                  <a
                    href="/downloads/AirCanvas-Windows-x64.zip"
                    download="AirCanvas-Windows-x64.zip"
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold flex items-center gap-1.5 transition-all text-xs"
                  >
                    <Download className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Download Fix_Firewall.bat</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => handleCopy('netsh advfirewall firewall add rule name="AIRCanvas 9090" dir=in action=allow protocol=TCP localport=9090', 'fw')}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold flex items-center gap-1.5 transition-all text-xs"
                  >
                    {copiedCmd === 'fw' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCmd === 'fw' ? 'Copied Command' : 'Copy Firewall CMD'}</span>
                  </button>
                </div>
              </div>

              {/* Step 3: Phone App */}
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-[10px] flex items-center justify-center">
                    3
                  </span>
                  <h4 className="font-bold text-white text-sm">
                    Connect on Phone App
                  </h4>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  In your phone app, select <strong className="text-emerald-300">📶 Wi-Fi LAN</strong> and tap <strong className="text-cyan-300">🔍 Auto-Detect PC</strong>. It will probe your local subnet and connect automatically in under 1 second!
                </p>
              </div>
            </div>
          )}

          {activeTab === 'usb' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="p-4 rounded-2xl bg-cyan-950/20 border border-cyan-500/30 space-y-2">
                <div className="flex items-center gap-2 text-cyan-300 font-bold text-sm">
                  <Zap className="w-4 h-4 text-cyan-400" />
                  <span>Why USB Cable Mode is Recommended:</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  USB mode provides <strong className="text-white">0ms latency</strong>, zero Wi-Fi jitter, and a smooth 240Hz polling rate. It works even if you don&apos;t have a Wi-Fi router!
                </p>
              </div>

              {/* Step 1: USB Debugging */}
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 font-bold text-[10px] flex items-center justify-center">
                    1
                  </span>
                  <h4 className="font-bold text-white text-sm">
                    Enable USB Debugging on your Phone
                  </h4>
                </div>
                <ul className="list-disc list-inside text-slate-400 space-y-1">
                  <li>Go to Phone <strong className="text-slate-200">Settings &gt; About Phone</strong>.</li>
                  <li>Tap <strong className="text-slate-200">&apos;Build Number&apos;</strong> 7 times to enable Developer Options.</li>
                  <li>Go to <strong className="text-slate-200">Settings &gt; Developer Options</strong> and turn ON <strong className="text-cyan-300">&apos;USB Debugging&apos;</strong>.</li>
                </ul>
              </div>

              {/* Step 2: Plug Cable & Run ADB Reverse */}
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 font-bold text-[10px] flex items-center justify-center">
                    2
                  </span>
                  <h4 className="font-bold text-white text-sm">
                    Run Port Forwarding on PC
                  </h4>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Connect your phone with a USB cable. On your PC, run the following command in Command Prompt (CMD):
                </p>

                <div className="p-3 bg-black/60 border border-slate-800 rounded-xl flex items-center justify-between font-mono text-cyan-300 text-xs">
                  <span>{adbCommand}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(adbCommand, 'adb')}
                    className="p-1 hover:text-white rounded transition-colors"
                    title="Copy command"
                  >
                    {copiedCmd === 'adb' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                <div className="text-[11px] text-slate-400">
                  <span>Or run </span>
                  <code className="text-cyan-300 bg-slate-900 px-1 py-0.5 rounded font-mono">Start_AirCanvas_USB.bat</code>
                  <span> included in the Windows release bundle!</span>
                </div>
              </div>

              {/* Step 3: Connect in App */}
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 font-bold text-[10px] flex items-center justify-center">
                    3
                  </span>
                  <h4 className="font-bold text-white text-sm">
                    Tap [Connect USB] in the Mobile App
                  </h4>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  In your phone app, select <strong className="text-cyan-300">🔌 USB Cable (127.0.0.1:9090)</strong> and tap <strong className="text-white">Connect USB</strong>. You will be connected instantly with 0ms latency!
                </p>
              </div>
            </div>
          )}

          {activeTab === 'qr' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row items-center gap-6">
                <div className="w-40 h-40 bg-white p-2 rounded-2xl shadow-lg border border-slate-700 shrink-0 flex items-center justify-center">
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt="AirCanvas QR Code" className="w-full h-full object-contain" />
                  ) : (
                    <RefreshCw className="w-6 h-6 animate-spin text-slate-500" />
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-purple-300 font-bold text-sm">
                    <QrCode className="w-4 h-4" />
                    <span>How to Scan the QR Code:</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed text-xs">
                    1. Open your phone camera or Google Lens.<br />
                    2. Point at this QR code.<br />
                    3. If using the mobile browser, tap the link to draw in browser.<br />
                    4. If using the AirCanvas APK, tap <strong className="text-purple-300">&apos;📋 Paste Scanned QR Link&apos;</strong> in the app!
                  </p>
                  <div className="text-[11px] text-slate-400">
                    Encoded Target: <code className="text-cyan-300 font-mono">{customIp}:{connection.serverPort}</code> (PIN: {connection.pairingPin})
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Current IP: <strong className="text-white font-mono">{customIp}:{connection.serverPort}</strong> (PIN: {connection.pairingPin})
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-all shadow-md"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
