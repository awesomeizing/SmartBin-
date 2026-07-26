/**
 * SmartBin+ — Operations Overview
 * =============================================================================
 * The primary dashboard view. Renders every fleet-level KPI required by the
 * project specification, driven entirely by live Firebase data.
 *
 * Every tile traces to a real record or renders an em dash. There is no code
 * path in this view that fabricates a number.
 *
 * @module pages/dashboard/dashboard.page
 */

import { subscribe, getBins, getAlerts, get } from '../../js/core/store.js';
import { renderKpi } from '../../components/kpi-card/kpi-card.js';
import { describeConnection } from '../../firebase/connection.js';
import {
  countBinsByStatus, averageFillLevel, collectionEfficiency,
  calculateSavings, collectionsToday, collectionsThisWeek,
  lastSynchronisation, sensorHealth, lowestBattery, countAlerts,
  meanResponseTime, provenanceBreakdown, binsNeedingCollection,
} from '../../js/utils/kpi.js';
import { relativeTime, percent, escapeHtml } from '../../js/utils/format.js';
import { getFillColorVar } from '../../js/utils/fill.js';
import { DeviceState } from '../../config/constants.js';
import { THRESHOLDS } from '../../config/app.config.js';

/**
 * Mount the view.
 *
 * @param {HTMLElement} outlet
 * @returns {() => void} Teardown — detaches every store subscription.
 */
export function mount(outlet) {
  outlet.innerHTML = template();

  const fleetGrid    = outlet.querySelector('#kpi-fleet');
  const opsGrid      = outlet.querySelector('#kpi-operations');
  const impactGrid   = outlet.querySelector('#kpi-impact');
  const systemGrid   = outlet.querySelector('#kpi-system');
  const priorityList = outlet.querySelector('#priority-list');
  const emptyState   = outlet.querySelector('#empty-state');

  /** Re-render everything. Cheap at four bins; revisit if the fleet grows. */
  const render = () => {
    const bins = getBins();
    const alerts = getAlerts();
    const events = get('events');
    const config = get('config');
    const route = get('route');
    const connection = get('connection');

    // No bins registered yet — show setup guidance rather than a wall of dashes.
    if (bins.length === 0 && !get('ui').loading) {
      emptyState.hidden = false;
      [fleetGrid, opsGrid, impactGrid, systemGrid].forEach((g) => (g.innerHTML = ''));
      priorityList.innerHTML = '';
      return;
    }
    emptyState.hidden = true;

    renderFleet(fleetGrid, bins, alerts);
    renderOperations(opsGrid, bins, events, alerts);
    renderImpact(impactGrid, route, config);
    renderSystem(systemGrid, bins, connection);
    renderPriority(priorityList, bins);
  };

  // Every slice that feeds a tile.
  const unsubscribers = [
    subscribe('bins', render),
    subscribe('alerts', render),
    subscribe('events', render),
    subscribe('connection', render),
    subscribe('config', render),
    subscribe('route', render),
  ];

  // Relative timestamps ("4 min ago") need a periodic nudge — no data changed,
  // but the wording has.
  const ticker = setInterval(render, 30000);

  return () => {
    unsubscribers.forEach((off) => off());
    clearInterval(ticker);
  };
}

/* ---------------------------------------------------------------------------
 * SECTIONS
 * ------------------------------------------------------------------------- */

/**
 * Fleet status — the counts an operator scans first.
 */
function renderFleet(container, bins, alerts) {
  const counts = countBinsByStatus(bins);
  const alertCounts = countAlerts(alerts);
  const provenance = provenanceBreakdown(bins);

  container.innerHTML = [
    renderKpi({
      label: 'Total Bins',
      value: counts.total,
      foot: provenance.device
        ? `${provenance.device} live`
        : 'none deployed yet',
      note: 'Bins registered in the system, regardless of deployment status.',
    }),
    renderKpi({
      label: 'Healthy',
      value: counts.healthy,
      tone: 'healthy',
      foot: `0–${THRESHOLDS.BAND_EMPTY_MAX}% full`,
      note: `Bins in the Empty / Low band (0–${THRESHOLDS.BAND_EMPTY_MAX}%), per report §3.1.`,
    }),
    renderKpi({
      label: 'Filling',
      value: counts.warning,
      tone: counts.warning > 0 ? 'warning' : '',
      foot: `${THRESHOLDS.BAND_EMPTY_MAX + 1}–${THRESHOLDS.BAND_HALF_MAX}% full`,
      note: `Bins in the Half / Moderate band, per report §3.1.`,
    }),
    renderKpi({
      label: 'Critical',
      value: counts.critical,
      tone: counts.critical > 0 ? 'critical' : '',
      href: '#/alerts',
      foot: `at or above ${THRESHOLDS.ALERT_PCT}%`,
      note: `Bins at or beyond the alert threshold and requiring collection.`,
    }),
    renderKpi({
      label: 'Offline',
      value: counts.offline,
      tone: counts.offline > 0 ? 'offline' : '',
      foot: counts.offline > 0 ? 'not reporting' : 'all reporting',
      note: 'Bins with no reading within three polling intervals, or never deployed. Counted separately from healthy — an unknown bin is not a safe bin.',
    }),
    renderKpi({
      label: 'Active Alerts',
      value: alertCounts.active,
      tone: alertCounts.critical > 0 ? 'critical'
          : alertCounts.active > 0 ? 'warning' : '',
      href: '#/alerts',
      foot: alertCounts.critical > 0 ? `${alertCounts.critical} critical` : 'none critical',
      note: 'Alerts that are neither resolved nor dismissed.',
    }),
  ].join('');
}

/**
 * Operational performance.
 */
function renderOperations(container, bins, events, alerts) {
  const avgFill = averageFillLevel(bins);
  const efficiency = collectionEfficiency(bins);
  const today = collectionsToday(events);
  const week = collectionsThisWeek(events);
  const response = meanResponseTime(alerts);
  const needed = binsNeedingCollection(bins).length;

  container.innerHTML = [
    renderKpi({
      label: 'Average Fill',
      value: avgFill.value,
      unit: avgFill.unit,
      tone: avgFill.tone,
      note: avgFill.note,
      decimals: 1,
    }),
    renderKpi({
      label: 'Collection Efficiency',
      value: efficiency.value,
      unit: efficiency.unit,
      tone: efficiency.tone,
      note: efficiency.note,
      foot: 'trips avoided',
    }),
    renderKpi({
      label: 'Awaiting Collection',
      value: needed,
      tone: needed > 0 ? 'warning' : 'healthy',
      href: '#/trucks',
      foot: needed > 0 ? 'dispatch recommended' : 'no action needed',
      note: `Bins at or above their configured threshold (default ${THRESHOLDS.ALERT_PCT}%).`,
    }),
    renderKpi({
      label: "Today's Collections",
      value: today.value,
      tone: 'info',
      note: today.note,
    }),
    renderKpi({
      label: 'This Week',
      value: week.value,
      tone: 'info',
      note: week.note,
    }),
    renderKpi({
      label: 'Mean Response',
      value: response.value,
      unit: response.unit,
      tone: response.tone,
      note: response.note,
      decimals: 1,
    }),
  ].join('');
}

/**
 * Environmental and cost impact.
 *
 * Every figure here is derived from declared assumptions. The note on each
 * tile states the formula and its basis — these are the numbers most likely
 * to be questioned in a review, so they carry their own justification.
 */
function renderImpact(container, route, config) {
  const savings = calculateSavings(route, config);

  container.innerHTML = [
    renderKpi({
      label: 'Distance Saved',
      value: savings.distanceSaved.value,
      unit: savings.distanceSaved.unit,
      tone: savings.distanceSaved.tone,
      note: savings.distanceSaved.note,
      decimals: 1,
    }),
    renderKpi({
      label: 'Fuel Saved',
      value: savings.fuelSaved.value,
      unit: savings.fuelSaved.unit,
      tone: savings.fuelSaved.tone,
      note: savings.fuelSaved.note,
      decimals: 2,
    }),
    renderKpi({
      label: 'CO₂ Reduction',
      value: savings.co2Saved.value,
      unit: savings.co2Saved.unit,
      tone: savings.co2Saved.tone,
      note: savings.co2Saved.note,
      decimals: 2,
    }),
    renderKpi({
      label: 'Time Saved',
      value: savings.timeSaved.value,
      unit: savings.timeSaved.unit,
      tone: savings.timeSaved.tone,
      note: savings.timeSaved.note,
    }),
  ].join('');
}

/**
 * System health — the infrastructure behind the data.
 */
function renderSystem(container, bins, connection) {
  const sync = lastSynchronisation(bins);
  const sensors = sensorHealth(bins);
  const battery = lowestBattery(bins);
  const conn = describeConnection(connection.state);

  const reporting = bins.filter((b) => b.deviceState === DeviceState.ONLINE).length;

  container.innerHTML = [
    renderKpi({
      label: 'Firebase',
      value: conn.label,
      raw: true,
      tone: conn.tone,
      note: conn.description,
      foot: Number.isFinite(connection.latencyMs) ? `${connection.latencyMs} ms` : '',
    }),
    renderKpi({
      label: 'Devices Reporting',
      value: `${reporting} / ${bins.length}`,
      raw: true,
      tone: reporting === bins.length && bins.length > 0 ? 'healthy'
          : reporting === 0 ? 'critical' : 'warning',
      note: 'ESP32 units that have reported within the expected polling window.',
    }),
    renderKpi({
      label: 'Sensor Health',
      value: sensors.value,
      unit: sensors.unit,
      tone: sensors.tone,
      note: sensors.note,
    }),
    renderKpi({
      label: 'Lowest Battery',
      value: battery.value,
      unit: battery.unit,
      tone: battery.tone,
      note: battery.note,
    }),
    renderKpi({
      label: 'Last Sync',
      value: sync.value ? relativeTime(sync.value) : null,
      raw: true,
      tone: sync.tone,
      note: sync.note,
    }),
    renderKpi({
      label: 'Queued Writes',
      value: connection.queuedWrites ?? 0,
      tone: (connection.queuedWrites ?? 0) > 0 ? 'warning' : 'healthy',
      note: 'Writes held locally because the connection was unavailable. These replay automatically on reconnect.',
    }),
  ].join('');
}

/**
 * Collection priority queue — the actionable list.
 *
 * This is the answer to the question the whole project exists to ask:
 * which bins actually need a truck right now?
 */
function renderPriority(container, bins) {
  const priority = binsNeedingCollection(bins);

  if (priority.length === 0) {
    container.innerHTML = `
      <div class="card card--padded ta-center c-tertiary t-sm">
        No bins have reached their collection threshold.
      </div>`;
    return;
  }

  container.innerHTML = priority.map((bin, index) => {
    const fill = bin.live?.fillPct ?? 0;
    const source = bin.meta?.source ?? 'placeholder';

    return `
      <div class="card card--padded-sm card--interactive priority-row"
           data-source="${escapeHtml(source)}"
           onclick="location.hash='#/map?bin=${encodeURIComponent(bin.binId)}'">
        <div class="row row--between">
          <div class="row row--sm min-w-0">
            <span class="priority-rank">${index + 1}</span>
            <div class="min-w-0">
              <div class="t-sm fw-medium truncate">
                ${escapeHtml(bin.meta?.label ?? bin.binId)}
              </div>
              <div class="t-2xs c-tertiary mono">
                ${escapeHtml(bin.binId)} · ${escapeHtml(bin.meta?.zone ?? 'Unzoned')}
              </div>
            </div>
          </div>
          <div class="row row--sm shrink-0">
            <span class="mono t-sm fw-medium" style="color:${getFillColorVar(fill)}">
              ${percent(fill)}
            </span>
          </div>
        </div>
        <div class="meter mt-3">
          <div class="meter__fill"
               style="width:${fill}%; --meter-color:${getFillColorVar(fill)}"></div>
          <div class="meter__threshold"
               style="inset-inline-start:${bin.meta?.thresholdPct ?? THRESHOLDS.ALERT_PCT}%"></div>
        </div>
      </div>`;
  }).join('');
}

/* ---------------------------------------------------------------------------
 * TEMPLATE
 * ------------------------------------------------------------------------- */

function template() {
  return `
    <style>
      .priority-row { margin-bottom: var(--space-2); }
      .priority-rank {
        display: flex; align-items: center; justify-content: center;
        width: 22px; height: 22px; flex-shrink: 0;
        font-family: var(--font-mono); font-size: var(--text-2xs);
        font-weight: var(--weight-medium);
        color: var(--text-secondary);
        background: var(--surface-inset);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-full);
      }
      .dash-split {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 340px;
        gap: var(--space-6);
        align-items: start;
      }
      @media (max-width: 1180px) {
        .dash-split { grid-template-columns: 1fr; }
      }
    </style>

    <!-- Shown when no bins are registered yet -->
    <div class="card card--padded-lg mb-6" id="empty-state" hidden>
      <div class="label-mono c-warning mb-3">No bins registered</div>
      <h2 class="t-xl mb-3">The database is empty</h2>
      <p class="c-secondary t-base mb-4" style="max-width:62ch">
        No smart bins have been registered yet. Run the seed script once, from
        the browser console, signed in as an administrator:
      </p>
      <pre class="card card--inset card--padded mono t-xs c-tertiary"
           style="overflow-x:auto">import('./firebase/seed.js').then(m =&gt; m.seedDatabase());</pre>
      <p class="c-tertiary t-xs mt-4" style="max-width:62ch">
        This registers the four planned bins with placeholder coordinates around
        the GAT campus. Update them in Settings once the physical positions are
        surveyed.
      </p>
    </div>

    <section class="mb-8" aria-labelledby="h-fleet">
      <h2 class="kpi-group__title" id="h-fleet">Fleet Status</h2>
      <div class="grid grid--auto-sm" id="kpi-fleet"></div>
    </section>

    <div class="dash-split mb-8">
      <div class="stack stack--lg">
        <section aria-labelledby="h-ops">
          <h2 class="kpi-group__title" id="h-ops">Operational Performance</h2>
          <div class="grid grid--auto-sm" id="kpi-operations"></div>
        </section>

        <section aria-labelledby="h-impact">
          <h2 class="kpi-group__title" id="h-impact">
            Environmental Impact — derived from stated assumptions
          </h2>
          <div class="grid grid--auto-sm" id="kpi-impact"></div>
        </section>

        <section aria-labelledby="h-system">
          <h2 class="kpi-group__title" id="h-system">System Health</h2>
          <div class="grid grid--auto-sm" id="kpi-system"></div>
        </section>
      </div>

      <aside aria-labelledby="h-priority">
        <h2 class="kpi-group__title" id="h-priority">Collection Priority</h2>
        <div id="priority-list"></div>
      </aside>
    </div>`;
}

export default { mount };
