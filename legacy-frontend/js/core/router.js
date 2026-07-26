/**
 * SmartBin+ — Hash Router
 * =============================================================================
 * Client-side routing for the dashboard shell.
 *
 * Hash-based rather than History API, deliberately: the project is served as
 * static files with no server-side rewrite rules, so `/dashboard/map` would
 * 404 on refresh. `#/map` always works, from Live Server, from a Python
 * one-liner, or from a USB stick during a demo.
 *
 * Views are loaded with dynamic `import()`, which gives real code splitting
 * without a bundler — the analytics module and its Chart.js dependency are
 * only fetched when someone opens Analytics.
 *
 * @module js/core/router
 */

import { emit, Events } from './events.js';
import { roleAtLeast } from './store.js';
import { Role } from '../../config/constants.js';

/**
 * @typedef {Object} RouteDefinition
 * @property {string} title           Document title and page heading.
 * @property {string} subtitle        Short description under the heading.
 * @property {() => Promise<any>} load Dynamic import of the view module.
 * @property {string} [minRole]       Minimum role required.
 * @property {string} icon            Sidebar glyph.
 */

/** @type {Record<string, RouteDefinition>} */
export const routes = {
  '/dashboard': {
    title: 'Operations Overview',
    subtitle: 'Live status across all deployed smart bins',
    icon: 'grid',
    load: () => import('../../pages/dashboard/dashboard.page.js'),
  },
  '/bins': {
    title: 'Smart Bins',
    subtitle: 'All registered bins with live fill levels and device status',
    icon: 'bin',
    load: () => import('../../pages/bins/bins.page.js'),
  },
  '/map': {
    title: 'Smart City Map',
    subtitle: 'Geographic distribution and collection routing',
    icon: 'map',
    load: () => import('../../pages/map/map.page.js'),
  },
  '/analytics': {
    title: 'Analytics',
    subtitle: 'Fill trends, collection performance and environmental impact',
    icon: 'chart',
    load: () => import('../../pages/analytics/analytics.page.js'),
  },
  '/alerts': {
    title: 'Alert Center',
    subtitle: 'Active incidents, acknowledgements and resolution history',
    icon: 'bell',
    load: () => import('../../pages/alerts/alerts.page.js'),
  },
  '/trucks': {
    title: 'Fleet & Routing',
    subtitle: 'Vehicle status and optimised collection routes',
    icon: 'truck',
    minRole: Role.MUNICIPALITY,
    load: () => import('../../pages/trucks/trucks.page.js'),
  },
  '/timeline': {
    title: 'Event Timeline',
    subtitle: 'Complete system audit trail',
    icon: 'clock',
    load: () => import('../../pages/timeline/timeline.page.js'),
  },
  '/simulation': {
    title: 'Simulation Engine',
    subtitle: 'Scenario testing — writes clearly-labelled simulated data',
    icon: 'beaker',
    minRole: Role.ADMINISTRATOR,
    load: () => import('../../pages/simulation/simulation.page.js'),
  },
  '/settings': {
    title: 'Settings',
    subtitle: 'Thresholds, bins, users and system configuration',
    icon: 'settings',
    minRole: Role.ADMINISTRATOR,
    load: () => import('../../pages/settings/settings.page.js'),
  },
};

export const DEFAULT_ROUTE = '/dashboard';

/** @type {HTMLElement|null} */
let outlet = null;

/** @type {{ path: string, teardown: (() => void)|null }} */
let current = { path: '', teardown: null };

/**
 * Start routing.
 *
 * @param {HTMLElement} outletElement Container the views render into.
 */
export function startRouter(outletElement) {
  outlet = outletElement;

  window.addEventListener('hashchange', handleRouteChange);
  handleRouteChange();
}

/** Stop routing and tear down the active view. */
export function stopRouter() {
  window.removeEventListener('hashchange', handleRouteChange);
  current.teardown?.();
  current = { path: '', teardown: null };
}

/**
 * Navigate programmatically.
 * @param {string} path e.g. '/map'
 */
export function navigate(path) {
  location.hash = `#${path}`;
}

/** @returns {string} */
export function currentPath() {
  return current.path;
}

/**
 * Resolve the hash, check permissions, tear down the previous view and mount
 * the next one.
 */
async function handleRouteChange() {
  const path = parseHash();
  const route = routes[path];

  if (!route) {
    navigate(DEFAULT_ROUTE);
    return;
  }

  // Role gate. The sidebar hides links a user cannot reach, but someone can
  // still type a hash — so the check happens here too. The database security
  // rules remain the actual enforcement layer; this is navigation courtesy.
  if (route.minRole && !roleAtLeast(route.minRole)) {
    renderForbidden(route);
    return;
  }

  // Always tear down before mounting. This is what keeps Firebase listener
  // counts flat across a long session.
  current.teardown?.();
  current = { path, teardown: null };

  document.title = `${route.title} · SmartBin+`;
  emit(Events.ROUTE_CHANGED, { path, route });

  renderLoading();

  try {
    const module = await route.load();

    if (parseHash() !== path) return;   // user navigated again mid-load

    outlet.innerHTML = '';
    const teardown = await module.mount(outlet, { route, path });
    current.teardown = typeof teardown === 'function' ? teardown : null;
  } catch (err) {
    console.error(`[router] failed to load view "${path}"`, err);
    renderError(path, err);
  }
}

/**
 * Read the path from the URL hash.
 * @returns {string}
 */
function parseHash() {
  const raw = location.hash.replace(/^#/, '');
  if (!raw || raw === '/') return DEFAULT_ROUTE;
  return raw.split('?')[0];
}

/**
 * Query parameters from the hash, e.g. `#/map?bin=BIN-001`.
 * @returns {URLSearchParams}
 */
export function routeParams() {
  const raw = location.hash.replace(/^#/, '');
  const queryIndex = raw.indexOf('?');
  return new URLSearchParams(queryIndex >= 0 ? raw.slice(queryIndex + 1) : '');
}

/**
 * Skeleton placeholder while a view loads. Preserves layout height so the
 * page does not jump when content arrives.
 */
function renderLoading() {
  outlet.innerHTML = `
    <div class="grid grid--auto-sm mb-6" aria-busy="true" aria-label="Loading">
      ${Array.from({ length: 4 }, () => `
        <div class="card card--padded">
          <div class="skeleton skeleton--text" style="width:45%"></div>
          <div class="skeleton skeleton--kpi mt-3"></div>
        </div>`).join('')}
    </div>
    <div class="card" style="height:320px">
      <div class="skeleton skeleton--block"></div>
    </div>`;
}

/**
 * @param {RouteDefinition} route
 */
function renderForbidden(route) {
  outlet.innerHTML = `
    <div class="card card--padded-lg" role="alert">
      <div class="label-mono c-warning mb-3">Access restricted</div>
      <h2 class="t-xl mb-3">${route.title} requires elevated permissions</h2>
      <p class="c-secondary t-base" style="max-width:56ch">
        This section is limited to <strong>${route.minRole}</strong> accounts.
        Your account does not currently have that role. Ask an administrator to
        update your permissions if you need access.
      </p>
      <button class="pill pill--info mt-6" onclick="location.hash='#${DEFAULT_ROUTE}'">
        Return to overview
      </button>
    </div>`;
}

/**
 * @param {string} path
 * @param {Error} err
 */
function renderError(path, err) {
  outlet.innerHTML = `
    <div class="card card--padded-lg" role="alert">
      <div class="label-mono c-critical mb-3">View failed to load</div>
      <h2 class="t-xl mb-3">Something went wrong opening ${path}</h2>
      <p class="c-secondary t-base mb-4" style="max-width:56ch">
        The view module could not be loaded. This usually means the file is
        missing, or the page is being opened directly from the file system
        rather than served over HTTP.
      </p>
      <pre class="card card--inset card--padded t-xs mono c-tertiary"
           style="white-space:pre-wrap; overflow-x:auto">${escapeHtml(err.message)}</pre>
    </div>`;
}

/**
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export default { routes, startRouter, stopRouter, navigate, currentPath, routeParams, DEFAULT_ROUTE };
