/**
 * SmartBin+ — Interactive System Architecture
 * =============================================================================
 * An animated SVG diagram of the data path, with packets travelling between
 * nodes. Clicking a node reveals what happens at that stage.
 *
 * WHY THIS IS NOT AN IMAGE. The project brief asked for a built diagram
 * rather than a static export, and there is a substantive reason beyond
 * polish: report §4.2 and all three DFDs describe hardware the prototype does
 * not have — gas sensors, a servo lid actuator, a GSM module, an MQTT broker
 * and a cloud API gateway. This diagram shows the system that actually exists,
 * with the planned components marked as Phase-II rather than drawn as though
 * they were built.
 *
 * @module animations/architecture
 */

/**
 * The real data path, stage by stage.
 * Each node's `detail` is what appears when it is selected.
 */
export const NODES = [
  {
    id: 'sensor',
    label: 'HC-SR04',
    sublabel: 'Ultrasonic sensor',
    detail:
      'Emits a 40 kHz burst and measures the return-echo time to compute the ' +
      'distance from the lid to the waste surface. Range 2–400 cm, resolution 3 mm. ' +
      'Mounted inside the bin lid.',
    spec: 'TRIG → GPIO 5 · ECHO → GPIO 18',
    tone: 'green',
  },
  {
    id: 'esp32',
    label: 'ESP32',
    sublabel: 'Edge processing',
    detail:
      'Converts echo duration to distance, applies a five-sample rolling median ' +
      'to suppress oblique-echo artifacts, derives fill percentage, classifies ' +
      'the bin state, and drives the OLED, LED and buzzer locally. Threshold ' +
      'evaluation happens here — the bin knows it is full without asking the cloud.',
    spec: 'Dual-core 240 MHz · 520 KB SRAM',
    tone: 'green',
  },
  {
    id: 'wifi',
    label: 'Wi-Fi',
    sublabel: '802.11 b/g/n',
    detail:
      'Transmits the reading as JSON over HTTPS at a 60-second interval. ' +
      'Reconnection uses exponential back-off from 1 s to a 30 s maximum, so a ' +
      'dropped connection does not create a permanent gap in the record.',
    spec: 'HTTPS · 60 s interval · retry 1 s → 30 s',
    tone: 'blue',
  },
  {
    id: 'firebase',
    label: 'Firebase',
    sublabel: 'Realtime Database',
    detail:
      'Stores live telemetry, append-only history, alerts and the audit trail. ' +
      'Access is controlled by Authentication and database security rules. ' +
      'Serverless, so adding bins requires no infrastructure change.',
    spec: 'NoSQL · WebSocket sync · rule-enforced',
    tone: 'blue',
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    sublabel: 'Operations console',
    detail:
      'Subscribes to Firebase with live listeners. Every value on screen is a ' +
      'real record or an em dash — nothing is interpolated. Reflects a database ' +
      'write in under three seconds.',
    spec: 'Live listeners · role-based access',
    tone: 'blue',
  },
  {
    id: 'alerts',
    label: 'Alert Engine',
    sublabel: 'Threshold logic',
    detail:
      'Raises an alert when fill reaches the configured threshold (default 80%), ' +
      'and on sensor faults, low battery, weak signal or device silence. ' +
      'Deduplicated, so a bin sitting at 82% does not generate an alert every minute.',
    spec: 'Threshold 80% · configurable to 90%',
    tone: 'amber',
  },
  {
    id: 'truck',
    label: 'Collection',
    sublabel: 'Route optimisation',
    detail:
      'Builds a route covering only bins at or above threshold, using ' +
      'nearest-neighbour construction with 2-opt improvement. Compared against a ' +
      'traditional round that visits every bin regardless of fill level.',
    spec: 'Nearest-neighbour + 2-opt',
    tone: 'green',
  },
  {
    id: 'citizen',
    label: 'Cleaner Streets',
    sublabel: 'Outcome',
    detail:
      'Fewer overflow incidents, fewer unnecessary vehicle trips, lower fuel ' +
      'consumption and emissions. Aligned with UN Sustainable Development Goal 11 — ' +
      'Sustainable Cities and Communities.',
    spec: 'SDG 11',
    tone: 'green',
  },
];

/**
 * Components described in the report's architecture chapter but not fitted to
 * the prototype. Shown separately and clearly marked, rather than omitted or
 * — worse — drawn as if they existed.
 */
export const PLANNED = [
  { label: 'Gas sensor',    note: 'Odour and toxic-gas detection' },
  { label: 'Servo lid',     note: 'Automated lid actuation' },
  { label: 'GPS module',    note: 'Device-reported positioning' },
  { label: 'ML forecasting', note: 'Predictive fill modelling' },
];

/**
 * Render the architecture diagram into a container.
 *
 * @param {HTMLElement} container
 * @returns {() => void} Teardown.
 */
export function renderArchitecture(container) {
  const prefersReducedMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  container.innerHTML = template(prefersReducedMotion);

  const nodeEls = container.querySelectorAll('[data-node]');
  const detailEl = container.querySelector('#arch-detail');

  /** @param {string} nodeId */
  const select = (nodeId) => {
    const node = NODES.find((n) => n.id === nodeId);
    if (!node) return;

    nodeEls.forEach((el) => {
      const isActive = el.dataset.node === nodeId;
      el.classList.toggle('is-active', isActive);
      el.setAttribute('aria-pressed', String(isActive));
    });

    detailEl.innerHTML = `
      <div class="arch-detail__head">
        <span class="arch-detail__label">${escapeHtml(node.label)}</span>
        <span class="arch-detail__spec mono">${escapeHtml(node.spec)}</span>
      </div>
      <p class="arch-detail__body">${escapeHtml(node.detail)}</p>`;
  };

  nodeEls.forEach((el) => {
    el.addEventListener('click', () => select(el.dataset.node));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        select(el.dataset.node);
      }
    });
  });

  select(NODES[0].id);

  return () => { container.innerHTML = ''; };
}

/**
 * @param {boolean} reducedMotion
 * @returns {string}
 */
function template(reducedMotion) {
  return `
    <div class="arch">
      <div class="arch-flow" role="list">
        ${NODES.map((node, index) => `
          <div class="arch-node-wrap" role="listitem">
            <button class="arch-node arch-node--${escapeHtml(node.tone)}"
                    data-node="${escapeHtml(node.id)}"
                    aria-pressed="false">
              <span class="arch-node__index mono">${String(index + 1).padStart(2, '0')}</span>
              <span class="arch-node__label">${escapeHtml(node.label)}</span>
              <span class="arch-node__sub">${escapeHtml(node.sublabel)}</span>
            </button>

            ${index < NODES.length - 1 ? `
              <div class="arch-link" aria-hidden="true">
                <span class="arch-link__line"></span>
                ${reducedMotion ? '' : `
                  <span class="arch-packet" style="animation-delay:${index * 0.35}s"></span>
                  <span class="arch-packet" style="animation-delay:${index * 0.35 + 1.4}s"></span>`}
              </div>` : ''}
          </div>`).join('')}
      </div>

      <div class="arch-detail card card--padded-lg" id="arch-detail" aria-live="polite"></div>

      <div class="arch-planned">
        <div class="label-mono mb-3">Described in the report · not fitted to this prototype</div>
        <div class="row row--sm row--wrap">
          ${PLANNED.map((item) => `
            <span class="arch-planned__chip" title="${escapeHtml(item.note)}">
              ${escapeHtml(item.label)}
            </span>`).join('')}
        </div>
        <p class="t-2xs c-tertiary mt-3" style="max-width:64ch">
          The report's architecture chapter and data flow diagrams describe these
          components. They are Phase-II scope and are shown here as planned rather
          than drawn as though they were built.
        </p>
      </div>
    </div>`;
}

/**
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default { renderArchitecture, NODES, PLANNED };
