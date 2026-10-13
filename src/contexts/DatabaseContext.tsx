import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { db, IS_DEMO_MODE } from '@/lib/firebase';
import { ref as dbRef, onValue as dbOnValue, set as dbSet, push as dbPush, remove as dbRemove, update as dbUpdate } from 'firebase/database';
import { getMockData } from '@/services/mockData';
import type { Bin, BinSummary, Truck, Alert, CollectionEvent, TimelineEvent, DailyAnalytics, ZoneAnalytics, Notification, AppConfig, AppUser, AuditLogEntry, HistoryEntry, KPIData, CollectionRoute } from '@/types';
import { calculateKPIs } from '@/lib/calculations';
import { useLiveBins } from '@/hooks/useLiveBins';
import { isRegisteredBin } from '@/config/devices.config';
import { liveBinToBin, liveBinToSummary } from '@/lib/binAdapter';
import type { FleetStats, LiveBinState } from '@/lib/telemetry';

// ── Context Type ───────────────────────────────────────────

interface DatabaseContextType {
  // ── Physical devices ───────────────────────────────────
  /**
   * THE canonical state of the four physical bins. Dashboard, map, alerts,
   * charts and the detail page all render from this one array.
   */
  liveBins: LiveBinState[];
  /** Fleet statistics derived from `liveBins`. Never hard-coded. */
  fleetStats: FleetStats;
  /** Transport error, e.g. Firebase unreachable or permission denied. */
  deviceError: string | null;

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

export const useDatabase = () => {
  const context = useContext(DatabaseContext);
  if (!context) throw new Error('useDatabase must be used within a DatabaseProvider');
  return context;
};

// ── Provider ───────────────────────────────────────────────

export const DatabaseProvider = ({ children }: { children: React.ReactNode }) => {
  // ── Physical devices ─────────────────────────────────────
  // The four real bins come from the live telemetry layer, never from mock
  // data. `bins` and `binSummaries` below are PROJECTIONS of this — there is
  // no second bin dataset anywhere in the app.
  const { bins: liveBins, stats: fleetStats, loading: binsLoading, error: deviceError } =
    useLiveBins();

  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [routes, setRoutes] = useState<CollectionRoute[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [collections, setCollections] = useState<CollectionEvent[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [dailyAnalytics, setDailyAnalytics] = useState<DailyAnalytics[]>([]);
  const [zoneAnalytics, setZoneAnalytics] = useState<ZoneAnalytics[]>([]);
  const [history, setHistory] = useState<Record<string, HistoryEntry[]>>({});
  const [config, setConfig] = useState<AppConfig>({ defaultThresholdPct: 80, pollIntervalSec: 60, truckKmPerL: 3.5, co2KgPerL: 2.68, simulationMode: true });
  const [users, setUsers] = useState<AppUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Load Data ────────────────────────────────────────────

  useEffect(() => {
    if (IS_DEMO_MODE) {
      // NOTE: mock data no longer supplies BINS — those always come from the
      // live telemetry layer. What remains here is fleet/analytics scaffolding
      // (trucks, routes, historical reports) that has no hardware behind it.
      const mock = getMockData();
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

    // Bins are NOT subscribed here — `useLiveBins` owns that subscription so
    // there is a single listener and a single source of bin state.
    setLoading(false);

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

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, []);

  // ── Computed Values ──────────────────────────────────────

  // Projections of the canonical live state for legacy consumers.
  const bins = useMemo(() => liveBins.map(liveBinToBin), [liveBins]);
  const binSummaries = useMemo(() => liveBins.map(liveBinToSummary), [liveBins]);

  const kpis = useMemo((): KPIData => {
    const base = calculateKPIs(binSummaries);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayCollections = collections.filter(c => c.collectedAt >= todayStart.getTime());
    const activeAlerts = alerts.filter(a => a.state === 'active');

    return {
      ...base,
      // Bin counts come from the physical fleet, never from a literal.
      totalBins: fleetStats.total,
      onlineBins: fleetStats.online,
      offlineBins: fleetStats.offline + fleetStats.waiting,
      fullBins: fleetStats.full,
      warningBins: fleetStats.filling,
      healthyBins: fleetStats.ok,
      // Null (no trustworthy readings) surfaces as 0 only in this legacy KPI
      // shape; views that must not fabricate read fleetStats.avgFillPct.
      avgFillPct: fleetStats.avgFillPct ?? 0,
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
  }, [binSummaries, fleetStats, collections, alerts, trucks, dailyAnalytics]);

  // ── Actions ──────────────────────────────────────────────

  /**
   * Provision a new bin record.
   *
   * Physical bins are registered in src/config/devices.config.ts; this only
   * seeds the matching database node.
   */
  const addBin = useCallback(async (bin: Partial<Bin>) => {
    const newRef = dbPush(dbRef(db, 'bins'));
    await dbSet(newRef, bin);
  }, []);

  /**
   * Update a bin's stored record.
   *
   * Live telemetry is written by the DEVICE, not from the browser — this is
   * for metadata (label, surveyed location, threshold). It never fabricates
   * a reading.
   */
  const updateBin = useCallback(async (id: string, data: Partial<Bin>) => {
    if (!isRegisteredBin(id)) {
      console.warn(`[db] refusing to update unregistered bin "${id}"`);
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

  /**
   * Remove a bin's stored record.
   *
   * The four physical bins are defined in src/config/devices.config.ts and
   * cannot be deleted from the UI — a bin exists because it is bolted to a
   * wall, not because a row exists in a database.
   */
  const deleteBin = useCallback(async (id: string) => {
    if (isRegisteredBin(id)) {
      console.warn(
        `[db] "${id}" is a registered physical bin — remove it from ` +
        'src/config/devices.config.ts instead.',
      );
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

  const getBinById = useCallback((id: string) => bins.find(b => b.id === id), [bins]);

  const getHistoryForBin = useCallback((binId: string) => history[binId] ?? [], [history]);

  // ── Value ────────────────────────────────────────────────

  const value: DatabaseContextType = {
    liveBins, fleetStats, deviceError,
    bins, binSummaries, trucks, routes, alerts, notifications, collections,
    timeline, dailyAnalytics, zoneAnalytics, history, config, users, auditLogs, kpis,
    loading: loading || binsLoading,
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
