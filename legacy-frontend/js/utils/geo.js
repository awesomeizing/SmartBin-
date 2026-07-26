/**
 * SmartBin+ — Geospatial Utilities
 * =============================================================================
 * Distance, bearing and route-cost calculations.
 *
 * IMPORTANT LIMITATION, stated once here and surfaced in the UI:
 * every distance in this module is **great-circle (haversine)** — straight
 * line between two coordinates. Real collection vehicles drive on roads, so
 * actual distances are longer, typically by 20-40% in an urban grid.
 *
 * Road-network routing needs a road graph and a routing engine, which the
 * project report places in Phase-II scope (§2.3). Using haversine and saying
 * so is more defensible than implying a road-accurate figure we cannot
 * produce.
 *
 * @module js/utils/geo
 */

/** Mean Earth radius in kilometres. */
const EARTH_RADIUS_KM = 6371;

/** @typedef {{lat: number, lng: number}} LatLng */

/**
 * Great-circle distance between two coordinates.
 *
 * @param {LatLng} a
 * @param {LatLng} b
 * @returns {number} Distance in kilometres.
 */
export function haversineKm(a, b) {
  if (!isValidCoord(a) || !isValidCoord(b)) return 0;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Initial bearing from `a` to `b`. Used to orient the truck marker.
 *
 * @param {LatLng} a
 * @param {LatLng} b
 * @returns {number} Degrees clockwise from north, 0-360.
 */
export function bearing(a, b) {
  if (!isValidCoord(a) || !isValidCoord(b)) return 0;

  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lng - a.lng);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Interpolate between two coordinates. Drives the truck animation along a
 * route leg.
 *
 * Linear interpolation is adequate here — over the few hundred metres between
 * adjacent bins the difference from a true great-circle path is smaller than
 * the marker itself.
 *
 * @param {LatLng} a
 * @param {LatLng} b
 * @param {number} t  Fraction 0-1.
 * @returns {LatLng}
 */
export function interpolate(a, b, t) {
  const clamped = Math.min(Math.max(t, 0), 1);
  return {
    lat: a.lat + (b.lat - a.lat) * clamped,
    lng: a.lng + (b.lng - a.lng) * clamped,
  };
}

/**
 * Symmetric distance matrix for a set of points.
 *
 * @param {LatLng[]} points
 * @returns {number[][]} matrix[i][j] — kilometres from i to j.
 */
export function buildCostMatrix(points) {
  const n = points.length;
  const matrix = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = haversineKm(points[i], points[j]);
      matrix[i][j] = d;
      matrix[j][i] = d;   // symmetric — no one-way streets in a straight-line model
    }
  }

  return matrix;
}

/**
 * Total length of a tour, including the return leg to the start.
 *
 * @param {number[]} order   Indices into `matrix`.
 * @param {number[][]} matrix
 * @param {boolean} [returnToStart=true]
 * @returns {number} Kilometres.
 */
export function tourLength(order, matrix, returnToStart = true) {
  if (order.length < 2) return 0;

  let total = 0;
  for (let i = 0; i < order.length - 1; i++) {
    total += matrix[order[i]][order[i + 1]];
  }

  if (returnToStart) {
    total += matrix[order[order.length - 1]][order[0]];
  }

  return total;
}

/**
 * Nearest-neighbour tour construction.
 *
 * Greedy and fast: start at the depot, repeatedly hop to the closest unvisited
 * stop. It produces a reasonable tour but not an optimal one, which is why
 * {@link twoOptImprove} runs afterwards.
 *
 * @param {number[][]} matrix
 * @param {number} [start=0]
 * @returns {number[]} Visit order.
 */
export function nearestNeighbourTour(matrix, start = 0) {
  const n = matrix.length;
  if (n === 0) return [];

  const visited = new Set([start]);
  const order = [start];

  while (order.length < n) {
    const current = order[order.length - 1];
    let best = -1;
    let bestDistance = Infinity;

    for (let candidate = 0; candidate < n; candidate++) {
      if (visited.has(candidate)) continue;
      if (matrix[current][candidate] < bestDistance) {
        bestDistance = matrix[current][candidate];
        best = candidate;
      }
    }

    if (best === -1) break;
    visited.add(best);
    order.push(best);
  }

  return order;
}

/**
 * 2-opt improvement.
 *
 * Repeatedly reverses a segment of the tour wherever doing so shortens it.
 * This removes the path crossings that nearest-neighbour characteristically
 * leaves behind — the classic "drive past a bin, then double back" pattern.
 *
 * The survey paper (§VI) recommends Dijkstra and A*. Both are shortest-path
 * algorithms over a road graph; with no road graph available, the ordering
 * problem here is a travelling-salesman variant, for which 2-opt is the
 * appropriate and honest counterpart. The distinction is documented in the
 * README.
 *
 * @param {number[]} order
 * @param {number[][]} matrix
 * @param {number} [maxPasses=50]
 * @returns {{order: number[], passes: number, improvedKm: number}}
 */
export function twoOptImprove(order, matrix, maxPasses = 50) {
  if (order.length < 4) {
    return { order: [...order], passes: 0, improvedKm: 0 };
  }

  let best = [...order];
  let bestLength = tourLength(best, matrix);
  const originalLength = bestLength;

  let improved = true;
  let passes = 0;

  while (improved && passes < maxPasses) {
    improved = false;
    passes++;

    // i starts at 1: index 0 is the depot and must stay fixed.
    for (let i = 1; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const candidate = twoOptSwap(best, i, k);
        const candidateLength = tourLength(candidate, matrix);

        if (candidateLength < bestLength - 1e-9) {
          best = candidate;
          bestLength = candidateLength;
          improved = true;
        }
      }
    }
  }

  return {
    order: best,
    passes,
    improvedKm: Math.round((originalLength - bestLength) * 1000) / 1000,
  };
}

/**
 * Reverse the segment between i and k inclusive.
 * @param {number[]} order
 * @param {number} i
 * @param {number} k
 * @returns {number[]}
 */
function twoOptSwap(order, i, k) {
  return [
    ...order.slice(0, i),
    ...order.slice(i, k + 1).reverse(),
    ...order.slice(k + 1),
  ];
}

/**
 * Bounding box for a set of coordinates, for map auto-fit.
 *
 * @param {LatLng[]} points
 * @param {number} [padding=0.001] Degrees of margin.
 * @returns {{north: number, south: number, east: number, west: number}|null}
 */
export function boundingBox(points, padding = 0.001) {
  const valid = points.filter(isValidCoord);
  if (valid.length === 0) return null;

  const lats = valid.map((p) => p.lat);
  const lngs = valid.map((p) => p.lng);

  return {
    north: Math.max(...lats) + padding,
    south: Math.min(...lats) - padding,
    east:  Math.max(...lngs) + padding,
    west:  Math.min(...lngs) - padding,
  };
}

/**
 * Centroid of a set of coordinates.
 * @param {LatLng[]} points
 * @returns {LatLng|null}
 */
export function centroid(points) {
  const valid = points.filter(isValidCoord);
  if (valid.length === 0) return null;

  return {
    lat: valid.reduce((sum, p) => sum + p.lat, 0) / valid.length,
    lng: valid.reduce((sum, p) => sum + p.lng, 0) / valid.length,
  };
}

/**
 * Estimated travel time.
 *
 * Both inputs are assumptions declared in app.config.js and shown as
 * tooltips wherever the resulting figure appears.
 *
 * @param {number} distanceKm
 * @param {number} avgSpeedKmph
 * @param {number} stopCount
 * @param {number} serviceMinPerStop
 * @returns {number} Minutes.
 */
export function estimateTravelMinutes(distanceKm, avgSpeedKmph, stopCount, serviceMinPerStop) {
  if (!Number.isFinite(distanceKm) || avgSpeedKmph <= 0) return 0;

  const drivingMinutes = (distanceKm / avgSpeedKmph) * 60;
  const serviceMinutes = stopCount * serviceMinPerStop;

  return Math.round(drivingMinutes + serviceMinutes);
}

/**
 * @param {any} coord
 * @returns {boolean}
 */
export function isValidCoord(coord) {
  return Boolean(
    coord &&
    Number.isFinite(coord.lat) &&
    Number.isFinite(coord.lng) &&
    coord.lat >= -90 && coord.lat <= 90 &&
    coord.lng >= -180 && coord.lng <= 180
  );
}

/**
 * Format coordinates for display.
 * @param {LatLng} coord
 * @param {number} [decimals=5]
 * @returns {string} e.g. "12.96060° N, 77.49000° E"
 */
export function formatCoord(coord, decimals = 5) {
  if (!isValidCoord(coord)) return '—';

  const ns = coord.lat >= 0 ? 'N' : 'S';
  const ew = coord.lng >= 0 ? 'E' : 'W';

  return `${Math.abs(coord.lat).toFixed(decimals)}° ${ns}, ` +
         `${Math.abs(coord.lng).toFixed(decimals)}° ${ew}`;
}

const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

export default {
  haversineKm, bearing, interpolate,
  buildCostMatrix, tourLength, nearestNeighbourTour, twoOptImprove,
  boundingBox, centroid, estimateTravelMinutes,
  isValidCoord, formatCoord,
};
