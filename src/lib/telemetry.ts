// ─────────────────────────────────────────────────────────────
// SmartBin+ — TELEMETRY CORE
// ─────────────────────────────────────────────────────────────
// The one place where a distance becomes a percentage, and where a
// timestamp becomes "online" or "offline".
//
// Dashboard, map, alerts, charts, statistics and the bin detail page all
// consume `LiveBinState` produced here. There is no second model.
// ─────────────────────────────────────────────────────────────

import {
  DEVICE_OFFLINE_TIMEOUT_MS,
  EMPTY_DISTANCE_CM,
  FILLING_THRESHOLD_PCT,
  FULL_THRESHOLD_PCT,
  PHYSICAL_BINS,
  SENSING_SPAN_CM,
  SENSOR_MAX_VALID_CM,
  SENSOR_MIN_VALID_CM,
  getBinConfig,
  type PhysicalBinConfig,
} from '@/config/devices.config';

// ── Status vocabulary ──────────────────────────────────────

/**
 * What the bin is doing. Deliberately distinct from device presence:
 * a bin can be OFFLINE (no device) or SENSOR_ERROR (device fine, sensor
 * not), and neither of those is "OK".
 */
export type BinOperationalStatus =
  | 'OK'           // 0–49 %
  | 'FILLING'      // 50–79 %
  | 'FULL'         // 80–100 %
  | 'SENSOR_ERROR' // device reporting, sensor reading implausible
  | 'OFFLINE'      // device has not reported within the timeout
  | 'WAITING';     // registered, but has never reported at all

/** Device presence, independent of what the sensor says. */
export type DevicePresence = 'online' | 'offline' | 'never-seen';

export const STATUS_LABEL: Record<BinOperationalStatus, string> = {
  OK: 'OK',
  FILLING: 'Filling',
  FULL: 'Full',
  SENSOR_ERROR: 'Sensor error',
  OFFLINE: 'Offline',
  WAITING: 'Waiting for device',
};

/**
 * The OLED mood shown on the physical bin, so the device and the dashboard
 * speak the same language.
 */
export const STATUS_FACE: Record<BinOperationalStatus, string> = {
  OK: 'happy',
  FILLING: 'worried',
  FULL: 'urgent',
  SENSOR_ERROR: 'error',
  OFFLINE: 'no-signal',
  WAITING: 'no-signal',
};

// ── Fill calculation ───────────────────────────────────────

/**
 * Convert a raw ultrasonic distance into a fill percentage.
 *
 *   fillPct = ((EMPTY − d) / (EMPTY − FULL)) × 100, clamped to [0, 100]
 *
 * With the prototype's 11 cm / 3 cm calibration:
 *   11 cm → 0 %    7 cm → 50 %    3 cm → 100 %
 *
 * THIS IS THE ONLY IMPLEMENTATION OF THIS FORMULA IN THE CODEBASE.
 * The firmware mirrors it so the OLED and the LED agree with the website;
 * the backend value is authoritative when the two ever disagree.
 */
export function distanceToFillPercent(distanceCm: number): number {
  if (!Number.isFinite(distanceCm)) return 0;
  const raw = ((EMPTY_DISTANCE_CM - distanceCm) / SENSING_SPAN_CM) * 100;
  return clampPercent(raw);
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

/**
 * Whether a distance reading is physically plausible.
 *
 * An out-of-range reading is a SENSOR FAULT, not an empty bin. Converting a
 * no-echo result into 0 % would show a clean green bin that is actually
 * overflowing, which is the worst failure this system can produce.
 */
export function isPlausibleDistance(distanceCm: unknown): distanceCm is number {
  return (
    typeof distanceCm === 'number' &&
    Number.isFinite(distanceCm) &&
    distanceCm >= SENSOR_MIN_VALID_CM &&
    distanceCm <= SENSOR_MAX_VALID_CM
  );
}

/** Fill band from a percentage. Does not know about devices or sensors. */
export function fillToBand(fillPct: number): 'OK' | 'FILLING' | 'FULL' {
  if (fillPct >= FULL_THRESHOLD_PCT) return 'FULL';
  if (fillPct >= FILLING_THRESHOLD_PCT) return 'FILLING';
  return 'OK';
}

// ── Raw telemetry as stored in Firebase ────────────────────

/** What the ESP32 writes to /bins/{binId}/live. */
export interface RawTelemetry {
  distanceCm?: number | null;
  fillPct?: number | null;
  deviceId?: string | null;
  sensorOk?: boolean | null;
  rssi?: number | null;
  uptimeSec?: number | null;
  firmware?: string | null;
  /** Epoch ms. Written with Firebase ServerValue.TIMESTAMP where possible. */
  timestamp?: number | null;
}

// ── Canonical state ────────────────────────────────────────

/**
 * The normalised state of one physical bin. Every view renders from this.
 */
export interface LiveBinState {
  /** Stable identity. */
  binId: string;
  label: string;
  deviceId: string;
  zone: string;

  /** Always true for a bin in the registry — it exists on the wall. */
  registered: boolean;

  /** Is the ESP32 talking to us right now? */
  presence: DevicePresence;
  isOnline: boolean;

  /** Did the last reading make physical sense? */
  sensorOk: boolean;

  /** What to show. Combines presence, sensor health and fill band. */
  status: BinOperationalStatus;

  /**
   * Fill percentage, or NULL when there is no trustworthy reading.
   * NULL is meaningful — it is not 0. Views must render "--", never "0%".
   */
  fillPct: number | null;
  distanceCm: number | null;

  /** Epoch ms of the last telemetry, or null if never seen. */
  lastSeen: number | null;

  rssi: number | null;
  uptimeSec: number | null;
  firmware: string | null;

  /** True when this bin is at or above the collection threshold. */
  needsCollection: boolean;

  /** Wiring, for the detail page. */
  hardware: PhysicalBinConfig['hardware'];
  location: PhysicalBinConfig['location'];
  grid: PhysicalBinConfig['grid'];
}

/**
 * Build the canonical state for one registered bin from its raw telemetry.
 *
 * @param binId Registered bin ID.
 * @param raw   Whatever is at /bins/{binId}/live, possibly nothing.
 * @param now   Evaluation time — passed in so this stays pure and testable.
 */
export function normaliseBin(
  binId: string,
  raw: RawTelemetry | null | undefined,
  now: number = Date.now(),
): LiveBinState | null {
  const config = getBinConfig(binId);
  if (!config) return null;

  const base = {
    binId: config.binId,
    label: config.label,
    deviceId: config.deviceId,
    zone: config.zone,
    registered: true,
    hardware: config.hardware,
    location: config.location,
    grid: config.grid,
  };

  const lastSeen =
    raw && typeof raw.timestamp === 'number' && raw.timestamp > 0 ? raw.timestamp : null;

  // Never reported — registered but waiting. Not offline, not 0 %.
  if (!raw || lastSeen === null) {
    return {
      ...base,
      presence: 'never-seen',
      isOnline: false,
      sensorOk: false,
      status: 'WAITING',
      fillPct: null,
      distanceCm: null,
      lastSeen: null,
      rssi: null,
      uptimeSec: null,
      firmware: null,
      needsCollection: false,
    };
  }

  const age = now - lastSeen;
  const isOnline = age >= 0 && age < DEVICE_OFFLINE_TIMEOUT_MS;

  const distanceOk = isPlausibleDistance(raw.distanceCm);
  // The firmware may also flag the sensor explicitly; either signal is enough
  // to distrust the reading.
  const sensorFlagged = raw.sensorOk === false;
  const sensorOk = distanceOk && !sensorFlagged;

  const distanceCm = distanceOk ? (raw.distanceCm as number) : null;

  // The backend is authoritative: we recompute from distance rather than
  // trusting whatever percentage the device sent.
  const fillPct = sensorOk && distanceCm !== null ? distanceToFillPercent(distanceCm) : null;

  // Status ladder — presence first, then sensor health, then fill band.
  // A bin is never "OK" because we failed to hear from it.
  let status: BinOperationalStatus;
  if (!isOnline) {
    status = 'OFFLINE';
  } else if (!sensorOk || fillPct === null) {
    status = 'SENSOR_ERROR';
  } else {
    status = fillToBand(fillPct);
  }

  return {
    ...base,
    presence: isOnline ? 'online' : 'offline',
    isOnline,
    sensorOk,
    status,
    fillPct,
    distanceCm,
    lastSeen,
    rssi: typeof raw.rssi === 'number' ? raw.rssi : null,
    uptimeSec: typeof raw.uptimeSec === 'number' ? raw.uptimeSec : null,
    firmware: typeof raw.firmware === 'string' ? raw.firmware : null,
    // Only a live, trusted reading can demand a collection.
    needsCollection: isOnline && sensorOk && fillPct !== null && fillPct >= FULL_THRESHOLD_PCT,
  };
}

/**
 * Build state for ALL four registered bins.
 *
 * Driven by the registry, not by whatever happens to be in the database —
 * so a bin that has never reported still appears, as "Waiting for device".
 */
export function normaliseAllBins(
  telemetry: Record<string, RawTelemetry | null | undefined>,
  now: number = Date.now(),
): LiveBinState[] {
  return PHYSICAL_BINS.map((cfg) => normaliseBin(cfg.binId, telemetry[cfg.binId], now)).filter(
    (b): b is LiveBinState => b !== null,
  );
}

// ── Fleet statistics ───────────────────────────────────────

export interface FleetStats {
  total: number;
  online: number;
  offline: number;
  waiting: number;
  full: number;
  filling: number;
  ok: number;
  sensorErrors: number;
  /**
   * Mean fill across bins with a trustworthy live reading.
   * NULL when none qualify — rendered as "--", never 0 %, because 0 % would
   * claim every bin is empty.
   */
  avgFillPct: number | null;
  /** True when any bin is at or above threshold — mirrors the shared buzzer. */
  collectionRequired: boolean;
  /** Which bins caused it. */
  binsNeedingCollection: string[];
}

export function calculateFleetStats(bins: LiveBinState[]): FleetStats {
  const online = bins.filter((b) => b.isOnline);
  const measurable = bins.filter((b) => b.fillPct !== null && b.isOnline && b.sensorOk);
  const needing = bins.filter((b) => b.needsCollection);

  const avgFillPct =
    measurable.length > 0
      ? Math.round(measurable.reduce((sum, b) => sum + (b.fillPct ?? 0), 0) / measurable.length)
      : null;

  return {
    total: bins.length,
    online: online.length,
    offline: bins.filter((b) => b.presence === 'offline').length,
    waiting: bins.filter((b) => b.presence === 'never-seen').length,
    full: bins.filter((b) => b.status === 'FULL').length,
    filling: bins.filter((b) => b.status === 'FILLING').length,
    ok: bins.filter((b) => b.status === 'OK').length,
    sensorErrors: bins.filter((b) => b.status === 'SENSOR_ERROR').length,
    avgFillPct,
    collectionRequired: needing.length > 0,
    binsNeedingCollection: needing.map((b) => b.binId),
  };
}

// ── Presentation helpers ───────────────────────────────────

export const STATUS_COLOR: Record<BinOperationalStatus, string> = {
  OK: '#22c55e',
  FILLING: '#f59e0b',
  FULL: '#ef4444',
  SENSOR_ERROR: '#f97316',
  OFFLINE: '#71717a',
  WAITING: '#71717a',
};

/** Fill percentage for display. Never fabricates a number. */
export function formatFill(fillPct: number | null): string {
  return fillPct === null ? '--' : `${Math.round(fillPct)}%`;
}

/** Distance for display. */
export function formatDistance(distanceCm: number | null): string {
  return distanceCm === null ? '--' : `${distanceCm.toFixed(1)} cm`;
}

/**
 * Relative "last seen" text.
 *
 * Deliberately never says "just now" for an offline device — if we have not
 * heard from it in four minutes, it says four minutes.
 */
export function formatLastSeen(lastSeen: number | null, now: number = Date.now()): string {
  if (lastSeen === null) return 'never';

  const seconds = Math.max(0, Math.round((now - lastSeen) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
}
