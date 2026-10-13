// ─────────────────────────────────────────────────────────────
// SmartBin+ — Physical bin card
// ─────────────────────────────────────────────────────────────
// ONE component, rendered four times from `bins.map(...)`. There is no
// BinCard1 / BinCard2 / BinCard3 / BinCard4, and adding a fifth bin to the
// registry requires no change here.
// ─────────────────────────────────────────────────────────────

import { Link } from 'react-router-dom';
import { Trash2, WifiOff, AlertTriangle, Signal } from 'lucide-react';
import {
  STATUS_COLOR,
  STATUS_LABEL,
  formatDistance,
  formatFill,
  formatLastSeen,
  type LiveBinState,
} from '@/lib/telemetry';
import { cn } from '@/lib/utils';

interface Props {
  bin: LiveBinState;
  /** Re-render clock, so "updated 4s ago" counts up without new telemetry. */
  now: number;
}

export function PhysicalBinCard({ bin, now }: Props) {
  const color = STATUS_COLOR[bin.status];
  const hasReading = bin.fillPct !== null;

  return (
    <Link
      to={`/hardware/${bin.binId}`}
      aria-label={`${bin.label}, ${STATUS_LABEL[bin.status]}, ${formatFill(bin.fillPct)} full`}
      className={cn(
        'group relative flex flex-col gap-4 rounded-xl border p-5 transition-colors',
        'border-white/10 bg-zinc-900/50 hover:border-white/20 hover:bg-zinc-900/80',
        !bin.isOnline && 'opacity-75',
      )}
    >
      {/* Header — name, ID, presence */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-white">{bin.label}</h3>
          <p className="font-mono text-xs text-zinc-500">{bin.binId}</p>
        </div>

        {/* Status is never carried by colour alone — there is an icon and a
            text label beside every dot. */}
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn('h-2 w-2 rounded-full', bin.isOnline && 'animate-pulse')}
            style={{ backgroundColor: bin.isOnline ? '#22c55e' : '#71717a' }}
          />
          <span className={cn('text-xs font-medium', bin.isOnline ? 'text-green-400' : 'text-zinc-500')}>
            {bin.isOnline ? 'Online' : bin.presence === 'never-seen' ? 'Registered' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Reading */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <div
            className="text-4xl font-bold leading-none tabular-nums"
            style={{ color: hasReading ? color : '#71717a' }}
          >
            {formatFill(bin.fillPct)}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-sm" style={{ color }}>
            {bin.status === 'OFFLINE' && <WifiOff aria-hidden="true" className="h-3.5 w-3.5" />}
            {bin.status === 'SENSOR_ERROR' && (
              <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
            )}
            {bin.status === 'FULL' && <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />}
            <span>{STATUS_LABEL[bin.status]}</span>
          </div>
        </div>

        <div className="text-right text-xs text-zinc-500">
          <div className="tabular-nums">{formatDistance(bin.distanceCm)}</div>
          {bin.rssi !== null && bin.isOnline && (
            <div className="mt-1 flex items-center justify-end gap-1">
              <Signal aria-hidden="true" className="h-3 w-3" />
              <span className="tabular-nums">{bin.rssi} dBm</span>
            </div>
          )}
        </div>
      </div>

      {/* Fill bar — a hatched, muted track when there is nothing to show, so
          an unmeasured bin can never be mistaken for an empty one. */}
      <div
        role="progressbar"
        aria-valuenow={bin.fillPct ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={hasReading ? `${Math.round(bin.fillPct!)} percent full` : 'No reading'}
        className="h-2 w-full overflow-hidden rounded-full bg-white/5"
      >
        {hasReading ? (
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${bin.fillPct}%`, backgroundColor: color }}
          />
        ) : (
          <div
            className="h-full w-full opacity-40"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg,#3f3f46 0 6px,transparent 6px 12px)',
            }}
          />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-white/5 pt-3 text-xs text-zinc-500">
        <span>
          {bin.presence === 'never-seen'
            ? 'Waiting for device'
            : `Last seen ${formatLastSeen(bin.lastSeen, now)}`}
        </span>
        {bin.needsCollection && (
          <span className="rounded bg-red-500/15 px-1.5 py-0.5 font-medium text-red-400">
            Collect
          </span>
        )}
      </div>
    </Link>
  );
}
