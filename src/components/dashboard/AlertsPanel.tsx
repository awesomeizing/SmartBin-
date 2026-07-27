import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/formatters';
import type { Alert } from '@/types';
import { SeverityBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, Eye } from 'lucide-react';

interface AlertsPanelProps {
  alerts: Alert[];
  maxItems?: number;
  onAcknowledge?: (id: string) => void;
  onResolve?: (id: string) => void;
  className?: string;
}

export function AlertsPanel({ alerts, maxItems = 6, onAcknowledge, onResolve, className }: AlertsPanelProps) {
  const activeAlerts = alerts
    .filter(a => a.state === 'active' || a.state === 'acknowledged')
    .slice(0, maxItems);

  return (
    <div className={cn("divide-y divide-white/[0.03]", className)}>
      {activeAlerts.length === 0 ? (
        <div className="py-12 text-center">
          <CheckCircle className="w-8 h-8 text-emerald-500/50 mx-auto mb-3" />
          <p className="text-sm text-zinc-500 font-mono">All clear — no active alerts</p>
        </div>
      ) : (
        activeAlerts.map((alert, _i) => (
          <div
            key={alert.id}
            className="py-3 px-1 hover:bg-white/[0.01] transition-colors rounded-lg group"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <SeverityBadge severity={alert.severity} />
                  <span className="text-[10px] text-zinc-600">
                    {formatRelativeTime(alert.raisedAt)}
                  </span>
                </div>
                <p className="text-sm text-zinc-200 leading-snug line-clamp-2">
                  {alert.message}
                </p>
                <span className="text-[10px] font-mono text-zinc-600 mt-1 inline-block">
                  {alert.binId}
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {alert.state === 'active' && onAcknowledge && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-zinc-500 hover:text-amber-400"
                    onClick={() => onAcknowledge(alert.id)}
                    title="Acknowledge"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                )}
                {onResolve && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-zinc-500 hover:text-emerald-400"
                    onClick={() => onResolve(alert.id)}
                    title="Resolve"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
