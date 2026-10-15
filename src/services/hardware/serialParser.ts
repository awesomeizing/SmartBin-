import { normalizeBinId, type BinId } from '@/constants/hardware';
import { calculateFillPercent, getBinStatus } from '@/lib/calculations';
import type { BinStatus } from '@/types';

export interface ParsedReading {
  binId: BinId;
  distanceCm: number;
  fillPct: number;
  binStatus: BinStatus;
  rawString: string;
  sensorOk: boolean;
  timestamp: number;
}

/**
 * Parses raw serial lines coming from the ESP32 firmware into structured readings.
 * Supports multiple formats:
 * 1. Compact multi-bin: "B1:44 B2:4 B3:0 B4:15"
 * 2. Key-value pairs: "B1=44.2, B2=3.1" or "BIN-01: 6.8"
 * 3. Formatted status: "BIN-001 Full distance=3.20cm fill=97.5%"
 * 4. JSON packets: {"binId": "BIN-01", "distanceCm": 6.8} or {"B1": 44, "B2": 4, ...}
 */
export function parseSerialLine(line: string): ParsedReading[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  const results: ParsedReading[] = [];
  const now = Date.now();

  // Try parsing as JSON first
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const data = JSON.parse(trimmed);
      
      // Case A: Single bin payload {"binId":"BIN-01","distanceCm":6.8}
      if (data.binId || data.deviceId || data.id) {
        const rawId = data.binId || data.id || (data.deviceId ? data.deviceId.replace('ESP32-SMARTBIN-', 'BIN-') : null);
        const normId = normalizeBinId(rawId);
        const dist = Number(data.distanceCm ?? data.distance);
        if (normId && Number.isFinite(dist)) {
          const fill = calculateFillPercent(dist);
          results.push({
            binId: normId,
            distanceCm: Math.round(dist * 10) / 10,
            fillPct: fill,
            binStatus: getBinStatus(fill),
            rawString: trimmed,
            sensorOk: dist >= 2 && dist <= 400,
            timestamp: now,
          });
          return results;
        }
      }

      // Case B: Multi-bin JSON {"B1": 44, "B2": 3, "B3": 0, "B4": 15}
      for (const [key, val] of Object.entries(data)) {
        const normId = normalizeBinId(key.startsWith('B') ? `BIN-0${key.substring(1)}` : key);
        const dist = Number(val);
        if (normId && Number.isFinite(dist)) {
          const fill = calculateFillPercent(dist);
          results.push({
            binId: normId,
            distanceCm: Math.round(dist * 10) / 10,
            fillPct: fill,
            binStatus: getBinStatus(fill),
            rawString: trimmed,
            sensorOk: dist >= 2 && dist <= 400,
            timestamp: now,
          });
        }
      }
      if (results.length > 0) return results;
    } catch {
      // Not JSON, fall through to regex parsing
    }
  }

  // Case C: Formatted status "BIN-001 ... distance=3.20cm fill=97.5%"
  const distanceMatch = trimmed.match(/BIN-?0*([1-4])\b.*?distance\s*[:=]\s*([\d.]+)/i);
  if (distanceMatch) {
    const binNum = distanceMatch[1];
    const normId = normalizeBinId(`BIN-0${binNum}`);
    const dist = parseFloat(distanceMatch[2]);
    if (normId && Number.isFinite(dist)) {
      const fill = calculateFillPercent(dist);
      results.push({
        binId: normId,
        distanceCm: Math.round(dist * 10) / 10,
        fillPct: fill,
        binStatus: getBinStatus(fill),
        rawString: trimmed,
        sensorOk: dist >= 2 && dist <= 400,
        timestamp: now,
      });
      return results;
    }
  }

  // Case D: Multi-bin format: "B1:44 B2:3 B3:0 B4:15" or "B1=44 B2=3"
  const bPattern = /B([1-4])\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)/gi;
  let match: RegExpExecArray | null;
  while ((match = bPattern.exec(trimmed)) !== null) {
    const binNum = match[1];
    const normId = normalizeBinId(`BIN-0${binNum}`);
    const dist = parseFloat(match[2]);
    if (normId && Number.isFinite(dist)) {
      const fill = calculateFillPercent(dist);
      results.push({
        binId: normId,
        distanceCm: Math.round(dist * 10) / 10,
        fillPct: fill,
        binStatus: getBinStatus(fill),
        rawString: match[0],
        // Distance 0 usually indicates echo timeout / out of sensor range on HC-SR04
        sensorOk: dist >= 2 && dist <= 400,
        timestamp: now,
      });
    }
  }

  return results;
}
