/**
 * SmartBin+ — Event Timeline
 * =============================================================================
 * The complete system audit trail.
 *
 * Corresponds to data store "D2 Logs & History" in report §4.3.2, which the
 * Level-2 DFD describes as recording "the historical audit trail" for
 * "analytical auditing, failure tracking, and historical usage tracking".
 *
 * The security rules make this append-only: clients can add entries but
 * cannot edit or delete them. That property is what separates an audit trail
 * from a list, and it is worth being able to state when asked.
 *
 * @module pages/timeline/timeline.page
 */

import { subscribe, get } from '../../js/core/store.js';
import { escapeHtml, relativeTime, dateTime, time } from '../../js/utils/format.js';
import { EventKind } from '../../config/constants.js';

/**
 * Presentation for each event kind: glyph, tone, and a readable label.
 * Keeping this in one table means a new event kind needs one edit, not five.
 */
const EVENT_META = {
  [EventKind.SENSOR_UPDATE]:        { icon: '◦', tone: 'info',     label: 'Sensor reading' },
  [EventKind.THRESHOLD_REACHED]:    { icon: '▲', tone: 'warning',  label: 'Threshold crossed' },
  [EventKind.NOTIFICATION_SENT]:    { icon: '✦', tone: 'critical', label: 'Alert dispatched' },
  [EventKind.TRUCK_DISPATCHED]:     { icon: '▸', tone: 'info',     label: 'Vehicle dispatched' },
  [EventKind.TRUCK_ARRIVED]:        { icon: '◉', tone: 'info',     label: 'Vehicle arrived' },
  [EventKind.COLLECTION_COMPLETED]: { icon: '✓', tone: 'healthy',  label: 'Collection completed' },
  [EventKind.DB_UPDATED]:           { icon: '⬡', tone: 'info',     label: 'Database updated' },
  [EventKind.DEVICE_ONLINE]:        { icon: '●', tone: 'healthy',  label: 'Device online' },
  [EventKind.DEVICE_OFFLINE]:       { icon: '○', tone: 'offline',  label: 'Device offline' },
  [EventKind.SENSOR_FAULT]:         { icon: '⚠', tone: 'critical', label: 'Sensor fault' },
  [EventKind.ALERT_ACKNOWLEDGED]:   { icon: '◈', tone: 'info',     label: 'Alert acknowledged' },
  [EventKind.CONFIG_CHANGED]:       { icon: '⚙', tone: 'warning',  label: 'Configuration changed' },
  [EventKind.SIMULATION_TOGGLED]:   { icon: '◆', tone: 'warning',  label: 'Simulation toggled' },
};

/** Filter groups, so an operator can narrow to one concern. */
const FILTER_GROUPS = {
  all: null,
  collection: [
    EventKind.TRUCK_DISPATCHED,
    EventKind.TRUCK_ARRIVED,
    EventKind.COLLECTION_COMPLETED,
  ],
  alerts: [
    EventKind.THRESHOLD_REACHED,
    EventKind.NOTIFICATION_SENT,
    EventKind.ALERT_ACKNOWLEDGED,
  ],
  devices: [
    EventKind.DEVICE_ONLINE,
    EventKind.DEVICE_OFFLINE,
    EventKind.SENSOR_FAULT,
  ],
  system: [
    EventKind.DB_UPDATED,
    EventKind.CONFIG_CHANGED,
    EventKind.SIMULATION_TOGGLED,
  ],
};

/**
 * @param {HTMLElement} outlet
 * @returns {() => void}
 */
export function mount(outlet) {
  outlet.innerHTML = template();

  const listEl    = outlet.querySelector('#timeline-list');
  const filterEl  = outlet.querySelector('#timeline-filters');
  const searchEl  = outlet.querySelector('#timeline-search');
  const summaryEl = outlet.querySelector('#timeline-summary');

  const view = { filter: 'all', search: '' };

  const render = () => {
    const events = get('events');
    const visible = applyView(events, view);

    renderFilters(filterEl, view.filter, events);

    summaryEl.textContent = events.length === 0
      ? ''
      : `${visible.length} of ${events.length} events`;

    listEl.innerHTML = visible.length
      ? renderGroupedEvents(visible)
      : `<div class="card card--padded-lg ta-center">
           <p class="t-sm c-secondary">
             ${events.length === 0
               ? 'No events recorded yet. Activity will appear here as the system runs.'
               : 'No events match the current filter.'}
           </p>
         </div>`;
  };

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

  const unsubscribe = subscribe('events', render);

  // Relative timestamps drift without a nudge.
  const ticker = setInterval(render, 30000);

  return () => {
    unsubscribe();
    clearInterval(ticker);
    clearTimeout(searchTimer);
  };
}

/* ---------------------------------------------------------------------------
 * VIEW LOGIC
 * ------------------------------------------------------------------------- */

function applyView(events, view) {
  let result = [...events];

  const kinds = FILTER_GROUPS[view.filter];
  if (kinds) result = result.filter((e) => kinds.includes(e.kind));

  const query = view.search.trim().toLowerCase();
  if (query) {
    result = result.filter((e) =>
      [e.detail, e.binId, e.kind, e.actor]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(query))
    );
  }

  return result.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
}

/**
 * Group events under day headings.
 *
 * A flat list of two hundred timestamps is hard to navigate; day boundaries
 * give the eye somewhere to rest and make "what happened Tuesday" answerable.
 *
 * @param {object[]} events
 * @returns {string}
 */
function renderGroupedEvents(events) {
  const groups = new Map();

  for (const event of events) {
    const day = new Date(event.timestamp ?? Date.now());
    day.setHours(0, 0, 0, 0);
    const key = day.getTime();

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }

  return [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([dayTs, dayEvents]) => `
      <div class="timeline-day">
        <div class="timeline-day__label">${escapeHtml(formatDayLabel(dayTs))}</div>
        <div class="timeline-day__events">
          ${dayEvents.map(renderEvent).join('')}
        </div>
      </div>`)
    .join('');
}

/**
 * @param {number} dayTs
 * @returns {string}
 */
function formatDayLabel(dayTs) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dayMs = 24 * 60 * 60 * 1000;
  const diff = Math.round((today.getTime() - dayTs) / dayMs);

  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';

  return new Date(dayTs).toLocaleDateString('en-IN', {
    weekday: 'long', day: '2-digit', month: 'short', year: 'numeric',
  });
}

/**
 * @param {object} event
 * @returns {string}
 */
function renderEvent(event) {
  const meta = EVENT_META[event.kind] ?? { icon: '·', tone: 'info', label: event.kind };

  return `
    <div class="timeline-event timeline-event--${escapeHtml(meta.tone)}">
      <div class="timeline-event__marker" aria-hidden="true">
        <span class="timeline-event__icon">${meta.icon}</span>
      </div>

      <div class="timeline-event__body min-w-0">
        <div class="row row--between row--top">
          <span class="timeline-event__kind">${escapeHtml(meta.label)}</span>
          <span class="timeline-event__time mono shrink-0"
                title="${escapeHtml(dateTime(event.timestamp))}">
            ${escapeHtml(time(event.timestamp, true))}
          </span>
        </div>

        <p class="timeline-event__detail">${escapeHtml(event.detail ?? '')}</p>

        <div class="timeline-event__meta">
          ${event.binId ? `<span class="mono">${escapeHtml(event.binId)}</span>` : ''}
          ${event.binId && event.actor ? '<span aria-hidden="true">·</span>' : ''}
          ${event.actor && event.actor !== 'system'
            ? `<span>by ${escapeHtml(shortenActor(event.actor))}</span>`
            : event.actor === 'system' ? '<span>system</span>' : ''}
          <span aria-hidden="true">·</span>
          <span>${escapeHtml(relativeTime(event.timestamp))}</span>
        </div>
      </div>
    </div>`;
}

/**
 * Firebase UIDs are 28 characters and meaningless on screen.
 * @param {string} actor
 * @returns {string}
 */
function shortenActor(actor) {
  if (typeof actor !== 'string') return 'unknown';
  if (actor.includes('@')) return actor.split('@')[0];
  return actor.length > 12 ? `${actor.slice(0, 8)}…` : actor;
}

function renderFilters(container, active, events) {
  const count = (key) => {
    const kinds = FILTER_GROUPS[key];
    return kinds ? events.filter((e) => kinds.includes(e.kind)).length : events.length;
  };

  const filters = [
    { key: 'all',        label: 'All' },
    { key: 'collection', label: 'Collection' },
    { key: 'alerts',     label: 'Alerts' },
    { key: 'devices',    label: 'Devices' },
    { key: 'system',     label: 'System' },
  ];

  container.innerHTML = filters.map((f) => `
    <button class="bin-filter${f.key === active ? ' is-active' : ''}"
            data-filter="${f.key}" aria-pressed="${f.key === active}">
      ${escapeHtml(f.label)}<span class="bin-filter__count">${count(f.key)}</span>
    </button>`).join('');
}

/* ---------------------------------------------------------------------------
 * TEMPLATE
 * ------------------------------------------------------------------------- */

function template() {
  return `
    <style>
      .timeline-day { margin-bottom: var(--space-8); }
      .timeline-day__label {
        position: sticky; top: 0; z-index: 2;
        display: inline-block;
        padding: var(--space-2) var(--space-3);
        margin-bottom: var(--space-3);
        font-family: var(--font-mono); font-size: var(--text-2xs);
        letter-spacing: var(--tracking-wider); text-transform: uppercase;
        color: var(--text-tertiary);
        background: var(--surface-base);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-full);
      }

      .timeline-day__events {
        position: relative;
        padding-inline-start: var(--space-6);
      }

      /* Connecting spine */
      .timeline-day__events::before {
        content: '';
        position: absolute;
        inset-block: 8px;
        inset-inline-start: 9px;
        width: 1px;
        background: var(--border-subtle);
      }

      .timeline-event {
        position: relative;
        display: flex; gap: var(--space-3);
        padding: var(--space-3) 0;
      }

      .timeline-event__marker {
        position: absolute;
        inset-inline-start: calc(var(--space-6) * -1);
        top: var(--space-4);
        display: flex; align-items: center; justify-content: center;
        width: 19px; height: 19px;
        background: var(--surface-base);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-full);
      }

      .timeline-event__icon { font-size: 9px; line-height: 1; }

      .timeline-event--healthy  .timeline-event__marker { border-color: var(--status-healthy-brd); }
      .timeline-event--healthy  .timeline-event__icon   { color: var(--status-healthy); }
      .timeline-event--warning  .timeline-event__marker { border-color: var(--status-warning-brd); }
      .timeline-event--warning  .timeline-event__icon   { color: var(--status-warning); }
      .timeline-event--critical .timeline-event__marker { border-color: var(--status-critical-brd); }
      .timeline-event--critical .timeline-event__icon   { color: var(--status-critical); }
      .timeline-event--info     .timeline-event__marker { border-color: var(--status-info-brd); }
      .timeline-event--info     .timeline-event__icon   { color: var(--status-info); }
      .timeline-event--offline  .timeline-event__icon   { color: var(--text-disabled); }

      .timeline-event__body {
        flex: 1;
        padding: var(--space-3) var(--space-4);
        background: var(--surface-raised);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
      }

      .timeline-event__kind {
        font-size: var(--text-sm); font-weight: var(--weight-semibold);
        color: var(--text-primary);
      }

      .timeline-event__time {
        font-size: var(--text-2xs); color: var(--text-tertiary);
      }

      .timeline-event__detail {
        margin-top: var(--space-1);
        font-size: var(--text-xs); line-height: var(--leading-snug);
        color: var(--text-secondary);
      }

      .timeline-event__meta {
        display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;
        margin-top: var(--space-2);
        font-family: var(--font-mono); font-size: var(--text-2xs);
        color: var(--text-disabled);
      }
    </style>

    <div class="bin-toolbar" role="toolbar" aria-label="Timeline filters">
      <div class="row row--sm row--wrap" id="timeline-filters"></div>
      <div class="spacer"></div>
      <input class="bin-search" type="search" id="timeline-search"
             placeholder="Search events…" aria-label="Search events">
    </div>

    <p class="t-xs c-tertiary mb-6" id="timeline-summary" role="status"></p>

    <div id="timeline-list" aria-live="polite"></div>

    <p class="t-2xs c-tertiary mt-6" style="max-width:62ch">
      This log is append-only — entries cannot be edited or deleted by any
      client, which is enforced by the database security rules. It corresponds
      to data store D2 (Logs &amp; History) in the Level-1 and Level-2 data flow
      diagrams.
    </p>`;
}

export default { mount };
