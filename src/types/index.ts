// SmartBin+ domain types

export type BinStatus = 'Empty' | 'Half' | 'Full';
export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertState = 'active' | 'acknowledged' | 'resolved';
export type AlertType = 'bin_full' | 'sensor_offline' | 'battery_low' | 'truck_assigned' | 'collection_completed' | 'sensor_fault' | 'temperature_high' | 'overflow';
export type UserRole = 'administrator' | 'municipality' | 'user';
export type DataSource = 'device' | 'simulated' | 'placeholder';
export type ConnectionState = 'online' | 'degraded' | 'offline' | 'reconnecting';
export type TruckStatus = 'active' | 'idle' | 'maintenance' | 'en_route' | 'collecting';
export type MessageStatus = 'Delivered' | 'Failed';
export type EventKind = 'SENSOR_UPDATE' | 'THRESHOLD_REACHED' | 'NOTIFICATION_SENT' | 'TRUCK_DISPATCHED' | 'TRUCK_ARRIVED' | 'COLLECTION_COMPLETED' | 'DB_UPDATED' | 'DEVICE_ONLINE' | 'DEVICE_OFFLINE' | 'SENSOR_FAULT';

export interface GeoLocation { lat: number; lng: number; source?: 'manual' | 'gps'; }

export interface BinMeta {
  binId: string;
  deviceId: string;
  label: string;
  zone: string;
  address: string;
  location: GeoLocation | null;
  locationConfigured: boolean;
  depthCm: number;
  thresholdPct: number;
  source: DataSource;
  installedAt: number;
  capacity: number;
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

export interface BinReserved { temperatureC: number | null; humidityPct: number | null; gasPpm: number | null; }
export interface Bin { id: string; meta: BinMeta; live: BinLive; health: BinHealth; reserved: BinReserved; }

export interface BinSummary {
  id: string;
  deviceId: string;
  label: string;
  zone: string;
  address: string;
  location: GeoLocation | null;
  locationConfigured: boolean;
  fillPct: number;
  distanceCm: number | null;
  binStatus: BinStatus;
  batteryPct: number;
  rssi: number;
  source: DataSource;
  lastUpdate: number;
  lastSeen: number | null;
  isOnline: boolean;
  temperatureC: number | null;
  humidityPct: number | null;
  healthScore: number;
  thresholdPct: number;
}

export interface HistoryEntry { fillPct: number; distanceCm: number; binStatus: BinStatus; timestamp: number; }
export interface Alert { id: string; binId: string; binLabel: string; severity: AlertSeverity; type: AlertType; message: string; raisedAt: number; acknowledgedBy: string | null; acknowledgedAt: number | null; resolvedAt: number | null; state: AlertState; }
export interface Notification { id: string; title: string; message: string; type: AlertType; severity: AlertSeverity; timestamp: number; read: boolean; binId?: string; truckId?: string; actionUrl?: string; }
export interface Driver { id: string; name: string; phone: string; email: string; avatar?: string; licenseNumber: string; status: 'available' | 'on_duty' | 'off_duty'; }
export interface Truck { id: string; label: string; plateNumber: string; status: TruckStatus; position: GeoLocation; assignedRoute: string[]; activeRouteId?: string; capacityLiters: number; currentLoadLiters: number; fuelLevelPct: number; driver: Driver | null; todayCollections: number; totalKmToday: number; lastMaintenance: number | null; model: string; year: number; }
export interface RouteStop { binId: string; binLabel: string; location: GeoLocation; fillPct: number; order: number; collected: boolean; }
export interface CollectionRoute { id: string; truckId: string; stops: RouteStop[]; optimizedKm: number; traditionalKm: number; savedKm: number; fuelSavedL: number; co2SavedKg: number; createdAt: number; completedAt: number | null; status: 'planned' | 'in_progress' | 'completed'; }
export interface CollectionEvent { id: string; binId: string; binLabel: string; truckId: string; truckLabel: string; driverName: string; collectedAt: number; fillLevelBefore: number; fillLevelAfter: number; wasteKg: number; zone: string; }
export interface TimelineEvent { id: string; binId?: string; kind: EventKind; detail: string; actor: string; timestamp: number; }
export interface AppUser { uid: string; email: string; displayName: string; role: UserRole; zone: string | null; avatar?: string; createdAt: number; lastLogin: number; phone?: string; }
export interface AppConfig { defaultThresholdPct: number; pollIntervalSec: number; truckKmPerL: number; co2KgPerL: number; simulationMode: boolean; }
export interface DailyAnalytics { date: string; totalCollections: number; totalWasteKg: number; avgFillPct: number; overflowCount: number; avgResponseTimeMins: number; fuelUsedL: number; co2SavedKg: number; efficiency: number; }
export interface ZoneAnalytics { zone: string; binCount: number; avgFillPct: number; totalCollections: number; totalWasteKg: number; overflowRate: number; efficiency: number; }
export interface FillPrediction { binId: string; binLabel: string; currentFillPct: number; predictedFullAt: number; hoursToFull: number; fillRatePerHour: number; confidence: number; }
export interface CollectionPrediction { date: string; predictedCollections: number; predictedWasteKg: number; confidence: number; }
export interface UserSettings { theme: 'dark' | 'light' | 'system'; language: string; timezone: string; dateFormat: string; units: 'metric' | 'imperial'; notificationPreferences: { binFull: boolean; sensorOffline: boolean; batteryLow: boolean; truckAssigned: boolean; collectionCompleted: boolean; systemAlerts: boolean; emailNotifications: boolean; soundEnabled: boolean; }; }
export interface AuditLogEntry { id: string; userId: string; userName: string; action: string; resource: string; resourceId: string; details: string; timestamp: number; ip?: string; }
export interface KPIData { totalBins: number; onlineBins: number; offlineBins: number; fullBins: number; warningBins: number; healthyBins: number; todayCollections: number; avgFillPct: number | string; avgBatteryPct: number; totalWasteTodayKg: number; activeTrucks: number; activeAlerts: number; co2SavedKg: number; fuelSavedL: number; collectionEfficiency: number; avgResponseTimeMins: number; }

export interface TelemetryPayload { deviceId: string; binId: string; distanceCm: number; timestamp?: string | number; }
export interface TelemetryState { deviceId: string; binId: string; distanceCm: number; fillPct: number; status: BinStatus; lastSeen: number; }
