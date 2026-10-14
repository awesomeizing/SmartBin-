import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge, OnlineBadge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/progress';
import { formatRelativeTime, formatSignal, formatTemperature, formatHumidity } from '@/lib/formatters';
import { getFillColor } from '@/lib/calculations';
import { Battery, Wifi, Thermometer, Droplets, Cpu } from 'lucide-react';
import type { BinSummary } from '@/types';
import { useNavigate } from 'react-router-dom';

interface LiveDeviceCardProps {
  device: BinSummary;
}

export function LiveDeviceCard({ device }: LiveDeviceCardProps) {
  const navigate = useNavigate();

  return (
    <Card 
      className="bg-white/[0.01] border-white/[0.05] hover:bg-white/[0.03] transition-all cursor-pointer group"
      onClick={() => navigate(`/hardware/${device.id}`)}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-medium text-white group-hover:text-emerald-400 transition-colors flex items-center gap-2">
              <Cpu className="w-4 h-4" />
              {device.id}
            </h3>
            <p className="text-xs text-zinc-500 font-mono mt-0.5">{device.label}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <OnlineBadge online={device.isOnline} />
            <StatusBadge status={device.binStatus} />
          </div>
        </div>

        {/* Fill Level */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Fill Level</span>
            <span className="text-sm font-mono font-medium" style={{ color: getFillColor(device.fillPct) }}>
              {device.fillPct}%
            </span>
          </div>
          <ProgressBar value={device.fillPct} size="md" className="group-hover:opacity-100 opacity-90 transition-opacity" />
        </div>

        {/* Telemetry Grid */}
        <div className="grid grid-cols-2 gap-4 mb-5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.03]">
          <div className="flex items-center gap-2">
            <Battery className={`w-3.5 h-3.5 ${device.batteryPct !== null && device.batteryPct < 20 ? 'text-red-400' : 'text-zinc-500'}`} />
            <div>
              <p className="text-[10px] font-mono text-zinc-600 uppercase">Battery</p>
              <p className="text-xs font-mono text-zinc-300">{device.batteryPct === null ? '—' : `${device.batteryPct}%`}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Wifi className="w-3.5 h-3.5 text-zinc-500" />
            <div>
              <p className="text-[10px] font-mono text-zinc-600 uppercase">Signal</p>
              <p className="text-xs font-mono text-zinc-300">{formatSignal(device.rssi)}</p>
            </div>
          </div>
          {device.temperatureC !== null && (
            <div className="flex items-center gap-2">
              <Thermometer className="w-3.5 h-3.5 text-zinc-500" />
              <div>
                <p className="text-[10px] font-mono text-zinc-600 uppercase">Temp</p>
                <p className="text-xs font-mono text-zinc-300">{formatTemperature(device.temperatureC)}</p>
              </div>
            </div>
          )}
          {device.humidityPct !== null && (
            <div className="flex items-center gap-2">
              <Droplets className="w-3.5 h-3.5 text-zinc-500" />
              <div>
                <p className="text-[10px] font-mono text-zinc-600 uppercase">Humidity</p>
                <p className="text-xs font-mono text-zinc-300">{formatHumidity(device.humidityPct)}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-600">
          <span>Firmware: {device.firmware || 'not reported'}</span>
          <span>{formatRelativeTime(device.lastUpdate)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
