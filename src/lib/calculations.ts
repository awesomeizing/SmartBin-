import { ENVIRONMENTAL, FILL_BANDS } from '@/constants';
import type { BinStatus, BinSummary, HistoryEntry } from '@/types';

export function calculateFillPercent(distanceCm: number, depthCm: number): number {
  if (!Number.isFinite(distanceCm) || depthCm <= 0) return 0;
  const raw = (1 - distanceCm / depthCm) * 100;
  return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
}

export function calculateFillFromCalibration(distanceCm: number, emptyDistanceCm = 11, fullDistanceCm = 3): number {
  if (!Number.isFinite(distanceCm) || emptyDistanceCm <= fullDistanceCm) return 0;
  const raw = ((emptyDistanceCm - distanceCm) / (emptyDistanceCm - fullDistanceCm)) * 100;
  return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
}

export function getBinStatus(fillPct: number): BinStatus {
  if (fillPct >= FILL_BANDS.CRITICAL.min) return 'Full';
  if (fillPct >= FILL_BANDS.WARNING.min) return 'Half';
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

export function calculateKPIs(bins: BinSummary[]) {
  const total = bins.length;
  const onlineBins = bins.filter(b => b.isOnline);
  const offline = total - onlineBins.length;
  const validOnline = onlineBins.filter(b => Number.isFinite(b.fillPct));
  const full = validOnline.filter(b => b.fillPct >= FILL_BANDS.CRITICAL.min).length;
  const warning = validOnline.filter(b => b.fillPct >= FILL_BANDS.WARNING.min && b.fillPct < FILL_BANDS.CRITICAL.min).length;
  const healthy = total - full - warning;
  const avgFill = validOnline.length ? Math.round(validOnline.reduce((s, b) => s + b.fillPct, 0) / validOnline.length) : '--';
  const avgBattery = validOnline.length ? Math.round(validOnline.reduce((s, b) => s + b.batteryPct, 0) / validOnline.length) : 0;
  return { totalBins: total, onlineBins: onlineBins.length, offlineBins: offline, fullBins: full, warningBins: warning, healthyBins: healthy, avgFillPct: avgFill, avgBatteryPct: avgBattery };
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
