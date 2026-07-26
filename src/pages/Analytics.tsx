import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, LineChart, Line } from 'recharts';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

const collectionData = [
  { name: 'Mon', volume: 4000, efficiency: 85 },
  { name: 'Tue', volume: 3000, efficiency: 88 },
  { name: 'Wed', volume: 2000, efficiency: 92 },
  { name: 'Thu', volume: 2780, efficiency: 90 },
  { name: 'Fri', volume: 1890, efficiency: 95 },
  { name: 'Sat', volume: 2390, efficiency: 80 },
  { name: 'Sun', volume: 3490, efficiency: 82 },
];

export function Analytics() {
  return (
    <div className="space-y-8 animate-fade-in pb-12 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/[0.05] pb-6">
        <div>
          <h1 className="text-2xl font-display font-medium tracking-tight">Analytics & Intelligence</h1>
          <p className="text-zinc-500 text-sm mt-1">Data-driven insights for fleet operations and capacity planning.</p>
        </div>
        <Button variant="outline" className="shrink-0 rounded-full text-xs font-mono tracking-wider">
          <Download className="w-4 h-4 mr-2" />
          EXPORT_PDF
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Chart 1: Collection Volume */}
        <Card className="bg-white/[0.01] border-white/[0.05]">
          <CardHeader className="border-b border-white/[0.05]">
            <CardTitle className="text-sm font-medium tracking-tight">Daily Collection Volume (kg)</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] p-6">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={collectionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ffffff" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#ffffff" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.4)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.4)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(9, 9, 11, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', backdropFilter: 'blur(12px)' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Area type="monotone" dataKey="volume" stroke="#ffffff" fillOpacity={1} fill="url(#colorVolume)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Chart 2: Route Efficiency */}
        <Card className="bg-white/[0.01] border-white/[0.05]">
          <CardHeader className="border-b border-white/[0.05]">
            <CardTitle className="text-sm font-medium tracking-tight">Route Efficiency Score (%)</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] p-6">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={collectionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.4)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} stroke="rgba(255,255,255,0.4)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(9, 9, 11, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', backdropFilter: 'blur(12px)' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Line type="monotone" dataKey="efficiency" stroke="#a1a1aa" strokeWidth={2} dot={{ r: 4, fill: '#a1a1aa', strokeWidth: 0 }} activeDot={{ r: 6, fill: '#fff' }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Chart 3: Weekly Prediction */}
        <Card className="col-span-1 lg:col-span-2 bg-white/[0.01] border-white/[0.05]">
          <CardHeader className="border-b border-white/[0.05]">
            <CardTitle className="text-sm font-medium tracking-tight">AI Capacity Forecasting (Next 7 Days)</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] p-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={collectionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.4)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.4)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(9, 9, 11, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', backdropFilter: 'blur(12px)' }}
                  cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Bar dataKey="volume" fill="#52525b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
