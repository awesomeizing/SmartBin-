/**
 * SmartBin+ — Route Optimization
 * =============================================================================
 * Builds an optimised collection route and compares it against the traditional
 * fixed round.
 *
 * THE COMPARISON IS THE POINT. Report §1.1 describes the problem precisely:
 * "bins in low-traffic residential zones receive unnecessary collections when
 * barely 20% full." The baseline route here models exactly that — visit every
 * bin, in registration order, regardless of fill level. The optimised route
 * visits only bins at or above threshold, in an efficient order. The delta
 * between them is the project's central claim, quantified.
 *
 * ALGORITHM
 * Nearest-neighbour construction followed by 2-opt improvement, over a
 * haversine cost matrix.
 *
 * The literature survey (§VI) recommends Dijkstra and A*. Both are
 * shortest-path algorithms over a road graph. With no road graph available,
 * the problem here is stop *ordering* — a travelling-salesman variant — for
 * which 2-opt is the correct counterpart. Road-network routing is Phase-II
 * scope per report §2.3. This distinction is stated in the README and shown
 * in the UI rather than glossed over.
 *
 * @module js/utils/route
 */

import {
  haversineKm, buildCostMatrix, tourLength,
  nearestNeighbourTour, twoOptImprove, estimateTravelMinutes,
} from './geo.js';
import { calculateCollectionPriority } from './fill.js';
import { DEPLOYMENT, DERIVED_METRICS, ROUTING } from '../../config/app.config.js';

/**
 * @typedef {Object} RouteStop
 * @property {string} binId
 * @property {string} label
 * @property {{lat: number, lng: number}} location
 * @property {number} fillPct
 * @property {number} legKm       Distance from the previous stop.
 * @property {number} etaMinutes  Cumulative estimated arrival time.
 */

/**
 * @typedef {Object} OptimizedRoute
 * @property {RouteStop[]} stops
 * @property {RouteStop[]} baselineStops
 * @property {number} optimizedKm
 * @property {number} traditionalKm
 * @property {number} savedKm
 * @property {number} fuelSavedL
 * @property {number} co2SavedKg
 * @property {number} timeSavedMin
 * @property {number} optimizedMinutes
 * @property {number} binsSkipped
 * @property {object} meta
 */

/**
 * Build an optimised route for the bins that need collection.
 *
 * @param {object[]} bins       All registered bins.
 * @param {object} [config]     Runtime config from Firebase /config.
 * @returns {OptimizedRoute|null} Null when nothing needs collecting.
 */
export function optimizeRoute(bins, config = {}) {
  const depot = DEPLOYMENT.DEPOT;

  const kmPerL   = config.truckKmPerL      ?? DERIVED_METRICS.TRUCK_KM_PER_L.value;
  const co2PerL  = config.co2KgPerL        ?? DERIVED_METRICS.CO2_KG_PER_L.value;
  const avgSpeed = config.avgSpeedKmph     ?? DERIVED_METRICS.AVG_SPEED_KMPH.value;
  const service  = config.serviceMinPerBin ?? DERIVED_METRICS.SERVICE_TIME_MIN_PER_BIN.value;

  // Only bins with usable coordinates can be routed at all.
  const routable = bins.filter((b) =>
    Number.isFinite(b.meta?.location?.lat) && Number.isFinite(b.meta?.location?.lng)
  );

  if (routable.length === 0) return null;

  // --- Candidates: bins at or above their threshold ------------------------
  const candidates = routable.filter((bin) => {
    const threshold = bin.meta?.thresholdPct ?? ROUTING.MIN_FILL_PCT;
    return Number.isFinite(bin.live?.fillPct) && bin.live.fillPct >= threshold;
  });

  if (candidates.length === 0) {
    const idle = buildBaseline(routable, depot, avgSpeed, service);

    return {
      stops: [],
      baselineStops: idle.stops,
      optimizedKm: 0,
      traditionalKm: round(idle.km),
      // Every kilometre of a scheduled round is avoided when nothing needs
      // collecting — that is the whole saving, not a partial one.
      savedKm: round(idle.km),
      fuelSavedL: 0,
      co2SavedKg: 0,
      timeSavedMin: 0,
      optimizedMinutes: 0,
      binsSkipped: routable.length,
      meta: {
        note: 'No bins have reached their collection threshold. A traditional fixed round would still visit every bin.',
        algorithm: 'nearest-neighbour + 2-opt',
        distanceModel: 'haversine (straight line)',
        candidateCount: 0,
        totalBins: routable.length,
      },
    };
  }

  // --- Optimise ------------------------------------------------------------
  // Index 0 is the depot; the tour starts and ends there.
  const points = [depot, ...candidates.map((b) => b.meta.location)];
  const matrix = buildCostMatrix(points);

  const initialTour = nearestNeighbourTour(matrix, 0);
  const { order, passes, improvedKm } = twoOptImprove(
    initialTour, matrix, ROUTING.TWO_OPT_MAX_PASSES
  );

  const optimizedKm = tourLength(order, matrix, true);

  // --- Build the stop list with legs and cumulative ETAs -------------------
  const stops = [];
  let cumulativeKm = 0;

  for (let i = 1; i < order.length; i++) {
    const bin = candidates[order[i] - 1];   // −1 because index 0 is the depot
    const legKm = matrix[order[i - 1]][order[i]];

    cumulativeKm += legKm;

    stops.push({
      binId: bin.binId,
      label: bin.meta?.label ?? bin.binId,
      zone: bin.meta?.zone ?? 'Unzoned',
      location: bin.meta.location,
      fillPct: bin.live.fillPct,
      priority: calculateCollectionPriority(bin).label,
      source: bin.meta?.source,
      legKm: Math.round(legKm * 1000) / 1000,
      etaMinutes: estimateTravelMinutes(cumulativeKm, avgSpeed, stops.length, service),
    });
  }

  // --- Baseline: every bin, registration order -----------------------------
  const baseline = buildBaseline(routable, depot, avgSpeed, service);

  // --- Savings -------------------------------------------------------------
  const savedKm = Math.max(0, baseline.km - optimizedKm);
  const fuelSavedL = savedKm / kmPerL;
  const co2SavedKg = fuelSavedL * co2PerL;

  const optimizedMinutes = estimateTravelMinutes(optimizedKm, avgSpeed, stops.length, service);
  const timeSavedMin = Math.max(0, baseline.minutes - optimizedMinutes);

  return {
    stops,
    baselineStops: baseline.stops,
    optimizedKm: round(optimizedKm),
    traditionalKm: round(baseline.km),
    savedKm: round(savedKm),
    fuelSavedL: round(fuelSavedL, 2),
    co2SavedKg: round(co2SavedKg, 2),
    timeSavedMin: Math.round(timeSavedMin),
    optimizedMinutes,
    binsSkipped: routable.length - candidates.length,
    meta: {
      algorithm: 'nearest-neighbour + 2-opt',
      twoOptPasses: passes,
      twoOptGainKm: improvedKm,
      distanceModel: 'haversine (straight line)',
      candidateCount: candidates.length,
      totalBins: routable.length,
      assumptions: {
        fuelEconomy: `${kmPerL} km/L`,
        emissionFactor: `${co2PerL} kg CO₂/L`,
        averageSpeed: `${avgSpeed} km/h`,
        serviceTime: `${service} min per bin`,
      },
      note:
        'Distances are straight-line. Actual road distance will be higher, ' +
        'typically by 20–40% in an urban grid. Road-network routing is Phase-II scope.',
    },
  };
}

/**
 * The traditional fixed round: every bin, in registration order.
 *
 * This is not a strawman — it is the documented status quo. Report §1.1:
 * "Municipal waste collection systems across most urban centers continue to
 * operate on rigid, time-based schedules that bear no relationship to the
 * actual fill state of individual bins."
 *
 * @param {object[]} bins
 * @param {{lat: number, lng: number}} depot
 * @param {number} avgSpeed
 * @param {number} service
 * @returns {{stops: object[], km: number, minutes: number}}
 */
function buildBaseline(bins, depot, avgSpeed, service) {
  const ordered = [...bins].sort((a, b) => a.binId.localeCompare(b.binId));

  const stops = [];
  let km = 0;
  let previous = depot;

  for (const bin of ordered) {
    const legKm = haversineKm(previous, bin.meta.location);
    km += legKm;

    stops.push({
      binId: bin.binId,
      label: bin.meta?.label ?? bin.binId,
      location: bin.meta.location,
      fillPct: bin.live?.fillPct ?? null,
      legKm: round(legKm, 3),
    });

    previous = bin.meta.location;
  }

  // Return leg to the depot.
  if (ordered.length > 0) km += haversineKm(previous, depot);

  return {
    stops,
    km,
    minutes: estimateTravelMinutes(km, avgSpeed, ordered.length, service),
  };
}

/**
 * Describe the efficiency gain in one sentence, for the UI summary.
 *
 * @param {OptimizedRoute} route
 * @returns {string}
 */
export function describeRoute(route) {
  if (!route) return 'No route data available.';

  if (route.stops.length === 0) {
    return 'No bins have reached their collection threshold. ' +
           'A scheduled round would visit all ' + route.meta.totalBins + ' bins unnecessarily.';
  }

  const pct = route.traditionalKm > 0
    ? Math.round((route.savedKm / route.traditionalKm) * 100)
    : 0;

  return `Visiting ${route.stops.length} of ${route.meta.totalBins} bins — ` +
         `${route.binsSkipped} skipped. Route is ${route.savedKm} km shorter than a ` +
         `full round, a ${pct}% reduction in distance travelled.`;
}

/**
 * Interpolated positions along a route, for animating the truck.
 *
 * @param {OptimizedRoute} route
 * @param {{lat: number, lng: number}} [depot]
 * @returns {Array<{lat: number, lng: number}>}
 */
export function routeWaypoints(route, depot = DEPLOYMENT.DEPOT) {
  if (!route?.stops?.length) return [];
  return [depot, ...route.stops.map((s) => s.location), depot];
}

/**
 * @param {number} value
 * @param {number} [decimals=1]
 * @returns {number}
 */
function round(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export default { optimizeRoute, describeRoute, routeWaypoints };
