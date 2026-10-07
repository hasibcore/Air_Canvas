// Core AirCanvas Types & Interfaces

export type PointerKind = 'finger' | 'stylus' | 'mouse' | 'eraser';

export type InputEventType =
  | 'pointerDown'
  | 'pointerMove'
  | 'pointerUp'
  | 'pointerCancel'
  | 'hover'
  | 'clear';

export interface InputEventData {
  type: InputEventType;
  x: number; // Normalized 0.0 - 1.0
  y: number; // Normalized 0.0 - 1.0
  pressure: number; // 0.0 - 1.0
  pointerType: PointerKind;
  pointerId: number;
  tiltX: number; // -90 to 90 degrees
  tiltY: number; // -90 to 90 degrees
  buttons: number;
  sequenceNumber: number;
  timestamp: number;
}

export type PrecisionMode = 'proAdaptive' | 'rawDirect' | 'studioSmooth';

export type PressureCurveType = 'standard' | 'soft' | 'firm' | 'sCurve';

export type WritingScalePreset = 'compact' | 'medium' | 'full';

export type WritingAnchor = 'topLeft' | 'center';

export type BrushMode = 'pen' | 'pencil' | 'brush' | 'highlighter' | 'eraser' | 'laser';

export interface BrushSettings {
  color: string;
  baseWidth: number;
  pressureSensitivity: number; // 0.0 - 1.0
  opacity: number;
  mode: BrushMode;
  smoothing: boolean;
  smoothingStrength: number;
}

export interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
  pointerType: PointerKind;
  width: number;
  timestamp: number;
  tiltX?: number;
  tiltY?: number;
}

export interface Stroke {
  id: string;
  points: StrokePoint[];
  settings: BrushSettings;
  startTime: number;
}

export interface DeviceInfo {
  deviceName: string;
  deviceModel: string;
  platform: 'android' | 'ios' | 'windows' | 'macos' | 'linux' | 'web';
  screenWidth: number;
  screenHeight: number;
  hasStylusSupport: boolean;
  maxPressure: number;
}

export interface ServerConfig {
  port: number;
  useBinaryProtocol: boolean;
  targetFPS: number;
  enablePressureSmoothing: boolean;
  enablePrediction: boolean;
  screenWidth: number;
  screenHeight: number;
}

export type ConnectionMode = 'server' | 'client';

export type TransportType = 'auto' | 'wifi' | 'usb' | 'webrtc';

export type ConnectionState =
  | 'disconnected'
  | 'discovering'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export interface DiscoveredDevice {
  ip: string;
  name: string;
  port: number;
  discoveredAt: number;
  transportType: TransportType;
  model?: string;
  platform?: string;
}

export interface NormalizedRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type ClassAction =
  | 'undo'
  | 'clear'
  | 'pageUp'
  | 'pageDown'
  | 'laser'
  | 'fullscreen'
  | 'save';
