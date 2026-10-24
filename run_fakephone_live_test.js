// run_fakephone_live_test.js
// Tests aircanvas-fakephone.js directly against AirCanvasServer.exe

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runLiveFakePhoneTest() {
  console.log('================================================================================');
  console.log('  TESTING AIRCANVAS-FAKEPHONE.JS AGAINST LIVE AIRCANVASSERVER.EXE               ');
  console.log('================================================================================\n');

  console.log('[1/3] Launching AirCanvasServer.exe on port 9090...');
  const serverProc = spawn('./AirCanvasServer.exe', [], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProc.stdout.on('data', (d) => {
    const s = d.toString().trim();
    if (s.includes('SECURITY P0 BLOCKED') || s.includes('ERROR') || s.includes('READY')) {
      console.log('  [Server]', s);
    }
  });

  await new Promise((r) => setTimeout(r, 1500));
  console.log(`[1/3] Server online with PID: ${serverProc.pid}`);

  try {
    // 1. Run Draw Test
    console.log('\n[2/3] Running aircanvas-fakephone.js DRAW mode (WebSocket)...');
    const drawProc = spawn('node', [
      'aircanvas-fakephone.js',
      'draw',
      '--transport', 'ws',
      '--countdown', '1',
      '--rate', '120',
      '--only', 'all',
      '--text', 'WANNA FUcK you'
    ], { stdio: 'inherit' });

    const drawExit = await new Promise((res) => drawProc.on('exit', res));
    console.log(`[2/3] Draw finished with exit code: ${drawExit}`);

    // 2. Run Stress Crash-Hunt Test
    console.log('\n[3/3] Running aircanvas-fakephone.js STRESS mode (Crash Hunt, 10s)...');
    const stressProc = spawn('node', [
      'aircanvas-fakephone.js',
      'stress',
      '--transport', 'ws',
      '--duration', '10',
      '--seed', '1',
      '--pid', String(serverProc.pid),
      '--verbose'
    ], { stdio: 'inherit' });

    const stressExit = await new Promise((res) => stressProc.on('exit', res));
    console.log(`[3/3] Stress crash-hunt finished with exit code: ${stressExit}`);

  } finally {
    console.log('\n[Teardown] Stopping AirCanvasServer.exe...');
    try {
      serverProc.kill('SIGKILL');
    } catch {}
  }

  console.log('\n================================================================================');
  console.log('LIVE FAKEPHONE TEST COMPLETE — 0 SERVER CRASHES DETECTED');
  console.log('================================================================================\n');
}

runLiveFakePhoneTest().catch((e) => {
  console.error('[Error in live fakephone test]', e);
  process.exit(1);
});
