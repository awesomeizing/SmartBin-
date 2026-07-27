import { useState, useMemo } from 'react';
import { useDatabase } from '@/contexts/DatabaseContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SeverityBadge } from '@/components/ui/badge';
import { Badge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { formatRelativeTime } from '@/lib/formatters';
import { Search, CheckCircle, Eye } from 'lucide-react';

export function Alerts() {
  const { alerts, acknowledgeAlert, resolveAlert } = useDatabase();
  const [search, setSearch] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');

  const tabs = [
    { id: 'active', label: 'Active', count: alerts.filter(a => a.state === 'active').length },
    { id: 'acknowledged', label: 'Acknowledged', count: alerts.filter(a => a.state === 'acknowledged').length },
    { id: 'resolved', label: 'Resolved', count: alerts.filter(a => a.state === 'resolved').length },
    { id: 'all', label: 'All', count: alerts.length },
  ];

  const filteredAlerts = useMemo(() => {
    return alerts.filter(a => {
      const matchesSearch = !search ||
        a.message.toLowerCase().includes(search.toLowerCase()) ||
        a.binId.toLowerCase().includes(search.toLowerCase()) ||
        a.binLabel.toLowerCase().includes(search.toLowerCase());
      const matchesSeverity = filterSeverity === 'all' || a.severity === filterSeverity;
      return matchesSearch && matchesSeverity;
    });
  }, [alerts, search, filterSeverity]);

  return (
    <div className="space-y-8 animate-fade-in pb-12 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/[0.05] pb-6">
        <div>
          <h1 className="text-2xl font-display font-medium tracking-tight">Alert Center</h1>
          <p className="text-zinc-500 text-sm mt-1">Monitor and manage system alerts across all deployments.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={alerts.filter(a => a.state === 'active').length > 0 ? 'danger' : 'success'} dot pulse size="md">
            {alerts.filter(a => a.state === 'active').length} Active
          </Badge>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-3.5 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search alerts..."
            className="pl-9 bg-white/[0.03] border-white/[0.05] h-11"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {['all', 'critical', 'warning', 'info'].map(sev => (
            <Button
              key={sev}
              variant={filterSeverity === sev ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setFilterSeverity(sev)}
              className="capitalize text-xs"
            >
              {sev}
            </Button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} defaultTab="active">
        {(activeTab) => {
          const tabAlerts = filteredAlerts.filter(a => activeTab === 'all' || a.state === activeTab);

          if (tabAlerts.length === 0) {
            return (
              <EmptyState
                icon={<CheckCircle className="w-6 h-6 text-emerald-500/50" />}
                title="No alerts found"
                description={search ? 'Try adjusting your search query.' : 'All systems are operating normally.'}
              />
            );
          }

          return (
            <Card className="bg-white/[0.01] border-white/[0.05] overflow-hidden">
              <CardContent className="p-0">
                <div className="divide-y divide-white/[0.03]">
                  {tabAlerts.map(alert => (
                    <div key={alert.id} className="flex items-start gap-4 px-6 py-4 hover:bg-white/[0.015] transition-colors group">
                      {/* Severity Indicator */}
                      <div className="shrink-0 mt-1">
                        <div className={`w-2 h-2 rounded-full ${
                          alert.severity === 'critical' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' :
                          alert.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
                        }`} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <SeverityBadge severity={alert.severity} />
                          <Badge variant="outline" size="sm">{alert.type.replace(/_/g, ' ')}</Badge>
                        </div>
                        <p className="text-sm text-zinc-200 mb-1">{alert.message}</p>
                        <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-600">
                          <span>{alert.binId}</span>
                          <span>·</span>
                          <span>{alert.binLabel}</span>
                          <span>·</span>
                          <span>{formatRelativeTime(alert.raisedAt)}</span>
                          {alert.acknowledgedBy && (
                            <>
                              <span>·</span>
                              <span>Ack: {alert.acknowledgedBy}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        {alert.state === 'active' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-zinc-400 hover:text-amber-400"
                            onClick={() => acknowledgeAlert(alert.id)}
                          >
                            <Eye className="w-3.5 h-3.5 mr-1" /> Acknowledge
                          </Button>
                        )}
                        {alert.state !== 'resolved' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-zinc-400 hover:text-emerald-400"
                            onClick={() => resolveAlert(alert.id)}
                          >
                            <CheckCircle className="w-3.5 h-3.5 mr-1" /> Resolve
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        }}
      </Tabs>
    </div>
  );
}
