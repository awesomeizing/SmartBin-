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
  // If distance is <= 0 or not finite (sensor echo timeout / no obstacle), waste is not touching sensor
  if (!Number.isFinite(distanceCm) || distanceCm <= 0) return 0;
  // If distance >= EMPTY_DISTANCE_CM (11 cm), bin is empty
  if (distanceCm >= EMPTY_DISTANCE_CM) return 0;
  // If distance <= FULL_DISTANCE_CM (3 cm), bin is full
  if (distanceCm <= FULL_DISTANCE_CM) return 100;

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

export function getFillColor(fillPct: number): string {
  if (fillPct >= FILL_BANDS.CRITICAL.min) return FILL_BANDS.CRITICAL.color;
  if (fillPct >= FILL_BANDS.WARNING.min) return FILL_BANDS.WARNING.color;
  return FILL_BANDS.HEALTHY.color;
}

export function getFillLabel(fillPct: number): string {
  if (fillPct >= FILL_BANDS.CRITICAL.min) return FILL_BANDS.CRITICAL.label;
  if (fillPct >= FILL_BANDS.WARNING.min) return FILL_BANDS.WARNING.label;
  return FILL_BANDS.HEALTHY.label;
}

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function calculateFuelSaved(savedKm: number): number { return savedKm / ENVIRONMENTAL.TRUCK_KM_PER_LITER; }
export function calculateCO2Saved(fuelSavedL: number): number { return fuelSavedL * ENVIRONMENTAL.CO2_KG_PER_LITER; }
export function calculateTimeSaved(savedKm: number): number { return (savedKm / ENVIRONMENTAL.AVG_TRUCK_SPEED_KMH) * 60; }

export function predictTimeToFull(history: HistoryEntry[]): { predictedFullAt: number; hoursToFull: number; fillRatePerHour: number; confidence: number } | null {
  if (history.length < 3) return null;
  const data = history.slice(-24);
  const n = data.length;
  const sumX = data.reduce((s, d) => s + d.timestamp, 0);
  const sumY = data.reduce((s, d) => s + d.fillPct, 0);
  const sumXY = data.reduce((s, d) => s + d.timestamp * d.fillPct, 0);
  const sumX2 = data.reduce((s, d) => s + d.timestamp * d.timestamp, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return null;
  const b = (n * sumXY - sumX * sumY) / denom;
  const a = (sumY - b * sumX) / n;
  if (b <= 0) return null;
  const fillRatePerHour = b * 3600000;
  const lastEntry = data[data.length - 1];
  const msToFull = Math.max(0, (100 - lastEntry.fillPct) / b);
  const predictedFullAt = lastEntry.timestamp + msToFull;
  const meanY = sumY / n;
  const ssTot = data.reduce((s, d) => s + (d.fillPct - meanY) ** 2, 0);
  const ssRes = data.reduce((s, d) => s + (d.fillPct - (a + b * d.timestamp)) ** 2, 0);
  return { predictedFullAt, hoursToFull: msToFull / 3600000, fillRatePerHour, confidence: ssTot > 0 ? Math.max(0, Math.min(1, 1 - ssRes / ssTot)) : 0 };
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

  const binsWithBattery = bins.filter((bin) => bin.batteryPct !== null);
  const avgBattery = binsWithBattery.length > 0
    ? Math.round(binsWithBattery.reduce((sum, bin) => sum + bin.batteryPct!, 0) / binsWithBattery.length)
    : null;

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

export function optimizeRoute(bins: Array<{ id: string; lat: number; lng: number }>, depotLat: number, depotLng: number): string[] {
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
      if (dist < nearestDist) { nearestDist = dist; nearest = bin.id; }
    }
    if (!nearest) break;
    visited.add(nearest);
    route.push(nearest);
    const bin = bins.find(b => b.id === nearest)!;
    currentLat = bin.lat;
    currentLng = bin.lng;
  }
  return route;
}
