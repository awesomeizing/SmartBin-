import { useEffect, useCallback } from 'react';
import { useDatabase } from '@/contexts/DatabaseContext';
import { SENSOR_TIMEOUT_MS } from '@/constants/hardware';

/**
 * Watchdog hook to monitor bin heartbeats and connection states.
 */
export function useHardwareListeners() {
  const { bins } = useDatabase();

  const checkHeartbeats = useCallback(() => {
    const now = Date.now();
    bins.forEach(bin => {
      const timeSinceLastUpdate = now - (bin.live?.timestamp || 0);
      const isOnline = timeSinceLastUpdate < SENSOR_TIMEOUT_MS;
      if (!isOnline && (bin.live?.timestamp ?? 0) > 0) {
        // Heartbeat timeout condition
      }
    });
  }, [bins]);

  useEffect(() => {
    const interval = setInterval(checkHeartbeats, 30000);
    return () => clearInterval(interval);
  }, [checkHeartbeats]);
}
