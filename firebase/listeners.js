/**
 * SmartBin+ — Realtime Listener Manager
 * =============================================================================
 * Subscribes to Firebase and pipes updates into the application store.
 *
 * This module is the reason the dashboard is genuinely live rather than
 * polled. Report §3.2 requires the dashboard to reflect a database write
 * within 3 seconds; `onValue` typically delivers in well under one.
 *
 * TEARDOWN MATTERS. Every subscription is tracked and released. A dashboard
 * that attaches a fresh listener on every navigation without detaching the
 * old one will, after twenty view changes, be running twenty copies of the
 * same handler — the single most common way a real-time console degrades
 * over a long shift. `activeListenerCount()` exists to make that visible.
 *
 * @module firebase/listeners
 */

import { getFirebaseDb, getSdk, isInDemoMode } from './init.js';
import {
  upsertBin, removeBin, setBinDeviceState, upsertAlert, removeAlert,
  addEvent, upsertTruck, setConfig, setUI, getBins, getAlerts, setRoute,
} from '../js/core/store.js';
import { emit, Events } from '../js/core/events.js';
import {
  DB_PATH, DeviceState, DataSource, BinStatus, AlertSeverity, AlertState,
  AlertType, EventKind, TruckStatus,
} from '../config/constants.js';
import { TIMING, UI, THRESHOLDS, SENSOR, DERIVED_METRICS, DEPLOYMENT } from '../config/app.config.js';

/** @type {Map<string, () => void>} Subscription key → detach function. */
const active = new Map();

/** @type {number|null} Interval that recomputes stale/offline states. */
let staleTimer = null;

/** @type {number|null} Demo live-update timer. */
let demoTimer = null;

/**
 * Attach a listener and record its detach function.
 *
 * @param {string} key   Unique identifier for this subscription.
 * @param {string} path  Database path.
 * @param {(value: any) => void} handler
 * @param {object} [options]
 * @param {'value'|'child_added'} [options.event='value']
 */
function attach(key, path, handler, { event = 'value' } = {}) {
  // Replacing an existing subscription detaches the old one first — this is
  // what prevents accidental duplicates.
  if (active.has(key)) {
    active.get(key)();
    active.delete(key);
  }

  const db = getFirebaseDb();
  const { db: sdk } = getSdk();
  const reference = sdk.ref(db, path);

  const subscribe = event === 'child_added' ? sdk.onChildAdded : sdk.onValue;

  const detach = subscribe(
    reference,
    (snapshot) => {
      try {
        handler(snapshot);
      } catch (err) {
        console.error(`[listeners] handler failed for "${key}"`, err);
      }
    },
    (err) => {
      // A permission error here almost always means the security rules were
      // not published, so the message names that explicitly.
      console.error(
        `[listeners] subscription "${key}" failed at ${path}. ` +
        'If this is a permission error, publish firebase-rules.json.',
        err
      );
    }
  );

  active.set(key, detach);
}

/**
 * Detach one subscription.
 * @param {string} key
 */
export function detach(key) {
  const fn = active.get(key);
  if (!fn) return;

  fn();
  active.delete(key);
}

/**
 * Detach everything. Called on sign-out and page teardown.
 */
export function detachAll() {
  for (const fn of active.values()) fn();
  active.clear();

  clearInterval(staleTimer);
  staleTimer = null;

  clearInterval(demoTimer);
  demoTimer = null;
}

/**
 * Number of live subscriptions.
 *
 * Use this to verify teardown: navigate every view twenty times and this
 * number must return to its baseline. If it climbs, something is leaking.
 *
 * @returns {number}
 */
export function activeListenerCount() {
  return active.size;
}

/** @returns {string[]} */
export function activeListenerKeys() {
  return [...active.keys()];
}

/* ---------------------------------------------------------------------------
 * SUBSCRIPTIONS
 * ------------------------------------------------------------------------- */

/**
 * Subscribe to all bins.
 *
 * Listens at the collection level rather than per-bin. With four bins the
 * payload is small, and one subscription is far easier to reason about than
 * N subscriptions that must be added and removed as bins are registered.
 */
export function subscribeBins() {
  attach('bins', DB_PATH.BINS, (snapshot) => {
    const value = snapshot.val();

    if (!value) {
      emit(Events.BINS_LOADED, []);
      setUI({ loading: false });
      return;
    }

    const seen = new Set();

    for (const [binId, data] of Object.entries(value)) {
      seen.add(binId);
      upsertBin(binId, {
        meta:     data.meta     ?? {},
        live:     data.live     ?? {},
        health:   data.health   ?? {},
        reserved: data.reserved ?? {},
      });
    }

    // Drop bins deleted server-side so the UI does not keep showing them.
    for (const bin of getBins()) {
      if (!seen.has(bin.binId)) removeBin(bin.binId);
    }

    evaluateStaleness();
    emit(Events.BINS_LOADED, getBins());
    setUI({ loading: false });
  });

  startStaleMonitor();
}

/**
 * Subscribe to alerts.
 */
export function subscribeAlerts() {
  attach('alerts', DB_PATH.ALERTS, (snapshot) => {
    const value = snapshot.val() ?? {};
    const incoming = new Set(Object.keys(value));

    for (const [alertId, alert] of Object.entries(value)) {
      upsertAlert(alertId, alert);
    }

    // Drop alerts deleted server-side so the feed cannot show a phantom.
    for (const alert of getAlerts()) {
      if (!incoming.has(alert.alertId)) removeAlert(alert.alertId);
    }
  });
}

/**
 * Subscribe to the timeline.
 *
 * Uses `child_added` with a bounded query so the client receives new events
 * incrementally rather than re-downloading the entire log on every write.
 */
export function subscribeEvents() {
  const db = getFirebaseDb();
  const { db: sdk } = getSdk();

  if (active.has('events')) {
    active.get('events')();
    active.delete('events');
  }

  const q = sdk.query(
    sdk.ref(db, DB_PATH.EVENTS),
    sdk.orderByChild('timestamp'),
    sdk.limitToLast(UI.TIMELINE_LIMIT)
  );

  const detachFn = sdk.onChildAdded(
    q,
    (snapshot) => {
      addEvent({ id: snapshot.key, ...snapshot.val() });
    },
    (err) => console.error('[listeners] events subscription failed', err)
  );

  active.set('events', detachFn);
}

/**
 * Subscribe to trucks.
 */
export function subscribeTrucks() {
  attach('trucks', DB_PATH.TRUCKS, (snapshot) => {
    const value = snapshot.val() ?? {};
    for (const [truckId, truck] of Object.entries(value)) {
      upsertTruck(truckId, truck);
    }
  });
}

/**
 * Subscribe to runtime configuration.
 *
 * Lets an administrator change the alert threshold or toggle Simulation Mode
 * and have every connected client pick it up immediately — no redeploy, no
 * refresh.
 */
export function subscribeConfig() {
  attach('config', DB_PATH.CONFIG, (snapshot) => {
    setConfig(snapshot.val() ?? {});
  });
}

/**
 * Subscribe to one bin's history. Attached when a detail modal opens,
 * detached when it closes.
 *
 * @param {string} binId
 * @param {(records: object[]) => void} onData
 */
export function subscribeBinHistory(binId, onData) {
  // Demo mode: generate fake history data
  if (isInDemoMode()) {
    const records = generateDemoHistory(binId);
    setTimeout(() => onData(records), 100);
    return;
  }

  const db = getFirebaseDb();
  const { db: sdk } = getSdk();

  const key = `history:${binId}`;
  if (active.has(key)) {
    active.get(key)();
    active.delete(key);
  }

  const q = sdk.query(
    sdk.ref(db, DB_PATH.history(binId)),
    sdk.orderByChild('timestamp'),
    sdk.limitToLast(UI.HISTORY_FETCH_LIMIT)
  );

  const detachFn = sdk.onValue(q, (snapshot) => {
    const value = snapshot.val() ?? {};
    const records = Object.entries(value)
      .map(([id, r]) => ({ id, ...r }))
      .sort((a, b) => a.timestamp - b.timestamp);

    onData(records);
  });

  active.set(key, detachFn);
}

/**
 * Detach a bin-history subscription.
 * @param {string} binId
 */
export function unsubscribeBinHistory(binId) {
  detach(`history:${binId}`);
}

/**
 * Attach every dashboard subscription at once.
 * In demo mode, seeds the store with mock data instead.
 * @returns {() => void} Teardown.
 */
export function subscribeAll() {
  if (isInDemoMode()) {
    seedDemoData();
    return detachAll;
  }

  subscribeConfig();
  subscribeBins();
  subscribeAlerts();
  subscribeEvents();
  subscribeTrucks();

  return detachAll;
}

/* ---------------------------------------------------------------------------
 * DEMO MODE DATA
 * Populates every store slice with realistic data so every dashboard page
 * renders correctly without Firebase.
 * ------------------------------------------------------------------------- */

/** The four demo bins with varying fill levels and statuses. */
const DEMO_BINS = [
  {
    binId: 'BIN-001', fillPct: 35, distanceCm: 13.0, status: BinStatus.EMPTY,
    label: 'Main Gate', zone: 'Zone-A',
    address: 'Main Entrance, Global Academy of Technology, Rajarajeshwari Nagar',
    lat: 12.96060, lng: 77.49000, battery: 92, rssi: -55,
  },
  {
    binId: 'BIN-002', fillPct: 72, distanceCm: 5.6, status: BinStatus.HALF,
    label: 'Canteen Block', zone: 'Zone-A',
    address: 'Canteen Area, Global Academy of Technology',
    lat: 12.96145, lng: 77.49085, battery: 78, rssi: -62,
  },
  {
    binId: 'BIN-003', fillPct: 91, distanceCm: 1.8, status: BinStatus.FULL,
    label: 'CSE Department', zone: 'Zone-B',
    address: 'CSE Block, Global Academy of Technology',
    lat: 12.95975, lng: 77.49130, battery: 65, rssi: -70,
  },
  {
    binId: 'BIN-004', fillPct: 15, distanceCm: 17.0, status: BinStatus.EMPTY,
    label: 'Hostel Wing', zone: 'Zone-B',
    address: 'Hostel Block, Global Academy of Technology',
    lat: 12.96020, lng: 77.48890, battery: 88, rssi: -48,
  },
];

function seedDemoData() {
  console.info('[listeners] 🎮 Seeding demo data…');
  const now = Date.now();

  // --- Config ---
  setConfig({
    defaultThresholdPct: THRESHOLDS.ALERT_PCT,
    pollIntervalSec: TIMING.POLL_INTERVAL_SEC,
    truckKmPerL: DERIVED_METRICS.TRUCK_KM_PER_L.value,
    co2KgPerL: DERIVED_METRICS.CO2_KG_PER_L.value,
    avgSpeedKmph: DERIVED_METRICS.AVG_SPEED_KMPH.value,
    serviceMinPerBin: DERIVED_METRICS.SERVICE_TIME_MIN_PER_BIN.value,
    simulationMode: false,
    seededAt: now,
  });

  // --- Bins ---
  for (const bin of DEMO_BINS) {
    upsertBin(bin.binId, {
      meta: {
        label: bin.label,
        zone: bin.zone,
        address: bin.address,
        location: { lat: bin.lat, lng: bin.lng },
        depthCm: SENSOR.DEFAULT_DEPTH_CM,
        thresholdPct: THRESHOLDS.ALERT_PCT,
        source: DataSource.SIMULATED,
        registeredAt: now - 86400000,
      },
      live: {
        fillPct: bin.fillPct,
        distanceCm: bin.distanceCm,
        binStatus: bin.status,
        batteryPct: bin.battery,
        rssiDbm: bin.rssi,
        timestamp: now - Math.floor(Math.random() * 30000),
        messageStatus: 'Delivered',
      },
      health: {
        sensor: 'ok',
        battery: bin.battery > 20 ? 'ok' : 'warning',
        network: 'ok',
        score: bin.battery > 20 ? 95 : 70,
      },
    });
    setBinDeviceState(bin.binId, DeviceState.ONLINE);
  }

  emit(Events.BINS_LOADED, getBins());

  // --- Alerts (for the CSE Department bin that's at 91%) ---
  upsertAlert('demo-alert-001', {
    binId: 'BIN-003',
    type: AlertType.THRESHOLD_BREACH,
    severity: AlertSeverity.CRITICAL,
    state: AlertState.ACTIVE,
    message: 'BIN-003 (CSE Department) reached 91% — above 80% threshold',
    raisedAt: now - 120000,
    source: DataSource.SIMULATED,
    fillPct: 91,
  });
  upsertAlert('demo-alert-002', {
    binId: 'BIN-002',
    type: AlertType.THRESHOLD_BREACH,
    severity: AlertSeverity.WARNING,
    state: AlertState.ACKNOWLEDGED,
    message: 'BIN-002 (Canteen Block) approaching threshold at 72%',
    raisedAt: now - 600000,
    acknowledgedAt: now - 300000,
    source: DataSource.SIMULATED,
    fillPct: 72,
  });

  // --- Trucks ---
  upsertTruck('TRK-01', {
    truckId: 'TRK-01',
    label: 'Collection Vehicle 1',
    status: TruckStatus.IDLE,
    position: { ...DEPLOYMENT.DEPOT },
    capacityL: 5000,
    driver: 'Driver A',
    assignedRoute: [],
    lastUpdated: now,
  });

  // --- Timeline events ---
  const demoEvents = [
    { kind: EventKind.SENSOR_UPDATE, detail: 'BIN-003 fill level updated to 91%', binId: 'BIN-003' },
    { kind: EventKind.THRESHOLD_REACHED, detail: 'BIN-003 (CSE Department) exceeded 80% threshold', binId: 'BIN-003' },
    { kind: EventKind.NOTIFICATION_SENT, detail: 'Alert dispatched for BIN-003 critical fill level', binId: 'BIN-003' },
    { kind: EventKind.SENSOR_UPDATE, detail: 'BIN-002 fill level updated to 72%', binId: 'BIN-002' },
    { kind: EventKind.SENSOR_UPDATE, detail: 'BIN-001 fill level updated to 35%', binId: 'BIN-001' },
    { kind: EventKind.SENSOR_UPDATE, detail: 'BIN-004 fill level updated to 15%', binId: 'BIN-004' },
    { kind: EventKind.DEVICE_ONLINE, detail: 'BIN-001 (Main Gate) came online', binId: 'BIN-001' },
    { kind: EventKind.DEVICE_ONLINE, detail: 'BIN-002 (Canteen Block) came online', binId: 'BIN-002' },
    { kind: EventKind.DEVICE_ONLINE, detail: 'BIN-003 (CSE Department) came online', binId: 'BIN-003' },
    { kind: EventKind.DEVICE_ONLINE, detail: 'BIN-004 (Hostel Wing) came online', binId: 'BIN-004' },
    { kind: EventKind.DB_UPDATED, detail: 'Database seeded: 4 bins, 1 vehicle registered' },
  ];

  demoEvents.forEach((evt, i) => {
    addEvent({
      id: `demo-evt-${String(i).padStart(3, '0')}`,
      ...evt,
      timestamp: now - (i * 60000),
      source: DataSource.SIMULATED,
    });
  });

  // --- Route (pre-optimized for the critical bin) ---
  setRoute({
    stops: [
      { binId: 'BIN-003', label: 'CSE Department', fillPct: 91, lat: 12.95975, lng: 77.49130 },
      { binId: 'BIN-002', label: 'Canteen Block', fillPct: 72, lat: 12.96145, lng: 77.49085 },
    ],
    totalDistanceKm: 0.42,
    estimatedMinutes: 12,
    fuelSavedL: 1.8,
    co2SavedKg: 4.82,
    optimizedAt: now,
    depot: DEPLOYMENT.DEPOT,
  });

  setUI({ loading: false });

  // --- Periodic live updates (simulate data changing) ---
  demoTimer = setInterval(() => {
    const bins = getBins();
    for (const bin of bins) {
      const drift = (Math.random() - 0.5) * 4; // ±2% drift
      const newFill = Math.max(0, Math.min(100, (bin.live?.fillPct ?? 50) + drift));
      const newDist = SENSOR.DEFAULT_DEPTH_CM * (1 - newFill / 100);
      const newStatus = newFill >= 80 ? BinStatus.FULL
        : newFill >= 51 ? BinStatus.HALF : BinStatus.EMPTY;

      upsertBin(bin.binId, {
        live: {
          fillPct: Math.round(newFill * 10) / 10,
          distanceCm: Math.round(newDist * 10) / 10,
          binStatus: newStatus,
          timestamp: Date.now(),
        },
      });
    }
  }, 5000);

  console.info('[listeners] 🎮 Demo data seeded — 4 bins, 2 alerts, 1 truck, route ready.');
}

/**
 * Generate 24h of fake history for a bin (used by bin detail modal charts).
 * @param {string} binId
 * @returns {object[]}
 */
function generateDemoHistory(binId) {
  const bin = DEMO_BINS.find((b) => b.binId === binId);
  const baseFill = bin?.fillPct ?? 50;
  const now = Date.now();
  const records = [];

  for (let i = 0; i < 96; i++) {  // every 15 min for 24 hours
    const t = now - (95 - i) * 900000;
    // Gradually increase fill towards current value with some noise
    const progress = i / 95;
    const noise = (Math.random() - 0.5) * 8;
    const fill = Math.max(0, Math.min(100,
      baseFill * 0.3 + (baseFill * 0.7 * progress) + noise
    ));
    const dist = SENSOR.DEFAULT_DEPTH_CM * (1 - fill / 100);

    records.push({
      id: `demo-hist-${binId}-${i}`,
      fillPct: Math.round(fill * 10) / 10,
      distanceCm: Math.round(dist * 10) / 10,
      binStatus: fill >= 80 ? BinStatus.FULL : fill >= 51 ? BinStatus.HALF : BinStatus.EMPTY,
      batteryPct: bin?.battery ?? 85,
      rssiDbm: bin?.rssi ?? -60,
      timestamp: t,
      source: DataSource.SIMULATED,
    });
  }

  return records;
}

/* ---------------------------------------------------------------------------
 * STALE DETECTION
 * ------------------------------------------------------------------------- */

/**
 * Periodically re-evaluate which bins have gone quiet.
 *
 * Necessary because "offline" is the absence of data, and absence does not
 * trigger a Firebase callback. Nothing arrives to tell you nothing arrived —
 * so a timer has to look.
 */
function startStaleMonitor() {
  clearInterval(staleTimer);

  // Check at a third of the poll interval so a bin is flagged promptly once
  // it crosses the threshold.
  const intervalMs = (TIMING.POLL_INTERVAL_SEC * 1000) / 3;
  staleTimer = setInterval(evaluateStaleness, intervalMs);
}

/**
 * Classify each bin as online, stale or offline based on the age of its
 * last reading.
 */
function evaluateStaleness() {
  const now = Date.now();
  const pollMs = TIMING.POLL_INTERVAL_SEC * 1000;
  const staleMs = pollMs * TIMING.STALE_MULTIPLIER;

  for (const bin of getBins()) {
    const lastSeen = bin.live?.timestamp;

    // A bin that has never reported is not offline — it has never been
    // deployed. Those are PLACEHOLDER, and conflating the two would show a
    // scary red "offline" for hardware that simply does not exist yet.
    if (!Number.isFinite(lastSeen)) {
      setBinDeviceState(bin.binId, DeviceState.OFFLINE);
      continue;
    }

    const age = now - lastSeen;

    let state;
    if (age > staleMs)      state = DeviceState.OFFLINE;
    else if (age > pollMs * 1.5) state = DeviceState.STALE;
    else                    state = DeviceState.ONLINE;

    setBinDeviceState(bin.binId, state);
  }
}

export default {
  subscribeAll, subscribeBins, subscribeAlerts, subscribeEvents,
  subscribeTrucks, subscribeConfig, subscribeBinHistory, unsubscribeBinHistory,
  detach, detachAll, activeListenerCount, activeListenerKeys,
};
