import { useState, useMemo } from 'react';
import { useDatabase } from '@/contexts/DatabaseContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LiveDeviceCard } from '@/components/hardware/LiveDeviceCard';
import { EmptyState } from '@/components/ui/empty-state';
import { Search, Cpu, Wifi, WifiOff, Battery, AlertTriangle } from 'lucide-react';

export function HardwareDashboard() {
  const { binSummaries } = useDatabase();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'online' | 'offline' | 'low_battery' | 'faulty'>('all');

  const filtered = useMemo(() => {
    return binSummaries.filter(bin => {
      const matchesSearch = !search ||
        bin.id.toLowerCase().includes(search.toLowerCase()) ||
        bin.label.toLowerCase().includes(search.toLowerCase());
      
      let matchesFilter = true;
      if (filter === 'online') matchesFilter = bin.isOnline;
      if (filter === 'offline') matchesFilter = !bin.isOnline;
      if (filter === 'low_battery') matchesFilter = bin.batteryPct < 20;
      if (filter === 'faulty') matchesFilter = bin.healthScore < 80;

      return matchesSearch && matchesFilter;
    });
  }, [binSummaries, search, filter]);

  const kpis = useMemo(() => {
    return {
      online: binSummaries.filter(b => b.isOnline).length,
      offline: binSummaries.filter(b => !b.isOnline).length,
      lowBattery: binSummaries.filter(b => b.batteryPct < 20).length,
      faulty: binSummaries.filter(b => b.healthScore < 80).length,
      avgBattery: Math.round(binSummaries.reduce((s, b) => s + b.batteryPct, 0) / Math.max(binSummaries.length, 1)),
      avgSignal: Math.round(binSummaries.reduce((s, b) => s + b.rssi, 0) / Math.max(binSummaries.length, 1)),
    };
  }, [binSummaries]);

  return (
    <div className="space-y-8 animate-fade-in pb-12 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/[0.05] pb-6">
        <div>
          <h1 className="text-2xl font-display font-medium tracking-tight flex items-center gap-3">
            <Cpu className="w-6 h-6 text-emerald-500" />
            Hardware Telemetry
          </h1>
          <p className="text-zinc-500 text-sm mt-1">Real-time status of all {binSummaries.length} deployed ESP32 nodes.</p>
        </div>
      </div>

      {/* KPI Overview */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {[
          { label: 'Online', value: kpis.online, icon: Wifi, color: '#22c55e' },
          { label: 'Offline', value: kpis.offline, icon: WifiOff, color: '#ef4444' },
          { label: 'Low Battery', value: kpis.lowBattery, icon: Battery, color: '#f59e0b' },
          { label: 'Faulty Sensors', value: kpis.faulty, icon: AlertTriangle, color: '#ef4444' },
          { label: 'Avg Battery', value: `${kpis.avgBattery}%`, icon: Battery, color: '#3b82f6' },
          { label: 'Avg Signal', value: `${kpis.avgSignal} dBm`, icon: Wifi, color: '#8b5cf6' },
        ].map((kpi, i) => (
          <Card key={i} className="bg-white/[0.01] border-white/[0.05]">
            <CardContent className="p-4 flex flex-col items-center text-center">
              <kpi.icon className="w-5 h-5 mb-2" style={{ color: kpi.color }} />
              <div className="text-xl font-mono font-medium text-white">{kpi.value}</div>
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">{kpi.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-3.5 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search device ID..."
            className="pl-9 bg-white/[0.03] border-white/[0.05] h-11"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
          <Button variant={filter === 'all' ? 'secondary' : 'ghost'} size="sm" onClick={() => setFilter('all')}>All Devices</Button>
          <Button variant={filter === 'online' ? 'secondary' : 'ghost'} size="sm" onClick={() => setFilter('online')}>
            Online <Badge variant="success" size="sm" className="ml-2 py-0">{kpis.online}</Badge>
          </Button>
          <Button variant={filter === 'offline' ? 'secondary' : 'ghost'} size="sm" onClick={() => setFilter('offline')}>
            Offline <Badge variant="danger" size="sm" className="ml-2 py-0">{kpis.offline}</Badge>
          </Button>
          <Button variant={filter === 'low_battery' ? 'secondary' : 'ghost'} size="sm" onClick={() => setFilter('low_battery')}>Low Battery</Button>
          <Button variant={filter === 'faulty' ? 'secondary' : 'ghost'} size="sm" onClick={() => setFilter('faulty')}>Faulty</Button>
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState title="No devices found" description="Try adjusting your filters or search query." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(device => (
            <LiveDeviceCard key={device.id} device={device} />
          ))}
        </div>
      )}
    </div>
  );
}
