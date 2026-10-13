// ─────────────────────────────────────────────────────────────
// SmartBin+ — Physical fleet panel
// ─────────────────────────────────────────────────────────────
// Device status strip + the four bin cards. Drops into any page as a single
// element; all of its numbers derive from `liveBins`.
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { AlertTriangle, FlaskConical, Radio } from 'lucide-react';
import { useDatabase } from '@/contexts/DatabaseContext';
import { PhysicalBinCard } from '@/components/bins/PhysicalBinCard';
import { LIVENESS_TICK_MS } from '@/config/devices.config';
import { IS_SIMULATION, MODE_BANNER } from '@/config/mode';
import { formatFill } from '@/lib/telemetry';

/** Shared clock so every "4s ago" on the page ticks together. */
function useNowTick() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), LIVENESS_TICK_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function PhysicalFleet() {
  const { liveBins, fleetStats, deviceError } = useDatabase();
  const now = useNowTick();

  return (
    <section aria-labelledby="fleet-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="fleet-heading" className="text-lg font-semibold text-white">
            Physical Bins
          </h2>
          <p className="text-sm text-zinc-500">
            {fleetStats.total} registered devices · {fleetStats.online} online
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {IS_SIMULATION && MODE_BANNER && (
            <span
              title={MODE_BANNER.detail}
              className="flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold tracking-wide text-amber-400"
            >
              <FlaskConical aria-hidden="true" className="h-3.5 w-3.5" />
              {MODE_BANNER.label}
            </span>
          )}

          {fleetStats.collectionRequired && (
            <span className="flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-400">
              <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
              Collection required — {fleetStats.binsNeedingCollection.join(', ')}
            </span>
          )}
        </div>
      </div>

      {/* Transport failure is stated, not rendered as four offline bins. */}
      {deviceError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Cannot reach the device backend</p>
            <p className="mt-0.5 text-red-300/80">{deviceError}</p>
          </div>
        </div>
      )}

      {/* Stats — all derived, none hard-coded */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Devices" value={String(fleetStats.total)} />
        <Stat label="Online" value={String(fleetStats.online)} tone="good" icon />
        <Stat
          label="Offline"
          value={String(fleetStats.offline + fleetStats.waiting)}
          tone={fleetStats.offline + fleetStats.waiting > 0 ? 'bad' : undefined}
        />
        <Stat
          label="Average fill"
          value={formatFill(fleetStats.avgFillPct)}
          hint={fleetStats.avgFillPct === null ? 'No live readings' : undefined}
        />
      </dl>

      {/* Desktop 4 across · tablet 2×2 · mobile single column */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {liveBins.map((bin) => (
          <PhysicalBinCard key={bin.binId} bin={bin} now={now} />
        ))}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
  icon,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'bad';
  hint?: string;
  icon?: boolean;
}) {
  const color = tone === 'good' ? 'text-green-400' : tone === 'bad' ? 'text-red-400' : 'text-white';
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-900/50 p-3">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className={`mt-1 flex items-center gap-1.5 text-2xl font-semibold tabular-nums ${color}`}>
        {icon && <Radio aria-hidden="true" className="h-4 w-4" />}
        {value}
      </dd>
      {hint && <p className="mt-0.5 text-[11px] text-zinc-600">{hint}</p>}
    </div>
  );
}
