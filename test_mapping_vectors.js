// ==============================================================================
// test_mapping_vectors.js
// Automated verification of Appendix A test vectors:
// Aspect-fit, Normalization, Rounding, Projection, and RECT conversion
// ==============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const vectorsPath = path.join(__dirname, 'contracts', 'protocol-vectors.json');
const vectors = JSON.parse(fs.readFileSync(vectorsPath, 'utf8'));

console.log('================================================================');
console.log('TEST SUITE: Appendix A Test Vectors (Aspect-Fit, Projection, Normalization)');
console.log('================================================================');

let total = 0;
let passed = 0;
let failed = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

// ------------------------------------------------------------------------------
// Reference formulas from Part B
// ------------------------------------------------------------------------------

// Integer roundDiv: (2a + b) div (2b) for positive integers (rounds half away from zero)
function roundDiv(a, b) {
  return Math.floor((2 * a + b) / (2 * b));
}

// Aspect-fit active region: fitActiveRect(padW, padH, tW, tH)
function fitActiveRect(padW, padH, tW, tH) {
  let w, h;
  if (padW * tH > padH * tW) {
    // Pad is relatively wider -> limited by height
    h = padH;
    w = roundDiv(padH * tW, tH);
  } else {
    // Pad is relatively taller or equal -> limited by width
    w = padW;
    h = roundDiv(padW * tH, tW);
  }
  w = Math.max(1, Math.min(padW, w));
  h = Math.max(1, Math.min(padH, h));
  const left = Math.floor((padW - w) / 2);
  const top = Math.floor((padH - h) / 2);
  return [left, top, w, h];
}

// Round half away from zero (replaces banker's rounding)
function roundHalfAwayFromZero(v) {
  return v >= 0 ? Math.floor(v + 0.5) : Math.ceil(v - 0.5);
}

// Project normalized to target physical pixels
function projectToRegion(normX, normY, region) {
  const [left, top, width, height] = region;
  const clampedX = Math.max(0, Math.min(1, normX));
  const clampedY = Math.max(0, Math.min(1, normY));
  const targetX = left + roundHalfAwayFromZero(clampedX * (width - 1));
  const targetY = top + roundHalfAwayFromZero(clampedY * (height - 1));
  return [targetX, targetY];
}

// Normalization against active region
function normalizeToActive(localX, localY, active) {
  const [left, top, w, h] = active;
  if (!Number.isFinite(localX) || !Number.isFinite(localY) || !Number.isFinite(w) || !Number.isFinite(h) || w < 2 || h < 2) {
    return [0.5, 0.5];
  }
  return [
    Math.max(0, Math.min(1, (localX - left) / (w - 1))),
    Math.max(0, Math.min(1, (localY - top) / (h - 1)))
  ];
}

// ------------------------------------------------------------------------------
// 1. Aspect-Fit Vectors (Appendix A.1)
// ------------------------------------------------------------------------------
console.log('\n--- 1. Aspect-Fit Active Region (A.1: E1..E8) ---');
for (const v of vectors.aspectFit) {
  const res = fitActiveRect(v.pad[0], v.pad[1], v.target[0], v.target[1]);
  const match = res[0] === v.expected[0] &&
                res[1] === v.expected[1] &&
                res[2] === v.expected[2] &&
                res[3] === v.expected[3];
  assert(match, `Aspect-Fit ${v.id} (Pad: ${v.pad}, Target: ${v.target}) -> got ${res}, expected ${v.expected}`);
  if (match) {
    console.log(`  PASS: ${v.id} Pad(${v.pad[0]}x${v.pad[1]}) over Target(${v.target[0]}x${v.target[1]}) -> ActiveRect(${res.join(', ')})`);
  }
}

// ------------------------------------------------------------------------------
// 2. Normalization Vectors (Appendix A.2)
// ------------------------------------------------------------------------------
console.log('\n--- 2. Active Region Normalization (A.2) ---');
for (let i = 0; i < vectors.activeNormalization.length; i++) {
  const v = vectors.activeNormalization[i];
  const [normX, normY] = normalizeToActive(v.local[0], v.local[1], v.active);
  const diffX = Math.abs(normX - v.expected[0]);
  const diffY = Math.abs(normY - v.expected[1]);
  const match = diffX < 0.0001 && diffY < 0.0001;
  assert(match, `Norm #${i+1} Local(${v.local}) in Active(${v.active}) -> got (${normX.toFixed(5)}, ${normY.toFixed(5)}), expected (${v.expected.join(', ')})`);
  if (match) {
    console.log(`  PASS: Norm #${i+1} Local(${v.local[0]}, ${v.local[1]}) in Active(${v.active.join(', ')}) -> (${normX.toFixed(4)}, ${normY.toFixed(4)})`);
  }
}

// ------------------------------------------------------------------------------
// 3. Projection Vectors & Rounding Trap (Appendix A.2)
// ------------------------------------------------------------------------------
console.log('\n--- 3. Projection to Region & Rounding Trap (A.2) ---');
for (let i = 0; i < vectors.projection.length; i++) {
  const v = vectors.projection[i];
  const [px, py] = projectToRegion(v.norm[0], v.norm[1], v.area);
  const match = px === v.expected[0] && py === v.expected[1];
  assert(match, `Proj #${i+1} Norm(${v.norm}) in Area(${v.area}) -> got (${px}, ${py}), expected (${v.expected.join(', ')})`);
  if (match) {
    console.log(`  PASS: Proj #${i+1} Norm(${v.norm.join(', ')}) in Area(${v.area.join(', ')}) -> Pixel(${px}, ${py})`);
  }
}

// ------------------------------------------------------------------------------
// 4. RECT Conversion (right/bottom exclusive)
// ------------------------------------------------------------------------------
console.log('\n--- 4. RECT Conversion (Right/Bottom Exclusive) ---');
for (const v of vectors.rectConversion) {
  const [left, top, right, bottom] = v.ltrb;
  const width = right - left;
  const height = bottom - top;
  const match = width === v.expected.width && height === v.expected.height && left === v.expected.left && top === v.expected.top;
  assert(match, `RECT [${v.ltrb}] -> got ${width}x${height}, expected ${v.expected.width}x${v.expected.height}`);
  if (match) {
    console.log(`  PASS: RECT [${left}, ${top}, ${right}, ${bottom}] -> Bounds(${left}, ${top}, ${width}x${height})`);
  }
}

console.log('\n================================================================');
console.log(`SUMMARY: ${passed}/${total} assertions passed (${failed} failures).`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
}
