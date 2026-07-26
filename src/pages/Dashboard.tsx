import { useDatabase } from '@/contexts/DatabaseContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Activity, Battery, AlertTriangle, Truck } from 'lucide-react';

export function Dashboard() {
  const { bins, loading } = useDatabase();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Activity className="w-5 h-5 text-zinc-500 animate-spin" />
      </div>
    );
  }

  const binList = Object.values(bins || {});
  const totalBins = binList.length;
  const overflowBins = binList.filter((b: any) => b.fillLevel >= 80).length;
  const avgBattery = binList.length > 0 
    ? Math.round(binList.reduce((acc: number, b: any) => acc + (b.battery || 0), 0) / binList.length)
    : 0;

  return (
    <div className="space-y-8 animate-fade-in pb-12 max-w-7xl mx-auto">
      <div className="flex items-center justify-between border-b border-white/[0.05] pb-6">
        <div>
          <h1 className="text-2xl font-display font-medium tracking-tight">Fleet Overview</h1>
          <p className="text-zinc-500 text-sm mt-1">Real-time status across all active deployments.</p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "Total Units", value: totalBins, icon: Activity, trend: "+12%" },
          { title: "Critical Levels", value: overflowBins, icon: AlertTriangle, trend: overflowBins > 0 ? "Action Required" : "Healthy" },
          { title: "Avg Power", value: `${avgBattery}%`, icon: Battery, trend: "-1% this week" },
          { title: "Active Vehicles", value: "1", icon: Truck, trend: "Optimal" }
        ].map((kpi, i) => (
          <Card key={i} className="bg-white/[0.01] border-white/[0.05] hover:bg-white/[0.02] transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-mono text-zinc-500 uppercase tracking-wider">{kpi.title}</CardTitle>
              <kpi.icon className="w-4 h-4 text-zinc-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-mono font-medium tracking-tight">{kpi.value}</div>
              <div className="text-xs text-zinc-500 mt-2 font-sans">{kpi.trend}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main Panel */}
        <Card className="col-span-2 bg-white/[0.01] border-white/[0.05] min-h-[400px] flex flex-col relative overflow-hidden">
          <div className="absolute inset-0 bg-noise opacity-50 pointer-events-none" />
          <CardHeader className="border-b border-white/[0.05]">
            <CardTitle className="text-sm font-medium tracking-tight">Geospatial Distribution</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex items-center justify-center relative z-10">
             <div className="text-center space-y-4">
               <Map className="w-8 h-8 text-zinc-600 mx-auto" />
               <p className="text-zinc-500 text-sm font-mono tracking-wide">GIS_MODULE_LOADING</p>
             </div>
          </CardContent>
        </Card>
        
        {/* Side Panel */}
        <Card className="bg-white/[0.01] border-white/[0.05]">
          <CardHeader className="border-b border-white/[0.05]">
            <CardTitle className="text-sm font-medium tracking-tight flex items-center justify-between">
              Priority Queue
              <span className="text-xs font-mono bg-white/10 px-2 py-0.5 rounded-full">{overflowBins}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-white/[0.05]">
              {overflowBins > 0 ? binList.filter((b: any) => b.fillLevel >= 80).map((bin: any) => (
                <div key={bin.id} className="flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors cursor-default">
                  <div>
                    <div className="font-medium text-sm">{bin.location}</div>
                    <div className="text-xs text-zinc-500 font-mono mt-1">ID: {bin.id}</div>
                  </div>
                  <div className="text-zinc-300 font-medium font-mono bg-white/10 px-2 py-1 rounded-md text-sm">
                    {bin.fillLevel}%
                  </div>
                </div>
              )) : (
                <div className="text-sm text-zinc-500 text-center py-12 font-mono">
                  No active incidents
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Map(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
      <line x1="9" x2="9" y1="3" y2="18" />
      <line x1="15" x2="15" y1="6" y2="21" />
    </svg>
  )
}
