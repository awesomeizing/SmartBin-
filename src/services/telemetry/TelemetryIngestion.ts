// ─────────────────────────────────────────────────────────────
// SmartBin+ — TELEMETRY INGESTION
// ─────────────────────────────────────────────────────────────
// The write side of the telemetry contract.
//
// ARCHITECTURE NOTE — why there is no POST /api/telemetry here:
//
// This project's backend is Firebase Realtime Database. The ESP32 writes
// straight to it over authenticated HTTPS, and every browser subscribed to
// that path is pushed the change within milliseconds. Inserting a serverless
// function in between would ADD a hop that cannot hold the realtime
// connection open — Vercel functions are request-scoped and cannot keep a
// WebSocket alive — so it would make the system strictly worse.
//
// Validation therefore lives in two places that cannot be bypassed:
//
//   1. Firebase security rules (firebase-rules.json) — enforced server-side
//      by Google. Reject malformed payloads, unknown bin IDs, implausible
//      distances, and any client that is not the device service account.
//
//   2. Normalisation on read (src/lib/telemetry.ts) — the fill percentage
//      shown to a human is ALWAYS recomputed from the raw distance. A device
//      that reports a wrong percentage cannot mislead the dashboard.
//
// This module is used by the development test harness to inject readings
// exactly as a real device would, so the whole chain can be exercised before
// the hardware is wired up.
// ─────────────────────────────────────────────────────────────

import { ref as dbRef, serverTimestamp, update as dbUpdate } from 'firebase/database';
import { db } from '@/lib/firebase';
import {
  getBinConfig,
  isDeviceAuthorisedFor,
  SENSOR_MAX_VALID_CM,
  SENSOR_MIN_VALID_CM,
} from '@/config/devices.config';
import { IS_FIREBASE_CONFIGURED } from '@/config/mode';
import { distanceToFillPercent, fillToBand, isPlausibleDistance } from '@/lib/telemetry';

/** The payload an ESP32 sends. Raw distance only — never a percentage. */
export interface TelemetryPayload {
  deviceId: string;
  binId: string;
  distanceCm: number;
  /** Device-side sensor health. Optional; absence is treated as healthy. */
  sensorOk?: boolean;
  rssi?: number;
  uptimeSec?: number;
  firmware?: string;
}

export type IngestionResult =
  | {
      success: true;
      bin: {
        binId: string;
        deviceId: string;
        distanceCm: number;
        fillPct: number;
        status: string;
      };
    }
  | { success: false; error: string };

/**
 * Validate a telemetry payload against the device registry and sensor limits.
 *
 * Mirrors the Firebase security rules. Running it client-side gives a clear
 * error message; the rules are what actually enforce it.
 */
export function validateTelemetry(payload: Partial<TelemetryPayload>): string | null {
  if (!payload || typeof payload !== 'object') return 'Malformed payload.';

  if (typeof payload.binId !== 'string' || !payload.binId) return 'Missing binId.';
  if (typeof payload.deviceId !== 'string' || !payload.deviceId) return 'Missing deviceId.';

  const config = getBinConfig(payload.binId);
  if (!config) return `Unknown bin "${payload.binId}" — not in the device registry.`;

  if (!isDeviceAuthorisedFor(payload.deviceId, payload.binId)) {
    return `Device "${payload.deviceId}" is not authorised to report for ${payload.binId}.`;
  }

  if (typeof payload.distanceCm !== 'number' || !Number.isFinite(payload.distanceCm)) {
    return 'distanceCm must be a finite number.';
  }

  if (!isPlausibleDistance(payload.distanceCm)) {
    return `distanceCm ${payload.distanceCm} is outside the plausible range ` +
      `${SENSOR_MIN_VALID_CM}–${SENSOR_MAX_VALID_CM} cm.`;
  }

  return null;
}

/**
 * Write one telemetry reading, exactly as the ESP32 does.
 *
 * Writes to /bins/{binId}/live, which every subscribed browser is pushed.
 * The percentage is computed here from the distance rather than trusted from
 * the caller — the same rule the read path applies.
 */
export async function ingestTelemetry(payload: TelemetryPayload): Promise<IngestionResult> {
  const validationError = validateTelemetry(payload);
  if (validationError) return { success: false, error: validationError };

  if (!IS_FIREBASE_CONFIGURED) {
    return { success: false, error: 'Firebase is not configured — cannot write telemetry.' };
  }

  const fillPct = distanceToFillPercent(payload.distanceCm);
  const status = fillToBand(fillPct);

  try {
    await dbUpdate(dbRef(db, `bins/${payload.binId}/live`), {
      deviceId: payload.deviceId,
      distanceCm: Math.round(payload.distanceCm * 10) / 10,
      fillPct,
      sensorOk: payload.sensorOk ?? true,
      rssi: payload.rssi ?? null,
      uptimeSec: payload.uptimeSec ?? null,
      firmware: payload.firmware ?? null,
      // Server clock, so a device with a wrong RTC cannot appear online
      // forever by sending a timestamp far in the future.
      timestamp: serverTimestamp(),
    });

    return {
      success: true,
      bin: {
        binId: payload.binId,
        deviceId: payload.deviceId,
        distanceCm: payload.distanceCm,
        fillPct,
        status,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Report a sensor fault: the ESP32 is alive, the HC-SR04 is not answering.
 *
 * Writes a heartbeat so the device stays ONLINE, but flags the reading as
 * untrustworthy so the UI shows "Sensor error" rather than a stale number or
 * a fabricated 0 %.
 */
export async function reportSensorFault(
  deviceId: string,
  binId: string,
): Promise<IngestionResult> {
  if (!isDeviceAuthorisedFor(deviceId, binId)) {
    return { success: false, error: `Device "${deviceId}" is not authorised for ${binId}.` };
  }
  if (!IS_FIREBASE_CONFIGURED) {
    return { success: false, error: 'Firebase is not configured.' };
  }

  try {
    await dbUpdate(dbRef(db, `bins/${binId}/live`), {
      deviceId,
      sensorOk: false,
      distanceCm: null,
      fillPct: null,
      timestamp: serverTimestamp(),
    });
    return {
      success: true,
      bin: { binId, deviceId, distanceCm: NaN, fillPct: NaN, status: 'SENSOR_ERROR' },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
