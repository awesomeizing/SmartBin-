import { cn } from "@/lib/utils"

interface ProgressBarProps {
  value: number; // 0-100
  max?: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  showLabel?: boolean;
  animated?: boolean;
}

export function ProgressBar({
  value,
  max = 100,
  className,
  size = 'md',
  color,
  showLabel = false,
  animated = true,
}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const barColor = color ?? getAutoColor(pct);

  const heights = { sm: 'h-1', md: 'h-2', lg: 'h-3' };

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className={cn("flex-1 bg-white/[0.05] rounded-full overflow-hidden", heights[size])}>
        <div
          className={cn(
            "h-full rounded-full",
            animated && "transition-all duration-700 ease-out"
          )}
          style={{
            width: `${pct}%`,
            backgroundColor: barColor,
          }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-mono text-zinc-400 w-10 text-right">
          {Math.round(pct)}%
        </span>
      )}
    </div>
  );
}

/** Circular progress indicator */
interface CircularProgressProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  showLabel?: boolean;
  className?: string;
}

export function CircularProgress({
  value,
  size = 64,
  strokeWidth = 4,
  color,
  showLabel = true,
  className,
}: CircularProgressProps) {
  const pct = Math.max(0, Math.min(100, value));
  const barColor = color ?? getAutoColor(pct);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={barColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      {showLabel && (
        <span className="absolute text-xs font-mono font-medium text-zinc-300">
          {Math.round(pct)}%
        </span>
      )}
    </div>
  );
}

/** Auto-color based on fill level thresholds (report §3.1) */
function getAutoColor(pct: number): string {
  if (pct >= 80) return '#ef4444'; // Critical
  if (pct >= 51) return '#f59e0b'; // Warning
  return '#22c55e'; // Healthy
}
