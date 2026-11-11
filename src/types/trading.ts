export type AccountType = 'PRACTICE' | 'REAL';

export type TimeframeSeconds = 60 | 300 | 900; // M1 (60s), M5 (300s), M15 (900s)

export type MHIVariant = 'MHI_1' | 'MHI_2' | 'MHI_3';
export type MHIMode = 'MINORIA' | 'MAIORIA';

export type ManagementMode = 'FIXED' | 'MARTINGALE' | 'SOROS' | 'SOROSGALE';

export interface Candle {
  id: number;
  from: number; // unix timestamp in seconds
  to: number;
  open: number;
  close: number;
  min: number; // low
  max: number; // high
  volume: number;
}

export interface IQAsset {
  id: number;
  ticker: string;
  name: string;
  isOtc: boolean;
  payout: number;
  isOpen: boolean;
  category: 'binary' | 'digital';
}

export interface TechnicalSnapshot {
  ema9: number;
  ema21: number;
  ema200: number; // Institutional Macro EMA
  macroTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  macroTrendBlockedDirection: 'CALL' | 'PUT' | 'NONE';
  emaTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  emaCrossover: 'GOLDEN_CROSS' | 'DEATH_CROSS' | 'NONE';
  rsi14: number;
  rsiZone: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  bbPosition: 'ABOVE_UPPER' | 'BELOW_LOWER' | 'INSIDE';
  macdLine: number;
  macdSignal: number;
  macdHistogram: number;
  supportLevel: number;
  resistanceLevel: number;
  nearSupport: boolean;
  nearResistance: boolean;
  priceActionPattern: 'BULLISH_ENGULFING' | 'BEARISH_ENGULFING' | 'BULLISH_PINBAR' | 'BEARISH_PINBAR' | 'DOJI' | 'NONE';
}

export interface MHISignalAnalysis {
  quadrantStartTime: number;
  nextEntryTime: number;
  secondsUntilNextEntry: number;
  c1Color: 'GREEN' | 'RED' | 'DOJI';
  c2Color: 'GREEN' | 'RED' | 'DOJI';
  c3Color: 'GREEN' | 'RED' | 'DOJI';
  hasDojiInBase: boolean;
  rawDirection: 'CALL' | 'PUT' | 'NEUTRAL';
  finalDirection: 'CALL' | 'PUT' | 'WAIT' | 'BLOCKED';
  blockReasons: string[];
  confluenceReasons: string[];
  confidenceScore: number;
  isPreSignal: boolean;
  preSignalSecondsRemaining: number;
}

export interface StrategyConfig {
  mhiVariant: MHIVariant;
  mhiMode: MHIMode;
  blockOnDoji: boolean;
  timeframe: TimeframeSeconds;
  // Global Macro Trend Filter (e.g., EMA 200)
  useMacroTrendFilter: boolean;
  macroTrendPeriod: number; // e.g. 200, 100, 50
  macroTrendTimeframe: 'CURRENT' | 'M5' | 'M15';
  macroTrendRule: 'STRICT_BLOCK' | 'CONFLUENCE_SCORE';
  // Technical Confluence Filters
  useEmaFilter: boolean;
  emaFastPeriod: number;
  emaSlowPeriod: number;
  requireEmaAlignment: boolean; // CALL only if EMA9 > EMA21 and Close > EMA21
  useRsiFilter: boolean;
  rsiPeriod: number;
  rsiOverbought: number;
  rsiOversold: number;
  rsiMode: 'REVERSAL' | 'TREND'; // Reversal blocks CALL if >70; Trend requires >50 for CALL
  useBollingerFilter: boolean;
  bbPeriod: number;
  bbStdDev: number;
  useMacdFilter: boolean;
  useSrFilter: boolean;
  usePriceActionFilter: boolean;
  // News Filter
  useNewsFilter: boolean;
  minBullsToBlock: 2 | 3;
  pauseMinutesBeforeNews: number;
  pauseMinutesAfterNews: number;
  // Auto-select from Cataloger
  autoSyncTopCatalogPairs: boolean;
  minCatalogWinRate: number;
  // Timing & Delay Anticipation
  entryTimingSecond: 58 | 59 | 0; // Antecipação contra delay da corretora (59s padrão)
  audioAlertsEnabled: boolean;
}

export interface RiskConfig {
  accountType: AccountType;
  baseEntryAmount: number;
  stopWin: number;
  stopLoss: number;
  managementMode: ManagementMode;
  maxGales: 0 | 1 | 2;
  galeMultiplier: number; // e.g., 2.2
  sorosLevels: number; // e.g., 2, 3, 4
  sorosPayoutReinvestPercent: number; // e.g., 100%
  instrumentType: 'binary' | 'digital';
}

export interface RiskSessionState {
  sessionProfit: number;
  totalWins: number;
  totalLosses: number;
  currentGaleStep: 0 | 1 | 2;
  currentSorosLevel: number;
  accumulatedSorosProfit: number;
  sorosGaleRecoveryDebt: number;
  nextCalculatedStake: number;
  stopWinReached: boolean;
  stopLossReached: boolean;
}

export interface CatalogQuadrantResult {
  timestamp: number;
  formattedTime: string;
  direction: 'CALL' | 'PUT' | 'DOJI_SKIP';
  outcome: 'WIN_1ST' | 'WIN_G1' | 'WIN_G2' | 'LOSS' | 'DOJI_SKIP' | 'FILTERED_OUT';
  emaAligned: boolean;
  rsiValue: number;
}

export interface PairCatalogStats {
  asset: IQAsset;
  totalAnalyzedQuadrants: number;
  validSignalsCount: number;
  dojiSkippedCount: number;
  filteredByIndicatorsCount: number;
  winFirstCount: number;
  winGale1Count: number;
  winGale2Count: number;
  lossCount: number;
  winRateNoGale: number;
  winRateGale1: number;
  winRateGale2: number;
  currentStreak: {
    type: 'WIN' | 'LOSS';
    count: number;
  };
  currentTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  lastSignalDirection: 'CALL' | 'PUT' | 'WAIT';
  recentQuadrants: CatalogQuadrantResult[];
}

export interface StrategyCatalogBenchmark {
  strategyId: string;
  strategyName: string;
  mhiVariant: MHIVariant;
  mhiMode: MHIMode;
  useEmaFilter: boolean;
  useRsiFilter: boolean;
  useBollingerFilter: boolean;
  asset: IQAsset;
  totalSignals: number;
  winFirstCount: number;
  winGale1Count: number;
  winGale2Count: number;
  lossCount: number;
  winRateNoGale: number;
  winRateGale1: number;
  winRateGale2: number;
  currentStreak: {
    type: 'WIN' | 'LOSS';
    count: number;
  };
}

export interface TradeOrder {
  id: string;
  iqOptionOrderId?: number | string;
  timestamp: number;
  assetTicker: string;
  assetId: number;
  direction: 'CALL' | 'PUT';
  amount: number;
  payoutPercent: number;
  galeStep: 0 | 1 | 2;
  sorosLevel: number;
  strategyLabel: string;
  openPrice: number;
  closePrice?: number;
  status: 'OPEN' | 'WIN' | 'LOSS' | 'EQUAL' | 'REJECTED';
  profit: number;
  accountType: AccountType;
  brokerConfirmed?: boolean;
  brokerMessage?: string;
  notes?: string;
  expirationTimestamp?: number;
  timeframe?: number;
  signalId?: string;
}

export interface EconomicNewsEvent {
  id: string;
  time: string; // HH:mm
  timestamp: number;
  currency: 'USD' | 'EUR' | 'GBP' | 'JPY' | 'AUD' | 'CAD' | 'CHF' | 'BRL';
  title: string;
  bulls: 1 | 2 | 3;
  forecast: string;
  previous: string;
  actual?: string;
}

export interface IQConnectionStatus {
  connected: boolean;
  authenticated: boolean;
  connecting: boolean;
  email?: string;
  userId?: number;
  currency: string;
  realBalance: number;
  practiceBalance: number;
  activeBalanceType: AccountType;
  activeBalanceId?: number;
  serverTimestamp: number;
  lastError?: string;
  requires2FA?: boolean;
  wsLatencyMs: number;
}

export type BotMode = 'STRATEGY' | 'SIGNAL_LIST' | 'BOTH';

export interface ScheduledSignal {
  id: string;
  rawText: string;
  ticker: string;
  assetId: number;
  timeframe: TimeframeSeconds;
  timeStr: string; // HH:MM:SS or HH:MM
  targetTimestamp: number; // Unix timestamp in seconds
  direction: 'CALL' | 'PUT';
  status:
    | 'PENDING'
    | 'PRE_SIGNAL'
    | 'EXECUTING'
    | 'WIN_1ST'
    | 'WIN_G1'
    | 'WIN_G2'
    | 'LOSS'
    | 'BLOCKED_TREND'
    | 'BLOCKED_NEWS'
    | 'BLOCKED_PAYOUT'
    | 'SKIPPED';
  galeStep?: 0 | 1 | 2;
  profit?: number;
  enabled: boolean;
  orderId?: string;
  openPrice?: number;
  closePrice?: number;
}

export interface SignalListConfig {
  enabled: boolean;
  useEmaTrendFilter: boolean;
  useNewsFilter: boolean;
  minPayout: number;
  entryAdvanceSeconds: 58 | 59 | 0;
  maxGales: 0 | 1 | 2;
  galeMultiplier: number;
}

export interface ServerBotState {
  isRunning: boolean;
  botMode: BotMode;
  selectedBotAssetIds: number[];
  riskState: RiskSessionState;
  signalListConfig: SignalListConfig;
  scheduledSignals: ScheduledSignal[];
  lastUpdateTimestamp: number;
}
