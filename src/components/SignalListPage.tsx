import React, { useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Filter,
  Play,
  Pause,
  Plus,
  RefreshCw,
  Sliders,
  Sparkles,
  Trash2,
  TrendingUp,
  Volume2,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  IQAsset,
  IQConnectionStatus,
  RiskConfig,
  RiskSessionState,
  ScheduledSignal,
  SignalListConfig,
} from '../types/trading';
import {
  generateSampleSignalList,
  parseSignalList,
} from '../utils/signalListParser';

interface SignalListPageProps {
  signals: ScheduledSignal[];
  onUpdateSignals: (signals: ScheduledSignal[]) => void;
  listConfig: SignalListConfig;
  onUpdateListConfig: (patch: Partial<SignalListConfig>) => void;
  isBotRunning: boolean;
  onToggleBot: () => void;
  botMode: 'STRATEGY' | 'SIGNAL_LIST' | 'BOTH';
  onChangeBotMode: (mode: 'STRATEGY' | 'SIGNAL_LIST' | 'BOTH') => void;
  riskConfig: RiskConfig;
  riskState: RiskSessionState;
  connectionStatus: IQConnectionStatus;
  assets: IQAsset[];
  serverNowSec: number;
}

export function SignalListPage({
  signals,
  onUpdateSignals,
  listConfig,
  onUpdateListConfig,
  isBotRunning,
  onToggleBot,
  botMode,
  onChangeBotMode,
  riskConfig,
  riskState,
  connectionStatus,
  assets,
  serverNowSec,
}: SignalListPageProps) {
  const [rawText, setRawText] = useState<string>('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<'ALL' | 'PENDING' | 'WINS' | 'LOSSES'>('ALL');

  const handleParseAndAdd = () => {
    if (!rawText.trim()) return;
    const { validSignals, invalidLines } = parseSignalList(rawText, serverNowSec);

    if (validSignals.length === 0) {
      setParseError('Nenhum sinal válido encontrado. Verifique o formato digitado.');
      return;
    }

    if (invalidLines.length > 0) {
      setParseError(`${invalidLines.length} linha(s) ignorada(s) por formato inválido.`);
    } else {
      setParseError(null);
    }

    // Merge without duplicates (same ticker + targetTimestamp)
    const existingKeys = new Set(signals.map((s) => `${s.ticker}_${s.targetTimestamp}_${s.direction}`));
    const newItems = validSignals.filter(
      (s) => !existingKeys.has(`${s.ticker}_${s.targetTimestamp}_${s.direction}`)
    );

    const merged = [...signals, ...newItems].sort((a, b) => a.targetTimestamp - b.targetTimestamp);
    onUpdateSignals(merged);
    setRawText('');
  };

  const handleLoadSample = () => {
    const sample = generateSampleSignalList(serverNowSec);
    setRawText(sample);
    setParseError(null);
  };

  const handleClearAllSignals = () => {
    onUpdateSignals([]);
  };

  const handleToggleSignal = (id: string) => {
    onUpdateSignals(
      signals.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
  };

  const handleDeleteSignal = (id: string) => {
    onUpdateSignals(signals.filter((s) => s.id !== id));
  };

  // Compute live list metrics
  const totalCount = signals.length;
  const pendingCount = signals.filter((s) => s.status === 'PENDING' || s.status === 'PRE_SIGNAL').length;
  const win1stCount = signals.filter((s) => s.status === 'WIN_1ST').length;
  const winG1Count = signals.filter((s) => s.status === 'WIN_G1').length;
  const winG2Count = signals.filter((s) => s.status === 'WIN_G2').length;
  const totalWins = win1stCount + winG1Count + winG2Count;
  const lossCount = signals.filter((s) => s.status === 'LOSS').length;
  const blockedCount = signals.filter(
    (s) =>
      s.status === 'BLOCKED_TREND' ||
      s.status === 'BLOCKED_NEWS' ||
      s.status === 'BLOCKED_PAYOUT' ||
      s.status === 'BLOCKED_SIMULTANEOUS' ||
      s.status === 'BLOCKED_OVERLAP'
  ).length;
  const completedCount = totalWins + lossCount;
  const winRate = completedCount > 0 ? (totalWins / completedCount) * 100 : 0;

  const totalListProfit = signals.reduce((acc, curr) => acc + (curr.profit || 0), 0);

  const filteredSignals = signals.filter((s) => {
    if (filterTab === 'PENDING') return s.status === 'PENDING' || s.status === 'PRE_SIGNAL';
    if (filterTab === 'WINS') return s.status === 'WIN_1ST' || s.status === 'WIN_G1' || s.status === 'WIN_G2';
    if (filterTab === 'LOSSES') return s.status === 'LOSS';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header & Master Server Execution Banner */}
      <div className="bg-[#111827] border border-slate-800 rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider bg-purple-500/15 text-purple-300 border border-purple-500/30 rounded">
                Automação por Lista
              </span>
              <h1 className="text-lg font-display font-bold text-white">
                Operador de Lista de Sinais com Martingale (Gale 1 e 2)
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Cole sua lista de sinais diária (M1, M5, M15). O robô agenda as entradas com antecipação de delay, aplica Gale 1 e Gale 2 automáticos e opera em segundo plano no servidor mesmo se você fechar a janela.
            </p>
          </div>

          {/* Mode Selector & Master Toggle */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center p-1 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs">
              <span className="text-slate-400 px-2 py-1">Operar:</span>
              <button
                onClick={() => onChangeBotMode('SIGNAL_LIST')}
                className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                  botMode === 'SIGNAL_LIST'
                    ? 'bg-purple-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Apenas Lista
              </button>
              <button
                onClick={() => onChangeBotMode('STRATEGY')}
                className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                  botMode === 'STRATEGY'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Apenas MHI
              </button>
              <button
                onClick={() => onChangeBotMode('BOTH')}
                className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                  botMode === 'BOTH'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Lista + MHI
              </button>
            </div>

            <button
              onClick={onToggleBot}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold font-display uppercase tracking-wider transition-colors cursor-pointer ${
                isBotRunning
                  ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-950/40'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/40'
              }`}
            >
              {isBotRunning ? (
                <>
                  <Pause className="w-4 h-4" />
                  Pausar Robô
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Iniciar Robô da Lista
                </>
              )}
            </button>
          </div>
        </div>

        {/* Server Background Status Notification */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-300 gap-2">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isBotRunning ? 'bg-emerald-400' : 'bg-slate-400'
                }`}
              ></span>
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  isBotRunning ? 'bg-emerald-500' : 'bg-slate-500'
                }`}
              ></span>
            </span>
            <span>
              {isBotRunning
                ? 'Robô ATIVO no Servidor: operando em segundo plano mesmo se esta aba for fechada.'
                : 'Robô PAUSADO: configure sua lista e clique em "Iniciar Robô da Lista" para ativar.'}
            </span>
          </div>

          <div className="font-mono tabular-nums text-slate-400 text-[11px]">
            Conta Ativa: <strong className="text-white">{connectionStatus.activeBalanceType}</strong> · Saldo: <strong className="text-emerald-400">R$ {(connectionStatus.activeBalanceType === 'REAL' ? connectionStatus.realBalance : connectionStatus.practiceBalance).toFixed(2)}</strong>
          </div>
        </div>
      </div>

      {/* Scoreboard Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-[#111827] border border-slate-800 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Total de Sinais</div>
          <div className="text-lg font-mono font-bold text-white mt-0.5">{totalCount}</div>
          <div className="text-[10px] text-slate-500">{pendingCount} agendados</div>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Vitórias (1ª Mão)</div>
          <div className="text-lg font-mono font-bold text-emerald-400 mt-0.5">{win1stCount}</div>
          <div className="text-[10px] text-slate-500">Sem precisar de Gale</div>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Vitórias no Gale 1</div>
          <div className="text-lg font-mono font-bold text-teal-400 mt-0.5">{winG1Count}</div>
          <div className="text-[10px] text-slate-500">Recuperado na 2ª vela</div>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Vitórias no Gale 2</div>
          <div className="text-lg font-mono font-bold text-cyan-400 mt-0.5">{winG2Count}</div>
          <div className="text-[10px] text-slate-500">Recuperado na 3ª vela</div>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Derrotas (Loss)</div>
          <div className="text-lg font-mono font-bold text-red-400 mt-0.5">{lossCount}</div>
          <div className="text-[10px] text-slate-500">{blockedCount} filtrados</div>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Assertividade</div>
          <div className="text-lg font-mono font-bold text-purple-400 mt-0.5">
            {winRate.toFixed(1)}%
          </div>
          <div className="text-[10px] text-slate-500">{totalWins}W / {lossCount}L</div>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-lg p-3">
          <div className="text-[11px] text-slate-400">Lucro da Lista</div>
          <div
            className={`text-lg font-mono font-bold mt-0.5 ${
              totalListProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {totalListProfit >= 0 ? '+' : ''}R$ {totalListProfit.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500">Sessão acumulada</div>
        </div>
      </div>

      {/* Main Signal Management Grid: Paste / Import (Left) + Gale & Filters Config (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Columns: Textarea to Paste / Import Signal List */}
        <div className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-purple-400" />
              <h2 className="text-sm font-display font-bold text-white">
                Colar Lista de Sinais
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleLoadSample}
                className="flex items-center gap-1.5 px-3 py-1 bg-purple-950/60 hover:bg-purple-900/60 border border-purple-800/80 rounded text-xs text-purple-300 font-semibold transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Carregar Exemplo Pronto
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">
              Formatos aceitos: <code className="text-purple-300">M5;EURUSD;14:30:00;CALL</code> ou <code className="text-purple-300">EURUSD M5 14:30 CALL</code> ou <code className="text-purple-300">CALL EURUSD-OTC M1 15:00</code>
            </label>
            <textarea
              rows={6}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={`# Cole sua lista aqui...\nM5;EURUSD;14:30:00;CALL\nM1;GBPUSD;14:35:00;PUT\nM5;EURUSD-OTC;14:40:00;CALL`}
              className="w-full bg-[#0B0F17] border border-slate-800 rounded-lg p-3 font-mono text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
            />
          </div>

          {parseError && (
            <div className="text-xs text-amber-300 bg-amber-950/40 border border-amber-800/60 p-2.5 rounded-lg flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>{parseError}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="text-xs text-slate-400">
              {signals.length > 0 && `${signals.length} sinais na fila atual.`}
            </div>
            <div className="flex items-center gap-2">
              {signals.length > 0 && (
                <button
                  onClick={handleClearAllSignals}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-red-400 border border-slate-800 hover:border-red-900 rounded-lg transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Limpar Fila
                </button>
              )}
              <button
                onClick={handleParseAndAdd}
                disabled={!rawText.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Adicionar Sinais à Fila
              </button>
            </div>
          </div>
        </div>

        {/* Right 5 Columns: Gale Management & Protection Filters */}
        <div className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <Sliders className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-display font-bold text-white">
              Configurações de Gale & Proteção da Lista
            </h2>
          </div>

          {/* Gale Setting */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white">Níveis de Martingale (Gale):</span>
              <span className="text-xs font-mono font-bold text-emerald-400">
                {listConfig.maxGales === 0 ? 'Sem Gale (Mão Fixa)' : `Até Gale ${listConfig.maxGales}`}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([0, 1, 2] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => onUpdateListConfig({ maxGales: g })}
                  className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                    listConfig.maxGales === g
                      ? 'bg-emerald-600 border-emerald-500 text-white'
                      : 'bg-[#0B0F17] border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {g === 0 ? 'Mão Fixa' : `Gale ${g}`}
                </button>
              ))}
            </div>
          </div>

          {/* Gale Multiplier */}
          {listConfig.maxGales > 0 && (
            <div className="flex items-center justify-between p-3 bg-[#0B0F17] border border-slate-800 rounded-lg">
              <div>
                <span className="text-xs font-semibold text-white">Multiplicador do Gale:</span>
                <p className="text-[11px] text-slate-400">Valor da entrada x multiplicador</p>
              </div>
              <div className="flex items-center gap-1 font-mono">
                <input
                  type="number"
                  step="0.1"
                  min="1.5"
                  max="3.0"
                  value={listConfig.galeMultiplier}
                  onChange={(e) =>
                    onUpdateListConfig({
                      galeMultiplier: Math.max(1.5, Math.min(3.0, Number(e.target.value))),
                    })
                  }
                  className="w-16 px-2 py-1 bg-[#111827] border border-slate-700 rounded text-xs text-white font-bold text-center focus:outline-none focus:border-emerald-500"
                />
                <span className="text-xs text-slate-400">x</span>
              </div>
            </div>
          )}

          {/* Delay Anticipation */}
          <div className="flex items-center justify-between p-3 bg-[#0B0F17] border border-slate-800 rounded-lg">
            <div>
              <span className="text-xs font-semibold text-white">Antecipação de Entrada:</span>
              <p className="text-[11px] text-slate-400">Envia a ordem antes para evitar delay</p>
            </div>
            <div className="inline-flex p-0.5 bg-[#111827] border border-slate-800 rounded text-[11px] font-mono">
              {([59, 58, 0] as const).map((sec) => (
                <button
                  key={sec}
                  onClick={() => onUpdateListConfig({ entryAdvanceSeconds: sec })}
                  className={`px-2 py-1 rounded cursor-pointer transition-colors ${
                    listConfig.entryAdvanceSeconds === sec
                      ? 'bg-blue-600 text-white font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {sec === 59 ? '59s (Rec)' : sec === 58 ? '58s' : '00s'}
                </button>
              ))}
            </div>
          </div>

          {/* Protection Filters */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <span className="text-xs font-semibold text-slate-300">Filtros de Proteção da Lista:</span>

            {/* EMA Trend Filter */}
            <label className="flex items-center justify-between p-2.5 bg-[#0B0F17] border border-slate-800 rounded-lg cursor-pointer">
              <span className="text-xs text-slate-300">
                Filtro de Tendência EMA 9/21 (Não entrar contra)
              </span>
              <input
                type="checkbox"
                checked={listConfig.useEmaTrendFilter}
                onChange={(e) => onUpdateListConfig({ useEmaTrendFilter: e.target.checked })}
                className="w-4 h-4 rounded accent-purple-600 cursor-pointer"
              />
            </label>

            {/* News Filter */}
            <label className="flex items-center justify-between p-2.5 bg-[#0B0F17] border border-slate-800 rounded-lg cursor-pointer">
              <span className="text-xs text-slate-300">
                Filtro de Notícias Econômicas (Pausar em alta volatilidade)
              </span>
              <input
                type="checkbox"
                checked={listConfig.useNewsFilter}
                onChange={(e) => onUpdateListConfig({ useNewsFilter: e.target.checked })}
                className="w-4 h-4 rounded accent-purple-600 cursor-pointer"
              />
            </label>

            {/* Min Payout */}
            <div className="flex items-center justify-between p-2.5 bg-[#0B0F17] border border-slate-800 rounded-lg">
              <span className="text-xs text-slate-300">Payout Mínimo Aceito:</span>
              <div className="flex items-center gap-1 font-mono">
                <input
                  type="number"
                  min="70"
                  max="95"
                  value={listConfig.minPayout}
                  onChange={(e) =>
                    onUpdateListConfig({
                      minPayout: Math.max(70, Math.min(95, Number(e.target.value))),
                    })
                  }
                  className="w-14 px-2 py-0.5 bg-[#111827] border border-slate-700 rounded text-xs text-white font-bold text-center focus:outline-none"
                />
                <span className="text-xs text-slate-400">%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scheduled Signals Table & Management */}
      <div className="bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-purple-400" />
            <h2 className="text-sm font-display font-bold text-white">
              Grade de Sinais Agendados ({signals.length})
            </h2>
          </div>

          {/* Table Tab Filters */}
          <div className="inline-flex p-1 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs">
            <button
              onClick={() => setFilterTab('ALL')}
              className={`px-3 py-1 rounded transition-colors cursor-pointer ${
                filterTab === 'ALL' ? 'bg-purple-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Todos ({signals.length})
            </button>
            <button
              onClick={() => setFilterTab('PENDING')}
              className={`px-3 py-1 rounded transition-colors cursor-pointer ${
                filterTab === 'PENDING' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Pendentes ({pendingCount})
            </button>
            <button
              onClick={() => setFilterTab('WINS')}
              className={`px-3 py-1 rounded transition-colors cursor-pointer ${
                filterTab === 'WINS' ? 'bg-emerald-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Vitórias ({totalWins})
            </button>
            <button
              onClick={() => setFilterTab('LOSSES')}
              className={`px-3 py-1 rounded transition-colors cursor-pointer ${
                filterTab === 'LOSSES' ? 'bg-red-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Derrotas ({lossCount})
            </button>
          </div>
        </div>

        {signals.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center">
            <FileText className="w-10 h-10 text-slate-600 mb-3" />
            <h3 className="text-sm font-semibold text-slate-300">Nenhum sinal na lista</h3>
            <p className="text-xs text-slate-500 max-w-md mt-1 mb-4">
              Cole sua lista de sinais no painel acima ou clique no botão abaixo para carregar um exemplo pronto para testar as entradas automáticas e o Martingale.
            </p>
            <button
              onClick={handleLoadSample}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Carregar Exemplo de Lista
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-[#0B0F17]/70 text-[11px] text-slate-400">
                  <th className="py-2.5 px-3">Status / Ativação</th>
                  <th className="py-2.5 px-3">Horário Alvo</th>
                  <th className="py-2.5 px-3">Ativo</th>
                  <th className="py-2.5 px-3">Timeframe</th>
                  <th className="py-2.5 px-3">Direção</th>
                  <th className="py-2.5 px-3">Contagem / Resultado</th>
                  <th className="py-2.5 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
                {filteredSignals.map((sig) => {
                  const secondsRemaining = sig.targetTimestamp - serverNowSec;
                  const isUpcoming = secondsRemaining > 0 && secondsRemaining <= 3600;
                  const isPreSignal = secondsRemaining <= 30 && secondsRemaining > 0;

                  return (
                    <tr
                      key={sig.id}
                      className={`h-11 transition-colors ${
                        !sig.enabled
                          ? 'opacity-40 bg-slate-900/40'
                          : isPreSignal
                          ? 'bg-blue-950/30'
                          : 'hover:bg-slate-800/30'
                      }`}
                    >
                      {/* Checkbox & Status Pill */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={sig.enabled}
                            onChange={() => handleToggleSignal(sig.id)}
                            className="w-3.5 h-3.5 rounded accent-purple-600 cursor-pointer"
                          />
                          {sig.status === 'PENDING' ? (
                            <span className="text-[10px] uppercase font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                              Agendado
                            </span>
                          ) : sig.status === 'PRE_SIGNAL' || isPreSignal ? (
                            <span className="text-[10px] uppercase font-bold text-blue-300 bg-blue-900/60 border border-blue-700/80 px-2 py-0.5 rounded flex items-center gap-1">
                              <Zap className="w-3 h-3 text-blue-400 animate-pulse" />
                              Pré-Sinal
                            </span>
                          ) : sig.status === 'EXECUTING' ? (
                            <span className="text-[10px] uppercase font-bold text-amber-300 bg-amber-950/60 border border-amber-700/80 px-2 py-0.5 rounded">
                              Executando...
                            </span>
                          ) : sig.status === 'WIN_1ST' ? (
                            <span className="text-[10px] uppercase font-bold text-emerald-300 bg-emerald-950/70 border border-emerald-700/80 px-2 py-0.5 rounded">
                              WIN (1ª Mão)
                            </span>
                          ) : sig.status === 'WIN_G1' ? (
                            <span className="text-[10px] uppercase font-bold text-teal-300 bg-teal-950/70 border border-teal-700/80 px-2 py-0.5 rounded">
                              WIN (Gale 1)
                            </span>
                          ) : sig.status === 'WIN_G2' ? (
                            <span className="text-[10px] uppercase font-bold text-cyan-300 bg-cyan-950/70 border border-cyan-700/80 px-2 py-0.5 rounded">
                              WIN (Gale 2)
                            </span>
                          ) : sig.status === 'LOSS' ? (
                            <span className="text-[10px] uppercase font-bold text-red-300 bg-red-950/70 border border-red-700/80 px-2 py-0.5 rounded">
                              LOSS Total
                            </span>
                          ) : sig.status === 'BLOCKED_SIMULTANEOUS' || sig.status === 'BLOCKED_OVERLAP' ? (
                            <span
                              className="text-[10px] uppercase font-bold text-amber-300 bg-amber-950/60 border border-amber-700/60 px-2 py-0.5 rounded"
                              title="Sinal bloqueado pela proteção anti-sobreposição (já operando ou sinal simultâneo)"
                            >
                              {sig.status === 'BLOCKED_OVERLAP' ? 'Bloqueado: sobreposição' : 'Anti-Sobreposição'}
                            </span>
                          ) : (
                            <span className="text-[10px] uppercase font-bold text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded">
                              {sig.status.replace('BLOCKED_', 'Filtro ')}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Time */}
                      <td className="py-2 px-3 font-semibold text-white whitespace-nowrap">
                        {sig.timeStr}
                      </td>

                      {/* Asset */}
                      <td className="py-2 px-3 font-sans font-medium text-slate-200 whitespace-nowrap">
                        <span>{sig.ticker}</span>
                        {sig.ticker.includes('OTC') && (
                          <span className="ml-1.5 text-[10px] font-mono text-amber-400 bg-amber-950/60 px-1 py-0.2 rounded">
                            OTC
                          </span>
                        )}
                      </td>

                      {/* Timeframe */}
                      <td className="py-2 px-3 text-slate-400 whitespace-nowrap">
                        M{sig.timeframe / 60}
                      </td>

                      {/* Direction */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span
                          className={`font-bold inline-flex items-center gap-1 ${
                            sig.direction === 'CALL' ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          {sig.direction === 'CALL' ? (
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowDownRight className="w-3.5 h-3.5" />
                          )}
                          {sig.direction}
                        </span>
                      </td>

                      {/* Countdown or Outcome */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        {sig.status === 'WIN_1ST' || sig.status === 'WIN_G1' || sig.status === 'WIN_G2' ? (
                          <span className="text-emerald-400 font-bold">
                            +R$ {(sig.profit || 0).toFixed(2)}
                          </span>
                        ) : sig.status === 'LOSS' ? (
                          <span className="text-red-400 font-bold">
                            -R$ {Math.abs(sig.profit || 0).toFixed(2)}
                          </span>
                        ) : sig.status === 'EXECUTING' ? (
                          <span className="text-amber-400">Na corretora...</span>
                        ) : isPreSignal ? (
                          <span className="text-blue-400 font-bold">
                            Disparo em 00:{String(secondsRemaining).padStart(2, '0')}s
                          </span>
                        ) : isUpcoming ? (
                          <span className="text-slate-400">
                            em {Math.floor(secondsRemaining / 60)}m {secondsRemaining % 60}s
                          </span>
                        ) : secondsRemaining < 0 ? (
                          <span className="text-slate-500">Horário concluído</span>
                        ) : (
                          <span className="text-slate-400">
                            às {sig.timeStr}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => handleDeleteSignal(sig.id)}
                          className="text-slate-500 hover:text-red-400 transition-colors p-1 cursor-pointer"
                          title="Excluir sinal"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
