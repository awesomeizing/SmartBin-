import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/formatters';
import type { TimelineEvent } from '@/types';
import {
  Truck, AlertTriangle, CheckCircle, Wifi, WifiOff, Radio,
  Bell, ArrowUpRight, Activity
} from 'lucide-react';

type FeedItem = {
  id: string;
  icon: typeof Activity;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
  timestamp: number;
};

function mapTimelineToFeed(event: TimelineEvent): FeedItem {
  const mapping: Record<string, { icon: typeof Activity; color: string; bg: string }> = {
    SENSOR_UPDATE: { icon: Radio, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    THRESHOLD_REACHED: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    COLLECTION_COMPLETED: { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    TRUCK_DISPATCHED: { icon: Truck, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    TRUCK_ARRIVED: { icon: Truck, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    DEVICE_ONLINE: { icon: Wifi, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    DEVICE_OFFLINE: { icon: WifiOff, color: 'text-red-400', bg: 'bg-red-500/10' },
    NOTIFICATION_SENT: { icon: Bell, color: 'text-zinc-400', bg: 'bg-white/5' },
    SENSOR_FAULT: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10' },
    DB_UPDATED: { icon: Activity, color: 'text-zinc-400', bg: 'bg-white/5' },
  };

  const m = mapping[event.kind] ?? { icon: Activity, color: 'text-zinc-400', bg: 'bg-white/5' };

  return {
    id: event.id,
    icon: m.icon,
    iconColor: m.color,
    iconBg: m.bg,
    title: event.detail,
    subtitle: event.actor,
    timestamp: event.timestamp,
  };
}

interface ActivityFeedProps {
  events: TimelineEvent[];
  maxItems?: number;
  className?: string;
}

export function ActivityFeed({ events, maxItems = 8, className }: ActivityFeedProps) {
  const items = events.slice(0, maxItems).map(mapTimelineToFeed);

  return (
    <div className={cn("divide-y divide-white/[0.03]", className)}>
      {items.map((item, i) => (
        <div
          key={item.id}
          className="flex items-start gap-3 py-3 px-1 hover:bg-white/[0.01] transition-colors rounded-lg group"
          style={{ animationDelay: `${i * 50}ms` }}
        >
          {/* Icon */}
          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5", item.iconBg)}>
            <item.icon className={cn("w-4 h-4", item.iconColor)} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-zinc-200 leading-snug line-clamp-2">
              {item.title}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-mono text-zinc-600">
                {item.subtitle}
              </span>
              <span className="text-zinc-700">·</span>
              <span className="text-[10px] text-zinc-600">
                {formatRelativeTime(item.timestamp)}
              </span>
            </div>
          </div>

          {/* Chevron on hover */}
          <ArrowUpRight className="w-4 h-4 text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
        </div>
      ))}
    </div>
  );
}
