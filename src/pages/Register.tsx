import { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Activity, Loader2, ArrowLeft, Eye, EyeOff, Check, X, ShieldCheck } from 'lucide-react';

// ── Password Strength Validation ───────────────────────────

interface PasswordRule {
  label: string;
  test: (pw: string) => boolean;
}

const PASSWORD_RULES: PasswordRule[] = [
  { label: 'At least 8 characters',          test: (pw) => pw.length >= 8 },
  { label: 'One uppercase letter (A-Z)',      test: (pw) => /[A-Z]/.test(pw) },
  { label: 'One lowercase letter (a-z)',      test: (pw) => /[a-z]/.test(pw) },
  { label: 'One number (0-9)',                test: (pw) => /[0-9]/.test(pw) },
  { label: 'One special character (!@#$%^&*)', test: (pw) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pw) },
];

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  const passed = PASSWORD_RULES.filter(r => r.test(password)).length;
  if (passed <= 1) return { score: passed, label: 'Weak',       color: '#ef4444' };
  if (passed <= 2) return { score: passed, label: 'Fair',       color: '#f59e0b' };
  if (passed <= 3) return { score: passed, label: 'Good',       color: '#eab308' };
  if (passed <= 4) return { score: passed, label: 'Strong',     color: '#22c55e' };
  return               { score: passed, label: 'Very Strong', color: '#10b981' };
}

const ROLES = [
  { value: 'user',          label: 'Viewer' },
  { value: 'municipality',  label: 'Municipality Operator' },
  { value: 'administrator', label: 'Administrator' },
] as const;

export function Register() {
  const { register, isDemoMode } = useAuth();
  const navigate = useNavigate();
  
  const [name, setName] = useState('');
  const [organization, setOrganization] = useState('');
  const [role, setRole] = useState('user');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const strength = useMemo(() => getPasswordStrength(password), [password]);
  const allRulesPassed = PASSWORD_RULES.every(r => r.test(password));
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  const canSubmit = name.trim() && email.trim() && allRulesPassed && passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!allRulesPassed) {
      setError('Password does not meet all requirements.');
      return;
    }
    if (!passwordsMatch) {
      setError('Passwords do not match.');
      return;
    }

    if (isDemoMode) {
      navigate('/dashboard');
      return;
    }
    
    try {
      setError('');
      setLoading(true);
      await register(email, password, name, { organization, role, phone });
      navigate('/dashboard');
    } catch (err: any) {
      // Map Firebase error codes to user-friendly messages
      const code = err?.code || '';
      if (code === 'auth/email-already-in-use') {
        setError('This email is already registered. Try signing in instead.');
      } else if (code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else if (code === 'auth/weak-password') {
        setError('Password is too weak. Please choose a stronger password.');
      } else {
        setError(err.message || 'Failed to create account. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="fixed inset-0 z-0 pointer-events-none bg-noise" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-white/[0.03] blur-[120px] rounded-full pointer-events-none" />

      <Card className="w-full max-w-lg bg-white/[0.01] border-white/[0.05] relative z-10 shadow-2xl shadow-black/50 backdrop-blur-xl">
        <div className="absolute top-4 left-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/login')} className="w-8 h-8 text-zinc-500 hover:text-white">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </div>
        
        <CardHeader className="space-y-2 text-center pb-6 pt-10">
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
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name & Organization */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Full Name *</label>
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
                <label className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Organization</label>
                <Input 
                  type="text" 
                  placeholder="Municipality / Company"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  className="bg-white/[0.03] border-white/[0.05] text-white placeholder:text-zinc-700"
                />
              </div>
            </div>

            {/* Role & Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05] text-white text-sm focus:outline-none focus:border-white/20 appearance-none"
                >
                  {ROLES.map(r => (
                    <option key={r.value} value={r.value} className="bg-zinc-900">{r.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Phone</label>
                <Input 
                  type="tel" 
                  placeholder="+91 XXXXX XXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="bg-white/[0.03] border-white/[0.05] text-white placeholder:text-zinc-700"
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <label className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Email Address *</label>
              <Input 
                type="email" 
                placeholder="you@municipality.gov"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-white/[0.03] border-white/[0.05] text-white placeholder:text-zinc-700"
              />
            </div>
            
            {/* Password */}
            <div className="space-y-2">
              <label className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Password *</label>
              <div className="relative">
                <Input 
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-white/[0.03] border-white/[0.05] text-white placeholder:text-zinc-700 font-mono tracking-widest pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Password Strength Meter */}
              {password.length > 0 && (
                <div className="space-y-2 mt-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div
                          key={i}
                          className="h-1 flex-1 rounded-full transition-all duration-300"
                          style={{
                            backgroundColor: i < strength.score ? strength.color : 'rgba(255,255,255,0.05)',
                          }}
                        />
                      ))}
                    </div>
                    <span className="text-xs font-mono ml-2" style={{ color: strength.color }}>
                      {strength.label}
                    </span>
                  </div>

                  {/* Rule checklist */}
                  <div className="space-y-1 pt-1">
                    {PASSWORD_RULES.map((rule, i) => {
                      const passed = rule.test(password);
                      return (
                        <div key={i} className="flex items-center gap-2">
                          {passed ? (
                            <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                          ) : (
                            <X className="w-3 h-3 text-zinc-600 shrink-0" />
                          )}
                          <span className={`text-[11px] font-mono ${passed ? 'text-zinc-400' : 'text-zinc-600'}`}>
                            {rule.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <label className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Confirm Password *</label>
              <div className="relative">
                <Input 
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className={`bg-white/[0.03] border-white/[0.05] text-white placeholder:text-zinc-700 font-mono tracking-widest pr-10 ${
                    confirmPassword.length > 0
                      ? passwordsMatch
                        ? 'border-emerald-500/30'
                        : 'border-red-500/30'
                      : ''
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="text-xs text-red-400 font-mono mt-1">Passwords do not match</p>
              )}
              {passwordsMatch && (
                <p className="text-xs text-emerald-400 font-mono mt-1 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Passwords match
                </p>
              )}
            </div>
            
            <Button type="submit" className="w-full mt-6 rounded-xl py-6 text-sm" disabled={loading || !canSubmit}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
              {isDemoMode ? "Continue (Demo Mode)" : "Create Account"}
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
