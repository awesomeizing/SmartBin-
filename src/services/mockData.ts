// ─────────────────────────────────────────────────────────────
// SmartBin+ Mock / Simulation Data Service
//
// ██████████████████████████████████████████████████████████
// ██  SIMULATION MODE ONLY — NOT REAL HARDWARE TELEMETRY  ██
// ██  This data is used ONLY when IS_DEMO_MODE is true.   ██
// ██  In production (Firebase configured), this file is   ██
// ██  never used. Real telemetry comes from the ESP32.    ██
// ██████████████████████████████████████████████████████████
//
// Mirrors the Firebase schema exactly so switching to live data
// requires zero UI changes. The four bins use their real IDs,
// display names, and the real 11cm→3cm fill formula.
// ─────────────────────────────────────────────────────────────

import type {
  Bin, BinSummary, Truck, Driver, Alert, Notification, CollectionEvent, TimelineEvent, DailyAnalytics, ZoneAnalytics,
  HistoryEntry, AppUser, AppConfig, AuditLogEntry, CollectionRoute
} from '@/types';
import { calculateFillPercent, getBinStatus } from '@/lib/calculations';
import {
  BIN_IDS,
  BIN_DISPLAY_NAMES,
  SENSOR_TIMEOUT_MS,
  EMPTY_DISTANCE_CM,
} from '@/constants/hardware';

// ── Helpers ────────────────────────────────────────────────

const now = Date.now();
const hour = 3600000;
const day = 86400000;

/** Controlled range random — no unbounded Math.random() in production paths */
function simRange(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 10) / 10;
}

function simInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Real Bin Locations ─────────────────────────────────────
//   Placed at provisional positions around GAT campus.
//   These are PLACEHOLDERS — update via Settings → Bins
//   once the physical bin positions have been surveyed.

interface BinLocation {
  label: string;
  zone: string;
  address: string;
  lat: number;
  lng: number;
  /** Controlled simulation distance (cm) — within 3–11 cm range */
  simDistanceCm: number;
}

const REAL_BIN_LOCATIONS: BinLocation[] = [
  {
    label: BIN_DISPLAY_NAMES['BIN-01'],
    zone: 'Zone-A',
    address: 'Main Entrance, Global Academy of Technology, Rajarajeshwari Nagar',
    lat: 12.96060, lng: 77.49000,
    simDistanceCm: 7.5, // ≈ 43.75% full
  },
  {
    label: BIN_DISPLAY_NAMES['BIN-02'],
    zone: 'Zone-A',
    address: 'Canteen Area, Global Academy of Technology',
    lat: 12.96145, lng: 77.49085,
    simDistanceCm: 3.5, // ≈ 93.75% full (FULL alert)
  },
  {
    label: BIN_DISPLAY_NAMES['BIN-03'],
    zone: 'Zone-B',
    address: 'CSE Block, Global Academy of Technology',
    lat: 12.95975, lng: 77.49130,
    simDistanceCm: 9.5, // ≈ 18.75% full
  },
  {
    label: BIN_DISPLAY_NAMES['BIN-04'],
    zone: 'Zone-B',
    address: 'Hostel Block, Global Academy of Technology',
    lat: 12.96020, lng: 77.48890,
    simDistanceCm: 5.0, // ≈ 75% full
  },
];

// ── Generate Bins ──────────────────────────────────────────
// Uses real bin IDs (BIN-01 … BIN-04) and the real fill formula.

function generateBins(): Bin[] {
  return BIN_IDS.map((id, i) => {
    const loc = REAL_BIN_LOCATIONS[i];
    const distanceCm = loc.simDistanceCm;

    // Use the SINGLE authoritative fill formula — same as hardware
    const fillPct = calculateFillPercent(distanceCm);
    const binStatus = getBinStatus(fillPct);

    // In simulation all bins start online so the UI is fully populated
    const lastSeen = now - simInt(0, 60) * 1000; // 0–60 seconds ago

    return {
      id,
      meta: {
        binId: id,
        label: loc.label,
        zone: loc.zone,
        address: loc.address,
        location: { lat: loc.lat, lng: loc.lng, source: 'manual' },
        // depthCm is kept for schema compatibility but is not used in fill calculation
        depthCm: EMPTY_DISTANCE_CM,
        thresholdPct: 80,
        source: 'simulated' as const,
        installedAt: now - simInt(30, 180) * day,
        capacity: 240, // standardised 240L for the prototype
      },
      live: {
        distanceCm,
        fillPct,
        binStatus,
        messageStatus: 'Delivered',
        rssi: simInt(-70, -40),
        batteryPct: simRange(55, 100),
        uptimeSec: simInt(3600, 432000),
        firmware: '2.1.4',
        timestamp: lastSeen,
      },
      health: {
        sensorOk: true,
        wifiOk: true,
        ledOk: true,
        buzzerOk: true,
        oledOk: true,
        healthScore: simInt(85, 100),
        lastMaintenance: now - simInt(7, 60) * day,
      },
      reserved: {
        temperatureC: simRange(24, 35),
        humidityPct: simRange(45, 75),
        gasPpm: null,
      },
    };
  });
}

// ── Generate Drivers ───────────────────────────────────────

const MOCK_DRIVERS: Driver[] = [
  { id: 'DRV-001', name: 'Rajesh Kumar',    phone: '+91 98765 43210', email: 'rajesh@smartbin.io',   licenseNumber: 'KA-01-2021-0042', status: 'on_duty' },
  { id: 'DRV-002', name: 'Suresh Babu',     phone: '+91 98765 43211', email: 'suresh@smartbin.io',   licenseNumber: 'KA-01-2020-0118', status: 'on_duty' },
];

// ── Generate Trucks ────────────────────────────────────────

function generateTrucks(): Truck[] {
  return [
    {
      id: 'TRK-001', label: 'Collection Vehicle 1', plateNumber: 'KA-01-AB-1234', status: 'collecting',
      position: { lat: 12.96060, lng: 77.49000 },
      assignedRoute: [...BIN_IDS],
      capacityLiters: 5000, currentLoadLiters: 960, fuelLevelPct: 72, driver: MOCK_DRIVERS[0],
      todayCollections: 3, totalKmToday: 12.4,
      lastMaintenance: now - 15 * day, model: 'Tata LPT 1613 (Green)', year: 2023,
    },
    {
      id: 'TRK-002', label: 'Collection Vehicle 2', plateNumber: 'KA-01-CD-5678', status: 'idle',
      position: { lat: 12.96020, lng: 77.48890 },
      assignedRoute: [],
      capacityLiters: 8000, currentLoadLiters: 0, fuelLevelPct: 91, driver: MOCK_DRIVERS[1],
      todayCollections: 0, totalKmToday: 0,
      lastMaintenance: now - 8 * day, model: 'Ashok Leyland Ecomet', year: 2024,
    },
  ];
}

// ── Generate Collection Route ──────────────────────────────

function generateModelRoute(): CollectionRoute[] {
  return [{
    id: 'RTE-001',
    truckId: 'TRK-001',
    stops: BIN_IDS.map((id, i) => ({
      binId: id,
      binLabel: BIN_DISPLAY_NAMES[id],
      location: { lat: REAL_BIN_LOCATIONS[i].lat, lng: REAL_BIN_LOCATIONS[i].lng },
      fillPct: calculateFillPercent(REAL_BIN_LOCATIONS[i].simDistanceCm),
      order: i + 1,
      collected: i === 0, // Bin 1 already collected in simulation
    })),
    optimizedKm: 2.1,
    traditionalKm: 3.4,
    savedKm: 1.3,
    fuelSavedL: 0.37,
    co2SavedKg: 0.99,
    createdAt: now - 2 * hour,
    completedAt: null,
    status: 'in_progress',
  }];
}

// ── Generate Alerts ────────────────────────────────────────
// Alerts are derived from the ACTUAL simulated bin states — no random types.

function generateAlerts(bins: Bin[]): Alert[] {
  const alerts: Alert[] = [];
  let idx = 1;

  for (const bin of bins) {
    const pct = bin.live.fillPct;

    if (pct >= 80) {
      alerts.push({
        id: `ALT-${String(idx++).padStart(3, '0')}`,
        binId: bin.id,
        binLabel: bin.meta.label,
        severity: 'critical',
        type: 'bin_full',
        message: `${bin.meta.label} (${bin.id}) is ${pct}% full — Collection Required`,
        raisedAt: now - 30 * 60 * 1000,
        acknowledgedBy: null,
        acknowledgedAt: null,
        resolvedAt: null,
        state: 'active',
      });
    } else if (pct >= 50) {
      alerts.push({
        id: `ALT-${String(idx++).padStart(3, '0')}`,
        binId: bin.id,
        binLabel: bin.meta.label,
        severity: 'warning',
        type: 'bin_full',
        message: `${bin.meta.label} (${bin.id}) is filling up at ${pct}%`,
        raisedAt: now - 2 * hour,
        acknowledgedBy: null,
        acknowledgedAt: null,
        resolvedAt: null,
        state: 'active',
      });
    }
  }

  // One resolved historical alert for BIN-01 (collected earlier today)
  alerts.push({
    id: `ALT-${String(idx++).padStart(3, '0')}`,
    binId: 'BIN-01',
    binLabel: BIN_DISPLAY_NAMES['BIN-01'],
    severity: 'critical',
    type: 'collection_completed',
    message: `${BIN_DISPLAY_NAMES['BIN-01']} was collected and reset to 0%`,
    raisedAt: now - 5 * hour,
    acknowledgedBy: 'admin@smartbin.io',
    acknowledgedAt: now - 4 * hour,
    resolvedAt: now - 4 * hour,
    state: 'resolved',
  });

  return alerts.sort((a, b) => b.raisedAt - a.raisedAt);
}

// ── Generate Notifications ─────────────────────────────────

function generateNotifications(alerts: Alert[]): Notification[] {
  return alerts.slice(0, 8).map((alert, i) => ({
    id: `NTF-${String(i + 1).padStart(3, '0')}`,
    title: alert.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    message: alert.message,
    type: alert.type,
    severity: alert.severity,
    timestamp: alert.raisedAt,
    read: i >= 3,
    binId: alert.binId,
    actionUrl: `/bins`,
  }));
}

// ── Generate Collection Events ─────────────────────────────
// Historical collections — 4 bins × a few collections each

function generateCollections(bins: Bin[]): CollectionEvent[] {
  const collections: CollectionEvent[] = [];
  const trucks = generateTrucks();
  let idx = 1;

  for (const bin of bins) {
    const numCollections = simInt(2, 5);
    for (let c = 0; c < numCollections; c++) {
      const truck = pickRandom(trucks.filter(t => t.driver !== null));
      collections.push({
        id: `COL-${String(idx++).padStart(3, '0')}`,
        binId: bin.id,
        binLabel: bin.meta.label,
        truckId: truck.id,
        truckLabel: truck.label,
        driverName: truck.driver?.name ?? 'Unknown',
        collectedAt: now - simInt(1, 120) * hour,
        fillLevelBefore: simInt(80, 100),
        fillLevelAfter: simInt(0, 5),
        wasteKg: simRange(15, 55),
        zone: bin.meta.zone,
      });
    }
  }

  return collections.sort((a, b) => b.collectedAt - a.collectedAt);
}

// ── Generate History (7 days) ──────────────────────────────
// History fills up from 0% then resets at collection.
// Uses the real fill formula in reverse: distance = EMPTY - (pct/100)*range.

function generateHistory(binId: string): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  // Each bin has a unique fill characteristic (BIN-02 fills fastest, BIN-03 slowest)
  const fillRateBase = binId.includes('02') ? 2.5 : binId.includes('04') ? 1.8 : binId.includes('03') ? 0.9 : 1.4;
  let fillPct = simRange(5, 20);

  for (let d = 6; d >= 0; d--) {
    for (let h = 0; h < 24; h++) {
      // Bin fills slowly throughout the day based on its rate
      fillPct += simRange(0, fillRateBase * 1.5);
      if (fillPct > 95) fillPct = simRange(0, 8); // collection reset
      if (fillPct < 0) fillPct = 0;

      const clampedFill = Math.min(100, Math.max(0, Math.round(fillPct)));
      // Reverse the real formula to get a consistent distance
      const distanceCm = parseFloat((11 - (clampedFill / 100) * 8).toFixed(1));

      entries.push({
        fillPct: clampedFill,
        distanceCm,
        binStatus: getBinStatus(clampedFill),
        timestamp: now - d * day - h * hour,
      });
    }
  }

  return entries;
}

// ── Generate Timeline Events ───────────────────────────────

function generateTimeline(bins: Bin[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  let idx = 0;

  // Real events based on actual simulated state
  for (const bin of bins) {
    if (bin.live.fillPct >= 80) {
      events.push({
        id: `EVT-${String(idx++).padStart(3, '0')}`,
        binId: bin.id,
        kind: 'THRESHOLD_REACHED',
        detail: `${bin.meta.label} reached critical fill level (${bin.live.fillPct}%)`,
        actor: 'system',
        timestamp: now - 30 * 60 * 1000,
      });
    }
    events.push({
      id: `EVT-${String(idx++).padStart(3, '0')}`,
      binId: bin.id,
      kind: 'SENSOR_UPDATE',
      detail: `${bin.meta.label}: ${bin.live.fillPct}% (${bin.live.distanceCm}cm)`,
      actor: `device:${bin.id}`,
      timestamp: now - simInt(0, 30) * 60 * 1000,
    });
  }

  events.push({
    id: `EVT-${String(idx++).padStart(3, '0')}`,
    binId: 'BIN-01',
    kind: 'COLLECTION_COMPLETED',
    detail: `${BIN_DISPLAY_NAMES['BIN-01']} collected by TRK-001`,
    actor: 'system',
    timestamp: now - 5 * hour,
  });

  events.push({
    id: `EVT-${String(idx++).padStart(3, '0')}`,
    kind: 'TRUCK_DISPATCHED',
    detail: 'Collection Vehicle 1 dispatched to Zone-A',
    actor: 'system',
    timestamp: now - 6 * hour,
  });

  return events.sort((a, b) => b.timestamp - a.timestamp);
}

// ── Generate Daily Analytics (7 days) ─────────────────────

function generateDailyAnalytics(): DailyAnalytics[] {
  const analytics: DailyAnalytics[] = [];

  for (let d = 6; d >= 0; d--) {
    const date = new Date(now - d * day);
    const dateStr = date.toISOString().split('T')[0];
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const baseFactor = isWeekend ? 0.6 : 1;

    analytics.push({
      date: dateStr,
      totalCollections: Math.round(simRange(2, 6) * baseFactor),
      totalWasteKg: Math.round(simRange(80, 200) * baseFactor),
      avgFillPct: simRange(30, 65),
      overflowCount: simInt(0, 1),
      avgResponseTimeMins: simRange(15, 40),
      fuelUsedL: simRange(3, 8),
      co2SavedKg: simRange(2, 8),
      efficiency: simRange(75, 96),
    });
  }

  return analytics;
}

// ── Generate Zone Analytics ────────────────────────────────

function generateZoneAnalytics(bins: Bin[]): ZoneAnalytics[] {
  const zones = ['Zone-A', 'Zone-B'];

  return zones.map(zone => {
    const zoneBins = bins.filter(b => b.meta.zone === zone);
    const avgFill = zoneBins.length > 0
      ? Math.round(zoneBins.reduce((s, b) => s + b.live.fillPct, 0) / zoneBins.length)
      : 0;

    return {
      zone,
      binCount: zoneBins.length,
      avgFillPct: avgFill,
      totalCollections: simInt(10, 30),
      totalWasteKg: simRange(200, 600),
      overflowRate: simRange(0, 5),
      efficiency: simRange(80, 96),
    };
  });
}

// ── App Config ─────────────────────────────────────────────

const MOCK_CONFIG: AppConfig = {
  defaultThresholdPct: 80,
  pollIntervalSec: 30,
  truckKmPerL: 3.5,
  co2KgPerL: 2.68,
  simulationMode: true, // ← explicitly SIMULATION MODE
};

// ── Users ──────────────────────────────────────────────────

const MOCK_USERS: AppUser[] = [
  { uid: 'usr-001', email: 'admin@smartbin.io',    displayName: 'Admin User',     role: 'administrator', zone: null,     createdAt: now - 180 * day, lastLogin: now - 2 * hour },
  { uid: 'usr-002', email: 'ops@smartbin.io',      displayName: 'Operations Lead', role: 'municipality',  zone: 'Zone-A', createdAt: now - 90 * day,  lastLogin: now - 5 * hour },
];

// ── Audit Logs ─────────────────────────────────────────────

function generateAuditLogs(): AuditLogEntry[] {
  const actions = [
    { action: 'LOGIN',            resource: 'auth',     detail: 'User logged in successfully' },
    { action: 'ACKNOWLEDGE_ALERT', resource: 'alert',   detail: 'Alert acknowledged' },
    { action: 'DISPATCH_TRUCK',   resource: 'truck',    detail: 'Truck dispatched for collection' },
    { action: 'UPDATE_SETTINGS',  resource: 'settings', detail: 'Notification preferences updated' },
    { action: 'EXPORT_REPORT',    resource: 'report',   detail: 'Analytics report exported' },
  ];

  return Array.from({ length: 15 }, (_, i) => {
    const user = pickRandom(MOCK_USERS);
    const action = pickRandom(actions);
    return {
      id: `AUD-${String(i + 1).padStart(3, '0')}`,
      userId: user.uid,
      userName: user.displayName,
      action: action.action,
      resource: action.resource,
      resourceId: `RES-${simInt(100, 999)}`,
      details: action.detail,
      timestamp: now - simInt(0, 168) * hour,
    };
  }).sort((a, b) => b.timestamp - a.timestamp);
}

// ── Main Export ────────────────────────────────────────────

/** Singleton-cached simulation data. Same references across the app. */
let _cache: ReturnType<typeof createMockData> | null = null;

function createMockData() {
  const bins = generateBins();
  const trucks = generateTrucks();
  const alerts = generateAlerts(bins);
  const notifications = generateNotifications(alerts);
  const collections = generateCollections(bins);
  const timeline = generateTimeline(bins);
  const dailyAnalytics = generateDailyAnalytics();
  const zoneAnalytics = generateZoneAnalytics(bins);
  const auditLogs = generateAuditLogs();
  const routes = generateModelRoute();

  // History for all 4 real bins
  const history: Record<string, HistoryEntry[]> = {};
  bins.forEach(bin => {
    history[bin.id] = generateHistory(bin.id);
  });

  return {
    bins,
    trucks,
    routes,
    alerts,
    notifications,
    collections,
    timeline,
    dailyAnalytics,
    zoneAnalytics,
    history,
    config: MOCK_CONFIG,
    users: MOCK_USERS,
    auditLogs,
  };
}

export function getMockData(): {
  bins: Bin[];
  trucks: Truck[];
  routes: CollectionRoute[];
  alerts: Alert[];
  notifications: Notification[];
  collections: CollectionEvent[];
  timeline: TimelineEvent[];
  dailyAnalytics: DailyAnalytics[];
  zoneAnalytics: ZoneAnalytics[];
  history: Record<string, HistoryEntry[]>;
  config: AppConfig;
  users: AppUser[];
  auditLogs: AuditLogEntry[];
} {
  if (!_cache) {
    _cache = createMockData();
  }
  return _cache;
}

/** Convert a full Bin into a BinSummary for list/card views */
export function toBinSummary(bin: Bin): BinSummary {
  // Determine online based on sensor timeout (configurable)
  const isOnline = (Date.now() - bin.live.timestamp) < SENSOR_TIMEOUT_MS;

  return {
    id: bin.id,
    label: bin.meta.label,
    zone: bin.meta.zone,
    address: bin.meta.address,
    location: bin.meta.location,
    fillPct: bin.live.fillPct,
    distanceCm: bin.live.distanceCm,
    binStatus: bin.live.binStatus,
    batteryPct: bin.live.batteryPct,
    rssi: bin.live.rssi,
    source: bin.meta.source,
    lastUpdate: bin.live.timestamp,
    isOnline,
    temperatureC: bin.reserved.temperatureC,
    humidityPct: bin.reserved.humidityPct,
    healthScore: bin.health.healthScore,
    thresholdPct: bin.meta.thresholdPct,
  };
}

/** Reset simulation data (for testing / dev mode) */
export function resetMockData() {
  _cache = null;
}
