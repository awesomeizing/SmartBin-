import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDatabase } from '@/contexts/DatabaseContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge, OnlineBadge, SourceBadge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/progress';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRow } from '@/components/ui/skeleton';
import { Modal, ModalBody } from '@/components/ui/modal';
import { SimulationBanner } from '@/components/dashboard/SimulationBanner';
import { formatRelativeTime, formatSignal, formatTemperature, formatHumidity } from '@/lib/formatters';
import { useToast } from '@/contexts/NotificationContext';
import { Search, Download, Trash2, Activity, Eye, MapPin, Battery, Wifi, Thermometer } from 'lucide-react';
import type { BinSummary } from '@/types';

import { useHardwareSerial } from '@/contexts/HardwareSerialContext';
import { HardwareConnectionModal } from '@/components/hardware/HardwareConnectionModal';
import { Zap, Terminal } from 'lucide-react';

// Map bin ID to device ID (production controller IDs)
const BIN_DEVICE_MAP: Record<string, string> = {
  'BIN-01': 'ESP32-SMARTBIN-01',
  'BIN-02': 'ESP32-SMARTBIN-02',
  'BIN-03': 'ESP32-SMARTBIN-03',
  'BIN-04': 'ESP32-SMARTBIN-04',
};

export function Bins() {
  const { binSummaries, loading, deleteBin, isSimulationMode, isHardwareConnected } = useDatabase();
  const { isConnected } = useHardwareSerial();
  const { currentUser } = useAuth();
  const { addToast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedBin, setSelectedBin] = useState<BinSummary | null>(null);
  const [exporting, setExporting] = useState(false);
  const [hardwareModalOpen, setHardwareModalOpen] = useState(false);

  const isLive = isConnected || isHardwareConnected;

  const exportTelemetry = async () => {
    if (!currentUser || isSimulationMode) return;
    setExporting(true);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch('/api/export', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Could not download telemetry data.');
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = 'smartbin-telemetry.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      addToast({ title: 'Telemetry downloaded', message: 'The CSV includes current bin readings and saved history.', severity: 'info' });
    } catch (error) {
      addToast({
        title: 'Download failed',
        message: error instanceof Error ? error.message : 'Could not download telemetry data.',
        severity: 'warning',
      });
    } finally {
      setExporting(false);
    }
  };

  const filtered = useMemo(() => {
    return binSummaries.filter(bin => {
      const matchesSearch = !search ||
        bin.label.toLowerCase().includes(search.toLowerCase()) ||
        bin.id.toLowerCase().includes(search.toLowerCase()) ||
        bin.zone.toLowerCase().includes(search.toLowerCase()) ||
        (BIN_DEVICE_MAP[bin.id] || '').toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || bin.binStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [binSummaries, search, statusFilter]);

  if (loading) {
    return (
      <div className="space-y-8 animate-fade-in pb-12 max-w-7xl mx-auto">
        <div className="h-6 w-48 bg-white/[0.06] rounded animate-pulse" />
        <Card className="bg-white/[0.01] border-white/[0.05]">
          <CardContent className="p-0">
            {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={7} />)}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in pb-12 max-w-7xl mx-auto">
      {/* Demo Mode Banner (hidden when real hardware is connected) */}
      <SimulationBanner visible={isSimulationMode && !isLive} />

      {/* Live Hardware Banner when active */}
      {isLive && (
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
                — Displaying real ultrasonic readings from connected ESP32 node. Fill percentages update dynamically.
              </span>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHardwareModalOpen(true)}
            className="shrink-0 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20 text-xs"
          >
            <Terminal className="w-3.5 h-3.5 mr-1.5" /> Hardware Monitor
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/[0.05] pb-6">
        <div>
          <h1 className="text-2xl font-display font-medium tracking-tight">Bin Fleet</h1>
          <p className="text-zinc-500 text-sm mt-1">Monitor {binSummaries.length} deployed hardware units — {binSummaries.filter(b => b.isOnline).length} online.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setHardwareModalOpen(true)}
            className={`shrink-0 rounded-full px-5 ${
              isLive
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-white/[0.05] hover:bg-white/10 text-white border border-white/10'
            }`}
          >
            <Zap className={`w-4 h-4 mr-2 ${isLive ? 'fill-current text-white' : 'text-amber-400'}`} />
            {isConnected ? 'ESP32 Live (USB)' : isHardwareConnected ? 'Hardware Live (Relay)' : 'Connect ESP32 (USB)'}
          </Button>
          <Button
            variant="outline"
            className="shrink-0 rounded-full px-5"
            onClick={exportTelemetry}
            disabled={exporting || isSimulationMode || !currentUser}
            title={isSimulationMode ? 'Connect Firebase to export real telemetry.' : undefined}
          >
            <Download className="w-4 h-4 mr-2" /> {exporting ? 'Preparing…' : 'Export telemetry CSV'}
          </Button>
        </div>
      </div>

      <HardwareConnectionModal open={hardwareModalOpen} onClose={() => setHardwareModalOpen(false)} />

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-3.5 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search by ID, device, name, or zone..."
            className="pl-9 bg-white/[0.03] border-white/[0.05] h-11"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {['all', 'Empty', 'Half', 'Full'].map(status => (
            <Button
              key={status}
              variant={statusFilter === status ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter(status)}
              className="text-xs"
            >
              {status === 'all' ? `All (${binSummaries.length})` : status}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card className="bg-white/[0.01] border-white/[0.05] overflow-hidden">
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState title="No bins found" description="Adjust your search or filter criteria." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="text-xs uppercase bg-black/20 text-zinc-500 font-mono tracking-wider">
                  <tr>
                    <th className="px-6 py-4 font-medium border-b border-white/[0.05]">Bin ID</th>
                    <th className="px-6 py-4 font-medium border-b border-white/[0.05]">Device ID</th>
                    <th className="px-6 py-4 font-medium border-b border-white/[0.05]">Zone</th>
                    <th className="px-6 py-4 font-medium border-b border-white/[0.05]">Fill Level</th>
                    <th className="px-6 py-4 font-medium border-b border-white/[0.05]">Distance</th>
                    <th className="px-6 py-4 font-medium border-b border-white/[0.05]">Status</th>
                    <th className="px-6 py-4 font-medium border-b border-white/[0.05]">Connection</th>
                    <th className="px-6 py-4 font-medium border-b border-white/[0.05]">Source</th>
                    <th className="px-6 py-4 font-medium border-b border-white/[0.05]">Last Seen</th>
                    <th className="px-6 py-4 text-right font-medium border-b border-white/[0.05]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {filtered.map((bin) => {
                    const deviceId = BIN_DEVICE_MAP[bin.id] || '—';
                    const isOnline = bin.isOnline;
                    return (
                      <tr key={bin.id} className="hover:bg-white/[0.015] transition-colors group cursor-default">
                        <td className="px-6 py-3.5">
                          <div>
                            <p className="text-sm font-medium text-zinc-200">{bin.label}</p>
                            <p className="text-[10px] font-mono text-zinc-600">{bin.id}</p>
                          </div>
                        </td>
                        <td className="px-6 py-3.5">
                          <span className="text-xs font-mono text-zinc-400">{deviceId}</span>
                        </td>
                        <td className="px-6 py-3.5 text-zinc-400 text-xs font-mono">{bin.zone}</td>
                        <td className="px-6 py-3.5">
                          {isOnline ? (
                            <div className="flex items-center gap-3 w-28">
                              <ProgressBar value={bin.fillPct} size="sm" className="flex-1" />
                              <span className="font-mono text-zinc-400 text-xs w-10 text-right">{bin.fillPct}%</span>
                            </div>
                          ) : (
                            <span className="text-zinc-600 font-mono text-xs">--</span>
                          )}
                        </td>
                        <td className="px-6 py-3.5">
                          {isOnline ? (
                            <span className="font-mono text-zinc-400 text-xs">{bin.distanceCm.toFixed(1)} cm</span>
                          ) : (
                            <span className="text-zinc-600 font-mono text-xs">--</span>
                          )}
                        </td>
                        <td className="px-6 py-3.5">
                          {isOnline ? <StatusBadge status={bin.binStatus} /> : <span className="text-zinc-600 text-xs font-mono">--</span>}
                        </td>
                        <td className="px-6 py-3.5"><OnlineBadge online={isOnline} /></td>
                        <td className="px-6 py-3.5"><SourceBadge source={bin.source} /></td>
                        <td className="px-6 py-3.5 text-zinc-600 text-xs">
                          {isOnline ? formatRelativeTime(bin.lastUpdate) : (
                            <span className="text-red-500/70">{formatRelativeTime(bin.lastUpdate)}</span>
                          )}
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white" onClick={() => setSelectedBin(bin)}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-red-400" onClick={() => deleteBin(bin.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bin Detail Modal */}
      <Modal open={!!selectedBin} onClose={() => setSelectedBin(null)} title={selectedBin?.label ?? ''} description={selectedBin?.id} size="lg">
        {selectedBin && (
          <ModalBody>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              {[
                { label: 'Bin ID', value: selectedBin.id, icon: Activity },
                { label: 'Device ID', value: BIN_DEVICE_MAP[selectedBin.id] || '—', icon: Wifi },
                { label: 'Fill Level', value: selectedBin.isOnline ? `${selectedBin.fillPct}%` : '--', icon: Activity },
                { label: 'Distance', value: selectedBin.isOnline ? `${selectedBin.distanceCm.toFixed(1)} cm` : '--', icon: Activity },
                { label: 'Battery', value: selectedBin.batteryPct === null ? '—' : `${selectedBin.batteryPct}%`, icon: Battery },
                { label: 'Signal', value: formatSignal(selectedBin.rssi), icon: Wifi },
                { label: 'Temperature', value: formatTemperature(selectedBin.temperatureC), icon: Thermometer },
                { label: 'Humidity', value: formatHumidity(selectedBin.humidityPct), icon: Activity },
                { label: 'Health Score', value: selectedBin.healthScore === null ? 'Not reported' : `${selectedBin.healthScore}/100`, icon: Activity },
                { label: 'Zone', value: selectedBin.zone, icon: MapPin },
                { label: 'Address', value: selectedBin.address, icon: MapPin },
                { label: 'Source', value: selectedBin.source, icon: Activity },
              ].map((item, i) => (
                <div key={i} className="space-y-1">
                  <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider flex items-center gap-1">
                    <item.icon className="w-3 h-3" />
                    {item.label}
                  </span>
                  <p className="text-sm text-zinc-200 font-mono">{item.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 pt-6 border-t border-white/[0.05]">
              <div className="flex items-center gap-3">
                {selectedBin.isOnline && <StatusBadge status={selectedBin.binStatus} />}
                <OnlineBadge online={selectedBin.isOnline} />
                <SourceBadge source={selectedBin.source} />
              </div>
            </div>
          </ModalBody>
        )}
      </Modal>
    </div>
  );
}
