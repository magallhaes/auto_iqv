import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccountType,
  BotMode,
  Candle,
  EconomicNewsEvent,
  IQAsset,
  IQConnectionStatus,
  MHIMode,
  MHISignalAnalysis,
  MHIVariant,
  PairCatalogStats,
  RiskConfig,
  RiskSessionState,
  ScheduledSignal,
  SignalListConfig,
  StrategyConfig,
  TimeframeSeconds,
  TradeOrder,
} from './types/trading';
import {
  catalogPairCandles,
  computeTechnicalSnapshot,
  evaluateMHIConfluence,
} from './utils/indicators';
import { CandlestickChart } from './components/CandlestickChart';
import { CatalogPage } from './components/CatalogPage';
import { RiskManagementPage } from './components/RiskManagementPage';
import { NewsFilterPage } from './components/NewsFilterPage';
import { NotificationsPage } from './components/NotificationsPage';
import { SignalListPage } from './components/SignalListPage';
import { ConnectModal } from './components/ConnectModal';
import { DailyPerformanceDashboard } from './components/DailyPerformanceDashboard';
import { LoginScreen } from './components/LoginScreen';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  BellOff,
  Bot,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  ListPlus,
  Pause,
  Play,
  Radio,
  Settings2,
  Sliders,
  Timer,
  Trash2,
  Volume2,
  VolumeX,
  XCircle,
  Zap,
  LogOut,
  User,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  Send,
  ShieldAlert,
  AlertTriangle,
  Database,
} from 'lucide-react';
import { playTradingAudio } from './utils/sound';
import { LossDiagnosisModal } from './components/LossDiagnosisModal';
import {
  persistOrderToFirestore,
  subscribeToUserOrders,
  persistQuoteSnapshot,
} from './lib/firebase';

type ActiveTab = 'TERMINAL' | 'CATALOG' | 'SIGNALS' | 'RISK' | 'NEWS' | 'PERFORMANCE' | 'NOTIFICATIONS';

const INITIAL_NEWS: EconomicNewsEvent[] = [
  {
    id: 'n1',
    time: '09:30',
    timestamp: (() => {
      const d = new Date();
      d.setHours(9, 30, 0, 0);
      return d.getTime();
    })(),
    currency: 'USD',
    title: 'Índice de Preços ao Consumidor (IPC / CPI Anual)',
    bulls: 3,
    forecast: '2.9%',
    previous: '3.0%',
  },
  {
    id: 'n2',
    time: '11:00',
    timestamp: (() => {
      const d = new Date();
      d.setHours(11, 0, 0, 0);
      return d.getTime();
    })(),
    currency: 'USD',
    title: 'Ofertas de Emprego JOLTS & Confiança do Consumidor',
    bulls: 3,
    forecast: '8.12M',
    previous: '8.09M',
  },
  {
    id: 'n3',
    time: '14:00',
    timestamp: (() => {
      const d = new Date();
      d.setHours(14, 0, 0, 0);
      return d.getTime();
    })(),
    currency: 'EUR',
    title: 'Discurso da Presidente do BCE (Lagarde)',
    bulls: 2,
    forecast: '—',
    previous: '—',
  },
  {
    id: 'n4',
    time: '16:00',
    timestamp: (() => {
      const d = new Date();
      d.setHours(16, 0, 0, 0);
      return d.getTime();
    })(),
    currency: 'USD',
    title: 'Ata da Reunião do FOMC (Federal Reserve)',
    bulls: 3,
    forecast: '—',
    previous: '—',
  },
  {
    id: 'n5',
    time: '20:50',
    timestamp: (() => {
      const d = new Date();
      d.setHours(20, 50, 0, 0);
      return d.getTime();
    })(),
    currency: 'JPY',
    title: 'Balança Comercial e Produção Industrial (Japão)',
    bulls: 2,
    forecast: '0.4%',
    previous: '-0.2%',
  },
];

const ASSET_TO_BROKER_ID: Record<number, number> = {
  81: 2298, // USD/BRL (OTC)
  90: 2300, // USD/MXN (OTC)
};

const BROKER_TO_ASSET_ID: Record<number, number> = {
  2298: 81, // USD/BRL (OTC)
  2300: 90, // USD/MXN (OTC)
};

function formatOrderPrice(price: number | undefined, ticker?: string): string {
  if (price == null || isNaN(price)) return '—';
  const clean = ticker?.toUpperCase() || '';
  const isHighOrCrypto =
    clean.includes('JPY') ||
    clean.includes('BTC') ||
    clean.includes('ETH') ||
    clean.includes('GOLD') ||
    clean.includes('BRL') ||
    clean.includes('MXN') ||
    clean.includes('COP') ||
    clean.includes('INR') ||
    clean.includes('ZAR') ||
    price > 50;
  return price.toFixed(isHighOrCrypto ? (price > 1000 ? 2 : 3) : 5);
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('TERMINAL');
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [selectedLossOrder, setSelectedLossOrder] = useState<TradeOrder | null>(null);

  // System Access Authentication Gate (Tela de Login)
  const [currentUser, setCurrentUser] = useState<{ email: string; name: string } | null>(() => {
    try {
      const stored = localStorage.getItem('quantiq_user_session');
      if (stored) return JSON.parse(stored);
    } catch {
      // ignore
    }
    return null;
  });

  const handleLogout = () => {
    localStorage.removeItem('quantiq_user_session');
    setCurrentUser(null);
  };

  // Connection & Account Status
  const [connectionStatus, setConnectionStatus] = useState<IQConnectionStatus>({
    connected: true,
    authenticated: false,
    connecting: false,
    email: '',
    currency: 'BRL',
    realBalance: 2450.0,
    practiceBalance: 10000.0,
    activeBalanceType: 'PRACTICE',
    activeBalanceId: 1002,
    serverTimestamp: Math.floor(Date.now() / 1000),
    wsLatencyMs: 24,
  });

  // Assets & Candles Store
  const [assets, setAssets] = useState<IQAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<number>(1);
  const [selectedBotAssetIds, setSelectedBotAssetIds] = useState<number[]>([1, 2, 76]);
  const [candlesByAsset, setCandlesByAsset] = useState<Record<number, Candle[]>>({});
  const [lookbackHours, setLookbackHours] = useState<number>(3);
  const [serverNowSec, setServerNowSec] = useState<number>(Math.floor(Date.now() / 1000));
  const [terminalMarketFilter, setTerminalMarketFilter] = useState<'ALL' | 'NORMAL' | 'OTC'>('ALL');
  const [showAllPairsDrawer, setShowAllPairsDrawer] = useState<boolean>(false);

  // Strategy & Confluence Configuration
  const [strategyConfig, setStrategyConfig] = useState<StrategyConfig>({
    mhiVariant: 'MHI_1',
    mhiMode: 'MINORIA',
    blockOnDoji: true,
    timeframe: 60,
    // Filtro de Trend Global (Macro Tendência - EMA 200)
    useMacroTrendFilter: true,
    macroTrendPeriod: 200,
    macroTrendTimeframe: 'CURRENT',
    macroTrendRule: 'STRICT_BLOCK',
    useEmaFilter: true,
    emaFastPeriod: 9,
    emaSlowPeriod: 21,
    requireEmaAlignment: true,
    useRsiFilter: true,
    rsiPeriod: 14,
    rsiOverbought: 70,
    rsiOversold: 30,
    rsiMode: 'REVERSAL',
    useBollingerFilter: true,
    bbPeriod: 20,
    bbStdDev: 2,
    useMacdFilter: false,
    useSrFilter: true,
    usePriceActionFilter: true,
    // Filtro de Volatilidade ATR (Average True Range)
    useAtrFilter: true,
    atrPeriod: 14,
    atrMinPercent: 0.015,
    atrMaxPercent: 0.12,
    atrBlockMode: 'OUTSIDE_RANGE',
    // Filtro de Sentimento de Mercado & Força de Volume (Bull/Bear Power)
    useSentimentFilter: true,
    sentimentThreshold: 55,
    useNewsFilter: true,
    minBullsToBlock: 3,
    pauseMinutesBeforeNews: 15,
    pauseMinutesAfterNews: 15,
    autoSyncTopCatalogPairs: true,
    minCatalogWinRate: 85,
    entryTimingSecond: 59,
    audioAlertsEnabled: true,
  });

  // Risk & Money Management Configuration
  const [riskConfig, setRiskConfig] = useState<RiskConfig>({
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
  });

  // Session Risk State
  const [riskState, setRiskState] = useState<RiskSessionState>({
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
  });

  // Bot & Orders State
  const [isBotRunning, setIsBotRunning] = useState<boolean>(false);
  const [botMode, setBotMode] = useState<BotMode>('STRATEGY');
  const [orders, setOrders] = useState<TradeOrder[]>([]);
  const [scheduledSignals, setScheduledSignals] = useState<ScheduledSignal[]>([]);
  const [signalListConfig, setSignalListConfig] = useState<SignalListConfig>({
    enabled: true,
    useEmaTrendFilter: true,
    useNewsFilter: true,
    minPayout: 80,
    entryAdvanceSeconds: 59,
    maxGales: 2,
    galeMultiplier: 2.2,
  });
  const [newsEvents, setNewsEvents] = useState<EconomicNewsEvent[]>(INITIAL_NEWS);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [terminalBottomTab, setTerminalBottomTab] = useState<'ORDERS' | 'STRATEGY'>('ORDERS');
  const [showQuickSettings, setShowQuickSettings] = useState<boolean>(false);
  const [historyPage, setHistoryPage] = useState<number>(1);
  const historyPageSize = 10;

  const totalHistoryPages = Math.max(1, Math.ceil(orders.length / historyPageSize));
  const paginatedOrders = useMemo(() => {
    const startIndex = (historyPage - 1) * historyPageSize;
    return orders.slice(startIndex, startIndex + historyPageSize);
  }, [historyPage, orders]);

  useEffect(() => {
    setHistoryPage((currentPage) => Math.min(currentPage, totalHistoryPages));
  }, [totalHistoryPages]);

  const lastAutoFiredBucketRef = useRef<number>(0);
  const lastPreSignalAudioBucketRef = useRef<number>(0);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4500);
  }, []);

  // Fetch persistent orders & bot state on mount
  useEffect(() => {
    fetch('/api/iq/orders')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.orders)) {
          setOrders(data.orders);
        }
      })
      .catch(() => {});

    fetch('/api/iq/bot')
      .then((res) => res.json())
      .then((data) => {
        if (data.botState) {
          setIsBotRunning(Boolean(data.botState.isRunning));
          if (data.botState.botMode) setBotMode(data.botState.botMode);
          if (Array.isArray(data.botState.scheduledSignals)) {
            setScheduledSignals(data.botState.scheduledSignals);
          }
          if (data.botState.signalListConfig) {
            setSignalListConfig(data.botState.signalListConfig);
          }
          if (data.botState.riskState) {
            setRiskState(data.botState.riskState);
          }
        }
      })
      .catch(() => {});
  }, []);

  // Sincronização em tempo real de ordens com o banco de dados Firestore
  useEffect(() => {
    if (!currentUser?.email) return;
    const unsub = subscribeToUserOrders(currentUser.email, (cloudOrders) => {
      if (cloudOrders.length > 0) {
        setOrders((prev) => {
          const map = new Map<string, TradeOrder>();
          // Remote cloud orders first
          for (const ord of cloudOrders) {
            map.set(ord.id, ord);
          }
          // Merge local orders without overwriting newer states
          for (const ord of prev) {
            if (!map.has(ord.id)) {
              map.set(ord.id, ord);
            }
          }
          return Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
        });
      }
    });
    return () => unsub();
  }, [currentUser]);

  // Fetch bulk catalog & initial candles
  const fetchCatalogSnapshot = useCallback(async () => {
    try {
      const candleCount =
        strategyConfig.timeframe === 60
          ? Math.max(240, Math.min(300, lookbackHours * 60))
          : Math.max(200, Math.min(240, lookbackHours * 12 * 3));
      const res = await fetch(
        `/api/iq/catalog-snapshot?timeframe=${strategyConfig.timeframe}&count=${candleCount}`
      );
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.assets)) {
        setAssets(data.assets);
      }
      if (data.candlesByAsset) {
        setCandlesByAsset(data.candlesByAsset);
      }
      if (data.serverTimestamp) {
        setServerNowSec(data.serverTimestamp);
      }
    } catch {
      // ignore transient error
    }
  }, [strategyConfig.timeframe, lookbackHours]);

  useEffect(() => {
    fetchCatalogSnapshot();
  }, [fetchCatalogSnapshot]);

  // Fetch fresh candles for selected pair whenever asset or timeframe changes
  useEffect(() => {
    let active = true;
    const fetchPair = async () => {
      try {
        const tf = strategyConfig.timeframe;
        const res = await fetch(
          `/api/iq/candles?assetId=${selectedAssetId}&timeframe=${tf}&count=250`
        );
        if (!res.ok || !active) return;
        const data = await res.json();
        if (data && Array.isArray(data.candles) && data.candles.length > 0) {
          setCandlesByAsset((prev) => ({
            ...prev,
            [selectedAssetId]: data.candles,
            ...(data.activeId ? { [data.activeId]: data.candles } : {}),
          }));
        }
      } catch {
        // ignore
      }
    };
    fetchPair();
    const interval = setInterval(fetchPair, 7000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [selectedAssetId, strategyConfig.timeframe]);

  // Initial & periodic HTTP status sync to keep connection state accurate
  useEffect(() => {
    const syncStatus = async () => {
      try {
        const res = await fetch('/api/iq/status');
        if (!res.ok) return;
        const data = await res.json();
        if (data && typeof data.authenticated === 'boolean') {
          setConnectionStatus(data);
        }
      } catch {
        // ignore transient network error
      }
    };
    syncStatus();
    const timer = setInterval(syncStatus, 4000);
    return () => clearInterval(timer);
  }, []);

  // Connect to local WebSocket (/ws) for real-time IQ Option candle ticks, orders and status
  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws`;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connectWs = () => {
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'init_sync' && msg.payload) {
            if (msg.payload.status) setConnectionStatus(msg.payload.status);
            if (Array.isArray(msg.payload.orders)) setOrders(msg.payload.orders);
            if (msg.payload.botState) {
              setIsBotRunning(Boolean(msg.payload.botState.isRunning));
              if (msg.payload.botState.botMode) setBotMode(msg.payload.botState.botMode);
              if (Array.isArray(msg.payload.botState.scheduledSignals)) {
                setScheduledSignals(msg.payload.botState.scheduledSignals);
              }
              if (msg.payload.botState.signalListConfig) {
                setSignalListConfig(msg.payload.botState.signalListConfig);
              }
              if (msg.payload.botState.riskState) {
                setRiskState(msg.payload.botState.riskState);
              }
            }
          } else if (msg.type === 'order_opened' && msg.payload) {
            if (Array.isArray(msg.payload.orders)) setOrders(msg.payload.orders);
            if (msg.payload.status) setConnectionStatus(msg.payload.status);
          } else if (msg.type === 'broker_confirmed' && msg.payload) {
            if (Array.isArray(msg.payload.orders)) setOrders(msg.payload.orders);
            showToast(`✅ ${msg.payload.message || 'Ordem executada na corretora IQ Option!'}`);
            if (strategyConfig.audioAlertsEnabled) playTradingAudio('ORDER_FIRED');
          } else if (msg.type === 'broker_rejected' && msg.payload) {
            if (Array.isArray(msg.payload.orders)) setOrders(msg.payload.orders);
            showToast(`⚠️ ${msg.payload.message || 'Ordem recusada pela corretora IQ Option'}`);
            if (strategyConfig.audioAlertsEnabled) playTradingAudio('LOSS');
          } else if (msg.type === 'orders_update' && msg.payload) {
            if (Array.isArray(msg.payload.orders)) {
              setOrders(msg.payload.orders);
              if (currentUser?.email) {
                for (const ord of msg.payload.orders) {
                  persistOrderToFirestore(ord, currentUser.email, technicalSnapshot).catch(() => {});
                }
              }
            }
            if (msg.payload.botState) {
              if (msg.payload.botState.riskState) setRiskState(msg.payload.botState.riskState);
              if (Array.isArray(msg.payload.botState.scheduledSignals)) {
                setScheduledSignals(msg.payload.botState.scheduledSignals);
              }
            }
          } else if (msg.type === 'bot_state' && msg.payload) {
            setIsBotRunning(Boolean(msg.payload.isRunning));
            if (msg.payload.botMode) setBotMode(msg.payload.botMode);
            if (Array.isArray(msg.payload.scheduledSignals)) {
              setScheduledSignals(msg.payload.scheduledSignals);
            }
            if (msg.payload.signalListConfig) {
              setSignalListConfig(msg.payload.signalListConfig);
            }
            if (msg.payload.riskState) setRiskState(msg.payload.riskState);
          } else if (msg.type === 'status' && msg.payload) {
            setConnectionStatus(msg.payload);
            if (msg.payload.serverTimestamp) {
              setServerNowSec(msg.payload.serverTimestamp);
            }
          } else if (msg.type === 'catalog_assets' && Array.isArray(msg.payload?.assets)) {
            setAssets(msg.payload.assets);
          } else if (
            msg.type === 'catalog_candles' &&
            Array.isArray(msg.payload?.assetIds) &&
            Array.isArray(msg.payload?.candles)
          ) {
            setCandlesByAsset((prev) => {
              const next = { ...prev };
              for (const assetId of msg.payload.assetIds as number[]) {
                next[assetId] = msg.payload.candles;
              }
              return next;
            });
          } else if (msg.type === 'candles_batch_tick' && msg.payload) {
            const { batch60, batch300, serverTimestamp } = msg.payload;
            if (serverTimestamp) setServerNowSec(serverTimestamp);
            const activeBatch: Record<number, Candle> =
              strategyConfig.timeframe === 60 ? batch60 : batch300;
            if (activeBatch) {
              setCandlesByAsset((prev) => {
                const next = { ...prev };
                for (const [idStr, candle] of Object.entries(activeBatch)) {
                  const assetId = Number(idStr);
                  const list = next[assetId] ? [...next[assetId]] : [];
                  if (list.length === 0) {
                    next[assetId] = [candle];
                  } else {
                    const lastIdx = list.length - 1;
                    if (list[lastIdx].from === candle.from) {
                      list[lastIdx] = candle;
                    } else if (candle.from > list[lastIdx].from) {
                      list.push(candle);
                      if (list.length > 300) list.shift();
                    }
                    next[assetId] = list;
                  }
                }
                return next;
              });
            }
          } else if (msg.type === 'candle_tick' && msg.payload) {
            const { assetId, timeframe, candle, serverTimestamp } = msg.payload;
            if (serverTimestamp) setServerNowSec(serverTimestamp);

            if (timeframe === strategyConfig.timeframe) {
              setCandlesByAsset((prev) => {
                const list = prev[assetId] ? [...prev[assetId]] : [];
                if (list.length === 0) return { ...prev, [assetId]: [candle] };
                const lastIdx = list.length - 1;
                if (list[lastIdx].from === candle.from) {
                  list[lastIdx] = candle;
                } else if (candle.from > list[lastIdx].from) {
                  list.push(candle);
                  if (list.length > 300) list.shift();
                }
                return { ...prev, [assetId]: list };
              });
            }
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        reconnectTimer = setTimeout(connectWs, 2500);
      };
    };

    connectWs();

    return () => {
      clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [strategyConfig.timeframe]);

  // Keep nextCalculatedStake synced when baseEntryAmount changes on step 0
  useEffect(() => {
    setRiskState((prev) => {
      if (prev.currentGaleStep === 0 && prev.currentSorosLevel === 1) {
        return {
          ...prev,
          nextCalculatedStake: riskConfig.baseEntryAmount,
        };
      }
      return prev;
    });
  }, [riskConfig.baseEntryAmount]);

  // Compute Catalog Stats for all pairs
  const catalogStats: PairCatalogStats[] = useMemo(() => {
    return assets
      .map((asset) => {
        const cList = candlesByAsset[asset.id] || [];
        return catalogPairCandles(asset, cList, strategyConfig);
      })
      .sort(
        (a, b) =>
          b.winRateGale1 - a.winRateGale1 ||
          b.asset.payout - a.asset.payout ||
          b.validSignalsCount - a.validSignalsCount
      );
  }, [assets, candlesByAsset, strategyConfig]);

  const autoSelectedBotAssetIds = useMemo(() => {
    const availablePairs = catalogStats.filter(
      (item) => item.asset.isOpen && item.validSignalsCount > 0
    );
    if (availablePairs.length === 0) return [];

    const minimumWinRate = strategyConfig.minCatalogWinRate || 85;
    const qualifyingPairs = availablePairs.filter(
      (item) => item.winRateGale1 >= minimumWinRate
    );
    const rankedPairs = [...qualifyingPairs].sort(
      (a, b) =>
        b.winRateGale1 - a.winRateGale1 ||
        b.asset.payout - a.asset.payout ||
        b.validSignalsCount - a.validSignalsCount
    );

    return rankedPairs.slice(0, 3).map((item) => item.asset.id);
  }, [catalogStats, strategyConfig.minCatalogWinRate]);

  useEffect(() => {
    if (!strategyConfig.autoSyncTopCatalogPairs) return;
    if (
      selectedBotAssetIds.length === autoSelectedBotAssetIds.length &&
      selectedBotAssetIds.every((id, index) => id === autoSelectedBotAssetIds[index])
    ) {
      return;
    }

    setSelectedBotAssetIds(autoSelectedBotAssetIds);
    fetch('/api/iq/bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedBotAssetIds: autoSelectedBotAssetIds }),
    }).catch(() => {});
  }, [autoSelectedBotAssetIds, selectedBotAssetIds, strategyConfig.autoSyncTopCatalogPairs]);

  const activeAsset: IQAsset = useMemo(() => {
    return (
      assets.find((a) => a.id === selectedAssetId) || {
        id: 1,
        ticker: 'EUR/USD',
        name: 'EUR/USD',
        isOtc: false,
        payout: 89,
        isOpen: true,
        category: 'binary',
      }
    );
  }, [assets, selectedAssetId]);

  const activeCandles: Candle[] = useMemo(() => {
    const direct = candlesByAsset[activeAsset.id];
    if (direct && direct.length > 0) return direct;
    const brokerId = ASSET_TO_BROKER_ID[activeAsset.id];
    if (brokerId && candlesByAsset[brokerId] && candlesByAsset[brokerId].length > 0) {
      return candlesByAsset[brokerId];
    }
    const uiId = BROKER_TO_ASSET_ID[activeAsset.id];
    if (uiId && candlesByAsset[uiId] && candlesByAsset[uiId].length > 0) {
      return candlesByAsset[uiId];
    }
    return [];
  }, [candlesByAsset, activeAsset.id]);

  const technicalSnapshot = useMemo(() => {
    return computeTechnicalSnapshot(activeCandles, strategyConfig);
  }, [activeCandles, strategyConfig]);

  const mhiAnalysis = useMemo(() => {
    return evaluateMHIConfluence(
      activeCandles,
      strategyConfig,
      newsEvents,
      activeAsset.ticker,
      serverNowSec
    );
  }, [activeCandles, strategyConfig, newsEvents, activeAsset.ticker, serverNowSec]);

  const secondsRemainingInCandle = useMemo(() => {
    const tf = strategyConfig.timeframe;
    return tf - (serverNowSec % tf);
  }, [serverNowSec, strategyConfig.timeframe]);

  // Persistência periódica de cotações e força de mercado no Firestore
  useEffect(() => {
    if (!currentUser || activeCandles.length === 0) return;
    const last = activeCandles[activeCandles.length - 1];
    if (!last) return;

    const interval = setInterval(() => {
      persistQuoteSnapshot(
        activeAsset.ticker,
        last.close,
        technicalSnapshot.marketSentiment?.bullPower ?? 50,
        technicalSnapshot.marketSentiment?.bearPower ?? 50,
        technicalSnapshot.atrPercent
      );
    }, 25000);

    return () => clearInterval(interval);
  }, [currentUser, activeAsset.ticker, activeCandles, technicalSnapshot]);

  // Active pre-signals across bot-monitored pairs
  const activeBotPreSignals = useMemo(() => {
    return selectedBotAssetIds
      .map((id) => {
        const asset = assets.find((a) => a.id === id);
        if (!asset) return null;
        const candles = candlesByAsset[id] || [];
        const analysis = evaluateMHIConfluence(
          candles,
          strategyConfig,
          newsEvents,
          asset.ticker,
          serverNowSec
        );
        return { asset, analysis };
      })
      .filter(
        (item): item is { asset: IQAsset; analysis: MHISignalAnalysis } =>
          item !== null &&
          item.analysis.isPreSignal &&
          (item.analysis.finalDirection === 'CALL' || item.analysis.finalDirection === 'PUT')
      );
  }, [selectedBotAssetIds, assets, candlesByAsset, strategyConfig, newsEvents, serverNowSec]);

  // Trigger audio alert when a pre-signal is armed (<= 20s remaining)
  useEffect(() => {
    if (!strategyConfig.audioAlertsEnabled) return;
    const hasPreSignal =
      (mhiAnalysis.isPreSignal &&
        mhiAnalysis.preSignalSecondsRemaining <= 20 &&
        mhiAnalysis.preSignalSecondsRemaining > 2 &&
        (mhiAnalysis.finalDirection === 'CALL' || mhiAnalysis.finalDirection === 'PUT')) ||
      activeBotPreSignals.some(
        (p) =>
          p.analysis.preSignalSecondsRemaining <= 20 &&
          p.analysis.preSignalSecondsRemaining > 2
      );

    if (hasPreSignal) {
      const currentCycle = Math.floor(serverNowSec / strategyConfig.timeframe);
      if (lastPreSignalAudioBucketRef.current !== currentCycle) {
        lastPreSignalAudioBucketRef.current = currentCycle;
        playTradingAudio('PRE_SIGNAL');
      }
    }
  }, [
    mhiAnalysis,
    activeBotPreSignals,
    strategyConfig.audioAlertsEnabled,
    strategyConfig.timeframe,
    serverNowSec,
  ]);

  // Place Order Function (Manual or Automated Bot)
  const executeOrder = useCallback(
    async (
      asset: IQAsset,
      direction: 'CALL' | 'PUT',
      stakeAmount: number,
      galeStep: 0 | 1 | 2,
      sorosLevel: number,
      strategyLabel: string
    ) => {
      const activeBal =
        connectionStatus.activeBalanceType === 'REAL'
          ? connectionStatus.realBalance
          : connectionStatus.practiceBalance;

      if (stakeAmount > activeBal) {
        showToast('Saldo insuficiente na carteira ativa para abrir a operação.');
        setIsBotRunning(false);
        return;
      }

      try {
        const res = await fetch('/api/iq/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assetId: asset.id,
            ticker: asset.ticker,
            direction,
            amount: stakeAmount,
            instrumentType: riskConfig.instrumentType,
            accountType: connectionStatus.activeBalanceType,
            timeframe: strategyConfig.timeframe,
            galeStep,
            sorosLevel,
            strategyLabel,
          }),
        });
        const data = await res.json();

        if (Array.isArray(data.orders)) {
          setOrders(data.orders);
        } else if (data.order) {
          setOrders((prev) => [data.order, ...prev.filter((o) => o.id !== data.order.id)]);
        }

        if (data.status) {
          setConnectionStatus(data.status);
        }

        if (strategyConfig.audioAlertsEnabled) {
          playTradingAudio(galeStep > 0 ? 'GALE' : 'ORDER_FIRED');
        }
        showToast(
          `Ordem enviada: ${asset.ticker} ${direction} (R$ ${stakeAmount.toFixed(2)}) — ${
            galeStep === 0 ? '1ª Entrada' : `Gale ${galeStep}`
          }`
        );
      } catch {
        showToast('Erro de comunicação ao disparar ordem para o servidor.');
      }
    },
    [
      connectionStatus.activeBalanceType,
      connectionStatus.realBalance,
      connectionStatus.practiceBalance,
      riskConfig.instrumentType,
      strategyConfig.timeframe,
      strategyConfig.audioAlertsEnabled,
      showToast,
    ]
  );

  // Play audio alerts when server settles orders
  const prevClosedOrdersCountRef = useRef<number>(0);
  useEffect(() => {
    const closedCount = orders.filter((o) => o.status !== 'OPEN').length;
    if (closedCount > prevClosedOrdersCountRef.current && prevClosedOrdersCountRef.current > 0) {
      const latestOrder = orders.find((o) => o.status !== 'OPEN');
      if (latestOrder && strategyConfig.audioAlertsEnabled) {
        if (latestOrder.status === 'WIN') playTradingAudio('WIN');
        else if (latestOrder.status === 'LOSS') playTradingAudio('LOSS');
      }
    }
    prevClosedOrdersCountRef.current = closedCount;
  }, [orders, strategyConfig.audioAlertsEnabled]);

  // Persistent Orders Management
  const handleClearOrders = async () => {
    try {
      await fetch('/api/iq/orders', { method: 'DELETE' });
      setOrders([]);
      showToast('Histórico de operações limpo com sucesso.');
    } catch {
      setOrders([]);
    }
  };

  // Bot Master Toggle & Background Sync
  const handleToggleBot = async () => {
    const nextRunning = !isBotRunning;
    let nextRiskState = riskState;
    if (
      nextRunning &&
      (riskState.stopWinReached ||
        riskState.stopLossReached ||
        riskState.trailingStopWinTriggered ||
        riskState.maxConsecutiveLossesReached)
    ) {
      nextRiskState = {
        ...riskState,
        sessionProfit: 0,
        stopWinReached: false,
        stopLossReached: false,
        trailingStopWinTriggered: false,
        maxConsecutiveLossesReached: false,
        consecutiveLosses: 0,
      };
      setRiskState(nextRiskState);
    }
    setIsBotRunning(nextRunning);
    try {
      await fetch('/api/iq/bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isRunning: nextRunning,
          botMode,
          riskConfig,
          strategyConfig,
          signalListConfig,
          scheduledSignals,
          selectedBotAssetIds,
          riskState: nextRiskState,
        }),
      });
      showToast(
        nextRunning
          ? `Robô 24/7 ativado no servidor (Modo: ${
              botMode === 'STRATEGY'
                ? 'Estratégias MHI'
                : botMode === 'SIGNAL_LIST'
                ? 'Lista de Sinais'
                : 'MHI + Lista de Sinais'
            })`
          : 'Robô pausado no servidor.'
      );
    } catch {
      // optimistic
    }
  };

  // Signal List Updaters
  const handleUpdateSignals = async (signals: ScheduledSignal[]) => {
    setScheduledSignals(signals);
    try {
      await fetch('/api/iq/bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduledSignals: signals,
        }),
      });
    } catch {
      // optimistic
    }
  };

  const handleUpdateSignalListConfig = async (patch: Partial<SignalListConfig>) => {
    const updated = { ...signalListConfig, ...patch };
    setSignalListConfig(updated);
    try {
      await fetch('/api/iq/bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signalListConfig: updated,
        }),
      });
    } catch {
      // optimistic
    }
  };

  const handleChangeBotMode = async (mode: BotMode) => {
    setBotMode(mode);
    try {
      await fetch('/api/iq/bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botMode: mode,
        }),
      });
      showToast(
        `Modo do robô alterado para: ${
          mode === 'STRATEGY'
            ? 'Estratégias MHI'
            : mode === 'SIGNAL_LIST'
            ? 'Lista de Sinais'
            : 'MHI + Lista de Sinais'
        }`
      );
    } catch {
      // optimistic
    }
  };

  // Sync strategyConfig with server bot whenever updated
  useEffect(() => {
    fetch('/api/iq/bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategyConfig }),
    }).catch(() => {});
  }, [strategyConfig]);

  // Handlers for Account & Connection
  const handleConnectIQ = async (params: {
    email: string;
    password?: string;
    ssid?: string;
    accountType: AccountType;
    demoSimulatorMode?: boolean;
  }) => {
    try {
      const res = await fetch('/api/iq/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (data.status) setConnectionStatus(data.status);
      if (data.success) {
        showToast(data.message || 'Sessão IQ Option conectada e sincronizada!');
        fetchCatalogSnapshot();
      }
      return {
        success: Boolean(data.success),
        requires2FA: Boolean(data.requires2FA),
        message: data.message || (data.success ? 'Conectado com sucesso.' : 'Falha na autenticação.'),
      };
    } catch {
      return {
        success: false,
        message: 'Erro de rede ao comunicar com o servidor. Tente novamente.',
      };
    }
  };

  const handleVerify2FA = async (params: { code: string; accountType: AccountType }) => {
    try {
      const res = await fetch('/api/iq/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (data.status) setConnectionStatus(data.status);
      if (data.success) {
        showToast(data.message || '2FA confirmado e conectado à IQ Option!');
        fetchCatalogSnapshot();
      }
      return {
        success: Boolean(data.success),
        message: String(data.message || 'Verificação concluída.'),
      };
    } catch {
      return {
        success: false,
        message: 'Falha ao validar o código 2FA.',
      };
    }
  };

  const handleDisconnectIQ = async () => {
    try {
      const res = await fetch('/api/iq/disconnect', { method: 'POST' });
      const data = await res.json();
      if (data.status) setConnectionStatus(data.status);
    } catch {
      setConnectionStatus((prev) => ({
        ...prev,
        authenticated: false,
        connecting: false,
      }));
    }
    setIsBotRunning(false);
    showToast('Sessão IQ Option desconectada.');
  };

  const handleSwitchAccount = async (accountType: AccountType) => {
    setRiskConfig((prev) => ({ ...prev, accountType }));
    setConnectionStatus((prev) => ({ ...prev, activeBalanceType: accountType }));
    try {
      const res = await fetch('/api/iq/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountType }),
      });
      const data = await res.json();
      if (data.status) setConnectionStatus(data.status);
    } catch {
      // already updated optimistically
    }
    showToast(
      `Carteira alterada para ${
        accountType === 'REAL' ? 'CONTA REAL' : 'CONTA TREINAMENTO (DEMO)'
      }`
    );
  };

  const handleRefillDemoBalance = async () => {
    setConnectionStatus((prev) => ({ ...prev, practiceBalance: 10000.0 }));
    try {
      const res = await fetch('/api/iq/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetPracticeBalance: true }),
      });
      const data = await res.json();
      if (data.status) setConnectionStatus(data.status);
    } catch {
      // already updated optimistically
    }
    showToast('Saldo da Conta Treinamento restaurado para R$ 10.000,00');
  };

  const handleSetSelectedBotAssetIds = (ids: number[]) => {
    setSelectedBotAssetIds(ids);
    fetch('/api/iq/bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedBotAssetIds: ids }),
    }).catch(() => {});
    showToast(`Pares ativos no Robô atualizados (${ids.length} selecionados)`);
  };

  const handleToggleBotAsset = (assetId: number) => {
    const nextIds = selectedBotAssetIds.includes(assetId)
      ? selectedBotAssetIds.filter((id) => id !== assetId)
      : [...selectedBotAssetIds, assetId];
    setSelectedBotAssetIds(nextIds);
    fetch('/api/iq/bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedBotAssetIds: nextIds }),
    }).catch(() => {});
  };

  const handleApplyStrategyAndPair = (
    preset: {
      mhiVariant: MHIVariant;
      mhiMode: MHIMode;
      useEmaFilter: boolean;
      useRsiFilter: boolean;
      useBollingerFilter: boolean;
    },
    asset: IQAsset
  ) => {
    setStrategyConfig((prev) => ({
      ...prev,
      mhiVariant: preset.mhiVariant,
      mhiMode: preset.mhiMode,
      useEmaFilter: preset.useEmaFilter,
      requireEmaAlignment: preset.useEmaFilter,
      useRsiFilter: preset.useRsiFilter,
      useBollingerFilter: preset.useBollingerFilter,
    }));
    setSelectedAssetId(asset.id);
    if (!selectedBotAssetIds.includes(asset.id)) {
      setSelectedBotAssetIds((prev) => [...prev, asset.id]);
    }
    showToast(
      `Estratégia ${preset.mhiVariant.replace('_', ' ')} (${preset.mhiMode}) + ${
        asset.ticker
      } aplicados no Robô!`
    );
    setActiveTab('TERMINAL');
  };

  const activeBalanceValue =
    connectionStatus.activeBalanceType === 'REAL'
      ? connectionStatus.realBalance
      : connectionStatus.practiceBalance;

  // Tela de Login Obrigatória: Só acessa o sistema após o login
  if (!currentUser) {
    return (
      <LoginScreen
        onLoginSuccess={(user) => setCurrentUser(user)}
        savedEmail={connectionStatus.email}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col">
      {/* Top Bar Contract: Strictly 3 Zones separated by gap-8 */}
      <header className="px-3.5 py-2.5 sm:px-6 sm:py-3 border-b border-slate-800 bg-[#0B0F17] sticky top-0 z-30 flex items-center justify-between gap-4">
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-2">
          <a
            href="#terminal"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('TERMINAL');
            }}
            className="text-lg sm:text-xl font-display font-black tracking-tight text-white whitespace-nowrap cursor-pointer hover:opacity-90 transition-opacity"
          >
            QuantIQ
          </a>
          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
            PRO
          </span>
        </div>

        {/* Zone 2: Desktop Navigation Links (hidden on mobile, replaced by bottom dock) */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
          <a
            href="#terminal"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('TERMINAL');
            }}
            className={`py-1 transition-all duration-200 ease-out whitespace-nowrap shrink-0 border-b-2 hover:-translate-y-0.5 active:scale-95 ${
              activeTab === 'TERMINAL'
                ? 'text-white border-blue-500 font-semibold'
                : 'border-transparent hover:text-white'
            }`}
          >
            Terminal
          </a>
          <a
            href="#catalogacao"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('CATALOG');
            }}
            className={`py-1 transition-all duration-200 ease-out whitespace-nowrap shrink-0 border-b-2 hover:-translate-y-0.5 active:scale-95 ${
              activeTab === 'CATALOG'
                ? 'text-white border-blue-500 font-semibold'
                : 'border-transparent hover:text-white'
            }`}
          >
            Catálogo
          </a>
          <a
            href="#sinais"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('SIGNALS');
            }}
            className={`py-1 transition-all duration-200 ease-out whitespace-nowrap shrink-0 border-b-2 flex items-center gap-1.5 hover:-translate-y-0.5 active:scale-95 ${
              activeTab === 'SIGNALS'
                ? 'text-white border-blue-500 font-semibold'
                : 'border-transparent hover:text-white'
            }`}
          >
            <span>Sinais</span>
            {scheduledSignals.filter((s) => s.status === 'PENDING' || s.status === 'PRE_SIGNAL').length > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded">
                {scheduledSignals.filter((s) => s.status === 'PENDING' || s.status === 'PRE_SIGNAL').length}
              </span>
            )}
          </a>
          <a
            href="#gestao"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('RISK');
            }}
            className={`py-1 transition-all duration-200 ease-out whitespace-nowrap shrink-0 border-b-2 hover:-translate-y-0.5 active:scale-95 ${
              activeTab === 'RISK'
                ? 'text-white border-blue-500 font-semibold'
                : 'border-transparent hover:text-white'
            }`}
          >
            Gestão
          </a>
          <a
            href="#performance"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('PERFORMANCE');
            }}
            className={`py-1 transition-all duration-200 ease-out whitespace-nowrap shrink-0 border-b-2 flex items-center gap-1.5 hover:-translate-y-0.5 active:scale-95 ${
              activeTab === 'PERFORMANCE'
                ? 'text-white border-emerald-500 font-bold'
                : 'border-transparent hover:text-white'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Relatório</span>
          </a>
          <a
            href="#noticias"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('NEWS');
            }}
            className={`py-1 transition-all duration-200 ease-out whitespace-nowrap shrink-0 border-b-2 hover:-translate-y-0.5 active:scale-95 ${
              activeTab === 'NEWS'
                ? 'text-white border-blue-500 font-semibold'
                : 'border-transparent hover:text-white'
            }`}
          >
            Notícias
          </a>
          <a
            href="#notificacoes"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('NOTIFICATIONS');
            }}
            className={`flex items-center gap-1.5 border-b-2 py-1 transition-all duration-200 ease-out hover:-translate-y-0.5 active:scale-95 whitespace-nowrap shrink-0 ${
              activeTab === 'NOTIFICATIONS'
                ? 'text-white border-sky-500 font-semibold'
                : 'border-transparent hover:text-white'
            }`}
          >
            <Send className="h-3.5 w-3.5" />
            Notificações
          </a>
        </nav>

        {/* Zone 3: IQ Connect & User Session Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsConnectModalOpen(true)}
            className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ease-out whitespace-nowrap shrink-0 cursor-pointer hover:-translate-y-0.5 active:scale-95 ${
              connectionStatus.authenticated
                ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-600/30'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-500/20'
            }`}
          >
            {connectionStatus.authenticated
              ? `IQ: ${connectionStatus.email?.split('@')[0] || 'Conectada'}`
              : 'Conectar IQ'}
          </button>

          {/* Firestore Cloud Persistence Badge */}
          <div
            className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-[11px] font-mono"
            title="Banco de dados Firestore conectado (Histórico, Cotações e Auditoria de Loss persistentes)"
          >
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            <span>Firestore</span>
          </div>

          {currentUser && (
            <div className="flex items-center gap-1 sm:gap-1.5 pl-1.5 border-l border-slate-800 text-xs">
              <div className="flex items-center gap-1 bg-[#141A26] px-2 py-1 rounded-lg border border-[#212B3E]">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold text-white truncate max-w-[70px] sm:max-w-[110px]">
                  {currentUser.name.split(' ')[0]}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                title="Sair do Sistema"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Operational Toolbar Strip (Clean, focused on trade stats & inputs, zero page duplication) */}
      <div className="bg-[#111827] border-b border-slate-800 px-3 py-2 sm:px-6">
        <div className="max-w-[1440px] mx-auto flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
          {/* Account Mode & Balance */}
          <div className="flex items-center justify-between gap-3 text-xs md:justify-start">
            <div className="inline-flex items-center p-0.5 bg-[#0B0F17] border border-slate-800 rounded-lg">
              <button
                onClick={() => handleSwitchAccount('PRACTICE')}
                className={`px-2 py-1 rounded-md font-semibold text-[11px] sm:text-xs transition-all duration-200 ease-out whitespace-nowrap cursor-pointer active:scale-95 ${
                  connectionStatus.activeBalanceType === 'PRACTICE'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Demo
              </button>
              <button
                onClick={() => handleSwitchAccount('REAL')}
                className={`px-2 py-1 rounded-md font-semibold text-[11px] sm:text-xs transition-all duration-200 ease-out whitespace-nowrap cursor-pointer active:scale-95 ${
                  connectionStatus.activeBalanceType === 'REAL'
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Real
              </button>
            </div>

            <div className="font-mono tabular-nums">
              <span className="text-slate-400 text-[11px]">Saldo: </span>
              <strong className="text-white text-xs sm:text-sm font-bold">
                R${' '}
                {activeBalanceValue.toLocaleString('pt-BR', {
                  minimumFractionDigits: 2,
                })}
              </strong>
            </div>

            <span className="text-slate-700 hidden md:inline">|</span>

            {/* Desktop Inline Inputs */}
            <div className="hidden md:flex items-center gap-2.5 font-mono tabular-nums text-xs">
              <label className="flex items-center gap-1 text-slate-300">
                <span className="text-slate-400 text-[11px]">Entrada:</span>
                <input
                  type="number"
                  min={2}
                  value={riskConfig.baseEntryAmount}
                  onChange={(e) =>
                    setRiskConfig((prev) => ({
                      ...prev,
                      baseEntryAmount: Math.max(2, Number(e.target.value)),
                    }))
                  }
                  className="w-14 px-2 py-1 bg-[#0B0F17] border border-slate-700 rounded text-white text-xs font-bold focus:outline-none focus:border-blue-500"
                />
              </label>

              <label className="flex items-center gap-1 text-emerald-400">
                <span className="text-[11px]">Stop Win:</span>
                <input
                  type="number"
                  min={5}
                  value={riskConfig.stopWin}
                  onChange={(e) =>
                    setRiskConfig((prev) => ({
                      ...prev,
                      stopWin: Math.max(5, Number(e.target.value)),
                    }))
                  }
                  className="w-14 px-2 py-1 bg-[#0B0F17] border border-emerald-800/70 rounded text-emerald-400 text-xs font-bold focus:outline-none focus:border-emerald-500"
                />
              </label>

              <label className="flex items-center gap-1 text-red-400">
                <span className="text-[11px]">Stop Loss:</span>
                <input
                  type="number"
                  min={5}
                  value={riskConfig.stopLoss}
                  onChange={(e) =>
                    setRiskConfig((prev) => ({
                      ...prev,
                      stopLoss: Math.max(5, Number(e.target.value)),
                    }))
                  }
                  className="w-14 px-2 py-1 bg-[#0B0F17] border border-red-800/70 rounded text-red-400 text-xs font-bold focus:outline-none focus:border-red-500"
                />
              </label>

              <span className="text-slate-700">|</span>

              <div>
                <span className="text-slate-400 text-[11px]">Sessão: </span>
                <strong
                  className={
                    riskState.sessionProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }
                >
                  {riskState.sessionProfit >= 0 ? '+' : ''}R${' '}
                  {riskState.sessionProfit.toFixed(2)}
                </strong>
                <span className="text-slate-500 text-[11px] ml-1">
                  ({riskState.totalWins}W / {riskState.totalLosses}L)
                </span>
              </div>
            </div>
          </div>

          {/* Mobile Quick Inputs Grid (3 equal columns on mobile for thumb convenience) */}
          <div className="grid grid-cols-3 gap-2 md:hidden font-mono tabular-nums">
            <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-1.5 flex flex-col">
              <span className="text-[9px] text-slate-400 uppercase font-sans">Entrada R$</span>
              <input
                type="number"
                min={2}
                value={riskConfig.baseEntryAmount}
                onChange={(e) =>
                  setRiskConfig((prev) => ({
                    ...prev,
                    baseEntryAmount: Math.max(2, Number(e.target.value)),
                  }))
                }
                className="w-full bg-transparent text-white text-xs font-bold focus:outline-none py-0.5"
              />
            </div>

            <div className="bg-[#0B0F17] border border-emerald-900/60 rounded-lg p-1.5 flex flex-col">
              <span className="text-[9px] text-emerald-400 uppercase font-sans">Stop Win</span>
              <input
                type="number"
                min={5}
                value={riskConfig.stopWin}
                onChange={(e) =>
                  setRiskConfig((prev) => ({
                    ...prev,
                    stopWin: Math.max(5, Number(e.target.value)),
                  }))
                }
                className="w-full bg-transparent text-emerald-400 text-xs font-bold focus:outline-none py-0.5"
              />
            </div>

            <div className="bg-[#0B0F17] border border-rose-900/60 rounded-lg p-1.5 flex flex-col">
              <span className="text-[9px] text-rose-400 uppercase font-sans">Stop Loss</span>
              <input
                type="number"
                min={5}
                value={riskConfig.stopLoss}
                onChange={(e) =>
                  setRiskConfig((prev) => ({
                    ...prev,
                    stopLoss: Math.max(5, Number(e.target.value)),
                  }))
                }
                className="w-full bg-transparent text-rose-400 text-xs font-bold focus:outline-none py-0.5"
              />
            </div>
          </div>

          {/* Master Bot 24/7 Action Button (full width on mobile, compact on desktop) */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleBot}
              className={`w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2 md:py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ease-out whitespace-nowrap cursor-pointer active:scale-95 ${
                isBotRunning
                  ? 'bg-red-600 hover:bg-red-500 text-white shadow-md shadow-red-500/25 animate-pulse'
                  : riskState.stopWinReached || riskState.trailingStopWinTriggered
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-500/35 ring-2 ring-emerald-400/40'
                  : riskState.stopLossReached || riskState.maxConsecutiveLossesReached
                  ? 'bg-rose-700 hover:bg-rose-600 text-white shadow-md shadow-rose-500/35 ring-2 ring-rose-400/40'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-500/25'
              }`}
            >
              {isBotRunning ? (
                <>
                  <Pause className="w-4 h-4 shrink-0" />
                  <span>Pausar Robô 24/7</span>
                </>
              ) : riskState.stopWinReached ? (
                <>
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-200 animate-bounce" />
                  <span>🏆 Meta Batida (+R$ {riskState.sessionProfit.toFixed(2)}) — Iniciar Novo Ciclo</span>
                </>
              ) : riskState.trailingStopWinTriggered ? (
                <>
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-200 animate-bounce" />
                  <span>🛡️ Trailing Stop Salvo (+R$ {riskState.sessionProfit.toFixed(2)}) — Novo Ciclo</span>
                </>
              ) : riskState.maxConsecutiveLossesReached ? (
                <>
                  <ShieldAlert className="w-4 h-4 shrink-0 text-amber-200 animate-pulse" />
                  <span>🛑 Trava de Losses Consecutivos ({riskState.consecutiveLosses || 2}x) — Destravar</span>
                </>
              ) : riskState.stopLossReached ? (
                <>
                  <ShieldAlert className="w-4 h-4 shrink-0 text-rose-200 animate-pulse" />
                  <span>🛑 Stop Loss Atingido (-R$ {Math.abs(riskState.sessionProfit).toFixed(2)}) — Resetar</span>
                </>
              ) : (
                <>
                  <Bot className="w-4 h-4 shrink-0" />
                  <span>Iniciar Robô 24/7 ({selectedBotAssetIds.length} Pares)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Stop Win / Stop Loss Global Banner */}
        {riskState.stopWinReached && (
          <div className="max-w-[1440px] mx-auto mt-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-emerald-200 bg-emerald-950/80 border border-emerald-500/60 p-3 rounded-lg shadow-lg shadow-emerald-950/40">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  <strong>🎉 Meta de Stop Win Batida com Sucesso!</strong> Lucro acumulado da sessão:{' '}
                  <strong className="text-emerald-300 font-mono">
                    +R$ {riskState.sessionProfit.toFixed(2)}
                  </strong>{' '}
                  (Meta: R$ {riskConfig.stopWin.toFixed(2)}). O robô foi pausado automaticamente para proteger seu capital.
                </span>
              </div>
              <button
                onClick={() => {
                  setRiskState((prev) => ({
                    ...prev,
                    sessionProfit: 0,
                    stopWinReached: false,
                    stopLossReached: false,
                  }));
                  showToast('Placar da sessão zerado para novo ciclo.');
                }}
                className="self-end sm:self-auto px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-bold cursor-pointer transition-colors shrink-0"
              >
                Zerar & Iniciar Novo Ciclo
              </button>
            </div>
          </div>
        )}

        {riskState.stopLossReached && (
          <div className="max-w-[1440px] mx-auto mt-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-rose-200 bg-rose-950/80 border border-rose-500/60 p-3 rounded-lg shadow-lg shadow-rose-950/40">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                <span>
                  <strong>🛑 Limite de Stop Loss Atingido!</strong> Perda contida em:{' '}
                  <strong className="text-rose-300 font-mono">
                    -R$ {Math.abs(riskState.sessionProfit).toFixed(2)}
                  </strong>{' '}
                  (Limite: R$ {riskConfig.stopLoss.toFixed(2)}). O robô foi travado para proteger sua banca.
                </span>
              </div>
              <button
                onClick={() => {
                  setRiskState((prev) => ({
                    ...prev,
                    sessionProfit: 0,
                    stopWinReached: false,
                    stopLossReached: false,
                    trailingStopWinTriggered: false,
                    maxConsecutiveLossesReached: false,
                  }));
                  showToast('Sessão resetada.');
                }}
                className="self-end sm:self-auto px-3 py-1 bg-rose-700 hover:bg-rose-600 text-white rounded text-[11px] font-bold cursor-pointer transition-colors shrink-0"
              >
                Resetar Sessão
              </button>
            </div>
          </div>
        )}

        {riskState.trailingStopWinTriggered && (
          <div className="max-w-[1440px] mx-auto mt-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-emerald-200 bg-emerald-950/80 border border-emerald-500/60 p-3 rounded-lg shadow-lg shadow-emerald-950/40">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  <strong>🛡️ Trailing Stop Win Protegido!</strong> O lucro bateu pico de{' '}
                  <strong className="text-emerald-300 font-mono">
                    +R$ {(riskState.peakSessionProfit || riskState.sessionProfit).toFixed(2)}
                  </strong>{' '}
                  e o robô encerrou garantindo{' '}
                  <strong className="text-emerald-300 font-mono">
                    +R$ {riskState.sessionProfit.toFixed(2)}
                  </strong>{' '}
                  no bolso antes que o mercado devolvesse mais!
                </span>
              </div>
              <button
                onClick={() => {
                  setRiskState((prev) => ({
                    ...prev,
                    sessionProfit: 0,
                    stopWinReached: false,
                    stopLossReached: false,
                    trailingStopWinTriggered: false,
                    maxConsecutiveLossesReached: false,
                  }));
                  showToast('Sessão resetada.');
                }}
                className="self-end sm:self-auto px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-bold cursor-pointer transition-colors shrink-0"
              >
                Iniciar Novo Ciclo
              </button>
            </div>
          </div>
        )}

        {riskState.maxConsecutiveLossesReached && (
          <div className="max-w-[1440px] mx-auto mt-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-amber-200 bg-amber-950/80 border border-amber-500/60 p-3 rounded-lg shadow-lg shadow-amber-950/40">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  <strong>🛑 Limite de Losses Consecutivos Atingido!</strong> O robô foi pausado após{' '}
                  <strong>{riskState.consecutiveLosses || riskConfig.maxConsecutiveLosses || 2}</strong>{' '}
                  ciclos seguidos de loss para proteger sua banca contra tendências hostis.
                </span>
              </div>
              <button
                onClick={() => {
                  setRiskState((prev) => ({
                    ...prev,
                    consecutiveLosses: 0,
                    maxConsecutiveLossesReached: false,
                  }));
                  showToast('Trava de perdas consecutivas liberada.');
                }}
                className="self-end sm:self-auto px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-[11px] font-bold cursor-pointer transition-colors shrink-0"
              >
                Liberar Trava
              </button>
            </div>
          </div>
        )}

        {toastMessage && (
          <div className="max-w-[1440px] mx-auto mt-2">
            <div className="text-xs text-blue-200 bg-blue-950/70 border border-blue-800/80 px-3 py-1.5 rounded-lg">
              {toastMessage}
            </div>
          </div>
        )}
      </div>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-3 sm:px-6 py-3.5 sm:py-6 pb-24 md:pb-6">
        {!connectionStatus.authenticated && (
          <div className="mb-6 bg-[#111827] border border-blue-500/40 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded">
                  Sessão Desconectada
                </span>
                <h2 className="text-sm font-display font-bold text-white">
                  Conecte sua Conta IQ Option ou Ative o Simulador Local
                </h2>
              </div>
              <p className="text-xs text-slate-400">
                Autentique via E-mail/Senha (com suporte a 2FA) ou Token SSID para sincronizar saldo real/demo da corretora, ou conecte em 1 clique no Modo Simulador Local.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => setIsConnectModalOpen(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Autenticar Conta IQ Option (Login / SSID)
              </button>
              <button
                onClick={() =>
                  handleConnectIQ({
                    email: 'trader@iqoption.com',
                    accountType: connectionStatus.activeBalanceType,
                    demoSimulatorMode: true,
                  })
                }
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Conectar Rápido (Modo Simulador)
              </button>
            </div>
          </div>
        )}

        {activeTab === 'NOTIFICATIONS' && <NotificationsPage />}

        {activeTab === 'CATALOG' && (
          <CatalogPage
            assets={assets}
            candlesByAsset={candlesByAsset}
            catalogStats={catalogStats}
            config={strategyConfig}
            onUpdateConfig={(patch) =>
              setStrategyConfig((prev) => ({ ...prev, ...patch }))
            }
            selectedBotAssetIds={selectedBotAssetIds}
            onToggleBotAsset={handleToggleBotAsset}
            onSetSelectedBotAssetIds={handleSetSelectedBotAssetIds}
            onSelectPairForTerminal={(asset) => {
              setSelectedAssetId(asset.id);
              setActiveTab('TERMINAL');
            }}
            onApplyStrategyAndPair={handleApplyStrategyAndPair}
            onRefreshCatalog={fetchCatalogSnapshot}
            lookbackHours={lookbackHours}
            onChangeLookbackHours={setLookbackHours}
          />
        )}

        {activeTab === 'SIGNALS' && (
          <SignalListPage
            signals={scheduledSignals}
            onUpdateSignals={handleUpdateSignals}
            listConfig={signalListConfig}
            onUpdateListConfig={handleUpdateSignalListConfig}
            isBotRunning={isBotRunning}
            onToggleBot={handleToggleBot}
            botMode={botMode}
            onChangeBotMode={handleChangeBotMode}
            riskConfig={riskConfig}
            riskState={riskState}
            connectionStatus={connectionStatus}
            assets={assets}
            serverNowSec={serverNowSec}
          />
        )}

        {activeTab === 'RISK' && (
          <RiskManagementPage
            riskConfig={riskConfig}
            riskState={riskState}
            connectionStatus={connectionStatus}
            onUpdateRiskConfig={(patch) =>
              setRiskConfig((prev) => ({ ...prev, ...patch }))
            }
            onResetSessionState={() => {
              setRiskState({
                sessionProfit: 0,
                totalWins: 0,
                totalLosses: 0,
                currentGaleStep: 0,
                currentSorosLevel: 1,
                accumulatedSorosProfit: 0,
                sorosGaleRecoveryDebt: 0,
                nextCalculatedStake: riskConfig.baseEntryAmount,
                stopWinReached: false,
                stopLossReached: false,
              });
              showToast('Placar e ciclo da sessão zerados.');
            }}
            onSwitchAccount={handleSwitchAccount}
            onRefillDemoBalance={handleRefillDemoBalance}
          />
        )}

        {activeTab === 'NEWS' && (
          <NewsFilterPage
            newsEvents={newsEvents}
            config={strategyConfig}
            onUpdateConfig={(patch) =>
              setStrategyConfig((prev) => ({ ...prev, ...patch }))
            }
            onAddCustomNews={(ev) => setNewsEvents((prev) => [...prev, ev])}
          />
        )}

        {activeTab === 'PERFORMANCE' && (
          <DailyPerformanceDashboard
            orders={orders}
            riskState={riskState}
            riskConfig={riskConfig}
            currentBalance={activeBalanceValue}
            currencySymbol="R$"
            onClearHistory={() => setOrders([])}
            onRefresh={fetchCatalogSnapshot}
          />
        )}

        {activeTab === 'TERMINAL' && (
          <div className="space-y-6">
            {/* Integrated Asset Bar & Timeframe Switch (Clean, minimal footprint) */}
            <div className="bg-[#111827] border border-slate-800 rounded-lg p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-base sm:text-lg font-display font-bold text-white tracking-tight">
                    {activeAsset.ticker}
                  </span>
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    {activeAsset.payout}% Payout
                  </span>
                  {activeAsset.isOtc ? (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                      OTC
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 font-semibold">
                      NORMAL
                    </span>
                  )}
                </div>

                <div className="inline-flex p-0.5 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs font-mono">
                  {([60, 300] as TimeframeSeconds[]).map((tf) => (
                    <button
                      key={tf}
                      onClick={() =>
                        setStrategyConfig((prev) => ({ ...prev, timeframe: tf }))
                      }
                      className={`px-2.5 py-1 rounded transition-colors cursor-pointer font-medium ${
                        strategyConfig.timeframe === tf
                          ? 'bg-blue-600 text-white font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      M{tf / 60}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick Pair Chips & Expand Button */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
                <button
                  type="button"
                  role="switch"
                  aria-checked={strategyConfig.autoSyncTopCatalogPairs}
                  aria-label="Seleção automática dos três melhores pares por win-rate e payout"
                  onClick={() =>
                    setStrategyConfig((prev) => ({
                      ...prev,
                      autoSyncTopCatalogPairs: !prev.autoSyncTopCatalogPairs,
                    }))
                  }
                  className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md border border-slate-700 bg-[#0B0F17] text-xs font-medium text-slate-300 whitespace-nowrap shrink-0 cursor-pointer hover:border-slate-500"
                  title="Seleciona até 3 pares abertos que atingem o win-rate mínimo de Gale 1; limpa a seleção se nenhum se qualificar"
                >
                  <span>Auto pares</span>
                  <span
                    className={`relative w-7 h-4 rounded-full transition-colors ${
                      strategyConfig.autoSyncTopCatalogPairs ? 'bg-emerald-600' : 'bg-slate-600'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                        strategyConfig.autoSyncTopCatalogPairs ? 'translate-x-3.5' : 'translate-x-0.5'
                      }`}
                    />
                  </span>
                </button>

                {catalogStats.slice(0, 5).map((item) => (
                  <button
                    key={item.asset.id}
                    onClick={() => setSelectedAssetId(item.asset.id)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      selectedAssetId === item.asset.id
                        ? 'bg-blue-600 text-white font-bold shadow-sm'
                        : 'bg-[#0B0F17] hover:bg-slate-800 text-slate-300 border border-slate-800'
                    }`}
                  >
                    <span>{item.asset.ticker.replace(' (OTC)', '')}</span>
                    <span className="ml-1 text-[10px] text-emerald-400 font-mono">
                      {item.winRateGale1.toFixed(0)}% · {item.asset.payout}%
                    </span>
                  </button>
                ))}

                <button
                  onClick={() => setShowAllPairsDrawer((prev) => !prev)}
                  className="px-2.5 py-1 bg-[#0B0F17] hover:bg-slate-800 border border-slate-700 rounded-md text-xs font-semibold text-blue-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {showAllPairsDrawer ? 'Ocultar Pares' : `+ Mais Pares (${assets.length})`}
                </button>
              </div>
            </div>

              {/* Expandable grid of broker-enabled normal and OTC currency pairs */}
              {showAllPairsDrawer && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-3 border-t border-slate-800">
                  {/* Left: Mercado Normal (Forex Aberto) */}
                  <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-3.5">
                    <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-800">
                      <div>
                        <h3 className="text-xs font-display font-bold text-emerald-400">
                          MERCADO NORMAL (FOREX ABERTO — {assets.filter((asset) => !asset.isOtc).length} PARES)
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          Pares oficiais com liquidez interbancária direta
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          const normalIds = catalogStats
                            .filter((s) => !s.asset.isOtc)
                            .map((s) => s.asset.id);
                          handleSetSelectedBotAssetIds(normalIds);
                          showToast(`Todos os ${normalIds.length} pares do Mercado Normal ativados no Robô!`);
                        }}
                        className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/60 text-emerald-300 rounded text-[11px] font-semibold cursor-pointer"
                      >
                        Ativar Todos Normal no Robô
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {catalogStats
                        .filter((s) => !s.asset.isOtc)
                        .map((s) => {
                          const inBot = selectedBotAssetIds.includes(s.asset.id);
                          return (
                            <div
                              key={s.asset.id}
                              className={`p-2 rounded border text-xs flex items-center justify-between ${
                                selectedAssetId === s.asset.id
                                  ? 'bg-blue-950/40 border-blue-500'
                                  : 'bg-[#111827] border-slate-800'
                              }`}
                            >
                              <button
                                onClick={() => setSelectedAssetId(s.asset.id)}
                                className="text-left truncate cursor-pointer"
                              >
                                <div className="font-semibold text-white">
                                  {s.asset.ticker}
                                </div>
                                <div className="text-[10px] font-mono text-emerald-400">
                                  G1: {s.winRateGale1.toFixed(0)}% · {s.asset.payout}%
                                </div>
                              </button>
                              <button
                                onClick={() => handleToggleBotAsset(s.asset.id)}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer ${
                                  inBot
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-slate-800 text-slate-400 hover:text-white'
                                }`}
                              >
                                {inBot ? 'ON' : 'OFF'}
                              </button>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {/* Right: Mercado OTC (24/7 IQ Option) */}
                  <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-3.5">
                    <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-800">
                      <div>
                        <h3 className="text-xs font-display font-bold text-amber-400">
                          MERCADO OTC (OVER-THE-COUNTER — {assets.filter((asset) => asset.isOtc).length} PARES)
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          Pares OTC da corretora (Payouts de 89% a 93%)
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          const otcIds = catalogStats
                            .filter((s) => s.asset.isOtc)
                            .map((s) => s.asset.id);
                          handleSetSelectedBotAssetIds(otcIds);
                          showToast(`Todos os ${otcIds.length} pares OTC ativados no Robô!`);
                        }}
                        className="px-2.5 py-1 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/60 text-amber-300 rounded text-[11px] font-semibold cursor-pointer"
                      >
                        Ativar Todos OTC no Robô
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {catalogStats
                        .filter((s) => s.asset.isOtc)
                        .map((s) => {
                          const inBot = selectedBotAssetIds.includes(s.asset.id);
                          return (
                            <div
                              key={s.asset.id}
                              className={`p-2 rounded border text-xs flex items-center justify-between ${
                                selectedAssetId === s.asset.id
                                  ? 'bg-blue-950/40 border-blue-500'
                                  : 'bg-[#111827] border-slate-800'
                              }`}
                            >
                              <button
                                onClick={() => setSelectedAssetId(s.asset.id)}
                                className="text-left truncate cursor-pointer"
                              >
                                <div className="font-semibold text-white">
                                  {s.asset.ticker.replace(' (OTC)', '')}{' '}
                                  <span className="text-[10px] text-amber-400">OTC</span>
                                </div>
                                <div className="text-[10px] font-mono text-emerald-400">
                                  G1: {s.winRateGale1.toFixed(0)}% · {s.asset.payout}%
                                </div>
                              </button>
                              <button
                                onClick={() => handleToggleBotAsset(s.asset.id)}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer ${
                                  inBot
                                    ? 'bg-amber-600 text-white'
                                    : 'bg-slate-800 text-slate-400 hover:text-white'
                                }`}
                              >
                                {inBot ? 'ON' : 'OFF'}
                              </button>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Live Bot Pre-Signal Radar Alert Strip */}
            {activeBotPreSignals.length > 0 && (
              <div className="bg-gradient-to-r from-blue-950/70 via-indigo-950/70 to-slate-900 border border-blue-500/50 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 shadow-lg shadow-blue-950/30">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/20 border border-blue-400/40 rounded-lg text-blue-400">
                    <Zap className="w-4 h-4 animate-pulse" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-blue-300">
                        Pré-Sinal Ativo no Robô Operador
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        · Disparo no 2º {strategyConfig.entryTimingSecond}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300">
                      Pares monitorados pelo robô armando entrada nos próximos segundos:
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {activeBotPreSignals.map((item) => (
                    <button
                      key={item.asset.id}
                      onClick={() => setSelectedAssetId(item.asset.id)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                        selectedAssetId === item.asset.id
                          ? 'bg-blue-600 border-blue-400 text-white'
                          : 'bg-[#0B0F17] hover:bg-slate-800 border-blue-500/40 text-slate-200'
                      }`}
                    >
                      <span>{item.asset.ticker}</span>
                      <span
                        className={`font-mono font-bold ${
                          item.analysis.finalDirection === 'CALL'
                            ? 'text-emerald-400'
                            : 'text-red-400'
                        }`}
                      >
                        {item.analysis.finalDirection}
                      </span>
                      <span className="font-mono tabular-nums text-blue-300 bg-blue-950/80 px-1.5 py-0.5 rounded text-[11px]">
                        00:{String(item.analysis.preSignalSecondsRemaining).padStart(2, '0')}s
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Primary 12-Column Trading Workspace */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* Left 8 Columns: Live Chart + Technical Indicators Bar */}
              <div className="lg:col-span-8 flex flex-col justify-between space-y-4">
                {/* Cockpit Pro do Robô Operador (Live Telemetry & Proteções) */}
                <div className="bg-[#111827] border border-slate-800 rounded-lg px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <div
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider ${
                        isBotRunning
                          ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-500/50 shadow-sm shadow-emerald-950/50'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isBotRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                        }`}
                      />
                      {isBotRunning ? 'Robô 24/7 Ativo' : 'Robô em Espera'}
                    </div>

                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#0B0F17] border border-slate-800 rounded-md text-xs font-medium text-slate-300">
                      <span className="text-slate-500">Estratégia:</span>
                      <strong className="text-white font-mono">
                        {strategyConfig.mhiVariant === 'AUTO_BEST'
                          ? 'Auto-Estratégia'
                          : strategyConfig.mhiVariant.replace('_', ' ')}
                      </strong>
                      <span className="text-[10px] text-blue-400 font-mono">
                        ({strategyConfig.mhiMode})
                      </span>
                    </div>

                    <div className="hidden sm:flex items-center gap-1 px-2 py-1 bg-[#0B0F17] border border-slate-800 rounded-md text-xs font-mono text-slate-300">
                      <span className="text-slate-500">Anti-Overlap:</span>
                      <span className="text-emerald-400 font-bold">1 Ordem Max</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Live Confluence Score */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-400">Confluência:</span>
                      <div className="flex items-center gap-1.5 bg-[#0B0F17] px-2 py-0.5 rounded border border-slate-800">
                        <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              mhiAnalysis.confidenceScore >= 75
                                ? 'bg-emerald-400'
                                : mhiAnalysis.confidenceScore >= 50
                                ? 'bg-amber-400'
                                : 'bg-red-400'
                            }`}
                            style={{ width: `${mhiAnalysis.confidenceScore}%` }}
                          />
                        </div>
                        <span
                          className={`font-mono text-xs font-bold tabular-nums ${
                            mhiAnalysis.confidenceScore >= 75
                              ? 'text-emerald-400'
                              : mhiAnalysis.confidenceScore >= 50
                              ? 'text-amber-400'
                              : 'text-red-400'
                          }`}
                        >
                          {mhiAnalysis.confidenceScore}%
                        </span>
                      </div>
                    </div>

                    {/* Trailing Stop Status */}
                    {/* Trailing Stop Status */}
                    {riskConfig.trailingStopWinEnabled && (
                      <div className="hidden md:flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 px-2 py-0.5 rounded">
                        <span>🛡️ Trailing Stop:</span>
                        <strong className="text-emerald-300">
                          {riskConfig.trailingStopWinActivationPercent || 60}% Meta
                        </strong>
                      </div>
                    )}

                    {/* ATR Volatility Status */}
                    {strategyConfig.useAtrFilter && (
                      <div
                        className={`hidden lg:flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded border ${
                          technicalSnapshot.atrStatus === 'NORMAL'
                            ? 'bg-cyan-950/40 border-cyan-800/50 text-cyan-300'
                            : technicalSnapshot.atrStatus === 'HIGH_VOLATILITY'
                            ? 'bg-rose-950/60 border-rose-700/60 text-rose-300 animate-pulse'
                            : 'bg-amber-950/60 border-amber-700/60 text-amber-300 animate-pulse'
                        }`}
                      >
                        <span>ATR:</span>
                        <strong>{technicalSnapshot.atrPercent.toFixed(3)}%</strong>
                        <span className="text-[10px]">
                          ({technicalSnapshot.atrStatus === 'NORMAL' ? 'Normal' : 'Pausado'})
                        </span>
                      </div>
                    )}

                    {/* Session Sequence Win / Loss */}
                    <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400 bg-[#0B0F17] border border-slate-800 px-2 py-0.5 rounded">
                      <span>Seq:</span>
                      <span className="text-emerald-400 font-bold">
                        {riskState.consecutiveWins || 0}W
                      </span>
                      <span>/</span>
                      <span className="text-red-400 font-bold">
                        {riskState.consecutiveLosses || 0}L
                      </span>
                    </div>

                    {/* Market Sentiment Cockpit Badge */}
                    {strategyConfig.useSentimentFilter && (
                      <div
                        className={`hidden xl:flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded border ${
                          technicalSnapshot.marketSentiment?.sentiment === 'BULLISH'
                            ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
                            : technicalSnapshot.marketSentiment?.sentiment === 'BEARISH'
                            ? 'bg-rose-950/40 border-rose-800/50 text-rose-300'
                            : 'bg-slate-900 border-slate-700 text-slate-300'
                        }`}
                      >
                        <span>Sentimento:</span>
                        <strong className="text-white">
                          {technicalSnapshot.marketSentiment?.bullPower ?? 50}% T / {technicalSnapshot.marketSentiment?.bearPower ?? 50}% U
                        </strong>
                      </div>
                    )}
                  </div>
                </div>

                <CandlestickChart
                  candles={activeCandles}
                  config={strategyConfig}
                  snapshot={technicalSnapshot}
                  assetTicker={activeAsset.ticker}
                  assetId={activeAsset.id}
                  timeframe={strategyConfig.timeframe}
                  secondsRemainingInCandle={secondsRemainingInCandle}
                  marketDataMode={connectionStatus.marketDataMode || 'OFFLINE'}
                  orders={orders}
                  currencySymbol={connectionStatus.currency === 'USD' ? '$' : 'R$'}
                />

                {/* High-Density Unified Technical Indicators Bar */}
                <div className="bg-[#111827] border border-slate-800 rounded-lg px-3.5 py-2.5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 sm:gap-3 items-center">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-400 font-medium">EMA {strategyConfig.emaFastPeriod}/{strategyConfig.emaSlowPeriod}</span>
                      <span
                        className={`font-mono font-bold text-xs truncate ${
                          technicalSnapshot.emaTrend === 'BULLISH'
                            ? 'text-emerald-400'
                            : technicalSnapshot.emaTrend === 'BEARISH'
                            ? 'text-rose-400'
                            : 'text-slate-300'
                        }`}
                      >
                        {technicalSnapshot.emaTrend === 'BULLISH'
                          ? 'Alta (9 > 21)'
                          : technicalSnapshot.emaTrend === 'BEARISH'
                          ? 'Baixa (9 < 21)'
                          : 'Neutro'}
                      </span>
                    </div>

                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-400 font-medium">RSI ({strategyConfig.rsiPeriod})</span>
                      <div className="font-mono tabular-nums font-bold text-xs text-white flex items-center gap-1">
                        <span>{technicalSnapshot.rsi14.toFixed(1)}</span>
                        <span
                          className={`text-[10px] font-sans ${
                            technicalSnapshot.rsiZone === 'OVERBOUGHT'
                              ? 'text-rose-400'
                              : technicalSnapshot.rsiZone === 'OVERSOLD'
                              ? 'text-emerald-400'
                              : 'text-slate-400'
                          }`}
                        >
                          ({technicalSnapshot.rsiZone === 'OVERBOUGHT'
                            ? 'Sobrecompra'
                            : technicalSnapshot.rsiZone === 'OVERSOLD'
                            ? 'Sobrevenda'
                            : 'Neutro'})
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-400 font-medium">ATR ({strategyConfig.atrPeriod || 14})</span>
                      <div className="font-mono tabular-nums font-bold text-xs flex items-center gap-1 truncate">
                        <span className="text-cyan-300">{technicalSnapshot.atrPercent.toFixed(3)}%</span>
                        <span
                          className={`text-[9px] font-sans px-1 py-0.2 rounded font-bold ${
                            technicalSnapshot.atrStatus === 'HIGH_VOLATILITY'
                              ? 'bg-rose-950/80 text-rose-300 border border-rose-800/40'
                              : technicalSnapshot.atrStatus === 'LOW_VOLATILITY'
                              ? 'bg-amber-950/80 text-amber-300 border border-amber-800/40'
                              : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/40'
                          }`}
                        >
                          {technicalSnapshot.atrStatus === 'HIGH_VOLATILITY'
                            ? 'Alta Vol.'
                            : technicalSnapshot.atrStatus === 'LOW_VOLATILITY'
                            ? 'Baixa Vol.'
                            : 'Normal'}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-400 font-medium">Bollinger (20, 2)</span>
                      <span className="font-mono font-bold text-xs text-indigo-300 truncate">
                        {technicalSnapshot.bbPosition === 'ABOVE_UPPER'
                          ? 'Rompeu Sup.'
                          : technicalSnapshot.bbPosition === 'BELOW_LOWER'
                          ? 'Rompeu Inf.'
                          : 'Dentro Canal'}
                      </span>
                    </div>

                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-400 font-medium">MACD Hist</span>
                      <span
                        className={`font-mono tabular-nums font-bold text-xs ${
                          technicalSnapshot.macdHistogram >= 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {technicalSnapshot.macdHistogram >= 0 ? '+' : ''}
                        {technicalSnapshot.macdHistogram.toFixed(5)}
                      </span>
                    </div>

                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-400 font-medium">S / R Auto</span>
                      <span className="font-mono font-bold text-xs text-slate-200 truncate">
                        {technicalSnapshot.nearResistance
                          ? 'Testa Topo'
                          : technicalSnapshot.nearSupport
                          ? 'Testa Fundo'
                          : 'Zona Neutra'}
                      </span>
                    </div>

                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-400 font-medium">Price Action</span>
                      <span className="font-mono font-bold text-xs text-amber-300 truncate">
                        {technicalSnapshot.priceActionPattern === 'NONE'
                          ? 'Padrão'
                          : technicalSnapshot.priceActionPattern.replace('_', ' ')}
                      </span>
                    </div>

                    {/* Market Sentiment & Volume Power */}
                    <div className="flex flex-col">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400 font-medium">Sentimento</span>
                        <span
                          className={`font-mono font-bold text-[10px] ${
                            technicalSnapshot.marketSentiment?.sentiment === 'BULLISH'
                              ? 'text-emerald-400'
                              : technicalSnapshot.marketSentiment?.sentiment === 'BEARISH'
                              ? 'text-rose-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {technicalSnapshot.marketSentiment?.sentiment === 'BULLISH'
                            ? 'Touros'
                            : technicalSnapshot.marketSentiment?.sentiment === 'BEARISH'
                            ? 'Ursos'
                            : 'Equilíbrio'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden flex" title={`Touros: ${technicalSnapshot.marketSentiment?.bullPower ?? 50}% | Ursos: ${technicalSnapshot.marketSentiment?.bearPower ?? 50}%`}>
                          <div
                            className="bg-emerald-500 h-full transition-all duration-300"
                            style={{
                              width: `${technicalSnapshot.marketSentiment?.bullPower ?? 50}%`,
                            }}
                          />
                          <div
                            className="bg-rose-500 h-full transition-all duration-300"
                            style={{
                              width: `${technicalSnapshot.marketSentiment?.bearPower ?? 50}%`,
                            }}
                          />
                        </div>
                        <span className="font-mono tabular-nums text-[10px] text-slate-300 whitespace-nowrap">
                          {technicalSnapshot.marketSentiment?.bullPower ?? 50}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right 4 Columns: MHI Quadrant Scanner + Direct Order Execution */}
              <div className="lg:col-span-4 bg-[#111827] border border-slate-800 rounded-lg p-4 sm:p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div>
                      <h2 className="text-sm font-display font-bold text-white">
                        Painel de Operações ({strategyConfig.mhiVariant === 'AUTO_BEST' ? 'Auto Melhor' : strategyConfig.mhiVariant.replace('_', ' ')})
                      </h2>
                      <p className="text-[11px] text-slate-400">
                        {strategyConfig.mhiMode} · Payout {activeAsset.payout}%
                      </p>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <div className="text-[10px] text-slate-400">Próx. Gatilho</div>
                      <div className="text-sm font-bold text-blue-400">
                        {Math.floor(mhiAnalysis.secondsUntilNextEntry / 60)}:
                        {String(mhiAnalysis.secondsUntilNextEntry % 60).padStart(2, '0')}
                      </div>
                    </div>
                  </div>

                  {/* 3 Base Candles of the Quadrant (Compact) */}
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                      <span>Velas Base ({strategyConfig.mhiVariant.replace('_', ' ')}):</span>
                      <span className="text-[10px] text-slate-500 font-mono">3ª · 2ª · 1ª</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          { label: '3ª Vela', color: mhiAnalysis.c1Color },
                          { label: '2ª Vela', color: mhiAnalysis.c2Color },
                          { label: '1ª Vela', color: mhiAnalysis.c3Color },
                        ] as const
                      ).map((c, idx) => (
                        <div
                          key={idx}
                          className={`py-1.5 px-2 rounded-lg border text-center font-mono text-xs font-bold transition-all ${
                            c.color === 'GREEN'
                              ? 'bg-emerald-950/40 border-emerald-600/60 text-emerald-400'
                              : c.color === 'RED'
                              ? 'bg-rose-950/40 border-rose-600/60 text-rose-400'
                              : 'bg-slate-900 border-slate-700 text-slate-400'
                          }`}
                        >
                          <div className="text-[9px] font-sans font-normal text-slate-400 uppercase tracking-wider">
                            {c.label}
                          </div>
                          <div className="text-[11px] font-bold mt-0.5">
                            {c.color === 'GREEN'
                              ? 'ALTA 🟢'
                              : c.color === 'RED'
                              ? 'BAIXA 🔴'
                              : 'DOJI ⚪'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Live Pre-Signal Verdict & Countdown Panel */}
                  <div
                    className={`p-3 rounded-lg border transition-all space-y-2.5 ${
                      mhiAnalysis.isPreSignal &&
                      (mhiAnalysis.finalDirection === 'CALL' || mhiAnalysis.finalDirection === 'PUT')
                        ? 'bg-blue-950/50 border-blue-500/80 shadow-md shadow-blue-950/40'
                        : mhiAnalysis.finalDirection === 'BLOCKED'
                        ? 'bg-amber-950/25 border-amber-500/40'
                        : 'bg-[#0B0F17] border-slate-800'
                    }`}
                  >
                    {/* Status Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {mhiAnalysis.isPreSignal &&
                        (mhiAnalysis.finalDirection === 'CALL' || mhiAnalysis.finalDirection === 'PUT') ? (
                          <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-blue-400 bg-blue-500/20 px-2 py-0.5 rounded border border-blue-400/40">
                            <Zap className="w-3 h-3 animate-pulse" />
                            Pré-Sinal Armado
                          </span>
                        ) : mhiAnalysis.finalDirection === 'BLOCKED' ? (
                          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30">
                            Entrada Filtrada
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                            Aguardando Base
                          </span>
                        )}
                      </div>

                      <div className="font-mono tabular-nums text-xs">
                        {mhiAnalysis.isPreSignal ? (
                          <span className="font-bold text-blue-400">
                            Entrada em 00:
                            {String(mhiAnalysis.preSignalSecondsRemaining).padStart(2, '0')}s
                          </span>
                        ) : (
                          <span className="text-slate-400">
                            Próx. Vela: 00:
                            {String(secondsRemainingInCandle).padStart(2, '0')}s
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Calculated Direction Banner */}
                    <div className="flex items-center justify-between pt-0.5">
                      <span className="text-xs text-slate-400">Direção Prevista:</span>
                      <span
                        className={`font-mono text-sm font-bold ${
                          mhiAnalysis.finalDirection === 'CALL'
                            ? 'text-emerald-400'
                            : mhiAnalysis.finalDirection === 'PUT'
                            ? 'text-rose-400'
                            : mhiAnalysis.finalDirection === 'BLOCKED'
                            ? 'text-amber-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {mhiAnalysis.finalDirection === 'CALL'
                          ? 'CALL (COMPRA ▲)'
                          : mhiAnalysis.finalDirection === 'PUT'
                          ? 'PUT (VENDA ▼)'
                          : mhiAnalysis.finalDirection === 'BLOCKED'
                          ? 'BLOQUEADO'
                          : 'ANALISANDO'}
                      </span>
                    </div>

                    {/* Confluence Reasons */}
                    {mhiAnalysis.confluenceReasons.length > 0 && (
                      <div className="space-y-1 pt-1.5 border-t border-slate-800/80">
                        {mhiAnalysis.confluenceReasons.map((reason, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-1.5 text-[11px] text-emerald-300"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span className="truncate">{reason}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Block Reasons */}
                    {mhiAnalysis.blockReasons.length > 0 && (
                      <div className="space-y-1 pt-1.5 border-t border-slate-800/80">
                        {mhiAnalysis.blockReasons.map((reason, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-1.5 text-[11px] text-amber-300"
                          >
                            <XCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span className="truncate">{reason}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Collapsible Quick Settings Accordion for Delay & Audio */}
                  <div className="border border-slate-800 rounded-lg overflow-hidden bg-[#0B0F17]">
                    <button
                      type="button"
                      onClick={() => setShowQuickSettings((prev) => !prev)}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs text-slate-300 hover:bg-slate-800/50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Timer className="w-3.5 h-3.5 text-blue-400" />
                        <span className="font-medium">
                          Anti-Delay ({strategyConfig.entryTimingSecond}s) · Alerta (
                          {strategyConfig.audioAlertsEnabled ? 'Ativo' : 'Mudo'})
                        </span>
                      </div>
                      {showQuickSettings ? (
                        <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </button>

                    {showQuickSettings && (
                      <div className="p-3 border-t border-slate-800 space-y-2.5 bg-[#090D14]">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-400">Segundo de Entrada:</span>
                          <div className="inline-flex p-0.5 bg-[#111827] border border-slate-800 rounded text-[10px] font-mono">
                            {([59, 58, 0] as const).map((sec) => (
                              <button
                                key={sec}
                                onClick={() =>
                                  setStrategyConfig((prev) => ({
                                    ...prev,
                                    entryTimingSecond: sec,
                                  }))
                                }
                                className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                                  strategyConfig.entryTimingSecond === sec
                                    ? 'bg-blue-600 text-white font-bold'
                                    : 'text-slate-400 hover:text-white'
                                }`}
                              >
                                {sec === 59 ? '59s (Rec)' : sec === 58 ? '58s' : '00s'}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[11px]">
                          <button
                            onClick={() =>
                              setStrategyConfig((prev) => ({
                                ...prev,
                                audioAlertsEnabled: !prev.audioAlertsEnabled,
                              }))
                            }
                            className="flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer"
                          >
                            {strategyConfig.audioAlertsEnabled ? (
                              <>
                                <Bell className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Som Pré-Sinal: <strong className="text-emerald-400">Ativado</strong></span>
                              </>
                            ) : (
                              <>
                                <BellOff className="w-3.5 h-3.5 text-slate-500" />
                                <span>Som Pré-Sinal: <strong className="text-slate-500">Mudo</strong></span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => playTradingAudio('PRE_SIGNAL')}
                            className="text-[10px] text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded bg-blue-950/40 border border-blue-900/60 cursor-pointer"
                          >
                            Testar Som
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Direct Order Execution Buttons */}
                <div className="space-y-2.5 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      Próxima Entrada ({riskConfig.managementMode}):
                    </span>
                    <span className="font-mono tabular-nums font-bold text-white">
                      R$ {riskState.nextCalculatedStake.toFixed(2)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() =>
                        executeOrder(
                          activeAsset,
                          'CALL',
                          riskState.nextCalculatedStake,
                          riskState.currentGaleStep,
                          riskState.currentSorosLevel,
                          `Manual / ${strategyConfig.mhiVariant.replace('_', ' ')}`
                        )
                      }
                      className="flex items-center justify-center gap-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-display font-bold text-sm rounded-lg transition-colors cursor-pointer shadow-lg shadow-emerald-950/30"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                      CALL (Acima)
                    </button>

                    <button
                      onClick={() =>
                        executeOrder(
                          activeAsset,
                          'PUT',
                          riskState.nextCalculatedStake,
                          riskState.currentGaleStep,
                          riskState.currentSorosLevel,
                          `Manual / ${strategyConfig.mhiVariant.replace('_', ' ')}`
                        )
                      }
                      className="flex items-center justify-center gap-2 py-3 px-4 bg-rose-600 hover:bg-rose-500 text-white font-display font-bold text-sm rounded-lg transition-colors cursor-pointer shadow-lg shadow-rose-950/30"
                    >
                      <ArrowDownRight className="w-4 h-4" />
                      PUT (Abaixo)
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Segmented Workspace Switcher */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#111827] border border-slate-800 rounded-lg p-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTerminalBottomTab('ORDERS')}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer ${
                      terminalBottomTab === 'ORDERS'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Histórico de Operações</span>
                    {orders.length > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-blue-950 text-blue-200 border border-blue-400/40">
                        {orders.length}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setTerminalBottomTab('STRATEGY')}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer ${
                      terminalBottomTab === 'STRATEGY'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Motor MHI & Filtros</span>
                    <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-950/60 text-emerald-300 border border-emerald-500/30">
                      {strategyConfig.mhiVariant.replace('_', ' ')} · {strategyConfig.mhiMode}
                    </span>
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  {terminalBottomTab === 'ORDERS' && orders.length > 0 && (
                    <button
                      onClick={handleClearOrders}
                      className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-rose-400 transition-colors cursor-pointer px-2.5 py-1 rounded hover:bg-slate-800"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Limpar Histórico</span>
                    </button>
                  )}

                  {terminalBottomTab === 'STRATEGY' && (
                    <button
                      onClick={() => setActiveTab('CATALOG')}
                      className="text-xs text-blue-400 hover:text-blue-300 font-medium cursor-pointer"
                    >
                      Ver Assertividade no Catálogo →
                    </button>
                  )}
                </div>
              </div>

              {/* Strategy Engine Tab */}
              {terminalBottomTab === 'STRATEGY' && (
                <div className="bg-[#111827] border border-slate-800 rounded-lg p-4 sm:p-5 space-y-4">

                {/* Motor de Estratégias Probabilísticas & Inteligência Auto-Best */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-xs font-bold text-white">
                        Motor de Estratégia do Robô
                      </label>
                      <p className="text-[11px] text-slate-400">
                        Selecione a lógica operacional ou utilize Auto Melhor para catalogação em tempo real
                      </p>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-blue-400 bg-blue-950/60 border border-blue-800/60 px-2 py-0.5 rounded">
                      8 Estratégias Disponíveis
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg">
                    {[
                      { id: 'AUTO_BEST', label: '🎯 Auto Melhor', desc: 'Escolhe o maior win-rate', highlight: true },
                      { id: 'MHI_1', label: 'MHI 1', desc: 'Entrada na 1ª vela' },
                      { id: 'MHI_2', label: 'MHI 2', desc: 'Entrada na 2ª vela' },
                      { id: 'MHI_3', label: 'MHI 3', desc: 'Entrada na 3ª vela' },
                      { id: 'MILHAO', label: 'Padrão Milhão', desc: '5 velas no quadrante' },
                      { id: 'TORRES_GEMEAS', label: 'Torres Gêmeas', desc: 'Vela 1 = Vela 5' },
                      { id: 'PADRAO_23', label: 'Padrão 23', desc: 'Vela 2 = Vela 4' },
                      { id: 'TRES_MOSQUETEIROS', label: '3 Mosqueteiros', desc: 'Seguimento de fluxo' },
                    ].map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() =>
                          setStrategyConfig((prev) => ({
                            ...prev,
                            mhiVariant: st.id as MHIVariant,
                          }))
                        }
                        className={`p-2 rounded text-left transition-all cursor-pointer border ${
                          strategyConfig.mhiVariant === st.id
                            ? 'bg-blue-600 border-blue-400 text-white shadow-sm'
                            : st.highlight
                            ? 'bg-blue-950/30 border-blue-800/50 text-blue-300 hover:border-blue-600'
                            : 'bg-[#111827] border-slate-800/80 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="text-xs font-bold leading-tight truncate">{st.label}</div>
                        <div className="text-[10px] opacity-75 truncate leading-tight mt-0.5">{st.desc}</div>
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-slate-400">Modo de Operação Probabilística:</span>
                    <div className="inline-flex gap-1 p-0.5 bg-[#0B0F17] border border-slate-800 rounded-lg">
                      {(['MINORIA', 'MAIORIA'] as MHIMode[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() =>
                            setStrategyConfig((prev) => ({ ...prev, mhiMode: m }))
                          }
                          className={`px-3 py-1 text-xs font-bold rounded transition-colors cursor-pointer ${
                            strategyConfig.mhiMode === m
                              ? 'bg-blue-600 text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {m === 'MINORIA' ? 'Minoria (Reversão)' : 'Maioria (Fluxo)'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Advanced Global Macro Trend Filter Panel */}
                <div className="bg-[#0A0E17] border border-purple-500/35 rounded-lg p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-md bg-purple-500/20 border border-purple-500/40 flex items-center justify-center shrink-0">
                        <TrendingUp className="w-4 h-4 text-purple-400" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          <span>Filtro de Trend Global (Macro Tendência)</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono font-semibold">
                            EMA {strategyConfig.macroTrendPeriod || 200}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Bloqueia CALL abaixo da EMA e bloqueia PUT acima da EMA
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setStrategyConfig((prev) => ({
                          ...prev,
                          useMacroTrendFilter: !prev.useMacroTrendFilter,
                        }))
                      }
                      className={`px-3 py-1 text-xs font-bold rounded cursor-pointer transition-colors shadow-sm ${
                        strategyConfig.useMacroTrendFilter !== false
                          ? 'bg-purple-600 text-white hover:bg-purple-500'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {strategyConfig.useMacroTrendFilter !== false ? 'ATIVO' : 'DESATIVADO'}
                    </button>
                  </div>

                  {strategyConfig.useMacroTrendFilter !== false && (
                    <div className="space-y-2.5 pt-2 border-t border-slate-800/80">
                      {/* Parameter Controls: Period & Higher Timeframe */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 block mb-1">
                            Período da Média Macro
                          </span>
                          <div className="grid grid-cols-3 gap-1">
                            {[200, 100, 50].map((p) => (
                              <button
                                key={p}
                                type="button"
                                onClick={() =>
                                  setStrategyConfig((prev) => ({
                                    ...prev,
                                    macroTrendPeriod: p,
                                  }))
                                }
                                className={`py-1 text-[11px] font-mono font-medium rounded transition-colors cursor-pointer ${
                                  (strategyConfig.macroTrendPeriod || 200) === p
                                    ? 'bg-purple-600/40 text-purple-200 border border-purple-500/60 font-bold'
                                    : 'bg-[#121824] text-slate-400 hover:text-white border border-slate-800'
                                }`}
                              >
                                {p}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] text-slate-400 block mb-1">
                            Timeframe da Trend
                          </span>
                          <div className="grid grid-cols-3 gap-1">
                            {[
                              { id: 'CURRENT', label: 'M1 (Atual)' },
                              { id: 'M5', label: 'M5 (Maior)' },
                              { id: 'M15', label: 'M15 (Macro)' },
                            ].map((tfOpt) => (
                              <button
                                key={tfOpt.id}
                                type="button"
                                onClick={() =>
                                  setStrategyConfig((prev) => ({
                                    ...prev,
                                    macroTrendTimeframe: tfOpt.id as any,
                                  }))
                                }
                                className={`py-1 text-[11px] font-mono font-medium rounded transition-colors cursor-pointer ${
                                  (strategyConfig.macroTrendTimeframe || 'CURRENT') === tfOpt.id
                                    ? 'bg-purple-600/40 text-purple-200 border border-purple-500/60 font-bold'
                                    : 'bg-[#121824] text-slate-400 hover:text-white border border-slate-800'
                                }`}
                              >
                                {tfOpt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Real-time Macro Bias Status Card for Active Pair */}
                      <div className="p-2.5 rounded bg-[#06080E] border border-slate-800/90 text-[11px] flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 font-mono text-slate-300">
                          <span className="font-bold text-white">{activeAsset.ticker}:</span>
                          <span className="text-slate-400">
                            Preço = {activeCandles[activeCandles.length - 1]?.close.toFixed(5) || '---'} · EMA {strategyConfig.macroTrendPeriod || 200} = {technicalSnapshot.ema200.toFixed(5)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 font-semibold shrink-0">
                          {technicalSnapshot.macroTrend === 'BULLISH' ? (
                            <span className="text-emerald-400 flex items-center gap-1 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-500/30 text-[10px]">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Tendência de Alta: Só CALL | PUT Bloqueado ⛔
                            </span>
                          ) : technicalSnapshot.macroTrend === 'BEARISH' ? (
                            <span className="text-rose-400 flex items-center gap-1 bg-rose-950/50 px-2 py-0.5 rounded border border-rose-500/30 text-[10px]">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                              Tendência de Baixa: Só PUT | CALL Bloqueado ⛔
                            </span>
                          ) : (
                            <span className="text-slate-400 bg-slate-800/40 px-2 py-0.5 rounded border border-slate-700 text-[10px]">
                              ● Zona Neutra
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Toggleable Indicator Filters */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                  {[
                    {
                      key: 'useEmaFilter' as const,
                      label: `Tendência EMA ${strategyConfig.emaFastPeriod}/${strategyConfig.emaSlowPeriod}`,
                      desc: 'Opera a favor do cruzamento das médias',
                    },
                    {
                      key: 'useRsiFilter' as const,
                      label: `Filtro RSI (${strategyConfig.rsiPeriod})`,
                      desc: `Bloqueia sobrecompra (${strategyConfig.rsiOverbought}) / venda (${strategyConfig.rsiOversold})`,
                    },
                    {
                      key: 'useBollingerFilter' as const,
                      label: 'Bandas de Bollinger (20, 2)',
                      desc: 'Valida canal e exaustão de volatilidade',
                    },
                    {
                      key: 'useMacdFilter' as const,
                      label: 'Confirmação MACD (12, 26, 9)',
                      desc: 'Exige convergência do histograma',
                    },
                    {
                      key: 'useSrFilter' as const,
                      label: 'Suporte e Resistência Auto',
                      desc: 'Evita compra no topo e venda no fundo',
                    },
                    {
                      key: 'usePriceActionFilter' as const,
                      label: 'Price Action (Engolfo / Pinbar)',
                      desc: 'Filtra velas de rejeição contrárias',
                    },
                    {
                      key: 'blockOnDoji' as const,
                      label: 'Abortar Quadrante com Doji',
                      desc: 'Cancela entrada se houver vela sem corpo',
                    },
                    {
                      key: 'useNewsFilter' as const,
                      label: 'Pausa em Notícias (2/3 Touros)',
                      desc: `Bloqueia ±${strategyConfig.pauseMinutesBeforeNews}m do evento`,
                    },
                  ].map((item) => {
                    const active = strategyConfig[item.key];
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() =>
                          setStrategyConfig((prev) => ({
                            ...prev,
                            [item.key]: !prev[item.key],
                          }))
                        }
                        className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                          active
                            ? 'bg-blue-950/25 border-blue-500/70 text-white'
                            : 'bg-[#0B0F17] border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span>{item.label}</span>
                          <span
                            className={`text-[10px] font-mono ${
                              active ? 'text-blue-400' : 'text-slate-500'
                            }`}
                          >
                            {active ? 'ATIVO' : 'OFF'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                          {item.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Advanced ATR Volatility Filter Panel */}
                <div className="bg-[#0A0E17] border border-cyan-500/35 rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-md bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center shrink-0">
                        <Activity className="w-4 h-4 text-cyan-400" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          <span>Filtro de Volatilidade ATR (Average True Range)</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono font-semibold">
                            ATR({strategyConfig.atrPeriod || 14})
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Pausa o robô se a volatilidade do mercado estiver fora dos limites (muito alta ou muito baixa)
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setStrategyConfig((prev) => ({
                          ...prev,
                          useAtrFilter: !prev.useAtrFilter,
                        }))
                      }
                      className={`px-3 py-1 text-xs font-bold rounded cursor-pointer transition-colors shadow-sm ${
                        strategyConfig.useAtrFilter
                          ? 'bg-cyan-600 text-white hover:bg-cyan-500'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {strategyConfig.useAtrFilter ? 'ATIVO' : 'DESATIVADO'}
                    </button>
                  </div>

                  {strategyConfig.useAtrFilter && (
                    <div className="space-y-3 pt-2 border-t border-slate-800/80">
                      {/* Real-time ATR Volatility Status Card for Active Pair */}
                      <div className="p-2.5 rounded bg-[#06080E] border border-slate-800/90 text-[11px] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2 font-mono text-slate-300">
                          <span className="font-bold text-white">{activeAsset.ticker}:</span>
                          <span className="text-cyan-400 font-bold">
                            ATR = {technicalSnapshot.atrValue.toFixed(5)}
                          </span>
                          <span className="text-slate-400">
                            ({technicalSnapshot.atrPercent.toFixed(3)}% da cotação)
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 font-semibold shrink-0">
                          {technicalSnapshot.atrStatus === 'HIGH_VOLATILITY' ? (
                            <span className="text-rose-400 flex items-center gap-1 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-500/40 text-[10px]">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                              🛑 Alta Volatilidade Excessiva (Operações Pausadas)
                            </span>
                          ) : technicalSnapshot.atrStatus === 'LOW_VOLATILITY' ? (
                            <span className="text-amber-400 flex items-center gap-1 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500/40 text-[10px]">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                              ⚠️ Baixa Volatilidade / Sem Amplitude (Pausado)
                            </span>
                          ) : (
                            <span className="text-emerald-400 flex items-center gap-1 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/40 text-[10px]">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              🟢 Volatilidade Ideal (Dentro da Faixa Permitida)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Mode Selector */}
                      <div>
                        <span className="text-[10px] text-slate-400 block mb-1">
                          Modo de Bloqueio da Volatilidade:
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                          {[
                            { id: 'OUTSIDE_RANGE' as const, label: 'Fora da Faixa (Ambos)', desc: 'Pausa se for < Mín ou > Máx' },
                            { id: 'HIGH_ONLY' as const, label: 'Apenas Volatilidade Alta', desc: 'Pausa apenas se estourar Máx' },
                            { id: 'LOW_ONLY' as const, label: 'Apenas Volatilidade Baixa', desc: 'Pausa apenas se estagnar < Mín' },
                          ].map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() =>
                                setStrategyConfig((prev) => ({
                                  ...prev,
                                  atrBlockMode: m.id,
                                }))
                              }
                              className={`p-1.5 rounded text-left transition-all border cursor-pointer ${
                                (strategyConfig.atrBlockMode || 'OUTSIDE_RANGE') === m.id
                                  ? 'bg-cyan-600/30 border-cyan-500 text-cyan-200'
                                  : 'bg-[#111827] border-slate-800 text-slate-400 hover:border-slate-700'
                              }`}
                            >
                              <div className="text-[11px] font-bold truncate">{m.label}</div>
                              <div className="text-[9px] opacity-75 truncate">{m.desc}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Thresholds: Min & Max Percent */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Minimum ATR Threshold */}
                        <div className="bg-[#111827] border border-slate-800/80 rounded p-2.5 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-amber-400 font-bold flex items-center gap-1">
                              <span>⚠️ Limite Mínimo de Volatilidade</span>
                            </span>
                            <span className="font-mono text-cyan-300 font-bold text-xs">
                              {(strategyConfig.atrMinPercent ?? 0.015).toFixed(3)}%
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 leading-tight">
                            Pausa o robô se a variação média for menor que esse percentual da cotação, evitando empates, dojis e mercado estagnado.
                          </p>
                          <div className="flex items-center gap-1">
                            {[0.008, 0.015, 0.025].map((val) => (
                              <button
                                key={val}
                                type="button"
                                onClick={() =>
                                  setStrategyConfig((prev) => ({
                                    ...prev,
                                    atrMinPercent: val,
                                  }))
                                }
                                className={`flex-1 py-1 rounded text-[10px] font-mono transition-colors cursor-pointer border ${
                                  (strategyConfig.atrMinPercent ?? 0.015) === val
                                    ? 'bg-amber-600/30 border-amber-500 text-amber-200 font-bold'
                                    : 'bg-[#0B0F17] border-slate-800 text-slate-400 hover:border-slate-700'
                                }`}
                              >
                                {val.toFixed(3)}%
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Maximum ATR Threshold */}
                        <div className="bg-[#111827] border border-slate-800/80 rounded p-2.5 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-rose-400 font-bold flex items-center gap-1">
                              <span>🛑 Limite Máximo de Volatilidade</span>
                            </span>
                            <span className="font-mono text-cyan-300 font-bold text-xs">
                              {(strategyConfig.atrMaxPercent ?? 0.12).toFixed(3)}%
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 leading-tight">
                            Pausa o robô se a amplitude ultrapassar esse percentual, blindando contra explosões atípicas de notícias e falsos rompimentos.
                          </p>
                          <div className="flex items-center gap-1">
                            {[0.08, 0.12, 0.18].map((val) => (
                              <button
                                key={val}
                                type="button"
                                onClick={() =>
                                  setStrategyConfig((prev) => ({
                                    ...prev,
                                    atrMaxPercent: val,
                                  }))
                                }
                                className={`flex-1 py-1 rounded text-[10px] font-mono transition-colors cursor-pointer border ${
                                  (strategyConfig.atrMaxPercent ?? 0.12) === val
                                    ? 'bg-rose-600/30 border-rose-500 text-rose-200 font-bold'
                                    : 'bg-[#0B0F17] border-slate-800 text-slate-400 hover:border-slate-700'
                                }`}
                              >
                                {val.toFixed(3)}%
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Market Sentiment & Volume Power Configuration Card */}
                <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                      <div>
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                          <span>Filtro de Sentimento & Força de Volume (Bull/Bear Power)</span>
                          <span className="text-[10px] text-emerald-400 font-mono font-normal">
                            [Volume Spread Analysis]
                          </span>
                        </h4>
                        <p className="text-[11px] text-slate-400">
                          Mede a pressão compradora (Touros) vs. vendedora (Ursos) das velas recentes para barrar sinais MHI contra o fluxo institucional dominante.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setStrategyConfig((prev) => ({
                          ...prev,
                          useSentimentFilter: !prev.useSentimentFilter,
                        }))
                      }
                      className={`px-3 py-1 text-xs font-bold rounded cursor-pointer transition-colors shadow-sm ${
                        strategyConfig.useSentimentFilter
                          ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {strategyConfig.useSentimentFilter ? 'ATIVO' : 'DESATIVADO'}
                    </button>
                  </div>

                  {strategyConfig.useSentimentFilter && (
                    <div className="space-y-3 pt-2 border-t border-slate-800/80">
                      {/* Live Market Sentiment Visualizer for Active Pair */}
                      <div className="p-2.5 rounded bg-[#06080E] border border-slate-800/90 text-[11px] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 font-mono">
                            <span className="font-bold text-white">{activeAsset.ticker}:</span>
                            <span className="text-emerald-400 font-bold">
                              Touros: {technicalSnapshot.marketSentiment?.bullPower ?? 50}%
                            </span>
                            <span className="text-slate-500">|</span>
                            <span className="text-rose-400 font-bold">
                              Ursos: {technicalSnapshot.marketSentiment?.bearPower ?? 50}%
                            </span>
                          </div>
                          {/* Live 2-Color Ratio Progress Bar */}
                          <div className="w-full sm:w-64 h-2 bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
                            <div
                              className="bg-emerald-500 h-full transition-all duration-300"
                              style={{ width: `${technicalSnapshot.marketSentiment?.bullPower ?? 50}%` }}
                            />
                            <div
                              className="bg-rose-500 h-full transition-all duration-300"
                              style={{ width: `${technicalSnapshot.marketSentiment?.bearPower ?? 50}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 font-semibold shrink-0">
                          {technicalSnapshot.marketSentiment?.sentiment === 'BULLISH' ? (
                            <span className="text-emerald-300 flex items-center gap-1 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/40 text-[10px]">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Dominância Compradora (CALL favorecido / PUT barrado)
                            </span>
                          ) : technicalSnapshot.marketSentiment?.sentiment === 'BEARISH' ? (
                            <span className="text-rose-300 flex items-center gap-1 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-500/40 text-[10px]">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                              Dominância Vendedora (PUT favorecido / CALL barrado)
                            </span>
                          ) : (
                            <span className="text-slate-300 flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded border border-slate-700 text-[10px]">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                              Sentimento Neutro / Equilíbrio de Forças
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Threshold Configuration */}
                      <div className="bg-[#111827] border border-slate-800/80 rounded p-2.5 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-300 font-bold flex items-center gap-1">
                            <span>Limite de Dominância Mínima para Bloqueio / Confluência</span>
                          </span>
                          <span className="font-mono text-emerald-400 font-bold text-xs">
                            {strategyConfig.sentimentThreshold ?? 55}% de Força
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-tight">
                          Quando uma das forças ultrapassa esse patamar, entradas opostas são imediatamente bloqueadas e entradas alinhadas ganham confluência técnica.
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
                          {[
                            { val: 52, label: '52% - Sensível', desc: 'Ativa com leve pressão' },
                            { val: 55, label: '55% - Padrão', desc: 'Equilíbrio recomendado' },
                            { val: 60, label: '60% - Moderado', desc: 'Exige fluxo confirmado' },
                            { val: 65, label: '65% - Estrito', desc: 'Apenas tendências fortes' },
                          ].map((item) => (
                            <button
                              key={item.val}
                              type="button"
                              onClick={() =>
                                setStrategyConfig((prev) => ({
                                  ...prev,
                                  sentimentThreshold: item.val,
                                }))
                              }
                              className={`p-1.5 rounded text-left transition-colors cursor-pointer border ${
                                (strategyConfig.sentimentThreshold ?? 55) === item.val
                                  ? 'bg-emerald-600/30 border-emerald-500 text-emerald-200'
                                  : 'bg-[#0B0F17] border-slate-800 text-slate-400 hover:border-slate-700'
                              }`}
                            >
                              <div className="text-[11px] font-bold">{item.label}</div>
                              <div className="text-[9px] opacity-75">{item.desc}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Orders History Tab */}
            {terminalBottomTab === 'ORDERS' && (
              <div className="bg-[#111827] border border-slate-800 rounded-lg overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-400" />
                    <h2 className="text-sm font-display font-bold text-white">
                      Histórico de Operações & Auditoria de Gales
                    </h2>
                  </div>

                  {orders.length > 0 && (
                    <button
                      onClick={handleClearOrders}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Limpar Histórico
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto flex-1">
                  {orders.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center p-6 text-center">
                      <p className="text-sm font-medium text-slate-300">
                        Nenhuma ordem executada nesta sessão
                      </p>
                      <p className="text-xs text-slate-500 mt-1 max-w-md">
                        Inicie o Robô Operador para entradas automáticas na virada do quadrante MHI ou utilize os botões CALL / PUT para disparo imediato via WebSocket.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Desktop Table View */}
                      <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 bg-[#0B0F17]/80 text-[11px] text-slate-400">
                            <th className="py-2.5 px-3">ID / Horário</th>
                            <th className="py-2.5 px-3">Ativo</th>
                            <th className="py-2.5 px-3">Estratégia / Etapa</th>
                            <th className="py-2.5 px-3">Direção</th>
                            <th className="py-2.5 px-3 text-right">Preço Entrada</th>
                            <th className="py-2.5 px-3 text-right">Preço Fechamento</th>
                            <th className="py-2.5 px-3 text-right">Lote</th>
                            <th className="py-2.5 px-3 text-right">Resultado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
                          {paginatedOrders.map((ord) => {
                            const timeStr = new Date(
                              ord.timestamp * 1000
                            ).toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            });
                            return (
                              <tr key={ord.id} className="h-10 hover:bg-slate-800/30">
                                <td className="py-2 px-3 text-slate-400 whitespace-nowrap">
                                  <div className="flex items-center gap-1.5">
                                    {ord.brokerConfirmed ? (
                                      <span
                                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                        title={`Ordem confirmada pela IQ Option (ID: ${ord.iqOptionOrderId})`}
                                      >
                                        IQ #{ord.iqOptionOrderId}
                                      </span>
                                    ) : ord.status === 'REJECTED' ? (
                                      <span
                                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/30"
                                        title={ord.brokerMessage || 'Recusada pela corretora'}
                                      >
                                        RECUSADA IQ
                                      </span>
                                    ) : (
                                      <span
                                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30 animate-pulse"
                                        title="Enviando à corretora..."
                                      >
                                        IQ #{ord.iqOptionOrderId || 'ENVIANDO'}
                                      </span>
                                    )}
                                    <span className="text-slate-400 text-[11px]">· {timeStr}</span>
                                  </div>
                                </td>
                                <td className="py-2 px-3 font-sans font-semibold text-white whitespace-nowrap">
                                  {ord.assetTicker}
                                </td>
                                <td className="py-2 px-3 font-sans text-slate-300 whitespace-nowrap">
                                  {ord.strategyLabel}{' '}
                                  {ord.galeStep > 0
                                    ? `(Gale ${ord.galeStep})`
                                    : '(1ª Mão)'}
                                </td>
                                <td className="py-2 px-3 whitespace-nowrap">
                                  <span
                                    className={
                                      ord.direction === 'CALL'
                                        ? 'text-emerald-400 font-bold'
                                        : 'text-red-400 font-bold'
                                    }
                                  >
                                    {ord.direction}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-right whitespace-nowrap">
                                  <span className="font-mono tabular-nums text-slate-200 font-semibold">
                                    {formatOrderPrice(ord.openPrice, ord.assetTicker)}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-right whitespace-nowrap">
                                  {ord.status === 'OPEN' ? (
                                    <span className="font-mono tabular-nums text-blue-400 font-medium animate-pulse text-[11px]">
                                      Cotação atual...
                                    </span>
                                  ) : ord.closePrice != null ? (
                                    <div className="inline-flex flex-col items-end">
                                      <span
                                        className={`font-mono tabular-nums font-bold ${
                                          ord.status === 'WIN'
                                            ? 'text-emerald-400'
                                            : ord.status === 'LOSS'
                                            ? 'text-red-400'
                                            : 'text-slate-300'
                                        }`}
                                      >
                                        {formatOrderPrice(ord.closePrice, ord.assetTicker)}
                                      </span>
                                      {ord.openPrice != null &&
                                        ord.closePrice != null &&
                                        Math.abs(ord.closePrice - ord.openPrice) > 0.000001 && (
                                          <span
                                            className={`text-[9.5px] font-mono tabular-nums font-semibold ${
                                              ord.closePrice > ord.openPrice
                                                ? 'text-emerald-400'
                                                : 'text-red-400'
                                            }`}
                                          >
                                            {ord.closePrice > ord.openPrice ? '▲ +' : '▼ '}
                                            {Math.abs(ord.closePrice - ord.openPrice).toFixed(
                                              ord.openPrice > 50 ? 3 : 5
                                            )}
                                          </span>
                                        )}
                                    </div>
                                  ) : (
                                    <span className="text-slate-500">—</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-right text-white">
                                  R$ {ord.amount.toFixed(2)}
                                </td>
                                <td className="py-2 px-3 text-right font-bold whitespace-nowrap">
                                  {ord.status === 'OPEN' ? (
                                    <span className="text-blue-400">EM ABERTO...</span>
                                  ) : ord.status === 'WIN' ? (
                                    <span className="text-emerald-400">
                                      WIN (+R$ {ord.profit.toFixed(2)})
                                    </span>
                                  ) : ord.status === 'EQUAL' ? (
                                    <span className="text-slate-400">
                                      EMPATE (R$ 0,00)
                                    </span>
                                  ) : ord.status === 'REJECTED' ? (
                                    <span
                                      className="text-amber-400 text-[11px]"
                                      title={ord.brokerMessage || 'Ordem recusada pela corretora'}
                                    >
                                      RECUSADA ({ord.brokerMessage ? ord.brokerMessage.substring(0, 22) : 'IQ Bloqueou'})
                                    </span>
                                  ) : (
                                    <div className="flex flex-col items-end gap-1">
                                      <span className="text-red-400">
                                        LOSS (-R$ {Math.abs(ord.profit).toFixed(2)})
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => setSelectedLossOrder(ord)}
                                        className="inline-flex items-center gap-1 text-[10px] text-amber-300 hover:text-amber-200 bg-amber-950/80 hover:bg-amber-900 border border-amber-500/40 px-2 py-0.5 rounded cursor-pointer transition-colors shadow-sm font-sans"
                                        title="Ver Diagnóstico Técnico de Loss"
                                      >
                                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                                        <span>Por que perdi?</span>
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile High-Density Card List View */}
                    <div className="sm:hidden divide-y divide-slate-800">
                      {paginatedOrders.map((ord) => {
                        const timeStr = new Date(ord.timestamp * 1000).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        });
                        return (
                          <div key={ord.id} className="p-3 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-white text-xs">{ord.assetTicker}</span>
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    ord.direction === 'CALL'
                                      ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/30'
                                      : 'bg-rose-950/60 text-rose-400 border border-rose-500/30'
                                  }`}
                                >
                                  {ord.direction === 'CALL' ? 'CALL ▲' : 'PUT ▼'}
                                </span>
                                {ord.galeStep > 0 && (
                                  <span className="text-[10px] text-amber-300 font-mono">
                                    Gale {ord.galeStep}
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] font-mono text-slate-400">{timeStr}</span>
                            </div>

                            <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                              <span className="text-slate-400 text-[11px]">
                                Lote: R$ {ord.amount.toFixed(2)} · Entr: {formatOrderPrice(ord.openPrice, ord.assetTicker)}
                              </span>
                              <div>
                                {ord.status === 'OPEN' ? (
                                  <span className="text-blue-400 font-semibold animate-pulse">EM ABERTO</span>
                                ) : ord.status === 'WIN' ? (
                                  <span className="text-emerald-400 font-bold">+R$ {ord.profit.toFixed(2)}</span>
                                ) : ord.status === 'LOSS' ? (
                                  <span className="text-rose-400 font-bold">-R$ {Math.abs(ord.profit).toFixed(2)}</span>
                                ) : ord.status === 'REJECTED' ? (
                                  <span className="text-amber-400 font-semibold">RECUSADA</span>
                                ) : (
                                  <span className="text-slate-400 font-bold">EMPATE</span>
                                )}
                              </div>
                            </div>

                            {ord.status === 'LOSS' && (
                              <button
                                type="button"
                                onClick={() => setSelectedLossOrder(ord)}
                                className="mt-1 flex items-center justify-center gap-1 w-full py-1 text-[10px] text-amber-300 bg-amber-950/80 hover:bg-amber-900 border border-amber-500/40 rounded cursor-pointer transition-colors shadow-sm font-sans"
                              >
                                <AlertTriangle className="w-3 h-3 text-amber-400" />
                                <span>Por que perdi? Ver Diagnóstico</span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {orders.length > historyPageSize && (
                      <div className="flex flex-col gap-2 border-t border-slate-800 bg-[#0B0F17]/80 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-[11px] text-slate-400">
                          Página {historyPage} de {totalHistoryPages} ({orders.length} ordens)
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
                            disabled={historyPage === 1}
                            className="px-2.5 py-1 rounded border border-slate-700 bg-slate-900 text-[11px] text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:border-slate-500 hover:text-white transition-colors"
                          >
                            Anterior
                          </button>
                          <button
                            type="button"
                            onClick={() => setHistoryPage((page) => Math.min(totalHistoryPages, page + 1))}
                            disabled={historyPage >= totalHistoryPages}
                            className="px-2.5 py-1 rounded border border-slate-700 bg-slate-900 text-[11px] text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:border-slate-500 hover:text-white transition-colors"
                          >
                            Próxima
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    )}
  </main>

      {/* Mobile Sticky Bottom Navigation Dock (md:hidden) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0B0F17]/95 backdrop-blur-xl border-t border-slate-800 px-3 py-2 safe-area-pb">
        <div className="grid grid-cols-6 gap-1 text-center">
          <button
            onClick={() => setActiveTab('TERMINAL')}
            className={`flex flex-col items-center justify-center py-1 rounded transition-colors ${
              activeTab === 'TERMINAL' ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Radio className="w-4 h-4 mb-1" />
            <span className="text-[10px]">Terminal</span>
          </button>
          <button
            onClick={() => setActiveTab('CATALOG')}
            className={`flex flex-col items-center justify-center py-1 rounded transition-colors ${
              activeTab === 'CATALOG' ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <BarChart3 className="w-4 h-4 mb-1" />
            <span className="text-[10px]">Catálogo</span>
          </button>
          <button
            onClick={() => setActiveTab('SIGNALS')}
            className={`flex flex-col items-center justify-center py-1 rounded transition-colors ${
              activeTab === 'SIGNALS' ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <CalendarClock className="w-4 h-4 mb-1" />
            <span className="text-[10px]">Sinais</span>
          </button>
          <button
            onClick={() => setActiveTab('RISK')}
            className={`flex flex-col items-center justify-center py-1 rounded transition-colors ${
              activeTab === 'RISK' ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4 mb-1" />
            <span className="text-[10px]">Gestão</span>
          </button>
          <button
            onClick={() => setActiveTab('PERFORMANCE')}
            className={`flex flex-col items-center justify-center py-1 rounded transition-colors ${
              activeTab === 'PERFORMANCE' ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4 mb-1" />
            <span className="text-[10px]">Relatório</span>
          </button>
          <button
            onClick={() => setActiveTab('NOTIFICATIONS')}
            className={`flex flex-col items-center justify-center py-1 rounded transition-colors ${
              activeTab === 'NOTIFICATIONS' ? 'text-sky-400 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Send className="w-4 h-4 mb-1" />
            <span className="text-[10px]">Avisos</span>
          </button>
        </div>
      </div>

      {/* Connect IQ Option Modal */}
      <ConnectModal
        isOpen={isConnectModalOpen}
        onClose={() => setIsConnectModalOpen(false)}
        status={connectionStatus}
        onConnect={handleConnectIQ}
        onVerify2FA={handleVerify2FA}
        onDisconnect={handleDisconnectIQ}
      />

      {/* Post-Mortem Loss Technical Diagnostics Modal */}
      <LossDiagnosisModal
        order={selectedLossOrder}
        onClose={() => setSelectedLossOrder(null)}
      />
    </div>
  );
}
