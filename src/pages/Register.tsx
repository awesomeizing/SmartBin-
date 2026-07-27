import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Activity, Loader2, ArrowLeft } from 'lucide-react';

export function Register() {
  const { register, isDemoMode } = useAuth();
  const navigate = useNavigate();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemoMode) {
      navigate('/dashboard');
      return;
    }
    
    try {
      setError('');
      setLoading(true);
      await register(email, password, name);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="fixed inset-0 z-0 pointer-events-none bg-noise" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-white/[0.03] blur-[120px] rounded-full pointer-events-none" />

      <Card className="w-full max-w-md bg-white/[0.01] border-white/[0.05] relative z-10 shadow-2xl shadow-black/50 backdrop-blur-xl">
        <div className="absolute top-4 left-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/login')} className="w-8 h-8 text-zinc-500 hover:text-white">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </div>
        
        <CardHeader className="space-y-2 text-center pb-8 pt-10">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-xl bg-white/[0.05] border border-white/[0.05] flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl font-display font-medium tracking-tight">Create Account</CardTitle>
          <CardDescription className="text-zinc-500 font-sans">
            Register for access to the operations console.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && <div className="p-3 mb-6 rounded-lg bg-red-900/10 text-red-400 text-sm border border-red-900/20 text-center font-mono">{error}</div>}
          
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Full Name</label>
              <Input 
                type="text" 
                placeholder="Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="bg-white/[0.03] border-white/[0.05] text-white placeholder:text-zinc-700"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Email address</label>
              <Input 
                type="email" 
                placeholder="you@municipality.gov"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-white/[0.03] border-white/[0.05] text-white placeholder:text-zinc-700"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Password</label>
              <Input 
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-white/[0.03] border-white/[0.05] text-white placeholder:text-zinc-700 font-mono tracking-widest"
              />
            </div>
            
            <Button type="submit" className="w-full mt-8 rounded-xl py-6 text-sm" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {isDemoMode ? "Continue (Demo Mode)" : "Register"}
            </Button>
            
            <div className="text-center mt-6">
              <p className="text-sm text-zinc-500">
                Already have an account? <Link to="/login" className="text-white hover:underline transition-all">Sign In</Link>
              </p>
            </div>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4 pt-6 pb-8 border-t border-white/[0.05]">
          <div className="text-xs text-center text-zinc-600 font-sans w-full">
            Secured by SmartBin OS Identity Provider
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
