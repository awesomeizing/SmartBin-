// ─────────────────────────────────────────────────────────────
// SmartBin+ Hardware Constants
// Single source of truth for all physical hardware configuration.
// These values match the real ESP32 prototype exactly.
// ─────────────────────────────────────────────────────────────

// ── Real Bin IDs ───────────────────────────────────────────
export const BIN_IDS = ['BIN-01', 'BIN-02', 'BIN-03', 'BIN-04'] as const;
export type BinId = (typeof BIN_IDS)[number];

/** Normalize various bin ID representations ('BIN-01', 'BIN-001', 'BIN-1', '1') */
export function normalizeBinId(id: string | null | undefined): BinId | null {
  if (!id) return null;
  const upper = id.toUpperCase().trim();
  if (upper === 'BIN-01' || upper === 'BIN-001' || upper === 'BIN-1' || upper === '1') return 'BIN-01';
  if (upper === 'BIN-02' || upper === 'BIN-002' || upper === 'BIN-2' || upper === '2') return 'BIN-02';
  if (upper === 'BIN-03' || upper === 'BIN-003' || upper === 'BIN-3' || upper === '3') return 'BIN-03';
  if (upper === 'BIN-04' || upper === 'BIN-004' || upper === 'BIN-4' || upper === '4') return 'BIN-04';
  return null;
}

// ── Sensor Distance Range ──────────────────────────────────
// Measured from the top of the bin lid to the waste surface.
// 11 cm = empty (sensor at top, waste at bottom)
// 3 cm  = full  (waste almost touching sensor)
export const EMPTY_DISTANCE_CM = 11; // cm → 0% full
export const FULL_DISTANCE_CM  = 3;  // cm → 100% full

// ── Fill Status Thresholds ─────────────────────────────────
// Match the OLED status terminology exactly.
export const STATUS_THRESHOLD_FILLING = 50; // 50–79 → FILLING
export const STATUS_THRESHOLD_FULL    = 80; // 80–100 → FULL

// ── Sensor Timeout ─────────────────────────────────────────
// If no telemetry is received within this window the bin is
// considered offline. Default: 3 minutes.
export const SENSOR_TIMEOUT_MS = 3 * 60 * 1000; // 3 min

// ── OLED Channel Mapping (TCA9548A) ───────────────────────
// Configurable: which TCA9548A channel drives each bin's OLED.
// Change here without touching any other file.
// Real hardware mappings: Bin 1 → ch 3, Bin 2 → ch 1, Bin 3 → ch 2, Bin 4 → ch 0
export const OLED_CHANNELS: Record<string, number> = {
  'BIN-01': 3,
  'BIN-02': 1,
  'BIN-03': 2,
  'BIN-04': 0,
  // Backward compatibility aliases
  'BIN-001': 3,
  'BIN-002': 1,
  'BIN-003': 2,
  'BIN-004': 0,
};

// ── GPIO Reference (documentation & firmware validation) ──
// Kept here so the full hardware config is in one place.
export const GPIO_CONFIG = {
  bins: {
    'BIN-01': { trig: 5,  echo: 27, led: 26 },
    'BIN-02': { trig: 18, echo: 34, led: 25 },
    'BIN-03': { trig: 19, echo: 35, led: 4  },
    'BIN-04': { trig: 23, echo: 32, led: 14 },
    // Aliases
    'BIN-001': { trig: 5,  echo: 27, led: 26 },
    'BIN-002': { trig: 18, echo: 34, led: 25 },
    'BIN-003': { trig: 19, echo: 35, led: 4  },
    'BIN-004': { trig: 23, echo: 32, led: 14 },
  },
  shared: {
    buzzer: 13,
    i2c_sda: 16,
    i2c_scl: 17,
    tca9548a_addr: 0x70,
    oled_addr: 0x3C,
  },
} as const;

// ── Display Names ──────────────────────────────────────────
export const BIN_DISPLAY_NAMES: Record<string, string> = {
  'BIN-01': 'Bin 1',
  'BIN-02': 'Bin 2',
  'BIN-03': 'Bin 3',
  'BIN-04': 'Bin 4',
  'BIN-001': 'Bin 1',
  'BIN-002': 'Bin 2',
  'BIN-003': 'Bin 3',
  'BIN-004': 'Bin 4',
};
