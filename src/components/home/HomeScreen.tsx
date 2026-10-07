import React, { useState } from 'react';
import {
  Monitor,
  Smartphone,
  Wifi,
  Settings,
  ShieldAlert,
  Play,
  Square,
  Search,
  CheckCircle,
  ExternalLink,
  Brush,
  FileText,
  Presentation,
  Maximize2,
  Lock,
  Layers,
  Sparkles,
  RefreshCw,
  QrCode,
  Crosshair,
  Cable,
  Copy,
  Check,
} from 'lucide-react';
import { ConnectionManager } from '../../services/connectionManager.ts';
import { DrawingEngine } from '../../services/drawingEngine.ts';
import { DrawingCanvas } from '../canvas/DrawingCanvas.tsx';
import { QRCodeCard } from './QRCodeCard.tsx';
import { QRScannerModal } from './QRScannerModal.tsx';
import { DpiDiagnosticModal } from '../drawing/DpiDiagnosticModal.tsx';
import { LicenseService } from '../../services/licenseService.ts';
import { Crown, Zap, ShieldCheck, Database } from 'lucide-react';

interface HomeScreenProps {
  connection: ConnectionManager;
  engine: DrawingEngine;
  license?: LicenseService;
  onOpenDrawingScreen: () => void;
  onOpenStudio: () => void;
  onOpenBridge?: () => void;
  onOpenProModal?: () => void;
  onOpenCloudModal?: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  connection,
  engine,
  license: propLicense,
  onOpenDrawingScreen,
  onOpenStudio,
  onOpenBridge,
  onOpenProModal,
  onOpenCloudModal,
}) => {
  const license = propLicense || LicenseService.getInstance();
  const [activeTab, setActiveTab] = useState<'server' | 'client'>('server');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [showDpiModal, setShowDpiModal] = useState(false);

  // Manual connect state
  const [manualIp, setManualIp] = useState('192.168.1.105');
  const [manualPort, setManualPort] = useState('9090');
  const [manualPin, setManualPin] = useState('1234');
  const [copiedAdb, setCopiedAdb] = useState(false);
  const [isWritingDemoActive, setIsWritingDemoActive] = useState(false);

  const isConnected = connection.state === 'connected';
  const isServerRunning = connection.state === 'discovering' && connection.mode === 'server';

  const handleStartStopServer = () => {
    if (isServerRunning) {
      connection.stopServer();
    } else {
      connection.startServer('1234');
    }
  };

  const handleUsbConnect = async () => {
    const success = await connection.connectViaUsb(parseInt(manualPort, 10) || 9090);
    if (success) {
      onOpenDrawingScreen();
    }
  };

  const copyAdbCommand = () => {
    try {
      navigator.clipboard.writeText('adb reverse tcp:9090 tcp:9090');
      setCopiedAdb(true);
      setTimeout(() => setCopiedAdb(false), 2000);
    } catch {
      setCopiedAdb(true);
      setTimeout(() => setCopiedAdb(false), 2000);
    }
  };

  const runSmoothHandwritingDemo = async () => {
    if (isWritingDemoActive) return;
    setIsWritingDemoActive(true);
    engine.clearCanvas();

    const w = engine.canvasWidth || 800;
    const h = engine.canvasHeight || 450;
    const cy = h * 0.5;

    // Draw smooth flowing handwriting wave (cursive calligraphy test)
    const steps = 70;
    const startX = w * 0.15;
    const endX = w * 0.85;

    engine.onPointerDown(startX, cy, 0.4, 'stylus');
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = startX + t * (endX - startX);
      const wave = Math.sin(t * Math.PI * 6) * 45 * Math.sin(t * Math.PI);
      const y = cy + wave;
      const pressure = 0.35 + 0.5 * Math.abs(Math.sin(t * Math.PI * 3));
      engine.onPointerMove(x, y, pressure, 'stylus');
      await new Promise((r) => setTimeout(r, 16));
    }
    engine.onPointerUp('stylus');

    setIsWritingDemoActive(false);
  };

  const handleManualConnectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowManualModal(false);
    const success = await connection.connectToServer(
      manualIp,
      parseInt(manualPort, 10) || 9090,
      manualPin
    );
    if (success) {
      onOpenDrawingScreen();
    }
  };

  return (
    <div className="flex flex-col flex-1 h-full overflow-y-auto bg-[#0F0F1A] text-slate-100 p-4 md:p-6 select-none">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-cyan-500 to-purple-600 flex items-center justify-center shadow-[0_0_16px_rgba(0,229,255,0.35)]">
            <Brush className="w-6 h-6 text-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-white font-sans">Air Canvas</h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-bold">
                v1.7.1 PRO
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">Wireless Graphics Tablet & Digital Drawing Studio</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Pro / Free Edition Header Badge */}
          {onOpenProModal && (
            <button
              type="button"
              onClick={onOpenProModal}
              className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-all shadow-sm ${
                license.isPro
                  ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/40 text-amber-300 shadow-amber-500/10'
                  : 'bg-gradient-to-r from-amber-400 to-pink-500 hover:opacity-90 text-slate-950 font-black shadow-amber-500/20'
              }`}
              title="Click to manage license & compare Free vs Pro features"
            >
              <Crown className="w-4 h-4 text-amber-400" />
              <span>{license.isPro ? 'Pro Active' : 'Upgrade to Pro'}</span>
            </button>
          )}

          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300">
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            <span>Local IP: <strong className="text-slate-100 font-mono">{connection.localIp}:{connection.serverPort}</strong></span>
          </div>

          {onOpenBridge && (
            <button
              type="button"
              onClick={onOpenBridge}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500/20 to-purple-500/20 hover:from-cyan-500/30 hover:to-purple-500/30 border border-cyan-400/50 text-cyan-200 hover:text-white transition-all flex items-center gap-1.5 text-xs font-bold shadow-sm"
              title="Dual-Device Live Coordinate & Drawing Bridge (PC Host + Mobile)"
            >
              <Crosshair className="w-4 h-4 text-emerald-400" />
              <span>Dual-Device Bridge</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowDpiModal(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-cyan-500/30 text-cyan-300 hover:text-white transition-all flex items-center gap-1.5 text-xs font-semibold shadow-sm"
            title="DPI & Coordinate Calibration Diagnostic"
          >
            <Crosshair className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">DPI Diagnostic</span>
          </button>

          <button
            type="button"
            onClick={() => setShowSettingsModal(true)}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Connection Status Bar */}
      <div className="py-2.5 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              isConnected
                ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                : connection.state === 'discovering'
                ? 'bg-cyan-400 animate-pulse'
                : 'bg-slate-600'
            }`}
          />
          <span className="font-semibold text-slate-300">
            {isConnected
              ? `Connected: ${connection.connectedDeviceName}`
              : connection.state === 'discovering'
              ? 'Discovering devices on local network...'
              : 'Disconnected'}
          </span>
        </div>

        {isConnected && (
          <div className="flex items-center gap-3">
            <span className="text-slate-400 font-mono text-[11px]">{connection.latencyMs}ms latency</span>
            <button
              type="button"
              onClick={() => connection.disconnect()}
              className="text-rose-400 hover:text-rose-300 text-xs font-semibold underline"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>

      {/* Content Area */}
      {isConnected ? (
        /* Connected View */
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-7 h-7 text-emerald-400" />
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    {connection.mode === 'server'
                      ? `Client Connected: ${connection.connectedDeviceName}`
                      : `Connected to Host: ${connection.connectedDeviceName}`}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Real-time stroke mirroring active. Coalesced 120Hz/240Hz input smoothing active.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`px-3 py-1 rounded-lg text-xs font-bold border flex items-center gap-1.5 ${
                    connection.transportType === 'usb'
                      ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
                      : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                  }`}
                >
                  {connection.transportType === 'usb' ? (
                    <>
                      <Cable className="w-3.5 h-3.5" />
                      <span>USB Wired (0ms / 240Hz)</span>
                    </>
                  ) : (
                    <>
                      <Wifi className="w-3.5 h-3.5" />
                      <span>WiFi LAN ({connection.latencyMs}ms)</span>
                    </>
                  )}
                </span>
                <span className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700 text-xs font-mono font-bold">
                  {engine.livePollingRateHz || 120}Hz
                </span>
              </div>
            </div>

            {/* Live Drawing Preview Canvas */}
            <div className="w-full bg-[#0A0A12] border border-slate-800 rounded-xl overflow-hidden aspect-video relative shadow-inner">
              <DrawingCanvas engine={engine} showGrid={true} className="w-full h-full" />
              {engine.strokes.length === 0 && !engine.currentStroke && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-500 text-xs font-medium">
                  {connection.mode === 'server'
                    ? 'Strokes from your mobile or tablet will mirror live here!'
                    : 'Draw with touch or stylus to test the active stream'}
                </div>
              )}

              {/* In-canvas quick tools & smoothness demo */}
              <div className="absolute top-2 left-2 flex items-center gap-1.5 z-10">
                <button
                  type="button"
                  onClick={runSmoothHandwritingDemo}
                  disabled={isWritingDemoActive}
                  className="px-2.5 py-1 bg-gradient-to-r from-cyan-600/90 to-purple-600/90 hover:from-cyan-500 hover:to-purple-500 text-white text-xs font-bold rounded-lg border border-cyan-400/50 backdrop-blur-sm flex items-center gap-1 shadow-sm transition-all"
                  title="Test handwriting cursive flow with velocity-adaptive line tapering"
                >
                  <Sparkles className="w-3 h-3 text-cyan-300" />
                  <span>{isWritingDemoActive ? 'Writing...' : 'Test Handwriting Flow'}</span>
                </button>

                <div className="hidden sm:flex items-center gap-1 bg-slate-900/90 p-0.5 rounded-lg border border-slate-700/80 text-[10px]">
                  <span className="text-slate-400 px-1 font-semibold">Smoothing:</span>
                  {(['proAdaptive', 'studioSmooth', 'rawDirect'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        engine.precisionMode = mode;
                        engine.notify();
                      }}
                      className={`px-1.5 py-0.5 rounded font-bold transition-colors ${
                        engine.precisionMode === mode
                          ? 'bg-purple-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {mode === 'proAdaptive' ? 'Adaptive' : mode === 'studioSmooth' ? 'Silk' : 'Raw'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="absolute top-2 right-2 flex gap-1 z-10">
                <button
                  type="button"
                  onClick={() => engine.clearCanvas()}
                  className="px-2.5 py-1 bg-slate-900/80 hover:bg-slate-800 text-slate-300 text-xs rounded-lg border border-slate-700 backdrop-blur-sm font-semibold transition-colors"
                >
                  Clear Canvas
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onOpenDrawingScreen}
                className="flex-1 py-3 px-4 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 transition-all"
              >
                <Maximize2 className="w-4 h-4" /> Open Full Screen Drawing Pad
              </button>
              <button
                type="button"
                onClick={onOpenStudio}
                className="flex-1 py-3 px-4 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-purple-600/20 transition-all"
              >
                <Brush className="w-4 h-4" /> Open Drawing Studio
              </button>
              {onOpenBridge && (
                <button
                  type="button"
                  onClick={onOpenBridge}
                  className="py-3 px-4 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold rounded-xl flex items-center justify-center gap-2 border border-slate-700 transition-colors"
                >
                  <Crosshair className="w-4 h-4" /> Dual-Device Bridge
                </button>
              )}
              <button
                type="button"
                onClick={() => connection.disconnect()}
                className="py-3 px-5 border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 font-bold rounded-xl transition-colors"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Tabs: Server vs Client */
        <div className="flex-1 flex flex-col">
          {/* Edition & Performance Profile Card */}
          <div className="mb-4 p-3.5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 shadow-md flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center font-black ${
                  license.isPro
                    ? 'bg-gradient-to-tr from-amber-400 to-purple-600 text-slate-950 shadow-[0_0_15px_rgba(251,191,36,0.3)]'
                    : 'bg-slate-800 text-cyan-400 border border-slate-700'
                }`}
              >
                {license.isPro ? <Crown className="w-5 h-5" /> : <Layers className="w-5 h-5" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">
                    {license.isPro ? 'Air Canvas Pro (Studio Activated)' : 'Air Canvas Free Edition'}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.2 rounded-full font-bold border ${
                      license.isPro
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {license.isPro ? 'TURBO 4ms ACTIVE' : 'STANDARD 60Hz'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  {license.isPro
                    ? '8192 Pressure Levels • High-DPI PerMonitorV2 Physical Lock • Scalable Vector SVG Export'
                    : '1024 Pressure Levels • Standard 1080p Single Canvas • Basic Smoothing'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => license.toggleTier()}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-all text-xs font-semibold"
                title="Toggle between Free and Pro to test feature variations"
              >
                Toggle {license.isPro ? 'Free Mode' : 'Pro Mode'}
              </button>

              {onOpenCloudModal && (
                <button
                  type="button"
                  onClick={onOpenCloudModal}
                  className="px-2.5 py-1.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 hover:text-blue-300 transition-all text-xs font-bold flex items-center gap-1.5"
                  title="Inspect Supabase DB, Google Play Billing & Entitlements API"
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>Cloud & DB</span>
                </button>
              )}

              {onOpenProModal && (
                <button
                  type="button"
                  onClick={onOpenProModal}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow ${
                    license.isPro
                      ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40'
                      : 'bg-gradient-to-r from-amber-400 to-pink-500 hover:opacity-90 text-slate-950'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{license.isPro ? 'Manage Pro License' : 'Unlock Pro ($29.99)'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Tab Selector */}
          <div className="flex border-b border-slate-800 bg-slate-900/60 rounded-xl p-1 mb-5">
            <button
              type="button"
              onClick={() => {
                setActiveTab('server');
                connection.setMode('server');
              }}
              className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2 text-xs font-bold transition-all ${
                activeTab === 'server'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Monitor className="w-4 h-4" />
              <span>SERVER (PC / Host)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('client');
                connection.setMode('client');
              }}
              className={`flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2 text-xs font-bold transition-all ${
                activeTab === 'client'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              <span>CLIENT (Mobile / Tablet)</span>
            </button>
          </div>

          {activeTab === 'server' ? (
            /* SERVER TAB */
            <div className="space-y-6 max-w-4xl mx-auto w-full">
              {/* Status Card */}
              <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 border border-slate-800 shadow-xl flex flex-col items-center text-center">
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3.5 border ${
                    isServerRunning
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  <Monitor className="w-8 h-8" />
                </div>

                <h3 className="text-xl font-bold text-white mb-1">
                  {isServerRunning ? 'Server Running (Ready to Stream)' : 'Server Offline'}
                </h3>
                <p className="text-xs text-slate-400 max-w-sm mb-4">
                  {isServerRunning
                    ? `Listening for incoming wireless drawing tablets on ${connection.localIp}:${connection.serverPort}`
                    : 'Click "Start Server" to allow mobile and tablet devices to connect and draw.'}
                </p>

                {isServerRunning && (
                  <div className="bg-purple-600/15 border border-purple-500/30 rounded-xl px-5 py-2.5 mb-5 flex flex-col items-center">
                    <span className="text-[10px] uppercase font-bold text-purple-300 tracking-wider">
                      PAIRING PIN
                    </span>
                    <span className="text-2xl font-black font-mono tracking-widest text-white mt-0.5">
                      {connection.pairingPin}
                    </span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={handleStartStopServer}
                    className={`px-8 py-3 rounded-xl font-bold text-sm shadow-lg transition-all flex items-center gap-2 ${
                      isServerRunning
                        ? 'bg-rose-500 hover:bg-rose-600 text-white'
                        : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/30'
                    }`}
                  >
                    {isServerRunning ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    <span>{isServerRunning ? 'Stop Server' : 'Start Server'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={runSmoothHandwritingDemo}
                    disabled={isWritingDemoActive}
                    className="px-5 py-3 rounded-xl font-bold text-xs bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 transition-all flex items-center gap-2"
                    title="Simulate smooth 240Hz cursive handwriting stream on canvas"
                  >
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <span>{isWritingDemoActive ? 'Simulating Smooth Script...' : 'Test Smooth Handwriting'}</span>
                  </button>
                </div>
              </div>

              {/* QR Code Quick-Pairing Card */}
              <QRCodeCard
                connection={connection}
                onConnectSelf={async () => {
                  const ok = await connection.connectToServer(
                    connection.localIp,
                    connection.serverPort,
                    connection.pairingPin
                  );
                  if (ok) onOpenDrawingScreen();
                }}
              />

              {/* USB Cable Wired Mode Banner */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-950/40 via-slate-900 to-slate-900 border border-cyan-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs shadow-md">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-300 flex items-center justify-center shrink-0 mt-0.5 border border-cyan-500/30">
                    <Cable className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-white text-sm">USB Cable Mode (Zero Latency • 1ms)</h4>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30">
                        240Hz Polling
                      </span>
                    </div>
                    <p className="text-slate-400 mt-1 max-w-xl leading-relaxed">
                      Plug your phone or tablet into PC with a USB cable. For Android, forward port 9090 with ADB:
                      <code className="text-cyan-300 bg-slate-950 px-2 py-0.5 rounded mx-1 font-mono border border-slate-800">
                        adb reverse tcp:9090 tcp:9090
                      </code>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={copyAdbCommand}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors"
                  >
                    {copiedAdb ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedAdb ? 'Copied Command!' : 'Copy ADB Command'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleUsbConnect}
                    className="px-3.5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl shadow-md shadow-cyan-500/20 transition-all flex items-center gap-1.5"
                  >
                    <Cable className="w-3.5 h-3.5" />
                    <span>Test USB Link</span>
                  </button>
                </div>
              </div>

              {/* Instructions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0">
                    <Wifi className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white mb-0.5">Step 1: Same WiFi Network</h4>
                    <p className="text-slate-400 leading-relaxed">
                      Make sure your PC and mobile device are connected to the same local WiFi or hotspot.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0">
                    <Play className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white mb-0.5">Step 2: Start Server</h4>
                    <p className="text-slate-400 leading-relaxed">
                      Click "Start Server" on this screen to open the synthetic pen listener.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white mb-0.5">Step 3: Connect Mobile</h4>
                    <p className="text-slate-400 leading-relaxed">
                      On your phone or tablet, open AirCanvas, go to Client tab and tap your PC to connect.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white mb-0.5">Firewall Notice</h4>
                    <p className="text-slate-400 leading-relaxed">
                      If prompted by Windows Defender or OS firewall, allow private network access for AirCanvas.
                    </p>
                  </div>
                </div>
              </div>

              {/* Drawing Apps Quick Launchers */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <h4 className="font-bold text-white text-sm">Drawing & Presentation Apps</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {onOpenBridge && (
                    <button
                      type="button"
                      onClick={onOpenBridge}
                      className="p-4 rounded-xl bg-gradient-to-tr from-cyan-500/15 via-purple-500/10 to-indigo-500/15 hover:from-cyan-500/25 hover:to-purple-500/25 border border-cyan-500/40 text-left transition-all group shadow-md"
                    >
                      <Crosshair className="w-6 h-6 text-emerald-400 mb-2 group-hover:scale-110 transition-transform" />
                      <h5 className="font-bold text-white text-sm flex items-center gap-1.5">
                        Dual-Device Bridge
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                          5-Point
                        </span>
                      </h5>
                      <p className="text-[11px] text-slate-300 mt-1">
                        Simultaneous PC Host + Mobile Tablet live drawing with 5-point calibration test.
                      </p>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={onOpenStudio}
                    className="p-4 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-left transition-all group"
                  >
                    <Brush className="w-6 h-6 text-cyan-400 mb-2 group-hover:scale-110 transition-transform" />
                    <h5 className="font-bold text-cyan-300 text-sm">Drawing Studio</h5>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Built-in high-performance whiteboard & notebook studio.
                    </p>
                  </button>

                  <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 text-left">
                    <FileText className="w-6 h-6 text-purple-400 mb-2" />
                    <h5 className="font-bold text-purple-300 text-sm">OneNote / Word</h5>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Works directly with Microsoft OneNote ink and pen annotations.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 text-left">
                    <Presentation className="w-6 h-6 text-orange-400 mb-2" />
                    <h5 className="font-bold text-orange-300 text-sm">PowerPoint / Slides</h5>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Live pen annotations during slideshows with slide navigation shortcuts.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* CLIENT TAB */
            <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full space-y-5">
              {/* Top 3-Way Connection Modes Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* 1. USB Cable Mode */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-cyan-950/30 via-slate-900 to-slate-900 border border-cyan-500/30 hover:border-cyan-400/60 transition-all flex flex-col justify-between shadow-md">
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-300 flex items-center justify-center border border-cyan-500/30">
                        <Cable className="w-5 h-5" />
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                        1ms • 240Hz
                      </span>
                    </div>
                    <h4 className="font-bold text-white text-sm">1. USB Cable (Wired)</h4>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Zero WiFi lag or interference. Plug USB cable into PC, run ADB reverse on port 9090.
                    </p>
                  </div>

                  <div className="pt-3 mt-3 border-t border-slate-800/80 space-y-2">
                    <button
                      type="button"
                      onClick={handleUsbConnect}
                      className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl shadow-md shadow-cyan-500/20 transition-all flex items-center justify-center gap-1.5"
                    >
                      <Cable className="w-4 h-4" />
                      <span>Connect via USB Cable</span>
                    </button>
                    <button
                      type="button"
                      onClick={copyAdbCommand}
                      className="w-full py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold rounded-lg border border-slate-700 flex items-center justify-center gap-1 transition-colors"
                    >
                      {copiedAdb ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedAdb ? 'Copied ADB Reverse!' : 'Copy: adb reverse tcp:9090'}</span>
                    </button>
                  </div>
                </div>

                {/* 2. Same WiFi Network Mode */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-950/30 via-slate-900 to-slate-900 border border-purple-500/30 hover:border-purple-400/60 transition-all flex flex-col justify-between shadow-md">
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center border border-purple-500/30">
                        <Wifi className="w-5 h-5" />
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        Local Subnet
                      </span>
                    </div>
                    <h4 className="font-bold text-white text-sm">2. Same WiFi Network</h4>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Connect PC and tablet to same WiFi router or hotspot. Auto-scans local network.
                    </p>
                  </div>

                  <div className="pt-3 mt-3 border-t border-slate-800/80 space-y-2">
                    <button
                      type="button"
                      onClick={() => connection.startDiscovery()}
                      className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow-md shadow-purple-600/20 transition-all flex items-center justify-center gap-1.5"
                    >
                      <Search className="w-4 h-4" />
                      <span>Scan WiFi Devices</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowManualModal(true)}
                      className="w-full py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold rounded-lg border border-slate-700 flex items-center justify-center gap-1 transition-colors"
                    >
                      <span>Manual IP Connect</span>
                    </button>
                  </div>
                </div>

                {/* 3. QR Code Quick Pair Mode */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-950/30 via-slate-900 to-slate-900 border border-indigo-500/30 hover:border-indigo-400/60 transition-all flex flex-col justify-between shadow-md">
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center border border-indigo-500/30">
                        <QrCode className="w-5 h-5" />
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        Instant Scan
                      </span>
                    </div>
                    <h4 className="font-bold text-white text-sm">3. QR Code Scan</h4>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Aim camera at PC Server QR code or auto-pair with active host in 1 tap.
                    </p>
                  </div>

                  <div className="pt-3 mt-3 border-t border-slate-800/80 space-y-2">
                    <button
                      type="button"
                      onClick={() => setShowScannerModal(true)}
                      className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
                    >
                      <QrCode className="w-4 h-4" />
                      <span>Scan QR Code</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const str = connection.getConnectionString('web');
                        const ok = await connection.connectViaQrCode(str);
                        if (ok) onOpenDrawingScreen();
                      }}
                      className="w-full py-1.5 bg-slate-800/80 hover:bg-slate-700 text-indigo-300 text-[11px] font-semibold rounded-lg border border-slate-700 flex items-center justify-center gap-1 transition-colors"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>One-Tap Host QR Pair</span>
                    </button>
                  </div>
                </div>
              </div>

              {connection.state === 'discovering' ? (
                /* Scanning view */
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
                  <div className="w-12 h-12 rounded-full border-3 border-purple-500 border-t-transparent animate-spin" />
                  <h3 className="text-lg font-bold text-white">Scanning network...</h3>
                  <p className="text-xs text-slate-400 max-w-xs">
                    Searching for AirCanvas PC servers broadcasting on local WiFi subnet.
                  </p>
                </div>
              ) : connection.discoveredDevices.length > 0 ? (
                /* Discovered devices */
                <div className="flex-1 space-y-3 p-2">
                  <div className="flex items-center justify-between text-xs text-slate-400 pb-1">
                    <span>Found {connection.discoveredDevices.length} AirCanvas host(s)</span>
                    <button
                      type="button"
                      onClick={() => connection.startDiscovery()}
                      className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Rescan
                    </button>
                  </div>

                  {connection.discoveredDevices.map((dev, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-purple-500/50 transition-all flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-purple-500/20 text-purple-300 flex items-center justify-center">
                          <Monitor className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-white text-sm">{dev.name}</h4>
                          <p className="text-xs text-slate-400 font-mono">
                            {dev.ip}:{dev.port} • {dev.model || 'Windows 11 Synthetic Pen'}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={async () => {
                          const success = await connection.connectToServer(dev.ip, dev.port, '1234');
                          if (success) onOpenDrawingScreen();
                        }}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-lg transition-colors"
                      >
                        Connect
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                /* Idle view */
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 text-slate-500 flex items-center justify-center">
                    <Search className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">Scan for AirCanvas PC</h3>
                    <p className="text-xs text-slate-400 max-w-sm">
                      Make sure your PC is running AirCanvas Server on the same WiFi network, then tap Scan.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowScannerModal(true)}
                      className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-purple-600/30 transition-all flex items-center gap-2"
                    >
                      <QrCode className="w-4 h-4" /> Scan QR Code
                    </button>
                    <button
                      type="button"
                      onClick={() => connection.startDiscovery()}
                      className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl border border-slate-700 transition-all flex items-center gap-2"
                    >
                      <Search className="w-4 h-4" /> Start WiFi Scan
                    </button>
                  </div>
                </div>
              )}

              {/* Bottom Actions */}
              <div className="pt-4 border-t border-slate-800 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setShowScannerModal(true)}
                  className="flex-1 min-w-[130px] py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-600/20 to-purple-600/20 hover:from-cyan-600/30 hover:to-purple-600/30 border border-cyan-500/40 text-cyan-300 font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  <QrCode className="w-4 h-4" /> Scan QR Code
                </button>
                <button
                  type="button"
                  onClick={() => setShowManualModal(true)}
                  className="flex-1 min-w-[130px] py-3 px-4 rounded-xl border border-purple-500/50 text-purple-400 hover:bg-purple-500/10 font-bold text-xs transition-colors"
                >
                  Manual IP Connect
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (connection.state === 'discovering') {
                      connection.stopDiscovery();
                    } else {
                      connection.startDiscovery();
                    }
                  }}
                  className="flex-1 min-w-[130px] py-3 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  {connection.state === 'discovering' ? (
                    <>
                      <Square className="w-3.5 h-3.5" /> Stop Scan
                    </>
                  ) : (
                    <>
                      <Search className="w-3.5 h-3.5" /> Scan Devices
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual Connect Dialog */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleManualConnectSubmit}
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4"
          >
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-purple-400" /> Manual Connection
            </h3>
            <p className="text-xs text-slate-400">
              Enter the IP address and port displayed on your AirCanvas PC Server header.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Server IP Address
                </label>
                <input
                  type="text"
                  value={manualIp}
                  onChange={(e) => setManualIp(e.target.value)}
                  placeholder="192.168.1.105"
                  className="w-full bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Port
                  </label>
                  <input
                    type="number"
                    value={manualPort}
                    onChange={(e) => setManualPort(e.target.value)}
                    placeholder="9090"
                    className="w-full bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Pairing PIN
                  </label>
                  <input
                    type="text"
                    value={manualPin}
                    onChange={(e) => setManualPin(e.target.value)}
                    placeholder="1234"
                    className="w-full bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono text-center tracking-widest"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="flex-1 py-2 px-3 rounded-lg border border-slate-700 text-slate-300 text-xs font-semibold hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2 px-3 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-md shadow-purple-600/30"
              >
                Connect Now
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-purple-400" /> Settings
              </h3>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="text-slate-400 hover:text-white text-xs font-bold"
              >
                Done
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <label className="flex items-center justify-between cursor-pointer py-1.5">
                <div>
                  <span className="font-bold text-white block">Stylus Support</span>
                  <span className="text-[11px] text-slate-400">
                    Enable active pressure sensitivity and stylus digitizer events
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={connection.hasStylusSupport}
                  onChange={(e) => connection.setStylusSupport(e.target.checked)}
                  className="accent-purple-500 w-4 h-4 rounded"
                />
              </label>

              <div className="flex items-center justify-between py-1.5 border-t border-slate-800/80">
                <div>
                  <span className="font-bold text-white block">Max Pressure Level</span>
                  <span className="text-[11px] text-slate-400">
                    Resolution of pressure sensitivity steps
                  </span>
                </div>
                <select
                  value={connection.maxPressureSetting}
                  onChange={(e) => connection.setMaxPressure(parseFloat(e.target.value))}
                  className="bg-slate-800 border border-slate-700 text-white rounded px-2 py-1 text-xs"
                >
                  <option value={1.0}>1.0 (Standard Web API)</option>
                  <option value={1024}>1024 (Basic Pen)</option>
                  <option value={2048}>2048 (Medium Wacom)</option>
                  <option value={4096}>4096 (Pro Stylus)</option>
                </select>
              </div>

              <div className="pt-2 border-t border-slate-800/80">
                <span className="font-bold text-slate-400 block text-[11px] uppercase tracking-wider mb-1">
                  About Air Canvas
                </span>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Air Canvas transforms smartphones and tablets into high-precision, low-latency wireless
                  drawing tablets for PC with 1-Euro adaptive jitter filtering and true 1:1 circle geometry.
                </p>
                <span className="text-purple-400 font-mono text-[11px] font-bold block mt-1.5">
                  Version 1.7.1 PRO • React Edition
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Scanner Dialog for Mobile / Client */}
      <QRScannerModal
        connection={connection}
        isOpen={showScannerModal}
        onClose={() => setShowScannerModal(false)}
        onConnected={onOpenDrawingScreen}
      />

      {/* Coordinate & Windows DPI Scaling Diagnostic Modal */}
      <DpiDiagnosticModal
        engine={engine}
        connection={connection}
        isOpen={showDpiModal}
        onClose={() => setShowDpiModal(false)}
      />
    </div>
  );
};
