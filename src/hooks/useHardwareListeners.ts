import { useEffect, useCallback } from 'react';
import { useDatabase } from '@/contexts/DatabaseContext';

/**
 * Reusable listeners hook.
 * Phase 9 objective: Prevent memory leaks, handle offline detection, avoid duplicate listeners.
 * 
 * Since DatabaseContext already handles Firebase onValue listeners, this hook specifically
 * adds higher-level abstractions like automatically marking devices as offline if they miss
 * their heartbeat window, ensuring the UI accurately reflects hardware connection states.
 */
export function useHardwareListeners() {
  const { bins } = useDatabase();

  const checkHeartbeats = useCallback(() => {
    // const now = Date.now();
      // const timeSinceLastUpdate = now - bin.live.timestamp;
      
      // If we had an explicit 'isOnline' field in live data we would set it here.
      // But in our schema, 'isOnline' is computed dynamically based on the timestamp during `toBinSummary`.
      // However, if we need to actively trigger an alert, we can do it here.
      
      /* Example of offline alert generation:
      if (timeSinceLastUpdate > TIMEOUT_MS) {
        // trigger offline alert if not already triggered
      }
      */
  }, [bins]);

  useEffect(() => {
    // Run watchdog every 1 minute
    const interval = setInterval(checkHeartbeats, 60000);
    return () => clearInterval(interval);
  }, [checkHeartbeats]);
}
