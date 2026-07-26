/**
 * SmartBin+ — Analytics
 * =============================================================================
 * Fill trends, collection performance, zone comparison and response times.
 *
 * With four bins, fleet averages are statistically thin. This view therefore
 * favours per-bin comparison and time-series depth over aggregate means,
 * which would need a far larger deployment to carry any weight. Where an
 * average is shown, the number of contributing bins is shown beside it.
 *
 * @module pages/analytics/analytics.page
 */

import { loadChartJs, palette, percentScale, categoryScale, areaGradient, baseOptions, bandColor, hexToRgba }
  from '../../charts/chart.theme.js';
import { readHistory } from '../../firebase/db.service.js';
import { subscribe, getBins, getAlerts } from '../../js/core/store.js';
import { renderKpi } from '../../components/kpi-card/kpi-card.js';
import {
  dailySeries, weeklySeries, monthlySeries, collectionsPerDay,
  timeInBands, meanFillRate, aggregateByZone, responseTimeDistribution,
  detectCollections,
} from '../../js/utils/aggregate.js';
import { projectTimeToThreshold } from '../../js/utils/fill.js';
import { escapeHtml, percent, duration, pluralize } from '../../js/utils/format.js';
import { THRESHOLDS } from '../../config/app.config.js';

/** @type {Map<string, any>} Live chart instances, destroyed on teardown. */
const charts = new Map();

/**
 * @param {HTMLElement} outlet
 * @returns {Promise<() => void>}
 */
export async function mount(outlet) {
  outlet.innerHTML = template();

  let Chart;
  try {
    Chart = await loadChartJs();
  } catch {
    outlet.innerHTML = `
      <div class="card card--padded-lg" role="alert">
        <div class="label-mono c-critical mb-3">Charts unavailable</div>
        <h2 class="t-xl mb-3">Chart.js could not be loaded</h2>
        <p class="c-secondary t-base" style="max-width:56ch">
          The charting library is loaded from a CDN and could not be reached.
          Check the network connection and reload.
        </p>
      </div>`;
    return () => {};
  }

  const rangeEl = outlet.querySelector('#range-select');
  const binEl   = outlet.querySelector('#bin-select');
  const kpiEl   = outlet.querySelector('#analytics-kpis');
  const noteEl  = outlet.querySelector('#analytics-note');

  const view = { range: 'weekly', binId: 'all' };

  /** @type {Map<string, object[]>} binId → history records */
  const historyCache = new Map();

  /* --- Data ------------------------------------------------------------- */

  /**
   * Fetch history for all bins. Reads once rather than subscribing: analytics
   * is a reflective view, and re-rendering six charts on every 60-second
   * telemetry write would be both wasteful and visually noisy.
   */
  const loadAllHistory = async () => {
    const bins = getBins();

    await Promise.all(bins.map(async (bin) => {
      try {
        historyCache.set(bin.binId, await readHistory(bin.binId, 500));
      } catch (err) {
        console.error('[analytics] history load failed for', bin.binId, err);
        historyCache.set(bin.binId, []);
      }
    }));
  };

  /**
   * Records for the current selection.
   * @returns {object[]}
   */
  const selectedRecords = () => {
    if (view.binId !== 'all') {
      return historyCache.get(view.binId) ?? [];
    }

    return [...historyCache.values()]
      .flat()
      .sort((a, b) => a.timestamp - b.timestamp);
  };

  /* --- Render ----------------------------------------------------------- */

  const render = () => {
    const bins = getBins();
    const alerts = getAlerts();
    const records = selectedRecords();

    renderBinOptions(binEl, bins, view.binId);
    renderKpis(kpiEl, records, bins, view);

    const contributing = view.binId === 'all'
      ? historyCache.size
      : 1;

    noteEl.textContent = records.length === 0
      ? 'No history recorded yet. Charts will populate as bins report readings.'
      : `${pluralize(records.length, 'reading')} across ${pluralize(contributing, 'bin')}. ` +
        (view.binId === 'all'
          ? 'Fleet averages across a small deployment are indicative, not statistically robust.'
          : '');

    drawFillTrend(Chart, records, view.range);
    drawBinComparison(Chart, bins);
    drawBandDistribution(Chart, records);
    drawCollections(Chart, records);
    drawZoneHeatmap(outlet, bins);
    drawResponseTimes(Chart, alerts);
    renderProjections(outlet, bins, historyCache);
  };

  /* --- Controls --------------------------------------------------------- */
  rangeEl.addEventListener('change', () => {
    view.range = rangeEl.value;
    render();
  });

  binEl.addEventListener('change', () => {
    view.binId = binEl.value;
    render();
  });

  /* --- Boot ------------------------------------------------------------- */
  await loadAllHistory();
  render();

  // Re-render when the bin set changes, but not on every telemetry tick.
  const unsubscribe = subscribe('bins', () => {
    const known = new Set(historyCache.keys());
    const missing = getBins().filter((b) => !known.has(b.binId));

    if (missing.length > 0) {
      loadAllHistory().then(render);
    }
  });

  return () => {
    unsubscribe();
    charts.forEach((chart) => chart.destroy());
    charts.clear();
  };
}

/* ---------------------------------------------------------------------------
 * CHARTS
 * ------------------------------------------------------------------------- */

/**
 * Create or replace a chart on a canvas.
 * @param {any} Chart
 * @param {string} id
 * @param {object} config
 */
function upsertChart(Chart, id, config) {
  const canvas = document.getElementById(id);
  if (!canvas) return;

  charts.get(id)?.destroy();
  charts.set(id, new Chart(canvas.getContext('2d'), config));
}

/**
 * Fill level over time, with the alert threshold marked.
 */
function drawFillTrend(Chart, records, range) {
  const p = palette();

  const series = range === 'daily'   ? dailySeries(records)
               : range === 'monthly' ? monthlySeries(records)
               : weeklySeries(records);

  const canvas = document.getElementById('chart-fill-trend');
  if (!canvas) return;

  upsertChart(Chart, 'chart-fill-trend', {
    type: 'line',
    data: {
      labels: series.labels,
      datasets: [{
        label: 'Average fill level',
        data: series.values,
        borderColor: p.green,
        backgroundColor: areaGradient(canvas.getContext('2d'), p.green, 240),
        borderWidth: 2,
        fill: true,
        tension: 0.32,
        pointRadius: 0,
        pointHoverRadius: 4,
        // Gaps rather than zeroes where no readings exist.
        spanGaps: false,
      }, {
        label: `Alert threshold (${THRESHOLDS.ALERT_PCT}%)`,
        data: series.labels.map(() => THRESHOLDS.ALERT_PCT),
        borderColor: hexToRgba(p.red, 0.55),
        borderWidth: 1,
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false,
      }],
    },
    options: {
      ...baseOptions(),
      scales: { y: percentScale(), x: categoryScale() },
      plugins: {
        ...baseOptions().plugins,
        tooltip: {
          callbacks: {
            label: (ctx) => ctx.parsed.y === null
              ? 'No readings in this interval'
              : `${ctx.dataset.label}: ${ctx.parsed.y}%`,
          },
        },
      },
    },
  });
}

/**
 * Current fill level per bin.
 *
 * With four bins this is the most informative chart in the view — a direct
 * comparison, no averaging, every bar a real reading.
 */
function drawBinComparison(Chart, bins) {
  const reporting = bins.filter((b) => Number.isFinite(b.live?.fillPct));

  upsertChart(Chart, 'chart-bin-comparison', {
    type: 'bar',
    data: {
      labels: reporting.map((b) => b.meta?.label ?? b.binId),
      datasets: [{
        label: 'Current fill level',
        data: reporting.map((b) => b.live.fillPct),
        backgroundColor: reporting.map((b) => hexToRgba(bandColor(b.live.fillPct), 0.75)),
        borderColor: reporting.map((b) => bandColor(b.live.fillPct)),
        borderWidth: 1,
        borderRadius: 4,
        barPercentage: 0.6,
      }],
    },
    options: {
      ...baseOptions(),
      plugins: { legend: { display: false } },
      scales: { y: percentScale(), x: categoryScale() },
    },
  });
}

/**
 * Proportion of readings spent in each fill band.
 */
function drawBandDistribution(Chart, records) {
  const p = palette();
  const bands = timeInBands(records);

  upsertChart(Chart, 'chart-bands', {
    type: 'doughnut',
    data: {
      labels: [
        `Empty / Low (0–${THRESHOLDS.BAND_EMPTY_MAX}%)`,
        `Half / Moderate (${THRESHOLDS.BAND_EMPTY_MAX + 1}–${THRESHOLDS.BAND_HALF_MAX}%)`,
        `Full / Critical (${THRESHOLDS.ALERT_PCT}–100%)`,
      ],
      datasets: [{
        data: [bands.empty, bands.half, bands.full],
        backgroundColor: [
          hexToRgba(p.green, 0.8),
          hexToRgba(p.amber, 0.8),
          hexToRgba(p.red, 0.8),
        ],
        borderColor: p.surface,
        borderWidth: 2,
      }],
    },
    options: {
      ...baseOptions(),
      cutout: '62%',
      plugins: {
        legend: { position: 'bottom', align: 'start' },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = bands.total || 1;
              const pct = Math.round((ctx.parsed / total) * 100);
              return `${ctx.label}: ${ctx.parsed} readings (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

/**
 * Collections detected per day.
 */
function drawCollections(Chart, records) {
  const p = palette();
  const series = collectionsPerDay(records, 7);

  upsertChart(Chart, 'chart-collections', {
    type: 'bar',
    data: {
      labels: series.labels,
      datasets: [{
        label: 'Collections',
        data: series.values,
        backgroundColor: hexToRgba(p.blue, 0.7),
        borderColor: p.blue,
        borderWidth: 1,
        borderRadius: 4,
        barPercentage: 0.55,
      }],
    },
    options: {
      ...baseOptions(),
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
            color: p.textDim,
            font: { family: "'DM Mono', monospace", size: 9 },
          },
          grid: { color: p.grid, drawTicks: false },
          border: { display: false },
        },
        x: categoryScale(),
      },
    },
  });
}

/**
 * Alert acknowledgement time distribution.
 */
function drawResponseTimes(Chart, alerts) {
  const p = palette();
  const dist = responseTimeDistribution(alerts);
  const hasData = dist.values.some((v) => v > 0);

  const container = document.getElementById('response-wrapper');
  if (container) {
    container.querySelector('.chart-empty')?.remove();

    if (!hasData) {
      container.insertAdjacentHTML('beforeend', `
        <div class="chart-empty">No alerts have been acknowledged yet.</div>`);
    }
  }

  upsertChart(Chart, 'chart-response', {
    type: 'bar',
    data: {
      labels: dist.labels,
      datasets: [{
        label: 'Alerts',
        data: dist.values,
        backgroundColor: [
          hexToRgba(p.green, 0.75),
          hexToRgba(p.green, 0.55),
          hexToRgba(p.amber, 0.65),
          hexToRgba(p.amber, 0.5),
          hexToRgba(p.red, 0.65),
        ],
        borderWidth: 0,
        borderRadius: 4,
        barPercentage: 0.6,
      }],
    },
    options: {
      ...baseOptions(),
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { precision: 0, color: p.textDim, font: { family: "'DM Mono', monospace", size: 9 } },
          grid: { color: p.grid, drawTicks: false },
          border: { display: false },
        },
        y: { ...categoryScale(), grid: { display: false } },
      },
    },
  });
}

/* ---------------------------------------------------------------------------
 * NON-CHART PANELS
 * ------------------------------------------------------------------------- */

/**
 * Zone heatmap. Rendered as DOM rather than a chart — with a handful of zones
 * a coloured table is clearer than a plotted heatmap, and it stays readable
 * on a phone.
 */
function drawZoneHeatmap(outlet, bins) {
  const container = outlet.querySelector('#zone-heatmap');
  const zones = aggregateByZone(bins);

  if (zones.length === 0) {
    container.innerHTML = '<div class="chart-empty">No zones configured.</div>';
    return;
  }

  container.innerHTML = zones.map((zone) => `
    <div class="zone-row">
      <div class="zone-row__head">
        <span class="t-sm fw-medium">${escapeHtml(zone.zone)}</span>
        <span class="mono t-xs" style="color:${bandColor(zone.meanFill)}">
          ${percent(zone.meanFill, 1)}
        </span>
      </div>
      <div class="meter">
        <div class="meter__fill"
             style="width:${zone.meanFill}%; --meter-color:${bandColor(zone.meanFill)}"></div>
        <div class="meter__threshold" style="inset-inline-start:${THRESHOLDS.ALERT_PCT}%"></div>
      </div>
      <div class="zone-row__meta">
        ${pluralize(zone.bins.length, 'bin')} ·
        ${zone.criticalCount} critical ·
        peak ${percent(zone.maxFill)}
      </div>
    </div>`).join('');
}

/**
 * Fill-rate projections per bin.
 *
 * Labelled explicitly as statistical extrapolation. The literature survey
 * (§VII-A) proposes machine-learning forecasting as future work, and the
 * report places it in Phase-II — so calling a least-squares fit "AI
 * prediction" would misrepresent both the method and the project's scope.
 */
function renderProjections(outlet, bins, historyCache) {
  const container = outlet.querySelector('#projections');

  const rows = bins.map((bin) => {
    const records = historyCache.get(bin.binId) ?? [];
    const threshold = bin.meta?.thresholdPct ?? THRESHOLDS.ALERT_PCT;
    const projection = projectTimeToThreshold(records, threshold);
    const rate = meanFillRate(records);

    return { bin, projection, rate };
  });

  const usable = rows.filter((r) => r.projection.hoursToFull !== null);

  container.innerHTML = `
    ${rows.map(({ bin, projection, rate }) => `
      <div class="projection-row">
        <div class="min-w-0">
          <div class="t-sm fw-medium truncate">${escapeHtml(bin.meta?.label ?? bin.binId)}</div>
          <div class="t-2xs c-tertiary mono mt-1">
            ${rate !== null ? `filling at ${rate}%/hr` : 'insufficient history'}
          </div>
        </div>
        <div class="ta-right shrink-0">
          <div class="mono t-sm ${projection.hoursToFull === 0 ? 'c-critical' : ''}">
            ${projection.hoursToFull === null ? '—'
              : projection.hoursToFull === 0 ? 'At threshold'
              : duration(projection.hoursToFull * 3600)}
          </div>
          <div class="t-2xs c-tertiary">${escapeHtml(confidenceLabel(projection.confidence))}</div>
        </div>
      </div>`).join('')}

    <p class="t-2xs c-tertiary mt-4">
      Least-squares linear regression over recorded fill history.
      ${usable.length === 0 ? 'No bin has enough history for a projection yet. ' : ''}
      This is statistical extrapolation, not a machine-learning forecast —
      ML-based prediction is Phase-II scope per report §2.3.
    </p>`;
}

/**
 * @param {string} confidence
 * @returns {string}
 */
function confidenceLabel(confidence) {
  return {
    high: 'consistent trend',
    moderate: 'moderate confidence',
    low: 'noisy data',
    stable: 'stable',
    'already-critical': 'needs collection',
    'insufficient-data': 'not enough data',
  }[confidence] ?? '';
}

function renderKpis(container, records, bins, view) {
  const rate = meanFillRate(records);
  const bands = timeInBands(records);
  const collections = detectCollections(records);

  const criticalShare = bands.total > 0
    ? Math.round((bands.full / bands.total) * 100)
    : null;

  container.innerHTML = [
    renderKpi({
      label: 'Readings Analysed',
      value: records.length,
      tone: 'info',
      note: view.binId === 'all'
        ? 'Total history records across all bins.'
        : `History records for ${view.binId}.`,
    }),
    renderKpi({
      label: 'Mean Fill Rate',
      value: rate,
      unit: '%/hr',
      tone: 'info',
      decimals: 2,
      note: 'Average rate of increase across rising intervals. Drops, which indicate collections, are excluded.',
    }),
    renderKpi({
      label: 'Collections Detected',
      value: collections.length,
      tone: 'healthy',
      note: 'Inferred from drops of 30 percentage points or more between consecutive readings.',
    }),
    renderKpi({
      label: 'Time Above Threshold',
      value: criticalShare,
      unit: '%',
      tone: criticalShare === null ? '' : criticalShare > 20 ? 'critical' : 'healthy',
      note: `Proportion of readings in the Full / Critical band (${THRESHOLDS.ALERT_PCT}–100%). High values suggest collection frequency is too low.`,
    }),
  ].join('');
}

function renderBinOptions(select, bins, selected) {
  const options = [
    '<option value="all">All bins (fleet)</option>',
    ...bins.map((bin) =>
      `<option value="${escapeHtml(bin.binId)}"${bin.binId === selected ? ' selected' : ''}>
         ${escapeHtml(bin.meta?.label ?? bin.binId)}
       </option>`
    ),
  ].join('');

  if (select.innerHTML !== options) select.innerHTML = options;
  select.value = selected;
}

/* ---------------------------------------------------------------------------
 * TEMPLATE
 * ------------------------------------------------------------------------- */

function template() {
  return `
    <style>
      .chart-card { padding: var(--space-5); }
      .chart-card__title {
        display: flex; align-items: baseline; justify-content: space-between;
        gap: var(--space-3); margin-bottom: var(--space-4);
      }
      .chart-box { position: relative; height: 260px; }
      .chart-box--sm { height: 210px; }
      .chart-empty {
        position: absolute; inset: 0; display: flex;
        align-items: center; justify-content: center;
        font-size: var(--text-xs); color: var(--text-disabled);
        pointer-events: none;
      }
      #response-wrapper { position: relative; }

      .zone-row { margin-bottom: var(--space-4); }
      .zone-row__head {
        display: flex; align-items: baseline; justify-content: space-between;
        margin-bottom: var(--space-2);
      }
      .zone-row__meta {
        margin-top: var(--space-2);
        font-family: var(--font-mono); font-size: var(--text-2xs);
        color: var(--text-tertiary);
      }

      .projection-row {
        display: flex; align-items: center; justify-content: space-between;
        gap: var(--space-3);
        padding: var(--space-3) 0;
        border-bottom: 1px solid var(--border-subtle);
      }
      .projection-row:last-of-type { border-bottom: none; }

      .analytics-grid {
        display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--space-4);
      }
      @media (max-width: 1024px) { .analytics-grid { grid-template-columns: 1fr; } }
    </style>

    <div class="bin-toolbar">
      <select class="bin-search" id="bin-select" aria-label="Select bin"
              style="max-width:220px; cursor:pointer"></select>

      <select class="bin-search" id="range-select" aria-label="Select time range"
              style="max-width:180px; cursor:pointer">
        <option value="daily">Last 24 hours</option>
        <option value="weekly" selected>Last 7 days</option>
        <option value="monthly">Last 30 days</option>
      </select>
    </div>

    <div class="grid grid--auto-sm mb-4" id="analytics-kpis"></div>
    <p class="t-xs c-tertiary mb-6" id="analytics-note" role="status"></p>

    <div class="card chart-card mb-4">
      <div class="chart-card__title">
        <h2 class="kpi-group__title m-0" style="flex:0 0 auto">Fill Level Trend</h2>
      </div>
      <div class="chart-box"><canvas id="chart-fill-trend"></canvas></div>
    </div>

    <div class="analytics-grid mb-4">
      <div class="card chart-card">
        <div class="chart-card__title">
          <h2 class="kpi-group__title m-0" style="flex:0 0 auto">Current Fill by Bin</h2>
        </div>
        <div class="chart-box chart-box--sm"><canvas id="chart-bin-comparison"></canvas></div>
      </div>

      <div class="card chart-card">
        <div class="chart-card__title">
          <h2 class="kpi-group__title m-0" style="flex:0 0 auto">Time in Each Band</h2>
        </div>
        <div class="chart-box chart-box--sm"><canvas id="chart-bands"></canvas></div>
      </div>

      <div class="card chart-card">
        <div class="chart-card__title">
          <h2 class="kpi-group__title m-0" style="flex:0 0 auto">Collections per Day</h2>
        </div>
        <div class="chart-box chart-box--sm"><canvas id="chart-collections"></canvas></div>
      </div>

      <div class="card chart-card">
        <div class="chart-card__title">
          <h2 class="kpi-group__title m-0" style="flex:0 0 auto">Alert Response Time</h2>
        </div>
        <div class="chart-box chart-box--sm" id="response-wrapper">
          <canvas id="chart-response"></canvas>
        </div>
      </div>
    </div>

    <div class="analytics-grid">
      <div class="card chart-card">
        <h2 class="kpi-group__title">Zone Comparison</h2>
        <div id="zone-heatmap"></div>
      </div>

      <div class="card chart-card">
        <h2 class="kpi-group__title">Projected Time to Threshold</h2>
        <div id="projections"></div>
      </div>
    </div>`;
}

export default { mount };
