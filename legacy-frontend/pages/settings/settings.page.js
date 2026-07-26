/**
 * SmartBin+ — Settings
 * =============================================================================
 * Administrator configuration: thresholds, bin registration and coordinates,
 * user roles, exports and interface preferences.
 *
 * The bin coordinate editor matters more than it looks. Bin positions are
 * administrator-assigned metadata rather than device-reported GPS, because the
 * ESP32 has no GPS module (report §1.3 places that in Phase-II). When the four
 * physical bins are surveyed, their real coordinates are typed in here — no
 * code change, no redeploy.
 *
 * @module pages/settings/settings.page
 */

import { subscribe, getBins, get, isAdmin, getAlerts } from '../../js/core/store.js';
import {
  updateConfig, updateBinMeta, registerBin, deleteBin,
  listUsers, upsertUser, readHistory,
} from '../../firebase/db.service.js';
import { showToast } from '../../components/toast/toast.js';
import {
  exportBinsCsv, exportAlertsCsv, exportEventsCsv, exportHistoryCsv, exportPdfReport,
} from '../../js/utils/export.js';
import { countBinsByStatus } from '../../js/utils/kpi.js';
import { escapeHtml, percent } from '../../js/utils/format.js';
import { formatCoord } from '../../js/utils/geo.js';
import { Role, DataSource, PROVENANCE_LABEL } from '../../config/constants.js';
import { THRESHOLDS, TIMING, SENSOR, UI, DEPLOYMENT } from '../../config/app.config.js';

/**
 * @param {HTMLElement} outlet
 * @returns {() => void}
 */
export function mount(outlet) {
  if (!isAdmin()) {
    outlet.innerHTML = `
      <div class="card card--padded-lg" role="alert">
        <div class="label-mono c-warning mb-3">Access restricted</div>
        <h2 class="t-xl mb-3">Settings require administrator access</h2>
        <p class="c-secondary t-base" style="max-width:56ch">
          Configuration changes affect every connected client. This section is
          limited to administrator accounts.
        </p>
      </div>`;
    return () => {};
  }

  outlet.innerHTML = template();

  const binListEl  = outlet.querySelector('#settings-bins');
  const userListEl = outlet.querySelector('#settings-users');

  /* --- Thresholds -------------------------------------------------------- */
  const thresholdInput = outlet.querySelector('#cfg-threshold');
  const intervalInput  = outlet.querySelector('#cfg-interval');
  const fuelInput      = outlet.querySelector('#cfg-fuel');
  const co2Input       = outlet.querySelector('#cfg-co2');
  const speedInput     = outlet.querySelector('#cfg-speed');

  const syncConfigInputs = () => {
    const config = get('config');

    thresholdInput.value = config.defaultThresholdPct ?? THRESHOLDS.ALERT_PCT;
    intervalInput.value  = config.pollIntervalSec ?? TIMING.POLL_INTERVAL_SEC;
    fuelInput.value      = config.truckKmPerL ?? 3.5;
    co2Input.value       = config.co2KgPerL ?? 2.68;
    speedInput.value     = config.avgSpeedKmph ?? 20;
  };

  outlet.querySelector('#cfg-save').addEventListener('click', async (e) => {
    const button = e.currentTarget;
    button.disabled = true;

    const threshold = Number(thresholdInput.value);

    // Objective 4 permits 80–90. Enforced here and again in the security
    // rules, so a hand-crafted write cannot bypass it.
    if (threshold < THRESHOLDS.ALERT_PCT_MIN || threshold > THRESHOLDS.ALERT_PCT_MAX) {
      showToast({
        type: 'critical',
        title: 'Threshold out of range',
        message: `The report specifies ${THRESHOLDS.ALERT_PCT_MIN}–${THRESHOLDS.ALERT_PCT_MAX}%. Values outside that contradict Objective 4.`,
      });
      button.disabled = false;
      return;
    }

    try {
      await updateConfig({
        defaultThresholdPct: threshold,
        pollIntervalSec: Number(intervalInput.value),
        truckKmPerL: Number(fuelInput.value),
        co2KgPerL: Number(co2Input.value),
        avgSpeedKmph: Number(speedInput.value),
      });

      showToast({
        type: 'success',
        title: 'Configuration saved',
        message: 'Every connected client will pick this up immediately.',
      });
    } catch (err) {
      showToast({ type: 'critical', title: 'Could not save', message: err.message });
    } finally {
      button.disabled = false;
    }
  });

  /* --- Bin management ---------------------------------------------------- */
  const renderBins = () => {
    const bins = getBins();

    binListEl.innerHTML = bins.length
      ? bins.map(renderBinRow).join('')
      : `<div class="card card--padded ta-center c-tertiary t-sm">
           No bins registered. Use the seed script or add one below.
         </div>`;
  };

  binListEl.addEventListener('click', async (e) => {
    const editBtn   = e.target.closest('[data-edit]');
    const saveBtn   = e.target.closest('[data-save-bin]');
    const cancelBtn = e.target.closest('[data-cancel]');
    const deleteBtn = e.target.closest('[data-delete]');
    const histBtn   = e.target.closest('[data-history]');

    if (editBtn) {
      const row = editBtn.closest('[data-bin-row]');
      row.querySelector('.bin-row__view').hidden = true;
      row.querySelector('.bin-row__edit').hidden = false;
      return;
    }

    if (cancelBtn) {
      const row = cancelBtn.closest('[data-bin-row]');
      row.querySelector('.bin-row__view').hidden = false;
      row.querySelector('.bin-row__edit').hidden = true;
      return;
    }

    if (histBtn) {
      const binId = histBtn.dataset.history;
      histBtn.disabled = true;
      try {
        const records = await readHistory(binId, 2000);
        if (records.length === 0) {
          showToast({ type: 'info', title: 'No history', message: `${binId} has no recorded readings yet.` });
        } else {
          exportHistoryCsv(binId, records);
        }
      } catch (err) {
        showToast({ type: 'critical', title: 'Export failed', message: err.message });
      } finally {
        histBtn.disabled = false;
      }
      return;
    }

    if (saveBtn) {
      const row = saveBtn.closest('[data-bin-row]');
      const binId = row.dataset.binRow;

      const updates = {
        label: row.querySelector('[name="label"]').value.trim(),
        zone: row.querySelector('[name="zone"]').value.trim(),
        address: row.querySelector('[name="address"]').value.trim(),
        depthCm: Number(row.querySelector('[name="depth"]').value),
        thresholdPct: Number(row.querySelector('[name="threshold"]').value),
        location: {
          lat: Number(row.querySelector('[name="lat"]').value),
          lng: Number(row.querySelector('[name="lng"]').value),
          source: 'manual',
        },
      };

      if (!Number.isFinite(updates.location.lat) || !Number.isFinite(updates.location.lng)) {
        showToast({ type: 'critical', title: 'Invalid coordinates', message: 'Latitude and longitude must be numbers.' });
        return;
      }

      saveBtn.disabled = true;
      try {
        await updateBinMeta(binId, updates);
        showToast({
          type: 'success',
          title: `${binId} updated`,
          message: 'Coordinates and metadata saved.',
        });
      } catch (err) {
        showToast({ type: 'critical', title: 'Could not save', message: err.message });
      } finally {
        saveBtn.disabled = false;
      }
      return;
    }

    if (deleteBtn) {
      const binId = deleteBtn.dataset.delete;

      // Deleting a bin removes its entire history. A confirm dialogue is the
      // right amount of friction for something irreversible.
      if (!confirm(`Delete ${binId}? This removes the bin and all of its recorded history. This cannot be undone.`)) {
        return;
      }

      try {
        await deleteBin(binId);
        showToast({ type: 'info', title: `${binId} deleted` });
      } catch (err) {
        showToast({ type: 'critical', title: 'Could not delete', message: err.message });
      }
    }
  });

  /* --- Add bin ----------------------------------------------------------- */
  outlet.querySelector('#add-bin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    const binId = String(data.get('binId')).trim().toUpperCase();
    if (!binId) return;

    try {
      await registerBin({
        binId,
        label: String(data.get('label')).trim() || binId,
        zone: String(data.get('zone')).trim() || 'Zone-A',
        address: String(data.get('address')).trim(),
        location: {
          lat: Number(data.get('lat')) || DEPLOYMENT.CAMPUS_CENTER.lat,
          lng: Number(data.get('lng')) || DEPLOYMENT.CAMPUS_CENTER.lng,
        },
        depthCm: Number(data.get('depth')) || SENSOR.DEFAULT_DEPTH_CM,
        source: DataSource.PLACEHOLDER,
      });

      showToast({
        type: 'success',
        title: `${binId} registered`,
        message: 'It will show as awaiting hardware until an ESP32 writes to it.',
      });
      form.reset();
    } catch (err) {
      showToast({ type: 'critical', title: 'Could not register', message: err.message });
    }
  });

  /* --- Users ------------------------------------------------------------- */
  const loadUsers = async () => {
    try {
      const users = await listUsers();

      userListEl.innerHTML = users.length
        ? users.map(renderUserRow).join('')
        : `<div class="card card--padded ta-center c-tertiary t-sm">
             No user records. Add one in the Firebase console under
             <code class="mono">/users/{uid}</code>.
           </div>`;
    } catch (err) {
      userListEl.innerHTML = `
        <div class="card card--padded c-tertiary t-sm">
          Could not read user records: ${escapeHtml(err.message)}
        </div>`;
    }
  };

  userListEl.addEventListener('change', async (e) => {
    const select = e.target.closest('[data-user-role]');
    if (!select) return;

    const uid = select.dataset.userRole;
    const role = select.value;

    try {
      await upsertUser(uid, { role });
      showToast({ type: 'success', title: 'Role updated', message: `Set to ${role}.` });
    } catch (err) {
      showToast({ type: 'critical', title: 'Could not update role', message: err.message });
      loadUsers();
    }
  });

  /* --- Exports ----------------------------------------------------------- */
  outlet.querySelector('#export-bins').addEventListener('click', () => {
    exportBinsCsv(getBins());
  });

  outlet.querySelector('#export-alerts').addEventListener('click', () => {
    exportAlertsCsv(getAlerts());
  });

  outlet.querySelector('#export-events').addEventListener('click', () => {
    exportEventsCsv(get('events'));
  });

  outlet.querySelector('#export-pdf').addEventListener('click', () => {
    const bins = getBins();
    exportPdfReport({
      bins,
      alerts: getAlerts(),
      route: get('route'),
      summary: countBinsByStatus(bins),
    });
  });

  /* --- Preferences ------------------------------------------------------- */
  const soundToggle = outlet.querySelector('#pref-sound');
  soundToggle.checked = localStorage.getItem('smartbin:sound') === 'true';

  soundToggle.addEventListener('change', () => {
    localStorage.setItem('smartbin:sound', String(soundToggle.checked));
    showToast({
      type: 'info',
      title: soundToggle.checked ? 'Alert sounds enabled' : 'Alert sounds muted',
    });
  });

  const themeSelect = outlet.querySelector('#pref-theme');
  themeSelect.value = localStorage.getItem(UI.THEME_STORAGE_KEY) ?? UI.DEFAULT_THEME;

  themeSelect.addEventListener('change', () => {
    document.documentElement.setAttribute('data-theme', themeSelect.value);
    localStorage.setItem(UI.THEME_STORAGE_KEY, themeSelect.value);
  });

  /* --- Boot -------------------------------------------------------------- */
  const unsubscribers = [
    subscribe('bins', renderBins),
    subscribe('config', syncConfigInputs),
  ];

  loadUsers();

  return () => unsubscribers.forEach((off) => off());
}

/* ---------------------------------------------------------------------------
 * RENDERERS
 * ------------------------------------------------------------------------- */

function renderBinRow(bin) {
  const meta = bin.meta ?? {};
  const live = bin.live ?? {};
  const source = meta.source ?? DataSource.PLACEHOLDER;
  const location = meta.location ?? DEPLOYMENT.CAMPUS_CENTER;

  return `
    <div class="card card--padded-sm mb-3" data-bin-row="${escapeHtml(bin.binId)}">

      <div class="bin-row__view">
        <div class="row row--between row--top">
          <div class="min-w-0">
            <div class="row row--sm">
              <span class="t-sm fw-semibold">${escapeHtml(meta.label ?? bin.binId)}</span>
              <span class="provenance provenance--${escapeHtml(source)}">
                ${escapeHtml(PROVENANCE_LABEL[source] ?? '')}
              </span>
            </div>
            <div class="t-2xs c-tertiary mono mt-1">
              ${escapeHtml(bin.binId)} · ${escapeHtml(meta.zone ?? 'Unzoned')} ·
              ${escapeHtml(formatCoord(location))}
            </div>
            <div class="t-2xs c-tertiary mt-1">
              Depth ${meta.depthCm ?? SENSOR.DEFAULT_DEPTH_CM} cm ·
              Threshold ${meta.thresholdPct ?? THRESHOLDS.ALERT_PCT}% ·
              Current ${Number.isFinite(live.fillPct) ? percent(live.fillPct) : '—'}
            </div>
          </div>

          <div class="row row--sm shrink-0">
            <button class="btn-sm" data-history="${escapeHtml(bin.binId)}">Export history</button>
            <button class="btn-sm" data-edit="${escapeHtml(bin.binId)}">Edit</button>
            <button class="btn-sm" data-delete="${escapeHtml(bin.binId)}"
                    style="color:var(--status-critical); border-color:var(--status-critical-brd)">
              Delete
            </button>
          </div>
        </div>
      </div>

      <div class="bin-row__edit" hidden>
        <div class="settings-grid">
          ${textField('label', 'Label', meta.label ?? '')}
          ${textField('zone', 'Zone', meta.zone ?? '')}
          ${textField('address', 'Address', meta.address ?? '')}
          ${numberField('lat', 'Latitude', location.lat, '0.00001')}
          ${numberField('lng', 'Longitude', location.lng, '0.00001')}
          ${numberField('depth', 'Bin depth (cm)', meta.depthCm ?? SENSOR.DEFAULT_DEPTH_CM, '0.5')}
          ${numberField('threshold', 'Alert threshold (%)', meta.thresholdPct ?? THRESHOLDS.ALERT_PCT, '1')}
        </div>

        <p class="t-2xs c-tertiary mt-3" style="max-width:60ch">
          Coordinates are administrator-assigned. The ESP32 has no GPS module,
          so these are entered from a site survey rather than reported by the
          device — GPS integration is Phase-II scope per report §1.3.
        </p>

        <div class="row row--sm mt-4">
          <button class="btn-sm btn-sm--primary" data-save-bin="${escapeHtml(bin.binId)}">Save</button>
          <button class="btn-sm" data-cancel>Cancel</button>
        </div>
      </div>
    </div>`;
}

function renderUserRow(user) {
  return `
    <div class="card card--padded-sm mb-2">
      <div class="row row--between">
        <div class="min-w-0">
          <div class="t-sm fw-medium truncate">
            ${escapeHtml(user.displayName ?? user.email ?? user.uid)}
          </div>
          <div class="t-2xs c-tertiary mono mt-1 truncate">${escapeHtml(user.uid)}</div>
        </div>
        <select class="bin-search shrink-0" style="max-width:160px; cursor:pointer"
                data-user-role="${escapeHtml(user.uid)}" aria-label="Role">
          ${Object.values(Role).map((role) => `
            <option value="${role}"${user.role === role ? ' selected' : ''}>${role}</option>
          `).join('')}
        </select>
      </div>
    </div>`;
}

function textField(name, label, value) {
  return `
    <label class="settings-field">
      <span class="settings-field__label">${escapeHtml(label)}</span>
      <input class="bin-search w-full" type="text" name="${name}"
             value="${escapeHtml(value)}">
    </label>`;
}

function numberField(name, label, value, step) {
  return `
    <label class="settings-field">
      <span class="settings-field__label">${escapeHtml(label)}</span>
      <input class="bin-search w-full" type="number" name="${name}"
             value="${escapeHtml(value)}" step="${step}">
    </label>`;
}

/* ---------------------------------------------------------------------------
 * TEMPLATE
 * ------------------------------------------------------------------------- */

function template() {
  return `
    <style>
      .settings-grid {
        display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: var(--space-3);
      }
      .settings-field { display: block; }
      .settings-field__label {
        display: block; margin-bottom: var(--space-2);
        font-family: var(--font-mono); font-size: var(--text-2xs);
        letter-spacing: var(--tracking-wide); text-transform: uppercase;
        color: var(--text-tertiary);
      }
      .settings-section { margin-bottom: var(--space-10); }
      .settings-note {
        margin-top: var(--space-3); font-size: var(--text-2xs);
        color: var(--text-tertiary); max-width: 64ch;
      }
      .pref-row {
        display: flex; align-items: center; justify-content: space-between;
        gap: var(--space-4); padding: var(--space-3) 0;
        border-bottom: 1px solid var(--border-subtle);
      }
      .pref-row:last-child { border-bottom: none; }
    </style>

    <!-- Thresholds & assumptions -->
    <section class="settings-section" aria-labelledby="h-config">
      <h2 class="kpi-group__title" id="h-config">Thresholds &amp; Derived-Metric Assumptions</h2>

      <div class="card card--padded-lg">
        <div class="settings-grid">
          <label class="settings-field">
            <span class="settings-field__label">Alert threshold (%)</span>
            <input class="bin-search w-full" type="number" id="cfg-threshold"
                   min="${THRESHOLDS.ALERT_PCT_MIN}" max="${THRESHOLDS.ALERT_PCT_MAX}" step="1">
          </label>
          <label class="settings-field">
            <span class="settings-field__label">Poll interval (s)</span>
            <input class="bin-search w-full" type="number" id="cfg-interval" min="10" max="3600" step="10">
          </label>
          <label class="settings-field">
            <span class="settings-field__label">Vehicle economy (km/L)</span>
            <input class="bin-search w-full" type="number" id="cfg-fuel" min="0.5" max="20" step="0.1">
          </label>
          <label class="settings-field">
            <span class="settings-field__label">Emission factor (kg/L)</span>
            <input class="bin-search w-full" type="number" id="cfg-co2" min="0.1" max="5" step="0.01">
          </label>
          <label class="settings-field">
            <span class="settings-field__label">Average speed (km/h)</span>
            <input class="bin-search w-full" type="number" id="cfg-speed" min="5" max="80" step="1">
          </label>
        </div>

        <p class="settings-note">
          The alert threshold is constrained to ${THRESHOLDS.ALERT_PCT_MIN}–${THRESHOLDS.ALERT_PCT_MAX}%
          because report Objective 4 specifies that range. The fuel, emission and
          speed values are assumptions used to derive the savings figures shown
          throughout the console — they are displayed as tooltips wherever those
          numbers appear, and are not measurements.
        </p>

        <button class="btn-sm btn-sm--primary mt-4" id="cfg-save">Save configuration</button>
      </div>
    </section>

    <!-- Bins -->
    <section class="settings-section" aria-labelledby="h-bins">
      <h2 class="kpi-group__title" id="h-bins">Registered Bins</h2>
      <div id="settings-bins"></div>

      <details class="card card--padded mt-4">
        <summary class="t-sm fw-medium cursor-pointer">Register a new bin</summary>
        <form id="add-bin-form" class="mt-4">
          <div class="settings-grid">
            ${textField('binId', 'Bin ID', '')}
            ${textField('label', 'Label', '')}
            ${textField('zone', 'Zone', '')}
            ${textField('address', 'Address', '')}
            ${numberField('lat', 'Latitude', DEPLOYMENT.CAMPUS_CENTER.lat, '0.00001')}
            ${numberField('lng', 'Longitude', DEPLOYMENT.CAMPUS_CENTER.lng, '0.00001')}
            ${numberField('depth', 'Bin depth (cm)', SENSOR.DEFAULT_DEPTH_CM, '0.5')}
          </div>
          <button class="btn-sm btn-sm--primary mt-4" type="submit">Register bin</button>
        </form>
      </details>
    </section>

    <!-- Users -->
    <section class="settings-section" aria-labelledby="h-users">
      <h2 class="kpi-group__title" id="h-users">User Roles</h2>
      <div id="settings-users"></div>
      <p class="settings-note">
        Accounts are created in Firebase Authentication. Roles are stored at
        <code class="mono">/users/{uid}/role</code> and enforced by the database
        security rules — changing a role here takes effect immediately for that user.
      </p>
    </section>

    <!-- Exports -->
    <section class="settings-section" aria-labelledby="h-export">
      <h2 class="kpi-group__title" id="h-export">Export</h2>
      <div class="card card--padded-lg">
        <div class="row row--sm row--wrap">
          <button class="btn-sm" id="export-bins">Bin status (CSV)</button>
          <button class="btn-sm" id="export-alerts">Alert log (CSV)</button>
          <button class="btn-sm" id="export-events">Event timeline (CSV)</button>
          <button class="btn-sm btn-sm--primary" id="export-pdf">Operations report (PDF)</button>
        </div>
        <p class="settings-note">
          CSV columns follow the normalized schema in report §3.1 — Timestamp,
          Bin ID, Distance_cm, Fill_Level_%, Bin_Status, Message_Status — plus a
          data-source column so real and simulated readings remain distinguishable
          outside the application. The PDF report opens in a new window; choose
          “Save as PDF” in the print dialogue.
        </p>
      </div>
    </section>

    <!-- Preferences -->
    <section class="settings-section" aria-labelledby="h-prefs">
      <h2 class="kpi-group__title" id="h-prefs">Interface Preferences</h2>
      <div class="card card--padded-lg">
        <div class="pref-row">
          <div>
            <div class="t-sm fw-medium">Alert sounds</div>
            <div class="t-2xs c-tertiary mt-1">
              Play a tone when a critical alert is raised. Off by default.
            </div>
          </div>
          <input type="checkbox" id="pref-sound" style="width:18px; height:18px; cursor:pointer">
        </div>

        <div class="pref-row">
          <div>
            <div class="t-sm fw-medium">Colour theme</div>
            <div class="t-2xs c-tertiary mt-1">
              Dark is the default and receives the design attention.
            </div>
          </div>
          <select class="bin-search" id="pref-theme" style="max-width:130px; cursor:pointer">
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </div>
      </div>
    </section>`;
}

export default { mount };
