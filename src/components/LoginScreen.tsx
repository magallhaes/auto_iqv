import React, { useState } from 'react';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  ShieldCheck,
  TrendingUp,
  Activity,
  ArrowRight,
  KeyRound,
  CheckCircle2,
} from 'lucide-react';

interface LoginScreenProps {
  onLoginSuccess: (user: { email: string; name: string }) => void;
  savedEmail?: string;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLoginSuccess,
  savedEmail = 'magaleonardo@gmail.com',
}) => {
  const [email, setEmail] = useState(savedEmail || 'trader@quantiq.app');
  const [password, setPassword] = useState('••••••••');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Por favor, informe seu e-mail ou usuário de acesso.');
      return;
    }
    if (!password.trim()) {
      setError('Por favor, digite sua senha de acesso.');
      return;
    }

    setLoading(true);
    setError(null);

    // Simulated secure authentication delay
    setTimeout(() => {
      setLoading(false);
      const username = email.split('@')[0] || 'Trader';
      const capitalized = username.charAt(0).toUpperCase() + username.slice(1);

      if (rememberMe) {
        localStorage.setItem(
          'quantiq_user_session',
          JSON.stringify({
            email,
            name: capitalized,
            timestamp: Date.now(),
          })
        );
      }

      onLoginSuccess({
        email,
        name: capitalized,
      });
    }, 600);
  };

  const handleQuickTraderAccess = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      const user = {
        email: savedEmail || 'magaleonardo@gmail.com',
        name: 'Leonardo Magalhães',
      };
      if (rememberMe) {
        localStorage.setItem(
          'quantiq_user_session',
          JSON.stringify({
            ...user,
            timestamp: Date.now(),
          })
        );
      }
      onLoginSuccess(user);
    }, 400);
  };

  return (
    <div className="min-h-screen bg-[#07090E] flex flex-col items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Background Subtle Gradient Spheres */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Main Login Card */}
      <div className="w-full max-w-md bg-[#0B0F17] border border-[#172030] rounded-2xl p-8 shadow-2xl relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-blue-500/20 border border-emerald-500/30 text-emerald-400 mb-4 shadow-lg shadow-emerald-500/10">
            <TrendingUp className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center justify-center gap-2">
            <span>QuantIQ</span>
            <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 tracking-wider">
              PRO
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1.5 font-medium">
            Terminal Algorítmico & Robô de Alta Frequência IQ Option
          </p>
        </div>

        {/* Security Alert Badge */}
        <div className="mb-6 bg-[#111722] border border-[#1C2638] rounded-xl p-3 flex items-center gap-2.5 text-xs text-slate-300">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Acesso protegido. Faça login para desbloquear o robô e as operações.</span>
        </div>

        {error && (
          <div className="mb-4 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs p-3 rounded-lg flex items-center gap-2">
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              E-mail ou Usuário
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu.email@exemplo.com"
                className="w-full pl-10 pr-4 py-2.5 bg-[#121824] border border-[#1E293B] focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/60 rounded-xl text-white text-xs placeholder-slate-500 transition-colors focus:outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Senha de Acesso
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-2.5 bg-[#121824] border border-[#1E293B] focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/60 rounded-xl text-white text-xs placeholder-slate-500 transition-colors focus:outline-none"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <label className="flex items-center gap-2 text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded border-[#1E293B] bg-[#121824] text-emerald-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
              <span>Lembrar neste navegador</span>
            </label>
            <span className="text-slate-500 hover:text-slate-300 cursor-pointer transition-colors text-[11px]">
              Esqueceu a senha?
            </span>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-black font-bold text-xs tracking-wide transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <>
                <Activity className="w-4 h-4 animate-spin" />
                <span>Autenticando...</span>
              </>
            ) : (
              <>
                <span>Acessar Plataforma</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#1C2638]" />
          </div>
          <div className="relative flex justify-center text-[10px] uppercase font-bold text-slate-500">
            <span className="bg-[#0B0F17] px-3">Ou use o acesso direto</span>
          </div>
        </div>

        {/* Quick Trader Access Button */}
        <button
          type="button"
          onClick={handleQuickTraderAccess}
          disabled={loading}
          className="w-full py-2.5 px-4 rounded-xl bg-[#131A26] hover:bg-[#1A2333] border border-[#212C3F] hover:border-emerald-500/40 text-slate-200 font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <KeyRound className="w-4 h-4 text-emerald-400" />
          <span>Entrar com Conta Trader Conectada</span>
        </button>

        {/* Security Footer Info */}
        <div className="mt-8 pt-4 border-t border-[#161E2C] flex items-center justify-center gap-4 text-[11px] text-slate-500">
          <div className="flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>SSL 256-bit</span>
          </div>
          <span>·</span>
          <div className="flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>IQ Option WebSocket</span>
          </div>
          <span>·</span>
          <span>v3.4 PRO</span>
        </div>
      </div>
    </div>
  );
};
