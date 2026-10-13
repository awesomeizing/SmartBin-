import { IS_DEMO_MODE, db } from '@/lib/firebase';
import { ref as dbRef, update as dbUpdate, push as dbPush, set as dbSet } from 'firebase/database';
import type { BinLive, BinHealth, BinReserved, AlertType, AlertSeverity } from '@/types';

/**
 * Core interface for the Hardware Integration Layer (HIL).
 * Translates device-level operations into Firebase paths.
 */
class HardwareIntegrationService {
  /**
   * Updates telemetry data for a specific bin.
   * Path: /bins/{binId}/live
   */
  async updateTelemetry(binId: string, data: Partial<BinLive>) {
    if (IS_DEMO_MODE) {
      // In Demo Mode, the simulator will route this via DatabaseContext to avoid bypassing state
      return;
    }
    const updatePayload = {
      ...data,
      timestamp: Date.now(),
    };
    await dbUpdate(dbRef(db, `bins/${binId}/live`), updatePayload);
  }

  /**
   * Updates health diagnostics for a specific bin.
   * Path: /bins/{binId}/health
   */
  async updateHealth(binId: string, data: Partial<BinHealth>) {
    if (IS_DEMO_MODE) return;
    await dbUpdate(dbRef(db, `bins/${binId}/health`), data);
  }

  /**
   * Updates environmental sensors.
   * Path: /bins/{binId}/reserved
   */
  async updateSensors(binId: string, data: Partial<BinReserved>) {
    if (IS_DEMO_MODE) return;
    await dbUpdate(dbRef(db, `bins/${binId}/reserved`), data);
  }

  /**
   * Sends a heartbeat to update the lastSeen timestamp.
   * Path: /bins/{binId}/live/timestamp
   */
  async heartbeat(binId: string, uptimeSec: number, batteryPct: number) {
    if (IS_DEMO_MODE) return;
    await dbUpdate(dbRef(db, `bins/${binId}/live`), {
      timestamp: Date.now(),
      uptimeSec,
      batteryPct,
    });
  }

  /**
   * Logs a device event.
   * Path: /logs/{binId}/{pushId}
   */
  async logEvent(binId: string, type: string, message: string) {
    if (IS_DEMO_MODE) {
      console.log(`[DEVICE LOG: ${binId}] [${type}] ${message}`);
      return;
    }
    const logRef = dbPush(dbRef(db, `logs/${binId}`));
    await dbSet(logRef, {
      type,
      message,
      timestamp: Date.now(),
    });
  }

  /**
   * Triggers a global alert.
   * Path: /alerts/{pushId}
   */
  async triggerAlert(binId: string, binLabel: string, type: AlertType, severity: AlertSeverity, message: string) {
    if (IS_DEMO_MODE) return;
    
    const alertRef = dbPush(dbRef(db, `alerts`));
    await dbSet(alertRef, {
      binId,
      binLabel,
      severity,
      type,
      message,
      raisedAt: Date.now(),
      acknowledgedBy: null,
      acknowledgedAt: null,
      resolvedAt: null,
      state: 'active',
    });
  }

  /**
   * Authoritative backend/service handler for raw telemetry payload.
   * Conforms to Section 9 & 28 of SmartBin 4-bin specifications:
   * Converts distanceCm to fillPercentage using shared 11cm → 3cm calibration.
   */
  processRawTelemetry(payload: { binId: string; distanceCm: number; timestamp?: number }) {
    const rawDist = Number(payload.distanceCm);
    const distanceCm = isNaN(rawDist) ? 11 : Math.max(3, Math.min(11, rawDist));
    // Shared formula: fillPercentage = ((11 - distance) / 8) * 100
    const rawPct = ((11 - distanceCm) / 8) * 100;
    const fillPercentage = Math.round(Math.max(0, Math.min(100, rawPct)) * 10) / 10;
    const status = fillPercentage >= 80 ? 'FULL' : fillPercentage >= 50 ? 'FILLING' : 'OK';

    return {
      success: true,
      bin: {
        id: payload.binId,
        distanceCm,
        fillPercentage,
        status,
        sensorOnline: true,
        timestamp: payload.timestamp || Date.now(),
      },
    };
  }
}

export const HardwareService = new HardwareIntegrationService();
