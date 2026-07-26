/**
 * SmartBin+ — Bin Detail Modal
 * =============================================================================
 * The complete record for a single bin: every field in the specification,
 * plus a live history sparkline, health decomposition and fill projection.
 *
 * The modal subscribes to that bin's history on open and unsubscribes on
 * close. Forgetting the second half is how a dashboard ends a shift with
 * forty live Firebase queries running.
 *
 * @module components/bin-modal/bin-modal
 */

import { subscribeBinHistory, unsubscribeBinHistory } from '../../firebase/listeners.js';
import {
  escapeHtml, percent, relativeTime, dateTime, distanceCm,
  signal, battery, uptime, duration, EMPTY,
} from '../../js/utils/format.js';
import {
  getFillColorVar, getFillBand, calculateHealthScore,
  calculateCollectionPriority, projectTimeToThreshold,
} from '../../js/utils/fill.js';
import { formatCoord } from '../../js/utils/geo.js';
import {
  DataSource, DeviceState, PROVENANCE_LABEL, PROVENANCE_DESCRIPTION,
} from '../../config/constants.js';
import { THRESHOLDS, FEATURES } from '../../config/app.config.js';

/** @type {HTMLElement|null} */
let backdrop = null;

/** @type {string|null} */
let openBinId = null;

/** @type {HTMLElement|null} Element focus returns to on close. */
let previousFocus = null;

/**
 * Open the detail modal for a bin.
 *
 * @param {object} bin
 */
export function openBinModal(bin) {
  closeBinModal();

  previousFocus = document.activeElement;
  openBinId = bin.binId;

  backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', `Details for ${bin.meta?.label ?? bin.binId}`);
  backdrop.innerHTML = template(bin);

  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';

  bindInteractions(bin);
  loadHistory(bin);

  // Focus the close button so keyboard users land somewhere sensible.
  backdrop.querySelector('.modal__close')?.focus();
}

/** Close the modal and release its subscription. */
export function closeBinModal() {
  if (!backdrop) return;

  if (openBinId) unsubscribeBinHistory(openBinId);

  backdrop.remove();
  backdrop = null;
  openBinId = null;

  document.body.style.overflow = '';
  previousFocus?.focus();
  previousFocus = null;
}

/* ---------------------------------------------------------------------------
 * INTERACTION
 * ------------------------------------------------------------------------- */

function bindInteractions(bin) {
  backdrop.querySelector('.modal__close')?.addEventListener('click', closeBinModal);

  // Click outside to dismiss.
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeBinModal();
  });

  backdrop.querySelector('[data-action="view-map"]')?.addEventListener('click', () => {
    location.hash = `#/map?bin=${encodeURIComponent(bin.binId)}`;
    closeBinModal();
  });

  document.addEventListener('keydown', handleKeydown);
}

/**
 * Escape closes; Tab is trapped inside the dialog.
 * @param {KeyboardEvent} e
 */
function handleKeydown(e) {
  if (!backdrop) {
    document.removeEventListener('keydown', handleKeydown);
    return;
  }

  if (e.key === 'Escape') {
    closeBinModal();
    document.removeEventListener('keydown', handleKeydown);
    return;
  }

  if (e.key !== 'Tab') return;

  // Focus trap — without this, Tab walks out of the dialog into the page
  // behind it, which is disorienting for keyboard and screen-reader users.
  const focusable = backdrop.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/* ---------------------------------------------------------------------------
 * HISTORY
 * ------------------------------------------------------------------------- */

/**
 * Subscribe to the bin's history and render the sparkline and projection.
 * @param {object} bin
 */
function loadHistory(bin) {
  subscribeBinHistory(bin.binId, (records) => {
    if (!backdrop) return;

    const sparkline = backdrop.querySelector('#bin-sparkline');
    const projection = backdrop.querySelector('#bin-projection');

    if (records.length < 2) {
      sparkline.innerHTML =
        '<div class="sparkline__empty">Not enough history to plot a trend yet.</div>';
      if (projection) {
        projection.textContent = 'Awaiting more readings.';
      }
      return;
    }

    sparkline.innerHTML = renderSparkline(records, bin);

    // Statistical projection — explicitly not machine learning.
    // See js/utils/fill.js projectTimeToThreshold.
    if (projection && FEATURES.PREDICTION) {
      const threshold = bin.meta?.thresholdPct ?? THRESHOLDS.ALERT_PCT;
      const { hoursToFull, ratePerHour, confidence } =
        projectTimeToThreshold(records, threshold);

      projection.textContent = describeProjection(hoursToFull, ratePerHour, confidence, threshold);
    }
  });
}

/**
 * @returns {string}
 */
function describeProjection(hoursToFull, ratePerHour, confidence, threshold) {
  if (confidence === 'insufficient-data') return 'Not enough history to project a trend.';
  if (confidence === 'already-critical')  return `Already at or above the ${threshold}% threshold.`;
  if (confidence === 'stable')            return 'Fill level is stable — no threshold crossing projected.';

  const qualifier = confidence === 'high' ? 'Trend is consistent'
                  : confidence === 'moderate' ? 'Trend is moderately consistent'
                  : 'Trend is noisy — treat with caution';

  return `Filling at ${ratePerHour}%/hr. Projected to reach ${threshold}% in ` +
         `${duration(hoursToFull * 3600)}. ${qualifier}. ` +
         'Statistical projection from historical readings, not a machine-learning forecast.';
}

/**
 * Render an SVG sparkline of fill level over time.
 *
 * Hand-drawn rather than Chart.js: this is a 120px decorative trend line
 * inside a modal, and pulling a charting library in for it would be
 * disproportionate. The Analytics view uses Chart.js properly.
 *
 * @param {Array<{fillPct: number, timestamp: number}>} records
 * @param {object} bin
 * @returns {string}
 */
function renderSparkline(records, bin) {
  const W = 640;
  const H = 120;
  const PAD = { top: 12, right: 12, bottom: 18, left: 30 };

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const points = records.slice(-60);
  const times = points.map((p) => p.timestamp);
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const span = maxT - minT || 1;

  const x = (t) => PAD.left + ((t - minT) / span) * plotW;
  const y = (pct) => PAD.top + (1 - pct / 100) * plotH;

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.timestamp).toFixed(1)} ${y(p.fillPct).toFixed(1)}`)
    .join(' ');

  const areaPath =
    `${path} L ${x(maxT).toFixed(1)} ${PAD.top + plotH} L ${x(minT).toFixed(1)} ${PAD.top + plotH} Z`;

  const threshold = bin.meta?.thresholdPct ?? THRESHOLDS.ALERT_PCT;
  const thresholdY = y(threshold);

  const latest = points[points.length - 1];
  const lineColor = getFillColorVar(latest.fillPct);

  return `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="100%"
         preserveAspectRatio="none" role="img"
         aria-label="Fill level history, ${points.length} readings">

      <!-- Gridlines at 0, 50, 100 -->
      ${[0, 50, 100].map((v) => `
        <line x1="${PAD.left}" y1="${y(v)}" x2="${W - PAD.right}" y2="${y(v)}"
              stroke="var(--border-subtle)" stroke-width="1"/>
        <text x="${PAD.left - 6}" y="${y(v) + 3}" text-anchor="end"
              font-family="DM Mono, monospace" font-size="8"
              fill="var(--text-disabled)">${v}</text>`).join('')}

      <!-- Alert threshold -->
      <line x1="${PAD.left}" y1="${thresholdY}" x2="${W - PAD.right}" y2="${thresholdY}"
            stroke="var(--status-critical)" stroke-width="1"
            stroke-dasharray="4 4" opacity="0.5"/>
      <text x="${W - PAD.right}" y="${thresholdY - 4}" text-anchor="end"
            font-family="DM Mono, monospace" font-size="8"
            fill="var(--status-critical)" opacity="0.8">${threshold}%</text>

      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stop-color="${lineColor}" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="${lineColor}" stop-opacity="0"/>
        </linearGradient>
      </defs>

      <path d="${areaPath}" fill="url(#spark-fill)"/>
      <path d="${path}" fill="none" stroke="${lineColor}"
            stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>

      <circle cx="${x(latest.timestamp).toFixed(1)}" cy="${y(latest.fillPct).toFixed(1)}"
              r="3" fill="${lineColor}"/>
    </svg>`;
}

/* ---------------------------------------------------------------------------
 * TEMPLATE
 * ------------------------------------------------------------------------- */

/**
 * @param {object} bin
 * @returns {string}
 */
function template(bin) {
  const live = bin.live ?? {};
  const meta = bin.meta ?? {};
  const reserved = bin.reserved ?? {};

  const hasReading = Number.isFinite(live.fillPct);
  const isOffline = bin.deviceState === DeviceState.OFFLINE;
  const fillPct = hasReading ? live.fillPct : null;
  const band = hasReading ? getFillBand(fillPct) : null;

  const source = meta.source ?? DataSource.PLACEHOLDER;
  const health = calculateHealthScore(bin);
  const priority = calculateCollectionPriority(bin);
  const threshold = meta.thresholdPct ?? THRESHOLDS.ALERT_PCT;

  const sig = signal(live.rssi);
  const bat = battery(live.batteryPct);

  return `
    <div class="modal">
      <header class="modal__header">
        <div class="min-w-0">
          <h2 class="modal__title">${escapeHtml(meta.label ?? bin.binId)}</h2>
          <div class="modal__subtitle">
            <span>${escapeHtml(bin.binId)}</span>
            <span aria-hidden="true">·</span>
            <span>${escapeHtml(meta.zone ?? 'Unzoned')}</span>
            <span class="provenance provenance--${escapeHtml(source)}"
                  title="${escapeHtml(PROVENANCE_DESCRIPTION[source] ?? '')}">
              ${escapeHtml(PROVENANCE_LABEL[source] ?? 'UNKNOWN')}
            </span>
          </div>
        </div>
        <button class="modal__close" aria-label="Close dialog">×</button>
      </header>

      <div class="modal__body">

        <!-- Hero gauge -->
        <div class="bin-hero">
          <div class="bin-hero__gauge">
            ${renderGauge(fillPct, threshold)}
            <div class="bin-hero__gauge-value"
                 style="--gauge-color:${hasReading ? getFillColorVar(fillPct) : 'var(--text-disabled)'}">
              ${hasReading ? Math.round(fillPct) : EMPTY}
              <span class="bin-hero__gauge-unit">${hasReading ? 'PERCENT' : 'NO DATA'}</span>
            </div>
          </div>

          <div class="bin-hero__detail">
            <div class="bin-hero__status">
              ${isOffline ? 'Device offline'
                : hasReading ? escapeHtml(band.label)
                : 'No reading received'}
            </div>
            <p class="bin-hero__note">
              ${isOffline
                ? `This bin has not reported within the expected window. The values below are from its last transmission ${live.timestamp ? relativeTime(live.timestamp) : ''} and may no longer be accurate.`
                : hasReading
                  ? `Collection priority: <strong>${escapeHtml(priority.label)}</strong>. Alert threshold is ${threshold}%.`
                  : 'This bin is registered but has not yet transmitted any sensor data.'}
            </p>
          </div>
        </div>

        <!-- Live telemetry -->
        <div class="field-group">
          <h3 class="field-group__title">Live Telemetry</h3>
          <div class="field-grid">
            ${field('Fill Level', hasReading ? percent(fillPct, 1) : null, band?.key)}
            ${field('Sensor Distance', Number.isFinite(live.distanceCm) ? distanceCm(live.distanceCm) : null)}
            ${field('Bin Status', live.binStatus, band?.key)}
            ${field('Signal Strength', Number.isFinite(live.rssi) ? sig.text : null, sig.tone)}
            ${field('Battery', Number.isFinite(live.batteryPct) ? bat.text : null, bat.tone)}
            ${field('Device Uptime', Number.isFinite(live.uptimeSec) ? uptime(live.uptimeSec) : null)}
            ${field('Message Status', live.messageStatus,
                    live.messageStatus === 'Failed' ? 'critical' : 'healthy')}
            ${field('Last Updated', live.timestamp ? relativeTime(live.timestamp) : null,
                    isOffline ? 'critical' : 'healthy')}
          </div>
        </div>

        <!-- History -->
        <div class="field-group">
          <h3 class="field-group__title">Fill History</h3>
          <div class="sparkline" id="bin-sparkline">
            <div class="sparkline__empty">Loading history…</div>
          </div>
          <p class="t-xs c-tertiary mt-3" id="bin-projection">Calculating projection…</p>
        </div>

        <!-- Health -->
        <div class="field-group">
          <h3 class="field-group__title">Health Score</h3>
          <div class="health-bar">
            <span class="health-score"
                  style="--health-color:${healthColor(health.score)}">${health.score}</span>
            <div class="meter meter--lg flex-1">
              <div class="meter__fill"
                   style="width:${health.score}%; --meter-color:${healthColor(health.score)}"></div>
            </div>
          </div>
          ${health.factors.length
            ? health.factors.map((f) => `
                <div class="health-factor">
                  <span>${escapeHtml(f.label)}</span>
                  <span class="health-factor__delta">${f.delta}</span>
                </div>`).join('')
            : '<p class="t-xs c-tertiary">No issues detected. All monitored components reporting normally.</p>'}
        </div>

        <!-- Registration -->
        <div class="field-group">
          <h3 class="field-group__title">Registration</h3>
          <div class="field-grid">
            ${field('Bin ID', bin.binId)}
            ${field('Zone', meta.zone)}
            ${field('Bin Depth', Number.isFinite(meta.depthCm) ? `${meta.depthCm} cm` : null)}
            ${field('Alert Threshold', `${threshold}%`)}
            ${field('Coordinates', meta.location ? formatCoord(meta.location) : null)}
            ${field('Installed', meta.installedAt ? dateTime(meta.installedAt) : null)}
          </div>
          ${meta.address
            ? `<p class="t-xs c-tertiary mt-3">${escapeHtml(meta.address)}</p>`
            : ''}
          ${meta.location?.source === 'manual'
            ? `<p class="t-2xs c-tertiary mt-2">
                 Coordinates are administrator-assigned. The ESP32 has no GPS module —
                 GPS integration is Phase-II scope per report §1.3.
               </p>`
            : ''}
        </div>

        <!-- Phase-II sensors -->
        <div class="field-group">
          <h3 class="field-group__title">Planned Sensors</h3>
          <div class="field-grid">
            ${futureField('Temperature',
              Number.isFinite(reserved.temperatureC) ? `${reserved.temperatureC} °C` : null)}
            ${futureField('Humidity',
              Number.isFinite(reserved.humidityPct) ? `${reserved.humidityPct} %` : null)}
            ${futureField('Gas Level',
              Number.isFinite(reserved.gasPpm) ? `${reserved.gasPpm} ppm` : null)}
          </div>
          <p class="t-2xs c-tertiary mt-3">
            These fields are reserved in the database schema. No corresponding
            hardware is fitted to the current prototype — any values shown here
            originate from the Simulation Engine.
          </p>
        </div>
      </div>

      <footer class="modal__footer">
        <span class="t-2xs c-tertiary mono">
          ${escapeHtml(PROVENANCE_DESCRIPTION[source] ?? '')}
        </span>
        <div class="modal__actions">
          <button class="btn-sm" data-action="view-map">View on map</button>
        </div>
      </footer>
    </div>`;
}

/**
 * Circular gauge.
 * @param {number|null} fillPct
 * @param {number} threshold
 * @returns {string}
 */
function renderGauge(fillPct, _threshold) {
  const R = 42;
  const CIRC = 2 * Math.PI * R;
  const pct = Number.isFinite(fillPct) ? fillPct : 0;
  const offset = CIRC * (1 - pct / 100);

  return `
    <svg viewBox="0 0 96 96" width="96" height="96" aria-hidden="true">
      <circle cx="48" cy="48" r="${R}" fill="none"
              stroke="var(--surface-inset)" stroke-width="6"/>
      <circle cx="48" cy="48" r="${R}" fill="none"
              stroke="var(--border-subtle)" stroke-width="6"
              stroke-dasharray="1 6" opacity="0.5"/>
      ${Number.isFinite(fillPct) ? `
        <circle cx="48" cy="48" r="${R}" fill="none"
                stroke="${getFillColorVar(fillPct)}" stroke-width="6"
                stroke-linecap="round"
                stroke-dasharray="${CIRC.toFixed(2)}"
                stroke-dashoffset="${offset.toFixed(2)}"
                style="transition: stroke-dashoffset var(--duration-slow) var(--ease-decelerate)"/>` : ''}
    </svg>`;
}

/**
 * A single field. Renders an em dash when the value is absent.
 *
 * @param {string} label
 * @param {string|null} value
 * @param {string} [tone]
 * @returns {string}
 */
function field(label, value, tone = '') {
  const isEmpty = value === null || value === undefined || value === '';

  return `
    <div class="field-item">
      <div class="field-item__label">${escapeHtml(label)}</div>
      <div class="field-item__value ${isEmpty ? 'is-empty' : tone ? `is-${tone}` : ''}">
        ${isEmpty ? EMPTY : escapeHtml(String(value))}
      </div>
    </div>`;
}

/**
 * A Phase-II field — visibly marked as not-yet-implemented.
 * @param {string} label
 * @param {string|null} value
 * @returns {string}
 */
function futureField(label, value) {
  const isEmpty = value === null || value === undefined;

  return `
    <div class="field-item field-item--future">
      <div class="field-item__label">${escapeHtml(label)}</div>
      <div class="field-item__value ${isEmpty ? 'is-empty' : ''}">
        ${isEmpty ? 'Not fitted' : escapeHtml(String(value))}
      </div>
    </div>`;
}

/**
 * @param {number} score
 * @returns {string}
 */
function healthColor(score) {
  if (score >= 80) return 'var(--status-healthy)';
  if (score >= 50) return 'var(--status-warning)';
  return 'var(--status-critical)';
}

export default { openBinModal, closeBinModal };
