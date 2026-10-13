import type { GeoLocation } from '@/types';

export interface HardwareBinConfig { id: string; deviceId: string; label: string; zone: string; address: string; location: GeoLocation; locationConfigured: boolean; depthCm: number; thresholdPct: number; }
const UNCONFIGURED_LOCATION: GeoLocation = { lat: 0, lng: 0, source: 'manual' };
export const HARDWARE_BINS: HardwareBinConfig[] = [
  { id:'BIN-01',deviceId:'ESP32-SMARTBIN-01',label:'Smart Bin 01',zone:'Zone-A',address:'Location not configured',location:UNCONFIGURED_LOCATION,locationConfigured:false,depthCm:11,thresholdPct:80 },
  { id:'BIN-02',deviceId:'ESP32-SMARTBIN-02',label:'Smart Bin 02',zone:'Zone-A',address:'Location not configured',location:UNCONFIGURED_LOCATION,locationConfigured:false,depthCm:11,thresholdPct:80 },
  { id:'BIN-03',deviceId:'ESP32-SMARTBIN-03',label:'Smart Bin 03',zone:'Zone-A',address:'Location not configured',location:UNCONFIGURED_LOCATION,locationConfigured:false,depthCm:11,thresholdPct:80 },
  { id:'BIN-04',deviceId:'ESP32-SMARTBIN-04',label:'Smart Bin 04',zone:'Zone-A',address:'Location not configured',location:UNCONFIGURED_LOCATION,locationConfigured:false,depthCm:11,thresholdPct:80 },
];
export const IOT_CONFIG = { EMPTY_DISTANCE_CM:11, FULL_DISTANCE_CM:3, OFFLINE_AFTER_MS:180_000, TELEMETRY_INTERVAL_MS:15_000 } as const;
