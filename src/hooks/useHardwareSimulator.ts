import { useEffect, useRef } from 'react';
import { useDatabase } from '@/contexts/DatabaseContext';
import { HardwareService } from '@/services/hardware/HardwareServices';
import type { BinStatus } from '@/types';
// Not strictly needed here but useful if calculating states

/**
 * A realistic ESP32 Hardware Simulator.
 * Runs only when IS_DEMO_MODE is true (via DatabaseContext).
 * Randomly modifies live telemetry data (fill level, battery drain, signal fluctuation).
 */
export function useHardwareSimulator(enabled: boolean = true) {
  const { bins, updateBin, config } = useDatabase();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled || !config.simulationMode || bins.length === 0) return;

    // Run simulator loop every 5 seconds
    timerRef.current = setInterval(() => {
      // Pick 2-4 random bins to update each cycle to simulate staggered reporting
      const numToUpdate = Math.floor(Math.random() * 3) + 2;
      const shuffled = [...bins].sort(() => 0.5 - Math.random());
      const selectedBins = shuffled.slice(0, numToUpdate);

      selectedBins.forEach(bin => {
        // Skip simulated bins that are currently 'offline' with 5% probability
        const isCurrentlyOffline = Date.now() - bin.live.timestamp > 300000;
        if (!isCurrentlyOffline && Math.random() < 0.05) {
          // Simulate offline by not updating timestamp
          return;
        }

        // --- Simulate Telemetry Drift ---
        
        // 1. Fill Level increases linearly with slight noise
        let newFillPct = bin.live.fillPct;
        if (newFillPct < 100 && Math.random() < 0.7) {
          newFillPct += Math.random() * 2; // +0 to 2%
        }
        if (newFillPct > 100) newFillPct = 100;

        // Simulate sudden drop (collection event)
        if (newFillPct > 90 && Math.random() < 0.2) {
          newFillPct = 0; // Truck collected it
        }

        const newDistanceCm = Math.max(10, bin.meta.depthCm * (1 - newFillPct / 100));

        let newStatus: BinStatus = 'Empty';
        if (newFillPct >= 80) newStatus = 'Full';
        else if (newFillPct >= 50) newStatus = 'Half';

        // 2. Battery drains very slowly
        let newBattery = bin.live.batteryPct;
        if (Math.random() < 0.1) {
          newBattery -= 0.1; 
        }
        if (newBattery <= 0) newBattery = 0;

        // 3. Signal Strength fluctuates
        const newRssi = -60 + Math.floor(Math.random() * 15 - 7.5);

        // 4. Environmental fluctuates
        let newTemp = bin.reserved.temperatureC;
        if (newTemp !== null) {
          newTemp += (Math.random() * 0.4 - 0.2);
        }

        // --- Execute Update ---
        const liveUpdate = {
          ...bin.live,
          fillPct: Math.round(newFillPct * 10) / 10,
          distanceCm: Math.round(newDistanceCm),
          binStatus: newStatus,
          batteryPct: Math.round(newBattery * 10) / 10,
          rssi: newRssi,
          timestamp: Date.now(),
        };

        const reservedUpdate = {
          ...bin.reserved,
          temperatureC: newTemp !== null ? Math.round(newTemp * 10) / 10 : null,
        };

        // Update via DatabaseContext which updates internal state
        updateBin(bin.id, {
          live: liveUpdate,
          reserved: reservedUpdate,
        });

        // Generate logs randomly
        if (Math.random() < 0.05) {
          HardwareService.logEvent(bin.id, 'telemetry', `Pushed update: ${Math.round(newFillPct)}%`);
        }

        // Trigger Alerts
        if (newBattery < 20 && bin.live.batteryPct >= 20) {
          HardwareService.triggerAlert(bin.id, bin.meta.label, 'battery_low', 'warning', `Battery dropped to ${Math.round(newBattery)}%`);
        }
        
      });
    }, 5000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, bins, updateBin, config.simulationMode]);
}
