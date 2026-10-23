import React, { useState, useEffect } from 'react';
import { ConnectionManager } from './services/connectionManager.ts';
import { DrawingEngine } from './services/drawingEngine.ts';
import { HomeScreen } from './components/home/HomeScreen.tsx';
import { DrawingScreen } from './components/drawing/DrawingScreen.tsx';
import { DrawingStudio } from './components/studio/DrawingStudio.tsx';
import { DualDeviceBridge } from './components/home/DualDeviceBridge.tsx';

export function App() {
  const [view, setView] = useState<'home' | 'tablet' | 'studio' | 'bridge'>('home');
  const [autoRunBridgeSuite, setAutoRunBridgeSuite] = useState(false);
  const [connection] = useState(() => ConnectionManager.getInstance());
  const [engine] = useState(() => DrawingEngine.getInstance());
  const [, setTick] = useState(0);

  // Subscribe to changes from services & wire cross-device screen adaptation
  useEffect(() => {
    const unsubConn = connection.subscribe(() => setTick((t) => t + 1));
    const unsubEngine = engine.subscribe(() => setTick((t) => t + 1));

    engine.onInputGenerated = (event) => {
      connection.sendInputEvent(event);
    };

    connection.onInputReceived = (event) => {
      engine.handleIncomingInputEvent(event);
    };

    connection.onBrushReceived = (brush) => {
      engine.updateBrush(brush);
      if (brush.mode && typeof window !== 'undefined') {
        const key = brush.mode === 'eraser' ? 'e' : 'b';
        const code = brush.mode === 'eraser' ? 'KeyE' : 'KeyB';
        window.dispatchEvent(new KeyboardEvent('keydown', { key, code }));
      }
    };

    connection.onActionReceived = (action) => {
      if (action === 'undo') engine.undo();
      if (action === 'clear') engine.clearCanvas();
      if (action === 'eraserShortcut') {
        engine.updateBrush({ mode: 'eraser' });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', code: 'KeyE' }));
        }
      }
      if (action === 'brushShortcut') {
        if (engine.brushSettings.mode === 'eraser') {
          engine.updateBrush({ mode: 'pen' });
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', code: 'KeyB' }));
        }
      }
    };

    connection.onScreenSyncReceived = (width, height) => {
      engine.setPcScreenDimensions(width, height);
    };

    engine.onSoftwareProfileChanged = (profileId, workingArea) => {
      connection.sendSoftwareSync(profileId, workingArea);
    };

    connection.onSoftwareSyncReceived = (profileId, workingArea) => {
      engine.setSoftwareProfile(profileId as any, workingArea, false);
    };

    // Track local PC viewport resize when acting as Host Server
    const handleHostResize = () => {
      if (connection.mode === 'server') {
        const w = Math.max(320, window.innerWidth || window.screen?.width || 1920);
        const h = Math.max(240, window.innerHeight || window.screen?.height || 1080);
        engine.setPcScreenDimensions(w, h);
        connection.broadcastScreenDimensions(w, h);
        connection.sendSoftwareSync(engine.activeSoftwareId, engine.softwareWorkingArea);
      }
    };
    window.addEventListener('resize', handleHostResize);

    return () => {
      unsubConn();
      unsubEngine();
      window.removeEventListener('resize', handleHostResize);
    };
  }, [connection, engine]);

  // Handle QR code auto-connection from scanned URL parameters or automatic Host/Client startup
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const shouldConnect = params.get('connect') === 'true' || params.has('ip') || params.has('pin');
      const isMobileOrTablet =
        window.innerWidth < 768 ||
        ('ontouchstart' in window && window.innerWidth < 1024) ||
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

      if (params.get('autotest') === 'true' || params.get('view') === 'bridge') {
        setAutoRunBridgeSuite(true);
        setView('bridge');
      }

      if (shouldConnect) {
        const ip = params.get('ip') || connection.localIp;
        const port = parseInt(params.get('port') || String(connection.serverPort), 10);
        const pin = params.get('pin') || connection.pairingPin || '1234';
        const viewParam = params.get('view') || params.get('mode');
        const transportParam =
          params.get('transport') ||
          (viewParam === 'cloud' || viewParam === 'wifi' || viewParam === 'usb' ? viewParam : null);
        const transportMode =
          transportParam === 'usb' || ip === '127.0.0.1'
            ? 'usb'
            : transportParam === 'wifi'
            ? 'wifi'
            : 'cloud';

        const targetView =
          viewParam === 'studio' ? 'studio' : viewParam === 'bridge' ? 'bridge' : 'tablet';
        setView(targetView);

        connection.connectToServer(ip, port, pin, transportMode);
      } else if (isMobileOrTablet) {
        // On Mobile / Tablet: default to Client mode, 100% Full-Screen Tablet Pad, and auto-pair with PIN 1234
        engine.fullScreenTabletMode = true;
        connection.mode = 'client';
        connection.connectToServer(
          connection.localIp,
          connection.serverPort,
          connection.pairingPin || '1234',
          'wifi'
        );
      } else {
        // On Host PC / Mac: detect real screen dimensions and auto-start server listener
        const w = Math.max(320, window.innerWidth || window.screen?.width || 1920);
        const h = Math.max(240, window.innerHeight || window.screen?.height || 1080);
        engine.setPcScreenDimensions(w, h);
        if (connection.state === 'disconnected') {
          connection.startServer(connection.pairingPin || '1234');
        }
        connection.broadcastScreenDimensions(w, h);
        connection.sendSoftwareSync(engine.activeSoftwareId, engine.softwareWorkingArea);
      }
    } catch (e) {
      console.warn('Error reading connection URL query', e);
    }
  }, [connection, engine]);

  if (view === 'tablet') {
    return (
      <DrawingScreen
        engine={engine}
        connection={connection}
        onExit={() => setView('home')}
        onOpenTestSuite={() => {
          setAutoRunBridgeSuite(true);
          setView('bridge');
        }}
      />
    );
  }

  if (view === 'studio') {
    return (
      <DrawingStudio
        engine={engine}
        connection={connection}
        onExit={() => setView('home')}
      />
    );
  }

  if (view === 'bridge') {
    return (
      <DualDeviceBridge
        engine={engine}
        connection={connection}
        autoRunSuite={autoRunBridgeSuite}
        onExit={() => {
          setAutoRunBridgeSuite(false);
          setView('home');
        }}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0A0A12] text-slate-100 select-none">
      <HomeScreen
        connection={connection}
        engine={engine}
        onOpenDrawingScreen={() => setView('tablet')}
        onOpenStudio={() => setView('studio')}
        onOpenBridge={() => {
          setAutoRunBridgeSuite(true);
          setView('bridge');
        }}
      />
    </div>
  );
}

export default App;
