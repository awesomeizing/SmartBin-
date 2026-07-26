/**
 * SmartBin+ — Formatting Utilities
 * =============================================================================
 * Presentation helpers for numbers, dates, units and durations.
 *
 * One rule runs through this file: **a missing value is rendered as an em dash,
 * never as zero.** On a monitoring console, "0%" means the bin is empty and
 * "—" means we do not know. Collapsing the two would let a dead sensor read as
 * an empty bin, which is precisely the failure mode this project exists to
 * prevent.
 *
 * @module js/utils/format
 */

/** Rendered when a value is unknown, absent or invalid. */
export const EMPTY = '—';

/* ---------------------------------------------------------------------------
 * NUMBERS
 * ------------------------------------------------------------------------- */

/**
 * @param {number} value
 * @param {number} [decimals=0]
 * @returns {string}
 */
export function num(value, decimals = 0) {
  if (!Number.isFinite(value)) return EMPTY;
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * @param {number} value
 * @param {number} [decimals=0]
 * @returns {string} e.g. "72%"
 */
export function percent(value, decimals = 0) {
  if (!Number.isFinite(value)) return EMPTY;
  return `${num(value, decimals)}%`;
}

/**
 * Value with a unit suffix.
 * @param {number} value
 * @param {string} unit
 * @param {number} [decimals=1]
 * @returns {string} e.g. "12.4 km"
 */
export function withUnit(value, unit, decimals = 1) {
  if (!Number.isFinite(value)) return EMPTY;
  return `${num(value, decimals)} ${unit}`;
}

/**
 * Compact notation for large counts.
 * @param {number} value
 * @returns {string} e.g. "1.2K"
 */
export function compact(value) {
  if (!Number.isFinite(value)) return EMPTY;
  if (Math.abs(value) < 1000) return num(value);
  return new Intl.NumberFormat('en-IN', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * Signed delta, for trend indicators.
 * @param {number} value
 * @param {string} [unit='']
 * @returns {string} e.g. "+4.2%" / "−1.8%"
 */
export function delta(value, unit = '') {
  if (!Number.isFinite(value)) return EMPTY;
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${num(Math.abs(value), 1)}${unit}`;
}

/* ---------------------------------------------------------------------------
 * DATES & TIMES
 * ------------------------------------------------------------------------- */

/**
 * Wall-clock time.
 * @param {number|Date} ts
 * @param {boolean} [withSeconds=false]
 * @returns {string} e.g. "14:32" or "14:32:07"
 */
export function time(ts, withSeconds = false) {
  const d = toDate(ts);
  if (!d) return EMPTY;

  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds && { second: '2-digit' }),
    hour12: false,
  });
}

/**
 * @param {number|Date} ts
 * @returns {string} e.g. "25 Jul 2026"
 */
export function date(ts) {
  const d = toDate(ts);
  if (!d) return EMPTY;

  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * @param {number|Date} ts
 * @returns {string} e.g. "25 Jul 2026, 14:32"
 */
export function dateTime(ts) {
  const d = toDate(ts);
  if (!d) return EMPTY;
  return `${date(d)}, ${time(d)}`;
}

/**
 * ISO-style timestamp matching the schema in report §3.1
 * ("Timestamp (YYYY-MM-DD HH:MM:SS)"). Used for CSV export so the file
 * matches the documented data format.
 *
 * @param {number|Date} ts
 * @returns {string} e.g. "2026-07-25 14:32:07"
 */
export function schemaTimestamp(ts) {
  const d = toDate(ts);
  if (!d) return EMPTY;

  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Relative time. Deliberately coarse beyond an hour — an operator needs
 * "3 min ago" precisely and "2 days ago" only approximately.
 *
 * @param {number|Date} ts
 * @returns {string} e.g. "just now", "4 min ago", "2 days ago"
 */
export function relativeTime(ts) {
  const d = toDate(ts);
  if (!d) return EMPTY;

  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);

  if (seconds < 0)    return 'in the future';   // clock skew — worth surfacing
  if (seconds < 10)   return 'just now';
  if (seconds < 60)   return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)   return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24)     return `${hours} hr${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  if (days < 30)      return `${days} day${days === 1 ? '' : 's'} ago`;

  return date(d);
}

/**
 * Duration from seconds.
 * @param {number} seconds
 * @returns {string} e.g. "2d 4h", "38 min", "12s"
 */
export function duration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return EMPTY;

  if (seconds < 60) return `${Math.round(seconds)}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 24) return remMinutes ? `${hours}h ${remMinutes}m` : `${hours}h`;

  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours ? `${days}d ${remHours}h` : `${days}d`;
}

/**
 * Device uptime, in the HH:MM:SS form the firmware reports.
 * @param {number} seconds
 * @returns {string} e.g. "11:10:13"
 */
export function uptime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return EMPTY;

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/* ---------------------------------------------------------------------------
 * DOMAIN-SPECIFIC
 * ------------------------------------------------------------------------- */

/**
 * Distance in centimetres, as the HC-SR04 reports it.
 * One decimal reflects the sensor's real 3 mm resolution — printing more
 * would imply precision the hardware does not have.
 *
 * @param {number} cm
 * @returns {string} e.g. "5.0 cm"
 */
export function distanceCm(cm) {
  return withUnit(cm, 'cm', 1);
}

/**
 * @param {number} km
 * @returns {string} e.g. "12.4 km" / "840 m"
 */
export function distanceKm(km) {
  if (!Number.isFinite(km)) return EMPTY;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return withUnit(km, 'km', 1);
}

/**
 * Wi-Fi signal strength with a plain-language qualifier. Few municipal users
 * know what −72 dBm means; everyone understands "fair".
 *
 * @param {number} dbm
 * @returns {{text: string, quality: string, tone: string}}
 */
export function signal(dbm) {
  if (!Number.isFinite(dbm)) {
    return { text: EMPTY, quality: 'unknown', tone: 'offline' };
  }

  const text = `${dbm} dBm`;

  if (dbm >= -55) return { text, quality: 'excellent', tone: 'healthy' };
  if (dbm >= -67) return { text, quality: 'good',      tone: 'healthy' };
  if (dbm >= -80) return { text, quality: 'fair',      tone: 'warning' };
  return { text, quality: 'weak', tone: 'critical' };
}

/**
 * @param {number} pct
 * @returns {{text: string, tone: string}}
 */
export function battery(pct) {
  if (!Number.isFinite(pct)) return { text: EMPTY, tone: 'offline' };

  const text = `${Math.round(pct)}%`;
  if (pct <= 10) return { text, tone: 'critical' };
  if (pct <= 20) return { text, tone: 'warning' };
  return { text, tone: 'healthy' };
}

/**
 * @param {number} litres
 * @returns {string} e.g. "4.2 L"
 */
export function fuel(litres) {
  return withUnit(litres, 'L', 1);
}

/**
 * @param {number} kg
 * @returns {string} e.g. "11.3 kg" / "1.24 t"
 */
export function co2(kg) {
  if (!Number.isFinite(kg)) return EMPTY;
  if (kg >= 1000) return withUnit(kg / 1000, 't', 2);
  return withUnit(kg, 'kg', 1);
}

/**
 * Truncate a bin ID for tight layouts, preserving the meaningful suffix.
 * @param {string} binId
 * @returns {string}
 */
export function binIdShort(binId) {
  if (typeof binId !== 'string') return EMPTY;
  return binId.replace(/^BIN-?/i, '');
}

/**
 * Escape a string for safe interpolation into innerHTML.
 *
 * Bin labels and addresses are administrator-supplied and therefore
 * untrusted. Anywhere this project builds markup from data, the values pass
 * through here first.
 *
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Pluralise a noun by count.
 * @param {number} count
 * @param {string} singular
 * @param {string} [plural]
 * @returns {string} e.g. "1 bin", "4 bins"
 */
export function pluralize(count, singular, plural = `${singular}s`) {
  return `${num(count)} ${count === 1 ? singular : plural}`;
}

/**
 * Coerce a timestamp into a Date, rejecting anything invalid.
 * @param {number|Date|string} ts
 * @returns {Date|null}
 */
function toDate(ts) {
  if (ts == null) return null;

  const d = ts instanceof Date ? ts : new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default {
  EMPTY,
  num, percent, withUnit, compact, delta,
  time, date, dateTime, schemaTimestamp, relativeTime, duration, uptime,
  distanceCm, distanceKm, signal, battery, fuel, co2,
  binIdShort, escapeHtml, pluralize,
};
