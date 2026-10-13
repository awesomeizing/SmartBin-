// ─────────────────────────────────────────────────────────────
// SmartBin+ Calculation Utilities
// All domain formulas in one place — traceable to the project report.
// ─────────────────────────────────────────────────────────────

import { ENVIRONMENTAL, FILL_BANDS } from '@/constants';
import { EMPTY_DISTANCE_CM, FULL_DISTANCE_CM, STATUS_THRESHOLD_FILLING, STATUS_THRESHOLD_FULL } from '@/constants/hardware';
import type { BinStatus, BinSummary, HistoryEntry } from '@/types';

/**
 * Calculate fill percentage from a raw ultrasonic distance reading.
 *
 * Uses the REAL sensor calibration for the physical prototype:
 *   EMPTY_DISTANCE_CM (11 cm) → 0%
 *   FULL_DISTANCE_CM  (3 cm)  → 100%
 *
 * Formula: fillPct = ((EMPTY - distance) / (EMPTY - FULL)) × 100
 * Clamped to [0, 100].
 *
 * This is the SINGLE authoritative implementation of the fill formula.
 * Do NOT duplicate this formula anywhere else in the codebase.
 *
 * @param distanceCm Raw distance from sensor to waste surface, in cm.
 * @returns Fill percentage 0–100, rounded to one decimal.
 */
export function calculateFillPercent(distanceCm: number): number {
  const range = EMPTY_DISTANCE_CM - FULL_DISTANCE_CM; // 8 cm
  if (range <= 0) return 0;
  const raw = ((EMPTY_DISTANCE_CM - distanceCm) / range) * 100;
  return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
}

/**
 * Legacy overload kept so existing callers with two arguments still compile.
 * The second argument (depthCm) is ignored — the real formula uses the
 * hardware constants above.
 * @deprecated Pass only distanceCm.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function calculateFillPercentLegacy(distanceCm: number, _depthCm: number): number {
  return calculateFillPercent(distanceCm);
}

/**
 * Determine bin status from fill percentage.
 * Matches the OLED display terminology:
 *   0–49%   → OK      (green, happy)
 *   50–79%  → FILLING (amber, worried)
 *   80–100% → FULL    (red, urgent)
 */
export function getBinStatus(fillPct: number): BinStatus {
  if (fillPct >= STATUS_THRESHOLD_FULL) return 'Full';
  if (fillPct >= STATUS_THRESHOLD_FILLING) return 'Half';
  return 'Empty';
}

/**
 * Get the status color for a fill percentage.
 */
export function getFillColor(fillPct: number): string {
  if (fillPct >= FILL_BANDS.CRITICAL.min) return FILL_BANDS.CRITICAL.color;
  if (fillPct >= FILL_BANDS.WARNING.min) return FILL_BANDS.WARNING.color;
  return FILL_BANDS.HEALTHY.color;
}

/**
 * Get the status label for a fill percentage.
 */
export function getFillLabel(fillPct: number): string {
  if (fillPct >= FILL_BANDS.CRITICAL.min) return FILL_BANDS.CRITICAL.label;
  if (fillPct >= FILL_BANDS.WARNING.min) return FILL_BANDS.WARNING.label;
  return FILL_BANDS.HEALTHY.label;
}

/**
 * Haversine distance between two coordinates in kilometers.
 */
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Calculate fuel saved from distance reduction.
 * Formula: fuelSavedL = savedKm / truckKmPerL
 */
export function calculateFuelSaved(savedKm: number): number {
  return savedKm / ENVIRONMENTAL.TRUCK_KM_PER_LITER;
}

/**
 * Calculate CO₂ saved from fuel reduction.
 * Formula: co2SavedKg = fuelSavedL × 2.68
 */
export function calculateCO2Saved(fuelSavedL: number): number {
  return fuelSavedL * ENVIRONMENTAL.CO2_KG_PER_LITER;
}

/**
 * Estimate time saved from distance reduction.
 */
export function calculateTimeSaved(savedKm: number): number {
  return (savedKm / ENVIRONMENTAL.AVG_TRUCK_SPEED_KMH) * 60; // minutes
}

/**
 * Simple linear regression for fill level forecasting.
 * Returns the predicted timestamp when the bin will be full.
 * Labelled: "Statistical projection — not ML" (per architecture doc).
 */
export function predictTimeToFull(history: HistoryEntry[]): {
  predictedFullAt: number;
  hoursToFull: number;
  fillRatePerHour: number;
  confidence: number;
} | null {
  if (history.length < 3) return null;

  // Use last 24 entries or all available
  const data = history.slice(-24);
  const n = data.length;

  // Linear regression: fillPct = a + b * timestamp
  const sumX = data.reduce((s, d) => s + d.timestamp, 0);
  const sumY = data.reduce((s, d) => s + d.fillPct, 0);
  const sumXY = data.reduce((s, d) => s + d.timestamp * d.fillPct, 0);
  const sumX2 = data.reduce((s, d) => s + d.timestamp * d.timestamp, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return null;

  const b = (n * sumXY - sumX * sumY) / denom; // slope (fillPct per ms)
  const a = (sumY - b * sumX) / n; // intercept

  // If fill rate is non-positive, bin is emptying
  if (b <= 0) return null;

  const fillRatePerHour = b * 3600000; // convert from per-ms to per-hour
  const lastEntry = data[data.length - 1];
  const currentFill = lastEntry.fillPct;
  const remaining = 100 - currentFill;
  const msToFull = remaining / b;
  const predictedFullAt = lastEntry.timestamp + msToFull;
  const hoursToFull = msToFull / 3600000;

  // R² for confidence
  const meanY = sumY / n;
  const ssTot = data.reduce((s, d) => s + (d.fillPct - meanY) ** 2, 0);
  const ssRes = data.reduce((s, d) => s + (d.fillPct - (a + b * d.timestamp)) ** 2, 0);
  const confidence = ssTot > 0 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 0;

  return {
    predictedFullAt,
    hoursToFull: Math.max(0, hoursToFull),
    fillRatePerHour,
    confidence,
  };
}

/**
 * Calculate KPI statistics from a bin list.
 *
 * Average fill is computed only over online bins (sensors with valid readings).
 * If all bins are offline, avgFillPct is -1 (the UI renders '--' instead of 0%).
 */
export function calculateKPIs(bins: BinSummary[]) {
  const total = bins.length;
  const online = bins.filter(b => b.isOnline).length;
  const offline = total - online;
  const full = bins.filter(b => b.isOnline && b.fillPct >= FILL_BANDS.CRITICAL.min).length;
  const warning = bins.filter(b => b.isOnline && b.fillPct >= FILL_BANDS.WARNING.min && b.fillPct < FILL_BANDS.CRITICAL.min).length;
  const healthy = online - full - warning;

  // Only average ONLINE bins — an offline bin has no valid fill reading.
  const onlineBins = bins.filter(b => b.isOnline);
  const avgFill = onlineBins.length > 0
    ? Math.round(onlineBins.reduce((s, b) => s + b.fillPct, 0) / onlineBins.length)
    : -1; // -1 signals "all offline" to the UI

  const avgBattery = total > 0 ? Math.round(bins.reduce((s, b) => s + b.batteryPct, 0) / total) : 0;

  return {
    totalBins: total,
    onlineBins: online,
    offlineBins: offline,
    fullBins: full,
    warningBins: warning,
    healthyBins: healthy,
    avgFillPct: avgFill,
    avgBatteryPct: avgBattery,
  };
}

/**
 * Nearest-neighbour TSP heuristic for route optimization.
 * Returns an ordered list of bin IDs.
 */
export function optimizeRoute(
  bins: Array<{ id: string; lat: number; lng: number }>,
  depotLat: number,
  depotLng: number
): string[] {
  if (bins.length <= 1) return bins.map(b => b.id);

  const visited = new Set<string>();
  const route: string[] = [];
  let currentLat = depotLat;
  let currentLng = depotLng;

  while (visited.size < bins.length) {
    let nearest: string | null = null;
    let nearestDist = Infinity;

    for (const bin of bins) {
      if (visited.has(bin.id)) continue;
      const dist = haversineDistance(currentLat, currentLng, bin.lat, bin.lng);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = bin.id;
      }
    }

    if (nearest) {
      visited.add(nearest);
      route.push(nearest);
      const bin = bins.find(b => b.id === nearest)!;
      currentLat = bin.lat;
      currentLng = bin.lng;
    }
  }

  return route;
}
