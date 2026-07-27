import { useState, useMemo } from 'react';
import { useDatabase } from '@/contexts/DatabaseContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { ProgressBar } from '@/components/ui/progress';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs } from '@/components/ui/tabs';
import {
  Search, Truck, Fuel, Navigation, Package, Route as RouteIcon
} from 'lucide-react';
import type { Truck as TruckType, TruckStatus } from '@/types';
import { RouteOptimizer } from '@/services/fleet/RouteOptimizer';

const statusConfig: Record<TruckStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'default' }> = {
  active: { label: 'Active', variant: 'success' },
  en_route: { label: 'En Route', variant: 'info' },
  collecting: { label: 'Collecting', variant: 'warning' },
  idle: { label: 'Idle', variant: 'default' },
  maintenance: { label: 'Maintenance', variant: 'danger' },
};

function TruckCard({ truck }: { truck: TruckType }) {
  const config = statusConfig[truck.status];
  const loadPct = Math.round((truck.currentLoadLiters / truck.capacityLiters) * 100);

  return (
    <Card className="bg-white/[0.01] border-white/[0.05] hover:bg-white/[0.02] transition-all group">
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-base font-medium text-white">{truck.label}</h3>
            <p className="text-xs font-mono text-zinc-600 mt-0.5">{truck.plateNumber}</p>
          </div>
          <Badge variant={config.variant} dot size="md">{config.label}</Badge>
        </div>

        {/* Driver */}
        {truck.driver && (
          <div className="flex items-center gap-3 mb-5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.03]">
            <Avatar name={truck.driver.name} size="sm" />
            <div>
              <p className="text-sm text-zinc-200">{truck.driver.name}</p>
              <p className="text-[10px] font-mono text-zinc-600">{truck.driver.phone}</p>
            </div>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div className="space-y-1">
            <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">Collections</span>
            <p className="text-lg font-mono text-white">{truck.todayCollections}</p>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">Distance</span>
            <p className="text-lg font-mono text-white">{truck.totalKmToday.toFixed(1)}km</p>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">Fuel</span>
            <ProgressBar value={truck.fuelLevelPct} size="sm" showLabel />
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">Load</span>
            <ProgressBar value={loadPct} size="sm" showLabel />
          </div>
        </div>

        {/* Route Progress */}
        {truck.assignedRoute.length > 0 && (
          <div className="pt-4 border-t border-white/[0.05]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">Route Progress</span>
              <span className="text-[10px] font-mono text-zinc-400">{truck.assignedRoute.length} stops</span>
            </div>
            <div className="flex items-center gap-1">
              {truck.assignedRoute.map((binId, i) => (
                <div key={binId} className="flex items-center gap-1 flex-1">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    i === 0 ? 'bg-emerald-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]' : 'bg-white/10'
                  }`} />
                  {i < truck.assignedRoute.length - 1 && (
                    <div className="h-px flex-1 bg-white/[0.05]" />
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1 mt-2">
              {truck.assignedRoute.map((binId) => (
                <span key={binId} className="text-[8px] font-mono text-zinc-700 flex-1 text-center truncate">
                  {binId}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function Trucks() {
  const { trucks, binSummaries, updateTruck, addRoute } = useDatabase();
  const [search, setSearch] = useState('');
  const [isPlanning, setIsPlanning] = useState(false);

  const handlePlanRoute = async () => {
    setIsPlanning(true);
    // Find an available truck
    const availableTruck = trucks.find(t => t.status === 'idle');
    if (!availableTruck) {
      alert("No idle trucks available for dispatch.");
      setIsPlanning(false);
      return;
    }

    // Generate Route (assuming depot is at [12.96, 77.49] or truck current position)
    const routePlan = RouteOptimizer.generateOptimizedRoute(
      binSummaries,
      availableTruck.position,
      availableTruck.capacityLiters,
      75 // target bins > 75% fill
    );

    if (routePlan.stops.length === 0) {
      alert("No bins currently require collection based on priority rules.");
      setIsPlanning(false);
      return;
    }

    const routeId = `rte_${Date.now()}`;
    await addRoute({
      id: routeId,
      truckId: availableTruck.id,
      stops: routePlan.stops,
      optimizedKm: routePlan.totalKm,
      traditionalKm: routePlan.totalKm * 1.3,
      savedKm: routePlan.totalKm * 0.3,
      fuelSavedL: (routePlan.totalKm * 0.3) / 3.5,
      co2SavedKg: ((routePlan.totalKm * 0.3) / 3.5) * 2.68,
      createdAt: Date.now(),
      completedAt: null,
      status: 'in_progress'
    });

    await updateTruck(availableTruck.id, {
      status: 'en_route',
      activeRouteId: routeId,
      assignedRoute: routePlan.stops.map(s => s.binId)
    });

    setIsPlanning(false);
  };

  const filteredTrucks = useMemo(() => {
    if (!search) return trucks;
    return trucks.filter(t =>
      t.label.toLowerCase().includes(search.toLowerCase()) ||
      t.plateNumber.toLowerCase().includes(search.toLowerCase()) ||
      t.driver?.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [trucks, search]);

  // KPI metrics
  const activeTrucks = trucks.filter(t => t.status === 'active' || t.status === 'en_route' || t.status === 'collecting').length;
  const totalCollectionsToday = trucks.reduce((s, t) => s + t.todayCollections, 0);
  const totalKmToday = trucks.reduce((s, t) => s + t.totalKmToday, 0);
  const avgFuel = trucks.length > 0 ? Math.round(trucks.reduce((s, t) => s + t.fuelLevelPct, 0) / trucks.length) : 0;

  const tabs = [
    { id: 'all', label: 'All Trucks', count: trucks.length },
    { id: 'active', label: 'Active', count: activeTrucks },
    { id: 'idle', label: 'Idle', count: trucks.filter(t => t.status === 'idle').length },
    { id: 'maintenance', label: 'Maintenance', count: trucks.filter(t => t.status === 'maintenance').length },
  ];

  return (
    <div className="space-y-8 animate-fade-in pb-12 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/[0.05] pb-6">
        <div>
          <h1 className="text-2xl font-display font-medium tracking-tight">Fleet Management</h1>
          <p className="text-zinc-500 text-sm mt-1">Monitor vehicles, drivers, and collection routes.</p>
        </div>
        <Button 
          className="shrink-0 rounded-full px-6 shadow-xl shadow-white/5" 
          onClick={handlePlanRoute}
          disabled={isPlanning}
        >
          <RouteIcon className="w-4 h-4 mr-2" /> {isPlanning ? 'Planning...' : 'Plan Route'}
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Active Vehicles', value: activeTrucks, total: trucks.length, icon: Truck, color: '#22c55e' },
          { label: 'Collections Today', value: totalCollectionsToday, icon: Package, color: '#3b82f6' },
          { label: 'Total Distance', value: `${totalKmToday.toFixed(0)}km`, icon: Navigation, color: '#8b5cf6' },
          { label: 'Avg Fuel Level', value: `${avgFuel}%`, icon: Fuel, color: '#f59e0b' },
        ].map((stat, i) => (
          <div key={i} className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${stat.color}10` }}>
              <stat.icon className="w-5 h-5" style={{ color: stat.color }} />
            </div>
            <div>
              <p className="text-lg font-mono font-medium text-white">{stat.value}</p>
              <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-3.5 h-4 w-4 text-zinc-500" />
        <Input
          placeholder="Search trucks or drivers..."
          className="pl-9 bg-white/[0.03] border-white/[0.05] h-11"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Tabs & Grid */}
      <Tabs tabs={tabs} defaultTab="all">
        {(activeTab) => {
          const tabTrucks = filteredTrucks.filter(t =>
            activeTab === 'all' || t.status === activeTab ||
            (activeTab === 'active' && (t.status === 'active' || t.status === 'en_route' || t.status === 'collecting'))
          );

          if (tabTrucks.length === 0) {
            return <EmptyState icon={<Truck className="w-6 h-6 text-zinc-600" />} title="No trucks found" description="Adjust your search or filter." />;
          }

          return (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {tabTrucks.map(truck => (
                <TruckCard key={truck.id} truck={truck} />
              ))}
            </div>
          );
        }}
      </Tabs>
    </div>
  );
}
