import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  X,
  ScanLine,
  Upload,
  Clipboard,
  AlertCircle,
  CheckCircle,
  Wifi,
  Sparkles,
} from 'lucide-react';
import { ConnectionManager } from '../../services/connectionManager.ts';

interface QRScannerModalProps {
  connection: ConnectionManager;
  isOpen: boolean;
  onClose: () => void;
  onConnected: () => void;
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  connection,
  isOpen,
  onClose,
  onConnected,
}) => {
  const [pasteText, setPasteText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isScanningCamera, setIsScanningCamera] = useState(false);
  const [hasCameraSupport, setHasCameraSupport] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function'
    ) {
      setHasCameraSupport(true);
    }
  }, []);

  // Stop camera when closing
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
    }
  }, [isOpen]);

  const stopCamera = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsScanningCamera(false);
  };

  const startCamera = async () => {
    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsScanningCamera(true);

      // Check for BarcodeDetector API
      const hasBarcodeDetector = 'BarcodeDetector' in window;
      if (hasBarcodeDetector) {
        // @ts-expect-error BarcodeDetector standard draft
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        scanIntervalRef.current = window.setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              const rawVal = barcodes[0].rawValue;
              stopCamera();
              handleScannedValue(rawVal);
            }
          } catch (e) {
            console.debug('Scan frame pass', e);
          }
        }, 300);
      } else {
        // BarcodeDetector not natively available in this browser
        setErrorMsg('Camera active. If auto-detection is not supported in this browser, you can also paste the URL below.');
      }
    } catch (err: unknown) {
      const error = err as Error;
      console.warn('Camera access error:', error);
      setErrorMsg('Camera access was not granted or is unavailable. Please paste the connection string or link below.');
      setIsScanningCamera(false);
    }
  };

  const handleScannedValue = async (val: string) => {
    const parsed = ConnectionManager.parseConnectionString(val);
    if (!parsed) {
      setErrorMsg(`Could not recognize valid AirCanvas connection data: "${val.slice(0, 50)}..."`);
      return;
    }

    setConnecting(true);
    setErrorMsg(null);
    try {
      const success = await connection.connectToServer(parsed.ip, parsed.port, parsed.pin);
      setConnecting(false);
      if (success) {
        stopCamera();
        onClose();
        onConnected();
      } else {
        setErrorMsg(`Failed to connect to ${parsed.ip}:${parsed.port}. Please check network connection.`);
      }
    } catch (e) {
      setConnecting(false);
      setErrorMsg('Connection attempt encountered an error.');
    }
  };

  const handleManualPasteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pasteText.trim()) return;
    handleScannedValue(pasteText.trim());
  };

  const handleClipboardPaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setPasteText(text);
        handleScannedValue(text);
      }
    } catch {
      setErrorMsg('Could not read clipboard. Please paste manually into the box below.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 relative">
        <button
          type="button"
          onClick={() => {
            stopCamera();
            onClose();
          }}
          className="absolute top-4 right-4 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center">
            <ScanLine className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Scan Server QR Code</h3>
            <p className="text-xs text-slate-400">Pair your tablet or mobile device with host PC</p>
          </div>
        </div>

        {/* Camera Viewfinder */}
        {hasCameraSupport && (
          <div className="space-y-2">
            {isScanningCamera ? (
              <div className="relative rounded-xl overflow-hidden aspect-video bg-black border border-purple-500/40">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {/* Scanner reticle overlay */}
                <div className="absolute inset-0 border-2 border-purple-500/60 rounded-xl pointer-events-none flex items-center justify-center">
                  <div className="w-36 h-36 border-2 border-cyan-400 rounded-lg animate-pulse" />
                </div>
                <div className="absolute bottom-2 inset-x-0 text-center">
                  <span className="px-2.5 py-1 rounded bg-black/70 backdrop-blur-sm text-[11px] text-white">
                    Aim camera at PC Server QR Code
                  </span>
                </div>
              </div>
            ) : null}

            <div className="flex gap-2">
              {!isScanningCamera ? (
                <button
                  type="button"
                  onClick={startCamera}
                  className="flex-1 py-2.5 px-3 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-purple-600/30"
                >
                  <Camera className="w-4 h-4" /> Start Camera Scanner
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopCamera}
                  className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl"
                >
                  Stop Camera
                </button>
              )}
            </div>
          </div>
        )}

        {/* Error notification */}
        {errorMsg && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Quick Simulated Scan & Direct Paste / Input form */}
        <div className="pt-2 border-t border-slate-800 space-y-3">
          <button
            type="button"
            onClick={() => {
              const testString = connection.getConnectionString('web');
              setPasteText(testString);
              handleScannedValue(testString);
            }}
            disabled={connecting}
            className="w-full py-2.5 px-3 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 hover:from-cyan-500/30 hover:to-purple-500/30 border border-cyan-400/50 text-cyan-200 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>Instant Test: Auto-Scan Active AirCanvas Host QR</span>
          </button>

          <form onSubmit={handleManualPasteSubmit} className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Paste QR String or Web Link
              </label>
              <button
                type="button"
                onClick={handleClipboardPaste}
                className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold"
              >
                <Clipboard className="w-3.5 h-3.5" /> Paste Clipboard
              </button>
            </div>

            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste scanned URL, aircanvas:// URI, ws:// socket address, or JSON..."
              rows={2}
              className="w-full bg-slate-800/90 border border-slate-700 rounded-xl p-2.5 text-xs text-white font-mono placeholder:text-slate-500 focus:outline-none focus:border-purple-500"
            />

            <button
              type="submit"
              disabled={connecting || !pasteText.trim()}
              className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
            >
              {connecting ? (
                <span>Connecting to Server...</span>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 text-emerald-400" /> Connect via QR Payload
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
