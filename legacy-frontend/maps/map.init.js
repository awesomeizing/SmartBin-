/**
 * SmartBin+ — Leaflet Map Initialisation
 * =============================================================================
 * Loads Leaflet from CDN on demand and creates a dark-themed map.
 *
 * Leaflet is loaded lazily rather than in the page head: it is roughly 145 KB
 * with its stylesheet, and an operator who only ever looks at the dashboard
 * should not pay for a map they never open.
 *
 * @module maps/map.init
 */

import { DEPLOYMENT } from '../config/app.config.js';

const LEAFLET_JS  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';

/**
 * Tile layer.
 *
 * CARTO dark matter, chosen because it is the only widely-available free
 * basemap that suits a dark control-room interface — standard OSM tiles are
 * bright and would glare against everything else in this UI.
 *
 * Attribution is a licence requirement, not decoration. It stays.
 */
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
  '&copy; <a href="https://carto.com/attributions">CARTO</a>';

/** Light-theme equivalent, used when the user switches themes. */
const TILE_URL_LIGHT = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

/** @type {Promise<any>|null} */
let leafletPromise = null;

/**
 * Load Leaflet once.
 * @returns {Promise<any>} The Leaflet global (`L`).
 */
export function loadLeaflet() {
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    if (window.L) { resolve(window.L); return; }

    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = LEAFLET_CSS;
      document.head.appendChild(css);
    }

    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(
      new Error('Leaflet failed to load from CDN. Check the network connection.')
    );

    document.head.appendChild(script);
  });

  return leafletPromise;
}

/**
 * Create a map instance.
 *
 * @param {HTMLElement|string} target
 * @param {object} [options]
 * @param {{lat: number, lng: number}} [options.center]
 * @param {number} [options.zoom]
 * @returns {Promise<{map: any, L: any, setTheme: (t: string) => void}>}
 */
export async function createMap(target, {
  center = DEPLOYMENT.CAMPUS_CENTER,
  zoom = DEPLOYMENT.DEFAULT_MAP_ZOOM,
} = {}) {
  const L = await loadLeaflet();

  const map = L.map(target, {
    center: [center.lat, center.lng],
    zoom,
    zoomControl: false,          // custom controls, positioned to match the UI
    attributionControl: true,
    preferCanvas: true,          // canvas rendering scales better with markers
  });

  let tileLayer = L.tileLayer(TILE_URL, {
    attribution: TILE_ATTRIBUTION,
    maxZoom: 20,
    subdomains: 'abcd',
  }).addTo(map);

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  /**
   * Swap basemap when the app theme changes, so the map does not stay dark
   * on a light UI (or the reverse).
   * @param {string} theme
   */
  const setTheme = (theme) => {
    map.removeLayer(tileLayer);
    tileLayer = L.tileLayer(theme === 'light' ? TILE_URL_LIGHT : TILE_URL, {
      attribution: TILE_ATTRIBUTION,
      maxZoom: 20,
      subdomains: 'abcd',
    }).addTo(map);
  };

  return { map, L, setTheme };
}

/**
 * Fit the map to a set of coordinates.
 *
 * @param {any} map
 * @param {any} L
 * @param {Array<{lat: number, lng: number}>} points
 * @param {object} [options]
 */
export function fitToPoints(map, L, points, { padding = [48, 48], maxZoom = 18 } = {}) {
  const valid = points.filter(
    (p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng)
  );

  if (valid.length === 0) return;

  if (valid.length === 1) {
    map.setView([valid[0].lat, valid[0].lng], maxZoom);
    return;
  }

  map.fitBounds(
    L.latLngBounds(valid.map((p) => [p.lat, p.lng])),
    { padding, maxZoom }
  );
}

export default { loadLeaflet, createMap, fitToPoints };
