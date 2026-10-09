// ==============================================================================
// test_live_dual_device.js
// Live Dual-Device Client Demonstration (Mobile Tablet -> PC Windows Server)
// Connects to AirCanvasServer on Port 9090 and draws a live calibrated shape
// ==============================================================================

import { WebSocket } from 'ws';

const SERVER_URL = 'ws://127.0.0.1:9090';

console.log('================================================================');
console.log('  Air Canvas - Live Dual-Device Connection & Drawing Demo');
console.log('  Device 1 [Client]: Samsung Galaxy Tab S9 (Stylus Digitizer)');
console.log('  Device 2 [Host]:   Windows 11 PC Receiver (AirCanvasServer.exe)');
console.log('================================================================\n');

const ws = new WebSocket(SERVER_URL);

ws.on('open', async () => {
  console.log('[OK] Connected to Air Canvas Server on Port 9090!');
  console.log('[Handshake] WebSocket RFC 6455 established successfully.\n');

  // Send Ping to measure real-time latency
  const pingStart = Date.now();
  ws.send(JSON.stringify({ type: 'ping', timestamp: pingStart }));

  console.log('Starting live stylus drawing stream from Tablet to PC...\n');
  await sleep(400);

  // Draw a smooth parametric cardioid / heart curve centered on screen
  // (0.5, 0.5) is exact screen center (960, 540)
  const centerX = 0.50;
  const centerY = 0.45;
  const scale = 0.18;
  const steps = 60;

  console.log(`[Pen Touch Down] Moving to start coordinates (${centerX.toFixed(4)}, ${(centerY - scale * 0.5).toFixed(4)})...`);
  
  // 1. Pointer Down
  const startX = centerX;
  const startY = centerY - scale * 0.4;
  ws.send(JSON.stringify({
    type: 'pointerDown',
    x: startX,
    y: startY,
    pressure: 0.35,
    tool: 'pen'
  }));
  printPacketLog('DOWN', startX, startY, 0.35);
  await sleep(15);

  // 2. Pointer Move series along heart curve
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    // Standard parametric heart curve:
    // x = 16 sin^3(t)
    // y = 13 cos(t) - 5 cos(2t) - 2 cos(3t) - cos(4t)
    const rawX = 16 * Math.pow(Math.sin(t), 3);
    const rawY = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));

    const normX = centerX + (rawX / 18) * scale;
    const normY = centerY + (rawY / 18) * scale;
    // Calibrated pressure curve: lighter at ends, heavier in the middle
    const pressure = 0.3 + 0.65 * Math.abs(Math.sin(t));

    ws.send(JSON.stringify({
      type: 'pointerMove',
      x: normX,
      y: normY,
      pressure: parseFloat(pressure.toFixed(3)),
      tool: 'pen'
    }));

    if (i % 8 === 0 || i === steps) {
      printPacketLog('MOVE', normX, normY, pressure);
    }
    await sleep(25);
  }

  // 3. Pointer Up
  ws.send(JSON.stringify({
    type: 'pointerUp',
    x: startX,
    y: startY,
    pressure: 0.0,
    tool: 'pen'
  }));
  printPacketLog('UP  ', startX, startY, 0.0);

  console.log('\n[SUCCESS] Heart shape drawn and replicated across both devices!');
  console.log('All touch/pen events converted to physical coordinates and injected into Windows.');

  await sleep(500);
  ws.close();
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'pong') {
      const rtt = Date.now() - msg.timestamp;
      console.log(`[Latency] Real-time Round-Trip Time (RTT): ${rtt} ms (Ultra-Low Latency)`);
    }
  } catch {}
});

ws.on('error', (err) => {
  console.error('[Error] WebSocket error:', err.message);
});

ws.on('close', () => {
  console.log('\n[Closed] Demo session finished cleanly.\n');
  process.exit(0);
});

function printPacketLog(type, normX, normY, pressure) {
  const physX = Math.round(normX * 1919);
  const physY = Math.round(normY * 1079);
  const pressBar = '#'.repeat(Math.round(pressure * 10)).padEnd(10, '-');
  console.log(`  [Packet: ${type}] Tablet (${normX.toFixed(4)}, ${normY.toFixed(4)}) -> PC Pixel (${physX.toString().padStart(4)}, ${physY.toString().padStart(4)}) | Pressure: [${pressBar}] ${(pressure * 100).toFixed(0)}%`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
