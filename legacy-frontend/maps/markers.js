/**
 * SmartBin+ — Map Markers
 * =============================================================================
 * Custom bin and vehicle markers.
 *
 * Markers are DivIcons rather than image pins, so they inherit the design
 * tokens directly — a bin marker's colour comes from the same CSS variable as
 * its card, and changing the palette changes both.
 *
 * Provenance carries onto the map: simulated bins get a dashed ring, exactly
 * as their cards do. A marker must never be able to pass as live data.
 *
 * @module maps/markers
 */

import { getFillColorVar, getFillBand } from '../js/utils/fill.js';
import { escapeHtml, percent, relativeTime } from '../js/utils/format.js';
import { DataSource, DeviceState, PROVENANCE_LABEL } from '../config/constants.js';
import { THRESHOLDS } from '../config/app.config.js';

/**
 * Build a bin marker.
 *
 * @param {any} L
 * @param {object} bin
 * @param {object} [options]
 * @param {boolean} [options.selected=false]
 * @returns {any|null} Leaflet marker, or null if the bin has no coordinates.
 */
export function createBinMarker(L, bin, { selected = false } = {}) {
  const location = bin.meta?.location;
  if (!Number.isFinite(location?.lat) || !Number.isFinite(location?.lng)) return null;

  const live = bin.live ?? {};
  const hasReading = Number.isFinite(live.fillPct);
  const isOffline = bin.deviceState === DeviceState.OFFLINE;
  const threshold = bin.meta?.thresholdPct ?? THRESHOLDS.ALERT_PCT;

  const isCritical = hasReading && live.fillPct >= threshold && !isOffline;
  const source = bin.meta?.source ?? DataSource.PLACEHOLDER;
  const isSimulated = source !== DataSource.DEVICE;

  const color = isOffline ? 'var(--status-offline)'
              : hasReading ? getFillColorVar(live.fillPct)
              : 'var(--status-offline)';

  const marker = L.marker([location.lat, location.lng], {
    icon: L.divIcon({
      className: 'bin-marker-wrapper',
      html: `
        <div class="bin-marker${selected ? ' is-selected' : ''}${isCritical ? ' is-critical' : ''}"
             style="--marker-color:${color}"
             data-source="${escapeHtml(source)}">
          ${isCritical ? '<span class="bin-marker__pulse" aria-hidden="true"></span>' : ''}
          <span class="bin-marker__dot${isSimulated ? ' is-simulated' : ''}"></span>
          <span class="bin-marker__label">${
            hasReading ? Math.round(live.fillPct) + '%' : '—'
          }</span>
        </div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    }),
    // Critical bins render above the rest, so a full bin is never hidden
    // behind an empty one at the same intersection.
    zIndexOffset: isCritical ? 1000 : selected ? 500 : 0,
    keyboard: true,
    title: `${bin.meta?.label ?? bin.binId} — ${hasReading ? percent(live.fillPct) : 'no reading'}`,
  });

  marker.bindPopup(buildPopup(bin), {
    className: 'bin-popup',
    closeButton: true,
    maxWidth: 260,
    offset: [0, -12],
  });

  return marker;
}

/**
 * Popup content.
 * @param {object} bin
 * @returns {string}
 */
function buildPopup(bin) {
  const live = bin.live ?? {};
  const meta = bin.meta ?? {};
  const hasReading = Number.isFinite(live.fillPct);
  const band = hasReading ? getFillBand(live.fillPct) : null;
  const source = meta.source ?? DataSource.PLACEHOLDER;
  const isOffline = bin.deviceState === DeviceState.OFFLINE;

  return `
    <div class="bin-popup__inner">
      <div class="bin-popup__head">
        <strong>${escapeHtml(meta.label ?? bin.binId)}</strong>
        <span class="provenance provenance--${escapeHtml(source)}">
          ${escapeHtml(PROVENANCE_LABEL[source] ?? '')}
        </span>
      </div>

      <div class="bin-popup__id">${escapeHtml(bin.binId)} · ${escapeHtml(meta.zone ?? 'Unzoned')}</div>

      <div class="bin-popup__fill" style="color:${
        hasReading ? getFillColorVar(live.fillPct) : 'var(--text-disabled)'
      }">
        ${hasReading ? percent(live.fillPct) : '—'}
        <span class="bin-popup__band">${
          isOffline ? 'OFFLINE' : hasReading ? escapeHtml(band.status) : 'NO DATA'
        }</span>
      </div>

      <div class="bin-popup__meta">
        ${live.timestamp
          ? `Updated ${escapeHtml(relativeTime(live.timestamp))}`
          : 'No reading received'}
      </div>

      <button class="bin-popup__action" data-open-bin="${escapeHtml(bin.binId)}">
        View full details
      </button>
    </div>`;
}

/**
 * Collection vehicle marker.
 *
 * @param {any} L
 * @param {object} truck
 * @returns {any|null}
 */
export function createTruckMarker(L, truck) {
  const position = truck.position;
  if (!Number.isFinite(position?.lat) || !Number.isFinite(position?.lng)) return null;

  return L.marker([position.lat, position.lng], {
    icon: L.divIcon({
      className: 'truck-marker-wrapper',
      html: `
        <div class="truck-marker" style="--bearing:${truck.bearing ?? 0}deg">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 3h15v13H1zM16 8h4l3 3v5h-7z"/>
            <circle cx="5.5" cy="18.5" r="2"/><circle cx="18.5" cy="18.5" r="2"/>
          </svg>
        </div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    }),
    zIndexOffset: 2000,
    title: `${truck.label ?? truck.truckId} — ${truck.status ?? 'idle'}`,
  }).bindPopup(`
    <div class="bin-popup__inner">
      <div class="bin-popup__head"><strong>${escapeHtml(truck.label ?? truck.truckId)}</strong></div>
      <div class="bin-popup__id">${escapeHtml(truck.truckId)}</div>
      <div class="bin-popup__meta">Status: ${escapeHtml(truck.status ?? 'idle')}</div>
    </div>`, { className: 'bin-popup' });
}

/**
 * Depot marker.
 * @param {any} L
 * @param {{lat: number, lng: number, label?: string}} depot
 * @returns {any}
 */
export function createDepotMarker(L, depot) {
  return L.marker([depot.lat, depot.lng], {
    icon: L.divIcon({
      className: 'depot-marker-wrapper',
      html: `<div class="depot-marker" title="${escapeHtml(depot.label ?? 'Depot')}">◆</div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    }),
    title: depot.label ?? 'Depot',
  });
}

/**
 * Manage a layer of bin markers, reconciling against live data.
 *
 * Rebuilding every marker on each Firebase tick would close any open popup
 * and drop the user's selection, so markers are updated in place where
 * possible and only created or destroyed when the bin set actually changes.
 */
export class BinMarkerLayer {
  /**
   * @param {any} L
   * @param {any} map
   * @param {(binId: string) => void} [onSelect]
   */
  constructor(L, map, onSelect) {
    this.L = L;
    this.map = map;
    this.onSelect = onSelect;
    /** @type {Map<string, any>} */
    this.markers = new Map();
    this.group = L.layerGroup().addTo(map);
  }

  /**
   * Reconcile markers with the supplied bins.
   * @param {object[]} bins
   * @param {string|null} [selectedId]
   */
  update(bins, selectedId = null) {
    const seen = new Set();

    for (const bin of bins) {
      seen.add(bin.binId);

      const existing = this.markers.get(bin.binId);
      const marker = createBinMarker(this.L, bin, { selected: bin.binId === selectedId });

      if (!marker) {
        // Bin lost its coordinates — remove any stale marker.
        if (existing) {
          this.group.removeLayer(existing);
          this.markers.delete(bin.binId);
        }
        continue;
      }

      if (existing) {
        const wasOpen = existing.isPopupOpen?.();
        this.group.removeLayer(existing);

        this.group.addLayer(marker);
        this.markers.set(bin.binId, marker);

        if (wasOpen) marker.openPopup();
      } else {
        this.group.addLayer(marker);
        this.markers.set(bin.binId, marker);
      }

      marker.on('click', () => this.onSelect?.(bin.binId));
    }

    // Remove markers for bins that no longer exist.
    for (const [binId, marker] of this.markers) {
      if (!seen.has(binId)) {
        this.group.removeLayer(marker);
        this.markers.delete(binId);
      }
    }
  }

  /** @param {string} binId */
  focus(binId) {
    const marker = this.markers.get(binId);
    if (!marker) return;

    this.map.setView(marker.getLatLng(), Math.max(this.map.getZoom(), 18), {
      animate: true,
    });
    marker.openPopup();
  }

  destroy() {
    this.group.clearLayers();
    this.map.removeLayer(this.group);
    this.markers.clear();
  }
}

export default {
  createBinMarker, createTruckMarker, createDepotMarker, BinMarkerLayer,
};
