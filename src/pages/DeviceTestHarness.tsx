// ─────────────────────────────────────────────────────────────
// SmartBin+ — Device test harness  (/hardware/test)
// ─────────────────────────────────────────────────────────────
// Injects telemetry exactly as an ESP32 would, so the whole chain can be
// exercised layer by layer before the hardware is wired up:
//
//   inject → Firebase → realtime push → bin state → cards, map, stats, alerts
//
// This writes REAL telemetry to the REAL database. It is a diagnostic tool,
// not a simulator: nothing here runs on its own, and nothing it writes is
// treated differently from a physical device's data.
// ─────────────────────────────────────────────────────────────

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Send, Zap } from 'lucide-react';
import { PHYSICAL_BINS } from '@/config/devices.config';
import { IS_FIREBASE_CONFIGURED } from '@/config/mode';
import { distanceToFillPercent, fillToBand } from '@/lib/telemetry';
import {
  ingestTelemetry,
  reportSensorFault,
} from '@/services/telemetry/TelemetryIngestion';
import { PhysicalFleet } from '@/components/bins/PhysicalFleet';
import { Button } from '@/components/ui/button';

interface LogLine {
  at: number;
  ok: boolean;
  text: string;
}

export function DeviceTestHarness() {
  const [distances, setDistances] = useState<Record<string, number>>(() =>
    Object.fromEntries(PHYSICAL_BINS.map((b) => [b.binId, 7])),
  );
  const [log, setLog] = useState<LogLine[]>([]);
  const [busy, setBusy] = useState(false);

  const append = (ok: boolean, text: string) =>
    setLog((prev) => [{ at: Date.now(), ok, text }, ...prev].slice(0, 40));

  async function send(binId: string) {
    const cfg = PHYSICAL_BINS.find((b) => b.binId === binId)!;
    setBusy(true);
    const result = await ingestTelemetry({
      deviceId: cfg.deviceId,
      binId: cfg.binId,
      distanceCm: distances[binId],
      sensorOk: true,
      rssi: -58,
      firmware: 'test-harness',
    });
    setBusy(false);

    append(
      result.success,
      result.success
        ? `${binId} → ${result.bin.distanceCm} cm = ${result.bin.fillPct}% (${result.bin.status})`
        : `${binId} rejected — ${result.error}`,
    );
  }

  async function sendAll() {
    for (const bin of PHYSICAL_BINS) await send(bin.binId);
  }

  async function fault(binId: string) {
    const cfg = PHYSICAL_BINS.find((b) => b.binId === binId)!;
    setBusy(true);
    const result = await reportSensorFault(cfg.deviceId, cfg.binId);
    setBusy(false);
    append(
      result.success,
      result.success
        ? `${binId} → sensor fault reported (device stays online)`
        : `${binId} fault rejected — ${result.error}`,
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-12">
      <div className="border-b border-white/5 pb-6">
        <Link
          to="/hardware"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-white"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to devices
        </Link>
        <h1 className="text-2xl font-medium tracking-tight">Device Test Harness</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Inject telemetry as an ESP32 would and watch it travel the full chain.
          Writes to the live database.
        </p>
      </div>

      {!IS_FIREBASE_CONFIGURED && (
        <div
          role="alert"
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300"
        >
          Firebase is not configured, so nothing can be written yet. Set the
          <code className="mx-1 rounded bg-black/30 px-1">VITE_FIREBASE_*</code>
          variables in <code className="rounded bg-black/30 px-1">.env.local</code> first.
        </div>
      )}

      {/* Live result — the same component the dashboard uses, so if it
          updates here it will update there. */}
      <PhysicalFleet />

      {/* Controls */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Inject readings</h2>
          <Button onClick={sendAll} disabled={busy || !IS_FIREBASE_CONFIGURED}>
            <Zap aria-hidden="true" className="mr-1.5 h-4 w-4" />
            Send all four
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {PHYSICAL_BINS.map((bin) => {
            const d = distances[bin.binId];
            const pct = distanceToFillPercent(d);
            return (
              <div
                key={bin.binId}
                className="space-y-3 rounded-xl border border-white/10 bg-zinc-900/50 p-4"
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-medium text-white">{bin.label}</span>
                  <span className="font-mono text-xs text-zinc-500">{bin.binId}</span>
                </div>

                <label
                  htmlFor={`d-${bin.binId}`}
                  className="block text-xs text-zinc-500"
                >
                  Distance: <span className="tabular-nums text-white">{d.toFixed(1)} cm</span>
                  {' → '}
                  <span className="tabular-nums text-white">{Math.round(pct)}%</span>
                  {' '}({fillToBand(pct)})
                </label>

                <input
                  id={`d-${bin.binId}`}
                  type="range"
                  min={2}
                  max={13}
                  step={0.1}
                  value={d}
                  onChange={(e) =>
                    setDistances((prev) => ({
                      ...prev,
                      [bin.binId]: Number(e.target.value),
                    }))
                  }
                  className="w-full accent-white"
                />

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => send(bin.binId)}
                    disabled={busy || !IS_FIREBASE_CONFIGURED}
                    className="flex-1"
                  >
                    <Send aria-hidden="true" className="mr-1 h-3.5 w-3.5" />
                    Send
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => fault(bin.binId)}
                    disabled={busy || !IS_FIREBASE_CONFIGURED}
                    title="Device online, sensor not answering"
                  >
                    Fault
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-zinc-600">
          Stop sending for ~50 seconds and the bin should fall to Offline on its
          own, with the other three unaffected. Resume and it returns to Online
          with no page refresh.
        </p>
      </section>

      {/* Log */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-white">Ingestion log</h2>
        <div className="max-h-72 overflow-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs">
          {log.length === 0 ? (
            <p className="text-zinc-600">No telemetry sent yet.</p>
          ) : (
            log.map((line) => (
              <div
                key={line.at + line.text}
                className={line.ok ? 'text-green-400' : 'text-red-400'}
              >
                <span className="text-zinc-600">
                  {new Date(line.at).toLocaleTimeString()}{' '}
                </span>
                {line.ok ? '✓' : '✗'} {line.text}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
