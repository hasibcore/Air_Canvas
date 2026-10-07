import {
  ConnectionMode,
  ConnectionState,
  DeviceInfo,
  DiscoveredDevice,
  InputEventData,
  ServerConfig,
  TransportType,
  ClassAction,
  BrushSettings,
} from '../types/index.ts';

type EventCallback<T> = (data: T) => void;

interface ChannelMessage {
  type:
    | 'discovery_ping'
    | 'discovery_pong'
    | 'connect_request'
    | 'connect_accept'
    | 'connect_reject'
    | 'disconnect'
    | 'input_event'
    | 'brush_update'
    | 'action'
    | 'ping'
    | 'pong';
  senderId: string;
  senderMode: ConnectionMode;
  targetId?: string;
  pin?: string;
  deviceInfo?: DeviceInfo;
  serverConfig?: ServerConfig;
  event?: InputEventData;
  brush?: Partial<BrushSettings>;
  action?: ClassAction;
  timestamp: number;
}

export class ConnectionManager {
  private static instance: ConnectionManager;
  public id: string;
  public mode: ConnectionMode = 'client';
  public state: ConnectionState = 'disconnected';
  public localIp = '192.168.1.105';
  public serverPort = 9090;
  public pairingPin = '1234';
  public connectedDeviceName = '';
  public latencyMs = 2;
  public transportType: TransportType = 'wifi';
  public discoveredDevices: DiscoveredDevice[] = [];
  public remoteDeviceInfo: DeviceInfo | null = null;
  public serverConfig: ServerConfig = {
    port: 9090,
    useBinaryProtocol: true,
    targetFPS: 120,
    enablePressureSmoothing: true,
    enablePrediction: true,
    screenWidth: 1920,
    screenHeight: 1080,
  };

  // Settings
  public hasStylusSupport = true;
  public maxPressureSetting = 1.0;

  // Broadcast channel for multi-tab zero-lag coordination
  private bc: BroadcastChannel | null = null;
  private pingInterval: number | null = null;
  private listeners: Set<() => void> = new Set();

  // Callbacks
  public onInputReceived?: EventCallback<InputEventData>;
  public onBrushReceived?: EventCallback<Partial<BrushSettings>>;
  public onActionReceived?: EventCallback<ClassAction>;

  private constructor() {
    this.id = 'node_' + Math.random().toString(36).substring(2, 9);
    this.setupBroadcastChannel();
  }

  public static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((cb) => cb());
  }

  private setupBroadcastChannel(): void {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    try {
      this.bc = new BroadcastChannel('aircanvas_mesh');
      this.bc.onmessage = (ev: MessageEvent<ChannelMessage>) => {
        this.handleChannelMessage(ev.data);
      };
    } catch (e) {
      console.warn('BroadcastChannel error', e);
    }
  }

  private handleChannelMessage(msg: ChannelMessage): void {
    if (!msg || msg.senderId === this.id) return;

    switch (msg.type) {
      case 'discovery_ping':
        if (this.mode === 'server' && this.state === 'discovering') {
          this.bc?.postMessage({
            type: 'discovery_pong',
            senderId: this.id,
            senderMode: 'server',
            timestamp: Date.now(),
            serverConfig: this.serverConfig,
            deviceInfo: {
              deviceName: 'PC Desktop (AirCanvas Server)',
              deviceModel: 'Windows 11 x64 Synthetic Pointer',
              platform: 'windows',
              screenWidth: 1920,
              screenHeight: 1080,
              hasStylusSupport: true,
              maxPressure: 1.0,
            },
          });
        }
        break;

      case 'discovery_pong':
        if (this.mode === 'client' && this.state === 'discovering') {
          const exists = this.discoveredDevices.some((d) => d.ip === msg.senderId);
          if (!exists) {
            this.discoveredDevices.push({
              ip: msg.senderId,
              name: msg.deviceInfo?.deviceName || 'AirCanvas PC Server',
              port: msg.serverConfig?.port || 9090,
              discoveredAt: Date.now(),
              transportType: 'wifi',
              model: msg.deviceInfo?.deviceModel,
              platform: msg.deviceInfo?.platform,
            });
            this.notify();
          }
        }
        break;

      case 'connect_request':
        if (this.mode === 'server') {
          const pinMatches = !this.pairingPin || msg.pin === this.pairingPin;
          if (pinMatches) {
            this.state = 'connected';
            this.connectedDeviceName = msg.deviceInfo?.deviceName || 'Wireless Tablet Client';
            this.remoteDeviceInfo = msg.deviceInfo || null;
            this.bc?.postMessage({
              type: 'connect_accept',
              senderId: this.id,
              senderMode: 'server',
              targetId: msg.senderId,
              serverConfig: this.serverConfig,
              timestamp: Date.now(),
            });
            this.notify();
          } else {
            this.bc?.postMessage({
              type: 'connect_reject',
              senderId: this.id,
              senderMode: 'server',
              targetId: msg.senderId,
              timestamp: Date.now(),
            });
          }
        }
        break;

      case 'connect_accept':
        if (this.mode === 'client' && (msg.targetId === this.id || !msg.targetId)) {
          this.state = 'connected';
          this.connectedDeviceName = 'PC Desktop (AirCanvas Server)';
          if (msg.serverConfig) {
            this.serverConfig = msg.serverConfig;
          }
          this.startHeartbeat();
          this.notify();
        }
        break;

      case 'connect_reject':
        if (this.mode === 'client' && (msg.targetId === this.id || !msg.targetId)) {
          this.state = 'error';
          this.notify();
        }
        break;

      case 'disconnect':
        if (this.state === 'connected') {
          this.state = 'disconnected';
          this.connectedDeviceName = '';
          this.stopHeartbeat();
          this.notify();
        }
        break;

      case 'input_event':
        if (this.state === 'connected' && msg.event) {
          this.onInputReceived?.(msg.event);
        }
        break;

      case 'brush_update':
        if (this.state === 'connected' && msg.brush) {
          this.onBrushReceived?.(msg.brush);
        }
        break;

      case 'action':
        if (this.state === 'connected' && msg.action) {
          this.onActionReceived?.(msg.action);
        }
        break;

      case 'ping':
        this.bc?.postMessage({
          type: 'pong',
          senderId: this.id,
          senderMode: this.mode,
          timestamp: msg.timestamp,
        });
        break;

      case 'pong':
        if (msg.timestamp) {
          const roundtrip = Math.max(1, Math.round((Date.now() - msg.timestamp) / 2));
          this.latencyMs = Math.min(25, roundtrip);
          this.notify();
        }
        break;
    }
  }

  public setMode(mode: ConnectionMode): void {
    if (this.mode !== mode) {
      this.disconnect();
      this.mode = mode;
      this.notify();
    }
  }

  public startServer(pin = '1234'): void {
    this.mode = 'server';
    this.pairingPin = pin;
    this.state = 'discovering';
    this.notify();
  }

  public stopServer(): void {
    this.disconnect();
  }

  public startDiscovery(): void {
    this.mode = 'client';
    this.state = 'discovering';
    this.discoveredDevices = [];

    // Send broadcast inquiry
    this.bc?.postMessage({
      type: 'discovery_ping',
      senderId: this.id,
      senderMode: 'client',
      timestamp: Date.now(),
    });

    // Provide default simulated server entry so user can connect even with single tab
    setTimeout(() => {
      if (this.state === 'discovering' && this.discoveredDevices.length === 0) {
        this.discoveredDevices.push({
          ip: '192.168.1.105',
          name: 'PC Desktop (AirCanvas Host)',
          port: 9090,
          discoveredAt: Date.now(),
          transportType: 'wifi',
          model: 'Windows 11 Pen Synthetic Pointer Device',
          platform: 'windows',
        });
        this.notify();
      }
    }, 450);

    this.notify();
  }

  public stopDiscovery(): void {
    if (this.state === 'discovering') {
      this.state = 'disconnected';
      this.notify();
    }
  }

  public async connectToServer(
    ip: string,
    port = 9090,
    pin = '1234',
    transport: TransportType = 'wifi'
  ): Promise<boolean> {
    this.mode = 'client';
    this.state = 'connecting';
    this.transportType = transport;
    this.latencyMs = transport === 'usb' ? 1 : 2;
    this.notify();

    const info: DeviceInfo = {
      deviceName: this.hasStylusSupport ? 'Samsung Galaxy Tab S9 (Stylus)' : 'iPad Pro 11 (Apple Pencil)',
      deviceModel: transport === 'usb' ? 'USB-C High-Speed Direct Digitizer' : 'Stylus Active Digitizer',
      platform: 'android',
      screenWidth: typeof window !== 'undefined' ? window.innerWidth : 1920,
      screenHeight: typeof window !== 'undefined' ? window.innerHeight : 1080,
      hasStylusSupport: this.hasStylusSupport,
      maxPressure: this.maxPressureSetting,
    };

    // Broadcast connection request
    this.bc?.postMessage({
      type: 'connect_request',
      senderId: this.id,
      senderMode: 'client',
      pin,
      deviceInfo: info,
      timestamp: Date.now(),
    });

    // Simulated quick connect fallback for single tab / preview demo
    return new Promise((resolve) => {
      setTimeout(() => {
        if (this.state === 'connecting') {
          this.state = 'connected';
          const prefix = transport === 'usb' ? 'USB Cable' : 'WiFi Host';
          this.connectedDeviceName = `AirCanvas ${prefix} (${ip}:${port})`;
          this.startHeartbeat();
          this.notify();
          resolve(true);
        } else if (this.state === 'connected') {
          resolve(true);
        } else {
          resolve(false);
        }
      }, 400);
    });
  }

  public async connectViaUsb(port = 9090): Promise<boolean> {
    return this.connectToServer('127.0.0.1', port, this.pairingPin, 'usb');
  }

  public async connectViaWifi(ip?: string, port?: number, pin?: string): Promise<boolean> {
    const targetIp = ip || this.localIp || '192.168.1.105';
    const targetPort = port || this.serverPort || 9090;
    const targetPin = pin || this.pairingPin || '1234';
    return this.connectToServer(targetIp, targetPort, targetPin, 'wifi');
  }

  public async connectViaQrCode(scannedData: string): Promise<boolean> {
    const parsed = ConnectionManager.parseConnectionString(scannedData);
    if (!parsed) return false;
    return this.connectToServer(parsed.ip, parsed.port, parsed.pin, 'wifi');
  }

  public disconnect(): void {
    this.bc?.postMessage({
      type: 'disconnect',
      senderId: this.id,
      senderMode: this.mode,
      timestamp: Date.now(),
    });
    this.state = 'disconnected';
    this.connectedDeviceName = '';
    this.remoteDeviceInfo = null;
    this.stopHeartbeat();
    this.notify();
  }

  public sendInputEvent(event: InputEventData): void {
    if (this.state !== 'connected') return;
    this.bc?.postMessage({
      type: 'input_event',
      senderId: this.id,
      senderMode: this.mode,
      event,
      timestamp: Date.now(),
    });
  }

  public sendBrushUpdate(brush: Partial<BrushSettings>): void {
    if (this.state !== 'connected') return;
    this.bc?.postMessage({
      type: 'brush_update',
      senderId: this.id,
      senderMode: this.mode,
      brush,
      timestamp: Date.now(),
    });
  }

  public sendAction(action: ClassAction): void {
    if (this.state !== 'connected') return;
    this.bc?.postMessage({
      type: 'action',
      senderId: this.id,
      senderMode: this.mode,
      action,
      timestamp: Date.now(),
    });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingInterval = window.setInterval(() => {
      if (this.state === 'connected') {
        this.bc?.postMessage({
          type: 'ping',
          senderId: this.id,
          senderMode: this.mode,
          timestamp: Date.now(),
        });
      }
    }, 2000);
  }

  private stopHeartbeat(): void {
    if (this.pingInterval !== null) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  public setStylusSupport(enabled: boolean): void {
    this.hasStylusSupport = enabled;
    this.notify();
  }

  public setMaxPressure(maxPressure: number): void {
    this.maxPressureSetting = maxPressure;
    this.notify();
  }

  public setLocalIp(ip: string): void {
    this.localIp = ip.trim();
    this.notify();
  }

  public setServerPort(port: number): void {
    this.serverPort = port;
    this.serverConfig.port = port;
    this.notify();
  }

  public setPairingPin(pin: string): void {
    this.pairingPin = pin.trim();
    this.notify();
  }

  public getConnectionString(
    format: 'web' | 'protocol' | 'ws' | 'json' = 'web',
    customHost?: string
  ): string {
    const host = (customHost || this.localIp).trim();
    const port = this.serverPort;
    const pin = this.pairingPin;

    if (format === 'web') {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
      return `${origin}${pathname}?connect=true&ip=${encodeURIComponent(host)}&port=${port}&pin=${encodeURIComponent(pin)}&mode=tablet`;
    }

    if (format === 'protocol') {
      return `aircanvas://connect?ip=${encodeURIComponent(host)}&port=${port}&pin=${encodeURIComponent(pin)}`;
    }

    if (format === 'ws') {
      return `ws://${host}:${port}?pin=${encodeURIComponent(pin)}`;
    }

    return JSON.stringify({
      app: 'AirCanvas',
      version: '1.7.1',
      ip: host,
      port,
      pin,
      timestamp: Date.now(),
    });
  }

  public static parseConnectionString(
    rawInput: string
  ): { ip: string; port: number; pin: string } | null {
    const input = rawInput.trim();
    if (!input) return null;

    // 1. Try JSON
    if (input.startsWith('{') && input.endsWith('}')) {
      try {
        const parsed = JSON.parse(input);
        if (parsed.ip) {
          return {
            ip: String(parsed.ip),
            port: Number(parsed.port) || 9090,
            pin: String(parsed.pin || '1234'),
          };
        }
      } catch {
        // Continue to other parsers
      }
    }

    // 2. Try Web URL or custom protocol
    if (
      input.startsWith('http://') ||
      input.startsWith('https://') ||
      input.startsWith('aircanvas://') ||
      input.startsWith('ws://') ||
      input.startsWith('wss://')
    ) {
      try {
        const url = new URL(input);
        const searchParams = url.searchParams;

        const ip = searchParams.get('ip') || url.hostname;
        const portStr = searchParams.get('port') || url.port;
        const port = portStr ? parseInt(portStr, 10) : 9090;
        const pin = searchParams.get('pin') || '1234';

        if (ip) {
          return { ip, port: isNaN(port) ? 9090 : port, pin };
        }
      } catch {
        // URL parsing failed, fall back
      }
    }

    // 3. Try IP:PORT:PIN or IP:PORT or plain IP
    const parts = input.split(':');
    if (parts.length >= 1) {
      const ip = parts[0].trim();
      const port = parts.length >= 2 ? parseInt(parts[1].trim(), 10) : 9090;
      const pin = parts.length >= 3 ? parts[2].trim() : '1234';
      if (ip.length > 0) {
        return {
          ip,
          port: isNaN(port) ? 9090 : port,
          pin: pin || '1234',
        };
      }
    }

    return null;
  }
}
