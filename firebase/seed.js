/**
 * SmartBin+ — Bin Registration (Seed)
 * =============================================================================
 * One-time setup that registers the four physical bins, the collection
 * vehicle, and the default configuration.
 *
 * Run once, from the browser console, signed in as an administrator:
 *
 *     import('./firebase/seed.js').then(m => m.seedDatabase());
 *
 * It is idempotent — running it twice will not duplicate anything, though it
 * will overwrite metadata. Telemetry and history are never touched.
 *
 * ON THE COORDINATES
 * The four bins are placed at provisional points around Global Academy of
 * Technology, Rajarajeshwari Nagar. These are **placeholders**, badged as such
 * throughout the interface, because the physical bin positions have not been
 * surveyed yet. Replace them from Settings → Bins once the real locations are
 * known. No code change is required.
 *
 * @module firebase/seed
 */

import { registerBin, upsertTruck, updateConfig, readOnce, logEvent } from './db.service.js';
import { DataSource, EventKind, TruckStatus, DB_PATH } from '../config/constants.js';
import { THRESHOLDS, TIMING, SENSOR, DEPLOYMENT, DERIVED_METRICS } from '../config/app.config.js';

/**
 * The four planned bins.
 *
 * Coordinates are offset by roughly 100-200 m around the campus centre so the
 * map renders a legible spread rather than four overlapping markers. Every
 * one is provisional.
 */
export const PLANNED_BINS = [
  {
    binId: 'BIN-001',
    label: 'Main Gate',
    zone: 'Zone-A',
    address: 'Main Entrance, Global Academy of Technology, Rajarajeshwari Nagar',
    location: { lat: 12.96060, lng: 77.49000 },
  },
  {
    binId: 'BIN-002',
    label: 'Canteen Block',
    zone: 'Zone-A',
    address: 'Canteen Area, Global Academy of Technology',
    location: { lat: 12.96145, lng: 77.49085 },
  },
  {
    binId: 'BIN-003',
    label: 'CSE Department',
    zone: 'Zone-B',
    address: 'CSE Block, Global Academy of Technology',
    location: { lat: 12.95975, lng: 77.49130 },
  },
  {
    binId: 'BIN-004',
    label: 'Hostel Wing',
    zone: 'Zone-B',
    address: 'Hostel Block, Global Academy of Technology',
    location: { lat: 12.96020, lng: 77.48890 },
  },
];

/** The single collection vehicle in the prototype deployment. */
export const PLANNED_TRUCKS = [
  {
    truckId: 'TRK-01',
    label: 'Collection Vehicle 1',
    status: TruckStatus.IDLE,
    position: { ...DEPLOYMENT.DEPOT },
    capacityL: 5000,
    driver: 'Unassigned',
    assignedRoute: [],
  },
];

/**
 * Register bins, trucks and default config.
 *
 * @param {object} [options]
 * @param {boolean} [options.force=false] Re-register bins that already exist.
 * @returns {Promise<{bins: number, trucks: number, skipped: string[]}>}
 */
export async function seedDatabase({ force = false } = {}) {
  console.info('[seed] starting…');

  const skipped = [];
  let binCount = 0;

  for (const bin of PLANNED_BINS) {
    const existing = await readOnce(DB_PATH.binMeta(bin.binId));

    if (existing && !force) {
      skipped.push(bin.binId);
      console.info(`[seed] ${bin.binId} already registered — skipping.`);
      continue;
    }

    await registerBin({
      ...bin,
      depthCm: SENSOR.DEFAULT_DEPTH_CM,
      thresholdPct: THRESHOLDS.ALERT_PCT,
      // Bins begin as placeholders. The first genuine ESP32 write promotes
      // them to `device` automatically — see db.service writeBinTelemetry.
      source: DataSource.PLACEHOLDER,
    });

    binCount++;
    console.info(`[seed] registered ${bin.binId} — ${bin.label}`);
  }

  let truckCount = 0;
  for (const truck of PLANNED_TRUCKS) {
    await upsertTruck(truck.truckId, truck);
    truckCount++;
    console.info(`[seed] registered ${truck.truckId}`);
  }

  await updateConfig({
    defaultThresholdPct: THRESHOLDS.ALERT_PCT,
    pollIntervalSec: TIMING.POLL_INTERVAL_SEC,
    truckKmPerL: DERIVED_METRICS.TRUCK_KM_PER_L.value,
    co2KgPerL: DERIVED_METRICS.CO2_KG_PER_L.value,
    avgSpeedKmph: DERIVED_METRICS.AVG_SPEED_KMPH.value,
    serviceMinPerBin: DERIVED_METRICS.SERVICE_TIME_MIN_PER_BIN.value,
    simulationMode: false,
    seededAt: Date.now(),
  });

  await logEvent({
    kind: EventKind.DB_UPDATED,
    detail: `Database seeded: ${binCount} bins, ${truckCount} vehicles registered`,
  });

  const result = { bins: binCount, trucks: truckCount, skipped };

  console.info('[seed] complete.', result);
  console.info(
    '[seed] NOTE: bin coordinates are placeholders around GAT campus. ' +
    'Update them in Settings → Bins once the physical positions are surveyed.'
  );

  return result;
}

/**
 * Has the database been seeded?
 * @returns {Promise<boolean>}
 */
export async function isSeeded() {
  const bins = await readOnce(DB_PATH.BINS);
  return Boolean(bins && Object.keys(bins).length > 0);
}

/**
 * Remove all seeded bins and trucks.
 *
 * Destructive and intended only for development resets. Requires an explicit
 * confirmation string rather than a boolean, because a mistyped `true` should
 * not be able to wipe a demo an hour before a review.
 *
 * @param {string} confirmation Must be exactly 'DELETE ALL BINS'.
 * @returns {Promise<void>}
 */
export async function clearSeed(confirmation) {
  if (confirmation !== 'DELETE ALL BINS') {
    throw new Error(
      "clearSeed() requires the exact confirmation string 'DELETE ALL BINS'."
    );
  }

  const { deleteBin, remove } = await import('./db.service.js');

  for (const bin of PLANNED_BINS) {
    await deleteBin(bin.binId);
    console.info(`[seed] removed ${bin.binId}`);
  }

  for (const truck of PLANNED_TRUCKS) {
    await remove(DB_PATH.truck(truck.truckId));
  }

  console.info('[seed] cleared.');
}

export default { seedDatabase, isSeeded, clearSeed, PLANNED_BINS, PLANNED_TRUCKS };
