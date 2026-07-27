import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: number | string;
  icon: ReactNode;
  trend?: {
    value: string;
    direction: 'up' | 'down' | 'neutral';
    isGood?: boolean;
  };
  subtitle?: string;
  className?: string;
  loading?: boolean;
  color?: string;
  delay?: number;
}

export function KPICard({
  title,
  value,
  icon,
  trend,
  subtitle,
  className,
  loading,
  color,
  delay = 0,
}: KPICardProps) {
  // Animated count-up for numeric values
  const [displayValue, setDisplayValue] = useState<number | string>(typeof value === 'number' ? 0 : value);

  useEffect(() => {
    if (typeof value !== 'number') {
      setDisplayValue(value);
      return;
    }

    const duration = 1200;
    const startTime = Date.now() + delay;
    const target = value;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      if (elapsed < 0) {
        requestAnimationFrame(animate);
        return;
      }
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(target * eased));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [value, delay]);

  const TrendIcon = trend?.direction === 'up' ? TrendingUp : trend?.direction === 'down' ? TrendingDown : Minus;

  return (
    <div
      className={cn(
        "group relative rounded-2xl border border-white/[0.05] bg-white/[0.01] p-6 hover:bg-white/[0.025] transition-all duration-300 overflow-hidden",
        className
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Subtle glow accent */}
      {color && (
        <div
          className="absolute -top-8 -right-8 w-24 h-24 rounded-full blur-3xl opacity-10 group-hover:opacity-20 transition-opacity duration-500"
          style={{ backgroundColor: color }}
        />
      )}

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-widest">
            {title}
          </span>
          <div className="w-8 h-8 rounded-lg bg-white/[0.03] border border-white/[0.05] flex items-center justify-center text-zinc-400 group-hover:text-zinc-200 transition-colors">
            {icon}
          </div>
        </div>

        {/* Value */}
        {loading ? (
          <div className="h-9 w-20 bg-white/[0.06] rounded animate-pulse" />
        ) : (
          <div className="text-3xl font-mono font-medium tracking-tight text-white">
            {displayValue}
          </div>
        )}

        {/* Trend & Subtitle */}
        <div className="flex items-center gap-2 mt-3">
          {trend && (
            <span className={cn(
              "inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full",
              trend.isGood === true && "text-emerald-400 bg-emerald-500/10",
              trend.isGood === false && "text-red-400 bg-red-500/10",
              trend.isGood === undefined && "text-zinc-400 bg-white/5",
            )}>
              <TrendIcon className="w-3 h-3" />
              {trend.value}
            </span>
          )}
          {subtitle && (
            <span className="text-[11px] text-zinc-600 font-sans">
              {subtitle}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
