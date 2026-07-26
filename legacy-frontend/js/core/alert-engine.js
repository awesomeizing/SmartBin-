/**
 * SmartBin+ — Alert Engine
 * =============================================================================
 * Watches live bin data and raises alerts when conditions warrant.
 *
 * Implements report §3.1: "The system shall automatically generate and
 * dispatch an alert notification to registered municipal authority endpoints
 * when a bin's fill level reaches or exceeds 80%."
 *
 * DESIGN NOTE — why this runs client-side.
 * A production deployment would evaluate these rules in a Cloud Function, so
 * alerts fire whether or not anyone has the dashboard open. This project has
 * no server component, so evaluation happens in the browser. That limitation
 * is stated in the README rather than hidden: with no dashboard open, no
 * alert is recorded. The database deduplication logic means multiple open
 * dashboards will not produce duplicate alerts.
 *
 * @module js/core/alert-engine
 */

import { on, Events } from './events.js';
import { getBins, getAlerts } from './store.js';
import { raiseAlert, resolveAlert, logEvent } from '../../firebase/db.service.js';
import { validateReading } from '../utils/fill.js';
import {
  AlertType, AlertSeverity, AlertState,
  DeviceState, EventKind, DataSource,
} from '../../config/constants.js';
import { THRESHOLDS, SENSOR } from '../../config/app.config.js';

/**
 * Conditions already reported, keyed `binId:AlertType`.
 *
 * Prevents re-raising the same alert on every 60-second tick. The database
 * also deduplicates, but checking locally first avoids a network round trip
 * for every reading of every bin.
 *
 * @type {Set<string>}
 */
const reported = new Set();

/** @type {boolean} */
let running = false;

/** @type {Array<() => void>} */
const teardowns = [];

/**
 * Start evaluating alert rules.
 * @returns {() => void} Stop function.
 */
export function startAlertEngine() {
  if (running) return stopAlertEngine;
  running = true;

  // Evaluate whenever a bin's data changes.
  teardowns.push(on(Events.BIN_UPDATED, (bin) => evaluateBin(bin)));

  // Band crossings are the primary trigger and get an explicit timeline entry.
  teardowns.push(on(Events.BIN_STATUS_CHANGED, ({ bin, from, to }) => {
    logEvent({
      kind: EventKind.THRESHOLD_REACHED,
      binId: bin.binId,
      detail: `Fill status changed from ${from} to ${to} (${bin.live?.fillPct}%)`,
    }).catch(() => { /* logging must never break alerting */ });
  }));

  teardowns.push(on(Events.BIN_WENT_OFFLINE, (bin) => {
    raise(bin, {
      type: AlertType.DEVICE_OFFLINE,
      severity: AlertSeverity.WARNING,
      message: `${bin.meta?.label ?? bin.binId} has stopped reporting. ` +
               'Displayed values are from its last transmission.',
    });
  }));

  teardowns.push(on(Events.BIN_CAME_ONLINE, (bin) => {
    clearCondition(bin.binId, AlertType.DEVICE_OFFLINE);
    logEvent({
      kind: EventKind.DEVICE_ONLINE,
      binId: bin.binId,
      detail: `${bin.binId} resumed reporting`,
    }).catch(() => {});
  }));

  return stopAlertEngine;
}

/** Stop the engine and release its subscriptions. */
export function stopAlertEngine() {
  teardowns.forEach((off) => off());
  teardowns.length = 0;
  reported.clear();
  running = false;
}

/**
 * Evaluate every rule against one bin.
 * @param {object} bin
 */
function evaluateBin(bin) {
  const live = bin.live ?? {};
  const meta = bin.meta ?? {};

  // A bin that has never reported has nothing to evaluate. Alerting on
  // hardware that was never deployed would be noise, not signal.
  if (!Number.isFinite(live.fillPct)) return;

  const threshold = meta.thresholdPct ?? THRESHOLDS.ALERT_PCT;
  const isOffline = bin.deviceState === DeviceState.OFFLINE;

  /* --- Overflow: at or beyond capacity --------------------------------- */
  if (live.fillPct >= THRESHOLDS.OVERFLOW_PCT) {
    raise(bin, {
      type: AlertType.OVERFLOW,
      severity: AlertSeverity.CRITICAL,
      message: `${meta.label ?? bin.binId} is at ${Math.round(live.fillPct)}% — ` +
               'overflow imminent. Immediate collection required.',
    });
  } else {
    clearCondition(bin.binId, AlertType.OVERFLOW);
  }

  /* --- Threshold breach — report §3.1 ----------------------------------- */
  if (live.fillPct >= threshold && live.fillPct < THRESHOLDS.OVERFLOW_PCT) {
    raise(bin, {
      type: AlertType.THRESHOLD_BREACH,
      severity: AlertSeverity.CRITICAL,
      message: `${meta.label ?? bin.binId} has reached ${Math.round(live.fillPct)}% ` +
               `(threshold ${threshold}%). Collection required.`,
    });
  } else if (live.fillPct < threshold) {
    // Below threshold again — the bin was emptied.
    autoResolve(bin.binId, AlertType.THRESHOLD_BREACH, 'Bin collected');
    clearCondition(bin.binId, AlertType.THRESHOLD_BREACH);
  }

  /* --- Sensor fault ------------------------------------------------------ */
  const depthCm = meta.depthCm ?? SENSOR.DEFAULT_DEPTH_CM;
  const reading = validateReading(live.distanceCm, depthCm);

  if (!reading.valid || bin.health?.sensorOk === false) {
    raise(bin, {
      type: AlertType.SENSOR_FAULT,
      severity: AlertSeverity.WARNING,
      message: `${meta.label ?? bin.binId} sensor reading is invalid: ` +
               `${reading.reason ?? 'device reports a sensor fault'}.`,
    });
  } else {
    clearCondition(bin.binId, AlertType.SENSOR_FAULT);
  }

  /* --- Battery ----------------------------------------------------------- */
  const battery = live.batteryPct;

  if (Number.isFinite(battery)) {
    if (battery <= THRESHOLDS.BATTERY_CRIT_PCT) {
      raise(bin, {
        type: AlertType.BATTERY_CRITICAL,
        severity: AlertSeverity.CRITICAL,
        message: `${meta.label ?? bin.binId} battery at ${Math.round(battery)}%. ` +
                 'The device will stop reporting shortly.',
      });
    } else if (battery <= THRESHOLDS.BATTERY_WARN_PCT) {
      raise(bin, {
        type: AlertType.BATTERY_LOW,
        severity: AlertSeverity.WARNING,
        message: `${meta.label ?? bin.binId} battery at ${Math.round(battery)}%. ` +
                 'Schedule a replacement.',
      });
      clearCondition(bin.binId, AlertType.BATTERY_CRITICAL);
    } else {
      clearCondition(bin.binId, AlertType.BATTERY_LOW);
      clearCondition(bin.binId, AlertType.BATTERY_CRITICAL);
    }
  }

  /* --- Weak signal ------------------------------------------------------- */
  if (Number.isFinite(live.rssi) && live.rssi < THRESHOLDS.RSSI_WEAK_DBM && !isOffline) {
    raise(bin, {
      type: AlertType.NETWORK_DEGRADED,
      severity: AlertSeverity.INFO,
      message: `${meta.label ?? bin.binId} Wi-Fi signal is weak (${live.rssi} dBm). ` +
               'Transmissions may fail intermittently.',
    });
  } else {
    clearCondition(bin.binId, AlertType.NETWORK_DEGRADED);
  }

  /* --- Phase-II sensors, when simulated ---------------------------------- */
  // These only ever have values from the Simulation Engine, since no such
  // hardware is fitted. The alert carries the bin's provenance so the toast
  // is labelled accordingly.
  const temperature = bin.reserved?.temperatureC;
  if (Number.isFinite(temperature) && temperature >= 60) {
    raise(bin, {
      type: AlertType.TEMPERATURE_HIGH,
      severity: AlertSeverity.CRITICAL,
      message: `${meta.label ?? bin.binId} reporting ${temperature}°C — possible fire. ` +
               '(Simulated: no temperature sensor is fitted to this prototype.)',
    });
  } else {
    clearCondition(bin.binId, AlertType.TEMPERATURE_HIGH);
  }
}

/**
 * Raise an alert unless the same condition is already open.
 *
 * @param {object} bin
 * @param {{type: string, severity: string, message: string}} alert
 */
function raise(bin, { type, severity, message }) {
  const key = `${bin.binId}:${type}`;
  if (reported.has(key)) return;

  reported.add(key);

  raiseAlert({
    binId: bin.binId,
    type,
    severity,
    message,
    // Carried through so toasts and the alert feed can mark simulated alerts.
    source: bin.meta?.source ?? DataSource.PLACEHOLDER,
  }).catch((err) => {
    // Let the condition be retried on the next tick rather than swallowing it.
    reported.delete(key);
    console.error('[alert-engine] failed to raise alert', key, err);
  });
}

/**
 * Forget a condition so it can fire again if it recurs.
 * @param {string} binId
 * @param {string} type
 */
function clearCondition(binId, type) {
  reported.delete(`${binId}:${type}`);
}

/**
 * Resolve any open alert of a given type for a bin.
 *
 * @param {string} binId
 * @param {string} type
 * @param {string} reason
 */
function autoResolve(binId, type, reason) {
  const open = getAlerts().filter(
    (a) => a.binId === binId && a.type === type && a.state !== AlertState.RESOLVED
  );

  open.forEach((alert) => {
    resolveAlert(alert.alertId, reason).catch((err) =>
      console.error('[alert-engine] auto-resolve failed', alert.alertId, err)
    );
  });
}

/**
 * Re-evaluate every bin. Used after the first data load, since BIN_UPDATED
 * only fires on subsequent changes.
 */
export function evaluateAll() {
  getBins().forEach(evaluateBin);
}

export default { startAlertEngine, stopAlertEngine, evaluateAll };
