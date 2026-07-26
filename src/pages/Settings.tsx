import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function Settings() {
  return (
    <div className="space-y-8 animate-fade-in max-w-4xl mx-auto pb-12">
      <div className="border-b border-white/[0.05] pb-6">
        <h1 className="text-2xl font-display font-medium tracking-tight">Platform Settings</h1>
        <p className="text-zinc-500 text-sm mt-1">Configure your enterprise environment and hardware thresholds.</p>
      </div>

      <div className="grid gap-6">
        <Card className="bg-white/[0.01] border-white/[0.05]">
          <CardHeader className="border-b border-white/[0.05]">
            <CardTitle className="text-sm font-medium tracking-tight">Organization Profile</CardTitle>
            <CardDescription className="text-zinc-500 font-mono text-xs mt-1 uppercase tracking-wider">Update your municipality or company details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Organization Name</label>
                <Input defaultValue="City of Metropolis" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Contact Email</label>
                <Input defaultValue="admin@metropolis.gov" />
              </div>
            </div>
            <div className="flex justify-end">
              <Button className="rounded-full px-6 shadow-xl shadow-white/5">Save Changes</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/[0.01] border-white/[0.05]">
          <CardHeader className="border-b border-white/[0.05]">
            <CardTitle className="text-sm font-medium tracking-tight">IoT Sensor Thresholds</CardTitle>
            <CardDescription className="text-zinc-500 font-mono text-xs mt-1 uppercase tracking-wider">Global configuration for hardware sensors</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Critical Fill Level (%)</label>
                <Input type="number" defaultValue="80" className="font-mono text-sm" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Low Battery Warning (%)</label>
                <Input type="number" defaultValue="20" className="font-mono text-sm" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Telemetry Ping Rate (s)</label>
                <Input type="number" defaultValue="60" className="font-mono text-sm" />
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" className="rounded-full px-6 text-sm">Apply Global Thresholds</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-red-900/30 bg-red-900/5">
          <CardHeader className="border-b border-red-900/20">
            <CardTitle className="text-sm font-medium tracking-tight text-red-400">Danger Zone</CardTitle>
            <CardDescription className="text-red-900/60 font-mono text-xs mt-1 uppercase tracking-wider">Destructive operations for your environment</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 flex items-center justify-between">
            <p className="text-sm text-zinc-500 max-w-sm">
              Purging data will immediately remove all historical logs and cannot be undone.
            </p>
            <Button variant="destructive" className="rounded-full px-6 shadow-lg shadow-red-900/20">Purge Historical Data</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
