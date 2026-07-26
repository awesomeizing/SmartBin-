/**
 * SmartBin+ — KPI Card Component
 * =============================================================================
 * Renders a single metric tile from a Metric object produced by js/utils/kpi.js.
 *
 * The component enforces the honesty rule structurally: if `value` is null it
 * renders an em dash. There is no code path that turns an unknown metric into
 * a zero, because a dashboard that guesses is worse than one that admits it
 * does not know.
 *
 * @module components/kpi-card/kpi-card
 */

import { num, EMPTY, escapeHtml } from '../../js/utils/format.js';

/**
 * @typedef {Object} KpiOptions
 * @property {string} label            Uppercase mono label.
 * @property {number|string|null} value
 * @property {string} [unit]
 * @property {string} [note]           Derivation/assumption — shown on hover.
 * @property {string} [tone]           healthy | warning | critical | info | offline
 * @property {number} [decimals=0]
 * @property {string} [href]           Makes the tile navigable.
 * @property {string} [foot]           Small caption under the value.
 * @property {{value: number, unit?: string}} [trend]
 * @property {boolean} [compact=false]
 * @property {boolean} [raw=false]     Skip number formatting (pre-formatted string).
 */

/**
 * Build the HTML for a KPI tile.
 *
 * @param {KpiOptions} options
 * @returns {string}
 */
export function renderKpi({
  label,
  value,
  unit = '',
  note = '',
  tone = '',
  decimals = 0,
  href = '',
  foot = '',
  trend = null,
  compact = false,
  raw = false,
}) {
  const isEmpty = value === null || value === undefined || value === '';

  const displayValue = isEmpty
    ? EMPTY
    : raw
      ? escapeHtml(String(value))
      : num(Number(value), decimals);

  // An unknown value is always styled as offline, whatever tone was requested —
  // there is no such thing as a "healthy" unknown.
  const toneClass = isEmpty ? 'kpi--offline' : tone ? `kpi--${tone}` : '';

  const tag = href ? 'a' : 'div';
  const linkAttrs = href ? ` href="${escapeHtml(href)}" class="kpi kpi--link` : ' class="kpi';

  return `
    <${tag}${linkAttrs}${compact ? ' kpi--compact' : ''} ${toneClass}"
        data-kpi="${escapeHtml(label)}">
      <div class="kpi__head">
        <span class="kpi__label">${escapeHtml(label)}</span>
        ${note ? `<span class="kpi__info" title="${escapeHtml(note)}"
                        role="img" aria-label="About this metric: ${escapeHtml(note)}">i</span>` : ''}
      </div>

      <div class="kpi__value${isEmpty ? ' kpi__value--empty' : ''}">
        <span data-kpi-value>${displayValue}</span>
        ${!isEmpty && unit ? `<span class="kpi__unit">${escapeHtml(unit)}</span>` : ''}
      </div>

      <div class="kpi__foot">
        ${trend ? renderTrend(trend) : ''}
        ${foot ? `<span>${escapeHtml(foot)}</span>` : ''}
      </div>
    </${tag}>`;
}

/**
 * Trend indicator.
 *
 * Note the inverted colour logic: for waste metrics, rising is bad. An arrow
 * up on "average fill level" is not good news, so it renders red.
 *
 * @param {{value: number, unit?: string}} trend
 * @returns {string}
 */
function renderTrend({ value, unit = '%' }) {
  if (!Number.isFinite(value) || value === 0) {
    return `<span class="kpi__trend kpi__trend--flat">→ no change</span>`;
  }

  const rising = value > 0;
  const arrow = rising ? '↑' : '↓';
  const cls = rising ? 'kpi__trend--up' : 'kpi__trend--down';

  return `<span class="kpi__trend ${cls}">${arrow} ${num(Math.abs(value), 1)}${escapeHtml(unit)}</span>`;
}

/**
 * Render a group of tiles into a container.
 *
 * @param {HTMLElement} container
 * @param {KpiOptions[]} tiles
 */
export function renderKpiGrid(container, tiles) {
  container.innerHTML = tiles.map(renderKpi).join('');
}

/**
 * Update one tile's value in place, flashing it so the change is noticeable.
 *
 * Used instead of re-rendering the whole grid on every Firebase tick: with a
 * 60-second poll interval a full re-render is affordable, but in-place update
 * preserves focus, hover state and scroll position.
 *
 * @param {HTMLElement} container
 * @param {string} label      The tile's label, used as its key.
 * @param {number|null} value
 * @param {number} [decimals=0]
 */
export function updateKpiValue(container, label, value, decimals = 0) {
  const tile = container.querySelector(`[data-kpi="${CSS.escape(label)}"]`);
  if (!tile) return;

  const valueEl = tile.querySelector('[data-kpi-value]');
  if (!valueEl) return;

  const next = value === null || value === undefined ? EMPTY : num(Number(value), decimals);
  if (valueEl.textContent === next) return;   // nothing changed — no flash

  valueEl.textContent = next;

  tile.classList.remove('kpi--updated');
  void tile.offsetWidth;             // force reflow so the animation restarts
  tile.classList.add('kpi--updated');
}

export default { renderKpi, renderKpiGrid, updateKpiValue };
