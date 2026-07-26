/**
 * SmartBin+ — Application Bootstrap
 * =============================================================================
 * Entry point for the dashboard shell.
 *
 * Startup order matters and is deliberate:
 *   1. Auth guard      — never render an operations console to a stranger
 *   2. Firebase init   — establish the connection
 *   3. Connection      — start monitoring before subscribing, so the first
 *                        state the UI shows is the true one
 *   4. Listeners       — subscribe to live data
 *   5. Shell           — sidebar, header, chrome
 *   6. Router          — mount the first view
 *
 * @module js/main
 */

import { requireAuth, signOut } from '../firebase/auth.service.js';
import { initFirebase } from '../firebase/init.js';
import { startConnectionMonitor, describeConnection } from '../firebase/connection.js';
import { subscribeAll, detachAll } from '../firebase/listeners.js';
import { startAlertEngine, stopAlertEngine } from './core/alert-engine.js';
import { startRouter, routes, currentPath } from './core/router.js';
import { subscribe, get, roleAtLeast, getBins, getAlerts } from './core/store.js';
import { on, Events } from './core/events.js';
import { initToasts } from '../components/toast/toast.js';
import { provenanceBreakdown, countAlerts } from './utils/kpi.js';
import { escapeHtml } from './utils/format.js';
import { UI as UI_CONFIG } from '../config/app.config.js';
import { ConnectionState, Role } from '../config/constants.js';

/** Icons for the sidebar, inline so there is no icon-font dependency. */
const ICONS = {
  grid:  '<path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/>',
  bin:   '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
  map:   '<path d="M9 20l-6 2V6l6-2m0 16l6-2m-6 2V4m6 14l6 2V6l-6-2m0 16V4"/>',
  chart: '<path d="M3 3v18h18M7 15l4-6 4 3 5-8"/>',
  bell:  '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
  truck: '<path d="M1 3h15v13H1zM16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  beaker:'<path d="M9 3h6M10 3v6L4 20a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1l-6-11V3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
};

/**
 * Boot the application.
 */
async function boot() {
  // 1. Auth guard — redirects to login.html if there is no session.
  const authenticated = await requireAuth();
  if (!authenticated) return;

  try {
    // 2. Firebase.
    await initFirebase();

    // 3. Connection monitoring, before data subscriptions so the status
    //    indicator reflects reality from the very first frame.
    startConnectionMonitor();

    // 4. Live data, then the rules that watch it.
    subscribeAll();
    startAlertEngine();
  } catch (err) {
    console.error('[main] initialisation failed', err);
    // init.js renders its own setup screen for an unconfigured project,
    // so there is nothing further to show here.
    return;
  }

  // 5. Shell.
  initToasts();
  renderNav();
  bindHeader();
  bindSidebar();
  bindUserPanel();
  watchConnection();
  watchProvenance();
  watchAlertCount();
  startClock();
  restoreTheme();

  // 6. Router.
  startRouter(document.getElementById('view-outlet'));
  syncPageHeading();

  // Release Firebase subscriptions and rule watchers when the tab closes.
  window.addEventListener('beforeunload', () => {
    stopAlertEngine();
    detachAll();
  });
}

/* ---------------------------------------------------------------------------
 * NAVIGATION
 * ------------------------------------------------------------------------- */

/**
 * Build the sidebar from the router's route table, hiding entries the current
 * role cannot reach.
 *
 * Hiding is presentation only. The router re-checks on navigation and the
 * database rules enforce independently — three layers, because the first two
 * are conveniences.
 */
function renderNav() {
  const nav = document.getElementById('sidebar-nav');
  const active = currentPath();

  nav.innerHTML = Object.entries(routes)
    .filter(([, route]) => !route.minRole || roleAtLeast(route.minRole))
    .map(([path, route]) => `
      <a class="sidebar__link${path === active ? ' is-active' : ''}"
         href="#${path}"
         data-path="${path}"
         ${route.minRole === Role.ADMINISTRATOR ? 'data-admin="true"' : ''}>
        <span class="sidebar__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none"
               stroke="currentColor" stroke-width="1.8"
               stroke-linecap="round" stroke-linejoin="round">
            ${ICONS[route.icon] ?? ICONS.grid}
          </svg>
        </span>
        <span class="sidebar__label">${escapeHtml(route.title)}</span>
      </a>`)
    .join('');
}

/** Re-render nav and heading whenever the route changes. */
on(Events.ROUTE_CHANGED, () => {
  renderNav();
  syncPageHeading();

  // Close the mobile drawer after navigating.
  document.getElementById('app-shell').dataset.sidebar = 'expanded';
});

/** Rebuild nav once the role resolves — links may become visible. */
on(Events.AUTH_ROLE_RESOLVED, renderNav);

function syncPageHeading() {
  const route = routes[currentPath()];
  if (!route) return;

  document.getElementById('page-title').textContent = route.title;
  document.getElementById('page-subtitle').textContent = route.subtitle;
}

/* ---------------------------------------------------------------------------
 * SHELL BINDINGS
 * ------------------------------------------------------------------------- */

function bindSidebar() {
  const shell = document.getElementById('app-shell');
  const toggle = document.getElementById('sidebar-toggle');

  toggle?.addEventListener('click', () => {
    const open = shell.dataset.sidebar === 'open';
    shell.dataset.sidebar = open ? 'expanded' : 'open';
    toggle.setAttribute('aria-expanded', String(!open));
  });

  // Escape closes the mobile drawer.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && shell.dataset.sidebar === 'open') {
      shell.dataset.sidebar = 'expanded';
      toggle?.setAttribute('aria-expanded', 'false');
    }
  });
}

function bindHeader() {
  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
}

function bindUserPanel() {
  subscribe('auth', ({ user, role }) => {
    if (!user) return;

    const name = user.displayName || user.email?.split('@')[0] || 'User';

    document.getElementById('user-name').textContent = name;
    document.getElementById('user-role').textContent = role ?? '—';
    document.getElementById('user-avatar').textContent =
      name.slice(0, 2).toUpperCase();
  });

  document.getElementById('signout-btn')?.addEventListener('click', async () => {
    stopAlertEngine();
    detachAll();
    await signOut();
    location.replace('login.html');
  });
}

/* ---------------------------------------------------------------------------
 * CONNECTION INDICATOR
 * ------------------------------------------------------------------------- */

/**
 * Bind the sidebar status pill to the connection state machine.
 *
 * Report §3.2 targets 99% availability. Showing the real state — including
 * when it is bad — is what makes that claim checkable rather than decorative.
 */
function watchConnection() {
  const pill = document.getElementById('connection-pill');
  const label = document.getElementById('connection-label');
  const meta = document.getElementById('connection-meta');

  subscribe('connection', (conn) => {
    const { label: text, tone, description } = describeConnection(conn.state);

    pill.className = `pill pill--${tone}${conn.state === ConnectionState.ONLINE ? ' pill--live' : ''}`;
    label.textContent = text;
    pill.title = description;

    const parts = [];
    if (Number.isFinite(conn.latencyMs)) parts.push(`${conn.latencyMs} ms`);
    if (conn.queuedWrites > 0) parts.push(`${conn.queuedWrites} queued`);

    meta.textContent = parts.join(' · ');
  });
}

/* ---------------------------------------------------------------------------
 * PROVENANCE BANNER
 * ------------------------------------------------------------------------- */

/**
 * Show a persistent banner whenever any displayed data is not from a live
 * device, or Simulation Mode is on.
 *
 * Not dismissible. The moment simulated data can hide, the dashboard stops
 * being trustworthy.
 */
function watchProvenance() {
  const banner = document.getElementById('provenance-banner');
  const text = document.getElementById('provenance-text');

  const update = () => {
    const p = provenanceBreakdown(getBins());
    const simulationOn = get('ui').simulationOn;

    if (p.total === 0) {
      banner.hidden = true;
      return;
    }

    if (p.isFullyLive && !simulationOn) {
      banner.hidden = true;
      return;
    }

    const parts = [];
    if (p.device) parts.push(`${p.device} live device${p.device === 1 ? '' : 's'}`);
    if (p.simulated) parts.push(`${p.simulated} simulated`);
    if (p.placeholder) parts.push(`${p.placeholder} awaiting hardware`);

    text.textContent =
      parts.join(' · ') +
      (simulationOn ? ' · SIMULATION MODE ACTIVE' : '');

    banner.hidden = false;
  };

  subscribe('bins', update);
  subscribe('ui', update);
}

/* ---------------------------------------------------------------------------
 * ALERT COUNT
 * ------------------------------------------------------------------------- */

function watchAlertCount() {
  const button = document.getElementById('header-alerts');
  const count = document.getElementById('header-alert-count');

  subscribe('alerts', () => {
    const { active } = countAlerts(getAlerts());

    count.textContent = String(active);
    button.hidden = active === 0;
    button.setAttribute('aria-label', `${active} active alert${active === 1 ? '' : 's'}`);
  });
}

/* ---------------------------------------------------------------------------
 * CLOCK
 * ------------------------------------------------------------------------- */

/**
 * Wall clock in the header.
 *
 * Present because control-room operators reference absolute time constantly,
 * and because it doubles as proof the page is alive — a frozen clock is the
 * fastest way to notice a hung tab.
 */
function startClock() {
  const el = document.getElementById('header-clock');

  const tick = () => {
    el.textContent = new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
  };

  tick();
  setInterval(tick, 1000);
}

/* ---------------------------------------------------------------------------
 * THEME
 * ------------------------------------------------------------------------- */

function restoreTheme() {
  const saved = localStorage.getItem(UI_CONFIG.THEME_STORAGE_KEY);
  if (saved) document.documentElement.setAttribute('data-theme', saved);
}

function toggleTheme() {
  const root = document.documentElement;
  const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';

  root.setAttribute('data-theme', next);
  localStorage.setItem(UI_CONFIG.THEME_STORAGE_KEY, next);
}

/* ------------------------------------------------------------------------- */

boot().catch((err) => console.error('[main] boot failed', err));
