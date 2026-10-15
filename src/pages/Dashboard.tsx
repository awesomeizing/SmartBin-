import { useDatabase } from '@/contexts/DatabaseContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { KPICard } from '@/components/dashboard/KPICard';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { AlertsPanel } from '@/components/dashboard/AlertsPanel';
import { BinCard } from '@/components/dashboard/BinCard';
import { SimulationBanner } from '@/components/dashboard/SimulationBanner';
import { SkeletonCard, SkeletonChart } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  Box, Wifi, WifiOff, AlertTriangle, BarChart3, Activity,
  Recycle, TrendingUp, Zap, MapPin
} from 'lucide-react';
import { CHART_THEME, FILL_BANDS } from '@/constants';
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MAP_CONFIG } from '@/constants';
import { getFillColor } from '@/lib/calculations';

// ── Chart tooltip styling ──────────────────────────────────

const tooltipStyle = {
  contentStyle: {
    backgroundColor: CHART_THEME.tooltipBg,
    border: `1px solid ${CHART_THEME.tooltipBorder}`,
    borderRadius: '12px',
    backdropFilter: 'blur(12px)',
    fontSize: '12px',
    padding: '8px 12px',
  },
  itemStyle: { color: '#fff' },
  labelStyle: { color: '#a1a1aa', fontSize: '11px', marginBottom: '4px' },
};

function createMiniMapBinIcon(fillPct: number): L.DivIcon {
  const color = getFillColor(fillPct);
  const size = fillPct >= 80 ? 14 : 10;
  return L.divIcon({
    className: 'custom-div-icon bg-transparent',
    html: `<div style="
      background-color: ${color};
      width: ${size}px; height: ${size}px;
      border-radius: 50%;
      border: 2px solid rgba(0,0,0,0.5);
      box-shadow: 0 0 8px ${color}60;
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export function Dashboard() {
  const {
    kpis, alerts, timeline, dailyAnalytics, binSummaries,
    routes, trucks, loading, acknowledgeAlert, resolveAlert, isSimulationMode,
    isHardwareConnected,
  } = useDatabase();

  if (loading) {
    return (
      <div className="space-y-8 animate-fade-in pb-12 max-w-7xl mx-auto">
        <div className="border-b border-white/[0.05] pb-6">
          <div className="h-7 w-48 bg-white/[0.06] rounded animate-pulse" />
          <div className="h-4 w-72 bg-white/[0.06] rounded animate-pulse mt-2" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonChart />
          <SkeletonChart />
        </div>
      </div>
    );
  }

  // ── Computed values ────────────────────────────────────────

  // The 4 physical bins, sorted by ID (BIN-01 … BIN-04)
  const fourBins = [...binSummaries].sort((a, b) => a.id.localeCompare(b.id));

  // System-level buzzer/collection state
  const anyFull = fourBins.some(b => b.isOnline && b.fillPct >= 80);

  // ── Chart Data ────────────────────────────────────────────

  const weeklyData = dailyAnalytics.slice(-7).map(d => ({
    name: new Date(d.date).toLocaleDateString('en', { weekday: 'short' }),
    waste: d.totalWasteKg,
    collections: d.totalCollections,
    efficiency: d.efficiency,
  }));

  // Bin distribution for pie chart
  const distributionData = [
    { name: 'OK',      value: kpis.healthyBins,  color: FILL_BANDS.HEALTHY.color },
    { name: 'Filling', value: kpis.warningBins,  color: FILL_BANDS.WARNING.color },
    { name: 'Full',    value: kpis.fullBins,      color: FILL_BANDS.CRITICAL.color },
  ].filter(d => d.value > 0);

  // Top bins by fill level (online only, for the recommendations panel)
  const topBins = [...binSummaries]
    .filter(b => b.isOnline)
    .sort((a, b) => b.fillPct - a.fillPct)
    .slice(0, 4);

  // Route & mini-map
  const activeRoute = routes.find(r => r.status === 'in_progress');
  const activeTruck = trucks.find(t => t.id === activeRoute?.truckId);
  const routePositions: [number, number][] = activeRoute
    ? [
        ...activeRoute.stops.map(s => [s.location.lat, s.location.lng] as [number, number]),
        [activeRoute.stops[0].location.lat, activeRoute.stops[0].location.lng] as [number, number],
      ]
    : [];

  // Average fill label — '--' when all bins are offline
  const avgFillLabel = kpis.avgFillPct < 0 ? '--' : `${kpis.avgFillPct}%`;

  return (
    <div className="space-y-8 animate-fade-in pb-12 max-w-7xl mx-auto">
      {/* Simulation Mode Banner (hidden when real hardware is streaming) */}
      <SimulationBanner visible={isSimulationMode && !isHardwareConnected} />

      {/* Live Hardware Banner when active */}
      {isHardwareConnected && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-sm">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400" />
            </span>
            <div>
              <span className="font-mono font-bold text-emerald-400 text-xs uppercase tracking-wider">
                LIVE HARDWARE FEED ACTIVE
              </span>
              <span className="text-zinc-300 text-xs ml-2">
                — Real-time ultrasonic sensor stream is active. Moving objects or hands will update fill levels live.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="flex items-center justify-between border-b border-white/[0.05] pb-6">
        <div>
          <h1 className="text-2xl font-display font-medium tracking-tight">SmartBin Dashboard</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Real-time status of{' '}
            <span className="text-white font-mono">4</span> physical bins.
            {anyFull && (
              <span className="ml-2 text-red-400 font-medium animate-pulse">⚠ Collection Required</span>
            )}
          </p>
        </div>
        <div className="hidden md:flex items-center gap-3">
          <Badge variant="success" dot pulse size="md">
            {kpis.onlineBins} Online
          </Badge>
          <Badge variant="default" size="md">
            {kpis.totalBins} Bins
          </Badge>
        </div>
      </div>

      {/* ── 4-Bin Card Grid ────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Live Bin Status
        </h2>
        {/* Desktop: 4 columns | Tablet: 2×2 | Mobile: 1×4 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {fourBins.map(bin => (
            <BinCard key={bin.id} bin={bin} linkable />
          ))}
        </div>
      </div>

      {/* ── KPI Row — 6 Cards ────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KPICard
          title="Total Bins"
          value={kpis.totalBins}
          icon={<Box className="w-4 h-4" />}
          trend={{ value: '4 physical units', direction: 'neutral' }}
          color="#3b82f6"
          delay={0}
        />
        <KPICard
          title="Online"
          value={kpis.onlineBins}
          icon={<Wifi className="w-4 h-4" />}
          trend={{ value: `${Math.round((kpis.onlineBins / Math.max(kpis.totalBins, 1)) * 100)}%`, direction: 'up', isGood: true }}
          color="#22c55e"
          delay={80}
        />
        <KPICard
          title="Offline"
          value={kpis.offlineBins}
          icon={<WifiOff className="w-4 h-4" />}
          trend={{ value: kpis.offlineBins > 0 ? 'Check sensors' : 'All clear', direction: kpis.offlineBins > 0 ? 'up' : 'neutral', isGood: kpis.offlineBins === 0 }}
          color={kpis.offlineBins > 0 ? '#ef4444' : '#22c55e'}
          delay={160}
        />
        <KPICard
          title="Full"
          value={kpis.fullBins}
          icon={<AlertTriangle className="w-4 h-4" />}
          trend={{ value: kpis.fullBins > 0 ? 'Collection needed' : 'Healthy', direction: kpis.fullBins > 0 ? 'up' : 'neutral', isGood: kpis.fullBins === 0 }}
          color={kpis.fullBins > 0 ? '#ef4444' : '#22c55e'}
          delay={240}
        />
        <KPICard
          title="Collections Today"
          value={kpis.todayCollections}
          icon={<Recycle className="w-4 h-4" />}
          trend={{ value: `${kpis.totalWasteTodayKg}kg collected`, direction: 'up', isGood: true }}
          color="#8b5cf6"
          delay={320}
        />
        <KPICard
          title="Avg Fill"
          value={avgFillLabel}
          icon={<BarChart3 className="w-4 h-4" />}
          trend={{ value: kpis.avgFillPct < 0 ? 'All bins offline' : 'Online bins only', direction: 'neutral' }}
          color="#f59e0b"
          delay={400}
        />
      </div>

      {/* ── Charts Row ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Weekly Waste Area Chart */}
        <Card className="bg-white/[0.01] border-white/[0.05]">
          <CardHeader className="border-b border-white/[0.05]">
            <CardTitle className="text-sm font-medium tracking-tight flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-zinc-500" />
              Weekly Waste Collection (kg)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] p-6">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ffffff" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="#ffffff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridColor} vertical={false} />
                <XAxis dataKey="name" stroke={CHART_THEME.axisColor} fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke={CHART_THEME.axisColor} fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} />
                <Area type="monotone" dataKey="waste" stroke="#ffffff" strokeWidth={2} fillOpacity={1} fill="url(#fillGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Collection Trends Bar Chart */}
        <Card className="bg-white/[0.01] border-white/[0.05]">
          <CardHeader className="border-b border-white/[0.05]">
            <CardTitle className="text-sm font-medium tracking-tight flex items-center gap-2">
              <Recycle className="w-4 h-4 text-zinc-500" />
              Daily Collections Count
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] p-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridColor} vertical={false} />
                <XAxis dataKey="name" stroke={CHART_THEME.axisColor} fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke={CHART_THEME.axisColor} fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
                <Bar dataKey="collections" fill="#52525b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Second Charts Row ────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Bin Status Distribution Pie */}
        <Card className="bg-white/[0.01] border-white/[0.05]">
          <CardHeader className="border-b border-white/[0.05]">
            <CardTitle className="text-sm font-medium tracking-tight">Bin Status Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px] p-6 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={distributionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  dataKey="value"
                  stroke="none"
                  paddingAngle={3}
                >
                  {distributionData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip {...tooltipStyle} />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  iconSize={8}
                  formatter={(value: string) => <span className="text-xs text-zinc-400 ml-1">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Efficiency Trend */}
        <Card className="bg-white/[0.01] border-white/[0.05]">
          <CardHeader className="border-b border-white/[0.05]">
            <CardTitle className="text-sm font-medium tracking-tight flex items-center gap-2">
              <Zap className="w-4 h-4 text-zinc-500" />
              Collection Efficiency (%)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[280px] p-6">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weeklyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridColor} vertical={false} />
                <XAxis dataKey="name" stroke={CHART_THEME.axisColor} fontSize={12} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} stroke={CHART_THEME.axisColor} fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} />
                <Line type="monotone" dataKey="efficiency" stroke="#22c55e" strokeWidth={2} dot={{ r: 4, fill: '#22c55e', strokeWidth: 0 }} activeDot={{ r: 6, fill: '#fff' }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Bins by Fill Level */}
        <Card className="bg-white/[0.01] border-white/[0.05]">
          <CardHeader className="border-b border-white/[0.05] flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium tracking-tight flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Bins by Fill Level
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-white/[0.03]">
              {topBins.length > 0 ? topBins.map((bin) => (
                <div key={bin.id} className="flex items-center justify-between px-6 py-3 hover:bg-white/[0.02] transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">{bin.label}</p>
                    <p className="text-[10px] font-mono text-zinc-600">{bin.id} · {bin.zone}</p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${bin.fillPct}%`,
                            backgroundColor: bin.fillPct >= 80 ? '#ef4444' : bin.fillPct >= 50 ? '#f59e0b' : '#22c55e',
                          }}
                        />
                      </div>
                      <span className="text-xs font-mono text-zinc-400 w-8 text-right">{bin.fillPct}%</span>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="px-6 py-8 text-center text-xs font-mono text-zinc-600">
                  No bins online
                </div>
              )}
            </div>
            <div className="p-4 border-t border-white/[0.05]">
              <p className="text-xs text-zinc-500 mb-2">Route Optimisation</p>
              <Button className="w-full text-xs shadow-xl shadow-white/5" variant="secondary" onClick={() => window.location.href='/trucks'}>
                View Fleet Routing
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Route Map + Bin Status Panel ─────────────────────── */}
      {activeRoute && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Active Route Mini-Map */}
          <Card className="bg-white/[0.01] border-white/[0.05] lg:col-span-2">
            <CardHeader className="border-b border-white/[0.05]">
              <CardTitle className="text-sm font-medium tracking-tight flex items-center gap-2">
                <MapPin className="w-4 h-4 text-zinc-500" />
                Active Route Map
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 h-[280px] overflow-hidden rounded-b-2xl">
              <MapContainer
                center={[12.9600, 77.4900]}
                zoom={16}
                style={{ height: '100%', width: '100%', backgroundColor: '#000' }}
                zoomControl={false}
                attributionControl={false}
              >
                <TileLayer url={MAP_CONFIG.TILE_URL} />
                {routePositions.length > 0 && (
                  <Polyline
                    positions={routePositions}
                    color="#ef4444"
                    weight={3}
                    opacity={0.8}
                    dashArray="8, 6"
                  />
                )}
                {fourBins.map(bin => (
                  <Marker
                    key={bin.id}
                    position={[bin.location.lat, bin.location.lng]}
                    icon={createMiniMapBinIcon(bin.isOnline ? bin.fillPct : 0)}
                  />
                ))}
                {activeTruck && (
                  <Marker
                    position={[activeTruck.position.lat, activeTruck.position.lng]}
                    icon={L.divIcon({
                      className: 'custom-div-icon bg-transparent',
                      html: `<div style="
                        background-color: #22c55e;
                        width: 16px; height: 16px;
                        border-radius: 4px;
                        border: 2px solid rgba(0,0,0,0.8);
                        box-shadow: 0 0 10px rgba(34,197,94,0.6);
                      "></div>`,
                      iconSize: [16, 16],
                      iconAnchor: [8, 8],
                    })}
                  />
                )}
              </MapContainer>
            </CardContent>
          </Card>

          {/* System Status Summary */}
          <Card className="bg-white/[0.01] border-white/[0.05]">
            <CardHeader className="border-b border-white/[0.05]">
              <CardTitle className="text-sm font-medium tracking-tight flex items-center gap-2">
                <Activity className="w-4 h-4 text-zinc-500" />
                System Status
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-3">
              {fourBins.map(bin => (
                <div key={bin.id} className="flex items-center justify-between">
                  <span className="text-sm font-mono text-zinc-400">{bin.label}</span>
                  <div className="flex items-center gap-2">
                    {bin.isOnline ? (
                      <>
                        <div className="w-20 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${bin.fillPct}%`,
                              backgroundColor: bin.fillPct >= 80 ? '#ef4444' : bin.fillPct >= 50 ? '#f59e0b' : '#22c55e',
                            }}
                          />
                        </div>
                        <span className={`text-xs font-mono font-bold w-8 text-right ${bin.fillPct >= 80 ? 'text-red-400' : bin.fillPct >= 50 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {bin.fillPct}%
                        </span>
                      </>
                    ) : (
                      <span className="text-xs font-mono text-zinc-600">Offline</span>
                    )}
                  </div>
                </div>
              ))}
              <div className="pt-3 border-t border-white/[0.05]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-zinc-500">Buzzer / Collection</span>
                  <span className={`text-xs font-mono font-bold ${anyFull ? 'text-red-400 animate-pulse' : 'text-zinc-600'}`}>
                    {anyFull ? 'ACTIVE' : 'Idle'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Activity & Alerts Row ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Live Activity Feed */}
        <Card className="bg-white/[0.01] border-white/[0.05]">
          <CardHeader className="border-b border-white/[0.05]">
            <CardTitle className="text-sm font-medium tracking-tight flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-zinc-500" />
                Live Activity
              </span>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 py-2">
            <ActivityFeed events={timeline} maxItems={8} />
          </CardContent>
        </Card>

        {/* Active Alerts */}
        <Card className="bg-white/[0.01] border-white/[0.05]">
          <CardHeader className="border-b border-white/[0.05]">
            <CardTitle className="text-sm font-medium tracking-tight flex items-center justify-between">
              <span className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-zinc-500" />
                Active Alerts
              </span>
              <Badge variant={kpis.activeAlerts > 0 ? 'danger' : 'success'} size="md">
                {kpis.activeAlerts}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 py-2">
            <AlertsPanel
              alerts={alerts}
              maxItems={6}
              onAcknowledge={acknowledgeAlert}
              onResolve={resolveAlert}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
