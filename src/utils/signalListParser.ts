import { IQAsset, ScheduledSignal, TimeframeSeconds } from '../types/trading';

/**
 * Standard IQ Option Asset Ticker Mapper
 */
const TICKER_MAP: Record<string, { id: number; ticker: string }> = {
  // Normal Market (15 pairs)
  'EURUSD': { id: 1, ticker: 'EUR/USD' },
  'EUR/USD': { id: 1, ticker: 'EUR/USD' },
  'GBPUSD': { id: 2, ticker: 'GBP/USD' },
  'GBP/USD': { id: 2, ticker: 'GBP/USD' },
  'EURJPY': { id: 3, ticker: 'EUR/JPY' },
  'EUR/JPY': { id: 3, ticker: 'EUR/JPY' },
  'USDJPY': { id: 4, ticker: 'USD/JPY' },
  'USD/JPY': { id: 4, ticker: 'USD/JPY' },
  'AUDCAD': { id: 5, ticker: 'AUD/CAD' },
  'AUD/CAD': { id: 5, ticker: 'AUD/CAD' },
  'GBPJPY': { id: 6, ticker: 'GBP/JPY' },
  'GBP/JPY': { id: 6, ticker: 'GBP/JPY' },
  'EURGBP': { id: 7, ticker: 'EUR/GBP' },
  'EUR/GBP': { id: 7, ticker: 'EUR/GBP' },
  'AUDUSD': { id: 8, ticker: 'AUD/USD' },
  'AUD/USD': { id: 8, ticker: 'AUD/USD' },
  'USDCAD': { id: 9, ticker: 'USD/CAD' },
  'USD/CAD': { id: 9, ticker: 'USD/CAD' },
  'USDCHF': { id: 10, ticker: 'USD/CHF' },
  'USD/CHF': { id: 10, ticker: 'USD/CHF' },
  'EURAUD': { id: 11, ticker: 'EUR/AUD' },
  'EUR/AUD': { id: 11, ticker: 'EUR/AUD' },
  'EURCAD': { id: 12, ticker: 'EUR/CAD' },
  'EUR/CAD': { id: 12, ticker: 'EUR/CAD' },
  'GBPCHF': { id: 13, ticker: 'GBP/CHF' },
  'GBP/CHF': { id: 13, ticker: 'GBP/CHF' },
  'AUDJPY': { id: 14, ticker: 'AUD/JPY' },
  'AUD/JPY': { id: 14, ticker: 'AUD/JPY' },
  'NZDUSD': { id: 15, ticker: 'NZD/USD' },
  'NZ/DUSD': { id: 15, ticker: 'NZD/USD' },

  // OTC Market (15 pairs)
  'EURUSD-OTC': { id: 76, ticker: 'EUR/USD (OTC)' },
  'EURUSD_OTC': { id: 76, ticker: 'EUR/USD (OTC)' },
  'EURUSDOTC': { id: 76, ticker: 'EUR/USD (OTC)' },
  'EUR/USD (OTC)': { id: 76, ticker: 'EUR/USD (OTC)' },
  'EUR/USD-OTC': { id: 76, ticker: 'EUR/USD (OTC)' },
  'GBPUSD-OTC': { id: 77, ticker: 'GBP/USD (OTC)' },
  'GBPUSD_OTC': { id: 77, ticker: 'GBP/USD (OTC)' },
  'GBPUSDOTC': { id: 77, ticker: 'GBP/USD (OTC)' },
  'GBP/USD (OTC)': { id: 77, ticker: 'GBP/USD (OTC)' },
  'USDCHF-OTC': { id: 78, ticker: 'USD/CHF (OTC)' },
  'USDCHF_OTC': { id: 78, ticker: 'USD/CHF (OTC)' },
  'USD/CHF (OTC)': { id: 78, ticker: 'USD/CHF (OTC)' },
  'EURJPY-OTC': { id: 79, ticker: 'EUR/JPY (OTC)' },
  'EURJPY_OTC': { id: 79, ticker: 'EUR/JPY (OTC)' },
  'EUR/JPY (OTC)': { id: 79, ticker: 'EUR/JPY (OTC)' },
  'AUDCAD-OTC': { id: 80, ticker: 'AUD/CAD (OTC)' },
  'AUDCAD_OTC': { id: 80, ticker: 'AUD/CAD (OTC)' },
  'AUD/CAD (OTC)': { id: 80, ticker: 'AUD/CAD (OTC)' },
  'USDBRL': { id: 81, ticker: 'USD/BRL (OTC)' },
  'USDBRL-OTC': { id: 81, ticker: 'USD/BRL (OTC)' },
  'USDBRL_OTC': { id: 81, ticker: 'USD/BRL (OTC)' },
  'USD/BRL': { id: 81, ticker: 'USD/BRL (OTC)' },
  'USD/BRL (OTC)': { id: 81, ticker: 'USD/BRL (OTC)' },
  'GBPJPY-OTC': { id: 82, ticker: 'GBP/JPY (OTC)' },
  'GBPJPY_OTC': { id: 82, ticker: 'GBP/JPY (OTC)' },
  'GBP/JPY (OTC)': { id: 82, ticker: 'GBP/JPY (OTC)' },
  'EURGBP-OTC': { id: 83, ticker: 'EUR/GBP (OTC)' },
  'EURGBP_OTC': { id: 83, ticker: 'EUR/GBP (OTC)' },
  'EUR/GBP (OTC)': { id: 83, ticker: 'EUR/GBP (OTC)' },
  'USDJPY-OTC': { id: 84, ticker: 'USD/JPY (OTC)' },
  'USDJPY_OTC': { id: 84, ticker: 'USD/JPY (OTC)' },
  'USD/JPY (OTC)': { id: 84, ticker: 'USD/JPY (OTC)' },
  'NZDUSD-OTC': { id: 85, ticker: 'NZD/USD (OTC)' },
  'NZDUSD_OTC': { id: 85, ticker: 'NZD/USD (OTC)' },
  'NZD/USD (OTC)': { id: 85, ticker: 'NZD/USD (OTC)' },
  'AUDUSD-OTC': { id: 86, ticker: 'AUD/USD (OTC)' },
  'AUDUSD_OTC': { id: 86, ticker: 'AUD/USD (OTC)' },
  'AUD/USD (OTC)': { id: 86, ticker: 'AUD/USD (OTC)' },
  'USDCAD-OTC': { id: 87, ticker: 'USD/CAD (OTC)' },
  'USDCAD_OTC': { id: 87, ticker: 'USD/CAD (OTC)' },
  'USD/CAD (OTC)': { id: 87, ticker: 'USD/CAD (OTC)' },
  'EURCAD-OTC': { id: 88, ticker: 'EUR/CAD (OTC)' },
  'EURCAD_OTC': { id: 88, ticker: 'EUR/CAD (OTC)' },
  'EUR/CAD (OTC)': { id: 88, ticker: 'EUR/CAD (OTC)' },
  'GBPAUD-OTC': { id: 89, ticker: 'GBP/AUD (OTC)' },
  'GBPAUD_OTC': { id: 89, ticker: 'GBP/AUD (OTC)' },
  'GBP/AUD (OTC)': { id: 89, ticker: 'GBP/AUD (OTC)' },
  'USDMXN-OTC': { id: 90, ticker: 'USD/MXN (OTC)' },
  'USDMXN_OTC': { id: 90, ticker: 'USD/MXN (OTC)' },
  'USD/MXN (OTC)': { id: 90, ticker: 'USD/MXN (OTC)' },
};

/**
 * Calculates unix timestamp for a time string (HH:MM or HH:MM:SS) relative to now
 */
export function calculateTargetTimestamp(timeStr: string, nowSec = Math.floor(Date.now() / 1000)): number {
  const parts = timeStr.split(':').map((p) => parseInt(p, 10));
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) {
    return nowSec + 300;
  }

  const hours = parts[0];
  const minutes = parts[1];
  const seconds = parts.length >= 3 && !isNaN(parts[2]) ? parts[2] : 0;

  const now = new Date(nowSec * 1000);
  const target = new Date(now);
  target.setHours(hours, minutes, seconds, 0);

  let targetSec = Math.floor(target.getTime() / 1000);

  // If the target time is already more than 10 minutes in the past today, assume it belongs to tomorrow
  if (targetSec < nowSec - 600) {
    target.setDate(target.getDate() + 1);
    targetSec = Math.floor(target.getTime() / 1000);
  }

  return targetSec;
}

/**
 * Parses raw text containing a list of trading signals into structured ScheduledSignal[]
 */
export function parseSignalList(
  rawText: string,
  nowSec = Math.floor(Date.now() / 1000)
): { validSignals: ScheduledSignal[]; invalidLines: string[] } {
  const lines = rawText.split('\n');
  const validSignals: ScheduledSignal[] = [];
  const invalidLines: string[] = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
      return;
    }

    // Normalizing separators: semicolon, comma, tab, multiple spaces -> single space
    const sanitized = trimmed
      .replace(/;/g, ' ')
      .replace(/,/g, ' ')
      .replace(/\t/g, ' ')
      .replace(/\s+/g, ' ');

    const tokens = sanitized.split(' ');
    if (tokens.length < 3) {
      invalidLines.push(trimmed);
      return;
    }

    let timeframe: TimeframeSeconds = 300; // default M5
    let direction: 'CALL' | 'PUT' | null = null;
    let timeStr = '';
    let assetMatch: { id: number; ticker: string } | null = null;

    for (const token of tokens) {
      const upper = token.toUpperCase().replace(/[()]/g, '');

      // Timeframe check: M1, M5, M15
      if (upper === 'M1' || upper === '1M' || upper === '1MIN' || upper === '60S') {
        timeframe = 60;
        continue;
      }
      if (upper === 'M5' || upper === '5M' || upper === '5MIN' || upper === '300S') {
        timeframe = 300;
        continue;
      }
      if (upper === 'M15' || upper === '15M' || upper === '15MIN' || upper === '900S') {
        timeframe = 900;
        continue;
      }

      // Direction check: CALL, PUT, COMPRA, VENDA, ACIMA, ABAIXO, VERDE, VERMELHA
      if (
        upper === 'CALL' ||
        upper === 'COMPRA' ||
        upper === 'BUY' ||
        upper === 'ACIMA' ||
        upper === 'ALTA' ||
        upper === 'VERDE'
      ) {
        direction = 'CALL';
        continue;
      }
      if (
        upper === 'PUT' ||
        upper === 'VENDA' ||
        upper === 'SELL' ||
        upper === 'ABAIXO' ||
        upper === 'BAIXA' ||
        upper === 'VERMELHA'
      ) {
        direction = 'PUT';
        continue;
      }

      // Time format check: HH:MM:SS or HH:MM
      if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(token)) {
        timeStr = token.length === 5 ? `${token}:00` : token;
        continue;
      }

      // Asset match check
      const cleanUpper = upper.replace(/\//g, '').replace(/\s/g, '');
      const mapped =
        TICKER_MAP[upper] ||
        TICKER_MAP[cleanUpper] ||
        TICKER_MAP[`${cleanUpper}-OTC`] ||
        TICKER_MAP[`${upper}-OTC`];
      if (mapped) {
        assetMatch = mapped;
        continue;
      }

      // Check if it's a known pair with OTC suffix
      if (cleanUpper.endsWith('OTC')) {
        const base = cleanUpper.replace('OTC', '');
        const matchedBase = TICKER_MAP[`${base}-OTC`] || TICKER_MAP[base];
        if (matchedBase) {
          assetMatch = matchedBase;
          continue;
        }
      }
    }

    if (!direction || !timeStr || !assetMatch) {
      invalidLines.push(trimmed);
      return;
    }

    const targetTimestamp = calculateTargetTimestamp(timeStr, nowSec);

    validSignals.push({
      id: `sig_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`,
      rawText: trimmed,
      ticker: assetMatch.ticker,
      assetId: assetMatch.id,
      timeframe,
      timeStr,
      targetTimestamp,
      direction,
      status: 'PENDING',
      enabled: true,
    });
  });

  // Sort chronologically by target time
  validSignals.sort((a, b) => a.targetTimestamp - b.targetTimestamp);

  return { validSignals, invalidLines };
}

/**
 * Example Brazilian VIP IQ Option Signal Lists (with current and upcoming times for immediate test)
 */
export function generateSampleSignalList(nowSec = Math.floor(Date.now() / 1000)): string {
  const d = new Date(nowSec * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');

  // Generate 5 realistic signals spaced by 2 and 5 minutes from right now
  const times: string[] = [];
  for (let offsetMinutes of [2, 5, 8, 12, 17]) {
    const future = new Date(d.getTime() + offsetMinutes * 60 * 1000);
    times.push(`${pad(future.getHours())}:${pad(future.getMinutes())}:00`);
  }

  return `# LISTA DE SINAIS VIP IQ OPTION — M1 / M5 (GALE 1 E GALE 2)
# Formato padrão: TIMEFRAME;ATIVO;HORARIO;DIRECAO

M1;EURUSD;${times[0]};CALL
M5;EURUSD-OTC;${times[1]};PUT
M1;GBPUSD;${times[2]};CALL
M5;USDBRL-OTC;${times[3]};CALL
M5;USDJPY;${times[4]};PUT`;
}
