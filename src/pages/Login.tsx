import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Fuel, Mail, Lock, Loader2 } from 'lucide-react';
import supabase from '../lib/supabase';
import { signInWithGoogle } from '../lib/googleAuth';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (user) nav('/'); }, [user, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setMsg('');
    if (!email || !password) { setErr('Email and password are required'); return; }
    if (password.length < 6) { setErr('Password must be at least 6 characters'); return; }
    setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg('Account created! You can now sign in.');
        setIsSignUp(false);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        nav('/');
      }
    } catch (e: any) { setErr(e.message || 'Authentication failed'); }
    finally { setLoading(false); }
  };


  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-900 via-blue-950 to-blue-900 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, white 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center shadow-xl"><Fuel className="w-6 h-6" /></div>
            <span className="text-xl font-bold tracking-tight">FuelFlow</span>
          </div>
          <div>
            <h1 className="text-4xl font-bold leading-tight mb-4">Daily Sales &<br/>Inventory Management<br/>for Fuel Stations</h1>
            <p className="text-blue-200 text-lg max-w-md">A unified, Supabase-ready platform for web & Android. Master setup, dip-to-volume, tanker unloading, shift sales, loss/gain analytics, and finance — all in one place.</p>
            <div className="flex gap-8 mt-10">
              {[['10+', 'Master Modules'], ['100%', 'Soft-coded'], ['∞', 'Bulk Uploads']].map(([n, l]) => (
                <div key={l}><div className="text-2xl font-bold">{n}</div><div className="text-blue-300 text-xs">{l}</div></div>
              ))}
            </div>
          </div>
          <p className="text-blue-400 text-xs">Enterprise platform — React + Vite + Tailwind + Supabase</p>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-8 justify-center">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center"><Fuel className="w-5 h-5 text-white" /></div>
            <span className="text-lg font-bold text-slate-800">FuelFlow</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-800">{isSignUp ? 'Create account' : 'Welcome back'}</h2>
          <p className="text-sm text-slate-500 mt-1 mb-6">{isSignUp ? 'Set up your station admin account' : 'Sign in to your station dashboard'}</p>
          <form onSubmit={submit} className="space-y-3.5">
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500" />
            </div>
            {err && <p className="text-sm text-rose-600">{err}</p>}
            {msg && <p className="text-sm text-emerald-600">{msg}</p>}
            <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60">{loading && <Loader2 className="w-4 h-4 animate-spin" />}{isSignUp ? 'Create Account' : 'Sign In'}</button>
          </form>
          <div className="flex items-center gap-3 my-4"><div className="flex-1 h-px bg-slate-200" /><span className="text-xs text-slate-400">or</span><div className="flex-1 h-px bg-slate-200" /></div>
          <button onClick={() => signInWithGoogle('FuelFlow')} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50">
            <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.48 14.97.5 12 .5A11 11 0 0 0 2.18 6.94l3.66 2.84C6.71 6.68 9.14 4.75 12 4.75z"/></svg>
            Continue with Google
          </button>
          <p className="text-center text-sm text-slate-500 mt-5">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button onClick={() => { setIsSignUp(!isSignUp); setErr(''); setMsg(''); }} className="text-blue-600 font-medium hover:underline">{isSignUp ? 'Sign in' : 'Sign up'}</button>
          </p>
        </div>
      </div>
    </div>
  );
}
