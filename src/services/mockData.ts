// ─────────────────────────────────────────────────────────────
// SmartBin+ Mock Data Service
// Rich, realistic mock data for 24 bins across Bengaluru.
// Mirrors the Firebase schema exactly so switching to live data
// requires zero UI changes.
// ─────────────────────────────────────────────────────────────

import type {
  Bin, BinSummary, Truck, Driver, Alert, Notification, CollectionEvent, TimelineEvent, DailyAnalytics, ZoneAnalytics,
  HistoryEntry, AppUser, AppConfig, AuditLogEntry, CollectionRoute
} from '@/types';

// ── Helpers ────────────────────────────────────────────────

const now = Date.now();
const hour = 3600000;
const day = 86400000;

function randomBetween(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 10) / 10;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Bengaluru Coordinates ──────────────────────────────────
// Spread around GAT Rajarajeshwari Nagar area

const BIN_LOCATIONS: Array<{ label: string; zone: string; address: string; lat: number; lng: number }> = [
  { label: 'GAT Main Gate',         zone: 'Zone-A', address: 'Dr. Vishnuvardhan Rd, RR Nagar', lat: 12.9606, lng: 77.4900 },
  { label: 'RR Nagar Bus Stop',     zone: 'Zone-A', address: 'Mysore Road, RR Nagar',          lat: 12.9580, lng: 77.4875 },
  { label: 'Nayandahalli Metro',    zone: 'Zone-A', address: 'Nayandahalli, RR Nagar',          lat: 12.9624, lng: 77.4932 },
  { label: 'BEML Layout Park',      zone: 'Zone-B', address: 'BEML Layout, RR Nagar',           lat: 12.9550, lng: 77.4850 },
  { label: 'Ideal Homes Township',  zone: 'Zone-B', address: 'Ideal Homes, RR Nagar',           lat: 12.9530, lng: 77.4910 },
  { label: 'Pattanagere Lake',      zone: 'Zone-B', address: 'Pattanagere, RR Nagar',           lat: 12.9565, lng: 77.4960 },
  { label: 'Kengeri Satellite',     zone: 'Zone-C', address: 'Kengeri, Bengaluru',              lat: 12.9140, lng: 77.4830 },
  { label: 'Uttarahalli Main',      zone: 'Zone-C', address: 'Uttarahalli, Bengaluru',          lat: 12.9210, lng: 77.5520 },
  { label: 'BSK 3rd Stage Market',  zone: 'Zone-C', address: 'BSK 3rd Stage, Bengaluru',        lat: 12.9250, lng: 77.5600 },
  { label: 'Girinagar Circle',      zone: 'Zone-D', address: 'Girinagar, Bengaluru',            lat: 12.9350, lng: 77.5450 },
  { label: 'Padmanabhanagar',       zone: 'Zone-D', address: 'Padmanabhanagar, Bengaluru',      lat: 12.9270, lng: 77.5560 },
  { label: 'JP Nagar 6th Phase',    zone: 'Zone-D', address: 'JP Nagar, Bengaluru',             lat: 12.9050, lng: 77.5850 },
  { label: 'Kumaraswamy Layout',    zone: 'Zone-E', address: 'Kumaraswamy Layout, Bengaluru',   lat: 12.9100, lng: 77.5700 },
  { label: 'Banashankari Temple',   zone: 'Zone-E', address: 'Banashankari, Bengaluru',         lat: 12.9180, lng: 77.5730 },
  { label: 'Kathriguppe Junction',  zone: 'Zone-A', address: 'Kathriguppe, Bengaluru',          lat: 12.9380, lng: 77.5500 },
  { label: 'Mysore Road Flyover',   zone: 'Zone-A', address: 'Mysore Road, Bengaluru',          lat: 12.9620, lng: 77.5100 },
  { label: 'Vijayanagar Circle',    zone: 'Zone-B', address: 'Vijayanagar, Bengaluru',          lat: 12.9700, lng: 77.5280 },
  { label: 'Chord Road Junction',   zone: 'Zone-B', address: 'Chord Road, Bengaluru',           lat: 12.9800, lng: 77.5400 },
  { label: 'Magadi Road Cross',     zone: 'Zone-C', address: 'Magadi Road, Bengaluru',          lat: 12.9750, lng: 77.5150 },
  { label: 'Nagarbhavi Circle',     zone: 'Zone-C', address: 'Nagarbhavi, Bengaluru',           lat: 12.9660, lng: 77.5080 },
  { label: 'BDA Complex',           zone: 'Zone-D', address: 'BDA Complex, Banashankari',       lat: 12.9280, lng: 77.5680 },
  { label: 'Jaraganahalli Cross',   zone: 'Zone-D', address: 'Jaraganahalli, JP Nagar',         lat: 12.8980, lng: 77.5870 },
  { label: 'Hulimavu Lake',         zone: 'Zone-E', address: 'Hulimavu, Bengaluru',             lat: 12.8880, lng: 77.5950 },
  { label: 'Electronic City Gate',  zone: 'Zone-E', address: 'Electronic City, Bengaluru',      lat: 12.8450, lng: 77.6600 },
];

// ── Generate Bins ──────────────────────────────────────────

function generateBins(): Bin[] {
  return BIN_LOCATIONS.map((loc, i) => {
    const id = `BIN-${String(i + 1).padStart(3, '0')}`;
    const fillPct = i === 0 ? randomBetween(30, 60) : randomBetween(5, 98);
    const isDevice = i === 0; // BIN-001 is the real hardware
    const isOnline = Math.random() > 0.08;
    const battery = randomBetween(15, 100);
    const rssi = randomInt(-85, -30);

    return {
      id,
      meta: {
        binId: id,
        label: loc.label,
        zone: loc.zone,
        address: loc.address,
        location: { lat: loc.lat, lng: loc.lng, source: 'manual' },
        depthCm: 20,
        thresholdPct: 80,
        source: isDevice ? 'device' : 'simulated',
        installedAt: now - randomInt(30, 365) * day,
        capacity: pickRandom([120, 240, 360]),
      },
      live: {
        distanceCm: parseFloat(((1 - fillPct / 100) * 20).toFixed(1)),
        fillPct,
        binStatus: fillPct >= 80 ? 'Full' : fillPct >= 51 ? 'Half' : 'Empty',
        messageStatus: 'Delivered',
        rssi,
        batteryPct: battery,
        uptimeSec: randomInt(3600, 864000),
        firmware: '1.0.0',
        timestamp: isOnline ? now - randomInt(0, 120) * 1000 : now - randomInt(600, 7200) * 1000,
      },
      health: {
        sensorOk: Math.random() > 0.05,
        wifiOk: isOnline,
        ledOk: true,
        buzzerOk: true,
        oledOk: Math.random() > 0.03,
        healthScore: randomInt(70, 100),
        lastMaintenance: now - randomInt(7, 90) * day,
      },
      reserved: {
        temperatureC: randomBetween(22, 38),
        humidityPct: randomBetween(40, 85),
        gasPpm: null,
      },
    };
  });
}

// ── Generate Drivers ───────────────────────────────────────

const MOCK_DRIVERS: Driver[] = [
  { id: 'DRV-001', name: 'Rajesh Kumar',    phone: '+91 98765 43210', email: 'rajesh@smartbin.io',   licenseNumber: 'KA-01-2021-0042', status: 'on_duty' },
  { id: 'DRV-002', name: 'Suresh Babu',     phone: '+91 98765 43211', email: 'suresh@smartbin.io',   licenseNumber: 'KA-01-2020-0118', status: 'on_duty' },
  { id: 'DRV-003', name: 'Anil Sharma',     phone: '+91 98765 43212', email: 'anil@smartbin.io',     licenseNumber: 'KA-01-2022-0067', status: 'available' },
  { id: 'DRV-004', name: 'Manoj Reddy',     phone: '+91 98765 43213', email: 'manoj@smartbin.io',    licenseNumber: 'KA-01-2019-0203', status: 'available' },
  { id: 'DRV-005', name: 'Prakash Gowda',   phone: '+91 98765 43214', email: 'prakash@smartbin.io',  licenseNumber: 'KA-01-2021-0155', status: 'off_duty' },
  { id: 'DRV-006', name: 'Venkatesh M',     phone: '+91 98765 43215', email: 'venkatesh@smartbin.io', licenseNumber: 'KA-01-2023-0031', status: 'on_duty' },
];

// ── Generate Trucks ────────────────────────────────────────

function generateTrucks(): Truck[] {
  return [
    {
      id: 'TRK-001', label: 'Hauler Alpha',   plateNumber: 'KA-01-AB-1234', status: 'en_route',
      position: { lat: 12.958, lng: 77.491 }, assignedRoute: ['BIN-001', 'BIN-002', 'BIN-003'],
      capacityLiters: 5000, currentLoadLiters: 1800, fuelLevelPct: 72, driver: MOCK_DRIVERS[0],
      todayCollections: 8, totalKmToday: 34.5, lastMaintenance: now - 15 * day, model: 'Tata LPT 1613', year: 2023,
    },
    {
      id: 'TRK-002', label: 'Hauler Beta',    plateNumber: 'KA-01-CD-5678', status: 'active',
      position: { lat: 12.925, lng: 77.556 }, assignedRoute: ['BIN-010', 'BIN-011', 'BIN-012'],
      capacityLiters: 8000, currentLoadLiters: 3200, fuelLevelPct: 55, driver: MOCK_DRIVERS[1],
      todayCollections: 12, totalKmToday: 48.2, lastMaintenance: now - 8 * day, model: 'Ashok Leyland Ecomet', year: 2024,
    },
    {
      id: 'TRK-003', label: 'Hauler Gamma',   plateNumber: 'KA-01-EF-9012', status: 'idle',
      position: { lat: 12.960, lng: 77.490 }, assignedRoute: [],
      capacityLiters: 5000, currentLoadLiters: 0, fuelLevelPct: 90, driver: MOCK_DRIVERS[2],
      todayCollections: 0, totalKmToday: 0, lastMaintenance: now - 3 * day, model: 'Tata LPT 1613', year: 2022,
    },
    {
      id: 'TRK-004', label: 'Hauler Delta',   plateNumber: 'KA-01-GH-3456', status: 'collecting',
      position: { lat: 12.910, lng: 77.570 }, assignedRoute: ['BIN-013', 'BIN-014'],
      capacityLiters: 6000, currentLoadLiters: 4100, fuelLevelPct: 42, driver: MOCK_DRIVERS[5],
      todayCollections: 15, totalKmToday: 62.1, lastMaintenance: now - 22 * day, model: 'Mahindra Furio 12', year: 2023,
    },
    {
      id: 'TRK-005', label: 'Hauler Epsilon', plateNumber: 'KA-01-IJ-7890', status: 'maintenance',
      position: { lat: 12.960, lng: 77.490 }, assignedRoute: [],
      capacityLiters: 5000, currentLoadLiters: 0, fuelLevelPct: 100, driver: null,
      todayCollections: 0, totalKmToday: 0, lastMaintenance: now - 1 * day, model: 'Tata LPT 1613', year: 2021,
    },
    {
      id: 'TRK-006', label: 'Hauler Zeta',    plateNumber: 'KA-01-KL-2345', status: 'en_route',
      position: { lat: 12.935, lng: 77.545 }, assignedRoute: ['BIN-015', 'BIN-016', 'BIN-017'],
      capacityLiters: 8000, currentLoadLiters: 2600, fuelLevelPct: 65, driver: MOCK_DRIVERS[3],
      todayCollections: 6, totalKmToday: 28.7, lastMaintenance: now - 12 * day, model: 'Ashok Leyland Ecomet', year: 2024,
    },
  ];
}

// ── Generate Alerts ────────────────────────────────────────

function generateAlerts(bins: Bin[]): Alert[] {
  const alerts: Alert[] = [];
  const types: Array<{ type: Alert['type']; severity: Alert['severity']; msgTemplate: (label: string) => string }> = [
    { type: 'bin_full',            severity: 'critical', msgTemplate: (l) => `${l} has reached critical fill level (>80%)` },
    { type: 'battery_low',         severity: 'warning',  msgTemplate: (l) => `${l} battery level is below 20%` },
    { type: 'sensor_offline',      severity: 'critical', msgTemplate: (l) => `${l} sensor has stopped responding` },
    { type: 'collection_completed', severity: 'info',    msgTemplate: (l) => `Collection completed at ${l}` },
    { type: 'truck_assigned',      severity: 'info',     msgTemplate: (l) => `Truck dispatched to ${l}` },
    { type: 'overflow',            severity: 'critical', msgTemplate: (l) => `${l} is overflowing — immediate action required` },
    { type: 'sensor_fault',        severity: 'warning',  msgTemplate: (l) => `${l} ultrasonic sensor returning invalid readings` },
  ];

  for (let i = 0; i < 18; i++) {
    const bin = pickRandom(bins);
    const template = pickRandom(types);
    const isActive = i < 6;
    const isAcknowledged = !isActive && i < 12;

    alerts.push({
      id: `ALT-${String(i + 1).padStart(3, '0')}`,
      binId: bin.id,
      binLabel: bin.meta.label,
      severity: template.severity,
      type: template.type,
      message: template.msgTemplate(bin.meta.label),
      raisedAt: now - randomInt(0, 48) * hour,
      acknowledgedBy: isAcknowledged ? 'admin@smartbin.io' : null,
      acknowledgedAt: isAcknowledged ? now - randomInt(0, 24) * hour : null,
      resolvedAt: (!isActive && !isAcknowledged) ? now - randomInt(0, 12) * hour : null,
      state: isActive ? 'active' : isAcknowledged ? 'acknowledged' : 'resolved',
    });
  }

  return alerts.sort((a, b) => b.raisedAt - a.raisedAt);
}

// ── Generate Notifications ─────────────────────────────────

function generateNotifications(alerts: Alert[]): Notification[] {
  return alerts.slice(0, 12).map((alert, i) => ({
    id: `NTF-${String(i + 1).padStart(3, '0')}`,
    title: alert.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    message: alert.message,
    type: alert.type,
    severity: alert.severity,
    timestamp: alert.raisedAt,
    read: i >= 5,
    binId: alert.binId,
    actionUrl: `/bins`,
  }));
}

// ── Generate Collection Events ─────────────────────────────

function generateCollections(bins: Bin[]): CollectionEvent[] {
  const collections: CollectionEvent[] = [];
  const trucks = generateTrucks();

  for (let i = 0; i < 35; i++) {
    const bin = pickRandom(bins);
    const truck = pickRandom(trucks.filter(t => t.driver !== null));

    collections.push({
      id: `COL-${String(i + 1).padStart(3, '0')}`,
      binId: bin.id,
      binLabel: bin.meta.label,
      truckId: truck.id,
      truckLabel: truck.label,
      driverName: truck.driver?.name ?? 'Unknown',
      collectedAt: now - randomInt(0, 168) * hour,
      fillLevelBefore: randomInt(75, 100),
      fillLevelAfter: randomInt(0, 5),
      wasteKg: randomBetween(15, 85),
      zone: bin.meta.zone,
    });
  }

  return collections.sort((a, b) => b.collectedAt - a.collectedAt);
}

// ── Generate History (30 days, 24 entries/day per bin) ──────

function generateHistory(_binId: string): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  let fillPct = randomBetween(5, 30);

  for (let d = 29; d >= 0; d--) {
    for (let h = 0; h < 24; h++) {
      fillPct += randomBetween(-3, 5);
      if (fillPct > 95) fillPct = randomBetween(0, 10); // collection happened
      if (fillPct < 0) fillPct = 0;

      entries.push({
        fillPct: Math.round(fillPct),
        distanceCm: parseFloat(((1 - fillPct / 100) * 20).toFixed(1)),
        binStatus: fillPct >= 80 ? 'Full' : fillPct >= 51 ? 'Half' : 'Empty',
        timestamp: now - d * day - h * hour,
      });
    }
  }

  return entries;
}

// ── Generate Timeline Events ───────────────────────────────

function generateTimeline(bins: Bin[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const kinds: Array<{ kind: TimelineEvent['kind']; detail: (bin: Bin) => string }> = [
    { kind: 'SENSOR_UPDATE',       detail: (b) => `Fill level updated to ${b.live.fillPct}%` },
    { kind: 'THRESHOLD_REACHED',   detail: (b) => `${b.meta.label} reached threshold (${b.live.fillPct}%)` },
    { kind: 'COLLECTION_COMPLETED', detail: (b) => `Collection completed at ${b.meta.label}` },
    { kind: 'TRUCK_DISPATCHED',    detail: (b) => `Truck dispatched to ${b.meta.label}` },
    { kind: 'DEVICE_ONLINE',      detail: (b) => `${b.meta.label} sensor came online` },
    { kind: 'DEVICE_OFFLINE',     detail: (b) => `${b.meta.label} sensor went offline` },
    { kind: 'NOTIFICATION_SENT',  detail: (b) => `Alert notification sent for ${b.meta.label}` },
  ];

  for (let i = 0; i < 50; i++) {
    const bin = pickRandom(bins);
    const template = pickRandom(kinds);

    events.push({
      id: `EVT-${String(i + 1).padStart(3, '0')}`,
      binId: bin.id,
      kind: template.kind,
      detail: template.detail(bin),
      actor: pickRandom(['system', 'admin@smartbin.io', 'device:BIN-001']),
      timestamp: now - randomInt(0, 168) * hour,
    });
  }

  return events.sort((a, b) => b.timestamp - a.timestamp);
}

// ── Generate Daily Analytics (30 days) ─────────────────────

function generateDailyAnalytics(): DailyAnalytics[] {
  const analytics: DailyAnalytics[] = [];

  for (let d = 29; d >= 0; d--) {
    const date = new Date(now - d * day);
    const dateStr = date.toISOString().split('T')[0];
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const baseFactor = isWeekend ? 0.7 : 1;

    analytics.push({
      date: dateStr,
      totalCollections: Math.round(randomBetween(18, 35) * baseFactor),
      totalWasteKg: Math.round(randomBetween(800, 1800) * baseFactor),
      avgFillPct: randomBetween(35, 65),
      overflowCount: randomInt(0, 4),
      avgResponseTimeMins: randomBetween(12, 45),
      fuelUsedL: randomBetween(25, 60),
      co2SavedKg: randomBetween(15, 45),
      efficiency: randomBetween(72, 96),
    });
  }

  return analytics;
}

// ── Generate Zone Analytics ────────────────────────────────

function generateZoneAnalytics(bins: Bin[]): ZoneAnalytics[] {
  const zones = ['Zone-A', 'Zone-B', 'Zone-C', 'Zone-D', 'Zone-E'];

  return zones.map(zone => {
    const zoneBins = bins.filter(b => b.meta.zone === zone);
    const avgFill = zoneBins.length > 0
      ? Math.round(zoneBins.reduce((s, b) => s + b.live.fillPct, 0) / zoneBins.length)
      : 0;

    return {
      zone,
      binCount: zoneBins.length,
      avgFillPct: avgFill,
      totalCollections: randomInt(40, 120),
      totalWasteKg: randomBetween(2000, 8000),
      overflowRate: randomBetween(2, 15),
      efficiency: randomBetween(75, 95),
    };
  });
}

// ── Generate App Config ────────────────────────────────────

const MOCK_CONFIG: AppConfig = {
  defaultThresholdPct: 80,
  pollIntervalSec: 60,
  truckKmPerL: 3.5,
  co2KgPerL: 2.68,
  simulationMode: true,
};

// ── Generate Users ─────────────────────────────────────────

const MOCK_USERS: AppUser[] = [
  { uid: 'usr-001', email: 'admin@smartbin.io',      displayName: 'Admin User',     role: 'administrator', zone: null,     createdAt: now - 180 * day, lastLogin: now - 2 * hour },
  { uid: 'usr-002', email: 'ops@municipality.gov',    displayName: 'Operations Head', role: 'municipality',  zone: 'Zone-A', createdAt: now - 120 * day, lastLogin: now - 5 * hour },
  { uid: 'usr-003', email: 'field@municipality.gov',  displayName: 'Field Manager',   role: 'municipality',  zone: 'Zone-B', createdAt: now - 90 * day,  lastLogin: now - 1 * day },
  { uid: 'usr-004', email: 'viewer@smartbin.io',      displayName: 'Read Only User',  role: 'user',          zone: null,     createdAt: now - 30 * day,  lastLogin: now - 3 * day },
  { uid: 'usr-005', email: 'supervisor@municipality.gov', displayName: 'Zone Supervisor', role: 'municipality', zone: 'Zone-C', createdAt: now - 60 * day, lastLogin: now - 12 * hour },
];

// ── Generate Audit Logs ────────────────────────────────────

function generateAuditLogs(): AuditLogEntry[] {
  const actions = [
    { action: 'LOGIN', resource: 'auth', detail: 'User logged in successfully' },
    { action: 'UPDATE_THRESHOLD', resource: 'config', detail: 'Fill threshold updated to 85%' },
    { action: 'ACKNOWLEDGE_ALERT', resource: 'alert', detail: 'Alert acknowledged' },
    { action: 'DISPATCH_TRUCK', resource: 'truck', detail: 'Truck dispatched for collection' },
    { action: 'CREATE_BIN', resource: 'bin', detail: 'New bin registered' },
    { action: 'EXPORT_REPORT', resource: 'report', detail: 'Analytics report exported as PDF' },
    { action: 'UPDATE_SETTINGS', resource: 'settings', detail: 'Notification preferences updated' },
  ];

  return Array.from({ length: 30 }, (_, i) => {
    const user = pickRandom(MOCK_USERS);
    const action = pickRandom(actions);
    return {
      id: `AUD-${String(i + 1).padStart(3, '0')}`,
      userId: user.uid,
      userName: user.displayName,
      action: action.action,
      resource: action.resource,
      resourceId: `RES-${randomInt(100, 999)}`,
      details: action.detail,
      timestamp: now - randomInt(0, 720) * hour,
    };
  }).sort((a, b) => b.timestamp - a.timestamp);
}

// ── Main Export ────────────────────────────────────────────

/** Singleton-cached mock data. Same references across the app. */
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

  // Build a history map for the first 12 bins (keeps memory reasonable)
  const history: Record<string, HistoryEntry[]> = {};
  bins.slice(0, 12).forEach(bin => {
    history[bin.id] = generateHistory(bin.id);
  });

  return {
    bins,
    trucks,
    routes: [],
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
  const pollInterval = MOCK_CONFIG.pollIntervalSec * 1000;
  const isOnline = (Date.now() - bin.live.timestamp) < pollInterval * 3;

  return {
    id: bin.id,
    label: bin.meta.label,
    zone: bin.meta.zone,
    address: bin.meta.address,
    location: bin.meta.location,
    fillPct: bin.live.fillPct,
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

/** Reset mock data (useful for testing) */
export function resetMockData() {
  _cache = null;
}
