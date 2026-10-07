import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import {
  QrCode,
  Copy,
  Check,
  Download,
  Maximize2,
  Minimize2,
  RefreshCw,
  ExternalLink,
  Wifi,
  Smartphone,
  Info,
  Sliders,
  X,
} from 'lucide-react';
import { ConnectionManager } from '../../services/connectionManager.ts';

interface QRCodeCardProps {
  connection: ConnectionManager;
  onConnectSelf?: () => void;
}

export const QRCodeCard: React.FC<QRCodeCardProps> = ({ connection, onConnectSelf }) => {
  const [format, setFormat] = useState<'web' | 'protocol' | 'ws' | 'json'>('web');
  const [hostChoice, setHostChoice] = useState<'local' | 'origin' | 'custom'>('origin');
  const [customHost, setCustomHost] = useState(connection.localIp);
  const [copied, setCopied] = useState(false);
  const [qrTheme, setQrTheme] = useState<'crisp' | 'neon'>('crisp');
  const [isFullscreenModal, setIsFullscreenModal] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Determine effective host
  const getEffectiveHost = (): string => {
    if (hostChoice === 'local') return connection.localIp;
    if (hostChoice === 'origin') {
      return typeof window !== 'undefined' ? window.location.host : connection.localIp;
    }
    return customHost || connection.localIp;
  };

  const effectiveHost = getEffectiveHost();
  const connectionString = connection.getConnectionString(format, effectiveHost);

  // Generate QR code data URL whenever parameters change
  useEffect(() => {
    let isCurrent = true;
    setIsGenerating(true);

    const darkColor = qrTheme === 'neon' ? '#00e5ff' : '#05050e';
    const lightColor = qrTheme === 'neon' ? '#0b0c16' : '#ffffff';

    QRCode.toDataURL(connectionString, {
      width: 480,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: {
        dark: darkColor,
        light: lightColor,
      },
    })
      .then((url) => {
        if (isCurrent) {
          setQrDataUrl(url);
          setIsGenerating(false);
        }
      })
      .catch((err) => {
        console.error('Failed to generate QR code:', err);
        if (isCurrent) setIsGenerating(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [connectionString, qrTheme]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(connectionString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback copy
      const ta = document.createElement('textarea');
      ta.value = connectionString;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `aircanvas-connect-${effectiveHost.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <>
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        {/* Title & Badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 text-cyan-400 flex items-center justify-center">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-white text-sm flex items-center gap-2">
                Quick Connect QR Code
                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold tracking-wider">
                  Live
                </span>
              </h4>
              <p className="text-[11px] text-slate-400">
                Scan with mobile or tablet camera to pair instantly
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsFullscreenModal(true)}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              title="Fullscreen QR View"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              title="Download PNG QR"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* QR Code and Quick Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
          {/* QR Code Container */}
          <div className="md:col-span-5 flex flex-col items-center">
            <div
              className={`relative p-3 rounded-2xl border transition-all ${
                qrTheme === 'crisp'
                  ? 'bg-white border-slate-300 shadow-[0_0_20px_rgba(255,255,255,0.15)]'
                  : 'bg-slate-950 border-cyan-500/40 shadow-[0_0_25px_rgba(0,229,255,0.25)]'
              }`}
            >
              {qrDataUrl ? (
                <div className="relative">
                  <img
                    src={qrDataUrl}
                    alt="AirCanvas Connection QR Code"
                    className="w-44 h-44 sm:w-48 sm:h-48 rounded-lg block object-contain"
                  />
                  {/* Center Badge Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-9 h-9 rounded-xl bg-slate-950 border-2 border-cyan-400 flex items-center justify-center shadow-md">
                      <span className="text-[11px] font-black text-cyan-300 tracking-tighter">AC</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-48 h-48 flex items-center justify-center">
                  <RefreshCw className="w-6 h-6 text-slate-500 animate-spin" />
                </div>
              )}
            </div>

            {/* QR Visual Style Toggle */}
            <div className="flex items-center gap-2 mt-3 text-[11px] text-slate-400">
              <span>Theme:</span>
              <button
                type="button"
                onClick={() => setQrTheme('crisp')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  qrTheme === 'crisp'
                    ? 'bg-white text-slate-950 shadow'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Crisp White (High Contrast)
              </button>
              <button
                type="button"
                onClick={() => setQrTheme('neon')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  qrTheme === 'neon'
                    ? 'bg-cyan-500 text-slate-950 shadow'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Cyber Neon
              </button>
            </div>
          </div>

          {/* Configuration & Details */}
          <div className="md:col-span-7 space-y-3.5">
            {/* Format Selector */}
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1.5">
                QR Encoding Mode
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setFormat('web')}
                  className={`px-2.5 py-1.5 rounded-lg text-left transition-all ${
                    format === 'web'
                      ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-bold'
                      : 'bg-slate-800/80 hover:bg-slate-800 border border-transparent text-slate-400 text-xs'
                  }`}
                >
                  <div className="text-[11px] font-semibold flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5" /> Mobile Web Link
                  </div>
                  <div className="text-[9px] text-slate-400">1-tap camera connect</div>
                </button>

                <button
                  type="button"
                  onClick={() => setFormat('protocol')}
                  className={`px-2.5 py-1.5 rounded-lg text-left transition-all ${
                    format === 'protocol'
                      ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-bold'
                      : 'bg-slate-800/80 hover:bg-slate-800 border border-transparent text-slate-400 text-xs'
                  }`}
                >
                  <div className="text-[11px] font-semibold flex items-center gap-1.5">
                    <Wifi className="w-3.5 h-3.5" /> aircanvas:// URI
                  </div>
                  <div className="text-[9px] text-slate-400">Native Android/iOS App</div>
                </button>

                <button
                  type="button"
                  onClick={() => setFormat('ws')}
                  className={`px-2.5 py-1.5 rounded-lg text-left transition-all ${
                    format === 'ws'
                      ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-bold'
                      : 'bg-slate-800/80 hover:bg-slate-800 border border-transparent text-slate-400 text-xs'
                  }`}
                >
                  <div className="text-[11px] font-semibold flex items-center gap-1.5">
                    <Wifi className="w-3.5 h-3.5" /> WebSocket URI
                  </div>
                  <div className="text-[9px] text-slate-400">Direct socket string</div>
                </button>

                <button
                  type="button"
                  onClick={() => setFormat('json')}
                  className={`px-2.5 py-1.5 rounded-lg text-left transition-all ${
                    format === 'json'
                      ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-bold'
                      : 'bg-slate-800/80 hover:bg-slate-800 border border-transparent text-slate-400 text-xs'
                  }`}
                >
                  <div className="text-[11px] font-semibold flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5" /> JSON Payload
                  </div>
                  <div className="text-[9px] text-slate-400">Metadata & PIN payload</div>
                </button>
              </div>
            </div>

            {/* Target Host / IP Selection */}
            <div>
              <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                Target Host / Address
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                <button
                  type="button"
                  onClick={() => setHostChoice('origin')}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-all ${
                    hostChoice === 'origin'
                      ? 'bg-purple-600 text-white font-bold'
                      : 'bg-slate-800 text-slate-300 hover:text-white'
                  }`}
                >
                  Web App Host ({typeof window !== 'undefined' ? window.location.hostname : 'Cloud URL'})
                </button>
                <button
                  type="button"
                  onClick={() => setHostChoice('local')}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-all ${
                    hostChoice === 'local'
                      ? 'bg-purple-600 text-white font-bold'
                      : 'bg-slate-800 text-slate-300 hover:text-white'
                  }`}
                >
                  Local WiFi IP ({connection.localIp})
                </button>
                <button
                  type="button"
                  onClick={() => setHostChoice('custom')}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-all ${
                    hostChoice === 'custom'
                      ? 'bg-purple-600 text-white font-bold'
                      : 'bg-slate-800 text-slate-300 hover:text-white'
                  }`}
                >
                  Custom IP / Host
                </button>
              </div>

              {hostChoice === 'custom' && (
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={customHost}
                    onChange={(e) => setCustomHost(e.target.value)}
                    placeholder="e.g. 192.168.1.120 or mypc.local"
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                  />
                </div>
              )}
            </div>

            {/* Encoded String Preview and Copy */}
            <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-2.5">
              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                <span className="font-mono">Encoded String:</span>
                <span className="text-cyan-400 font-mono font-bold">
                  PIN: {connection.pairingPin} • Port: {connection.serverPort}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 font-mono truncate select-all">
                {connectionString}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all border border-slate-700"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-300" />
                    <span>Copy String</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDownload}
                className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all border border-slate-700"
              >
                <Download className="w-3.5 h-3.5 text-cyan-400" />
                <span>Save PNG</span>
              </button>

              {onConnectSelf && (
                <button
                  type="button"
                  onClick={onConnectSelf}
                  className="py-2 px-3 bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all"
                  title="Simulate Mobile Connect in Current Window"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Test Link</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Fullscreen QR Modal */}
      {isFullscreenModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 text-center relative animate-in fade-in zoom-in-95 duration-150">
            <button
              type="button"
              onClick={() => setIsFullscreenModal(false)}
              className="absolute top-4 right-4 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-xs font-bold mb-2">
                <Wifi className="w-3.5 h-3.5" /> AirCanvas Wireless Pairing
              </div>
              <h3 className="text-xl font-black text-white">Scan to Connect Tablet</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Open the camera app on your phone, iPad, or Android tablet and point at the QR code.
              </p>
            </div>

            {/* High-res Large QR Image */}
            <div className="flex justify-center my-4">
              <div
                className={`p-4 rounded-2xl border ${
                  qrTheme === 'crisp'
                    ? 'bg-white border-slate-300 shadow-2xl'
                    : 'bg-slate-950 border-cyan-500/50 shadow-[0_0_40px_rgba(0,229,255,0.3)]'
                }`}
              >
                <img
                  src={qrDataUrl}
                  alt="AirCanvas Fullscreen QR"
                  className="w-64 h-64 sm:w-72 sm:h-72 object-contain rounded-xl block"
                />
              </div>
            </div>

            {/* PIN & Host details */}
            <div className="flex items-center justify-center gap-6 py-2 px-4 rounded-xl bg-slate-950/70 border border-slate-800">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">HOST</span>
                <span className="text-sm font-bold font-mono text-cyan-300">{effectiveHost}</span>
              </div>
              <div className="w-px h-8 bg-slate-800" />
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">PORT</span>
                <span className="text-sm font-bold font-mono text-slate-200">{connection.serverPort}</span>
              </div>
              <div className="w-px h-8 bg-slate-800" />
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">PIN</span>
                <span className="text-sm font-black font-mono text-emerald-400 tracking-wider">
                  {connection.pairingPin}
                </span>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleCopy}
                className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 border border-slate-700 transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied Connection URL' : 'Copy Connection URL'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownload}
                className="py-3 px-4 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-cyan-500/20"
              >
                <Download className="w-4 h-4" />
                <span>Save Image</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
