/**
 * SmartBin+ — Simulation Control Panel
 * =============================================================================
 * Administrator-only. Runs scenarios against selected bins.
 *
 * The panel is deliberately blunt about what it does. Every scenario states
 * which part of the system it exercises, and the warning banner is
 * permanent rather than dismissible — someone walking up to this screen
 * mid-demo should be able to tell within a second that they are looking at
 * simulated data.
 *
 * @module pages/simulation/simulation.page
 */

import {
  setSimulationMode, runScenario, stopScenario, stopAll,
  runningBins, clearSimulation, scenarioCatalogue, isSimulationOn,
} from '../../js/simulation/engine.js';
import { subscribe, getBins, isAdmin } from '../../js/core/store.js';
import { showToast } from '../../components/toast/toast.js';
import { escapeHtml, percent } from '../../js/utils/format.js';
import { getFillColorVar } from '../../js/utils/fill.js';
import { DataSource, PROVENANCE_LABEL } from '../../config/constants.js';

/**
 * @param {HTMLElement} outlet
 * @returns {() => void}
 */
export function mount(outlet) {
  // Belt and braces: the router already gates this route, but a view that
  // can write simulated data to a shared database should check for itself.
  if (!isAdmin()) {
    outlet.innerHTML = `
      <div class="card card--padded-lg" role="alert">
        <div class="label-mono c-warning mb-3">Access restricted</div>
        <h2 class="t-xl mb-3">Simulation controls require administrator access</h2>
        <p class="c-secondary t-base" style="max-width:56ch">
          Simulation writes data to the shared database that every connected
          client will see. It is limited to administrator accounts.
        </p>
      </div>`;
    return () => {};
  }

  outlet.innerHTML = template();

  const toggleEl    = outlet.querySelector('#sim-toggle');
  const statusEl    = outlet.querySelector('#sim-status');
  const binListEl   = outlet.querySelector('#sim-bin-list');
  const scenarioEl  = outlet.querySelector('#sim-scenarios');
  const runningEl   = outlet.querySelector('#sim-running');
  const stopAllBtn  = outlet.querySelector('#sim-stop-all');

  /** @type {string|null} */
  let selectedBinId = null;

  const render = () => {
    const bins = getBins();
    const on = isSimulationOn();
    const running = runningBins();

    // Toggle state
    toggleEl.setAttribute('aria-pressed', String(on));
    toggleEl.classList.toggle('is-on', on);
    toggleEl.querySelector('.sim-toggle__label').textContent =
      on ? 'Simulation mode ON' : 'Simulation mode OFF';

    statusEl.textContent = on
      ? 'Simulated data is being written to the shared database. Every connected client sees it, badged as simulated.'
      : 'Enable simulation mode to run scenarios. Nothing is written while it is off.';

    statusEl.className = on ? 't-sm c-warning' : 't-sm c-tertiary';

    // Bin selector
    if (!selectedBinId && bins.length > 0) selectedBinId = bins[0].binId;

    binListEl.innerHTML = bins.length
      ? bins.map((bin) => renderBinOption(bin, bin.binId === selectedBinId)).join('')
      : '<div class="card card--padded ta-center c-tertiary t-sm">No bins registered. Run the seed script first.</div>';

    // Scenarios
    scenarioEl.innerHTML = scenarioCatalogue()
      .map((s) => renderScenario(s, on && Boolean(selectedBinId)))
      .join('');

    // Running scenarios
    runningEl.innerHTML = running.length
      ? running.map((binId) => `
          <div class="row row--between sim-running-row">
            <span class="mono t-xs">${escapeHtml(binId)}</span>
            <button class="btn-sm" data-stop="${escapeHtml(binId)}">Stop</button>
          </div>`).join('')
      : '<p class="t-xs c-tertiary">No continuous scenarios running.</p>';

    stopAllBtn.disabled = running.length === 0;
  };

  /* --- Mode toggle ------------------------------------------------------- */
  toggleEl.addEventListener('click', async () => {
    const next = !isSimulationOn();
    toggleEl.disabled = true;

    try {
      await setSimulationMode(next);
      showToast({
        type: next ? 'warning' : 'success',
        title: next ? 'Simulation mode enabled' : 'Simulation mode disabled',
        message: next
          ? 'Scenario data will be written to the database and labelled as simulated.'
          : 'All running scenarios stopped.',
      });
    } catch (err) {
      console.error('[simulation] toggle failed', err);
      showToast({ type: 'critical', title: 'Could not change mode', message: err.message });
    } finally {
      toggleEl.disabled = false;
      render();
    }
  });

  /* --- Bin selection ----------------------------------------------------- */
  binListEl.addEventListener('click', (e) => {
    const option = e.target.closest('[data-select-bin]');
    if (!option) return;

    selectedBinId = option.dataset.selectBin;
    render();
  });

  /* --- Scenario execution ------------------------------------------------ */
  scenarioEl.addEventListener('click', async (e) => {
    const button = e.target.closest('[data-scenario]');
    if (!button || button.disabled) return;

    const scenario = button.dataset.scenario;
    button.disabled = true;

    const result = await runScenario(scenario, selectedBinId);

    showToast({
      type: result.ok ? 'info' : 'critical',
      title: result.ok ? 'Scenario applied' : 'Scenario failed',
      message: result.message,
      source: result.ok ? DataSource.SIMULATED : undefined,
    });

    button.disabled = false;
    render();
  });

  /* --- Stop controls ----------------------------------------------------- */
  runningEl.addEventListener('click', (e) => {
    const button = e.target.closest('[data-stop]');
    if (!button) return;

    stopScenario(button.dataset.stop);
    render();
  });

  stopAllBtn.addEventListener('click', () => {
    stopAll();
    showToast({ type: 'info', title: 'All scenarios stopped' });
    render();
  });

  /* --- Reset provenance -------------------------------------------------- */
  outlet.querySelector('#sim-clear')?.addEventListener('click', async () => {
    if (!selectedBinId) return;

    try {
      await clearSimulation(selectedBinId);
      showToast({
        type: 'success',
        title: 'Simulation cleared',
        message: `${selectedBinId} reset to awaiting-hardware state.`,
      });
    } catch (err) {
      showToast({ type: 'critical', title: 'Could not clear', message: err.message });
    }
    render();
  });

  const unsubscribers = [
    subscribe('bins', render),
    subscribe('ui', render),
    subscribe('config', render),
  ];

  const ticker = setInterval(render, 2000);   // reflect running scenarios

  return () => {
    unsubscribers.forEach((off) => off());
    clearInterval(ticker);
  };
}

/* ---------------------------------------------------------------------------
 * RENDERERS
 * ------------------------------------------------------------------------- */

function renderBinOption(bin, selected) {
  const fill = bin.live?.fillPct;
  const source = bin.meta?.source ?? DataSource.PLACEHOLDER;

  return `
    <button class="sim-bin${selected ? ' is-selected' : ''}"
            data-select-bin="${escapeHtml(bin.binId)}"
            data-source="${escapeHtml(source)}"
            aria-pressed="${selected}">
      <div class="row row--between">
        <span class="t-sm fw-medium truncate">${escapeHtml(bin.meta?.label ?? bin.binId)}</span>
        <span class="mono t-xs shrink-0" style="color:${
          Number.isFinite(fill) ? getFillColorVar(fill) : 'var(--text-disabled)'
        }">${Number.isFinite(fill) ? percent(fill) : '—'}</span>
      </div>
      <div class="row row--sm mt-2">
        <span class="mono t-2xs c-tertiary">${escapeHtml(bin.binId)}</span>
        <span class="provenance provenance--${escapeHtml(source)}">
          ${escapeHtml(PROVENANCE_LABEL[source] ?? '')}
        </span>
      </div>
    </button>`;
}

function renderScenario(scenario, enabled) {
  return `
    <button class="sim-scenario sim-scenario--${escapeHtml(scenario.tone)}"
            data-scenario="${escapeHtml(scenario.id)}"
            ${enabled ? '' : 'disabled'}>
      <div class="row row--between">
        <span class="sim-scenario__label">${escapeHtml(scenario.label)}</span>
        ${scenario.phaseII
          ? '<span class="sim-scenario__tag">PHASE II</span>'
          : ''}
      </div>
      <p class="sim-scenario__desc">${escapeHtml(scenario.description)}</p>
    </button>`;
}

/* ---------------------------------------------------------------------------
 * TEMPLATE
 * ------------------------------------------------------------------------- */

function template() {
  return `
    <style>
      .sim-toggle {
        display: flex; align-items: center; gap: var(--space-3);
        padding: var(--space-4) var(--space-5);
        background: var(--surface-raised);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-lg);
        transition: border-color var(--duration-micro) var(--ease-standard),
                    background-color var(--duration-micro) var(--ease-standard);
      }
      .sim-toggle.is-on {
        border-color: var(--status-warning-brd);
        background: var(--status-warning-bg);
      }
      .sim-toggle__switch {
        position: relative; width: 40px; height: 22px; flex-shrink: 0;
        background: var(--surface-inset);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-full);
        transition: background-color var(--duration-micro) var(--ease-standard);
      }
      .sim-toggle.is-on .sim-toggle__switch {
        background: var(--sb-amber-500); border-color: var(--sb-amber-500);
      }
      .sim-toggle__switch::after {
        content: ''; position: absolute; top: 2px; inset-inline-start: 2px;
        width: 16px; height: 16px; border-radius: var(--radius-full);
        background: var(--text-secondary);
        transition: transform var(--duration-micro) var(--ease-spring),
                    background-color var(--duration-micro) var(--ease-standard);
      }
      .sim-toggle.is-on .sim-toggle__switch::after {
        transform: translateX(18px); background: var(--surface-base);
      }
      .sim-toggle__label {
        font-family: var(--font-mono); font-size: var(--text-xs);
        letter-spacing: var(--tracking-wide); text-transform: uppercase;
        color: var(--text-primary);
      }

      .sim-warning {
        display: flex; gap: var(--space-3);
        padding: var(--space-4) var(--space-5); margin-bottom: var(--space-6);
        background: var(--status-warning-bg);
        border: 1px solid var(--status-warning-brd);
        border-radius: var(--radius-lg);
      }

      .sim-bin {
        display: block; width: 100%; text-align: start;
        padding: var(--space-3) var(--space-4); margin-bottom: var(--space-2);
        background: var(--surface-raised);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        position: relative; overflow: hidden;
        transition: border-color var(--duration-micro) var(--ease-standard);
      }
      .sim-bin:hover { border-color: var(--border-default); }
      .sim-bin.is-selected {
        border-color: var(--sb-green-500);
        box-shadow: 0 0 0 1px var(--sb-green-500);
      }

      .sim-scenario {
        display: block; width: 100%; text-align: start;
        padding: var(--space-4);
        background: var(--surface-raised);
        border: 1px solid var(--border-subtle);
        border-inline-start-width: 2px;
        border-radius: var(--radius-md);
        transition: border-color var(--duration-micro) var(--ease-standard),
                    background-color var(--duration-micro) var(--ease-standard);
      }
      .sim-scenario:hover:not(:disabled) {
        border-color: var(--border-strong);
        background: var(--surface-hover);
      }
      .sim-scenario:disabled { opacity: 0.4; cursor: not-allowed; }

      .sim-scenario--critical { border-inline-start-color: var(--status-critical); }
      .sim-scenario--warning  { border-inline-start-color: var(--status-warning); }
      .sim-scenario--healthy  { border-inline-start-color: var(--status-healthy); }
      .sim-scenario--info     { border-inline-start-color: var(--status-info); }

      .sim-scenario__label {
        font-size: var(--text-sm); font-weight: var(--weight-semibold);
        color: var(--text-primary);
      }
      .sim-scenario__tag {
        font-family: var(--font-mono); font-size: 9px;
        letter-spacing: var(--tracking-wide);
        color: var(--sb-blue-400);
        padding: 1px var(--space-2);
        border: 1px dashed rgba(59, 130, 246, 0.4);
        border-radius: var(--radius-xs);
      }
      .sim-scenario__desc {
        margin-top: var(--space-2);
        font-size: var(--text-xs); line-height: var(--leading-snug);
        color: var(--text-secondary);
      }

      .sim-running-row {
        padding: var(--space-2) 0;
        border-bottom: 1px solid var(--border-subtle);
      }
      .sim-running-row:last-child { border-bottom: none; }

      .sim-layout {
        display: grid; grid-template-columns: 300px minmax(0, 1fr);
        gap: var(--space-6); align-items: start;
      }
      @media (max-width: 1024px) { .sim-layout { grid-template-columns: 1fr; } }
    </style>

    <div class="sim-warning" role="note">
      <span aria-hidden="true" style="color:var(--status-warning)">◆</span>
      <div>
        <p class="t-sm fw-semibold c-warning">This panel writes simulated data to the live database</p>
        <p class="t-xs c-secondary mt-2" style="max-width:70ch">
          Any bin touched here is flagged <code class="mono">simulated</code> and stays
          visibly badged across every view until real hardware writes to it. Simulation
          exists to demonstrate conditions that cannot be produced safely on demand —
          fire, overflow, sensor failure, network loss — not to represent bins that
          do not exist.
        </p>
      </div>
    </div>

    <div class="row row--between row--wrap mb-6" style="gap:var(--space-4)">
      <button class="sim-toggle" id="sim-toggle" aria-pressed="false">
        <span class="sim-toggle__switch" aria-hidden="true"></span>
        <span class="sim-toggle__label">Simulation mode OFF</span>
      </button>
      <button class="btn-sm" id="sim-stop-all" disabled>Stop all scenarios</button>
    </div>

    <p class="t-sm c-tertiary mb-6" id="sim-status" role="status"></p>

    <div class="sim-layout">
      <aside>
        <h2 class="kpi-group__title">Target Bin</h2>
        <div id="sim-bin-list"></div>

        <h2 class="kpi-group__title mt-6">Running</h2>
        <div id="sim-running"></div>

        <button class="btn-sm w-full mt-4" id="sim-clear">
          Clear simulation on selected bin
        </button>
      </aside>

      <div>
        <h2 class="kpi-group__title">Scenarios</h2>
        <div class="grid grid--auto-md grid--gap-sm" id="sim-scenarios"></div>
      </div>
    </div>`;
}

export default { mount };
