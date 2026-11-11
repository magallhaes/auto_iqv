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
import { SignalListPage } from './components/SignalListPage';
import { ConnectModal } from './components/ConnectModal';
import { DailyPerformanceDashboard } from './components/DailyPerformanceDashboard';
import { LoginScreen } from './components/LoginScreen';
import {
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
} from 'lucide-react';
import { playTradingAudio } from './utils/sound';

type ActiveTab = 'TERMINAL' | 'CATALOG' | 'SIGNALS' | 'RISK' | 'NEWS' | 'PERFORMANCE';

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

  // Fetch bulk catalog & initial candles
  const fetchCatalogSnapshot = useCallback(async () => {
    try {
      const candleCount =
        strategyConfig.timeframe === 60
          ? Math.min(300, lookbackHours * 60)
          : Math.min(240, lookbackHours * 12 * 3);
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
          `/api/iq/candles?assetId=${selectedAssetId}&timeframe=${tf}&count=200`
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
            if (Array.isArray(msg.payload.orders)) setOrders(msg.payload.orders);
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
      .sort((a, b) => b.winRateGale1 - a.winRateGale1);
  }, [assets, candlesByAsset, strategyConfig]);

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
    if (nextRunning && (riskState.stopWinReached || riskState.stopLossReached)) {
      nextRiskState = {
        ...riskState,
        sessionProfit: 0,
        stopWinReached: false,
        stopLossReached: false,
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

  const handleToggleBotAsset = (assetId: number) => {
    setSelectedBotAssetIds((prev) =>
      prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId]
    );
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
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-800 bg-[#0B0F17]">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#terminal"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('TERMINAL');
          }}
          className="text-lg font-display font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          QuantIQ
        </a>

        {/* Zone 2: Concise single-line navigation links */}
        <nav className="flex items-center gap-6 text-sm font-medium text-slate-400 overflow-x-auto">
          <a
            href="#terminal"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('TERMINAL');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'TERMINAL'
                ? 'text-white border-blue-500'
                : 'border-transparent hover:text-white'
            }`}
          >
            Terminal Operador
          </a>
          <a
            href="#catalogacao"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('CATALOG');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'CATALOG'
                ? 'text-white border-blue-500'
                : 'border-transparent hover:text-white'
            }`}
          >
            Catalogação & Estratégias
          </a>
          <a
            href="#sinais"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('SIGNALS');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 flex items-center gap-1.5 ${
              activeTab === 'SIGNALS'
                ? 'text-white border-blue-500'
                : 'border-transparent hover:text-white'
            }`}
          >
            <span>Lista de Sinais & Gale</span>
            {scheduledSignals.length > 0 && (
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
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'RISK'
                ? 'text-white border-blue-500'
                : 'border-transparent hover:text-white'
            }`}
          >
            Stop Win / Loss & Entradas
          </a>
          <a
            href="#performance"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('PERFORMANCE');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 flex items-center gap-1.5 ${
              activeTab === 'PERFORMANCE'
                ? 'text-white border-emerald-500 font-bold'
                : 'border-transparent hover:text-white'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Relatório Diário</span>
          </a>
          <a
            href="#noticias"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('NEWS');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'NEWS'
                ? 'text-white border-blue-500'
                : 'border-transparent hover:text-white'
            }`}
          >
            Filtro de Notícias
          </a>
        </nav>

        {/* Zone 3: IQ Connect & User Session Actions */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setIsConnectModalOpen(true)}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              connectionStatus.authenticated
                ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-600/30'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {connectionStatus.authenticated
              ? `IQ Conectada (${connectionStatus.email?.split('@')[0]})`
              : 'Conectar IQ Option'}
          </button>

          {currentUser && (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-800 text-xs">
              <div className="flex items-center gap-1.5 bg-[#141A26] px-2.5 py-1 rounded-lg border border-[#212B3E]">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold text-white truncate max-w-[110px]">
                  {currentUser.name}
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

      {/* Operational Toolbar Strip (Account Switcher, Inline Entry/Stop Config & Page Switchers) */}
      <div className="bg-[#111827] border-b border-slate-800 px-6 py-3">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Left: Account Mode & Balance */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="inline-flex items-center p-0.5 bg-[#0B0F17] border border-slate-800 rounded-lg">
              <button
                onClick={() => handleSwitchAccount('PRACTICE')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  connectionStatus.activeBalanceType === 'PRACTICE'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Conta Demo
              </button>
              <button
                onClick={() => handleSwitchAccount('REAL')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  connectionStatus.activeBalanceType === 'REAL'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Conta Real
              </button>
            </div>

            <div className="font-mono tabular-nums">
              <span className="text-slate-400">Saldo: </span>
              <strong className="text-white text-sm">
                R${' '}
                {activeBalanceValue.toLocaleString('pt-BR', {
                  minimumFractionDigits: 2,
                })}
              </strong>
            </div>

            <span className="text-slate-700">|</span>

            {/* Inline Quick Inputs for Entrada, Stop Win & Stop Loss */}
            <div className="flex items-center gap-2 font-mono tabular-nums">
              <label className="flex items-center gap-1 text-slate-300">
                <span className="text-slate-400">Entrada R$:</span>
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
                  className="w-16 px-2 py-1 bg-[#0B0F17] border border-slate-700 rounded text-white text-xs font-bold focus:outline-none focus:border-blue-500"
                />
              </label>

              <label className="flex items-center gap-1 text-emerald-400">
                <span>Stop Win:</span>
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
                  className="w-16 px-2 py-1 bg-[#0B0F17] border border-emerald-800/70 rounded text-emerald-400 text-xs font-bold focus:outline-none focus:border-emerald-500"
                />
              </label>

              <label className="flex items-center gap-1 text-red-400">
                <span>Stop Loss:</span>
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
                  className="w-16 px-2 py-1 bg-[#0B0F17] border border-red-800/70 rounded text-red-400 text-xs font-bold focus:outline-none focus:border-red-500"
                />
              </label>
            </div>

            <span className="text-slate-700 hidden xl:inline">|</span>

            <div className="font-mono tabular-nums">
              <span className="text-slate-400">Sessão: </span>
              <strong
                className={
                  riskState.sessionProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
                }
              >
                {riskState.sessionProfit >= 0 ? '+' : ''}R${' '}
                {riskState.sessionProfit.toFixed(2)}
              </strong>
              <span className="text-slate-500 ml-1.5">
                ({riskState.totalWins}W / {riskState.totalLosses}L)
              </span>
            </div>
          </div>

          {/* Right: Prominent Page Switcher Buttons & Master Bot Toggle */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveTab('CATALOG')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'CATALOG'
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-[#0B0F17] border-slate-700 text-slate-200 hover:border-blue-500'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
              Catalogação
            </button>

            <button
              onClick={() => setActiveTab('SIGNALS')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'SIGNALS'
                  ? 'bg-amber-600 border-amber-500 text-white'
                  : 'bg-[#0B0F17] border-slate-700 text-slate-200 hover:border-amber-500'
              }`}
            >
              <ListPlus className="w-3.5 h-3.5 text-amber-400" />
              Lista de Sinais
              {scheduledSignals.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 text-[10px] bg-[#0B0F17] text-amber-300 font-mono rounded">
                  {scheduledSignals.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('RISK')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'RISK'
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-[#0B0F17] border-slate-700 text-slate-200 hover:border-blue-500'
              }`}
            >
              <Settings2 className="w-3.5 h-3.5 text-emerald-400" />
              Stop & Entradas
            </button>

            <button
              onClick={handleToggleBot}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                isBotRunning
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              {isBotRunning ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  Pausar Robô 24/7 ({botMode === 'STRATEGY' ? 'MHI' : botMode === 'SIGNAL_LIST' ? 'Lista' : 'MHI + Lista'})
                </>
              ) : (
                <>
                  <Bot className="w-3.5 h-3.5" />
                  Iniciar Robô 24/7 ({botMode === 'STRATEGY' ? `${selectedBotAssetIds.length} Pares MHI` : botMode === 'SIGNAL_LIST' ? `${scheduledSignals.length} Sinais` : 'MHI + Lista'})
                </>
              )}
            </button>
          </div>
        </div>

        {toastMessage && (
          <div className="max-w-[1440px] mx-auto mt-2">
            <div className="text-xs text-blue-200 bg-blue-950/70 border border-blue-800/80 px-3 py-1.5 rounded-lg">
              {toastMessage}
            </div>
          </div>
        )}
      </div>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6">
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
            {/* Asset Quick Bar, Normal vs OTC Market Selector & Timeframe Switch */}
            <div className="bg-[#111827] border border-slate-800 rounded-lg p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Market Filter: Todos | Mercado Normal | Mercado OTC */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex p-1 bg-[#0B0F17] border border-slate-800 rounded-lg text-xs">
                    <button
                      onClick={() => setTerminalMarketFilter('ALL')}
                      className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                        terminalMarketFilter === 'ALL'
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Todos ({catalogStats.length})
                    </button>
                    <button
                      onClick={() => setTerminalMarketFilter('NORMAL')}
                      className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                        terminalMarketFilter === 'NORMAL'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Mercado Normal ({catalogStats.filter((s) => !s.asset.isOtc).length})
                    </button>
                    <button
                      onClick={() => setTerminalMarketFilter('OTC')}
                      className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${
                        terminalMarketFilter === 'OTC'
                          ? 'bg-amber-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Mercado OTC ({catalogStats.filter((s) => s.asset.isOtc).length})
                    </button>
                  </div>

                  <button
                    onClick={() => setShowAllPairsDrawer((prev) => !prev)}
                    className="px-3 py-1.5 bg-[#0B0F17] hover:bg-slate-800 border border-slate-700 rounded-lg text-xs font-semibold text-blue-400 transition-colors cursor-pointer"
                  >
                    {showAllPairsDrawer
                      ? 'Ocultar Grade Completa de Pares'
                      : 'Ver Todos os 30 Pares (Normal & OTC)'}
                  </button>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="grid grid-cols-2 gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg">
                    {([60, 300] as TimeframeSeconds[]).map((tf) => (
                      <button
                        key={tf}
                        onClick={() =>
                          setStrategyConfig((prev) => ({ ...prev, timeframe: tf }))
                        }
                        className={`px-2.5 py-1 text-xs font-mono font-medium rounded transition-colors cursor-pointer ${
                          strategyConfig.timeframe === tf
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        M{tf / 60}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Scrollable Pair Strip */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {catalogStats
                  .filter((item) => {
                    if (terminalMarketFilter === 'NORMAL') return !item.asset.isOtc;
                    if (terminalMarketFilter === 'OTC') return item.asset.isOtc;
                    return true;
                  })
                  .map((item) => {
                    const isSelected = item.asset.id === selectedAssetId;
                    const isBotMonitored = selectedBotAssetIds.includes(item.asset.id);
                    return (
                      <button
                        key={item.asset.id}
                        onClick={() => setSelectedAssetId(item.asset.id)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          isSelected
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-[#0B0F17] border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <span>{item.asset.ticker}</span>
                        <span
                          className={`ml-2 font-mono tabular-nums text-[11px] ${
                            isSelected ? 'text-blue-100' : 'text-emerald-400'
                          }`}
                        >
                          {item.winRateGale1.toFixed(0)}%
                        </span>
                        {isBotMonitored && (
                          <span className="ml-1.5 text-[10px] opacity-80">· Robô</span>
                        )}
                      </button>
                    );
                  })}
              </div>

              {/* Expandable Full Grid: Mercado Normal (15 Pares) vs Mercado OTC (15 Pares) */}
              {showAllPairsDrawer && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-3 border-t border-slate-800">
                  {/* Left: Mercado Normal (Forex Aberto) */}
                  <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-3.5">
                    <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-800">
                      <div>
                        <h3 className="text-xs font-display font-bold text-emerald-400">
                          MERCADO NORMAL (FOREX ABERTO — 15 PARES)
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
                          setSelectedBotAssetIds(normalIds);
                          showToast('Todos os 15 pares do Mercado Normal ativados no Robô!');
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
                          MERCADO OTC (OVER-THE-COUNTER 24/7 — 15 PARES)
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
                          setSelectedBotAssetIds(otcIds);
                          showToast('Todos os 15 pares do Mercado OTC ativados no Robô!');
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
                <CandlestickChart
                  candles={activeCandles}
                  config={strategyConfig}
                  snapshot={technicalSnapshot}
                  assetTicker={activeAsset.ticker}
                  assetId={activeAsset.id}
                  timeframe={strategyConfig.timeframe}
                  secondsRemainingInCandle={secondsRemainingInCandle}
                  orders={orders}
                  currencySymbol={connectionStatus.currency === 'USD' ? '$' : 'R$'}
                />

                {/* Live Indicator Telemetry Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="bg-[#111827] border border-slate-800 rounded-lg p-3">
                    <div className="text-[11px] text-slate-400">
                      EMA {strategyConfig.emaFastPeriod} / {strategyConfig.emaSlowPeriod}
                    </div>
                    <div
                      className={`mt-1 text-xs font-mono font-bold ${
                        technicalSnapshot.emaTrend === 'BULLISH'
                          ? 'text-emerald-400'
                          : technicalSnapshot.emaTrend === 'BEARISH'
                          ? 'text-red-400'
                          : 'text-slate-300'
                      }`}
                    >
                      {technicalSnapshot.emaTrend === 'BULLISH'
                        ? 'ALTA (9 > 21)'
                        : technicalSnapshot.emaTrend === 'BEARISH'
                        ? 'BAIXA (9 < 21)'
                        : 'NEUTRO'}
                    </div>
                  </div>

                  <div className="bg-[#111827] border border-slate-800 rounded-lg p-3">
                    <div className="text-[11px] text-slate-400">
                      RSI ({strategyConfig.rsiPeriod})
                    </div>
                    <div className="mt-1 text-xs font-mono tabular-nums font-bold text-white">
                      {technicalSnapshot.rsi14.toFixed(1)} ·{' '}
                      <span
                        className={
                          technicalSnapshot.rsiZone === 'OVERBOUGHT'
                            ? 'text-red-400'
                            : technicalSnapshot.rsiZone === 'OVERSOLD'
                            ? 'text-emerald-400'
                            : 'text-slate-400'
                        }
                      >
                        {technicalSnapshot.rsiZone === 'OVERBOUGHT'
                          ? 'Sobrecompra'
                          : technicalSnapshot.rsiZone === 'OVERSOLD'
                          ? 'Sobrevenda'
                          : 'Neutro'}
                      </span>
                    </div>
                  </div>

                  <div className="bg-[#111827] border border-slate-800 rounded-lg p-3">
                    <div className="text-[11px] text-slate-400">Bandas de Bollinger</div>
                    <div className="mt-1 text-xs font-mono font-bold text-indigo-300">
                      {technicalSnapshot.bbPosition === 'ABOVE_UPPER'
                        ? 'Rompeu Banda Sup.'
                        : technicalSnapshot.bbPosition === 'BELOW_LOWER'
                        ? 'Rompeu Banda Inf.'
                        : 'Dentro do Canal'}
                    </div>
                  </div>

                  <div className="bg-[#111827] border border-slate-800 rounded-lg p-3">
                    <div className="text-[11px] text-slate-400">MACD Histograma</div>
                    <div
                      className={`mt-1 text-xs font-mono tabular-nums font-bold ${
                        technicalSnapshot.macdHistogram >= 0
                          ? 'text-emerald-400'
                          : 'text-red-400'
                      }`}
                    >
                      {technicalSnapshot.macdHistogram >= 0 ? '+' : ''}
                      {technicalSnapshot.macdHistogram.toFixed(5)}
                    </div>
                  </div>

                  <div className="bg-[#111827] border border-slate-800 rounded-lg p-3">
                    <div className="text-[11px] text-slate-400">Suporte / Resistência</div>
                    <div className="mt-1 text-xs font-mono font-bold text-slate-200">
                      {technicalSnapshot.nearResistance
                        ? 'Testando Topo'
                        : technicalSnapshot.nearSupport
                        ? 'Testando Fundo'
                        : 'Meio de Zona'}
                    </div>
                  </div>

                  <div className="bg-[#111827] border border-slate-800 rounded-lg p-3">
                    <div className="text-[11px] text-slate-400">Price Action</div>
                    <div className="mt-1 text-xs font-mono font-bold text-amber-300 truncate">
                      {technicalSnapshot.priceActionPattern === 'NONE'
                        ? 'Formação Padrão'
                        : technicalSnapshot.priceActionPattern.replace('_', ' ')}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right 4 Columns: MHI Quadrant Scanner + Direct Order Execution */}
              <div className="lg:col-span-4 bg-[#111827] border border-slate-800 rounded-lg p-5 flex flex-col justify-between space-y-5">
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div>
                      <h2 className="text-sm font-display font-bold text-white">
                        Scanner de Quadrante MHI & Confluência
                      </h2>
                      <p className="text-[11px] text-slate-400">
                        {strategyConfig.mhiVariant.replace('_', ' ')} ·{' '}
                        {strategyConfig.mhiMode} · Payout {activeAsset.payout}%
                      </p>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <div className="text-[10px] text-slate-400">Próx. Gatilho MHI</div>
                      <div className="text-sm font-bold text-blue-400">
                        {Math.floor(mhiAnalysis.secondsUntilNextEntry / 60)}:
                        {String(mhiAnalysis.secondsUntilNextEntry % 60).padStart(2, '0')}
                      </div>
                    </div>
                  </div>

                  {/* Last 3 Base Candles of the Quadrant */}
                  <div>
                    <div className="text-xs text-slate-400 mb-2">
                      3 Últimas Velas Base do Quadrante:
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          { label: '3ª Antepenúltima', color: mhiAnalysis.c1Color },
                          { label: '2ª Penúltima', color: mhiAnalysis.c2Color },
                          { label: '1ª Última Vela', color: mhiAnalysis.c3Color },
                        ] as const
                      ).map((c, idx) => (
                        <div
                          key={idx}
                          className={`p-2.5 rounded-lg border text-center font-mono text-xs font-bold ${
                            c.color === 'GREEN'
                              ? 'bg-emerald-950/40 border-emerald-700/70 text-emerald-400'
                              : c.color === 'RED'
                              ? 'bg-red-950/40 border-red-700/70 text-red-400'
                              : 'bg-slate-900 border-slate-700 text-slate-400'
                          }`}
                        >
                          <div className="text-[10px] font-sans font-normal text-slate-400 mb-0.5">
                            {c.label}
                          </div>
                          {c.color === 'GREEN'
                            ? 'VERDE (Alta)'
                            : c.color === 'RED'
                            ? 'VERMELHA'
                            : 'DOJI'}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Live Pre-Signal Verdict & Countdown Panel */}
                  <div
                    className={`p-3.5 rounded-lg border transition-all space-y-3 ${
                      mhiAnalysis.isPreSignal &&
                      (mhiAnalysis.finalDirection === 'CALL' || mhiAnalysis.finalDirection === 'PUT')
                        ? 'bg-blue-950/60 border-blue-500/80 shadow-lg shadow-blue-950/40'
                        : mhiAnalysis.finalDirection === 'BLOCKED'
                        ? 'bg-amber-950/30 border-amber-500/40'
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
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-slate-400">Direção Prevista:</span>
                      <span
                        className={`font-mono text-sm font-bold ${
                          mhiAnalysis.finalDirection === 'CALL'
                            ? 'text-emerald-400'
                            : mhiAnalysis.finalDirection === 'PUT'
                            ? 'text-red-400'
                            : mhiAnalysis.finalDirection === 'BLOCKED'
                            ? 'text-amber-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {mhiAnalysis.finalDirection === 'CALL'
                          ? 'CALL (COMPRA)'
                          : mhiAnalysis.finalDirection === 'PUT'
                          ? 'PUT (VENDA)'
                          : mhiAnalysis.finalDirection === 'BLOCKED'
                          ? 'BLOQUEADO POR FILTRO'
                          : 'ANALISANDO'}
                      </span>
                    </div>

                    {/* Delay & Execution Note */}
                    <div className="text-[11px] text-slate-400 bg-[#111827] p-2 rounded border border-slate-800 flex items-center justify-between">
                      <span>Gatilho de Disparo:</span>
                      <span className="font-mono font-semibold text-blue-300">
                        2º {strategyConfig.entryTimingSecond} (Anti-Delay IQ Option)
                      </span>
                    </div>

                    {/* Confluence Reasons */}
                    {mhiAnalysis.confluenceReasons.length > 0 && (
                      <div className="space-y-1 pt-1 border-t border-slate-800/80">
                        {mhiAnalysis.confluenceReasons.map((reason, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-1.5 text-[11px] text-emerald-300"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>{reason}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Block Reasons */}
                    {mhiAnalysis.blockReasons.length > 0 && (
                      <div className="space-y-1 pt-1 border-t border-slate-800/80">
                        {mhiAnalysis.blockReasons.map((reason, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-1.5 text-[11px] text-amber-300"
                          >
                            <XCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>{reason}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Delay Anticipation Selector & Audio Alert Controls */}
                  <div className="p-3 bg-[#0B0F17] border border-slate-800 rounded-lg space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                        <Timer className="w-3.5 h-3.5 text-blue-400" />
                        Antecipação contra Delay:
                      </span>
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

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/70 text-[11px]">
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
                            <span>Som de Pré-Sinal: <strong className="text-emerald-400">Ativado</strong></span>
                          </>
                        ) : (
                          <>
                            <BellOff className="w-3.5 h-3.5 text-slate-500" />
                            <span>Som de Pré-Sinal: <strong className="text-slate-500">Mudo</strong></span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => playTradingAudio('PRE_SIGNAL')}
                        className="text-[10px] text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded bg-blue-950/40 border border-blue-900/60 cursor-pointer"
                      >
                        Ouvir Alerta
                      </button>
                    </div>
                  </div>
                </div>

                {/* Direct Order Execution Buttons */}
                <div className="space-y-3 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      Valor da Próxima Entrada ({riskConfig.managementMode}):
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
                      className="flex items-center justify-center gap-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-display font-bold text-sm rounded-lg transition-colors cursor-pointer"
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
                      className="flex items-center justify-center gap-2 py-3 px-4 bg-red-600 hover:bg-red-500 text-white font-display font-bold text-sm rounded-lg transition-colors cursor-pointer"
                    >
                      <ArrowDownRight className="w-4 h-4" />
                      PUT (Abaixo)
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Strategy & Indicator Confluence Switches + Live Order History */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 5 Columns: Strategy & Confluence Controls */}
              <div className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-blue-400" />
                    <h2 className="text-sm font-display font-bold text-white">
                      Motor de Estratégia & Filtros de Confluência
                    </h2>
                  </div>

                  <button
                    onClick={() => setActiveTab('CATALOG')}
                    className="text-xs text-blue-400 hover:text-blue-300 font-medium cursor-pointer"
                  >
                    Ver Assertividade →
                  </button>
                </div>

                {/* MHI Variant & Mode */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">
                      Variação MHI
                    </label>
                    <div className="grid grid-cols-3 gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg">
                      {(['MHI_1', 'MHI_2', 'MHI_3'] as MHIVariant[]).map((v) => (
                        <button
                          key={v}
                          onClick={() =>
                            setStrategyConfig((prev) => ({ ...prev, mhiVariant: v }))
                          }
                          className={`py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                            strategyConfig.mhiVariant === v
                              ? 'bg-blue-600 text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {v.replace('_', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">
                      Contagem de Velas
                    </label>
                    <div className="grid grid-cols-2 gap-1 p-1 bg-[#0B0F17] border border-slate-800 rounded-lg">
                      {(['MINORIA', 'MAIORIA'] as MHIMode[]).map((m) => (
                        <button
                          key={m}
                          onClick={() =>
                            setStrategyConfig((prev) => ({ ...prev, mhiMode: m }))
                          }
                          className={`py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                            strategyConfig.mhiMode === m
                              ? 'bg-blue-600 text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {m === 'MINORIA' ? 'Minoria' : 'Maioria'}
                        </button>
                      ))}
                    </div>
                  </div>
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
              </div>

              {/* Right 7 Columns: Live Order History Table */}
              <div className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-lg overflow-hidden flex flex-col">
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
                        {orders.map((ord) => {
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
                                  <span className="text-red-400">
                                    LOSS (-R$ {Math.abs(ord.profit).toFixed(2)})
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Connect IQ Option Modal */}
      <ConnectModal
        isOpen={isConnectModalOpen}
        onClose={() => setIsConnectModalOpen(false)}
        status={connectionStatus}
        onConnect={handleConnectIQ}
        onVerify2FA={handleVerify2FA}
        onDisconnect={handleDisconnectIQ}
      />
    </div>
  );
}
