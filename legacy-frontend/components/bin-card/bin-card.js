/**
 * SmartBin+ — Bin Card Component
 * =============================================================================
 * Renders a bin summary card.
 *
 * Two behaviours worth noting, both consequences of the honesty rule:
 *
 *   1. A bin with no reading shows an em dash, not 0%. An empty bin and a
 *      dead sensor are different situations and must never look alike.
 *   2. An offline bin is dimmed and annotated with the age of its last
 *      reading, because its numbers describe the past.
 *
 * @module components/bin-card/bin-card
 */

import {
  escapeHtml, percent, relativeTime, distanceCm, signal, battery, EMPTY,
} from '../../js/utils/format.js';
import { getFillColorVar, getFillBand } from '../../js/utils/fill.js';
import {
  DataSource, DeviceState, PROVENANCE_LABEL, PROVENANCE_DESCRIPTION,
} from '../../config/constants.js';
import { THRESHOLDS } from '../../config/app.config.js';

/**
 * Render a bin card.
 *
 * @param {object} bin
 * @param {object} [options]
 * @param {boolean} [options.compact=false]
 * @param {boolean} [options.selected=false]
 * @returns {string}
 */
export function renderBinCard(bin, { compact = false, selected = false } = {}) {
  const live = bin.live ?? {};
  const meta = bin.meta ?? {};

  const hasReading = Number.isFinite(live.fillPct);
  const isOffline = bin.deviceState === DeviceState.OFFLINE;
  const isStale = bin.deviceState === DeviceState.STALE;

  const fillPct = hasReading ? live.fillPct : null;
  const band = hasReading ? getFillBand(fillPct) : null;
  const threshold = meta.thresholdPct ?? THRESHOLDS.ALERT_PCT;

  const isCritical = hasReading && fillPct >= threshold && !isOffline;
  const railColor = isOffline ? 'var(--status-offline)'
                  : hasReading ? getFillColorVar(fillPct)
                  : 'var(--status-offline)';

  const source = meta.source ?? DataSource.PLACEHOLDER;

  const classes = [
    'bin-card',
    compact && 'bin-card--compact',
    selected && 'is-selected',
    isCritical && 'bin-card--critical',
    isOffline && 'bin-card--offline',
  ].filter(Boolean).join(' ');

  return `
    <article class="${classes}"
             data-bin-id="${escapeHtml(bin.binId)}"
             data-source="${escapeHtml(source)}"
             tabindex="0"
             role="button"
             aria-label="${escapeHtml(meta.label ?? bin.binId)}, ${
               hasReading ? `${Math.round(fillPct)} percent full` : 'no reading'
             }">

      <span class="bin-card__rail" style="--rail-color:${railColor}" aria-hidden="true"></span>

      <header class="bin-card__head">
        <div class="bin-card__identity">
          <h3 class="bin-card__label">${escapeHtml(meta.label ?? bin.binId)}</h3>
          <div class="bin-card__id">
            <span>${escapeHtml(bin.binId)}</span>
            <span aria-hidden="true">·</span>
            <span>${escapeHtml(meta.zone ?? 'Unzoned')}</span>
          </div>
        </div>

        <div class="bin-card__badges">
          ${renderProvenanceBadge(source)}
          ${renderStatusPill(bin, hasReading, isOffline, isStale, band)}
        </div>
      </header>

      <div class="bin-card__fill">
        ${hasReading
          ? `<span class="bin-card__pct" style="--fill-color:${getFillColorVar(fillPct)}">${percent(fillPct)}</span>`
          : `<span class="bin-card__pct bin-card__pct--unknown">${EMPTY}</span>`}
        <span class="bin-card__state">${
          hasReading ? escapeHtml(live.binStatus ?? band?.status ?? '') : 'No reading'
        }</span>
      </div>

      <div class="meter" role="img"
           aria-label="${hasReading ? `Fill level ${Math.round(fillPct)} percent` : 'Fill level unknown'}">
        <div class="meter__fill"
             style="width:${hasReading ? fillPct : 0}%; --meter-color:${railColor}"></div>
        <div class="meter__threshold" style="inset-inline-start:${threshold}%"
             title="Alert threshold: ${threshold}%"></div>
      </div>

      ${isOffline || isStale
        ? `<div class="bin-card__stale-note">
             ${isOffline ? 'Offline' : 'Stale'} — last reading ${
               live.timestamp ? relativeTime(live.timestamp) : 'never received'
             }
           </div>`
        : ''}

      ${compact ? '' : renderTelemetry(live)}
    </article>`;
}

/**
 * Provenance badge. Always rendered — there is no state in which a bin's
 * data source is hidden.
 *
 * @param {string} source
 * @returns {string}
 */
function renderProvenanceBadge(source) {
  const label = PROVENANCE_LABEL[source] ?? 'UNKNOWN';
  const description = PROVENANCE_DESCRIPTION[source] ?? '';

  return `<span class="provenance provenance--${escapeHtml(source)}"
                title="${escapeHtml(description)}">${escapeHtml(label)}</span>`;
}

/**
 * @returns {string}
 */
function renderStatusPill(bin, hasReading, isOffline, isStale, band) {
  if (isOffline) {
    return `<span class="pill pill--offline"><span class="pill__dot"></span>OFFLINE</span>`;
  }
  if (isStale) {
    return `<span class="pill pill--warning"><span class="pill__dot"></span>STALE</span>`;
  }
  if (!hasReading) {
    return `<span class="pill pill--offline"><span class="pill__dot"></span>NO DATA</span>`;
  }

  const tone = band.key;
  const isLive = bin.meta?.source === DataSource.DEVICE;

  return `<span class="pill pill--${tone}${isLive ? ' pill--live' : ''}">
            <span class="pill__dot"></span>${escapeHtml(band.status.toUpperCase())}
          </span>`;
}

/**
 * Telemetry strip — distance, signal, battery.
 * @param {object} live
 * @returns {string}
 */
function renderTelemetry(live) {
  const sig = signal(live.rssi);
  const bat = battery(live.batteryPct);

  return `
    <div class="bin-card__telemetry">
      <div class="bin-card__metric">
        <div class="bin-card__metric-label">Distance</div>
        <div class="bin-card__metric-value">${distanceCm(live.distanceCm)}</div>
      </div>
      <div class="bin-card__metric">
        <div class="bin-card__metric-label">Signal</div>
        <div class="bin-card__metric-value is-${sig.tone}"
             title="${escapeHtml(sig.quality)}">${escapeHtml(sig.text)}</div>
      </div>
      <div class="bin-card__metric">
        <div class="bin-card__metric-label">Battery</div>
        <div class="bin-card__metric-value is-${bat.tone}">${escapeHtml(bat.text)}</div>
      </div>
    </div>`;
}

/**
 * Render a collection of bins into a container and wire up interaction.
 *
 * @param {HTMLElement} container
 * @param {object[]} bins
 * @param {object} [options]
 * @param {(binId: string) => void} [options.onSelect]
 * @param {string} [options.selectedId]
 * @param {boolean} [options.compact]
 */
export function renderBinGrid(container, bins, { onSelect, selectedId, compact } = {}) {
  if (bins.length === 0) {
    container.innerHTML = `
      <div class="card card--padded ta-center c-tertiary t-sm span-full">
        No bins match the current filter.
      </div>`;
    return;
  }

  container.innerHTML = bins
    .map((bin) => renderBinCard(bin, { compact, selected: bin.binId === selectedId }))
    .join('');

  if (!onSelect) return;

  container.querySelectorAll('[data-bin-id]').forEach((card) => {
    const binId = card.dataset.binId;

    card.addEventListener('click', () => onSelect(binId));

    // Keyboard parity — the card is role="button", so it must respond to
    // Enter and Space like one.
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect(binId);
      }
    });
  });
}

/**
 * Filter and sort a bin collection.
 *
 * @param {object[]} bins
 * @param {object} options
 * @param {string} [options.filter='all'] all | critical | warning | healthy | offline
 * @param {string} [options.search='']
 * @param {string} [options.sort='fill'] fill | id | zone | battery
 * @returns {object[]}
 */
export function filterBins(bins, { filter = 'all', search = '', sort = 'fill' } = {}) {
  let result = [...bins];

  if (filter !== 'all') {
    result = result.filter((bin) => {
      if (filter === 'offline') return bin.deviceState === DeviceState.OFFLINE;
      if (bin.deviceState === DeviceState.OFFLINE) return false;

      const fill = bin.live?.fillPct;
      if (!Number.isFinite(fill)) return false;

      const band = getFillBand(fill).key;
      return band === filter;
    });
  }

  const query = search.trim().toLowerCase();
  if (query) {
    result = result.filter((bin) =>
      [bin.binId, bin.meta?.label, bin.meta?.zone, bin.meta?.address]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(query))
    );
  }

  const sorters = {
    // Fullest first — the default, because that is the operational question.
    fill: (a, b) => (b.live?.fillPct ?? -1) - (a.live?.fillPct ?? -1),
    id: (a, b) => a.binId.localeCompare(b.binId),
    zone: (a, b) =>
      (a.meta?.zone ?? '').localeCompare(b.meta?.zone ?? '') ||
      a.binId.localeCompare(b.binId),
    battery: (a, b) => (a.live?.batteryPct ?? 101) - (b.live?.batteryPct ?? 101),
  };

  return result.sort(sorters[sort] ?? sorters.fill);
}

export default { renderBinCard, renderBinGrid, filterBins };
