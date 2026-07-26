/**
 * SmartBin+ — KPI Computation
 * =============================================================================
 * Derives every dashboard metric from live bin, alert and route data.
 *
 * Two rules govern this file.
 *
 * 1. **Nothing is invented.** Every number traces to a real record. Where a
 *    figure cannot be computed from available data it returns `null`, and the
 *    UI renders an em dash. A dashboard that shows a plausible-looking zero
 *    instead of admitting ignorance is worse than one that shows nothing.
 *
 * 2. **Assumptions are declared.** Fuel, CO₂ and time savings depend on
 *    constants in app.config.js. Each returned metric carries a `note`
 *    explaining its basis, which the UI surfaces as a tooltip.
 *
 * @module js/utils/kpi
 */

import { BinStatus, DeviceState, AlertState, AlertSeverity, DataSource } from '../../config/constants.js';
import { THRESHOLDS, DERIVED_METRICS, TIMING } from '../../config/app.config.js';

/**
 * @typedef {Object} Metric
 * @property {number|null} value
 * @property {string} [unit]
 * @property {string} [note]      Assumption or derivation, shown as a tooltip.
 * @property {string} [tone]      healthy | warning | critical | info | offline
 */

/**
 * Fleet-wide counts by status.
 *
 * @param {object[]} bins
 * @returns {{total: number, healthy: number, warning: number, critical: number, offline: number}}
 */
export function countBinsByStatus(bins) {
  const counts = { total: bins.length, healthy: 0, warning: 0, critical: 0, offline: 0 };

  for (const bin of bins) {
    // Offline takes precedence: a bin that last reported 30% two days ago is
    // not "healthy", it is unknown. Counting it as healthy would be the exact
    // false reassurance this system exists to eliminate.
    if (bin.deviceState === DeviceState.OFFLINE) {
      counts.offline++;
      continue;
    }

    switch (bin.live?.binStatus) {
      case BinStatus.EMPTY: counts.healthy++;  break;
      case BinStatus.HALF:  counts.warning++;  break;
      case BinStatus.FULL:  counts.critical++; break;
      default:              counts.offline++;  break;   // never reported
    }
  }

  return counts;
}

/**
 * Mean fill level across bins that have actually reported.
 *
 * Offline bins are excluded rather than counted as zero — including them
 * would drag the average down and imply the city is cleaner than it is.
 *
 * @param {object[]} bins
 * @returns {Metric}
 */
export function averageFillLevel(bins) {
  const reporting = bins.filter(
    (b) => Number.isFinite(b.live?.fillPct) && b.deviceState !== DeviceState.OFFLINE
  );

  if (reporting.length === 0) {
    return { value: null, unit: '%', note: 'No bins are currently reporting.', tone: 'offline' };
  }

  const mean = reporting.reduce((sum, b) => sum + b.live.fillPct, 0) / reporting.length;

  return {
    value: Math.round(mean * 10) / 10,
    unit: '%',
    note: `Mean across ${reporting.length} reporting bin${reporting.length === 1 ? '' : 's'}. Offline bins excluded.`,
    tone: mean >= THRESHOLDS.ALERT_PCT ? 'critical'
        : mean >= THRESHOLDS.BAND_EMPTY_MAX ? 'warning'
        : 'healthy',
  };
}

/**
 * Collection efficiency — the proportion of bins that would be skipped by a
 * needs-based route compared with visiting every bin.
 *
 * This is the core claim of the project (report Objective 6), expressed as a
 * single number: how much of a traditional round is wasted effort right now.
 *
 * @param {object[]} bins
 * @returns {Metric}
 */
export function collectionEfficiency(bins) {
  const reporting = bins.filter((b) => Number.isFinite(b.live?.fillPct));

  if (reporting.length === 0) {
    return { value: null, unit: '%', note: 'No reporting bins.', tone: 'offline' };
  }

  const needCollection = reporting.filter(
    (b) => b.live.fillPct >= (b.meta?.thresholdPct ?? THRESHOLDS.ALERT_PCT)
  ).length;

  const skipped = reporting.length - needCollection;
  const efficiency = (skipped / reporting.length) * 100;

  return {
    value: Math.round(efficiency),
    unit: '%',
    note: `${skipped} of ${reporting.length} bins can be skipped this round — trips avoided versus visiting every bin.`,
    tone: 'healthy',
  };
}

/**
 * Bins currently at or above their alert threshold.
 *
 * @param {object[]} bins
 * @returns {object[]} Sorted by fill level, fullest first.
 */
export function binsNeedingCollection(bins) {
  return bins
    .filter((b) => {
      const threshold = b.meta?.thresholdPct ?? THRESHOLDS.ALERT_PCT;
      return Number.isFinite(b.live?.fillPct) && b.live.fillPct >= threshold;
    })
    .sort((a, b) => b.live.fillPct - a.live.fillPct);
}

/**
 * Distance, fuel, CO₂ and time saved by the optimised route.
 *
 * ALL of these are derived from the assumptions in app.config.js. The `note`
 * on each states the basis so the figure is never presented as measured.
 *
 * @param {object|null} route  Latest optimised route.
 * @param {object} config      Runtime config, overriding defaults.
 * @returns {{distanceSaved: Metric, fuelSaved: Metric, co2Saved: Metric, timeSaved: Metric}}
 */
export function calculateSavings(route, config = {}) {
  const kmPerL = config.truckKmPerL ?? DERIVED_METRICS.TRUCK_KM_PER_L.value;
  const co2PerL = config.co2KgPerL ?? DERIVED_METRICS.CO2_KG_PER_L.value;
  const avgSpeed = config.avgSpeedKmph ?? DERIVED_METRICS.AVG_SPEED_KMPH.value;

  const empty = (note) => ({ value: null, note, tone: 'offline' });

  if (!route || !Number.isFinite(route.savedKm)) {
    const note = 'No optimised route has been generated yet.';
    return {
      distanceSaved: empty(note),
      fuelSaved: empty(note),
      co2Saved: empty(note),
      timeSaved: empty(note),
    };
  }

  const savedKm = route.savedKm;
  const fuelSavedL = savedKm / kmPerL;
  const co2SavedKg = fuelSavedL * co2PerL;
  const timeSavedMin = (savedKm / avgSpeed) * 60;

  return {
    distanceSaved: {
      value: Math.round(savedKm * 10) / 10,
      unit: 'km',
      note: `Optimised route (${route.optimizedKm?.toFixed(1)} km) versus visiting every bin (${route.traditionalKm?.toFixed(1)} km). Straight-line distance; actual road distance will be higher.`,
      tone: 'healthy',
    },
    fuelSaved: {
      value: Math.round(fuelSavedL * 100) / 100,
      unit: 'L',
      note: `Calculated as ${savedKm.toFixed(1)} km ÷ ${kmPerL} km/L. Vehicle fuel economy is an assumption, not a measurement.`,
      tone: 'healthy',
    },
    co2Saved: {
      value: Math.round(co2SavedKg * 100) / 100,
      unit: 'kg',
      note: `Calculated as ${fuelSavedL.toFixed(2)} L × ${co2PerL} kg CO₂/L (standard diesel emission factor).`,
      tone: 'healthy',
    },
    timeSaved: {
      value: Math.round(timeSavedMin),
      unit: 'min',
      note: `Driving time only, at an assumed ${avgSpeed} km/h average urban speed.`,
      tone: 'healthy',
    },
  };
}

/**
 * Collections completed within a time window, from timeline events.
 *
 * @param {object[]} events
 * @param {number} sinceMs
 * @returns {number}
 */
export function countCollections(events, sinceMs) {
  return events.filter(
    (e) => e.kind === 'COLLECTION_COMPLETED' && e.timestamp >= sinceMs
  ).length;
}

/** @param {object[]} events @returns {Metric} */
export function collectionsToday(events) {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);

  return {
    value: countCollections(events, midnight.getTime()),
    note: 'Collections logged since midnight.',
    tone: 'info',
  };
}

/** @param {object[]} events @returns {Metric} */
export function collectionsThisWeek(events) {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  return {
    value: countCollections(events, weekAgo),
    note: 'Collections logged in the past seven days.',
    tone: 'info',
  };
}

/**
 * Most recent telemetry write across the fleet.
 *
 * @param {object[]} bins
 * @returns {Metric}
 */
export function lastSynchronisation(bins) {
  const timestamps = bins
    .map((b) => b.live?.timestamp)
    .filter(Number.isFinite);

  if (timestamps.length === 0) {
    return { value: null, note: 'No bin has reported yet.', tone: 'offline' };
  }

  const latest = Math.max(...timestamps);
  const ageSec = (Date.now() - latest) / 1000;

  return {
    value: latest,
    note: `Most recent reading received from any bin.`,
    tone: ageSec > TIMING.POLL_INTERVAL_SEC * TIMING.STALE_MULTIPLIER ? 'critical'
        : ageSec > TIMING.POLL_INTERVAL_SEC * 1.5 ? 'warning'
        : 'healthy',
  };
}

/**
 * Fleet sensor health — the proportion of bins reporting a working sensor.
 *
 * @param {object[]} bins
 * @returns {Metric}
 */
export function sensorHealth(bins) {
  const withHealth = bins.filter((b) => b.health && 'sensorOk' in b.health);

  if (withHealth.length === 0) {
    return { value: null, unit: '%', note: 'No bins are reporting sensor health.', tone: 'offline' };
  }

  const ok = withHealth.filter((b) => b.health.sensorOk !== false).length;
  const pct = (ok / withHealth.length) * 100;

  return {
    value: Math.round(pct),
    unit: '%',
    note: `${ok} of ${withHealth.length} bins report a healthy ultrasonic sensor.`,
    tone: pct === 100 ? 'healthy' : pct >= 75 ? 'warning' : 'critical',
  };
}

/**
 * Lowest battery in the fleet — the one that will fail first.
 *
 * @param {object[]} bins
 * @returns {Metric}
 */
export function lowestBattery(bins) {
  const levels = bins
    .map((b) => ({ binId: b.binId, pct: b.live?.batteryPct }))
    .filter((b) => Number.isFinite(b.pct));

  if (levels.length === 0) {
    return { value: null, unit: '%', note: 'No bins are reporting battery level.', tone: 'offline' };
  }

  const lowest = levels.reduce((min, b) => (b.pct < min.pct ? b : min));

  return {
    value: Math.round(lowest.pct),
    unit: '%',
    note: `Lowest in fleet — ${lowest.binId}.`,
    tone: lowest.pct <= THRESHOLDS.BATTERY_CRIT_PCT ? 'critical'
        : lowest.pct <= THRESHOLDS.BATTERY_WARN_PCT ? 'warning'
        : 'healthy',
  };
}

/**
 * Alert counts by state and severity.
 *
 * @param {object[]} alerts
 * @returns {{active: number, critical: number, warning: number, acknowledged: number, resolved: number}}
 */
export function countAlerts(alerts) {
  const counts = { active: 0, critical: 0, warning: 0, acknowledged: 0, resolved: 0 };

  for (const alert of alerts) {
    if (alert.state === AlertState.RESOLVED) { counts.resolved++; continue; }
    if (alert.state === AlertState.ACKNOWLEDGED) counts.acknowledged++;

    counts.active++;
    if (alert.severity === AlertSeverity.CRITICAL) counts.critical++;
    else if (alert.severity === AlertSeverity.WARNING) counts.warning++;
  }

  return counts;
}

/**
 * Mean time from an alert being raised to being acknowledged.
 *
 * A useful operational measure: the system detecting an overflow quickly is
 * only half the value if nobody acts on it for six hours.
 *
 * @param {object[]} alerts
 * @returns {Metric}
 */
export function meanResponseTime(alerts) {
  const acknowledged = alerts.filter(
    (a) => Number.isFinite(a.raisedAt) && Number.isFinite(a.acknowledgedAt)
  );

  if (acknowledged.length === 0) {
    return { value: null, unit: 'min', note: 'No alerts have been acknowledged yet.', tone: 'offline' };
  }

  const totalMs = acknowledged.reduce(
    (sum, a) => sum + (a.acknowledgedAt - a.raisedAt), 0
  );
  const meanMin = totalMs / acknowledged.length / 60000;

  return {
    value: Math.round(meanMin * 10) / 10,
    unit: 'min',
    note: `Mean time from alert raised to acknowledged, across ${acknowledged.length} alert${acknowledged.length === 1 ? '' : 's'}.`,
    tone: meanMin <= 15 ? 'healthy' : meanMin <= 60 ? 'warning' : 'critical',
  };
}

/**
 * Provenance breakdown — how much of what is displayed is real.
 *
 * This drives the global banner. It is the first thing an examiner should be
 * able to see and the last thing that should ever be hidden.
 *
 * @param {object[]} bins
 * @returns {{device: number, simulated: number, placeholder: number, total: number, isFullyLive: boolean}}
 */
export function provenanceBreakdown(bins) {
  const summary = { device: 0, simulated: 0, placeholder: 0, total: bins.length };

  for (const bin of bins) {
    const source = bin.meta?.source ?? DataSource.PLACEHOLDER;
    if (source in summary) summary[source]++;
  }

  return { ...summary, isFullyLive: summary.total > 0 && summary.device === summary.total };
}

/**
 * Zones ranked by mean fill level — where attention is most needed.
 *
 * @param {object[]} bins
 * @returns {Array<{zone: string, meanFill: number, binCount: number, criticalCount: number}>}
 */
export function zonesByUrgency(bins) {
  const zones = new Map();

  for (const bin of bins) {
    const zone = bin.meta?.zone ?? 'Unzoned';
    if (!zones.has(zone)) zones.set(zone, { fills: [], critical: 0 });

    const entry = zones.get(zone);
    if (Number.isFinite(bin.live?.fillPct)) {
      entry.fills.push(bin.live.fillPct);
      if (bin.live.fillPct >= THRESHOLDS.ALERT_PCT) entry.critical++;
    }
  }

  return [...zones.entries()]
    .map(([zone, { fills, critical }]) => ({
      zone,
      meanFill: fills.length
        ? Math.round((fills.reduce((a, b) => a + b, 0) / fills.length) * 10) / 10
        : 0,
      binCount: fills.length,
      criticalCount: critical,
    }))
    .sort((a, b) => b.meanFill - a.meanFill);
}

export default {
  countBinsByStatus, averageFillLevel, collectionEfficiency, binsNeedingCollection,
  calculateSavings, countCollections, collectionsToday, collectionsThisWeek,
  lastSynchronisation, sensorHealth, lowestBattery, countAlerts, meanResponseTime,
  provenanceBreakdown, zonesByUrgency,
};
