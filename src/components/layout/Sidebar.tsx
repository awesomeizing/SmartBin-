import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Map, Bell, BarChart3, Trash2, Settings, Users, Truck, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { name: 'Overview', to: '/dashboard', icon: LayoutDashboard },
  { name: 'Map View', to: '/map', icon: Map },
  { name: 'Fleet', to: '/bins', icon: Trash2 },
  { name: 'Vehicles', to: '/trucks', icon: Truck },
  { name: 'Alerts', to: '/alerts', icon: Bell },
  { name: 'Analytics', to: '/analytics', icon: BarChart3 },
];

const adminItems = [
  { name: 'Users', to: '/users', icon: Users },
  { name: 'Settings', to: '/settings', icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="w-64 bg-background/50 backdrop-blur-xl border-r border-white/[0.05] h-screen sticky top-0 flex flex-col transition-all z-20">
      <div className="h-16 flex items-center px-6 border-b border-white/[0.05]">
        <NavLink to="/" className="flex items-center gap-2 font-display text-lg font-medium tracking-tight">
          <div className="w-6 h-6 rounded-md bg-white flex items-center justify-center">
            <Activity className="w-4 h-4 text-black" />
          </div>
          <span>SmartBin OS</span>
        </NavLink>
      </div>

      <div className="flex-1 overflow-y-auto py-6 px-4 flex flex-col gap-1">
        <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-3 px-3">
          Operations
        </div>
        {navItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive 
                  ? "bg-white/[0.05] text-white" 
                  : "text-zinc-500 hover:text-white hover:bg-white/[0.02]"
              )
            }
          >
            <item.icon className="w-4 h-4" />
            {item.name}
          </NavLink>
        ))}

        <div className="mt-8 text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-3 px-3">
          Administration
        </div>
        {adminItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive 
                  ? "bg-white/[0.05] text-white" 
                  : "text-zinc-500 hover:text-white hover:bg-white/[0.02]"
              )
            }
          >
            <item.icon className="w-4 h-4" />
            {item.name}
          </NavLink>
        ))}
      </div>

      <div className="p-4 border-t border-white/[0.05]">
        <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/[0.02] cursor-pointer transition-colors group">
          <div className="w-8 h-8 rounded-full bg-white/[0.05] border border-white/[0.05] flex items-center justify-center text-white text-xs font-mono group-hover:bg-white/[0.1] transition-colors">
            AD
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate text-white">Admin User</p>
            <p className="text-xs text-zinc-500 truncate font-mono">sysadmin</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
