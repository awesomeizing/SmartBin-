// ─────────────────────────────────────────────────────────────
// SmartBin+ — Telemetry core tests
// ─────────────────────────────────────────────────────────────
// These lock down the behaviour that matters when the hardware is live:
// the fill formula, the status ladder, per-device isolation, and — most
// importantly — that a broken sensor never renders as an empty bin.
// ─────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import {
  DEVICE_OFFLINE_TIMEOUT_MS,
  FULL_THRESHOLD_PCT,
  PHYSICAL_BINS,
} from '@/config/devices.config';
import {
  calculateFleetStats,
  distanceToFillPercent,
  fillToBand,
  formatFill,
  formatLastSeen,
  normaliseAllBins,
  normaliseBin,
  type RawTelemetry,
} from '@/lib/telemetry';

const T0 = 1_760_000_000_000;

/** Telemetry that arrived `ageMs` ago with the given distance. */
function reading(distanceCm: number | null, ageMs = 0, extra: Partial<RawTelemetry> = {}) {
  return { distanceCm, timestamp: T0 - ageMs, ...extra } satisfies RawTelemetry;
}

// ── Registry ───────────────────────────────────────────────

describe('device registry', () => {
  it('declares exactly four physical bins', () => {
    expect(PHYSICAL_BINS).toHaveLength(4);
    expect(PHYSICAL_BINS.map((b) => b.binId)).toEqual([
      'BIN-01',
      'BIN-02',
      'BIN-03',
      'BIN-04',
    ]);
  });

  it('gives every bin a distinct device, LED, TRIG, ECHO and OLED channel', () => {
    const unique = <T>(xs: T[]) => new Set(xs).size === xs.length;
    expect(unique(PHYSICAL_BINS.map((b) => b.deviceId))).toBe(true);
    expect(unique(PHYSICAL_BINS.map((b) => b.hardware.trigGpio))).toBe(true);
    expect(unique(PHYSICAL_BINS.map((b) => b.hardware.echoGpio))).toBe(true);
    expect(unique(PHYSICAL_BINS.map((b) => b.hardware.ledGpio))).toBe(true);
    expect(unique(PHYSICAL_BINS.map((b) => b.hardware.oledChannel))).toBe(true);
  });

  it('never assigns an input-only GPIO (34/35/36/39) to a TRIG output', () => {
    const inputOnly = [34, 35, 36, 39];
    for (const bin of PHYSICAL_BINS) {
      expect(inputOnly).not.toContain(bin.hardware.trigGpio);
      expect(inputOnly).not.toContain(bin.hardware.ledGpio);
    }
  });
});

// ── Fill calculation ───────────────────────────────────────

describe('distanceToFillPercent', () => {
  it('maps the calibration endpoints exactly', () => {
    expect(distanceToFillPercent(11)).toBe(0);
    expect(distanceToFillPercent(7)).toBe(50);
    expect(distanceToFillPercent(3)).toBe(100);
  });

  it('maps the documented intermediate points', () => {
    expect(distanceToFillPercent(10)).toBeCloseTo(12.5, 1);
    expect(distanceToFillPercent(9)).toBe(25);
    expect(distanceToFillPercent(8)).toBeCloseTo(37.5, 1);
    expect(distanceToFillPercent(6)).toBeCloseTo(62.5, 1);
    expect(distanceToFillPercent(5)).toBe(75);
    expect(distanceToFillPercent(4)).toBeCloseTo(87.5, 1);
  });

  it('clamps beyond the calibrated span instead of returning absurd values', () => {
    expect(distanceToFillPercent(20)).toBe(0);
    expect(distanceToFillPercent(1)).toBe(100);
  });

  it('reproduces the worked examples from the hardware spec', () => {
    expect(Math.round(distanceToFillPercent(6.5))).toBe(56);
    expect(Math.round(distanceToFillPercent(8.2))).toBe(35);
    expect(Math.round(distanceToFillPercent(4.5))).toBe(81);
    expect(Math.round(distanceToFillPercent(10.2))).toBe(10);
  });
});

// ── Status bands ───────────────────────────────────────────

describe('fillToBand', () => {
  it('uses OK 0–49, FILLING 50–79, FULL 80–100', () => {
    expect(fillToBand(0)).toBe('OK');
    expect(fillToBand(49)).toBe('OK');
    expect(fillToBand(50)).toBe('FILLING');
    expect(fillToBand(79)).toBe('FILLING');
    expect(fillToBand(80)).toBe('FULL');
    expect(fillToBand(100)).toBe('FULL');
  });

  it('puts the collection threshold exactly at 80', () => {
    expect(FULL_THRESHOLD_PCT).toBe(80);
    expect(fillToBand(FULL_THRESHOLD_PCT - 0.1)).toBe('FILLING');
    expect(fillToBand(FULL_THRESHOLD_PCT)).toBe('FULL');
  });
});

// ── Device presence ────────────────────────────────────────

describe('device presence', () => {
  it('is ONLINE within the timeout', () => {
    const bin = normaliseBin('BIN-01', reading(7, 1_000), T0)!;
    expect(bin.isOnline).toBe(true);
    expect(bin.presence).toBe('online');
    expect(bin.status).toBe('FILLING');
  });

  it('is OFFLINE past the timeout, and never reports OK', () => {
    const bin = normaliseBin('BIN-01', reading(9, DEVICE_OFFLINE_TIMEOUT_MS + 1_000), T0)!;
    expect(bin.isOnline).toBe(false);
    expect(bin.status).toBe('OFFLINE');
    expect(bin.status).not.toBe('OK');
  });

  it('is WAITING — not offline, not 0 % — when it has never reported', () => {
    const bin = normaliseBin('BIN-02', null, T0)!;
    expect(bin.presence).toBe('never-seen');
    expect(bin.status).toBe('WAITING');
    expect(bin.fillPct).toBeNull();
    expect(bin.registered).toBe(true);
    expect(formatFill(bin.fillPct)).toBe('--');
  });

  it('comes back ONLINE automatically when telemetry resumes', () => {
    const offline = normaliseBin('BIN-03', reading(4.5, DEVICE_OFFLINE_TIMEOUT_MS * 2), T0)!;
    expect(offline.status).toBe('OFFLINE');

    const online = normaliseBin('BIN-03', reading(4.5, 500), T0)!;
    expect(online.status).toBe('FULL');
    expect(online.isOnline).toBe(true);
  });
});

// ── Sensor faults ──────────────────────────────────────────

describe('sensor faults', () => {
  it('does NOT turn a missing echo into 0 %', () => {
    const bin = normaliseBin('BIN-01', reading(null, 1_000), T0)!;
    expect(bin.status).toBe('SENSOR_ERROR');
    expect(bin.fillPct).toBeNull();
    expect(bin.fillPct).not.toBe(0);
  });

  it('distinguishes a sensor fault from a device outage', () => {
    const sensorFault = normaliseBin('BIN-01', reading(7, 1_000, { sensorOk: false }), T0)!;
    expect(sensorFault.isOnline).toBe(true);
    expect(sensorFault.status).toBe('SENSOR_ERROR');

    const deviceDown = normaliseBin('BIN-01', reading(7, DEVICE_OFFLINE_TIMEOUT_MS * 2), T0)!;
    expect(deviceDown.isOnline).toBe(false);
    expect(deviceDown.status).toBe('OFFLINE');
  });

  it('rejects implausible distances rather than clamping them into a reading', () => {
    expect(normaliseBin('BIN-01', reading(-5, 0), T0)!.status).toBe('SENSOR_ERROR');
    expect(normaliseBin('BIN-01', reading(9_999, 0), T0)!.status).toBe('SENSOR_ERROR');
  });

  it('recomputes fill from distance, ignoring a percentage the device claims', () => {
    const bin = normaliseBin('BIN-01', { ...reading(7, 0), fillPct: 99 }, T0)!;
    expect(bin.fillPct).toBe(50);
  });

  it('never demands collection on an untrusted reading', () => {
    const bin = normaliseBin('BIN-01', reading(3, 0, { sensorOk: false }), T0)!;
    expect(bin.needsCollection).toBe(false);
  });
});

// ── Device isolation ───────────────────────────────────────

describe('device isolation', () => {
  it('leaves the other three bins untouched when one changes', () => {
    const before = normaliseAllBins(
      {
        'BIN-01': reading(9, 0),
        'BIN-02': reading(7, 0),
        'BIN-03': reading(5, 0),
        'BIN-04': reading(10, 0),
      },
      T0,
    );

    const after = normaliseAllBins(
      {
        'BIN-01': reading(4, 0), // only this one moved
        'BIN-02': reading(7, 0),
        'BIN-03': reading(5, 0),
        'BIN-04': reading(10, 0),
      },
      T0,
    );

    expect(before[0].fillPct).not.toBe(after[0].fillPct);
    expect(after[1]).toEqual(before[1]);
    expect(after[2]).toEqual(before[2]);
    expect(after[3]).toEqual(before[3]);
  });

  it('takes only one bin offline when only that device stops', () => {
    const bins = normaliseAllBins(
      {
        'BIN-01': reading(9, 0),
        'BIN-02': reading(7, 0),
        'BIN-03': reading(5, DEVICE_OFFLINE_TIMEOUT_MS * 3), // stopped
        'BIN-04': reading(10, 0),
      },
      T0,
    );

    expect(bins.filter((b) => b.isOnline).map((b) => b.binId)).toEqual([
      'BIN-01',
      'BIN-02',
      'BIN-04',
    ]);
    expect(bins[2].status).toBe('OFFLINE');
  });

  it('always returns all four bins, even with an empty database', () => {
    expect(normaliseAllBins({}, T0)).toHaveLength(4);
  });

  it('ignores telemetry for an unregistered bin ID', () => {
    const bins = normaliseAllBins({ 'BIN-99': reading(5, 0) } as never, T0);
    expect(bins).toHaveLength(4);
    expect(bins.every((b) => b.status === 'WAITING')).toBe(true);
  });
});

// ── Fleet statistics ───────────────────────────────────────

describe('calculateFleetStats', () => {
  it('averages 20/40/60/80 to 50', () => {
    const bins = normaliseAllBins(
      {
        'BIN-01': reading(9.4, 0),  // 20 %
        'BIN-02': reading(7.8, 0),  // 40 %
        'BIN-03': reading(6.2, 0),  // 60 %
        'BIN-04': reading(4.6, 0),  // 80 %
      },
      T0,
    );
    expect(calculateFleetStats(bins).avgFillPct).toBe(50);
  });

  it('excludes an offline bin from the average', () => {
    const bins = normaliseAllBins(
      {
        'BIN-01': reading(9, 0), // 25 %
        'BIN-02': reading(9, 0), // 25 %
        'BIN-03': reading(3, DEVICE_OFFLINE_TIMEOUT_MS * 2), // offline, ignored
        'BIN-04': reading(9, 0), // 25 %
      },
      T0,
    );
    const stats = calculateFleetStats(bins);
    expect(stats.avgFillPct).toBe(25);
    expect(stats.online).toBe(3);
    expect(stats.offline).toBe(1);
  });

  it('reports "--" rather than 0 % when every bin is offline', () => {
    const bins = normaliseAllBins({}, T0);
    const stats = calculateFleetStats(bins);
    expect(stats.avgFillPct).toBeNull();
    expect(formatFill(stats.avgFillPct)).toBe('--');
  });

  it('raises the collection alert only for bins at or above 80 %', () => {
    const bins = normaliseAllBins(
      {
        'BIN-01': reading(9, 0),   // 25 %
        'BIN-02': reading(4.5, 0), // 81 %
        'BIN-03': reading(9, 0),   // 25 %
        'BIN-04': reading(4.5, 0), // 81 %
      },
      T0,
    );
    const stats = calculateFleetStats(bins);
    expect(stats.collectionRequired).toBe(true);
    expect(stats.binsNeedingCollection).toEqual(['BIN-02', 'BIN-04']);
    expect(stats.full).toBe(2);
  });

  it('raises no collection alert when every bin is below threshold', () => {
    const bins = normaliseAllBins(
      {
        'BIN-01': reading(9, 0),
        'BIN-02': reading(9, 0),
        'BIN-03': reading(9, 0),
        'BIN-04': reading(9, 0),
      },
      T0,
    );
    const stats = calculateFleetStats(bins);
    expect(stats.collectionRequired).toBe(false);
    expect(stats.binsNeedingCollection).toEqual([]);
  });

  it('counts the total as four regardless of what reported', () => {
    expect(calculateFleetStats(normaliseAllBins({}, T0)).total).toBe(4);
  });
});

// ── Last seen ──────────────────────────────────────────────

describe('formatLastSeen', () => {
  it('never says "just now" for a device that has been silent for minutes', () => {
    expect(formatLastSeen(T0 - 4 * 60_000, T0)).toBe('4m ago');
  });

  it('says "never" for a device that has not reported', () => {
    expect(formatLastSeen(null, T0)).toBe('never');
  });

  it('reports seconds for a live device, and "just now" only when fresh', () => {
    expect(formatLastSeen(T0 - 2_000, T0)).toBe('just now');
    expect(formatLastSeen(T0 - 20_000, T0)).toBe('20s ago');
  });
});
