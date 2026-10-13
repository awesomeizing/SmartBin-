// ─────────────────────────────────────────────────────────────
// SmartBin+ — LiveBinState → legacy BinSummary adapter
// ─────────────────────────────────────────────────────────────
// `LiveBinState` is the canonical model (src/lib/telemetry.ts). Several
// older pages still consume the flatter `BinSummary` shape, so rather than
// maintaining two sources of truth we PROJECT one onto the other here.
//
// There is still exactly one source of data. This file only reshapes it.
// ─────────────────────────────────────────────────────────────

import { DEFAULT_MAP_CENTER } from '@/config/devices.config';
import type { Bin, BinStatus, BinSummary } from '@/types';
import type { LiveBinState } from '@/lib/telemetry';

/** Map the operational status onto the legacy three-value enum. */
function toLegacyStatus(state: LiveBinState): BinStatus {
  switch (state.status) {
    case 'FULL':
      return 'Full';
    case 'FILLING':
      return 'Half';
    default:
      // OK, and every non-measuring state. Legacy consumers pair this with
      // `isOnline`, which is what actually distinguishes them.
      return 'Empty';
  }
}

/**
 * Coordinates for display.
 *
 * Until the four bins are surveyed, `location` is null in the registry. We
 * lay them out on a small grid around the default centre so the map has
 * something to draw, and `COORDINATES_CONFIGURED` tells the UI to label them
 * as unconfigured rather than passing them off as real positions.
 */
export function resolveLocation(state: LiveBinState): { lat: number; lng: number } {
  if (state.location) return state.location;

  // ~110 m per 0.001°, so this spreads the model-city grid over a few hundred
  // metres — legible at the default zoom without implying false precision.
  const SPACING = 0.0012;
  return {
    lat: DEFAULT_MAP_CENTER.lat - state.grid.row * SPACING,
    lng: DEFAULT_MAP_CENTER.lng + state.grid.col * SPACING,
  };
}

/** Project canonical live state onto the legacy summary shape. */
export function liveBinToSummary(state: LiveBinState): BinSummary {
  return {
    id: state.binId,
    label: state.label,
    zone: state.zone,
    address: state.location ? '' : 'Location not configured',
    location: { ...resolveLocation(state), source: 'manual' },
    // Legacy consumers cannot represent "unknown", so an unmeasured bin
    // reads as 0 here. Anything that must not fabricate a number uses
    // LiveBinState.fillPct (null) instead — dashboard, map and detail all do.
    fillPct: state.fillPct ?? 0,
    binStatus: toLegacyStatus(state),
    // These bins are mains/USB powered — there is no battery to report, so
    // 100 means "not applicable", not a measured charge.
    batteryPct: 100,
    rssi: state.rssi ?? 0,
    source: 'device',
    lastUpdate: state.lastSeen ?? 0,
    isOnline: state.isOnline,
    temperatureC: null,
    humidityPct: null,
    healthScore: state.sensorOk ? 100 : 40,
    thresholdPct: 80,
  };
}

/** Project canonical live state onto the nested legacy `Bin` shape. */
export function liveBinToBin(state: LiveBinState): Bin {
  const location = resolveLocation(state);

  return {
    id: state.binId,
    meta: {
      binId: state.binId,
      label: state.label,
      zone: state.zone,
      address: state.location ? '' : 'Location not configured',
      location: { ...location, source: 'manual' },
      depthCm: 11,
      thresholdPct: 80,
      source: 'device',
      installedAt: 0,
      capacity: 240,
    },
    live: {
      distanceCm: state.distanceCm ?? 0,
      fillPct: state.fillPct ?? 0,
      binStatus: toLegacyStatus(state),
      messageStatus: state.isOnline ? 'Delivered' : 'Failed',
      rssi: state.rssi ?? 0,
      batteryPct: 100,
      uptimeSec: state.uptimeSec ?? 0,
      firmware: state.firmware ?? '—',
      timestamp: state.lastSeen ?? 0,
    },
    health: {
      sensorOk: state.sensorOk,
      wifiOk: state.isOnline,
      ledOk: true,
      buzzerOk: true,
      oledOk: true,
      healthScore: state.sensorOk ? 100 : 40,
      lastMaintenance: null,
    },
    reserved: { temperatureC: null, humidityPct: null, gasPpm: null },
  };
}
