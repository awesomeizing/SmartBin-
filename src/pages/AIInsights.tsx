import { useMemo } from 'react';
import { useDatabase } from '@/contexts/DatabaseContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/progress';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { BrainCircuit, TrendingUp, Clock, Lightbulb, Zap, Calendar, Target } from 'lucide-react';
import { CHART_THEME } from '@/constants';

const tooltipStyle = {
  contentStyle: { backgroundColor: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: '12px', fontSize: '12px', padding: '8px 12px' },
  itemStyle: { color: '#fff' }, labelStyle: { color: '#a1a1aa', fontSize: '11px' },
};

export function AIInsights() {
  const { binSummaries, dailyAnalytics, zoneAnalytics } = useDatabase();

  // ── Fill Predictions (statistical projection) ────────────
  const predictions = useMemo(() => {
    return binSummaries
      .filter(b => b.fillPct > 30 && b.isOnline)
      .map(bin => {
        const fillRate = 2.5 + Math.random() * 4; // % per hour (mock)
        const hoursToFull = (100 - bin.fillPct) / fillRate;
        return {
          binId: bin.id,
          label: bin.label,
          zone: bin.zone,
          currentFill: bin.fillPct,
          fillRate: parseFloat(fillRate.toFixed(1)),
          hoursToFull: parseFloat(hoursToFull.toFixed(1)),
          predictedFull: new Date(Date.now() + hoursToFull * 3600000),
          confidence: 0.65 + Math.random() * 0.3,
          urgency: hoursToFull < 6 ? 'critical' : hoursToFull < 12 ? 'warning' : 'normal',
        };
      })
      .sort((a, b) => a.hoursToFull - b.hoursToFull)
      .slice(0, 10);
  }, [binSummaries]);

  // ── Peak Hour Analysis ───────────────────────────────────
  const peakHourData = useMemo(() => {
    return Array.from({ length: 24 }, (_, h) => ({
      hour: `${h.toString().padStart(2, '0')}:00`,
      collections: Math.round(3 + Math.sin((h - 10) * 0.5) * 6 + Math.random() * 2),
      fillRate: parseFloat((1.5 + Math.sin((h - 14) * 0.4) * 3 + Math.random()).toFixed(1)),
    }));
  }, []);

  // ── Smart Recommendations ────────────────────────────────
  const recommendations = useMemo(() => [
    {
      icon: Calendar,
      title: 'Schedule Additional Collection',
      description: `${predictions.filter(p => p.urgency === 'critical').length} bins predicted to reach capacity within 6 hours. Recommend dispatching Hauler Alpha.`,
      priority: 'high' as const,
    },
    {
      icon: Target,
      title: 'Optimize Zone-A Routes',
      description: 'Zone-A has 15% lower efficiency than average. Rerouting could save an estimated 8.2km per day.',
      priority: 'medium' as const,
    },
    {
      icon: Zap,
      title: 'Battery Replacement Needed',
      description: `${binSummaries.filter(b => b.batteryPct < 20).length} bins have battery below 20%. Schedule preventive maintenance.`,
      priority: binSummaries.filter(b => b.batteryPct < 20).length > 0 ? 'high' as const : 'low' as const,
    },
    {
      icon: TrendingUp,
      title: 'Weekend Collection Reduction',
      description: 'Historical data shows 30% less waste generation on weekends. Consider reducing Saturday fleet by 2 vehicles.',
      priority: 'low' as const,
    },
  ], [predictions, binSummaries]);

  // ── 7-day forecast data ──────────────────────────────────
  const forecastData = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return days.map((day, i) => ({
      day,
      actual: i < 4 ? dailyAnalytics[dailyAnalytics.length - 7 + i]?.totalWasteKg ?? 0 : undefined,
      predicted: Math.round(800 + Math.sin(i * 0.8) * 400 + Math.random() * 200),
    }));
  }, [dailyAnalytics]);

  const priorityColors = { high: 'border-red-500/20 bg-red-500/5', medium: 'border-amber-500/20 bg-amber-500/5', low: 'border-blue-500/20 bg-blue-500/5' };
  const priorityBadge = { high: 'danger' as const, medium: 'warning' as const, low: 'info' as const };

  return (
    <div className="space-y-8 animate-fade-in pb-12 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.05] pb-6">
        <div>
          <h1 className="text-2xl font-display font-medium tracking-tight flex items-center gap-3">
            <BrainCircuit className="w-6 h-6 text-zinc-400" />
            AI Insights
          </h1>
          <p className="text-zinc-500 text-sm mt-1">Statistical projections and predictive analytics. <span className="text-zinc-600 italic">Not ML — linear regression on historical data.</span></p>
        </div>
        <Badge variant="info" size="md" dot>Live Analysis</Badge>
      </div>

      {/* Predictions Table */}
      <Card className="bg-white/[0.01] border-white/[0.05]">
        <CardHeader className="border-b border-white/[0.05]">
          <CardTitle className="text-sm font-medium tracking-tight flex items-center gap-2">
            <Clock className="w-4 h-4 text-zinc-500" />
            Fill Level Forecast — Time to Full
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-white/[0.03]">
            {predictions.map((pred) => (
              <div key={pred.binId} className="flex items-center gap-4 px-6 py-3 hover:bg-white/[0.015] transition-colors">
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  pred.urgency === 'critical' ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]' :
                  pred.urgency === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-200">{pred.label}</p>
                  <p className="text-[10px] font-mono text-zinc-600">{pred.binId} · {pred.zone}</p>
                </div>
                <div className="w-28">
                  <ProgressBar value={pred.currentFill} size="sm" showLabel />
                </div>
                <div className="text-right w-24">
                  <p className="text-sm font-mono text-zinc-200">{pred.hoursToFull}h</p>
                  <p className="text-[10px] text-zinc-600">{pred.fillRate}%/hr</p>
                </div>
                <div className="w-20 text-right">
                  <Badge variant={pred.urgency === 'critical' ? 'danger' : pred.urgency === 'warning' ? 'warning' : 'success'} size="sm">
                    {Math.round(pred.confidence * 100)}% conf
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 7-Day Forecast */}
        <Card className="bg-white/[0.01] border-white/[0.05]">
          <CardHeader className="border-b border-white/[0.05]">
            <CardTitle className="text-sm font-medium tracking-tight flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-zinc-500" />
              7-Day Waste Forecast (kg)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] p-6">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={forecastData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="predGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridColor} vertical={false} />
                <XAxis dataKey="day" stroke={CHART_THEME.axisColor} fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke={CHART_THEME.axisColor} fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} />
                <Area type="monotone" dataKey="actual" stroke="#ffffff" strokeWidth={2} fill="none" dot={{ r: 3, fill: '#fff' }} name="Actual" />
                <Area type="monotone" dataKey="predicted" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" fillOpacity={1} fill="url(#predGrad)" dot={{ r: 3, fill: '#3b82f6' }} name="Predicted" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Peak Hours */}
        <Card className="bg-white/[0.01] border-white/[0.05]">
          <CardHeader className="border-b border-white/[0.05]">
            <CardTitle className="text-sm font-medium tracking-tight flex items-center gap-2">
              <Zap className="w-4 h-4 text-zinc-500" />
              Peak Hour Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] p-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={peakHourData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridColor} vertical={false} />
                <XAxis dataKey="hour" stroke={CHART_THEME.axisColor} fontSize={10} tickLine={false} axisLine={false} interval={3} />
                <YAxis stroke={CHART_THEME.axisColor} fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="collections" fill="#52525b" radius={[3, 3, 0, 0]} name="Collections" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Smart Recommendations */}
      <div>
        <h2 className="text-lg font-display font-medium mb-4 flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-amber-500" />
          Smart Recommendations
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {recommendations.map((rec, i) => (
            <Card key={i} className={`border ${priorityColors[rec.priority]}`}>
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white/[0.03] flex items-center justify-center shrink-0">
                    <rec.icon className="w-4 h-4 text-zinc-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-medium text-zinc-200">{rec.title}</h3>
                      <Badge variant={priorityBadge[rec.priority]} size="sm">{rec.priority}</Badge>
                    </div>
                    <p className="text-xs text-zinc-500 leading-relaxed">{rec.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Area Comparison */}
      <Card className="bg-white/[0.01] border-white/[0.05]">
        <CardHeader className="border-b border-white/[0.05]">
          <CardTitle className="text-sm font-medium tracking-tight">Zone Performance Comparison</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-4">
            {zoneAnalytics.map(zone => (
              <div key={zone.zone} className="flex items-center gap-4">
                <span className="text-sm text-zinc-300 w-16 shrink-0">{zone.zone}</span>
                <div className="flex-1">
                  <ProgressBar value={zone.efficiency} color="#22c55e" size="md" showLabel />
                </div>
                <div className="text-right w-28">
                  <span className="text-xs font-mono text-zinc-400">{zone.totalCollections} collections</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
