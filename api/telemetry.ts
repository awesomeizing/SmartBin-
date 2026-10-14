/**
 * SmartBin+ — /api/telemetry
 * ============================================================
 * Vercel Serverless Function (Node.js runtime).
 *
 * Accepts POST from ESP32 devices carrying raw sensor readings.
 * Validates the payload, calculates fill percentage server-side,
 * writes to Firebase Realtime Database, records history, and
 * raises bin-full alerts (deduplicated).
 *
 * Security:
 *  - Validates X-API-Key header against IOT_DEVICE_API_KEY env var.
 *  - Validates deviceId against the known device→bin mapping.
 *  - Validates binId against the four production bin IDs.
 *  - Validates distanceCm is a finite number.
 *
 * Fill calculation (authoritative, server-side):
 *  fillPct = clamp(((11 - distanceCm) / 8) * 100, 0, 100)
 *
 * Status thresholds:
 *  0–49%   → OK   (Empty)
 *  50–79%  → FILLING
 *  80–100% → FULL
 *
 * Firebase structure written per request:
 *  bins/{binId}/live          ← telemetry + computed fill
 *  bins/{binId}/meta          ← lastSeen, deviceId
 *  history/{binId}/{pushKey}  ← time-series record
 *  devices/{deviceId}         ← device heartbeat
 *  alerts/{alertKey}          ← bin-full alerts (deduplicated)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'node:crypto';
import { getAdminDb, isServerFirebaseConfigured } from './_lib/firebaseAdmin.js';
import { emailAlertSubscribers } from './_lib/alertEmail.js';

// ── Constants (must match ESP32 firmware and frontend hardware.ts) ─────────
const EMPTY_DISTANCE_CM = 11;
const FULL_DISTANCE_CM  = 3;
const SENSOR_MIN_CM = 2;
const SENSOR_MAX_CM = 30;
const OFFLINE_TIMEOUT_MS = 180_000; // 180 s

const VALID_BINS = ['BIN-01', 'BIN-02', 'BIN-03', 'BIN-04'] as const;
type ValidBin = (typeof VALID_BINS)[number];

/** One ESP32 controls all four bins. Map device → bin. */
const DEVICE_BIN_MAP: Record<string, ValidBin> = {
  'ESP32-SMARTBIN-01': 'BIN-01',
  'ESP32-SMARTBIN-02': 'BIN-02',
  'ESP32-SMARTBIN-03': 'BIN-03',
  'ESP32-SMARTBIN-04': 'BIN-04',
};

// ── Normalise bin ID aliases ────────────────────────────────────────────────
function normaliseBinId(raw: string): ValidBin | null {
  const u = raw.toUpperCase().trim();
  if (u === 'BIN-01' || u === 'BIN-001' || u === 'BIN-1' || u === '1') return 'BIN-01';
  if (u === 'BIN-02' || u === 'BIN-002' || u === 'BIN-2' || u === '2') return 'BIN-02';
  if (u === 'BIN-03' || u === 'BIN-003' || u === 'BIN-3' || u === '3') return 'BIN-03';
  if (u === 'BIN-04' || u === 'BIN-004' || u === 'BIN-4' || u === '4') return 'BIN-04';
  return null;
}

// ── Fill calculation (SERVER IS AUTHORITATIVE) ──────────────────────────────
function calculateFillPct(distanceCm: number): number {
  const range = EMPTY_DISTANCE_CM - FULL_DISTANCE_CM; // 8 cm
  const raw   = ((EMPTY_DISTANCE_CM - distanceCm) / range) * 100;
  return Math.round(Math.max(0, Math.min(100, raw)) * 10) / 10;
}

function getStatus(fillPct: number): 'OK' | 'FILLING' | 'FULL' {
  if (fillPct >= 80) return 'FULL';
  if (fillPct >= 50) return 'FILLING';
  return 'OK';
}

function getBinStatus(fillPct: number): 'Empty' | 'Half' | 'Full' {
  if (fillPct >= 80) return 'Full';
  if (fillPct >= 50) return 'Half';
  return 'Empty';
}

function matchesDeviceApiKey(supplied: string | undefined, expected: string): boolean {
  if (!supplied) return false;
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  return suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
}

function parseOptionalNumber(value: unknown, min: number, max: number): number | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return undefined;
  return parsed;
}

// ── Handler ─────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET — health check
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      message: 'SmartBin Telemetry API v1.0',
      ready: isServerFirebaseConfigured() && Boolean(process.env.IOT_DEVICE_API_KEY),
      emailDeliveryConfigured: Boolean(process.env.RESEND_API_KEY && process.env.ALERT_FROM_EMAIL),
      offlineTimeoutSec: OFFLINE_TIMEOUT_MS / 1000,
      calibration: { emptyCm: EMPTY_DISTANCE_CM, fullCm: FULL_DISTANCE_CM },
      supportedBins: VALID_BINS,
      supportedDevices: Object.keys(DEVICE_BIN_MAP),
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // ── API key check ───────────────────────────────────────────────────────
  const iotKey = process.env.IOT_DEVICE_API_KEY;
  if (!iotKey || iotKey.length < 32 || !isServerFirebaseConfigured()) {
    return res.status(503).json({ ok: false, error: 'Telemetry service is not configured.' });
  }
  const supplied = req.headers['x-api-key'] as string | undefined;
  if (!matchesDeviceApiKey(supplied, iotKey)) {
    return res.status(401).json({ ok: false, error: 'Unauthorised — invalid API key' });
  }

  // ── Parse payload ───────────────────────────────────────────────────────
  const body = req.body ?? {};

  const rawDeviceId = (body.deviceId ?? '').toString().trim();
  const rawBinId    = (body.binId    ?? body.id ?? '').toString().trim();
  const distanceCm  = Number(body.distanceCm);
  const serverTs    = Date.now();
  const parsedClientTs = typeof body.timestamp === 'number'
    ? (body.timestamp >= 1_600_000_000_000 ? body.timestamp : NaN)
    : typeof body.timestamp === 'string'
      ? Date.parse(body.timestamp)
      : NaN;
  // ESP32 firmware currently sends millis-since-boot in `timestamp`. Keep the
  // server clock authoritative unless the payload is a plausible epoch time.
  const clientTs = Number.isFinite(parsedClientTs) && parsedClientTs >= 1_600_000_000_000 && parsedClientTs <= serverTs + 300_000
    ? parsedClientTs
    : serverTs;
  const rssi = parseOptionalNumber(body.rssi, -120, 0);
  const batteryPct = parseOptionalNumber(body.batteryPct, 0, 100);
  const uptimeSec = parseOptionalNumber(body.uptimeSec, 0, 1_000_000_000);
  if (rssi === undefined || batteryPct === undefined || uptimeSec === undefined) {
    return res.status(400).json({ ok: false, error: 'Optional rssi, batteryPct, or uptimeSec telemetry is out of range.' });
  }

  // ── Validate deviceId ────────────────────────────────────────────────────
  const normalisedDeviceId = rawDeviceId.toUpperCase().trim();
  if (!DEVICE_BIN_MAP[normalisedDeviceId]) {
    return res.status(400).json({
      ok: false,
      error: `Unknown deviceId "${rawDeviceId}". Expected one of: ${Object.keys(DEVICE_BIN_MAP).join(', ')}`,
    });
  }

  // ── Validate binId ───────────────────────────────────────────────────────
  const binId = normaliseBinId(rawBinId);
  if (!binId) {
    return res.status(400).json({
      ok: false,
      error: `Unknown binId "${rawBinId}". Expected: BIN-01 … BIN-04`,
    });
  }

  // Cross-check device→bin mapping
  const expectedBin = DEVICE_BIN_MAP[normalisedDeviceId];
  if (expectedBin !== binId) {
    return res.status(400).json({
      ok: false,
      error: `deviceId "${rawDeviceId}" is not authorised to write to "${binId}" (expected "${expectedBin}")`,
    });
  }

  // ── Validate distanceCm ──────────────────────────────────────────────────
  if (!isFinite(distanceCm) || distanceCm < 0) {
    return res.status(400).json({
      ok: false,
      error: `Invalid distanceCm: "${body.distanceCm}". Must be a non-negative finite number.`,
    });
  }
  if (distanceCm < SENSOR_MIN_CM || distanceCm > SENSOR_MAX_CM) {
    return res.status(400).json({
      ok: false,
      error: `Invalid sensor range: distanceCm must be between ${SENSOR_MIN_CM} and ${SENSOR_MAX_CM} cm.`,
    });
  }

  // ── Compute fill (server is authoritative) ───────────────────────────────
  const fillPct    = calculateFillPct(distanceCm);
  const status     = getStatus(fillPct);
  const binStatus  = getBinStatus(fillPct);

  // ── Write to Firebase ────────────────────────────────────────────────────
  try {
    const db = getAdminDb();

    const liveRecord = {
      distanceCm     : Math.round(distanceCm * 10) / 10,
      fillPct,
      binStatus,
      messageStatus  : 'Delivered',
      rssi,
      batteryPct,
      uptimeSec,
      firmware       : body.firmware   ?? null,
      timestamp      : serverTs,
      clientTimestamp: isFinite(clientTs) ? clientTs : serverTs,
    };

    const historyRecord = {
      distanceCm  : liveRecord.distanceCm,
      fillPct,
      binStatus,
      timestamp   : serverTs,
    };

    const deviceRecord = {
      deviceId      : normalisedDeviceId,
      binId,
      lastSeen      : serverTs,
      rssi          : liveRecord.rssi,
      firmware      : liveRecord.firmware,
      uptimeSec     : liveRecord.uptimeSec,
    };

    const writes: Record<string, unknown> = {
      [`bins/${binId}/live`]       : liveRecord,
      [`bins/${binId}/meta/lastSeen`]   : serverTs,
      [`bins/${binId}/meta/deviceId`]   : normalisedDeviceId,
      [`bins/${binId}/meta/source`]     : 'device',
      [`bins/${binId}/health/sensorOk`] : true,
      [`bins/${binId}/health/wifiOk`]   : true,
      [`devices/${normalisedDeviceId}`] : deviceRecord,
    };

    // Give a newly connected physical bin usable metadata without inventing
    // a GPS position. An operator can add its surveyed coordinates later.
    const metaRef = db.ref(`bins/${binId}/meta`);
    const existingMeta = await metaRef.once('value');
    if (!existingMeta.exists()) {
      writes[`bins/${binId}/meta`] = {
        binId,
        label: binId.replace('-', ' '),
        zone: 'Unassigned',
        address: 'Location not configured',
        location: { lat: 0, lng: 0 },
        depthCm: EMPTY_DISTANCE_CM,
        thresholdPct: 80,
        source: 'device',
        installedAt: serverTs,
        capacity: 0,
        deviceId: normalisedDeviceId,
        lastSeen: serverTs,
      };
    }

    // ── Deduplicated FULL alert ─────────────────────────────────────────
    // Only raise a new alert if the bin just crossed 80% from below.
    // Read existing alert state before writing (one extra read, acceptable).
    let newAlert: BinAlertPayload | null = null;
    if (status === 'FULL') {
      const alertRef = db.ref(`alerts`);
      const existing = await alertRef
        .orderByChild('binId')
        .equalTo(binId)
        .once('value');

      let hasPendingAlert = false;
      existing.forEach(child => {
        const a = child.val();
        if (a.type === 'bin_full' && a.state === 'active') {
          hasPendingAlert = true;
        }
      });

      if (!hasPendingAlert) {
        const alertKey = `alert-${binId}-${serverTs}`;
        newAlert = {
          id             : alertKey,
          binId,
          binLabel       : binId.replace('-', ' '),
          severity       : 'critical',
          type           : 'bin_full',
          message        : `${binId} reached ${fillPct}% — collection required.`,
          fillPct,
          distanceCm: liveRecord.distanceCm,
          raisedAt       : serverTs,
          acknowledgedBy : null,
          acknowledgedAt : null,
          resolvedAt     : null,
          state          : 'active',
        };
        writes[`alerts/${alertKey}`] = newAlert;
      }
    }

    // Write all atomically
    await db.ref().update(writes);

    // Append history separately (push generates a new child key)
    await db.ref(`history/${binId}`).push(historyRecord);

    let emailDelivery = { sent: 0, failed: 0, skipped: 'no_new_alert' as string | null };
    if (newAlert) {
      try {
        emailDelivery = await emailAlertSubscribers(db, newAlert);
        await db.ref(`alerts/${newAlert.id}/emailDelivery`).set({
          ...emailDelivery,
          attemptedAt: Date.now(),
        });
      } catch (emailError) {
        emailDelivery = { sent: 0, failed: 1, skipped: 'delivery_error' };
        console.error('[telemetry] alert email delivery failed', emailError instanceof Error ? emailError.message : 'unknown error');
      }
    }

    return res.status(200).json({
      ok: true,
      binId,
      deviceId    : normalisedDeviceId,
      distanceCm  : liveRecord.distanceCm,
      fillPct,
      status,
      binStatus,
      emailDelivery,
      serverTimestamp: serverTs,
    });

  } catch (err: unknown) {
    console.error('[telemetry] Firebase write error:', err);
    return res.status(500).json({
      ok: false,
      error: 'Internal server error — Firebase write failed',
    });
  }
}

interface BinAlertPayload {
  id: string;
  binId: string;
  binLabel: string;
  severity: string;
  type: string;
  message: string;
  fillPct: number;
  distanceCm: number;
  raisedAt: number;
  acknowledgedBy: null;
  acknowledgedAt: null;
  resolvedAt: null;
  state: 'active';
}
