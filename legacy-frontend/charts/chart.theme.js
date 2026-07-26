/**
 * SmartBin+ — Chart.js Theme & Loader
 * =============================================================================
 * Lazy-loads Chart.js and applies a shared theme that reads from the design
 * tokens, so charts recolour correctly when the app theme changes.
 *
 * Chart.js is ~200 KB. Loading it on demand means the dashboard, map and
 * alert views never pay for it.
 *
 * @module charts/chart.theme
 */

const CHART_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js';

/** @type {Promise<any>|null} */
let chartPromise = null;

/**
 * Load Chart.js once.
 * @returns {Promise<any>} The Chart constructor.
 */
export function loadChartJs() {
  if (chartPromise) return chartPromise;

  chartPromise = new Promise((resolve, reject) => {
    if (window.Chart) { resolve(window.Chart); return; }

    const script = document.createElement('script');
    script.src = CHART_CDN;
    script.async = true;
    script.onload = () => {
      applyGlobalDefaults(window.Chart);
      resolve(window.Chart);
    };
    script.onerror = () => reject(
      new Error('Chart.js failed to load from CDN. Check the network connection.')
    );

    document.head.appendChild(script);
  });

  return chartPromise;
}

/**
 * Read a CSS custom property.
 *
 * Charts draw to canvas, which cannot use CSS variables directly — so the
 * computed values are resolved at construction time and re-resolved when the
 * theme changes.
 *
 * @param {string} name
 * @returns {string}
 */
export function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Current palette, resolved from tokens.
 * @returns {object}
 */
export function palette() {
  return {
    green:  token('--sb-green-500') || '#22C55E',
    blue:   token('--sb-blue-500')  || '#3B82F6',
    amber:  token('--sb-amber-500') || '#F59E0B',
    red:    token('--sb-red-500')   || '#EF4444',
    slate:  token('--sb-slate-500') || '#64748B',
    text:   token('--text-secondary') || '#94A3B8',
    textDim: token('--text-tertiary') || '#64748B',
    grid:   token('--border-subtle') || 'rgba(148,163,184,0.10)',
    surface: token('--surface-overlay') || '#1E293B',
    border: token('--border-default') || 'rgba(148,163,184,0.16)',
  };
}

/**
 * Global Chart.js defaults matching the design system.
 * @param {any} Chart
 */
function applyGlobalDefaults(Chart) {
  const p = palette();

  Chart.defaults.font.family = "'DM Sans', system-ui, sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.color = p.text;

  // Charts here display real telemetry; a long animation makes a live value
  // feel laggy rather than polished.
  Chart.defaults.animation.duration = 400;
  Chart.defaults.animation.easing = 'easeOutQuart';

  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.boxWidth = 6;
  Chart.defaults.plugins.legend.labels.boxHeight = 6;
  Chart.defaults.plugins.legend.labels.padding = 14;

  Chart.defaults.plugins.tooltip.backgroundColor = p.surface;
  Chart.defaults.plugins.tooltip.borderColor = p.border;
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.titleColor = token('--text-primary') || '#F1F5F9';
  Chart.defaults.plugins.tooltip.bodyColor = p.text;
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
  Chart.defaults.plugins.tooltip.displayColors = true;
  Chart.defaults.plugins.tooltip.titleFont = { family: "'DM Mono', monospace", size: 10 };
  Chart.defaults.plugins.tooltip.bodyFont = { family: "'DM Sans', sans-serif", size: 11 };
}

/**
 * Shared scale configuration for percentage axes.
 * @returns {object}
 */
export function percentScale() {
  const p = palette();

  return {
    beginAtZero: true,
    max: 100,
    ticks: {
      stepSize: 25,
      color: p.textDim,
      font: { family: "'DM Mono', monospace", size: 9 },
      callback: (value) => `${value}%`,
    },
    grid: { color: p.grid, drawTicks: false },
    border: { display: false },
  };
}

/**
 * Shared configuration for category (time) axes.
 * @returns {object}
 */
export function categoryScale() {
  const p = palette();

  return {
    ticks: {
      color: p.textDim,
      font: { family: "'DM Mono', monospace", size: 9 },
      maxRotation: 0,
      autoSkipPadding: 12,
    },
    grid: { display: false },
    border: { color: p.grid },
  };
}

/**
 * A vertical gradient for area fills.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} color
 * @param {number} [height=220]
 * @returns {CanvasGradient}
 */
export function areaGradient(ctx, color, height = 220) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, hexToRgba(color, 0.28));
  gradient.addColorStop(1, hexToRgba(color, 0));
  return gradient;
}

/**
 * @param {string} hex
 * @param {number} alpha
 * @returns {string}
 */
export function hexToRgba(hex, alpha) {
  const clean = hex.replace('#', '').trim();
  if (clean.length !== 6) return hex;

  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Colour for a fill percentage, matching the report §3.1 bands.
 * @param {number} pct
 * @returns {string}
 */
export function bandColor(pct) {
  const p = palette();
  if (pct >= 80) return p.red;
  if (pct >= 51) return p.amber;
  return p.green;
}

/**
 * Base options shared by most charts.
 * @returns {object}
 */
export function baseOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', align: 'end' },
    },
  };
}

export default {
  loadChartJs, token, palette, percentScale, categoryScale,
  areaGradient, hexToRgba, bandColor, baseOptions,
};
