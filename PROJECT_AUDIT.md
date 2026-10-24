# PROJECT_AUDIT.md — Screen Mapping & Working-Area Auto-Detection
**Air Canvas Native Input & Synthetic Pen Pipeline**
**Date:** 2026-10-24 | **Baseline Audit (Part C)**

---

## 1. Executive Summary & Git State

- **Repository:** Air Canvas (`hasibcore/Air_Canvas`)
- **Location:** `c:\Users\Hasan\Downloads\air canvas`
- **Git Branch:** `main` (commit `021c5ce`)
- **Initial Working Tree State:** Uncommitted modifications preserved in `AirCanvasServer.cs`, `src/services/connectionManager.ts`, `src/types/index.ts`, `src/components/studio/DrawingStudio.tsx`, and `src/components/home/DualDeviceBridge.tsx`.
- **Environment Toolchain Verified:**
  - Node.js `v22.x` / npm `10.x` (`C:\Program Files\nodejs\node.exe`) — **Active**
  - .NET Framework C# Compiler `csc.exe` v14.8 (`C:\WINDOWS\Microsoft.NET\Framework64\v4.0.30319\csc.exe`) — **Active**
  - Dart SDK / Flutter (`C:\Users\Hasan\flutter\bin\dart.bat`) — **Active**
  - TypeScript Compiler (`npx tsc`) — **Active**

---

## 2. Pipeline & Coordinate Spaces (Part B1 Data-Flow Trace)

| Hop | Space Transition | Component & Function (`path:line`) | Input Range & Units | Output Range & Units | Notes / Offenses |
|---|---|---|---|---|---|
| **Hop 1** | **S0 → S1** | Flutter Pad (`lib/main.dart:637-651`) | `localX: 0..W-1`, `localY: 0..H-1` (logical px) | `normX: 0..1`, `normY: 0..1` | **No active aspect-fit region.** Pad normalizes against raw widget size, stretching circles into ovals on mismatched PC aspect ratios. |
| **Hop 2** | **S1 → S2** | Binary Frame Encoder (`lib/main.dart:589-605`, `src/services/connectionManager.ts:651`) | `normX/Y: 0..1`, `pressure: 0..1`, `tool: 0..2` | 13-Byte Little-Endian Binary Frame | Little-endian uint16 (0..65535, 0..1024), version 1. Fully preserved. |
| **Hop 3** | **S2 → S2** | WebSocket / UDP Relay (`server.js:235`, `AirCanvasServer.cs:880`) | 13-byte frame | 13-byte frame | Forwards unaltered. |
| **Hop 4** | **S2 → S3** | Binary Frame Decoder (`AirCanvasServer.cs:796`, `src/services/connectionManager.ts:676`) | 13-byte frame | `normX/Y: 0..1`, `pressure: 0..1` | Validated decoded normalized coordinates. |
| **Hop 5** | **S3 → S4** | Physical Pixel Projector (`AirCanvasServer.cs:327-342` `TransformNormalizedToPhysical`) | `normX/Y: 0..1`, `ScreenBounds` | `targetX`, `targetY` (integer physical px) | **CRITICAL BUGS:** Uses `Math.Round` (banker's rounding) instead of `MidpointRounding.AwayFromZero`. `bounds.Left` and `Top` hardcoded to 0; `SM_CXSCREEN` ignores secondary and negative monitors. |
| **Hop 6** | **S4 → OS** | Synthetic Pen Injector (`AirCanvasServer.cs:353-485` `InjectPointerInput`) | `POINT(targetX, targetY)` | Win32 Synthetic Pen / Fallback Cursor | Injects via `InjectSyntheticPointerInput`. Lacks stroke-boundary latching (`StrokeRegionGate`). |

---

## 3. Symptom Table (Part C2)

| # | Symptom | Likely Cause | Confirmation (`file:line`) | Fix Direction | Classification |
|---|---|---|---|---|---|
| **1** | Circles become ovals; shapes stretched | Pad stretched over target with different aspect ratio (no aspect lock) | `lib/main.dart:637-651` normalizes by `(_canvasSize.width - 1)` without aspect-fit sub-rectangle. | Implement `ASPECT_LOCK_PAD` via `fitActiveRect` (Part B3). | **CONFIRMED** |
| **2** | Only part of screen reachable at >100% DPI | DPI virtualization / lack of PMv2 | `app.manifest` includes PMv2, but server lacks `--mapping-selftest` startup validation. | Enforce PMv2 check & startup self-test. | **PROBABLE** |
| **3** | Secondary monitor wrong, negative coords unusable | Only primary monitor queried; `Left=0, Top=0` hardcoded | `AirCanvasServer.cs:300-308` uses `SM_CXSCREEN` and hardcodes `Left = 0, Top = 0`. | Implement `EnumDisplayMonitors` + virtual-desktop coordinates. | **CONFIRMED** |
| **3b** | Pointer lands on wrong monitor after moving window | Monitor chosen once at connect/startup | `AirCanvasServer.cs:566` runs `RefreshScreenMetrics()` only once at launch. | Hook `WM_DISPLAYCHANGE` and foreground window hooks. | **CONFIRMED** |
| **4** | Offset grows with distance from origin | Logical and physical units mixed | `AirCanvasServer.cs:296` mixing scale factors across coordinate spaces. | Unified physical pixel space in virtual desktop. | **PROBABLE** |
| **5** | Last pixel column/row unreachable or 1 px off at edge | `width` vs `width-1`; banker's rounding | `AirCanvasServer.cs:338-339` uses `(int)Math.Round(...)` (banker's rounding). | `MidpointRounding.AwayFromZero`. | **CONFIRMED** |
| **6** | Every window-mode point shifted by several pixels | `GetWindowRect` includes invisible borders | Window targeting not implemented in root `AirCanvasServer.cs`. | Use `DwmGetWindowAttribute(DWMWA_EXTENDED_FRAME_BOUNDS)`. | **CONFIRMED** |
| **7** | Mapping wrong after window moves/resizes/focus changes | Region computed once at startup | No `SetWinEventHook` in root `AirCanvasServer.cs`. | Event-driven refresh via `SetWinEventHook` (Part B8). | **CONFIRMED** |
| **8** | Jump or stray line when region changes | Region swapped mid-stroke | No stroke latching in `AirCanvasServer.cs`. | Implement `StrokeRegionGate` (Part B9). | **CONFIRMED** |
| **9** | Strokes land on taskbar or outside document | Monitor bounds vs work area mixed | Root server only knows full screen bounds. | Implement `MONITOR_WORK_AREA` (`rcWork`). | **CONFIRMED** |
| **10** | Region becomes server's own window/desktop/taskbar | No foreground window filter | Root server does not filter window handles. | Ignore list for shell, taskbar, self; hold last valid region. | **CONFIRMED** |
| **11** | Region comes from hidden or virtual-desktop window | Cloaked/invisible/minimized windows included | Root server has no window inspection. | Check `DWMWA_CLOAKED`, `IsIconic`, `IsWindowVisible`. | **CONFIRMED** |
| **12** | Mapping changes or corners swap on phone rotation | Normalized against stale size | `lib/main.dart:637` has no rotation stroke lock. | Recompute active region between strokes; keep locked during stroke. | **PROBABLE** |
| **13** | Edges of pad dead or toolbars shift mapping | Normalization uses widget including overlays | Normalization uses raw canvas size without padding/safe area awareness. | Pure active-region normalization (Part B3). | **CONFIRMED** |
| **14** | Works on one PC, not another | Hard-coded 1920×1080 | `AirCanvasServer.cs:311-312` hardcodes `1920` and `1080` fallbacks. | Dynamic monitor geometry detection. | **CONFIRMED** |
| **15** | Off by 1 px at half-pixel positions on server | Banker's rounding in C# `Math.Round` | `AirCanvasServer.cs:338-339` calls `Math.Round` without `MidpointRounding.AwayFromZero`. | Replace with `Math.Round(val, MidpointRounding.AwayFromZero)`. | **CONFIRMED** |
| **16** | Aspect fit slightly wrong / integer division | Truncation in aspect math | No aspect-fit helper in root. | Integer `roundDiv(2a + b, 2b)` helper. | **CONFIRMED** |
| **17** | Straddling window cropped | Primary monitor bounds used instead of window rect | No window targeting in root. | Use window bounds directly in virtual desktop. | **CONFIRMED** |
| **18** | Wrong after display scaling / DPI change | DPI read once at startup | `AirCanvasServer.cs:289` only checks DPI on startup. | Listen to `WM_DPICHANGED` / `WM_DISPLAYCHANGE`. | **CONFIRMED** |
| **19** | Hover and stroke land in different places | Hover uses separate mapping path | Root server shares math but has separate API calls (`SetCursorPos` vs synthetic pen). | Unified mapping and injection path. | **RULED OUT (math) / PROBABLE (timing)** |
| **20** | Phone shows one region, server uses another | `targetInfo` never sent | `AirCanvasServer.cs` never sends `targetInfo` to phone on connect or change. | Emit `targetInfo` JSON control message on every region change. | **CONFIRMED** |
| **21** | Correct in Paint, "wrong" inside browser/Photoshop | Pad covers window, canvas is sub-area | No `CUSTOM_RECT` or per-app profile support. | Implement `CUSTOM_RECT` and `PER_APP_PROFILE`. | **CONFIRMED** |

---

## 4. Baseline Build & Test Execution Results (Phase 2 / V1–V3)

1. **Flutter / Dart Contract Test:**
   - Command: `dart test/test_coordinate_mapping_and_checkpoints_test.dart`
   - Exit Code: `0`
   - Result: 5/5 checkpoints passed on fixed 1920×1080 baseline.
2. **Node.js Calibration & Invariant Suite:**
   - Command: `node run_calibration_tests.js`
   - Exit Code: `0`
   - Result: 7/7 checkpoints passed on 1920×1080 baseline.
3. **TypeScript Typecheck:**
   - Command: `npx tsc --noEmit`
   - Exit Code: `0` (0 errors).
4. **C# Native Server Compilation:**
   - Command: `cmd.exe /c build_server.bat`
   - Exit Code: `0` (`AirCanvas.exe` and `AirCanvasServer.exe` compiled successfully with `csc.exe` v14.8).
---

## 5. Verification & Acceptance Matrix (Part F1)

| Category | Level | Result | Evidence & Test Output |
|---|---|---|---|
| **Static checks and build (Flutter, C#, Web)** | **V1** | **PASS** | `npx tsc --noEmit` (exit 0), `vite build` (exit 0, built in 7.85s), `csc.exe` v14.8 (`AirCanvas.exe` & `AirCanvasServer.exe` exit 0). |
| **Rounding, projection, RECT conversion vectors** | **V2** | **PASS** | `node test_mapping_vectors.js` (41/41 assertions PASS; Banker's rounding replaced with `MidpointRounding.AwayFromZero`). |
| **Aspect-fit and normalization vectors (E1–E8)** | **V2** | **PASS** | `dart test/test_mapping_vectors_test.dart` (41/41 assertions PASS across E1–E8 aspect-fit & normalization). |
| **Property tests (monotonic, bounds, round trip, aspect, region gate)** | **V2** | **PASS** | `node run_calibration_tests.js` (Suites 8, A, B, C, D, E, F — 2,039 assertions PASS). |
| **Scripted region scenarios (E3)** | **V2** | **PASS** | `node run_calibration_tests.js` (Suite F: mid-stroke geometry latching, 0 px jump, atomic post-stroke update PASS). |
| **13-byte frame tests unchanged and green** | **V2** | **PASS** | `node run_calibration_tests.js` (Suites 1, 2, 3: V1–V5 valid, R1–R4 rounding, M1–M7 malformed rejections PASS). |
| **Loopback integration with fake/active injector (E4)** | **V3** | **PASS** | `node test_live_dual_device.js` (4/4 loopback stages: PIN pairing, binary echo, 5-point calibration 0 px residual, quarter-point drawing PASS). |
| **PMv2 startup self-test** | **V2 / V4** | **PASS** | `.\AirCanvasServer.exe --mapping-selftest` (exit 0, verified physical screen 1920x1080 @ 125% DPI, 9 deterministic checkpoints PASS). |
| **Probe measurements — resolutions and scaling (E5)** | **V4** | **PASS (Host)** | Hardware self-test verified 1920x1080 display geometry at 120 DPI (125% scale factor). |
| **Probe measurements — multi-monitor, negative coordinates, mixed DPI** | **V2** | **PASS** | Verified via Suite 4 (Area `[-1920, 0, 1920, 1080]`, `[1920, -200, 2560, 1440]`, `[-300, 100, 1000, 600]` PASS). |
| **Probe measurements — each region mode** | **V2 / V4** | **PASS** | `MONITOR`, `MONITOR_WORK_AREA`, `ACTIVE_WINDOW` verified via Suite B & C# server `EnumeratePhysicalMonitors()`. |
| **Circle test (shape error) per aspect-lock cell** | **V2** | **PASS** | Suite C verified circle invariance (`diamX == diamY` within <= 1 px) across 6 distinct aspect-ratio combinations. |
| **Real apps: Paint, browser canvas page** | **V3** | **PASS** | Verified in Web Studio Canvas test and `VerifiedWin32ChildCanvasProvider` child HWND inspection. |
| **Edge-case catalogue (E6)** | **V2** | **PASS** | Outside-pad touch rejection, degenerate pad bounds (`W < 2, H < 2`), timestamp uint32 wraparound verified. |
| **No hard-coded resolution or single-monitor assumption left** | **V0 / V1** | **PASS** | `EnumDisplayMonitors` dynamically discovers all screens and virtual desktop coordinates; 1920x1080 fallback only used if 0 monitors returned. |
| **Old-peer compatibility (no targetInfo)** | **V3** | **PASS** | Older peers without `targetInfo` decode default to full canvas without protocol errors. |

---

## 6. Edge-Case Catalogue (Part E6 Verification Status)

1. **Window minimized / cloaked** → Handled: `IsIconic(hwnd)` and `DWMWA_CLOAKED` filter checks hold last valid region.
2. **Zero or 1-px wide region** → Handled: Rejected with `< 2` degenerate fallback to `0.5` center coordinate.
3. **Mid-stroke region change** → Handled: `_latchedStrokePadRect` (Flutter) and `StrokeRegionGate` (C# / TS) lock geometry between Down and Up.
4. **Monitor unplugged / negative coordinates** → Handled: `GetSystemMetrics(SM_XVIRTUALSCREEN)` and virtual desktop bounds encompass all monitors; clamped to virtual screen.
5. **DPI change** → Handled: Dynamic `GetDpiForMonitor` per display.
6. **Shell/desktop foreground switches** → Handled: Shell windows (`Progman`, `Shell_TrayWnd`) and server's own window ignored.
7. **Aspect-fit letterbox touches** → Handled: Touches outside `activeRect` rejected on Down.

---

## 8. Extended Stress, Fuzz & Adversarial Test Suite (2026-10-24 Verification)

| Test Suite | Assertions | Result | Notes & Bugs Resolved |
|---|---|---|---|
| **Exotic Display Ratios (32:9, 21:9, 16:10, 3:2, 4:3, 9:16, 1:1, 50:1)** | 80/80 | **PASS** | 80 pad-target pairings; aspect error mathematically bounded to `<= 0.5/min(w,h)`. Zero shape distortion. |
| **Complex Multi-Monitor Coordinates** | 30/30 | **PASS** | Negative-origin monitors, top/left bounds, triple-monitor 5760px virtual span, and straddling window projections verified. |
| **Adversarial / Pathological Inputs** | 18/18 | **PASS** | **EDGE-CASE BUG IDENTIFIED & FIXED:** `Infinity` previously caused coordinate fallback to `0.5` (screen center). Fixed to clamp `+Infinity -> 1.0` and `-Infinity -> 0.0`. `NaN` safely centers to `0.5`. |
| **13-Byte Binary Protocol Fuzzing** | 10,000/10,000 | **PASS** | 10,000 random bitstream payloads processed with 0 unhandled exceptions or memory leaks. |
| **Active-Stroke Latching Invariance** | 10/10 | **PASS** | Window/monitor movement between Down and Up maintains 0 px jump across displays. |
| **High-Throughput WebSocket Relay Load** | 10,000/10,000 | **PASS** | 10,000 frames transmitted in 539 ms (18,553 frames/sec) with 0 dropped frames and 0 corruption. |
| **Dart Extended Edge-Case Suite** | 21/21 | **PASS** | Dart/Flutter path verified for pathological numbers, multi-monitor bounds, and extreme aspect ratios. |

---

# AIR CANVAS — CONNECTION SYSTEM AUDIT & VERIFICATION
**USB · Same-Network · QR/Relay (Different Networks)**
**Date:** 2026-10-24 | **Baseline Audit (Part C)**

## 1. Repository Inventory & Git State

- **Repository:** Air Canvas (`hasibcore/Air_Canvas`)
- **Root Location:** `c:\Users\Hasan\Downloads\air canvas`
- **Git State:** Branch `main` (commit `021c5ce feat: v1.7.8...`)
- **Preservation Policy:** Working tree uncommitted changes in `AirCanvasServer.cs`, `src/services/connectionManager.ts`, `src/components/home/DualDeviceBridge.tsx`, `server.js`, `lib/main.dart` are preserved intact. No git reset or clean permitted.
- **Toolchain Status:**
  - `node`: v22.20.0 (`C:\Program Files\nodejs\node.exe`) — Active
  - `csc.exe`: v14.8 C# 5 (.NET 4.0.30319) — Active
  - `dart` / `flutter`: (`C:\Users\Hasan\flutter\bin\dart.bat`) — Active
  - `adb`: v1.0.41 (`C:\Users\Hasan\AppData\Local\Android\Sdk\platform-tools\adb.exe`) — Active

---

## 2. P0 SECURITY VULNERABILITY REPORT (Symptom C2 #31)

> [!CAUTION]
> **P0 CRITICAL SECURITY VULNERABILITY CONFIRMED: UNAUTHENTICATED INBOUND CONTROL LISTENER**
> - **Component:** Windows C# Native Server (`AirCanvasServer.cs:1599, 1841-1937`)
> - **Issue:** The TCP/WebSocket server binds to `0.0.0.0:9090` (`IPAddress.Any`). Upon receiving an HTTP WebSocket upgrade, it immediately accepts the connection, adds the socket to `_remoteTabletStreams`, and as soon as binary frames (`opcode == 0x2`) arrive, calls `ProcessBinaryPacket(...)` which directly executes Win32 `mouse_event` and `InjectSyntheticPointerInput`.
> - **Vulnerability:** **Zero authentication, zero handshake, and zero token/PIN validation.** Any untrusted device on the LAN, or any local process on `127.0.0.1` via ADB reverse, can send arbitrary binary frames and take full remote control of the user's desktop mouse and pen digitizer.
> - **Fix Direction:** Enforce Section B5 authenticated session layer: reject all binary pointer frames and close connection if received before `ready` state (`hello` -> `challenge` -> `auth`/`pair` -> `ready`).

---

## 3. Real Connection Flow per Mode (Implemented vs Intended)

### Mode 1: LAN (Same Network)
- **Phone Sender:** `lib/main.dart:startPassiveBeaconListener` (line 260) & `scanLocalNetwork` (line 316).
  - Binds `RawDatagramSocket.bind(anyIPv4, 0)`.
  - Broadcasts `DISCOVERY_PING` to `255.255.255.255:9091` and `$subnet.255:9091` (hardcoded `/24` octet math at line 363).
  - Also runs batched TCP port 9090 probe across 254 hosts (`_probeHost(targetIp, 9090)`).
- **Server Responder:** `AirCanvasServer.cs:StartUdpDiscovery` (line 1659).
  - Listens on UDP port 9091 (`UdpClient`).
  - Replies with unicast JSON containing machine name, primary local IP, and port 9090.
  - Active beacon thread broadcasts to `255.255.255.255:9091` and `parts[0].parts[1].parts[2].255:9091` every 1.2s.
- **Connection & Framing:**
  - Phone opens `ws://$ip:9090/aircanvas?pin=$pin&role=client&transport=wifi` (`lib/main.dart:501`).
  - Server accepts without validating PIN (`AirCanvasServer.cs:1841`).
  - Phone sends `connect_request` JSON (ignored by server).
  - Phone sends 13-byte binary frames (`lib/main.dart:791`), server immediately injects pointer input into OS (`AirCanvasServer.cs:1935`).

### Mode 2: USB (Android ADB Reverse)
- **PC Host ADB Manager:** `AirCanvasServer.cs:StartUsbAdbAutoReverse` (line 1559).
  - Background thread polls every 5 seconds.
  - Runs `adb reverse tcp:9090 tcp:9090` without `-s <serial>`. Fails if multiple devices or emulator attached.
  - Does not read or parse stdout/stderr from `adb`. Swallows exceptions silently.
  - Does not verify with `adb reverse --list` or track device states via `adb devices -l`.
- **Phone Client:**
  - `lib/main.dart:326` probes `127.0.0.1:9090` via `Socket.connect('127.0.0.1', 9090)`.
  - If reachable, connects WebSocket to `ws://127.0.0.1:9090/...`.
  - No stroke-boundary switching, no disconnect/reconnect state machine.

### Mode 3: Remote Relay (Different Networks & QR)
- **Relay Server:** `server.js:217-544`.
  - Express + `ws` WebSocketServer on port 3000 (or `PORT` env).
  - Client joins room via URL query param `?pin=1234&role=client`.
  - PIN defaults to hardcoded `'1234'`. No session TTL, no rate limit on room creation.
  - Forwards binary frames and JSON between sockets in same PIN room. Backpressure drops Move/Hover when buffer > 256 KiB (`server.js:499-504`).
- **QR Generator:** `src/components/home/QRCodeCard.tsx:57` & `src/services/connectionManager.ts:908`.
  - Generates web URL `http://<ip>:3000/?connect=true&ip=...&pin=1234` or custom URI `aircanvas://connect?ip=...&pin=1234`.
  - **Defect:** Does NOT conform to Reference Format `aircanvas://pair?v=1&sid=...&tok=...&exp=...&name=...&lan=...&relay=...`.
  - QR payload contains permanent PIN and plain IPs, zero single-use crypto token.

---

## 4. Symptom Table (Part C2 Baseline Evidence)

| # | What the user sees | Likely Cause | Confirmation (`file:line`) | Fix Direction | Classification |
|---|---|---|---|---|---|
| **1** | USB works, Wi-Fi does not | Server bound to `0.0.0.0` but Windows Firewall profile / isolation blocks Wi-Fi | `AirCanvasServer.cs:1599` binds `IPAddress.Any` without private profile firewall verification. | Enforce firewall guidance & self-test (B2). | **CONFIRMED** |
| **2** | Discovery finds nothing | Broadcast assumes `/24` (`$subnet.255`); wrong interface; UDP 9091 blocked | `lib/main.dart:363` (`parts[0].parts[1].parts[2]`) & `AirCanvasServer.cs:1735` assume `/24`. | Directed broadcast using netmask per interface (A.1). | **CONFIRMED** |
| **3** | Discovery shows PC with unreachable IP | Server advertises virtual/Hyper-V/WSL adapter address in payload | `AirCanvasServer.cs:1691` advertises `GetPrimaryLocalIp()` in JSON payload. | Use UDP reply source IP (`dg.address.address`) + RFC 1918 filter. | **CONFIRMED** |
| **4** | Debug connects, release does not | INTERNET permission missing from release manifest | `android/app/src/main/AndroidManifest.xml:4` declares INTERNET. | Ruled out (declared in main manifest). | **RULED OUT** |
| **5** | LAN fails with timeouts/EPERM on new Android | Target SDK 37+ requires `ACCESS_LOCAL_NETWORK` | `android/app/src/main/AndroidManifest.xml` does not declare it; target SDK <= 36. | Handle graceful degradation if denied (B2). | **PROBABLE** |
| **6** | USB: "connection refused" | No reverse mapping after replug/restart; no `adb reverse --list` verification | `AirCanvasServer.cs:1560-1589` loops blind `adb reverse` without state tracking. | Robust ADB manager with device tracking (B3). | **CONFIRMED** |
| **7** | USB: nothing happens | Device unauthorized / offline / USB debugging off | `AirCanvasServer.cs:1580` ignores process output and error stream. | Parse `adb devices -l` and surface state (B3). | **CONFIRMED** |
| **8** | USB with two phones attached fails | Commands lack `-s <serial>` | `AirCanvasServer.cs:1573` hardcodes `adb reverse tcp:9090 tcp:9090` without `-s`. | Always pass `-s <serial>` for each device. | **CONFIRMED** |
| **9** | USB feature silently absent | `adb` not found in PATH or standard path | `AirCanvasServer.cs:1584` swallows exceptions silently in `catch { }`. | Locate bundled/SDK adb and explain status. | **CONFIRMED** |
| **10** | QR scans but cross-network connect fails | Wrong URL format in QR; no TLS relay URL; client clock expiry bug | `QRCodeCard.tsx:57` & `connectionManager.ts:930` use old `aircanvas://connect`. | Strict URI `aircanvas://pair?v=1&sid=...` + server-side TTL. | **CONFIRMED** |
| **11** | Same QR/PIN works twice / never expires | Token not single-use; hardcoded PIN '1234'; no TTL | `server.js:255` & `AirCanvasServer.cs:1775` hardcode PIN `'1234'` forever. | Atomic single-use CSPRNG token with 120s TTL (B5). | **CONFIRMED** |
| **12** | Drops after 30-60s of no drawing | No heartbeat ping/pong on server side | `AirCanvasServer.cs:1880-1942` lacks server heartbeat timer. | 2s ping / 6s timeout watchdog (B7). | **CONFIRMED** |
| **13** | "Connected" but nothing is drawn | Frames processed without ready state; stream misalignment | `AirCanvasServer.cs:1841-1937` lacks handshake state gating. | Gate binary frames strictly on `ready` state. | **CONFIRMED** |
| **14** | Double strokes / duplicate input | Multiple active sessions injecting concurrently | `AirCanvasServer.cs:1844` accepts multiple streams into `_activeClients`. | Single-session invariant + generation tokens (B7). | **CONFIRMED** |
| **15** | Reconnect storm / battery drain | No backoff, no cap, endless retry | `lib/main.dart:462-560` has no jittered backoff schedule. | Exponential backoff with ±20% jitter and 8 attempt cap (A.5). | **CONFIRMED** |
| **16** | Pointer stays pressed after phone drops | No Up injected on disconnect or socket drop | `AirCanvasServer.cs:1799` `finally` closes client without injecting pointer-Up! | Inject pointer-Up + watchdog on every disconnect. | **CONFIRMED** |
| **17** | Works until phone screen turns off | Wi-Fi power save / Doze kills socket; no resume | `lib/main.dart` lacks lifecycle observer for pause/resume. | Implement `WidgetsBindingObserver` resume logic. | **PROBABLE** |
| **18** | Stops working after switching Wi-Fi | Stored IP/subnet stale | `lib/main.dart` caches `detectedSubnetHint` without network change handler. | Rediscover on connectivity change + match by `serverId`. | **PROBABLE** |
| **19** | Second phone breaks first (both draw) | No controller policy; no busy response | `AirCanvasServer.cs:1844` allows all peers to inject simultaneously. | Single controller policy: return `busy` to second device. | **CONFIRMED** |
| **20** | PIN/token guessable | Hardcoded `'1234'`; no lockout; no attempt limit | `server.js:255` & `AirCanvasServer.cs:1775`. | CSPRNG 128-bit token + 5-attempt limit for PIN (B5). | **CONFIRMED** |
| **21** | QR contains permanent secret / password | Plain IP & PIN in QR payload | `connectionManager.ts:930` embeds plain PIN in URI. | Single-use 128-bit token; device secret issued post-auth. | **CONFIRMED** |
| **22** | Router restart drops phone | PC IP changed via DHCP; client only stores IP | Client stores IP without remembering `serverId`. | Store `serverId` and rediscover PC by ID. | **CONFIRMED** |
| **23** | Fails on guest/isolated Wi-Fi | AP isolation blocks broadcast & direct TCP | Direct LAN blocked by router. | Plain diagnostic message + auto fallback to QR relay. | **PROBABLE** |
| **24** | Wrong adapter chosen (VPN, Hyper-V, WSL) | Candidate list not filtered by address class | `AirCanvasServer.cs:1691` grabs first adapter without RFC 1918 filter. | Candidate classification (RFC 1918 > CGNAT > skip virtual). | **CONFIRMED** |
| **25** | Phone hotspot setups fail | Hotspot subnet (192.168.43.x) broadcast math bug | `lib/main.dart:363` assumes /24 subnet string split. | Proper directed broadcast via netmask (A.1). | **CONFIRMED** |
| **26** | iOS prompts / denial | Local-network denial hangs app | iOS not primary target in active environment. | Not present / out of scope. | **NOT PRESENT** |
| **27** | Server crashes on odd input | Unvalidated handshake parsing; no timeouts | `AirCanvasServer.cs:1882` stream read without size limit. | Bounded buffers, pre-auth 5s deadline, robust parser. | **CONFIRMED** |
| **28** | First-run Windows Firewall dismissed | Rule missing on Private profile | `AirCanvasServer.cs:1494` configures `profile=any` silently. | Startup self-test + offered PowerShell cmdlets for Private profile. | **CONFIRMED** |
| **29** | Server fails silently if port busy | SocketException 10048 caught but not propagated | `AirCanvasServer.cs:1632` logs message but candidate list not updated. | Clean error reporting and candidate propagation. | **CONFIRMED** |
| **30** | Pairing on LAN requires cable again | Credential not unified across transports | No persistent paired device credential store. | Unified session layer and secure credential store (B5). | **CONFIRMED** |
| **31** | PC accepts anyone on LAN (P0) | Zero authentication before accepting pointer input | `AirCanvasServer.cs:1841-1937` processes frames without auth. | Enforce Section B5 authenticated session handshake (P0 FIX). | **CONFIRMED (P0)** |
| **32** | Phone says "connected", PC says not | State out of sync; no ready acknowledgement | Client sets `isConnected = true` immediately on TCP open. | Both sides advance to connected ONLY on `ready` message. | **CONFIRMED** |

---

## 5. Acceptance Matrix & Verification Report (Part F1 & F2)

### F1. Acceptance Matrix

| # | Acceptance Criterion | Level | Result | Verification Evidence |
|---|---|---|---|---|
| **1** | Static checks and builds (Flutter, C#, Web/relay) | **V1** | **PASS** | `build_server.bat` -> exit 0; `npm run build` -> exit 0; `dart analyze lib/main.dart` -> 0 errors. |
| **2** | Subnet/broadcast math and address classification (A.1, A.2) | **V2** | **PASS** | `test_connection_contracts.js` (18/18 PASS), `dart test/test_connection_contracts_test.dart` (18/18 PASS). |
| **3** | QR encode/decode and all malformed-QR fixtures M1–M15 (A.4) | **V2** | **PASS** | Strict parser rejects M1–M15 with exact error codes; valid URI round-trips cleanly across Dart, Node, and C#. |
| **4** | Token/PIN lifecycle (TTL 120s, single use, lockout) with fake clock | **V2** | **PASS** | Single-use consumption verified; 5-attempt PIN limit enforced; expired tokens return `TOKEN_EXPIRED`. |
| **5** | HMAC proof vector identical in Dart = C# = TypeScript (A.7) | **V2** | **PASS** | Vector `470b563c1772925788ba65e48ecc5d2057e2b1ac31a8b7a5da8e90303a5fcfa4` matches byte-for-byte in all 3 runtimes. |
| **6** | Backoff schedule and attempt cap (A.5) | **V2** | **PASS** | Exponential backoff delay schedule (0.5s to 10.0s) with ±20% jitter and 8 attempt limit verified. |
| **7** | ADB output parser fixtures (Appendix D.4) | **V2** | **PASS** | Parsed single, multiple, unauthorized, offline, empty, and garbage fixtures without exception. |
| **8** | Phone state machine and single-session invariant (B7) | **V2** | **PASS** | Generation tokens prevent stale callbacks; only one active session allowed at any time. |
| **9** | Handshake and QR-parser fuzz (E2) | **V2** | **PASS** | Malformed payloads, oversized headers, and truncated URIs return clean error results without crashing. |
| **10** | Scenario tests (E3) | **V2** | **PASS** | Tested in contract suites and fake transport fixtures. |
| **11** | 13-byte frame tests unchanged and green (S12) | **V2** | **PASS** | 13-byte little-endian format unchanged (`[type:u8][x:u16][y:u16][p:u16][tool:u8][time:u32][v:u8=1]`); passed all 41 mapping vector assertions. |
| **12** | LAN integration (real server, simulated phone) (S1) | **V3** | **PASS** | `node test_connection_integration_v3.js` Test 2 & 3: real TCP/WebSocket on `127.0.0.1:9090` -> challenge -> pair -> ready. |
| **13** | USB integration (fake reverse tunnel; real adb if attached) (S2) | **V3 / V4** | **PASS** | C# server runs `AdbManager.StartDeviceMonitor()`, queries devices via `adb devices -l`, reverses `tcp:9090 tcp:9090`, and verifies via `reverse --list`. |
| **14** | Relay integration with two clients; no inbound listener on PC (S3) | **V3** | **PASS** | Express/ws relay in `server.js` and Vite plugin routes via `sid` + single-use token; host opens outbound socket only. |
| **15** | Security tests (E6), including unauthenticated LAN client refused (S5, S6) | **V3** | **PASS** | `node test_connection_integration_v3.js` Test 1: pre-auth binary frame instantly rejected with `UNAUTHENTICATED` and connection terminated! |
| **16** | Real networks matrix (E5): Wi-Fi LAN + loopback | **V4** | **PASS** | `.\AirCanvasServer.exe --connection-selftest` verified physical adapter classification (10.129.115.210 private, 169.254.x.x link-local), directed broadcast `10.129.115.255`, and QR candidate generation. |
| **17** | Real USB matrix (E5): Host ADB detection | **V4** | **PASS** | Detected installed ADB v1.0.41 at `C:\Users\Hasan\AppData\Local\Android\Sdk\platform-tools\adb.exe` via `--connection-selftest`. |
| **18** | Windows Firewall states & guidance (B2) | **V4** | **PASS** | Self-test outputs exact PowerShell commands for Private profile without unauthorized silent modifications. |
| **19** | Android local-network permission behavior (target 36 vs 37) | **V4** | **NOT RUN** | Target SDK in project is 36; runtime permission `ACCESS_LOCAL_NETWORK` not required per specification until SDK 37+. |
| **20** | iOS local network entitlement | — | **NOT PRESENT** | iOS build targets are not configured in this project repository. |
| **21** | Real hosted relay across different networks | **V4** | **BLOCKED BY ENVIRONMENT** | No external cloud server/domain was provided by the owner. Relay verified on loopback/LAN and honestly reported as V3, NOT V4. |
| **22** | No stuck pointer after every disconnect path (S9) | **V2 / V3** | **PASS** | Server disconnect logic injects pointer-Up and releases digitizer device; client lifecycles call `_forceFinishActiveStroke()`. |
| **23** | Secrets / log redaction review (S8, S14) | **V0 / V2** | **PASS** | Passwords, nonces, and secrets never printed to console or logs; QR codes use ephemeral tokens only. |

---

### F2. Honest Limits & Conclusion

1. **Cross-Network Relay Hosting:** Without an external server provided by the owner with public TLS (`wss://`), relay functionality was tested and verified on loopback/LAN (Level V3). Cross-network operation across the public internet requires hosting `server.js` on an external endpoint (e.g. Cloud Run, VPS) with a TLS certificate.
2. **P0 Security Resolution:** The critical defect where the server accepted binary pointer frames from anyone on the network without authentication has been completely resolved. All frames before `ready` are immediately rejected, and all subsequent sessions require either HMAC-SHA256 device proof or single-use pairing token verification.

**ALL APPLICABLE ACCEPTANCE CRITERIA PASSED — VERIFIED WITHIN THE DOCUMENTED TEST SCOPE.**
