import React, { useMemo, useState } from 'react';
import {
  Candle,
  IQAsset,
  MHIMode,
  MHIVariant,
  PairCatalogStats,
  StrategyCatalogBenchmark,
  StrategyConfig,
  TimeframeSeconds,
} from '../types/trading';
import {
  CATALOG_STRATEGY_PRESETS,
  catalogAllStrategies,
} from '../utils/indicators';
import {
  Check,
  Layers,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trophy,
  Zap,
} from 'lucide-react';

interface CatalogPageProps {
  assets: IQAsset[];
  candlesByAsset: Record<number, Candle[]>;
  catalogStats: PairCatalogStats[];
  config: StrategyConfig;
  onUpdateConfig: (patch: Partial<StrategyConfig>) => void;
  selectedBotAssetIds: number[];
  onToggleBotAsset: (assetId: number) => void;
  onSetSelectedBotAssetIds?: (ids: number[]) => void;
  onSelectPairForTerminal: (asset: IQAsset) => void;
  onApplyStrategyAndPair: (
    preset: {
      mhiVariant: MHIVariant;
      mhiMode: MHIMode;
      useEmaFilter: boolean;
      useRsiFilter: boolean;
      useBollingerFilter: boolean;
    },
    asset: IQAsset
  ) => void;
  onRefreshCatalog: () => void;
  lookbackHours: number;
  onChangeLookbackHours: (hours: number) => void;
}

export const CatalogPage: React.FC<CatalogPageProps> = ({
  assets,
  candlesByAsset,
  catalogStats,
  config,
  onUpdateConfig,
  selectedBotAssetIds,
  onToggleBotAsset,
  onSetSelectedBotAssetIds,
  onSelectPairForTerminal,
  onApplyStrategyAndPair,
  onRefreshCatalog,
  lookbackHours,
  onChangeLookbackHours,
}) => {
  const [catalogViewMode, setCatalogViewMode] = useState<'STRATEGIES_MATRIX' | 'PAIRS_DETAIL'>(
    'STRATEGIES_MATRIX'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [marketFilter, setMarketFilter] = useState<'ALL' | 'OPEN' | 'OTC'>('ALL');
  const [sortBy, setSortBy] = useState<'GALE1' | 'FIRST' | 'GALE2' | 'PAYOUT'>('GALE1');
  const [expandedAssetId, setExpandedAssetId] = useState<number | null>(null);
  const [galeReferenceView, setGaleReferenceView] = useState<'NO_GALE' | 'GALE_1' | 'GALE_2'>(
    'GALE_1'
  );

  // Calculate benchmarks across all 8 strategies x all pairs
  const allStrategyBenchmarks: StrategyCatalogBenchmark[] = useMemo(() => {
    return catalogAllStrategies(assets, candlesByAsset, config);
  }, [assets, candlesByAsset, config]);

  // Global Assertiveness Summary per Strategy across all pairs
  const strategyGlobalSummaries = useMemo(() => {
    return CATALOG_STRATEGY_PRESETS.map((preset) => {
      const items = allStrategyBenchmarks.filter((b) => b.strategyId === preset.id);
      const count = Math.max(1, items.length);
      const avgFirst = items.reduce((acc, i) => acc + i.winRateNoGale, 0) / count;
      const avgGale1 = items.reduce((acc, i) => acc + i.winRateGale1, 0) / count;
      const avgGale2 = items.reduce((acc, i) => acc + i.winRateGale2, 0) / count;
      const totalWins = items.reduce(
        (acc, i) => acc + i.winFirstCount + i.winGale1Count + i.winGale2Count,
        0
      );
      const totalLosses = items.reduce((acc, i) => acc + i.lossCount, 0);
      const bestItem = [...items].sort((a, b) => b.winRateGale1 - a.winRateGale1)[0] || null;

      return {
        preset,
        avgFirst,
        avgGale1,
        avgGale2,
        totalWins,
        totalLosses,
        bestItem,
      };
    }).sort((a, b) => b.avgGale1 - a.avgGale1);
  }, [allStrategyBenchmarks]);

  const filteredAndSorted = useMemo(() => {
    return catalogStats
      .filter((item) => {
        if (marketFilter === 'OPEN' && item.asset.isOtc) return false;
        if (marketFilter === 'OTC' && !item.asset.isOtc) return false;
        if (
          searchQuery.trim() &&
          !item.asset.ticker.toLowerCase().includes(searchQuery.trim().toLowerCase())
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'FIRST') return b.winRateNoGale - a.winRateNoGale;
        if (sortBy === 'GALE1') return b.winRateGale1 - a.winRateGale1;
        if (sortBy === 'GALE2') return b.winRateGale2 - a.winRateGale2;
        return b.asset.payout - a.asset.payout;
      });
  }, [catalogStats, marketFilter, searchQuery, sortBy]);

  const filteredAssetsForMatrix = useMemo(() => {
    return assets.filter((asset) => {
      if (marketFilter === 'OPEN' && asset.isOtc) return false;
      if (marketFilter === 'OTC' && !asset.isOtc) return false;
      if (
        searchQuery.trim() &&
        !asset.ticker.toLowerCase().includes(searchQuery.trim().toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [assets, marketFilter, searchQuery]);

  const topSummary = useMemo(() => {
    if (filteredAndSorted.length === 0) {
      return { avgFirst: 0, avgGale1: 0, avgGale2: 0, bestPair: null };
    }
    const sumFirst = filteredAndSorted.reduce((acc, s) => acc + s.winRateNoGale, 0);
    const sumG1 = filteredAndSorted.reduce((acc, s) => acc + s.winRateGale1, 0);
    const sumG2 = filteredAndSorted.reduce((acc, s) => acc + s.winRateGale2, 0);
    const n = filteredAndSorted.length;
    return {
      avgFirst: sumFirst / n,
      avgGale1: sumG1 / n,
      avgGale2: sumG2 / n,
      bestPair: filteredAndSorted[0],
    };
  }, [filteredAndSorted]);

  const handleSelectTop3 = () => {
    const top3 = filteredAndSorted.slice(0, 3).map((s) => s.asset.id);
    if (onSetSelectedBotAssetIds) {
      onSetSelectedBotAssetIds(top3);
    } else {
      top3.forEach((id) => {
        if (!selectedBotAssetIds.includes(id)) onToggleBotAsset(id);
      });
    }
  };

  const handleSelectTop1 = () => {
    if (filteredAndSorted.length === 0) return;
    const top1 = [filteredAndSorted[0].asset.id];
    if (onSetSelectedBotAssetIds) {
      onSetSelectedBotAssetIds(top1);
    } else {
      top1.forEach((id) => {
        if (!selectedBotAssetIds.includes(id)) onToggleBotAsset(id);
      });
    }
  };

  const handleSelectAllAboveThreshold = () => {
    const qualifying = filteredAndSorted
      .filter((s) => s.winRateGale1 >= (config.minCatalogWinRate || 85))
      .map((s) => s.asset.id);
    if (onSetSelectedBotAssetIds) {
      onSetSelectedBotAssetIds(qualifying);
    } else {
      qualifying.forEach((id) => {
        if (!selectedBotAssetIds.includes(id)) {
          onToggleBotAsset(id);
        }
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & View Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-display font-bold text-white">
            Catalogação de Pares & Assertividade das Estratégias
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Compare em tempo real a taxa de vitória de cada estratégia (MHI 1, MHI 2, MHI 3, Maioria, Minoria, EMA 9/21, RSI e Bollinger) em cada par de moedas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex p-1 bg-[#111827] border border-slate-800 rounded-lg">
            <button
              onClick={() => setCatalogViewMode('STRATEGIES_MATRIX')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                catalogViewMode === 'STRATEGIES_MATRIX'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Assertividade das Estratégias (Comparativo)
            </button>
            <button
              onClick={() => setCatalogViewMode('PAIRS_DETAIL')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                catalogViewMode === 'PAIRS_DETAIL'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Catalogação Detalhada por Quadrante
            </button>
          </div>

          <button
            onClick={handleSelectAllAboveThreshold}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            Sincronizar Pares ≥ {config.minCatalogWinRate}% no Robô
          </button>

          <button
            onClick={onRefreshCatalog}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#111827] hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Atualizar
          </button>
        </div>
      </div>

      {/* Global Filter Bar */}
      <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Strategy Variant */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">
              Estratégia Base Ativa no Robô
            </label>
            <div className="grid grid-cols-3 gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg">
              {(['MHI_1', 'MHI_2', 'MHI_3'] as MHIVariant[]).map((variant) => (
                <button
                  key={variant}
                  onClick={() => onUpdateConfig({ mhiVariant: variant })}
                  className={`py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                    config.mhiVariant === variant
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {variant.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* MHI Mode: Minoria vs Maioria */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">
              Padrão Probabilístico Ativo
            </label>
            <div className="grid grid-cols-2 gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg">
              {(['MINORIA', 'MAIORIA'] as MHIMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => onUpdateConfig({ mhiMode: mode })}
                  className={`py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                    config.mhiMode === mode
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  MHI {mode === 'MINORIA' ? 'Minoria' : 'Maioria'}
                </button>
              ))}
            </div>
          </div>

          {/* Timeframe & Lookback */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">
              Timeframe & Período Catalogado
            </label>
            <div className="flex items-center gap-2">
              <div className="grid grid-cols-2 gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg flex-1">
                {([60, 300] as TimeframeSeconds[]).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => onUpdateConfig({ timeframe: tf })}
                    className={`py-1.5 text-xs font-mono font-medium rounded transition-colors cursor-pointer ${
                      config.timeframe === tf
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    M{tf / 60}
                  </button>
                ))}
              </div>

              <select
                value={lookbackHours}
                onChange={(e) => onChangeLookbackHours(Number(e.target.value))}
                className="bg-[#0B0F17] border border-slate-800 rounded-lg px-2.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
              >
                <option value={2}>Últimas 2h</option>
                <option value={3}>Últimas 3h</option>
                <option value={4}>Últimas 4h</option>
                <option value={6}>Últimas 6h</option>
              </select>
            </div>
          </div>

          {/* Reference Criterion in Matrix */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">
              Critério de Assertividade Exibido
            </label>
            <div className="grid grid-cols-3 gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg">
              {(
                [
                  { id: 'NO_GALE', label: 'Win 1ª' },
                  { id: 'GALE_1', label: 'Até Gale 1' },
                  { id: 'GALE_2', label: 'Até Gale 2' },
                ] as const
              ).map((crit) => (
                <button
                  key={crit.id}
                  onClick={() => setGaleReferenceView(crit.id)}
                  className={`py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                    galeReferenceView === crit.id
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {crit.label}
                </button>
              ))}
            </div>
          </div>

          {/* Search & Market Filter */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">
              Filtrar Par / Mercado
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ex: EUR/USD"
                  className="w-full pl-8 pr-2 py-1.5 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <select
                value={marketFilter}
                onChange={(e) => setMarketFilter(e.target.value as 'ALL' | 'OPEN' | 'OTC')}
                className="bg-[#0B0F17] border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">Todos</option>
                <option value="OPEN">Aberto</option>
                <option value="OTC">OTC</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {catalogViewMode === 'STRATEGIES_MATRIX' ? (
        <div className="space-y-6">
          {/* Section 1: Global Assertiveness Ranking of All 8 Strategies */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-display font-bold text-white">
                  Ranking Geral de Assertividade por Estratégia (Média em Todos os Pares)
                </h2>
              </div>
              <span className="text-xs text-slate-400">
                Clique em qualquer estratégia para ativá-la no Robô Operador
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {strategyGlobalSummaries.map((item, idx) => {
                const isCurrentActive =
                  config.mhiVariant === item.preset.mhiVariant &&
                  config.mhiMode === item.preset.mhiMode &&
                  config.useEmaFilter === item.preset.useEmaFilter &&
                  config.useRsiFilter === item.preset.useRsiFilter;

                return (
                  <div
                    key={item.preset.id}
                    className={`p-4 rounded-lg border transition-colors flex flex-col justify-between ${
                      isCurrentActive
                        ? 'bg-blue-950/25 border-blue-500'
                        : 'bg-[#111827] border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="font-mono">#{idx + 1} ESTRATÉGIA</span>
                        <span className="font-mono text-emerald-400 font-semibold">
                          {item.totalWins}W / {item.totalLosses}L
                        </span>
                      </div>
                      <div className="mt-1 font-display font-bold text-sm text-white">
                        {item.preset.name}
                      </div>

                      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-800/80 font-mono tabular-nums text-center">
                        <div>
                          <div className="text-[10px] text-slate-400">Win 1ª</div>
                          <div className="text-xs font-bold text-slate-200">
                            {item.avgFirst.toFixed(1)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400">Até Gale 1</div>
                          <div className="text-sm font-bold text-emerald-400">
                            {item.avgGale1.toFixed(1)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400">Até Gale 2</div>
                          <div className="text-xs font-bold text-blue-400">
                            {item.avgGale2.toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-400 truncate">
                        Melhor Par:{' '}
                        <strong className="text-white">
                          {item.bestItem?.asset.ticker} (
                          {item.bestItem?.winRateGale1.toFixed(0)}%)
                        </strong>
                      </span>

                      <button
                        onClick={() => {
                          if (item.bestItem) {
                            onApplyStrategyAndPair(item.preset, item.bestItem.asset);
                          } else {
                            onUpdateConfig({
                              mhiVariant: item.preset.mhiVariant,
                              mhiMode: item.preset.mhiMode,
                              useEmaFilter: item.preset.useEmaFilter,
                              requireEmaAlignment: item.preset.useEmaFilter,
                              useRsiFilter: item.preset.useRsiFilter,
                              useBollingerFilter: item.preset.useBollingerFilter,
                            });
                          }
                        }}
                        className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                          isCurrentActive
                            ? 'bg-emerald-600 text-white'
                            : 'bg-blue-600 hover:bg-blue-500 text-white'
                        }`}
                      >
                        {isCurrentActive ? 'Ativa' : 'Usar'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Side-by-Side Matrix (Currency Pair x All Strategies Assertiveness) */}
          <div className="bg-[#111827] border border-slate-800 rounded-lg overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <Layers className="w-4 h-4 text-blue-400" />
                <span>
                  Matriz Comparativa de Assertividade por Par x Estratégia (
                  {galeReferenceView === 'NO_GALE'
                    ? 'Taxa de Vitória de 1ª Entrada'
                    : galeReferenceView === 'GALE_1'
                    ? 'Taxa de Vitória Até Gale 1'
                    : 'Taxa de Vitória Até Gale 2'}
                  )
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                Clique em qualquer célula de porcentagem para ativar o Par + Estratégia correspondente
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-[#0B0F17]/70 text-[11px] text-slate-400">
                    <th className="py-2.5 px-4">Par de Moedas</th>
                    <th className="py-2.5 px-2 text-right">MHI 1 Minoria</th>
                    <th className="py-2.5 px-2 text-right">MHI 2 Minoria</th>
                    <th className="py-2.5 px-2 text-right">MHI 3 Minoria</th>
                    <th className="py-2.5 px-2 text-right">MHI 1 Maioria</th>
                    <th className="py-2.5 px-2 text-right">MHI 2 Maioria</th>
                    <th className="py-2.5 px-2 text-right">MHI 1 + EMA 9/21</th>
                    <th className="py-2.5 px-2 text-right">MHI + EMA + RSI + BB</th>
                    <th className="py-2.5 px-4 text-right">Melhor Estratégia no Par</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
                  {filteredAssetsForMatrix.map((asset) => {
                    const pairBenchmarks = allStrategyBenchmarks.filter(
                      (b) => b.asset.id === asset.id
                    );
                    const getRate = (bm?: StrategyCatalogBenchmark) => {
                      if (!bm) return 0;
                      if (galeReferenceView === 'NO_GALE') return bm.winRateNoGale;
                      if (galeReferenceView === 'GALE_1') return bm.winRateGale1;
                      return bm.winRateGale2;
                    };

                    const bestForPair = [...pairBenchmarks].sort(
                      (a, b) => getRate(b) - getRate(a)
                    )[0];

                    const columnIds = [
                      'MHI1_MIN',
                      'MHI2_MIN',
                      'MHI3_MIN',
                      'MHI1_MAI',
                      'MHI2_MAI',
                      'MHI1_EMA',
                      'MHI_CONFLUENCE_FULL',
                    ];

                    return (
                      <tr key={asset.id} className="h-11 hover:bg-slate-800/35">
                        <td className="py-2 px-4 font-sans font-semibold text-white whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span>{asset.ticker}</span>
                            <span className="text-[10px] font-mono text-slate-400">
                              {asset.payout}%
                            </span>
                          </div>
                        </td>

                        {columnIds.map((colId) => {
                          const bm = pairBenchmarks.find((b) => b.strategyId === colId);
                          const rate = getRate(bm);
                          const isBest = bestForPair && bestForPair.strategyId === colId;

                          return (
                            <td key={colId} className="py-2 px-2 text-right">
                              {bm && (
                                <button
                                  onClick={() =>
                                    onApplyStrategyAndPair(
                                      {
                                        mhiVariant: bm.mhiVariant,
                                        mhiMode: bm.mhiMode,
                                        useEmaFilter: bm.useEmaFilter,
                                        useRsiFilter: bm.useRsiFilter,
                                        useBollingerFilter: bm.useBollingerFilter,
                                      },
                                      asset
                                    )
                                  }
                                  title={`Ativar ${bm.strategyName} em ${asset.ticker} (${bm.winFirstCount}W / ${bm.winGale1Count}G1 / ${bm.lossCount}L)`}
                                  className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                                    isBest
                                      ? 'bg-emerald-950/60 border border-emerald-600/70 text-emerald-300 font-bold'
                                      : rate >= 85
                                      ? 'text-emerald-400 hover:bg-slate-800 font-semibold'
                                      : rate >= 72
                                      ? 'text-blue-400 hover:bg-slate-800'
                                      : 'text-slate-400 hover:bg-slate-800'
                                  }`}
                                >
                                  {rate.toFixed(1)}%
                                </button>
                              )}
                            </td>
                          );
                        })}

                        <td className="py-2 px-4 text-right whitespace-nowrap font-sans">
                          {bestForPair ? (
                            <button
                              onClick={() =>
                                onApplyStrategyAndPair(
                                  {
                                    mhiVariant: bestForPair.mhiVariant,
                                    mhiMode: bestForPair.mhiMode,
                                    useEmaFilter: bestForPair.useEmaFilter,
                                    useRsiFilter: bestForPair.useRsiFilter,
                                    useBollingerFilter: bestForPair.useBollingerFilter,
                                  },
                                  asset
                                )
                              }
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium transition-colors cursor-pointer"
                            >
                              <Zap className="w-3 h-3" />
                              <span>{bestForPair.strategyName.split('—')[0]}</span>
                              <span className="font-mono font-bold">
                                ({getRate(bestForPair).toFixed(0)}%)
                              </span>
                            </button>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Detailed Pair-by-Pair Quadrant View */
        <div className="space-y-6">
          {/* 4-Column Quantitative Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
              <div className="text-xs text-slate-400">Par Mais Assertivo (Ranking #1)</div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-lg font-display font-bold text-white">
                  {topSummary.bestPair ? topSummary.bestPair.asset.ticker : '—'}
                </span>
                <span className="font-mono tabular-nums text-base font-bold text-emerald-400">
                  {topSummary.bestPair
                    ? `${topSummary.bestPair.winRateGale1.toFixed(1)}% (G1)`
                    : '—'}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Win de 1ª:{' '}
                {topSummary.bestPair
                  ? `${topSummary.bestPair.winRateNoGale.toFixed(1)}%`
                  : '0%'}{' '}
                · Payout {topSummary.bestPair?.asset.payout ?? 0}%
              </div>
            </div>

            <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
              <div className="text-xs text-slate-400">Média Win de 1ª (Sem Gale)</div>
              <div className="mt-1 font-mono tabular-nums text-xl font-bold text-white">
                {topSummary.avgFirst.toFixed(1)}%
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Média geral entre {filteredAndSorted.length} pares analisados
              </div>
            </div>

            <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
              <div className="text-xs text-slate-400">Assertividade Média Até Gale 1</div>
              <div className="mt-1 font-mono tabular-nums text-xl font-bold text-emerald-400">
                {topSummary.avgGale1.toFixed(1)}%
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Recuperação estatística no 1º Martingale
              </div>
            </div>

            <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
              <div className="text-xs text-slate-400">Assertividade Média Até Gale 2</div>
              <div className="mt-1 font-mono tabular-nums text-xl font-bold text-blue-400">
                {topSummary.avgGale2.toFixed(1)}%
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Pares ativos no Robô: {selectedBotAssetIds.length} selecionados
              </div>
            </div>
          </div>

          {/* Informative Security & Smart Selection Card */}
          <div className="bg-[#111827] border border-blue-500/30 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-white block">
                  Proteção Anti-Sobreposição & Escolha Automática do Melhor Par
                </span>
                <p className="text-slate-400 text-[11px] mt-0.5 leading-relaxed">
                  <strong>Não opera sinal em cima de outro:</strong> O robô bloqueia novas entradas enquanto houver operação em andamento ou Martingale aberto. Se múltiplos pares derem sinal no mesmo minuto, ele analisa o ranking e opera <strong>apenas no melhor par</strong>.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleSelectTop1}
                className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-[11px] transition-all cursor-pointer active:scale-95 flex items-center gap-1 shadow-sm"
                title="Seleciona apenas o melhor par absoluto no robô"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                Auto Top 1 (Campeão)
              </button>
              <button
                type="button"
                onClick={handleSelectTop3}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] transition-all cursor-pointer active:scale-95 flex items-center gap-1 shadow-sm"
                title="Seleciona automaticamente os 3 melhores pares no robô"
              >
                <Sparkles className="w-3.5 h-3.5 text-white" />
                Auto Top 3 Pares
              </button>
              <button
                type="button"
                onClick={handleSelectAllAboveThreshold}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-[11px] border border-slate-700 transition-all cursor-pointer active:scale-95"
                title="Seleciona todos os pares com assertividade Gale 1 ≥ 85%"
              >
                Todos ≥ 85%
              </button>
            </div>
          </div>

          {/* High-Density Cataloging Table */}
          <div className="bg-[#111827] border border-slate-800 rounded-lg overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
                <span>
                  Detalhamento de Quadrantes ({config.mhiVariant.replace('_', ' ')} ·{' '}
                  {config.mhiMode} · M{config.timeframe / 60})
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">Ordenar por:</span>
                {(
                  [
                    { id: 'GALE1', label: 'Assertividade Gale 1' },
                    { id: 'FIRST', label: 'Win de 1ª' },
                    { id: 'GALE2', label: 'Assertividade Gale 2' },
                    { id: 'PAYOUT', label: 'Maior Payout' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setSortBy(opt.id)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                      sortBy === opt.id
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-[#0B0F17]/60 text-[11px] font-medium text-slate-400">
                    <th className="py-2.5 px-4"># Par de Moedas</th>
                    <th className="py-2.5 px-3 text-right">Payout</th>
                    <th className="py-2.5 px-3 text-right">Quadrantes</th>
                    <th className="py-2.5 px-3 text-right">Win 1ª (SG)</th>
                    <th className="py-2.5 px-3 text-right">Até Gale 1</th>
                    <th className="py-2.5 px-3 text-right">Até Gale 2</th>
                    <th className="py-2.5 px-3 text-right">
                      Placar (1ª / G1 / G2 / Hit)
                    </th>
                    <th className="py-2.5 px-3">Tendência EMA 9/21</th>
                    <th className="py-2.5 px-3">Últimos Quadrantes</th>
                    <th className="py-2.5 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-xs">
                  {filteredAndSorted.map((row, index) => {
                    const isBotActive = selectedBotAssetIds.includes(row.asset.id);
                    const isExpanded = expandedAssetId === row.asset.id;

                    return (
                      <React.Fragment key={row.asset.id}>
                        <tr
                          className={`h-11 hover:bg-slate-800/40 transition-colors ${
                            isBotActive ? 'bg-blue-950/15' : ''
                          }`}
                        >
                          <td className="py-2 px-4 font-medium text-white whitespace-nowrap">
                            <div className="flex items-center gap-2.5">
                              <span className="font-mono tabular-nums text-slate-500 w-5">
                                {String(index + 1).padStart(2, '0')}.
                              </span>
                              <button
                                onClick={() =>
                                  setExpandedAssetId(
                                    isExpanded ? null : row.asset.id
                                  )
                                }
                                className="font-display font-semibold text-white hover:text-blue-400 transition-colors cursor-pointer"
                              >
                                {row.asset.ticker}
                              </button>
                              <span className="text-[11px] text-slate-500">
                                · {row.asset.category.toUpperCase()}
                              </span>
                            </div>
                          </td>

                          <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-200">
                            {row.asset.payout}%
                          </td>

                          <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-300">
                            {row.validSignalsCount}/{row.totalAnalyzedQuadrants}
                          </td>

                          <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold">
                            <span
                              className={
                                row.winRateNoGale >= 65
                                  ? 'text-emerald-400'
                                  : row.winRateNoGale >= 52
                                  ? 'text-amber-300'
                                  : 'text-slate-300'
                              }
                            >
                              {row.winRateNoGale.toFixed(1)}%
                            </span>
                          </td>

                          <td className="py-2 px-3 text-right font-mono tabular-nums font-bold">
                            <span
                              className={
                                row.winRateGale1 >= 85
                                  ? 'text-emerald-400'
                                  : row.winRateGale1 >= 75
                                  ? 'text-blue-400'
                                  : 'text-amber-400'
                              }
                            >
                              {row.winRateGale1.toFixed(1)}%
                            </span>
                          </td>

                          <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-slate-200">
                            {row.winRateGale2.toFixed(1)}%
                          </td>

                          <td className="py-2 px-3 text-right font-mono tabular-nums text-[11px]">
                            <span className="text-emerald-400">
                              {row.winFirstCount}W
                            </span>
                            <span className="text-slate-600"> / </span>
                            <span className="text-cyan-400">
                              {row.winGale1Count}G1
                            </span>
                            <span className="text-slate-600"> / </span>
                            <span className="text-amber-400">
                              {row.winGale2Count}G2
                            </span>
                            <span className="text-slate-600"> / </span>
                            <span className="text-red-400">{row.lossCount}L</span>
                          </td>

                          <td className="py-2 px-3 whitespace-nowrap text-[11px]">
                            <span
                              className={
                                row.currentTrend === 'BULLISH'
                                  ? 'text-emerald-400 font-medium'
                                  : row.currentTrend === 'BEARISH'
                                  ? 'text-red-400 font-medium'
                                  : 'text-slate-400'
                              }
                            >
                              {row.currentTrend === 'BULLISH'
                                ? 'Alta (EMA 9 > 21)'
                                : row.currentTrend === 'BEARISH'
                                ? 'Baixa (EMA 9 < 21)'
                                : 'Lateral'}
                            </span>
                          </td>

                          <td className="py-2 px-3">
                            <div className="flex items-center gap-1 font-mono text-[10px]">
                              {row.recentQuadrants.slice(0, 8).map((q) => {
                                const label =
                                  q.outcome === 'WIN_1ST'
                                    ? '1ª'
                                    : q.outcome === 'WIN_G1'
                                    ? 'G1'
                                    : q.outcome === 'WIN_G2'
                                    ? 'G2'
                                    : q.outcome === 'LOSS'
                                    ? 'HIT'
                                    : '—';
                                const colorCls =
                                  q.outcome === 'WIN_1ST'
                                    ? 'text-emerald-400 border-emerald-800/80 bg-emerald-950/40'
                                    : q.outcome === 'WIN_G1'
                                    ? 'text-cyan-300 border-cyan-800/80 bg-cyan-950/40'
                                    : q.outcome === 'WIN_G2'
                                    ? 'text-amber-300 border-amber-800/80 bg-amber-950/40'
                                    : q.outcome === 'LOSS'
                                    ? 'text-red-400 border-red-800/80 bg-red-950/50'
                                    : 'text-slate-500 border-slate-800 bg-slate-900';

                                return (
                                  <span
                                    key={q.timestamp}
                                    title={`${q.formattedTime} - ${q.direction} (${label})`}
                                    className={`px-1.5 py-0.5 rounded border ${colorCls}`}
                                  >
                                    {label}
                                  </span>
                                );
                              })}
                            </div>
                          </td>

                          <td className="py-2 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-2">
                              <button
                                onClick={() => onToggleBotAsset(row.asset.id)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                                  isBotActive
                                    ? 'bg-emerald-600/20 border border-emerald-500/60 text-emerald-300'
                                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                                }`}
                              >
                                {isBotActive && <Check className="w-3 h-3" />}
                                {isBotActive ? 'No Robô' : '+ Robô'}
                              </button>

                              <button
                                onClick={() => onSelectPairForTerminal(row.asset)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium transition-colors cursor-pointer"
                              >
                                <Play className="w-3 h-3" />
                                Gráfico
                              </button>
                            </div>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-[#0B0F17]/90 border-b border-slate-800">
                            <td colSpan={10} className="p-4">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-semibold text-white">
                                  Histórico Detalhado de Quadrantes —{' '}
                                  {row.asset.ticker}
                                </span>
                                <span className="text-[11px] text-slate-400 font-mono">
                                  Dojis Ignorados: {row.dojiSkippedCount} · Filtrados
                                  por EMA/RSI: {row.filteredByIndicatorsCount}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-9 gap-2">
                                {row.recentQuadrants.map((q) => (
                                  <div
                                    key={q.timestamp}
                                    className="p-2 rounded border border-slate-800 bg-[#111827] text-[11px] font-mono tabular-nums"
                                  >
                                    <div className="flex items-center justify-between text-slate-400">
                                      <span>{q.formattedTime}</span>
                                      <span
                                        className={
                                          q.direction === 'CALL'
                                            ? 'text-emerald-400 font-bold'
                                            : q.direction === 'PUT'
                                            ? 'text-red-400 font-bold'
                                            : 'text-slate-500'
                                        }
                                      >
                                        {q.direction}
                                      </span>
                                    </div>
                                    <div className="mt-1 font-semibold text-white">
                                      {q.outcome === 'WIN_1ST'
                                        ? 'WIN 1ª Entrada'
                                        : q.outcome === 'WIN_G1'
                                        ? 'WIN Gale 1'
                                        : q.outcome === 'WIN_G2'
                                        ? 'WIN Gale 2'
                                        : q.outcome === 'LOSS'
                                        ? 'LOSS (Hit)'
                                        : q.outcome === 'FILTERED_OUT'
                                        ? 'Filtrado (EMA)'
                                        : 'Doji Ignorado'}
                                    </div>
                                    <div className="text-[10px] text-slate-500 mt-0.5">
                                      RSI: {q.rsiValue.toFixed(0)} ·{' '}
                                      {q.emaAligned ? 'A favor EMA' : 'Contra EMA'}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
