import { useEffect, useRef } from 'react';
import { useDatabase } from '@/contexts/DatabaseContext';
import { HardwareService } from '@/services/hardware/HardwareServices';
import { calculateFillPercent, getBinStatus } from '@/lib/calculations';
import { EMPTY_DISTANCE_CM, FULL_DISTANCE_CM } from '@/constants/hardware';
import { IS_DEMO_MODE } from '@/lib/firebase';

/**
 * ████████████████████████████████████████████████████████████
 * ██  SIMULATION MODE — NOT REAL HARDWARE                    ██
 * ██                                                         ██
 * ██  This hook is only active when config.simulationMode    ██
 * ██  is true (i.e., IS_DEMO_MODE, no Firebase credentials). ██
 * ██                                                         ██
 * ██  It simulates slow fill-level drift using the REAL      ██
 * ██  11 cm → 3 cm sensor range and formula. All values      ██
 * ██  come from the authoritative calculateFillPercent()     ██
 * ██  function — never from Math.random() directly.          ██
 * ████████████████████████████████████████████████████████████
 *
 * Behaviour:
 *  - Advances `distanceCm` by a tiny step each cycle (sensor fills up).
 *  - When distance reaches FULL_DISTANCE_CM, resets to EMPTY (collection).
 *  - Each bin advances at a slightly different rate for realism.
 *  - NEVER picks a random new fill level — values are always derived from
 *    the real formula so the % displayed matches what a real sensor would give.
 */
export function useHardwareSimulator(enabled: boolean = true) {
  const { bins, updateBin, config } = useDatabase();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Per-bin drift rates in cm/cycle (different rates simulate different bins filling at different speeds)
  const DRIFT_RATE_CM_PER_CYCLE: Record<string, number> = {
    'BIN-01': 0.05,
    'BIN-02': 0.10, // Canteen — fills fastest
    'BIN-03': 0.03, // CSE — fills slowest
    'BIN-04': 0.07,
    'BIN-001': 0.05,
    'BIN-002': 0.10,
    'BIN-003': 0.03,
    'BIN-004': 0.07,
  };

  useEffect(() => {
    if (!enabled || !IS_DEMO_MODE || !config.simulationMode || bins.length === 0) return;

    // Simulation loop every 5 seconds
    timerRef.current = setInterval(() => {
      // Update all 4 bins each cycle (not random selection — avoids confusing the user)
      bins.forEach(bin => {
        const driftRate = DRIFT_RATE_CM_PER_CYCLE[bin.id] ?? 0.05;

        // Distance decreases as bin fills (waste rises toward sensor)
        let newDistance = bin.live.distanceCm - driftRate;

        // When full (distance <= FULL_DISTANCE_CM), simulate a collection reset
        if (newDistance <= FULL_DISTANCE_CM) {
          newDistance = EMPTY_DISTANCE_CM; // Collection event
          HardwareService.logEvent(bin.id, 'collection', `[SIM] ${bin.id} collected — reset to empty`);
        }

        // Clamp to valid sensor range
        newDistance = Math.max(FULL_DISTANCE_CM, Math.min(EMPTY_DISTANCE_CM, newDistance));
        newDistance = Math.round(newDistance * 10) / 10;

        // Use the SINGLE authoritative formula
        const newFillPct = calculateFillPercent(newDistance);
        const newStatus  = getBinStatus(newFillPct);

        const liveUpdate = {
          ...bin.live,
          distanceCm: newDistance,
          fillPct: newFillPct,
          binStatus: newStatus,
          timestamp: Date.now(),
        };

        updateBin(bin.id, { live: liveUpdate });

        // Log alerts when crossing the FULL threshold (80%)
        if (newFillPct >= 80 && bin.live.fillPct < 80) {
          HardwareService.logEvent(bin.id, 'threshold', `[SIM] ${bin.id} reached FULL threshold (${newFillPct}%)`);
        }
      });
    }, 5000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, bins, updateBin, config.simulationMode]);
}
