import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { db, IS_DEMO_MODE } from '@/lib/firebase';
import { ref as dbRef, onValue as dbOnValue, set as dbSet, push as dbPush, remove as dbRemove, update as dbUpdate } from 'firebase/database';
import { getMockData, toBinSummary } from '@/services/mockData';
import type { Bin, BinSummary, Truck, Alert, CollectionEvent, TimelineEvent, DailyAnalytics, ZoneAnalytics, Notification, AppConfig, AppUser, AuditLogEntry, HistoryEntry, KPIData, CollectionRoute } from '@/types';
import { calculateFillPercent, calculateKPIs, getBinStatus } from '@/lib/calculations';
import { SENSOR_TIMEOUT_MS, normalizeBinId } from '@/constants/hardware';

// ── Context Type ───────────────────────────────────────────

interface DatabaseContextType {
  // Data
  bins: Bin[];
  binSummaries: BinSummary[];
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
  kpis: KPIData;

  // State
  loading: boolean;
  /** True when running with simulation data (no real Firebase / ESP32) */
  isSimulationMode: boolean;
  /** True when physical ESP32 hardware is connected and streaming live telemetry */
  isHardwareConnected: boolean;
  setHardwareConnected: (connected: boolean) => void;
  ingestHardwareReadings: (readings: Array<{
    binId: string;
    distanceCm: number;
    timestamp?: number;
    sensorOk?: boolean;
    rssi?: number | null;
    batteryPct?: number | null;
    uptimeSec?: number | null;
    firmware?: string;
  }>) => void;

  // Bin Actions
  addBin: (bin: Partial<Bin>) => Promise<void>;
  updateBin: (id: string, data: Partial<Bin>) => Promise<void>;
  deleteBin: (id: string) => Promise<void>;
  updateTruck: (id: string, data: Partial<Truck>) => Promise<void>;
  updateRoute: (id: string, data: Partial<CollectionRoute>) => Promise<void>;
  addRoute: (route: CollectionRoute) => Promise<void>;

  // Alert Actions
  acknowledgeAlert: (id: string) => Promise<void>;
  resolveAlert: (id: string) => Promise<void>;

  // Notification Actions
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  deleteNotification: (id: string) => void;

  // Collection Actions
  getTodayCollections: () => CollectionEvent[];

  // Utility
  getBinById: (id: string) => Bin | undefined;
  getHistoryForBin: (binId: string) => HistoryEntry[];
}

const DatabaseContext = createContext<DatabaseContextType | null>(null);

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function normalizeFirebaseBin(id: string, rawValue: unknown): Bin {
  const value = rawValue && typeof rawValue === 'object' ? rawValue as Record<string, any> : {};
  const rawMeta = value.meta && typeof value.meta === 'object' ? value.meta : {};
  const rawLive = value.live && typeof value.live === 'object' ? value.live : {};
  const rawHealth = value.health && typeof value.health === 'object' ? value.health : {};
  const rawReserved = value.reserved && typeof value.reserved === 'object' ? value.reserved : {};
  const distanceCm = Number.isFinite(Number(rawLive.distanceCm)) ? Number(rawLive.distanceCm) : 11;
  const fillPct = Number.isFinite(Number(rawLive.fillPct))
    ? Number(rawLive.fillPct)
    : calculateFillPercent(distanceCm);
  const rawLocation = rawMeta.location && typeof rawMeta.location === 'object' ? rawMeta.location : {};
  const source = ['device', 'simulated', 'placeholder'].includes(rawMeta.source)
    ? rawMeta.source
    : 'placeholder';

  return {
    id,
    meta: {
      binId: rawMeta.binId || id,
      label: rawMeta.label || id.replace('-', ' '),
      zone: rawMeta.zone || 'Unassigned',
      address: rawMeta.address || 'Location not configured',
      location: {
        lat: Number.isFinite(Number(rawLocation.lat)) ? Number(rawLocation.lat) : 0,
        lng: Number.isFinite(Number(rawLocation.lng)) ? Number(rawLocation.lng) : 0,
      },
      depthCm: Number.isFinite(Number(rawMeta.depthCm)) ? Number(rawMeta.depthCm) : 11,
      thresholdPct: Number.isFinite(Number(rawMeta.thresholdPct)) ? Number(rawMeta.thresholdPct) : 80,
      source,
      installedAt: Number.isFinite(Number(rawMeta.installedAt)) ? Number(rawMeta.installedAt) : 0,
      capacity: Number.isFinite(Number(rawMeta.capacity)) ? Number(rawMeta.capacity) : 0,
    },
    live: {
      distanceCm,
      fillPct,
      binStatus: ['Empty', 'Half', 'Full'].includes(rawLive.binStatus)
        ? rawLive.binStatus
        : getBinStatus(fillPct),
      messageStatus: rawLive.messageStatus === 'Delivered' ? 'Delivered' : 'Failed',
      rssi: nullableNumber(rawLive.rssi),
      batteryPct: nullableNumber(rawLive.batteryPct),
      uptimeSec: nullableNumber(rawLive.uptimeSec),
      firmware: typeof rawLive.firmware === 'string' ? rawLive.firmware : '',
      timestamp: Number.isFinite(Number(rawLive.timestamp)) ? Number(rawLive.timestamp) : 0,
    },
    health: {
      sensorOk: nullableBoolean(rawHealth.sensorOk),
      wifiOk: nullableBoolean(rawHealth.wifiOk),
      ledOk: nullableBoolean(rawHealth.ledOk),
      buzzerOk: nullableBoolean(rawHealth.buzzerOk),
      oledOk: nullableBoolean(rawHealth.oledOk),
      healthScore: nullableNumber(rawHealth.healthScore),
      lastMaintenance: Number.isFinite(Number(rawHealth.lastMaintenance)) ? Number(rawHealth.lastMaintenance) : null,
    },
    reserved: {
      temperatureC: Number.isFinite(Number(rawReserved.temperatureC)) ? Number(rawReserved.temperatureC) : null,
      humidityPct: Number.isFinite(Number(rawReserved.humidityPct)) ? Number(rawReserved.humidityPct) : null,
      gasPpm: Number.isFinite(Number(rawReserved.gasPpm)) ? Number(rawReserved.gasPpm) : null,
    },
  };
}

export const useDatabase = () => {
  const context = useContext(DatabaseContext);
  if (!context) throw new Error('useDatabase must be used within a DatabaseProvider');
  return context;
};

// ── Provider ───────────────────────────────────────────────

export const DatabaseProvider = ({ children }: { children: React.ReactNode }) => {
  const [bins, setBins] = useState<Bin[]>(() => (IS_DEMO_MODE ? getMockData().bins : []));
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [routes, setRoutes] = useState<CollectionRoute[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [collections, setCollections] = useState<CollectionEvent[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [dailyAnalytics, setDailyAnalytics] = useState<DailyAnalytics[]>([]);
  const [zoneAnalytics, setZoneAnalytics] = useState<ZoneAnalytics[]>([]);
  const [history, setHistory] = useState<Record<string, HistoryEntry[]>>({});
  const [config, setConfig] = useState<AppConfig>({ defaultThresholdPct: 80, pollIntervalSec: 60, truckKmPerL: 3.5, co2KgPerL: 2.68, simulationMode: IS_DEMO_MODE });
  const [users, setUsers] = useState<AppUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusClock, setStatusClock] = useState(Date.now());
  const [isHardwareConnected, setIsHardwareConnected] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setStatusClock(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

  // ── Load Data ────────────────────────────────────────────

  useEffect(() => {
    if (IS_DEMO_MODE) {
      const mock = getMockData();
      setBins(mock.bins);
      setTrucks(mock.trucks);
      setRoutes(mock.routes || []);
      setAlerts(mock.alerts);
      setNotifications(mock.notifications);
      setCollections(mock.collections);
      setTimeline(mock.timeline);
      setDailyAnalytics(mock.dailyAnalytics);
      setZoneAnalytics(mock.zoneAnalytics);
      setHistory(mock.history);
      setConfig(mock.config);
      setUsers(mock.users);
      setAuditLogs(mock.auditLogs);
      setLoading(false);
      return;
    }

    // Firebase real-time listeners
    const unsubscribers: Array<() => void> = [];

    const binsRef = dbRef(db, 'bins');
    unsubscribers.push(dbOnValue(binsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const binArray = Object.entries(data).map(([id, val]) => normalizeFirebaseBin(id, val));
        setBins(binArray);
      } else {
        setBins([]);
      }
      setLoading(false);
    }));

    const trucksRef = dbRef(db, 'trucks');
    unsubscribers.push(dbOnValue(trucksRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setTrucks(Object.entries(data).map(([id, val]: [string, any]) => ({ id, ...val })) as Truck[]);
      }
    }));

    const alertsRef = dbRef(db, 'alerts');
    unsubscribers.push(dbOnValue(alertsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setAlerts(Object.entries(data).map(([id, val]: [string, any]) => ({ id, ...val })) as Alert[]);
      }
    }));

    const routesRef = dbRef(db, 'routes');
    unsubscribers.push(dbOnValue(routesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setRoutes(Object.entries(data).map(([id, val]: [string, any]) => ({ id, ...val })) as CollectionRoute[]);
      } else {
        setRoutes([]);
      }
    }));

    const configRef = dbRef(db, 'config');
    unsubscribers.push(dbOnValue(configRef, (snapshot) => {
      const data = snapshot.val() || {};
      setConfig((previous) => ({ ...previous, ...data, simulationMode: false }));
    }));

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, []);

  // ── Computed Values ──────────────────────────────────────

  // Determine online status using the shared SENSOR_TIMEOUT_MS constant
  const binSummaries = useMemo(() => bins.map(b => {
    const summary = toBinSummary(b);
    // Recompute isOnline using the centralised timeout
    return { ...summary, isOnline: b.live.timestamp > 0 && (statusClock - b.live.timestamp) < SENSOR_TIMEOUT_MS };
  }), [bins, statusClock]);

  const kpis = useMemo((): KPIData => {
    const base = calculateKPIs(binSummaries);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayCollections = collections.filter(c => c.collectedAt >= todayStart.getTime());
    const activeAlerts = alerts.filter(a => a.state === 'active');

    return {
      ...base,
      todayCollections: todayCollections.length,
      totalWasteTodayKg: Math.round(todayCollections.reduce((s, c) => s + c.wasteKg, 0)),
      activeTrucks: trucks.filter(t => t.status === 'active' || t.status === 'en_route' || t.status === 'collecting').length,
      activeAlerts: activeAlerts.length,
      co2SavedKg: Math.round(dailyAnalytics.reduce((s, d) => s + d.co2SavedKg, 0)),
      fuelSavedL: Math.round(dailyAnalytics.reduce((s, d) => s + d.fuelUsedL * 0.3, 0) * 10) / 10,
      collectionEfficiency: dailyAnalytics.length > 0
        ? Math.round(dailyAnalytics.reduce((s, d) => s + d.efficiency, 0) / dailyAnalytics.length)
        : 0,
      avgResponseTimeMins: dailyAnalytics.length > 0
        ? Math.round(dailyAnalytics.reduce((s, d) => s + d.avgResponseTimeMins, 0) / dailyAnalytics.length)
        : 0,
    };
  }, [binSummaries, collections, alerts, trucks, dailyAnalytics]);

  // ── Actions ──────────────────────────────────────────────

  const addBin = useCallback(async (bin: Partial<Bin>) => {
    if (IS_DEMO_MODE) return;
    const newRef = dbPush(dbRef(db, 'bins'));
    await dbSet(newRef, bin);
  }, []);

  const updateBin = useCallback(async (id: string, data: Partial<Bin>) => {
    if (IS_DEMO_MODE) {
      setBins(prev => prev.map(b => b.id === id ? { ...b, ...data, live: { ...b.live, ...data.live }, meta: { ...b.meta, ...data.meta }, health: { ...b.health, ...data.health } } : b));
      return;
    }
    await dbUpdate(dbRef(db, `bins/${id}`), data);
  }, []);

  const updateTruck = useCallback(async (id: string, data: Partial<Truck>) => {
    if (IS_DEMO_MODE) {
      setTrucks(prev => prev.map(t => t.id === id ? { ...t, ...data } : t));
      return;
    }
    await dbUpdate(dbRef(db, `trucks/${id}`), data);
  }, []);

  const updateRoute = useCallback(async (id: string, data: Partial<CollectionRoute>) => {
    if (IS_DEMO_MODE) {
      setRoutes(prev => prev.map(r => r.id === id ? { ...r, ...data } : r));
      return;
    }
    await dbUpdate(dbRef(db, `routes/${id}`), data);
  }, []);

  const addRoute = useCallback(async (route: CollectionRoute) => {
    if (IS_DEMO_MODE) {
      setRoutes(prev => [...prev, route]);
      return;
    }
    await dbUpdate(dbRef(db, `routes/${route.id}`), route);
  }, []);

  const deleteBin = useCallback(async (id: string) => {
    if (IS_DEMO_MODE) {
      setBins(prev => prev.filter(b => b.id !== id));
      return;
    }
    await dbRemove(dbRef(db, `bins/${id}`));
  }, []);

  const acknowledgeAlert = useCallback(async (id: string) => {
    if (IS_DEMO_MODE) {
      setAlerts(prev => prev.map(a =>
        a.id === id ? { ...a, state: 'acknowledged', acknowledgedAt: Date.now(), acknowledgedBy: 'admin@smartbin.io' } : a
      ));
      return;
    }
    await dbUpdate(dbRef(db, `alerts/${id}`), { state: 'acknowledged', acknowledgedAt: Date.now() });
  }, []);

  const resolveAlert = useCallback(async (id: string) => {
    if (IS_DEMO_MODE) {
      setAlerts(prev => prev.map(a =>
        a.id === id ? { ...a, state: 'resolved', resolvedAt: Date.now() } : a
      ));
      return;
    }
    await dbUpdate(dbRef(db, `alerts/${id}`), { state: 'resolved', resolvedAt: Date.now() });
  }, []);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const deleteNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const getTodayCollections = useCallback(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return collections.filter(c => c.collectedAt >= todayStart.getTime());
  }, [collections]);

  const getBinById = useCallback((id: string) => {
    const norm = normalizeBinId(id);
    return bins.find(b => b.id === id || (norm && normalizeBinId(b.id) === norm));
  }, [bins]);

  const getHistoryForBin = useCallback((binId: string) => {
    const norm = normalizeBinId(binId);
    return history[binId] ?? (norm ? history[norm] : undefined) ?? [];
  }, [history]);

  const ingestHardwareReadings = useCallback((readings: Array<{
    binId: string;
    distanceCm: number;
    timestamp?: number;
    sensorOk?: boolean;
    rssi?: number | null;
    batteryPct?: number | null;
    uptimeSec?: number | null;
    firmware?: string;
  }>) => {
    if (!readings || readings.length === 0) return;
    setIsHardwareConnected(true);
    setConfig(prev => ({ ...prev, simulationMode: false }));

    const now = Date.now();

    setBins(prevBins => {
      const baseBins = prevBins && prevBins.length > 0 ? prevBins : (IS_DEMO_MODE ? getMockData().bins : []);
      return baseBins.map(b => {
        const bNorm = normalizeBinId(b.id);
        const reading = readings.find(r => normalizeBinId(r.binId) === bNorm);
        if (!reading) return b;

        const distanceCm = reading.distanceCm;
        const fillPct = calculateFillPercent(distanceCm);
        const binStatus = getBinStatus(fillPct);

        // Deduplicate and raise critical alert when full
        if (fillPct >= 80) {
          setAlerts(prevAlerts => {
            const hasActive = prevAlerts.some(a => normalizeBinId(a.binId) === bNorm && a.state === 'active');
            if (hasActive) return prevAlerts;
            const newAlert: Alert = {
              id: `ALT-${Date.now()}-${b.id}`,
              binId: b.id,
              binLabel: b.meta.label,
              type: 'bin_full',
              severity: 'critical',
              message: `${b.meta.label} (${b.id}) critical fill reached: ${fillPct}% (${distanceCm} cm)`,
              state: 'active',
              raisedAt: now,
              acknowledgedAt: null,
              acknowledgedBy: null,
              resolvedAt: null,
            };
            return [newAlert, ...prevAlerts];
          });
        }

        return {
          ...b,
          meta: {
            ...b.meta,
            source: 'device' as const,
          },
          live: {
            ...b.live,
            distanceCm,
            fillPct,
            binStatus,
            messageStatus: 'Delivered',
            rssi: reading.rssi ?? b.live.rssi ?? -45,
            batteryPct: reading.batteryPct ?? b.live.batteryPct ?? 98,
            uptimeSec: reading.uptimeSec ?? b.live.uptimeSec,
            firmware: reading.firmware || b.live.firmware || '2.0.0-4bin',
            timestamp: reading.timestamp || now,
          },
          health: {
            ...b.health,
            sensorOk: reading.sensorOk ?? (distanceCm >= 2 && distanceCm <= 400),
            wifiOk: true,
          },
        };
      });
    });

    // Append to live history
    setHistory(prevHist => {
      const nextHist = { ...prevHist };
      for (const r of readings) {
        const norm = normalizeBinId(r.binId) || r.binId;
        const fillPct = calculateFillPercent(r.distanceCm);
        const entry: HistoryEntry = {
          timestamp: r.timestamp || now,
          fillPct,
          distanceCm: r.distanceCm,
          binStatus: getBinStatus(fillPct),
        };
        const list = nextHist[norm] ? [...nextHist[norm]] : [];
        list.push(entry);
        if (list.length > 60) list.shift();
        nextHist[norm] = list;
      }
      return nextHist;
    });
  }, []);

  // Subscribe to local dev SSE telemetry stream if available
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    try {
      const es = new EventSource('/api/telemetry/events');
      es.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'telemetry' && Array.isArray(payload.readings)) {
            ingestHardwareReadings(payload.readings);
          }
        } catch {
          // ignore
        }
      };
      return () => {
        es.close();
      };
    } catch {
      // EventSource not supported or connection error
    }
  }, [ingestHardwareReadings]);

  // ── Value ────────────────────────────────────────────────

  const value: DatabaseContextType = {
    bins, binSummaries, trucks, routes, alerts, notifications, collections,
    timeline, dailyAnalytics, zoneAnalytics, history, config, users, auditLogs, kpis,
    loading,
    isSimulationMode: IS_DEMO_MODE && !isHardwareConnected,
    isHardwareConnected,
    setHardwareConnected: setIsHardwareConnected,
    ingestHardwareReadings,
    addBin, updateBin, deleteBin, updateTruck, updateRoute, addRoute,
    acknowledgeAlert, resolveAlert,
    markNotificationRead, markAllNotificationsRead, deleteNotification,
    getTodayCollections, getBinById, getHistoryForBin,
  };

  return (
    <DatabaseContext.Provider value={value}>
      {children}
    </DatabaseContext.Provider>
  );
};
