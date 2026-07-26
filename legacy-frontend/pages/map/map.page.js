/**
 * SmartBin+ — Smart City Map
 * =============================================================================
 * Geographic view of the deployment: bin markers, collection vehicle, depot,
 * and the optimised route when one exists.
 *
 * The map is genuinely real — real tiles, real coordinates, real geography.
 * The bin positions themselves are administrator-assigned rather than
 * device-reported, because the ESP32 has no GPS module (report §1.3 places
 * GPS in Phase-II). Coordinates that have not yet been surveyed are marked
 * as placeholders in the interface.
 *
 * @module pages/map/map.page
 */

import { createMap, fitToPoints } from '../../maps/map.init.js';
import { BinMarkerLayer, createTruckMarker, createDepotMarker } from '../../maps/markers.js';
import { subscribe, getBins, getBin, get, setUI } from '../../js/core/store.js';
import { renderBinCard, filterBins } from '../../components/bin-card/bin-card.js';
import { openBinModal, closeBinModal } from '../../components/bin-modal/bin-modal.js';
import { countBinsByStatus } from '../../js/utils/kpi.js';
import { routeParams } from '../../js/core/router.js';
import { on, Events } from '../../js/core/events.js';
import { escapeHtml, pluralize } from '../../js/utils/format.js';
import { DEPLOYMENT, THRESHOLDS } from '../../config/app.config.js';
import { isValidCoord } from '../../js/utils/geo.js';

/** Injected once — the map stylesheet is only needed by this view. */
function ensureMapStyles() {
  if (document.querySelector('link[data-map-theme]')) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'maps/map.theme.css';
  link.dataset.mapTheme = 'true';
  document.head.appendChild(link);
}

/**
 * @param {HTMLElement} outlet
 * @returns {Promise<() => void>} Teardown.
 */
export async function mount(outlet) {
  ensureMapStyles();
  outlet.innerHTML = template();

  const canvas   = outlet.querySelector('#map-canvas');
  const listEl   = outlet.querySelector('#map-bin-list');
  const searchEl = outlet.querySelector('#map-search');
  const filterEl = outlet.querySelector('#map-filters');
  const summary  = outlet.querySelector('#map-summary');

  let mapApi;
  try {
    mapApi = await createMap(canvas);
  } catch {
    outlet.innerHTML = `
      <div class="card card--padded-lg" role="alert">
        <div class="label-mono c-critical mb-3">Map unavailable</div>
        <h2 class="t-xl mb-3">Leaflet could not be loaded</h2>
        <p class="c-secondary t-base" style="max-width:56ch">
          The mapping library is loaded from a CDN and could not be reached.
          Check the network connection and reload. Every other view continues
          to work without it.
        </p>
      </div>`;
    return () => {};
  }

  const { map, L, setTheme } = mapApi;

  const markerLayer = new BinMarkerLayer(L, map, (binId) => {
    setUI({ selectedBinId: binId });
    renderSidebar();
  });

  // Static layers.
  createDepotMarker(L, DEPLOYMENT.DEPOT).addTo(map);

  /** @type {any|null} */
  let truckMarker = null;
  /** @type {any|null} */
  let routeLine = null;
  /** @type {any|null} */
  let baselineLine = null;

  const view = { filter: 'all', search: '' };
  let hasFitted = false;

  /* --- Rendering -------------------------------------------------------- */

  const renderMarkers = () => {
    const bins = getBins();
    const selectedId = get('ui').selectedBinId;

    markerLayer.update(bins, selectedId);

    // Fit to the deployment once, on first data. Refitting on every update
    // would yank the map away whenever the operator panned somewhere.
    if (!hasFitted && bins.length > 0) {
      const points = bins
        .map((b) => b.meta?.location)
        .filter(isValidCoord);

      if (points.length > 0) {
        fitToPoints(map, L, [...points, DEPLOYMENT.DEPOT]);
        hasFitted = true;
      }
    }
  };

  const renderSidebar = () => {
    const bins = getBins();
    const counts = countBinsByStatus(bins);
    const selectedId = get('ui').selectedBinId;

    renderFilters(filterEl, view.filter, counts);

    const visible = filterBins(bins, { ...view, sort: 'fill' });

    summary.textContent = `${visible.length} of ${pluralize(bins.length, 'bin')} shown`;

    listEl.innerHTML = visible.length
      ? visible.map((bin) =>
          renderBinCard(bin, { compact: true, selected: bin.binId === selectedId })
        ).join('')
      : '<div class="card card--padded ta-center c-tertiary t-xs">No bins match.</div>';

    listEl.querySelectorAll('[data-bin-id]').forEach((card) => {
      const binId = card.dataset.binId;

      card.addEventListener('click', () => {
        setUI({ selectedBinId: binId });
        markerLayer.focus(binId);
        renderSidebar();
      });

      card.addEventListener('dblclick', () => {
        const bin = getBin(binId);
        if (bin) openBinModal(bin);
      });
    });
  };

  const renderTruck = () => {
    const trucks = [...get('trucks').values()];
    if (trucks.length === 0) return;

    const truck = trucks[0];
    if (!isValidCoord(truck.position)) return;

    if (truckMarker) map.removeLayer(truckMarker);
    truckMarker = createTruckMarker(L, truck);
    truckMarker?.addTo(map);
  };

  const renderRoute = () => {
    const route = get('route');

    if (routeLine)    { map.removeLayer(routeLine);    routeLine = null; }
    if (baselineLine) { map.removeLayer(baselineLine); baselineLine = null; }

    if (!route?.stops?.length) return;

    const coords = route.stops
      .map((s) => s.location)
      .filter(isValidCoord)
      .map((c) => [c.lat, c.lng]);

    if (coords.length < 2) return;

    // Baseline first so the optimised route draws on top of it.
    if (route.baselineStops?.length) {
      const baseCoords = route.baselineStops
        .map((s) => s.location)
        .filter(isValidCoord)
        .map((c) => [c.lat, c.lng]);

      baselineLine = L.polyline(baseCoords, {
        className: 'route-line route-line--baseline',
        interactive: false,
      }).addTo(map);
    }

    routeLine = L.polyline(coords, {
      className: 'route-line route-line--animated',
      interactive: false,
    }).addTo(map);
  };

  /* --- Popup action delegation ------------------------------------------ */
  // Popups are created and destroyed by Leaflet, so listeners are delegated
  // from the map container rather than bound per popup.
  const handlePopupClick = (e) => {
    const button = e.target.closest('[data-open-bin]');
    if (!button) return;

    const bin = getBin(button.dataset.openBin);
    if (bin) openBinModal(bin);
  };
  canvas.addEventListener('click', handlePopupClick);

  /* --- Controls --------------------------------------------------------- */
  filterEl.addEventListener('click', (e) => {
    const button = e.target.closest('[data-filter]');
    if (!button) return;

    view.filter = button.dataset.filter;
    renderSidebar();
  });

  let searchTimer;
  searchEl.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      view.search = searchEl.value;
      renderSidebar();
    }, 180);
  });

  outlet.querySelector('#map-fit')?.addEventListener('click', () => {
    const points = getBins().map((b) => b.meta?.location).filter(isValidCoord);
    fitToPoints(map, L, [...points, DEPLOYMENT.DEPOT]);
  });

  /* --- Deep link -------------------------------------------------------- */
  const requested = routeParams().get('bin');

  /* --- Subscriptions ---------------------------------------------------- */
  const offTheme = on(Events.THEME_CHANGED, setTheme);

  // Declared before the subscription below: subscribe() invokes its handler
  // immediately, which would otherwise hit the temporal dead zone.
  let hasFocusedRequested = false;

  const unsubscribers = [
    subscribe('bins', () => {
      renderMarkers();
      renderSidebar();

      if (requested && !hasFocusedRequested && getBin(requested)) {
        markerLayer.focus(requested);
        setUI({ selectedBinId: requested });
        hasFocusedRequested = true;
      }
    }),
    subscribe('trucks', renderTruck),
    subscribe('route', renderRoute),
    subscribe('ui', renderMarkers),
  ];

  // Leaflet mis-measures its container when created inside a freshly-inserted
  // element. A deferred invalidate fixes the grey-tile-strip problem.
  setTimeout(() => map.invalidateSize(), 60);

  return () => {
    unsubscribers.forEach((off) => off());
    offTheme();
    clearTimeout(searchTimer);
    canvas.removeEventListener('click', handlePopupClick);
    markerLayer.destroy();
    map.remove();
    closeBinModal();
  };
}

/* ---------------------------------------------------------------------------
 * TEMPLATE
 * ------------------------------------------------------------------------- */

function renderFilters(container, active, counts) {
  const filters = [
    { key: 'all',      label: 'All',      count: counts.total },
    { key: 'critical', label: 'Critical', count: counts.critical },
    { key: 'warning',  label: 'Filling',  count: counts.warning },
    { key: 'healthy',  label: 'Healthy',  count: counts.healthy },
    { key: 'offline',  label: 'Offline',  count: counts.offline },
  ];

  container.innerHTML = filters.map((f) => `
    <button class="bin-filter${f.key === active ? ' is-active' : ''}"
            data-filter="${f.key}" aria-pressed="${f.key === active}">
      ${escapeHtml(f.label)}<span class="bin-filter__count">${f.count}</span>
    </button>`).join('');
}

function template() {
  return `
    <style>
      .map-layout {
        display: grid;
        grid-template-columns: 320px minmax(0, 1fr);
        gap: var(--space-4);
        height: calc(100vh - var(--nav-height) - var(--space-16));
        min-height: 520px;
      }
      .map-sidebar {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        min-height: 0;
      }
      .map-sidebar__list {
        flex: 1;
        overflow-y: auto;
        overscroll-behavior: contain;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        padding-inline-end: var(--space-1);
      }
      @media (max-width: 1024px) {
        .map-layout {
          grid-template-columns: 1fr;
          height: auto;
        }
        .map-sidebar__list { max-height: 320px; }
        .map-container { height: 460px; }
      }
    </style>

    <div class="map-layout">
      <aside class="map-sidebar" aria-label="Bin list">
        <input class="bin-search w-full" type="search" id="map-search"
               placeholder="Search bins…" aria-label="Search bins">

        <div class="row row--sm row--wrap" id="map-filters"></div>

        <p class="t-2xs c-tertiary mono" id="map-summary" role="status"></p>

        <div class="map-sidebar__list" id="map-bin-list"></div>

        <button class="btn-sm w-full" id="map-fit">Fit to deployment</button>
      </aside>

      <div class="map-container">
        <div class="map-canvas" id="map-canvas"></div>

        <div class="map-overlay map-overlay--top-left">
          <div class="label-mono mb-2">Fill Level</div>
          <div class="map-legend__row">
            <span class="map-legend__swatch" style="background:var(--status-healthy)"></span>
            Empty / Low · 0–${THRESHOLDS.BAND_EMPTY_MAX}%
          </div>
          <div class="map-legend__row">
            <span class="map-legend__swatch" style="background:var(--status-warning)"></span>
            Half / Moderate · ${THRESHOLDS.BAND_EMPTY_MAX + 1}–${THRESHOLDS.BAND_HALF_MAX}%
          </div>
          <div class="map-legend__row">
            <span class="map-legend__swatch" style="background:var(--status-critical)"></span>
            Full / Critical · ${THRESHOLDS.ALERT_PCT}–100%
          </div>
          <div class="map-legend__row">
            <span class="map-legend__swatch" style="background:var(--status-offline)"></span>
            Offline / no reading
          </div>
          <div class="map-legend__row" style="margin-top:var(--space-2); padding-top:var(--space-2); border-top:1px solid var(--border-subtle)">
            <span class="map-legend__swatch"
                  style="background:transparent; border:1px dashed var(--sb-amber-400)"></span>
            Simulated or awaiting hardware
          </div>
        </div>
      </div>
    </div>`;
}

export default { mount };
