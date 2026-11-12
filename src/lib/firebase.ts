import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type { Order, TradeOrder, TechnicalSnapshot } from '../types/trading';

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// CRITICAL: Initialize Firestore with specific database ID from config
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface LossDiagnosis {
  primaryFactor:
    | 'CONTRA_TENDENCIA'
    | 'EXAUSTAO_RSI'
    | 'PRESSAO_VOLUME_CONTRARIA'
    | 'REJEICAO_SUPORTE_RESISTENCIA'
    | 'ESTAGNACAO_DOJI'
    | 'VOLATILIDADE_ANOMALA'
    | 'REVERSAO_FLUXO';
  title: string;
  diagnosis: string;
  recommendation: string;
  indicatorSnap?: {
    rsi?: number;
    emaTrend?: string;
    bullPower?: number;
    bearPower?: number;
    atrPercent?: number;
    bbPosition?: string;
  };
}

/**
 * Technical Post-Mortem Diagnostics for lost orders
 * Evaluates why an entry failed based on price action and indicator confluence
 */
export function diagnoseLostTrade(
  order: TradeOrder,
  snapshot?: TechnicalSnapshot
): LossDiagnosis {
  const isCall = order.direction === 'CALL';
  const entryPrice = order.openPrice || 1;
  const exitPrice = order.closePrice ?? entryPrice;
  const priceDelta = exitPrice - entryPrice;
  const isVerySmallDelta = Math.abs(priceDelta) < 0.00004;

  // 1. Doji / Stagnant market
  if (isVerySmallDelta) {
    return {
      primaryFactor: 'ESTAGNACAO_DOJI',
      title: 'Empate Técnico ou Falta de Liquidez (Doji)',
      diagnosis: `A vela encerrou praticamente no mesmo preço de abertura (variação de apenas ${(priceDelta * 10000).toFixed(2)} pips). Sem amplitude suficiente para superar o spread.`,
      recommendation:
        'Ative o Filtro ATR com limite mínimo de 0.015% ou ative a opção "Bloquear em Doji" para evitar quadrantes sem volume.',
      indicatorSnap: snapshot ? {
        rsi: snapshot.rsi14,
        atrPercent: snapshot.atrPercent,
      } : undefined,
    };
  }

  // 2. Market Sentiment / Opposing Volume Pressure
  if (snapshot?.marketSentiment) {
    const { bullPower, bearPower } = snapshot.marketSentiment;
    if (isCall && bearPower >= 58) {
      return {
        primaryFactor: 'PRESSAO_VOLUME_CONTRARIA',
        title: 'Forte Pressão Vendedora Institucional (Ursos Dominantes)',
        diagnosis: `A entrada foi CALL, mas o Sentimento de Mercado indicava ${bearPower}% de pressão vendedora (Ursos) contra apenas ${bullPower}% de touros. O volume institucional empurrou o preço para baixo.`,
        recommendation:
          'Mantenha o "Filtro de Sentimento de Mercado" ATIVO com limiar em 55% ou 60% para bloquear compras quando o volume vendedor for dominante.',
        indicatorSnap: {
          bullPower,
          bearPower,
          rsi: snapshot.rsi14,
        },
      };
    }
    if (!isCall && bullPower >= 58) {
      return {
        primaryFactor: 'PRESSAO_VOLUME_CONTRARIA',
        title: 'Forte Pressão Compradora Institucional (Touros Dominantes)',
        diagnosis: `A entrada foi PUT, mas o Sentimento de Mercado apontava ${bullPower}% de força compradora (Touros). Os compradores absorveram as vendas e causaram rompimento altista.`,
        recommendation:
          'Mantenha o "Filtro de Sentimento de Mercado" ATIVO para impedir vendas quando a força compradora estiver acima de 55%.',
        indicatorSnap: {
          bullPower,
          bearPower,
          rsi: snapshot.rsi14,
        },
      };
    }
  }

  // 3. Against Macro Trend (EMA 200)
  if (snapshot?.macroTrend) {
    if (isCall && snapshot.macroTrend === 'BEARISH') {
      return {
        primaryFactor: 'CONTRA_TENDENCIA',
        title: 'Operação Contra a Tendência Macro (EMA 200 Baixista)',
        diagnosis:
          'Entrada de CALL realizada enquanto o preço estava abaixo da média institucional EMA 200. A força estrutural do mercado era de baixa.',
        recommendation:
          'Ative a regra "Macro Tendência EMA 200: Bloqueio Rígido" no drawer de estratégias para jamais comprar abaixo da média de 200 períodos.',
        indicatorSnap: {
          emaTrend: snapshot.emaTrend,
          rsi: snapshot.rsi14,
        },
      };
    }
    if (!isCall && snapshot.macroTrend === 'BULLISH') {
      return {
        primaryFactor: 'CONTRA_TENDENCIA',
        title: 'Operação Contra a Tendência Macro (EMA 200 Altista)',
        diagnosis:
          'Entrada de PUT realizada com cotação acima da EMA 200. A tendência maior era de alta acelerada, anulando o padrão probabilístico.',
        recommendation:
          'Ative o filtro "Macro Tendência EMA 200" para restringir ordens PUT quando o mercado estiver em fluxo institucional de alta.',
        indicatorSnap: {
          emaTrend: snapshot.emaTrend,
          rsi: snapshot.rsi14,
        },
      };
    }
  }

  // 4. RSI Overbought / Oversold Exhaustion
  if (snapshot?.rsi14) {
    if (isCall && snapshot.rsi14 > 72) {
      return {
        primaryFactor: 'EXAUSTAO_RSI',
        title: 'Entrada em Topo Esticado (RSI em Sobrecompra)',
        diagnosis: `CALL executado com RSI em ${snapshot.rsi14.toFixed(1)} (acima de 70). O mercado já estava esticado e sofreu correção imediata de lucros.`,
        recommendation:
          'Configure o Filtro RSI no modo "Reversão" com limite em 70 para bloquear CALLs em regiões de saturação compradora.',
        indicatorSnap: {
          rsi: snapshot.rsi14,
        },
      };
    }
    if (!isCall && snapshot.rsi14 < 28) {
      return {
        primaryFactor: 'EXAUSTAO_RSI',
        title: 'Entrada em Fundo Esticado (RSI em Sobrevenda)',
        diagnosis: `PUT executado com RSI em ${snapshot.rsi14.toFixed(1)} (abaixo de 30). O preço bateu em exaustão vendedora e repicou para cima.`,
        recommendation:
          'Configure o Filtro RSI no modo "Reversão" com limite em 30 para impedir PUTs em fundos saturados.',
        indicatorSnap: {
          rsi: snapshot.rsi14,
        },
      };
    }
  }

  // 5. Support & Resistance rejection
  if (snapshot?.nearResistance && isCall) {
    return {
      primaryFactor: 'REJEICAO_SUPORTE_RESISTENCIA',
      title: 'Bateu em Zona de Resistência (Topo)',
      diagnosis:
        'A ordem de compra foi disparada exatamente quando o preço testava uma barreira de resistência, gerando rejeição imediata da vela.',
      recommendation:
        'Habilite o "Filtro de Suporte e Resistência Automático" para que o robô pause compras próximas a topos fortes.',
      indicatorSnap: {
        bbPosition: snapshot.bbPosition,
      },
    };
  }
  if (snapshot?.nearSupport && !isCall) {
    return {
      primaryFactor: 'REJEICAO_SUPORTE_RESISTENCIA',
      title: 'Bateu em Zona de Suporte (Fundo)',
      diagnosis:
        'A ordem de venda colidiu diretamente contra um suporte testado anteriormente, acionando defesa de compradores.',
      recommendation:
        'Habilite o "Filtro de Suporte e Resistência Automático" para pausar vendas próximas a suportes históricos.',
      indicatorSnap: {
        bbPosition: snapshot.bbPosition,
      },
    };
  }

  // 6. Default Flow Reversal
  return {
    primaryFactor: 'REVERSAO_FLUXO',
    title: 'Reversão de Ciclo / Quebra de Padrão Probabilístico',
    diagnosis:
      'O ciclo probabilístico sofreu inversão momentânea na formação da vela de expiração. A catalogação estatística sofreu desvio transitório.',
    recommendation:
      'Utilize gestão de Gale 1 ou filtre ativos com assertividade mínima de 85% pelo catalogador em tempo real.',
    indicatorSnap: snapshot ? {
      rsi: snapshot.rsi14,
      emaTrend: snapshot.emaTrend,
      atrPercent: snapshot.atrPercent,
    } : undefined,
  };
}

// Authentication Helpers
export async function loginWithGoogle(): Promise<User> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    await syncUserProfile(result.user);
    return result.user;
  } catch (error) {
    console.error('Google Sign-In Error:', error);
    throw error;
  }
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

export function subscribeToAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

// User Profile & Session Persistence
export async function syncUserProfile(user: User): Promise<void> {
  const path = `users/${user.uid}`;
  try {
    const userRef = doc(db, 'users', user.uid);
    const existingSnap = await getDoc(userRef);
    const nowIso = new Date().toISOString();

    if (!existingSnap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || 'Trader',
        photoURL: user.photoURL || '',
        createdAt: nowIso,
        lastLoginAt: nowIso,
        accountType: 'PRACTICE',
      });
    } else {
      await setDoc(
        userRef,
        {
          lastLoginAt: nowIso,
          displayName: user.displayName || existingSnap.data()?.displayName,
          photoURL: user.photoURL || existingSnap.data()?.photoURL,
        },
        { merge: true }
      );
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// Order Persistence with Loss Diagnostic
export async function persistOrderToFirestore(
  order: TradeOrder,
  userId: string,
  snapshot?: TechnicalSnapshot
): Promise<void> {
  const path = `users/${userId}/orders/${order.id}`;
  try {
    const orderRef = doc(db, 'users', userId, 'orders', order.id);

    let lossDiagnosis: LossDiagnosis | null = null;
    if (order.status === 'LOSS' || (order as unknown as { status: string }).status === 'LOST') {
      lossDiagnosis = diagnoseLostTrade(order, snapshot);
    }

    const payload = {
      id: order.id,
      userId,
      assetId: order.assetId,
      assetTicker: order.assetTicker,
      ticker: order.assetTicker,
      direction: order.direction,
      amount: order.amount,
      payoutPercent: order.payoutPercent,
      timeframe: order.timeframe || 60,
      status: order.status,
      openPrice: order.openPrice,
      closePrice: order.closePrice ?? order.openPrice,
      profit: order.profit || 0,
      galeStep: order.galeStep ?? 0,
      sorosLevel: order.sorosLevel ?? 0,
      timestamp: order.timestamp,
      strategyLabel: order.strategyLabel || 'MHI',
      accountType: order.accountType || 'PRACTICE',
      lossDiagnosis: lossDiagnosis ? lossDiagnosis.diagnosis : (order.lossDiagnosis || null),
      lossFactor: lossDiagnosis ? lossDiagnosis.primaryFactor : (order.lossFactor || null),
      lossTitle: lossDiagnosis ? lossDiagnosis.title : (order.lossTitle || null),
      lossRecommendation: lossDiagnosis ? lossDiagnosis.recommendation : (order.lossRecommendation || null),
      indicatorSnap: lossDiagnosis?.indicatorSnap || (order.indicatorSnap || null),
      updatedAt: new Date().toISOString(),
    };

    await setDoc(orderRef, payload, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export function subscribeToUserOrders(
  userId: string,
  onOrders: (orders: TradeOrder[]) => void
) {
  const path = `users/${userId}/orders`;
  const ordersQuery = query(
    collection(db, 'users', userId, 'orders'),
    orderBy('timestamp', 'desc'),
    limit(100)
  );

  return onSnapshot(
    ordersQuery,
    (snapshot) => {
      const list: TradeOrder[] = [];
      snapshot.forEach((docItem) => {
        const data = docItem.data();
        list.push({
          id: data.id || docItem.id,
          assetId: data.assetId || 1,
          assetTicker: data.assetTicker || data.ticker || 'EUR/USD',
          direction: data.direction || 'CALL',
          amount: data.amount || 20,
          payoutPercent: data.payoutPercent || data.payout || 85,
          timeframe: data.timeframe || 60,
          status: data.status || 'OPEN',
          openPrice: data.openPrice ?? data.entryPrice ?? 1,
          closePrice: data.closePrice ?? data.exitPrice ?? 1,
          profit: data.profit || 0,
          galeStep: data.galeStep ?? data.galeLevel ?? 0,
          sorosLevel: data.sorosLevel ?? 0,
          timestamp: data.timestamp || Date.now(),
          strategyLabel: data.strategyLabel || '',
          accountType: data.accountType || 'PRACTICE',
          lossDiagnosis: data.lossDiagnosis,
          lossFactor: data.lossFactor,
          lossTitle: data.lossTitle,
          lossRecommendation: data.lossRecommendation,
          indicatorSnap: data.indicatorSnap,
        });
      });
      onOrders(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, path);
    }
  );
}

export async function deleteUserOrderFromFirestore(
  userId: string,
  orderId: string
): Promise<void> {
  const path = `users/${userId}/orders/${orderId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'orders', orderId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// Quote Snapshots persistence
export async function persistQuoteSnapshot(
  ticker: string,
  price: number,
  bullPower = 50,
  bearPower = 50,
  atrPercent = 0.05
): Promise<void> {
  const quoteId = `${ticker.replace('/', '_')}_${Date.now()}`;
  const path = `quotes/${quoteId}`;
  try {
    await setDoc(doc(db, 'quotes', quoteId), {
      id: quoteId,
      ticker,
      price,
      timestamp: Date.now(),
      bullPower,
      bearPower,
      atrPercent,
    });
  } catch (err) {
    // Non-blocking quote save
    console.warn('Could not persist quote snapshot:', err);
  }
}
