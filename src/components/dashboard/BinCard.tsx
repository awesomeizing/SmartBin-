import { Card, CardContent } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress';
import { formatRelativeTime } from '@/lib/formatters';
import { getFillColor } from '@/lib/calculations';
import { Wifi, WifiOff, AlertTriangle, CheckCircle2, Clock, Ruler } from 'lucide-react';
import type { BinSummary } from '@/types';
import { OLED_CHANNELS } from '@/constants/hardware';
import type { BinId } from '@/constants/hardware';
import { useNavigate } from 'react-router-dom';

interface BinCardProps {
  bin: BinSummary;
  /** If true, clicking navigates to the detail view */
  linkable?: boolean;
}

/**
 * BinCard — the primary widget for a single physical SmartBin.
 *
 * Displays:
 *   - Bin name + ID
 *   - Fill percentage with visual bar (real formula colours)
 *   - Raw sensor distance (cm)
 *   - Status (OK / FILLING / FULL / Sensor Offline)
 *   - Sensor online/offline indicator
 *   - Last updated timestamp
 *
 * When the sensor is offline, the fill percentage is hidden rather than
 * showing a stale number as if it were live data.
 */
export function BinCard({ bin, linkable = true }: BinCardProps) {
  const navigate = useNavigate();
  const fillColor = getFillColor(bin.fillPct);
  const oledChannel = OLED_CHANNELS[bin.id as BinId] ?? '—';

  const statusLabel = !bin.isOnline
    ? 'Sensor Offline'
    : bin.fillPct >= 80
    ? 'FULL'
    : bin.fillPct >= 50
    ? 'FILLING'
    : 'OK';

  const statusColor = !bin.isOnline
    ? '#71717a'
    : bin.fillPct >= 80
    ? '#ef4444'
    : bin.fillPct >= 50
    ? '#f59e0b'
    : '#22c55e';

  const borderColor = !bin.isOnline
    ? 'border-white/[0.05]'
    : bin.fillPct >= 80
    ? 'border-red-500/20'
    : bin.fillPct >= 50
    ? 'border-amber-500/15'
    : 'border-white/[0.05]';

  const handleClick = () => {
    if (linkable) navigate(`/hardware/${bin.id}`);
  };

  return (
    <Card
      className={`bg-white/[0.01] ${borderColor} transition-all duration-300 ${linkable ? 'hover:bg-white/[0.03] cursor-pointer' : ''} group`}
      onClick={handleClick}
    >
      <CardContent className="p-5">
        {/* Header: Name + Online badge */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-medium text-white text-base group-hover:text-emerald-400 transition-colors">
              {bin.label}
            </h3>
            <p className="text-[10px] font-mono text-zinc-500 mt-0.5">{bin.id}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {bin.isOnline ? (
              <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                <Wifi className="w-3 h-3" />
                Online
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-mono text-zinc-500">
                <WifiOff className="w-3 h-3" />
                Offline
              </span>
            )}
          </div>
        </div>

        {/* Fill Level */}
        <div className="mb-4">
          {bin.isOnline ? (
            <>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Fill Level</span>
                <span className="text-2xl font-mono font-bold" style={{ color: fillColor }}>
                  {bin.fillPct}%
                </span>
              </div>
              <ProgressBar value={bin.fillPct} size="lg" />
              <div className="flex items-center gap-1 mt-1.5">
                <Ruler className="w-3 h-3 text-zinc-600" />
                <span className="text-[10px] font-mono text-zinc-600">{bin.distanceCm}cm from sensor</span>
              </div>
            </>
          ) : (
            <div className="py-3 rounded-lg bg-zinc-900/50 border border-white/[0.04] flex items-center justify-center gap-2">
              <WifiOff className="w-4 h-4 text-zinc-600" />
              <span className="text-sm font-mono text-zinc-500">Waiting for sensor data</span>
            </div>
          )}
        </div>

        {/* Status badge */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {!bin.isOnline ? (
              <AlertTriangle className="w-3.5 h-3.5 text-zinc-500" />
            ) : bin.fillPct >= 80 ? (
              <AlertTriangle className="w-3.5 h-3.5" style={{ color: statusColor }} />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5" style={{ color: statusColor }} />
            )}
            <span className="text-xs font-mono font-bold" style={{ color: statusColor }}>
              {statusLabel}
            </span>
          </div>
          {bin.fillPct >= 80 && bin.isOnline && (
            <span className="text-[10px] font-mono font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full animate-pulse">
              LED ON
            </span>
          )}
        </div>

        {/* Footer: OLED channel + last updated */}
        <div className="flex items-center justify-between pt-3 border-t border-white/[0.04]">
          <span className="text-[10px] font-mono text-zinc-700">OLED ch{oledChannel}</span>
          <span className="flex items-center gap-1 text-[10px] font-mono text-zinc-600">
            <Clock className="w-2.5 h-2.5" />
            {formatRelativeTime(bin.lastUpdate)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
