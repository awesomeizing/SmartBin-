import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Search, Menu, Command } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDatabase } from '@/contexts/DatabaseContext';

export function Header() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const { bins } = useDatabase();
  const navigate = useNavigate();

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearch(val);
    
    if (val.length > 1 && bins) {
      const binList = Object.values(bins);
      const matches = binList.filter((b: any) => 
        b.location?.toLowerCase().includes(val.toLowerCase()) || 
        b.id?.toLowerCase().includes(val.toLowerCase())
      ).slice(0, 5);
      setResults(matches);
    } else {
      setResults([]);
    }
  };

  const handleResultClick = (_binId: string) => {
    setSearch('');
    setResults([]);
    navigate('/bins');
  };

  return (
    <header className="h-16 border-b border-white/[0.05] bg-transparent backdrop-blur-md sticky top-0 z-30 flex items-center justify-between px-6">
      <div className="flex items-center gap-4 flex-1">
        <Button variant="ghost" size="icon" className="md:hidden text-zinc-400">
          <Menu className="w-5 h-5" />
        </Button>
        <div className="relative w-full max-w-md hidden md:flex items-center">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input 
            type="search" 
            placeholder="Search resources..." 
            className="w-full pl-9 pr-12 h-9 bg-white/[0.03] border-white/[0.05] text-sm font-sans placeholder:text-zinc-600 focus-visible:bg-white/[0.05] rounded-lg transition-colors"
            value={search}
            onChange={handleSearch}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
            <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-white/10 bg-white/5 px-1.5 font-mono text-[10px] font-medium text-zinc-500 opacity-100">
              <Command className="w-3 h-3" /> K
            </kbd>
          </div>
          {results.length > 0 && (
            <div className="absolute top-12 left-0 w-full bg-zinc-950 border border-white/10 rounded-xl shadow-2xl overflow-hidden py-2 z-50">
              {results.map((r, i) => (
                <div 
                  key={i} 
                  className="px-4 py-2 hover:bg-white/[0.05] cursor-pointer text-sm flex justify-between items-center transition-colors"
                  onClick={() => handleResultClick(r.id)}
                >
                  <span className="font-medium text-white">{r.location}</span>
                  <span className="text-zinc-500 font-mono text-xs px-2 py-0.5 bg-white/5 rounded-md">{r.id}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="relative text-zinc-400 hover:text-white rounded-full">
          <Bell className="w-5 h-5" />
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
        </Button>
      </div>
    </header>
  );
}
