import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  Smartphone,
  Download,
  Copy,
  Check,
  X,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  ArrowRight
} from 'lucide-react';

interface InstallApkModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InstallApkModal: React.FC<InstallApkModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const apkDirectUrl =
    'https://github.com/hasibcore/Air_Canvas/releases/download/v1.7.7/AirCanvas-release.apk';
  const windowsDirectUrl =
    'https://github.com/hasibcore/Air_Canvas/releases/download/v1.7.7/AirCanvas-Windows-x64.zip';
  const localApkUrl = '/downloads/AirCanvas-release.apk';

  useEffect(() => {
    if (!isOpen) return;
    QRCode.toDataURL(apkDirectUrl, {
      width: 400,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: {
        dark: '#05050e',
        light: '#ffffff'
      }
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Failed to generate QR code:', err));
  }, [isOpen, apkDirectUrl]);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    try {
      navigator.clipboard.writeText(apkDirectUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-emerald-500/30 rounded-3xl w-full max-w-xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white">Install AirCanvas on Mobile</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  v1.7.6 APK
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Scan with phone camera or click to download directly (41 MB)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 text-xs">
          {/* QR Code and Quick Scan Section */}
          <div className="p-5 rounded-2xl bg-slate-950/90 border border-slate-800 flex flex-col sm:flex-row items-center gap-6">
            <div className="relative group shrink-0">
              <div className="w-48 h-48 bg-white rounded-2xl p-2.5 flex items-center justify-center shadow-lg border border-slate-700">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="Scan to Download APK"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="animate-pulse text-slate-500 text-xs">Generating QR...</div>
                )}
              </div>
              <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-emerald-600 text-white font-bold text-[9px] uppercase tracking-wider shadow">
                Scan with Camera
              </div>
            </div>

            <div className="space-y-3 text-left">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-[11px] font-semibold border border-emerald-500/30">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Easiest: Scan with Phone</span>
              </div>
              <h4 className="font-bold text-white text-sm">
                Point your phone camera at this QR code
              </h4>
              <p className="text-slate-400 text-xs leading-relaxed">
                Open your mobile phone camera or Google Lens. Tap the download banner that appears, and <strong className="text-slate-200">AirCanvas-release.apk</strong> will begin downloading instantly!
              </p>
              <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Official Release • Virus-Free • 41 MB</span>
              </div>
            </div>
          </div>

          {/* Direct 1-Click Action Buttons */}
          <div className="space-y-2.5">
            <h4 className="font-bold text-slate-200 text-xs">Direct Download Options:</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <a
                href={apkDirectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold flex items-center justify-between group shadow-lg transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <Download className="w-5 h-5 shrink-0" />
                  <div className="text-left">
                    <div className="text-xs font-bold leading-tight">Download APK (Direct)</div>
                    <div className="text-[10px] text-emerald-100 font-normal mt-0.5">GitHub Fast CDN (41 MB)</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 opacity-70 group-hover:translate-x-1 transition-transform" />
              </a>

              <a
                href={localApkUrl}
                download="AirCanvas-release.apk"
                className="p-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold flex items-center justify-between group transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <Download className="w-5 h-5 text-cyan-400 shrink-0" />
                  <div className="text-left">
                    <div className="text-xs font-bold leading-tight">Download via Web App</div>
                    <div className="text-[10px] text-slate-400 font-normal mt-0.5">Local Server Download</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 opacity-70 group-hover:translate-x-1 transition-transform" />
              </a>
            </div>
          </div>

          {/* Copy Direct Link */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-semibold text-slate-400 block mb-0.5">
                Direct APK Link (for WhatsApp / Telegram / Browser):
              </span>
              <p className="font-mono text-[11px] text-cyan-300 truncate">
                {apkDirectUrl}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyLink}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-1.5 shrink-0 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy Link</span>
                </>
              )}
            </button>
          </div>

          {/* Installation Steps */}
          <div className="p-4 rounded-2xl bg-slate-950/50 border border-slate-800/80 space-y-2.5">
            <h5 className="font-bold text-white text-xs">How to install on your Android phone:</h5>
            <ol className="list-decimal list-inside space-y-1.5 text-slate-300 text-[11px] leading-relaxed">
              <li>
                Scan the QR code or tap <strong className="text-white">Download APK</strong>.
              </li>
              <li>
                When downloaded, tap the notification or open your phone's <strong className="text-white">Downloads</strong> folder.
              </li>
              <li>
                Tap <code className="text-emerald-300 font-mono">AirCanvas-release.apk</code> to install. (If prompted: tap <em>"Allow from this source" / "Install anyway"</em>).
              </li>
              <li>
                Open AirCanvas, and it will automatically detect your PC via Wi-Fi or USB!
              </li>
            </ol>
          </div>

          {/* Windows Companion link */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[11px] text-slate-400">
            <span>Also need the Windows server for PC?</span>
            <a
              href={windowsDirectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1"
            >
              <span>Download Windows Server (.zip)</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
