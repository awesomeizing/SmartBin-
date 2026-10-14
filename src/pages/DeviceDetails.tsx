import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useDatabase } from '@/contexts/DatabaseContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, OnlineBadge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/progress';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatDateTime, formatSignal } from '@/lib/formatters';
import { getFillColor } from '@/lib/calculations';
import { CHART_THEME } from '@/constants';
import { 
  ArrowLeft, Cpu, Battery, Wifi, Activity, MapPin, Settings2, 
  RefreshCw, Power, ShieldCheck, AlertTriangle
} from 'lucide-react';
import { useToast } from '@/contexts/NotificationContext';

const tooltipStyle = {
  contentStyle: { backgroundColor: CHART_THEME.tooltipBg, border: `1px solid ${CHART_THEME.tooltipBorder}`, borderRadius: '12px', fontSize: '12px', padding: '8px 12px' },
  itemStyle: { color: '#fff' }, labelStyle: { color: '#a1a1aa', fontSize: '11px' },
};

export function DeviceDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { getBinById, getHistoryForBin } = useDatabase();
  const { addToast } = useToast();

  const device = id ? getBinById(id) : null;
  const history = id ? getHistoryForBin(id) : [];
  const returnPath = location.pathname.startsWith('/bins') ? '/bins' : '/hardware';

  if (!device) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <Cpu className="w-12 h-12 text-zinc-600 mb-4" />
        <h2 className="text-xl font-medium text-white mb-2">Device Not Found</h2>
        <p className="text-zinc-500 mb-6">The hardware node {id} does not exist or has been decommissioned.</p>
        <Button onClick={() => navigate(returnPath)}>Return to Fleet</Button>
      </div>
    );
  }

  // Battery history from real Firebase data would be shown here.
  // In simulation mode this data is not available — show a placeholder.
  const batteryHistory: { time: string; level: number }[] = [];

  const handleAction = (action: string) => {
    addToast({ title: 'Command Sent', message: `Executing ${action} on ${device.id}...`, severity: 'info' });
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/[0.05] pb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(returnPath)} className="shrink-0 text-zinc-500 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-display font-medium tracking-tight">{device.id}</h1>
              <OnlineBadge online={Date.now() - device.live.timestamp < 300000} />
            </div>
            <p className="text-zinc-500 text-sm mt-1">{device.meta.label} · {device.meta.zone}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleAction('OTA Update')}>
            <RefreshCw className="w-3.5 h-3.5 mr-2" /> OTA Update
          </Button>
          <Button variant="outline" size="sm" className="text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => handleAction('Reboot')}>
            <Power className="w-3.5 h-3.5 mr-2" /> Reboot
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Diagnostics */}
        <div className="space-y-6">
          {/* Main Status */}
          <Card className="bg-white/[0.01] border-white/[0.05]">
            <CardHeader className="border-b border-white/[0.05]">
              <CardTitle className="text-sm font-medium">Live Telemetry</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Fill Level</span>
                  <span className="text-2xl font-mono font-medium" style={{ color: getFillColor(device.live.fillPct) }}>
                    {device.live.fillPct}%
                  </span>
                </div>
                <ProgressBar value={device.live.fillPct} size="lg" />
                <div className="flex justify-between mt-2 text-[10px] font-mono text-zinc-600">
                  <span>Raw: {device.live.distanceCm}cm</span>
                  <span>Threshold: {device.meta.thresholdPct}%</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/[0.05]">
                <div>
                  <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1">Battery</p>
                  <div className="flex items-center gap-2">
                    <Battery className={`w-4 h-4 ${device.live.batteryPct !== null && device.live.batteryPct < 20 ? 'text-red-400' : 'text-zinc-300'}`} />
                    <span className="font-mono text-lg text-white">{device.live.batteryPct === null ? '—' : `${device.live.batteryPct}%`}</span>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1">Signal</p>
                  <div className="flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-zinc-300" />
                    <span className="font-mono text-lg text-white">{formatSignal(device.live.rssi)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Hardware Diagnostics */}
          <Card className="bg-white/[0.01] border-white/[0.05]">
            <CardHeader className="border-b border-white/[0.05]">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                Diagnostics
                <Badge variant={device.health.healthScore === null ? 'outline' : device.health.healthScore >= 80 ? 'success' : 'danger'} size="sm">
                  {device.health.healthScore === null ? 'Not reported' : `${device.health.healthScore}/100`}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-white/[0.03]">
                {[
                  { label: 'Ultrasonic Sensor', ok: device.health.sensorOk },
                  { label: 'Network Module', ok: device.health.wifiOk },
                  { label: 'LED Indicators', ok: device.health.ledOk },
                  { label: 'Buzzer System', ok: device.health.buzzerOk },
                ].map((comp, i) => (
                  <div key={i} className="flex items-center justify-between px-6 py-3">
                    <span className="text-sm text-zinc-300">{comp.label}</span>
                    {comp.ok === true ? (
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    ) : comp.ok === false ? (
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                    ) : (
                      <span className="text-[10px] font-mono text-zinc-500">Not reported</span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Device Meta */}
          <Card className="bg-white/[0.01] border-white/[0.05]">
            <CardHeader className="border-b border-white/[0.05]">
              <CardTitle className="text-sm font-medium">Device Profile</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {[
                { label: 'Firmware', value: device.live.firmware, icon: Settings2 },
                { label: 'Uptime', value: device.live.uptimeSec === null ? '—' : `${Math.round(device.live.uptimeSec / 3600)} hrs`, icon: Activity },
                { label: 'Coordinates', value: `${device.meta.location.lat.toFixed(4)}, ${device.meta.location.lng.toFixed(4)}`, icon: MapPin },
                { label: 'Installed', value: formatDateTime(device.meta.installedAt), icon: Activity },
                { label: 'Capacity', value: `${device.meta.capacity}L (${device.meta.depthCm}cm)`, icon: Activity },
              ].map((meta, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.03] flex items-center justify-center shrink-0">
                    <meta.icon className="w-4 h-4 text-zinc-500" />
                  </div>
                  <div>
                    <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">{meta.label}</p>
                    <p className="text-sm text-zinc-200">{meta.value}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Graphs & Logs */}
        <div className="lg:col-span-2 space-y-6">
          {/* Fill History Graph */}
          <Card className="bg-white/[0.01] border-white/[0.05]">
            <CardHeader className="border-b border-white/[0.05]">
              <CardTitle className="text-sm font-medium">Fill Level History</CardTitle>
            </CardHeader>
            <CardContent className="h-[300px] p-6">
              {history.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="fillGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridColor} vertical={false} />
                    <XAxis dataKey="timestamp" stroke={CHART_THEME.axisColor} fontSize={11} tickFormatter={(v: any) => new Date(v).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} stroke={CHART_THEME.axisColor} fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip {...tooltipStyle} labelFormatter={(v: any) => new Date(v).toLocaleString()} />
                    <Area type="monotone" dataKey="fillPct" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#fillGrad)" name="Fill Level %" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-zinc-500 font-mono">
                  No historical data available yet.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Battery Drain Graph */}
          <Card className="bg-white/[0.01] border-white/[0.05]">
            <CardHeader className="border-b border-white/[0.05]">
              <CardTitle className="text-sm font-medium">Battery Discharge Profile (24h)</CardTitle>
            </CardHeader>
            <CardContent className="h-[250px] p-6">
              {batteryHistory.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={batteryHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridColor} vertical={false} />
                    <XAxis dataKey="time" stroke={CHART_THEME.axisColor} fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} stroke={CHART_THEME.axisColor} fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip {...tooltipStyle} />
                    <Line type="monotone" dataKey="level" stroke="#22c55e" strokeWidth={2} dot={false} name="Battery %" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-zinc-500 font-mono">
                  Waiting for battery history data from device.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Device Logs */}
          <Card className="bg-white/[0.01] border-white/[0.05]">
            <CardHeader className="border-b border-white/[0.05]">
              <CardTitle className="text-sm font-medium">Connection Logs</CardTitle>
            </CardHeader>
            <CardContent className="p-0 max-h-[300px] overflow-y-auto">
              <div className="divide-y divide-white/[0.03] font-mono text-[11px]">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="px-6 py-3 hover:bg-white/[0.015] flex gap-4">
                    <span className="text-zinc-500 shrink-0">{formatDateTime(Date.now() - i * 3600000)}</span>
                    {i === 1 ? (
                      <span className="text-amber-400">WARN [WIFI] Connection dropped. Reconnecting...</span>
                    ) : i === 2 ? (
                      <span className="text-emerald-400">INFO [WIFI] Reconnected successfully (RSSI -64dBm)</span>
                    ) : (
                      <span className="text-zinc-300">INFO [TEL] Pushed telemetry payload.</span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
