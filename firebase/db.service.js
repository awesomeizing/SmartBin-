/**
 * SmartBin+ — Database Service
 * =============================================================================
 * Typed read and write wrappers over the Realtime Database.
 *
 * Feature code never touches raw Firebase refs. Everything goes through these
 * functions, which means the schema is described in one place and a structural
 * change is a single-file edit rather than a hunt through the codebase.
 *
 * Writes that fail while offline are handed to the connection queue rather
 * than thrown away — an operator's alert acknowledgement should survive a
 * dropped Wi-Fi connection.
 *
 * @module firebase/db.service
 */

import { getFirebaseDb, getSdk, isInDemoMode } from './init.js';
import { queueWrite } from './connection.js';
import { get as getState } from '../js/core/store.js';
import {
  DB_PATH, ConnectionState, DataSource, EventKind,
  AlertState,
} from '../config/constants.js';
import { THRESHOLDS, SENSOR, DEPLOYMENT, UI } from '../config/app.config.js';
import { calculateFillPercent, classifyFillStatus } from '../js/utils/fill.js';

/* ---------------------------------------------------------------------------
 * PRIMITIVES
 * ------------------------------------------------------------------------- */

/**
 * Read a path once.
 * @param {string} path
 * @returns {Promise<any>} The value, or null.
 */
export async function readOnce(path) {
  if (isInDemoMode()) return null;

  const db = getFirebaseDb();
  const { db: sdk } = getSdk();

  const snapshot = await sdk.get(sdk.ref(db, path));
  return snapshot.exists() ? snapshot.val() : null;
}

/**
 * Write a value, replacing whatever is there.
 *
 * If the connection is down the write is queued for replay rather than
 * failing silently.
 *
 * @param {string} path
 * @param {any} value
 * @returns {Promise<void>}
 */
export async function write(path, value) {
  if (isInDemoMode()) {
    console.debug('[db:demo] write (no-op):', path);
    return;
  }

  if (getState('connection').state === ConnectionState.OFFLINE) {
    queueWrite(path, value);
    return;
  }

  const db = getFirebaseDb();
  const { db: sdk } = getSdk();

  try {
    await sdk.set(sdk.ref(db, path), value);
  } catch (err) {
    console.error('[db] write failed, queuing for retry:', path, err);
    queueWrite(path, value);
    throw err;
  }
}

/**
 * Merge fields into an existing node, leaving siblings untouched.
 * @param {string} path
 * @param {object} updates
 * @returns {Promise<void>}
 */
export async function update(path, updates) {
  if (isInDemoMode()) {
    console.debug('[db:demo] update (no-op):', path);
    return;
  }

  const db = getFirebaseDb();
  const { db: sdk } = getSdk();

  try {
    await sdk.update(sdk.ref(db, path), updates);
  } catch (err) {
    console.error('[db] update failed:', path, err);
    throw err;
  }
}

/**
 * Append to a list, letting Firebase generate a chronologically-sortable key.
 * @param {string} path
 * @param {any} value
 * @returns {Promise<string>} The generated key.
 */
export async function push(path, value) {
  if (isInDemoMode()) {
    console.debug('[db:demo] push (no-op):', path);
    return `demo-${Date.now()}`;
  }

  const db = getFirebaseDb();
  const { db: sdk } = getSdk();

  const reference = sdk.push(sdk.ref(db, path));
  await sdk.set(reference, value);
  return reference.key;
}

/**
 * @param {string} path
 * @returns {Promise<void>}
 */
export async function remove(path) {
  if (isInDemoMode()) {
    console.debug('[db:demo] remove (no-op):', path);
    return;
  }

  const db = getFirebaseDb();
  const { db: sdk } = getSdk();
  await sdk.remove(sdk.ref(db, path));
}

/**
 * Firebase server timestamp sentinel.
 *
 * Always prefer this over `Date.now()` for anything that will be compared
 * across devices. An ESP32 with a drifting clock and a browser in another
 * timezone must agree on ordering, and only the server can guarantee that.
 *
 * @returns {object}
 */
export function serverTimestamp() {
  const { db: sdk } = getSdk();
  return sdk.serverTimestamp();
}

/* ---------------------------------------------------------------------------
 * BINS
 * ------------------------------------------------------------------------- */

/**
 * Register a new bin.
 *
 * Bins are created as PLACEHOLDER and flip to DEVICE automatically on their
 * first real ESP32 write (see {@link writeBinTelemetry}). No code change is
 * needed when hardware arrives — that is the point of the provenance system.
 *
 * @param {object} config
 * @param {string} config.binId
 * @param {string} config.label
 * @param {string} config.zone
 * @param {string} [config.address]
 * @param {{lat: number, lng: number}} [config.location]
 * @param {number} [config.depthCm]
 * @param {number} [config.thresholdPct]
 * @param {string} [config.source]
 * @returns {Promise<void>}
 */
export async function registerBin({
  binId,
  label,
  zone,
  address = '',
  location = DEPLOYMENT.CAMPUS_CENTER,
  depthCm = SENSOR.DEFAULT_DEPTH_CM,
  thresholdPct = THRESHOLDS.ALERT_PCT,
  source = DEPLOYMENT.INITIAL_SOURCE,
}) {
  await write(DB_PATH.binMeta(binId), {
    binId,
    label,
    zone,
    address,
    location: {
      lat: location.lat,
      lng: location.lng,
      // Coordinates are administrator-assigned, not device-reported — the
      // ESP32 has no GPS module. Report §1.3 places GPS in Phase-II.
      source: 'manual',
    },
    depthCm,
    thresholdPct,
    source,
    installedAt: Date.now(),
  });

  await logEvent({
    kind: EventKind.DB_UPDATED,
    binId,
    detail: `Bin ${binId} registered in zone ${zone}`,
  });
}

/**
 * Write a telemetry reading.
 *
 * Derives fillPct and binStatus from the raw distance rather than trusting
 * whatever the caller supplied, so the dashboard and the firmware can never
 * disagree about what a distance means.
 *
 * @param {string} binId
 * @param {object} reading
 * @param {number} reading.distanceCm
 * @param {number} [reading.batteryPct]
 * @param {number} [reading.rssi]
 * @param {number} [reading.uptimeSec]
 * @param {string} [reading.firmware]
 * @param {number} [depthCm]
 * @param {boolean} [markAsDevice=false]  Set true when a real ESP32 wrote this.
 * @returns {Promise<void>}
 */
export async function writeBinTelemetry(binId, reading, depthCm, markAsDevice = false) {
  const depth = depthCm ?? SENSOR.DEFAULT_DEPTH_CM;
  const fillPct = calculateFillPercent(reading.distanceCm, depth);
  const binStatus = classifyFillStatus(fillPct);

  await write(DB_PATH.binLive(binId), {
    distanceCm: reading.distanceCm,
    fillPct,
    binStatus,
    messageStatus: 'Delivered',
    batteryPct: reading.batteryPct ?? null,
    rssi: reading.rssi ?? null,
    uptimeSec: reading.uptimeSec ?? null,
    firmware: reading.firmware ?? null,
    timestamp: serverTimestamp(),
  });

  // Promote a placeholder bin to a live device on its first real reading.
  if (markAsDevice) {
    const currentSource = await readOnce(`${DB_PATH.binMeta(binId)}/source`);
    if (currentSource !== DataSource.DEVICE) {
      await update(DB_PATH.binMeta(binId), { source: DataSource.DEVICE });
    }
  }

  await appendHistory(binId, { fillPct, distanceCm: reading.distanceCm, binStatus });
}

/**
 * @param {string} binId
 * @param {object} health
 * @returns {Promise<void>}
 */
export async function writeBinHealth(binId, health) {
  await update(DB_PATH.binHealth(binId), { ...health, updatedAt: Date.now() });
}

/**
 * Update registration metadata — label, zone, coordinates, threshold.
 * @param {string} binId
 * @param {object} updates
 * @returns {Promise<void>}
 */
export async function updateBinMeta(binId, updates) {
  await update(DB_PATH.binMeta(binId), updates);
  await logEvent({
    kind: EventKind.CONFIG_CHANGED,
    binId,
    detail: `Metadata updated: ${Object.keys(updates).join(', ')}`,
  });
}

/** @param {string} binId @returns {Promise<void>} */
export async function deleteBin(binId) {
  await remove(DB_PATH.bin(binId));
  await remove(DB_PATH.history(binId));
}

/* ---------------------------------------------------------------------------
 * HISTORY
 * ------------------------------------------------------------------------- */

/**
 * Append a history record.
 *
 * History is append-only and never edited. It backs the analytics charts and
 * the fill-rate projection, both of which become meaningless if past readings
 * can be rewritten.
 *
 * @param {string} binId
 * @param {{fillPct: number, distanceCm: number, binStatus: string}} record
 * @returns {Promise<string>}
 */
export async function appendHistory(binId, record) {
  return push(DB_PATH.history(binId), { ...record, timestamp: Date.now() });
}

/**
 * Read recent history for a bin, oldest first.
 *
 * @param {string} binId
 * @param {number} [limit]
 * @returns {Promise<Array<object>>}
 */
export async function readHistory(binId, limit = UI.HISTORY_FETCH_LIMIT) {
  const db = getFirebaseDb();
  const { db: sdk } = getSdk();

  const q = sdk.query(
    sdk.ref(db, DB_PATH.history(binId)),
    sdk.orderByChild('timestamp'),
    sdk.limitToLast(limit)
  );

  const snapshot = await sdk.get(q);
  if (!snapshot.exists()) return [];

  return Object.entries(snapshot.val())
    .map(([id, value]) => ({ id, ...value }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

/* ---------------------------------------------------------------------------
 * ALERTS
 * ------------------------------------------------------------------------- */

/**
 * Raise an alert.
 *
 * Deduplicates: if an unresolved alert of the same type already exists for
 * the bin, nothing new is created. Without this, a bin sitting at 82% would
 * generate a fresh critical alert every sixty seconds and the alert centre
 * would become unusable within an hour.
 *
 * @param {object} alert
 * @param {string} alert.binId
 * @param {string} alert.type       From AlertType.*
 * @param {string} alert.severity   From AlertSeverity.*
 * @param {string} alert.message
 * @returns {Promise<string|null>} Alert ID, or null if suppressed as duplicate.
 */
export async function raiseAlert({ binId, type, severity, message }) {
  const existing = await findActiveAlert(binId, type);
  if (existing) return null;

  const alertId = await push(DB_PATH.ALERTS, {
    binId,
    type,
    severity,
    message,
    state: AlertState.ACTIVE,
    raisedAt: Date.now(),
    acknowledgedBy: null,
    acknowledgedAt: null,
    resolvedAt: null,
  });

  await logEvent({
    kind: EventKind.NOTIFICATION_SENT,
    binId,
    detail: `${severity.toUpperCase()}: ${message}`,
  });

  return alertId;
}

/**
 * @param {string} binId
 * @param {string} type
 * @returns {Promise<object|null>}
 */
async function findActiveAlert(binId, type) {
  const all = await readOnce(DB_PATH.ALERTS);
  if (!all) return null;

  const match = Object.entries(all).find(
    ([, a]) => a.binId === binId && a.type === type && a.state !== AlertState.RESOLVED
  );

  return match ? { alertId: match[0], ...match[1] } : null;
}

/**
 * Acknowledge an alert — an operator has seen it and is acting.
 * @param {string} alertId
 * @param {string} uid
 * @returns {Promise<void>}
 */
export async function acknowledgeAlert(alertId, uid) {
  await update(DB_PATH.alert(alertId), {
    state: AlertState.ACKNOWLEDGED,
    acknowledgedBy: uid,
    acknowledgedAt: Date.now(),
  });

  await logEvent({
    kind: EventKind.ALERT_ACKNOWLEDGED,
    detail: `Alert ${alertId} acknowledged`,
    actor: uid,
  });
}

/**
 * @param {string} alertId
 * @param {string} [reason]
 * @returns {Promise<void>}
 */
export async function resolveAlert(alertId, reason = 'Condition cleared') {
  await update(DB_PATH.alert(alertId), {
    state: AlertState.RESOLVED,
    resolvedAt: Date.now(),
    resolution: reason,
  });
}

/**
 * Resolve every open alert for a bin. Called after a collection.
 * @param {string} binId
 * @returns {Promise<number>} Count resolved.
 */
export async function resolveAlertsForBin(binId) {
  const all = await readOnce(DB_PATH.ALERTS);
  if (!all) return 0;

  const open = Object.entries(all).filter(
    ([, a]) => a.binId === binId && a.state !== AlertState.RESOLVED
  );

  await Promise.all(
    open.map(([id]) => resolveAlert(id, 'Bin collected'))
  );

  return open.length;
}

/* ---------------------------------------------------------------------------
 * EVENTS / TIMELINE
 * ------------------------------------------------------------------------- */

/**
 * Append an audit-trail event.
 *
 * Corresponds to data store "D2 Logs & History" in report §4.3.2. The
 * security rules make this append-only: clients can add entries but cannot
 * edit or delete them, which is what makes it an audit trail rather than
 * just a list.
 *
 * @param {object} event
 * @param {string} event.kind      From EventKind.*
 * @param {string} [event.binId]
 * @param {string} event.detail
 * @param {string} [event.actor]
 * @returns {Promise<string>}
 */
export async function logEvent({ kind, binId = null, detail, actor = null }) {
  return push(DB_PATH.EVENTS, {
    kind,
    binId,
    detail,
    actor: actor ?? getState('auth').uid ?? 'system',
    timestamp: Date.now(),
  });
}

/* ---------------------------------------------------------------------------
 * TRUCKS & ROUTES
 * ------------------------------------------------------------------------- */

/**
 * @param {string} truckId
 * @param {object} truck
 * @returns {Promise<void>}
 */
export async function upsertTruck(truckId, truck) {
  await update(DB_PATH.truck(truckId), truck);
}

/**
 * @param {object} route
 * @returns {Promise<string>}
 */
export async function saveRoute(route) {
  return push(DB_PATH.ROUTES, { ...route, createdAt: Date.now() });
}

/* ---------------------------------------------------------------------------
 * CONFIG
 * ------------------------------------------------------------------------- */

/**
 * @returns {Promise<object>}
 */
export async function readConfig() {
  return (await readOnce(DB_PATH.CONFIG)) ?? {};
}

/**
 * Administrator-only; enforced by the security rules.
 * @param {object} updates
 * @returns {Promise<void>}
 */
export async function updateConfig(updates) {
  await update(DB_PATH.CONFIG, updates);
  await logEvent({
    kind: EventKind.CONFIG_CHANGED,
    detail: `Configuration updated: ${Object.entries(updates)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')}`,
  });
}

/* ---------------------------------------------------------------------------
 * USERS
 * ------------------------------------------------------------------------- */

/**
 * @param {string} uid
 * @param {object} profile
 * @returns {Promise<void>}
 */
export async function upsertUser(uid, profile) {
  await update(DB_PATH.user(uid), profile);
}

/**
 * @returns {Promise<Array<object>>}
 */
export async function listUsers() {
  const all = await readOnce(DB_PATH.USERS);
  if (!all) return [];
  return Object.entries(all).map(([uid, profile]) => ({ uid, ...profile }));
}

export default {
  readOnce, write, update, push, remove, serverTimestamp,
  registerBin, writeBinTelemetry, writeBinHealth, updateBinMeta, deleteBin,
  appendHistory, readHistory,
  raiseAlert, acknowledgeAlert, resolveAlert, resolveAlertsForBin,
  logEvent, upsertTruck, saveRoute,
  readConfig, updateConfig, upsertUser, listUsers,
};
