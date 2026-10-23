import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  QrCode,
  Copy,
  Check,
  Maximize2,
  RefreshCw,
  Wifi,
  X,
  Cloud,
  Cable,
} from 'lucide-react';
import { ConnectionManager } from '../../services/connectionManager.ts';

interface QRCodeCardProps {
  connection: ConnectionManager;
  onConnectSelf?: () => void;
}

export const QRCodeCard: React.FC<QRCodeCardProps> = ({ connection }) => {
  const [connectionMode, setConnectionMode] = useState<'cloud' | 'wifi' | 'usb'>('cloud');
  const [copied, setCopied] = useState(false);
  const [isFullscreenModal, setIsFullscreenModal] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const getEffectiveHost = (): string => {
    if (connectionMode === 'cloud') {
      return typeof window !== 'undefined' ? window.location.host : connection.localIp;
    }
    if (connectionMode === 'usb') {
      return '127.0.0.1';
    }
    return connection.localIp;
  };

  const effectiveHost = getEffectiveHost();
  const connectionString = connection.getConnectionString('web', effectiveHost, connectionMode);

  useEffect(() => {
    let isCurrent = true;
    QRCode.toDataURL(connectionString, {
      width: 420,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#05050e',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (isCurrent) setQrDataUrl(url);
      })
      .catch(() => {});

    return () => {
      isCurrent = false;
    };
  }, [connectionString]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(connectionString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = connectionString;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          {/* Scannable QR Code */}
          <div className="md:col-span-4 flex flex-col items-center">
            <div className="relative p-2.5 rounded-2xl bg-white border border-slate-200 shadow-lg">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Pair Mobile QR"
                  className="w-36 h-36 sm:w-40 sm:h-40 rounded-lg block object-contain"
                />
              ) : (
                <div className="w-36 h-36 flex items-center justify-center">
                  <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
                </div>
              )}
              <button
                type="button"
                onClick={() => setIsFullscreenModal(true)}
                className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-slate-900/90 text-white hover:bg-slate-800 transition-colors shadow"
                title="Enlarge QR Code"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Transport Selector & PIN Pairing Controls */}
          <div className="md:col-span-8 min-w-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <QrCode className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="font-bold text-white text-sm truncate">
                  Scan QR or Enter IP / PIN on Mobile
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono tabular-nums shrink-0">
                <span className="text-cyan-300 font-bold">
                  IP: {connection.localIp}:{connection.serverPort}
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-emerald-400 font-bold">
                  PIN: {connection.pairingPin}
                </span>
              </div>
            </div>

            {/* Transport Mode Tabs */}
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setConnectionMode('cloud')}
                className={`py-2 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border whitespace-nowrap ${
                  connectionMode === 'cloud'
                    ? 'bg-cyan-500/15 text-cyan-300 border-cyan-400/50 font-bold'
                    : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                <Cloud className="w-3.5 h-3.5 shrink-0" />
                <span>Instant Relay</span>
              </button>

              <button
                type="button"
                onClick={() => setConnectionMode('wifi')}
                className={`py-2 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border whitespace-nowrap ${
                  connectionMode === 'wifi'
                    ? 'bg-cyan-500/15 text-cyan-300 border-cyan-400/50 font-bold'
                    : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                <Wifi className="w-3.5 h-3.5 shrink-0" />
                <span>Same Wi-Fi</span>
              </button>

              <button
                type="button"
                onClick={() => setConnectionMode('usb')}
                className={`py-2 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border whitespace-nowrap ${
                  connectionMode === 'usb'
                    ? 'bg-cyan-500/15 text-cyan-300 border-cyan-400/50 font-bold'
                    : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                <Cable className="w-3.5 h-3.5 shrink-0" />
                <span>USB Cable</span>
              </button>
            </div>

            {/* Copy Link Row */}
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex-1 min-w-0 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-[11px] font-mono text-slate-300 truncate select-all">
                {connectionString}
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="h-9 px-3.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Link'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Fullscreen QR Modal */}
      {isFullscreenModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 text-center relative">
            <button
              type="button"
              onClick={() => setIsFullscreenModal(false)}
              className="absolute top-3 right-3 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-base font-bold text-white">Scan with Mobile Camera</h3>

            <div className="flex justify-center">
              <div className="p-3 rounded-2xl bg-white">
                <img
                  src={qrDataUrl}
                  alt="Fullscreen QR"
                  className="w-60 h-60 object-contain rounded-lg block"
                />
              </div>
            </div>

            <div className="py-2 px-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-sm text-emerald-400 font-bold">
              PIN: {connection.pairingPin}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
