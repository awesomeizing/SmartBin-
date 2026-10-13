// ─────────────────────────────────────────────────────────────
// SmartBin+ — PHYSICAL DEVICE REGISTRY
// ─────────────────────────────────────────────────────────────
// THE single source of truth for the four physical SmartBins.
//
// Everything downstream — dashboard, map, alerts, charts, statistics,
// firmware documentation — reads from this file. Nothing else may
// hard-code a bin ID, a GPIO number, a threshold, or a timeout.
//
// If you add a fifth physical bin, you add it HERE and nowhere else.
// ─────────────────────────────────────────────────────────────

// ── Sensor calibration ─────────────────────────────────────
// Two-point calibration of the HC-SR04 mounted in the bin lid.
//
//   EMPTY_DISTANCE_CM — sensor-to-floor distance when the bin is empty
//   FULL_DISTANCE_CM  — sensor-to-waste distance when the bin is full
//
// These are measured values for the physical prototype, not the bin's
// geometric depth. The sensor sits below the lid, so the usable span is
// 11 cm → 3 cm, an 8 cm travel.

export const EMPTY_DISTANCE_CM = 11;
export const FULL_DISTANCE_CM = 3;

/** Usable sensing span in cm. Derived — never hard-code 8. */
export const SENSING_SPAN_CM = EMPTY_DISTANCE_CM - FULL_DISTANCE_CM;

// ── Thresholds ─────────────────────────────────────────────
// Shared by the web app AND the ESP32 firmware. A dashboard and a device
// that disagree about what "full" means is worse than either being wrong.

/** Collection threshold. At or above this the bin is FULL. */
export const FULL_THRESHOLD_PCT = 80;

/** At or above this (and below FULL) the bin is FILLING. */
export const FILLING_THRESHOLD_PCT = 50;

// ── Device liveness ────────────────────────────────────────

/** How often the ESP32 is expected to transmit telemetry. */
export const TELEMETRY_INTERVAL_MS = Number(
  import.meta.env.VITE_TELEMETRY_INTERVAL_MS ?? 15_000,
);

/**
 * A device with no telemetry for longer than this is OFFLINE.
 *
 * Three missed transmissions plus a margin — long enough to survive one
 * dropped packet and a Wi-Fi reconnect, short enough that a dead bin shows
 * as dead within a minute.
 */
export const DEVICE_OFFLINE_TIMEOUT_MS = Number(
  import.meta.env.VITE_DEVICE_OFFLINE_TIMEOUT_MS ?? 50_000,
);

/** How often the UI re-evaluates liveness (clock tick, not a data fetch). */
export const LIVENESS_TICK_MS = 1_000;

// ── Sensor plausibility ────────────────────────────────────
// Readings outside this band are rejected as sensor faults rather than
// being clamped into a fake percentage. HC-SR04 datasheet range is
// 2–400 cm; anything beyond the bin's own geometry is noise.

export const SENSOR_MIN_VALID_CM = 1;
export const SENSOR_MAX_VALID_CM = 400;

// ── Shared hardware (one ESP32 drives all four bins) ───────

export const SHARED_HARDWARE = {
  /** Audible collection alert. Fires when ANY bin is at or above threshold. */
  buzzerGpio: 13,
  /** I²C bus feeding the TCA9548A multiplexer. */
  i2cSdaGpio: 16,
  i2cSclGpio: 17,
  /** TCA9548A 8-channel I²C multiplexer. */
  muxAddress: '0x70',
  /** All four displays are SSD1306 128×64 at the same address, hence the mux. */
  oledAddress: '0x3C',
  oledModel: 'SSD1306 128x64',
  sensorModel: 'HC-SR04',
} as const;

// ── Map ────────────────────────────────────────────────────

/**
 * Whether the four bins have been given real-world coordinates.
 *
 * FALSE until you fill in `location` below with surveyed lat/lng. While
 * false, the map says so plainly rather than presenting the model-city
 * layout as a real position.
 */
export const COORDINATES_CONFIGURED = false;

/**
 * Fallback map centre used until real coordinates are entered.
 * Global Academy of Technology, Bengaluru.
 */
export const DEFAULT_MAP_CENTER = { lat: 12.932, lng: 77.51 } as const;

// ── Types ──────────────────────────────────────────────────

/** Where a bin sits in the 12-block model city (see project plan). */
export interface GridPosition {
  /** Column in the model grid, 0-indexed from the depot side. */
  col: number;
  /** Row in the model grid, 0-indexed from the top. */
  row: number;
}

export interface PhysicalBinConfig {
  /** Stable database identity. Never an array index. */
  readonly binId: string;
  /** Human-readable name shown in the UI. */
  readonly label: string;
  /** The ESP32 that owns this bin's sensor. */
  readonly deviceId: string;
  /** Collection zone. */
  readonly zone: string;

  /** Hardware wiring — documentation for the UI, owned by the firmware. */
  readonly hardware: {
    readonly trigGpio: number;
    readonly echoGpio: number;
    readonly ledGpio: number;
    /** TCA9548A channel this bin's OLED hangs off. */
    readonly oledChannel: number;
  };

  /** Position in the 12-block model city. Always known. */
  readonly grid: GridPosition;

  /**
   * Surveyed real-world position. NULL until measured.
   * Enter real values here and flip COORDINATES_CONFIGURED to true.
   */
  readonly location: { lat: number; lng: number } | null;
}

// ── THE FOUR PHYSICAL BINS ─────────────────────────────────
//
// Wiring below is the hardware source of truth, mirrored in
// firmware/smartbin_esp32/config.h. Change one, change both.
//
// NOTE: GPIO 34 and 35 are input-only on the ESP32 — correct for ECHO,
// unusable for TRIG. The assignment below respects that.

export const PHYSICAL_BINS: readonly PhysicalBinConfig[] = [
  {
    binId: 'BIN-01',
    label: 'Bin 1',
    deviceId: 'ESP32-SMARTBIN-01',
    zone: 'Zone-A',
    hardware: { trigGpio: 5, echoGpio: 27, ledGpio: 26, oledChannel: 3 },
    grid: { col: 0, row: 1 },
    location: null,
  },
  {
    binId: 'BIN-02',
    label: 'Bin 2',
    deviceId: 'ESP32-SMARTBIN-02',
    zone: 'Zone-A',
    hardware: { trigGpio: 18, echoGpio: 34, ledGpio: 25, oledChannel: 1 },
    grid: { col: 1, row: 1 },
    location: null,
  },
  {
    binId: 'BIN-03',
    label: 'Bin 3',
    deviceId: 'ESP32-SMARTBIN-03',
    zone: 'Zone-A',
    hardware: { trigGpio: 19, echoGpio: 35, ledGpio: 4, oledChannel: 2 },
    grid: { col: 2, row: 1 },
    location: null,
  },
  {
    binId: 'BIN-04',
    label: 'Bin 4',
    deviceId: 'ESP32-SMARTBIN-04',
    zone: 'Zone-A',
    hardware: { trigGpio: 23, echoGpio: 32, ledGpio: 14, oledChannel: 0 },
    grid: { col: 0, row: 2 },
    location: null,
  },
] as const;

/** Depot position in the model city — route origin. */
export const DEPOT_GRID: GridPosition = { col: 0, row: 0 };

// ── Lookups ────────────────────────────────────────────────

export const BIN_IDS = PHYSICAL_BINS.map((b) => b.binId);
export const DEVICE_IDS = PHYSICAL_BINS.map((b) => b.deviceId);

const BY_BIN_ID = new Map(PHYSICAL_BINS.map((b) => [b.binId, b]));
const BY_DEVICE_ID = new Map(PHYSICAL_BINS.map((b) => [b.deviceId, b]));

export function getBinConfig(binId: string): PhysicalBinConfig | undefined {
  return BY_BIN_ID.get(binId);
}

export function getBinConfigByDevice(deviceId: string): PhysicalBinConfig | undefined {
  return BY_DEVICE_ID.get(deviceId);
}

/** Whether a bin ID belongs to a registered physical bin. */
export function isRegisteredBin(binId: string): boolean {
  return BY_BIN_ID.has(binId);
}

/** Whether a device ID is authorised to report for the given bin. */
export function isDeviceAuthorisedFor(deviceId: string, binId: string): boolean {
  return BY_DEVICE_ID.get(deviceId)?.binId === binId;
}
