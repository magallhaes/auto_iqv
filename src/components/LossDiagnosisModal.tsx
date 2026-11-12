import React from 'react';
import {
  X,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  ShieldAlert,
  ArrowRight,
  Compass,
  Activity,
  Zap,
  CheckCircle2,
  Copy,
} from 'lucide-react';
import type { TradeOrder, TechnicalSnapshot } from '../types/trading';
import { diagnoseLostTrade } from '../lib/firebase';

interface LossDiagnosisModalProps {
  order: TradeOrder | null;
  onClose: () => void;
  onApplyRecommendation?: (factor: string) => void;
}

export const LossDiagnosisModal: React.FC<LossDiagnosisModalProps> = ({
  order,
  onClose,
  onApplyRecommendation,
}) => {
  if (!order) return null;

  const diagnosis = diagnoseLostTrade(order);
  const isCall = order.direction === 'CALL';
  const entryPrice = order.openPrice || 1;
  const exitPrice = order.closePrice ?? entryPrice;
  const priceDelta = exitPrice - entryPrice;
  const pips = (Math.abs(priceDelta) * 10000).toFixed(2);

  const factorColors: Record<string, { bg: string; text: string; border: string }> = {
    CONTRA_TENDENCIA: {
      bg: 'bg-rose-950/80',
      text: 'text-rose-300',
      border: 'border-rose-500/40',
    },
    PRESSAO_VOLUME_CONTRARIA: {
      bg: 'bg-amber-950/80',
      text: 'text-amber-300',
      border: 'border-amber-500/40',
    },
    EXAUSTAO_RSI: {
      bg: 'bg-purple-950/80',
      text: 'text-purple-300',
      border: 'border-purple-500/40',
    },
    ESTAGNACAO_DOJI: {
      bg: 'bg-slate-900',
      text: 'text-slate-300',
      border: 'border-slate-700',
    },
    REJEICAO_SUPORTE_RESISTENCIA: {
      bg: 'bg-blue-950/80',
      text: 'text-blue-300',
      border: 'border-blue-500/40',
    },
    VOLATILIDADE_ANOMALA: {
      bg: 'bg-red-950/80',
      text: 'text-red-300',
      border: 'border-red-500/40',
    },
    REVERSAO_FLUXO: {
      bg: 'bg-orange-950/80',
      text: 'text-orange-300',
      border: 'border-orange-500/40',
    },
  };

  const style = factorColors[diagnosis.primaryFactor] || factorColors.REVERSAO_FLUXO;

  const timeFormatted = new Date(order.timestamp * 1000).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0B0F17] border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between bg-[#111827]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Auditoria & Diagnóstico Técnico de Loss</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800/50">
                  {order.assetTicker} · {order.direction}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Análise post-mortem de confluência, rejeição de preço e fatores que causaram a perda.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Top Quick Stats Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-[#06080E] p-3 rounded-xl border border-slate-800/80 font-mono text-xs">
            <div>
              <span className="text-[10px] text-slate-500 block uppercase font-sans">Preço Entrada</span>
              <span className="text-white font-bold">{entryPrice.toFixed(5)}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block uppercase font-sans">Preço Fechamento</span>
              <span className={`font-bold ${isCall ? 'text-rose-400' : 'text-emerald-400'}`}>
                {exitPrice.toFixed(5)}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block uppercase font-sans">Deslocamento (Delta)</span>
              <span className="text-rose-400 font-bold">
                {priceDelta > 0 ? '+' : ''}{(priceDelta * 10000).toFixed(2)} pips
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block uppercase font-sans">Perda Financeira</span>
              <span className="text-rose-400 font-bold">
                -R$ {Math.abs(order.profit || order.amount).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Root Cause Card */}
          <div className={`p-4 rounded-xl border ${style.bg} ${style.border} space-y-2`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase font-bold tracking-wider text-slate-400">
                Causa Raiz Identificada
              </span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${style.border} ${style.text}`}>
                {diagnosis.primaryFactor.replace(/_/g, ' ')}
              </span>
            </div>
            <h4 className={`text-sm font-bold ${style.text} flex items-center gap-1.5`}>
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{diagnosis.title}</span>
            </h4>
            <p className="text-xs text-slate-200 leading-relaxed">
              {diagnosis.diagnosis}
            </p>
          </div>

          {/* Technical Context Snapshot at Execution Moment */}
          <div className="bg-[#111827] border border-slate-800 rounded-xl p-3.5 space-y-2.5">
            <h5 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-blue-400" />
              <span>Condições Técnicas Registradas no Momento da Entrada</span>
            </h5>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <div className="p-2 rounded bg-[#0B0F17] border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Estratégia</span>
                <span className="text-white font-semibold">{order.strategyLabel || 'MHI 1 (Minoria)'}</span>
              </div>
              <div className="p-2 rounded bg-[#0B0F17] border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Etapa do Ciclo</span>
                <span className="text-white font-semibold">
                  {order.galeStep === 0 ? 'Entrada Direta (1ª Mão)' : `Gale ${order.galeStep}`}
                </span>
              </div>
              <div className="p-2 rounded bg-[#0B0F17] border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Horário Execução</span>
                <span className="text-white font-mono">{timeFormatted}</span>
              </div>
            </div>
          </div>

          {/* Actionable Solution Recommendation Card */}
          <div className="bg-emerald-950/30 border border-emerald-500/40 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-1.5 text-emerald-300 font-bold text-xs uppercase tracking-wide">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Recomendação para Blindar a Estratégia</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {diagnosis.recommendation}
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-[#111827] flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-mono">
            ID: {order.id} · Salvo no Firestore
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
          >
            Entendido / Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
