import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { db, IS_DEMO_MODE, IS_FIREBASE_CONFIGURED } from '@/lib/firebase';
import { ref as dbRef, onValue as dbOnValue, set as dbSet, push as dbPush, remove as dbRemove, update as dbUpdate } from 'firebase/database';
import { getMockData } from '@/services/mockData';
import { HARDWARE_BINS, IOT_CONFIG } from '@/constants/hardware';
import { calculateFillFromCalibration, calculateKPIs, getBinStatus } from '@/lib/calculations';
import type { Bin, BinSummary, Truck, Alert, CollectionEvent, TimelineEvent, DailyAnalytics, ZoneAnalytics, Notification, AppConfig, AppUser, AuditLogEntry, HistoryEntry, KPIData, CollectionRoute } from '@/types';

interface DatabaseContextType {
  bins: Bin[]; binSummaries: BinSummary[]; trucks: Truck[]; routes: CollectionRoute[]; alerts: Alert[]; notifications: Notification[]; collections: CollectionEvent[]; timeline: TimelineEvent[]; dailyAnalytics: DailyAnalytics[]; zoneAnalytics: ZoneAnalytics[]; history: Record<string, HistoryEntry[]>; config: AppConfig; users: AppUser[]; auditLogs: AuditLogEntry[]; kpis: KPIData; loading: boolean;
  addBin: (bin: Partial<Bin>) => Promise<void>; updateBin: (id: string, data: Partial<Bin>) => Promise<void>; deleteBin: (id: string) => Promise<void>; updateTruck: (id: string, data: Partial<Truck>) => Promise<void>; updateRoute: (id: string, data: Partial<CollectionRoute>) => Promise<void>; addRoute: (route: CollectionRoute) => Promise<void>;
  acknowledgeAlert: (id: string) => Promise<void>; resolveAlert: (id: string) => Promise<void>; markNotificationRead: (id: string) => void; markAllNotificationsRead: () => void; deleteNotification: (id: string) => void; getTodayCollections: () => CollectionEvent[]; getBinById: (id: string) => Bin | undefined; getHistoryForBin: (binId: string) => HistoryEntry[];
}

const DatabaseContext = createContext<DatabaseContextType | null>(null);
export const useDatabase = () => { const context = useContext(DatabaseContext); if (!context) throw new Error('useDatabase must be used within a DatabaseProvider'); return context; };

function emptyBin(c: typeof HARDWARE_BINS[number]): Bin {
  return { id: c.id, meta: { binId: c.id, deviceId: c.deviceId, label: c.label, zone: c.zone, address: c.address, location: c.location, locationConfigured: c.locationConfigured, depthCm: c.depthCm, thresholdPct: c.thresholdPct, source: IS_FIREBASE_CONFIGURED ? 'device' : 'placeholder', installedAt: 0, capacity: 0 }, live: { distanceCm: c.depthCm, fillPct: 0, binStatus: 'Empty', messageStatus: 'Failed', rssi: 0, batteryPct: 0, uptimeSec: 0, firmware: '-', timestamp: 0 }, health: { sensorOk: false, wifiOk: false, ledOk: true, buzzerOk: true, oledOk: true, healthScore: 0, lastMaintenance: null }, reserved: { temperatureC: null, humidityPct: null, gasPpm: null } };
}

function toSummary(b: Bin): BinSummary {
  const lastSeen = b.live.timestamp || null;
  const online = Boolean(lastSeen && Date.now() - lastSeen <= IOT_CONFIG.OFFLINE_AFTER_MS && b.health.sensorOk && b.health.wifiOk);
  return { id: b.id, deviceId: b.meta.deviceId, label: b.meta.label, zone: b.meta.zone, address: b.meta.address, location: b.meta.location, locationConfigured: b.meta.locationConfigured, fillPct: online ? b.live.fillPct : 0, distanceCm: online ? b.live.distanceCm : null, binStatus: online ? b.live.binStatus : 'Empty', batteryPct: online ? b.live.batteryPct : 0, rssi: online ? b.live.rssi : 0, source: b.meta.source, lastUpdate: lastSeen ?? 0, lastSeen, isOnline: online, temperatureC: online ? b.reserved.temperatureC : null, humidityPct: online ? b.reserved.humidityPct : null, healthScore: online ? b.health.healthScore : 0, thresholdPct: b.meta.thresholdPct };
}

function normalizeDemoBins(raw: Bin[]): Bin[] {
  return HARDWARE_BINS.map((config, index) => {
    const source = raw[index] ?? emptyBin(config);
    return { ...source, id: config.id, meta: { ...source.meta, binId: config.id, deviceId: config.deviceId, label: config.label, zone: config.zone, address: 'Demo data — hardware location not configured', location: config.location, locationConfigured: false, depthCm: config.depthCm, thresholdPct: config.thresholdPct, source: 'simulated' } };
  });
}

export const DatabaseProvider = ({ children }: { children: React.ReactNode }) => {
  const [bins, setBins] = useState<Bin[]>([]), [trucks, setTrucks] = useState<Truck[]>([]), [routes, setRoutes] = useState<CollectionRoute[]>([]), [alerts, setAlerts] = useState<Alert[]>([]), [notifications, setNotifications] = useState<Notification[]>([]), [collections, setCollections] = useState<CollectionEvent[]>([]), [timeline, setTimeline] = useState<TimelineEvent[]>([]), [dailyAnalytics, setDailyAnalytics] = useState<DailyAnalytics[]>([]), [zoneAnalytics, setZoneAnalytics] = useState<ZoneAnalytics[]>([]), [history, setHistory] = useState<Record<string, HistoryEntry[]>>({}), [config, setConfig] = useState<AppConfig>({ defaultThresholdPct: 80, pollIntervalSec: 15, truckKmPerL: 3.5, co2KgPerL: 2.68, simulationMode: IS_DEMO_MODE }), [users, setUsers] = useState<AppUser[]>([]), [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]), [loading, setLoading] = useState(true);

  useEffect(() => {
    if (IS_DEMO_MODE) {
      const mock = getMockData(); setBins(normalizeDemoBins(mock.bins.slice(0, 4))); setTrucks(mock.trucks); setRoutes(mock.routes || []); setAlerts(mock.alerts); setNotifications(mock.notifications); setCollections(mock.collections); setTimeline(mock.timeline); setDailyAnalytics(mock.dailyAnalytics); setZoneAnalytics(mock.zoneAnalytics); setHistory(mock.history); setConfig({ ...mock.config, simulationMode: true }); setUsers(mock.users); setAuditLogs(mock.auditLogs); setLoading(false); return;
    }
    if (!IS_FIREBASE_CONFIGURED) {
      setBins(HARDWARE_BINS.map(emptyBin)); setTrucks([]); setRoutes([]); setAlerts([]); setNotifications([]); setCollections([]); setTimeline([]); setDailyAnalytics([]); setZoneAnalytics([]); setHistory({}); setUsers([]); setAuditLogs([]); setConfig(p => ({ ...p, simulationMode: false })); setLoading(false); return;
    }

    const unsubscribers: Array<() => void> = [];
    unsubscribers.push(dbOnValue(dbRef(db, 'bins'), snapshot => {
      const data = snapshot.val() || {};
      setBins(HARDWARE_BINS.map(config => {
        const record = data[config.id] || {}; const base = emptyBin(config); const live = record.live || {};
        const distance = Number(live.distanceCm); const fill = Number.isFinite(distance) ? calculateFillFromCalibration(distance, IOT_CONFIG.EMPTY_DISTANCE_CM, IOT_CONFIG.FULL_DISTANCE_CM) : 0;
        const timestamp = Number(live.timestamp || record.lastSeen || 0); const online = timestamp > 0 && Date.now() - timestamp <= IOT_CONFIG.OFFLINE_AFTER_MS;
        return { ...base, ...record, id: config.id, meta: { ...base.meta, ...(record.meta || {}), ...config, source: 'device', locationConfigured: config.locationConfigured }, live: { ...base.live, ...live, distanceCm: Number.isFinite(distance) ? distance : base.live.distanceCm, fillPct: fill, binStatus: getBinStatus(fill), timestamp }, health: { ...base.health, ...(record.health || {}), wifiOk: online, sensorOk: online } } as Bin;
      }));
      setLoading(false);
    }));
    const listen = <T,>(path: string, setter: (value: T[]) => void) => unsubscribers.push(dbOnValue(dbRef(db, path), snapshot => { const data = snapshot.val(); setter(data ? Object.entries(data).map(([id, value]) => ({ id, ...(value as object) })) as T[] : []); }));
    listen<Truck>('trucks', setTrucks); listen<Alert>('alerts', setAlerts); listen<CollectionRoute>('routes', setRoutes); listen<CollectionEvent>('collections', setCollections); listen<TimelineEvent>('timeline', setTimeline); listen<Notification>('notifications', setNotifications); listen<DailyAnalytics>('dailyAnalytics', setDailyAnalytics); listen<ZoneAnalytics>('zoneAnalytics', setZoneAnalytics);
    unsubscribers.push(dbOnValue(dbRef(db, 'history'), snapshot => setHistory((snapshot.val() || {}) as Record<string, HistoryEntry[]>)));
    unsubscribers.push(dbOnValue(dbRef(db, 'config'), snapshot => { if (snapshot.val()) setConfig(p => ({ ...p, ...snapshot.val(), simulationMode: false })); }));
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, []);

  const binSummaries = useMemo(() => bins.map(toSummary), [bins]);
  const kpis = useMemo((): KPIData => {
    const base = calculateKPIs(binSummaries); const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0); const todayCollections = collections.filter(c => c.collectedAt >= todayStart.getTime()); const activeAlerts = alerts.filter(a => a.state === 'active');
    return { ...base, todayCollections: todayCollections.length, totalWasteTodayKg: Math.round(todayCollections.reduce((s, c) => s + c.wasteKg, 0)), activeTrucks: trucks.filter(t => ['active', 'en_route', 'collecting'].includes(t.status)).length, activeAlerts: activeAlerts.length, co2SavedKg: Math.round(dailyAnalytics.reduce((s, d) => s + d.co2SavedKg, 0)), fuelSavedL: Math.round(dailyAnalytics.reduce((s, d) => s + d.fuelUsedL * 0.3, 0) * 10) / 10, collectionEfficiency: dailyAnalytics.length ? Math.round(dailyAnalytics.reduce((s, d) => s + d.efficiency, 0) / dailyAnalytics.length) : 0, avgResponseTimeMins: dailyAnalytics.length ? Math.round(dailyAnalytics.reduce((s, d) => s + d.avgResponseTimeMins, 0) / dailyAnalytics.length) : 0 };
  }, [binSummaries, collections, alerts, trucks, dailyAnalytics]);

  const addBin = useCallback(async (bin: Partial<Bin>) => { if (IS_FIREBASE_CONFIGURED) { const newRef = dbPush(dbRef(db, 'bins')); await dbSet(newRef, bin); } }, []);
  const updateBin = useCallback(async (id: string, data: Partial<Bin>) => { if (IS_DEMO_MODE) setBins(prev => prev.map(b => b.id === id ? { ...b, ...data, live: { ...b.live, ...data.live }, meta: { ...b.meta, ...data.meta }, health: { ...b.health, ...data.health } } : b)); else if (IS_FIREBASE_CONFIGURED) await dbUpdate(dbRef(db, `bins/${id}`), data); }, []);
  const updateTruck = useCallback(async (id: string, data: Partial<Truck>) => { if (IS_DEMO_MODE) setTrucks(prev => prev.map(t => t.id === id ? { ...t, ...data } : t)); else if (IS_FIREBASE_CONFIGURED) await dbUpdate(dbRef(db, `trucks/${id}`), data); }, []);
  const updateRoute = useCallback(async (id: string, data: Partial<CollectionRoute>) => { if (IS_DEMO_MODE) setRoutes(prev => prev.map(r => r.id === id ? { ...r, ...data } : r)); else if (IS_FIREBASE_CONFIGURED) await dbUpdate(dbRef(db, `routes/${id}`), data); }, []);
  const addRoute = useCallback(async (route: CollectionRoute) => { if (IS_DEMO_MODE) setRoutes(prev => [...prev, route]); else if (IS_FIREBASE_CONFIGURED) await dbUpdate(dbRef(db, `routes/${route.id}`), route); }, []);
  const deleteBin = useCallback(async (id: string) => { if (IS_DEMO_MODE) setBins(prev => prev.filter(b => b.id !== id)); else if (IS_FIREBASE_CONFIGURED) await dbRemove(dbRef(db, `bins/${id}`)); }, []);
  const acknowledgeAlert = useCallback(async (id: string) => { if (IS_DEMO_MODE) setAlerts(prev => prev.map(a => a.id === id ? { ...a, state: 'acknowledged', acknowledgedAt: Date.now(), acknowledgedBy: 'demo-admin' } : a)); else if (IS_FIREBASE_CONFIGURED) await dbUpdate(dbRef(db, `alerts/${id}`), { state: 'acknowledged', acknowledgedAt: Date.now() }); }, []);
  const resolveAlert = useCallback(async (id: string) => { if (IS_DEMO_MODE) setAlerts(prev => prev.map(a => a.id === id ? { ...a, state: 'resolved', resolvedAt: Date.now() } : a)); else if (IS_FIREBASE_CONFIGURED) await dbUpdate(dbRef(db, `alerts/${id}`), { state: 'resolved', resolvedAt: Date.now() }); }, []);
  const markNotificationRead = useCallback((id: string) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n)), []);
  const markAllNotificationsRead = useCallback(() => setNotifications(prev => prev.map(n => ({ ...n, read: true }))), []);
  const deleteNotification = useCallback((id: string) => setNotifications(prev => prev.filter(n => n.id !== id)), []);
  const getTodayCollections = useCallback(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return collections.filter(c => c.collectedAt >= d.getTime()); }, [collections]);
  const getBinById = useCallback((id: string) => bins.find(b => b.id === id), [bins]);
  const getHistoryForBin = useCallback((binId: string) => history[binId] ?? [], [history]);

  return <DatabaseContext.Provider value={{ bins, binSummaries, trucks, routes, alerts, notifications, collections, timeline, dailyAnalytics, zoneAnalytics, history, config, users, auditLogs, kpis, loading, addBin, updateBin, deleteBin, updateTruck, updateRoute, addRoute, acknowledgeAlert, resolveAlert, markNotificationRead, markAllNotificationsRead, deleteNotification, getTodayCollections, getBinById, getHistoryForBin }}>{children}</DatabaseContext.Provider>;
};
