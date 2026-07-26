/**
 * SmartBin+ — Event Bus
 * =============================================================================
 * Minimal publish/subscribe. Lets modules communicate without importing each
 * other — the alert engine can announce a threshold breach without knowing
 * that the toast system, the map and the timeline are all listening.
 *
 * Every `on()` returns an unsubscribe function. Use it. Leaked listeners are
 * the most common cause of a real-time dashboard slowing down over a long
 * session, because each navigation adds another live subscription that never
 * goes away.
 *
 * @module js/core/events
 */

/** @typedef {(payload: any) => void} Handler */

/** @type {Map<string, Set<Handler>>} */
const listeners = new Map();

/** Enable with `setDebug(true)` to trace every emission in the console. */
let debug = false;

/**
 * Application event names. Using constants rather than raw strings means a
 * typo is a runtime `undefined` rather than a silent no-op that never fires.
 *
 * @readonly
 */
export const Events = Object.freeze({
  // Authentication
  AUTH_READY:          'auth:ready',           // first auth state resolved
  AUTH_SIGNED_IN:      'auth:signed-in',
  AUTH_SIGNED_OUT:     'auth:signed-out',
  AUTH_ROLE_RESOLVED:  'auth:role-resolved',
  AUTH_ERROR:          'auth:error',

  // Connectivity
  CONNECTION_CHANGED:  'connection:changed',
  CONNECTION_RESTORED: 'connection:restored',
  CONNECTION_LOST:     'connection:lost',

  // Bin data
  BINS_LOADED:         'bins:loaded',
  BIN_UPDATED:         'bin:updated',
  BIN_STATUS_CHANGED:  'bin:status-changed',   // crossed a band boundary
  BIN_WENT_OFFLINE:    'bin:offline',
  BIN_CAME_ONLINE:     'bin:online',
  BIN_SELECTED:        'bin:selected',

  // Alerts
  ALERT_RAISED:        'alert:raised',
  ALERT_ACKNOWLEDGED:  'alert:acknowledged',
  ALERT_RESOLVED:      'alert:resolved',

  // Trucks & routing
  ROUTE_OPTIMIZED:     'route:optimized',
  TRUCK_DISPATCHED:    'truck:dispatched',
  TRUCK_ARRIVED:       'truck:arrived',
  COLLECTION_DONE:     'collection:completed',

  // Simulation
  SIMULATION_STARTED:  'sim:started',
  SIMULATION_STOPPED:  'sim:stopped',
  SIMULATION_SCENARIO: 'sim:scenario',

  // UI
  ROUTE_CHANGED:       'ui:route-changed',
  THEME_CHANGED:       'ui:theme-changed',
  TOAST:               'ui:toast',
  MODAL_OPEN:          'ui:modal-open',
  MODAL_CLOSE:         'ui:modal-close',
  CONFIG_UPDATED:      'config:updated',
});

/**
 * Subscribe to an event.
 *
 * @param {string} event
 * @param {Handler} handler
 * @returns {() => void} Unsubscribe function.
 *
 * @example
 * const off = on(Events.ALERT_RAISED, (alert) => showToast(alert));
 * // later, on teardown:
 * off();
 */
export function on(event, handler) {
  if (typeof handler !== 'function') {
    throw new TypeError(`on("${event}") requires a function handler`);
  }

  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);

  return () => off(event, handler);
}

/**
 * Subscribe to the next occurrence only, then auto-unsubscribe.
 *
 * @param {string} event
 * @param {Handler} handler
 * @returns {() => void}
 */
export function once(event, handler) {
  const wrapped = (payload) => {
    off(event, wrapped);
    handler(payload);
  };
  return on(event, wrapped);
}

/**
 * Remove a specific handler.
 *
 * @param {string} event
 * @param {Handler} handler
 */
export function off(event, handler) {
  const set = listeners.get(event);
  if (!set) return;

  set.delete(handler);
  if (set.size === 0) listeners.delete(event);
}

/**
 * Emit an event to all subscribers.
 *
 * A throwing handler is caught and logged rather than allowed to break the
 * loop — one bad listener must not prevent the others from running. In a
 * monitoring console, a rendering bug in the timeline should never stop a
 * critical alert from reaching the operator.
 *
 * @param {string} event
 * @param {any} [payload]
 */
export function emit(event, payload) {
  if (debug) console.debug(`[bus] ${event}`, payload);

  const set = listeners.get(event);
  if (!set) return;

  // Iterate a copy: a handler may unsubscribe itself during dispatch.
  for (const handler of [...set]) {
    try {
      handler(payload);
    } catch (err) {
      console.error(`[bus] handler failed for "${event}"`, err);
    }
  }
}

/**
 * Remove every handler for one event, or all events if omitted.
 * Intended for teardown and tests, not routine use.
 *
 * @param {string} [event]
 */
export function clear(event) {
  if (event) listeners.delete(event);
  else listeners.clear();
}

/**
 * Current subscriber count. Useful for leak detection — navigate the
 * dashboard twenty times and this should not climb.
 *
 * @param {string} [event]
 * @returns {number}
 */
export function listenerCount(event) {
  if (event) return listeners.get(event)?.size ?? 0;

  let total = 0;
  for (const set of listeners.values()) total += set.size;
  return total;
}

/**
 * Snapshot of every active subscription, for debugging.
 * @returns {Record<string, number>}
 */
export function inspect() {
  const out = {};
  for (const [event, set] of listeners) out[event] = set.size;
  return out;
}

/** @param {boolean} enabled */
export function setDebug(enabled) {
  debug = Boolean(enabled);
}

export default { Events, on, once, off, emit, clear, listenerCount, inspect, setDebug };
