import { useState, useMemo } from 'react';
import { useDatabase } from '@/contexts/DatabaseContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { TrendingUp, Recycle, Fuel, Leaf, Clock,
  Activity, AlertTriangle
} from 'lucide-react';
import { CHART_THEME } from '@/constants';
import { KPICard } from '@/components/dashboard/KPICard';

const tooltipStyle = {
  contentStyle: { backgroundColor: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: '12px', fontSize: '12px', padding: '8px 12px' },
  itemStyle: { color: '#fff' }, labelStyle: { color: '#a1a1aa', fontSize: '11px' },
};

export function Analytics() {
  const { dailyAnalytics, zoneAnalytics } = useDatabase();
  const [range, setRange] = useState<'7d' | '14d' | '30d'>('7d');

  const rangeData = useMemo(() => {
    const days = range === '7d' ? 7 : range === '14d' ? 14 : 30;
    return dailyAnalytics.slice(-days).map(d => ({
      date: new Date(d.date).toLocaleDateString('en', { day: 'numeric', month: 'short' }),
      waste: d.totalWasteKg,
      collections: d.totalCollections,
      efficiency: d.efficiency,
      overflow: d.overflowCount,
      co2Saved: d.co2SavedKg,
      fuel: d.fuelUsedL,
      responseTime: d.avgResponseTimeMins,
    }));
  }, [dailyAnalytics, range]);

  const totals = useMemo(() => {
    const data = dailyAnalytics.slice(range === '7d' ? -7 : range === '14d' ? -14 : -30);
    return {
      totalCollections: data.reduce((s, d) => s + d.totalCollections, 0),
      totalWaste: Math.round(data.reduce((s, d) => s + d.totalWasteKg, 0)),
      totalCO2: Math.round(data.reduce((s, d) => s + d.co2SavedKg, 0) * 10) / 10,
      totalFuel: Math.round(data.reduce((s, d) => s + d.fuelUsedL, 0) * 10) / 10,
      avgEfficiency: Math.round(data.reduce((s, d) => s + d.efficiency, 0) / Math.max(data.length, 1)),
      avgResponse: Math.round(data.reduce((s, d) => s + d.avgResponseTimeMins, 0) / Math.max(data.length, 1)),
      totalOverflow: data.reduce((s, d) => s + d.overflowCount, 0),
    };
  }, [dailyAnalytics, range]);

  return (
    <div className="space-y-8 animate-fade-in pb-12 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/[0.05] pb-6">
        <div>
          <h1 className="text-2xl font-display font-medium tracking-tight">Analytics</h1>
          <p className="text-zinc-500 text-sm mt-1">Operational performance and environmental impact metrics.</p>
        </div>
        <div className="flex items-center gap-2">
          {(['7d', '14d', '30d'] as const).map(r => (
            <Button key={r} variant={range === r ? 'secondary' : 'ghost'} size="sm" onClick={() => setRange(r)}>
              {r === '7d' ? '7 Days' : r === '14d' ? '14 Days' : '30 Days'}
            </Button>
          ))}
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        <KPICard title="Collections" value={totals.totalCollections} icon={<Recycle className="w-4 h-4" />} color="#3b82f6" delay={0} />
        <KPICard title="Waste (kg)" value={totals.totalWaste} icon={<Recycle className="w-4 h-4" />} color="#8b5cf6" delay={80} />
        <KPICard title="CO₂ Saved" value={`${totals.totalCO2}kg`} icon={<Leaf className="w-4 h-4" />} color="#22c55e" delay={160} />
        <KPICard title="Fuel Used" value={`${totals.totalFuel}L`} icon={<Fuel className="w-4 h-4" />} color="#f59e0b" delay={240} />
        <KPICard title="Efficiency" value={`${totals.avgEfficiency}%`} icon={<Activity className="w-4 h-4" />} color="#22c55e" delay={320} />
        <KPICard title="Avg Response" value={`${totals.avgResponse}m`} icon={<Clock className="w-4 h-4" />} color="#3b82f6" delay={400} />
        <KPICard title="Overflows" value={totals.totalOverflow} icon={<AlertTriangle className="w-4 h-4" />} color="#ef4444" delay={480} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Waste Collection Trend */}
        <Card className="bg-white/[0.01] border-white/[0.05]">
          <CardHeader className="border-b border-white/[0.05]">
            <CardTitle className="text-sm font-medium tracking-tight flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-zinc-500" />
              Waste Collection Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] p-6">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={rangeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="wasteGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ffffff" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="#ffffff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridColor} vertical={false} />
                <XAxis dataKey="date" stroke={CHART_THEME.axisColor} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke={CHART_THEME.axisColor} fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} />
                <Area type="monotone" dataKey="waste" stroke="#ffffff" strokeWidth={2} fillOpacity={1} fill="url(#wasteGrad)" name="Waste (kg)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Collection Efficiency */}
        <Card className="bg-white/[0.01] border-white/[0.05]">
          <CardHeader className="border-b border-white/[0.05]">
            <CardTitle className="text-sm font-medium tracking-tight flex items-center gap-2">
              <Activity className="w-4 h-4 text-zinc-500" />
              Collection Efficiency (%)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] p-6">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rangeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridColor} vertical={false} />
                <XAxis dataKey="date" stroke={CHART_THEME.axisColor} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} stroke={CHART_THEME.axisColor} fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} />
                <Line type="monotone" dataKey="efficiency" stroke="#22c55e" strokeWidth={2} dot={{ r: 3, fill: '#22c55e' }} name="Efficiency %" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* CO₂ Savings */}
        <Card className="bg-white/[0.01] border-white/[0.05]">
          <CardHeader className="border-b border-white/[0.05]">
            <CardTitle className="text-sm font-medium tracking-tight flex items-center gap-2">
              <Leaf className="w-4 h-4 text-emerald-500" />
              CO₂ Savings (kg)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] p-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rangeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridColor} vertical={false} />
                <XAxis dataKey="date" stroke={CHART_THEME.axisColor} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke={CHART_THEME.axisColor} fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="co2Saved" fill="#22c55e" radius={[4, 4, 0, 0]} name="CO₂ Saved (kg)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Overflow Events */}
        <Card className="bg-white/[0.01] border-white/[0.05]">
          <CardHeader className="border-b border-white/[0.05]">
            <CardTitle className="text-sm font-medium tracking-tight flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Overflow Events
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] p-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rangeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridColor} vertical={false} />
                <XAxis dataKey="date" stroke={CHART_THEME.axisColor} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke={CHART_THEME.axisColor} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="overflow" fill="#ef4444" radius={[4, 4, 0, 0]} name="Overflow Events" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Zone Comparison Table */}
      <Card className="bg-white/[0.01] border-white/[0.05] overflow-hidden">
        <CardHeader className="border-b border-white/[0.05]">
          <CardTitle className="text-sm font-medium tracking-tight">Zone Performance Comparison</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase bg-black/20 text-zinc-500 font-mono tracking-wider">
                <tr>
                  <th className="px-6 py-4 text-left font-medium border-b border-white/[0.05]">Zone</th>
                  <th className="px-6 py-4 text-left font-medium border-b border-white/[0.05]">Bins</th>
                  <th className="px-6 py-4 text-left font-medium border-b border-white/[0.05]">Avg Fill</th>
                  <th className="px-6 py-4 text-left font-medium border-b border-white/[0.05]">Collections</th>
                  <th className="px-6 py-4 text-left font-medium border-b border-white/[0.05]">Waste (kg)</th>
                  <th className="px-6 py-4 text-left font-medium border-b border-white/[0.05]">Overflow Rate</th>
                  <th className="px-6 py-4 text-left font-medium border-b border-white/[0.05]">Efficiency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {zoneAnalytics.map(zone => (
                  <tr key={zone.zone} className="hover:bg-white/[0.015] transition-colors">
                    <td className="px-6 py-3 font-medium text-zinc-200">{zone.zone}</td>
                    <td className="px-6 py-3 text-zinc-400 font-mono">{zone.binCount}</td>
                    <td className="px-6 py-3">
                      <span className="font-mono text-xs" style={{ color: zone.avgFillPct >= 80 ? '#ef4444' : zone.avgFillPct >= 51 ? '#f59e0b' : '#22c55e' }}>
                        {zone.avgFillPct}%
                      </span>
                    </td>
                    <td className="px-6 py-3 text-zinc-400 font-mono">{zone.totalCollections}</td>
                    <td className="px-6 py-3 text-zinc-400 font-mono">{Math.round(zone.totalWasteKg).toLocaleString()}</td>
                    <td className="px-6 py-3">
                      <Badge variant={zone.overflowRate > 10 ? 'danger' : zone.overflowRate > 5 ? 'warning' : 'success'} size="sm">
                        {zone.overflowRate.toFixed(1)}%
                      </Badge>
                    </td>
                    <td className="px-6 py-3 text-emerald-400 font-mono">{zone.efficiency.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
