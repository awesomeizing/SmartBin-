import { useState, useMemo } from 'react';
import { useDatabase } from '@/contexts/DatabaseContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, SeverityBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatRelativeTime } from '@/lib/formatters';
import { Bell, Check, CheckCheck, Trash2, BellOff, AlertTriangle, Truck, Battery, Wifi, Recycle } from 'lucide-react';

const typeIcons: Record<string, typeof Bell> = {
  bin_full: AlertTriangle,
  sensor_offline: Wifi,
  battery_low: Battery,
  truck_assigned: Truck,
  collection_completed: Recycle,
  sensor_fault: AlertTriangle,
  overflow: AlertTriangle,
};

export function Notifications() {
  const { notifications, markNotificationRead, markAllNotificationsRead, deleteNotification } = useDatabase();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

  const filtered = useMemo(() => {
    if (filter === 'unread') return notifications.filter(n => !n.read);
    return notifications;
  }, [notifications, filter]);

  return (
    <div className="space-y-8 animate-fade-in pb-12 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/[0.05] pb-6">
        <div>
          <h1 className="text-2xl font-display font-medium tracking-tight">Notification Center</h1>
          <p className="text-zinc-500 text-sm mt-1">Stay updated on all system events and alerts.</p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="text-xs" onClick={markAllNotificationsRead}>
              <CheckCheck className="w-4 h-4 mr-1" /> Mark all read
            </Button>
          )}
          <Badge variant={unreadCount > 0 ? 'danger' : 'success'} dot={unreadCount > 0} size="md">
            {unreadCount} Unread
          </Badge>
        </div>
      </div>

      {/* Filter Buttons */}
      <div className="flex gap-2">
        <Button
          variant={filter === 'all' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setFilter('all')}
        >
          All ({notifications.length})
        </Button>
        <Button
          variant={filter === 'unread' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setFilter('unread')}
        >
          Unread ({unreadCount})
        </Button>
      </div>

      {/* Notification List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<BellOff className="w-6 h-6 text-zinc-600" />}
          title="No notifications"
          description={filter === 'unread' ? 'All caught up!' : 'No notifications to display.'}
        />
      ) : (
        <Card className="bg-white/[0.01] border-white/[0.05] overflow-hidden">
          <CardContent className="p-0">
            <div className="divide-y divide-white/[0.03]">
              {filtered.map(notif => {
                const Icon = typeIcons[notif.type] ?? Bell;

                return (
                  <div
                    key={notif.id}
                    className={`flex items-start gap-4 px-6 py-4 transition-colors group ${
                      notif.read ? 'opacity-60 hover:opacity-80' : 'hover:bg-white/[0.015]'
                    }`}
                  >
                    {/* Icon */}
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                      notif.severity === 'critical' ? 'bg-red-500/10' :
                      notif.severity === 'warning' ? 'bg-amber-500/10' : 'bg-blue-500/10'
                    }`}>
                      <Icon className={`w-4 h-4 ${
                        notif.severity === 'critical' ? 'text-red-400' :
                        notif.severity === 'warning' ? 'text-amber-400' : 'text-blue-400'
                      }`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-zinc-200">{notif.title}</span>
                        {!notif.read && (
                          <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                        )}
                      </div>
                      <p className="text-sm text-zinc-400 line-clamp-2">{notif.message}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <SeverityBadge severity={notif.severity} />
                        <span className="text-[10px] text-zinc-600">{formatRelativeTime(notif.timestamp)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!notif.read && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-zinc-500 hover:text-white"
                          onClick={() => markNotificationRead(notif.id)}
                          title="Mark as read"
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-zinc-500 hover:text-red-400"
                        onClick={() => deleteNotification(notif.id)}
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
