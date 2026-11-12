import {
  Candle,
  IQAsset,
  MHISignalAnalysis,
  PairCatalogStats,
  StrategyConfig,
  StrategyVariant,
  TechnicalSnapshot,
  CatalogQuadrantResult,
  EconomicNewsEvent,
} from '../types/trading';

export const MAX_CATALOG_CANDLES = 1800;

export function getStartOfDaySeconds(
  timestampSeconds: number,
  timeZone = 'America/Sao_Paulo'
): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestampSeconds * 1000));
  const getPart = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');
  const localTimeAsUtc = Date.UTC(
    year,
    month - 1,
    day,
    getPart('hour'),
    getPart('minute'),
    getPart('second')
  );
  const offsetMs = localTimeAsUtc - timestampSeconds * 1000;

  return Math.floor((Date.UTC(year, month - 1, day) - offsetMs) / 1000);
}

export function getDailyCatalogCandleCount(
  timestampSeconds: number,
  timeframe: number,
  warmupCandles = 240
): number {
  const elapsedSinceMidnight = Math.max(
    0,
    timestampSeconds - getStartOfDaySeconds(timestampSeconds)
  );
  return Math.min(
    MAX_CATALOG_CANDLES,
    Math.max(240, Math.ceil(elapsedSinceMidnight / timeframe) + warmupCandles)
  );
}

export function getCandleColor(c: Candle): 'GREEN' | 'RED' | 'DOJI' {
  const diff = Math.abs(c.close - c.open);
  if (diff < 0.000001) return 'DOJI';
  return c.close > c.open ? 'GREEN' : 'RED';
}

export function calculateEMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const emaArray: number[] = new Array(values.length);
  emaArray[0] = values[0];
  for (let i = 1; i < values.length; i++) {
    emaArray[i] = values[i] * k + emaArray[i - 1] * (1 - k);
  }
  return emaArray;
}

export function calculateRSI(closes: number[], period = 14): number[] {
  const rsi: number[] = new Array(closes.length).fill(50);
  if (closes.length <= period) return rsi;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return rsi;
}

export function calculateBollingerBands(
  closes: number[],
  period = 20,
  stdDevMultiplier = 2
): { upper: number[]; middle: number[]; lower: number[] } {
  const upper: number[] = new Array(closes.length).fill(0);
  const middle: number[] = new Array(closes.length).fill(0);
  const lower: number[] = new Array(closes.length).fill(0);

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      middle[i] = closes[i];
      upper[i] = closes[i] * 1.001;
      lower[i] = closes[i] * 0.999;
      continue;
    }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += closes[j];
    }
    const sma = sum / period;
    let varianceSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      varianceSum += Math.pow(closes[j] - sma, 2);
    }
    const stdDev = Math.sqrt(varianceSum / period);
    middle[i] = sma;
    upper[i] = sma + stdDevMultiplier * stdDev;
    lower[i] = sma - stdDevMultiplier * stdDev;
  }

  return { upper, middle, lower };
}

export function calculateMACD(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): { macdLine: number[]; signalLine: number[]; histogram: number[] } {
  const emaFast = calculateEMA(closes, fastPeriod);
  const emaSlow = calculateEMA(closes, slowPeriod);
  const macdLine = closes.map((_, i) => (emaFast[i] ?? 0) - (emaSlow[i] ?? 0));
  const signalLine = calculateEMA(macdLine, signalPeriod);
  const histogram = macdLine.map((val, i) => val - (signalLine[i] ?? 0));
  return { macdLine, signalLine, histogram };
}

/**
 * Average True Range (ATR) & Normalized Volatility Percentage
 * TR = max(High - Low, |High - PrevClose|, |Low - PrevClose|)
 */
export function calculateATR(
  candles: Candle[],
  period = 14
): {
  atrValues: number[];
  atrPercentValues: number[];
  currentAtr: number;
  currentAtrPercent: number;
  averageAtr: number;
} {
  if (candles.length === 0) {
    return {
      atrValues: [],
      atrPercentValues: [],
      currentAtr: 0,
      currentAtrPercent: 0,
      averageAtr: 0,
    };
  }

  const trs: number[] = new Array(candles.length);
  trs[0] = candles[0].max - candles[0].min;

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].max;
    const low = candles[i].min;
    const prevClose = candles[i - 1].close;
    const hl = high - low;
    const hpc = Math.abs(high - prevClose);
    const lpc = Math.abs(low - prevClose);
    trs[i] = Math.max(hl, hpc, lpc);
  }

  const atr: number[] = new Array(candles.length).fill(0);
  const atrPercent: number[] = new Array(candles.length).fill(0);

  if (candles.length < period) {
    const simpleAvg = trs.reduce((a, b) => a + b, 0) / trs.length;
    const lastClose = candles[candles.length - 1].close || 1;
    return {
      atrValues: trs,
      atrPercentValues: trs.map((t, idx) => (t / (candles[idx]?.close || 1)) * 100),
      currentAtr: simpleAvg,
      currentAtrPercent: (simpleAvg / lastClose) * 100,
      averageAtr: simpleAvg,
    };
  }

  let firstSum = 0;
  for (let i = 0; i < period; i++) {
    firstSum += trs[i];
  }
  atr[period - 1] = firstSum / period;
  atrPercent[period - 1] = (atr[period - 1] / (candles[period - 1].close || 1)) * 100;

  for (let i = period; i < candles.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + trs[i]) / period;
    atrPercent[i] = (atr[i] / (candles[i].close || 1)) * 100;
  }

  const currentAtr = atr[atr.length - 1] || 0;
  const currentAtrPercent = atrPercent[atrPercent.length - 1] || 0;
  const recentSlice = atr.slice(-40).filter((v) => v > 0);
  const averageAtr = recentSlice.length > 0
    ? recentSlice.reduce((s, v) => s + v, 0) / recentSlice.length
    : currentAtr;

  return {
    atrValues: atr,
    atrPercentValues: atrPercent,
    currentAtr,
    currentAtrPercent,
    averageAtr,
  };
}

export interface MarketSentimentData {
  bullPower: number; // 0 - 100 (%)
  bearPower: number; // 0 - 100 (%)
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

/**
 * Calculates Market Sentiment / Bullish vs Bearish Volume Power from recent candles
 * Combines price spread (high-low delta) with volume distribution
 */
export function calculateMarketSentiment(candles: Candle[], lookback = 20): MarketSentimentData {
  if (candles.length === 0) {
    return { bullPower: 50, bearPower: 50, sentiment: 'NEUTRAL' };
  }

  const slice = candles.slice(-lookback);
  let totalBuyVolume = 0;
  let totalSellVolume = 0;

  for (const c of slice) {
    const high = c.max;
    const low = c.min;
    const open = c.open;
    const close = c.close;
    const range = Math.max(high - low, 0.000001);

    // Candle volume (fallback to price range delta if volume is 0 or undefined)
    const baseVolume = (c.volume && c.volume > 0) ? c.volume : (range * 100000);

    let buyFraction = 0.5;
    let sellFraction = 0.5;

    if (close > open) {
      // Bullish candle: buyers drove price from low to close
      buyFraction = Math.min(1, Math.max(0.05, (close - low) / range));
      sellFraction = Math.min(1, Math.max(0.05, (high - close) / range));
    } else if (close < open) {
      // Bearish candle: sellers drove price from high to close
      buyFraction = Math.min(1, Math.max(0.05, (close - low) / range));
      sellFraction = Math.min(1, Math.max(0.05, (high - close) / range));
    } else {
      buyFraction = 0.5;
      sellFraction = 0.5;
    }

    const normSum = buyFraction + sellFraction;
    const normBuy = buyFraction / normSum;
    const normSell = sellFraction / normSum;

    totalBuyVolume += baseVolume * normBuy;
    totalSellVolume += baseVolume * normSell;
  }

  const totalVol = Math.max(totalBuyVolume + totalSellVolume, 0.00001);
  let bullPower = Math.round((totalBuyVolume / totalVol) * 100);
  let bearPower = 100 - bullPower;

  bullPower = Math.min(100, Math.max(0, bullPower));
  bearPower = Math.min(100, Math.max(0, bearPower));

  let sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (bullPower >= 55) {
    sentiment = 'BULLISH';
  } else if (bearPower >= 55) {
    sentiment = 'BEARISH';
  }

  return { bullPower, bearPower, sentiment };
}

export function detectSupportResistance(candles: Candle[], lookback = 40): { support: number; resistance: number } {
  if (candles.length === 0) return { support: 0, resistance: 0 };
  const slice = candles.slice(-lookback);
  const lows = slice.map((c) => c.min).sort((a, b) => a - b);
  const highs = slice.map((c) => c.max).sort((a, b) => b - a);
  // Use 10th percentile low and 90th percentile high for robust S/R zone
  const idx = Math.min(2, Math.floor(slice.length * 0.1));
  return {
    support: lows[idx] ?? lows[0],
    resistance: highs[idx] ?? highs[0],
  };
}

export function detectPriceActionPattern(
  candles: Candle[]
): TechnicalSnapshot['priceActionPattern'] {
  if (candles.length < 2) return 'NONE';
  const curr = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  const currBody = Math.abs(curr.close - curr.open);
  const currRange = Math.max(curr.max - curr.min, 0.000001);
  const prevBody = Math.abs(prev.close - prev.open);

  if (currBody / currRange < 0.08) {
    return 'DOJI';
  }

  // Bullish Engulfing
  if (
    prev.close < prev.open &&
    curr.close > curr.open &&
    curr.close >= prev.open &&
    curr.open <= prev.close &&
    currBody > prevBody * 1.05
  ) {
    return 'BULLISH_ENGULFING';
  }

  // Bearish Engulfing
  if (
    prev.close > prev.open &&
    curr.close < curr.open &&
    curr.open >= prev.close &&
    curr.close <= prev.open &&
    currBody > prevBody * 1.05
  ) {
    return 'BEARISH_ENGULFING';
  }

  const upperWick = curr.max - Math.max(curr.open, curr.close);
  const lowerWick = Math.min(curr.open, curr.close) - curr.min;

  // Bullish Pinbar (Hammer)
  if (lowerWick > currBody * 2.1 && upperWick < currBody * 0.8) {
    return 'BULLISH_PINBAR';
  }

  // Bearish Pinbar (Shooting Star)
  if (upperWick > currBody * 2.1 && lowerWick < currBody * 0.8) {
    return 'BEARISH_PINBAR';
  }

  return 'NONE';
}

/**
 * Resamples candles into a higher timeframe (e.g. M1 -> M5 or M15)
 */
export function resampleCandles(candles: Candle[], targetTfSeconds: number): Candle[] {
  if (candles.length === 0 || targetTfSeconds <= 0) return candles;
  const sorted = [...candles].sort((a, b) => a.from - b.from);
  const buckets = new Map<number, Candle[]>();
  for (const c of sorted) {
    const bucketStart = Math.floor(c.from / targetTfSeconds) * targetTfSeconds;
    const list = buckets.get(bucketStart) || [];
    list.push(c);
    buckets.set(bucketStart, list);
  }
  const resampled: Candle[] = [];
  const keys = Array.from(buckets.keys()).sort((a, b) => a - b);
  for (const k of keys) {
    const group = buckets.get(k)!;
    const open = group[0].open;
    const close = group[group.length - 1].close;
    let min = Infinity;
    let max = -Infinity;
    let volume = 0;
    for (const c of group) {
      if (c.min < min) min = c.min;
      if (c.max > max) max = c.max;
      volume += c.volume || 0;
    }
    resampled.push({
      id: k,
      from: k,
      to: k + targetTfSeconds,
      open,
      close,
      min: isFinite(min) ? min : open,
      max: isFinite(max) ? max : close,
      volume,
    });
  }
  return resampled;
}

export function computeTechnicalSnapshot(
  candles: Candle[],
  config?: Partial<StrategyConfig>
): TechnicalSnapshot {
  if (candles.length === 0) {
    return {
      ema9: 0,
      ema21: 0,
      ema200: 0,
      macroTrend: 'NEUTRAL',
      macroTrendBlockedDirection: 'NONE',
      emaTrend: 'NEUTRAL',
      emaCrossover: 'NONE',
      rsi14: 50,
      rsiZone: 'NEUTRAL',
      bbUpper: 0,
      bbMiddle: 0,
      bbLower: 0,
      bbPosition: 'INSIDE',
      macdLine: 0,
      macdSignal: 0,
      macdHistogram: 0,
      supportLevel: 0,
      resistanceLevel: 0,
      nearSupport: false,
      nearResistance: false,
      priceActionPattern: 'NONE',
      atrValue: 0,
      atrPercent: 0,
      atrStatus: 'NORMAL',
      marketSentiment: {
        bullPower: 50,
        bearPower: 50,
        sentiment: 'NEUTRAL',
      },
    };
  }

  const closes = candles.map((c) => c.close);
  const fastP = config?.emaFastPeriod ?? 9;
  const slowP = config?.emaSlowPeriod ?? 21;
  const macroP = config?.macroTrendPeriod ?? 200;
  const rsiP = config?.rsiPeriod ?? 14;
  const bbP = config?.bbPeriod ?? 20;
  const bbStd = config?.bbStdDev ?? 2;

  const emaFastArr = calculateEMA(closes, fastP);
  const emaSlowArr = calculateEMA(closes, slowP);
  const rsiArr = calculateRSI(closes, rsiP);
  const bb = calculateBollingerBands(closes, bbP, bbStd);
  const macd = calculateMACD(closes);
  const sr = detectSupportResistance(candles, 45);
  const pa = detectPriceActionPattern(candles);

  const lastIdx = closes.length - 1;
  const prevIdx = Math.max(0, lastIdx - 1);
  const lastClose = closes[lastIdx];

  const ema9 = emaFastArr[lastIdx] ?? lastClose;
  const ema21 = emaSlowArr[lastIdx] ?? lastClose;
  const prevEma9 = emaFastArr[prevIdx] ?? ema9;
  const prevEma21 = emaSlowArr[prevIdx] ?? ema21;

  let emaCrossover: TechnicalSnapshot['emaCrossover'] = 'NONE';
  if (prevEma9 <= prevEma21 && ema9 > ema21) emaCrossover = 'GOLDEN_CROSS';
  else if (prevEma9 >= prevEma21 && ema9 < ema21) emaCrossover = 'DEATH_CROSS';

  const emaTrend: TechnicalSnapshot['emaTrend'] =
    ema9 > ema21 && lastClose >= ema21
      ? 'BULLISH'
      : ema9 < ema21 && lastClose <= ema21
      ? 'BEARISH'
      : 'NEUTRAL';

  // Compute Macro EMA 200 (including higher-timeframe resampling if configured)
  let ema200 = lastClose;
  const macroTf = config?.macroTrendTimeframe ?? 'CURRENT';
  if ((macroTf === 'M5' || macroTf === 'M15') && (config?.timeframe === 60 || !config?.timeframe)) {
    const targetSeconds = macroTf === 'M5' ? 300 : 900;
    const higherCandles = resampleCandles(candles, targetSeconds);
    if (higherCandles.length > 0) {
      const higherCloses = higherCandles.map((c) => c.close);
      const higherEma = calculateEMA(higherCloses, macroP);
      ema200 = higherEma[higherEma.length - 1] ?? lastClose;
    } else {
      const emaMacroArr = calculateEMA(closes, macroP);
      ema200 = emaMacroArr[lastIdx] ?? lastClose;
    }
  } else {
    const emaMacroArr = calculateEMA(closes, macroP);
    ema200 = emaMacroArr[lastIdx] ?? lastClose;
  }

  // Macro Trend Bias:
  // Preço acima da EMA 200 -> Tendência Macro de ALTA (Bloqueia PUT)
  // Preço abaixo da EMA 200 -> Tendência Macro de BAIXA (Bloqueia CALL)
  const macroDiff = lastClose - ema200;
  const macroThreshold = (lastClose * 0.00002) || 0.00002;
  const macroTrend: TechnicalSnapshot['macroTrend'] =
    macroDiff > macroThreshold
      ? 'BULLISH'
      : macroDiff < -macroThreshold
      ? 'BEARISH'
      : 'NEUTRAL';

  const macroTrendBlockedDirection: TechnicalSnapshot['macroTrendBlockedDirection'] =
    macroTrend === 'BEARISH'
      ? 'CALL' // Bloqueia CALL se o preço estiver abaixo da EMA 200
      : macroTrend === 'BULLISH'
      ? 'PUT' // Bloqueia PUT se o preço estiver acima da EMA 200
      : 'NONE';

  const rsi14 = rsiArr[lastIdx] ?? 50;
  const overbought = config?.rsiOverbought ?? 70;
  const oversold = config?.rsiOversold ?? 30;
  const rsiZone: TechnicalSnapshot['rsiZone'] =
    rsi14 >= overbought ? 'OVERBOUGHT' : rsi14 <= oversold ? 'OVERSOLD' : 'NEUTRAL';

  const bbUpper = bb.upper[lastIdx] ?? lastClose;
  const bbMiddle = bb.middle[lastIdx] ?? lastClose;
  const bbLower = bb.lower[lastIdx] ?? lastClose;

  const bbPosition: TechnicalSnapshot['bbPosition'] =
    lastClose >= bbUpper
      ? 'ABOVE_UPPER'
      : lastClose <= bbLower
      ? 'BELOW_LOWER'
      : 'INSIDE';

  const bandWidth = Math.max(bbUpper - bbLower, 0.0001);
  const nearSupport = Math.abs(lastClose - sr.support) <= bandWidth * 0.18;
  const nearResistance = Math.abs(sr.resistance - lastClose) <= bandWidth * 0.18;

  const atrPeriod = config?.atrPeriod ?? 14;
  const atrData = calculateATR(candles, atrPeriod);
  const minPercent = config?.atrMinPercent ?? 0.015;
  const maxPercent = config?.atrMaxPercent ?? 0.12;

  let atrStatus: TechnicalSnapshot['atrStatus'] = 'NORMAL';
  if (atrData.currentAtrPercent > maxPercent) {
    atrStatus = 'HIGH_VOLATILITY';
  } else if (atrData.currentAtrPercent < minPercent) {
    atrStatus = 'LOW_VOLATILITY';
  }

  const marketSentiment = calculateMarketSentiment(candles, 20);

  return {
    ema9,
    ema21,
    ema200,
    macroTrend,
    macroTrendBlockedDirection,
    emaTrend,
    emaCrossover,
    rsi14,
    rsiZone,
    bbUpper,
    bbMiddle,
    bbLower,
    bbPosition,
    macdLine: macd.macdLine[lastIdx] ?? 0,
    macdSignal: macd.signalLine[lastIdx] ?? 0,
    macdHistogram: macd.histogram[lastIdx] ?? 0,
    supportLevel: sr.support,
    resistanceLevel: sr.resistance,
    nearSupport,
    nearResistance,
    priceActionPattern: pa,
    atrValue: atrData.currentAtr,
    atrPercent: atrData.currentAtrPercent,
    atrStatus,
    marketSentiment,
  };
}

/**
 * Evaluates MHI signal and Indicator Confluence for live trading or cataloging
 */
export function evaluateMHIConfluence(
  candles: Candle[],
  config: StrategyConfig,
  activeNewsEvents: EconomicNewsEvent[] = [],
  assetTicker = 'EUR/USD',
  serverNowSeconds = Math.floor(Date.now() / 1000)
): MHISignalAnalysis {
  const tf = config.timeframe; // 60 for M1, 300 for M5
  const quadrantSizeCandles = 5; // 5 candles per quadrant (5m in M1, 25m/30m in M5)
  const quadrantSeconds = tf * quadrantSizeCandles;
  const currentQuadrantStart =
    Math.floor(serverNowSeconds / quadrantSeconds) * quadrantSeconds;

  const closedCandles = candles.filter((c) => c.to <= serverNowSeconds);
  const blockReasons: string[] = [];
  const confluenceReasons: string[] = [];
  let confidenceScore = 65;

  let chosenVariant = config.mhiVariant;
  let autoBestReason = '';

  // If AUTO_BEST, find the strategy with the best historical win rate on these candles
  if (chosenVariant === 'AUTO_BEST') {
    const candidateVariants: StrategyVariant[] = [
      'MHI_1',
      'MHI_2',
      'MHI_3',
      'MILHAO',
      'TORRES_GEMEAS',
      'PADRAO_23',
      'TRES_MOSQUETEIROS',
    ];
    let bestWinRate = -1;
    let bestVar: StrategyVariant = 'MHI_1';

    for (const v of candidateVariants) {
      const stats = catalogPairCandles(
        {
          id: 1,
          ticker: assetTicker,
          name: assetTicker,
          isOtc: false,
          payout: 85,
          isOpen: true,
          category: 'binary',
        },
        candles,
        { ...config, mhiVariant: v },
        getStartOfDaySeconds(serverNowSeconds)
      );
      if (stats.validSignalsCount >= 3 && stats.winRateGale1 > bestWinRate) {
        bestWinRate = stats.winRateGale1;
        bestVar = v;
      }
    }
    chosenVariant = bestVar;
    autoBestReason = `🎯 Auto-Estratégia: ${bestVar.replace('_', ' ')} selecionada (Win-Rate: ${bestWinRate > 0 ? bestWinRate.toFixed(1) + '%' : 'Alta Confluência'})`;
  }

  let nextEntryTime = currentQuadrantStart;
  let rawDirection: 'CALL' | 'PUT' | 'NEUTRAL' = 'NEUTRAL';
  let c1Color: 'GREEN' | 'RED' | 'DOJI' = 'DOJI';
  let c2Color: 'GREEN' | 'RED' | 'DOJI' = 'DOJI';
  let c3Color: 'GREEN' | 'RED' | 'DOJI' = 'DOJI';
  let hasDojiInBase = false;

  if (chosenVariant === 'MHI_1' || chosenVariant === 'MHI_2' || chosenVariant === 'MHI_3') {
    const variantOffset = chosenVariant === 'MHI_1' ? 0 : chosenVariant === 'MHI_2' ? 1 : 2;
    nextEntryTime = currentQuadrantStart + variantOffset * tf;
    if (serverNowSeconds >= nextEntryTime) {
      nextEntryTime = currentQuadrantStart + quadrantSeconds + variantOffset * tf;
    }
    const lastThree = closedCandles.slice(-3);
    c1Color = lastThree[0] ? getCandleColor(lastThree[0]) : 'DOJI';
    c2Color = lastThree[1] ? getCandleColor(lastThree[1]) : 'DOJI';
    c3Color = lastThree[2] ? getCandleColor(lastThree[2]) : 'DOJI';
    const colors = [c1Color, c2Color, c3Color];
    hasDojiInBase = colors.includes('DOJI');
    const greenCount = colors.filter((c) => c === 'GREEN').length;
    const redCount = colors.filter((c) => c === 'RED').length;
    if (greenCount !== redCount) {
      const majorityColor = greenCount > redCount ? 'GREEN' : 'RED';
      const minorityColor = greenCount < redCount ? 'GREEN' : 'RED';
      const targetColor = config.mhiMode === 'MINORIA' ? minorityColor : majorityColor;
      rawDirection = targetColor === 'GREEN' ? 'CALL' : 'PUT';
    }
    if (rawDirection !== 'NEUTRAL') {
      confluenceReasons.push(
        `${chosenVariant.replace('_', ' ')} (${config.mhiMode}): ${greenCount} Verde / ${redCount} Vermelha → ${rawDirection}`
      );
    }
  } else if (chosenVariant === 'MILHAO') {
    nextEntryTime = currentQuadrantStart;
    if (serverNowSeconds >= nextEntryTime) {
      nextEntryTime = currentQuadrantStart + quadrantSeconds;
    }
    const lastFive = closedCandles.slice(-5);
    const colors = lastFive.map((c) => getCandleColor(c));
    c1Color = colors[2] || 'DOJI';
    c2Color = colors[3] || 'DOJI';
    c3Color = colors[4] || 'DOJI';
    hasDojiInBase = colors.includes('DOJI');
    const greenCount = colors.filter((c) => c === 'GREEN').length;
    const redCount = colors.filter((c) => c === 'RED').length;
    if (greenCount !== redCount) {
      const majorityColor = greenCount > redCount ? 'GREEN' : 'RED';
      const minorityColor = greenCount < redCount ? 'GREEN' : 'RED';
      const targetColor = config.mhiMode === 'MINORIA' ? minorityColor : majorityColor;
      rawDirection = targetColor === 'GREEN' ? 'CALL' : 'PUT';
      confluenceReasons.push(
        `Padrão Milhão (${config.mhiMode}): Bloco 5 velas (${greenCount}V / ${redCount}R) → ${rawDirection}`
      );
    }
  } else if (chosenVariant === 'TORRES_GEMEAS') {
    nextEntryTime = currentQuadrantStart + 4 * tf;
    if (serverNowSeconds >= nextEntryTime) {
      nextEntryTime = currentQuadrantStart + quadrantSeconds + 4 * tf;
    }
    // Base is 1st candle of quadrant (offset 0)
    const baseCandle = closedCandles.find((c) => c.from === currentQuadrantStart) || closedCandles.slice(-4)[0];
    if (baseCandle) {
      const color = getCandleColor(baseCandle);
      c1Color = color;
      c2Color = color;
      c3Color = color;
      if (color === 'DOJI') hasDojiInBase = true;
      else {
        const target = config.mhiMode === 'MINORIA' ? (color === 'GREEN' ? 'RED' : 'GREEN') : color;
        rawDirection = target === 'GREEN' ? 'CALL' : 'PUT';
        confluenceReasons.push(`Torres Gêmeas: Vela 1 (${color}) espelhada na Vela 5 → ${rawDirection}`);
      }
    }
  } else if (chosenVariant === 'PADRAO_23') {
    nextEntryTime = currentQuadrantStart + 3 * tf;
    if (serverNowSeconds >= nextEntryTime) {
      nextEntryTime = currentQuadrantStart + quadrantSeconds + 3 * tf;
    }
    // Base is 2nd candle of quadrant (offset 1*tf)
    const baseCandle = closedCandles.find((c) => c.from === currentQuadrantStart + tf) || closedCandles.slice(-3)[0];
    if (baseCandle) {
      const color = getCandleColor(baseCandle);
      c1Color = color;
      c2Color = color;
      c3Color = color;
      if (color === 'DOJI') hasDojiInBase = true;
      else {
        const target = config.mhiMode === 'MINORIA' ? (color === 'GREEN' ? 'RED' : 'GREEN') : color;
        rawDirection = target === 'GREEN' ? 'CALL' : 'PUT';
        confluenceReasons.push(`Padrão 23: Vela 2 (${color}) espelhada na Vela 4 → ${rawDirection}`);
      }
    }
  } else if (chosenVariant === 'TRES_MOSQUETEIROS') {
    nextEntryTime = Math.floor(serverNowSeconds / tf) * tf + tf;
    const lastThree = closedCandles.slice(-3);
    c1Color = lastThree[0] ? getCandleColor(lastThree[0]) : 'DOJI';
    c2Color = lastThree[1] ? getCandleColor(lastThree[1]) : 'DOJI';
    c3Color = lastThree[2] ? getCandleColor(lastThree[2]) : 'DOJI';
    if (c1Color === 'DOJI' || c2Color === 'DOJI' || c3Color === 'DOJI') {
      hasDojiInBase = true;
    } else if (c1Color === 'GREEN' && c2Color === 'GREEN' && c3Color === 'GREEN') {
      rawDirection = 'CALL';
      confluenceReasons.push('Três Mosqueteiros: 3 velas verdes consecutivas → CALL em fluxo');
    } else if (c1Color === 'RED' && c2Color === 'RED' && c3Color === 'RED') {
      rawDirection = 'PUT';
      confluenceReasons.push('Três Mosqueteiros: 3 velas vermelhas consecutivas → PUT em fluxo');
    }
  }

  if (autoBestReason) confluenceReasons.unshift(autoBestReason);

  const secondsUntilNextEntry = Math.max(0, nextEntryTime - serverNowSeconds);

  if (hasDojiInBase && config.blockOnDoji) {
    blockReasons.push('Doji detectado nas velas base (Proteção Probabilística)');
  }

  if (rawDirection === 'NEUTRAL') {
    blockReasons.push('Aguardando formação de padrão probabilístico');
  }

  // Technical Confluence checks on closed candles
  const snap = computeTechnicalSnapshot(
    closedCandles.length > 0 ? closedCandles : candles,
    config
  );

  // 0. Filtro Avançado de Trend Global (Macro Tendência EMA 200)
  if (config.useMacroTrendFilter !== false && rawDirection !== 'NEUTRAL') {
    const macroPeriod = config.macroTrendPeriod || 200;
    if (rawDirection === 'CALL') {
      if (snap.macroTrend === 'BEARISH') {
        blockReasons.push(
          `Filtro de Trend Global: Preço abaixo da EMA ${macroPeriod} (Tendência Macro de Baixa). CALL bloqueado!`
        );
      } else if (snap.macroTrend === 'BULLISH') {
        confluenceReasons.push(
          `Macro Trend Alinhada: Preço acima da EMA ${macroPeriod} (Institucional de Alta)`
        );
        confidenceScore += 14;
      }
    } else if (rawDirection === 'PUT') {
      if (snap.macroTrend === 'BULLISH') {
        blockReasons.push(
          `Filtro de Trend Global: Preço acima da EMA ${macroPeriod} (Tendência Macro de Alta). PUT bloqueado!`
        );
      } else if (snap.macroTrend === 'BEARISH') {
        confluenceReasons.push(
          `Macro Trend Alinhada: Preço abaixo da EMA ${macroPeriod} (Institucional de Baixa)`
        );
        confidenceScore += 14;
      }
    }
  }

  // 1. EMA 9 / EMA 21
  if (rawDirection === 'CALL') {
    if (snap.ema9 > snap.ema21) {
      confluenceReasons.push('EMA 9 acima da EMA 21 (Tendência de Alta)');
      confidenceScore += 12;
    } else if (config.useEmaFilter && config.requireEmaAlignment) {
      blockReasons.push('Contra tendência: EMA 9 abaixo da EMA 21 para CALL');
    }
  } else if (rawDirection === 'PUT') {
    if (snap.ema9 < snap.ema21) {
      confluenceReasons.push('EMA 9 abaixo da EMA 21 (Tendência de Baixa)');
      confidenceScore += 12;
    } else if (config.useEmaFilter && config.requireEmaAlignment) {
      blockReasons.push('Contra tendência: EMA 9 acima da EMA 21 para PUT');
    }
  }

  // 2. RSI Filter
  if (config.useRsiFilter && rawDirection !== 'NEUTRAL') {
    if (config.rsiMode === 'REVERSAL') {
      if (rawDirection === 'CALL' && snap.rsi14 >= config.rsiOverbought) {
        blockReasons.push(`RSI sobrecomprado (${snap.rsi14.toFixed(1)} ≥ ${config.rsiOverbought}) bloqueia CALL`);
      } else if (rawDirection === 'PUT' && snap.rsi14 <= config.rsiOversold) {
        blockReasons.push(`RSI sobrevendido (${snap.rsi14.toFixed(1)} ≤ ${config.rsiOversold}) bloqueia PUT`);
      } else {
        confluenceReasons.push(`RSI favorável (${snap.rsi14.toFixed(1)})`);
        confidenceScore += 7;
      }
    } else {
      // TREND mode
      if (rawDirection === 'CALL' && snap.rsi14 < 50) {
        blockReasons.push(`RSI sem força compradora (${snap.rsi14.toFixed(1)} < 50)`);
      } else if (rawDirection === 'PUT' && snap.rsi14 > 50) {
        blockReasons.push(`RSI sem força vendedora (${snap.rsi14.toFixed(1)} > 50)`);
      } else {
        confluenceReasons.push(`Momentum RSI alinhado (${snap.rsi14.toFixed(1)})`);
        confidenceScore += 7;
      }
    }
  }

  // 3. Bollinger Bands
  if (config.useBollingerFilter && rawDirection !== 'NEUTRAL') {
    if (rawDirection === 'CALL' && snap.bbPosition === 'ABOVE_UPPER') {
      blockReasons.push('Preço esticado acima da Banda de Bollinger Superior');
    } else if (rawDirection === 'PUT' && snap.bbPosition === 'BELOW_LOWER') {
      blockReasons.push('Preço esticado abaixo da Banda de Bollinger Inferior');
    } else if (
      (rawDirection === 'CALL' && snap.bbPosition === 'BELOW_LOWER') ||
      (rawDirection === 'PUT' && snap.bbPosition === 'ABOVE_UPPER')
    ) {
      confluenceReasons.push('Exaustão na Banda de Bollinger a favor da reversão MHI');
      confidenceScore += 9;
    }
  }

  // 4. MACD Filter
  if (config.useMacdFilter && rawDirection !== 'NEUTRAL') {
    if (rawDirection === 'CALL' && snap.macdHistogram < 0) {
      blockReasons.push('Histograma MACD negativo para CALL');
    } else if (rawDirection === 'PUT' && snap.macdHistogram > 0) {
      blockReasons.push('Histograma MACD positivo para PUT');
    } else {
      confluenceReasons.push('Histograma MACD convergente');
      confidenceScore += 6;
    }
  }

  // 5. Support & Resistance
  if (config.useSrFilter && rawDirection !== 'NEUTRAL') {
    if (rawDirection === 'CALL' && snap.nearResistance) {
      blockReasons.push('Bloqueado: Preço batendo em zona de Resistência');
    } else if (rawDirection === 'PUT' && snap.nearSupport) {
      blockReasons.push('Bloqueado: Preço batendo em zona de Suporte');
    } else if (
      (rawDirection === 'CALL' && snap.nearSupport) ||
      (rawDirection === 'PUT' && snap.nearResistance)
    ) {
      confluenceReasons.push('Rejeição em zona de Suporte/Resistência');
      confidenceScore += 8;
    }
  }

  // 6. Price Action
  if (config.usePriceActionFilter && rawDirection !== 'NEUTRAL') {
    if (
      rawDirection === 'CALL' &&
      (snap.priceActionPattern === 'BEARISH_ENGULFING' ||
        snap.priceActionPattern === 'BEARISH_PINBAR')
    ) {
      blockReasons.push(`Padrão Price Action contrário (${snap.priceActionPattern})`);
    } else if (
      rawDirection === 'PUT' &&
      (snap.priceActionPattern === 'BULLISH_ENGULFING' ||
        snap.priceActionPattern === 'BULLISH_PINBAR')
    ) {
      blockReasons.push(`Padrão Price Action contrário (${snap.priceActionPattern})`);
    } else if (snap.priceActionPattern !== 'NONE' && snap.priceActionPattern !== 'DOJI') {
      confluenceReasons.push(`Gatilho Price Action: ${snap.priceActionPattern}`);
      confidenceScore += 8;
    }
  }

  // 7. Economic News Filter
  if (config.useNewsFilter && activeNewsEvents.length > 0) {
    const nowMs = serverNowSeconds * 1000;
    const beforeMs = config.pauseMinutesBeforeNews * 60 * 1000;
    const afterMs = config.pauseMinutesAfterNews * 60 * 1000;

    for (const ev of activeNewsEvents) {
      if (ev.bulls >= config.minBullsToBlock && assetTicker.includes(ev.currency)) {
        const diff = ev.timestamp - nowMs;
        if (diff >= -afterMs && diff <= beforeMs) {
          blockReasons.push(
            `Notícia ${ev.bulls} Touros (${ev.currency}: ${ev.title} às ${ev.time})`
          );
        }
      }
    }
  }

  // 8. ATR Volatility Filter (Average True Range)
  if (config.useAtrFilter && rawDirection !== 'NEUTRAL') {
    const minPercent = config.atrMinPercent ?? 0.015;
    const maxPercent = config.atrMaxPercent ?? 0.12;
    const mode = config.atrBlockMode ?? 'OUTSIDE_RANGE';

    const isHigh = snap.atrPercent > maxPercent;
    const isLow = snap.atrPercent < minPercent;

    if (isHigh && (mode === 'OUTSIDE_RANGE' || mode === 'HIGH_ONLY')) {
      blockReasons.push(
        `Filtro ATR: Volatilidade Excessiva (${snap.atrPercent.toFixed(3)}% > máx ${maxPercent.toFixed(3)}%) - Mercado com alta volatilidade/ruído!`
      );
    } else if (isLow && (mode === 'OUTSIDE_RANGE' || mode === 'LOW_ONLY')) {
      blockReasons.push(
        `Filtro ATR: Volatilidade Insuficiente (${snap.atrPercent.toFixed(3)}% < mín ${minPercent.toFixed(3)}%) - Mercado sem amplitude/risco de doji!`
      );
    } else {
      confluenceReasons.push(
        `Filtro ATR: Volatilidade Ideal (${snap.atrPercent.toFixed(3)}% na faixa ${minPercent.toFixed(3)}% a ${maxPercent.toFixed(3)}%)`
      );
      confidenceScore += 10;
    }
  }

  // 9. Market Sentiment & Volume Power Filter (Bullish vs Bearish Power)
  if (config.useSentimentFilter && rawDirection !== 'NEUTRAL') {
    const threshold = config.sentimentThreshold ?? 55;
    const { bullPower, bearPower, sentiment } = snap.marketSentiment;

    if (rawDirection === 'CALL') {
      if (sentiment === 'BEARISH' && bearPower >= threshold) {
        blockReasons.push(
          `Filtro de Sentimento: Pressão vendedora dominante (Ursos ${bearPower}% > ${threshold}%). Entrada CALL barrada!`
        );
      } else if (bullPower >= threshold) {
        confluenceReasons.push(
          `Sentimento Alinhado: Força Compradora dominante (Touros ${bullPower}% vs Ursos ${bearPower}%)`
        );
        confidenceScore += 10;
      }
    } else if (rawDirection === 'PUT') {
      if (sentiment === 'BULLISH' && bullPower >= threshold) {
        blockReasons.push(
          `Filtro de Sentimento: Pressão compradora dominante (Touros ${bullPower}% > ${threshold}%). Entrada PUT barrada!`
        );
      } else if (bearPower >= threshold) {
        confluenceReasons.push(
          `Sentimento Alinhado: Força Vendedora dominante (Ursos ${bearPower}% vs Touros ${bullPower}%)`
        );
        confidenceScore += 10;
      }
    }
  }

  confidenceScore = Math.min(99, Math.max(15, confidenceScore - blockReasons.length * 18));

  const isPreSignal = secondsUntilNextEntry <= 30 && secondsUntilNextEntry > 0;

  const finalDirection: MHISignalAnalysis['finalDirection'] =
    rawDirection === 'NEUTRAL'
      ? 'WAIT'
      : blockReasons.length > 0
      ? 'BLOCKED'
      : rawDirection;

  return {
    quadrantStartTime: currentQuadrantStart,
    nextEntryTime,
    secondsUntilNextEntry,
    c1Color,
    c2Color,
    c3Color,
    hasDojiInBase,
    rawDirection,
    finalDirection,
    blockReasons,
    confluenceReasons,
    confidenceScore,
    isPreSignal,
    preSignalSecondsRemaining: secondsUntilNextEntry,
  };
}

/**
 * Full Historical MHI + Indicators Cataloger for a currency pair
 */
export function catalogPairCandles(
  asset: IQAsset,
  candles: Candle[],
  config: StrategyConfig,
  catalogStartTimestamp = 0
): PairCatalogStats {
  const tf = config.timeframe; // 60 or 300
  const quadrantSeconds = tf * 5;
  const variantOffset =
    config.mhiVariant === 'MHI_1' ? 0 : config.mhiVariant === 'MHI_2' ? 1 : 2;

  const sorted = [...candles].sort((a, b) => a.from - b.from);
  const closes = sorted.map((c) => c.close);
  const emaFast = calculateEMA(closes, config.emaFastPeriod || 9);
  const emaSlow = calculateEMA(closes, config.emaSlowPeriod || 21);
  const emaMacro = calculateEMA(closes, config.macroTrendPeriod || 200);
  const rsiArr = calculateRSI(closes, config.rsiPeriod || 14);
  const atrData = calculateATR(sorted, config.atrPeriod || 14);

  // Map candle timestamp -> index in sorted array
  const timeToIndex = new Map<number, number>();
  sorted.forEach((c, idx) => {
    timeToIndex.set(c.from, idx);
  });

  // Group into 5-candle quadrants
  const quadrantStarts = new Set<number>();
  for (const c of sorted) {
    const qStart = Math.floor(c.from / quadrantSeconds) * quadrantSeconds;
    quadrantStarts.add(qStart);
  }

  const orderedQuadrants = Array.from(quadrantStarts).sort((a, b) => a - b);

  let totalAnalyzedQuadrants = 0;
  let validSignalsCount = 0;
  let dojiSkippedCount = 0;
  let filteredByIndicatorsCount = 0;
  let winFirstCount = 0;
  let winGale1Count = 0;
  let winGale2Count = 0;
  let lossCount = 0;

  const recentQuadrants: CatalogQuadrantResult[] = [];

  for (let qIdx = 0; qIdx < orderedQuadrants.length - 1; qIdx++) {
    const qStart = orderedQuadrants[qIdx];
    const nextQStart = qStart + quadrantSeconds;

    // Last 3 candles of current quadrant: offsets 2*tf, 3*tf, 4*tf
    const b1Idx = timeToIndex.get(qStart + 2 * tf);
    const b2Idx = timeToIndex.get(qStart + 3 * tf);
    const b3Idx = timeToIndex.get(qStart + 4 * tf);

    // Entry candle and Gale 1 & Gale 2 candles in next quadrant
    const entryTime = nextQStart + variantOffset * tf;
    if (entryTime < catalogStartTimestamp) continue;
    const e0Idx = timeToIndex.get(entryTime);
    const e1Idx = timeToIndex.get(entryTime + tf);
    const e2Idx = timeToIndex.get(entryTime + 2 * tf);

    if (
      b1Idx === undefined ||
      b2Idx === undefined ||
      b3Idx === undefined ||
      e0Idx === undefined ||
      e1Idx === undefined ||
      e2Idx === undefined
    ) {
      continue;
    }

    totalAnalyzedQuadrants++;

    const c1 = getCandleColor(sorted[b1Idx]);
    const c2 = getCandleColor(sorted[b2Idx]);
    const c3 = getCandleColor(sorted[b3Idx]);

    const dateObj = new Date(entryTime * 1000);
    const formattedTime = dateObj.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });

    if ((c1 === 'DOJI' || c2 === 'DOJI' || c3 === 'DOJI') && config.blockOnDoji) {
      dojiSkippedCount++;
      recentQuadrants.push({
        timestamp: entryTime,
        formattedTime,
        direction: 'DOJI_SKIP',
        outcome: 'DOJI_SKIP',
        emaAligned: false,
        rsiValue: rsiArr[b3Idx] ?? 50,
      });
      continue;
    }

    const greens = [c1, c2, c3].filter((c) => c === 'GREEN').length;
    const reds = [c1, c2, c3].filter((c) => c === 'RED').length;
    if (greens === reds) {
      dojiSkippedCount++;
      continue;
    }

    const minorityColor = greens < reds ? 'GREEN' : 'RED';
    const majorityColor = greens > reds ? 'GREEN' : 'RED';
    const targetColor = config.mhiMode === 'MINORIA' ? minorityColor : majorityColor;
    const direction: 'CALL' | 'PUT' = targetColor === 'GREEN' ? 'CALL' : 'PUT';

    // Check EMA alignment at b3Idx (decision point right before entry)
    const fastVal = emaFast[b3Idx] ?? sorted[b3Idx].close;
    const slowVal = emaSlow[b3Idx] ?? sorted[b3Idx].close;
    const rsiVal = rsiArr[b3Idx] ?? 50;

    const emaAligned =
      (direction === 'CALL' && fastVal > slowVal) ||
      (direction === 'PUT' && fastVal < slowVal);

    // 0. Macro Trend Filter (EMA 200 Global)
    if (config.useMacroTrendFilter) {
      const macroVal = emaMacro[b3Idx] ?? sorted[b3Idx].close;
      const isCallBlocked = direction === 'CALL' && sorted[b3Idx].close < macroVal;
      const isPutBlocked = direction === 'PUT' && sorted[b3Idx].close > macroVal;
      if (isCallBlocked || isPutBlocked) {
        filteredByIndicatorsCount++;
        recentQuadrants.push({
          timestamp: entryTime,
          formattedTime,
          direction,
          outcome: 'FILTERED_OUT',
          emaAligned: false,
          rsiValue: rsiVal,
        });
        continue;
      }
    }

    if (config.useEmaFilter && config.requireEmaAlignment && !emaAligned) {
      filteredByIndicatorsCount++;
      recentQuadrants.push({
        timestamp: entryTime,
        formattedTime,
        direction,
        outcome: 'FILTERED_OUT',
        emaAligned,
        rsiValue: rsiVal,
      });
      continue;
    }

    if (config.useRsiFilter) {
      if (
        (direction === 'CALL' && rsiVal >= config.rsiOverbought) ||
        (direction === 'PUT' && rsiVal <= config.rsiOversold)
      ) {
        filteredByIndicatorsCount++;
        recentQuadrants.push({
          timestamp: entryTime,
          formattedTime,
          direction,
          outcome: 'FILTERED_OUT',
          emaAligned,
          rsiValue: rsiVal,
        });
        continue;
      }
    }

    if (config.useAtrFilter) {
      const currentAtrPct = atrData.atrPercentValues[b3Idx] ?? 0;
      const minPercent = config.atrMinPercent ?? 0.015;
      const maxPercent = config.atrMaxPercent ?? 0.12;
      const mode = config.atrBlockMode ?? 'OUTSIDE_RANGE';
      const isHigh = currentAtrPct > maxPercent;
      const isLow = currentAtrPct < minPercent;
      if (
        (isHigh && (mode === 'OUTSIDE_RANGE' || mode === 'HIGH_ONLY')) ||
        (isLow && (mode === 'OUTSIDE_RANGE' || mode === 'LOW_ONLY'))
      ) {
        filteredByIndicatorsCount++;
        recentQuadrants.push({
          timestamp: entryTime,
          formattedTime,
          direction,
          outcome: 'FILTERED_OUT',
          emaAligned,
          rsiValue: rsiVal,
        });
        continue;
      }
    }

    validSignalsCount++;

    const res0 = getCandleColor(sorted[e0Idx]);
    const res1 = getCandleColor(sorted[e1Idx]);
    const res2 = getCandleColor(sorted[e2Idx]);

    let outcome: CatalogQuadrantResult['outcome'] = 'LOSS';
    if (res0 === targetColor) {
      winFirstCount++;
      outcome = 'WIN_1ST';
    } else if (res1 === targetColor) {
      winGale1Count++;
      outcome = 'WIN_G1';
    } else if (res2 === targetColor) {
      winGale2Count++;
      outcome = 'WIN_G2';
    } else {
      lossCount++;
      outcome = 'LOSS';
    }

    recentQuadrants.push({
      timestamp: entryTime,
      formattedTime,
      direction,
      outcome,
      emaAligned,
      rsiValue: rsiVal,
    });
  }

  const denom = Math.max(1, validSignalsCount);
  const winRateNoGale = (winFirstCount / denom) * 100;
  const winRateGale1 = ((winFirstCount + winGale1Count) / denom) * 100;
  const winRateGale2 = ((winFirstCount + winGale1Count + winGale2Count) / denom) * 100;

  // Calculate streak on valid outcomes
  const validOutcomes = recentQuadrants.filter(
    (q) => q.outcome !== 'DOJI_SKIP' && q.outcome !== 'FILTERED_OUT'
  );
  let streakType: 'WIN' | 'LOSS' = 'WIN';
  let streakCount = 0;

  if (validOutcomes.length > 0) {
    const lastIsWin = validOutcomes[validOutcomes.length - 1].outcome !== 'LOSS';
    streakType = lastIsWin ? 'WIN' : 'LOSS';
    for (let i = validOutcomes.length - 1; i >= 0; i--) {
      const isWin = validOutcomes[i].outcome !== 'LOSS';
      if (isWin === lastIsWin) streakCount++;
      else break;
    }
  }

  const lastIdx = closes.length - 1;
  const currentTrend: PairCatalogStats['currentTrend'] =
    lastIdx >= 0 && (emaFast[lastIdx] ?? 0) > (emaSlow[lastIdx] ?? 0)
      ? 'BULLISH'
      : lastIdx >= 0 && (emaFast[lastIdx] ?? 0) < (emaSlow[lastIdx] ?? 0)
      ? 'BEARISH'
      : 'NEUTRAL';

  const lastSignal =
    validOutcomes.length > 0 ? validOutcomes[validOutcomes.length - 1].direction : 'WAIT';

  return {
    asset,
    totalAnalyzedQuadrants,
    validSignalsCount,
    dojiSkippedCount,
    filteredByIndicatorsCount,
    winFirstCount,
    winGale1Count,
    winGale2Count,
    lossCount,
    winRateNoGale,
    winRateGale1,
    winRateGale2,
    currentStreak: {
      type: streakType,
      count: streakCount,
    },
    currentTrend,
    lastSignalDirection: lastSignal === 'DOJI_SKIP' ? 'WAIT' : lastSignal,
    recentQuadrants: recentQuadrants.slice(-18).reverse(),
  };
}

export const CATALOG_STRATEGY_PRESETS: {
  id: string;
  name: string;
  mhiVariant: StrategyConfig['mhiVariant'];
  mhiMode: StrategyConfig['mhiMode'];
  useEmaFilter: boolean;
  useRsiFilter: boolean;
  useBollingerFilter: boolean;
}[] = [
  {
    id: 'MHI1_MIN',
    name: 'MHI 1 — Minoria (Padrão)',
    mhiVariant: 'MHI_1',
    mhiMode: 'MINORIA',
    useEmaFilter: false,
    useRsiFilter: false,
    useBollingerFilter: false,
  },
  {
    id: 'MHI2_MIN',
    name: 'MHI 2 — Minoria',
    mhiVariant: 'MHI_2',
    mhiMode: 'MINORIA',
    useEmaFilter: false,
    useRsiFilter: false,
    useBollingerFilter: false,
  },
  {
    id: 'MHI3_MIN',
    name: 'MHI 3 — Minoria',
    mhiVariant: 'MHI_3',
    mhiMode: 'MINORIA',
    useEmaFilter: false,
    useRsiFilter: false,
    useBollingerFilter: false,
  },
  {
    id: 'MHI1_MAI',
    name: 'MHI 1 — Maioria (Fluxo)',
    mhiVariant: 'MHI_1',
    mhiMode: 'MAIORIA',
    useEmaFilter: false,
    useRsiFilter: false,
    useBollingerFilter: false,
  },
  {
    id: 'MHI2_MAI',
    name: 'MHI 2 — Maioria (Fluxo)',
    mhiVariant: 'MHI_2',
    mhiMode: 'MAIORIA',
    useEmaFilter: false,
    useRsiFilter: false,
    useBollingerFilter: false,
  },
  {
    id: 'MHI1_EMA',
    name: 'MHI 1 + Tendência EMA 9/21',
    mhiVariant: 'MHI_1',
    mhiMode: 'MINORIA',
    useEmaFilter: true,
    useRsiFilter: false,
    useBollingerFilter: false,
  },
  {
    id: 'MHI2_EMA',
    name: 'MHI 2 + Tendência EMA 9/21',
    mhiVariant: 'MHI_2',
    mhiMode: 'MINORIA',
    useEmaFilter: true,
    useRsiFilter: false,
    useBollingerFilter: false,
  },
  {
    id: 'MHI_CONFLUENCE_FULL',
    name: 'MHI + EMA 9/21 + RSI + Bollinger',
    mhiVariant: 'MHI_1',
    mhiMode: 'MINORIA',
    useEmaFilter: true,
    useRsiFilter: true,
    useBollingerFilter: true,
  },
  {
    id: 'MILHAO_MIN',
    name: 'Padrão Milhão — Minoria',
    mhiVariant: 'MILHAO',
    mhiMode: 'MINORIA',
    useEmaFilter: false,
    useRsiFilter: false,
    useBollingerFilter: false,
  },
  {
    id: 'MILHAO_MAI',
    name: 'Padrão Milhão — Maioria',
    mhiVariant: 'MILHAO',
    mhiMode: 'MAIORIA',
    useEmaFilter: false,
    useRsiFilter: false,
    useBollingerFilter: false,
  },
  {
    id: 'TORRES_GEMEAS',
    name: 'Torres Gêmeas (Vela 1 = Vela 5)',
    mhiVariant: 'TORRES_GEMEAS',
    mhiMode: 'MAIORIA',
    useEmaFilter: false,
    useRsiFilter: false,
    useBollingerFilter: false,
  },
  {
    id: 'PADRAO_23',
    name: 'Padrão 23 (Vela 2 = Vela 4)',
    mhiVariant: 'PADRAO_23',
    mhiMode: 'MAIORIA',
    useEmaFilter: false,
    useRsiFilter: false,
    useBollingerFilter: false,
  },
  {
    id: 'TRES_MOSQUETEIROS',
    name: 'Três Mosqueteiros (Seguimento de Fluxo)',
    mhiVariant: 'TRES_MOSQUETEIROS',
    mhiMode: 'MAIORIA',
    useEmaFilter: false,
    useRsiFilter: false,
    useBollingerFilter: false,
  },
];

export function catalogAllStrategies(
  assets: IQAsset[],
  candlesByAsset: Record<number, Candle[]>,
  baseConfig: StrategyConfig,
  catalogStartTimestamp = 0
) {
  const benchmarks = [];
  for (const asset of assets) {
    const candles = candlesByAsset[asset.id] || [];
    if (candles.length === 0) continue;

    for (const preset of CATALOG_STRATEGY_PRESETS) {
      const cfg: StrategyConfig = {
        ...baseConfig,
        mhiVariant: preset.mhiVariant,
        mhiMode: preset.mhiMode,
        useEmaFilter: preset.useEmaFilter,
        requireEmaAlignment: preset.useEmaFilter,
        useRsiFilter: preset.useRsiFilter,
        useBollingerFilter: preset.useBollingerFilter,
      };
      const stats = catalogPairCandles(asset, candles, cfg, catalogStartTimestamp);
      benchmarks.push({
        strategyId: preset.id,
        strategyName: preset.name,
        mhiVariant: preset.mhiVariant,
        mhiMode: preset.mhiMode,
        useEmaFilter: preset.useEmaFilter,
        useRsiFilter: preset.useRsiFilter,
        useBollingerFilter: preset.useBollingerFilter,
        asset,
        totalSignals: stats.validSignalsCount,
        winFirstCount: stats.winFirstCount,
        winGale1Count: stats.winGale1Count,
        winGale2Count: stats.winGale2Count,
        lossCount: stats.lossCount,
        winRateNoGale: stats.winRateNoGale,
        winRateGale1: stats.winRateGale1,
        winRateGale2: stats.winRateGale2,
        currentStreak: stats.currentStreak,
      });
    }
  }
  return benchmarks.sort((a, b) => b.winRateGale1 - a.winRateGale1 || b.winRateNoGale - a.winRateNoGale);
}

export interface VolatilityAnalysis {
  isHighVolatility: boolean;
  currentStdDev: number;
  movingAverageStdDev: number;
  excessPercent: number; // e.g. +28%
  signalMessage: string;
}

export function calculateVolatilityIndicator(
  candles: Candle[],
  windowPeriod = 10,
  maPeriod = 25
): VolatilityAnalysis {
  if (!candles || candles.length < windowPeriod) {
    return {
      isHighVolatility: false,
      currentStdDev: 0,
      movingAverageStdDev: 0,
      excessPercent: 0,
      signalMessage: 'Aguardando velas suficientes para análise de volatilidade',
    };
  }

  // 1. Calculate standard deviation for each rolling window of 10 candles
  const stdDevs: number[] = [];
  const closes = candles.map((c) => c.close);

  for (let i = windowPeriod - 1; i < closes.length; i++) {
    const windowCloses = closes.slice(i - windowPeriod + 1, i + 1);
    const mean = windowCloses.reduce((s, v) => s + v, 0) / windowPeriod;
    const variance =
      windowCloses.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / windowPeriod;
    stdDevs.push(Math.sqrt(variance));
  }

  if (stdDevs.length === 0) {
    return {
      isHighVolatility: false,
      currentStdDev: 0,
      movingAverageStdDev: 0,
      excessPercent: 0,
      signalMessage: 'Dados insuficientes',
    };
  }

  const currentStdDev = stdDevs[stdDevs.length - 1];
  // 2. Moving average of volatility (the last maPeriod rolling standard deviations)
  const maSlice = stdDevs.slice(-maPeriod);
  const movingAverageStdDev =
    maSlice.reduce((s, v) => s + v, 0) / Math.max(1, maSlice.length);

  // 3. Excess calculation: excess = (current - MA) / MA
  const excess =
    movingAverageStdDev > 0
      ? (currentStdDev - movingAverageStdDev) / movingAverageStdDev
      : 0;
  const excessPercent = Math.round(excess * 100);

  // Triggered when the standard deviation of the last 10 candles is 20% above the moving average
  const isHighVolatility = excess >= 0.2;

  return {
    isHighVolatility,
    currentStdDev,
    movingAverageStdDev,
    excessPercent,
    signalMessage: isHighVolatility
      ? `Alta Volatilidade (+${excessPercent}% acima da média): Desvio padrão das últimas 10 velas elevado. Cuidado com possíveis rompimentos falsos!`
      : `Volatilidade Normal (${excessPercent >= 0 ? '+' : ''}${excessPercent}%)`,
  };
}

