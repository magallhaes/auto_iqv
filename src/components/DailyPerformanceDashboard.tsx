import React, { useMemo, useState } from 'react';
import {
  TradeOrder,
  RiskSessionState,
  RiskConfig,
} from '../types/trading';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Download,
  Filter,
  DollarSign,
  PieChart as PieChartIcon,
  RefreshCw,
  Zap,
} from 'lucide-react';

interface DailyPerformanceDashboardProps {
  orders: TradeOrder[];
  riskState: RiskSessionState;
  riskConfig: RiskConfig;
  currencySymbol?: string;
  onClearHistory?: () => void;
  onRefresh?: () => void;
  currentBalance?: number;
}

// Sample realistic demo data if user has no orders yet today
const GENERATE_MOCK_DAILY_ORDERS = (): TradeOrder[] => {
  const baseTime = Math.floor(Date.now() / 1000) - 6 * 3600;
  const pairs = [
    { ticker: 'EUR/USD', id: 1, base: 1.1162 },
    { ticker: 'EUR/USD (OTC)', id: 76, base: 1.1322 },
    { ticker: 'GBP/USD', id: 2, base: 1.2915 },
    { ticker: 'USD/BRL (OTC)', id: 81, base: 5.518 },
    { ticker: 'USD/JPY', id: 4, base: 151.95 },
  ];
  const strategies = [
    'MHI_1 MINORIA',
    'MHI_1 MAIORIA',
    'SUPORTE & RESISTÊNCIA',
    'CANAL DE TENDÊNCIA',
    'LISTA DE SINAIS',
  ];

  const mock: TradeOrder[] = [];
  const count = 18;
  let runningPnl = 0;

  for (let i = 0; i < count; i++) {
    const pair = pairs[i % pairs.length];
    const strat = strategies[i % strategies.length];
    const isWin = i === 2 || i === 7 || i === 13 ? false : Math.random() < 0.82;
    const stake = 20;
    const payout = 88;
    const profit = isWin ? Number(((stake * payout) / 100).toFixed(2)) : -stake;
    runningPnl += profit;
    const galeStep = !isWin && i % 3 === 0 ? 1 : 0;
    const openPrice = pair.base + (Math.random() - 0.5) * 0.0015;
    const closePrice = isWin ? openPrice + 0.00025 : openPrice - 0.00025;

    mock.push({
      id: `mock_ord_${i + 1}`,
      iqOptionOrderId: 1445000000 + i * 112,
      timestamp: baseTime + i * 1100,
      assetTicker: pair.ticker,
      assetId: pair.id,
      direction: Math.random() > 0.5 ? 'CALL' : 'PUT',
      amount: stake,
      payoutPercent: payout,
      galeStep: galeStep as 0 | 1 | 2,
      sorosLevel: 1,
      strategyLabel: strat,
      openPrice: Number(openPrice.toFixed(pair.base > 50 ? 3 : 5)),
      closePrice: Number(closePrice.toFixed(pair.base > 50 ? 3 : 5)),
      status: isWin ? 'WIN' : 'LOSS',
      profit,
      accountType: 'PRACTICE',
      brokerConfirmed: true,
      timeframe: 60,
    });
  }

  return mock.reverse();
};

export const DailyPerformanceDashboard: React.FC<DailyPerformanceDashboardProps> = ({
  orders,
  riskState,
  riskConfig,
  currencySymbol = 'R$',
  onClearHistory,
  onRefresh,
  currentBalance = 10000,
}) => {
  const [filterPeriod, setFilterPeriod] = useState<'TODAY' | 'ALL'>('TODAY');
  const [selectedAssetFilter, setSelectedAssetFilter] = useState<string>('ALL');
  const [selectedStrategyFilter, setSelectedStrategyFilter] = useState<string>('ALL');
  const [useDemoFallback, setUseDemoFallback] = useState<boolean>(orders.length === 0);

  // Active orders pool: actual orders or fallback to realistic demo audit
  const activeOrdersPool = useMemo(() => {
    if (orders.length > 0 && !useDemoFallback) return orders;
    return GENERATE_MOCK_DAILY_ORDERS();
  }, [orders, useDemoFallback]);

  // Filtered by period
  const filteredOrders = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const startOfDay = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);

    return activeOrdersPool.filter((ord) => {
      if (filterPeriod === 'TODAY' && ord.timestamp < startOfDay) return false;
      if (selectedAssetFilter !== 'ALL' && ord.assetTicker !== selectedAssetFilter) return false;
      if (selectedStrategyFilter !== 'ALL' && ord.strategyLabel !== selectedStrategyFilter) return false;
      return true;
    });
  }, [activeOrdersPool, filterPeriod, selectedAssetFilter, selectedStrategyFilter]);

  // Settled orders (WIN or LOSS) chronologically ordered
  const chronologicalSettled = useMemo(() => {
    return [...filteredOrders]
      .filter((o) => o.status === 'WIN' || o.status === 'LOSS')
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [filteredOrders]);

  const historyRows = useMemo(() => {
    return [...chronologicalSettled].reverse();
  }, [chronologicalSettled]);

  // 1. Cumulative Balance Timeline Data (Gráfico de Saldo Acumulado)
  const balanceTimelineData = useMemo(() => {
    let runningCumulativeProfit = 0;
    const initialBase = currentBalance - (riskState.sessionProfit || 0);

    const points = [
      {
        index: 0,
        tradeNum: 0,
        time: 'Início',
        profit: 0,
        cumulativeProfit: 0,
        balance: initialBase,
        status: 'START',
        ticker: '—',
        strategy: 'Início do Dia',
      },
    ];

    chronologicalSettled.forEach((ord, idx) => {
      runningCumulativeProfit += ord.profit;
      const d = new Date(ord.timestamp * 1000);
      const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      points.push({
        index: idx + 1,
        tradeNum: idx + 1,
        time: timeStr,
        profit: ord.profit,
        cumulativeProfit: Number(runningCumulativeProfit.toFixed(2)),
        balance: Number((initialBase + runningCumulativeProfit).toFixed(2)),
        status: ord.status,
        ticker: ord.assetTicker,
        strategy: ord.strategyLabel,
      });
    });

    return points;
  }, [chronologicalSettled, currentBalance, riskState.sessionProfit]);

  // 2. Win/Loss Distribution by Currency Pair (Distribuição de vitórias/perdas por par)
  const pairPerformanceData = useMemo(() => {
    const map = new Map<
      string,
      {
        ticker: string;
        wins: number;
        losses: number;
        total: number;
        pnl: number;
        winRate: number;
      }
    >();

    chronologicalSettled.forEach((ord) => {
      const entry = map.get(ord.assetTicker) || {
        ticker: ord.assetTicker,
        wins: 0,
        losses: 0,
        total: 0,
        pnl: 0,
        winRate: 0,
      };

      if (ord.status === 'WIN') entry.wins += 1;
      else if (ord.status === 'LOSS') entry.losses += 1;
      entry.total += 1;
      entry.pnl = Number((entry.pnl + ord.profit).toFixed(2));
      map.set(ord.assetTicker, entry);
    });

    const result = Array.from(map.values()).map((p) => ({
      ...p,
      winRate: p.total > 0 ? Number(((p.wins / p.total) * 100).toFixed(1)) : 0,
    }));

    // Sort by total trades descending
    return result.sort((a, b) => b.total - a.total);
  }, [chronologicalSettled]);

  // 3. Strategy Assertiveness Over Time (Assertividade de cada estratégia ao longo do tempo)
  const strategyTimelineData = useMemo(() => {
    // Collect unique strategies
    const stratSet = new Set<string>();
    chronologicalSettled.forEach((o) => stratSet.add(o.strategyLabel));
    const strats = Array.from(stratSet);

    // Track running totals per strategy
    const stratRunning: Record<string, { wins: number; total: number }> = {};
    strats.forEach((s) => {
      stratRunning[s] = { wins: 0, total: 0 };
    });

    const timeline: Array<Record<string, number | string>> = [];

    chronologicalSettled.forEach((ord, idx) => {
      const strat = ord.strategyLabel;
      if (stratRunning[strat]) {
        stratRunning[strat].total += 1;
        if (ord.status === 'WIN') stratRunning[strat].wins += 1;
      }

      const d = new Date(ord.timestamp * 1000);
      const point: Record<string, number | string> = {
        tradeIndex: idx + 1,
        time: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        ticker: ord.assetTicker,
      };

      strats.forEach((s) => {
        const data = stratRunning[s];
        point[s] = data.total > 0 ? Number(((data.wins / data.total) * 100).toFixed(1)) : 0;
      });

      timeline.push(point);
    });

    return { timeline, strategies: strats };
  }, [chronologicalSettled]);

  // 4. Strategy Benchmark Summary Cards
  const strategySummaryCards = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        wins: number;
        losses: number;
        win1st: number;
        winG1: number;
        winG2: number;
        pnl: number;
      }
    >();

    chronologicalSettled.forEach((ord) => {
      const entry = map.get(ord.strategyLabel) || {
        name: ord.strategyLabel,
        wins: 0,
        losses: 0,
        win1st: 0,
        winG1: 0,
        winG2: 0,
        pnl: 0,
      };

      if (ord.status === 'WIN') {
        entry.wins += 1;
        if (ord.galeStep === 0) entry.win1st += 1;
        else if (ord.galeStep === 1) entry.winG1 += 1;
        else if (ord.galeStep === 2) entry.winG2 += 1;
      } else if (ord.status === 'LOSS') {
        entry.losses += 1;
      }
      entry.pnl = Number((entry.pnl + ord.profit).toFixed(2));
      map.set(ord.strategyLabel, entry);
    });

    return Array.from(map.values()).map((s) => {
      const total = s.wins + s.losses;
      const rate = total > 0 ? Number(((s.wins / total) * 100).toFixed(1)) : 0;
      return {
        ...s,
        total,
        rate,
      };
    });
  }, [chronologicalSettled]);

  // 5. Executive KPIs
  const stats = useMemo(() => {
    const wins = chronologicalSettled.filter((o) => o.status === 'WIN');
    const losses = chronologicalSettled.filter((o) => o.status === 'LOSS');
    const totalTrades = wins.length + losses.length;
    const netProfit = chronologicalSettled.reduce((sum, o) => sum + o.profit, 0);

    const grossProfit = wins.reduce((sum, o) => sum + o.profit, 0);
    const grossLoss = Math.abs(losses.reduce((sum, o) => sum + o.profit, 0));
    const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : grossProfit > 0 ? '∞' : '0.00';
    const overallWinRate = totalTrades > 0 ? ((wins.length / totalTrades) * 100).toFixed(1) : '0.0';

    // Win distribution by Gale
    const win1st = wins.filter((o) => o.galeStep === 0).length;
    const winG1 = wins.filter((o) => o.galeStep === 1).length;
    const winG2 = wins.filter((o) => o.galeStep === 2).length;

    // Consecutive Win Streak & Max Drawdown
    let currentStreak = 0;
    let maxWinStreak = 0;
    let peakBalance = currentBalance;
    let maxDrawdown = 0;
    let runningBal = currentBalance - netProfit;

    chronologicalSettled.forEach((o) => {
      if (o.status === 'WIN') {
        currentStreak++;
        if (currentStreak > maxWinStreak) maxWinStreak = currentStreak;
      } else {
        currentStreak = 0;
      }

      runningBal += o.profit;
      if (runningBal > peakBalance) peakBalance = runningBal;
      const dd = peakBalance - runningBal;
      if (dd > maxDrawdown) maxDrawdown = dd;
    });

    return {
      totalTrades,
      winsCount: wins.length,
      lossesCount: losses.length,
      netProfit: Number(netProfit.toFixed(2)),
      grossProfit: Number(grossProfit.toFixed(2)),
      grossLoss: Number(grossLoss.toFixed(2)),
      profitFactor,
      overallWinRate,
      win1st,
      winG1,
      winG2,
      maxWinStreak,
      maxDrawdown: Number(maxDrawdown.toFixed(2)),
    };
  }, [chronologicalSettled, currentBalance]);

  // Unique lists for filters
  const availableAssets = useMemo(() => {
    const set = new Set<string>();
    activeOrdersPool.forEach((o) => set.add(o.assetTicker));
    return Array.from(set);
  }, [activeOrdersPool]);

  const availableStrategies = useMemo(() => {
    const set = new Set<string>();
    activeOrdersPool.forEach((o) => set.add(o.strategyLabel));
    return Array.from(set);
  }, [activeOrdersPool]);

  // Strategy Line Colors
  const strategyColors = ['#10B981', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4'];

  const handleExportCSV = () => {
    if (chronologicalSettled.length === 0) return;
    const headers = [
      'ID',
      'Horário',
      'Ativo',
      'Estratégia',
      'Direção',
      'Lote',
      'Payout',
      'Preço Entrada',
      'Preço Fechamento',
      'Resultado',
      'Lucro Líquido',
    ];
    const rows = chronologicalSettled.map((o) => [
      o.iqOptionOrderId || o.id,
      new Date(o.timestamp * 1000).toISOString(),
      o.assetTicker,
      o.strategyLabel,
      o.direction,
      o.amount,
      `${o.payoutPercent}%`,
      o.openPrice,
      o.closePrice || '—',
      o.status,
      o.profit,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `performance_diaria_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Controls */}
      <div className="bg-[#0B0E14] border border-[#161D2A] rounded-xl p-3 sm:p-5 shadow-xl flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 w-full sm:w-auto">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 min-w-0">
              <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 shrink-0" />
              <h2 className="text-sm sm:text-lg font-bold text-white tracking-tight break-words leading-snug">
                Relatório de Performance Diária do Bot
              </h2>
            </div>
            <span className="text-[9px] sm:text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap self-start sm:self-auto">
              AUDITORIA TEMPO REAL
            </span>
          </div>
          <p className="text-[10px] sm:text-xs text-slate-400 mt-1 leading-relaxed">
            Análise quantitativa de rentabilidade, assertividade por par de moedas e evolução das estratégias via Recharts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 w-full sm:w-auto justify-start sm:justify-end">
          {orders.length === 0 && (
            <button
              onClick={() => setUseDemoFallback(!useDemoFallback)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border flex items-center gap-1.5 ${
                useDemoFallback
                  ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                  : 'bg-[#141A26] text-slate-300 border-[#212B3E] hover:bg-[#1C2538]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>{useDemoFallback ? 'Modo Simulado Ativo' : 'Carregar Exemplo'}</span>
            </button>
          )}

          <div className="flex items-center bg-[#141A26] p-1 rounded-lg border border-[#212B3E] text-xs">
            <button
              onClick={() => setFilterPeriod('TODAY')}
              className={`px-3 py-1 rounded font-semibold transition-colors ${
                filterPeriod === 'TODAY'
                  ? 'bg-emerald-500 text-black shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Hoje
            </button>
            <button
              onClick={() => setFilterPeriod('ALL')}
              className={`px-3 py-1 rounded font-semibold transition-colors ${
                filterPeriod === 'ALL'
                  ? 'bg-emerald-500 text-black shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Completo
            </button>
          </div>

          <button
            onClick={handleExportCSV}
            disabled={chronologicalSettled.length === 0}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#141A26] hover:bg-[#1F293D] text-slate-200 border border-[#212B3E] flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="Exportar dados para planilha CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-300" />
            <span>Exportar CSV</span>
          </button>

          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-1.5 rounded-lg bg-[#141A26] hover:bg-[#1F293D] text-slate-300 border border-[#212B3E] transition-colors"
              title="Recarregar dados"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5 sm:gap-3">
        {/* Lucro Líquido */}
        <div className="bg-[#0B0E14] border border-[#161D2A] rounded-xl p-2.5 sm:p-4 flex flex-col justify-between min-h-[110px] sm:min-h-[120px]">
          <div className="flex items-center justify-between text-[9px] sm:text-xs text-slate-400">
            <span>P&L do Dia</span>
            {stats.netProfit >= 0 ? (
              <ArrowUpRight className="w-3 h-3 sm:w-4 sm:h-4 text-emerald-400" />
            ) : (
              <ArrowDownRight className="w-3 h-3 sm:w-4 sm:h-4 text-rose-400" />
            )}
          </div>
          <div className="mt-2">
            <span
              className={`text-base sm:text-xl font-black font-mono tabular-nums leading-tight ${
                stats.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {stats.netProfit >= 0 ? '+' : ''}
              {currencySymbol} {stats.netProfit.toFixed(2)}
            </span>
          </div>
          <span className="text-[9px] sm:text-[11px] text-slate-500 mt-1 leading-snug">
            {stats.netProfit >= 0 ? 'Operações lucrativas' : 'Sessão em recuperação'}
          </span>
        </div>

        {/* Taxa de Assertividade */}
        <div className="bg-[#0B0E14] border border-[#161D2A] rounded-xl p-2.5 sm:p-4 flex flex-col justify-between min-h-[110px] sm:min-h-[120px]">
          <div className="flex items-center justify-between text-[9px] sm:text-xs text-slate-400">
            <span>Assertividade</span>
            <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 text-blue-400" />
          </div>
          <div className="mt-2">
            <span className="text-base sm:text-xl font-black font-mono tabular-nums text-white">
              {stats.overallWinRate}%
            </span>
          </div>
          <span className="text-[9px] sm:text-[11px] text-slate-500 mt-1 leading-snug">
            {stats.winsCount}W / {stats.lossesCount}L ({stats.totalTrades})
          </span>
        </div>

        {/* Profit Factor */}
        <div className="bg-[#0B0E14] border border-[#161D2A] rounded-xl p-2.5 sm:p-4 flex flex-col justify-between min-h-[110px] sm:min-h-[120px]">
          <div className="flex items-center justify-between text-[9px] sm:text-xs text-slate-400">
            <span>Fator Lucro</span>
            <DollarSign className="w-3 h-3 sm:w-4 sm:h-4 text-amber-400" />
          </div>
          <div className="mt-2">
            <span className="text-base sm:text-xl font-black font-mono tabular-nums text-amber-300">
              {stats.profitFactor}
            </span>
          </div>
          <span className="text-[9px] sm:text-[11px] text-slate-500 mt-1 leading-snug">
            Bruto: {currencySymbol} {stats.grossProfit.toFixed(0)} / {stats.grossLoss.toFixed(0)}
          </span>
        </div>

        {/* Win Streak */}
        <div className="bg-[#0B0E14] border border-[#161D2A] rounded-xl p-2.5 sm:p-4 flex flex-col justify-between min-h-[110px] sm:min-h-[120px]">
          <div className="flex items-center justify-between text-[9px] sm:text-xs text-slate-400">
            <span>Win Streak</span>
            <Zap className="w-3 h-3 sm:w-4 sm:h-4 text-emerald-400" />
          </div>
          <div className="mt-2">
            <span className="text-base sm:text-xl font-black font-mono tabular-nums text-emerald-400 leading-tight">
              {stats.maxWinStreak}
            </span>
          </div>
          <span className="text-[9px] sm:text-[11px] text-slate-500 mt-1">Sequência vitoriosa</span>
        </div>

        {/* Max Drawdown */}
        <div className="bg-[#0B0E14] border border-[#161D2A] rounded-xl p-2.5 sm:p-4 flex flex-col justify-between min-h-[110px] sm:min-h-[120px]">
          <div className="flex items-center justify-between text-[9px] sm:text-xs text-slate-400">
            <span>Drawdown</span>
            <TrendingDown className="w-3 h-3 sm:w-4 sm:h-4 text-rose-400" />
          </div>
          <div className="mt-2">
            <span className="text-base sm:text-xl font-black font-mono tabular-nums text-rose-300 leading-tight">
              {currencySymbol} {stats.maxDrawdown.toFixed(2)}
            </span>
          </div>
          <span className="text-[9px] sm:text-[11px] text-slate-500 mt-1">Máx. rebaixamento</span>
        </div>

        {/* Distribuição Gales */}
        <div className="bg-[#0B0E14] border border-[#161D2A] rounded-xl p-2.5 sm:p-4 flex flex-col justify-between min-h-[110px] sm:min-h-[120px]">
          <div className="flex items-center justify-between text-[9px] sm:text-xs text-slate-400">
            <span>Mão</span>
            <Layers className="w-3 h-3 sm:w-4 sm:h-4 text-purple-400" />
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-1 font-mono text-[9px] sm:text-[11px] font-bold">
            <span className="text-emerald-400" title="1ª Mão">{stats.win1st} (1ª)</span>
            <span className="text-slate-500">·</span>
            <span className="text-blue-400" title="Gale 1">{stats.winG1} (G1)</span>
            <span className="text-slate-500">·</span>
            <span className="text-amber-400" title="Gale 2">{stats.winG2} (G2)</span>
          </div>
          <span className="text-[9px] sm:text-[11px] text-slate-500 mt-1">Recuperação</span>
        </div>
      </div>

      {/* GRÁFICO 1: Saldo Acumulado (Cumulative Balance & Profit Curve) */}
      <div className="bg-[#0B0E14] border border-[#161D2A] rounded-xl p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <h3 className="font-bold text-sm text-white">
                Evolução do Saldo Acumulado & Trajetória de Lucro
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Curva financeira trade a trade mostrando a valorização do capital ao longo das operações do dia.
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono tabular-nums">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-emerald-400" />
              <span className="text-slate-400">Saldo:</span>
              <span className="font-bold text-white">
                {currencySymbol} {currentBalance.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-blue-400" />
              <span className="text-slate-400">Lucro Acumulado:</span>
              <span className={`font-bold ${stats.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {currencySymbol} {stats.netProfit.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <div className="h-56 sm:h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={balanceTimelineData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#162030" vertical={false} />
              <XAxis
                dataKey="time"
                stroke="#64748B"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#1E293B' }}
              />
              <YAxis
                stroke="#64748B"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#1E293B' }}
                domain={['auto', 'auto']}
                tickFormatter={(val) => `${currencySymbol} ${val}`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-[#111722] border border-[#212E44] p-3 rounded-lg shadow-2xl text-xs space-y-1">
                        <div className="flex items-center justify-between gap-4 font-bold text-white border-b border-[#212E44] pb-1">
                          <span>Operação #{data.tradeNum}</span>
                          <span className="text-slate-400 font-mono">{data.time}</span>
                        </div>
                        <div className="flex justify-between gap-4 pt-1">
                          <span className="text-slate-400">Ativo:</span>
                          <span className="text-white font-semibold">{data.ticker}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-slate-400">Estratégia:</span>
                          <span className="text-slate-200">{data.strategy}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-slate-400">Resultado:</span>
                          <span
                            className={`font-bold ${
                              data.status === 'WIN'
                                ? 'text-emerald-400'
                                : data.status === 'LOSS'
                                ? 'text-rose-400'
                                : 'text-slate-400'
                            }`}
                          >
                            {data.status === 'WIN' ? 'VITÓRIA' : data.status === 'LOSS' ? 'LOSS' : 'INÍCIO'}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4 border-t border-[#212E44] pt-1 font-mono">
                          <span className="text-slate-400">Lucro Trade:</span>
                          <span className={data.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {data.profit >= 0 ? '+' : ''}
                            {currencySymbol} {Number(data.profit).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4 font-mono font-bold">
                          <span className="text-slate-300">Saldo da Banca:</span>
                          <span className="text-white">
                            {currencySymbol} {Number(data.balance).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <ReferenceLine y={currentBalance - (riskState.sessionProfit || 0)} stroke="#475569" strokeDasharray="4 4" />
              <Area
                type="monotone"
                dataKey="balance"
                stroke="#10B981"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#profitGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* GRID COM GRÁFICO 2 & GRÁFICO 3 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* GRÁFICO 2: Distribuição de Vitórias/Perdas por Par de Moedas */}
        <div className="bg-[#0B0E14] border border-[#161D2A] rounded-xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-blue-400" />
                <h3 className="font-bold text-sm text-white">
                  Distribuição de Vitórias e Perdas por Par
                </h3>
              </div>
              <span className="text-[11px] text-slate-400">Wins vs Losses</span>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Comparativo de volume de operações ganhas (verde) e perdidas (vermelho) agrupadas por ativo.
            </p>
          </div>

          <div className="h-52 sm:h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pairPerformanceData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#162030" vertical={false} />
                <XAxis dataKey="ticker" stroke="#64748B" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={10} tickLine={false} allowDecimals={false} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-[#111722] border border-[#212E44] p-2.5 rounded-lg text-xs space-y-1">
                          <span className="font-bold text-white block border-b border-[#212E44] pb-1">
                            {data.ticker}
                          </span>
                          <div className="flex justify-between gap-4 text-emerald-400">
                            <span>Vitórias:</span>
                            <span className="font-mono font-bold">{data.wins}</span>
                          </div>
                          <div className="flex justify-between gap-4 text-rose-400">
                            <span>Derrotas:</span>
                            <span className="font-mono font-bold">{data.losses}</span>
                          </div>
                          <div className="flex justify-between gap-4 text-white border-t border-[#212E44] pt-1">
                            <span>Assertividade:</span>
                            <span className="font-mono font-bold text-emerald-300">{data.winRate}%</span>
                          </div>
                          <div className="flex justify-between gap-4 font-mono font-bold">
                            <span className="text-slate-400">PnL Líquido:</span>
                            <span className={data.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                              {currencySymbol} {data.pnl.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                  formatter={(val) => (val === 'wins' ? 'Vitórias' : 'Derrotas')}
                />
                <Bar dataKey="wins" name="wins" fill="#10B981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="losses" name="losses" fill="#EF4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Mini listagem de taxas dos pares */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4 pt-3 border-t border-[#161D2A] text-xs">
            {pairPerformanceData.slice(0, 6).map((pair) => (
              <div key={pair.ticker} className="bg-[#101520] p-2 rounded border border-[#1A2333]">
                <span className="font-bold text-white block truncate">{pair.ticker}</span>
                <div className="flex items-center justify-between text-[11px] mt-0.5 font-mono">
                  <span className="text-slate-400">{pair.wins}W / {pair.losses}L</span>
                  <span className="font-bold text-emerald-400">{pair.winRate}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* GRÁFICO 3: Assertividade de Cada Estratégia ao Longo do Tempo */}
        <div className="bg-[#0B0E14] border border-[#161D2A] rounded-xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-sm text-white">
                  Assertividade das Estratégias ao Longo do Tempo
                </h3>
              </div>
              <span className="text-[11px] text-slate-400">% de Acerto Cumulativo</span>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Curva de precisão em tempo real (%) de cada padrão de catálogo/MHI executado ao longo do dia.
            </p>
          </div>

          <div className="h-52 sm:h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={strategyTimelineData.timeline} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#162030" vertical={false} />
                <XAxis dataKey="time" stroke="#64748B" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={10} domain={[40, 100]} tickFormatter={(val) => `${val}%`} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-[#111722] border border-[#212E44] p-3 rounded-lg text-xs space-y-1">
                          <span className="font-bold text-white block border-b border-[#212E44] pb-1">
                            Entrada #{data.tradeIndex} ({data.time})
                          </span>
                          {strategyTimelineData.strategies.map((strat, i) => (
                            <div key={strat} className="flex justify-between gap-4 font-mono">
                              <span style={{ color: strategyColors[i % strategyColors.length] }}>
                                {strat}:
                              </span>
                              <span className="font-bold text-white">{data[strat] || 0}%</span>
                            </div>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <ReferenceLine y={80} stroke="#10B981" strokeDasharray="3 3" />
                <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }} />
                {strategyTimelineData.strategies.map((strat, idx) => (
                  <Line
                    key={strat}
                    type="monotone"
                    dataKey={strat}
                    stroke={strategyColors[idx % strategyColors.length]}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Cards de Resumo por Estratégia */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4 pt-3 border-t border-[#161D2A] text-xs">
            {strategySummaryCards.map((strat, idx) => (
              <div key={strat.name} className="bg-[#101520] p-2 rounded border border-[#1A2333]">
                <div className="flex items-center gap-1.5 truncate">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: strategyColors[idx % strategyColors.length] }}
                  />
                  <span className="font-bold text-slate-200 truncate">{strat.name}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] mt-1 font-mono">
                  <span className="text-slate-400">{strat.total} ordens</span>
                  <span className="font-black text-emerald-400">{strat.rate}%</span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                  Lucro: {currencySymbol} {strat.pnl.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* TABELA DE AUDITORIA DE OPERAÇÕES */}
      <div className="bg-[#0B0E14] border border-[#161D2A] rounded-xl p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-bold text-sm text-white">
              Histórico Detalhado de Operações & Cotações
            </h3>
            <p className="text-xs text-slate-400">
              Auditoria de cada lote, estratégia, taxa de abertura e fechamento real da corretora.
            </p>
          </div>

          {/* Filtros de Tabela */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 bg-[#141A26] px-2.5 py-1 rounded-lg border border-[#212B3E]">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedAssetFilter}
                onChange={(e) => setSelectedAssetFilter(e.target.value)}
                className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="ALL">Todos os Pares</option>
                {availableAssets.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-[#141A26] px-2.5 py-1 rounded-lg border border-[#212B3E]">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedStrategyFilter}
                onChange={(e) => setSelectedStrategyFilter(e.target.value)}
                className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="ALL">Todas Estratégias</option>
                {availableStrategies.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {onClearHistory && (
              <button
                onClick={onClearHistory}
                className="text-xs text-slate-400 hover:text-rose-400 px-2 py-1 rounded border border-[#212B3E] hover:border-rose-500/30 transition-colors"
              >
                Limpar
              </button>
            )}
          </div>
        </div>

        {chronologicalSettled.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            Nenhuma operação registrada para o filtro selecionado.
          </div>
        ) : (
          <>
            <div className="md:hidden space-y-3">
              {historyRows.map((ord) => {
                const isWin = ord.status === 'WIN';
                const d = new Date(ord.timestamp * 1000);
                const timeStr = d.toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                });

                return (
                  <div key={ord.id} className="rounded-xl border border-[#1A2333] bg-[#101720] p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[11px] text-slate-400">{timeStr}</div>
                        <div className="text-sm font-bold text-white">{ord.assetTicker}</div>
                      </div>
                      <div
                        className={`px-2 py-1 rounded text-[10px] font-black ${
                          isWin ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                        }`}
                      >
                        {isWin ? 'WIN' : 'LOSS'}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                      <div className="text-slate-400">Estratégia</div>
                      <div className="text-right text-slate-200 truncate">{ord.strategyLabel}</div>

                      <div className="text-slate-400">Direção</div>
                      <div className="text-right">
                        <span
                          className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            ord.direction === 'CALL'
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-rose-500/15 text-rose-400'
                          }`}
                        >
                          {ord.direction}
                        </span>
                      </div>

                      <div className="text-slate-400">Lote</div>
                      <div className="text-right text-white">{currencySymbol} {ord.amount.toFixed(2)}</div>

                      <div className="text-slate-400">Entrada</div>
                      <div className="text-right text-slate-300">{ord.openPrice != null ? ord.openPrice : '—'}</div>

                      <div className="text-slate-400">Fechamento</div>
                      <div className="text-right text-slate-300">{ord.closePrice != null ? ord.closePrice : '—'}</div>

                      <div className="text-slate-400">Lucro</div>
                      <div
                        className={`text-right font-bold ${
                          isWin ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isWin ? '+' : ''}{currencySymbol} {ord.profit.toFixed(2)}
                      </div>
                    </div>

                    {ord.galeStep > 0 && (
                      <div className="mt-3 text-[10px] text-amber-300">
                        Gale {ord.galeStep}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#1A2333] text-slate-400 font-semibold bg-[#0E131D]/80">
                    <th className="py-2.5 px-3">Horário / ID</th>
                    <th className="py-2.5 px-3">Ativo</th>
                    <th className="py-2.5 px-3">Estratégia & Etapa</th>
                    <th className="py-2.5 px-3">Direção</th>
                    <th className="py-2.5 px-3">Lote</th>
                    <th className="py-2.5 px-3">Preço Entrada</th>
                    <th className="py-2.5 px-3">Preço Fechamento</th>
                    <th className="py-2.5 px-3 text-right">Resultado / Lucro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#141B28]">
                  {historyRows.map((ord) => {
                    const isWin = ord.status === 'WIN';
                    const d = new Date(ord.timestamp * 1000);
                    const timeStr = d.toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    });

                    return (
                      <tr key={ord.id} className="hover:bg-[#121824] transition-colors font-mono">
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-200">{timeStr}</div>
                          <div className="text-[10px] text-slate-500">#{ord.iqOptionOrderId || ord.id.slice(-6)}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-bold text-white font-sans">{ord.assetTicker}</span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="text-slate-300 font-sans">{ord.strategyLabel}</span>
                          {ord.galeStep > 0 && (
                            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                              Gale {ord.galeStep}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`font-bold px-1.5 py-0.5 rounded text-[11px] ${
                              ord.direction === 'CALL'
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-rose-500/15 text-rose-400'
                            }`}
                          >
                            {ord.direction}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-white">
                          {currencySymbol} {ord.amount.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-slate-300 font-mono tabular-nums">
                          {ord.openPrice != null ? ord.openPrice : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-300 font-mono tabular-nums">
                          {ord.closePrice != null ? ord.closePrice : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div
                            className={`font-black text-sm ${
                              isWin ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {isWin ? 'WIN' : 'LOSS'}
                          </div>
                          <div className={`text-[11px] ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isWin ? '+' : ''}
                            {currencySymbol} {ord.profit.toFixed(2)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
