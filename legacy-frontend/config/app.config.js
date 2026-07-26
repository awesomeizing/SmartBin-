/**
 * SmartBin+ — Application Configuration
 * =============================================================================
 * Tunable defaults and documented assumptions.
 *
 * Anything in DERIVED_METRICS is an assumption, not a measurement. Every one
 * of them is surfaced in the UI as a tooltip next to the number it produces.
 * A dashboard figure you cannot explain is a figure you cannot defend in a
 * viva, so nothing here stays hidden.
 *
 * Values overridable at runtime by an administrator are written to Firebase
 * under /config and take precedence over these defaults.
 *
 * @module config/app.config
 */

import { Role, DataSource } from './constants.js';

/* ---------------------------------------------------------------------------
 * THRESHOLDS — report §3.1 / Objective 4
 * ------------------------------------------------------------------------- */
export const THRESHOLDS = Object.freeze({
  /**
   * Fill % at which an alert is raised. REPORT §3.1: "reaches or exceeds 80".
   * Objective 4 permits 80-90, so an administrator may raise it within that
   * range; the UI clamps to [MIN, MAX].
   */
  ALERT_PCT: 80,
  ALERT_PCT_MIN: 80,
  ALERT_PCT_MAX: 90,

  /** Band boundaries — REPORT §3.1. Changing these contradicts the report. */
  BAND_EMPTY_MAX: 50,
  BAND_HALF_MAX:  79,

  /** Battery warning levels (not in report; project addition). */
  BATTERY_WARN_PCT: 20,
  BATTERY_CRIT_PCT: 10,

  /** Wi-Fi RSSI below which the link is reported as degraded. */
  RSSI_WEAK_DBM: -80,

  /** Fill % treated as an overflow emergency. */
  OVERFLOW_PCT: 100,
});

/* ---------------------------------------------------------------------------
 * TIMING — report §3.1 and §3.2
 * ------------------------------------------------------------------------- */
export const TIMING = Object.freeze({
  /** Firmware transmit interval. REPORT §3.1: "default: 60 seconds". */
  POLL_INTERVAL_SEC: 60,

  /**
   * A bin is marked offline after this many missed intervals.
   * 3 x 60 s = 3 minutes of silence before we call it down — long enough to
   * ride out a single dropped packet, short enough to be useful.
   */
  STALE_MULTIPLIER: 3,

  /** REPORT §3.2 Performance: sensor to cloud within 10 s. */
  MAX_PIPELINE_LATENCY_SEC: 10,

  /** REPORT §3.2 Performance: dashboard reflects a write within 3 s. */
  MAX_DASHBOARD_REFRESH_SEC: 3,

  /** Firmware reconnect back-off. REPORT §5.2 item 2. */
  RECONNECT_INITIAL_MS: 1000,
  RECONNECT_MAX_MS:     30000,
  RECONNECT_FACTOR:     2,

  /** UI. */
  TOAST_DURATION_MS:      5000,
  TOAST_CRITICAL_MS:      9000,   // critical toasts linger
  SIMULATION_TICK_MS:     1000,
  CHART_REFRESH_MS:       5000,
  RELATIVE_TIME_TICK_MS:  30000,  // "2 min ago" recalculation
});

/* ---------------------------------------------------------------------------
 * SENSOR — report §3.3 and §5.2
 * ------------------------------------------------------------------------- */
export const SENSOR = Object.freeze({
  /**
   * d_max: distance from sensor to bin bottom when empty.
   * REPORT §3.3: "Standard cylindrical dustbin (20 cm depth)".
   * Overridable per bin via meta.depthCm — bins are not all the same size.
   */
  DEFAULT_DEPTH_CM: 20,

  /** HC-SR04 datasheet limits. REPORT §3.3. */
  MIN_RANGE_CM: 2,
  MAX_RANGE_CM: 400,
  RESOLUTION_CM: 0.3,

  /** Rolling median window. REPORT §5.2 item 1: "five-sample rolling median". */
  MEDIAN_WINDOW: 5,

  /** Readings outside [MIN_RANGE_CM, depthCm] are discarded as outliers. */
  REJECT_OUT_OF_BOUNDS: true,
});

/* ---------------------------------------------------------------------------
 * DERIVED METRICS — ASSUMPTIONS, NOT MEASUREMENTS
 *
 * Report Objective 7 calls for measurable reductions in time, fuel and
 * manpower. We can compute those only with stated assumptions. Each constant
 * below carries the tooltip text shown beside every figure it produces.
 * ------------------------------------------------------------------------- */
export const DERIVED_METRICS = Object.freeze({
  TRUCK_KM_PER_L: {
    value: 3.5,
    unit:  'km/L',
    note:  'Assumed fuel economy for a municipal collection vehicle. Not measured by this project.',
  },
  CO2_KG_PER_L: {
    value: 2.68,
    unit:  'kg CO₂/L',
    note:  'Standard emission factor for diesel combustion. Literature value.',
  },
  AVG_SPEED_KMPH: {
    value: 20,
    unit:  'km/h',
    note:  'Assumed average urban collection-vehicle speed including stops.',
  },
  SERVICE_TIME_MIN_PER_BIN: {
    value: 4,
    unit:  'min',
    note:  'Assumed time to service one bin on arrival.',
  },
  /**
   * Straight-line (haversine) distance is used, not road-network distance.
   * Real routing needs a road graph — deferred to Phase-II per report §2.3.
   */
  DISTANCE_MODEL: {
    value: 'haversine',
    unit:  '',
    note:  'Great-circle distance between coordinates. Actual road distance will be higher; road-network routing is Phase-II scope.',
  },
});

/* ---------------------------------------------------------------------------
 * ROUTE OPTIMIZATION
 * Nearest-neighbour construction followed by 2-opt improvement.
 * The survey paper (§VI) recommends Dijkstra/A*; those operate on a road
 * graph we do not have. 2-opt over a haversine cost matrix is the honest
 * equivalent at this scope, and is documented as such.
 * ------------------------------------------------------------------------- */
export const ROUTING = Object.freeze({
  /** Only bins at or above this fill % enter the route. */
  MIN_FILL_PCT: THRESHOLDS.ALERT_PCT,

  /** 2-opt improvement passes. With <= 4 bins this converges immediately. */
  TWO_OPT_MAX_PASSES: 50,

  /**
   * Baseline for comparison: the traditional fixed route visits EVERY bin
   * in registration order regardless of fill level — precisely the problem
   * described in report §1.1.
   */
  BASELINE_VISITS_ALL: true,
});

/* ---------------------------------------------------------------------------
 * DEPLOYMENT
 * ------------------------------------------------------------------------- */
export const DEPLOYMENT = Object.freeze({
  /**
   * Four physical bins are planned. The system reads whatever is registered
   * in Firebase — this number is used only for setup scaffolding and for
   * sizing empty-state messages.
   */
  PLANNED_BIN_COUNT: 4,

  /**
   * Bins start as PLACEHOLDER and flip to DEVICE automatically on their
   * first real write from an ESP32. No code change is required when the
   * hardware comes online — that is the point of the provenance system.
   */
  INITIAL_SOURCE: DataSource.PLACEHOLDER,

  /**
   * Provisional coordinates, centred on Global Academy of Technology,
   * Rajarajeshwari Nagar. These are PLACEHOLDERS pending a site survey and
   * are badged as such in the UI. Edit in Settings once the real bin
   * positions are known — no code change needed.
   */
  CAMPUS_CENTER: { lat: 12.9606, lng: 77.4900 },
  DEFAULT_MAP_ZOOM: 17,

  /** Depot / collection-vehicle origin. Provisional. */
  DEPOT: { lat: 12.9606, lng: 77.4900, label: 'GAT Campus Depot' },
});

/* ---------------------------------------------------------------------------
 * UI
 * ------------------------------------------------------------------------- */
export const UI = Object.freeze({
  DEFAULT_THEME: 'dark',
  THEME_STORAGE_KEY: 'smartbin:theme',
  SIDEBAR_STORAGE_KEY: 'smartbin:sidebar',

  /** Points retained in live sparklines before the oldest is dropped. */
  SPARKLINE_POINTS: 24,

  /** History records fetched for the detail modal chart. */
  HISTORY_FETCH_LIMIT: 200,

  /** Max alerts rendered in the feed before virtualisation kicks in. */
  ALERT_FEED_LIMIT: 100,

  /** Timeline events held in memory. */
  TIMELINE_LIMIT: 200,

  /** Alert sounds. Muted by default — a console that beeps on load is a
   *  console people mute permanently. Opt in from Settings. */
  SOUND_ENABLED_DEFAULT: false,
  SOUNDS: {
    critical: 'assets/sounds/critical.mp3',
    warning:  'assets/sounds/alert.mp3',
    info:     'assets/sounds/notify.mp3',
  },
});

/* ---------------------------------------------------------------------------
 * AUTH
 * ------------------------------------------------------------------------- */
export const AUTH = Object.freeze({
  /** Role assigned to a newly created account until an admin changes it. */
  DEFAULT_ROLE: Role.USER,

  /** Where each role lands after signing in. */
  LANDING_ROUTE: {
    [Role.USER]:          '#/dashboard',
    [Role.MUNICIPALITY]:  '#/dashboard',
    [Role.ADMINISTRATOR]: '#/dashboard',
  },

  SESSION_WARNING_MIN: 55,
  SESSION_TIMEOUT_MIN: 60,
});

/* ---------------------------------------------------------------------------
 * FEATURE FLAGS
 * ------------------------------------------------------------------------- */
export const FEATURES = Object.freeze({
  SIMULATION_MODE:   true,   // admin-gated
  PREDICTION:        true,   // linear regression over history — NOT ML
  ROUTE_OPTIMIZER:   true,
  THREE_D_BIN:       true,
  EXPORT_CSV:        true,
  EXPORT_PDF:        true,
  SOUND_ALERTS:      true,
  LIGHT_THEME:       true,

  /** Phase-II per report §2.3 — schema reserved, UI hidden. */
  TEMPERATURE_SENSOR: false,
  HUMIDITY_SENSOR:    false,
  GAS_SENSOR:         false,
  SERVO_LID:          false,
  GPS_MODULE:         false,
  MOBILE_APP:         false,
});

/**
 * Single aggregated export for convenience.
 * Prefer importing the specific group you need — it keeps dependencies
 * legible and lets bundlers tree-shake if this ever moves to a build step.
 */
export default Object.freeze({
  THRESHOLDS,
  TIMING,
  SENSOR,
  DERIVED_METRICS,
  ROUTING,
  DEPLOYMENT,
  UI,
  AUTH,
  FEATURES,
});
