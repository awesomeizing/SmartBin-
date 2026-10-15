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
  rssi?: number | null;
  batteryPct?: number | null;
  uptimeSec?: number | null;
  firmware?: string;
}

function createReading(
  binId: BinId,
  dist: number,
  raw: string,
  now: number,
  sensorOk: boolean = true,
  extra?: { rssi?: number | null; batteryPct?: number | null; uptimeSec?: number | null; firmware?: string }
): ParsedReading {
  const roundedDist = Math.round(dist * 10) / 10;
  const fill = calculateFillPercent(roundedDist);
  return {
    binId,
    distanceCm: roundedDist,
    fillPct: fill,
    binStatus: getBinStatus(fill),
    rawString: raw,
    sensorOk: sensorOk && dist >= 2 && dist <= 400,
    timestamp: now,
    rssi: extra?.rssi ?? null,
    batteryPct: extra?.batteryPct ?? null,
    uptimeSec: extra?.uptimeSec ?? null,
    firmware: extra?.firmware,
  };
}

/**
 * Parses raw serial lines coming from the ESP32 firmware into structured readings.
 * Supports multiple formats:
 * 1. Firmware primary: "[sense] BIN-01: 7.2 cm → 47.5% (OK)" or "[sense] BIN-01: 7.2 cm"
 * 2. Alternative firmware: "BIN-001 Full distance=3.20cm fill=97.5%"
 * 3. Compact multi-bin: "B1:44 B2:4 B3:0 B4:15" or "B1=44.2, B2=3.1"
 * 4. Single-bin stream: "[sense] 6.8 cm -> 52.5% (FILLING)" (defaults to BIN-01)
 * 5. Sensor faults: "[sense] FAULT: BIN-01" or "[sense] no valid reading - sensor fault"
 * 6. JSON objects and arrays:
 *    {"binId": "BIN-01", "distanceCm": 6.8}
 *    [{"binId": "BIN-01", "distanceCm": 6.8}, ...]
 *    {"B1": 44, "B2": 4, "B3": 0, "B4": 15}
 */
export function parseSerialLine(line: string): ParsedReading[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  const results: ParsedReading[] = [];
  const now = Date.now();

  // ── 1. Try parsing JSON (objects or arrays) ──────────────────────────────
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      const data = JSON.parse(trimmed);

      // 1A. Array of readings: [{"binId": "BIN-01", "distanceCm": 6.8}, ...]
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item && typeof item === 'object') {
            const rawId = item.binId || item.id || (item.deviceId ? String(item.deviceId).replace('ESP32-SMARTBIN-', 'BIN-') : null);
            const normId = normalizeBinId(rawId);
            const dist = Number(item.distanceCm ?? item.distance);
            if (normId && Number.isFinite(dist)) {
              results.push(createReading(normId, dist, trimmed, now, true, item));
            }
          }
        }
        if (results.length > 0) return results;
      }

      // 1B. Wrapper object: {"readings": [...]} or {"data": [...]}
      const list = data.readings || data.data;
      if (Array.isArray(list)) {
        for (const item of list) {
          if (item && typeof item === 'object') {
            const rawId = item.binId || item.id || (item.deviceId ? String(item.deviceId).replace('ESP32-SMARTBIN-', 'BIN-') : null);
            const normId = normalizeBinId(rawId);
            const dist = Number(item.distanceCm ?? item.distance);
            if (normId && Number.isFinite(dist)) {
              results.push(createReading(normId, dist, trimmed, now, true, item));
            }
          }
        }
        if (results.length > 0) return results;
      }

      // 1C. Single bin payload: {"binId": "BIN-01", "distanceCm": 6.8}
      if (data.binId || data.deviceId || data.id) {
        const rawId = data.binId || data.id || (data.deviceId ? String(data.deviceId).replace('ESP32-SMARTBIN-', 'BIN-') : null);
        const normId = normalizeBinId(rawId);
        const dist = Number(data.distanceCm ?? data.distance);
        if (normId && Number.isFinite(dist)) {
          results.push(createReading(normId, dist, trimmed, now, true, data));
          return results;
        }
      }

      // 1D. Multi-bin key-value JSON: {"B1": 44, "B2": 4} or {"BIN-01": 7.2} or {"BIN-01": { "distanceCm": 7.2 }}
      for (const [key, val] of Object.entries(data)) {
        const keyUpper = key.toUpperCase().trim();
        const candidateId = keyUpper.startsWith('B') && !keyUpper.startsWith('BIN')
          ? `BIN-0${keyUpper.substring(1)}`
          : keyUpper;
        const normId = normalizeBinId(candidateId);

        let dist: number | null = null;
        let extra: any = undefined;

        if (typeof val === 'number') {
          dist = val;
        } else if (typeof val === 'string' && Number.isFinite(Number(val))) {
          dist = Number(val);
        } else if (val && typeof val === 'object') {
          const obj = val as Record<string, any>;
          const d = Number(obj.distanceCm ?? obj.distance);
          if (Number.isFinite(d)) {
            dist = d;
            extra = obj;
          }
        }

        if (normId && dist !== null && Number.isFinite(dist)) {
          results.push(createReading(normId, dist, trimmed, now, true, extra));
        }
      }
      if (results.length > 0) return results;
    } catch {
      // Not valid JSON, continue to text patterns
    }
  }

  // ── 2. Hardware Fault Detection ──────────────────────────────────────────
  // Examples: "[sense] FAULT: BIN-01" or "[sense] no valid reading - sensor fault"
  if (/FAULT|ERROR/i.test(trimmed)) {
    const faultMatch = trimmed.match(/BIN-?0*([1-4])\b/i);
    const binNum = faultMatch ? faultMatch[1] : '1';
    const normId = normalizeBinId(`BIN-0${binNum}`) || 'BIN-01';
    return [{
      binId: normId,
      distanceCm: 11,
      fillPct: 0,
      binStatus: 'Empty',
      rawString: trimmed,
      sensorOk: false,
      timestamp: now,
    }];
  }

  // ── 3. Primary Firmware Format: "[sense] BIN-01: 7.2 cm → 47.5% (OK)" ───
  // Also matches: "BIN-01: 7.2 cm", "BIN-01 = 7.2cm", "BIN1: 7.2", etc.
  const firmwarePattern = /BIN-?0*([1-4])\b\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:cm)?/gi;
  let fwMatch: RegExpExecArray | null;
  while ((fwMatch = firmwarePattern.exec(trimmed)) !== null) {
    const binNum = fwMatch[1];
    const normId = normalizeBinId(`BIN-0${binNum}`);
    const dist = parseFloat(fwMatch[2]);
    if (normId && Number.isFinite(dist)) {
      results.push(createReading(normId, dist, fwMatch[0], now));
    }
  }
  if (results.length > 0) return results;

  // ── 4. Alternative Status Format: "BIN-001 Full distance=3.20cm fill=97.5%"
  const statusDistPattern = /BIN-?0*([1-4])\b.*?distance\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)/gi;
  let statusMatch: RegExpExecArray | null;
  while ((statusMatch = statusDistPattern.exec(trimmed)) !== null) {
    const binNum = statusMatch[1];
    const normId = normalizeBinId(`BIN-0${binNum}`);
    const dist = parseFloat(statusMatch[2]);
    if (normId && Number.isFinite(dist)) {
      results.push(createReading(normId, dist, statusMatch[0], now));
    }
  }
  if (results.length > 0) return results;

  // ── 5. Compact Multi-bin Format: "B1:44 B2:4 B3:0 B4:15" or "B1=44.2, B2=3.1"
  const compactPattern = /(?:^|[\s,;])B([1-4])\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)/gi;
  let cMatch: RegExpExecArray | null;
  while ((cMatch = compactPattern.exec(trimmed)) !== null) {
    const binNum = cMatch[1];
    const normId = normalizeBinId(`BIN-0${binNum}`);
    const dist = parseFloat(cMatch[2]);
    if (normId && Number.isFinite(dist)) {
      results.push(createReading(normId, dist, cMatch[0].trim(), now));
    }
  }
  if (results.length > 0) return results;

  // ── 6. Single-bin anonymous format: "[sense] 6.8 cm -> 52.5% (FILLING)" ───
  const singleMatch = trimmed.match(/(?:\[sense\]\s*)?([0-9]+(?:\.[0-9]+)?)\s*cm\s*(?:->|→)/i)
    || trimmed.match(/^\[sense\]\s*([0-9]+(?:\.[0-9]+)?)\s*cm/i);
  if (singleMatch) {
    const dist = parseFloat(singleMatch[1]);
    if (Number.isFinite(dist)) {
      return [createReading('BIN-01', dist, trimmed, now)];
    }
  }

  return [];
}
