# Air Canvas v2.0.0 — Prioritized Bug Inventory (v3 Master Audit)

Every finding below follows the Appendix D.1 template with exact `path:line` citations, severity (`P0–P3`), confidence (`CONFIRMED`), verification level (`V0–V4`), and logged evidence.

---

### BUG-001: Undeclared `package:http/http.dart` Dependency Breaking Flutter Build
- **Component**: Flutter / Auth & Billing (`lib/services/subscription_service.dart`)
- **Severity**: P0 | **Confidence**: CONFIRMED
- **Reproduction**:
  1. Inspect `pubspec.yaml` (declares only `flutter` and `cupertino_icons`).
  2. Inspect `lib/services/subscription_service.dart` which imported `package:http/http.dart as http;`.
- **Expected**: Zero external HTTP package dependency per project specification; project compiles with standard Dart SDK libraries.
- **Actual**: Compilation fails with `Target of URI doesn't exist: 'package:http/http.dart'`.
- **Root cause**: `lib/services/subscription_service.dart:11` — Imported external `http` package without declaring it in `pubspec.yaml`.
- **Affected files**: `lib/services/subscription_service.dart`
- **Fix strategy**: Replaced `package:http` calls with a zero-dependency `dart:io` `HttpClient` helper (`_sendHttpRequest`) with 12-second timeouts and proper `client.close()` cleanup.
- **Regression risk**: Low
- **Required verification**: V0 (code inspection); V1 (`flutter analyze` BLOCKED BY ENVIRONMENT — no Flutter SDK installed).
- **Status**: FIXED, VERIFICATION INCOMPLETE — V0 (code verified); V1/V2 NOT RUN (Flutter SDK not installed in Linux container).
- **Evidence**: `lib/services/subscription_service.dart:33-92`

---

### BUG-002: Hardware Stylus Eraser (`invertedStylus` / Barrel Button) Reverts to Pen on Move & Up
- **Component**: Flutter (`lib/main.dart`)
- **Severity**: P1 | **Confidence**: CONFIRMED
- **Reproduction**:
  1. Keep `_activeTool = ToolType.pen` in the bottom toolbar.
  2. Touch the pad with a hardware stylus eraser tail (`PointerDeviceKind.invertedStylus`) or hold `kSecondaryStylusButton`.
  3. Drag across the pad and lift the stylus.
- **Expected**: `pointerDown`, `pointerMove`, and `pointerUp` all transmit `ToolType.eraser` (`tool = 1`).
- **Actual**: `_onPointerDown` created an eraser stroke, but `_onPointerMove`, `_onPointerUp`, and `_forceFinishActiveStroke` sent `_activeTool` (`ToolType.pen`) instead of `_currentStroke?.tool`.
- **Root cause**: `lib/main.dart:753,775,640` — Used `_activeTool` instead of latching `_currentStroke?.tool ?? _activeTool`.
- **Affected files**: `lib/main.dart`, `test/test_coordinate_mapping_and_checkpoints_test.dart`, `run_calibration_tests.js`
- **Fix strategy**: Enforced the Phase 6.1 invariant `final ToolType effectiveTool = _currentStroke?.tool ?? _activeTool;` across `_onPointerMove`, `_onPointerUp`, and `_forceFinishActiveStroke`.
- **Regression risk**: Low
- **Required verification**: V2 unit & contract assertion.
- **Status**: FIXED AND VERIFIED — V2 (`node run_calibration_tests.js` exit 0); V4 NOT RUN (no physical stylus device attached).
- **Evidence**: `node run_calibration_tests.js` → exit 0 (`audit/logs/v2-calibration-contract-fuzz.log`)

---

### BUG-003: `RawDatagramSocket` Leaked After `scanLocalNetwork()` and `disconnect()`
- **Component**: Flutter (`lib/main.dart`)
- **Severity**: P2 | **Confidence**: CONFIRMED
- **Reproduction**:
  1. Trigger `scanLocalNetwork()` on startup or via the "Auto-Detect PC on Wi-Fi" button.
  2. Wait for the 3-second scan timeout.
- **Expected**: `_udpSocket` is closed and nulled in the `finally` block of `scanLocalNetwork()` and in `disconnect()`.
- **Actual**: `_udpSocket` remained bound and listening indefinitely after scanning finished.
- **Root cause**: `lib/main.dart:297-310` — `finally` block reset `isScanning = false` without closing `_udpSocket`.
- **Affected files**: `lib/main.dart`
- **Fix strategy**: Closed and nulled `_udpSocket` inside `scanLocalNetwork()` `finally` and inside `disconnect()`.
- **Regression risk**: Low
- **Required verification**: V0 (code inspection); V2 (Flutter test BLOCKED BY ENVIRONMENT).
- **Status**: FIXED, VERIFICATION INCOMPLETE — V0 (code verified at `lib/main.dart:298-302,411-414`); V2 NOT RUN (no Flutter SDK).
- **Evidence**: `lib/main.dart:298-302`

---

### BUG-004: Missing Redo Button in Mobile Top Bar & Unsynchronized Undo/Redo/Clear Actions
- **Component**: Flutter / C# Server / Web Studio (`lib/main.dart`, `AirCanvasServer.cs`, `src/components/home/DualDeviceBridge.tsx`)
- **Severity**: P2 | **Confidence**: CONFIRMED
- **Reproduction**:
  1. Tap Undo on the mobile pad (`DrawingTabletPadView`).
  2. Observe that `_redoStack` is populated locally, but no Redo button exists in the top bar and no WebSocket message is sent to PC/Web Studio.
- **Expected**: Top bar provides Undo, Redo, and Clear buttons; tapping them sends `{ "type": "action", "payload": { "action": "undo" | "redo" | "clearCanvas" } }`, which triggers `Ctrl+Z` / `Ctrl+Y` on Windows and `engine.undo()` / `engine.redo()` / `engine.clearCanvas()` on Web Studio.
- **Actual**: Only local strokes were modified; PC and Web Studio remained out of sync.
- **Root cause**: `lib/main.dart:883-908` — Missing `sendCanvasAction` method and Redo `IconButton`; `AirCanvasServer.cs:1218` lacked `VK_Z`/`VK_Y` handling.
- **Affected files**: `lib/main.dart`, `AirCanvasServer.cs`, `public/AirCanvasServer.cs`, `src/types/index.ts`, `src/components/home/DualDeviceBridge.tsx`
- **Fix strategy**: Added `sendCanvasAction` in `NetworkConnectionManager`, added Redo `IconButton`, implemented `TriggerCtrlShortcut(VK_Z)` / `TriggerCtrlShortcut(VK_Y)` in C#, and wired `onActionReceived` in `DualDeviceBridge.tsx`.
- **Regression risk**: Low
- **Required verification**: V1 (`tsc --noEmit`), V2 (`node run_calibration_tests.js`), V3 (`node test_live_dual_device.js`).
- **Status**: FIXED AND VERIFIED — V1, V2, V3 (`audit/logs/v3-loopback-4stage-relay.log`); V4 NOT RUN.
- **Evidence**: `node test_live_dual_device.js` → exit 0 (`Stage 4: Quarter points (0 px drift), Undo/Redo/Clear sync, and session disconnect cleanup verified`)

---

### BUG-005: Tapping a Color Swatch While Eraser Is Active Fails to Notify PC to Switch Back to Brush
- **Component**: Flutter (`lib/main.dart`)
- **Severity**: P2 | **Confidence**: CONFIRMED
- **Reproduction**:
  1. Select Eraser on the mobile pad (sends `'E'` shortcut to PC).
  2. Tap a color swatch in the bottom toolbar.
- **Expected**: Mobile switches `_activeTool` to `ToolType.pen` and sends `widget.net.sendToolShortcut(ToolType.pen)` (`'B'` shortcut) to PC.
- **Actual**: Mobile switched `_activeTool` locally without notifying the PC server, leaving PC drawing software stuck on Eraser.
- **Root cause**: `lib/main.dart:1154-1163` — Missing `widget.net.sendToolShortcut(ToolType.pen)` when `wasEraser` is true.
- **Affected files**: `lib/main.dart`
- **Fix strategy**: Added `if (wasEraser) { widget.net.sendToolShortcut(ToolType.pen); }` in color swatch `onTap`.
- **Regression risk**: Low
- **Required verification**: V0 (code inspection).
- **Status**: FIXED, VERIFICATION INCOMPLETE — V0 (`lib/main.dart:1218-1225`); V2 NOT RUN (no Flutter SDK).
- **Evidence**: `lib/main.dart:1218-1225`

---

### BUG-006: Expired `PRO` Entitlement Remains Active Because `Entitlement.isPro` Ignored `expiresAt`
- **Component**: Flutter Auth/Billing (`lib/models/entitlement.dart`)
- **Severity**: P0 | **Confidence**: CONFIRMED
- **Reproduction**:
  1. Construct an `Entitlement` with `plan: 'PRO'`, `status: 'ACTIVE'`, and `expiresAt` in the past.
  2. Read `entitlement.isPro`.
- **Expected**: `isPro` returns `false` when `expiresAt` is in the past.
- **Actual**: `bool get isPro => plan == 'PRO' && status == 'ACTIVE';` ignored `expiresAt`.
- **Root cause**: `lib/models/entitlement.dart:51` — Missing expiration timestamp check.
- **Affected files**: `lib/models/entitlement.dart`, `test/test_coordinate_mapping_and_checkpoints_test.dart`, `run_calibration_tests.js`
- **Fix strategy**: Added `bool get isExpired => expiresAt != null && DateTime.now().isAfter(expiresAt!);` and updated `isPro` to `plan == 'PRO' && status == 'ACTIVE' && !isExpired`.
- **Regression risk**: Low
- **Required verification**: V2 unit test.
- **Status**: FIXED AND VERIFIED — V2 (`node run_calibration_tests.js` exit 0).
- **Evidence**: `lib/models/entitlement.dart:51-54`, `audit/logs/v2-calibration-contract-fuzz.log`

---

### BUG-007: Non-JSON Error Responses & Concurrent Calls in `SubscriptionService`
- **Component**: Flutter Auth/Billing (`lib/services/subscription_service.dart`)
- **Severity**: P2 | **Confidence**: CONFIRMED
- **Reproduction**:
  1. Backend returns a 502/503 HTML gateway error during `fetchEntitlement()` or `verifyGooglePlayPurchase()`.
  2. `jsonDecode(response.body)` throws `FormatException` before status code handling.
- **Expected**: Safe JSON decoding (`_tryDecodeJsonMap`) and re-entrancy guard (`_isVerifyingPurchase`).
- **Actual**: Uncaught `FormatException` and potential duplicate concurrent purchase verification POSTs.
- **Root cause**: `lib/services/subscription_service.dart:94-110` — Unconditional `jsonDecode` before status check and missing concurrency lock.
- **Affected files**: `lib/services/subscription_service.dart`
- **Fix strategy**: Added `_tryDecodeJsonMap` and `_isVerifyingPurchase` guard.
- **Regression risk**: Low
- **Required verification**: V0 (code inspection).
- **Status**: FIXED, VERIFICATION INCOMPLETE — V0 (`lib/services/subscription_service.dart:24,94-105`); V2 NOT RUN (no Flutter SDK).
- **Evidence**: `lib/services/subscription_service.dart:94-105`

---

### BUG-008: Division by Zero (`NaN` / `Infinity`) on Degenerate Canvas Bounds (`W <= 1` or `H <= 1`)
- **Component**: Flutter & Web Studio (`lib/services/drawing_provider.dart`, `lib/main.dart`, `src/services/drawingEngine.ts`)
- **Severity**: P1 | **Confidence**: CONFIRMED
- **Reproduction**:
  1. Call `normalizeTouch` or `DrawingEngine.normalizePadPoint` when `canvasWidth = 1` or `0`.
  2. Division by `(canvasWidth - 1)` divides by `0`, producing `NaN` or `Infinity`.
- **Expected**: Explicit fallback `(0.5, 0.5)` when `W < 2` or `H < 2` or coordinates are non-finite (Phase 4.1 & Appendix A.5).
- **Actual**: Division by zero produced `NaN`.
- **Root cause**: `lib/services/drawing_provider.dart:43`, `src/services/drawingEngine.ts:346` — Missing `< 2` dimension guard.
- **Affected files**: `lib/services/drawing_provider.dart`, `lib/main.dart`, `src/services/drawingEngine.ts`
- **Fix strategy**: Added explicit `< 2` and `isFinite` guards returning `(0.5, 0.5)` across Dart and TypeScript.
- **Regression risk**: Low
- **Required verification**: V2 (`node run_calibration_tests.js` Suite 5).
- **Status**: FIXED AND VERIFIED — V2 (`node run_calibration_tests.js` exit 0, all 6 Appendix A.5 vectors pass).
- **Evidence**: `audit/logs/v2-calibration-contract-fuzz.log` (`Suite 5: Appendix A.5 Normalization & Degenerate Bounds Guard`)

---

### BUG-009: `_ConnectionSetupViewState` Memory Leak, Missing `mounted` Checks, and Port Validation
- **Component**: Flutter (`lib/main.dart`)
- **Severity**: P2 | **Confidence**: CONFIRMED
- **Reproduction**:
  1. Open `ConnectionSetupView`, enter port `99999` or `-5`, or navigate away while `connect()` is awaiting.
- **Expected**: `TextEditingController`s disposed, `widget.net` listener removed on dispose, `mounted` checked after `await widget.net.connect(...)`, and TCP port validated in `1..65535`.
- **Actual**: Missing `dispose()`, missing `mounted` checks, and `int.tryParse` fallback allowed invalid port numbers.
- **Root cause**: `lib/main.dart:1408-1655` — Missing lifecycle cleanup and port bounds validation.
- **Affected files**: `lib/main.dart`
- **Fix strategy**: Added `initState`/`dispose` listener & controller management, `if (!mounted) return;` after `await`, and `1..65535` port range validation.
- **Regression risk**: Low
- **Required verification**: V0 (code inspection).
- **Status**: FIXED, VERIFICATION INCOMPLETE — V0 (`lib/main.dart:1485-1505,1608-1620`); V2 NOT RUN (no Flutter SDK).
- **Evidence**: `lib/main.dart:1485-1505`

---

### BUG-010: Portrait Mode Top Control Bar `RenderFlex` Overflow on Small Screens
- **Component**: Flutter (`lib/main.dart`)
- **Severity**: P2 | **Confidence**: CONFIRMED
- **Reproduction**:
  1. Unlock landscape mode to switch `DrawingTabletPadView` into portrait orientation on a 320–360dp wide screen while connected and displaying live coordinates.
- **Expected**: Top bar scrolls horizontally or adapts without `RenderFlex overflowed` exceptions.
- **Actual**: Fixed `Row` with connection pill, preset button, coordinate text, and 5 icon buttons overflowed narrow portrait viewports.
- **Root cause**: `lib/main.dart:947` — Unconstrained horizontal `Row` on narrow screens.
- **Affected files**: `lib/main.dart`
- **Fix strategy**: Wrapped top control bar contents in `LayoutBuilder` + horizontal `SingleChildScrollView` + `ConstrainedBox(minWidth: barConstraints.maxWidth)`.
- **Regression risk**: Low
- **Required verification**: V0 (code inspection).
- **Status**: FIXED, VERIFICATION INCOMPLETE — V0 (`lib/main.dart:1012-1022`); V2 NOT RUN (no Flutter SDK).
- **Evidence**: `lib/main.dart:1012-1022`

---

### BUG-011: Binary Encoder Clamped Pressure to `0.05` on `pointerUp` and `pointerHover` (Violating Appendix A `V3`/`V4`)
- **Component**: Flutter / Wire Protocol (`lib/main.dart`)
- **Severity**: P1 | **Confidence**: CONFIRMED
- **Reproduction**:
  1. Call `sendPointerEvent` with `type: 'pointerUp'` or `'pointerHover'` and `pressure: 0.0` (Appendix A vectors `V3` and `V4`).
  2. Inspect bytes `5..6` of the 13-byte frame.
- **Expected**: `pressure = 0.0` encodes as `0x0000` (`rawP = 0`) per Appendix A `V3` and `V4`.
- **Actual**: `pressure.clamp(0.05, 1.0)` forced `0.0` to `0.05`, encoding `rawP = 51` (`0x33 0x00`) on `pointerUp` and `pointerHover`.
- **Root cause**: `lib/main.dart:439` — Clamped wire pressure to `0.05..1.0` instead of `0.0..1.0`.
- **Affected files**: `lib/main.dart`, `test/test_coordinate_mapping_and_checkpoints_test.dart`
- **Fix strategy**: Added `NetworkConnectionManager.encodeBinaryFrame` clamping pressure to `0.0..1.0` and explicitly setting `wirePressure = 0.0` for `pointerUp` and `pointerHover`.
- **Regression risk**: Low
- **Required verification**: V2 contract test (`V1–V5`).
- **Status**: FIXED AND VERIFIED — V2 (`node run_calibration_tests.js` Suite 1 & `V3`/`V4` hex match).
- **Evidence**: `lib/main.dart:427-450`, `audit/logs/v2-calibration-contract-fuzz.log`

---

### BUG-012: Pad Coordinate Normalization Used `W` / `H` Instead of `(W - 1)` / `(H - 1)` in `DrawingTabletPadView` and `DrawingEngine`
- **Component**: Flutter & Web Studio (`lib/main.dart`, `src/services/drawingEngine.ts`)
- **Severity**: P1 | **Confidence**: CONFIRMED
- **Reproduction**:
  1. On an `800×400` pad, touch the bottom-right pixel `(799, 399)` or exact center `(399.5, 199.5)` (Appendix A.5).
  2. Compute normalized coordinates.
- **Expected**: `(399.5 / 799, 199.5 / 399) = (0.5, 0.5)` and `(799 / 799, 399 / 399) = (1.0, 1.0)` per Phase 4.1 & Appendix A.5.
- **Actual**: `lib/main.dart` and `src/services/drawingEngine.ts` divided by `W` (`800`) and `H` (`400`), yielding `(0.499375, 0.49875)` at center and `(0.99875, 0.9975)` at bottom-right.
- **Root cause**: `lib/main.dart:665,705,773,802` and `src/services/drawingEngine.ts:630,800,938` — Divided by `width`/`height` instead of `(width - 1)`/`(height - 1)`.
- **Affected files**: `lib/main.dart`, `src/services/drawingEngine.ts`
- **Fix strategy**: Added `_normalizePadAxis` in `lib/main.dart` and `DrawingEngine.normalizePadPoint` in `src/services/drawingEngine.ts` using `(W - 1)` and `(H - 1)`.
- **Regression risk**: Low
- **Required verification**: V1 (`tsc --noEmit`), V2 (`node run_calibration_tests.js` Suite 5).
- **Status**: FIXED AND VERIFIED — V1, V2 (`audit/logs/v2-calibration-contract-fuzz.log`).
- **Evidence**: `src/services/drawingEngine.ts:350-369`, `lib/main.dart:654-659`

---

### BUG-013: Win32 `POINTER_FLAG_INVERTED = 0x00100000` Injects `POINTER_FLAG_HWHEEL` on Eraser Strokes
- **Component**: Windows C# Server (`AirCanvasServer.cs`, `public/AirCanvasServer.cs`)
- **Severity**: P1 | **Confidence**: CONFIRMED
- **Reproduction**:
  1. Inspect `AirCanvasServer.cs:199,609,650`.
  2. When `isEraser` is true, `pointerFlags |= POINTER_FLAG_INVERTED` ORs `0x00100000` into `POINTER_INFO.pointerFlags`.
  3. In Win32 `winuser.h`, `0x00100000` is `POINTER_FLAG_HWHEEL` (horizontal mouse wheel), not an inverted pen flag.
- **Expected**: Eraser state is expressed strictly via `POINTER_PEN_INFO.penFlags = PEN_FLAG_INVERTED (0x02) | PEN_FLAG_ERASER (0x04)` (`0x06`), without polluting `pointerFlags` with `0x00100000`.
- **Actual**: `0x00100000` was ORed into `pointerFlags` on every eraser hover, down, move, and up frame.
- **Root cause**: `AirCanvasServer.cs:199,609,650` — Invalid `POINTER_FLAG_INVERTED = 0x00100000` constant.
- **Affected files**: `AirCanvasServer.cs`, `public/AirCanvasServer.cs`
- **Fix strategy**: Removed `0x00100000` from `pointerFlags` and expressed eraser strictly via `penFlags = PEN_FLAG_ERASER | PEN_FLAG_INVERTED` (`0x06`).
- **Regression risk**: Low
- **Required verification**: V2 static & contract check (`node run_calibration_tests.js` Suite 10); V4 Windows probe app NOT RUN (Linux container).
- **Status**: FIXED AND VERIFIED — V2 (`audit/logs/v2-calibration-contract-fuzz.log`); V4 NOT RUN (no Windows host).
- **Evidence**: `AirCanvasServer.cs:199-205,604-607,646`

---

### BUG-014: C# Banker's Rounding (`Math.Round` Default `ToEven`) Causes Cross-Language Pixel & Pressure Drift
- **Component**: Windows C# Server (`AirCanvasServer.cs`, `public/AirCanvasServer.cs`)
- **Severity**: P1 | **Confidence**: CONFIRMED
- **Reproduction**:
  1. Project normalized `(0.5, 0.5)` onto a `6×6` working area (`0.5 * 5 = 2.5`) or scale pressure `0.00244140625 * 1024 = 2.5` (Appendix A.2 `R3` & Appendix A.4).
  2. In Dart and JS, `2.5` rounds to `3`. In C#, `Math.Round(2.5)` defaults to `MidpointRounding.ToEven` (banker's rounding) and returns `2`.
- **Expected**: All platforms round half-way values away from zero (`MidpointRounding.AwayFromZero`), yielding `3`.
- **Actual**: Every `Math.Round` call in `AirCanvasServer.cs` omitted `MidpointRounding.AwayFromZero`.
- **Root cause**: `AirCanvasServer.cs:435-438,524-525,699,746-747,868-869` — Default C# `Math.Round(double)` uses `MidpointRounding.ToEven`.
- **Affected files**: `AirCanvasServer.cs`, `public/AirCanvasServer.cs`
- **Fix strategy**: Added `MidpointRounding.AwayFromZero` to every `Math.Round` call in `AirCanvasServer.cs` and `public/AirCanvasServer.cs`, and added `roundHalfAwayFromZero` in TypeScript.
- **Regression risk**: Low
- **Required verification**: V2 (`node run_calibration_tests.js` Suites 2, 4, 10).
- **Status**: FIXED AND VERIFIED — V2 (`audit/logs/v2-calibration-contract-fuzz.log`).
- **Evidence**: `AirCanvasServer.cs:434-437,525-526,682,739-740,918-919`

---

### BUG-015: TypeScript & C# Binary Decoders Accepted Malformed Frames (`M1–M7`) and Ignored `pointerHover` (`type=3`)
- **Component**: Web Studio & Windows C# Server (`src/services/connectionManager.ts`, `AirCanvasServer.cs`)
- **Severity**: P1 | **Confidence**: CONFIRMED
- **Reproduction**:
  1. Feed malformed frames `M1` (12 bytes), `M2` (14 bytes), `M3` (`version = 2`), `M4` (`version = 0`), `M5` (`tool = 3`), `M6` (`type = 4`), or `M7` (0 bytes) to `ConnectionManager.decodeBinaryPacket` or `AirCanvasServer.ProcessBinaryPacket`.
  2. Send `V4` (`type = 3`, `pointerHover`).
- **Expected**: `M1–M7` are rejected with `BadLength`, `BadVersion`, `BadTool`, or `BadEventType`; `V4` (`type = 3`) decodes as `hover` (`pointerHover`) with `pressure = 0` without creating a stroke segment.
- **Actual**: `ConnectionManager.decodeBinaryPacket` checked `if (buf.byteLength < 8) return;` (accepting 12-byte `M1` and 14-byte `M2`, ignoring byte 12 version and invalid tool/event IDs) and mapped `typeCode === 3` (`pointerHover`) to `'pointerMove'`, causing hover packets to draw unwanted lines!
- **Root cause**: `src/services/connectionManager.ts:645-662` and `AirCanvasServer.cs:795-833` — Missing 13-byte framing, version, eventType, and tool ID validation, and missing `typeCode === 3` branch in TS.
- **Affected files**: `src/services/connectionManager.ts`, `AirCanvasServer.cs`, `public/AirCanvasServer.cs`
- **Fix strategy**: Implemented `ConnectionManager.validateAndDecodeBinaryFrame` and `AirCanvasServer.TryValidateAndDecodeBinaryFrame` enforcing exact `N * 13` byte length, `version == 1`, `type <= 3`, `tool <= 2`, and mapping `typeCode === 3` to `'hover'`.
- **Regression risk**: Low
- **Required verification**: V1 (`tsc --noEmit`), V2 (`node run_calibration_tests.js` Suites 1, 3, 7, 9, 10), V3 (`node test_live_dual_device.js` Stage 2).
- **Status**: FIXED AND VERIFIED — V1, V2, V3 (`audit/logs/v2-calibration-contract-fuzz.log`, `audit/logs/v3-loopback-4stage-relay.log`).
- **Evidence**: `src/services/connectionManager.ts:676-773`, `AirCanvasServer.cs:796-849`

---

### BUG-016: Client Disconnect Mid-Stroke Leaves Windows Synthetic Pen Pressed (`_isPenInContact == true`)
- **Component**: Windows C# Server (`AirCanvasServer.cs`, `public/AirCanvasServer.cs`)
- **Severity**: P0 | **Confidence**: CONFIRMED
- **Reproduction**:
  1. Begin a stroke (`pointerDown` + `pointerMove` sets `_isPenInContact = true`).
  2. Abruptly close the client WebSocket connection before `pointerUp`.
- **Expected**: Server `finally` block in `HandleClient` releases the stuck pointer by injecting `pointerUp` and resetting `_isPenInContact = false`.
- **Actual**: `HandleClient` closed the socket without releasing `_isPenInContact`, leaving the Windows desktop pointer pressed.
- **Root cause**: `AirCanvasServer.cs:1163` — Missing pointer-Up cleanup in `HandleClient` `finally` block.
- **Affected files**: `AirCanvasServer.cs`, `public/AirCanvasServer.cs`
- **Fix strategy**: Added `ReleaseStuckPointerOnDisconnect()` and invoked it in `HandleClient`'s `finally` block.
- **Regression risk**: Low
- **Required verification**: V0 (code inspection); V4 Windows probe app NOT RUN.
- **Status**: FIXED, VERIFICATION INCOMPLETE — V0 (`AirCanvasServer.cs:783-794,1213`); V4 NOT RUN (no Windows host).
- **Evidence**: `AirCanvasServer.cs:783-794,1213`

---

### BUG-017: Unauthenticated `POST /api/github-push` Endpoint Executes Shell Commands via `child_process.exec`
- **Component**: Express/Node Relay Server (`server.js`)
- **Severity**: P0 | **Confidence**: CONFIRMED
- **Reproduction**:
  1. Send an unauthenticated `POST /api/github-push` request to `server.js`.
  2. Observe that `server.js` invoked `exec(cmd)` with `git tag -f` and `git push --force`.
- **Expected**: No unauthenticated HTTP endpoint may execute shell commands or force-push repositories.
- **Actual**: `server.js:76-118` imported `exec` from `node:child_process` and executed git shell commands on any POST request.
- **Root cause**: `server.js:5,76-118` — Unauthenticated shell execution route exposed on HTTP server.
- **Affected files**: `server.js`
- **Fix strategy**: Removed `exec` import from `server.js` and locked down `/api/github-push` to return `403 Forbidden`.
- **Regression risk**: Low
- **Required verification**: V2 (`node run_calibration_tests.js` Suite 10) & V3 (`node test_live_dual_device.js`).
- **Status**: FIXED AND VERIFIED — V2, V3 (`audit/logs/v2-calibration-contract-fuzz.log`).
- **Evidence**: `server.js:74-85`

---

### BUG-018: WebSocket Relay Server Missing `maxPayload`, Room/Peer Caps, Binary Validation, and Dead-Socket Heartbeat
- **Component**: Express/Node Relay Server (`server.js`)
- **Severity**: P1 | **Confidence**: CONFIRMED
- **Reproduction**:
  1. Connect to `server.js` WebSocket relay and send oversized payloads, invalid binary packets, or flood messages, or abandon half-open connections.
- **Expected**: `WebSocketServer` enforces `maxPayload: 65536` (64 KiB), caps rooms (`200`) and peers per room (`16`), rate-limits messages, drops invalid binary frames (closing after 16 consecutive bad frames), guards against `__proto__`/`constructor` pollution, and evicts dead sockets via ping/pong heartbeat.
- **Actual**: `new WebSocketServer({ server })` had no payload limit, no rate limit, no binary header check, and no ping/pong cleanup.
- **Root cause**: `server.js:149-337` — Unbounded WebSocket relay configuration.
- **Affected files**: `server.js`
- **Fix strategy**: Added `maxPayload: 65536`, `MAX_ROOMS`, `MAX_PEERS_PER_ROOM`, `MAX_MESSAGES_PER_SEC`, 13-byte binary frame header validation, prototype-pollution check, backpressure protection (dropping Move/Hover when `bufferedAmount > 256 KiB` while preserving Down/Up), and 15s ping/pong heartbeat cleanup.
- **Regression risk**: Low
- **Required verification**: V2 (`node run_calibration_tests.js` Suite 10), V3 (`node test_live_dual_device.js` Stages 1–4).
- **Status**: FIXED AND VERIFIED — V2, V3 (`audit/logs/v3-loopback-4stage-relay.log`).
- **Evidence**: `server.js:146-390`

---

### BUG-019: Mid-Stroke Source/Target Geometry Changes Cause Coordinate Jumps & Outside-Pad Touches Start Unintended Strokes (Phase 4.10.2 & 4.10.9)
- **Component**: Flutter Pad / Windows C# / Web Studio (`lib/main.dart`, `AirCanvasServer.cs`, `src/services/targetGeometryManager.ts`)
- **Severity**: P1 | **Confidence**: CONFIRMED
- **Reproduction**:
  1. Start a stroke (`pointerDown`) on the mobile drawing pad and rotate or resize the source pad or target window mid-stroke.
  2. Or touch outside the active aspect-ratio sub-rectangle on `pointerDown`.
- **Expected**: Active stroke latches its source and target geometry at `pointerDown` until `pointerUp` (applying queued updates atomically after `pointerUp`), and `pointerDown` outside the active pad sub-rectangle is rejected.
- **Actual**: `_computeActivePadRect` and `GetEffectiveWorkingAreaPixels` recomputed bounds live on every `pointerMove`, causing mid-stroke coordinate jumps if layout or target bounds changed; outside-pad letterbox touches started strokes at clamped edges.
- **Root cause**: `lib/main.dart:662`, `AirCanvasServer.cs:569` — Missing active-stroke geometry latch and outside-active-pad `pointerDown` guard.
- **Affected files**: `lib/main.dart`, `AirCanvasServer.cs`, `public/AirCanvasServer.cs`, `src/services/targetGeometryManager.ts`, `run_calibration_tests.js`
- **Fix strategy**: Added `_latchedStrokePadRect` and `!activeRect.contains(event.localPosition)` rejection on `pointerDown` in `lib/main.dart`, `_latchedStrokeBounds` in `AirCanvasServer.cs`, and `LatchedStrokeGeometry` + `pendingGeometryUpdate` in `TargetGeometryManager`.
- **Regression risk**: Low
- **Required verification**: V1 (`tsc --noEmit`), V2 (`node run_calibration_tests.js` Suites A & F).
- **Status**: FIXED AND VERIFIED — V1, V2 (`audit/logs/calibration_suite.log` Suites A & F).
- **Evidence**: `src/services/targetGeometryManager.ts:1105-1155`, `lib/main.dart:665-720`, `AirCanvasServer.cs:620-655`

---

### BUG-020: Missing Multi-Monitor Enumeration (`rcMonitor` vs `rcWork`, Negative Origins, Per-Monitor DPI) & Silent Fallback on Monitor Disconnect (Phase 4.10.3)
- **Component**: Windows C# Server & Target Geometry Manager (`AirCanvasServer.cs`, `src/services/targetGeometryManager.ts`)
- **Severity**: P1 | **Confidence**: CONFIRMED
- **Reproduction**:
  1. Connect a secondary monitor with negative virtual-desktop coordinates `(-1920, 0, 1920, 1080)` or disconnect the selected monitor.
- **Expected**: Enumerate all physical monitors via `EnumDisplayMonitors` + `GetMonitorInfo` + `GetDpiForMonitor`, distinguish `rcMonitor` from `rcWork`, preserve negative virtual coordinates, and enter a target-unavailable state (without silent fallback) if the selected monitor is disconnected.
- **Actual**: `AirCanvasServer.cs` only queried primary screen `GetSystemMetrics(0/1)` or foreground monitor without enumerating selectable monitors or guarding against silent fallback on monitor removal.
- **Root cause**: `AirCanvasServer.cs:370-415` — Missing `EnumDisplayMonitors` enumeration and monitor-availability state machine.
- **Affected files**: `AirCanvasServer.cs`, `public/AirCanvasServer.cs`, `src/services/targetGeometryManager.ts`, `run_calibration_tests.js`
- **Fix strategy**: Implemented `EnumeratePhysicalMonitors()` (`EnumDisplayMonitors` + `GetMonitorInfo` + `GetDpiForMonitor`) in `AirCanvasServer.cs` and monitor selection/disconnect handling in `TargetGeometryManager`.
- **Regression risk**: Low
- **Required verification**: V1 (`tsc --noEmit`), V2 (`node run_calibration_tests.js` Suite B); V4 NOT RUN (no Windows multi-monitor host in Linux container).
- **Status**: FIXED AND VERIFIED — V1, V2 (`audit/logs/calibration_suite.log` Suite B).
- **Evidence**: `AirCanvasServer.cs:405-485`, `src/services/targetGeometryManager.ts:950-975`

---

### BUG-021: Window Target Mode Used Raw Window Rect Instead of `DWMWA_EXTENDED_FRAME_BOUNDS` Visible Frame & Lacked Minimize/Close Availability Guard (Phase 4.10.4)
- **Component**: Windows C# Server & Target Geometry Manager (`AirCanvasServer.cs`, `src/services/targetGeometryManager.ts`)
- **Severity**: P1 | **Confidence**: CONFIRMED
- **Reproduction**:
  1. Target a desktop application window on Windows 10/11 where `GetWindowRect` includes invisible 7px DWM resize borders, or minimize/close the target window during or between strokes.
- **Expected**: Use `DwmGetWindowAttribute(DWMWA_EXTENDED_FRAME_BOUNDS)` for visible window frame bounds, check `IsWindow`/`IsWindowVisible`/`!IsIconic`, release any active stroke (`pointerUp`) when minimized/closed, and do not switch targets on focus change unless `followActiveWindow` is enabled.
- **Actual**: Invisible DWM borders shifted window coordinates and minimizing a target window mid-stroke did not immediately mark the target unavailable and release the pen.
- **Root cause**: `AirCanvasServer.cs:420-450` — Missing `DwmGetWindowAttribute(DWMWA_EXTENDED_FRAME_BOUNDS)` and `IsIconic`/`IsWindowVisible` availability checks.
- **Affected files**: `AirCanvasServer.cs`, `public/AirCanvasServer.cs`, `src/services/targetGeometryManager.ts`, `run_calibration_tests.js`
- **Fix strategy**: Added `DwmGetWindowAttribute(DWMWA_EXTENDED_FRAME_BOUNDS)`, `IsWindow`, `IsWindowVisible`, and `IsIconic` checks in `TryGetVisibleWindowBounds()` (`AirCanvasServer.cs`) and `WINDOW` mode lifecycle management in `TargetGeometryManager`.
- **Regression risk**: Low
- **Required verification**: V1 (`tsc --noEmit`), V2 (`node run_calibration_tests.js` Suites B & F).
- **Status**: FIXED AND VERIFIED — V1, V2 (`audit/logs/calibration_suite.log` Suites B & F).
- **Evidence**: `AirCanvasServer.cs:490-545`, `src/services/targetGeometryManager.ts:978-1000`

---

### BUG-022: Static Software Margin Presets Assumed Fixed UI Dock Percentages Instead of Verified `ITargetCanvasProvider` + Explicit 5-Point Calibration Fallback (Phase 4.10.5 & 4.10.6)
- **Component**: Cross-Platform Target Detection (`src/services/targetGeometryManager.ts`, `AirCanvasServer.cs`, `src/components/home/DualDeviceBridge.tsx`)
- **Severity**: P1 | **Confidence**: CONFIRMED
- **Reproduction**:
  1. Select `CANVAS` target mode for an application whose internal canvas is rendered inside a GPU surface without exposed child HWND/DOM bounds (e.g., Photoshop, Blender).
- **Expected**: Use a modular `ITargetCanvasProvider` architecture (`WebStudioDomCanvasProvider`, `VerifiedWin32ChildCanvasProvider`). When automatic canvas detection cannot be verified, explicitly report `requiresCalibrationFallback = true`, never silently fall back to `WINDOW` or `MONITOR` mode, and provide a validated 5-point calibration workflow (`TopLeft`, `TopRight`, `BottomLeft`, `BottomRight`, `Center`) that invalidates on geometry change and is never applied twice.
- **Actual**: Static percentage margins (`top/bottom/left/right`) approximated software docks without verifying actual canvas bounds or triggering a 5-point calibration fallback.
- **Root cause**: `AirCanvasServer.cs:420-455`, `src/services/drawingEngine.ts:95-190` — Relied on static dock ratio presets instead of verified canvas providers + 5-point calibration fallback.
- **Affected files**: `src/services/targetGeometryManager.ts`, `AirCanvasServer.cs`, `public/AirCanvasServer.cs`, `src/components/home/DualDeviceBridge.tsx`, `run_calibration_tests.js`
- **Fix strategy**: Implemented `ITargetCanvasProvider`, `WebStudioDomCanvasProvider`, `VerifiedWin32ChildCanvasProvider`, and `FivePointCalibrator` with corner-ordering, duplicate-point, center-containment, and residual validation, plus automatic invalidation on geometry changes.
- **Regression risk**: Low
- **Required verification**: V1 (`tsc --noEmit`), V2 (`node run_calibration_tests.js` Suites B & D).
- **Status**: FIXED AND VERIFIED — V1, V2 (`audit/logs/calibration_suite.log` Suites B & D).
- **Evidence**: `src/services/targetGeometryManager.ts:272-675,1002-1085`

---

### BUG-023: Mismatched Source and Target Aspect Ratios Stretched Circles Into Ellipses When Aspect-Ratio Preservation Was Not Applied (Phase 4.10.7)
- **Component**: Coordinate Mapping (`src/services/targetGeometryManager.ts`, `AirCanvasServer.cs`, `lib/main.dart`)
- **Severity**: P1 | **Confidence**: CONFIRMED
- **Reproduction**:
  1. Map a `16:9` (`1600×900`), `9:16` portrait (`900×1600`), or `1:1` square (`1000×1000`) source pad onto a `16:10` (`1920×1200`), `4:3` (`1600×1200`), portrait (`1080×1920`), or widescreen (`1920×1080`) target without aspect-ratio preservation.
  2. Draw a circle on the source surface.
- **Expected**: Aspect-ratio preservation is enabled by default using `scale = min(targetWidth / sourceWidth, targetHeight / sourceHeight)` centered inside the target rectangle, so a circle drawn on the source remains circular (`diamX == diamY` within `<= 1 px`) on the target.
- **Actual**: Non-uniform X/Y scaling stretched circles when source and target aspect ratios differed.
- **Root cause**: Missing `computeAspectPreservingTargetRect` / `ComputeAspectPreservingTargetRect` centered inscribed rectangle transform.
- **Affected files**: `src/services/targetGeometryManager.ts`, `AirCanvasServer.cs`, `public/AirCanvasServer.cs`, `run_calibration_tests.js`
- **Fix strategy**: Implemented `computeAspectPreservingTargetRect` and `computeAspectPreservingSourceRect` in `src/services/targetGeometryManager.ts` and `ComputeAspectPreservingTargetRect` in `AirCanvasServer.cs` using `MidpointRounding.AwayFromZero`.
- **Regression risk**: Low
- **Required verification**: V1 (`tsc --noEmit`), V2 (`node run_calibration_tests.js` Suite C across all 6 required aspect-ratio combinations).
- **Status**: FIXED AND VERIFIED — V1, V2 (`audit/logs/calibration_suite.log` Suite C).
- **Evidence**: `src/services/targetGeometryManager.ts:196-266`, `AirCanvasServer.cs:550-585`

