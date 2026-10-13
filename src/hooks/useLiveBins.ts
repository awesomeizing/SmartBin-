// ─────────────────────────────────────────────────────────────
// SmartBin+ — LIVE BIN STATE
// ─────────────────────────────────────────────────────────────
// Subscribes to physical device telemetry and produces the canonical
// LiveBinState[] that the whole application renders from.
//
// Two things drive a re-render:
//   1. New telemetry arriving from Firebase (push, not polling).
//   2. A one-second clock tick, so a device that STOPS talking transitions
//      to OFFLINE on its own. Without the tick a dead bin would sit on
//      screen showing its last reading forever, because no event ever
//      arrives to say "nothing arrived".
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react';
import { onValue, ref as dbRef } from 'firebase/database';
import { db } from '@/lib/firebase';
import { IS_FIREBASE_CONFIGURED, IS_SIMULATION } from '@/config/mode';
import { LIVENESS_TICK_MS, PHYSICAL_BINS } from '@/config/devices.config';
import {
  calculateFleetStats,
  normaliseAllBins,
  type FleetStats,
  type LiveBinState,
  type RawTelemetry,
} from '@/lib/telemetry';
import { createSimulatedTelemetry } from '@/services/telemetry/simulator';

export interface UseLiveBinsResult {
  bins: LiveBinState[];
  stats: FleetStats;
  /** True until the first snapshot (or simulator tick) has landed. */
  loading: boolean;
  /** Transport-level error, e.g. permission denied on the database. */
  error: string | null;
}

export function useLiveBins(): UseLiveBinsResult {
  const [telemetry, setTelemetry] = useState<Record<string, RawTelemetry | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Clock tick — drives online → offline transitions with no new data.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), LIVENESS_TICK_MS);
    return () => clearInterval(id);
  }, []);

  // ── Simulation mode ──────────────────────────────────────
  const simStateRef = useRef<Record<string, RawTelemetry>>({});

  useEffect(() => {
    if (!IS_SIMULATION) return;

    const tick = () => {
      simStateRef.current = createSimulatedTelemetry(simStateRef.current);
      setTelemetry({ ...simStateRef.current });
      setLoading(false);
    };

    tick();
    const id = setInterval(tick, 3000);
    return () => clearInterval(id);
  }, []);

  // ── Real mode: Firebase Realtime Database ────────────────
  useEffect(() => {
    if (IS_SIMULATION) return;

    if (!IS_FIREBASE_CONFIGURED) {
      setError(
        'Firebase is not configured. Set VITE_FIREBASE_* in your .env file — ' +
          'see README for the required values.',
      );
      setLoading(false);
      return;
    }

    const unsubscribe = onValue(
      dbRef(db, 'bins'),
      (snapshot) => {
        const raw = (snapshot.val() ?? {}) as Record<string, { live?: RawTelemetry }>;

        // Driven by the registry, not by whatever the database happens to
        // contain: an unregistered bin ID in the database is ignored, and a
        // registered bin missing from it still shows as "waiting".
        const next: Record<string, RawTelemetry | null> = {};
        for (const cfg of PHYSICAL_BINS) {
          next[cfg.binId] = raw[cfg.binId]?.live ?? null;
        }

        setTelemetry(next);
        setError(null);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  // ── Normalise ────────────────────────────────────────────
  const bins = useMemo(() => normaliseAllBins(telemetry, now), [telemetry, now]);
  const stats = useMemo(() => calculateFleetStats(bins), [bins]);

  return { bins, stats, loading, error };
}
