/**
 * SmartBin+ — Fleet & Routing
 * =============================================================================
 * Route optimisation, the optimised-versus-traditional comparison, and
 * vehicle dispatch.
 *
 * The comparison panel is the project's central claim made checkable: it
 * shows both routes, both distances, and the derivation of every saving.
 *
 * @module pages/trucks/trucks.page
 */

import { subscribe, getBins, get, setRoute, roleAtLeast } from '../../js/core/store.js';
import { optimizeRoute, describeRoute } from '../../js/utils/route.js';
import { saveRoute, upsertTruck, logEvent, resolveAlertsForBin, writeBinTelemetry }
  from '../../firebase/db.service.js';
import { renderKpi } from '../../components/kpi-card/kpi-card.js';
import { showToast } from '../../components/toast/toast.js';
import {
  escapeHtml, percent, distanceKm, fuel, co2, duration, pluralize,
} from '../../js/utils/format.js';
import { getFillColorVar } from '../../js/utils/fill.js';
import { Role, TruckStatus, EventKind, DataSource } from '../../config/constants.js';
import { SENSOR } from '../../config/app.config.js';

/**
 * @param {HTMLElement} outlet
 * @returns {() => void}
 */
export function mount(outlet) {
  outlet.innerHTML = template();

  const summaryEl  = outlet.querySelector('#route-summary');
  const kpiEl      = outlet.querySelector('#route-kpis');
  const stopsEl    = outlet.querySelector('#route-stops');
  const compareEl  = outlet.querySelector('#route-compare');
  const fleetEl    = outlet.querySelector('#fleet-list');
  const methodEl   = outlet.querySelector('#route-method');
  const dispatchBtn = outlet.querySelector('#dispatch-btn');

  /** @type {import('../../js/utils/route.js').OptimizedRoute|null} */
  let currentRoute = null;

  const render = () => {
    const bins = getBins();
    const config = get('config');

    currentRoute = optimizeRoute(bins, config);

    if (!currentRoute) {
      summaryEl.textContent =
        'No bins have usable coordinates yet. Assign locations in Settings before routing.';
      kpiEl.innerHTML = '';
      stopsEl.innerHTML = '';
      compareEl.innerHTML = '';
      dispatchBtn.disabled = true;
      return;
    }

    summaryEl.textContent = describeRoute(currentRoute);
    renderKpis(kpiEl, currentRoute);
    renderStops(stopsEl, currentRoute);
    renderComparison(compareEl, currentRoute);
    renderMethod(methodEl, currentRoute);

    dispatchBtn.disabled =
      currentRoute.stops.length === 0 || !roleAtLeast(Role.MUNICIPALITY);

    // Publish to the store so the map can draw it.
    setRoute(currentRoute);
  };

  const renderFleet = () => {
    const trucks = [...get('trucks').values()];

    fleetEl.innerHTML = trucks.length
      ? trucks.map(renderTruckCard).join('')
      : '<div class="card card--padded ta-center c-tertiary t-sm">No vehicles registered.</div>';
  };

  /* --- Dispatch --------------------------------------------------------- */
  dispatchBtn.addEventListener('click', async () => {
    if (!currentRoute?.stops.length) return;

    dispatchBtn.disabled = true;
    dispatchBtn.textContent = 'Dispatching…';

    try {
      const routeId = await saveRoute({
        stops: currentRoute.stops,
        optimizedKm: currentRoute.optimizedKm,
        traditionalKm: currentRoute.traditionalKm,
        savedKm: currentRoute.savedKm,
        fuelSavedL: currentRoute.fuelSavedL,
        co2SavedKg: currentRoute.co2SavedKg,
      });

      const truckId = [...get('trucks').keys()][0] ?? 'TRK-01';

      await upsertTruck(truckId, {
        status: TruckStatus.DISPATCHED,
        assignedRoute: currentRoute.stops.map((s) => s.binId),
        routeId,
        dispatchedAt: Date.now(),
      });

      await logEvent({
        kind: EventKind.TRUCK_DISPATCHED,
        detail: `${truckId} dispatched to ${pluralize(currentRoute.stops.length, 'bin')} · ` +
                `${currentRoute.optimizedKm} km optimised route`,
      });

      showToast({
        type: 'success',
        title: 'Vehicle dispatched',
        message: `${truckId} assigned ${pluralize(currentRoute.stops.length, 'stop')}.`,
      });
    } catch (err) {
      console.error('[trucks] dispatch failed', err);
      showToast({
        type: 'critical',
        title: 'Dispatch failed',
        message: err.message ?? 'Could not save the route. Check your connection.',
      });
    } finally {
      dispatchBtn.textContent = 'Dispatch vehicle';
      dispatchBtn.disabled = false;
    }
  });

  /* --- Mark collected --------------------------------------------------- */
  // Delegated: the stop list is re-rendered on every data change, so binding
  // per-row listeners would leak.
  stopsEl.addEventListener('click', async (e) => {
    const button = e.target.closest('[data-collect]');
    if (!button) return;

    const binId = button.dataset.collect;
    const bin = getBins().find((b) => b.binId === binId);
    if (!bin) return;

    button.disabled = true;

    try {
      // Emptying a bin means the sensor now reads the full bin depth.
      const depthCm = bin.meta?.depthCm ?? SENSOR.DEFAULT_DEPTH_CM;

      await writeBinTelemetry(binId, {
        distanceCm: depthCm,
        batteryPct: bin.live?.batteryPct,
        rssi: bin.live?.rssi,
        uptimeSec: bin.live?.uptimeSec,
      }, depthCm);

      const resolved = await resolveAlertsForBin(binId);

      await logEvent({
        kind: EventKind.COLLECTION_COMPLETED,
        binId,
        detail: `${binId} collected and reset to empty` +
                (resolved ? ` · ${pluralize(resolved, 'alert')} resolved` : ''),
      });

      showToast({
        type: 'success',
        title: 'Collection recorded',
        message: `${binId} reset to empty.`,
        source: bin.meta?.source,
      });
    } catch (err) {
      console.error('[trucks] collection failed', err);
      showToast({ type: 'critical', title: 'Could not record collection', message: err.message });
      button.disabled = false;
    }
  });

  const unsubscribers = [
    subscribe('bins', render),
    subscribe('config', render),
    subscribe('trucks', renderFleet),
  ];

  return () => unsubscribers.forEach((off) => off());
}

/* ---------------------------------------------------------------------------
 * RENDERERS
 * ------------------------------------------------------------------------- */

function renderKpis(container, route) {
  container.innerHTML = [
    renderKpi({
      label: 'Optimised Distance',
      value: route.optimizedKm,
      unit: 'km',
      tone: 'healthy',
      decimals: 1,
      note: `Straight-line distance for ${pluralize(route.stops.length, 'stop')} plus the return leg. ${route.meta.note}`,
    }),
    renderKpi({
      label: 'Traditional Round',
      value: route.traditionalKm,
      unit: 'km',
      tone: 'offline',
      decimals: 1,
      note: `Every one of ${route.meta.totalBins} bins visited in registration order, regardless of fill level — the scheduled-collection model described in report §1.1.`,
    }),
    renderKpi({
      label: 'Distance Saved',
      value: route.savedKm,
      unit: 'km',
      tone: 'healthy',
      decimals: 1,
      note: 'Difference between the two routes above.',
    }),
    renderKpi({
      label: 'Fuel Saved',
      value: route.fuelSavedL,
      unit: 'L',
      tone: 'healthy',
      decimals: 2,
      note: `Calculated as saved distance ÷ ${route.meta.assumptions?.fuelEconomy ?? '3.5 km/L'}. Fuel economy is an assumption, not a measurement.`,
    }),
    renderKpi({
      label: 'CO₂ Avoided',
      value: route.co2SavedKg,
      unit: 'kg',
      tone: 'healthy',
      decimals: 2,
      note: `Fuel saved × ${route.meta.assumptions?.emissionFactor ?? '2.68 kg CO₂/L'} (standard diesel emission factor).`,
    }),
    renderKpi({
      label: 'Time Saved',
      value: route.timeSavedMin,
      unit: 'min',
      tone: 'healthy',
      note: `Includes both driving time and ${route.binsSkipped} skipped service stops.`,
    }),
  ].join('');
}

function renderStops(container, route) {
  if (route.stops.length === 0) {
    container.innerHTML = `
      <div class="card card--padded ta-center">
        <p class="t-sm c-secondary">No collection required.</p>
        <p class="t-xs c-tertiary mt-2">
          All bins are below their thresholds. A scheduled round would still
          drive ${distanceKm(route.traditionalKm)} to visit them.
        </p>
      </div>`;
    return;
  }

  container.innerHTML = route.stops.map((stop, index) => `
    <div class="route-stop" data-source="${escapeHtml(stop.source ?? DataSource.PLACEHOLDER)}">
      <span class="route-stop__num">${index + 1}</span>

      <div class="route-stop__body min-w-0">
        <div class="row row--between">
          <span class="t-sm fw-medium truncate">${escapeHtml(stop.label)}</span>
          <span class="mono t-sm fw-medium shrink-0"
                style="color:${getFillColorVar(stop.fillPct)}">${percent(stop.fillPct)}</span>
        </div>
        <div class="t-2xs c-tertiary mono mt-1">
          ${escapeHtml(stop.binId)} · ${escapeHtml(stop.zone)} ·
          ${distanceKm(stop.legKm)} leg · ETA ${duration(stop.etaMinutes * 60)}
        </div>
      </div>

      <button class="btn-sm shrink-0" data-collect="${escapeHtml(stop.binId)}">
        Mark collected
      </button>
    </div>`).join('');
}

/**
 * Side-by-side comparison bars.
 *
 * A chart would be overkill for two numbers; two proportional bars make the
 * relationship instantly legible.
 */
function renderComparison(container, route) {
  const max = Math.max(route.traditionalKm, route.optimizedKm) || 1;
  const optimisedPct = (route.optimizedKm / max) * 100;
  const traditionalPct = (route.traditionalKm / max) * 100;
  const reduction = route.traditionalKm > 0
    ? Math.round((route.savedKm / route.traditionalKm) * 100)
    : 0;

  container.innerHTML = `
    <div class="compare-row">
      <div class="compare-row__head">
        <span class="label-mono">Traditional fixed round</span>
        <span class="mono t-sm c-tertiary">${distanceKm(route.traditionalKm)}</span>
      </div>
      <div class="compare-bar">
        <div class="compare-bar__fill compare-bar__fill--baseline"
             style="width:${traditionalPct}%"></div>
      </div>
      <div class="t-2xs c-tertiary mt-2">
        Visits all ${route.meta.totalBins} bins regardless of fill level
      </div>
    </div>

    <div class="compare-row mt-5">
      <div class="compare-row__head">
        <span class="label-mono c-green">SmartBin+ optimised</span>
        <span class="mono t-sm c-healthy">${distanceKm(route.optimizedKm)}</span>
      </div>
      <div class="compare-bar">
        <div class="compare-bar__fill compare-bar__fill--optimized"
             style="width:${optimisedPct}%"></div>
      </div>
      <div class="t-2xs c-tertiary mt-2">
        Visits only ${route.stops.length} bin${route.stops.length === 1 ? '' : 's'} at or above threshold
      </div>
    </div>

    <div class="compare-verdict">
      <span class="compare-verdict__figure">${reduction}%</span>
      <span class="compare-verdict__label">
        shorter · ${distanceKm(route.savedKm)} · ${fuel(route.fuelSavedL)} fuel · ${co2(route.co2SavedKg)} CO₂
      </span>
    </div>`;
}

/**
 * Method disclosure.
 *
 * Present because a route optimiser that will not explain itself is a route
 * optimiser nobody should trust — and because an examiner will ask.
 */
function renderMethod(container, route) {
  const a = route.meta.assumptions ?? {};

  container.innerHTML = `
    <dl class="method-list">
      <dt>Algorithm</dt>
      <dd>${escapeHtml(route.meta.algorithm)}${
        route.meta.twoOptPasses
          ? ` · ${route.meta.twoOptPasses} improvement pass${route.meta.twoOptPasses === 1 ? '' : 'es'}, ${route.meta.twoOptGainKm} km gained`
          : ''
      }</dd>

      <dt>Distance model</dt>
      <dd>${escapeHtml(route.meta.distanceModel)}</dd>

      <dt>Fuel economy</dt>
      <dd>${escapeHtml(a.fuelEconomy ?? '—')} <span class="c-tertiary">(assumed)</span></dd>

      <dt>Emission factor</dt>
      <dd>${escapeHtml(a.emissionFactor ?? '—')} <span class="c-tertiary">(literature value)</span></dd>

      <dt>Average speed</dt>
      <dd>${escapeHtml(a.averageSpeed ?? '—')} <span class="c-tertiary">(assumed)</span></dd>

      <dt>Service time</dt>
      <dd>${escapeHtml(a.serviceTime ?? '—')} <span class="c-tertiary">(assumed)</span></dd>
    </dl>

    <p class="t-2xs c-tertiary mt-4">
      ${escapeHtml(route.meta.note)}
      The literature survey recommends Dijkstra and A*; both operate on a road
      graph, which this prototype does not have. The ordering problem solved
      here is a travelling-salesman variant, for which 2-opt is the
      corresponding method.
    </p>`;
}

function renderTruckCard(truck) {
  const statusTone = {
    [TruckStatus.IDLE]: 'offline',
    [TruckStatus.DISPATCHED]: 'info',
    [TruckStatus.EN_ROUTE]: 'info',
    [TruckStatus.COLLECTING]: 'warning',
    [TruckStatus.RETURNING]: 'info',
    [TruckStatus.MAINTENANCE]: 'critical',
  }[truck.status] ?? 'offline';

  return `
    <div class="card card--padded">
      <div class="row row--between mb-3">
        <div class="min-w-0">
          <div class="t-base fw-semibold truncate">${escapeHtml(truck.label ?? truck.truckId)}</div>
          <div class="t-2xs c-tertiary mono mt-1">${escapeHtml(truck.truckId)}</div>
        </div>
        <span class="pill pill--${statusTone}">
          <span class="pill__dot"></span>${escapeHtml(String(truck.status ?? 'idle').toUpperCase())}
        </span>
      </div>

      <div class="field-grid">
        <div class="field-item">
          <div class="field-item__label">Assigned Stops</div>
          <div class="field-item__value">${truck.assignedRoute?.length ?? 0}</div>
        </div>
        <div class="field-item">
          <div class="field-item__label">Capacity</div>
          <div class="field-item__value">${
            Number.isFinite(truck.capacityL) ? `${truck.capacityL} L` : '—'
          }</div>
        </div>
        <div class="field-item">
          <div class="field-item__label">Driver</div>
          <div class="field-item__value">${escapeHtml(truck.driver ?? '—')}</div>
        </div>
      </div>
    </div>`;
}

/* ---------------------------------------------------------------------------
 * TEMPLATE
 * ------------------------------------------------------------------------- */

function template() {
  return `
    <style>
      .route-stop {
        display: flex; align-items: center; gap: var(--space-3);
        padding: var(--space-3) var(--space-4);
        margin-bottom: var(--space-2);
        background: var(--surface-raised);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        position: relative;
      }
      .route-stop__num {
        display: flex; align-items: center; justify-content: center;
        width: 24px; height: 24px; flex-shrink: 0;
        font-family: var(--font-mono); font-size: var(--text-2xs);
        font-weight: var(--weight-medium);
        color: var(--text-inverse); background: var(--sb-green-500);
        border-radius: var(--radius-full);
      }
      .route-stop__body { flex: 1; }

      .compare-row__head {
        display: flex; align-items: baseline; justify-content: space-between;
        margin-bottom: var(--space-2);
      }
      .compare-bar {
        height: 12px; background: var(--surface-inset);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-full); overflow: hidden;
      }
      .compare-bar__fill {
        height: 100%; border-radius: var(--radius-full);
        transition: width var(--duration-slow) var(--ease-decelerate);
      }
      .compare-bar__fill--baseline  { background: var(--text-disabled); }
      .compare-bar__fill--optimized { background: var(--sb-green-500); }

      .compare-verdict {
        display: flex; align-items: baseline; gap: var(--space-3);
        flex-wrap: wrap;
        margin-top: var(--space-6); padding-top: var(--space-5);
        border-top: 1px solid var(--border-subtle);
      }
      .compare-verdict__figure {
        font-family: var(--font-display); font-size: var(--text-3xl);
        font-weight: var(--weight-extra); letter-spacing: var(--tracking-tighter);
        color: var(--sb-green-500);
      }
      .compare-verdict__label { font-size: var(--text-sm); color: var(--text-secondary); }

      .method-list {
        display: grid; grid-template-columns: auto 1fr;
        gap: var(--space-2) var(--space-4); font-size: var(--text-xs);
      }
      .method-list dt {
        font-family: var(--font-mono); font-size: var(--text-2xs);
        letter-spacing: var(--tracking-wide); text-transform: uppercase;
        color: var(--text-tertiary); white-space: nowrap;
      }
      .method-list dd { color: var(--text-secondary); }

      .route-layout {
        display: grid; grid-template-columns: minmax(0, 1fr) 360px;
        gap: var(--space-6); align-items: start;
      }
      @media (max-width: 1180px) { .route-layout { grid-template-columns: 1fr; } }
    </style>

    <p class="t-sm c-secondary mb-5" id="route-summary" role="status"></p>

    <div class="grid grid--auto-sm mb-8" id="route-kpis"></div>

    <div class="route-layout">
      <div class="stack stack--lg">
        <section aria-labelledby="h-stops">
          <div class="row row--between mb-3">
            <h2 class="kpi-group__title m-0" id="h-stops" style="flex:0 0 auto">Collection Route</h2>
            <button class="btn-sm btn-sm--primary" id="dispatch-btn">Dispatch vehicle</button>
          </div>
          <div id="route-stops"></div>
        </section>

        <section aria-labelledby="h-fleet">
          <h2 class="kpi-group__title" id="h-fleet">Fleet</h2>
          <div class="grid grid--auto-md" id="fleet-list"></div>
        </section>
      </div>

      <div class="stack stack--lg">
        <section class="card card--padded-lg" aria-labelledby="h-compare">
          <h2 class="kpi-group__title" id="h-compare">Optimised vs Traditional</h2>
          <div id="route-compare"></div>
        </section>

        <section class="card card--padded-lg" aria-labelledby="h-method">
          <h2 class="kpi-group__title" id="h-method">Method & Assumptions</h2>
          <div id="route-method"></div>
        </section>
      </div>
    </div>`;
}

export default { mount };
