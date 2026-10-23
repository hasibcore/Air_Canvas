# Changelog

All notable changes to **Air Canvas** are documented in this file.

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
