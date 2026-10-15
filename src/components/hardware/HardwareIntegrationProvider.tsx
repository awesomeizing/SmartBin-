import React, { useEffect } from 'react';
import { useHardwareSimulator } from '@/hooks/useHardwareSimulator';
import { useHardwareListeners } from '@/hooks/useHardwareListeners';
import { useFleetSimulator } from '@/hooks/useFleetSimulator';
import { useHardwareSerial } from '@/contexts/HardwareSerialContext';
import { useDatabase } from '@/contexts/DatabaseContext';

export function HardwareIntegrationProvider({ children }: { children: React.ReactNode }) {
  const { isConnected } = useHardwareSerial();
  const { setHardwareConnected } = useDatabase();

  useEffect(() => {
    if (isConnected) {
      setHardwareConnected(true);
    }
  }, [isConnected, setHardwareConnected]);

  // Mount the simulator and global watchdog listeners here
  useHardwareSimulator(true);
  useHardwareListeners();
  useFleetSimulator(true);

  return <>{children}</>;
}

