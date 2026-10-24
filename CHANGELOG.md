# Changelog

All notable changes to **Air Canvas** are documented in this file.

## [2.0.4] — 2026-10-24

### Added
- **Master Coordinate Mapping Pipeline (Part B / Appendix A Standards)**:
  - Strict aspect-ratio preservation (`fitActiveRect` / `ComputeAspectPreservingTargetRect`) preventing circle-to-oval distortion on mismatched PC/tablet ratios.
  - Per-Monitor V2 DPI awareness with physical multi-monitor enumeration (`EnumDisplayMonitors`) and virtual desktop coordinate space mapping (supporting secondary and negative monitor coordinates).
  - Exact pixel boundaries via `DwmGetWindowAttribute` with `DWMWA_EXTENDED_FRAME_BOUNDS` for foreground window targeting.
  - Half-way rounding trap elimination: Replaced banker's rounding with `MidpointRounding.AwayFromZero` across C#, Dart, and JavaScript engines.
  - Active-stroke boundary latching (`StrokeRegionGate` and `_latchedStrokePadRect`) ensuring 0 px mid-stroke jumps during window resize or display changes.
  - Deterministic startup self-tests: `--mapping-selftest` and `--connection-selftest` validating geometry and transport security without injecting input.
- **Connection Hardening & Transport Contracts**:
  - P0 Handshake Gate: Enforced strict pre-ready binary pointer rejection (`UNAUTHENTICATED`) on WebSocket and relay streams.
  - Standardized `aircanvas://pair` strict QR URI format (Appendix A.4) with 128-bit single-use pairing tokens (120s TTL) and PIN fallback.
  - Reconnection with constant-time HMAC-SHA256 session proof verification across C#, Dart, and Node.js.
  - Single active controller session invariant with `busy` policy rejection for competing devices.
  - Automated ADB reverse tunnel manager detecting platform-tools and setting up `tcp:9090` USB cables automatically.
  - Directed UDP broadcast beaconing across all active physical network interfaces on port 9091.

### Verified
- 41/41 Appendix A contract vectors passing in both Dart and Node.js.
- 117/117 connection contract tests passing in Node.js and 108/108 in Dart.
- 2,039 deterministic assertions passing across 16 fuzz, calibration, and mapping suites.
- 11/11 native socket integration tests passing against live `AirCanvasServer.exe`.

---

## [2.0.0] — 2026-10-17

### Added
- **100% Mobile Full-Screen Tablet Pad ➔ PC Software Working Area 1:1 Mapping**:
  - Added **Auto-Detect PC Working Area** (`autoDetect`) as the default profile, automatically calculating the active software canvas bounds from the PC display aspect ratio and window geometry.
  - Added preset PC software working area profiles for **Photoshop / Krita / CSP**, **OneNote / PDF / Classroom**, **Illustrator / Affinity**, **Blender / ZBrush 3D**, **MS Paint / Excalidraw / Web**, **Full PC Screen**, and **Custom Working Area** (with interactive Left, Top, Right, and Bottom UI margin sliders).
  - Added real-time `software_sync` WebSocket and `BroadcastChannel` synchronization so selecting or adjusting a PC software working area on either PC or Mobile updates both devices immediately.
- **Auto-Landscape Full-Screen Mobile Pad**:
  - Automatic 90° landscape rotation when opened on a portrait mobile/tablet screen, with one-tap **180° Left/Right-Hand Flip** (`90° R` / `90° L`) and native `screen.orientation.lock('landscape')` support.
- **High-Frequency Coalesced Pointer Sampling**:
  - Added `PointerEvent.getCoalescedEvents()` processing in `DrawingCanvas` to capture all intermediate 120Hz/240Hz stylus and touch samples for ultra-smooth curves.
- **WebSocket Relay Room State Caching**:
  - Cached the latest `screen_sync` and `software_sync` payloads per PIN room in both `vite.config.ts` and `server.js` so newly connected or reconnecting mobile pads immediately receive the PC Host's screen resolution and active software working area.
- **4-Stage PC & Mobile Accuracy Test Suite (`DualDeviceBridge`)**:
  - Automated verification for Wi-Fi/USB/QR multi-transport handshakes, 5-point coordinate calibration (`±0.0 px` drift), 4096-level pressure continuity, and 240Hz packet delivery.

### Fixed
- **Eliminated Unwanted Straight Lines & Multi-Touch Jumps**:
  - Enforced strict single-pointer tracking (`activePointerId`) so secondary fingers or resting palms never interleave with an active stroke.
  - Separated local (`currentStroke`) and remote (`currentRemoteStroke`) stroke buffers.
  - Added global `pointerup`, `pointercancel`, `blur`, `visibilitychange`, and `contextmenu` safety listeners to prevent stuck open strokes.
- **Fixed Disjoint Responsive Toolbar & Canvas Stage Layout**:
  - Added `.fixed-toolbar-layer-top`, `.fixed-canvas-stage-layer`, and `.fixed-toolbar-layer-bottom` CSS rules and `ResizeObserver` inset tracking so top and bottom toolbars never overlap the drawing canvas on mobile or PC screens.
  - Kept PC Host and Mobile Tablet Pad pairing controls persistently visible alongside the bounded Live PC Software Working Area Preview on `HomeScreen`.
  - Added `overflow-hidden` and responsive size guards to simulated PC software UI docks and removed overlapping corner badges.
  - Fixed `ReferenceError: avgLatencyMs is not defined` in `DualDeviceBridge.tsx`.

---

## [1.1.0] — Initial Release
- Initial cross-platform wireless graphics tablet implementation with 13-byte binary packet protocol, PIN pairing, and basic canvas drawing.
