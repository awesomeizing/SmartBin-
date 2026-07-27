import { useDatabase } from '@/contexts/DatabaseContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Tabs } from '@/components/ui/tabs';
import { formatRelativeTime } from '@/lib/formatters';
import { Shield, Users, ScrollText, Activity, Database, Server, Wifi, HardDrive, Clock } from 'lucide-react';

export function Admin() {
  const { users, auditLogs, bins, trucks, alerts } = useDatabase();

  const tabs = [
    { id: 'users', label: 'Users', icon: <Users className="w-4 h-4" />, count: users.length },
    { id: 'audit', label: 'Audit Log', icon: <ScrollText className="w-4 h-4" /> },
    { id: 'system', label: 'System Health', icon: <Activity className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-8 animate-fade-in pb-12 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.05] pb-6">
        <div>
          <h1 className="text-2xl font-display font-medium tracking-tight flex items-center gap-3">
            <Shield className="w-6 h-6 text-zinc-400" />
            Administration
          </h1>
          <p className="text-zinc-500 text-sm mt-1">User management, audit logs, and system health monitoring.</p>
        </div>
        <Badge variant="success" dot pulse size="md">System Healthy</Badge>
      </div>

      <Tabs tabs={tabs} defaultTab="users">
        {(activeTab) => {
          if (activeTab === 'users') {
            return (
              <Card className="bg-white/[0.01] border-white/[0.05] overflow-hidden">
                <CardHeader className="border-b border-white/[0.05]">
                  <CardTitle className="text-sm font-medium">Registered Users</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-xs uppercase bg-black/20 text-zinc-500 font-mono tracking-wider">
                        <tr>
                          <th className="px-6 py-4 text-left font-medium border-b border-white/[0.05]">User</th>
                          <th className="px-6 py-4 text-left font-medium border-b border-white/[0.05]">Role</th>
                          <th className="px-6 py-4 text-left font-medium border-b border-white/[0.05]">Zone</th>
                          <th className="px-6 py-4 text-left font-medium border-b border-white/[0.05]">Last Login</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.03]">
                        {users.map(user => (
                          <tr key={user.uid} className="hover:bg-white/[0.015] transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <Avatar name={user.displayName} size="sm" />
                                <div>
                                  <p className="text-sm font-medium text-zinc-200">{user.displayName}</p>
                                  <p className="text-[10px] font-mono text-zinc-600">{user.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <Badge
                                variant={user.role === 'administrator' ? 'danger' : user.role === 'municipality' ? 'warning' : 'default'}
                                size="sm"
                              >
                                {user.role}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 text-zinc-400 font-mono text-xs">{user.zone ?? 'All'}</td>
                            <td className="px-6 py-4 text-zinc-500 text-xs">{formatRelativeTime(user.lastLogin)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            );
          }

          if (activeTab === 'audit') {
            return (
              <Card className="bg-white/[0.01] border-white/[0.05] overflow-hidden">
                <CardHeader className="border-b border-white/[0.05]">
                  <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-white/[0.03]">
                    {auditLogs.slice(0, 20).map(log => (
                      <div key={log.id} className="flex items-center gap-4 px-6 py-3 hover:bg-white/[0.015] transition-colors">
                        <div className="w-8 h-8 rounded-lg bg-white/[0.03] flex items-center justify-center shrink-0">
                          <ScrollText className="w-4 h-4 text-zinc-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-zinc-200">{log.details}</p>
                          <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-600 mt-0.5">
                            <span>{log.userName}</span>
                            <span>·</span>
                            <span>{log.action}</span>
                            <span>·</span>
                            <span>{formatRelativeTime(log.timestamp)}</span>
                          </div>
                        </div>
                        <Badge variant="outline" size="sm">{log.resource}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          }

          // System Health
          return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { label: 'Firebase Status', value: 'Connected', icon: Database, color: '#22c55e', status: 'online' },
                { label: 'Database Reads', value: '2,847 / min', icon: HardDrive, color: '#3b82f6', status: 'normal' },
                { label: 'Active Listeners', value: `${bins.length + trucks.length + alerts.length}`, icon: Wifi, color: '#8b5cf6', status: 'normal' },
                { label: 'Uptime', value: '99.97%', icon: Server, color: '#22c55e', status: 'healthy' },
                { label: 'Avg Latency', value: '4.2ms', icon: Clock, color: '#f59e0b', status: 'normal' },
                { label: 'Total Entities', value: `${bins.length + trucks.length + alerts.length + users.length}`, icon: Activity, color: '#3b82f6', status: 'normal' },
              ].map((metric, i) => (
                <Card key={i} className="bg-white/[0.01] border-white/[0.05]">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${metric.color}10` }}>
                        <metric.icon className="w-5 h-5" style={{ color: metric.color }} />
                      </div>
                      <div>
                        <p className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">{metric.label}</p>
                        <p className="text-lg font-mono text-white">{metric.value}</p>
                      </div>
                    </div>
                    <Badge variant="success" dot size="sm">{metric.status}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          );
        }}
      </Tabs>
    </div>
  );
}
