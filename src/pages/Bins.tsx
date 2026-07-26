import { useState } from 'react';
import { useDatabase } from '@/contexts/DatabaseContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Search, Plus, Trash2, Edit2, Activity } from 'lucide-react';

export function Bins() {
  const { bins, loading, deleteBin } = useDatabase();
  const [search, setSearch] = useState('');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Activity className="w-5 h-5 text-zinc-500 animate-spin" />
      </div>
    );
  }

  const binList = Object.values(bins || {}).filter((bin: any) => 
    bin.location?.toLowerCase().includes(search.toLowerCase()) ||
    bin.id?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-fade-in pb-12 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/[0.05] pb-6">
        <div>
          <h1 className="text-2xl font-display font-medium tracking-tight">Fleet Management</h1>
          <p className="text-zinc-500 text-sm mt-1">Configure and monitor deployed hardware units.</p>
        </div>
        <Button className="shrink-0 rounded-full px-6 shadow-xl shadow-white/5"><Plus className="w-4 h-4 mr-2" /> Provision Unit</Button>
      </div>

      <Card className="bg-white/[0.01] border-white/[0.05] overflow-hidden">
        <CardHeader className="border-b border-white/[0.05] p-4 bg-white/[0.01]">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
            <Input 
              placeholder="Search by ID or Location..." 
              className="pl-9 bg-white/[0.03] border-white/[0.05] h-10 rounded-lg text-sm font-mono placeholder:text-zinc-600 focus-visible:bg-white/[0.05]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="text-xs uppercase bg-black/20 text-zinc-500 font-mono tracking-wider">
                <tr>
                  <th className="px-6 py-4 font-medium border-b border-white/[0.05]">Unit ID</th>
                  <th className="px-6 py-4 font-medium border-b border-white/[0.05]">Location</th>
                  <th className="px-6 py-4 font-medium border-b border-white/[0.05]">Capacity</th>
                  <th className="px-6 py-4 font-medium border-b border-white/[0.05]">Power</th>
                  <th className="px-6 py-4 font-medium border-b border-white/[0.05]">Last Sync</th>
                  <th className="px-6 py-4 text-right font-medium border-b border-white/[0.05]">Config</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {binList.length > 0 ? binList.map((bin: any) => (
                  <tr key={bin.id} className="hover:bg-white/[0.02] transition-colors group cursor-default">
                    <td className="px-6 py-4 font-mono text-zinc-300">{bin.id}</td>
                    <td className="px-6 py-4 text-zinc-200">{bin.location}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-20 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${bin.fillLevel >= 80 ? 'bg-zinc-300' : 'bg-zinc-600'}`} 
                            style={{ width: `${Math.min(bin.fillLevel, 100)}%` }} 
                          />
                        </div>
                        <span className="font-mono text-zinc-400 text-xs w-8">{bin.fillLevel}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-zinc-400 text-xs">{bin.battery}%</td>
                    <td className="px-6 py-4 text-zinc-600 font-mono text-xs">{bin.lastCollection || '—'}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/10 rounded-md">
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-md" onClick={() => deleteBin(bin.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-zinc-500 font-mono text-sm">
                      No units deployed.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
