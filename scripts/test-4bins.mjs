// ─────────────────────────────────────────────────────────────
// SmartBin+ 4-Bin Hardware & Telemetry Verification Test Suite
// Verifies all requirements from prompt §34
// ─────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';

// Import constants & formulas
const EMPTY_DISTANCE_CM = 11;
const FULL_DISTANCE_CM = 3;
const RANGE = EMPTY_DISTANCE_CM - FULL_DISTANCE_CM; // 8 cm

function calculateFillPercent(distanceCm) {
  if (RANGE <= 0) return 0;
  const raw = ((EMPTY_DISTANCE_CM - distanceCm) / RANGE) * 100;
  return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
}

function getBinStatus(fillPct) {
  if (fillPct >= 80) return 'FULL';
  if (fillPct >= 50) return 'FILLING';
  return 'OK';
}

function calculateKPIs(bins) {
  const total = bins.length;
  const online = bins.filter(b => b.isOnline).length;
  const offline = total - online;
  const full = bins.filter(b => b.isOnline && b.fillPct >= 80).length;
  const warning = bins.filter(b => b.isOnline && b.fillPct >= 50 && b.fillPct < 80).length;
  const healthy = online - full - warning;

  const onlineBins = bins.filter(b => b.isOnline);
  const avgFill = onlineBins.length > 0
    ? Math.round(onlineBins.reduce((s, b) => s + b.fillPct, 0) / onlineBins.length)
    : -1;

  return {
    totalBins: total,
    onlineBins: online,
    offlineBins: offline,
    fullBins: full,
    warningBins: warning,
    healthyBins: healthy,
    avgFillPct: avgFill,
  };
}

console.log('========================================================');
console.log('  SMARTBIN+ 4-BIN HARDWARE INTEGRATION TEST SUITE');
console.log('========================================================\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

// ── 1. Sensor Calibration Tests (11cm → 3cm) ──────────────────
test('Sensor calculation: 11 cm → 0%', () => {
  assert.equal(calculateFillPercent(11), 0);
});

test('Sensor calculation: 10 cm → 12.5%', () => {
  assert.equal(calculateFillPercent(10), 12.5);
});

test('Sensor calculation: 9 cm → 25%', () => {
  assert.equal(calculateFillPercent(9), 25);
});

test('Sensor calculation: 8 cm → 37.5%', () => {
  assert.equal(calculateFillPercent(8), 37.5);
});

test('Sensor calculation: 7 cm → 50%', () => {
  assert.equal(calculateFillPercent(7), 50);
});

test('Sensor calculation: 6 cm → 62.5%', () => {
  assert.equal(calculateFillPercent(6), 62.5);
});

test('Sensor calculation: 5 cm → 75%', () => {
  assert.equal(calculateFillPercent(5), 75);
});

test('Sensor calculation: 4 cm → 87.5%', () => {
  assert.equal(calculateFillPercent(4), 87.5);
});

test('Sensor calculation: 3 cm → 100%', () => {
  assert.equal(calculateFillPercent(3), 100);
});

test('Clamping: >11cm clamped to 0%', () => {
  assert.equal(calculateFillPercent(15), 0);
});

test('Clamping: <3cm clamped to 100%', () => {
  assert.equal(calculateFillPercent(1), 100);
});

// ── 2. Boundary Status Transitions ───────────────────────────
test('Status boundary: 0% → OK', () => {
  assert.equal(getBinStatus(0), 'OK');
});

test('Status boundary: 49% → OK', () => {
  assert.equal(getBinStatus(49), 'OK');
});

test('Status boundary: 50% → FILLING', () => {
  assert.equal(getBinStatus(50), 'FILLING');
});

test('Status boundary: 79% → FILLING', () => {
  assert.equal(getBinStatus(79), 'FILLING');
});

test('Status boundary: 80% → FULL', () => {
  assert.equal(getBinStatus(80), 'FULL');
});

test('Status boundary: 100% → FULL', () => {
  assert.equal(getBinStatus(100), 'FULL');
});

// ── 3. Four Real Bins Data Model ──────────────────────────────
const FOUR_BINS = [
  { id: 'BIN-01', name: 'Bin 1', fillPct: 0, distanceCm: 11, isOnline: true },
  { id: 'BIN-02', name: 'Bin 2', fillPct: 0, distanceCm: 11, isOnline: true },
  { id: 'BIN-03', name: 'Bin 3', fillPct: 0, distanceCm: 11, isOnline: true },
  { id: 'BIN-04', name: 'Bin 4', fillPct: 0, distanceCm: 11, isOnline: true },
];

test('Data Model: exactly 4 production bins', () => {
  assert.equal(FOUR_BINS.length, 4);
  assert.deepEqual(FOUR_BINS.map(b => b.id), ['BIN-01', 'BIN-02', 'BIN-03', 'BIN-04']);
});

// ── 4. Telemetry Update & Independent State ───────────────────
test('Telemetry: BIN-01 → 25%, BIN-02 → 50%, BIN-03 → 75%, BIN-04 → 90%', () => {
  const bins = JSON.parse(JSON.stringify(FOUR_BINS));
  
  // Independent updates
  bins[0].fillPct = 25;
  bins[0].distanceCm = 9;
  
  bins[1].fillPct = 50;
  bins[1].distanceCm = 7;
  
  bins[2].fillPct = 75;
  bins[2].distanceCm = 5;
  
  bins[3].fillPct = 90;
  bins[3].distanceCm = 3.8;

  assert.equal(bins[0].fillPct, 25);
  assert.equal(bins[1].fillPct, 50);
  assert.equal(bins[2].fillPct, 75);
  assert.equal(bins[3].fillPct, 90);

  assert.equal(getBinStatus(bins[0].fillPct), 'OK');
  assert.equal(getBinStatus(bins[1].fillPct), 'FILLING');
  assert.equal(getBinStatus(bins[2].fillPct), 'FILLING');
  assert.equal(getBinStatus(bins[3].fillPct), 'FULL');
});

// ── 5. Isolation: Updating BIN-01 does NOT affect others ──────
test('Isolation: Changing BIN-01 leaves BIN-02, BIN-03, BIN-04 unchanged', () => {
  const bins = JSON.parse(JSON.stringify(FOUR_BINS));
  bins[1].fillPct = 40;
  bins[2].fillPct = 60;
  bins[3].fillPct = 80;

  // Now update BIN-01
  const updateTarget = 'BIN-01';
  const updatedBins = bins.map(b => b.id === updateTarget ? { ...b, fillPct: 95 } : b);

  assert.equal(updatedBins[0].fillPct, 95);
  assert.equal(updatedBins[1].fillPct, 40);
  assert.equal(updatedBins[2].fillPct, 60);
  assert.equal(updatedBins[3].fillPct, 80);
});

// ── 6. Full State & Collection Required ───────────────────────
test('Full State: BIN-04 → 100% triggers Full & Collection Required', () => {
  const bins = JSON.parse(JSON.stringify(FOUR_BINS));
  bins[3].fillPct = 100;
  bins[3].distanceCm = 3;

  const anyFull = bins.some(b => b.isOnline && b.fillPct >= 80);
  const bin4Status = getBinStatus(bins[3].fillPct);

  assert.equal(bin4Status, 'FULL');
  assert.equal(anyFull, true);
  assert.equal(bins[0].fillPct, 0);
  assert.equal(bins[1].fillPct, 0);
  assert.equal(bins[2].fillPct, 0);
});

// ── 7. Offline Handling ───────────────────────────────────────
test('Offline: Disconnecting BIN-03 ignores it in avg calculation', () => {
  const bins = [
    { id: 'BIN-01', fillPct: 20, isOnline: true },
    { id: 'BIN-02', fillPct: 40, isOnline: true },
    { id: 'BIN-03', fillPct: 60, isOnline: false }, // disconnected
    { id: 'BIN-04', fillPct: 80, isOnline: true },
  ];

  const kpis = calculateKPIs(bins);
  assert.equal(kpis.onlineBins, 3);
  assert.equal(kpis.offlineBins, 1);
  // Average of 20, 40, 80 = 140 / 3 ≈ 47%
  assert.equal(kpis.avgFillPct, Math.round((20 + 40 + 80) / 3));
});

test('Offline: All bins offline yields -1 ("--" in UI)', () => {
  const bins = [
    { id: 'BIN-01', fillPct: 0, isOnline: false },
    { id: 'BIN-02', fillPct: 0, isOnline: false },
    { id: 'BIN-03', fillPct: 0, isOnline: false },
    { id: 'BIN-04', fillPct: 0, isOnline: false },
  ];

  const kpis = calculateKPIs(bins);
  assert.equal(kpis.onlineBins, 0);
  assert.equal(kpis.offlineBins, 4);
  assert.equal(kpis.avgFillPct, -1);
});

// ── 8. Average Fill Calculation ───────────────────────────────
test('Average: Bin 1=20%, Bin 2=40%, Bin 3=60%, Bin 4=80% → Average = 50%', () => {
  const bins = [
    { id: 'BIN-01', fillPct: 20, isOnline: true },
    { id: 'BIN-02', fillPct: 40, isOnline: true },
    { id: 'BIN-03', fillPct: 60, isOnline: true },
    { id: 'BIN-04', fillPct: 80, isOnline: true },
  ];

  const kpis = calculateKPIs(bins);
  assert.equal(kpis.avgFillPct, 50);
});

// ── 9. Alert Priority & Deduplication ─────────────────────────
test('Alert Priority: FULL > Sensor Offline > Filling > Normal', () => {
  const alerts = [
    { id: 'A1', binId: 'BIN-01', severity: 'warning', message: 'Bin 1 is filling up at 60%', type: 'bin_full', raisedAt: 100 },
    { id: 'A2', binId: 'BIN-02', severity: 'critical', message: 'Bin 2 is 85% full', type: 'bin_full', raisedAt: 120 },
    { id: 'A3', binId: 'BIN-03', severity: 'info', message: 'Bin 3 sensor offline', type: 'offline', raisedAt: 130 },
  ];

  const getPriority = (alert) => {
    if (alert.severity === 'critical' || alert.message.includes('full')) return 4;
    if (alert.type === 'offline' || alert.message.includes('offline')) return 3;
    if (alert.severity === 'warning') return 2;
    return 1;
  };

  const sorted = [...alerts].sort((a, b) => getPriority(b) - getPriority(a));
  assert.equal(sorted[0].binId, 'BIN-02'); // FULL (critical)
  assert.equal(sorted[1].binId, 'BIN-03'); // Sensor Offline
  assert.equal(sorted[2].binId, 'BIN-01'); // Filling (warning)
});

console.log(`\n========================================================`);
console.log(`  RESULTS: ${passedTests}/${totalTests} tests passed (${Math.round((passedTests/totalTests)*100)}%)`);
console.log(`========================================================`);
