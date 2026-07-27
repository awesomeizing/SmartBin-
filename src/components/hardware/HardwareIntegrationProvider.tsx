import React from 'react';
import { useHardwareSimulator } from '@/hooks/useHardwareSimulator';
import { useHardwareListeners } from '@/hooks/useHardwareListeners';
import { useFleetSimulator } from '@/hooks/useFleetSimulator';

export function HardwareIntegrationProvider({ children }: { children: React.ReactNode }) {
  // Mount the simulator and global watchdog listeners here
  useHardwareSimulator(true);
  useHardwareListeners();
  useFleetSimulator(true);

  return <>{children}</>;
}
