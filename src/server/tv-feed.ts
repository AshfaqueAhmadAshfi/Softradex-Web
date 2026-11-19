import WebSocket from 'ws';
import crypto from 'node:crypto';

export interface SymbolSpec {
  symbol: string;
  alts: string[];
  label: string;
  pair: string;
  icon: string;
  unit: string;
  kind: 'metals' | 'crypto' | 'forex' | 'energy' | 'indices' | 'stocks';
  digits?: number;
}

export const CATALOG: SymbolSpec[] = [
  { symbol: 'XAUUSDm', alts: ['XAUUSDm', 'XAUUSD247m', 'XAUUSD', 'GOLD'], label: 'GOLD', pair: 'USD', icon: '🟡', unit: 'oz', kind: 'metals', digits: 2 },
  { symbol: 'XAGUSDm', alts: ['XAGUSDm', 'XAGUSD'], label: 'SILVER', pair: 'USD', icon: '⚪', unit: 'oz', kind: 'metals', digits: 3 },
  { symbol: 'XAUEURm', alts: ['XAUEURm', 'XAUEUR'], label: 'GOLD', pair: 'EUR', icon: '🟡', unit: 'oz', kind: 'metals', digits: 2 },
  { symbol: 'XAUGBPm', alts: ['XAUGBPm', 'XAUGBP'], label: 'GOLD', pair: 'GBP', icon: '🟡', unit: 'oz', kind: 'metals', digits: 2 },
  { symbol: 'BTCUSDTm', alts: ['BTCUSDTm', 'BTCUSDm', 'BTCUSD', 'BTCUSDT'], label: 'BTC', pair: 'USDT', icon: '🟠', unit: 'BTC', kind: 'crypto', digits: 2 },
  { symbol: 'ETHUSDm', alts: ['ETHUSDm', 'ETHUSDTm', 'ETHUSD', 'ETHUSDT'], label: 'ETH', pair: 'USD', icon: '🔷', unit: 'ETH', kind: 'crypto', digits: 2 },
  { symbol: 'SOLUSDm', alts: ['SOLUSDm', 'SOLUSDTm', 'SOLUSD', 'SOLUSDT'], label: 'SOL', pair: 'USD', icon: '🟣', unit: 'SOL', kind: 'crypto', digits: 2 },
  { symbol: 'XRPUSDm', alts: ['XRPUSDm', 'XRPUSDTm', 'XRPUSD', 'XRPUSDT'], label: 'XRP', pair: 'USD', icon: '⚫', unit: 'XRP', kind: 'crypto', digits: 4 },
  { symbol: 'DOGEUSDm', alts: ['DOGEUSDm', 'DOGEUSDTm', 'DOGEUSD', 'DOGEUSDT'], label: 'DOGE', pair: 'USD', icon: '🐕', unit: 'DOGE', kind: 'crypto', digits: 5 },
  { symbol: 'BNBUSDm', alts: ['BNBUSDm', 'BNBUSDTm', 'BNBUSD', 'BNBUSDT'], label: 'BNB', pair: 'USD', icon: '💛', unit: 'BNB', kind: 'crypto', digits: 2 },
  { symbol: 'ADAUSDm', alts: ['ADAUSDm', 'ADAUSDTm', 'ADAUSD'], label: 'ADA', pair: 'USD', icon: '🔵', unit: 'ADA', kind: 'crypto', digits: 4 },
  { symbol: 'LINKUSDm', alts: ['LINKUSDm', 'LINKUSDTm', 'LINKUSD'], label: 'LINK', pair: 'USD', icon: '🔗', unit: 'LINK', kind: 'crypto', digits: 3 },
  { symbol: 'AVAXUSDm', alts: ['AVAXUSDm', 'AVAXUSDTm', 'AVAXUSD'], label: 'AVAX', pair: 'USD', icon: '🔺', unit: 'AVAX', kind: 'crypto', digits: 2 },
  { symbol: 'EURUSDm', alts: ['EURUSDm', 'EURUSD'], label: 'EUR', pair: 'USD', icon: '💶', unit: 'lots', kind: 'forex', digits: 5 },
  { symbol: 'GBPUSDm', alts: ['GBPUSDm', 'GBPUSD'], label: 'GBP', pair: 'USD', icon: '💷', unit: 'lots', kind: 'forex', digits: 5 },
  { symbol: 'USDJPYm', alts: ['USDJPYm', 'USDJPY'], label: 'USD', pair: 'JPY', icon: '💴', unit: 'lots', kind: 'forex', digits: 3 },
  { symbol: 'USDCHFm', alts: ['USDCHFm', 'USDCHF'], label: 'USD', pair: 'CHF', icon: '🇨🇭', unit: 'lots', kind: 'forex', digits: 5 },
  { symbol: 'AUDUSDm', alts: ['AUDUSDm', 'AUDUSD'], label: 'AUD', pair: 'USD', icon: '🇦🇺', unit: 'lots', kind: 'forex', digits: 5 },
  { symbol: 'NZDUSDm', alts: ['NZDUSDm', 'NZDUSD'], label: 'NZD', pair: 'USD', icon: '🇳🇿', unit: 'lots', kind: 'forex', digits: 5 },
  { symbol: 'USDCADm', alts: ['USDCADm', 'USDCAD'], label: 'USD', pair: 'CAD', icon: '🇨🇦', unit: 'lots', kind: 'forex', digits: 5 },
  { symbol: 'EURJPYm', alts: ['EURJPYm', 'EURJPY'], label: 'EUR', pair: 'JPY', icon: '💶', unit: 'lots', kind: 'forex', digits: 3 },
  { symbol: 'GBPJPYm', alts: ['GBPJPYm', 'GBPJPY'], label: 'GBP', pair: 'JPY', icon: '💷', unit: 'lots', kind: 'forex', digits: 3 },
  { symbol: 'USOILm', alts: ['USOILm', 'XTIUSDm', 'USOIL', 'XTIUSD'], label: 'WTI OIL', pair: 'USD', icon: '🛢️', unit: 'bbl', kind: 'energy', digits: 2 },
  { symbol: 'UKOILm', alts: ['UKOILm', 'XBRUSDm', 'UKOIL', 'XBRUSD'], label: 'BRENT', pair: 'USD', icon: '🛢️', unit: 'bbl', kind: 'energy', digits: 2 },
  { symbol: 'USTECm', alts: ['USTECm', 'NAS100m', 'US100m', 'USTEC'], label: 'US100', pair: 'USD', icon: '📈', unit: 'index', kind: 'indices', digits: 2 },
  { symbol: 'US500m', alts: ['US500m', 'SPX500m', 'US500', 'SPXm'], label: 'US500', pair: 'USD', icon: '📊', unit: 'index', kind: 'indices', digits: 2 },
  { symbol: 'US30m', alts: ['US30m', 'DJ30m', 'US30', 'DJIm'], label: 'US30', pair: 'USD', icon: '🏛️', unit: 'index', kind: 'indices', digits: 2 },
  { symbol: 'DXY', alts: ['DXY', 'DXYm', 'USDX'], label: 'DXY', pair: 'INDEX', icon: '💵', unit: 'index', kind: 'indices', digits: 3 },
];

const EXPLICIT_TV: Record<string, string> = {
  XAUUSD: 'OANDA:XAUUSD',
  XAUUSD247: 'OANDA:XAUUSD',
  GOLD: 'OANDA:XAUUSD',
  XAGUSD: 'OANDA:XAGUSD',
  XAUEUR: 'OANDA:XAUEUR',
  XAUGBP: 'OANDA:XAUGBP',
  XAUAUD: 'OANDA:XAUAUD',
  USOIL: 'TVC:USOIL',
  UKOIL: 'TVC:UKOIL',
  XNGUSD: 'NYMEX:NG1!',
  USTEC: 'NASDAQ:NDX',
  NAS100: 'NASDAQ:NDX',
  US500: 'SP:SPX',
  US30: 'DJ:DJI',
  DXY: 'TVC:DXY',
  BTCUSDT: 'BINANCE:BTCUSDT',
  BTCUSD: 'BINANCE:BTCUSDT',
  ETHUSDT: 'BINANCE:ETHUSDT',
  ETHUSD: 'BINANCE:ETHUSDT',
  SOLUSDT: 'BINANCE:SOLUSDT',
  SOLUSD: 'BINANCE:SOLUSDT',
  XRPUSDT: 'BINANCE:XRPUSDT',
  XRPUSD: 'BINANCE:XRPUSDT',
  DOGEUSDT: 'BINANCE:DOGEUSDT',
  DOGEUSD: 'BINANCE:DOGEUSDT',
  BNBUSDT: 'BINANCE:BNBUSDT',
  BNBUSD: 'BINANCE:BNBUSDT',
  ADAUSDT: 'BINANCE:ADAUSDT',
  ADAUSD: 'BINANCE:ADAUSDT',
  LINKUSDT: 'BINANCE:LINKUSDT',
  LINKUSD: 'BINANCE:LINKUSDT',
  AVAXUSDT: 'BINANCE:AVAXUSDT',
  AVAXUSD: 'BINANCE:AVAXUSDT',
  EURUSD: 'OANDA:EURUSD',
  GBPUSD: 'OANDA:GBPUSD',
  USDJPY: 'OANDA:USDJPY',
  AUDUSD: 'OANDA:AUDUSD',
  USDCAD: 'OANDA:USDCAD',
  USDCHF: 'OANDA:USDCHF',
  NZDUSD: 'OANDA:NZDUSD',
  EURJPY: 'OANDA:EURJPY',
  GBPJPY: 'OANDA:GBPJPY',
  EURGBP: 'OANDA:EURGBP',
};

const RESOLUTIONS: Record<string, string> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '1h': '60',
  '4h': '240',
  '1d': 'D',
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export function resolveTvSymbol(symbol: string, target?: string | null): string {
  if (target && /^[A-Z0-9_]+:[A-Za-z0-9.!/_+-]{1,40}$/.test(target)) {
    return target;
  }
  const raw = String(symbol || '').trim().toUpperCase();
  if (!raw) return 'OANDA:XAUUSD';
  if (/^[A-Z0-9_]+:[A-Za-z0-9.!/_+-]{1,40}$/.test(raw)) return raw;
  const key = raw.replace(/[^A-Z0-9]/g, '');
  if (EXPLICIT_TV[key]) return EXPLICIT_TV[key];
  const base = key.endsWith('M') && !EXPLICIT_TV[key] ? key.slice(0, -1) : key;
  if (EXPLICIT_TV[base]) return EXPLICIT_TV[base];
  const spec = CATALOG.find(item => item.alts.some(a => a.toUpperCase() === key || a.toUpperCase() === base));
  if (spec?.kind === 'crypto') {
    return 'BINANCE:' + base.replace(/USDT?$/, '') + 'USDT';
  }
  if (base.endsWith('USDT') && base.length > 4) return 'BINANCE:' + base;
  if (/^[A-Z]{6}$/.test(base)) return 'OANDA:' + base;
  return 'OANDA:XAUUSD';
}

export function getSymbolMeta(symbol: string) {
  const s = String(symbol || 'XAUUSDm').trim();
  const spec = CATALOG.find(c => c.symbol === s || c.alts.includes(s)) || CATALOG[0];
  const digits = spec.digits ?? (spec.kind === 'forex' ? 5 : 2);
  const point = Math.pow(10, -digits);
  return {
    symbol: spec.symbol,
    label: spec.label,
    pair: spec.pair,
    icon: spec.icon,
    unit: spec.unit,
    kind: spec.kind,
    digits,
    point,
    description: `${spec.label} / ${spec.pair}`,
    source: 'public',
  };
}

export function getSymbolsPayload() {
  const rows = CATALOG.map(spec => getSymbolMeta(spec.symbol));
  return {
    available: true,
    connected: false,
    source: 'public',
    message: 'Public market feed (TradingView + Binance)',
    symbols: rows,
    count: rows.length,
    account: { login: 0, server: '' },
    server_time: Math.floor(Date.now() / 1000),
  };
}

const quoteCache = new Map<string, { exp: number; data: any }>();
const lastGoodQuoteCache = new Map<string, any>();
const inflightQuotes = new Map<string, Promise<any>>();
const barCache = new Map<string, { exp: number; count: number; bars: number[][]; updated: number }>();
const lastGoodBarCache = new Map<string, { count: number; bars: number[][]; updated: number }>();
const inflightBars = new Map<string, { count: number; promise: Promise<number[][]> }>();

const BAR_TTL_MS: Record<string, number> = {
  '1m': 5000,
  '5m': 8000,
  '15m': 18000,
  '1h': 35000,
  '4h': 60000,
  '1d': 600000,
};

type TvSessionHandler = (method: string, params: any[]) => void;

interface SharedTvConn {
  ws: WebSocket;
  ready: Promise<WebSocket>;
  sessions: Map<string, TvSessionHandler>;
}

let sharedConn: SharedTvConn | null = null;

function disposeSharedConn(conn: SharedTvConn): void {
  if (sharedConn === conn) sharedConn = null;
  for (const [id, fn] of conn.sessions.entries()) {
    conn.sessions.delete(id);
    try { fn('__closed__', [id]); } catch {}
  }
}

function getSharedTvConn(): SharedTvConn {
  if (sharedConn && (sharedConn.ws.readyState === WebSocket.OPEN || sharedConn.ws.readyState === WebSocket.CONNECTING)) {
    return sharedConn;
  }
  const sessions = new Map<string, TvSessionHandler>();
  let buf = '';
  const ws = new WebSocket('wss://data.tradingview.com/socket.io/websocket?from=chart', {
    origin: 'https://www.tradingview.com',
    headers: { 'User-Agent': UA },
    handshakeTimeout: 7000,
  });

  let resolveReady!: (sock: WebSocket) => void;
  let rejectReady!: (err: Error) => void;
  const ready = new Promise<WebSocket>((res, rej) => {
    resolveReady = res;
    rejectReady = rej;
  });
  ready.catch(() => {});

  const conn: SharedTvConn = { ws, ready, sessions };
  sharedConn = conn;

  ws.on('open', () => {
    try {
      ws.send(frameMsg(JSON.stringify({ m: 'set_auth_token', p: ['unauthorized_user_token'] })));
    } catch {}
    resolveReady(ws);
  });

  ws.on('message', (data: WebSocket.RawData) => {
    buf += data.toString('utf8');
    const parsed = parseFrames(buf);
    buf = parsed.rest;
    for (const payload of parsed.messages) {
      if (payload.startsWith('~h~')) {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(frameMsg(payload)); } catch {}
        }
        continue;
      }
      let msg: any;
      try { msg = JSON.parse(payload); } catch { continue; }
      const method = msg?.m;
      const params = msg?.p;
      if (!method || !Array.isArray(params)) continue;
      const sid = typeof params[0] === 'string' ? params[0] : '';
      if (sid && sessions.has(sid)) {
        try { sessions.get(sid)!(method, params); } catch {}
      } else if (['critical_error', 'protocol_error'].includes(method)) {
        for (const [id, fn] of sessions.entries()) {
          sessions.delete(id);
          try { fn(method, params); } catch {}
        }
      }
    }
  });

  ws.on('error', (err) => {
    rejectReady(err instanceof Error ? err : new Error(String(err)));
    disposeSharedConn(conn);
    try { ws.close(); } catch {}
  });

  ws.on('close', () => {
    rejectReady(new Error('TradingView shared WS closed'));
    disposeSharedConn(conn);
  });

  return conn;
}

function sendShared(conn: SharedTvConn, m: string, p: any[]): void {
  if (conn.ws.readyState === WebSocket.OPEN) {
    conn.ws.send(frameMsg(JSON.stringify({ m, p })));
  }
}

function num(v: any, d = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function isCryptoMarketSymbol(symbol: string, tv = ''): boolean {
  const upper = String(symbol || '').toUpperCase();
  return /^(BINANCE|COINBASE|BYBIT|OKX|CRYPTO):/i.test(tv) ||
    /(?:BTC|ETH|SOL|XRP|DOGE|BNB|ADA|LINK|AVAX|USDT|USDC(?!(?:HF|AD)))/i.test(upper);
}

function isScheduleMarketOpen(symbol: string, tv: string): boolean {
  if (isCryptoMarketSymbol(symbol, tv)) return true;
  const upper = String(symbol || '').toUpperCase();
  const now = new Date();
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  const min = now.getUTCMinutes();
  if (day === 6) return false;
  if (day === 0 && hour < 21) return false;
  if (day === 5 && (hour > 21 || (hour === 21 && min >= 55))) return false;
  const isBreakMarket = /XAU|XAG|GOLD|SILVER|OIL|TEC|US100|NAS|US500|US30|SPX|DJI/i.test(upper);
  if (isBreakMarket && hour === 21) return false;
  return true;
}

function buildQuoteObj(symbol: string, tv: string, raw: {
  price: number; open?: number; high?: number; low?: number; prevClose?: number;
  changePct?: number; changeAbs?: number; volume?: number; rating?: number;
  description?: string; exchange?: string; updateMode?: string;
  currentSession?: string; lpTime?: number; pricescale?: number; source?: string;
}) {
  const nowSec = Math.floor(Date.now() / 1000);
  const price = raw.price;
  const prevClose = num(raw.prevClose, num(raw.open, price));
  const changeAbs = raw.changeAbs != null && Number.isFinite(raw.changeAbs)
    ? raw.changeAbs : (prevClose > 0 ? price - prevClose : 0);
  const changePct = raw.changePct != null && Number.isFinite(raw.changePct)
    ? raw.changePct : (prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0);
  const isCrypto = isCryptoMarketSymbol(symbol, tv);
  const sess = String(raw.currentSession || (isCrypto ? 'market' : ''));
  // Cash-equity index feeds (NASDAQ:NDX, SP:SPX, DJ:DJI) report out_of_session outside 9:30-16:00 NY
  // even while broker CFD indices (USTECm/US500m/US30m) trade 23/5 Mon-Fri.
  const isCfdIndex = /^(NASDAQ|SP|DJ):/i.test(tv) || /^(USTEC|NAS100|US500|US30)/i.test(symbol);
  const explicitClosed = /^(holidays)$/i.test(sess) ||
    (!isCfdIndex && /^(out_of_session|closed)$/i.test(sess));
  const marketOpen = isCrypto ? true : (explicitClosed ? false : isScheduleMarketOpen(symbol, tv));
  const ps = num(raw.pricescale);
  const tvDigits = ps > 1 ? Math.max(0, Math.min(8, Math.round(Math.log10(ps)))) : undefined;
  const out = {
    ok: true,
    symbol: symbol || 'XAUUSDm',
    tv_symbol: tv,
    source: raw.source || 'TradingView',
    price,
    close: price,
    bid: price,
    ask: price,
    open: num(raw.open, price),
    high: num(raw.high, price),
    low: num(raw.low, price),
    change: Number(changePct.toFixed(4)),
    change_abs: Number(changeAbs.toFixed(6)),
    month_high: num(raw.high, price),
    month_low: num(raw.low, price),
    week52_high: num(raw.high, price),
    week52_low: num(raw.low, price),
    rating: raw.rating != null ? num(raw.rating) : (changePct >= 0.15 ? 0.35 : changePct <= -0.15 ? -0.35 : 0),
    description: String(raw.description || ''),
    exchange: String(raw.exchange || ''),
    update_mode: String(raw.updateMode || ''),
    current_session: sess,
    market_open: marketOpen,
    ...(tvDigits !== undefined ? { tv_digits: tvDigits } : {}),
    exchange_ts: num(raw.lpTime, nowSec),
    updated: nowSec,
  };
  return out;
}

async function fetchWsQuotesBatch(tvSymbols: string[], timeoutMs = 4500): Promise<Map<string, any>> {
  const unique = [...new Set(tvSymbols.filter(Boolean))];
  if (!unique.length) return new Map();
  const qs = 'qs_' + crypto.randomBytes(6).toString('hex');
  const collected = new Map<string, any>();
  const conn = getSharedTvConn();

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      conn.sessions.delete(qs);
      sendShared(conn, 'quote_delete_session', [qs]);
      resolve(collected);
    };

    const timer = setTimeout(finish, timeoutMs);

    conn.sessions.set(qs, (method, params) => {
      if (method === '__closed__' || method === 'critical_error' || method === 'protocol_error') {
        finish();
        return;
      }
      if (method === 'qsd' && params[1]?.n && params[1]?.v) {
        const tvSym = String(params[1].n);
        const prev = collected.get(tvSym) || {};
        collected.set(tvSym, { ...prev, ...params[1].v });
        if (unique.every((s) => num(collected.get(s)?.lp) > 0)) finish();
      }
    });

    conn.ready.then(() => {
      if (settled) return;
      sendShared(conn, 'quote_create_session', [qs]);
      sendShared(conn, 'quote_set_fields', [
        qs, 'lp', 'ch', 'chp', 'high_price', 'low_price', 'open_price', 'prev_close_price',
        'volume', 'lp_time', 'pricescale', 'current_session', 'description', 'exchange', 'update_mode',
      ]);
      sendShared(conn, 'quote_add_symbols', [qs, ...unique]);
    }).catch(finish);
  });
}

async function fetchPublicQuoteFallback(symbol: string, tv: string): Promise<any | null> {
  if (/^BINANCE:[A-Z0-9]+$/i.test(tv)) {
    const pair = tv.split(':')[1].toUpperCase();
    try {
      const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(pair)}`, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(4500),
      });
      if (res.ok) {
        const d: any = await res.json();
        const price = num(d?.lastPrice);
        if (price > 0) {
          return buildQuoteObj(symbol, tv, {
            price,
            open: num(d?.openPrice, price),
            high: num(d?.highPrice, price),
            low: num(d?.lowPrice, price),
            prevClose: num(d?.prevClosePrice, price),
            changePct: num(d?.priceChangePercent),
            changeAbs: num(d?.priceChange),
            currentSession: 'market',
            lpTime: Math.floor(Date.now() / 1000),
            source: 'TradingView',
          });
        }
      }
    } catch {}
  }

  try {
    const bars = await fetchWsCandles(tv, '5', 2);
    if (bars.length) {
      const last = bars[bars.length - 1];
      const prev = bars.length > 1 ? bars[bars.length - 2] : last;
      const price = num(last[4]);
      if (price > 0) {
        return buildQuoteObj(symbol, tv, {
          price,
          open: num(last[1], price),
          high: num(last[2], price),
          low: num(last[3], price),
          prevClose: num(prev[4], price),
          lpTime: Math.floor(num(last[0], Date.now()) / 1000),
          source: 'TradingView',
        });
      }
    }
  } catch {}

  const cached = lastGoodQuoteCache.get(tv);
  if (cached && num(cached.price) > 0) {
    return { ...cached, symbol: symbol || cached.symbol, updated: Math.floor(Date.now() / 1000) };
  }
  return null;
}

export async function fetchTvQuote(symbol: string, target?: string | null): Promise<any> {
  const tv = resolveTvSymbol(symbol, target);
  const now = Date.now();
  const hit = quoteCache.get(tv);
  if (hit && now < hit.exp) {
    return { ...hit.data, symbol: symbol || hit.data.symbol };
  }

  let pending = inflightQuotes.get(tv);
  if (!pending) {
    pending = (async () => {
      const batch = await fetchWsQuotesBatch([tv], 4500);
      const raw = batch.get(tv);
      let out: any = null;
      if (raw && num(raw.lp) > 0) {
        out = buildQuoteObj(symbol, tv, {
          price: num(raw.lp),
          open: num(raw.open_price, num(raw.lp)),
          high: num(raw.high_price, num(raw.lp)),
          low: num(raw.low_price, num(raw.lp)),
          prevClose: num(raw.prev_close_price, num(raw.lp)),
          changePct: raw.chp != null ? num(raw.chp) : undefined,
          changeAbs: raw.ch != null ? num(raw.ch) : undefined,
          volume: num(raw.volume),
          description: raw.description,
          exchange: raw.exchange,
          updateMode: raw.update_mode,
          currentSession: raw.current_session,
          lpTime: num(raw.lp_time),
          pricescale: num(raw.pricescale),
          source: 'TradingView',
        });
      } else {
        out = await fetchPublicQuoteFallback(symbol, tv);
      }
      if (!out || !(num(out.price) > 0)) {
        throw new Error(`TradingView returned no live quote for ${tv}`);
      }
      const ts = Date.now();
      quoteCache.set(tv, { exp: ts + 1800, data: out });
      lastGoodQuoteCache.set(tv, out);
      return out;
    })().finally(() => inflightQuotes.delete(tv));
    inflightQuotes.set(tv, pending);
  }
  const res = await pending;
  return { ...res, symbol: symbol || res.symbol };
}

function frameMsg(payload: string): string {
  return `~m~${payload.length}~m~${payload}`;
}

function parseFrames(buffer: string): { messages: string[]; rest: string } {
  const messages: string[] = [];
  let idx = 0;
  while (idx < buffer.length) {
    if (!buffer.startsWith('~m~', idx)) break;
    const end = buffer.indexOf('~m~', idx + 3);
    if (end < 0) break;
    const size = parseInt(buffer.slice(idx + 3, end), 10);
    if (!Number.isFinite(size) || size < 0) break;
    const start = end + 3;
    const finish = start + size;
    if (buffer.length < finish) break;
    messages.push(buffer.slice(start, finish));
    idx = finish;
  }
  return { messages, rest: buffer.slice(idx) };
}

function fetchWsCandles(tv: string, resolution: string, count: number): Promise<number[][]> {
  const session = 'cs_' + crypto.randomBytes(6).toString('hex');
  const rows = new Map<number, number[]>();
  const conn = getSharedTvConn();

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      conn.sessions.delete(session);
      sendShared(conn, 'chart_delete_session', [session]);
      if (rows.size > 0) {
        const sorted = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]);
        resolve(sorted.slice(-count));
      } else {
        reject(err || new Error(`No candles returned for ${tv}`));
      }
    };

    const timer = setTimeout(() => finish(new Error(`TradingView WS timeout for ${tv}`)), count > 1200 ? 18000 : 10000);

    conn.sessions.set(session, (method, params) => {
      if (method === '__closed__') {
        finish(new Error(`TradingView shared WS closed for ${tv}`));
        return;
      }
      if (['symbol_error', 'series_error', 'critical_error', 'protocol_error'].includes(method)) {
        finish(new Error(`TradingView candle error: ${JSON.stringify(params).slice(0, 160)}`));
        return;
      }
      if ((method === 'timescale_update' || method === 'du') && params[1]?.series_1?.s) {
        for (const item of params[1].series_1.s) {
          const v = item?.v;
          if (!Array.isArray(v) || v.length < 5) continue;
          const ts = num(v[0]);
          const o = num(v[1]), h = num(v[2]), l = num(v[3]), c = num(v[4]);
          const vol = v.length > 5 ? num(v[5]) : 0;
          if (ts <= 0 || Math.min(o, h, l, c) <= 0) continue;
          rows.set(ts, [Math.trunc(ts * 1000), o, h, l, c, vol]);
        }
      }
      if (method === 'series_completed' || rows.size >= count) {
        finish();
      }
    });

    conn.ready.then(() => {
      if (settled) return;
      sendShared(conn, 'chart_create_session', [session, '']);
      sendShared(conn, 'resolve_symbol', [
        session,
        'symbol_1',
        '=' + JSON.stringify({ symbol: tv, adjustment: 'splits', session: 'regular' }),
      ]);
      sendShared(conn, 'create_series', [session, 'series_1', 's1', 'symbol_1', resolution, count, '']);
    }).catch((err) => finish(err instanceof Error ? err : new Error(String(err))));
  });
}

export async function fetchTvCandles(symbol: string, tf = '5m', count = 500, target?: string | null) {
  const tv = resolveTvSymbol(symbol, target);
  const resCode = RESOLUTIONS[tf] || '5';
  const clampedCount = Math.min(5000, Math.max(50, Number(count) || 500));
  // Always fetch at least 500 bars for intraday shared cache so smaller callers
  // never truncate ChartIndicators' 500-bar view, while D1 outlook scans stay compact.
  const fetchCount = tf === '1d' && clampedCount <= 150 ? 120 : Math.max(clampedCount, 500);
  const key = `${tv}|${tf}`;
  const now = Date.now();
  const cached = barCache.get(key);
  if (cached && now < cached.exp && cached.bars.length >= clampedCount) {
    return {
      ok: true,
      symbol,
      tv_symbol: tv,
      tf,
      source: 'TradingView',
      updated: cached.updated,
      bars: cached.bars.slice(-clampedCount),
    };
  }
  let entry = inflightBars.get(key);
  if (entry && entry.count < clampedCount) {
    try { await entry.promise; } catch {}
    entry = undefined;
  }
  if (!entry) {
    const promise = fetchWsCandles(tv, resCode, fetchCount).finally(() => {
      const current = inflightBars.get(key);
      if (current && current.promise === promise) inflightBars.delete(key);
    });
    entry = { count: fetchCount, promise };
    inflightBars.set(key, entry);
  }
  let bars: number[][];
  let updated: number;
  try {
    bars = await entry.promise;
    updated = Math.floor(Date.now() / 1000);
    const ttl = BAR_TTL_MS[tf] ?? 10000;
    barCache.set(key, { exp: Date.now() + ttl, count: bars.length, bars, updated });
    lastGoodBarCache.set(key, { count: bars.length, bars, updated });
  } catch (err) {
    const fallback = lastGoodBarCache.get(key);
    if (!fallback || fallback.bars.length < Math.min(clampedCount, 50)) throw err;
    bars = fallback.bars;
    updated = fallback.updated;
  }
  return {
    ok: true,
    symbol,
    tv_symbol: tv,
    tf,
    source: 'TradingView',
    updated,
    bars: bars.slice(-clampedCount),
  };
}

export async function fetchTvSetups(symbol: string) {
  const q = await fetchTvQuote(symbol);
  const price = Number(q.price);
  const rawLevels: Array<[string, string, string, number, string]> = [
    ['BUY', 'Day Low', 'D1', q.low, "Today's low from the live TradingView quote"],
    ['SELL', 'Day High', 'D1', q.high, "Today's high from the live TradingView quote"],
    ['BUY', 'Month Low', '1M', q.month_low, 'Current month low from TradingView'],
    ['SELL', 'Month High', '1M', q.month_high, 'Current month high from TradingView'],
    ['BUY', '52W Low', '52W', q.week52_low, '52-week low from TradingView'],
    ['SELL', '52W High', '52W', q.week52_high, '52-week high from TradingView'],
  ];
  const levels: any[] = [];
  for (const [action, label, scope, level, reason] of rawLevels) {
    if (!level || level <= 0 || price <= 0) continue;
    let distance = Math.abs(price - level);
    if (distance <= Math.max(price * 0.00002, 0.00001)) distance = 0;
    const pct = (distance / price) * 100;
    const [status, status_cls] =
      distance <= price * 0.0006 ? ['AT LEVEL', 'trigger'] :
      pct <= 0.35 ? ['IMMINENT', 'imminent'] :
      pct <= 1.2 ? ['APPROACHING', 'approaching'] : ['PENDING', 'pending'];
    if (levels.some(old => Math.abs(old.price - level) <= Math.max(price * 0.0004, 0.01))) continue;
    levels.push({
      action,
      label,
      scope,
      price: level,
      distance: Number(distance.toFixed(4)),
      dist_pct: Number(pct.toFixed(3)),
      status,
      status_cls,
      reason,
      source: 'TradingView',
    });
  }
  levels.sort((a, b) => a.distance - b.distance);
  const top5 = levels.slice(0, 5).map((r, i) => ({ ...r, priority_rank: i + 1 }));
  return {
    ok: true,
    symbol,
    tv_symbol: q.tv_symbol,
    price,
    change: q.change,
    change_abs: q.change_abs,
    source: 'TradingView',
    updated: q.updated,
    levels: top5,
  };
}

const SEED_PRICES: Record<string, { price: number; change: number; high: number; low: number; rating: number }> = {
  XAUUSDm: { price: 3884.685, change: 0.18, high: 3923.09, low: 3867.67, rating: 0.18 },
  XAGUSDm: { price: 34.45, change: 0.25, high: 34.90, low: 33.95, rating: 0.15 },
  XAUEURm: { price: 3524.20, change: 0.22, high: 3560.0, low: 3490.0, rating: 0.18 },
  XAUGBPm: { price: 2940.10, change: 0.20, high: 2975.0, low: 2912.0, rating: 0.16 },
  BTCUSDTm: { price: 65358.0, change: 1.88, high: 66132.0, low: 62006.0, rating: 0.45 },
  ETHUSDm: { price: 1826.09, change: 3.22, high: 1860.0, low: 1755.0, rating: 0.48 },
  SOLUSDm: { price: 148.50, change: 2.15, high: 152.0, low: 143.0, rating: 0.35 },
  XRPUSDm: { price: 2.18, change: 1.40, high: 2.25, low: 2.10, rating: 0.25 },
  DOGEUSDm: { price: 0.168, change: 1.95, high: 0.175, low: 0.160, rating: 0.28 },
  BNBUSDm: { price: 598.40, change: 1.12, high: 608.0, low: 586.0, rating: 0.24 },
  ADAUSDm: { price: 0.695, change: 1.05, high: 0.720, low: 0.675, rating: 0.20 },
  LINKUSDm: { price: 14.85, change: 1.65, high: 15.30, low: 14.40, rating: 0.26 },
  AVAXUSDm: { price: 22.40, change: 1.50, high: 23.10, low: 21.70, rating: 0.24 },
  EURUSDm: { price: 1.10216, change: -0.31, high: 1.1073, low: 1.10198, rating: -0.28 },
  GBPUSDm: { price: 1.32126, change: -0.19, high: 1.3260, low: 1.3185, rating: -0.18 },
  USDJPYm: { price: 159.716, change: -0.08, high: 160.20, low: 159.30, rating: -0.10 },
  USDCHFm: { price: 0.83892, change: 0.42, high: 0.8415, low: 0.8350, rating: 0.30 },
  AUDUSDm: { price: 0.6773, change: -0.52, high: 0.6820, low: 0.6755, rating: -0.32 },
  NZDUSDm: { price: 0.6115, change: -0.28, high: 0.6160, low: 0.6090, rating: -0.20 },
  USDCADm: { price: 1.42704, change: 0.09, high: 1.4295, low: 1.4240, rating: 0.12 },
  EURJPYm: { price: 175.95, change: -0.22, high: 176.60, low: 175.20, rating: -0.18 },
  GBPJPYm: { price: 210.85, change: -0.18, high: 211.70, low: 209.90, rating: -0.16 },
  USOILm: { price: 88.56, change: -0.20, high: 89.40, low: 87.80, rating: -0.18 },
  UKOILm: { price: 91.40, change: -0.15, high: 92.20, low: 90.65, rating: -0.14 },
  USTECm: { price: 27943.7, change: -1.22, high: 28350.0, low: 27820.0, rating: -0.38 },
  US500m: { price: 5982.4, change: -0.35, high: 6025.0, low: 5955.0, rating: -0.20 },
  US30m: { price: 52347.5, change: 0.10, high: 52550.0, low: 52120.0, rating: 0.12 },
  DXY: { price: 104.85, change: 0.24, high: 105.10, low: 104.35, rating: 0.22 },
};

const WATCH_SYMBOLS = Object.keys(SEED_PRICES);
let lastWatchRefreshAt = 0;
let watchRefreshInflight = false;

function triggerWatchBackgroundRefresh(force = false): void {
  const now = Date.now();
  if (watchRefreshInflight || (!force && now - lastWatchRefreshAt < 8500)) return;
  watchRefreshInflight = true;
  lastWatchRefreshAt = now;
  void (async () => {
    try {
      const pairs = WATCH_SYMBOLS.map((sym) => ({ sym, tv: resolveTvSymbol(sym) }));
      const batch = await fetchWsQuotesBatch(pairs.map(p => p.tv), 5000);
      const ts = Date.now();
      const missingBinance: Array<{ sym: string; tv: string; pair: string }> = [];
      for (const { sym, tv } of pairs) {
        const raw = batch.get(tv);
        if (raw && num(raw.lp) > 0) {
          const out = buildQuoteObj(sym, tv, {
            price: num(raw.lp),
            open: num(raw.open_price, num(raw.lp)),
            high: num(raw.high_price, num(raw.lp)),
            low: num(raw.low_price, num(raw.lp)),
            prevClose: num(raw.prev_close_price, num(raw.lp)),
            changePct: raw.chp != null ? num(raw.chp) : undefined,
            changeAbs: raw.ch != null ? num(raw.ch) : undefined,
            volume: num(raw.volume),
            description: raw.description,
            exchange: raw.exchange,
            updateMode: raw.update_mode,
            currentSession: raw.current_session,
            lpTime: num(raw.lp_time),
            source: 'TradingView',
          });
          quoteCache.set(tv, { exp: ts + 6500, data: out });
          lastGoodQuoteCache.set(tv, out);
        } else if (/^BINANCE:([A-Z0-9]+)$/i.test(tv)) {
          missingBinance.push({ sym, tv, pair: tv.split(':')[1].toUpperCase() });
        }
      }
      if (missingBinance.length) {
        try {
          const bRes = await fetch(
            'https://api.binance.com/api/v3/ticker/24hr?symbols=' +
              encodeURIComponent(JSON.stringify(missingBinance.map((m) => m.pair))),
            { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(4000) },
          );
          if (bRes.ok) {
            const rows: any[] = await bRes.json();
            const byPair = new Map((Array.isArray(rows) ? rows : []).map((r) => [String(r.symbol || '').toUpperCase(), r]));
            const bTs = Date.now();
            for (const m of missingBinance) {
              const d = byPair.get(m.pair);
              const price = num(d?.lastPrice);
              if (price > 0) {
                const out = buildQuoteObj(m.sym, m.tv, {
                  price,
                  open: num(d?.openPrice, price),
                  high: num(d?.highPrice, price),
                  low: num(d?.lowPrice, price),
                  prevClose: num(d?.prevClosePrice, price),
                  changePct: num(d?.priceChangePercent),
                  changeAbs: num(d?.priceChange),
                  currentSession: 'market',
                  lpTime: Math.floor(bTs / 1000),
                  source: 'Binance',
                });
                quoteCache.set(m.tv, { exp: bTs + 6500, data: out });
                lastGoodQuoteCache.set(m.tv, out);
              }
            }
          }
        } catch {}
      }
    } finally {
      watchRefreshInflight = false;
    }
  })();
}

void triggerWatchBackgroundRefresh(true);

function getSnapshotQuote(symbol: string) {
  const meta = getSymbolMeta(symbol);
  const tv = resolveTvSymbol(meta.symbol);
  const hit = quoteCache.get(tv)?.data || lastGoodQuoteCache.get(tv);
  const seed = SEED_PRICES[meta.symbol] || { price: 100, change: 0.1, high: 101, low: 99, rating: 0.1 };
  const price = hit?.price > 0 ? Number(hit.price) : seed.price;
  const change = hit ? Number(hit.change || 0) : seed.change;
  const high = hit?.high > 0 ? Number(hit.high) : seed.high;
  const low = hit?.low > 0 ? Number(hit.low) : seed.low;
  const rating = hit ? Number(hit.rating || 0) : seed.rating;
  const scheduleOpen = isScheduleMarketOpen(meta.symbol, tv);
  const marketOpen = isCryptoMarketSymbol(meta.symbol, tv)
    ? true
    : (hit?.market_open === false ? false : scheduleOpen);
  return { meta, price, change, high, low, rating, marketOpen, hasLiveHit: !!hit };
}

export function getLiveMarketWatches(force = false): any[] {
  triggerWatchBackgroundRefresh(force);
  const nowSec = Date.now() / 1000;
  return WATCH_SYMBOLS.map((sym) => {
    const { meta, price, change, high, low, rating, marketOpen, hasLiveHit } = getSnapshotQuote(sym);
    const digits = meta.digits;
    const point = meta.point;
    const spreadPts = meta.kind === 'forex' ? 12 : meta.kind === 'metals' ? 18 : meta.kind === 'crypto' ? 25 : 15;
    const halfSpread = (spreadPts * point) / 2;
    const bid = Number((price - halfSpread).toFixed(digits));
    const ask = Number((price + halfSpread).toFixed(digits));
    const posInRange = high > low ? Math.max(0, Math.min(1, (price - low) / (high - low))) : 0.5;
    const rawScore = (posInRange - 0.5) * 38 + Math.max(-16, Math.min(16, change * 6)) + rating * 20;
    const buyer_pct = Math.max(18, Math.min(82, Math.round(50 + rawScore)));
    const seller_pct = 100 - buyer_pct;
    const dominant = buyer_pct >= 53 ? 'BUYER' : seller_pct >= 53 ? 'SELLER' : 'NEUTRAL';
    const needle_deg = Math.round(((buyer_pct - 50) / 50) * 125);
    const candle_flow = buyer_pct >= 53 ? 'BULLISH' : seller_pct >= 53 ? 'BEARISH' : 'SIDEWAYS';
    const direction = change > 0.03 ? 'UP' : change < -0.03 ? 'DOWN' : 'FLAT';

    return {
      symbol: meta.symbol,
      displayName: meta.symbol,
      digits,
      bid,
      ask,
      spread: spreadPts,
      change_pct: Number(change.toFixed(2)),
      direction,
      buyer_pct,
      seller_pct,
      dominant,
      needle_deg,
      candle_flow,
      live: hasLiveHit,
      price_source: hasLiveHit ? 'TradingView' : 'public',
      market_open: marketOpen,
      updated_at: nowSec,
    };
  });
}

export function buildAiMarketBoard(symbol: string, timeframe = 'M5', precomputedWatches?: ReturnType<typeof getLiveMarketWatches>) {
  const { meta, price, change, high, low } = getSnapshotQuote(symbol);
  const watches = precomputedWatches || getLiveMarketWatches(false);
  const w = watches.find(x => x.symbol === meta.symbol) || watches[0];
  const daySpan = Math.max(high - low, price * 0.006);
  const baseVerdict = w.buyer_pct >= 52 ? 'BUY' : w.seller_pct >= 52 ? 'SELL' : change >= 0 ? 'BUY' : 'SELL';
  const baseConf = Math.min(92, Math.max(54, Math.round(50 + Math.abs(w.buyer_pct - 50) * 1.3)));

  const tfSpecs: Array<{ key: string; name: string; mult: number; rsiBias: number }> = [
    { key: 'M1', name: '1m', mult: 0.12, rsiBias: 2 },
    { key: 'M5', name: '5m', mult: 0.22, rsiBias: 0 },
    { key: 'M15', name: '15m', mult: 0.38, rsiBias: -1 },
    { key: 'H1', name: '1h', mult: 0.62, rsiBias: 1 },
    { key: 'H4', name: '4h', mult: 0.85, rsiBias: 2 },
    { key: 'D1', name: '1Day', mult: 1.25, rsiBias: 0 },
  ];

  const rows = tfSpecs.map((tf) => {
    const atr = Number((daySpan * tf.mult).toFixed(meta.digits));
    const upDist = Number((atr * 1.8).toFixed(meta.digits));
    const downDist = Number((atr * 1.4).toFixed(meta.digits));
    const score = baseVerdict === 'BUY' ? Math.max(1, Math.round((w.buyer_pct - 50) / 5)) : -Math.max(1, Math.round((w.seller_pct - 50) / 5));
    const rsi = Math.max(28, Math.min(74, Math.round(50 + (w.buyer_pct - 50) * 0.65 + tf.rsiBias)));
    const conf = Math.min(94, Math.max(52, baseConf + (tf.key === timeframe ? 4 : 0)));
    const up_price = Number((price + upDist).toFixed(meta.digits));
    const down_price = Number((price - downDist).toFixed(meta.digits));
    return {
      key: tf.key,
      name: tf.name,
      ready: true,
      verdict: baseVerdict,
      score,
      confidence: conf,
      rsi,
      atr,
      up_price,
      down_price,
      up_distance: upDist,
      down_distance: downDist,
      reasons: [
        `EMA9/21 ${baseVerdict === 'BUY' ? 'bullish alignment' : 'bearish alignment'}`,
        `RSI ${rsi} · Dial ${w.buyer_pct}% Buy / ${w.seller_pct}% Sell`,
        `ATR target ±${atr.toFixed(meta.digits)}`,
      ],
    };
  });

  const activeRow = rows.find(r => r.key === timeframe) || rows[1];
  const mpp = meta.kind === 'forex' ? 1000 : meta.kind === 'metals' ? 1.0 : meta.kind === 'crypto' ? 0.01 : 1.0;

  return {
    symbol: meta.symbol,
    symbols: WATCH_SYMBOLS,
    timeframe: activeRow.key,
    digits: meta.digits,
    price,
    source: 'public',
    updated: Math.floor(Date.now() / 1000),
    money_per_price: mpp,
    flow: {
      buyer_pct: w.buyer_pct,
      seller_pct: w.seller_pct,
      dominant: w.dominant,
    },
    combined: {
      verdict: baseVerdict,
      confidence: activeRow.confidence,
      reasons: activeRow.reasons,
    },
    target: {
      ready: true,
      primary_side: baseVerdict,
      up_price: activeRow.up_price,
      down_price: activeRow.down_price,
      up_money: Number((activeRow.up_distance * mpp).toFixed(2)),
      down_money: Number((activeRow.down_distance * mpp).toFixed(2)),
      level_up: Number((high || activeRow.up_price).toFixed(meta.digits)),
      level_down: Number((low || activeRow.down_price).toFixed(meta.digits)),
    },
    rows,
  };
}

export function buildBot3Payload(symbol: string) {
  const { meta, price, high, low } = getSnapshotQuote(symbol);
  const span = Math.max(high - low, price * 0.008);
  const w1High = Number((high + span * 0.65).toFixed(meta.digits));
  const w1Low = Number((low - span * 0.65).toFixed(meta.digits));
  const prevHigh = Number((high + span * 1.15).toFixed(meta.digits));
  const prevLow = Number((low - span * 1.15).toFixed(meta.digits));
  const usePrevLow = Math.abs(price - prevLow) <= Math.abs(price - prevHigh);

  const raw = [
    { action: 'BUY', label: 'Today Lower Low (LL)', scope: 'D1', price: Number(low.toFixed(meta.digits)), reason: 'Daily session demand floor — sniper BUY bounce setup' },
    { action: 'SELL', label: 'Today Higher High (HH)', scope: 'D1', price: Number(high.toFixed(meta.digits)), reason: 'Daily session supply ceiling — sniper SELL rejection setup' },
    { action: 'BUY', label: 'This Week Lower Low (LL)', scope: 'W1', price: w1Low, reason: 'Weekly institutional liquidity pool — high-R:R BUY reversal' },
    { action: 'SELL', label: 'This Week Higher High (HH)', scope: 'W1', price: w1High, reason: 'Weekly institutional supply zone — high-R:R SELL reversal' },
    usePrevLow
      ? { action: 'BUY', label: 'Prev Week Low (Floor)', scope: 'Prev W1', price: prevLow, reason: 'Previous week major structural floor — extreme BUY trap zone' }
      : { action: 'SELL', label: 'Prev Week High (Ceiling)', scope: 'Prev W1', price: prevHigh, reason: 'Previous week major structural ceiling — extreme SELL trap zone' },
  ];

  const planned = raw
    .map((item, idx) => {
      const dist = Math.abs(price - item.price);
      const pct = price > 0 ? (dist / price) * 100 : 0;
      const isTouch = pct <= 0.08;
      const status_cls = isTouch ? 'trigger' : pct <= 0.35 ? 'imminent' : pct <= 1.2 ? 'approaching' : 'pending';
      const status_text = isTouch ? 'AT LEVEL' : pct <= 0.35 ? 'IMMINENT' : pct <= 1.2 ? 'APPROACHING' : 'PENDING';
      const tpDist = span * 0.45;
      const slDist = span * 0.3;
      const est_tp_price = Number((item.action === 'BUY' ? item.price + tpDist : item.price - tpDist).toFixed(meta.digits));
      const est_sl_price = Number((item.action === 'BUY' ? item.price - slDist : item.price + slDist).toFixed(meta.digits));
      return {
        id: idx + 1,
        priority_rank: idx + 1,
        action: item.action,
        label: item.label,
        scope: item.scope,
        price: item.price,
        distance: Number(dist.toFixed(meta.digits)),
        dist_pct: Number(pct.toFixed(2)),
        is_touch: isTouch,
        status_cls,
        status_text,
        reason: item.reason,
        est_tp_price,
        est_sl_price,
        tp: '15.00',
        sl: '8.50',
      };
    })
    .sort((a, b) => a.distance - b.distance)
    .map((item, i) => ({ ...item, id: i + 1, priority_rank: i + 1 }));

  const nowSec = Math.floor(Date.now() / 1000);
  return {
    running: false,
    symbol: meta.symbol,
    symbol_requested: meta.symbol,
    symbol_ok: true,
    symbol_options: WATCH_SYMBOLS,
    bid: price,
    ask: price,
    spread: 15,
    zone_status: 'EXTREME SCANNER · LIVE',
    recalc_countdown: 60 - (nowSec % 60),
    last_recalc_ts: nowSec,
    levels: {
      d1: { hh: high, lh: Number((high - span * 0.25).toFixed(meta.digits)), hl: Number((low + span * 0.25).toFixed(meta.digits)), ll: low },
      w1: { hh: w1High, lh: high, hl: low, ll: w1Low },
      prev: { hh: prevHigh, lh: w1High, hl: w1Low, ll: prevLow },
    },
    planned_trades: planned,
  };
}

export async function buildTapePayload(symbol: string, limit = 40) {
  const meta = getSymbolMeta(symbol);
  let bars: number[][] = [];
  try {
    const res = await fetchTvCandles(meta.symbol, '1m', 90);
    bars = Array.isArray(res.bars) ? res.bars : [];
  } catch {}
  if (bars.length < 3) {
    return { symbol: meta.symbol, meta, prints: [], recent: [] };
  }
  const point = meta.point || 0.01;
  const moves = bars.map(b => Math.abs(num(b[4]) - num(b[1])));
  const vols = bars.map(b => Math.max(0, num(b[5])));
  const sortedMoves = [...moves].sort((a, b) => a - b);
  const sortedVols = [...vols].sort((a, b) => a - b);
  const medMove = Math.max(sortedMoves[Math.floor(sortedMoves.length / 2)] || point, point);
  const medVol = sortedVols[Math.floor(sortedVols.length / 2)] || 0;

  const prints: any[] = [];
  for (let i = 1; i < bars.length; i++) {
    const [ts, o, h, l, c, v] = bars[i];
    const body = c - o;
    const move = Math.abs(body);
    const rng = Math.max(h - l, point);
    const bigMove = move >= medMove * 1.4;
    const bigVol = medVol > 0 && v >= medVol * 1.5;
    if (!bigMove && !bigVol) continue;

    const side = body >= 0 ? 'BUY' : 'SELL';
    const followEnd = Math.min(bars.length - 1, i + 5);
    const futureClose = num(bars[followEnd][4]);
    const follow = side === 'BUY' ? futureClose - c : c - futureClose;
    const ticks = Math.max(6, Math.round((medVol > 0 ? (v / medVol) * 8 : (rng / medMove) * 8)));
    prints.push({
      id: `${meta.symbol}-${ts}`,
      t: 'print',
      tm: ts,
      px: Number(c.toFixed(meta.digits)),
      side,
      ticks,
      mv: Number((body / point).toFixed(1)),
      fv: Number((follow / point).toFixed(1)),
    });
  }
  const latest = prints.slice(-limit).reverse();
  const recent = bars.slice(-30).map(b => ({ t: b[0], p: b[4] }));
  return { symbol: meta.symbol, meta, prints: latest, recent };
}
