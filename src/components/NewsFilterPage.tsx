import React, { useState } from 'react';
import { EconomicNewsEvent, StrategyConfig } from '../types/trading';
import { CalendarClock, Plus, ShieldCheck } from 'lucide-react';

interface NewsFilterPageProps {
  newsEvents: EconomicNewsEvent[];
  config: StrategyConfig;
  onUpdateConfig: (patch: Partial<StrategyConfig>) => void;
  onAddCustomNews: (ev: EconomicNewsEvent) => void;
}

export const NewsFilterPage: React.FC<NewsFilterPageProps> = ({
  newsEvents,
  config,
  onUpdateConfig,
  onAddCustomNews,
}) => {
  const [newCurrency, setNewCurrency] = useState<EconomicNewsEvent['currency']>('USD');
  const [newTitle, setNewTitle] = useState('');
  const [newTime, setNewTime] = useState('15:30');
  const [newBulls, setNewBulls] = useState<1 | 2 | 3>(3);

  const handleAddEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const [hh, mm] = newTime.split(':').map(Number);
    const d = new Date();
    d.setHours(hh || 12, mm || 0, 0, 0);

    onAddCustomNews({
      id: `news_${Date.now()}`,
      time: newTime,
      timestamp: d.getTime(),
      currency: newCurrency,
      title: newTitle.trim(),
      bulls: newBulls,
      forecast: '—',
      previous: '—',
    });

    setNewTitle('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-display font-bold text-white">
            Filtro de Notícias Econômicas & Proteção de Volatilidade
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Pausa automaticamente o disparo de ordens MHI nos pares afetados por eventos macroeconômicos de 2 e 3 Touros.
          </p>
        </div>

        <button
          onClick={() => onUpdateConfig({ useNewsFilter: !config.useNewsFilter })}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors self-start cursor-pointer ${
            config.useNewsFilter
              ? 'bg-emerald-600 text-white'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          {config.useNewsFilter
            ? 'Filtro de Notícias Ativo'
            : 'Filtro de Notícias Desativado'}
        </button>
      </div>

      {/* Filter Rules Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
          <label className="block text-xs text-slate-400 mb-2">
            Impacto Mínimo para Bloquear Entradas
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onUpdateConfig({ minBullsToBlock: 2 })}
              className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-colors ${
                config.minBullsToBlock === 2
                  ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                  : 'bg-[#0B0F17] border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              2 e 3 Touros (Moderado + Alto)
            </button>
            <button
              type="button"
              onClick={() => onUpdateConfig({ minBullsToBlock: 3 })}
              className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-colors ${
                config.minBullsToBlock === 3
                  ? 'bg-red-500/15 border-red-500 text-red-300'
                  : 'bg-[#0B0F17] border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Apenas 3 Touros (Alto Impacto)
            </button>
          </div>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
          <label className="block text-xs text-slate-400 mb-2">
            Minutos de Pausa ANTES da Notícia
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={5}
              max={60}
              step={5}
              value={config.pauseMinutesBeforeNews}
              onChange={(e) =>
                onUpdateConfig({ pauseMinutesBeforeNews: Number(e.target.value) })
              }
              className="flex-1 accent-blue-600"
            />
            <span className="font-mono tabular-nums text-sm font-bold text-white w-16 text-right">
              {config.pauseMinutesBeforeNews} min
            </span>
          </div>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
          <label className="block text-xs text-slate-400 mb-2">
            Minutos de Pausa APÓS a Notícia
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={5}
              max={60}
              step={5}
              value={config.pauseMinutesAfterNews}
              onChange={(e) =>
                onUpdateConfig({ pauseMinutesAfterNews: Number(e.target.value) })
              }
              className="flex-1 accent-blue-600"
            />
            <span className="font-mono tabular-nums text-sm font-bold text-white w-16 text-right">
              {config.pauseMinutesAfterNews} min
            </span>
          </div>
        </div>
      </div>

      {/* Economic Calendar Table + Custom Event Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-[#111827] border border-slate-800 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <div className="flex items-center gap-2 text-xs font-semibold text-white">
              <CalendarClock className="w-4 h-4 text-blue-400" />
              <span>Calendário Econômico do Dia (Investing / Forex Sync)</span>
            </div>
            <span className="text-[11px] text-slate-400">
              {newsEvents.length} eventos monitorados
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-[#0B0F17]/60 text-[11px] text-slate-400">
                  <th className="py-2.5 px-4">Horário</th>
                  <th className="py-2.5 px-3">Moeda</th>
                  <th className="py-2.5 px-3">Impacto</th>
                  <th className="py-2.5 px-3">Evento Macroeconômico</th>
                  <th className="py-2.5 px-3 text-right">Projeção</th>
                  <th className="py-2.5 px-3 text-right">Anterior</th>
                  <th className="py-2.5 px-4 text-right">Regra do Robô</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {newsEvents.map((ev) => {
                  const willBlock =
                    config.useNewsFilter && ev.bulls >= config.minBullsToBlock;

                  return (
                    <tr key={ev.id} className="h-11 hover:bg-slate-800/30">
                      <td className="py-2 px-4 font-mono tabular-nums text-white font-medium">
                        {ev.time}
                      </td>
                      <td className="py-2 px-3 font-mono font-bold text-slate-200">
                        {ev.currency}
                      </td>
                      <td className="py-2 px-3 font-mono text-amber-400">
                        {'🐂'.repeat(ev.bulls)} ({ev.bulls})
                      </td>
                      <td className="py-2 px-3 text-slate-200">{ev.title}</td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-300">
                        {ev.forecast}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-400">
                        {ev.previous}
                      </td>
                      <td className="py-2 px-4 text-right whitespace-nowrap">
                        <span
                          className={
                            willBlock
                              ? 'text-amber-400 font-medium'
                              : 'text-slate-500'
                          }
                        >
                          {willBlock
                            ? `Pausa -${config.pauseMinutesBeforeNews}m / +${config.pauseMinutesAfterNews}m`
                            : 'Operação Normal'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add Custom Blocker Window */}
        <div className="lg:col-span-4 bg-[#111827] border border-slate-800 rounded-lg p-5">
          <h2 className="text-sm font-display font-bold text-white pb-3 border-b border-slate-800">
            Adicionar Janela de Bloqueio Manual
          </h2>

          <form onSubmit={handleAddEvent} className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">
                  Horário (HH:MM)
                </label>
                <input
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs font-mono text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5">
                  Moeda Impactada
                </label>
                <select
                  value={newCurrency}
                  onChange={(e) =>
                    setNewCurrency(e.target.value as EconomicNewsEvent['currency'])
                  }
                  className="w-full px-3 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs font-mono text-white"
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="JPY">JPY</option>
                  <option value="AUD">AUD</option>
                  <option value="CAD">CAD</option>
                  <option value="BRL">BRL</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                Descrição do Evento / Discurso
              </label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Ex: Decisão de Taxa de Juros FOMC / Payroll"
                className="w-full px-3 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                Nível de Volatilidade (Touros)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {([1, 2, 3] as const).map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setNewBulls(b)}
                    className={`py-2 rounded-lg border text-xs font-medium transition-colors ${
                      newBulls === b
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-[#0B0F17] border-slate-800 text-slate-400'
                    }`}
                  >
                    {b} {b === 1 ? 'Touro' : 'Touros'}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-1.5 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Adicionar Evento ao Filtro
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
