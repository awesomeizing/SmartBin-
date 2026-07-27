import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDatabase } from '@/contexts/DatabaseContext';
import {
  LayoutDashboard, Map, Bell, BarChart3, Trash2, Settings, Truck,
  Activity, Shield, BrainCircuit, FileBarChart, LogOut, ChevronLeft, ChevronRight, Cpu
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';

const navItems = [
  { name: 'Overview', to: '/dashboard', icon: LayoutDashboard },
  { name: 'Map View', to: '/map', icon: Map },
  { name: 'Bin Fleet', to: '/bins', icon: Trash2 },
  { name: 'Trucks', to: '/trucks', icon: Truck },
  { name: 'Alerts', to: '/alerts', icon: Bell },
  { name: 'Hardware', to: '/hardware', icon: Cpu },
  { name: 'Analytics', to: '/analytics', icon: BarChart3 },
  { name: 'AI Insights', to: '/ai', icon: BrainCircuit },
];

const adminItems = [
  { name: 'Reports', to: '/reports', icon: FileBarChart },
  { name: 'Admin', to: '/admin', icon: Shield },
  { name: 'Settings', to: '/settings', icon: Settings },
];

export function Sidebar() {
  const { currentUser, logout } = useAuth();
  const { kpis } = useDatabase();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <aside className={cn(
      "bg-background/50 backdrop-blur-xl border-r border-white/[0.05] h-screen sticky top-0 flex flex-col transition-all duration-300 z-20 hidden md:flex",
      collapsed ? "w-[72px]" : "w-64"
    )}>
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-white/[0.05]">
        <NavLink to="/dashboard" className="flex items-center gap-2 font-display text-lg font-medium tracking-tight">
          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shrink-0">
            <Activity className="w-4 h-4 text-black" />
          </div>
          {!collapsed && <span>SmartBin OS</span>}
        </NavLink>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-6 h-6 rounded-md bg-white/[0.05] flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/10 transition-colors"
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-6 px-3 flex flex-col gap-1">
        {!collapsed && (
          <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-3 px-3">
            Operations
          </div>
        )}
        {navItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.to}
            title={collapsed ? item.name : undefined}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative group",
                isActive
                  ? "bg-white/[0.06] text-white shadow-sm"
                  : "text-zinc-500 hover:text-white hover:bg-white/[0.03]",
                collapsed && "justify-center px-0"
              )
            }
          >
            {({ isActive }) => (
              <>
                {/* Active indicator glow */}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-white rounded-r shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
                )}
                <item.icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span>{item.name}</span>}
                {/* Alert count badge */}
                {item.name === 'Alerts' && kpis.activeAlerts > 0 && (
                  <span className={cn(
                    "ml-auto text-[10px] font-mono bg-red-500/20 text-red-400 rounded-full",
                    collapsed ? "absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center" : "px-1.5 py-0.5"
                  )}>
                    {kpis.activeAlerts}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}

        {!collapsed && (
          <div className="mt-8 text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-3 px-3">
            Administration
          </div>
        )}
        {collapsed && <div className="my-4 border-t border-white/[0.05]" />}
        {adminItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.to}
            title={collapsed ? item.name : undefined}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative",
                isActive
                  ? "bg-white/[0.06] text-white shadow-sm"
                  : "text-zinc-500 hover:text-white hover:bg-white/[0.03]",
                collapsed && "justify-center px-0"
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-white rounded-r shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
                )}
                <item.icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span>{item.name}</span>}
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* User Footer */}
      <div className="p-3 border-t border-white/[0.05]">
        <div className={cn(
          "flex items-center gap-3 p-2 rounded-xl hover:bg-white/[0.02] transition-colors",
          collapsed && "justify-center"
        )}>
          <Avatar name={currentUser?.displayName ?? 'Admin'} size="sm" />
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate text-white">
                {currentUser?.displayName ?? 'Admin User'}
              </p>
              <p className="text-[10px] text-zinc-600 truncate font-mono">administrator</p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={handleLogout}
              className="text-zinc-600 hover:text-red-400 transition-colors p-1"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
