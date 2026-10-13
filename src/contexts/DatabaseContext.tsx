import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { db, IS_DEMO_MODE } from '@/lib/firebase';
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

function emptyBin(config: typeof HARDWARE_BINS[number]): Bin {
  const now = Date.now();
  return {
    id: config.id,
    meta: { binId: config.id, deviceId: config.deviceId, label: config.label, zone: config.zone, address: config.address, location: config.location, locationConfigured: Boolean(config.location), depthCm: config.depthCm, thresholdPct: config.thresholdPct, source: 'device', installedAt: now, capacity: 0 },
    live: { distanceCm: config.depthCm, fillPct: 0, binStatus: 'Empty', messageStatus: 'Failed', rssi: 0, batteryPct: 0, uptimeSec: 0, firmware: '-', timestamp: 0 },
    health: { sensorOk: false, wifiOk: false, ledOk: true, buzzerOk: true, oledOk: true, healthScore: 0, lastMaintenance: null },
    reserved: { temperatureC: null, humidityPct: null, gasPpm: null },
  };
}

function toSummary(bin: Bin): BinSummary {
  const lastSeen = bin.live.timestamp || null;
  const isOnline = Boolean(lastSeen && Date.now() - lastSeen <= IOT_CONFIG.OFFLINE_AFTER_MS && bin.health.sensorOk && bin.health.wifiOk);
  return { id: bin.id, deviceId: bin.meta.deviceId, label: bin.meta.label, zone: bin.meta.zone, address: bin.meta.address, location: bin.meta.location, locationConfigured: bin.meta.locationConfigured, fillPct: isOnline ? bin.live.fillPct : 0, distanceCm: isOnline ? bin.live.distanceCm : null, binStatus: isOnline ? bin.live.binStatus : 'Empty', batteryPct: isOnline ? bin.live.batteryPct : 0, rssi: isOnline ? bin.live.rssi : 0, source: bin.meta.source, lastUpdate: lastSeen ?? 0, lastSeen, isOnline, temperatureC: isOnline ? bin.reserved.temperatureC : null, humidityPct: isOnline ? bin.reserved.humidityPct : null, healthScore: isOnline ? bin.health.healthScore : 0, thresholdPct: bin.meta.thresholdPct };
}

export const DatabaseProvider = ({ children }: { children: React.ReactNode }) => {
  const [bins, setBins] = useState<Bin[]>([]); const [trucks, setTrucks] = useState<Truck[]>([]); const [routes, setRoutes] = useState<CollectionRoute[]>([]); const [alerts, setAlerts] = useState<Alert[]>([]); const [notifications, setNotifications] = useState<Notification[]>([]); const [collections, setCollections] = useState<CollectionEvent[]>([]); const [timeline, setTimeline] = useState<TimelineEvent[]>([]); const [dailyAnalytics, setDailyAnalytics] = useState<DailyAnalytics[]>([]); const [zoneAnalytics, setZoneAnalytics] = useState<ZoneAnalytics[]>([]); const [history, setHistory] = useState<Record<string, HistoryEntry[]>>({}); const [config, setConfig] = useState<AppConfig>({ defaultThresholdPct: 80, pollIntervalSec: 15, truckKmPerL: 3.5, co2KgPerL: 2.68, simulationMode: IS_DEMO_MODE }); const [users, setUsers] = useState<AppUser[]>([]); const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]); const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (IS_DEMO_MODE) {
      const mock = getMockData(); setBins(mock.bins.slice(0, 4)); setTrucks(mock.trucks); setRoutes(mock.routes || []); setAlerts(mock.alerts); setNotifications(mock.notifications); setCollections(mock.collections); setTimeline(mock.timeline); setDailyAnalytics(mock.dailyAnalytics); setZoneAnalytics(mock.zoneAnalytics); setHistory(mock.history); setConfig({ ...mock.config, simulationMode: true }); setUsers(mock.users); setAuditLogs(mock.auditLogs); setLoading(false); return;
    }
    const unsubs: Array<() => void> = [];
    unsubs.push(dbOnValue(dbRef(db, 'bins'), snapshot => {
      const data = snapshot.val() || {};
      const liveBins = HARDWARE_BINS.map(cfg => {
        const raw = data[cfg.id] || {};
        const base = emptyBin(cfg);
        const live = raw.live || {};
        const distance = Number(live.distanceCm);
        const fill = Number.isFinite(distance) ? calculateFillFromCalibration(distance) : 0;
        const timestamp = Number(live.timestamp || raw.lastSeen || 0);
        const online = timestamp > 0 && Date.now() - timestamp <= IOT_CONFIG.OFFLINE_AFTER_MS;
        return { ...base, ...raw, id: cfg.id, meta: { ...base.meta, ...(raw.meta || {}), ...cfg, locationConfigured: Boolean(cfg.location) }, live: { ...base.live, ...live, distanceCm: Number.isFinite(distance) ? distance : base.live.distanceCm, fillPct: fill, binStatus: getBinStatus(fill), timestamp }, health: { ...base.health, ...(raw.health || {}), wifiOk: online, sensorOk: online } } as Bin;
      });
      setBins(liveBins); setLoading(false);
    }));
    const listen = <T,>(path: string, setter: (v: T[]) => void) => unsubs.push(dbOnValue(dbRef(db, path), s => { const d = s.val(); setter(d ? Object.entries(d).map(([id, value]) => ({ id, ...(value as object) })) as T[] : []); }));
    listen<Truck>('trucks', setTrucks); listen<Alert>('alerts', setAlerts); listen<CollectionRoute>('routes', setRoutes); listen<CollectionEvent>('collections', setCollections); listen<TimelineEvent>('timeline', setTimeline); listen<Notification>('notifications', setNotifications); listen<DailyAnalytics>('dailyAnalytics', setDailyAnalytics); listen<ZoneAnalytics>('zoneAnalytics', setZoneAnalytics);
    unsubs.push(dbOnValue(dbRef(db, 'history'), s => setHistory((s.val() || {}) as Record<string, HistoryEntry[]>)));
    unsubs.push(dbOnValue(dbRef(db, 'config'), s => { if (s.val()) setConfig({ ...config, ...s.val(), simulationMode: false }); }));
    return () => unsubs.forEach(u => u());
  }, []);

  const binSummaries = useMemo(() => bins.map(toSummary), [bins]);
  const kpis = useMemo((): KPIData => { const base = calculateKPIs(binSummaries); const today = new Date(); today.setHours(0,0,0,0); const todayCollections = collections.filter(c => c.collectedAt >= today.getTime()); return { ...base, todayCollections: todayCollections.length, totalWasteTodayKg: Math.round(todayCollections.reduce((s,c) => s+c.wasteKg,0)), activeTrucks: trucks.filter(t => ['active','en_route','collecting'].includes(t.status)).length, activeAlerts: alerts.filter(a => a.state === 'active').length, co2SavedKg: Math.round(dailyAnalytics.reduce((s,d)=>s+d.co2SavedKg,0)), fuelSavedL: Math.round(dailyAnalytics.reduce((s,d)=>s+d.fuelUsedL*0.3,0)*10)/10, collectionEfficiency: dailyAnalytics.length ? Math.round(dailyAnalytics.reduce((s,d)=>s+d.efficiency,0)/dailyAnalytics.length) : 0, avgResponseTimeMins: dailyAnalytics.length ? Math.round(dailyAnalytics.reduce((s,d)=>s+d.avgResponseTimeMins,0)/dailyAnalytics.length) : 0 }; }, [binSummaries, collections, alerts, trucks, dailyAnalytics]);

  const addBin = useCallback(async (bin: Partial<Bin>) => { if (!IS_DEMO_MODE) { const r = dbPush(dbRef(db,'bins')); await dbSet(r,bin); } }, []);
  const updateBin = useCallback(async (id: string, data: Partial<Bin>) => { if (IS_DEMO_MODE) setBins(p=>p.map(b=>b.id===id?{...b,...data}:b)); else await dbUpdate(dbRef(db,`bins/${id}`),data); }, []);
  const deleteBin = useCallback(async (id: string) => { if (!IS_DEMO_MODE) await dbRemove(dbRef(db,`bins/${id}`)); }, []);
  const updateTruck = useCallback(async (id: string, data: Partial<Truck>) => { if (!IS_DEMO_MODE) await dbUpdate(dbRef(db,`trucks/${id}`),data); }, []);
  const updateRoute = useCallback(async (id: string, data: Partial<CollectionRoute>) => { if (!IS_DEMO_MODE) await dbUpdate(dbRef(db,`routes/${id}`),data); }, []);
  const addRoute = useCallback(async (route: CollectionRoute) => { if (!IS_DEMO_MODE) await dbUpdate(dbRef(db,`routes/${route.id}`),route); }, []);
  const acknowledgeAlert = useCallback(async (id: string) => { if (!IS_DEMO_MODE) await dbUpdate(dbRef(db,`alerts/${id}`),{state:'acknowledged',acknowledgedAt:Date.now()}); }, []);
  const resolveAlert = useCallback(async (id: string) => { if (!IS_DEMO_MODE) await dbUpdate(dbRef(db,`alerts/${id}`),{state:'resolved',resolvedAt:Date.now()}); }, []);
  const markNotificationRead = useCallback((id:string)=>setNotifications(p=>p.map(n=>n.id===id?{...n,read:true}:n)),[]);
  const markAllNotificationsRead = useCallback(()=>setNotifications(p=>p.map(n=>({...n,read:true})),[]);
  const deleteNotification = useCallback((id:string)=>setNotifications(p=>p.filter(n=>n.id!==id)),[]);
  const getTodayCollections = useCallback(()=>{const t=new Date();t.setHours(0,0,0,0);return collections.filter(c=>c.collectedAt>=t.getTime())},[collections]);
  const getBinById = useCallback((id:string)=>bins.find(b=>b.id===id),[bins]);
  const getHistoryForBin = useCallback((id:string)=>history[id]??[],[history]);

  return <DatabaseContext.Provider value={{ bins, binSummaries, trucks, routes, alerts, notifications, collections, timeline, dailyAnalytics, zoneAnalytics, history, config, users, auditLogs, kpis, loading, addBin, updateBin, deleteBin, updateTruck, updateRoute, addRoute, acknowledgeAlert, resolveAlert, markNotificationRead, markAllNotificationsRead, deleteNotification, getTodayCollections, getBinById, getHistoryForBin }}>{children}</DatabaseContext.Provider>;
};
