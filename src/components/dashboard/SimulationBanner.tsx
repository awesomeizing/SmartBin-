import { FlaskConical } from 'lucide-react';

interface SimulationBannerProps {
  /** When true, renders the banner; otherwise renders nothing */
  visible: boolean;
}

/**
 * SimulationBanner — clearly signals when the app is running in DEMO DATA mode.
 *
 * Displayed prominently so there is NEVER any ambiguity about whether the data
 * shown is from real hardware or from the controlled simulation.
 *
 * Hidden entirely when IS_DEMO_MODE is false and real Firebase telemetry is active.
 */
export function SimulationBanner({ visible }: SimulationBannerProps) {
  if (!visible) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/8 border border-amber-500/20 text-sm">
      <FlaskConical className="w-4 h-4 text-amber-400 shrink-0" />
      <div className="min-w-0">
        <span className="font-mono font-bold text-amber-400 text-xs uppercase tracking-wider">
          ⚠ DEMO DATA
        </span>
        <span className="text-zinc-400 text-xs ml-2">
          — This is simulated test data, NOT live hardware telemetry. Configure Firebase + flash ESP32 firmware to enable LIVE IoT mode.
        </span>
      </div>
    </div>
  );
}
