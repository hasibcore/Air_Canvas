# 🎨 Air Canvas v2.0.0 — High-Performance Wireless Graphics Tablet & Studio

**Air Canvas v2.0.0** transforms any Android phone/tablet, iPad, or touch device into a **100% Full-Screen Wireless Graphics Tablet Pad** that maps **1:1** to the active **Working Area** of your PC drawing software (Photoshop, Krita, Clip Studio Paint, OneNote, Illustrator, Blender, MS Paint, or Auto-Detected Window Area) over **Same Wi-Fi LAN**, **USB Cable (ADB Port 9090)**, or **Instant QR/PIN WebSocket Relay**.

---

## 🌐 Live Links & Releases (`hasibcore/Air_Canvas`)

- 📦 **GitHub Repository (`Air_Canvas`):** **[https://github.com/hasibcore/Air_Canvas](https://github.com/hasibcore/Air_Canvas)**
- 🚀 **GitHub Releases (`v2.0.0`):** **[https://github.com/hasibcore/Air_Canvas/releases/tag/v2.0.0](https://github.com/hasibcore/Air_Canvas/releases/tag/v2.0.0)**
- 📱 **Android Full-Screen Tablet App (`v2.0.0` APK):** **[AirCanvas-release.apk](https://github.com/hasibcore/Air_Canvas/releases/download/v2.0.0/AirCanvas-release.apk)**
- 💻 **Windows PC Desktop + Native Pen Server (`v2.0.0` ZIP):** **[AirCanvas-Windows-x64.zip](https://github.com/hasibcore/Air_Canvas/releases/download/v2.0.0/AirCanvas-Windows-x64.zip)**
- 🖥️ **Standalone Windows Server (`v2.0.0` EXE):** **[AirCanvasServer.exe](https://github.com/hasibcore/Air_Canvas/releases/download/v2.0.0/AirCanvasServer.exe)**
- 📥 **Direct Full Source Code (`v2.0.0`):** **[Air_Canvas-v2.0.0.zip](https://github.com/hasibcore/Air_Canvas/archive/refs/tags/v2.0.0.zip)**

---

## ✨ What's New in v2.0.0

1. **100% Mobile Full-Screen Tablet Pad ➔ PC Software Working Area Mapping**:
   - Mobile and tablet devices automatically operate as an edge-to-edge **100% Full-Screen Tablet Pad** (`[0.00 – 1.00]`).
   - Built-in **Auto-Detect PC Working Area** and dedicated software profiles (**Photoshop / Krita / CSP**, **OneNote / PDF**, **Illustrator / Affinity**, **Blender / ZBrush**, **MS Paint / Web**, **Full PC Screen**, and **Custom Working Area** with Left/Top/Right/Bottom margin sliders) ensure strokes map directly into the active canvas region without accidentally clicking desktop menus, tool docks, or layer panels.
2. **Automatic Landscape Rotation (`Auto-Landscape`) & Non-Overlapping Fixed UI Layers**:
   - Portrait mobile screens automatically rotate 90° into horizontal landscape orientation with a one-tap **180° Left/Right-Hand Flip** (`90° R` / `90° L`).
   - Top status headers and bottom drawing toolbars use fixed-position disjoint layers measured continuously via `ResizeObserver` so controls **never overlap** the drawing canvas on any mobile, tablet, or desktop resolution.
3. **Zero-Artifact Drawing Engine (No Stray Straight Lines or Jumps)**:
   - Strict `activePointerId` locking and multi-touch/palm rejection block secondary fingers or resting palms from creating unwanted straight lines across the canvas.
   - High-frequency `getCoalescedEvents()` pointer sampling (120Hz / 240Hz), **1€ Adaptive Filter**, Catmull-Rom spline interpolation, and **4096-level EMA + Moving Average Pressure Curves** (`Linear`, `Soft`, `Firm`, `S-Curve`).
   - Global `pointerup`, `pointercancel`, `blur`, `visibilitychange`, and `contextmenu` safety listeners guarantee strokes terminate cleanly even when switching apps or tabs.
4. **Instant Multi-Transport Pairing & Room State Sync**:
   - Connect via **Same Wi-Fi LAN**, **USB Cable (`127.0.0.1:9090`)**, or **4-Digit PIN / QR Code WebSocket Relay**.
   - Server-side room state caching replays `screen_sync` and `software_sync` immediately when a mobile pad joins or reconnects.

---

## 📱 Platform Roles & Architecture

```
+--------------------------------------------+    Wi-Fi / USB / QR Relay   +----------------------------------------------+
|   📱 Mobile / Tablet (Android / iOS / Web)  |  =========================> |     💻 Desktop Host (Windows / macOS / Web)   |
|  • 100% Full-Screen Auto-Landscape Pad     |   13-Byte Binary + JSON WS  |  • Auto-Detects PC Software Working Area     |
|  • Coalesced 120Hz/240Hz Stylus & Touch    |   Real-Time Room Sync       |  • 1:1 Coordinate & 4096-Level Pressure Lock |
|  • Active Pointer Lock & Palm Rejection    |                             |  • Live Receiver Canvas & Native Pen Driver  |
+--------------------------------------------+                             +----------------------------------------------+
```

| Platform | Role | Mode | Key Features |
|---|---|---|---|
| **🌐 Web / PWA Studio** | Cross-Platform Host & Pad | **SERVER & CLIENT** | Instant QR/PIN pairing, 1:1 PC Software Working Area mapping, 4-stage automated accuracy & 240Hz benchmark suite. |
| **🤖 Android** | Mobile Client / Tablet | **CLIENT Mode** | High-rate touch/stylus sampling, pressure sensitivity, tilt tracking, full-screen auto-landscape pad. |
| **🍏 iOS / iPadOS** | Mobile Client / Tablet | **CLIENT Mode** | Apple Pencil integration, force touch pressure, zero-callout touch surface. |
| **💻 Windows** | Desktop Receiver | **SERVER Mode** | Windows `CreateSyntheticPointerDevice` native pen input injection with fallback `SendInput`. |

---

## 🚀 Quick Start (Web & Node.js Server — v2.0.0)

```bash
# 1. Install dependencies
npm install

# 2. Start development server with live WebSocket Relay (Port 3000)
npm run dev

# 3. Verify TypeScript types & build production bundle
npm run lint
npm run build

# 4. Run production server (Port 3000)
npm start
```

### Native Desktop & Mobile Builds (Flutter / Windows C#)

```bash
# Build Android release APK
flutter build apk --release

# Build Windows 64-bit release binary
flutter build windows --release
```

---

## 📜 License & Author

**Air Canvas** is developed by **Hasib Core**. All rights reserved.
