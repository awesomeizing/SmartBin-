import { useState, useMemo } from 'react';
import { useDatabase } from '@/contexts/DatabaseContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge, OnlineBadge, SourceBadge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/progress';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRow } from '@/components/ui/skeleton';
import { Modal, ModalBody } from '@/components/ui/modal';
import { formatRelativeTime, formatSignal, formatTemperature, formatHumidity } from '@/lib/formatters';
import { Search, Plus, Trash2, Activity, Eye, MapPin, Battery, Wifi, Thermometer } from 'lucide-react';
import type { BinSummary } from '@/types';

export function Bins() {
  const { binSummaries, loading, deleteBin } = useDatabase();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedBin, setSelectedBin] = useState<BinSummary | null>(null);

  const filtered = useMemo(() => {
    return binSummaries.filter(bin => {
      const matchesSearch = !search ||
        bin.label.toLowerCase().includes(search.toLowerCase()) ||
        bin.id.toLowerCase().includes(search.toLowerCase()) ||
        bin.zone.toLowerCase().includes(search.toLowerCase());
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/[0.05] pb-6">
        <div>
          <h1 className="text-2xl font-display font-medium tracking-tight">Bin Fleet</h1>
          <p className="text-zinc-500 text-sm mt-1">Configure and monitor {binSummaries.length} deployed hardware units.</p>
        </div>
        <Button className="shrink-0 rounded-full px-6 shadow-xl shadow-white/5">
          <Plus className="w-4 h-4 mr-2" /> Provision Unit
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-3.5 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search by ID, name, or zone..."
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
                    <th className="px-6 py-4 font-medium border-b border-white/[0.05]">Unit</th>
                    <th className="px-6 py-4 font-medium border-b border-white/[0.05]">Zone</th>
                    <th className="px-6 py-4 font-medium border-b border-white/[0.05]">Fill Level</th>
                    <th className="px-6 py-4 font-medium border-b border-white/[0.05]">Status</th>
                    <th className="px-6 py-4 font-medium border-b border-white/[0.05]">Battery</th>
                    <th className="px-6 py-4 font-medium border-b border-white/[0.05]">Signal</th>
                    <th className="px-6 py-4 font-medium border-b border-white/[0.05]">Source</th>
                    <th className="px-6 py-4 font-medium border-b border-white/[0.05]">Last Seen</th>
                    <th className="px-6 py-4 text-right font-medium border-b border-white/[0.05]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {filtered.map((bin) => (
                    <tr key={bin.id} className="hover:bg-white/[0.015] transition-colors group cursor-default">
                      <td className="px-6 py-3.5">
                        <div>
                          <p className="text-sm font-medium text-zinc-200">{bin.label}</p>
                          <p className="text-[10px] font-mono text-zinc-600">{bin.id}</p>
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-zinc-400 text-xs font-mono">{bin.zone}</td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3 w-28">
                          <ProgressBar value={bin.fillPct} size="sm" className="flex-1" />
                          <span className="font-mono text-zinc-400 text-xs w-8 text-right">{bin.fillPct}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-3.5"><StatusBadge status={bin.binStatus} /></td>
                      <td className="px-6 py-3.5">
                        <span className={`font-mono text-xs ${bin.batteryPct < 20 ? 'text-red-400' : 'text-zinc-400'}`}>
                          {bin.batteryPct}%
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-zinc-500 text-xs">{formatSignal(bin.rssi)}</td>
                      <td className="px-6 py-3.5"><SourceBadge source={bin.source} /></td>
                      <td className="px-6 py-3.5 text-zinc-600 text-xs">{formatRelativeTime(bin.lastUpdate)}</td>
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
                  ))}
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
                { label: 'Fill Level', value: `${selectedBin.fillPct}%`, icon: Activity },
                { label: 'Battery', value: `${selectedBin.batteryPct}%`, icon: Battery },
                { label: 'Signal', value: formatSignal(selectedBin.rssi), icon: Wifi },
                { label: 'Temperature', value: formatTemperature(selectedBin.temperatureC), icon: Thermometer },
                { label: 'Humidity', value: formatHumidity(selectedBin.humidityPct), icon: Activity },
                { label: 'Health Score', value: `${selectedBin.healthScore}/100`, icon: Activity },
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
                <StatusBadge status={selectedBin.binStatus} />
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
