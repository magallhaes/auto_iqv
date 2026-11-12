import React, { useMemo, useState } from 'react';
import {
  AccountType,
  IQConnectionStatus,
  ManagementMode,
  RiskConfig,
  RiskSessionState,
} from '../types/trading';
import {
  Calculator,
  CheckCircle2,
  Clock,
  DollarSign,
  Lock,
  Percent,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Target,
  TrendingUp,
  Wallet,
  Zap,
} from 'lucide-react';

interface RiskManagementPageProps {
  riskConfig: RiskConfig;
  riskState: RiskSessionState;
  connectionStatus: IQConnectionStatus;
  onUpdateRiskConfig: (patch: Partial<RiskConfig>) => void;
  onResetSessionState: () => void;
  onSwitchAccount: (type: AccountType) => void;
  onRefillDemoBalance: () => void;
}

export const RiskManagementPage: React.FC<RiskManagementPageProps> = ({
  riskConfig,
  riskState,
  connectionStatus,
  onUpdateRiskConfig,
  onResetSessionState,
  onSwitchAccount,
  onRefillDemoBalance,
}) => {
  const [savedBanner, setSavedBanner] = useState(false);
  const avgPayout = 0.89;

  const activeBalance =
    connectionStatus.activeBalanceType === 'REAL'
      ? connectionStatus.realBalance
      : connectionStatus.practiceBalance;

  const gale1Amount = Number(
    (riskConfig.baseEntryAmount * riskConfig.galeMultiplier).toFixed(2)
  );
  const gale2Amount = Number(
    (
      riskConfig.baseEntryAmount *
      Math.pow(riskConfig.galeMultiplier, 2)
    ).toFixed(2)
  );

  const applyPercentagePreset = (
    field: 'baseEntryAmount' | 'stopWin' | 'stopLoss',
    pct: number
  ) => {
    const calculated = Math.max(2, Math.round((activeBalance * pct) / 100));
    onUpdateRiskConfig({ [field]: calculated });
  };

  // Calculate projection table for Martingale / Soros / SorosGale
  const projectionRows = useMemo(() => {
    const base = riskConfig.baseEntryAmount;
    const mult = riskConfig.galeMultiplier;
    const rows: {
      stepLabel: string;
      stake: number;
      grossReturn: number;
      netCycleProfit: number;
      cumulativeRisk: number;
    }[] = [];

    if (riskConfig.managementMode === 'FIXED') {
      for (let i = 1; i <= 4; i++) {
        rows.push({
          stepLabel: `Operação #${i} (Mão Fixa Sem Gale)`,
          stake: base,
          grossReturn: base + base * avgPayout,
          netCycleProfit: base * avgPayout,
          cumulativeRisk: base,
        });
      }
    } else if (riskConfig.managementMode === 'MARTINGALE') {
      let cumulativeCost = 0;
      for (let g = 0; g <= riskConfig.maxGales; g++) {
        const stake = Number((base * Math.pow(mult, g)).toFixed(2));
        cumulativeCost += stake;
        const netProfit = stake * avgPayout - (cumulativeCost - stake);
        rows.push({
          stepLabel:
            g === 0 ? '1ª Entrada (Ordem Inicial)' : `Martingale Nível ${g} (Gale ${g})`,
          stake,
          grossReturn: Number((stake + stake * avgPayout).toFixed(2)),
          netCycleProfit: Number(netProfit.toFixed(2)),
          cumulativeRisk: Number(cumulativeCost.toFixed(2)),
        });
      }
    } else if (riskConfig.managementMode === 'SOROS') {
      let currentStake = base;
      let accProfit = 0;
      for (let lvl = 1; lvl <= riskConfig.sorosLevels; lvl++) {
        const winProfit = currentStake * avgPayout;
        accProfit += winProfit;
        rows.push({
          stepLabel: `Soros Nível ${lvl} ${
            lvl === 1 ? '(Entrada Base)' : '(Juros Compostos)'
          }`,
          stake: Number(currentStake.toFixed(2)),
          grossReturn: Number((currentStake + winProfit).toFixed(2)),
          netCycleProfit: Number(accProfit.toFixed(2)),
          cumulativeRisk: base,
        });
        currentStake =
          currentStake +
          winProfit * (riskConfig.sorosPayoutReinvestPercent / 100);
      }
    } else {
      // SOROSGALE
      let stepBase = base;
      for (let c = 1; c <= 3; c++) {
        const g1Stake = Number((stepBase * mult).toFixed(2));
        rows.push({
          stepLabel: `Ciclo SorosGale #${c} — 1ª Entrada`,
          stake: Number(stepBase.toFixed(2)),
          grossReturn: Number((stepBase * (1 + avgPayout)).toFixed(2)),
          netCycleProfit: Number((stepBase * avgPayout).toFixed(2)),
          cumulativeRisk: Number(stepBase.toFixed(2)),
        });
        rows.push({
          stepLabel: `Ciclo SorosGale #${c} — Recuperação Gale + Soros`,
          stake: g1Stake,
          grossReturn: Number((g1Stake * (1 + avgPayout)).toFixed(2)),
          netCycleProfit: Number((g1Stake * avgPayout - stepBase).toFixed(2)),
          cumulativeRisk: Number((stepBase + g1Stake).toFixed(2)),
        });
        stepBase = Number((stepBase * 1.45).toFixed(2));
      }
    }

    return rows;
  }, [riskConfig]);

  const stopWinProgress = Math.min(
    100,
    Math.max(0, ( Math.max(0, riskState.sessionProfit) / Math.max(1, riskConfig.stopWin)) * 100)
  );
  const stopLossProgress = Math.min(
    100,
    Math.max(
      0,
      (Math.abs(Math.min(0, riskState.sessionProfit)) /
        Math.max(1, riskConfig.stopLoss)) *
        100
    )
  );

  return (
    <div className="space-y-6">
      {/* Page Title & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-display font-bold text-white">
            Configuração de Stop Win, Stop Loss e Valores de Entrada
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Defina o valor exato das entradas (1ª Mão, Gale 1, Gale 2, Soros) e os limites financeiros de Stop Win e Stop Loss da sessão.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start">
          <button
            onClick={onResetSessionState}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#111827] hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Zerar Placar da Sessão
          </button>

          <button
            onClick={() => {
              setSavedBanner(true);
              setTimeout(() => setSavedBanner(false), 3000);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {savedBanner ? 'Configurações Aplicadas!' : 'Salvar e Aplicar no Robô'}
          </button>
        </div>
      </div>

      {/* 3 Dedicated Cards: Valor de Entrada, Stop Win, Stop Loss */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Card 1: Valor de Entrada Base */}
        <div className="bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-display font-bold text-white">
                1. Valor da Entrada Inicial
              </h2>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              {((riskConfig.baseEntryAmount / Math.max(1, activeBalance)) * 100).toFixed(2)}% da banca
            </span>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">
              Valor da 1ª Entrada (R$)
            </label>
            <input
              type="number"
              min={2}
              step={1}
              value={riskConfig.baseEntryAmount}
              onChange={(e) =>
                onUpdateRiskConfig({
                  baseEntryAmount: Math.max(2, Number(e.target.value)),
                })
              }
              className="w-full px-3.5 py-2.5 bg-[#0B0F17] border border-slate-700 rounded-lg text-lg font-mono tabular-nums font-bold text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <div className="text-[11px] text-slate-400 mb-1.5">
              Atalhos Rápidos de Valor de Entrada:
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[5, 10, 20, 50, 100, 200].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => onUpdateRiskConfig({ baseEntryAmount: val })}
                  className={`py-1.5 rounded border text-xs font-mono transition-colors cursor-pointer ${
                    riskConfig.baseEntryAmount === val
                      ? 'bg-blue-600 border-blue-500 text-white font-bold'
                      : 'bg-[#0B0F17] border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  R$ {val}
                </button>
              ))}
              <button
                type="button"
                onClick={() => applyPercentagePreset('baseEntryAmount', 1)}
                className="py-1.5 rounded border bg-[#0B0F17] border-slate-800 text-xs font-mono text-cyan-400 hover:border-cyan-500 cursor-pointer"
              >
                1% Banca
              </button>
              <button
                type="button"
                onClick={() => applyPercentagePreset('baseEntryAmount', 2)}
                className="py-1.5 rounded border bg-[#0B0F17] border-slate-800 text-xs font-mono text-cyan-400 hover:border-cyan-500 cursor-pointer"
              >
                2% Banca
              </button>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-[#0B0F17] border border-slate-800/90 text-xs font-mono tabular-nums space-y-1">
            <div className="flex justify-between text-slate-300">
              <span>1ª Entrada:</span>
              <strong className="text-white">
                R$ {riskConfig.baseEntryAmount.toFixed(2)}
              </strong>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Valor no Gale 1 ({riskConfig.galeMultiplier}x):</span>
              <strong className="text-amber-400">
                {riskConfig.maxGales >= 1 ? `R$ ${gale1Amount.toFixed(2)}` : 'Desativado'}
              </strong>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Valor no Gale 2 ({riskConfig.galeMultiplier}x):</span>
              <strong className="text-amber-400">
                {riskConfig.maxGales >= 2 ? `R$ ${gale2Amount.toFixed(2)}` : 'Desativado'}
              </strong>
            </div>
          </div>
        </div>

        {/* Card 2: Meta de Stop Win */}
        <div className="bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-display font-bold text-white">
                2. Meta de Stop Win (Lucro)
              </h2>
            </div>
            <span className="text-[11px] font-mono text-emerald-400">
              +{((riskConfig.stopWin / Math.max(1, activeBalance)) * 100).toFixed(1)}% da banca
            </span>
          </div>

          <div>
            <label className="block text-xs text-emerald-400 mb-1.5">
              Parar Robô ao Atingir Lucro de (R$)
            </label>
            <input
              type="number"
              min={5}
              step={5}
              value={riskConfig.stopWin}
              onChange={(e) =>
                onUpdateRiskConfig({
                  stopWin: Math.max(5, Number(e.target.value)),
                })
              }
              className="w-full px-3.5 py-2.5 bg-[#0B0F17] border border-emerald-800/80 rounded-lg text-lg font-mono tabular-nums font-bold text-emerald-400 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <div className="text-[11px] text-slate-400 mb-1.5">
              Metas Rápidas de Stop Win:
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[50, 100, 200, 500].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => onUpdateRiskConfig({ stopWin: val })}
                  className={`py-1.5 rounded border text-xs font-mono transition-colors cursor-pointer ${
                    riskConfig.stopWin === val
                      ? 'bg-emerald-600 border-emerald-500 text-white font-bold'
                      : 'bg-[#0B0F17] border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  R$ {val}
                </button>
              ))}
              {[5, 10, 15, 20].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => applyPercentagePreset('stopWin', pct)}
                  className="py-1.5 rounded border bg-[#0B0F17] border-slate-800 text-xs font-mono text-emerald-400 hover:border-emerald-500 cursor-pointer"
                >
                  +{pct}% Banca
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-[#0B0F17] border border-slate-800/90 space-y-2">
            <div className="flex justify-between text-xs font-mono tabular-nums">
              <span className="text-slate-400">Progresso da Meta:</span>
              <span className="text-emerald-400 font-bold">
                R$ {Math.max(0, riskState.sessionProfit).toFixed(2)} / R${' '}
                {riskConfig.stopWin.toFixed(2)} ({stopWinProgress.toFixed(0)}%)
              </span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${stopWinProgress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Card 3: Limite de Stop Loss */}
        <div className="bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-400" />
              <h2 className="text-sm font-display font-bold text-white">
                3. Limite de Stop Loss (Proteção)
              </h2>
            </div>
            <span className="text-[11px] font-mono text-red-400">
              -{((riskConfig.stopLoss / Math.max(1, activeBalance)) * 100).toFixed(1)}% da banca
            </span>
          </div>

          <div>
            <label className="block text-xs text-red-400 mb-1.5">
              Travar Robô se Perda Atingir (R$)
            </label>
            <input
              type="number"
              min={5}
              step={5}
              value={riskConfig.stopLoss}
              onChange={(e) =>
                onUpdateRiskConfig({
                  stopLoss: Math.max(5, Number(e.target.value)),
                })
              }
              className="w-full px-3.5 py-2.5 bg-[#0B0F17] border border-red-800/80 rounded-lg text-lg font-mono tabular-nums font-bold text-red-400 focus:outline-none focus:border-red-500"
            />
          </div>

          <div>
            <div className="text-[11px] text-slate-400 mb-1.5">
              Limites Rápidos de Stop Loss:
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[30, 60, 120, 250].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => onUpdateRiskConfig({ stopLoss: val })}
                  className={`py-1.5 rounded border text-xs font-mono transition-colors cursor-pointer ${
                    riskConfig.stopLoss === val
                      ? 'bg-red-600 border-red-500 text-white font-bold'
                      : 'bg-[#0B0F17] border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  R$ {val}
                </button>
              ))}
              {[3, 5, 10, 15].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => applyPercentagePreset('stopLoss', pct)}
                  className="py-1.5 rounded border bg-[#0B0F17] border-slate-800 text-xs font-mono text-red-400 hover:border-red-500 cursor-pointer"
                >
                  -{pct}% Banca
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-[#0B0F17] border border-slate-800/90 space-y-2">
            <div className="flex justify-between text-xs font-mono tabular-nums">
              <span className="text-slate-400">Margem de Segurança Usada:</span>
              <span className="text-red-400 font-bold">
                R$ {Math.abs(Math.min(0, riskState.sessionProfit)).toFixed(2)} / R${' '}
                {riskConfig.stopLoss.toFixed(2)} ({stopLossProgress.toFixed(0)}%)
              </span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-500 transition-all"
                style={{ width: `${stopLossProgress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Seção Pro: Proteções Inteligentes do Robô */}
      <div className="bg-[#111827] border border-blue-900/40 rounded-lg p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-display font-bold text-white flex items-center gap-2">
                Proteções Inteligentes de Banca (Trailing Stop & Travas de Ciclo)
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                  PRO ENGINE
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Evita devoluções de lucro ao mercado e blinda a banca em sequências atípicas
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Trailing Stop Win */}
          <div className="bg-[#0B0F17] border border-slate-800/90 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" /> Trailing Stop Win
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdateRiskConfig({
                    trailingStopWinEnabled: !riskConfig.trailingStopWinEnabled,
                  })
                }
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                  riskConfig.trailingStopWinEnabled ? 'bg-emerald-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    riskConfig.trailingStopWinEnabled ? 'translate-x-4.5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <p className="text-[11px] text-slate-400 leading-tight">
              Trava o lucro assim que alcançar{' '}
              <strong className="text-emerald-300">
                {riskConfig.trailingStopWinActivationPercent || 60}%
              </strong>{' '}
              do Stop Win (+R${' '}
              {(
                riskConfig.stopWin *
                ((riskConfig.trailingStopWinActivationPercent || 60) / 100)
              ).toFixed(2)}
              ). Se o lucro recuar{' '}
              <strong className="text-red-300">
                {riskConfig.trailingStopWinGivebackPercent || 25}%
              </strong>{' '}
              do topo, o robô encerra garantindo lucro!
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Ativação (% Meta)</label>
                <input
                  type="number"
                  min={30}
                  max={95}
                  value={riskConfig.trailingStopWinActivationPercent ?? 60}
                  onChange={(e) =>
                    onUpdateRiskConfig({
                      trailingStopWinActivationPercent: Number(e.target.value),
                    })
                  }
                  className="w-full px-2 py-1.5 bg-[#111827] border border-slate-700 rounded text-xs font-mono font-bold text-emerald-400"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Recuo Máx (% Topo)</label>
                <input
                  type="number"
                  min={10}
                  max={50}
                  value={riskConfig.trailingStopWinGivebackPercent ?? 25}
                  onChange={(e) =>
                    onUpdateRiskConfig({
                      trailingStopWinGivebackPercent: Number(e.target.value),
                    })
                  }
                  className="w-full px-2 py-1.5 bg-[#111827] border border-slate-700 rounded text-xs font-mono font-bold text-amber-400"
                />
              </div>
            </div>
          </div>

          {/* 2. Limite de Losses Consecutivos */}
          <div className="bg-[#0B0F17] border border-slate-800/90 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-red-400 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" /> Stop Losses Seguidos
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                Atual: {riskState.consecutiveLosses || 0} seguidos
              </span>
            </div>

            <p className="text-[11px] text-slate-400 leading-tight">
              Pausa o robô imediatamente se acumular N ciclos de loss seguidos (independente do Stop Loss total), evitando drawdowns anormais.
            </p>

            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Máximo de Losses Seguidos</label>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => onUpdateRiskConfig({ maxConsecutiveLosses: num })}
                    className={`flex-1 py-1.5 rounded text-xs font-mono font-bold transition-colors cursor-pointer border ${
                      (riskConfig.maxConsecutiveLosses ?? 2) === num
                        ? 'bg-red-600/30 border-red-500 text-red-300'
                        : 'bg-[#111827] border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    {num}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 3. Filtro de Payout Mínimo */}
          <div className="bg-[#0B0F17] border border-slate-800/90 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" /> Payout Mínimo Aceito
              </span>
              <span className="text-[11px] font-mono font-bold text-cyan-300">
                {riskConfig.minPayoutFilter ?? 80}%
              </span>
            </div>

            <p className="text-[11px] text-slate-400 leading-tight">
              O robô rejeita ordens e ignora catalogação de pares que estejam pagando abaixo dessa taxa de retorno no momento da entrada.
            </p>

            <div className="flex items-center gap-1.5">
              {[75, 80, 85, 88].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => onUpdateRiskConfig({ minPayoutFilter: pct })}
                  className={`flex-1 py-1.5 rounded text-xs font-mono font-bold transition-colors cursor-pointer border ${
                    (riskConfig.minPayoutFilter ?? 80) === pct
                      ? 'bg-cyan-600/30 border-cyan-500 text-cyan-300'
                      : 'bg-[#111827] border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          {/* 4. Janela de Horários Permitidos */}
          <div className="bg-[#0B0F17] border border-slate-800/90 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Horário de Operação
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdateRiskConfig({
                    operatingHoursEnabled: !riskConfig.operatingHoursEnabled,
                  })
                }
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                  riskConfig.operatingHoursEnabled ? 'bg-amber-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    riskConfig.operatingHoursEnabled ? 'translate-x-4.5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <p className="text-[11px] text-slate-400 leading-tight">
              Permite operações apenas dentro do intervalo de horário de Brasília (BRT), protegendo da baixa liquidez da madrugada.
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Início (BRT)</label>
                <input
                  type="time"
                  value={riskConfig.operatingHoursStart || '06:00'}
                  onChange={(e) =>
                    onUpdateRiskConfig({
                      operatingHoursStart: e.target.value,
                    })
                  }
                  className="w-full px-2 py-1 bg-[#111827] border border-slate-700 rounded text-xs font-mono text-slate-200"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Fim (BRT)</label>
                <input
                  type="time"
                  value={riskConfig.operatingHoursEnd || '22:00'}
                  onChange={(e) =>
                    onUpdateRiskConfig({
                      operatingHoursEnd: e.target.value,
                    })
                  }
                  className="w-full px-2 py-1 bg-[#111827] border border-slate-700 rounded text-xs font-mono text-slate-200"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Account Switcher: Practice vs Real */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          onClick={() => onSwitchAccount('PRACTICE')}
          className={`p-4 rounded-lg border transition-colors cursor-pointer ${
            connectionStatus.activeBalanceType === 'PRACTICE'
              ? 'bg-amber-950/15 border-amber-500/80'
              : 'bg-[#111827] border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-400">
              CONTA TREINAMENTO (DEMO / PRACTICE)
            </span>
            <span className="text-xs text-slate-400">
              {connectionStatus.activeBalanceType === 'PRACTICE'
                ? 'Carteira Ativa no Robô'
                : 'Clique para ativar'}
            </span>
          </div>
          <div className="mt-1.5 flex items-baseline justify-between">
            <span className="text-xl font-mono tabular-nums font-bold text-white">
              R${' '}
              {connectionStatus.practiceBalance.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
              })}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRefillDemoBalance();
              }}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-medium transition-colors"
            >
              Recarregar R$ 10.000
            </button>
          </div>
        </div>

        <div
          onClick={() => onSwitchAccount('REAL')}
          className={`p-4 rounded-lg border transition-colors cursor-pointer ${
            connectionStatus.activeBalanceType === 'REAL'
              ? 'bg-emerald-950/15 border-emerald-500/80'
              : 'bg-[#111827] border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-400">
              CONTA REAL (IQ OPTION LIVE)
            </span>
            <span className="text-xs text-slate-400">
              {connectionStatus.activeBalanceType === 'REAL'
                ? 'Carteira Ativa no Robô'
                : 'Clique para ativar'}
            </span>
          </div>
          <div className="mt-1.5 flex items-baseline justify-between">
            <span className="text-xl font-mono tabular-nums font-bold text-white">
              R${' '}
              {connectionStatus.realBalance.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
              })}
            </span>
            <span className="text-xs font-mono text-slate-400">
              ID: #{connectionStatus.activeBalanceId || 1001}
            </span>
          </div>
        </div>
      </div>

      {/* Advanced Management & Simulation Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Martingale, Soros & SorosGale Configuration */}
        <div className="lg:col-span-6 bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <Wallet className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-display font-bold text-white">
              Configuração de Martingale (Gale 1 e 2), Soros e SorosGale
            </h2>
          </div>

          {/* Management Mode Selector */}
          <div>
            <label className="block text-xs text-slate-400 mb-2">
              Modelo de Gerenciamento Matemático
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(
                [
                  { id: 'FIXED', label: 'Mão Fixa' },
                  { id: 'MARTINGALE', label: 'Martingale' },
                  { id: 'SOROS', label: 'Soros' },
                  { id: 'SOROSGALE', label: 'SorosGale' },
                ] as { id: ManagementMode; label: string }[]
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onUpdateRiskConfig({ managementMode: m.id })}
                  className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                    riskConfig.managementMode === m.id
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-[#0B0F17] border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Martingale Settings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800/80">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                Máximo de Gales Permitidos
              </label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg">
                {([0, 1, 2] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => onUpdateRiskConfig({ maxGales: g })}
                    className={`py-1.5 text-xs font-mono font-medium rounded transition-colors cursor-pointer ${
                      riskConfig.maxGales === g
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {g === 0 ? 'Sem Gale' : `Gale ${g}`}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                Fator Multiplicador do Gale (ex: 2.2x)
              </label>
              <input
                type="number"
                step="0.1"
                min="1.1"
                max="4.0"
                value={riskConfig.galeMultiplier}
                onChange={(e) =>
                  onUpdateRiskConfig({
                    galeMultiplier: Math.max(1.1, Number(e.target.value)),
                  })
                }
                className="w-full px-3 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-sm font-mono tabular-nums text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Soros & Instrument Type */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-800/80">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                Níveis de Soros (Ciclo)
              </label>
              <select
                value={riskConfig.sorosLevels}
                onChange={(e) =>
                  onUpdateRiskConfig({ sorosLevels: Number(e.target.value) })
                }
                className="w-full px-3 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-sm font-mono text-white focus:outline-none focus:border-blue-500"
              >
                <option value={2}>2 Níveis</option>
                <option value={3}>3 Níveis</option>
                <option value={4}>4 Níveis</option>
                <option value={5}>5 Níveis</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                Reinvestimento Soros (%)
              </label>
              <input
                type="number"
                min={25}
                max={100}
                step={5}
                value={riskConfig.sorosPayoutReinvestPercent}
                onChange={(e) =>
                  onUpdateRiskConfig({
                    sorosPayoutReinvestPercent: Math.min(
                      100,
                      Math.max(25, Number(e.target.value))
                    ),
                  })
                }
                className="w-full px-3 py-2 bg-[#0B0F17] border border-slate-800 rounded-lg text-sm font-mono tabular-nums text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                Modalidade de Ordem IQ
              </label>
              <div className="grid grid-cols-2 gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg">
                {(['binary', 'digital'] as const).map((inst) => (
                  <button
                    key={inst}
                    type="button"
                    onClick={() => onUpdateRiskConfig({ instrumentType: inst })}
                    className={`py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                      riskConfig.instrumentType === inst
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {inst === 'binary' ? 'Binárias' : 'Digitais'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Live Cycle Status & Mathematical Projection Table */}
        <div className="lg:col-span-6 bg-[#111827] border border-slate-800 rounded-lg p-5 flex flex-col justify-between space-y-5">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-display font-bold text-white">
                  Tabela de Valores Calculados por Entrada / Gale
                </h2>
              </div>
              <span className="text-xs font-mono tabular-nums text-blue-400 font-bold">
                Próximo Lote: R$ {riskState.nextCalculatedStake.toFixed(2)}
              </span>
            </div>

            <div className="overflow-x-auto mt-3">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                    <th className="py-2 pr-2">Etapa do Ciclo</th>
                    <th className="py-2 px-2 text-right">Valor da Entrada</th>
                    <th className="py-2 px-2 text-right">Retorno Bruto</th>
                    <th className="py-2 px-2 text-right">Lucro Líquido</th>
                    <th className="py-2 pl-2 text-right">Risco Acumulado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono tabular-nums">
                  {projectionRows.map((r, i) => (
                    <tr key={i} className="h-9">
                      <td className="py-1.5 pr-2 font-sans text-slate-200">
                        {r.stepLabel}
                      </td>
                      <td className="py-1.5 px-2 text-right text-white font-semibold">
                        R$ {r.stake.toFixed(2)}
                      </td>
                      <td className="py-1.5 px-2 text-right text-slate-300">
                        R$ {r.grossReturn.toFixed(2)}
                      </td>
                      <td className="py-1.5 px-2 text-right text-emerald-400">
                        +R$ {r.netCycleProfit.toFixed(2)}
                      </td>
                      <td className="py-1.5 pl-2 text-right text-amber-400">
                        R$ {r.cumulativeRisk.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-3 bg-[#0B0F17] border border-slate-800 rounded-lg flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <ShieldAlert className="w-4 h-4 text-blue-400 shrink-0" />
              <span>
                Trava de segurança ativa: o robô para automaticamente em{' '}
                <strong className="text-emerald-400">
                  +R$ {riskConfig.stopWin.toFixed(2)}
                </strong>{' '}
                (Stop Win) ou{' '}
                <strong className="text-red-400">
                  -R$ {riskConfig.stopLoss.toFixed(2)}
                </strong>{' '}
                (Stop Loss).
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
