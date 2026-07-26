/**
 * SmartBin+ — Simulation Engine
 * =============================================================================
 * Drives scenario testing by writing to Firebase exactly as a real ESP32
 * would.
 *
 * THE CORE DESIGN DECISION: simulated readings go through the *same* write
 * path as device readings. Nothing downstream special-cases them. The alert
 * engine, the map, the analytics charts and the route optimiser all react
 * through the normal data flow. That is what makes this a simulator rather
 * than a UI puppet — and it means running a scenario genuinely exercises the
 * system end to end.
 *
 * WHAT SIMULATION IS FOR HERE. This deployment has four physical bins. The
 * engine exists to demonstrate states that cannot be produced safely or on
 * demand — fire, emergency overflow, sensor failure, network loss — not to
 * inflate the fleet size. Any bin it touches is flagged `simulated` and
 * remains visibly badged until real hardware writes to it.
 *
 * @module js/simulation/engine
 */

import { writeBinTelemetry, write, update, logEvent, updateConfig, resolveAlertsForBin }
  from '../../firebase/db.service.js';
import { getBin, setUI, get } from '../core/store.js';
import { emit, Events } from '../core/events.js';
import { fillPercentToDistance } from '../utils/fill.js';
import {
  Scenario, DataSource, EventKind, DB_PATH, PHASE_II_SCENARIOS,
} from '../../config/constants.js';
import { SENSOR, TIMING, THRESHOLDS } from '../../config/app.config.js';

/** @type {number|null} Tick interval for continuous scenarios. */
let tickTimer = null;

/**
 * Bins currently under continuous simulation.
 * @type {Map<string, {scenario: string, ratePerTick: number, batteryDrain: number}>}
 */
const activeRuns = new Map();

/** @type {boolean} */
let simulationOn = false;

/* ---------------------------------------------------------------------------
 * MODE
 * ------------------------------------------------------------------------- */

/**
 * Enable or disable Simulation Mode globally.
 *
 * Writing to /config means every connected client sees the change and the
 * provenance banner appears everywhere simultaneously. A simulation running
 * on one screen and hidden on another would defeat the point.
 *
 * @param {boolean} enabled
 * @returns {Promise<void>}
 */
export async function setSimulationMode(enabled) {
  simulationOn = Boolean(enabled);

  await updateConfig({ simulationMode: simulationOn });
  setUI({ simulationOn });

  await logEvent({
    kind: EventKind.SIMULATION_TOGGLED,
    detail: `Simulation mode ${simulationOn ? 'enabled' : 'disabled'}`,
  });

  emit(simulationOn ? Events.SIMULATION_STARTED : Events.SIMULATION_STOPPED);

  if (!simulationOn) stopAll();
  else startTicker();
}

/** @returns {boolean} */
export function isSimulationOn() {
  return simulationOn || get('ui').simulationOn;
}

/**
 * Stop every running scenario. The kill switch.
 */
export function stopAll() {
  activeRuns.clear();

  clearInterval(tickTimer);
  tickTimer = null;

  emit(Events.SIMULATION_STOPPED);
}

/* ---------------------------------------------------------------------------
 * SCENARIOS
 * ------------------------------------------------------------------------- */

/**
 * Run a scenario against a bin.
 *
 * @param {string} scenario  From Scenario.*
 * @param {string} binId
 * @param {object} [options]
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function runScenario(scenario, binId, options = {}) {
  if (!isSimulationOn()) {
    return { ok: false, message: 'Simulation mode is off. Enable it first.' };
  }

  const bin = getBin(binId);
  if (!bin) return { ok: false, message: `Bin ${binId} not found.` };

  // Mark the bin as simulated before writing anything, so no reading can
  // briefly appear as live data.
  await markSimulated(binId);

  const depthCm = bin.meta?.depthCm ?? SENSOR.DEFAULT_DEPTH_CM;
  const live = bin.live ?? {};
  const currentFill = Number.isFinite(live.fillPct) ? live.fillPct : 0;

  const handlers = {
    [Scenario.INCREASE_WASTE]: () => startContinuous(binId, {
      scenario, ratePerTick: options.rate ?? 2.5, batteryDrain: 0.02,
    }),

    [Scenario.DECREASE_WASTE]: () => writeFill(binId, Math.max(0, currentFill - 15), depthCm, live),

    [Scenario.SENSOR_FAILURE]: () => sensorFailure(binId, depthCm, live),

    [Scenario.ESP32_RESTART]: () => esp32Restart(binId, depthCm, live, currentFill),

    [Scenario.NETWORK_FAILURE]: () => networkFailure(binId),

    [Scenario.FIREBASE_DISCONNECT]: () => firebaseDisconnect(),

    [Scenario.BATTERY_DRAIN]: () => startContinuous(binId, {
      scenario, ratePerTick: 0, batteryDrain: 4,
    }),

    [Scenario.TRUCK_COLLECTION]: () => truckCollection(binId, depthCm, live),

    [Scenario.EMERGENCY_OVERFLOW]: () => writeFill(binId, 100, depthCm, live),

    [Scenario.RAIN]: () => rain(binId),

    [Scenario.FIRE]: () => fire(binId),
  };

  const handler = handlers[scenario];
  if (!handler) return { ok: false, message: `Unknown scenario: ${scenario}` };

  try {
    await handler();

    await logEvent({
      kind: EventKind.SIMULATION_TOGGLED,
      binId,
      detail: `Simulated scenario: ${describeScenario(scenario)}`,
    });

    emit(Events.SIMULATION_SCENARIO, { scenario, binId });

    return { ok: true, message: `${describeScenario(scenario)} applied to ${binId}.` };
  } catch (err) {
    console.error('[simulation] scenario failed', scenario, binId, err);
    return { ok: false, message: err.message ?? 'Scenario failed.' };
  }
}

/* --- Individual scenario implementations ---------------------------------- */

/**
 * Write a fill level as a physically coherent sensor reading.
 *
 * The distance is derived from the fill percentage rather than invented, so
 * a simulated bin's telemetry is internally consistent — the distance and
 * the percentage agree, exactly as they would from real hardware.
 */
async function writeFill(binId, fillPct, depthCm, live) {
  await writeBinTelemetry(binId, {
    distanceCm: fillPercentToDistance(fillPct, depthCm),
    batteryPct: live.batteryPct ?? 92,
    rssi: live.rssi ?? -52,
    uptimeSec: live.uptimeSec ?? 3600,
    firmware: live.firmware ?? '1.0.0-sim',
  }, depthCm);
}

/**
 * Sensor failure — an out-of-range reading plus a health flag.
 * Mirrors the oblique-echo artifacts described in report §5.2 item 1.
 */
async function sensorFailure(binId, depthCm, live) {
  await write(DB_PATH.binLive(binId), {
    distanceCm: 0,                 // no echo returned
    fillPct: live.fillPct ?? 0,    // last known value retained
    binStatus: live.binStatus ?? 'Empty',
    messageStatus: 'Delivered',
    batteryPct: live.batteryPct ?? 90,
    rssi: live.rssi ?? -55,
    uptimeSec: live.uptimeSec ?? 3600,
    firmware: '1.0.0-sim',
    timestamp: Date.now(),
  });

  await update(DB_PATH.binHealth(binId), {
    sensorOk: false,
    updatedAt: Date.now(),
  });
}

/**
 * ESP32 restart — uptime resets to zero, everything else persists.
 */
async function esp32Restart(binId, depthCm, live, currentFill) {
  await writeBinTelemetry(binId, {
    distanceCm: fillPercentToDistance(currentFill, depthCm),
    batteryPct: live.batteryPct ?? 90,
    rssi: live.rssi ?? -55,
    uptimeSec: 0,                  // the tell-tale sign of a reboot
    firmware: '1.0.0-sim',
  }, depthCm);

  await update(DB_PATH.binHealth(binId), {
    sensorOk: true,
    lastRestart: Date.now(),
  });

  await logEvent({
    kind: EventKind.DEVICE_ONLINE,
    binId,
    detail: `${binId} restarted — uptime reset`,
  });
}

/**
 * Network failure — stop writing.
 *
 * There is nothing to write, which is exactly the point: the stale-detection
 * timer in listeners.js will notice the silence and mark the bin offline
 * after three missed intervals. Simulating "no data" by writing a "no data"
 * flag would test the wrong thing.
 */
async function networkFailure(binId) {
  activeRuns.delete(binId);

  await update(DB_PATH.binHealth(binId), {
    wifiOk: false,
    updatedAt: Date.now(),
  });

  await logEvent({
    kind: EventKind.DEVICE_OFFLINE,
    binId,
    detail: `${binId} simulated network failure — transmissions halted. ` +
            `Bin will be marked offline after ${TIMING.STALE_MULTIPLIER} missed intervals.`,
  });
}

/**
 * Firebase disconnect — exercises the connection state machine.
 */
async function firebaseDisconnect() {
  const { getFirebaseDb, getSdk } = await import('../../firebase/init.js');
  const db = getFirebaseDb();
  const { db: sdk } = getSdk();

  sdk.goOffline(db);

  // Restore automatically. A permanently offline demo is a broken demo, and
  // an examiner should see the reconnection behaviour too.
  setTimeout(() => {
    try { sdk.goOnline(db); } catch { /* already restored */ }
  }, 12000);
}

/**
 * Truck collection — empty the bin and resolve its alerts.
 * The full closed loop the literature survey says most systems lack.
 */
async function truckCollection(binId, depthCm, live) {
  await writeBinTelemetry(binId, {
    distanceCm: depthCm,           // sensor now sees the bin floor
    batteryPct: live.batteryPct ?? 90,
    rssi: live.rssi ?? -55,
    uptimeSec: live.uptimeSec ?? 3600,
    firmware: '1.0.0-sim',
  }, depthCm);

  const resolved = await resolveAlertsForBin(binId);

  await logEvent({
    kind: EventKind.COLLECTION_COMPLETED,
    binId,
    detail: `${binId} collected (simulated)` +
            (resolved ? ` · ${resolved} alert${resolved === 1 ? '' : 's'} resolved` : ''),
  });
}

/**
 * Rain — humidity rises and sensor variance widens.
 *
 * Writes to reserved/, since no humidity sensor is fitted. The UI labels
 * these values as Phase-II and simulated wherever they appear.
 */
async function rain(binId) {
  await update(DB_PATH.binReserved(binId), {
    humidityPct: 88 + Math.round(Math.random() * 8),
    temperatureC: 22 + Math.round(Math.random() * 3),
    updatedAt: Date.now(),
  });
}

/**
 * Fire — temperature spike. Also writes to reserved/.
 */
async function fire(binId) {
  await update(DB_PATH.binReserved(binId), {
    temperatureC: 68 + Math.round(Math.random() * 25),
    gasPpm: 400 + Math.round(Math.random() * 300),
    updatedAt: Date.now(),
  });
}

/* ---------------------------------------------------------------------------
 * CONTINUOUS SCENARIOS
 * ------------------------------------------------------------------------- */

/**
 * Begin a continuous scenario that advances on each tick.
 * @param {string} binId
 * @param {{scenario: string, ratePerTick: number, batteryDrain: number}} config
 */
function startContinuous(binId, config) {
  activeRuns.set(binId, config);
  startTicker();
}

/**
 * Stop a continuous scenario for one bin.
 * @param {string} binId
 */
export function stopScenario(binId) {
  activeRuns.delete(binId);
  if (activeRuns.size === 0) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

/**
 * @returns {string[]} Bin IDs under continuous simulation.
 */
export function runningBins() {
  return [...activeRuns.keys()];
}

/**
 * The tick loop.
 *
 * Runs every 2 seconds rather than the real 60-second interval, so a
 * demonstration does not require standing in front of a screen for an hour
 * waiting for a bin to fill. The write path is identical; only the cadence
 * differs, and the provenance badge makes clear these are not real readings.
 */
function startTicker() {
  if (tickTimer) return;

  tickTimer = setInterval(async () => {
    if (activeRuns.size === 0) {
      clearInterval(tickTimer);
      tickTimer = null;
      return;
    }

    for (const [binId, config] of activeRuns) {
      const bin = getBin(binId);
      if (!bin) { activeRuns.delete(binId); continue; }

      const depthCm = bin.meta?.depthCm ?? SENSOR.DEFAULT_DEPTH_CM;
      const live = bin.live ?? {};

      const currentFill = Number.isFinite(live.fillPct) ? live.fillPct : 0;
      const nextFill = Math.min(100, currentFill + config.ratePerTick);

      const currentBattery = Number.isFinite(live.batteryPct) ? live.batteryPct : 100;
      const nextBattery = Math.max(0, currentBattery - config.batteryDrain);

      try {
        await writeBinTelemetry(binId, {
          distanceCm: fillPercentToDistance(nextFill, depthCm),
          batteryPct: Math.round(nextBattery * 10) / 10,
          // Small realistic jitter — a perfectly constant RSSI looks synthetic
          // to anyone who has watched real Wi-Fi telemetry.
          rssi: clampRssi((live.rssi ?? -52) + (Math.random() * 4 - 2)),
          uptimeSec: (live.uptimeSec ?? 0) + 2,
          firmware: '1.0.0-sim',
        }, depthCm);
      } catch (err) {
        console.error('[simulation] tick write failed for', binId, err);
      }

      // Stop conditions — a scenario that has reached its endpoint ends.
      if (config.ratePerTick > 0 && nextFill >= 100) stopScenario(binId);
      if (config.batteryDrain > 0 && nextBattery <= 0) stopScenario(binId);
    }
  }, 2000);
}

/**
 * @param {number} rssi
 * @returns {number}
 */
function clampRssi(rssi) {
  return Math.round(Math.min(-30, Math.max(-95, rssi)));
}

/* ---------------------------------------------------------------------------
 * PROVENANCE
 * ------------------------------------------------------------------------- */

/**
 * Flag a bin as simulated.
 *
 * Called before any simulated write. Once flagged, the bin stays badged until
 * a real ESP32 writes to it, at which point db.service promotes it back to
 * `device`. There is no path by which simulated data can appear unlabelled.
 *
 * @param {string} binId
 */
async function markSimulated(binId) {
  const bin = getBin(binId);
  if (bin?.meta?.source === DataSource.SIMULATED) return;

  await update(DB_PATH.binMeta(binId), { source: DataSource.SIMULATED });
}

/**
 * Reset a bin's provenance to placeholder, clearing simulated data.
 *
 * @param {string} binId
 * @returns {Promise<void>}
 */
export async function clearSimulation(binId) {
  stopScenario(binId);

  await update(DB_PATH.binMeta(binId), { source: DataSource.PLACEHOLDER });
  await update(DB_PATH.binHealth(binId), { sensorOk: true, wifiOk: true });
  await write(DB_PATH.binReserved(binId), {
    temperatureC: null, humidityPct: null, gasPpm: null,
  });

  await logEvent({
    kind: EventKind.SIMULATION_TOGGLED,
    binId,
    detail: `Simulation cleared for ${binId} — provenance reset to awaiting hardware`,
  });
}

/* ---------------------------------------------------------------------------
 * METADATA
 * ------------------------------------------------------------------------- */

/**
 * Human-readable scenario catalogue, for the control panel.
 * @returns {Array<{id: string, label: string, description: string, tone: string, phaseII: boolean}>}
 */
export function scenarioCatalogue() {
  return [
    { id: Scenario.INCREASE_WASTE, label: 'Increase waste', tone: 'warning',
      description: 'Fill level rises continuously, crossing both band boundaries and triggering the alert threshold naturally.' },
    { id: Scenario.DECREASE_WASTE, label: 'Decrease waste', tone: 'info',
      description: 'Fill level drops by 15 points, as it would from settling or compaction.' },
    { id: Scenario.SENSOR_FAILURE, label: 'Sensor failure', tone: 'critical',
      description: 'HC-SR04 returns no echo. Reproduces the oblique-echo artifacts documented in report §5.2.' },
    { id: Scenario.ESP32_RESTART, label: 'ESP32 restart', tone: 'warning',
      description: 'Device uptime resets to zero while readings continue — the signature of an unexpected reboot.' },
    { id: Scenario.NETWORK_FAILURE, label: 'Network failure', tone: 'critical',
      description: `Transmissions stop. The bin is marked offline after ${TIMING.STALE_MULTIPLIER} missed intervals by the stale-detection timer.` },
    { id: Scenario.FIREBASE_DISCONNECT, label: 'Firebase disconnect', tone: 'critical',
      description: 'Forces the client offline for 12 seconds, exercising the connection state machine and the offline write queue.' },
    { id: Scenario.BATTERY_DRAIN, label: 'Battery drain', tone: 'warning',
      description: `Battery falls continuously, crossing the ${THRESHOLDS.BATTERY_WARN_PCT}% warning and ${THRESHOLDS.BATTERY_CRIT_PCT}% critical thresholds.` },
    { id: Scenario.TRUCK_COLLECTION, label: 'Truck collection', tone: 'healthy',
      description: 'Bin emptied to zero and all its open alerts resolved — the complete monitoring-to-action loop.' },
    { id: Scenario.EMERGENCY_OVERFLOW, label: 'Emergency overflow', tone: 'critical',
      description: 'Immediate jump to 100%, raising a critical overflow alert.' },
    { id: Scenario.RAIN, label: 'Rain', tone: 'info', phaseII: true,
      description: 'Humidity rises. Writes to reserved schema fields — no humidity sensor is fitted to this prototype.' },
    { id: Scenario.FIRE, label: 'Fire', tone: 'critical', phaseII: true,
      description: 'Temperature and gas readings spike. Writes to reserved schema fields — no such sensors are fitted.' },
  ].map((s) => ({ ...s, phaseII: PHASE_II_SCENARIOS.includes(s.id) }));
}

/**
 * @param {string} scenario
 * @returns {string}
 */
function describeScenario(scenario) {
  return scenarioCatalogue().find((s) => s.id === scenario)?.label ?? scenario;
}

export default {
  setSimulationMode, isSimulationOn, runScenario, stopScenario, stopAll,
  runningBins, clearSimulation, scenarioCatalogue,
};
