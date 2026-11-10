import React, { useState } from 'react';
import { AccountType, IQConnectionStatus } from '../types/trading';
import { KeyRound, Lock, Mail, ShieldCheck, Smartphone, Unplug, X, Zap } from 'lucide-react';

interface ConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: IQConnectionStatus;
  onConnect: (params: {
    email: string;
    password?: string;
    ssid?: string;
    accountType: AccountType;
    demoSimulatorMode?: boolean;
  }) => Promise<{ success: boolean; message: string; requires2FA?: boolean }>;
  onVerify2FA?: (params: {
    code: string;
    accountType: AccountType;
  }) => Promise<{ success: boolean; message: string }>;
  onDisconnect: () => Promise<void>;
}

export const ConnectModal: React.FC<ConnectModalProps> = ({
  isOpen,
  onClose,
  status,
  onConnect,
  onVerify2FA,
  onDisconnect,
}) => {
  const [authMode, setAuthMode] = useState<'CREDENTIALS' | 'SSID'>('CREDENTIALS');
  const [email, setEmail] = useState(status.email || '');
  const [password, setPassword] = useState('');
  const [ssid, setSsid] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [step2FA, setStep2FA] = useState(Boolean(status.requires2FA));
  const [accountType, setAccountType] = useState<AccountType>(
    status.activeBalanceType || 'PRACTICE'
  );
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(
    null
  );

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);

    try {
      if (step2FA && onVerify2FA) {
        const res2fa = await onVerify2FA({
          code: twoFactorCode.trim(),
          accountType,
        });
        setLoading(false);
        if (res2fa.success) {
          setStep2FA(false);
          setFeedback({ type: 'success', text: res2fa.message });
          setTimeout(() => onClose(), 600);
        } else {
          setFeedback({ type: 'error', text: res2fa.message });
        }
        return;
      }

      const res = await onConnect({
        email: email.trim(),
        password: authMode === 'CREDENTIALS' ? password : undefined,
        ssid: authMode === 'SSID' ? ssid.trim() : undefined,
        accountType,
      });

      setLoading(false);
      if (res.requires2FA) {
        setStep2FA(true);
        setFeedback({ type: 'error', text: res.message });
      } else if (res.success) {
        setFeedback({ type: 'success', text: res.message });
        setTimeout(() => {
          onClose();
        }, 600);
      } else {
        setFeedback({ type: 'error', text: res.message });
      }
    } catch {
      setLoading(false);
      setFeedback({
        type: 'error',
        text: 'Erro de comunicação ao autenticar. Tente novamente ou use o Modo Simulador.',
      });
    }
  };

  const handleQuickSimulatorConnect = async () => {
    setLoading(true);
    setFeedback(null);
    const res = await onConnect({
      email: email.trim() || 'trader@quantiq.local',
      accountType,
      demoSimulatorMode: true,
    });
    setLoading(false);
    if (res.success) {
      setFeedback({ type: 'success', text: res.message });
      setTimeout(() => onClose(), 400);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-[#111827] border border-slate-800 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-display font-bold text-white">
              Conectar Conta IQ Option (API / WebSocket)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Status Atual:{' '}
              <strong
                className={
                  status.authenticated ? 'text-emerald-400' : 'text-amber-400'
                }
              >
                {status.authenticated
                  ? `CONECTADO (${status.email})`
                  : 'DESCONECTADO — Autentique abaixo'}
              </strong>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Fechar modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {!step2FA && (
            <div className="grid grid-cols-2 gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('CREDENTIALS');
                  setFeedback(null);
                }}
                className={`py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  authMode === 'CREDENTIALS'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                E-mail e Senha IQ Option
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('SSID');
                  setFeedback(null);
                }}
                className={`py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  authMode === 'SSID'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Token de Sessão (SSID)
              </button>
            </div>
          )}

          {step2FA ? (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-700/70 text-xs text-amber-200">
                Digite o código de verificação em 2 etapas (2FA) enviado pela IQ Option para o seu celular/e-mail:
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Código 2FA (SMS / Autenticador)
                </label>
                <div className="relative">
                  <Smartphone className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value)}
                    placeholder="Ex: 482910"
                    className="w-full pl-9 pr-3 py-2 bg-[#0B0F17] border border-slate-700 rounded-lg text-sm font-mono text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStep2FA(false)}
                className="text-xs text-slate-400 hover:text-white underline"
              >
                ← Voltar para E-mail e Senha
              </button>
            </div>
          ) : authMode === 'CREDENTIALS' ? (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  E-mail da Conta IQ Option
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seuemail@dominio.com"
                    className="w-full pl-9 pr-3 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Senha da Corretora IQ Option
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-9 pr-3 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </>
          ) : (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Token SSID (Cookie de Sessão da IQ Option)
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  value={ssid}
                  onChange={(e) => setSsid(e.target.value)}
                  placeholder="Cole o valor do cookie ssid da sua conta IQ Option"
                  className="w-full pl-9 pr-3 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-sm font-mono text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">
                Conectado ao endpoint oficial{' '}
                <code className="text-blue-400 font-mono">wss://iqoption.com/echo/websocket</code>.
              </p>
            </div>
          )}

          {/* Account Type Selection */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Carteira Inicial de Operação
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAccountType('PRACTICE')}
                className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                  accountType === 'PRACTICE'
                    ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                    : 'bg-[#0B0F17] border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Conta Treinamento (Demo)
              </button>
              <button
                type="button"
                onClick={() => setAccountType('REAL')}
                className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                  accountType === 'REAL'
                    ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300'
                    : 'bg-[#0B0F17] border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                Conta Real (BRL / USD)
              </button>
            </div>
          </div>

          {feedback && (
            <div
              className={`p-3 rounded-lg border text-xs ${
                feedback.type === 'success'
                  ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300'
                  : 'bg-red-950/50 border-red-800 text-red-300'
              }`}
            >
              {feedback.text}
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <div className="flex items-center justify-between gap-3">
              {status.authenticated && (
                <button
                  type="button"
                  onClick={async () => {
                    await onDisconnect();
                    onClose();
                  }}
                  className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium text-red-400 hover:text-red-300 bg-red-950/30 border border-red-900/50 rounded-lg transition-colors cursor-pointer"
                >
                  <Unplug className="w-3.5 h-3.5" />
                  Desconectar
                </button>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                {loading
                  ? 'Autenticando na IQ Option...'
                  : step2FA
                  ? 'Validar Código 2FA e Conectar'
                  : 'Autenticar Conta IQ Option'}
              </button>
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={handleQuickSimulatorConnect}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Entrar em Modo Simulador Local (Teste Rápido Sem Senha)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
