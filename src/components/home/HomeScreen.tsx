import React, { useState } from 'react';
import {
  Monitor,
  Smartphone,
  Wifi,
  Play,
  Square,
  CheckCircle,
  Brush,
  Maximize2,
  RefreshCw,
  QrCode,
  Crosshair,
  Cable,
  Cloud,
  Zap,
  AppWindow,
  Eraser,
  FolderGit2,
  Copy,
  Check,
} from 'lucide-react';
import { ConnectionManager } from '../../services/connectionManager.ts';
import { DrawingEngine, PC_SOFTWARE_PROFILES } from '../../services/drawingEngine.ts';
import { DrawingCanvas } from '../canvas/DrawingCanvas.tsx';
import { QRCodeCard } from './QRCodeCard.tsx';
import { QRScannerModal } from './QRScannerModal.tsx';
import { GitHubReleaseModal } from './GitHubReleaseModal.tsx';


interface HomeScreenProps {
  connection: ConnectionManager;
  engine: DrawingEngine;
  onOpenDrawingScreen: () => void;
  onOpenStudio: () => void;
  onOpenBridge?: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  connection,
  engine,
  onOpenDrawingScreen,
  onOpenStudio,
  onOpenBridge,
}) => {
  const isMobileDevice =
    typeof window !== 'undefined' &&
    (window.innerWidth < 768 || ('ontouchstart' in window && window.innerWidth < 1024));
  const [activeTab, setActiveTab] = useState<'server' | 'client'>(() =>
    isMobileDevice ? 'client' : 'server'
  );
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [showGitHubModal, setShowGitHubModal] = useState(false);
  const [quickPin, setQuickPin] = useState(connection.pairingPin || '1234');
  const [ipInput, setIpInput] = useState(connection.localIp || '192.168.1.105');
  const [portInput, setPortInput] = useState(String(connection.serverPort || 9090));
  const [userEditedIp, setUserEditedIp] = useState(false);
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);
  const [ipStatusBanner, setIpStatusBanner] = useState<string>('');
  const [isVerifyingLink, setIsVerifyingLink] = useState(false);
  const [dualCheckStages, setDualCheckStages] = useState<
    Array<{ id: string; label: string; passed: boolean; detail: string }>
  >([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [, setTick] = useState(0);

  React.useEffect(() => {
    const unsubConn = connection.subscribe(() => {
      setTick((t) => t + 1);
      if (!userEditedIp && connection.localIp) {
        setIpInput(connection.localIp);
      }
    });
    const unsubEng = engine.subscribe(() => setTick((t) => t + 1));
    return () => {
      unsubConn();
      unsubEng();
    };
  }, [connection, engine, userEditedIp]);

  const hasIncomingDrawing =
    engine.strokes.length > 0 ||
    engine.currentStroke !== null ||
    engine.currentRemoteStroke !== null;
  const isConnected =
    connection.state === 'connected' || (activeTab === 'server' && hasIncomingDrawing);
  const isServerRunning =
    (connection.state === 'discovering' || connection.state === 'connected') &&
    connection.mode === 'server';

  const activeProfile = engine.getActiveSoftwareProfile();
  const swPixels = engine.getSoftwareWorkingAreaPixels();
  const swRect = engine.softwareWorkingArea;
  const hasSoftwareMargins =
    swRect.left > 0.005 || swRect.top > 0.005 || swRect.right < 0.995 || swRect.bottom < 0.995;

  const handleStartStopServer = () => {
    if (isServerRunning) {
      connection.stopServer();
      setIpStatusBanner('PC Host stopped.');
    } else {
      const cleanIp = ipInput.trim() || connection.localIp || '192.168.1.105';
      const cleanPort = parseInt(portInput.trim(), 10) || connection.serverPort || 9090;
      connection.startServer(connection.pairingPin || '1234', cleanIp, cleanPort);
      setIpStatusBanner(`PC Host listening on ${cleanIp}:${cleanPort} (PIN: ${connection.pairingPin})`);
    }
  };

  const handleConnectPcLocalIpPort = async (keepServerMode = true) => {
    const cleanIp = ipInput.trim() || connection.localIp || '192.168.1.105';
    const cleanPort = parseInt(portInput.trim(), 10) || 9090;
    const targetPin = (activeTab === 'server' ? connection.pairingPin : quickPin) || '1234';
    setIsConnecting(true);
    setIpStatusBanner(`Connecting to ws://${cleanIp}:${cleanPort} (PIN: ${targetPin})...`);
    try {
      const ok = await connection.connectViaLocalIpPort(cleanIp, cleanPort, targetPin, keepServerMode);
      if (ok) {
        setIpStatusBanner(`Connected via Local IP & Port: ${cleanIp}:${cleanPort} (PIN: ${targetPin})`);
      } else {
        setIpStatusBanner(
          connection.lastConnectionError || `Could not reach ${cleanIp}:${cleanPort}. Ensure AirCanvas is running.`
        );
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleVerifyDualDeviceLink = async () => {
    const cleanIp = ipInput.trim() || connection.localIp || '192.168.1.105';
    const cleanPort = parseInt(portInput.trim(), 10) || 9090;
    const targetPin = (activeTab === 'server' ? connection.pairingPin : quickPin) || '1234';
    setIsVerifyingLink(true);
    setIpStatusBanner(`Verifying 2-Device Link on ws://${cleanIp}:${cleanPort}...`);
    try {
      const res = await connection.verifyDualDeviceLink(cleanIp, cleanPort, targetPin);
      setDualCheckStages(res.stages);
      if (res.ok) {
        setIpStatusBanner(
          `2-Device Link Verified: Android APK ↔ PC (${res.endpoint}) · ${res.rttMs}ms RTT · 13B Binary OK`
        );
      } else {
        setIpStatusBanner(`Link check incomplete on ${res.endpoint}. Check firewall or IP.`);
      }
    } finally {
      setIsVerifyingLink(false);
    }
  };

  const handleAutoDetectLocalIp = async () => {
    setIpStatusBanner('Detecting PC Local LAN IP & Port...');
    const info = await connection.fetchNetworkInfo();
    setUserEditedIp(false);
    setIpInput(info.ip);
    setPortInput(String(info.serverPort || 9090));
    setIpStatusBanner(`Detected Local IP: ${info.ip} • Port: ${info.serverPort}`);
  };

  const handleCopyIpPort = async () => {
    const text = `${ipInput.trim() || connection.localIp}:${portInput.trim() || connection.serverPort}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedEndpoint(true);
    setIpStatusBanner(`Copied ${text} to clipboard`);
    setTimeout(() => setCopiedEndpoint(false), 2000);
  };

  const handleConnectClient = async (transport: 'cloud' | 'wifi' | 'usb' = 'cloud') => {
    const targetPin = quickPin || connection.pairingPin || '1234';
    setIsConnecting(true);
    engine.fullScreenTabletMode = true;
    const cleanIp = ipInput.trim() || connection.localIp || '192.168.1.105';
    const cleanPort = parseInt(portInput.trim(), 10) || connection.serverPort || 9090;
    const host =
      transport === 'usb' ? '127.0.0.1' : transport === 'wifi' ? cleanIp : 'relay';
    const port = transport === 'cloud' ? 3000 : cleanPort;

    connection.setLocalIp(cleanIp);
    connection.setServerPort(cleanPort);

    // Connect to server in background
    connection.connectToServer(host, port, targetPin, transport).finally(() => {
      setIsConnecting(false);
    });
    // Immediately open the tablet pad so user can start drawing without delay
    onOpenDrawingScreen();
  };

  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden bg-[#0A0A12] text-slate-100 select-none">
      {/* Single-Row Responsive Top Bar — Never wraps or overlaps on Mobile or PC */}
      <header className="bg-slate-950 border-b border-slate-800/80 px-3 sm:px-6 h-13 flex items-center justify-between gap-2 z-20 shrink-0 overflow-x-auto no-scrollbar">
        {/* Zone 1: Brand */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-cyan-500 flex items-center justify-center shadow-[0_0_12px_rgba(0,229,255,0.3)] shrink-0">
            <Brush className="w-4 h-4 text-slate-950" />
          </div>
          <span className="font-bold text-sm sm:text-base text-white tracking-tight whitespace-nowrap">
            Air Canvas
          </span>
        </div>

        {/* Zone 2: Strictly 3 Essential Navigation Links */}
        <nav className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs shrink-0">
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg font-bold bg-cyan-500 text-slate-950 whitespace-nowrap shrink-0 transition-colors"
          >
            Connect
          </button>

          <button
            type="button"
            onClick={onOpenDrawingScreen}
            className="px-3 py-1.5 rounded-lg font-semibold text-slate-300 hover:text-white hover:bg-slate-800 whitespace-nowrap shrink-0 transition-colors"
          >
            Draw
          </button>

          {onOpenStudio && (
            <button
              type="button"
              onClick={onOpenStudio}
              className="px-3 py-1.5 rounded-lg font-semibold text-slate-300 hover:text-white hover:bg-slate-800 whitespace-nowrap shrink-0 transition-colors"
            >
              Studio
            </button>
          )}

          {onOpenBridge && (
            <button
              type="button"
              onClick={onOpenBridge}
              className="px-3 py-1.5 rounded-lg font-semibold text-slate-300 hover:text-white hover:bg-slate-800 whitespace-nowrap shrink-0 transition-colors"
            >
              Test
            </button>
          )}
        </nav>

        {/* Zone 3: Latency Monitor & Primary Action */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs whitespace-nowrap shrink-0">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                isConnected
                  ? 'bg-emerald-400'
                  : connection.state === 'discovering'
                  ? 'bg-cyan-400 animate-pulse'
                  : 'bg-slate-600'
              }`}
            />
            <span className="font-mono tabular-nums text-slate-200 font-semibold text-[11px] sm:text-xs">
              {isConnected
                ? `${Math.max(1, connection.latencyMs)}ms · ${engine.livePollingRateHz}Hz`
                : `PIN ${connection.pairingPin}`}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowGitHubModal(true)}
            className="h-8 sm:h-9 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 font-bold text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            title="Release to GitHub (hasibcore/Air_Canvas)"
          >
            <FolderGit2 className="w-3.5 h-3.5 shrink-0" />
            <span>Air_Canvas Release</span>
          </button>

          <button
            type="button"
            onClick={onOpenDrawingScreen}
            className="h-8 sm:h-9 px-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Maximize2 className="w-3.5 h-3.5 shrink-0" />
            <span>Open Tablet Pad</span>
          </button>
        </div>
      </header>


      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-y-auto p-3 sm:p-5">
        <div className="max-w-4xl mx-auto w-full space-y-4">
          {/* Role Switcher + Full Pad ➔ PC Software Working Area Status */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('server');
                  connection.setMode('server');
                }}
                className={`px-3.5 py-2 rounded-lg flex items-center gap-2 text-xs font-bold transition-colors whitespace-nowrap ${
                  activeTab === 'server'
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Monitor className="w-4 h-4 shrink-0" />
                <span>PC Host</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('client');
                  connection.setMode('client');
                }}
                className={`px-3.5 py-2 rounded-lg flex items-center gap-2 text-xs font-bold transition-colors whitespace-nowrap ${
                  activeTab === 'client'
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Smartphone className="w-4 h-4 shrink-0" />
                <span>Mobile / Tablet Pad</span>
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 rounded-xl min-w-0">
              <AppWindow className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">
                Mobile Full Pad (100%) ➔ PC [{activeProfile.shortName}] ({swPixels.width}×{swPixels.height}px)
              </span>
            </div>
          </div>

          {/* Target PC Software Working Area Selector Card */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <AppWindow className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="text-xs sm:text-sm font-bold text-white truncate">
                  Target PC Software Working Area (100% Mobile Pad Mapping)
                </span>
              </div>
              <span className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
                PC {engine.pcScreenWidth}×{engine.pcScreenHeight} • Active {swPixels.width}×{swPixels.height}px
              </span>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
              {PC_SOFTWARE_PROFILES.map((prof) => {
                const isSelected = engine.activeSoftwareId === prof.id;
                return (
                  <button
                    key={prof.id}
                    type="button"
                    onClick={() => engine.setSoftwareProfile(prof.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 border ${
                      isSelected
                        ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-md'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    {prof.shortName}
                  </button>
                );
              })}
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              {activeProfile.description}
            </p>
          </div>

          {/* Active Tab Connection & Pairing Card (Always visible so PIN/QR/Wi-Fi/USB are always accessible) */}
          {activeTab === 'server' ? (
            /* PC HOST VIEW */
            <div className="space-y-4">
              {/* Host Pairing & Control Card */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="space-y-1 text-center sm:text-left min-w-0">
                    <div className="flex items-center justify-center sm:justify-start gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          isConnected
                            ? 'bg-emerald-400'
                            : isServerRunning
                            ? 'bg-cyan-400 animate-pulse'
                            : 'bg-slate-600'
                        }`}
                      />
                      <h3 className="text-sm sm:text-base font-bold text-white truncate">
                        {isConnected
                          ? connection.connectedDeviceName || 'Mobile Tablet Pad Connected'
                          : isServerRunning
                          ? `PC Host Listening (${ipInput || connection.localIp}:${portInput || connection.serverPort})`
                          : 'PC Host Paused'}
                      </h3>
                    </div>
                    <p className="text-xs text-slate-400">
                      Mobile Full-Screen Pad maps 1:1 to {activeProfile.shortName} Working Area ({swPixels.width}×{swPixels.height}px).
                    </p>
                  </div>

                  {/* 4-Digit PIN Input */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-400 font-semibold">PIN:</span>
                    <input
                      type="text"
                      maxLength={6}
                      value={connection.pairingPin}
                      onChange={(e) => {
                        const clean = e.target.value.replace(/[^0-9]/g, '');
                        connection.setPairingPin(clean || '1234');
                      }}
                      className="w-24 bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-base font-bold font-mono tabular-nums tracking-widest text-emerald-400 text-center focus:outline-none focus:border-cyan-400"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const randomPin = String(Math.floor(1000 + Math.random() * 9000));
                        connection.setPairingPin(randomPin);
                      }}
                      className="h-9 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors"
                      title="New PIN"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                    </button>
                  </div>

                  {/* Primary Host Actions */}
                  <div className="flex flex-wrap items-center justify-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleStartStopServer}
                      className={`h-9 px-3.5 rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                        isServerRunning
                          ? 'bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30'
                          : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
                      }`}
                    >
                      {isServerRunning ? (
                        <Square className="w-3.5 h-3.5" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                      <span>{isServerRunning ? 'Stop Host' : 'Start Host'}</span>
                    </button>

                    {onOpenBridge && (
                      <button
                        type="button"
                        onClick={onOpenBridge}
                        className="h-9 px-3.5 rounded-xl font-bold text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Crosshair className="w-3.5 h-3.5" />
                        <span>Run Accuracy Test</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* PC LOCAL IP & PORT DIRECT CONNECTION BAR */}
                <div className="pt-3 border-t border-slate-800/90 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Wifi className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span className="text-xs font-bold text-white truncate">
                        PC Local IP & Port Direct Connect (Wi-Fi LAN / USB Port 9090)
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums text-slate-400">
                      <span>Endpoint: ws://{ipInput || connection.localIp}:{portInput || connection.serverPort}</span>
                      <span>·</span>
                      <button
                        type="button"
                        onClick={handleAutoDetectLocalIp}
                        className="text-cyan-400 hover:text-cyan-300 underline font-semibold"
                      >
                        Auto-Detect IP
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                    <div className="sm:col-span-5">
                      <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                        PC Local IP Address (Wi-Fi / LAN / 127.0.0.1)
                      </label>
                      <input
                        type="text"
                        value={ipInput}
                        onChange={(e) => {
                          setUserEditedIp(true);
                          setIpInput(e.target.value);
                          connection.setLocalIp(e.target.value);
                        }}
                        placeholder="192.168.1.105"
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono tabular-nums text-xs sm:text-sm font-bold focus:outline-none focus:border-cyan-400"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                        TCP Port
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={65535}
                        value={portInput}
                        onChange={(e) => {
                          setPortInput(e.target.value);
                          const p = parseInt(e.target.value, 10);
                          if (!isNaN(p) && p >= 1 && p <= 65535) {
                            connection.setServerPort(p);
                          }
                        }}
                        placeholder="9090"
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-emerald-400 font-mono tabular-nums text-xs sm:text-sm font-bold text-center focus:outline-none focus:border-cyan-400"
                      />
                    </div>

                    <div className="sm:col-span-5 flex flex-wrap sm:flex-nowrap items-end gap-2 pt-1 sm:pt-4">
                      <button
                        type="button"
                        disabled={isConnecting}
                        onClick={() => handleConnectPcLocalIpPort(true)}
                        className="flex-1 h-9 px-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap disabled:opacity-50"
                      >
                        <Zap className="w-3.5 h-3.5 shrink-0" />
                        <span>{isConnecting ? 'Connecting...' : 'Connect IP:Port'}</span>
                      </button>

                      <button
                        type="button"
                        disabled={isVerifyingLink}
                        onClick={handleVerifyDualDeviceLink}
                        className="h-9 px-3 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                        title="Verify 2-Device Connection (Android APK ↔ PC Port 9090)"
                      >
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{isVerifyingLink ? 'Checking...' : 'Verify 2-Device'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleCopyIpPort}
                        className="h-9 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                        title="Copy IP:Port for Mobile App"
                      >
                        {copiedEndpoint ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-cyan-400" />
                        )}
                        <span>{copiedEndpoint ? 'Copied' : 'Copy IP:Port'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Quick Local IP & Port Selector Buttons */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[11px]">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-slate-400 font-medium">Detected IPs:</span>
                      {(connection.allLocalIps.length > 0
                        ? connection.allLocalIps
                        : [connection.localIp || '192.168.1.105', '127.0.0.1']
                      ).map((ip) => (
                        <button
                          key={ip}
                          type="button"
                          onClick={() => {
                            setUserEditedIp(true);
                            setIpInput(ip);
                            connection.setLocalIp(ip);
                          }}
                          className={`px-2 py-1 rounded-lg font-mono tabular-nums text-[11px] border transition-colors whitespace-nowrap ${
                            ipInput === ip
                              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/50 font-bold'
                              : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                          }`}
                        >
                          {ip === '127.0.0.1' ? '127.0.0.1 (USB)' : ip}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setPortInput('9090');
                          connection.setServerPort(9090);
                        }}
                        className={`px-2 py-1 rounded-lg font-mono tabular-nums text-[11px] border transition-colors whitespace-nowrap ${
                          portInput === '9090'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50 font-bold'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                      >
                        Port 9090
                      </button>
                    </div>

                    {ipStatusBanner && (
                      <span className="text-emerald-300 font-mono tabular-nums text-[11px] truncate">
                        {ipStatusBanner}
                      </span>
                    )}
                  </div>

                  {/* 4-Stage Dual-Device Verification Strip */}
                  {dualCheckStages.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                      {dualCheckStages.map((st) => (
                        <div
                          key={st.id}
                          className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-mono tabular-nums flex flex-col justify-between ${
                            st.passed
                              ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                              : 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 font-bold">
                            <span className="truncate">{st.label}</span>
                            <span>{st.passed ? 'PASS' : 'WAIT'}</span>
                          </div>
                          <span className="text-[10px] text-slate-300 truncate">{st.detail}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Clean QR Code Pairing Card */}
              <QRCodeCard connection={connection} />
            </div>
          ) : (
            /* MOBILE / TABLET CLIENT VIEW */
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center border border-cyan-500/30 shrink-0">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-white text-sm truncate">
                      Use Mobile Full Screen as Graphics Tablet Pad
                    </h3>
                    <p className="text-xs text-slate-400 truncate">
                      100% of Mobile Pad maps directly to PC {activeProfile.shortName} Working Area ({swPixels.width}×{swPixels.height}px)
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowScannerModal(true)}
                  className="h-9 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0"
                >
                  <QrCode className="w-4 h-4" />
                  <span>Scan QR</span>
                </button>
              </div>

              {/* Direct Local IP + Port + PIN Input Row */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                <div className="sm:col-span-5">
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                    PC Local IP Address (Wi-Fi / USB)
                  </label>
                  <input
                    type="text"
                    value={ipInput}
                    onChange={(e) => {
                      setUserEditedIp(true);
                      setIpInput(e.target.value);
                      connection.setLocalIp(e.target.value);
                    }}
                    placeholder="192.168.1.105"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono tabular-nums font-bold text-sm focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                    Port
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={portInput}
                    onChange={(e) => {
                      setPortInput(e.target.value);
                      const p = parseInt(e.target.value, 10);
                      if (!isNaN(p) && p >= 1 && p <= 65535) {
                        connection.setServerPort(p);
                      }
                    }}
                    placeholder="9090"
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-emerald-400 font-mono tabular-nums text-center font-bold text-sm focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                    PIN
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={quickPin}
                    onChange={(e) => setQuickPin(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="1234"
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono tabular-nums text-center tracking-widest font-bold text-sm focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div className="sm:col-span-3">
                  <button
                    type="button"
                    disabled={isConnecting}
                    onClick={() => handleConnectClient('wifi')}
                    className="w-full py-2.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <Wifi className="w-4 h-4 shrink-0" />
                    <span>{isConnecting ? 'Connecting...' : 'Connect IP:Port'}</span>
                  </button>
                </div>
              </div>

              {/* Primary Full Tablet Pad Launch Button */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <button
                  type="button"
                  disabled={isConnecting || !quickPin}
                  onClick={() => handleConnectClient('cloud')}
                  className="flex-1 py-2.5 px-4 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-xs transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Zap className="w-4 h-4 shrink-0" />
                  <span>{isConnecting ? 'Connecting...' : 'Connect & Open Full Tablet Pad'}</span>
                </button>
              </div>

              {/* Transport Mode Direct Buttons */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleConnectClient('wifi')}
                  className="py-2.5 px-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Wifi className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Same Wi-Fi ({ipInput || connection.localIp}:{portInput || connection.serverPort})</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setUserEditedIp(true);
                    setIpInput('127.0.0.1');
                    setPortInput('9090');
                    handleConnectClient('usb');
                  }}
                  className="py-2.5 px-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Cable className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>USB Cable (127.0.0.1:9090)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleConnectClient('cloud')}
                  className="py-2.5 px-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Cloud className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <span>Web Relay (PIN: {quickPin || connection.pairingPin})</span>
                </button>
              </div>
            </div>
          )}

          {/* Live PC Software Working Area Receiver Preview Card */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle
                  className={`w-4 h-4 shrink-0 ${
                    isConnected ? 'text-emerald-400' : 'text-cyan-400'
                  }`}
                />
                <span className="text-xs sm:text-sm font-bold text-white truncate">
                  {isConnected
                    ? `${connection.connectedDeviceName || 'PC & Mobile Connected'} — Live Working Area`
                    : `Live PC Software Working Area Preview (${activeProfile.shortName})`}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    const nextMode = engine.brushSettings.mode === 'eraser' ? 'pen' : 'eraser';
                    engine.updateBrush({ mode: nextMode });
                    connection.sendBrushUpdate(engine.brushSettings);
                    connection.sendAction(nextMode === 'eraser' ? 'eraserShortcut' : 'brushShortcut');
                  }}
                  onClick={() => {
                    // Handled via onPointerDown for instant response
                  }}
                  className={`h-8 px-3 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-colors ${
                    engine.brushSettings.mode === 'eraser'
                      ? 'bg-pink-500/20 text-pink-300 border-pink-500/50 shadow-sm'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  }`}
                  title="Toggle Pixel Eraser (Shortcut: E)"
                >
                  <Eraser className="w-3.5 h-3.5" />
                  <span>{engine.brushSettings.mode === 'eraser' ? 'Eraser ON' : 'Erase'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => engine.clearCanvas()}
                  className="h-8 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
                >
                  Clear
                </button>
                {onOpenStudio && (
                  <button
                    type="button"
                    onClick={onOpenStudio}
                    className="h-8 px-3 rounded-xl bg-purple-600/80 hover:bg-purple-600 text-white font-bold text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <span>Studio</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onOpenDrawingScreen}
                  className="h-8 px-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Full Pad</span>
                </button>
              </div>
            </div>

            {/* Bounded Responsive Container so Software Docks & Working Area Never Overflow */}
            <div className="w-full h-[220px] sm:h-[300px] bg-slate-950/90 border border-slate-800 rounded-xl p-1.5 flex items-center justify-center overflow-hidden">
              <div
                style={{ aspectRatio: `${engine.pcScreenWidth} / ${engine.pcScreenHeight}` }}
                className="relative max-w-full max-h-full w-full h-full bg-slate-950 border border-cyan-500/30 rounded-lg overflow-hidden shadow-inner"
              >
                {hasSoftwareMargins && (
                  <>
                    {swRect.top > 0 && (
                      <div
                        style={{
                          left: 0,
                          top: 0,
                          width: '100%',
                          height: `${swRect.top * 100}%`,
                        }}
                        className="absolute bg-slate-900/95 border-b border-slate-800 flex items-center justify-between px-2.5 text-[9px] font-mono text-slate-400 pointer-events-none overflow-hidden"
                      >
                        <span className="font-bold text-slate-300 truncate">
                          {activeProfile.shortName} — {activeProfile.topBarLabel || 'Menu Bar'}
                        </span>
                        <span className="shrink-0 ml-2 hidden sm:inline">
                          Working Area: {swPixels.width}×{swPixels.height}px
                        </span>
                      </div>
                    )}
                    {swRect.left > 0 && (
                      <div
                        style={{
                          left: 0,
                          top: `${swRect.top * 100}%`,
                          width: `${swRect.left * 100}%`,
                          height: `${(swRect.bottom - swRect.top) * 100}%`,
                        }}
                        className="absolute bg-slate-900/90 border-r border-slate-800 flex items-center justify-center text-[8px] font-mono text-slate-500 pointer-events-none overflow-hidden"
                      >
                        {swRect.left >= 0.06 && (
                          <span className="-rotate-90 whitespace-nowrap">
                            {activeProfile.leftDockLabel || 'Tools'}
                          </span>
                        )}
                      </div>
                    )}
                    {swRect.right < 1 && (
                      <div
                        style={{
                          left: `${swRect.right * 100}%`,
                          top: `${swRect.top * 100}%`,
                          width: `${(1 - swRect.right) * 100}%`,
                          height: `${(swRect.bottom - swRect.top) * 100}%`,
                        }}
                        className="absolute bg-slate-900/90 border-l border-slate-800 flex items-center justify-center p-1 text-[8px] font-mono text-slate-400 text-center pointer-events-none overflow-hidden"
                      >
                        {1 - swRect.right >= 0.08 && (
                          <span className="truncate">{activeProfile.rightDockLabel || 'Layers'}</span>
                        )}
                      </div>
                    )}
                    {swRect.bottom < 1 && (
                      <div
                        style={{
                          left: 0,
                          top: `${swRect.bottom * 100}%`,
                          width: '100%',
                          height: `${(1 - swRect.bottom) * 100}%`,
                        }}
                        className="absolute bg-slate-900/95 border-t border-slate-800 flex items-center justify-between px-2.5 text-[8px] font-mono text-slate-500 pointer-events-none overflow-hidden"
                      >
                        {1 - swRect.bottom >= 0.06 && (
                          <span className="truncate">{activeProfile.bottomBarLabel || 'Status'}</span>
                        )}
                      </div>
                    )}
                  </>
                )}

                <div
                  style={{
                    left: `${swRect.left * 100}%`,
                    top: `${swRect.top * 100}%`,
                    width: `${(swRect.right - swRect.left) * 100}%`,
                    height: `${(swRect.bottom - swRect.top) * 100}%`,
                  }}
                  className="absolute border border-cyan-400/60 overflow-hidden bg-[#0A0A12]"
                >
                  <DrawingCanvas engine={engine} showGrid={true} className="w-full h-full" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* QR Code Camera Scanner Modal */}
      <QRScannerModal
        connection={connection}
        isOpen={showScannerModal}
        onClose={() => setShowScannerModal(false)}
        onConnected={() => {
          setShowScannerModal(false);
          engine.fullScreenTabletMode = true;
          onOpenDrawingScreen();
        }}
      />

      {/* GitHub Air_Canvas Release & Direct Push Modal */}
      <GitHubReleaseModal
        isOpen={showGitHubModal}
        onClose={() => setShowGitHubModal(false)}
      />
    </div>
  );
};

