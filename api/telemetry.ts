import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const EMPTY_DISTANCE_CM = 11;
const FULL_DISTANCE_CM = 3;
const OFFLINE_AFTER_MS = 180_000;
const BIN_IDS = new Set(['BIN-01', 'BIN-02', 'BIN-03', 'BIN-04']);
const CONTROLLER_DEVICE_IDS = new Set(['ESP32-SMARTBIN-01', 'ESP32-SMARTBIN-02', 'ESP32-SMARTBIN-03', 'ESP32-SMARTBIN-04']);

function getDb() {
  if (!getApps().length) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccount || !process.env.FIREBASE_DATABASE_URL) throw new Error('Firebase server environment is not configured');
    initializeApp({ credential: cert(JSON.parse(serviceAccount)), databaseURL: process.env.FIREBASE_DATABASE_URL });
  }
  return getDatabase();
}

function fillFromDistance(distanceCm: number) {
  const fill = ((EMPTY_DISTANCE_CM - distanceCm) / (EMPTY_DISTANCE_CM - FULL_DISTANCE_CM)) * 100;
  return Math.max(0, Math.min(100, Math.round(fill * 10) / 10));
}

function statusForFill(fillPct: number) {
  if (fillPct >= 80) return 'Full';
  if (fillPct >= 50) return 'Half';
  return 'Empty';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const deviceId = String(body.deviceId || '');
    const binId = String(body.binId || '');
    const distanceCm = Number(body.distanceCm);
    const providedKey = String(req.headers['x-device-key'] || '');
    const expectedKey = process.env.IOT_DEVICE_API_KEY || '';

    if (!expectedKey || !providedKey || providedKey !== expectedKey || !CONTROLLER_DEVICE_IDS.has(deviceId)) return res.status(401).json({ ok: false, error: 'Unauthorized device' });
    if (!BIN_IDS.has(binId)) return res.status(400).json({ ok: false, error: 'Invalid binId' });
    if (!Number.isFinite(distanceCm) || distanceCm < 0 || distanceCm > 400) return res.status(400).json({ ok: false, error: 'Invalid distanceCm' });

    const now = Date.now();
    const fillPct = fillFromDistance(distanceCm);
    const status = statusForFill(fillPct);
    const db = getDb();
    const base = db.ref(`bins/${binId}`);
    const previous = (await base.once('value')).val() || {};
    const wasFull = Number(previous?.live?.fillPct || 0) >= 80;

    const live = {
      ...(previous.live || {}), distanceCm, fillPct, binStatus: status, messageStatus: 'Delivered',
      rssi: Number.isFinite(Number(body.rssi)) ? Number(body.rssi) : Number(previous?.live?.rssi || 0),
      batteryPct: Number.isFinite(Number(body.batteryPct)) ? Number(body.batteryPct) : Number(previous?.live?.batteryPct || 0),
      uptimeSec: Number.isFinite(Number(body.uptimeSec)) ? Number(body.uptimeSec) : Number(previous?.live?.uptimeSec || 0),
      firmware: String(body.firmware || previous?.live?.firmware || 'unknown'), timestamp: now,
    };

    await base.update({ meta: { ...(previous.meta || {}), binId, deviceId, depthCm: EMPTY_DISTANCE_CM, thresholdPct: 80, source: 'device' }, live, health: { ...(previous.health || {}), sensorOk: true, wifiOk: true, healthScore: 100 }, lastSeen: now });
    await db.ref(`history/${binId}`).push({ fillPct, distanceCm, binStatus: status, timestamp: now });
    await db.ref(`devices/${deviceId}`).update({ online: true, lastSeen: now, bins: { ...(previous?.devices || {}), [binId]: true } });

    if (fillPct >= 80 && !wasFull) await db.ref('alerts').push({ binId, binLabel: `Smart Bin ${binId.slice(-2)}`, severity: 'critical', type: 'bin_full', message: `${binId} has reached ${fillPct}% — collection required`, raisedAt: now, acknowledgedBy: null, acknowledgedAt: null, resolvedAt: null, state: 'active' });
    return res.status(200).json({ ok: true, binId, deviceId, distanceCm, fillPct, status, lastSeen: now, offlineAfterMs: OFFLINE_AFTER_MS });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: 'Telemetry processing failed' });
  }
}
