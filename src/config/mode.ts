// ─────────────────────────────────────────────────────────────
// SmartBin+ — DATA MODE
// ─────────────────────────────────────────────────────────────
// There are exactly two modes, and which one is active is an explicit
// choice — never an accident of a missing environment variable.
//
//   REAL        ESP32 telemetry only. Nothing is invented. A bin that has
//               never reported shows "Waiting for device", not a number.
//
//   SIMULATION  Controlled fake data for development. Always announced in
//               the UI with a visible SIMULATION badge.
//
// The old behaviour — IS_DEMO_MODE derived from "is the Firebase API key
// missing?" — meant a misconfigured production deploy silently served mock
// data that looked completely real. That is the single most dangerous thing
// a monitoring dashboard can do, and it is why this file exists.
// ─────────────────────────────────────────────────────────────

export type DataMode = 'real' | 'simulation';

const RAW_MODE = (import.meta.env.VITE_DATA_MODE ?? '').toLowerCase().trim();

/**
 * Active data mode.
 *
 * Set VITE_DATA_MODE=simulation in .env.local for development without
 * hardware. Anything else — including unset — is REAL.
 */
export const DATA_MODE: DataMode = RAW_MODE === 'simulation' ? 'simulation' : 'real';

export const IS_SIMULATION = DATA_MODE === 'simulation';
export const IS_REAL = DATA_MODE === 'real';

// ── Firebase configuration health ──────────────────────────

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
const dbUrl = import.meta.env.VITE_FIREBASE_DATABASE_URL;

/**
 * Whether Firebase credentials are actually present.
 *
 * Note this is NOT the mode. In REAL mode with no credentials the app shows
 * a configuration error — it does not quietly fall back to fake data.
 */
export const IS_FIREBASE_CONFIGURED = Boolean(
  apiKey && apiKey !== 'REPLACE_ME' && dbUrl && !dbUrl.includes('REPLACE_ME'),
);

/**
 * True when the app is in REAL mode but cannot reach a backend.
 * The UI must surface this rather than rendering an empty dashboard that
 * looks like "all bins offline".
 */
export const IS_MISCONFIGURED = IS_REAL && !IS_FIREBASE_CONFIGURED;

export const MODE_BANNER = IS_SIMULATION
  ? { label: 'SIMULATION', detail: 'Displaying generated data — no physical devices connected.' }
  : null;
