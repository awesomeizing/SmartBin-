// ─────────────────────────────────────────────────────────────
// SmartBin+ — DEVELOPMENT SIMULATOR
// ─────────────────────────────────────────────────────────────
// Generates plausible telemetry so the dashboard can be developed without
// four physical bins on the desk.
//
// This file is reachable ONLY when VITE_DATA_MODE=simulation. It is never
// a fallback for a misconfigured production deploy, and the UI always shows
// a SIMULATION badge while it is running. See src/config/mode.ts.
// ─────────────────────────────────────────────────────────────

import {
  EMPTY_DISTANCE_CM,
  FULL_DISTANCE_CM,
  PHYSICAL_BINS,
  SENSING_SPAN_CM,
} from '@/config/devices.config';
import type { RawTelemetry } from '@/lib/telemetry';

/** Fill percentage → the distance a sensor would report for it. */
function fillToDistance(fillPct: number): number {
  return EMPTY_DISTANCE_CM - (fillPct / 100) * SENSING_SPAN_CM;
}

/** Starting fills, spread across the bands so every UI state is visible. */
const SEED_FILL: Record<string, number> = {
  'BIN-01': 20,
  'BIN-02': 55,
  'BIN-03': 85,
  'BIN-04': 10,
};

/**
 * Advance the simulation by one tick.
 *
 * @param previous Prior simulated telemetry, keyed by bin ID.
 * @returns The next state. Pure with respect to `previous`.
 */
export function createSimulatedTelemetry(
  previous: Record<string, RawTelemetry>,
): Record<string, RawTelemetry> {
  const now = Date.now();
  const next: Record<string, RawTelemetry> = {};

  for (const cfg of PHYSICAL_BINS) {
    const prior = previous[cfg.binId];

    let fillPct: number;
    if (!prior || typeof prior.distanceCm !== 'number') {
      fillPct = SEED_FILL[cfg.binId] ?? 25;
    } else {
      const priorFill =
        ((EMPTY_DISTANCE_CM - prior.distanceCm) / SENSING_SPAN_CM) * 100;
      // Fills gradually; empties when collected.
      fillPct = priorFill >= 100 ? 5 : Math.min(100, priorFill + Math.random() * 1.5);
    }

    const distanceCm = Math.max(
      FULL_DISTANCE_CM,
      Math.min(EMPTY_DISTANCE_CM, fillToDistance(fillPct)),
    );

    next[cfg.binId] = {
      deviceId: cfg.deviceId,
      distanceCm: Math.round(distanceCm * 10) / 10,
      sensorOk: true,
      rssi: -55 - Math.round(Math.random() * 15),
      uptimeSec: Math.round((now % 86_400_000) / 1000),
      firmware: 'sim-2.0.0',
      timestamp: now,
    };
  }

  return next;
}
