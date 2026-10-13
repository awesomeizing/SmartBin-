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
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

// ── Constants (must match ESP32 firmware and frontend hardware.ts) ─────────
const EMPTY_DISTANCE_CM = 11;
const FULL_DISTANCE_CM  = 3;
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

// ── Firebase Admin init (lazy singleton) ────────────────────────────────────
function getDb() {
  if (getApps().length === 0) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
      : undefined;

    if (serviceAccount) {
      initializeApp({
        credential: cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL,
      });
    } else {
      // Fallback: use FIREBASE_DATABASE_URL + env-based auth (for local dev)
      initializeApp({ databaseURL: process.env.FIREBASE_DATABASE_URL });
    }
  }
  return getDatabase();
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
  if (iotKey) {
    const supplied = req.headers['x-api-key'] as string | undefined;
    if (supplied !== iotKey) {
      return res.status(401).json({ ok: false, error: 'Unauthorised — invalid API key' });
    }
  }

  // ── Parse payload ───────────────────────────────────────────────────────
  const body = req.body ?? {};

  const rawDeviceId = (body.deviceId ?? '').toString().trim();
  const rawBinId    = (body.binId    ?? body.id ?? '').toString().trim();
  const distanceCm  = Number(body.distanceCm);
  const clientTs    = body.timestamp ? new Date(body.timestamp).getTime() : Date.now();
  const serverTs    = Date.now();

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

  // ── Compute fill (server is authoritative) ───────────────────────────────
  const fillPct    = calculateFillPct(distanceCm);
  const status     = getStatus(fillPct);
  const binStatus  = getBinStatus(fillPct);

  // ── Write to Firebase ────────────────────────────────────────────────────
  try {
    const db = getDb();

    const liveRecord = {
      distanceCm     : Math.round(distanceCm * 10) / 10,
      fillPct,
      binStatus,
      messageStatus  : 'Delivered',
      rssi           : body.rssi   !== undefined ? Number(body.rssi)        : null,
      batteryPct     : body.batteryPct !== undefined ? Number(body.batteryPct) : null,
      uptimeSec      : body.uptimeSec  !== undefined ? Number(body.uptimeSec)  : null,
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
      [`devices/${normalisedDeviceId}`] : deviceRecord,
    };

    // ── Deduplicated FULL alert ─────────────────────────────────────────
    // Only raise a new alert if the bin just crossed 80% from below.
    // Read existing alert state before writing (one extra read, acceptable).
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
        writes[`alerts/${alertKey}`] = {
          id             : alertKey,
          binId,
          binLabel       : binId.replace('-', ' '),
          severity       : 'critical',
          type           : 'bin_full',
          message        : `${binId} reached ${fillPct}% — collection required.`,
          raisedAt       : serverTs,
          acknowledgedBy : null,
          acknowledgedAt : null,
          resolvedAt     : null,
          state          : 'active',
        };
      }
    }

    // Write all atomically
    await db.ref().update(writes);

    // Append history separately (push generates a new child key)
    await db.ref(`history/${binId}`).push(historyRecord);

    return res.status(200).json({
      ok: true,
      binId,
      deviceId    : normalisedDeviceId,
      distanceCm  : liveRecord.distanceCm,
      fillPct,
      status,
      binStatus,
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
