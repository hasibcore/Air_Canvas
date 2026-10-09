import React, { useState, useEffect } from 'react';
import {
  Monitor,
  Smartphone,
  Brush,
  Globe,
  Wifi,
  ExternalLink,
  Layers,
  ArrowRight,
  Crosshair,
} from 'lucide-react';
import { ConnectionManager } from './services/connectionManager.ts';
import { DrawingEngine } from './services/drawingEngine.ts';
import { LicenseService } from './services/licenseService.ts';
import { HomeScreen } from './components/home/HomeScreen.tsx';
import { DrawingScreen } from './components/drawing/DrawingScreen.tsx';
import { DrawingStudio } from './components/studio/DrawingStudio.tsx';
import { LandingPage } from './components/landing/LandingPage.tsx';
import { DualDeviceBridge } from './components/home/DualDeviceBridge.tsx';
import { ProUpgradeModal } from './components/licensing/ProUpgradeModal.tsx';
import { CloudSubscriptionModal } from './components/licensing/CloudSubscriptionModal.tsx';
import { Crown, Sparkles, Database } from 'lucide-react';

export function App() {
  const [view, setView] = useState<'home' | 'tablet' | 'studio' | 'landing' | 'bridge'>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      const v = p.get('view') || p.get('mode');
      if (v === 'bridge' || v === 'tablet' || v === 'studio' || v === 'landing') {
        return v as any;
      }
    }
    return 'home';
  });
  const [connection] = useState(() => ConnectionManager.getInstance());
  const [engine] = useState(() => DrawingEngine.getInstance());
  const [license] = useState(() => LicenseService.getInstance());
  const [showProModal, setShowProModal] = useState(false);
  const [showCloudModal, setShowCloudModal] = useState(false);
  const [, setTick] = useState(0);

  // Subscribe to changes from services
  useEffect(() => {
    const unsubConn = connection.subscribe(() => setTick((t) => t + 1));
    const unsubEngine = engine.subscribe(() => setTick((t) => t + 1));
    const unsubLicense = license.subscribe(() => setTick((t) => t + 1));

    // Connect engine input events to network stream
    engine.onInputGenerated = (event) => {
      connection.sendInputEvent(event);
    };

    // Connect incoming network stream to engine
    connection.onInputReceived = (event) => {
      engine.handleIncomingInputEvent(event);
    };

    connection.onBrushReceived = (brush) => {
      engine.updateBrush(brush);
    };

    connection.onActionReceived = (action) => {
      if (action === 'undo') engine.undo();
      if (action === 'clear') engine.clearCanvas();
    };

    return () => {
      unsubConn();
      unsubEngine();
      unsubLicense();
    };
  }, [connection, engine, license]);

  // Handle QR code auto-connection from scanned URL parameters
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const shouldConnect = params.get('connect') === 'true' || params.has('ip');
      if (shouldConnect) {
        const ip = params.get('ip') || connection.localIp;
        const port = parseInt(params.get('port') || String(connection.serverPort), 10);
        const pin = params.get('pin') || connection.pairingPin;
        const targetView = params.get('mode');

        connection.connectToServer(ip, port, pin).then((success) => {
          if (success && (targetView === 'tablet' || !targetView)) {
            setView('tablet');
          }
        });
      } else {
        // On host PC: auto-start server relay listener for PIN 1234 so QR scanning pairs instantly
        if (connection.state === 'disconnected') {
          connection.startServer('1234');
        }
      }
    } catch (e) {
      console.warn('Error reading connection URL query', e);
    }
  }, [connection]);

  // If in full tablet mode, render only DrawingScreen with no outer shell
  if (view === 'tablet') {
    return (
      <>
        <DrawingScreen
          engine={engine}
          connection={connection}
          license={license}
          onOpenProModal={() => setShowProModal(true)}
          onExit={() => setView('home')}
        />
        <ProUpgradeModal
          license={license}
          isOpen={showProModal}
          onClose={() => setShowProModal(false)}
        />
      </>
    );
  }

  // If in PC drawing studio mode, render DrawingStudio
  if (view === 'studio') {
    return (
      <>
        <DrawingStudio
          engine={engine}
          connection={connection}
          license={license}
          onOpenProModal={() => setShowProModal(true)}
          onExit={() => setView('home')}
        />
        <ProUpgradeModal
          license={license}
          isOpen={showProModal}
          onClose={() => setShowProModal(false)}
        />
      </>
    );
  }

  // If in showcase landing page mode
  if (view === 'landing') {
    return (
      <>
        <LandingPage
          onLaunchTablet={() => setView('tablet')}
          onLaunchStudio={() => setView('studio')}
          onOpenHub={() => setView('home')}
        />
        <ProUpgradeModal
          license={license}
          isOpen={showProModal}
          onClose={() => setShowProModal(false)}
        />
      </>
    );
  }

  // If in dual device bridge (PC + Mobile live coordinate tester)
  if (view === 'bridge') {
    return (
      <>
        <DualDeviceBridge
          engine={engine}
          connection={connection}
          license={license}
          onOpenProModal={() => setShowProModal(true)}
          onExit={() => setView('home')}
        />
        <ProUpgradeModal
          license={license}
          isOpen={showProModal}
          onClose={() => setShowProModal(false)}
        />
      </>
    );
  }

  // Default: Connection & Management Hub (HomeScreen) with top mode switcher
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0F0F1A] text-slate-100 select-none">
      {/* Top Application Mode Bar */}
      <header className="bg-slate-950 border-b border-slate-800/80 px-4 py-2 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-400 to-purple-600 flex items-center justify-center shadow-[0_0_10px_rgba(0,229,255,0.4)]">
            <Brush className="w-4 h-4 text-slate-950" />
          </div>
          <span className="font-black text-sm text-white tracking-tight">Air Canvas</span>
        </div>

        {/* Mode Quick-Switch Tabs */}
        <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setView('home')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-bold transition-all ${
              view === 'home'
                ? 'bg-purple-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Connection Hub</span>
          </button>

          <button
            type="button"
            onClick={() => setView('tablet')}
            className="px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
          >
            <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
            <span>Tablet Drawing Pad</span>
          </button>

          <button
            type="button"
            onClick={() => setView('studio')}
            className="px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
          >
            <Monitor className="w-3.5 h-3.5 text-purple-400" />
            <span>PC Drawing Studio</span>
          </button>

          <button
            type="button"
            onClick={() => setView('bridge')}
            className="px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
          >
            <Crosshair className="w-3.5 h-3.5 text-emerald-400" />
            <span>Dual-Device Bridge (PC+Mobile)</span>
          </button>

          <button
            type="button"
            onClick={() => setView('landing')}
            className="hidden sm:flex px-3 py-1.5 rounded-lg items-center gap-1.5 font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
          >
            <Globe className="w-3.5 h-3.5 text-emerald-400" />
            <span>Showcase & Docs</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCloudModal(true)}
            className="px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-bold text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 transition-all"
            title="Inspect Supabase DB, Google Play Billing & Entitlements API"
          >
            <Database className="w-3.5 h-3.5 text-blue-400" />
            <span>Cloud & Subscriptions</span>
          </button>
        </div>

        {/* Status Pill & Pro Badge */}
        <div className="flex items-center gap-2 text-xs">
          {/* Pro / Free Edition Pill */}
          <button
            type="button"
            onClick={() => setShowProModal(true)}
            className={`px-2.5 py-1 rounded-full border text-[11px] font-bold flex items-center gap-1.5 transition-all shadow-sm ${
              license.isPro
                ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/40 shadow-amber-500/10'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            title="Click to manage license & compare Free vs Pro features"
          >
            {license.isPro ? (
              <>
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-black">PRO STUDIO</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>FREE (UPGRADE)</span>
              </>
            )}
          </button>

          <div
            className={`px-2.5 py-1 rounded-full border text-[11px] font-bold flex items-center gap-1.5 ${
              connection.state === 'connected'
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : connection.state === 'discovering'
                ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30 animate-pulse'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                connection.state === 'connected'
                  ? 'bg-emerald-400'
                  : connection.state === 'discovering'
                  ? 'bg-cyan-400'
                  : 'bg-slate-500'
              }`}
            />
            <span className="capitalize">{connection.state}</span>
          </div>
        </div>
      </header>

      {/* Main Home Screen */}
      <HomeScreen
        connection={connection}
        engine={engine}
        license={license}
        onOpenDrawingScreen={() => setView('tablet')}
        onOpenStudio={() => setView('studio')}
        onOpenBridge={() => setView('bridge')}
        onOpenProModal={() => setShowProModal(true)}
        onOpenCloudModal={() => setShowCloudModal(true)}
      />

      {/* Pro Upgrade & Comparison Modal */}
      <ProUpgradeModal
        license={license}
        isOpen={showProModal}
        onClose={() => setShowProModal(false)}
      />

      {/* Cloud Hosting, Supabase & Google Play Subscriptions Architecture Modal */}
      <CloudSubscriptionModal
        license={license}
        isOpen={showCloudModal}
        onClose={() => setShowCloudModal(false)}
      />
    </div>
  );
}

export default App;
