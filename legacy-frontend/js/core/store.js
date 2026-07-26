/**
 * SmartBin+ — Application Store
 * =============================================================================
 * A single observable state object. Firebase listeners write here; UI
 * components subscribe to the slices they render. Nothing derives state from
 * the DOM, and no component holds its own copy of shared data.
 *
 * The rule that keeps this honest: **components never mutate state directly.**
 * They call an action. Actions are the only writers, which means when a
 * number on screen is wrong there is exactly one place to look.
 *
 * @module js/core/store
 */

import { emit, Events } from './events.js';
import { ConnectionState, DataSource, Role, ROLE_RANK } from '../../config/constants.js';
import { UI } from '../../config/app.config.js';

/**
 * @typedef {Object} BinRecord
 * @property {string} binId
 * @property {Object} meta        Registration data — label, zone, location, depthCm
 * @property {Object} live        Latest telemetry — fillPct, distanceCm, binStatus…
 * @property {Object} health      Component health flags and score
 * @property {string} deviceState online | stale | offline (derived)
 */

/* ---------------------------------------------------------------------------
 * STATE
 * ------------------------------------------------------------------------- */

const state = {
  /** @type {{ ready: boolean, user: object|null, role: string|null, uid: string|null }} */
  auth: {
    ready: false,     // has the first onAuthStateChanged fired?
    user:  null,
    role:  null,
    uid:   null,
  },

  connection: {
    state:        ConnectionState.OFFLINE,
    lastOnlineAt: null,
    latencyMs:    null,
    queuedWrites: 0,
  },

  /** @type {Map<string, BinRecord>} Keyed by binId. */
  bins: new Map(),

  /** @type {Map<string, object>} Keyed by alertId. */
  alerts: new Map(),

  /** @type {object[]} Newest first, capped at UI.TIMELINE_LIMIT. */
  events: [],

  /** @type {Map<string, object>} */
  trucks: new Map(),

  /** @type {object|null} Most recent optimized route. */
  route: null,

  /** Runtime config from Firebase /config, overriding app.config defaults. */
  config: {},

  ui: {
    selectedBinId: null,
    theme:         UI.DEFAULT_THEME,
    sidebarOpen:   true,
    simulationOn:  false,
    loading:       true,
  },
};

/* ---------------------------------------------------------------------------
 * SUBSCRIPTIONS
 * ------------------------------------------------------------------------- */

/** @type {Map<string, Set<Function>>} slice name → subscribers */
const subscribers = new Map();

/**
 * Subscribe to a state slice. The handler fires immediately with the current
 * value, so a component never has to render an empty first frame and then
 * correct itself.
 *
 * @param {'auth'|'connection'|'bins'|'alerts'|'events'|'trucks'|'route'|'config'|'ui'} slice
 * @param {(value: any) => void} handler
 * @returns {() => void} Unsubscribe.
 */
export function subscribe(slice, handler) {
  if (!(slice in state)) {
    throw new Error(`subscribe(): unknown slice "${slice}"`);
  }

  if (!subscribers.has(slice)) subscribers.set(slice, new Set());
  subscribers.get(slice).add(handler);

  handler(state[slice]);   // immediate first call

  return () => subscribers.get(slice)?.delete(handler);
}

/**
 * Notify subscribers of a slice.
 * @param {string} slice
 */
function notify(slice) {
  const set = subscribers.get(slice);
  if (!set) return;

  for (const handler of [...set]) {
    try {
      handler(state[slice]);
    } catch (err) {
      console.error(`[store] subscriber failed for "${slice}"`, err);
    }
  }
}

/**
 * Read-only access to a slice.
 * Returns live references for Maps and arrays — treat them as immutable.
 *
 * @param {string} [slice]
 * @returns {any}
 */
export function get(slice) {
  return slice ? state[slice] : state;
}

/* ---------------------------------------------------------------------------
 * AUTH ACTIONS
 * ------------------------------------------------------------------------- */

/**
 * @param {object|null} user  Firebase User, or null when signed out.
 */
export function setUser(user) {
  state.auth.user  = user;
  state.auth.uid   = user?.uid ?? null;
  state.auth.ready = true;

  if (!user) state.auth.role = null;

  notify('auth');
  emit(user ? Events.AUTH_SIGNED_IN : Events.AUTH_SIGNED_OUT, user);
}

/**
 * @param {string} role  One of Role.*
 */
export function setRole(role) {
  state.auth.role = role;
  notify('auth');
  emit(Events.AUTH_ROLE_RESOLVED, role);
}

/**
 * Capability check against the current role.
 *
 * This is a **UI convenience only**. Firebase security rules are the real
 * enforcement — hiding a button does not stop anyone who opens the console.
 * Both layers exist on purpose.
 *
 * @param {string} requiredRole  Minimum role, from Role.*
 * @returns {boolean}
 */
export function roleAtLeast(requiredRole) {
  const current = state.auth.role;
  if (!current) return false;
  return (ROLE_RANK[current] ?? -1) >= (ROLE_RANK[requiredRole] ?? 99);
}

/** @returns {boolean} */
export function isAdmin() {
  return state.auth.role === Role.ADMINISTRATOR;
}

/* ---------------------------------------------------------------------------
 * CONNECTION ACTIONS
 * ------------------------------------------------------------------------- */

/**
 * @param {string} connState  One of ConnectionState.*
 * @param {object} [detail]
 */
export function setConnection(connState, detail = {}) {
  const previous = state.connection.state;
  if (previous === connState && !Object.keys(detail).length) return;

  Object.assign(state.connection, { state: connState, ...detail });

  if (connState === ConnectionState.ONLINE) {
    state.connection.lastOnlineAt = Date.now();
  }

  notify('connection');
  emit(Events.CONNECTION_CHANGED, { from: previous, to: connState });

  if (previous !== ConnectionState.ONLINE && connState === ConnectionState.ONLINE) {
    emit(Events.CONNECTION_RESTORED);
  } else if (previous === ConnectionState.ONLINE && connState !== ConnectionState.ONLINE) {
    emit(Events.CONNECTION_LOST);
  }
}

/* ---------------------------------------------------------------------------
 * BIN ACTIONS
 * ------------------------------------------------------------------------- */

/**
 * Insert or update a bin. Merges rather than replaces, because `meta`,
 * `live` and `health` arrive from three separate Firebase listeners and
 * must not clobber one another.
 *
 * @param {string} binId
 * @param {Partial<BinRecord>} patch
 */
export function upsertBin(binId, patch) {
  const existing = state.bins.get(binId) ?? { binId, meta: {}, live: {}, health: {} };
  const previousStatus = existing.live?.binStatus;

  const updated = {
    ...existing,
    ...patch,
    binId,
    meta:   { ...existing.meta,   ...(patch.meta   ?? {}) },
    live:   { ...existing.live,   ...(patch.live   ?? {}) },
    health: { ...existing.health, ...(patch.health ?? {}) },
  };

  state.bins.set(binId, updated);
  notify('bins');
  emit(Events.BIN_UPDATED, updated);

  // Band crossings drive alerts and the timeline, so they get their own event.
  const nextStatus = updated.live?.binStatus;
  if (previousStatus && nextStatus && previousStatus !== nextStatus) {
    emit(Events.BIN_STATUS_CHANGED, { bin: updated, from: previousStatus, to: nextStatus });
  }
}

/**
 * Update the derived online/stale/offline state of a bin.
 * @param {string} binId
 * @param {string} deviceState  One of DeviceState.*
 */
export function setBinDeviceState(binId, deviceState) {
  const bin = state.bins.get(binId);
  if (!bin || bin.deviceState === deviceState) return;

  const previous = bin.deviceState;
  bin.deviceState = deviceState;

  notify('bins');

  if (deviceState === 'offline')      emit(Events.BIN_WENT_OFFLINE, bin);
  else if (previous === 'offline')    emit(Events.BIN_CAME_ONLINE, bin);
}

/** @param {string} binId */
export function removeBin(binId) {
  if (state.bins.delete(binId)) notify('bins');
}

/**
 * All bins as an array, sorted by ID for stable rendering.
 * @returns {BinRecord[]}
 */
export function getBins() {
  return [...state.bins.values()].sort((a, b) => a.binId.localeCompare(b.binId));
}

/**
 * @param {string} binId
 * @returns {BinRecord|undefined}
 */
export function getBin(binId) {
  return state.bins.get(binId);
}

/**
 * Provenance summary, for the global banner.
 * The banner exists so that no viewer ever mistakes simulated data for a
 * real reading. See PHASE-1-ARCHITECTURE.md Part B.
 *
 * @returns {{device: number, simulated: number, placeholder: number, total: number}}
 */
export function getProvenanceSummary() {
  const summary = { device: 0, simulated: 0, placeholder: 0, total: 0 };

  for (const bin of state.bins.values()) {
    const source = bin.meta?.source ?? DataSource.PLACEHOLDER;
    if (source in summary) summary[source]++;
    summary.total++;
  }

  return summary;
}

/* ---------------------------------------------------------------------------
 * ALERT ACTIONS
 * ------------------------------------------------------------------------- */

/**
 * @param {string} alertId
 * @param {object} alert
 */
export function upsertAlert(alertId, alert) {
  const isNew = !state.alerts.has(alertId);
  state.alerts.set(alertId, { ...alert, alertId });

  notify('alerts');
  if (isNew) emit(Events.ALERT_RAISED, { ...alert, alertId });
}

/** @param {string} alertId */
export function removeAlert(alertId) {
  if (state.alerts.delete(alertId)) notify('alerts');
}

/**
 * @param {string} [state_] Filter by AlertState.* — omit for all.
 * @returns {object[]} Newest first.
 */
export function getAlerts(state_) {
  const all = [...state.alerts.values()];
  const filtered = state_ ? all.filter((a) => a.state === state_) : all;
  return filtered.sort((a, b) => (b.raisedAt ?? 0) - (a.raisedAt ?? 0));
}

/* ---------------------------------------------------------------------------
 * TIMELINE ACTIONS
 * ------------------------------------------------------------------------- */

/**
 * Prepend a timeline event, capped so a long session cannot grow unbounded.
 * @param {object} event
 */
export function addEvent(event) {
  state.events.unshift(event);
  if (state.events.length > UI.TIMELINE_LIMIT) {
    state.events.length = UI.TIMELINE_LIMIT;
  }
  notify('events');
}

/* ---------------------------------------------------------------------------
 * TRUCK & ROUTE ACTIONS
 * ------------------------------------------------------------------------- */

export function upsertTruck(truckId, truck) {
  state.trucks.set(truckId, { ...state.trucks.get(truckId), ...truck, truckId });
  notify('trucks');
}

export function setRoute(route) {
  state.route = route;
  notify('route');
  emit(Events.ROUTE_OPTIMIZED, route);
}

/* ---------------------------------------------------------------------------
 * CONFIG ACTIONS
 * ------------------------------------------------------------------------- */

/**
 * Runtime config from Firebase /config. Overrides the defaults in
 * app.config.js so an administrator can change the alert threshold without
 * a redeploy.
 *
 * @param {object} config
 */
export function setConfig(config) {
  state.config = { ...state.config, ...config };
  notify('config');
  emit(Events.CONFIG_UPDATED, state.config);

  if ('simulationMode' in config) {
    setUI({ simulationOn: Boolean(config.simulationMode) });
  }
}

/* ---------------------------------------------------------------------------
 * UI ACTIONS
 * ------------------------------------------------------------------------- */

/** @param {Partial<typeof state.ui>} patch */
export function setUI(patch) {
  Object.assign(state.ui, patch);
  notify('ui');

  if ('selectedBinId' in patch) {
    emit(Events.BIN_SELECTED, patch.selectedBinId);
  }
  if ('theme' in patch) {
    emit(Events.THEME_CHANGED, patch.theme);
  }
}

/* ---------------------------------------------------------------------------
 * RESET
 * ------------------------------------------------------------------------- */

/**
 * Clear all data state. Called on sign-out so the next user never sees a
 * frame of the previous user's bins.
 */
export function reset() {
  state.bins.clear();
  state.alerts.clear();
  state.trucks.clear();
  state.events.length = 0;
  state.route = null;
  state.config = {};

  state.auth = { ready: true, user: null, role: null, uid: null };
  state.ui.selectedBinId = null;
  state.ui.loading = true;

  ['auth', 'bins', 'alerts', 'events', 'trucks', 'route', 'config', 'ui']
    .forEach(notify);
}

export default {
  subscribe, get,
  setUser, setRole, roleAtLeast, isAdmin,
  setConnection,
  upsertBin, setBinDeviceState, removeBin, getBins, getBin, getProvenanceSummary,
  upsertAlert, removeAlert, getAlerts,
  addEvent, upsertTruck, setRoute, setConfig, setUI, reset,
};
