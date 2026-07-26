/**
 * SmartBin+ — Toast Notifications
 * =============================================================================
 * Transient alerts for events that need attention but not a page change.
 *
 * A toast triggered by simulated data always carries a provenance tag. Without
 * it, a simulated overflow warning would look exactly like a real one — which
 * is precisely the confusion the provenance system exists to prevent.
 *
 * @module components/toast/toast
 */

import { on, Events } from '../../js/core/events.js';
import { escapeHtml } from '../../js/utils/format.js';
import { TIMING, UI } from '../../config/app.config.js';
import { AlertSeverity, DataSource } from '../../config/constants.js';

/** Maximum simultaneous toasts. Beyond this the oldest is removed. */
const MAX_VISIBLE = 4;

const ICONS = {
  critical: '⬤',
  warning:  '▲',
  info:     '●',
  success:  '✓',
};

/** @type {HTMLElement|null} */
let container = null;

/** @type {HTMLAudioElement|null} */
let audio = null;

/**
 * Initialise the toast system.
 * @param {string} [containerId='toast-container']
 */
export function initToasts(containerId = 'toast-container') {
  container = document.getElementById(containerId);
  if (!container) {
    console.warn('[toast] container not found:', containerId);
    return;
  }

  // Surface alerts raised anywhere in the app.
  on(Events.ALERT_RAISED, (alert) => {
    showToast({
      type: alert.severity ?? AlertSeverity.INFO,
      title: alert.binId ? `${alert.binId} — ${alert.type ?? 'Alert'}` : 'Alert',
      message: alert.message ?? '',
      source: alert.source,
      sound: true,
    });
  });

  on(Events.CONNECTION_LOST, () => {
    showToast({
      type: 'warning',
      title: 'Connection lost',
      message: 'Displayed data may be stale. Writes will be queued and replayed.',
    });
  });

  on(Events.CONNECTION_RESTORED, () => {
    showToast({
      type: 'success',
      title: 'Connection restored',
      message: 'Live data resumed. Any queued writes have been sent.',
    });
  });

  on(Events.TOAST, showToast);
}

/**
 * Show a toast.
 *
 * @param {object} options
 * @param {'critical'|'warning'|'info'|'success'} [options.type='info']
 * @param {string} options.title
 * @param {string} [options.message]
 * @param {string} [options.source]      DataSource.* — adds a provenance tag.
 * @param {number} [options.duration]    Override the auto-dismiss time.
 * @param {boolean} [options.sound=false]
 * @returns {HTMLElement|null}
 */
export function showToast({
  type = 'info',
  title,
  message = '',
  source,
  duration,
  sound = false,
}) {
  if (!container) return null;

  // Critical toasts linger — an operator should not miss an overflow because
  // they looked away for five seconds.
  const dismissAfter = duration
    ?? (type === 'critical' ? TIMING.TOAST_CRITICAL_MS : TIMING.TOAST_DURATION_MS);

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', type === 'critical' ? 'alert' : 'status');

  const isSimulated = source === DataSource.SIMULATED;

  toast.innerHTML = `
    <span class="toast__icon" aria-hidden="true">${ICONS[type] ?? ICONS.info}</span>
    <div class="toast__body">
      <div class="toast__title">${escapeHtml(title)}</div>
      ${message ? `<div class="toast__message">${escapeHtml(message)}</div>` : ''}
      ${isSimulated ? '<span class="toast__provenance">SIMULATED DATA</span>' : ''}
    </div>
    <button class="toast__close" aria-label="Dismiss notification">×</button>
    <div class="toast__progress" style="animation-duration:${dismissAfter}ms"></div>`;

  toast.querySelector('.toast__close').addEventListener('click', () => dismiss(toast));

  container.appendChild(toast);
  trimOverflow();

  if (sound) playSound(type);

  const timer = setTimeout(() => dismiss(toast), dismissAfter);

  // Hovering pauses both the progress bar (CSS) and the dismissal timer,
  // otherwise the bar would freeze while the toast still vanished.
  let remaining = dismissAfter;
  let startedAt = Date.now();
  let activeTimer = timer;

  toast.addEventListener('mouseenter', () => {
    clearTimeout(activeTimer);
    remaining -= Date.now() - startedAt;
  });

  toast.addEventListener('mouseleave', () => {
    startedAt = Date.now();
    activeTimer = setTimeout(() => dismiss(toast), Math.max(remaining, 600));
  });

  return toast;
}

/**
 * Animate out, then remove.
 * @param {HTMLElement} toast
 */
function dismiss(toast) {
  if (!toast.isConnected || toast.classList.contains('toast--exiting')) return;

  toast.classList.add('toast--exiting');
  toast.addEventListener('animationend', () => toast.remove(), { once: true });

  // Fallback for reduced-motion, where no animation event fires.
  setTimeout(() => toast.remove(), 400);
}

/** Remove the oldest toasts beyond MAX_VISIBLE. */
function trimOverflow() {
  const toasts = [...container.children];
  if (toasts.length <= MAX_VISIBLE) return;

  toasts.slice(0, toasts.length - MAX_VISIBLE).forEach(dismiss);
}

/**
 * Play an alert sound.
 *
 * Muted by default (UI.SOUND_ENABLED_DEFAULT). A console that beeps
 * unprompted on load is a console whose sound gets turned off permanently
 * within a day, so this is opt-in from Settings.
 *
 * @param {string} type
 */
function playSound(type) {
  const enabled = localStorage.getItem('smartbin:sound') === 'true'
    || UI.SOUND_ENABLED_DEFAULT;

  if (!enabled) return;

  const src = UI.SOUNDS[type];
  if (!src) return;

  try {
    audio = audio ?? new Audio();
    audio.src = src;
    audio.volume = type === 'critical' ? 0.6 : 0.35;
    // Browsers block autoplay until the user has interacted with the page;
    // a rejected promise here is expected and harmless.
    audio.play().catch(() => {});
  } catch {
    /* sound is a nicety, never a failure path */
  }
}

/** Remove every visible toast. */
export function clearToasts() {
  if (!container) return;
  [...container.children].forEach(dismiss);
}

export default { initToasts, showToast, clearToasts };
