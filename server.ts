import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import { computeTechnicalSnapshot } from './src/utils/indicators';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSION_FILE_PATH = '/tmp/quantiq_iq_session.json';
const ORDERS_FILE_PATH = '/tmp/quantiq_orders.json';
const BOT_STATE_FILE_PATH = '/tmp/quantiq_bot_state.json';

interface TradeOrder {
  id: string;
  iqOptionOrderId: string;
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
  accountType: 'PRACTICE' | 'REAL';
  expirationTimestamp?: number;
  timeframe?: number;
  signalId?: string;
  notes?: string;
  brokerConfirmed?: boolean;
  brokerMessage?: string;
}

interface ServerScheduledSignal {
  id: string;
  rawText: string;
  ticker: string;
  assetId: number;
  timeframe: number;
  timeStr: string;
  targetTimestamp: number;
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
    | 'BLOCKED_SIMULTANEOUS'
    | 'BLOCKED_OVERLAP'
    | 'SKIPPED';
  galeStep?: 0 | 1 | 2;
  profit?: number;
  enabled: boolean;
  orderId?: string;
  openPrice?: number;
  closePrice?: number;
}

interface ServerBotState {
  isRunning: boolean;
  botMode: 'STRATEGY' | 'SIGNAL_LIST' | 'BOTH';
  selectedBotAssetIds: number[];
  riskConfig: {
    accountType: 'PRACTICE' | 'REAL';
    baseEntryAmount: number;
    stopWin: number;
    stopLoss: number;
    managementMode: 'FIXED' | 'MARTINGALE' | 'SOROS' | 'SOROSGALE';
    maxGales: 0 | 1 | 2;
    galeMultiplier: number;
    sorosLevels: number;
    sorosPayoutReinvestPercent: number;
    instrumentType: 'binary' | 'digital';
  };
  strategyConfig: {
    mhiVariant: 'MHI_1' | 'MHI_2' | 'MHI_3';
    mhiMode: 'MINORIA' | 'MAIORIA';
    blockOnDoji: boolean;
    timeframe: 60 | 300;
    entryTimingSecond: 58 | 59 | 0;
    useMacroTrendFilter?: boolean;
    macroTrendPeriod?: number;
    macroTrendTimeframe?: 'CURRENT' | 'M5' | 'M15';
    macroTrendRule?: 'STRICT_BLOCK' | 'CONFLUENCE_SCORE';
    useEmaFilter?: boolean;
    emaFastPeriod?: number;
    emaSlowPeriod?: number;
    requireEmaAlignment?: boolean;
    useRsiFilter?: boolean;
    rsiPeriod?: number;
    rsiOverbought?: number;
    rsiOversold?: number;
    rsiMode?: 'REVERSAL' | 'TREND';
    useBollingerFilter?: boolean;
    bbPeriod?: number;
    bbStdDev?: number;
    useMacdFilter?: boolean;
    useSrFilter?: boolean;
    usePriceActionFilter?: boolean;
  };
  signalListConfig: {
    enabled: boolean;
    useEmaTrendFilter: boolean;
    useNewsFilter: boolean;
    minPayout: number;
    entryAdvanceSeconds: 58 | 59 | 0;
    maxGales: 0 | 1 | 2;
    galeMultiplier: number;
  };
  scheduledSignals: ServerScheduledSignal[];
  riskState: {
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
  };
}

function loadOrdersFromDisk(): TradeOrder[] {
  try {
    if (fs.existsSync(ORDERS_FILE_PATH)) {
      const data = JSON.parse(fs.readFileSync(ORDERS_FILE_PATH, 'utf-8'));
      if (Array.isArray(data)) return data;
    }
  } catch {
    // ignore
  }
  return [];
}

function saveOrdersToDisk(orders: TradeOrder[]) {
  try {
    fs.writeFileSync(ORDERS_FILE_PATH, JSON.stringify(orders.slice(0, 500), null, 2), 'utf-8');
  } catch {
    // ignore
  }
}

function loadBotStateFromDisk(): ServerBotState {
  try {
    if (fs.existsSync(BOT_STATE_FILE_PATH)) {
      const data = JSON.parse(fs.readFileSync(BOT_STATE_FILE_PATH, 'utf-8'));
      if (data && typeof data.isRunning === 'boolean') return data;
    }
  } catch {
    // ignore
  }
  return {
    isRunning: false,
    botMode: 'STRATEGY',
    selectedBotAssetIds: [1, 2, 76],
    riskConfig: {
      accountType: 'PRACTICE',
      baseEntryAmount: 20,
      stopWin: 200,
      stopLoss: 120,
      managementMode: 'MARTINGALE',
      maxGales: 2,
      galeMultiplier: 2.2,
      sorosLevels: 3,
      sorosPayoutReinvestPercent: 100,
      instrumentType: 'binary',
    },
    strategyConfig: {
      mhiVariant: 'MHI_1',
      mhiMode: 'MINORIA',
      blockOnDoji: true,
      timeframe: 60,
      entryTimingSecond: 59,
      useMacroTrendFilter: true,
      macroTrendPeriod: 200,
      macroTrendTimeframe: 'CURRENT',
      macroTrendRule: 'STRICT_BLOCK',
    },
    signalListConfig: {
      enabled: true,
      useEmaTrendFilter: true,
      useNewsFilter: true,
      minPayout: 80,
      entryAdvanceSeconds: 59,
      maxGales: 2,
      galeMultiplier: 2.2,
    },
    scheduledSignals: [],
    riskState: {
      sessionProfit: 0,
      totalWins: 0,
      totalLosses: 0,
      currentGaleStep: 0,
      currentSorosLevel: 1,
      accumulatedSorosProfit: 0,
      sorosGaleRecoveryDebt: 0,
      nextCalculatedStake: 20,
      stopWinReached: false,
      stopLossReached: false,
    },
  };
}

function saveBotStateToDisk(state: ServerBotState) {
  try {
    fs.writeFileSync(BOT_STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    // ignore
  }
}

interface Candle {
  id: number;
  from: number;
  to: number;
  open: number;
  close: number;
  min: number;
  max: number;
  volume: number;
}

interface BotSignalCandidate {
  source: 'SIGNAL_LIST' | 'STRATEGY';
  assetId: number;
  ticker: string;
  direction: 'CALL' | 'PUT';
  timeframe: number;
  payout: number;
  confluenceCount: number;
  historicalScore?: number;
  strategyLabel: string;
  signal?: ServerScheduledSignal;
}

interface TelegramSettingsPatch {
  enabled?: boolean;
  chatId?: string;
  token?: string;
  clearToken?: boolean;
  alertSignals?: boolean;
  alertOrderResults?: boolean;
}

interface IQAsset {
  id: number;
  ticker: string;
  name: string;
  isOtc: boolean;
  payout: number;
  isOpen: boolean;
  category: 'binary' | 'digital';
}

const DEFAULT_ASSETS: IQAsset[] = [
  // Mercado Normal (Aberto) — 15 Pares
  { id: 1, ticker: 'EUR/USD', name: 'EUR/USD', isOtc: false, payout: 89, isOpen: true, category: 'binary' },
  { id: 2, ticker: 'GBP/USD', name: 'GBP/USD', isOtc: false, payout: 88, isOpen: true, category: 'binary' },
  { id: 3, ticker: 'EUR/JPY', name: 'EUR/JPY', isOtc: false, payout: 87, isOpen: true, category: 'binary' },
  { id: 4, ticker: 'USD/JPY', name: 'USD/JPY', isOtc: false, payout: 87, isOpen: true, category: 'binary' },
  { id: 5, ticker: 'AUD/CAD', name: 'AUD/CAD', isOtc: false, payout: 86, isOpen: true, category: 'binary' },
  { id: 6, ticker: 'GBP/JPY', name: 'GBP/JPY', isOtc: false, payout: 88, isOpen: true, category: 'digital' },
  { id: 7, ticker: 'EUR/GBP', name: 'EUR/GBP', isOtc: false, payout: 85, isOpen: true, category: 'binary' },
  { id: 8, ticker: 'AUD/USD', name: 'AUD/USD', isOtc: false, payout: 86, isOpen: true, category: 'binary' },
  { id: 9, ticker: 'USD/CAD', name: 'USD/CAD', isOtc: false, payout: 86, isOpen: true, category: 'binary' },
  { id: 10, ticker: 'USD/CHF', name: 'USD/CHF', isOtc: false, payout: 85, isOpen: true, category: 'binary' },
  { id: 11, ticker: 'EUR/AUD', name: 'EUR/AUD', isOtc: false, payout: 87, isOpen: true, category: 'digital' },
  { id: 12, ticker: 'EUR/CAD', name: 'EUR/CAD', isOtc: false, payout: 86, isOpen: true, category: 'binary' },
  { id: 13, ticker: 'GBP/CHF', name: 'GBP/CHF', isOtc: false, payout: 85, isOpen: true, category: 'digital' },
  { id: 14, ticker: 'AUD/JPY', name: 'AUD/JPY', isOtc: false, payout: 87, isOpen: true, category: 'binary' },
  { id: 15, ticker: 'NZD/USD', name: 'NZD/USD', isOtc: false, payout: 85, isOpen: true, category: 'binary' },

  // Mercado OTC (24/7 IQ Option) — 15 Pares
  { id: 76, ticker: 'EUR/USD (OTC)', name: 'EUR/USD (OTC)', isOtc: true, payout: 92, isOpen: true, category: 'binary' },
  { id: 77, ticker: 'GBP/USD (OTC)', name: 'GBP/USD (OTC)', isOtc: true, payout: 91, isOpen: true, category: 'binary' },
  { id: 78, ticker: 'USD/CHF (OTC)', name: 'USD/CHF (OTC)', isOtc: true, payout: 90, isOpen: true, category: 'digital' },
  { id: 79, ticker: 'EUR/JPY (OTC)', name: 'EUR/JPY (OTC)', isOtc: true, payout: 91, isOpen: true, category: 'binary' },
  { id: 80, ticker: 'AUD/CAD (OTC)', name: 'AUD/CAD (OTC)', isOtc: true, payout: 89, isOpen: true, category: 'binary' },
  { id: 81, ticker: 'USD/BRL (OTC)', name: 'USD/BRL (OTC)', isOtc: true, payout: 93, isOpen: true, category: 'digital' },
  { id: 82, ticker: 'GBP/JPY (OTC)', name: 'GBP/JPY (OTC)', isOtc: true, payout: 91, isOpen: true, category: 'binary' },
  { id: 83, ticker: 'EUR/GBP (OTC)', name: 'EUR/GBP (OTC)', isOtc: true, payout: 90, isOpen: true, category: 'binary' },
  { id: 84, ticker: 'USD/JPY (OTC)', name: 'USD/JPY (OTC)', isOtc: true, payout: 90, isOpen: true, category: 'binary' },
  { id: 85, ticker: 'NZD/USD (OTC)', name: 'NZD/USD (OTC)', isOtc: true, payout: 89, isOpen: true, category: 'binary' },
  { id: 86, ticker: 'AUD/USD (OTC)', name: 'AUD/USD (OTC)', isOtc: true, payout: 90, isOpen: true, category: 'binary' },
  { id: 87, ticker: 'USD/CAD (OTC)', name: 'USD/CAD (OTC)', isOtc: true, payout: 89, isOpen: true, category: 'binary' },
  { id: 88, ticker: 'EUR/CAD (OTC)', name: 'EUR/CAD (OTC)', isOtc: true, payout: 90, isOpen: true, category: 'digital' },
  { id: 89, ticker: 'GBP/AUD (OTC)', name: 'GBP/AUD (OTC)', isOtc: true, payout: 91, isOpen: true, category: 'binary' },
  { id: 90, ticker: 'USD/MXN (OTC)', name: 'USD/MXN (OTC)', isOtc: true, payout: 92, isOpen: true, category: 'digital' },
];

const CURRENCY_CODES = new Set([
  'AED', 'ARS', 'AUD', 'BHD', 'BRL', 'CAD', 'CHF', 'CLP', 'CNY', 'COP', 'CZK',
  'DKK', 'EGP', 'EUR', 'GBP', 'HKD', 'HUF', 'IDR', 'ILS', 'INR', 'JPY', 'KRW',
  'KWD', 'MAD', 'MXN', 'MYR', 'NOK', 'NZD', 'OMR', 'PHP', 'PLN', 'QAR', 'RON',
  'RUB', 'SAR', 'SEK', 'SGD', 'THB', 'TRY', 'TWD', 'UAH', 'USD', 'VND', 'ZAR',
]);

function parseCurrencyPair(value: string, otcHint = false) {
  const cleaned = value.toUpperCase().replace(/^FRONT\./, '');
  const match = cleaned.match(/(?:^|[^A-Z])([A-Z]{3})\s*\/?\s*([A-Z]{3})(?:[^A-Z]|$)/);
  if (!match || !CURRENCY_CODES.has(match[1]) || !CURRENCY_CODES.has(match[2])) return null;

  return {
    base: match[1],
    quote: match[2],
    isOtc: otcHint || /OTC/i.test(cleaned),
  };
}

function currencyPairKey(base: string, quote: string, isOtc: boolean) {
  return `${base}${quote}${isOtc ? 'OTC' : ''}`;
}

const BASE_PRICES: Record<number, number> = {
  1: 1.1151,
  2: 1.2915,
  3: 164.82,
  4: 151.94,
  5: 0.9125,
  6: 196.25,
  7: 0.8392,
  8: 0.6584,
  9: 1.3892,
  10: 0.8645,
  11: 1.6472,
  12: 1.5064,
  13: 1.1185,
  14: 100.12,
  15: 0.5982,
  76: 1.1322,
  77: 1.2942,
  78: 0.8814,
  79: 165.12,
  80: 0.9148,
  81: 5.518,
  82: 196.78,
  83: 0.8415,
  84: 152.34,
  85: 0.6012,
  86: 0.6615,
  87: 1.3918,
  88: 1.5092,
  89: 1.9564,
  90: 18.558,
  // Live IQ Option Broker Active IDs
  1861: 1.1151, // EUR/USD
  1862: 0.8392, // EUR/GBP
  1864: 164.82, // EUR/JPY
  1865: 151.94, // USD/JPY
  1866: 196.25, // GBP/JPY
  1867: 1.2915, // GBP/USD
  1870: 0.6584, // AUD/USD
  1871: 0.6512, // CAD/CHF
  1874: 1.6472, // EUR/AUD
  1875: 1.5064, // EUR/CAD
  1876: 0.9412, // EUR/CHF
  1877: 1.9564, // GBP/AUD
  1878: 1.3892, // USD/CAD
  1879: 0.8645, // USD/CHF
  1880: 2.1245, // GBP/NZD
  1882: 91.24,  // NZD/JPY
  1883: 5.742,  // USD/BRL
  1884: 0.5612, // AUD/CHF
  1891: 34.52,  // USD/THB
  1896: 0.5982, // NZD/USD
  1897: 1.7612, // GBP/CAD
  1898: 1.1185, // GBP/CHF
  1901: 1.7912, // EUR/NZD
  1912: 2680.5, // XAU/USD (Gold)
  1913: 31.25,  // XAG/USD (Silver)
  1916: 88500,  // BTC/USD
  1918: 3150,   // ETH/USD
  2298: 5.742,  // USD/BRL (OTC)
  2299: 4120.5, // USD/COP (OTC)
  2300: 19.845, // USD/MXN (OTC)
  1380: 18.25,  // USD/ZAR (OTC)
  1381: 1.3415, // USD/SGD (OTC)
  1382: 7.7812, // USD/HKD (OTC)
  1383: 84.15,  // USD/INR (OTC)
};

const BROKER_TO_ASSET_ID: Record<number, number> = {
  2298: 81, // USD/BRL (OTC)
  2300: 90, // USD/MXN (OTC)
  1861: 1,  // EUR/USD Digital Option alias to EUR/USD Normal
  1867: 2,  // GBP/USD Digital Option alias
  1864: 3,  // EUR/JPY Digital Option alias
  1865: 4,  // USD/JPY Digital Option alias
  1870: 5,  // AUD/CAD Digital Option alias
  1866: 6,  // GBP/JPY Digital Option alias
  1862: 7,  // EUR/GBP Digital Option alias
  1878: 9,  // USD/CAD Digital Option alias
  1879: 10, // USD/CHF Digital Option alias
  1874: 11, // EUR/AUD Digital Option alias
  1875: 12, // EUR/CAD Digital Option alias
  1898: 13, // GBP/CHF Digital Option alias
  1896: 15, // NZD/USD Digital Option alias
};

const ASSET_TO_BROKER_ID: Record<number, number> = {
  81: 2298, // USD/BRL (OTC)
  90: 2300, // USD/MXN (OTC)
};

const candleStore = new Map<string, Candle[]>();

function getStoreKey(assetId: number, timeframe: number): string {
  const canonicalId = BROKER_TO_ASSET_ID[assetId] || assetId;
  return `${canonicalId}_${timeframe}`;
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function ensureInitialCandles(assetId: number, timeframe: number, count = 240): Candle[] {
  const key = getStoreKey(assetId, timeframe);
  const nowSec = Math.floor(Date.now() / 1000);
  const currentBucket = Math.floor(nowSec / timeframe) * timeframe;

  const existing = candleStore.get(key);
  if (existing && existing.length > 0) {
    let last = existing[existing.length - 1];
    while (last.from < currentBucket) {
      const nextFrom = last.from + timeframe;
      const nextTo = nextFrom + timeframe;
      const baseP = BASE_PRICES[assetId] || 1.1;
      const volatility = baseP * (timeframe === 60 ? 0.00055 : 0.0011);
      const r = seededRandom(assetId * 100000 + nextFrom);
      const delta = (r - 0.494) * volatility;
      const open = last.close;
      const close = Number((open + delta).toFixed(baseP > 50 ? 3 : 5));
      const wickUp = Math.abs(seededRandom(nextFrom + 7) * volatility * 0.65);
      const wickDown = Math.abs(seededRandom(nextFrom + 13) * volatility * 0.65);
      const max = Number((Math.max(open, close) + wickUp).toFixed(baseP > 50 ? 3 : 5));
      const min = Number((Math.min(open, close) - wickDown).toFixed(baseP > 50 ? 3 : 5));

      const nextCandle: Candle = {
        id: Math.floor(nextFrom / timeframe),
        from: nextFrom,
        to: nextTo,
        open,
        close,
        min,
        max,
        volume: Math.floor(120 + r * 480),
      };
      existing.push(nextCandle);
      if (existing.length > 320) existing.shift();
      last = nextCandle;
    }
    return existing;
  }

  const basePrice = BASE_PRICES[assetId] || 1.1;
  const decimals = basePrice > 50 ? 3 : 5;
  const volatility = basePrice * (timeframe === 60 ? 0.00055 : 0.0011);
  const generated: Candle[] = [];
  let runningPrice = basePrice;

  for (let i = count - 1; i >= 0; i--) {
    const from = currentBucket - i * timeframe;
    const to = from + timeframe;
    const quadrantIndex = Math.floor(from / (timeframe * 5));
    const posInQuadrant = Math.floor((from % (timeframe * 5)) / timeframe);

    const r1 = seededRandom(assetId * 99991 + from);
    const r2 = seededRandom(assetId * 31337 + quadrantIndex);

    let delta = (r1 - 0.496) * volatility;

    if (posInQuadrant <= 2 && generated.length >= 3) {
      const c1 = generated[generated.length - 3];
      const c2 = generated[generated.length - 2];
      const c3 = generated[generated.length - 1];
      const greens = [c1, c2, c3].filter((c) => c.close > c.open).length;
      const reds = 3 - greens;
      const minorityGreen = greens < reds;
      const pairStrength = 0.62 + ((assetId * 7) % 24) / 100;
      if (r2 < pairStrength) {
        const mag = Math.max(Math.abs(delta), volatility * 0.28);
        delta = minorityGreen ? mag : -mag;
      }
    }

    const open = runningPrice;
    const close = Number((open + delta).toFixed(decimals));
    const wickUp = Math.abs(seededRandom(from + 19) * volatility * 0.55);
    const wickDown = Math.abs(seededRandom(from + 29) * volatility * 0.55);
    const max = Number((Math.max(open, close) + wickUp).toFixed(decimals));
    const min = Number((Math.min(open, close) - wickDown).toFixed(decimals));
    runningPrice = close;

    generated.push({
      id: Math.floor(from / timeframe),
      from,
      to,
      open,
      close,
      min,
      max,
      volume: Math.floor(110 + r1 * 520),
    });
  }

  candleStore.set(key, generated);
  return generated;
}

class IQOptionBridge {
  public connected = false;
  public authenticated = false;
  public connecting = false;
  public ssid = '';
  public email = '';
  public userId = 0;
  public currency = 'BRL';
  public realBalance = 0;
  public practiceBalance = 10000.0;
  public realBalanceId = 1001;
  public practiceBalanceId = 1002;
  public activeBalanceType: 'PRACTICE' | 'REAL' = 'PRACTICE';
  public wsLatencyMs = 24;
  public lastError = '';
  public requires2FA = false;
  public pending2FAToken = '';
  public ordersStore: TradeOrder[] = loadOrdersFromDisk();
  public botState: ServerBotState = loadBotStateFromDisk();
  private telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || '';
  private telegramChatId = process.env.TELEGRAM_CHAT_ID || '';
  private telegramEnabled =
    Boolean(this.telegramBotToken && this.telegramChatId) && process.env.TELEGRAM_ENABLED !== 'false';
  private telegramAlertSignals = true;
  private telegramAlertOrderResults = true;
  private lastServerMhiTrigger = 0;
  public iqSocket: WebSocket | null = null;
  private reqCounter = 1;
  private browserClients = new Set<WebSocket>();
  public activeIdMap = new Map<string, number>();
  public activePayoutMap = new Map<number, number>();
  public catalogAssets: IQAsset[] = DEFAULT_ASSETS;
  public pendingOrdersByReqId = new Map<string, string>();
  private subscribedAssets = new Set<number>([
    1, 2, 3, 4, 5, 76, 77, 81, 1861, 1862, 1864, 1865, 1866, 1867, 1870, 1878, 1879, 2298, 2300
  ]);
  private hasRealCandleFeed = new Set<string>();

  constructor() {
    this.initActiveIdMap();

    for (const asset of DEFAULT_ASSETS) {
      ensureInitialCandles(asset.id, 60, 240);
      ensureInitialCandles(asset.id, 300, 180);
    }

    // Restore saved session if present so server restarts never drop user connection
    this.restoreSavedSession();

    setInterval(() => {
      this.tickMarketStream();
    }, 1000);
  }

  private initActiveIdMap() {
    const pairs: [string[], number, number][] = [
      [['EURUSD', 'EUR/USD', '1'], 1, 88],
      [['GBPUSD', 'GBP/USD', '2'], 2, 88],
      [['EURJPY', 'EUR/JPY', '3'], 3, 87],
      [['USDJPY', 'USD/JPY', '4'], 4, 87],
      [['AUDCAD', 'AUD/CAD', '5'], 5, 86],
      [['GBPJPY', 'GBP/JPY', '6'], 6, 88],
      [['EURGBP', 'EUR/GBP', '7'], 7, 85],
      [['AUDUSD', 'AUD/USD', '8'], 8, 86],
      [['USDCAD', 'USD/CAD', '9'], 9, 86],
      [['USDCHF', 'USD/CHF', '10'], 10, 85],
      [['EURAUD', 'EUR/AUD', '11'], 11, 87],
      [['EURCAD', 'EUR/CAD', '12'], 12, 86],
      [['GBPCHF', 'GBP/CHF', '13'], 13, 85],
      [['AUDJPY', 'AUD/JPY', '14'], 14, 87],
      [['NZDUSD', 'NZD/USD', '15'], 15, 85],
      [['USDBRL', 'USD/BRL'], 1883, 85],
      [['USDBRLOTC', 'USD/BRL (OTC)', 'USDBRL-OTC', '81'], 2298, 93],
      [['USDMXNOTC', 'USD/MXN (OTC)', 'USDMXN-OTC', '90'], 2300, 92],
      [['USDCOPOTC', 'USD/COP (OTC)', 'USDCOP-OTC'], 2299, 92],
      [['USDZAROTC', 'USD/ZAR (OTC)', 'USDZAR-OTC'], 1380, 90],
      [['USDSGDOTC', 'USD/SGD (OTC)', 'USDSGD-OTC'], 1381, 90],
      [['USDHKDOTC', 'USD/HKD (OTC)', 'USDHKD-OTC'], 1382, 89],
      [['USDINROTC', 'USD/INR (OTC)', 'USDINR-OTC'], 1383, 91],
      [['EURUSDOTC', 'EUR/USD (OTC)', 'EURUSD-OTC', '76'], 76, 92],
      [['GBPUSDOTC', 'GBP/USD (OTC)', 'GBPUSD-OTC', '77'], 77, 91],
      [['USDCHFOTC', 'USD/CHF (OTC)', 'USDCHF-OTC', '78'], 78, 90],
      [['EURJPYOTC', 'EUR/JPY (OTC)', 'EURJPY-OTC', '79'], 79, 91],
      [['AUDCADOTC', 'AUD/CAD (OTC)', 'AUDCAD-OTC', '80'], 80, 89],
      [['GBPJPYOTC', 'GBP/JPY (OTC)', 'GBPJPY-OTC', '82'], 82, 91],
      [['EURGBPOTC', 'EUR/GBP (OTC)', 'EURGBP-OTC', '83'], 83, 90],
      [['USDJPYOTC', 'USD/JPY (OTC)', 'USDJPY-OTC', '84'], 84, 90],
      [['NZDUSDOTC', 'NZD/USD (OTC)', 'NZDUSD-OTC', '85'], 85, 89],
      [['AUDUSDOTC', 'AUD/USD (OTC)', 'AUDUSD-OTC', '86'], 86, 90],
      [['USDCADOTC', 'USD/CAD (OTC)', 'USDCAD-OTC', '87'], 87, 89],
      [['EURCADOTC', 'EUR/CAD (OTC)', 'EURCAD-OTC', '88'], 88, 90],
      [['GBPAUDOTC', 'GBP/AUD (OTC)', 'GBPAUD-OTC', '89'], 89, 91],
      [['BTCUSD', 'BTC/USD'], 1916, 85],
      [['ETHUSD', 'ETH/USD'], 1918, 85],
      [['XAUUSD', 'GOLD', 'OURO'], 1912, 86],
      [['XAGUSD', 'SILVER', 'PRATA'], 1913, 85],
    ];

    for (const [aliases, activeId, defaultPayout] of pairs) {
      this.activePayoutMap.set(activeId, defaultPayout);
      for (const alias of aliases) {
        this.activeIdMap.set(alias, activeId);
        const clean = alias.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (clean) this.activeIdMap.set(clean, activeId);
      }
      this.activeIdMap.set(String(activeId), activeId);
    }
  }

  public resolveActive(
    assetId: number,
    ticker?: string
  ): { activeId: number; ticker: string; payout: number } {
    let matchedId = 0;
    if (ticker) {
      const clean = ticker.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (this.activeIdMap.has(clean)) {
        matchedId = this.activeIdMap.get(clean)!;
      } else if (this.activeIdMap.has(ticker)) {
        matchedId = this.activeIdMap.get(ticker)!;
      }
    }
    if (!matchedId) {
      const idKey = String(assetId);
      if (this.activeIdMap.has(idKey)) {
        matchedId = this.activeIdMap.get(idKey)!;
      } else {
        matchedId = assetId;
      }
    }

    const livePayout = this.activePayoutMap.get(matchedId) || 88;
    const foundAsset = DEFAULT_ASSETS.find((a) => a.id === matchedId || a.id === assetId);

    return {
      activeId: matchedId || 1861,
      ticker: foundAsset?.ticker || ticker || 'EUR/USD',
      payout: livePayout,
    };
  }

  private saveSessionToDisk() {
    try {
      fs.writeFileSync(
        SESSION_FILE_PATH,
        JSON.stringify({
          authenticated: this.authenticated,
          ssid: this.ssid,
          email: this.email,
          userId: this.userId,
          currency: this.currency,
          realBalance: this.realBalance,
          practiceBalance: this.practiceBalance,
          realBalanceId: this.realBalanceId,
          practiceBalanceId: this.practiceBalanceId,
          activeBalanceType: this.activeBalanceType,
        }),
        'utf-8'
      );
    } catch {
      // ignore
    }
  }

  private restoreSavedSession() {
    try {
      if (fs.existsSync(SESSION_FILE_PATH)) {
        const raw = fs.readFileSync(SESSION_FILE_PATH, 'utf-8');
        const saved = JSON.parse(raw);
        if (saved && saved.authenticated && saved.ssid) {
          this.authenticated = true;
          this.connected = true;
          this.ssid = saved.ssid;
          this.email = saved.email || 'trader@iqoption.com';
          this.userId = saved.userId || 84920145;
          this.currency = saved.currency || 'BRL';
          this.realBalance = Number(saved.realBalance) || 0;
          this.practiceBalance = Number(saved.practiceBalance) || 10000;
          this.realBalanceId = saved.realBalanceId || 1001;
          this.practiceBalanceId = saved.practiceBalanceId || 1002;
          this.activeBalanceType = saved.activeBalanceType || 'PRACTICE';
          void this.connectWebSocket(this.ssid);
        }
      }
    } catch {
      // ignore
    }
  }

  public addBrowserClient(ws: WebSocket) {
    this.browserClients.add(ws);
    ws.send(
      JSON.stringify({
        type: 'init_sync',
        payload: {
          status: this.getStatusPayload(),
          orders: this.ordersStore,
          botState: this.botState,
        },
      })
    );
  }

  public removeBrowserClient(ws: WebSocket) {
    this.browserClients.delete(ws);
  }

  public broadcast(message: unknown) {
    const raw = JSON.stringify(message);
    for (const client of this.browserClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(raw);
      }
    }
  }

  public getStatusPayload() {
    return {
      connected: this.connected,
      authenticated: this.authenticated,
      marketDataMode: this.authenticated
        ? this.ssid.startsWith('sim_session_')
          ? 'SIMULATED'
          : 'LIVE'
        : 'OFFLINE',
      connecting: this.connecting,
      email: this.email,
      userId: this.userId,
      currency: this.currency,
      realBalance: this.realBalance,
      practiceBalance: this.practiceBalance,
      activeBalanceType: this.activeBalanceType,
      activeBalanceId:
        this.activeBalanceType === 'REAL' ? this.realBalanceId : this.practiceBalanceId,
      serverTimestamp: Math.floor(Date.now() / 1000),
      lastError: this.lastError,
      requires2FA: this.requires2FA,
      wsLatencyMs: this.wsLatencyMs,
    };
  }

  public getTelegramSettings() {
    return {
      enabled: this.telegramEnabled,
      chatId: this.telegramChatId,
      tokenConfigured: Boolean(this.telegramBotToken),
      alertSignals: this.telegramAlertSignals,
      alertOrderResults: this.telegramAlertOrderResults,
    };
  }

  public validateTelegramSettings(patch: TelegramSettingsPatch, requireCredentials = false) {
    const tokenConfigured = patch.clearToken
      ? false
      : Boolean((typeof patch.token === 'string' && patch.token.trim()) || this.telegramBotToken);
    const chatId = typeof patch.chatId === 'string' ? patch.chatId.trim() : this.telegramChatId;
    const enabled = typeof patch.enabled === 'boolean' ? patch.enabled : this.telegramEnabled;
    if ((enabled || requireCredentials) && (!tokenConfigured || !chatId)) {
      return 'Informe o token do bot e o chat ID antes de ativar as notificações.';
    }
    return null;
  }

  public updateTelegramSettings(patch: TelegramSettingsPatch) {
    if (typeof patch.token === 'string' && patch.token.trim()) {
      this.telegramBotToken = patch.token.trim();
    }
    if (patch.clearToken) this.telegramBotToken = '';
    if (typeof patch.chatId === 'string') this.telegramChatId = patch.chatId.trim();
    if (typeof patch.enabled === 'boolean') this.telegramEnabled = patch.enabled;
    if (typeof patch.alertSignals === 'boolean') this.telegramAlertSignals = patch.alertSignals;
    if (typeof patch.alertOrderResults === 'boolean') {
      this.telegramAlertOrderResults = patch.alertOrderResults;
    }
    return this.getTelegramSettings();
  }

  private async sendTelegramMessage(message: string, force = false) {
    if (!this.telegramBotToken || !this.telegramChatId) {
      return { success: false, message: 'Informe o token do bot e o chat ID.' };
    }
    if (!force && !this.telegramEnabled) {
      return { success: false, message: 'Notificações do Telegram estão desativadas.' };
    }

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: this.telegramChatId, text: message }),
        }
      );
      const result = (await response.json()) as { ok?: boolean; description?: string };
      if (!response.ok || !result.ok) {
        return {
          success: false,
          message: result.description || `Telegram respondeu HTTP ${response.status}.`,
        };
      }
      return { success: true, message: 'Mensagem enviada pelo Telegram.' };
    } catch {
      return { success: false, message: 'Não foi possível conectar à API do Telegram.' };
    }
  }

  public testTelegram() {
    return this.sendTelegramMessage('QuantIQ: teste de notificações do Telegram recebido com sucesso.', true);
  }

  private notifyTelegramOrderEntry(order: TradeOrder) {
    if (!this.telegramEnabled || !this.telegramAlertSignals) return;
    const executionMode = this.ssid.startsWith('sim_session_') ? 'Simulação local' :
      this.authenticated ? 'IQ Option' : 'Modo local';
    const stage = order.galeStep === 0 ? 'Entrada inicial' : `Gale ${order.galeStep}`;
    const message = [
      'QuantIQ | SINAL DE ENTRADA',
      `${order.assetTicker} · ${order.direction}`,
      `Estratégia: ${order.strategyLabel}`,
      `${stage} · ${executionMode}`,
      `Valor: ${order.amount.toFixed(2)} ${this.currency}`,
      `Preço: ${order.openPrice.toFixed(5)}`,
      `Horário: ${new Date(order.timestamp * 1000).toLocaleString('pt-BR')}`,
    ].join('\n');
    void this.sendTelegramMessage(message);
  }

  private notifyTelegramOrderResult(order: TradeOrder) {
    if (!this.telegramEnabled || !this.telegramAlertOrderResults) return;
    const resultLabel: Record<TradeOrder['status'], string> = {
      OPEN: 'EM ABERTO',
      WIN: 'WIN',
      LOSS: 'LOSS',
      EQUAL: 'EMPATE',
      REJECTED: 'REJEITADA',
    };
    const profit = `${order.profit >= 0 ? '+' : '-'}${Math.abs(order.profit).toFixed(2)} ${this.currency}`;
    const message = [
      'QuantIQ | RESULTADO DA ORDEM',
      `${order.assetTicker} · ${order.direction} · ${resultLabel[order.status]}`,
      `Estratégia: ${order.strategyLabel}`,
      `Etapa: ${order.galeStep === 0 ? 'Entrada inicial' : `Gale ${order.galeStep}`}`,
      `Resultado: ${profit}`,
      `Fechamento: ${order.closePrice?.toFixed(5) || 'n/d'}`,
      order.brokerMessage || '',
    ].filter(Boolean).join('\n');
    void this.sendTelegramMessage(message);
  }

  private nextRequestId(prefix = 'quantiq'): string {
    this.reqCounter += 1;
    return `${prefix}_${Date.now()}_${this.reqCounter}`;
  }

  public sendToIQ(name: string, msg: unknown, requestId?: string) {
    if (this.iqSocket && this.iqSocket.readyState === WebSocket.OPEN) {
      const payload = {
        name,
        request_id: requestId || this.nextRequestId(),
        msg,
      };
      this.iqSocket.send(JSON.stringify(payload));
    }
  }

  private safeCloseSocket() {
    if (!this.iqSocket) return;
    const sock = this.iqSocket;
    this.iqSocket = null;
    try {
      sock.removeAllListeners();
      sock.on('error', () => {});
      if (sock.readyState === WebSocket.OPEN) {
        sock.close();
      } else {
        sock.terminate();
      }
    } catch {
      // ignore
    }
  }

  public async verify2FACode(
    code: string,
    accountType: 'PRACTICE' | 'REAL' = 'PRACTICE'
  ): Promise<{ success: boolean; message: string; ssid?: string }> {
    if (!this.pending2FAToken) {
      return {
        success: false,
        message: 'Nenhuma verificação 2FA pendente. Faça login novamente.',
      };
    }

    this.connecting = true;
    this.lastError = '';
    try {
      const response = await fetch('https://auth.iqoption.com/api/v2/verify/2fa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
        body: JSON.stringify({
          code: code.trim(),
          token: this.pending2FAToken,
        }),
      });

      const setCookie = response.headers.get('set-cookie') || '';
      const ssidMatch = setCookie.match(/ssid=([^;]+)/);
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      let resolvedSsid = '';
      if (ssidMatch && ssidMatch[1]) {
        resolvedSsid = ssidMatch[1];
      } else if (typeof data.ssid === 'string' && data.ssid) {
        resolvedSsid = data.ssid;
      }

      if (!resolvedSsid) {
        this.connecting = false;
        this.lastError =
          typeof data.message === 'string'
            ? data.message
            : 'Código 2FA inválido ou expirado.';
        this.broadcast({ type: 'status', payload: this.getStatusPayload() });
        return { success: false, message: this.lastError };
      }

      this.requires2FA = false;
      this.pending2FAToken = '';
      this.ssid = resolvedSsid;
      this.activeBalanceType = accountType;

      const wsAuthOk = await this.connectWebSocket(resolvedSsid);
      if (!wsAuthOk) {
        this.connecting = false;
        this.lastError = 'Token SSID rejeitado pelo WebSocket da IQ Option.';
        this.broadcast({ type: 'status', payload: this.getStatusPayload() });
        return { success: false, message: this.lastError };
      }

      this.saveSessionToDisk();
      return {
        success: true,
        message: 'Autenticação 2FA concluída! Conectado à IQ Option.',
        ssid: resolvedSsid,
      };
    } catch (err: unknown) {
      this.connecting = false;
      this.lastError = err instanceof Error ? err.message : 'Erro ao validar 2FA.';
      this.broadcast({ type: 'status', payload: this.getStatusPayload() });
      return { success: false, message: this.lastError };
    }
  }

  public async loginWithCredentials(
    identifier: string,
    password?: string,
    directSsid?: string,
    accountType: 'PRACTICE' | 'REAL' = 'PRACTICE',
    demoSimulatorMode = false
  ): Promise<{
    success: boolean;
    message: string;
    ssid?: string;
    requires2FA?: boolean;
  }> {
    this.connecting = true;
    this.lastError = '';
    this.requires2FA = false;
    this.activeBalanceType = accountType;
    this.broadcast({ type: 'status', payload: this.getStatusPayload() });

    try {
      // Explicit Simulator / Local Practice Mode
      if (demoSimulatorMode) {
        this.ssid = `sim_session_${Date.now().toString(36)}`;
        this.email = identifier?.trim() || 'demo@quantiq.local';
        this.connected = true;
        this.authenticated = true;
        this.connecting = false;
        this.userId = 84920145;
        if (this.realBalance === 0) this.realBalance = 2450.0;
        this.saveSessionToDisk();
        this.broadcast({ type: 'status', payload: this.getStatusPayload() });
        return {
          success: true,
          message: 'Modo Simulador Local ativado e conectado!',
          ssid: this.ssid,
        };
      }

      let resolvedSsid = directSsid?.trim() || '';

      if (!resolvedSsid && identifier && password) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
          const response = await fetch('https://auth.iqoption.com/api/v2/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            },
            body: JSON.stringify({
              identifier: identifier.trim(),
              password,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeout);

          const setCookie = response.headers.get('set-cookie') || '';
          const ssidMatch = setCookie.match(/ssid=([^;]+)/);
          const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

          if (ssidMatch && ssidMatch[1]) {
            resolvedSsid = ssidMatch[1];
          } else if (typeof data.ssid === 'string' && data.ssid) {
            resolvedSsid = data.ssid;
          } else if (data.code === 'verify') {
            this.connecting = false;
            this.requires2FA = true;
            this.pending2FAToken = typeof data.token === 'string' ? data.token : '';
            this.email = identifier.trim();
            this.lastError =
              'Sua conta IQ Option possui verificação em 2 etapas (2FA). Digite o código enviado por SMS/E-mail ou use a aba Token SSID.';
            this.broadcast({ type: 'status', payload: this.getStatusPayload() });
            return {
              success: false,
              requires2FA: true,
              message: this.lastError,
            };
          } else if (data.code === 'invalid_credentials' || response.status === 401) {
            this.connecting = false;
            this.authenticated = false;
            this.lastError =
              'E-mail ou senha incorretos na IQ Option. Verifique suas credenciais ou use a aba Token SSID.';
            this.broadcast({ type: 'status', payload: this.getStatusPayload() });
            return {
              success: false,
              message: this.lastError,
            };
          } else if (!response.ok) {
            const rawMsg =
              typeof data.message === 'string'
                ? data.message
                : `Bloqueio na rota de login (${response.status}). Use o Token SSID ou ative o Modo Simulador.`;
            this.connecting = false;
            this.lastError = rawMsg;
            this.broadcast({ type: 'status', payload: this.getStatusPayload() });
            return {
              success: false,
              message: rawMsg,
            };
          }
        } catch (fetchErr: unknown) {
          clearTimeout(timeout);
          this.connecting = false;
          this.lastError =
            fetchErr instanceof Error
              ? `Falha ao contatar auth.iqoption.com: ${fetchErr.message}`
              : 'Tempo esgotado ao contatar auth.iqoption.com';
          this.broadcast({ type: 'status', payload: this.getStatusPayload() });
          return {
            success: false,
            message: this.lastError,
          };
        }
      }

      if (!resolvedSsid) {
        this.connecting = false;
        this.lastError = 'Informe seu E-mail e Senha da IQ Option ou cole um Token SSID válido.';
        this.broadcast({ type: 'status', payload: this.getStatusPayload() });
        return { success: false, message: this.lastError };
      }

      this.ssid = resolvedSsid;
      this.email = identifier?.trim() || 'Conta IQ Option (SSID)';

      const wsAuthenticated = await this.connectWebSocket(resolvedSsid);
      if (!wsAuthenticated) {
        this.connecting = false;
        this.authenticated = false;
        this.lastError =
          'O WebSocket da IQ Option rejeitou o Token SSID informado (sessão expirada ou inválida).';
        this.broadcast({ type: 'status', payload: this.getStatusPayload() });
        return {
          success: false,
          message: this.lastError,
        };
      }

      this.saveSessionToDisk();
      this.broadcast({ type: 'status', payload: this.getStatusPayload() });

      return {
        success: true,
        message: 'Conectado e autenticado na IQ Option via WebSocket!',
        ssid: resolvedSsid,
      };
    } catch (err: unknown) {
      this.connecting = false;
      this.lastError = err instanceof Error ? err.message : 'Erro ao conectar na IQ Option';
      this.broadcast({ type: 'status', payload: this.getStatusPayload() });
      return { success: false, message: this.lastError };
    }
  }

  private async connectWebSocket(ssid: string): Promise<boolean> {
    this.safeCloseSocket();
    const startConnect = Date.now();

    return new Promise((resolve) => {
      let settled = false;

      const finish = (ok: boolean) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(ok);
        }
      };

      const timer = setTimeout(() => {
        // If IQ Option WebSocket opened and didn't reject ssid within 4s, consider active
        if (this.connected) {
          this.authenticated = true;
          this.connecting = false;
          this.broadcast({ type: 'status', payload: this.getStatusPayload() });
          finish(true);
        } else {
          finish(false);
        }
      }, 4200);

      try {
        const ws = new WebSocket('wss://iqoption.com/echo/websocket', {
          headers: {
            Origin: 'https://iqoption.com',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          },
          handshakeTimeout: 4000,
        });

        this.iqSocket = ws;

        ws.on('open', () => {
          this.wsLatencyMs = Math.max(14, Date.now() - startConnect);
          this.connected = true;
          // 1. Authenticate WebSocket session with SSID
          this.sendToIQ('ssid', ssid, this.nextRequestId('ssid'));
        });

        ws.on('message', (data: Buffer) => {
          try {
            const msg = JSON.parse(data.toString());

            if (msg.name === 'timeSync' && typeof msg.msg === 'number') {
              this.wsLatencyMs = Math.max(12, Math.min(120, Math.abs(Date.now() - msg.msg)));
            } else if (msg.name === 'authenticated') {
              if (msg.msg === false) {
                this.authenticated = false;
                this.connecting = false;
                finish(false);
                return;
              }
              this.onAuthenticatedSuccess();
              finish(true);
            } else if (msg.name === 'profile' && msg.msg) {
              const p = msg.msg.result || msg.msg;
              if (p && typeof p === 'object') {
                this.userId = p.user_id || p.id || this.userId || 84920145;
                this.currency = p.currency || this.currency || 'BRL';
                if (p.email && typeof p.email === 'string') {
                  this.email = p.email;
                }
                if (Array.isArray(p.balances)) {
                  for (const b of p.balances) {
                    if (b.type === 1) {
                      this.realBalance = Number(b.amount) || 0;
                      this.realBalanceId = b.id;
                    } else if (b.type === 4) {
                      this.practiceBalance = Number(b.amount) || 0;
                      this.practiceBalanceId = b.id;
                    }
                  }
                }
                this.onAuthenticatedSuccess();
                finish(true);
              }
            } else if (msg.name === 'balances' && Array.isArray(msg.msg)) {
              for (const b of msg.msg) {
                if (b.type === 1) {
                  this.realBalance = Number(b.amount) || 0;
                  this.realBalanceId = b.id;
                  if (b.currency) this.currency = b.currency;
                } else if (b.type === 4) {
                  this.practiceBalance = Number(b.amount) || 0;
                  this.practiceBalanceId = b.id;
                }
              }
              this.saveSessionToDisk();
              this.broadcast({ type: 'status', payload: this.getStatusPayload() });
            } else if (msg.request_id === 'init_data' || msg.name === 'initialization-data') {
              const turboActives = (msg.msg?.turbo?.actives || {}) as Record<string, any>;
              const binaryActives = (msg.msg?.binary?.actives || {}) as Record<string, any>;
              const allActives = { ...binaryActives, ...turboActives };
              for (const [idStr, a] of Object.entries(allActives)) {
                const actId = Number(idStr);
                if (actId && a && a.enabled && !a.is_suspended) {
                  const comm = Number(a.option?.profit?.commission) || 12;
                  const payout = Math.max(70, Math.min(99, 100 - comm));
                  this.activePayoutMap.set(actId, payout);

                  const rawName = String(a.name || '').replace(/^front\./, '');
                  const rawDesc = String(a.description || '').replace(/^front\./, '');
                  const rawTicker = String(a.ticker || '');

                  const cleanList = [rawName, rawDesc, rawTicker];
                  for (const item of cleanList) {
                    if (item) {
                      this.activeIdMap.set(item, actId);
                      const norm = item.toUpperCase().replace(/[^A-Z0-9]/g, '');
                      if (norm) this.activeIdMap.set(norm, actId);
                    }
                  }
                }
              }

              const discoveredAssets = new Map<string, IQAsset>();
              for (const [idStr, active] of Object.entries(binaryActives)) {
                const activeId = Number(idStr);
                if (!activeId || !active?.enabled || active.is_suspended) continue;

                const rawTicker = String(active.ticker || '');
                const rawName = String(active.name || '').replace(/^front\./i, '');
                const rawDescription = String(active.description || '').replace(/^front\./i, '');
                const otcHint = Boolean(active.is_otc) || /OTC/i.test(`${rawTicker} ${rawName} ${rawDescription}`);
                const pair = [rawTicker, rawName, rawDescription]
                  .map((value) => parseCurrencyPair(value, otcHint))
                  .find((value) => value !== null);
                if (!pair) continue;

                const pairKey = currencyPairKey(pair.base, pair.quote, pair.isOtc);
                const knownAsset = DEFAULT_ASSETS.find((asset) => {
                  const knownPair = parseCurrencyPair(asset.ticker, asset.isOtc);
                  return knownPair && currencyPairKey(knownPair.base, knownPair.quote, knownPair.isOtc) === pairKey;
                });
                const ticker = knownAsset?.ticker || `${pair.base}/${pair.quote}${pair.isOtc ? ' (OTC)' : ''}`;
                const payout = this.activePayoutMap.get(activeId) || knownAsset?.payout || 88;
                const asset: IQAsset = {
                  id: knownAsset?.id ?? activeId,
                  ticker,
                  name: ticker,
                  isOtc: pair.isOtc,
                  payout,
                  isOpen: true,
                  category: knownAsset?.category || 'binary',
                };
                const existing = discoveredAssets.get(pairKey);
                if (!existing || asset.payout > existing.payout) {
                  discoveredAssets.set(pairKey, asset);
                }

                this.activeIdMap.set(ticker, activeId);
                this.activeIdMap.set(ticker.toUpperCase().replace(/[^A-Z0-9]/g, ''), activeId);
                this.requestCandlesForActive(activeId, 60, 180);
              }

              if (Object.keys(binaryActives).length > 0) {
                this.catalogAssets = [...discoveredAssets.values()].sort((a, b) =>
                  a.ticker.localeCompare(b.ticker)
                );
                this.broadcast({
                  type: 'catalog_assets',
                  payload: { assets: this.catalogAssets },
                });
              }
            } else if (msg.name === 'option-opened' && msg.msg) {
              const m = msg.msg as Record<string, any>;
              const optionId = m.option_id || m.id;
              const matchedOrder = this.ordersStore.find(
                (o) =>
                  o.status === 'OPEN' &&
                  (!o.iqOptionOrderId || String(o.iqOptionOrderId).startsWith('IQ-')) &&
                  Math.abs(o.amount - Number(m.amount || m.price || 0)) < 0.01
              );
              if (matchedOrder) {
                matchedOrder.iqOptionOrderId = String(optionId);
                matchedOrder.brokerConfirmed = true;
                matchedOrder.brokerMessage = `Ordem aceita pela IQ Option (ID #${optionId})`;
                if (m.value) matchedOrder.openPrice = Number(m.value) || matchedOrder.openPrice;
                saveOrdersToDisk(this.ordersStore);
                this.broadcast({
                  type: 'broker_confirmed',
                  payload: {
                    order: matchedOrder,
                    orders: this.ordersStore,
                    message: `Ordem confirmada na corretora IQ Option! ID: #${optionId}`,
                  },
                });
              }
            } else if (
              msg.name === 'option' &&
              msg.msg &&
              (msg.status === 2000 || msg.status === 200 || (msg.msg as Record<string, any>).id)
            ) {
              const m = msg.msg as Record<string, any>;
              const optionId = m.id;
              const localId = this.pendingOrdersByReqId.get(msg.request_id);
              const matchedOrder =
                this.ordersStore.find((o) => o.id === localId) ||
                this.ordersStore.find(
                  (o) =>
                    o.status === 'OPEN' &&
                    (!o.iqOptionOrderId || String(o.iqOptionOrderId).startsWith('IQ-'))
                );
              if (matchedOrder) {
                matchedOrder.iqOptionOrderId = String(optionId);
                matchedOrder.brokerConfirmed = true;
                if (m.value && Number(m.value) > 0) {
                  matchedOrder.openPrice = Number(m.value);
                }
                if (m.exp && Number(m.exp) > 0) {
                  matchedOrder.expirationTimestamp = Number(m.exp);
                }
                matchedOrder.brokerMessage = `Ordem aceita pela IQ Option (ID #${optionId})`;
                saveOrdersToDisk(this.ordersStore);
                this.broadcast({
                  type: 'broker_confirmed',
                  payload: {
                    order: matchedOrder,
                    orders: this.ordersStore,
                    message: `Ordem confirmada na corretora IQ Option! ID: #${optionId}`,
                  },
                });
              }
            } else if (
              msg.status &&
              msg.status !== 2000 &&
              msg.status !== 200 &&
              msg.request_id &&
              String(msg.request_id).startsWith('quantiq_ord_')
            ) {
              const localId = this.pendingOrdersByReqId.get(msg.request_id);
              const matchedOrder =
                this.ordersStore.find((o) => o.id === localId) ||
                this.ordersStore.find((o) => o.status === 'OPEN');
              const m = (msg.msg || {}) as Record<string, any>;
              const errorMsg =
                m.message || m.error || 'A IQ Option não aceitou a operação no ativo.';
              if (matchedOrder && matchedOrder.status === 'OPEN') {
                matchedOrder.status = 'REJECTED';
                matchedOrder.brokerConfirmed = false;
                matchedOrder.brokerMessage = `Recusada: ${errorMsg}`;
                matchedOrder.profit = 0;
                this.adjustBalance(matchedOrder.accountType, matchedOrder.amount);
                this.notifyTelegramOrderResult(matchedOrder);
                saveOrdersToDisk(this.ordersStore);
                this.broadcast({
                  type: 'broker_rejected',
                  payload: {
                    order: matchedOrder,
                    orders: this.ordersStore,
                    error: errorMsg,
                    message: `Corretora recusou a ordem: ${errorMsg}`,
                  },
                });
              }
            } else if (msg.name === 'option-rejected' || msg.name === 'api_option_rejected') {
              const m = (msg.msg || {}) as Record<string, any>;
              const errorMsg = m.message || m.error || 'Operação rejeitada pela corretora.';
              const matchedOrder = this.ordersStore.find((o) => o.status === 'OPEN');
              if (matchedOrder) {
                matchedOrder.status = 'REJECTED';
                matchedOrder.brokerConfirmed = false;
                matchedOrder.brokerMessage = `Recusada: ${errorMsg}`;
                matchedOrder.profit = 0;
                this.adjustBalance(matchedOrder.accountType, matchedOrder.amount);
                this.notifyTelegramOrderResult(matchedOrder);
                saveOrdersToDisk(this.ordersStore);
                this.broadcast({
                  type: 'broker_rejected',
                  payload: {
                    order: matchedOrder,
                    orders: this.ordersStore,
                    error: errorMsg,
                    message: `Corretora recusou a ordem: ${errorMsg}`,
                  },
                });
              }
            } else if (msg.name === 'candles' && msg.msg) {
              const reqParts = String(msg.request_id || '').split('_');
              const reqAssetId = Number(reqParts[1]);
              const tf = Number(reqParts[2]) || 60;
              const rawList = Array.isArray(msg.msg?.candles)
                ? msg.msg.candles
                : Array.isArray(msg.msg)
                ? msg.msg
                : Array.isArray(msg.msg?.data)
                ? msg.msg.data
                : [];
              const assetId = reqAssetId || Number(msg.msg?.active_id);

              if (assetId && rawList.length > 0) {
                const parsed: Candle[] = rawList
                  .map((c: Record<string, unknown>) => ({
                    id: Number(c.id) || Math.floor(Number(c.from) / tf),
                    from: Number(c.from),
                    to: Number(c.to) || Number(c.from) + tf,
                    open: Number(c.open),
                    close: Number(c.close),
                    min: Number(c.min),
                    max: Number(c.max),
                    volume: Number(c.volume) || 100,
                  }))
                  .sort((a: Candle, b: Candle) => a.from - b.from);

                if (parsed.length > 0) {
                  const canonKey = getStoreKey(assetId, tf);
                  candleStore.set(canonKey, parsed);
                  this.hasRealCandleFeed.add(canonKey);

                  const uiAssetId = BROKER_TO_ASSET_ID[assetId];
                  if (uiAssetId) {
                    const uiKey = getStoreKey(uiAssetId, tf);
                    candleStore.set(uiKey, parsed);
                    this.hasRealCandleFeed.add(uiKey);
                  }
                  const brokerId = ASSET_TO_BROKER_ID[assetId];
                  if (brokerId) {
                    const brokerKey = getStoreKey(brokerId, tf);
                    candleStore.set(brokerKey, parsed);
                    this.hasRealCandleFeed.add(brokerKey);
                  }

                  const lastCandle = parsed[parsed.length - 1];
                  const targetIds = Array.from(
                    new Set([assetId, uiAssetId, brokerId].filter(Boolean))
                  ) as number[];
                  for (const tId of targetIds) {
                    this.broadcast({
                      type: 'candle_tick',
                      payload: {
                        assetId: tId,
                        timeframe: tf,
                        candle: lastCandle,
                        serverTimestamp: Math.floor(Date.now() / 1000),
                      },
                    });
                  }
                  this.broadcast({
                    type: 'catalog_candles',
                    payload: { assetIds: targetIds, timeframe: tf, candles: parsed },
                  });
                }
              }
            } else if (msg.name === 'quote-generated' && msg.msg) {
              const q = msg.msg as Record<string, unknown>;
              const actId = Number(q.active_id);
              const price = Number(q.price);
              if (actId && price) {
                this.ingestRealQuote(actId, price);
              }
            } else if (msg.name === 'candle-generated' && msg.msg) {
              const c = msg.msg;
              const activeId = Number(c.active_id);
              const size = Number(c.size) || 60;
              if (activeId && c.from) {
                const candleObj: Candle = {
                  id: c.id || Math.floor(c.from / size),
                  from: c.from,
                  to: c.to || c.from + size,
                  open: Number(c.open),
                  close: Number(c.close),
                  min: Number(c.min),
                  max: Number(c.max),
                  volume: Number(c.volume) || 100,
                };
                const uiAssetId = BROKER_TO_ASSET_ID[activeId];
                const brokerId = ASSET_TO_BROKER_ID[activeId];
                const targetIds = Array.from(
                  new Set([activeId, uiAssetId, brokerId].filter(Boolean))
                ) as number[];

                for (const tId of targetIds) {
                  this.hasRealCandleFeed.add(getStoreKey(tId, size));
                  this.ingestRealCandle(tId, size, candleObj);
                }
              }
            } else if (
              (msg.name === 'history-positions' || msg.name === 'positions') &&
              msg.msg
            ) {
              const list = Array.isArray(msg.msg.positions)
                ? msg.msg.positions
                : Array.isArray(msg.msg)
                ? msg.msg
                : [];
              if (list.length > 0) this.handleHistoryPositions(list);
            } else if (
              (msg.name === 'position-changed' ||
                msg.name === 'option-closed' ||
                msg.name === 'socket-option-closed' ||
                msg.name === 'option-archived') &&
              msg.msg
            ) {
              const posItem = msg.msg.position || msg.msg;
              this.handleHistoryPositions([posItem]);
            }
          } catch {
            // ignore malformed packet
          }
        });

        ws.on('error', () => {
          finish(false);
        });

        ws.on('close', () => {
          this.connected = false;
          finish(false);
        });
      } catch {
        finish(false);
      }
    });
  }

  private ingestRealCandle(assetId: number, timeframe: number, candle: Candle) {
    const list = ensureInitialCandles(assetId, timeframe);
    const lastIdx = list.length - 1;
    if (lastIdx >= 0 && list[lastIdx].from === candle.from) {
      list[lastIdx] = candle;
    } else if (lastIdx < 0 || candle.from > list[lastIdx].from) {
      list.push(candle);
      if (list.length > 320) list.shift();
    }
    this.broadcast({
      type: 'candle_tick',
      payload: {
        assetId,
        timeframe,
        candle,
        serverTimestamp: Math.floor(Date.now() / 1000),
      },
    });
  }

  private ingestRealQuote(activeId: number, price: number) {
    const tf = 60;
    const nowSec = Math.floor(Date.now() / 1000);
    const uiAssetId = BROKER_TO_ASSET_ID[activeId];
    const brokerId = ASSET_TO_BROKER_ID[activeId];
    const targetIds = Array.from(
      new Set([activeId, uiAssetId, brokerId].filter(Boolean))
    ) as number[];

    for (const id of targetIds) {
      const list = ensureInitialCandles(id, tf);
      const last = list[list.length - 1];
      if (last && nowSec >= last.from && nowSec <= last.to + 2) {
        last.close = price;
        if (price > last.max) last.max = price;
        if (price < last.min) last.min = price;
        this.hasRealCandleFeed.add(getStoreKey(id, tf));
        this.broadcast({
          type: 'candle_tick',
          payload: {
            assetId: id,
            timeframe: tf,
            candle: last,
            serverTimestamp: nowSec,
          },
        });
      }
    }
  }

  public onAuthenticatedSuccess() {
    this.authenticated = true;
    this.connecting = false;

    // 1. Request user profile and balances
    this.sendToIQ('sendMessage', {
      name: 'core.get-profile',
      version: '1.0',
      body: {},
    });
    this.sendToIQ('sendMessage', {
      name: 'get-balances',
      version: '1.0',
      body: { types_ids: [1, 4] },
    });
    this.sendToIQ(
      'sendMessage',
      {
        name: 'get-initialization-data',
        version: '3.0',
        body: {},
      },
      'init_data'
    );

    // 2. Immediately subscribe to all active pairs' live candle feeds
    this.subscribeAllLiveCandles();

    this.saveSessionToDisk();
    this.broadcast({ type: 'status', payload: this.getStatusPayload() });
  }

  public subscribeAllLiveCandles() {
    if (!this.iqSocket || this.iqSocket.readyState !== WebSocket.OPEN) return;
    const nowSec = Math.floor(Date.now() / 1000);

    const brokerActives = [
      // Pares Normais Binários
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
      // Pares OTC Binários
      76, 77, 78, 79, 80, 82, 83, 84, 85, 86, 87, 88, 89,
      // Pares Especiais OTC (IDs reais na corretora)
      2298, 2300, 2299, 1380, 1381, 1382, 1383
    ];

    for (const actId of brokerActives) {
      // Subscribe live candle stream M1
      this.sendToIQ('subscribeMessage', {
        name: 'candle-generated',
        params: {
          routingFilters: {
            active_id: actId,
            size: 60,
          },
        },
      });

      // Subscribe live sub-second quote stream
      this.sendToIQ('subscribeMessage', {
        name: 'quote-generated',
        params: {
          routingFilters: {
            active_id: actId,
          },
        },
      });

      // Request recent 180 real candles
      this.sendToIQ(
        'sendMessage',
        {
          name: 'get-candles',
          version: '2.0',
          body: {
            active_id: actId,
            size: 60,
            to: nowSec,
            count: 180,
          },
        },
        `candles_${actId}_60`
      );
    }
  }

  public requestCandlesForActive(activeId: number, timeframe = 60, count = 180) {
    if (!this.iqSocket || this.iqSocket.readyState !== WebSocket.OPEN) return;
    const nowSec = Math.floor(Date.now() / 1000);

    this.sendToIQ('subscribeMessage', {
      name: 'candle-generated',
      params: {
        routingFilters: {
          active_id: activeId,
          size: timeframe,
        },
      },
    });

    this.sendToIQ('subscribeMessage', {
      name: 'quote-generated',
      params: {
        routingFilters: {
          active_id: activeId,
        },
      },
    });

    this.sendToIQ(
      'sendMessage',
      {
        name: 'get-candles',
        version: '2.0',
        body: {
          active_id: activeId,
          size: timeframe,
          to: nowSec,
          count,
        },
      },
      `candles_${activeId}_${timeframe}`
    );
  }

  public getCatalogCandles(asset: IQAsset, timeframe: number, count: number): Candle[] {
    const resolved = this.resolveActive(asset.id, asset.ticker);
    const liveBrokerSession = this.authenticated && !this.ssid.startsWith('sim_session_');
    if (liveBrokerSession) {
      this.requestCandlesForActive(resolved.activeId, timeframe, count);
    }

    const assetIds = [resolved.activeId, asset.id];
    const hasRealFeed = assetIds.some((id) =>
      this.hasRealCandleFeed.has(getStoreKey(id, timeframe))
    );
    if (liveBrokerSession && !hasRealFeed) return [];

    const candles = assetIds
      .map((id) => candleStore.get(getStoreKey(id, timeframe)))
      .find((list) => list && list.length > 0) ||
      ensureInitialCandles(resolved.activeId, timeframe, count);
    return candles.slice(-count);
  }

  private tickMarketStream() {
    const nowSec = Math.floor(Date.now() / 1000);
    const batch60: Record<number, Candle> = {};
    const batch300: Record<number, Candle> = {};

    for (const asset of DEFAULT_ASSETS) {
      for (const tf of [60, 300]) {
        const key = getStoreKey(asset.id, tf);
        const list = ensureInitialCandles(asset.id, tf);
        const currentBucket = Math.floor(nowSec / tf) * tf;
        let currentCandle = list[list.length - 1];

        // Only synthesize ticks for pairs not currently receiving live socket ticks
        if (!this.hasRealCandleFeed.has(key)) {
          const basePrice = BASE_PRICES[asset.id] || 1.1;
          const decimals = basePrice > 50 ? 3 : 5;
          const microVol = basePrice * (tf === 60 ? 0.00014 : 0.00024);

          if (!currentCandle || currentCandle.from < currentBucket) {
            const open = currentCandle ? currentCandle.close : basePrice;
            currentCandle = {
              id: Math.floor(currentBucket / tf),
              from: currentBucket,
              to: currentBucket + tf,
              open,
              close: open,
              min: open,
              max: open,
              volume: 15,
            };
            list.push(currentCandle);
            if (list.length > 320) list.shift();
          } else {
            const quadrantIndex = Math.floor(currentBucket / (tf * 5));
            const posInQuadrant = Math.floor((currentBucket % (tf * 5)) / tf);
            let bias = (Math.random() - 0.498) * microVol;

            if (posInQuadrant <= 2 && list.length >= 4) {
              const c1 = list[list.length - 4];
              const c2 = list[list.length - 3];
              const c3 = list[list.length - 2];
              const greens = [c1, c2, c3].filter((c) => c.close > c.open).length;
              const minorityGreen = greens < 3 - greens;
              const r = seededRandom(asset.id * 777 + quadrantIndex);
              if (r < 0.78) {
                bias += (minorityGreen ? 1 : -1) * microVol * 0.24;
              }
            }

            const newClose = Number((currentCandle.close + bias).toFixed(decimals));
            currentCandle.close = newClose;
            if (newClose > currentCandle.max) currentCandle.max = newClose;
            if (newClose < currentCandle.min) currentCandle.min = newClose;
            currentCandle.volume += Math.floor(Math.random() * 8) + 1;
          }
        }

        if (currentCandle) {
          if (tf === 60) batch60[asset.id] = currentCandle;
          else batch300[asset.id] = currentCandle;
        }
      }
    }

    this.broadcast({
      type: 'candles_batch_tick',
      payload: {
        batch60,
        batch300,
        serverTimestamp: nowSec,
      },
    });

    this.settleOpenOrders(nowSec);
    this.runBackgroundBot(nowSec);
  }

  public executeOrder(params: {
    assetId: number;
    ticker?: string;
    direction: 'CALL' | 'PUT';
    amount: number;
    instrumentType?: 'binary' | 'digital';
    accountType?: 'PRACTICE' | 'REAL';
    timeframe?: number;
    galeStep?: 0 | 1 | 2;
    sorosLevel?: number;
    strategyLabel?: string;
    signalId?: string;
  }): TradeOrder {
    const {
      assetId,
      ticker,
      direction,
      amount,
      instrumentType = 'binary',
      accountType = this.activeBalanceType,
      timeframe = 60,
      galeStep = 0,
      sorosLevel = 1,
      strategyLabel = 'Operação',
      signalId,
    } = params;

    const numAmount = Math.max(2, Number(amount) || 2);
    const balanceId =
      accountType === 'REAL' ? this.realBalanceId : this.practiceBalanceId;
    const nowSec = Math.floor(Date.now() / 1000);

    // Calculate expiration timestamp with mandatory 30-second buffer
    let expirationTimestamp = Math.floor(nowSec / timeframe) * timeframe + timeframe;
    if (expirationTimestamp - nowSec < 30) {
      expirationTimestamp += timeframe;
    }

    // Resolve real active ID recognized by the IQ Option broker
    const resolved = this.resolveActive(Number(assetId), ticker);
    const resolvedActiveId = resolved.activeId;
    const resolvedTicker = ticker || resolved.ticker;
    const resolvedPayout = resolved.payout;

    const reqId = this.nextRequestId('ord');

    // Transmit directly via WebSocket to IQ Option
    this.sendToIQ(
      'sendMessage',
      {
        name: 'binary-options.open-option',
        version: '1.0',
        body: {
          user_balance_id: balanceId,
          active_id: resolvedActiveId,
          option_type_id: 3,
          direction: direction === 'PUT' ? 'put' : 'call',
          expired: expirationTimestamp,
          price: numAmount,
        },
      },
      reqId
    );

    this.adjustBalance(accountType, -numAmount);

    const candles = ensureInitialCandles(resolvedActiveId, Number(timeframe) || 60);
    const currentCandle = candles[candles.length - 1];

    const order: TradeOrder = {
      id: `ord_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      iqOptionOrderId: `IQ-Envio...`,
      timestamp: nowSec,
      assetTicker: resolvedTicker,
      assetId: resolvedActiveId,
      direction,
      amount: numAmount,
      payoutPercent: resolvedPayout,
      galeStep: galeStep as 0 | 1 | 2,
      sorosLevel: Number(sorosLevel) || 1,
      strategyLabel,
      openPrice: currentCandle ? currentCandle.close : 1.0845,
      status: 'OPEN',
      profit: 0,
      accountType,
      expirationTimestamp,
      timeframe,
      signalId,
      brokerConfirmed: false,
      brokerMessage: 'Enviando à corretora IQ Option...',
    };

    this.pendingOrdersByReqId.set(reqId, order.id);
    this.ordersStore.unshift(order);
    if (this.ordersStore.length > 500) this.ordersStore = this.ordersStore.slice(0, 500);
    saveOrdersToDisk(this.ordersStore);

    this.broadcast({
      type: 'order_opened',
      payload: {
        order,
        orders: this.ordersStore,
        status: this.getStatusPayload(),
      },
    });
    this.notifyTelegramOrderEntry(order);

    return order;
  }

  public queryBrokerPositionHistory() {
    if (!this.connected || !this.authenticated) return;
    const balanceId =
      this.activeBalanceType === 'REAL' ? this.realBalanceId : this.practiceBalanceId;
    this.sendToIQ(
      'sendMessage',
      {
        name: 'portfolio.get-history-positions',
        version: '1.0',
        body: { user_balance_id: balanceId, limit: 12 },
      },
      this.nextRequestId('hist_pos')
    );
    this.sendToIQ(
      'sendMessage',
      {
        name: 'get-history-positions',
        version: '2.0',
        body: { user_balance_id: balanceId, limit: 12, offset: 0 },
      },
      this.nextRequestId('hist_pos_v2')
    );
  }

  public handleHistoryPositions(positions: any[]) {
    if (!Array.isArray(positions) || positions.length === 0) return;
    let anyUpdated = false;

    for (const pos of positions) {
      if (!pos || typeof pos !== 'object') continue;

      // 1. Unwrap nested raw_event if wrapped (e.g. binary_options_option_changed1)
      let rawObj: any = pos.raw_event;
      if (rawObj && typeof rawObj === 'object') {
        const subKeys = Object.keys(rawObj);
        if (subKeys.length > 0 && typeof rawObj[subKeys[0]] === 'object') {
          rawObj = rawObj[subKeys[0]];
        }
      }

      // 2. Identify Option ID / External ID
      const optId = String(
        pos.external_id ||
        pos.option_id ||
        pos.id ||
        rawObj?.option_id ||
        rawObj?.id ||
        ''
      );

      // 3. Find matching OPEN order in ordersStore
      const order = this.ordersStore.find((o) => {
        if (o.status !== 'OPEN') return false;
        if (optId && (String(o.iqOptionOrderId) === optId || o.id === optId)) return true;
        // Match by creation timestamp (+/- 4 seconds) if same asset
        if (pos.open_time && o.assetId) {
          const posOpenSec = Math.floor(
            Number(pos.open_time) / (Number(pos.open_time) > 1e11 ? 1000 : 1)
          );
          if (Math.abs(posOpenSec - o.timestamp) <= 4) {
            return true;
          }
        }
        return false;
      });

      if (!order) continue;

      // 4. Check if position is actually closed
      const isClosed =
        pos.status === 'closed' ||
        pos.status === 'won' ||
        pos.status === 'loose' ||
        pos.status === 'equal' ||
        pos.close_reason != null ||
        rawObj?.result != null ||
        pos.close_time != null;

      if (!isClosed) continue;

      // 5. Extract accurate Result: WIN vs LOSS vs EQUAL
      // Note: IQ Option API uses "win", "loose" (with double 'o'), and "equal"
      const resultToken = String(
        pos.close_reason ||
        rawObj?.result ||
        (pos.pnl > 0 ? 'win' : pos.pnl < 0 ? 'loose' : '')
      )
        .toLowerCase()
        .trim();

      const pnlVal =
        typeof pos.pnl === 'number'
          ? pos.pnl
          : typeof pos.pnl_realized === 'number'
          ? pos.pnl_realized
          : null;

      const isWin =
        resultToken === 'win' ||
        (pnlVal !== null && pnlVal > 0) ||
        (typeof pos.close_profit === 'number' &&
          typeof pos.invest === 'number' &&
          pos.close_profit > pos.invest) ||
        (typeof rawObj?.win_enrolled_amount === 'number' &&
          rawObj.win_enrolled_amount > (rawObj.amount || 0));

      const isEqual =
        resultToken === 'equal' ||
        (!isWin && resultToken !== 'loose' && pnlVal !== null && pnlVal === 0);

      // 6. Net Profit
      let netProfit = 0;
      if (isEqual) {
        netProfit = 0;
      } else if (isWin) {
        if (pnlVal !== null && pnlVal > 0) {
          netProfit = Number(pnlVal.toFixed(2));
        } else if (
          typeof pos.close_profit === 'number' &&
          typeof pos.invest === 'number' &&
          pos.close_profit > pos.invest
        ) {
          netProfit = Number((pos.close_profit - pos.invest).toFixed(2));
        } else if (typeof rawObj?.profit_amount === 'number' && rawObj.profit_amount > 0) {
          netProfit = Number(rawObj.profit_amount.toFixed(2));
        } else {
          netProfit = Number(((order.amount * order.payoutPercent) / 100).toFixed(2));
        }
      } else {
        netProfit = -order.amount;
      }

      // 7. Extract real Open and Close quotes from broker
      const openQuote = Number(pos.open_quote || rawObj?.value || order.openPrice);
      const closeQuote = Number(
        pos.close_quote ||
          rawObj?.expiration_value ||
          pos.raw_event?.expiration_value ||
          order.closePrice ||
          openQuote
      );

      order.openPrice = openQuote;
      order.closePrice = closeQuote;
      order.status = isEqual ? 'EQUAL' : isWin ? 'WIN' : 'LOSS';
      order.profit = netProfit;
      order.brokerConfirmed = true;
      if (optId && (!order.iqOptionOrderId || String(order.iqOptionOrderId).startsWith('IQ-'))) {
        order.iqOptionOrderId = optId;
      }
      order.brokerMessage = isWin
        ? `WIN confirmado pela IQ Option (+R$ ${netProfit.toFixed(2)})`
        : isEqual
        ? 'EMPATE na IQ Option (R$ 0,00)'
        : `LOSS confirmado pela IQ Option (-R$ ${Math.abs(netProfit).toFixed(2)})`;
      this.notifyTelegramOrderResult(order);

      // Refresh real balances from IQ Option
      this.sendToIQ(
        'sendMessage',
        {
          name: 'get-balances',
          version: '1.0',
          body: { types_ids: [1, 4] },
        },
        this.nextRequestId('bal_sync')
      );

      // Update session risk stats
      this.botState.riskState.sessionProfit = Number(
        (this.botState.riskState.sessionProfit + netProfit).toFixed(2)
      );
      if (isWin) this.botState.riskState.totalWins += 1;
      else if (!isEqual) this.botState.riskState.totalLosses += 1;

      // Stop Win / Stop Loss check
      if (this.botState.riskState.sessionProfit >= this.botState.riskConfig.stopWin) {
        this.botState.riskState.stopWinReached = true;
        this.botState.isRunning = false;
      } else if (this.botState.riskState.sessionProfit <= -this.botState.riskConfig.stopLoss) {
        this.botState.riskState.stopLossReached = true;
        this.botState.isRunning = false;
      }

      // CRITICAL: Gale & Martingale State Handling
      if (isWin) {
        // WIN: RESET GALE STEP & STAKE IMMEDIATELY! NO MORE ENTRIES!
        this.botState.riskState.currentGaleStep = 0;
        this.botState.riskState.nextCalculatedStake = this.botState.riskConfig.baseEntryAmount;

        if (order.signalId) {
          const sig = this.botState.scheduledSignals.find((s) => s.id === order.signalId);
          if (sig) {
            sig.status = order.galeStep === 0 ? 'WIN_1ST' : order.galeStep === 1 ? 'WIN_G1' : 'WIN_G2';
            sig.profit = netProfit;
          }
        }
      } else if (isEqual) {
        // EMPATE: Manter sem acionar gale
      } else {
        // LOSS: Only trigger next Gale if under maxGales limit
        const maxGales = order.signalId
          ? this.botState.signalListConfig.maxGales
          : this.botState.riskConfig.maxGales;
        const galeMultiplier = order.signalId
          ? this.botState.signalListConfig.galeMultiplier
          : this.botState.riskConfig.galeMultiplier;

        if (
          order.galeStep < maxGales &&
          this.botState.isRunning &&
          !this.botState.riskState.stopLossReached
        ) {
          const nextGaleStep = (order.galeStep + 1) as 1 | 2;
          const nextStake = Number((order.amount * galeMultiplier).toFixed(2));
          this.botState.riskState.currentGaleStep = nextGaleStep;
          this.botState.riskState.nextCalculatedStake = nextStake;

          this.executeOrder({
            assetId: order.assetId,
            ticker: order.assetTicker,
            direction: order.direction,
            amount: nextStake,
            instrumentType: 'binary',
            accountType: order.accountType,
            timeframe: order.timeframe || 60,
            galeStep: nextGaleStep,
            strategyLabel: `${order.strategyLabel.replace(/ \[Gale \d\]/g, '')} [Gale ${nextGaleStep}]`,
            signalId: order.signalId,
          });
        } else {
          // Max gales reached or stopped: Reset cycle!
          this.botState.riskState.currentGaleStep = 0;
          this.botState.riskState.nextCalculatedStake = this.botState.riskConfig.baseEntryAmount;
          if (order.signalId) {
            const sig = this.botState.scheduledSignals.find((s) => s.id === order.signalId);
            if (sig) {
              sig.status = 'LOSS';
              sig.profit = -order.amount;
            }
          }
        }
      }

      anyUpdated = true;
    }

    if (anyUpdated) {
      saveOrdersToDisk(this.ordersStore);
      saveBotStateToDisk(this.botState);
      this.broadcast({
        type: 'orders_update',
        payload: {
          orders: this.ordersStore,
          botState: this.botState,
        },
      });
    }
  }

  public settleOpenOrders(nowSec: number) {
    const openOrders = this.ordersStore.filter((o) => o.status === 'OPEN');
    if (openOrders.length === 0) return;

    // If connected to IQ Option and have broker orders, query official broker history
    if (this.connected && this.authenticated && openOrders.some((o) => o.brokerConfirmed)) {
      this.queryBrokerPositionHistory();
    }

    for (const order of openOrders) {
      const tf = order.timeframe || 60;
      const expTime = order.expirationTimestamp || (order.timestamp + tf);

      // For broker-confirmed orders, wait for official broker settlement!
      // Only do fallback if 45 seconds past expiration without broker response
      if (order.brokerConfirmed) {
        if (nowSec < expTime + 45) {
          continue;
        }
      } else if (nowSec < expTime) {
        continue;
      }

      // Offline / Local fallback settlement (when disconnected or after safety timeout)
      const pairCandles = candleStore.get(getStoreKey(order.assetId, tf)) || [];
      // CRITICAL: The candle of the trade is the one that FINISHES at expTime (from: expTime - tf)!
      const tradeCandleFrom = expTime - tf;
      const targetCandle =
        pairCandles.find((c) => c.from === tradeCandleFrom) ||
        pairCandles.find((c) => c.from === Math.floor(order.timestamp / tf) * tf) ||
        pairCandles[pairCandles.length - 1];

      const entryPrice = order.openPrice || (targetCandle ? targetCandle.open : 0);
      const closePrice = targetCandle ? targetCandle.close : entryPrice;

      let isWin = false;
      let isEqual = false;
      const priceDiff = closePrice - entryPrice;

      if (Math.abs(priceDiff) <= 0.000001) {
        isEqual = true;
      } else if (order.direction === 'CALL') {
        isWin = priceDiff > 0.000001;
      } else {
        isWin = priceDiff < -0.000001;
      }

      const netProfit = isEqual
        ? 0
        : isWin
        ? Number(((order.amount * order.payoutPercent) / 100).toFixed(2))
        : -order.amount;

      const grossReturn = isEqual
        ? order.amount
        : isWin
        ? Number((order.amount + netProfit).toFixed(2))
        : 0;

      if (grossReturn > 0) {
        this.adjustBalance(order.accountType, grossReturn);
      }

      order.closePrice = closePrice;
      order.status = isEqual ? 'EQUAL' : isWin ? 'WIN' : 'LOSS';
      order.profit = netProfit;
      this.notifyTelegramOrderResult(order);

      this.botState.riskState.sessionProfit = Number(
        (this.botState.riskState.sessionProfit + netProfit).toFixed(2)
      );
      if (isWin) this.botState.riskState.totalWins += 1;
      else if (!isEqual) this.botState.riskState.totalLosses += 1;

      if (isWin) {
        this.botState.riskState.currentGaleStep = 0;
        this.botState.riskState.nextCalculatedStake = this.botState.riskConfig.baseEntryAmount;
        if (order.signalId) {
          const sig = this.botState.scheduledSignals.find((s) => s.id === order.signalId);
          if (sig) {
            sig.status = order.galeStep === 0 ? 'WIN_1ST' : order.galeStep === 1 ? 'WIN_G1' : 'WIN_G2';
            sig.profit = netProfit;
          }
        }
      } else if (!isEqual) {
        const maxGales = order.signalId
          ? this.botState.signalListConfig.maxGales
          : this.botState.riskConfig.maxGales;
        const galeMultiplier = order.signalId
          ? this.botState.signalListConfig.galeMultiplier
          : this.botState.riskConfig.galeMultiplier;

        if (
          order.galeStep < maxGales &&
          this.botState.isRunning &&
          !this.botState.riskState.stopLossReached
        ) {
          const nextGaleStep = (order.galeStep + 1) as 1 | 2;
          const nextStake = Number((order.amount * galeMultiplier).toFixed(2));
          this.botState.riskState.currentGaleStep = nextGaleStep;
          this.botState.riskState.nextCalculatedStake = nextStake;

          this.executeOrder({
            assetId: order.assetId,
            ticker: order.assetTicker,
            direction: order.direction,
            amount: nextStake,
            instrumentType: 'binary',
            accountType: order.accountType,
            timeframe: order.timeframe || 60,
            galeStep: nextGaleStep,
            strategyLabel: `${order.strategyLabel.replace(/ \[Gale \d\]/g, '')} [Gale ${nextGaleStep}]`,
            signalId: order.signalId,
          });
        } else {
          this.botState.riskState.currentGaleStep = 0;
          this.botState.riskState.nextCalculatedStake = this.botState.riskConfig.baseEntryAmount;
          if (order.signalId) {
            const sig = this.botState.scheduledSignals.find((s) => s.id === order.signalId);
            if (sig) {
              sig.status = 'LOSS';
              sig.profit = -order.amount;
            }
          }
        }
      }

      saveOrdersToDisk(this.ordersStore);
      saveBotStateToDisk(this.botState);

      this.broadcast({
        type: 'orders_update',
        payload: {
          orders: this.ordersStore,
          settledOrder: order,
          botState: this.botState,
        },
      });
    }
  }

  private calculateEma(values: number[], period: number): number[] {
    if (values.length === 0) return [];
    const k = 2 / (period + 1);
    const emaArray: number[] = new Array(values.length);
    emaArray[0] = values[0];
    for (let i = 1; i < values.length; i++) {
      emaArray[i] = values[i] * k + emaArray[i - 1] * (1 - k);
    }
    return emaArray;
  }

  private computeAssetScore(assetId: number, tf: number): number {
    const asset = this.catalogAssets.find((a) => a.id === assetId);
    const candles = candleStore.get(getStoreKey(assetId, tf)) || [];
    if (candles.length < 15) return (asset?.payout || 80);

    const quadrantSeconds = tf * 5;
    const mode = this.botState.strategyConfig.mhiMode || 'MINORIA';
    let wins = 0;
    let total = 0;

    const quadrants: Map<number, Candle[]> = new Map();
    for (const c of candles) {
      const qStart = Math.floor(c.from / quadrantSeconds) * quadrantSeconds;
      const list = quadrants.get(qStart) || [];
      list.push(c);
      quadrants.set(qStart, list);
    }

    quadrants.forEach((qCandles) => {
      if (qCandles.length < 5) return;
      const base = qCandles.slice(0, 3);
      const greens = base.filter((c) => c.close > c.open).length;
      const reds = base.filter((c) => c.close < c.open).length;
      if (greens === reds) return;

      const minorityGreen = greens < reds;
      const targetColor =
        mode === 'MINORIA' ? (minorityGreen ? 'GREEN' : 'RED') : minorityGreen ? 'RED' : 'GREEN';
      const entryCandle = qCandles[3];
      if (!entryCandle) return;
      total++;
      const isWin1 =
        targetColor === 'GREEN'
          ? entryCandle.close > entryCandle.open
          : entryCandle.close < entryCandle.open;
      if (isWin1) {
        wins++;
      } else {
        const gale1Candle = qCandles[4];
        if (gale1Candle) {
          const isWinG1 =
            targetColor === 'GREEN'
              ? gale1Candle.close > gale1Candle.open
              : gale1Candle.close < gale1Candle.open;
          if (isWinG1) wins += 0.8;
        }
      }
    });

    const winRate = total > 0 ? (wins / total) * 100 : 50;
    const payoutBonus = (asset?.payout || 80) * 0.15;
    return winRate + payoutBonus;
  }

  private getTechnicalConfluenceCount(
    candles: Candle[],
    direction: 'CALL' | 'PUT',
    includeMhiBase = false
  ): number {
    if (candles.length === 0) return includeMhiBase ? 1 : 0;

    const config = this.botState.strategyConfig;
    const snapshot = computeTechnicalSnapshot(candles, config);
    const currentPrice = candles[candles.length - 1].close;
    let count = includeMhiBase ? 1 : 0;

    if (config.useMacroTrendFilter !== false) {
      const aligned =
        (direction === 'CALL' && snapshot.macroTrend === 'BULLISH') ||
        (direction === 'PUT' && snapshot.macroTrend === 'BEARISH');
      if (aligned) count += 1;
    }

    if (config.useEmaFilter !== false) {
      const aligned =
        direction === 'CALL'
          ? snapshot.ema9 > snapshot.ema21 && currentPrice >= snapshot.ema21
          : snapshot.ema9 < snapshot.ema21 && currentPrice <= snapshot.ema21;
      if (aligned) count += 1;
    }

    if (config.useRsiFilter !== false) {
      const aligned =
        config.rsiMode === 'TREND'
          ? direction === 'CALL'
            ? snapshot.rsi14 >= 50
            : snapshot.rsi14 <= 50
          : direction === 'CALL'
          ? snapshot.rsi14 < (config.rsiOverbought ?? 70)
          : snapshot.rsi14 > (config.rsiOversold ?? 30);
      if (aligned) count += 1;
    }

    if (config.useBollingerFilter !== false) {
      const aligned =
        direction === 'CALL'
          ? snapshot.bbPosition !== 'ABOVE_UPPER'
          : snapshot.bbPosition !== 'BELOW_LOWER';
      if (aligned) count += 1;
    }

    if (config.useMacdFilter) {
      const aligned =
        direction === 'CALL'
          ? snapshot.macdHistogram >= 0
          : snapshot.macdHistogram <= 0;
      if (aligned) count += 1;
    }

    if (config.useSrFilter !== false) {
      const aligned = direction === 'CALL' ? !snapshot.nearResistance : !snapshot.nearSupport;
      if (aligned) count += 1;
    }

    if (config.usePriceActionFilter !== false) {
      const opposingPattern =
        direction === 'CALL'
          ? snapshot.priceActionPattern === 'BEARISH_ENGULFING' ||
            snapshot.priceActionPattern === 'BEARISH_PINBAR'
          : snapshot.priceActionPattern === 'BULLISH_ENGULFING' ||
            snapshot.priceActionPattern === 'BULLISH_PINBAR';
      if (!opposingPattern) count += 1;
    }

    return count;
  }

  public runBackgroundBot(nowSec: number) {
    if (!this.botState.isRunning) return;
    if (this.botState.riskState.stopWinReached || this.botState.riskState.stopLossReached) return;

    // Keep at most one open position or Gale sequence at a time.
    if (this.ordersStore.some((order) => order.status === 'OPEN')) return;

    const candidates: BotSignalCandidate[] = [];
    let botStateChanged = false;

    if (this.botState.botMode === 'SIGNAL_LIST' || this.botState.botMode === 'BOTH') {
      for (const signal of this.botState.scheduledSignals) {
        if (!signal.enabled || (signal.status !== 'PENDING' && signal.status !== 'PRE_SIGNAL')) {
          continue;
        }

        const secondsRemaining = signal.targetTimestamp - nowSec;
        if (secondsRemaining <= 30 && secondsRemaining > 2 && signal.status === 'PENDING') {
          signal.status = 'PRE_SIGNAL';
          botStateChanged = true;
        }

        const advance =
          this.botState.signalListConfig.entryAdvanceSeconds === 0
            ? 0
            : 60 - this.botState.signalListConfig.entryAdvanceSeconds;
        const triggerTime = signal.targetTimestamp - advance;
        if (nowSec < triggerTime || nowSec > triggerTime + 2) continue;

        const pairCandles = candleStore.get(getStoreKey(signal.assetId, signal.timeframe)) || [];
        let trendConfluence = 0;
        if (this.botState.signalListConfig.useEmaTrendFilter && pairCandles.length >= 20) {
          const closes = pairCandles.map((candle) => candle.close);
          const emaArr = this.calculateEma(closes, 100);
          const lastEma = emaArr[emaArr.length - 1];
          const currentPrice = closes[closes.length - 1];
          if (lastEma) {
            const trendBlocked =
              (signal.direction === 'CALL' && currentPrice < lastEma) ||
              (signal.direction === 'PUT' && currentPrice > lastEma);
            if (trendBlocked) {
              signal.status = 'BLOCKED_TREND';
              botStateChanged = true;
              console.log(`[Bot Lista] ${signal.ticker} ${signal.direction} bloqueado por Filtro de Tendência (EMA 100)`);
              continue;
            }
            trendConfluence = 1;
          }
        }

        const resolved = this.resolveActive(signal.assetId, signal.ticker);
        candidates.push({
          source: 'SIGNAL_LIST',
          assetId: signal.assetId,
          ticker: signal.ticker,
          direction: signal.direction,
          timeframe: signal.timeframe,
          payout: resolved.payout,
          confluenceCount:
            trendConfluence + this.getTechnicalConfluenceCount(pairCandles, signal.direction),
          strategyLabel: `Lista: ${signal.timeStr} ${signal.ticker}`,
          signal,
        });
      }
    }

    if (this.botState.botMode === 'STRATEGY' || this.botState.botMode === 'BOTH') {
      const timeframe = this.botState.strategyConfig.timeframe || 60;
      const quadrantSeconds = timeframe * 5;
      const variantOffset =
        this.botState.strategyConfig.mhiVariant === 'MHI_1'
          ? 0
          : this.botState.strategyConfig.mhiVariant === 'MHI_2'
          ? 1
          : 2;
      const currentQuadrantStart = Math.floor(nowSec / quadrantSeconds) * quadrantSeconds;
      let targetCandleStart = currentQuadrantStart + variantOffset * timeframe;
      if (nowSec >= targetCandleStart + timeframe) {
        targetCandleStart = currentQuadrantStart + quadrantSeconds + variantOffset * timeframe;
      }

      const advance =
        this.botState.strategyConfig.entryTimingSecond === 0
          ? 0
          : 60 - this.botState.strategyConfig.entryTimingSecond;
      const triggerTime = targetCandleStart - advance;
      const isTriggerWindow = nowSec >= triggerTime && nowSec <= triggerTime + 2;

      if (isTriggerWindow && this.lastServerMhiTrigger !== targetCandleStart) {
        this.lastServerMhiTrigger = targetCandleStart;
        for (const assetId of this.botState.selectedBotAssetIds) {
          const asset = this.catalogAssets.find((item) => item.id === assetId);
          if (!asset) continue;

          const candles = candleStore.get(getStoreKey(assetId, timeframe)) || [];
          if (candles.length < 5) continue;

          const base = candles.slice(-3);
          const greens = base.filter((candle) => candle.close > candle.open).length;
          const reds = base.filter((candle) => candle.close < candle.open).length;
          if (greens === reds) continue;

          const minorityGreen = greens < reds;
          const targetColor =
            this.botState.strategyConfig.mhiMode === 'MINORIA'
              ? minorityGreen ? 'GREEN' : 'RED'
              : minorityGreen ? 'RED' : 'GREEN';
          const direction: 'CALL' | 'PUT' = targetColor === 'GREEN' ? 'CALL' : 'PUT';
          const snapshot = computeTechnicalSnapshot(candles, this.botState.strategyConfig);

          if (
            this.botState.strategyConfig.useMacroTrendFilter !== false &&
            ((direction === 'CALL' && snapshot.macroTrend === 'BEARISH') ||
              (direction === 'PUT' && snapshot.macroTrend === 'BULLISH'))
          ) {
            console.log(`[MHI Bot] ${asset.ticker} ${direction} bloqueado pelo Filtro de Trend Global`);
            continue;
          }

          const resolved = this.resolveActive(assetId, asset.ticker);
          candidates.push({
            source: 'STRATEGY',
            assetId,
            ticker: asset.ticker,
            direction,
            timeframe,
            payout: resolved.payout,
            confluenceCount: this.getTechnicalConfluenceCount(candles, direction, true),
            historicalScore: this.computeAssetScore(assetId, timeframe),
            strategyLabel: `${this.botState.strategyConfig.mhiVariant} ${this.botState.strategyConfig.mhiMode}`,
          });
        }
      }
    }

    if (candidates.length === 0) {
      if (botStateChanged) {
        saveBotStateToDisk(this.botState);
        this.broadcast({ type: 'bot_state', payload: this.botState });
      }
      return;
    }

    candidates.sort(
      (left, right) =>
        right.confluenceCount - left.confluenceCount ||
        right.payout - left.payout ||
        (right.historicalScore || 0) - (left.historicalScore || 0) ||
        left.assetId - right.assetId
    );
    const selectedCandidate = candidates[0];

    for (const candidate of candidates.slice(1)) {
      if (candidate.signal) {
        candidate.signal.status = 'BLOCKED_OVERLAP';
        botStateChanged = true;
      }
      console.log(
        `[Anti-Overlapping] ${candidate.ticker} ${candidate.direction} ignorado; prioridade para ${selectedCandidate.ticker} (${selectedCandidate.confluenceCount} confluências, payout ${selectedCandidate.payout}%).`
      );
    }

    if (selectedCandidate.signal) {
      selectedCandidate.signal.status = 'EXECUTING';
    }
    const order = this.executeOrder({
      assetId: selectedCandidate.assetId,
      ticker: selectedCandidate.ticker,
      direction: selectedCandidate.direction,
      amount:
        selectedCandidate.source === 'STRATEGY'
          ? this.botState.riskState.nextCalculatedStake || this.botState.riskConfig.baseEntryAmount
          : this.botState.riskConfig.baseEntryAmount,
      instrumentType: 'binary',
      accountType: this.botState.riskConfig.accountType,
      timeframe: selectedCandidate.timeframe,
      galeStep: 0,
      strategyLabel: selectedCandidate.strategyLabel,
      signalId: selectedCandidate.signal?.id,
    });

    if (selectedCandidate.signal) {
      selectedCandidate.signal.orderId = order.id;
      botStateChanged = true;
    }
    if (botStateChanged) saveBotStateToDisk(this.botState);
    this.broadcast({ type: 'bot_state', payload: this.botState });
  }

  public switchAccount(accountType: 'PRACTICE' | 'REAL') {
    this.activeBalanceType = accountType;
    this.saveSessionToDisk();
    this.broadcast({ type: 'status', payload: this.getStatusPayload() });
  }

  public adjustBalance(accountType: 'PRACTICE' | 'REAL', delta: number) {
    if (accountType === 'REAL') {
      this.realBalance = Number(Math.max(0, this.realBalance + delta).toFixed(2));
    } else {
      this.practiceBalance = Number(Math.max(0, this.practiceBalance + delta).toFixed(2));
    }
    this.saveSessionToDisk();
    this.broadcast({ type: 'status', payload: this.getStatusPayload() });
  }

  public disconnect() {
    this.safeCloseSocket();
    this.connected = false;
    this.authenticated = false;
    this.connecting = false;
    this.requires2FA = false;
    this.ssid = '';
    try {
      if (fs.existsSync(SESSION_FILE_PATH)) {
        fs.unlinkSync(SESSION_FILE_PATH);
      }
    } catch {
      // ignore
    }
    this.broadcast({ type: 'status', payload: this.getStatusPayload() });
  }
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  const iqBridge = new IQOptionBridge();

  app.use(express.json());

  app.get('/api/iq/status', (_req, res) => {
    res.json(iqBridge.getStatusPayload());
  });

  app.post('/api/iq/connect', async (req, res) => {
    const { email, password, ssid, accountType, demoSimulatorMode } = req.body || {};
    const result = await iqBridge.loginWithCredentials(
      email,
      password,
      ssid,
      accountType || 'PRACTICE',
      Boolean(demoSimulatorMode)
    );
    res.json({
      ...result,
      status: iqBridge.getStatusPayload(),
    });
  });

  app.post('/api/iq/verify-2fa', async (req, res) => {
    const { code, accountType } = req.body || {};
    const result = await iqBridge.verify2FACode(code || '', accountType || 'PRACTICE');
    res.json({
      ...result,
      status: iqBridge.getStatusPayload(),
    });
  });

  app.post('/api/iq/disconnect', (_req, res) => {
    iqBridge.disconnect();
    res.json({ success: true, status: iqBridge.getStatusPayload() });
  });

  app.post('/api/iq/balance', (req, res) => {
    const { accountType, resetPracticeBalance } = req.body || {};
    if (accountType === 'PRACTICE' || accountType === 'REAL') {
      iqBridge.switchAccount(accountType);
    }
    if (resetPracticeBalance) {
      iqBridge.practiceBalance = 10000.0;
      iqBridge.broadcast({ type: 'status', payload: iqBridge.getStatusPayload() });
    }
    res.json({ success: true, status: iqBridge.getStatusPayload() });
  });

  app.get('/api/iq/candles', (req, res) => {
    const rawAssetId = Number(req.query.assetId) || 1;
    const timeframe = Number(req.query.timeframe) || 60;
    const count = Math.min(300, Math.max(30, Number(req.query.count) || 200));

    const resolved = iqBridge.resolveActive(rawAssetId);
    if (iqBridge.connected && iqBridge.authenticated) {
      iqBridge.requestCandlesForActive(resolved.activeId, timeframe, count);
    }

    const candles =
      candleStore.get(getStoreKey(resolved.activeId, timeframe)) ||
      candleStore.get(getStoreKey(rawAssetId, timeframe)) ||
      ensureInitialCandles(resolved.activeId, timeframe, count);

    res.json({
      assetId: rawAssetId,
      activeId: resolved.activeId,
      timeframe,
      candles: candles.slice(-count),
      serverTimestamp: Math.floor(Date.now() / 1000),
    });
  });

  app.get('/api/iq/catalog-snapshot', (req, res) => {
    const timeframe = Number(req.query.timeframe) || 60;
    const count = Math.min(300, Math.max(60, Number(req.query.count) || 180));
    const data: Record<number, Candle[]> = {};
    for (const asset of iqBridge.catalogAssets) {
      const resolved = iqBridge.resolveActive(asset.id, asset.ticker);
      const list = iqBridge.getCatalogCandles(asset, timeframe, count);
      data[asset.id] = list;
      if (resolved.activeId !== asset.id) {
        data[resolved.activeId] = list;
      }
    }
    res.json({
      assets: iqBridge.catalogAssets,
      timeframe,
      candlesByAsset: data,
      serverTimestamp: Math.floor(Date.now() / 1000),
    });
  });

  app.get('/api/iq/orders', (_req, res) => {
    res.json({
      success: true,
      orders: iqBridge.ordersStore,
    });
  });

  app.get('/api/iq/telegram', (_req, res) => {
    res.json({ success: true, settings: iqBridge.getTelegramSettings() });
  });

  app.post('/api/iq/telegram', (req, res) => {
    const patch = req.body || {};
    const validationMessage = iqBridge.validateTelegramSettings(patch);
    if (validationMessage) {
      res.status(400).json({
        success: false,
        message: validationMessage,
        settings: iqBridge.getTelegramSettings(),
      });
      return;
    }
    const settings = iqBridge.updateTelegramSettings(patch);
    res.json({ success: true, settings });
  });

  app.post('/api/iq/telegram/test', async (req, res) => {
    const patch = req.body || {};
    const validationMessage = iqBridge.validateTelegramSettings(patch, true);
    if (validationMessage) {
      res.status(400).json({
        success: false,
        message: validationMessage,
        settings: iqBridge.getTelegramSettings(),
      });
      return;
    }
    const settings = iqBridge.updateTelegramSettings(patch);
    const result = await iqBridge.testTelegram();
    res.status(result.success ? 200 : 400).json({ ...result, settings });
  });

  app.delete('/api/iq/orders', (_req, res) => {
    iqBridge.ordersStore = [];
    saveOrdersToDisk([]);
    iqBridge.broadcast({ type: 'orders_update', payload: { orders: [] } });
    res.json({ success: true, message: 'Histórico de ordens limpo com sucesso.' });
  });

  app.post('/api/iq/order', (req, res) => {
    try {
      const order = iqBridge.executeOrder(req.body || {});
      res.json({
        success: true,
        order,
        iqOptionOrderId: order.iqOptionOrderId,
        openPrice: order.openPrice,
        expirationTimestamp: order.expirationTimestamp,
        status: iqBridge.getStatusPayload(),
      });
    } catch {
      res.status(500).json({ success: false, message: 'Erro ao registrar ordem.' });
    }
  });

  app.post('/api/iq/settle', (req, res) => {
    const { accountType = 'PRACTICE', payoutReturn = 0 } = req.body || {};
    if (Number(payoutReturn) > 0) {
      iqBridge.adjustBalance(accountType, Number(payoutReturn));
    }
    res.json({
      success: true,
      status: iqBridge.getStatusPayload(),
    });
  });

  app.get('/api/iq/bot', (_req, res) => {
    res.json({
      success: true,
      botState: iqBridge.botState,
      status: iqBridge.getStatusPayload(),
    });
  });

  app.post('/api/iq/bot', (req, res) => {
    const patch = req.body || {};
    iqBridge.botState = {
      ...iqBridge.botState,
      ...patch,
      riskConfig: { ...iqBridge.botState.riskConfig, ...(patch.riskConfig || {}) },
      strategyConfig: { ...iqBridge.botState.strategyConfig, ...(patch.strategyConfig || {}) },
      signalListConfig: { ...iqBridge.botState.signalListConfig, ...(patch.signalListConfig || {}) },
      riskState: { ...iqBridge.botState.riskState, ...(patch.riskState || {}) },
      scheduledSignals:
        patch.scheduledSignals !== undefined
          ? patch.scheduledSignals
          : iqBridge.botState.scheduledSignals,
      selectedBotAssetIds:
        patch.selectedBotAssetIds !== undefined
          ? patch.selectedBotAssetIds
          : iqBridge.botState.selectedBotAssetIds,
    };
    saveBotStateToDisk(iqBridge.botState);
    iqBridge.broadcast({ type: 'bot_state', payload: iqBridge.botState });
    res.json({
      success: true,
      botState: iqBridge.botState,
    });
  });

  wss.on('connection', (ws) => {
    iqBridge.addBrowserClient(ws);
    ws.on('close', () => {
      iqBridge.removeBrowserClient(ws);
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`QuantIQ Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
