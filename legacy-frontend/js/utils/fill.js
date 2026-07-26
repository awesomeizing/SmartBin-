/**
 * SmartBin+ — Fill Level Calculations
 * =============================================================================
 * The single implementation of the fill-level formula and the status bands.
 *
 * This file exists so the formula appears exactly once in the codebase. If the
 * dashboard and the firmware ever disagree about what "72% full" means, the
 * whole system is untrustworthy — so there is one definition here, mirrored
 * deliberately in the ESP32 sketch, and nowhere else.
 *
 * FORMULA — report §3.1
 *
 *     fillPercent = (1 − d_measured / d_max) × 100
 *
 * where d_max is the distance from the sensor to the bin bottom when empty
 * (report §3.3: a 20 cm cylindrical prototype bin).
 *
 * Note the report prints this formula with a typographical error —
 * "Fill Level (%) = 1 dmeasured × 100" — with the division and subtraction
 * lost in conversion. The expression above is the intended calculation and
 * is what both the firmware and this module implement.
 *
 * @module js/utils/fill
 */

import { BinStatus, FILL_BANDS } from '../../config/constants.js';
import { SENSOR, THRESHOLDS } from '../../config/app.config.js';

/**
 * Convert a measured distance into a fill percentage.
 *
 * @param {number} distanceCm  Sensor-to-waste distance in centimetres.
 * @param {number} [depthCm]   d_max — sensor-to-bottom distance when empty.
 * @returns {number} Fill percentage, clamped to [0, 100], one decimal place.
 *
 * @example
 * calculateFillPercent(5, 20);   // → 75    (bin three-quarters full)
 * calculateFillPercent(20, 20);  // → 0     (empty)
 * calculateFillPercent(0, 20);   // → 100   (full to the sensor)
 */
export function calculateFillPercent(distanceCm, depthCm = SENSOR.DEFAULT_DEPTH_CM) {
  if (!Number.isFinite(distanceCm) || !Number.isFinite(depthCm) || depthCm <= 0) {
    return 0;
  }

  const raw = (1 - distanceCm / depthCm) * 100;

  // Clamping matters physically: waste heaped above the sensor plane yields a
  // negative distance ratio, and a sensor misread can exceed the bin depth.
  // Neither should ever surface as -14% or 118% on an operator's screen.
  return Math.round(clamp(raw, 0, 100) * 10) / 10;
}

/**
 * Inverse — the distance a given fill level would produce.
 * Used by the Simulation Engine so simulated bins emit physically coherent
 * distance readings rather than a fill percentage with no sensor value behind it.
 *
 * @param {number} fillPct
 * @param {number} [depthCm]
 * @returns {number} Distance in centimetres, one decimal place.
 */
export function fillPercentToDistance(fillPct, depthCm = SENSOR.DEFAULT_DEPTH_CM) {
  const pct = clamp(fillPct, 0, 100);
  return Math.round(depthCm * (1 - pct / 100) * 10) / 10;
}

/**
 * Classify a fill percentage into one of the three report-defined states.
 *
 * Bands — report §3.1:
 *   Empty / Low       0-50
 *   Half / Moderate  51-79
 *   Full / Critical  80-100
 *
 * @param {number} fillPct
 * @returns {string} A value from BinStatus.*
 */
export function classifyFillStatus(fillPct) {
  const pct = clamp(fillPct, 0, 100);

  if (pct <= THRESHOLDS.BAND_EMPTY_MAX) return BinStatus.EMPTY;
  if (pct <= THRESHOLDS.BAND_HALF_MAX)  return BinStatus.HALF;
  return BinStatus.FULL;
}

/**
 * Full band descriptor for a fill percentage — status, label and the CSS
 * key used for colour tokens.
 *
 * @param {number} fillPct
 * @returns {{status: string, key: string, label: string, min: number, max: number}}
 */
export function getFillBand(fillPct) {
  const pct = clamp(fillPct, 0, 100);
  return FILL_BANDS.find((b) => pct >= b.min && pct <= b.max) ?? FILL_BANDS[0];
}

/**
 * CSS custom property for a fill level, for meters and markers.
 *
 * @param {number} fillPct
 * @returns {string} e.g. "var(--status-critical)"
 */
export function getFillColorVar(fillPct) {
  const map = {
    healthy:  'var(--status-healthy)',
    warning:  'var(--status-warning)',
    critical: 'var(--status-critical)',
  };
  return map[getFillBand(fillPct).key];
}

/**
 * Has this bin reached its alert threshold?
 *
 * @param {number} fillPct
 * @param {number} [threshold]  Per-bin override; defaults to the configured value.
 * @returns {boolean}
 */
export function isAtThreshold(fillPct, threshold = THRESHOLDS.ALERT_PCT) {
  return fillPct >= threshold;
}

/**
 * Validate a raw sensor reading before it is trusted.
 *
 * Implements the preprocessing requirement in report §3.1: "validate each
 * sensor reading against bounds (0 cm to d_max cm), discard outliers arising
 * from sensor noise or transient obstructions."
 *
 * The firmware performs this check too. Doing it again here is deliberate —
 * a faulty device, an old record, or a Simulation Engine bug should not be
 * able to put a nonsensical value on the dashboard.
 *
 * @param {number} distanceCm
 * @param {number} [depthCm]
 * @returns {{valid: boolean, reason: string|null}}
 */
export function validateReading(distanceCm, depthCm = SENSOR.DEFAULT_DEPTH_CM) {
  if (!Number.isFinite(distanceCm)) {
    return { valid: false, reason: 'Reading is not a number' };
  }

  if (distanceCm < SENSOR.MIN_RANGE_CM) {
    return {
      valid: false,
      reason: `Below HC-SR04 minimum range (${SENSOR.MIN_RANGE_CM} cm)`,
    };
  }

  if (distanceCm > SENSOR.MAX_RANGE_CM) {
    return {
      valid: false,
      reason: `Above HC-SR04 maximum range (${SENSOR.MAX_RANGE_CM} cm)`,
    };
  }

  // A reading well beyond the bin depth means the pulse missed the waste
  // surface entirely — an oblique echo, or the lid left open.
  if (distanceCm > depthCm * 1.5) {
    return {
      valid: false,
      reason: `Exceeds bin depth (${depthCm} cm) — probable echo artifact`,
    };
  }

  return { valid: true, reason: null };
}

/**
 * Five-sample rolling median.
 *
 * Report §5.2 item 1: "The HC-SR04 occasionally produced spurious readings
 * when waste material was positioned at oblique angles to the sensor beam.
 * A five-sample rolling median filter was implemented to suppress transient
 * outliers without introducing perceptible latency."
 *
 * Median rather than mean, specifically because a single wild outlier moves
 * a mean but cannot move a median.
 *
 * @param {number[]} samples
 * @param {number} [window]
 * @returns {number} The median of the most recent `window` samples.
 */
export function rollingMedian(samples, window = SENSOR.MEDIAN_WINDOW) {
  if (!Array.isArray(samples) || samples.length === 0) return 0;

  const recent = samples.slice(-window).filter(Number.isFinite);
  if (recent.length === 0) return 0;

  const sorted = [...recent].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Project how long until a bin reaches its threshold, by least-squares linear
 * regression over recent history.
 *
 * IMPORTANT — this is statistical extrapolation, not machine learning. The
 * literature survey (§VII-A) proposes ML forecasting as future work, and the
 * project report places it in Phase-II scope. Presenting a straight-line fit
 * as "AI prediction" would be dishonest, so the UI labels every output of this
 * function as a statistical projection.
 *
 * @param {Array<{fillPct: number, timestamp: number}>} history  Chronological.
 * @param {number} [threshold]
 * @returns {{hoursToFull: number|null, ratePerHour: number, confidence: string}}
 */
export function projectTimeToThreshold(history, threshold = THRESHOLDS.ALERT_PCT) {
  const points = (history ?? [])
    .filter((p) => Number.isFinite(p?.fillPct) && Number.isFinite(p?.timestamp))
    .slice(-48);

  if (points.length < 4) {
    return { hoursToFull: null, ratePerHour: 0, confidence: 'insufficient-data' };
  }

  // Regress fillPct against hours elapsed since the first sample.
  const t0 = points[0].timestamp;
  const xs = points.map((p) => (p.timestamp - t0) / 3_600_000);
  const ys = points.map((p) => p.fillPct);

  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumXX = xs.reduce((acc, x) => acc + x * x, 0);

  const denominator = n * sumXX - sumX * sumX;
  if (Math.abs(denominator) < 1e-9) {
    return { hoursToFull: null, ratePerHour: 0, confidence: 'insufficient-data' };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;      // %/hour
  const intercept = (sumY - slope * sumX) / n;

  // A flat or falling trend never reaches the threshold.
  if (slope <= 0.01) {
    return { hoursToFull: null, ratePerHour: slope, confidence: 'stable' };
  }

  const currentPct = ys[ys.length - 1];
  if (currentPct >= threshold) {
    return { hoursToFull: 0, ratePerHour: slope, confidence: 'already-critical' };
  }

  const hoursToFull = (threshold - currentPct) / slope;

  // Coefficient of determination, as a rough confidence signal.
  const meanY = sumY / n;
  const ssTotal = ys.reduce((acc, y) => acc + (y - meanY) ** 2, 0);
  const ssResidual = ys.reduce(
    (acc, y, i) => acc + (y - (slope * xs[i] + intercept)) ** 2,
    0
  );
  const rSquared = ssTotal === 0 ? 0 : 1 - ssResidual / ssTotal;

  return {
    hoursToFull: Math.round(hoursToFull * 10) / 10,
    ratePerHour: Math.round(slope * 100) / 100,
    confidence: rSquared > 0.8 ? 'high' : rSquared > 0.5 ? 'moderate' : 'low',
  };
}

/**
 * Composite health score, 0-100.
 *
 * A single number an operator can scan, decomposed into named deductions so
 * the reason for a low score is always visible rather than opaque.
 *
 * @param {object} bin
 * @returns {{score: number, factors: Array<{label: string, delta: number}>}}
 */
export function calculateHealthScore(bin) {
  const factors = [];
  let score = 100;

  const health = bin?.health ?? {};
  const live = bin?.live ?? {};

  if (health.sensorOk === false) {
    score -= 40;
    factors.push({ label: 'Sensor fault', delta: -40 });
  }

  if (bin?.deviceState === 'offline') {
    score -= 30;
    factors.push({ label: 'Device offline', delta: -30 });
  } else if (bin?.deviceState === 'stale') {
    score -= 15;
    factors.push({ label: 'Readings stale', delta: -15 });
  }

  const battery = live.batteryPct;
  if (Number.isFinite(battery)) {
    if (battery <= THRESHOLDS.BATTERY_CRIT_PCT) {
      score -= 20;
      factors.push({ label: 'Battery critical', delta: -20 });
    } else if (battery <= THRESHOLDS.BATTERY_WARN_PCT) {
      score -= 10;
      factors.push({ label: 'Battery low', delta: -10 });
    }
  }

  const rssi = live.rssi;
  if (Number.isFinite(rssi) && rssi < THRESHOLDS.RSSI_WEAK_DBM) {
    score -= 10;
    factors.push({ label: 'Weak Wi-Fi signal', delta: -10 });
  }

  if (live.messageStatus === 'Failed') {
    score -= 15;
    factors.push({ label: 'Last transmission failed', delta: -15 });
  }

  return { score: clamp(score, 0, 100), factors };
}

/**
 * Collection priority — used to order the optimised route.
 * Higher is more urgent.
 *
 * @param {object} bin
 * @returns {{priority: number, label: string}}
 */
export function calculateCollectionPriority(bin) {
  const fillPct = bin?.live?.fillPct ?? 0;
  const threshold = bin?.meta?.thresholdPct ?? THRESHOLDS.ALERT_PCT;

  // Fill level dominates; everything else adjusts at the margin.
  let priority = fillPct;

  if (fillPct >= THRESHOLDS.OVERFLOW_PCT) priority += 50;   // overflowing now
  else if (fillPct >= threshold) priority += 20;            // past threshold

  // An offline bin may have filled further since its last reading, so it is
  // nudged up rather than trusted at face value.
  if (bin?.deviceState === 'offline') priority += 10;

  const label =
    fillPct >= THRESHOLDS.OVERFLOW_PCT ? 'Immediate'
    : fillPct >= threshold             ? 'High'
    : fillPct >= THRESHOLDS.BAND_EMPTY_MAX ? 'Scheduled'
    : 'Low';

  return { priority: Math.round(priority), label };
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export default {
  calculateFillPercent,
  fillPercentToDistance,
  classifyFillStatus,
  getFillBand,
  getFillColorVar,
  isAtThreshold,
  validateReading,
  rollingMedian,
  projectTimeToThreshold,
  calculateHealthScore,
  calculateCollectionPriority,
};
