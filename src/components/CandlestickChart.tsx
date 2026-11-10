import React, { useMemo, useState, useRef } from 'react';
import { Candle, StrategyConfig, TechnicalSnapshot, TradeOrder } from '../types/trading';
import {
  calculateBollingerBands,
  calculateEMA,
  getCandleColor,
} from '../utils/indicators';
import {
  Clock,
  TrendingUp,
  TrendingDown,
  Flag,
  Target,
  X,
  Layers,
  Activity,
  Sliders,
} from 'lucide-react';

interface CandlestickChartProps {
  candles: Candle[];
  config: StrategyConfig;
  snapshot: TechnicalSnapshot;
  assetTicker: string;
  assetId?: number;
  timeframe: number;
  secondsRemainingInCandle: number;
  orders?: TradeOrder[];
  currencySymbol?: string;
}

export const CandlestickChart: React.FC<CandlestickChartProps> = ({
  candles,
  config,
  snapshot,
  assetTicker,
  assetId,
  timeframe,
  secondsRemainingInCandle,
  orders = [],
  currencySymbol = 'R$',
}) => {
  const visibleCount = 55;
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Crosshair state
  const [crosshair, setCrosshair] = useState<{
    x: number;
    y: number;
    price: number;
    time: string;
    candle: Candle | null;
  } | null>(null);

  const visibleCandles = useMemo(
    () => candles.slice(-visibleCount),
    [candles]
  );

  // Filter orders related to this asset
  const assetOrders = useMemo(() => {
    if (!orders || orders.length === 0) return [];
    const cleanTicker = assetTicker.replace(/[^A-Z]/g, '');
    return orders.filter((o) => {
      if (assetId != null && o.assetId === assetId) return true;
      if (o.assetTicker === assetTicker) return true;
      if (o.assetTicker.replace(/[^A-Z]/g, '') === cleanTicker) return true;
      return false;
    });
  }, [orders, assetId, assetTicker]);

  const openOrders = useMemo(
    () => assetOrders.filter((o) => o.status === 'OPEN'),
    [assetOrders]
  );

  const recentSettledOrders = useMemo(
    () => assetOrders.filter((o) => o.status !== 'OPEN').slice(0, 6),
    [assetOrders]
  );

  const chartGeometry = useMemo(() => {
    if (visibleCandles.length === 0) return null;

    const allCloses = candles.map((c) => c.close);
    const fullEmaFast = calculateEMA(allCloses, config.emaFastPeriod || 9);
    const fullEmaSlow = calculateEMA(allCloses, config.emaSlowPeriod || 21);
    const fullBB = calculateBollingerBands(
      allCloses,
      config.bbPeriod || 20,
      config.bbStdDev || 2
    );

    const startOffset = Math.max(0, candles.length - visibleCandles.length);
    const emaFastSlice = fullEmaFast.slice(startOffset);
    const emaSlowSlice = fullEmaSlow.slice(startOffset);
    const bbUpperSlice = fullBB.upper.slice(startOffset);
    const bbLowerSlice = fullBB.lower.slice(startOffset);

    let minPrice = Infinity;
    let maxPrice = -Infinity;

    visibleCandles.forEach((c, i) => {
      if (c.min < minPrice) minPrice = c.min;
      if (c.max > maxPrice) maxPrice = c.max;
      if (config.useBollingerFilter) {
        if (bbLowerSlice[i] && bbLowerSlice[i] < minPrice) minPrice = bbLowerSlice[i];
        if (bbUpperSlice[i] && bbUpperSlice[i] > maxPrice) maxPrice = bbUpperSlice[i];
      }
    });

    // Expand bounds to ensure all open orders entry lines are visible
    openOrders.forEach((ord) => {
      if (ord.openPrice && ord.openPrice < minPrice) minPrice = ord.openPrice;
      if (ord.openPrice && ord.openPrice > maxPrice) maxPrice = ord.openPrice;
    });

    const isHighOrCrypto =
      assetTicker.includes('JPY') ||
      assetTicker.includes('BTC') ||
      assetTicker.includes('ETH') ||
      assetTicker.includes('GOLD') ||
      assetTicker.includes('BRL') ||
      assetTicker.includes('MXN') ||
      assetTicker.includes('COP') ||
      minPrice > 50;

    const decimals = isHighOrCrypto ? (minPrice > 1000 ? 2 : 3) : 5;
    const padding = (maxPrice - minPrice) * 0.16 || (isHighOrCrypto ? 0.05 : 0.0004);
    const lowBound = minPrice - padding;
    const highBound = maxPrice + padding;
    const range = Math.max(highBound - lowBound, 0.00001);

    const width = 960;
    const height = 380;
    const rightAxisWidth = 84;
    const plotWidth = width - rightAxisWidth;
    const stepX = plotWidth / Math.max(1, visibleCandles.length);
    const candleWidth = Math.max(5, Math.min(12, stepX * 0.68));

    const priceToY = (p: number) =>
      height - ((p - lowBound) / range) * (height - 36) - 18;

    const yToPrice = (y: number) => {
      const normalized = (height - 18 - y) / (height - 36);
      return lowBound + normalized * range;
    };

    const buildPath = (arr: number[]) =>
      arr
        .map((val, idx) => {
          const x = idx * stepX + stepX / 2;
          const y = priceToY(val);
          return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(' ');

    // Identify MHI 5-candle quadrant boundaries
    const quadrantSeconds = timeframe * 5;
    const quadrantLines: { x: number; label: string }[] = [];
    visibleCandles.forEach((c, idx) => {
      if (c.from % quadrantSeconds === 0) {
        const x = idx * stepX;
        const d = new Date(c.from * 1000);
        const label = d.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        quadrantLines.push({ x, label });
      }
    });

    const priceLevels = [0.12, 0.32, 0.5, 0.68, 0.88].map((ratio) => {
      const val = lowBound + range * ratio;
      return {
        price: val.toFixed(decimals),
        y: priceToY(val),
      };
    });

    return {
      width,
      height,
      plotWidth,
      stepX,
      candleWidth,
      priceToY,
      yToPrice,
      emaFastPath: buildPath(emaFastSlice),
      emaSlowPath: buildPath(emaSlowSlice),
      bbUpperPath: buildPath(bbUpperSlice),
      bbLowerPath: buildPath(bbLowerSlice),
      quadrantLines,
      priceLevels,
      decimals,
      lowBound,
      highBound,
    };
  }, [visibleCandles, candles, config, timeframe, openOrders, assetTicker]);

  if (!chartGeometry || visibleCandles.length === 0) {
    return (
      <div className="h-[410px] flex items-center justify-center bg-[#0B0E14] border border-[#161D2A] rounded-lg text-slate-400 text-sm">
        <Activity className="w-4 h-4 mr-2 animate-spin text-blue-500" />
        Carregando cotações reais da IQ Option...
      </div>
    );
  }

  const lastCandle = visibleCandles[visibleCandles.length - 1];
  const lastX = (visibleCandles.length - 1) * chartGeometry.stepX + chartGeometry.stepX / 2;
  const lastY = chartGeometry.priceToY(lastCandle.close);
  const supportY = chartGeometry.priceToY(snapshot.supportLevel);
  const resistanceY = chartGeometry.priceToY(snapshot.resistanceLevel);
  const currentPrice = lastCandle.close;

  // Primary active open order for HUD/highlight
  const primaryOpenOrder = openOrders[0];
  const totalOpenPnl = openOrders.reduce((sum, ord) => {
    const isCall = ord.direction === 'CALL';
    const isWinning = isCall ? currentPrice > ord.openPrice : currentPrice < ord.openPrice;
    const isDraw = Math.abs(currentPrice - ord.openPrice) <= 0.000001;
    if (isDraw) return sum;
    return isWinning ? sum + (ord.amount * ord.payoutPercent) / 100 : sum - ord.amount;
  }, 0);

  // Mouse move handler for interactive crosshair
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || !chartGeometry) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const svgX = (clientX / rect.width) * chartGeometry.width;
    const svgY = (clientY / rect.height) * chartGeometry.height;

    if (svgX < 0 || svgX > chartGeometry.plotWidth || svgY < 0 || svgY > chartGeometry.height) {
      setCrosshair(null);
      return;
    }

    const candleIdx = Math.min(
      visibleCandles.length - 1,
      Math.max(0, Math.floor(svgX / chartGeometry.stepX))
    );
    const c = visibleCandles[candleIdx] || null;
    const priceVal = chartGeometry.yToPrice(svgY);
    const d = c ? new Date(c.from * 1000) : new Date();
    const timeStr = d.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    setCrosshair({
      x: svgX,
      y: svgY,
      price: priceVal,
      time: timeStr,
      candle: c,
    });
  };

  const handleMouseLeave = () => {
    setCrosshair(null);
  };

  return (
    <div className="bg-[#0B0E14] border border-[#161D2A] rounded-lg overflow-hidden flex flex-col shadow-2xl">
      {/* IQ Option Top Nav Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-b border-[#161D2A] bg-[#0E121B] text-xs">
        {/* Left: Asset Ticker Pill + Live Quote */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-[#141A26] px-2.5 py-1 rounded border border-[#212B3E]">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="font-bold text-sm text-white tracking-wide">
              {assetTicker}
            </span>
            <span className="text-[10px] uppercase font-bold text-slate-400 bg-[#0B0E14] px-1.5 py-0.5 rounded">
              Binária
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-mono tabular-nums">
            <span className="text-slate-400">Tempo:</span>
            <span className="font-bold text-white bg-[#141A26] px-1.5 py-0.5 rounded">
              {timeframe === 60 ? '1m' : timeframe === 300 ? '5m' : '15m'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-mono tabular-nums">
            <span className="text-slate-400">Cotação:</span>
            <span className="font-black text-sm text-white">
              {currentPrice.toFixed(chartGeometry.decimals)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-mono tabular-nums text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>
              Expiração: 00:{String(secondsRemainingInCandle).padStart(2, '0')}
            </span>
          </div>
        </div>

        {/* Right: Real-time Indicator Snapshot */}
        <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums">
          <span className="text-[#00E5FF] font-semibold">
            EMA {config.emaFastPeriod}: {snapshot.ema9.toFixed(chartGeometry.decimals)}
          </span>
          <span className="text-[#FFB300] font-semibold">
            EMA {config.emaSlowPeriod}: {snapshot.ema21.toFixed(chartGeometry.decimals)}
          </span>
          {config.useBollingerFilter && (
            <span className="text-indigo-400">
              BB({config.bbPeriod}, {config.bbStdDev})
            </span>
          )}
          {openOrders.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/40">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
              {openOrders.length} {openOrders.length === 1 ? 'ORDEM' : 'ORDENS'}
            </span>
          )}
        </div>
      </div>

      {/* SVG Interactive Chart Canvas */}
      <div className="relative w-full overflow-hidden bg-[#0A0D14]">
        {/* IQ Option Floating Left Tool Toolbar (Estilo Corretora) */}
        <div className="absolute top-4 left-3 z-20 flex flex-col gap-1.5 pointer-events-auto">
          <div className="bg-[#111622]/90 backdrop-blur-md p-1.5 rounded-md border border-[#1E2738] flex flex-col gap-1 text-[11px] font-bold text-slate-300 shadow-lg">
            <div className="px-2 py-1 rounded bg-[#1C2538] text-white flex items-center gap-1">
              <Sliders className="w-3 h-3 text-blue-400" />
              <span>{timeframe === 60 ? '1m' : '5m'}</span>
            </div>
            <div className="px-2 py-1 rounded hover:bg-[#1C2538] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer">
              <Layers className="w-3 h-3 text-emerald-400" />
              <span>MHI</span>
            </div>
            <div className="px-2 py-1 rounded hover:bg-[#1C2538] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer">
              <Target className="w-3 h-3 text-amber-400" />
              <span>S/R</span>
            </div>
          </div>
        </div>

        {/* Floating Active Orders Live Status HUD (Canto Superior Esquerdo) */}
        {openOrders.length > 0 && (
          <div className="absolute top-4 left-24 z-30 flex flex-col gap-2 max-w-sm w-76 pointer-events-auto">
            {openOrders.map((ord) => {
              const isCall = ord.direction === 'CALL';
              const priceDiff = currentPrice - ord.openPrice;
              const isWinning = isCall ? priceDiff > 0.000001 : priceDiff < -0.000001;
              const isDraw = Math.abs(priceDiff) <= 0.000001;
              const potentialProfit = isWinning
                ? Number(((ord.amount * ord.payoutPercent) / 100).toFixed(2))
                : isDraw
                ? 0
                : -ord.amount;

              return (
                <div
                  key={ord.id}
                  className={`rounded-lg p-2.5 shadow-2xl backdrop-blur-md border transition-all ${
                    isWinning
                      ? 'bg-[#061811]/95 border-emerald-500/70 shadow-emerald-950/60'
                      : isDraw
                      ? 'bg-[#0E1524]/95 border-slate-700/70 shadow-slate-950/50'
                      : 'bg-[#1D0A0F]/95 border-red-500/70 shadow-red-950/60'
                  }`}
                >
                  <div className="flex items-center justify-between pb-1.5 border-b border-white/10 text-xs font-mono">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black ${
                          isCall
                            ? 'bg-emerald-500/25 text-emerald-300'
                            : 'bg-red-500/25 text-red-300'
                        }`}
                      >
                        {isCall ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {ord.direction}
                      </span>
                      <span className="text-white font-bold tabular-nums">
                        {currencySymbol} {ord.amount.toFixed(2)}
                      </span>
                      {ord.galeStep > 0 && (
                        <span className="text-[10px] font-mono text-amber-400 bg-amber-500/20 px-1 py-0.5 rounded">
                          G{ord.galeStep}
                        </span>
                      )}
                    </div>
                    <span className="font-bold text-amber-400 tabular-nums">
                      00:{String(secondsRemainingInCandle).padStart(2, '0')}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <span
                      className={`text-xs font-black tracking-wide ${
                        isWinning
                          ? 'text-emerald-400'
                          : isDraw
                          ? 'text-slate-300'
                          : 'text-red-400'
                      }`}
                    >
                      {isWinning
                        ? `GANHANDO (+${currencySymbol} ${potentialProfit.toFixed(2)})`
                        : isDraw
                        ? 'EMPATE (0,00)'
                        : `PERDENDO (-${currencySymbol} ${ord.amount.toFixed(2)})`}
                    </span>
                    <span
                      className={`text-xs font-mono font-bold ${
                        isWinning ? 'text-emerald-300' : isDraw ? 'text-slate-400' : 'text-red-300'
                      }`}
                    >
                      {isWinning ? `+${ord.payoutPercent}%` : isDraw ? '0%' : '-100%'}
                    </span>
                  </div>

                  <div className="mt-1.5 pt-1.5 border-t border-white/10 grid grid-cols-2 gap-2 text-[10px] font-mono tabular-nums text-slate-300">
                    <div>
                      <span className="text-slate-400 text-[9px] block">ENTRADA:</span>
                      <span className="font-bold text-white">
                        {ord.openPrice.toFixed(chartGeometry.decimals)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 text-[9px] block">ATUAL:</span>
                      <span
                        className={`font-black ${
                          isWinning
                            ? 'text-emerald-400'
                            : isDraw
                            ? 'text-slate-200'
                            : 'text-red-400'
                        }`}
                      >
                        {currentPrice.toFixed(chartGeometry.decimals)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <svg
          ref={svgRef}
          viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
          className="w-full h-[375px] block select-none cursor-crosshair"
          preserveAspectRatio="none"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Subtle Watermark in background */}
          <text
            x={chartGeometry.plotWidth / 2 - 120}
            y={chartGeometry.height / 2 - 10}
            fill="#1E293B"
            fillOpacity="0.18"
            fontSize="56"
            fontWeight="900"
            fontFamily="JetBrains Mono, monospace"
            textAnchor="middle"
          >
            {assetTicker}
          </text>
          <text
            x={chartGeometry.plotWidth / 2 - 120}
            y={chartGeometry.height / 2 + 30}
            fill="#1E293B"
            fillOpacity="0.12"
            fontSize="18"
            fontWeight="700"
            fontFamily="JetBrains Mono, monospace"
            textAnchor="middle"
          >
            IQ OPTION REAL STREAM · M{timeframe / 60}
          </text>

          {/* Horizontal Price Grid Lines */}
          {chartGeometry.priceLevels.map((lvl, idx) => (
            <g key={idx}>
              <line
                x1={0}
                y1={lvl.y}
                x2={chartGeometry.plotWidth}
                y2={lvl.y}
                stroke="#151C2A"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <text
                x={chartGeometry.plotWidth + 8}
                y={lvl.y + 3.5}
                fill="#5A6A85"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                {lvl.price}
              </text>
            </g>
          ))}

          {/* MHI Quadrant Vertical Dividers (every 5 candles) */}
          {chartGeometry.quadrantLines.map((q, idx) => (
            <g key={idx}>
              <line
                x1={q.x}
                y1={0}
                x2={q.x}
                y2={chartGeometry.height - 22}
                stroke="#1B2436"
                strokeWidth="1.2"
                strokeDasharray="3 3"
              />
              {/* Bottom Time Stamp Pill */}
              <rect
                x={q.x - 28}
                y={chartGeometry.height - 18}
                width={56}
                height={16}
                rx={3}
                fill="#101520"
                stroke="#1E2738"
                strokeWidth="0.8"
              />
              <text
                x={q.x}
                y={chartGeometry.height - 6}
                fill="#8A99B5"
                fontSize="9"
                fontWeight="bold"
                fontFamily="JetBrains Mono, monospace"
                textAnchor="middle"
              >
                {q.label}
              </text>
            </g>
          ))}

          {/* Automatic Support & Resistance Lines */}
          {config.useSrFilter && (
            <>
              <line
                x1={0}
                y1={resistanceY}
                x2={chartGeometry.plotWidth}
                y2={resistanceY}
                stroke="#FF3B30"
                strokeWidth="1.2"
                strokeOpacity="0.75"
                strokeDasharray="6 3"
              />
              <text
                x={12}
                y={Math.max(14, resistanceY - 4)}
                fill="#FF3B30"
                fontSize="9.5"
                fontWeight="bold"
                fontFamily="JetBrains Mono, monospace"
              >
                RESISTÊNCIA ({snapshot.resistanceLevel.toFixed(chartGeometry.decimals)})
              </text>

              <line
                x1={0}
                y1={supportY}
                x2={chartGeometry.plotWidth}
                y2={supportY}
                stroke="#00E676"
                strokeWidth="1.2"
                strokeOpacity="0.75"
                strokeDasharray="6 3"
              />
              <text
                x={12}
                y={Math.min(chartGeometry.height - 24, supportY + 12)}
                fill="#00E676"
                fontSize="9.5"
                fontWeight="bold"
                fontFamily="JetBrains Mono, monospace"
              >
                SUPORTE ({snapshot.supportLevel.toFixed(chartGeometry.decimals)})
              </text>
            </>
          )}

          {/* Bollinger Bands */}
          {config.useBollingerFilter && (
            <>
              <path
                d={chartGeometry.bbUpperPath}
                fill="none"
                stroke="#6366F1"
                strokeWidth="1.2"
                strokeOpacity="0.6"
              />
              <path
                d={chartGeometry.bbLowerPath}
                fill="none"
                stroke="#6366F1"
                strokeWidth="1.2"
                strokeOpacity="0.6"
              />
            </>
          )}

          {/* OPEN ORDERS: Faithful IQ Option Entry Visualization */}
          {openOrders.map((ord) => {
            const entryY = chartGeometry.priceToY(ord.openPrice);
            const isCall = ord.direction === 'CALL';
            const priceDiff = currentPrice - ord.openPrice;
            const isWinning = isCall ? priceDiff > 0.000001 : priceDiff < -0.000001;
            const isDraw = Math.abs(priceDiff) <= 0.000001;
            const themeColor = isWinning ? '#00E676' : isDraw ? '#94A3B8' : '#FF3B30';
            const dirColor = isCall ? '#00E676' : '#FF3B30';
            const netProfit = isWinning
              ? (ord.amount * ord.payoutPercent) / 100
              : isDraw
              ? 0
              : -ord.amount;

            // Find candle where order was opened
            const entryCandleIdx = visibleCandles.findIndex(
              (c) => ord.timestamp >= c.from && ord.timestamp < c.to
            );
            const entryCandleX =
              entryCandleIdx >= 0
                ? entryCandleIdx * chartGeometry.stepX + chartGeometry.stepX / 2
                : lastX - 60;

            return (
              <g key={`entry_${ord.id}`}>
                {/* 1. Translucent Real-Time Spread Band between Entry Price & Current Price */}
                <rect
                  x={0}
                  y={Math.min(entryY, lastY)}
                  width={chartGeometry.plotWidth}
                  height={Math.max(2, Math.abs(lastY - entryY))}
                  fill={themeColor}
                  fillOpacity="0.16"
                />

                {/* 2. White Horizontal Dotted Line across the chart (Identical to IQ Option) */}
                <line
                  x1={0}
                  y1={entryY}
                  x2={chartGeometry.plotWidth}
                  y2={entryY}
                  stroke="#FFFFFF"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                  strokeOpacity="0.85"
                />

                {/* 3. Circular Entry Badge on Entry Candle with Arrow & Investment */}
                <g transform={`translate(${entryCandleX}, ${entryY})`}>
                  {/* Outer glowing halo */}
                  <circle r="9" fill={dirColor} fillOpacity="0.25" className="animate-ping" />
                  <circle r="7.5" fill="#0B0E14" stroke={dirColor} strokeWidth="2" />
                  <text
                    x={0}
                    y={3}
                    fill={dirColor}
                    fontSize="9"
                    fontWeight="900"
                    fontFamily="sans-serif"
                    textAnchor="middle"
                  >
                    {isCall ? '▲' : '▼'}
                  </text>
                </g>

                {/* 4. Vertical Expiration Line (Finish Line with Flag) */}
                <line
                  x1={lastX + 20}
                  y1={0}
                  x2={lastX + 20}
                  y2={chartGeometry.height - 22}
                  stroke="#FFFFFF"
                  strokeWidth="1.2"
                  strokeDasharray="3 3"
                  strokeOpacity="0.4"
                />
                <circle cx={lastX + 20} cy={chartGeometry.height - 28} r="6" fill="#1C2538" stroke="#FFFFFF" strokeWidth="1" />
                <text
                  x={lastX + 20}
                  y={chartGeometry.height - 25}
                  fontSize="8"
                  textAnchor="middle"
                >
                  🏁
                </text>

                {/* 5. IQ Option Floating Result Badge (RESULTADO L/P) */}
                <g transform={`translate(${Math.max(40, chartGeometry.plotWidth - 145)}, ${Math.min(chartGeometry.height - 75, Math.max(30, entryY - 26))})`}>
                  <rect
                    width={138}
                    height={38}
                    rx={5}
                    fill={isWinning ? '#00E676' : isDraw ? '#1E293B' : '#FF3B30'}
                    filter="drop-shadow(0 4px 12px rgba(0,0,0,0.6))"
                  />
                  <text
                    x={10}
                    y={15}
                    fill="#FFFFFF"
                    fontSize="9"
                    fontWeight="bold"
                    letterSpacing="0.5"
                    fontFamily="sans-serif"
                  >
                    RESULTADO (L/P)
                  </text>
                  <text
                    x={10}
                    y={30}
                    fill="#FFFFFF"
                    fontSize="13"
                    fontWeight="900"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {netProfit >= 0 ? `+${currencySymbol} ${netProfit.toFixed(2)}` : `-${currencySymbol} ${Math.abs(netProfit).toFixed(2)}`}
                  </text>
                </g>

                {/* 6. Entry Badge on Right Axis */}
                <polygon
                  points={`${chartGeometry.plotWidth},${entryY} ${chartGeometry.plotWidth + 6},${entryY - 9} ${chartGeometry.plotWidth + 82},${entryY - 9} ${chartGeometry.plotWidth + 82},${entryY + 9} ${chartGeometry.plotWidth + 6},${entryY + 9}`}
                  fill="#FFFFFF"
                />
                <text
                  x={chartGeometry.plotWidth + 10}
                  y={entryY + 3.5}
                  fill="#0B0E14"
                  fontSize="9.5"
                  fontWeight="bold"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {isCall ? '▲' : '▼'} {ord.openPrice.toFixed(chartGeometry.decimals)}
                </text>
              </g>
            );
          })}

          {/* RECENT SETTLED ORDERS: Visual markers on chart history */}
          {recentSettledOrders.map((ord) => {
            const entryCandleIdx = visibleCandles.findIndex(
              (c) => ord.timestamp >= c.from && ord.timestamp < c.to
            );
            if (entryCandleIdx < 0) return null;
            const xCenter = entryCandleIdx * chartGeometry.stepX + chartGeometry.stepX / 2;
            const oY = chartGeometry.priceToY(ord.openPrice);
            const wasWin = ord.status === 'WIN';
            const wasEqual = ord.status === 'EQUAL';
            const markerColor = wasWin ? '#00E676' : wasEqual ? '#94A3B8' : '#FF3B30';

            return (
              <g key={`past_${ord.id}`} transform={`translate(${xCenter}, ${oY})`}>
                <circle r="4" fill={markerColor} stroke="#0B0E14" strokeWidth="1.5" />
                <title>{`${ord.direction} ${currencySymbol} ${ord.amount.toFixed(2)}: ${ord.status} (${ord.profit >= 0 ? '+' : ''}${ord.profit})`}</title>
              </g>
            );
          })}

          {/* Candlesticks (Wicks + Bodies) - Faithful IQ Option Green/Red */}
          {visibleCandles.map((c, idx) => {
            const xCenter = idx * chartGeometry.stepX + chartGeometry.stepX / 2;
            const yHigh = chartGeometry.priceToY(c.max);
            const yLow = chartGeometry.priceToY(c.min);
            const yOpen = chartGeometry.priceToY(c.open);
            const yClose = chartGeometry.priceToY(c.close);

            const colorType = getCandleColor(c);
            const isGreen = colorType === 'GREEN';
            const isRed = colorType === 'RED';

            const fillColor = isGreen ? '#00E676' : isRed ? '#FF3B30' : '#818CF8';
            const strokeColor = isGreen ? '#00C853' : isRed ? '#E52B20' : '#6366F1';

            const bodyTop = Math.min(yOpen, yClose);
            const bodyHeight = Math.max(2, Math.abs(yClose - yOpen));

            // Highlight the last 3 completed candles of the current MHI base
            const isMhiBaseCandle =
              idx >= visibleCandles.length - 4 && idx <= visibleCandles.length - 2;

            return (
              <g key={c.from}>
                {isMhiBaseCandle && (
                  <rect
                    x={xCenter - chartGeometry.stepX / 2}
                    y={10}
                    width={chartGeometry.stepX}
                    height={chartGeometry.height - 30}
                    fill="#3B82F6"
                    fillOpacity="0.07"
                  />
                )}
                {/* Candle Wick */}
                <line
                  x1={xCenter}
                  y1={yHigh}
                  x2={xCenter}
                  y2={yLow}
                  stroke={fillColor}
                  strokeWidth="1.2"
                />
                {/* Candle Body */}
                <rect
                  x={xCenter - chartGeometry.candleWidth / 2}
                  y={bodyTop}
                  width={chartGeometry.candleWidth}
                  height={bodyHeight}
                  fill={fillColor}
                  stroke={strokeColor}
                  strokeWidth="0.8"
                  rx="1"
                />
              </g>
            );
          })}

          {/* EMA 21 (Slow Moving Average - Vibrant Golden Yellow) */}
          <path
            d={chartGeometry.emaSlowPath}
            fill="none"
            stroke="#FFB300"
            strokeWidth="2"
            strokeLinecap="round"
          />

          {/* EMA 9 (Fast Moving Average - Vibrant Cyan/Green) */}
          <path
            d={chartGeometry.emaFastPath}
            fill="none"
            stroke="#00E5FF"
            strokeWidth="2"
            strokeLinecap="round"
          />

          {/* Live Price Line (Linha de Cotação Atual IQ Option) */}
          <line
            x1={0}
            y1={lastY}
            x2={chartGeometry.plotWidth}
            y2={lastY}
            stroke="#2563EB"
            strokeWidth="1.2"
            strokeDasharray="3 3"
          />

          {/* Pulsing Beacon on Current Candle */}
          <circle cx={lastX} cy={lastY} r="5" fill="#3B82F6" className="animate-ping opacity-60" />
          <circle cx={lastX} cy={lastY} r="3.5" fill="#60A5FA" stroke="#FFFFFF" strokeWidth="1" />

          {/* Pointed Live Price Tag on Right Axis (Estilo Oficial IQ Option) */}
          <polygon
            points={`${chartGeometry.plotWidth},${lastY} ${chartGeometry.plotWidth + 6},${lastY - 10} ${chartGeometry.plotWidth + 82},${lastY - 10} ${chartGeometry.plotWidth + 82},${lastY + 10} ${chartGeometry.plotWidth + 6},${lastY + 10}`}
            fill="#2563EB"
            filter="drop-shadow(0 2px 6px rgba(37,99,235,0.5))"
          />
          <text
            x={chartGeometry.plotWidth + 10}
            y={lastY + 3.5}
            fill="#FFFFFF"
            fontSize="10"
            fontWeight="bold"
            fontFamily="JetBrains Mono, monospace"
          >
            {currentPrice.toFixed(chartGeometry.decimals)}
          </text>

          {/* Interactive Crosshair Guidelines on Mouse Hover */}
          {crosshair && (
            <g pointerEvents="none">
              {/* Vertical Crosshair Line */}
              <line
                x1={crosshair.x}
                y1={0}
                x2={crosshair.x}
                y2={chartGeometry.height - 20}
                stroke="#64748B"
                strokeWidth="0.8"
                strokeDasharray="2 2"
              />
              {/* Horizontal Crosshair Line */}
              <line
                x1={0}
                y1={crosshair.y}
                x2={chartGeometry.plotWidth}
                y2={crosshair.y}
                stroke="#64748B"
                strokeWidth="0.8"
                strokeDasharray="2 2"
              />

              {/* Crosshair Price Badge on Right Axis */}
              <rect
                x={chartGeometry.plotWidth + 2}
                y={crosshair.y - 8}
                width={78}
                height={16}
                rx={2}
                fill="#1E293B"
                stroke="#475569"
                strokeWidth="1"
              />
              <text
                x={chartGeometry.plotWidth + 8}
                y={crosshair.y + 4}
                fill="#F8FAFC"
                fontSize="9.5"
                fontWeight="bold"
                fontFamily="JetBrains Mono, monospace"
              >
                {crosshair.price.toFixed(chartGeometry.decimals)}
              </text>

              {/* Crosshair Time Badge at Bottom */}
              <rect
                x={crosshair.x - 28}
                y={chartGeometry.height - 18}
                width={56}
                height={16}
                rx={2}
                fill="#1E293B"
                stroke="#475569"
                strokeWidth="1"
              />
              <text
                x={crosshair.x}
                y={chartGeometry.height - 6}
                fill="#F8FAFC"
                fontSize="9"
                fontWeight="bold"
                fontFamily="JetBrains Mono, monospace"
                textAnchor="middle"
              >
                {crosshair.time}
              </text>
            </g>
          )}
        </svg>

        {/* Bottom Strip: Active Trade Position Summary (Exatamente como IQ Option) */}
        {openOrders.length > 0 && primaryOpenOrder && (
          <div className="bg-[#080B10] border-t border-[#161D2A] px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs font-mono tabular-nums">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <span className="font-bold text-white">Opções ({openOrders.length})</span>
                <span
                  className={`font-black ${
                    totalOpenPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {totalOpenPnl >= 0
                    ? `+${currencySymbol} ${totalOpenPnl.toFixed(2)}`
                    : `-${currencySymbol} ${Math.abs(totalOpenPnl).toFixed(2)}`}
                </span>
              </div>
              <span className="text-slate-600">|</span>
              <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
                <span>
                  Nome: <strong className="text-white font-sans">{assetTicker}</strong>
                </span>
                <span>
                  Tipo: <strong className="text-slate-200">Binária</strong>
                </span>
                <span>
                  Expiração:{' '}
                  <strong className="text-amber-400">
                    00:{String(secondsRemainingInCandle).padStart(2, '0')}
                  </strong>
                </span>
                <span>
                  Investimento:{' '}
                  <strong className="text-white">
                    {currencySymbol} {primaryOpenOrder.amount.toFixed(2)}
                  </strong>
                </span>
                <span>
                  Abertura:{' '}
                  <strong className="text-slate-200">
                    {primaryOpenOrder.openPrice.toFixed(chartGeometry.decimals)}
                  </strong>
                </span>
                <span>
                  Preço Atual:{' '}
                  <strong
                    className={
                      currentPrice >= primaryOpenOrder.openPrice
                        ? 'text-emerald-400'
                        : 'text-red-400'
                    }
                  >
                    {currentPrice.toFixed(chartGeometry.decimals)}
                  </strong>
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
