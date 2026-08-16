// ─────────────────────────────────────────────────────────────
// SmartBin+ Constants & Configuration
// Single source of truth for all magic numbers, enums, and config values.
// ─────────────────────────────────────────────────────────────

import type { AlertSeverity, BinStatus } from '@/types';

// ── Fill Level Bands (report §3.1) ─────────────────────────
// Green 0–50 / Amber 51–79 / Red 80–100

export const FILL_BANDS = {
  HEALTHY: { min: 0, max: 50, label: 'Healthy', color: '#22c55e' },
  WARNING: { min: 51, max: 79, label: 'Warning', color: '#f59e0b' },
  CRITICAL: { min: 80, max: 100, label: 'Critical', color: '#ef4444' },
} as const;

export const FILL_THRESHOLD_DEFAULT = 80;
export const FILL_THRESHOLD_MIN = 80;
export const FILL_THRESHOLD_MAX = 90;

// ── Status Colors ──────────────────────────────────────────

export const STATUS_COLORS: Record<BinStatus, string> = {
  Empty: '#22c55e',
  Half: '#f59e0b',
  Full: '#ef4444',
};

export const SEVERITY_COLORS: Record<AlertSeverity, string> = {
  info: '#3b82f6',
  warning: '#f59e0b',
  critical: '#ef4444',
};

export const SEVERITY_BG: Record<AlertSeverity, string> = {
  info: 'rgba(59, 130, 246, 0.1)',
  warning: 'rgba(245, 158, 11, 0.1)',
  critical: 'rgba(239, 68, 68, 0.1)',
};

export const SEVERITY_BORDER: Record<AlertSeverity, string> = {
  info: 'rgba(59, 130, 246, 0.3)',
  warning: 'rgba(245, 158, 11, 0.3)',
  critical: 'rgba(239, 68, 68, 0.3)',
};

// ── Connection States ──────────────────────────────────────

export const CONNECTION_COLORS = {
  online: '#22c55e',
  degraded: '#f59e0b',
  offline: '#ef4444',
  reconnecting: '#f59e0b',
} as const;

// ── Hardware Defaults ──────────────────────────────────────

export const HARDWARE = {
  DEPTH_CM_DEFAULT: 20, // d_max — report §3.3 prototype
  DEPTH_CM_MAX: 400,
  POLL_INTERVAL_SEC: 60,
  POLL_INTERVAL_MIN: 10,
  POLL_INTERVAL_MAX: 3600,
  STALE_MULTIPLIER: 3, // bin offline after 3 × pollInterval
  BATTERY_LOW: 20,
  BATTERY_CRITICAL: 10,
  RSSI_GOOD: -50,
  RSSI_FAIR: -70,
  RSSI_POOR: -90,
} as const;

// ── Fuel & Environmental Constants ─────────────────────────
// All documented assumptions per architecture doc

export const ENVIRONMENTAL = {
  TRUCK_KM_PER_LITER: 3.5,
  CO2_KG_PER_LITER: 2.68,
  AVG_TRUCK_SPEED_KMH: 30,
  AVG_COLLECTION_TIME_MINS: 5,
} as const;

// ── Map Defaults ───────────────────────────────────────────

export const MAP_CONFIG = {
  CENTER: { lat: 12.932, lng: 77.510 } as const, // Centered among Purple Line metro stations, Bengaluru
  ZOOM: 14,
  MIN_ZOOM: 10,
  MAX_ZOOM: 18,
  TILE_URL: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  TILE_ATTRIBUTION: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
} as const;

// ── Zones ──────────────────────────────────────────────────

export const ZONES = [
  'Zone-A',
] as const;

export type Zone = (typeof ZONES)[number];

// ── Sidebar Navigation ─────────────────────────────────────

export const NAV_ITEMS = {
  operations: [
    { name: 'Overview', to: '/dashboard', icon: 'LayoutDashboard' },
    { name: 'Map View', to: '/map', icon: 'Map' },
    { name: 'Bin Fleet', to: '/bins', icon: 'Trash2' },
    { name: 'Trucks', to: '/trucks', icon: 'Truck' },
    { name: 'Alerts', to: '/alerts', icon: 'Bell' },
    { name: 'Analytics', to: '/analytics', icon: 'BarChart3' },
    { name: 'AI Insights', to: '/ai', icon: 'BrainCircuit' },
  ],
  admin: [
    { name: 'Reports', to: '/reports', icon: 'FileBarChart' },
    { name: 'Admin', to: '/admin', icon: 'Shield' },
    { name: 'Settings', to: '/settings', icon: 'Settings' },
  ],
} as const;

// ── Date Formats ───────────────────────────────────────────

export const DATE_FORMATS = {
  SHORT: 'MMM d',
  MEDIUM: 'MMM d, yyyy',
  LONG: 'MMMM d, yyyy',
  TIME: 'HH:mm',
  DATETIME: 'MMM d, yyyy HH:mm',
  FULL: 'EEEE, MMMM d, yyyy HH:mm',
  ISO: "yyyy-MM-dd'T'HH:mm:ss",
} as const;

// ── Animation Durations ────────────────────────────────────

export const ANIMATION = {
  FAST: 150,
  NORMAL: 300,
  SLOW: 600,
  REVEAL: 600,
  EASING: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

// ── Pagination ─────────────────────────────────────────────

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  PAGE_SIZE_OPTIONS: [10, 20, 50, 100] as const,
} as const;

// ── Toast Configuration ────────────────────────────────────

export const TOAST = {
  DURATION_MS: 5000,
  MAX_VISIBLE: 5,
} as const;

// ── Chart Theme ────────────────────────────────────────────

export const CHART_THEME = {
  gridColor: 'rgba(255, 255, 255, 0.05)',
  axisColor: 'rgba(255, 255, 255, 0.4)',
  tooltipBg: 'rgba(9, 9, 11, 0.95)',
  tooltipBorder: 'rgba(255, 255, 255, 0.1)',
  colors: {
    primary: '#ffffff',
    secondary: '#a1a1aa',
    tertiary: '#52525b',
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#3b82f6',
  },
  gradients: {
    primary: ['rgba(255, 255, 255, 0.15)', 'rgba(255, 255, 255, 0)'],
    success: ['rgba(34, 197, 94, 0.15)', 'rgba(34, 197, 94, 0)'],
    warning: ['rgba(245, 158, 11, 0.15)', 'rgba(245, 158, 11, 0)'],
    danger: ['rgba(239, 68, 68, 0.15)', 'rgba(239, 68, 68, 0)'],
  },
} as const;
