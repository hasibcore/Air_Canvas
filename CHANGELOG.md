# Changelog

All notable changes to **Air Canvas** are documented in this file.

---

## [2.1.3] — 2026-11-13

### Fixed & Hardened
- **Live Drawing Precision & Stroke Continuity**:
  - Preserved final release coordinates on `pointerUp` across `DrawingEngine`, `DrawingCanvas`, `DrawingStudio`, Flutter (`lib/main.dart`), and Windows C# (`AirCanvasServer.cs`), while strictly emitting `pressure = 0` on pen lift.
  - Reset `remoteOneEuro` filters on orphan `pointerMove` events and matched SVG/4K export Bézier smoothing (`pts.length >= 3`) to live canvas rendering.
  - Guarded fast continuous swipes with `dtMs > 160` + `dist > 0.35`, clamped Win32 absolute coordinates to `[0, 65535]`, and preserved cropped `workingAreaDetected` bounds across subsequent `screen_sync` broadcasts.
- **Connection Watchdogs, Relay Pairing & CI Release Pipeline**:
  - Added heartbeat `lastPongAt` (`> 8500ms`) stale-socket watchdogs in Web `ConnectionManager` and Flutter `lib/main.dart`, dynamic `register_host` room-switch notifications, non-phantom `discovery_empty` responses, and `/health` dev middleware parity in `vite.config.ts`.
  - Synced `public/AirCanvasServer.cs` byte-for-byte with `AirCanvasServer.cs`, hardened `AirCanvas.Api` / `edusite_backend` / Supabase constraints (`tests/security_and_unit_suite.mjs` + `tests/e2e_drawing_and_connection_qa.mjs`), and deduplicated GitHub Actions `build-release.yml` runs with `concurrency` for `v2.1.3` APK + EXE builds.

---

## [2.0.5] — 2026-11-07

### Added
- **Tri-Transport Auto-Bridge (Wi-Fi LAN + USB ADB `127.0.0.1:9090` + Cloud Relay PIN)**:
  - Parallel socket race across Local Wi-Fi IP (`:9090`), USB ADB (`127.0.0.1:9090`), Origin WebSocket (`/ws`), and Cloud Relay (`wss://...run.app/ws`) in Web, Android APK (`lib/main.dart`), and Windows C# Server (`AirCanvasServer.cs`).
  - Automatic outbound 256-frame FIFO ring buffer queue when disconnected ("Not Connected" mode), flushing all buffered strokes in exact FIFO order upon reconnect.
- **5-Stage Accuracy & "Not Connected" Resilience Test Suite**:
  - Added Stage 5 **"Not Connected" Test Case** & interactive Offline Mode toggle in `DualDeviceBridge.tsx`, plus Suite G (`run_calibration_tests.js` — 17 suites / 2,039 assertions) and Stage 5 (`test_live_dual_device.js` — 5 loopback integration stages).

### Fixed
- **Aspect Ratio, 90° Rotation & Snipping Box Normalization**:
  - Unified 1:1 physical aspect ratio letterbox/pillarbox math (`activePadRect`) across Web, Flutter APK, and Windows C# Server so circles never stretch into ovals.
  - Fixed 90° portrait-to-landscape rotation transform (`normX = 1 - rawY, normY = rawX` and `180°` flip) and prevented double-mapping when `SnippingBoxSelectorOverlay` is active.
- **Mid-Stroke Disconnect Stuck-Pen Guard & 13-Byte Binary Relay**:
  - Added `ReleaseStuckPointerOnDisconnect` in `AirCanvasServer.cs` and `TargetGeometryManager` so a dropped socket or minimized/disconnected monitor immediately lifts the synthetic pen (`pointerUp`).

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
