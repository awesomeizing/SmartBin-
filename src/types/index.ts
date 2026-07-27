// ─────────────────────────────────────────────────────────────
// SmartBin+ Domain Types
// Every entity in the system is typed here.
// ─────────────────────────────────────────────────────────────

// ── Enums ──────────────────────────────────────────────────

export type BinStatus = 'Empty' | 'Half' | 'Full';
export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertState = 'active' | 'acknowledged' | 'resolved';
export type AlertType =
  | 'bin_full'
  | 'sensor_offline'
  | 'battery_low'
  | 'truck_assigned'
  | 'collection_completed'
  | 'sensor_fault'
  | 'temperature_high'
  | 'overflow';
export type UserRole = 'administrator' | 'municipality' | 'user';
export type DataSource = 'device' | 'simulated' | 'placeholder';
export type ConnectionState = 'online' | 'degraded' | 'offline' | 'reconnecting';
export type TruckStatus = 'active' | 'idle' | 'maintenance' | 'en_route' | 'collecting';
export type MessageStatus = 'Delivered' | 'Failed';

export type EventKind =
  | 'SENSOR_UPDATE'
  | 'THRESHOLD_REACHED'
  | 'NOTIFICATION_SENT'
  | 'TRUCK_DISPATCHED'
  | 'TRUCK_ARRIVED'
  | 'COLLECTION_COMPLETED'
  | 'DB_UPDATED'
  | 'DEVICE_ONLINE'
  | 'DEVICE_OFFLINE'
  | 'SENSOR_FAULT';

// ── Geolocation ────────────────────────────────────────────

export interface GeoLocation {
  lat: number;
  lng: number;
  source?: 'manual' | 'gps';
}

// ── Bin ────────────────────────────────────────────────────

export interface BinMeta {
  binId: string;
  label: string;
  zone: string;
  address: string;
  location: GeoLocation;
  depthCm: number;
  thresholdPct: number;
  source: DataSource;
  installedAt: number;
  capacity: number; // liters
}

export interface BinLive {
  distanceCm: number;
  fillPct: number;
  binStatus: BinStatus;
  messageStatus: MessageStatus;
  rssi: number;
  batteryPct: number;
  uptimeSec: number;
  firmware: string;
  timestamp: number;
}

export interface BinHealth {
  sensorOk: boolean;
  wifiOk: boolean;
  ledOk: boolean;
  buzzerOk: boolean;
  oledOk: boolean;
  healthScore: number;
  lastMaintenance: number | null;
}

export interface BinReserved {
  temperatureC: number | null;
  humidityPct: number | null;
  gasPpm: number | null;
}

/** Complete bin entity as used in the UI */
export interface Bin {
  id: string;
  meta: BinMeta;
  live: BinLive;
  health: BinHealth;
  reserved: BinReserved;
}

/** Flattened bin for simpler list/card views */
export interface BinSummary {
  id: string;
  label: string;
  zone: string;
  address: string;
  location: GeoLocation;
  fillPct: number;
  binStatus: BinStatus;
  batteryPct: number;
  rssi: number;
  source: DataSource;
  lastUpdate: number;
  isOnline: boolean;
  temperatureC: number | null;
  humidityPct: number | null;
  healthScore: number;
  thresholdPct: number;
}

// ── History ────────────────────────────────────────────────

export interface HistoryEntry {
  fillPct: number;
  distanceCm: number;
  binStatus: BinStatus;
  timestamp: number;
}

// ── Alert ──────────────────────────────────────────────────

export interface Alert {
  id: string;
  binId: string;
  binLabel: string;
  severity: AlertSeverity;
  type: AlertType;
  message: string;
  raisedAt: number;
  acknowledgedBy: string | null;
  acknowledgedAt: number | null;
  resolvedAt: number | null;
  state: AlertState;
}

// ── Notification ───────────────────────────────────────────

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: AlertType;
  severity: AlertSeverity;
  timestamp: number;
  read: boolean;
  binId?: string;
  truckId?: string;
  actionUrl?: string;
}

// ── Truck / Fleet ──────────────────────────────────────────

export interface Driver {
  id: string;
  name: string;
  phone: string;
  email: string;
  avatar?: string;
  licenseNumber: string;
  status: 'available' | 'on_duty' | 'off_duty';
}

export interface Truck {
  id: string;
  label: string;
  plateNumber: string;
  status: TruckStatus;
  position: GeoLocation;
  assignedRoute: string[];
  activeRouteId?: string;
  capacityLiters: number;
  currentLoadLiters: number;
  fuelLevelPct: number;
  driver: Driver | null;
  todayCollections: number;
  totalKmToday: number;
  lastMaintenance: number | null;
  model: string;
  year: number;
}

// ── Route ──────────────────────────────────────────────────

export interface RouteStop {
  binId: string;
  binLabel: string;
  location: GeoLocation;
  fillPct: number;
  order: number;
  collected: boolean;
}

export interface CollectionRoute {
  id: string;
  truckId: string;
  stops: RouteStop[];
  optimizedKm: number;
  traditionalKm: number;
  savedKm: number;
  fuelSavedL: number;
  co2SavedKg: number;
  createdAt: number;
  completedAt: number | null;
  status: 'planned' | 'in_progress' | 'completed';
}

// ── Collection Event ───────────────────────────────────────

export interface CollectionEvent {
  id: string;
  binId: string;
  binLabel: string;
  truckId: string;
  truckLabel: string;
  driverName: string;
  collectedAt: number;
  fillLevelBefore: number;
  fillLevelAfter: number;
  wasteKg: number;
  zone: string;
}

// ── Timeline Event ─────────────────────────────────────────

export interface TimelineEvent {
  id: string;
  binId?: string;
  kind: EventKind;
  detail: string;
  actor: string;
  timestamp: number;
}

// ── User ───────────────────────────────────────────────────

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  zone: string | null;
  avatar?: string;
  createdAt: number;
  lastLogin: number;
  phone?: string;
}

// ── Config ─────────────────────────────────────────────────

export interface AppConfig {
  defaultThresholdPct: number;
  pollIntervalSec: number;
  truckKmPerL: number;
  co2KgPerL: number;
  simulationMode: boolean;
}

// ── Analytics ──────────────────────────────────────────────

export interface DailyAnalytics {
  date: string;
  totalCollections: number;
  totalWasteKg: number;
  avgFillPct: number;
  overflowCount: number;
  avgResponseTimeMins: number;
  fuelUsedL: number;
  co2SavedKg: number;
  efficiency: number; // 0-100
}

export interface ZoneAnalytics {
  zone: string;
  binCount: number;
  avgFillPct: number;
  totalCollections: number;
  totalWasteKg: number;
  overflowRate: number;
  efficiency: number;
}

// ── AI Predictions ─────────────────────────────────────────

export interface FillPrediction {
  binId: string;
  binLabel: string;
  currentFillPct: number;
  predictedFullAt: number; // timestamp
  hoursToFull: number;
  fillRatePerHour: number;
  confidence: number; // 0-1
}

export interface CollectionPrediction {
  date: string;
  predictedCollections: number;
  predictedWasteKg: number;
  confidence: number;
}

// ── Settings ───────────────────────────────────────────────

export interface UserSettings {
  theme: 'dark' | 'light' | 'system';
  language: string;
  timezone: string;
  dateFormat: string;
  units: 'metric' | 'imperial';
  notificationPreferences: {
    binFull: boolean;
    sensorOffline: boolean;
    batteryLow: boolean;
    truckAssigned: boolean;
    collectionCompleted: boolean;
    systemAlerts: boolean;
    emailNotifications: boolean;
    soundEnabled: boolean;
  };
}

// ── Audit Log ──────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  userId: string;
  userName: string;
  action: string;
  resource: string;
  resourceId: string;
  details: string;
  timestamp: number;
  ip?: string;
}

// ── KPI ────────────────────────────────────────────────────

export interface KPIData {
  totalBins: number;
  onlineBins: number;
  offlineBins: number;
  fullBins: number;
  warningBins: number;
  healthyBins: number;
  todayCollections: number;
  avgFillPct: number;
  avgBatteryPct: number;
  totalWasteTodayKg: number;
  activeTrucks: number;
  activeAlerts: number;
  co2SavedKg: number;
  fuelSavedL: number;
  collectionEfficiency: number;
  avgResponseTimeMins: number;
}
