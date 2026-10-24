# AUDIT CHECKPOINT — Complete & Verified (Master Mapping Pipeline)

- **Repo:** Air Canvas (`hasibcore/Air_Canvas`) at `c:\Users\Hasan\Downloads\air canvas` (Git branch `main`)
- **Status:** ALL PHASES COMPLETE & FULLY VERIFIED (V1, V2, V3, V4 Host).
- **Deliverables Completed:**
  1. `lib/main.dart`: `_computeActivePadRect` (`ASPECT_LOCK_PAD`), `_normalizePadPoint`, active-stroke latching (`_latchedStrokePadRect`), and letterbox touch rejection.
  2. `AirCanvasServer.cs` & `public/AirCanvasServer.cs`:
     - Per-Monitor V2 DPI awareness with `--mapping-selftest` startup validation.
     - Physical multi-monitor enumeration via `EnumDisplayMonitors` with virtual-desktop & negative coordinate support.
     - `DwmGetWindowAttribute` with `DWMWA_EXTENDED_FRAME_BOUNDS` for visible window frame bounds.
     - Banker's rounding replaced with `MidpointRounding.AwayFromZero`.
     - `StrokeRegionGate` ensuring 0 px mid-stroke jumps.
     - Live broadcast of `targetInfo` / `screen_sync` over WebSocket on port 9090.
  3. `contracts/protocol-vectors.json`: Appendix A test vectors (Aspect-fit E1–E8, projection, normalization, rounding trap, and RECT conversion).
  4. Test Suites Verified:
     - Dart Appendix A Contract Vectors: 41/41 PASS (`dart test/test_mapping_vectors_test.dart`)
     - Dart 5-point calibration & multi-DPI tests: 10/10 PASS
     - Node.js Appendix A Vectors: 41/41 PASS (`node test_mapping_vectors.js`)
     - Node.js 16-suite calibration & fuzz runner: 2,039 assertions PASS (`node run_calibration_tests.js`)
     - V3 Loopback 4-stage integration: PASS (`node test_live_dual_device.js`)
     - C# Hardware Mapping Self-Test: PASS (`.\AirCanvasServer.exe --mapping-selftest`)
     - TypeScript Typecheck: 0 errors (`npx tsc --noEmit`)
     - Web Studio Bundle: built in 7.85s (`npm run build`)
     - C# Native Binaries: `AirCanvas.exe` & `AirCanvasServer.exe` successfully compiled.

---

# AUDIT CHECKPOINT — CONNECTION SYSTEM (USB · LAN · Relay)
- **Repo:** Air Canvas (`hasibcore/Air_Canvas`) at `c:\Users\Hasan\Downloads\air canvas`
- **Git State:** `main` (commit `021c5ce`). Working tree changes preserved.
- **Status:** ALL PHASES COMPLETE & FULLY VERIFIED (V1, V2, V3, V4 Host).
- **Core Deliverables Completed:**
  1. `AirCanvasServer.cs` (and synchronized `public/AirCanvasServer.cs`, `dist/AirCanvasServer.cs`):
     - P0 Security Fix: Handshake gate (`hello` -> `challenge` -> `auth`/`pair` -> `ready`) strictly enforced in `HandleWebSocketStream`. Pre-ready binary pointer frames are REJECTED with `UNAUTHENTICATED` error and connection dropped.
     - Single active controller session invariant with `CurrentController` generation token and `busy` policy rejection for competing devices.
     - Server-side ADB manager (`AdbManager`) with auto-detection of Android platform-tools (`C:\Users\Hasan\AppData\Local\Android\Sdk\platform-tools\adb.exe`), device tracking, automatic reverse tunnel mapping (`tcp:9090 tcp:9090`), and verification via `reverse --list`.
     - RFC 1918 / CGNAT address classification (`ClassifyAddress`) prioritizing private IP candidates over link-local (`169.254.x.x`), loopback, and public IPs.
     - Directed UDP broadcast beaconing (`GetDirectedBroadcastAddresses()`) across all active physical network interfaces on port 9091.
     - 128-bit single-use QR pairing tokens with 120s TTL and 6-digit PIN fallback.
     - Constant-time HMAC-SHA256 proof verification for paired device reconnection.
     - `--connection-selftest` startup switch printing network classification, QR URI candidates, ADB status, and firewall guidance without injecting pointer input.
  2. `lib/services/connection_contracts.dart` & `lib/main.dart`:
     - Pure Dart connection contract logic matching Appendix A test vectors (subnet math, address classification, strict QR parser, exponential backoff with ±20% jitter, pure HMAC-SHA256).
     - Hardened `NetworkConnectionManager` with authenticated handshake state machine, single-session invariant with generation tokens, automatic reconnect backoff (max 8 attempts), and QR connect handler (`connectFromQr`).
     - UI enhancements in `ConnectionSetupView`: "Scan QR / Paste Code" modal and direct multi-transport connection.
  3. `server.js` (Relay):
     - Session routing for `aircanvas://pair` (`sid` + `token` constant-time verification using `crypto.timingSafeEqual`).
     - Backpressure management dropping Move/Hover frames during consumer buffer backlog while preserving Down/Up frames.
  4. `src/services/connectionManager.ts`:
     - Standardized `getConnectionString('protocol')` generating strict `aircanvas://pair?v=1&sid=...&tok=...&exp=...&name=...&lan=...&relay=...` URIs per Appendix A.4.
- **Verification Evidence:**
  - V1: C# compilation (`build_server.bat` -> exit 0), TypeScript build (`npm run build` -> exit 0), Dart analyze (0 errors).
  - V2: `node test_connection_contracts.js` (117/117 PASS), `dart test/test_connection_contracts_test.dart` (108/108 PASS), HMAC proof vector (`470b563c...`) verified identical in C#, Dart, and Node.
  - V3: `node test_connection_integration_v3.js` (11/11 PASS against real native `AirCanvasServer.exe` socket process, confirming P0 security rejection, challenge/pair handshake, HMAC reconnect, bad token rejection, and BUSY controller policy).
  - V4: Native host self-test (`.\AirCanvasServer.exe --connection-selftest` -> PASS).


