/**
 * SmartBin+ — Smart Bins View
 * =============================================================================
 * Grid of every registered bin, with filtering, search and sorting.
 * Selecting a card opens the full detail modal.
 *
 * @module pages/bins/bins.page
 */

import { subscribe, getBins, getBin, setUI } from '../../js/core/store.js';
import { renderBinGrid, filterBins } from '../../components/bin-card/bin-card.js';
import { openBinModal, closeBinModal } from '../../components/bin-modal/bin-modal.js';
import { countBinsByStatus, provenanceBreakdown } from '../../js/utils/kpi.js';
import { routeParams } from '../../js/core/router.js';
import { escapeHtml, pluralize } from '../../js/utils/format.js';

/**
 * @param {HTMLElement} outlet
 * @returns {() => void} Teardown.
 */
export function mount(outlet) {
  outlet.innerHTML = template();

  const grid       = outlet.querySelector('#bin-grid');
  const filterBar  = outlet.querySelector('#bin-filters');
  const searchBox  = outlet.querySelector('#bin-search');
  const sortSelect = outlet.querySelector('#bin-sort');
  const summary    = outlet.querySelector('#bin-summary');

  /** Current view state. Local to the page, not global — nothing else needs it. */
  const view = { filter: 'all', search: '', sort: 'fill' };

  const render = () => {
    const bins = getBins();
    const counts = countBinsByStatus(bins);
    const provenance = provenanceBreakdown(bins);

    renderFilters(filterBar, view.filter, counts);

    const visible = filterBins(bins, view);

    summary.textContent = visible.length === bins.length
      ? `${pluralize(bins.length, 'bin')} registered · ${provenance.device} live, ${provenance.placeholder} awaiting hardware`
      : `Showing ${visible.length} of ${pluralize(bins.length, 'bin')}`;

    renderBinGrid(grid, visible, {
      onSelect: (binId) => {
        const bin = getBin(binId);
        if (bin) {
          setUI({ selectedBinId: binId });
          openBinModal(bin);
        }
      },
    });
  };

  /* --- Filters ---------------------------------------------------------- */
  filterBar.addEventListener('click', (e) => {
    const button = e.target.closest('[data-filter]');
    if (!button) return;

    view.filter = button.dataset.filter;
    render();
  });

  /* --- Search ----------------------------------------------------------- */
  let searchTimer;
  searchBox.addEventListener('input', () => {
    // Debounced — re-rendering on every keystroke is wasteful and makes the
    // grid flicker while typing.
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      view.search = searchBox.value;
      render();
    }, 180);
  });

  /* --- Sort ------------------------------------------------------------- */
  sortSelect.addEventListener('change', () => {
    view.sort = sortSelect.value;
    render();
  });

  /* --- Deep link: #/bins?bin=BIN-001 opens that bin directly ------------- */
  const requested = routeParams().get('bin');
  if (requested) {
    // Defer until the first data snapshot has arrived.
    const off = subscribe('bins', () => {
      const bin = getBin(requested);
      if (bin) {
        openBinModal(bin);
        off();
      }
    });
  }

  const unsubscribe = subscribe('bins', render);

  return () => {
    unsubscribe();
    clearTimeout(searchTimer);
    closeBinModal();
  };
}

/**
 * Filter chips with live counts.
 *
 * @param {HTMLElement} container
 * @param {string} active
 * @param {object} counts
 */
function renderFilters(container, active, counts) {
  const filters = [
    { key: 'all',      label: 'All',      count: counts.total },
    { key: 'healthy',  label: 'Healthy',  count: counts.healthy },
    { key: 'warning',  label: 'Filling',  count: counts.warning },
    { key: 'critical', label: 'Critical', count: counts.critical },
    { key: 'offline',  label: 'Offline',  count: counts.offline },
  ];

  container.innerHTML = filters.map((f) => `
    <button class="bin-filter${f.key === active ? ' is-active' : ''}"
            data-filter="${f.key}"
            aria-pressed="${f.key === active}">
      ${escapeHtml(f.label)}
      <span class="bin-filter__count">${f.count}</span>
    </button>`).join('');
}

/**
 * @returns {string}
 */
function template() {
  return `
    <div class="bin-toolbar" role="toolbar" aria-label="Bin filters">
      <div class="row row--sm row--wrap" id="bin-filters"></div>

      <div class="spacer"></div>

      <input class="bin-search"
             type="search"
             id="bin-search"
             placeholder="Search by ID, label or zone…"
             aria-label="Search bins">

      <select class="bin-search" id="bin-sort" aria-label="Sort bins"
              style="max-width:170px; cursor:pointer">
        <option value="fill">Sort: fullest first</option>
        <option value="id">Sort: bin ID</option>
        <option value="zone">Sort: zone</option>
        <option value="battery">Sort: lowest battery</option>
      </select>
    </div>

    <p class="t-xs c-tertiary mb-4" id="bin-summary" role="status"></p>

    <div class="grid grid--auto-md" id="bin-grid"></div>`;
}

export default { mount };
