/**
 * SmartBin+ — Alert Center
 * =============================================================================
 * Monitoring console for active incidents, acknowledgements and history.
 *
 * Ordering is by severity then recency, not recency alone. A critical alert
 * from twenty minutes ago outranks an informational one from thirty seconds
 * ago, because that is the order in which an operator should act.
 *
 * @module pages/alerts/alerts.page
 */

import { subscribe, getAlerts, getBin, get, roleAtLeast } from '../../js/core/store.js';
import { acknowledgeAlert, resolveAlert } from '../../firebase/db.service.js';
import { openBinModal, closeBinModal } from '../../components/bin-modal/bin-modal.js';
import { showToast } from '../../components/toast/toast.js';
import { renderKpi } from '../../components/kpi-card/kpi-card.js';
import { countAlerts, meanResponseTime } from '../../js/utils/kpi.js';
import { escapeHtml, relativeTime, dateTime, duration, pluralize } from '../../js/utils/format.js';
import {
  AlertState, AlertSeverity, Role, DataSource, PROVENANCE_LABEL,
} from '../../config/constants.js';

/** Severity ranking for sorting — higher sorts first. */
const SEVERITY_RANK = {
  [AlertSeverity.CRITICAL]: 3,
  [AlertSeverity.WARNING]: 2,
  [AlertSeverity.INFO]: 1,
};

const SEVERITY_ICON = {
  [AlertSeverity.CRITICAL]: '⬤',
  [AlertSeverity.WARNING]: '▲',
  [AlertSeverity.INFO]: '●',
};

/**
 * @param {HTMLElement} outlet
 * @returns {() => void}
 */
export function mount(outlet) {
  outlet.innerHTML = template();

  const kpiEl     = outlet.querySelector('#alert-kpis');
  const filterEl  = outlet.querySelector('#alert-filters');
  const searchEl  = outlet.querySelector('#alert-search');
  const sortEl    = outlet.querySelector('#alert-sort');
  const listEl    = outlet.querySelector('#alert-list');
  const summaryEl = outlet.querySelector('#alert-summary');

  const view = { filter: 'active', search: '', sort: 'severity' };

  const render = () => {
    const alerts = getAlerts();
    const counts = countAlerts(alerts);

    renderKpis(kpiEl, alerts, counts);
    renderFilters(filterEl, view.filter, counts, alerts.length);

    const visible = applyView(alerts, view);

    summaryEl.textContent = visible.length
      ? `${pluralize(visible.length, 'alert')} shown`
      : '';

    listEl.innerHTML = visible.length
      ? visible.map(renderAlertRow).join('')
      : renderEmpty(view.filter);
  };

  /* --- Actions ----------------------------------------------------------
     Delegated from the list container, since rows are re-rendered on every
     data change and per-row listeners would leak. */
  listEl.addEventListener('click', async (e) => {
    const ackBtn     = e.target.closest('[data-ack]');
    const resolveBtn = e.target.closest('[data-resolve]');
    const binBtn     = e.target.closest('[data-view-bin]');

    if (binBtn) {
      const bin = getBin(binBtn.dataset.viewBin);
      if (bin) openBinModal(bin);
      return;
    }

    if (ackBtn) {
      const uid = get('auth').uid;
      if (!uid) return;

      ackBtn.disabled = true;
      try {
        await acknowledgeAlert(ackBtn.dataset.ack, uid);
        showToast({ type: 'info', title: 'Alert acknowledged', message: 'Marked as being handled.' });
      } catch (err) {
        console.error('[alerts] acknowledge failed', err);
        showToast({ type: 'critical', title: 'Could not acknowledge', message: err.message });
        ackBtn.disabled = false;
      }
      return;
    }

    if (resolveBtn) {
      resolveBtn.disabled = true;
      try {
        await resolveAlert(resolveBtn.dataset.resolve, 'Manually resolved by operator');
        showToast({ type: 'success', title: 'Alert resolved' });
      } catch (err) {
        console.error('[alerts] resolve failed', err);
        showToast({ type: 'critical', title: 'Could not resolve', message: err.message });
        resolveBtn.disabled = false;
      }
    }
  });

  /* --- Controls ---------------------------------------------------------- */
  filterEl.addEventListener('click', (e) => {
    const button = e.target.closest('[data-filter]');
    if (!button) return;
    view.filter = button.dataset.filter;
    render();
  });

  let searchTimer;
  searchEl.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      view.search = searchEl.value;
      render();
    }, 180);
  });

  sortEl.addEventListener('change', () => {
    view.sort = sortEl.value;
    render();
  });

  const unsubscribe = subscribe('alerts', render);

  return () => {
    unsubscribe();
    clearTimeout(searchTimer);
    closeBinModal();
  };
}

/* ---------------------------------------------------------------------------
 * VIEW LOGIC
 * ------------------------------------------------------------------------- */

/**
 * @param {object[]} alerts
 * @param {{filter: string, search: string, sort: string}} view
 * @returns {object[]}
 */
function applyView(alerts, view) {
  let result = [...alerts];

  switch (view.filter) {
    case 'active':
      result = result.filter((a) => a.state === AlertState.ACTIVE);
      break;
    case 'critical':
      result = result.filter(
        (a) => a.severity === AlertSeverity.CRITICAL && a.state !== AlertState.RESOLVED
      );
      break;
    case 'warning':
      result = result.filter(
        (a) => a.severity === AlertSeverity.WARNING && a.state !== AlertState.RESOLVED
      );
      break;
    case 'acknowledged':
      result = result.filter((a) => a.state === AlertState.ACKNOWLEDGED);
      break;
    case 'resolved':
      result = result.filter((a) => a.state === AlertState.RESOLVED);
      break;
    default:
      break;   // 'all'
  }

  const query = view.search.trim().toLowerCase();
  if (query) {
    result = result.filter((a) =>
      [a.binId, a.type, a.message, a.severity]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(query))
    );
  }

  const sorters = {
    // Severity first, then recency. This is the order to act in.
    severity: (a, b) =>
      (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0) ||
      (b.raisedAt ?? 0) - (a.raisedAt ?? 0),
    newest: (a, b) => (b.raisedAt ?? 0) - (a.raisedAt ?? 0),
    oldest: (a, b) => (a.raisedAt ?? 0) - (b.raisedAt ?? 0),
    bin: (a, b) => String(a.binId).localeCompare(String(b.binId)),
  };

  return result.sort(sorters[view.sort] ?? sorters.severity);
}

/* ---------------------------------------------------------------------------
 * RENDERERS
 * ------------------------------------------------------------------------- */

function renderKpis(container, alerts, counts) {
  const response = meanResponseTime(alerts);

  container.innerHTML = [
    renderKpi({
      label: 'Active',
      value: counts.active,
      tone: counts.active > 0 ? 'warning' : 'healthy',
      note: 'Alerts that are neither acknowledged nor resolved.',
    }),
    renderKpi({
      label: 'Critical',
      value: counts.critical,
      tone: counts.critical > 0 ? 'critical' : 'healthy',
      note: 'Threshold breaches, overflows and battery-critical conditions.',
    }),
    renderKpi({
      label: 'Acknowledged',
      value: counts.acknowledged,
      tone: 'info',
      note: 'Seen by an operator and being handled.',
    }),
    renderKpi({
      label: 'Resolved',
      value: counts.resolved,
      tone: 'healthy',
      note: 'Conditions that have cleared, automatically or manually.',
    }),
    renderKpi({
      label: 'Mean Response',
      value: response.value,
      unit: response.unit,
      tone: response.tone,
      decimals: 1,
      note: response.note,
    }),
  ].join('');
}

function renderFilters(container, active, counts, total) {
  const filters = [
    { key: 'active',       label: 'Active',       count: counts.active },
    { key: 'critical',     label: 'Critical',     count: counts.critical },
    { key: 'warning',      label: 'Warning',      count: counts.warning },
    { key: 'acknowledged', label: 'Acknowledged', count: counts.acknowledged },
    { key: 'resolved',     label: 'Resolved',     count: counts.resolved },
    { key: 'all',          label: 'All',          count: total },
  ];

  container.innerHTML = filters.map((f) => `
    <button class="bin-filter${f.key === active ? ' is-active' : ''}"
            data-filter="${f.key}" aria-pressed="${f.key === active}">
      ${escapeHtml(f.label)}<span class="bin-filter__count">${f.count}</span>
    </button>`).join('');
}

/**
 * A single alert row.
 * @param {object} alert
 * @returns {string}
 */
function renderAlertRow(alert) {
  const severity = alert.severity ?? AlertSeverity.INFO;
  const isResolved = alert.state === AlertState.RESOLVED;
  const isAcked = alert.state === AlertState.ACKNOWLEDGED;
  const canAct = roleAtLeast(Role.MUNICIPALITY);

  const source = alert.source ?? DataSource.PLACEHOLDER;
  const isSimulated = source !== DataSource.DEVICE;

  // Time to acknowledge, or elapsed time if still open.
  const elapsed = isAcked && alert.acknowledgedAt
    ? `acknowledged in ${duration((alert.acknowledgedAt - alert.raisedAt) / 1000)}`
    : isResolved && alert.resolvedAt
      ? `resolved in ${duration((alert.resolvedAt - alert.raisedAt) / 1000)}`
      : `open for ${duration((Date.now() - (alert.raisedAt ?? Date.now())) / 1000)}`;

  return `
    <article class="alert-row alert-row--${escapeHtml(severity)}${isResolved ? ' is-resolved' : ''}"
             data-source="${escapeHtml(source)}">

      <span class="alert-row__icon" aria-hidden="true">${SEVERITY_ICON[severity] ?? '●'}</span>

      <div class="alert-row__body min-w-0">
        <div class="row row--between row--top">
          <div class="min-w-0">
            <h3 class="alert-row__title">
              ${escapeHtml(formatAlertType(alert.type))}
              ${alert.binId ? `· <span class="mono t-xs c-tertiary">${escapeHtml(alert.binId)}</span>` : ''}
            </h3>
            <p class="alert-row__message">${escapeHtml(alert.message ?? '')}</p>
          </div>

          <div class="alert-row__badges shrink-0">
            ${isSimulated
              ? `<span class="provenance provenance--${escapeHtml(source)}">${
                   escapeHtml(PROVENANCE_LABEL[source] ?? '')
                 }</span>`
              : ''}
            <span class="pill pill--${stateTone(alert.state, severity)}">
              <span class="pill__dot"></span>${escapeHtml(String(alert.state ?? '').toUpperCase())}
            </span>
          </div>
        </div>

        <div class="alert-row__meta">
          <span title="${escapeHtml(dateTime(alert.raisedAt))}">
            Raised ${escapeHtml(relativeTime(alert.raisedAt))}
          </span>
          <span aria-hidden="true">·</span>
          <span>${escapeHtml(elapsed)}</span>
          ${alert.resolution ? `<span aria-hidden="true">·</span><span>${escapeHtml(alert.resolution)}</span>` : ''}
        </div>

        <div class="alert-row__actions">
          ${alert.binId
            ? `<button class="btn-sm" data-view-bin="${escapeHtml(alert.binId)}">View bin</button>`
            : ''}
          ${!isResolved && !isAcked && canAct
            ? `<button class="btn-sm" data-ack="${escapeHtml(alert.alertId)}">Acknowledge</button>`
            : ''}
          ${!isResolved && canAct
            ? `<button class="btn-sm btn-sm--primary" data-resolve="${escapeHtml(alert.alertId)}">Resolve</button>`
            : ''}
        </div>
      </div>
    </article>`;
}

/**
 * @param {string} filter
 * @returns {string}
 */
function renderEmpty(filter) {
  const messages = {
    active: 'No active alerts. All monitored conditions are within normal parameters.',
    critical: 'No critical alerts.',
    warning: 'No warnings.',
    acknowledged: 'No acknowledged alerts awaiting resolution.',
    resolved: 'No resolved alerts in the history yet.',
    all: 'No alerts have been raised.',
  };

  return `
    <div class="card card--padded-lg ta-center">
      <p class="t-sm c-secondary">${escapeHtml(messages[filter] ?? messages.all)}</p>
    </div>`;
}

/**
 * @param {string} type
 * @returns {string}
 */
function formatAlertType(type) {
  if (!type) return 'Alert';
  return type
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * @param {string} state
 * @param {string} severity
 * @returns {string}
 */
function stateTone(state, severity) {
  if (state === AlertState.RESOLVED) return 'healthy';
  if (state === AlertState.ACKNOWLEDGED) return 'info';
  return severity === AlertSeverity.CRITICAL ? 'critical'
       : severity === AlertSeverity.WARNING ? 'warning'
       : 'info';
}

/* ---------------------------------------------------------------------------
 * TEMPLATE
 * ------------------------------------------------------------------------- */

function template() {
  return `
    <style>
      .alert-row {
        position: relative;
        display: flex; gap: var(--space-3);
        padding: var(--space-4) var(--space-5);
        margin-bottom: var(--space-2);
        background: var(--surface-raised);
        border: 1px solid var(--border-subtle);
        border-inline-start-width: 2px;
        border-radius: var(--radius-lg);
        overflow: hidden;
      }
      .alert-row--critical { border-inline-start-color: var(--status-critical); }
      .alert-row--warning  { border-inline-start-color: var(--status-warning); }
      .alert-row--info     { border-inline-start-color: var(--status-info); }
      .alert-row.is-resolved { opacity: 0.6; border-inline-start-color: var(--status-healthy); }

      .alert-row__icon { font-size: 10px; margin-top: 5px; flex-shrink: 0; }
      .alert-row--critical .alert-row__icon { color: var(--status-critical); }
      .alert-row--warning  .alert-row__icon { color: var(--status-warning); }
      .alert-row--info     .alert-row__icon { color: var(--status-info); }

      .alert-row__body { flex: 1; }
      .alert-row__title {
        font-size: var(--text-sm); font-weight: var(--weight-semibold);
        font-family: var(--font-body); letter-spacing: var(--tracking-normal);
        color: var(--text-primary);
      }
      .alert-row__message {
        margin-top: var(--space-1); font-size: var(--text-xs);
        line-height: var(--leading-snug); color: var(--text-secondary);
      }
      .alert-row__badges { display: flex; align-items: center; gap: var(--space-2); }
      .alert-row__meta {
        display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;
        margin-top: var(--space-3);
        font-family: var(--font-mono); font-size: var(--text-2xs);
        color: var(--text-tertiary);
      }
      .alert-row__actions {
        display: flex; gap: var(--space-2); flex-wrap: wrap;
        margin-top: var(--space-3);
      }
    </style>

    <div class="grid grid--auto-sm mb-6" id="alert-kpis"></div>

    <div class="bin-toolbar" role="toolbar" aria-label="Alert filters">
      <div class="row row--sm row--wrap" id="alert-filters"></div>
      <div class="spacer"></div>
      <input class="bin-search" type="search" id="alert-search"
             placeholder="Search alerts…" aria-label="Search alerts">
      <select class="bin-search" id="alert-sort" aria-label="Sort alerts"
              style="max-width:180px; cursor:pointer">
        <option value="severity">Sort: severity</option>
        <option value="newest">Sort: newest first</option>
        <option value="oldest">Sort: oldest first</option>
        <option value="bin">Sort: bin ID</option>
      </select>
    </div>

    <p class="t-xs c-tertiary mb-4" id="alert-summary" role="status"></p>

    <div id="alert-list" aria-live="polite"></div>`;
}

export default { mount };
