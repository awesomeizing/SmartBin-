import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ChevronRight, Activity, Zap, ShieldCheck, Map, ArrowRight, Cpu, Cloud, Database, Mail } from 'lucide-react';

export function Landing() {
  const navigate = useNavigate();
  const { currentUser, isDemoMode } = useAuth();

  const handleLaunch = () => {
    navigate(currentUser || isDemoMode ? '/dashboard' : '/login');
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden selection:bg-zinc-800 selection:text-white">
      {/* Dynamic Noise Background */}
      <div className="fixed inset-0 z-0 pointer-events-none bg-noise" />

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-background/50 backdrop-blur-xl border-b border-white/[0.05] px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
          <div className="w-6 h-6 rounded-md bg-white flex items-center justify-center">
            <Activity className="w-4 h-4 text-black" />
          </div>
          <span>SmartBin Enterprise</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-400">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#architecture" className="hover:text-white transition-colors">Architecture</a>
          <a href="#impact" className="hover:text-white transition-colors">Impact</a>
          <a href="#contact" className="hover:text-white transition-colors">Contact</a>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="ghost" className="text-zinc-400 hover:text-white" onClick={handleLaunch}>
            {currentUser || isDemoMode ? 'Dashboard' : 'Sign In'}
          </Button>
          <Button className="rounded-full px-6" onClick={handleLaunch}>
            {currentUser || isDemoMode ? 'Open Console' : 'Console'} <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-[100vh] flex flex-col items-center justify-center pt-32 px-6 overflow-hidden">
        {/* Subtle radial spotlight */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-white/[0.03] blur-[120px] rounded-full pointer-events-none" />

        <div className="relative z-10 text-center max-w-4xl mx-auto animate-fade-up">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.02] mb-8">
            <span className="w-2 h-2 rounded-full bg-zinc-300" />
            <span className="text-xs font-mono tracking-wide text-zinc-300">SMARTBIN OS v2.0</span>
          </div>
          
          <h1 className="text-6xl md:text-8xl font-display font-medium tracking-tighter leading-[1.1] mb-8">
            Waste management, <br />
            <span className="accent-gradient">beautifully engineered.</span>
          </h1>
          
          <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed font-sans">
            Transform municipal logistics with real-time IoT telemetry, deterministic routing algorithms, and a perfectly crafted operations console.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="w-full sm:w-auto rounded-full px-8 shadow-xl shadow-white/5 hover:shadow-white/10" onClick={handleLaunch}>
              {currentUser || isDemoMode ? 'Open Live 4-Bin Dashboard' : 'Deploy Platform'} <ChevronRight className="ml-2 w-4 h-4" />
            </Button>
            <Button size="lg" variant="outline" className="w-full sm:w-auto rounded-full px-8 hover:bg-white/[0.03]" onClick={() => window.location.hash = '#architecture'}>
              Read Documentation
            </Button>
          </div>
        </div>

        {/* Live KPI Strip */}
        <div className="mt-32 w-full max-w-5xl bg-white/[0.01] border border-white/[0.05] rounded-2xl p-8 grid grid-cols-2 md:grid-cols-4 gap-8 relative z-10 animate-fade-in backdrop-blur-md">
          {[
            { value: "99.9%", label: "Uptime SLA" },
            { value: "4ms", label: "P99 Latency" },
            { value: "E2E", label: "Encryption" },
            { value: "40%", label: "Fuel Savings" }
          ].map((stat, i) => (
            <div key={i} className="flex flex-col items-center justify-center text-center">
              <div className="text-4xl font-display font-medium text-white mb-2 tracking-tight">{stat.value}</div>
              <div className="text-xs font-mono text-zinc-500 uppercase tracking-widest">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-32 px-6 relative border-t border-white/[0.02]">
        <div className="max-w-6xl mx-auto relative z-10">
          <div className="text-center mb-24">
            <h2 className="text-4xl md:text-5xl font-display font-medium tracking-tight mb-4">Enterprise primitives.</h2>
            <p className="text-zinc-400 text-lg max-w-2xl mx-auto">Everything you need to operate a fleet of thousands of sensors, built with uncompromising quality.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: Zap, title: "Real-time Telemetry", desc: "Sub-10 second latency from the physical bin sensor directly to the operations console using WebSockets." },
              { icon: Map, title: "Deterministic Routing", desc: "Proprietary algorithms calculate the most efficient collection path based on precise fill levels." },
              { icon: ShieldCheck, title: "Zero-Trust Security", desc: "End-to-end encryption with strict Role-Based Access Control and audit logging." }
            ].map((feature, i) => (
              <div key={i} className="bg-white/[0.01] p-8 rounded-2xl border border-white/[0.05] hover:bg-white/[0.02] transition-colors group">
                <div className="w-10 h-10 rounded-lg bg-white/[0.05] flex items-center justify-center mb-6">
                  <feature.icon className="w-5 h-5 text-zinc-300" />
                </div>
                <h3 className="text-xl font-medium mb-3 tracking-tight">{feature.title}</h3>
                <p className="text-zinc-500 text-sm leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture Section */}
      <section id="architecture" className="py-32 px-6 relative border-t border-white/[0.02] bg-zinc-950/30">
        <div className="max-w-6xl mx-auto relative z-10">
          <div className="text-center mb-24">
            <h2 className="text-4xl md:text-5xl font-display font-medium tracking-tight mb-4">Scalable architecture.</h2>
            <p className="text-zinc-400 text-lg max-w-2xl mx-auto">A robust data pipeline designed for massive throughput and zero data loss.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            <div className="hidden md:block absolute top-1/2 left-[15%] right-[15%] h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-y-1/2 z-0"></div>
            {[
              { icon: Cpu, title: "Hardware Layer", desc: "Edge-computed IoT sensors transmit telemetry over secure MQTT." },
              { icon: Cloud, title: "Cloud Layer", desc: "High-availability databases handle ingestion and synchronization." },
              { icon: Database, title: "Application Layer", desc: "The operations console processes streams in real-time." }
            ].map((arch, i) => (
              <div key={i} className="relative z-10 bg-background p-8 rounded-2xl border border-white/[0.05] text-center flex flex-col items-center">
                <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.05] flex items-center justify-center mb-6">
                  <arch.icon className="w-6 h-6 text-zinc-300" />
                </div>
                <h3 className="text-xl font-medium mb-3 tracking-tight">{arch.title}</h3>
                <p className="text-zinc-500 text-sm leading-relaxed">{arch.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-32 px-6 border-t border-white/[0.02]">
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <div className="w-16 h-16 rounded-full bg-white/[0.03] flex items-center justify-center mx-auto mb-8">
            <Mail className="w-6 h-6 text-zinc-300" />
          </div>
          <h2 className="text-4xl md:text-5xl font-display font-medium tracking-tight mb-6">Deploy in your city.</h2>
          <p className="text-lg text-zinc-400 mb-10">
            Talk to our engineering team about hardware integration, custom deployments, and pilot programs.
          </p>
          
          <div className="bg-white/[0.01] p-8 rounded-3xl border border-white/[0.05] text-left">
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div className="space-y-2">
                <label className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Work Email</label>
                <input type="email" placeholder="you@municipality.gov" className="w-full bg-white/[0.03] border border-white/[0.05] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white/20 transition-colors placeholder:text-zinc-700" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Organization</label>
                <input type="text" placeholder="City of..." className="w-full bg-white/[0.03] border border-white/[0.05] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white/20 transition-colors placeholder:text-zinc-700" />
              </div>
            </div>
            <div className="space-y-2 mb-6">
              <label className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Project Details</label>
              <textarea placeholder="Tell us about your infrastructure..." rows={3} className="w-full bg-white/[0.03] border border-white/[0.05] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white/20 transition-colors placeholder:text-zinc-700 resize-none"></textarea>
            </div>
            <Button className="w-full rounded-xl py-6 text-base">
              Request Enterprise Access
            </Button>
          </div>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="py-12 border-t border-white/[0.05] text-center text-zinc-500 relative z-10 flex flex-col items-center gap-6">
        <div className="flex items-center gap-2 font-display text-lg font-medium tracking-tight text-white">
          <Activity className="w-5 h-5 text-white" /> SmartBin Enterprise
        </div>
        <p className="text-sm">© 2026 SmartBin OS. All rights reserved.</p>
      </footer>
    </div>
  );
}
