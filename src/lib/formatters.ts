// ─────────────────────────────────────────────────────────────
// SmartBin+ Formatting Utilities
// Consistent formatting across the entire application.
// ─────────────────────────────────────────────────────────────

import { format, formatDistanceToNow, isValid } from 'date-fns';

/**
 * Format a timestamp to a readable date string.
 */
export function formatDate(timestamp: number | Date, pattern = 'MMM d, yyyy'): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
  if (!isValid(date)) return '—';
  return format(date, pattern);
}

/**
 * Format a timestamp to a relative time string (e.g., "3 minutes ago").
 */
export function formatRelativeTime(timestamp: number | Date): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
  if (!isValid(date)) return '—';
  return formatDistanceToNow(date, { addSuffix: true });
}

/**
 * Format a timestamp to time only (e.g., "14:32").
 */
export function formatTime(timestamp: number | Date): string {
  return formatDate(timestamp, 'HH:mm');
}

/**
 * Format a timestamp to date + time (e.g., "Jul 25, 14:32").
 */
export function formatDateTime(timestamp: number | Date): string {
  return formatDate(timestamp, 'MMM d, HH:mm');
}

/**
 * Format a percentage value with optional decimal places.
 */
export function formatPercent(value: number, decimals = 0): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format a distance in centimeters to a readable string.
 */
export function formatDistance(cm: number): string {
  if (cm >= 100) {
    return `${(cm / 100).toFixed(1)}m`;
  }
  return `${cm.toFixed(0)}cm`;
}

/**
 * Format temperature in Celsius.
 */
export function formatTemperature(celsius: number | null): string {
  if (celsius === null || celsius === undefined) return '—';
  return `${celsius.toFixed(1)}°C`;
}

/**
 * Format humidity percentage.
 */
export function formatHumidity(pct: number | null): string {
  if (pct === null || pct === undefined) return '—';
  return `${pct.toFixed(0)}%`;
}

/**
 * Format RSSI signal strength to a readable string.
 */
export function formatSignal(rssi: number | null): string {
  if (rssi === null) return '—';
  if (rssi >= -50) return 'Excellent';
  if (rssi >= -60) return 'Good';
  if (rssi >= -70) return 'Fair';
  if (rssi >= -80) return 'Weak';
  return 'Poor';
}

/**
 * Get signal strength level (0-4) from RSSI.
 */
export function getSignalLevel(rssi: number | null): number {
  if (rssi === null) return 0;
  if (rssi >= -50) return 4;
  if (rssi >= -60) return 3;
  if (rssi >= -70) return 2;
  if (rssi >= -80) return 1;
  return 0;
}

/**
 * Format a large number with K/M suffix.
 */
export function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

/**
 * Format weight in kilograms.
 */
export function formatWeight(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}t`;
  return `${kg.toFixed(0)}kg`;
}

/**
 * Format fuel in liters.
 */
export function formatFuel(liters: number): string {
  return `${liters.toFixed(1)}L`;
}

/**
 * Format CO₂ in kilograms.
 */
export function formatCO2(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}t CO₂`;
  return `${kg.toFixed(1)}kg CO₂`;
}

/**
 * Format duration from seconds to human-readable.
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * Format uptime from seconds.
 */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  return formatDuration(seconds);
}

/**
 * Pluralize a word based on count.
 */
export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}
