/**
 * SmartBin+ — Connection State Machine
 * =============================================================================
 * Tracks real connectivity to Firebase and queues writes made while offline.
 *
 * Why this exists: report §3.2 requires 99% availability and resilient
 * transmission, and the literature survey names network dependency as one of
 * the three most consequential limitations of existing systems (§V — "without
 * it, data cannot reach the cloud, and the dashboard goes dark").
 *
 * The status indicator in the header reflects this state machine. It is never
 * hardcoded green. A monitoring tool that lies about its own connectivity is
 * worse than one with no indicator at all.
 *
 *   ONLINE ──lost──> DEGRADED ──timeout──> OFFLINE
 *      ^                                      │
 *      └────── restored ─── RECONNECTING <────┘
 *
 * @module firebase/connection
 */

import { getFirebaseDb, getSdk, isInDemoMode } from './init.js';
import { setConnection, get } from '../js/core/store.js';
import { ConnectionState, DB_PATH } from '../config/constants.js';
import { TIMING } from '../config/app.config.js';

/** @typedef {{ path: string, value: any, queuedAt: number }} QueuedWrite */

/** @type {QueuedWrite[]} Writes made while disconnected. */
const writeQueue = [];

/** @type {(() => void)|null} */
let unsubscribeConnected = null;

/** @type {number|null} Timer that promotes DEGRADED to OFFLINE. */
let degradeTimer = null;

/** @type {number} Consecutive reconnect attempts, drives the back-off. */
let reconnectAttempts = 0;

/**
 * How long to sit in DEGRADED before declaring OFFLINE.
 * A brief drop is common on campus Wi-Fi; flipping the banner to red for a
 * two-second blip trains operators to ignore it.
 */
const DEGRADE_GRACE_MS = 8000;

/**
 * Begin monitoring. Call once after Firebase initialises.
 * @returns {() => void} Stop function.
 */
export function startConnectionMonitor() {
  // Demo mode: report connected with zero latency.
  if (isInDemoMode()) {
    setConnection(ConnectionState.ONLINE, { latencyMs: 0 });
    return () => {};
  }

  const db = getFirebaseDb();
  const { db: dbSdk } = getSdk();

  const connectedRef = dbSdk.ref(db, DB_PATH.CONNECTED);

  unsubscribeConnected = dbSdk.onValue(connectedRef, (snapshot) => {
    const connected = snapshot.val() === true;
    if (connected) { handleConnected(); } else { handleDisconnected(); }
  });

  // The browser's own online/offline events fire faster than Firebase's
  // heartbeat, so we use them as an early signal.
  window.addEventListener('online',  handleBrowserOnline);
  window.addEventListener('offline', handleBrowserOffline);

  return stopConnectionMonitor;
}

/** Stop monitoring and clear timers. */
export function stopConnectionMonitor() {
  unsubscribeConnected?.();
  unsubscribeConnected = null;

  clearTimeout(degradeTimer);
  degradeTimer = null;

  window.removeEventListener('online',  handleBrowserOnline);
  window.removeEventListener('offline', handleBrowserOffline);
}

/* ---------------------------------------------------------------------------
 * TRANSITIONS
 * ------------------------------------------------------------------------- */

function handleConnected() {
  clearTimeout(degradeTimer);
  degradeTimer = null;
  reconnectAttempts = 0;

  setConnection(ConnectionState.ONLINE, {
    latencyMs: null,
    queuedWrites: writeQueue.length,
  });

  flushQueue();
  measureLatency();
}

function handleDisconnected() {
  const current = get('connection').state;

  // Already offline or on the way there — nothing to do.
  if (current === ConnectionState.OFFLINE || degradeTimer) return;

  setConnection(ConnectionState.DEGRADED);

  degradeTimer = setTimeout(() => {
    degradeTimer = null;
    setConnection(ConnectionState.OFFLINE);
    scheduleReconnect();
  }, DEGRADE_GRACE_MS);
}

function handleBrowserOnline() {
  if (get('connection').state !== ConnectionState.ONLINE) {
    setConnection(ConnectionState.RECONNECTING);
  }
}

function handleBrowserOffline() {
  clearTimeout(degradeTimer);
  degradeTimer = null;
  setConnection(ConnectionState.OFFLINE);
}

/**
 * Exponential back-off, mirroring the firmware's reconnect strategy
 * (report §5.2 item 2: initial 1 s, max 30 s).
 *
 * The Firebase SDK reconnects on its own; this drives the UI state so the
 * operator can see that a retry is in progress rather than staring at a
 * frozen red indicator.
 */
function scheduleReconnect() {
  const delay = Math.min(
    TIMING.RECONNECT_INITIAL_MS * TIMING.RECONNECT_FACTOR ** reconnectAttempts,
    TIMING.RECONNECT_MAX_MS
  );

  reconnectAttempts++;

  setTimeout(() => {
    if (get('connection').state === ConnectionState.OFFLINE) {
      setConnection(ConnectionState.RECONNECTING, { nextRetryMs: delay });
    }
  }, delay);
}

/* ---------------------------------------------------------------------------
 * LATENCY
 * ------------------------------------------------------------------------- */

/**
 * Measure round-trip time against the server clock.
 *
 * Report §3.2 sets a 3-second dashboard-refresh target. Showing the measured
 * value rather than asserting compliance is the difference between a claim
 * and evidence — and it is what the System Health panel displays.
 */
async function measureLatency() {
  try {
    const db = getFirebaseDb();
    const { db: dbSdk } = getSdk();

    const started = performance.now();
    await dbSdk.get(dbSdk.ref(db, '.info/serverTimeOffset'));
    const latencyMs = Math.round(performance.now() - started);

    setConnection(get('connection').state, { latencyMs });
  } catch {
    // Latency is diagnostic only — a failure here must not affect state.
  }
}

/* ---------------------------------------------------------------------------
 * OFFLINE WRITE QUEUE
 * ------------------------------------------------------------------------- */

/**
 * Queue a write for replay on reconnect.
 *
 * The Firebase SDK already buffers writes internally, but that buffer is
 * invisible. This queue is surfaced in the UI ("3 writes pending") so an
 * operator knows their acknowledgement has not reached the server yet.
 *
 * @param {string} path
 * @param {any} value
 */
export function queueWrite(path, value) {
  writeQueue.push({ path, value, queuedAt: Date.now() });
  setConnection(get('connection').state, { queuedWrites: writeQueue.length });
}

/**
 * Replay queued writes in order.
 * A failed write is re-queued rather than dropped — losing an operator's
 * acknowledgement silently would be worse than retrying it.
 */
async function flushQueue() {
  if (writeQueue.length === 0) return;

  const db = getFirebaseDb();
  const { db: dbSdk } = getSdk();

  const pending = writeQueue.splice(0, writeQueue.length);

  for (const item of pending) {
    try {
      await dbSdk.set(dbSdk.ref(db, item.path), item.value);
    } catch (err) {
      console.error('[connection] queued write failed, re-queuing', item.path, err);
      writeQueue.push(item);
    }
  }

  setConnection(get('connection').state, { queuedWrites: writeQueue.length });
}

/** @returns {number} */
export function getQueueLength() {
  return writeQueue.length;
}

/**
 * Human-readable connection description for the status pill.
 *
 * @param {string} state  From ConnectionState.*
 * @returns {{label: string, tone: string, description: string}}
 */
export function describeConnection(state) {
  const map = {
    [ConnectionState.ONLINE]: {
      label: 'CONNECTED',
      tone: 'healthy',
      description: 'Live connection to Firebase Realtime Database.',
    },
    [ConnectionState.DEGRADED]: {
      label: 'UNSTABLE',
      tone: 'warning',
      description: 'Connection interrupted. Waiting before declaring it offline.',
    },
    [ConnectionState.OFFLINE]: {
      label: 'OFFLINE',
      tone: 'critical',
      description: 'No connection. Displayed data may be stale; writes are queued.',
    },
    [ConnectionState.RECONNECTING]: {
      label: 'RECONNECTING',
      tone: 'warning',
      description: 'Attempting to restore the connection.',
    },
  };

  return map[state] ?? map[ConnectionState.OFFLINE];
}

export default {
  startConnectionMonitor,
  stopConnectionMonitor,
  queueWrite,
  getQueueLength,
  describeConnection,
};
