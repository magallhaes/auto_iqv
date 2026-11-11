import React, { useEffect, useState } from 'react';
import { AlertTriangle, Bell, CheckCircle2, LoaderCircle, Send, ShieldCheck } from 'lucide-react';

interface TelegramSettings {
  enabled: boolean;
  chatId: string;
  tokenConfigured: boolean;
  alertSignals: boolean;
  alertOrderResults: boolean;
}

const DEFAULT_SETTINGS: TelegramSettings = {
  enabled: false,
  chatId: '',
  tokenConfigured: false,
  alertSignals: true,
  alertOrderResults: true,
};

export const NotificationsPage: React.FC = () => {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/iq/telegram')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Falha ao carregar configurações.');
        if (active && data.settings) {
          setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
        }
      })
      .catch(() => {
        if (active) {
          setFeedback({ success: false, message: 'Não foi possível carregar as configurações do servidor.' });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const submitSettings = async (test: boolean) => {
    setFeedback(null);
    test ? setTesting(true) : setSaving(true);
    try {
      const response = await fetch(test ? '/api/iq/telegram/test' : '/api/iq/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, token: token.trim() || undefined }),
      });
      const data = await response.json();
      if (data.settings) setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Não foi possível concluir a solicitação.');
      }
      setToken('');
      setFeedback({
        success: true,
        message: test ? data.message || 'Mensagem de teste enviada.' : 'Configurações salvas.',
      });
    } catch (error) {
      setFeedback({
        success: false,
        message: error instanceof Error ? error.message : 'Erro de comunicação com o servidor.',
      });
    } finally {
      setSaving(false);
      setTesting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-300">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-display font-bold text-white">Notificações</h1>
            <p className="text-xs text-slate-400">Telegram · API oficial</p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-[11px] font-semibold ${
            settings.enabled && settings.tokenConfigured
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-slate-700 bg-slate-800/60 text-slate-400'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${settings.enabled && settings.tokenConfigured ? 'bg-emerald-400' : 'bg-slate-500'}`} />
          {settings.enabled && settings.tokenConfigured ? 'Ativo' : 'Desativado'}
        </span>
      </div>

      <section className="max-w-3xl space-y-5 rounded-lg border border-slate-800 bg-[#111827] p-4 sm:p-5">
        <label className="flex cursor-pointer items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <span>
            <span className="block text-sm font-semibold text-white">Telegram</span>
            <span className="mt-0.5 block text-xs text-slate-400">Ativar envio de notificações pelo bot</span>
          </span>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked }))}
            className="h-4 w-4 accent-sky-500"
            aria-label="Ativar notificações do Telegram"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-slate-300">Token do bot</span>
            <input
              type="password"
              autoComplete="new-password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder={settings.tokenConfigured ? 'Token já configurado; em branco para manter' : 'Cole o token do bot'}
              className="w-full rounded-md border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-500"
            />
          </label>
          <label className="space-y-1.5">
            <span className="block text-xs font-medium text-slate-300">Chat ID</span>
            <input
              type="text"
              inputMode="text"
              autoComplete="off"
              value={settings.chatId}
              onChange={(event) => setSettings((current) => ({ ...current, chatId: event.target.value }))}
              placeholder="ID do usuário ou grupo"
              className="w-full rounded-md border border-slate-700 bg-[#0B0F17] px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-500"
            />
          </label>
        </div>

        <div className="space-y-3 border-t border-slate-800 pt-4">
          <p className="text-xs font-semibold uppercase text-slate-400">Eventos</p>
          <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={settings.alertSignals}
              onChange={(event) => setSettings((current) => ({ ...current, alertSignals: event.target.checked }))}
              className="h-4 w-4 accent-sky-500"
            />
            Entradas e sinais do robô
          </label>
          <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={settings.alertOrderResults}
              onChange={(event) => setSettings((current) => ({ ...current, alertOrderResults: event.target.checked }))}
              className="h-4 w-4 accent-sky-500"
            />
            Resultados, gales e rejeições
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-4">
          <button
            type="button"
            onClick={() => void submitSettings(false)}
            disabled={loading || saving || testing}
            className="inline-flex items-center gap-2 rounded-md bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Salvar
          </button>
          <button
            type="button"
            onClick={() => void submitSettings(true)}
            disabled={loading || saving || testing}
            className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-200 transition-colors hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {testing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Testar e salvar
          </button>
        </div>

        {feedback && (
          <div
            role="status"
            className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
              feedback.success
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
            }`}
          >
            {feedback.success ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
            <span>{feedback.message}</span>
          </div>
        )}

        <p className="border-t border-slate-800 pt-3 text-[11px] leading-relaxed text-slate-500">
          O token não é retornado à interface nem salvo em disco. Sem variável de ambiente, ele permanece na memória do servidor e precisa ser informado novamente após reiniciar.
        </p>
      </section>
    </div>
  );
};