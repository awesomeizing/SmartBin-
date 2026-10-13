import { useMemo, useState } from 'react';
import { useDatabase } from '@/contexts/DatabaseContext';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge, OnlineBadge, SourceBadge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/progress';
import { formatRelativeTime, formatSignal, formatTemperature, formatHumidity } from '@/lib/formatters';
import { getFillColor } from '@/lib/calculations';
import { MAP_CONFIG } from '@/constants';
import { Search, X, MapPin, Battery, Wifi, Thermometer, Droplets, Clock, Navigation } from 'lucide-react';
import type { BinSummary, RouteStop } from '@/types';

// Fix Leaflet's default icon path issues in Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

/** Custom marker showing fill level as a color-coded circle */
function createBinIcon(fillPct: number, isOnline: boolean): L.DivIcon {
  const color = isOnline ? getFillColor(fillPct) : '#52525b';
  const size = fillPct >= 80 ? 18 : 14;
  const glow = fillPct >= 80 ? `0 0 12px ${color}80` : `0 0 8px ${color}40`;
  const pulse = fillPct >= 80 ? 'animation: pulse 2s infinite;' : '';

  return L.divIcon({
    className: 'custom-div-icon bg-transparent',
    html: `<div style="
      background-color: ${color};
      width: ${size}px; height: ${size}px;
      border-radius: 50%;
      border: 2px solid rgba(0,0,0,0.5);
      box-shadow: ${glow};
      ${pulse}
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function createTruckIcon(status: string): L.DivIcon {
  const color = status === 'en_route' || status === 'collecting' ? '#22c55e' : 
                status === 'idle' ? '#3b82f6' : '#f59e0b';
                
  return L.divIcon({
    className: 'custom-div-icon bg-transparent',
    html: `<div style="
      background-color: ${color};
      width: 24px; height: 24px;
      border-radius: 6px;
      border: 2px solid rgba(0,0,0,0.8);
      box-shadow: 0 0 10px ${color}80;
      display: flex; align-items: center; justify-content: center;
      color: white;
    "><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 17h4V5H2v12h3"/><path d="M20 17h2v-9h-5V5H14v12h3"/><path d="M13 17h1"/><circle cx="8.5" cy="17.5" r="2.5"/><circle cx="18.5" cy="17.5" r="2.5"/></svg></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

export function MapView() {
  const { binSummaries, trucks, routes, loading } = useDatabase();
  const [search, setSearch] = useState('');
  const [selectedBin, setSelectedBin] = useState<BinSummary | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    return binSummaries.filter(bin => {
      const matchesSearch = !search ||
        bin.label.toLowerCase().includes(search.toLowerCase()) ||
        bin.id.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || bin.binStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [binSummaries, search, statusFilter]);

  // Detect bins with unconfigured (zero) coordinates
  const IS_LIVE = !filtered.some(b => b.source === 'simulated' || b.source === 'placeholder');
  const binsWithCoords = filtered.filter(bin => {
    const { lat, lng } = bin.location;
    return Math.abs(lat) > 0.001 || Math.abs(lng) > 0.001;
  });
  const hasLocations = binsWithCoords.length > 0;

  const position: [number, number] = [MAP_CONFIG.CENTER.lat, MAP_CONFIG.CENTER.lng];

  return (
    <div className="h-full flex flex-col space-y-6 animate-fade-in max-w-[1600px] mx-auto pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/[0.05] pb-6">
        <div>
          <h1 className="text-2xl font-display font-medium tracking-tight">Geospatial Intelligence</h1>
          <p className="text-zinc-500 text-sm mt-1">
            {IS_LIVE
              ? `Real-time view of ${binSummaries.length} active IoT nodes.`
              : `Demo view of ${binSummaries.length} simulated bins — configure Firebase for live coordinates.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {['all', 'Empty', 'Half', 'Full'].map(status => (
            <Button
              key={status}
              variant={statusFilter === status ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter(status)}
              className="text-xs"
            >
              {status === 'all' ? 'All' : status}
            </Button>
          ))}
        </div>
      </div>

      {/* Map + Panel Layout */}
      <div className="flex-1 flex gap-4 min-h-[500px]">
        {/* Map */}
        <div className="flex-1 bg-white/[0.01] border border-white/[0.05] rounded-2xl overflow-hidden relative shadow-2xl shadow-black/50">
          {/* Search overlay */}
          <div className="absolute top-4 left-4 z-[1000] w-72">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
              <input
                placeholder="Search bins..."
                className="w-full pl-9 pr-4 py-2 bg-zinc-950/90 backdrop-blur-xl border border-white/10 rounded-xl text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/20"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <MapContainer center={position} zoom={MAP_CONFIG.ZOOM} style={{ height: '100%', width: '100%', backgroundColor: '#000' }}>
            <TileLayer url={MAP_CONFIG.TILE_URL} attribution={MAP_CONFIG.TILE_ATTRIBUTION} />

            {/* Live mode: warn if physical bin locations have not been configured */}
            {IS_LIVE && !hasLocations && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-[1001] rounded-2xl">
                <div className="text-center px-6 py-4 bg-zinc-900/95 border border-white/10 rounded-xl">
                  <p className="text-amber-400 font-mono font-bold text-sm mb-1">Bin locations not configured</p>
                  <p className="text-zinc-400 text-xs">Update bin coordinates in Settings → Bins once physical positions are surveyed.</p>
                </div>
              </div>
            )}

            {/* Render bins — skip those with unconfigured (0,0) coordinates in live mode */}
            {!loading && filtered
              .filter(bin => !IS_LIVE || (Math.abs(bin.location.lat) > 0.001 || Math.abs(bin.location.lng) > 0.001))
              .map(bin => (
              <Marker
                key={bin.id}
                position={[bin.location.lat, bin.location.lng]}
                icon={createBinIcon(bin.fillPct, bin.isOnline)}
                eventHandlers={{
                  click: () => setSelectedBin(bin),
                }}
              >
                <Popup className="custom-popup">
                  <div className="p-3 min-w-[200px] bg-zinc-950/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl text-white">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium text-sm tracking-tight">{bin.label}</span>
                      <SourceBadge source={bin.source} />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-zinc-500 text-[10px] font-mono uppercase tracking-widest">Fill</span>
                        <span className="font-mono text-xs" style={{ color: getFillColor(bin.fillPct) }}>{bin.fillPct}%</span>
                      </div>
                      <ProgressBar value={bin.fillPct} size="sm" />
                      <div className="flex justify-between items-center">
                        <span className="text-zinc-500 text-[10px] font-mono uppercase tracking-widest">Battery</span>
                        <span className="font-mono text-xs text-zinc-400">{bin.batteryPct}%</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-zinc-500 text-[10px] font-mono uppercase tracking-widest">Signal</span>
                        <span className="font-mono text-xs text-zinc-400">{formatSignal(bin.rssi)}</span>
                      </div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Render the pre-seeded model route (looped) */}
            {!loading && routes.map(route => {
              if (route.status === 'completed') return null;
              const truck = trucks.find(t => t.id === route.truckId);
              if (!truck) return null;

              // Build a closed-loop route: bin stops + return to first stop
              const loopPositions: [number, number][] = [
                ...route.stops.map((s: RouteStop) => [s.location.lat, s.location.lng] as [number, number]),
                [route.stops[0].location.lat, route.stops[0].location.lng] as [number, number],
              ];

              return (
                <Polyline 
                  key={route.id} 
                  positions={loopPositions} 
                  color="#ef4444" 
                  weight={3} 
                  opacity={0.7}
                  dashArray="10, 8" 
                />
              );
            })}

            {/* Render trucks */}
            {!loading && trucks.map(truck => (
              <Marker
                key={truck.id}
                position={[truck.position.lat, truck.position.lng]}
                icon={createTruckIcon(truck.status)}
              >
                <Popup className="custom-popup">
                  <div className="p-3 bg-zinc-950/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl text-white">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm tracking-tight">{truck.label}</span>
                      <span className="text-xs text-zinc-400 capitalize">{truck.status.replace('_', ' ')}</span>
                    </div>
                    <div className="space-y-1 text-xs text-zinc-400">
                      <p>Driver: {truck.driver?.name || 'Unassigned'}</p>
                      <p>Load: {Math.round((truck.currentLoadLiters / truck.capacityLiters) * 100)}%</p>
                      <p>Fuel: {truck.fuelLevelPct}%</p>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        {/* Detail Panel */}
        {selectedBin && (
          <div className="w-80 shrink-0 hidden lg:block">
            <Card className="bg-white/[0.01] border-white/[0.05] h-full">
              <CardContent className="p-5">
                {/* Close */}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-white">{selectedBin.label}</h3>
                  <button onClick={() => setSelectedBin(null)} className="text-zinc-500 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2 mb-6">
                  <StatusBadge status={selectedBin.binStatus} />
                  <OnlineBadge online={selectedBin.isOnline} />
                  <SourceBadge source={selectedBin.source} />
                </div>

                {/* Fill Level */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Fill Level</span>
                    <span className="text-2xl font-mono font-medium" style={{ color: getFillColor(selectedBin.fillPct) }}>
                      {selectedBin.fillPct}%
                    </span>
                  </div>
                  <ProgressBar value={selectedBin.fillPct} size="lg" />
                </div>

                {/* Metrics */}
                <div className="space-y-4">
                  {[
                    { icon: Battery, label: 'Battery', value: `${selectedBin.batteryPct}%` },
                    { icon: Wifi, label: 'Signal', value: `${formatSignal(selectedBin.rssi)} (${selectedBin.rssi}dBm)` },
                    { icon: Thermometer, label: 'Temperature', value: formatTemperature(selectedBin.temperatureC) },
                    { icon: Droplets, label: 'Humidity', value: formatHumidity(selectedBin.humidityPct) },
                    { icon: MapPin, label: 'Zone', value: selectedBin.zone },
                    { icon: Navigation, label: 'Address', value: selectedBin.address },
                    { icon: Clock, label: 'Last Update', value: formatRelativeTime(selectedBin.lastUpdate) },
                  ].map((metric, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white/[0.03] flex items-center justify-center shrink-0">
                        <metric.icon className="w-4 h-4 text-zinc-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">{metric.label}</p>
                        <p className="text-sm text-zinc-200 truncate">{metric.value}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Coordinates */}
                <div className="mt-6 pt-4 border-t border-white/[0.05]">
                  <p className="text-[10px] font-mono text-zinc-600">
                    {selectedBin.id} · {selectedBin.location.lat.toFixed(4)}, {selectedBin.location.lng.toFixed(4)}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
