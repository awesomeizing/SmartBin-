import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export function AppShell() {
  return (
    <div className="flex min-h-screen bg-background text-foreground overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
        {/* Luxury animated mesh & noise background system */}
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden bg-noise">
          <div className="absolute top-[10%] left-[20%] w-[600px] h-[600px] rounded-full bg-white/[0.06] blur-[100px] animate-mesh" />
          <div className="absolute bottom-[20%] right-[10%] w-[800px] h-[800px] rounded-full bg-white/[0.04] blur-[120px] animate-mesh" style={{ animationDelay: '-5s' }} />
        </div>
        
        <Header />
        
        <main className="flex-1 overflow-y-auto z-10 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
