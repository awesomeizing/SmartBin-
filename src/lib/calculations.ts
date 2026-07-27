// ─────────────────────────────────────────────────────────────
// SmartBin+ Calculation Utilities
// All domain formulas in one place — traceable to the project report.
// ─────────────────────────────────────────────────────────────

import { ENVIRONMENTAL, FILL_BANDS } from '@/constants';
import type { BinStatus, BinSummary, HistoryEntry } from '@/types';

/**
 * Calculate fill percentage from measured distance.
 * Formula (report §3.1): fillPct = (1 − d_measured / d_max) × 100
 * Clamped to [0, 100].
 */
export function calculateFillPercent(distanceCm: number, depthCm: number): number {
  if (depthCm <= 0) return 0;
  const raw = (1 - distanceCm / depthCm) * 100;
  return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
}

/**
 * Determine bin status from fill percentage.
 * Report §3.1: Empty 0–50 / Half 51–79 / Full 80–100
 */
export function getBinStatus(fillPct: number): BinStatus {
  if (fillPct >= FILL_BANDS.CRITICAL.min) return 'Full';
  if (fillPct >= FILL_BANDS.WARNING.min) return 'Half';
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
 */
export function calculateKPIs(bins: BinSummary[]) {
  const total = bins.length;
  const online = bins.filter(b => b.isOnline).length;
  const offline = total - online;
  const full = bins.filter(b => b.fillPct >= FILL_BANDS.CRITICAL.min).length;
  const warning = bins.filter(b => b.fillPct >= FILL_BANDS.WARNING.min && b.fillPct < FILL_BANDS.CRITICAL.min).length;
  const healthy = total - full - warning;
  const avgFill = total > 0 ? Math.round(bins.reduce((s, b) => s + b.fillPct, 0) / total) : 0;
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
