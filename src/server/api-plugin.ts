import type { IncomingMessage, ServerResponse } from 'node:http';
import zlib from 'node:zlib';
import {
  buildAiMarketBoard,
  buildBot3Payload,
  buildTapePayload,
  fetchTvCandles,
  fetchTvQuote,
  fetchTvSetups,
  getLiveMarketWatches,
  getSymbolMeta,
  getSymbolsPayload,
} from './tv-feed';
import {
  buildSessionsPayload,
  getDxyM5Bars,
  getNewsReadingPayload,
  getNewsSignature,
  maybeRefreshReleasesOnDemand,
  refreshLiveNews,
  researchMarketWithInternet,
} from './news-feed';
import {
  clearAdminLockCookie,
  enforceApiLock,
  isAdminAuthed,
  isAdminKeyRequired,
  issueAdminLockCookie,
} from './api-security';

let sessionMarket = 'XAUUSDm';
let aiMarket = 'XAUUSDm';
let aiTimeframe = 'M5';

const RES_TO_REQ = new WeakMap<ServerResponse, IncomingMessage>();

const venueTradeCache = new Map<string, { exp: number; data: any }>();
const inflightVenueTrades = new Map<string, Promise<any>>();
const VENUE_CACHE_TTL_MS = 7500;
let stateRespCache: { key: string; exp: number; json: string; gz: Buffer } | null = null;

function sendPreencoded(res: ServerResponse, status: number, json: string, gz: Buffer | null): void {
  const req = RES_TO_REQ.get(res);
  const wantsGzip = Boolean(gz && json.length >= 1024 && /\bgzip\b/i.test(String(req?.headers?.['accept-encoding'] || '')));
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (wantsGzip && gz) {
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
    res.end(gz);
  } else {
    res.end(json);
  }
}

function sendJson(res: ServerResponse, status: number, body: any): void {
  const payload = JSON.stringify(body);
  const req = RES_TO_REQ.get(res);
  const wantsGzip = payload.length >= 1024 && /\bgzip\b/i.test(String(req?.headers?.['accept-encoding'] || ''));
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (!wantsGzip) {
    res.end(payload);
    return;
  }
  zlib.gzip(payload, (err, gz) => {
    if (err || !gz || res.writableEnded) {
      if (!res.writableEnded) res.end(payload);
      return;
    }
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
    res.end(gz);
  });
}

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk.toString('utf8');
      if (raw.length > 512_000) req.destroy();
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

async function fetchVenueTradesUncached(venue: string, market: string, limit = 80) {
  const v = String(venue || 'binance').toLowerCase();
  const base = String(market || 'BTC').toUpperCase().replace(/USDT?M?$/, '').replace(/M$/, '') || 'BTC';
  const coin = ['XAU', 'GOLD', 'XAUUSD', 'XAUUSD247'].includes(base) ? 'PAXG' : base;
  const now = Date.now();

  try {
    if (v === 'binance') {
      const sym = `${coin}USDT`;
      const r = await fetch(`https://api.binance.com/api/v3/trades?symbol=${sym}&limit=${Math.min(limit, 200)}`, { signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        const rows: any = await r.json();
        return {
          ok: true,
          venue: v,
          market: coin,
          trades: (Array.isArray(rows) ? rows : []).map((t: any) => ({
            id: String(t.id),
            ts: Number(t.time || now),
            price: Number(t.price),
            size: Number(t.qty),
            notional: Number(t.price) * Number(t.qty),
            side: t.isBuyerMaker ? 'SELL' : 'BUY',
          })),
        };
      }
    } else if (v === 'gate') {
      const pair = `${coin}_USDT`;
      const r = await fetch(`https://api.gateio.ws/api/v4/spot/trades?currency_pair=${pair}&limit=${Math.min(limit, 100)}`, { signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        const rows: any = await r.json();
        return {
          ok: true,
          venue: v,
          market: coin,
          trades: (Array.isArray(rows) ? rows : []).map((t: any) => ({
            id: String(t.id),
            ts: Number(t.create_time_ms || Number(t.create_time) * 1000 || now),
            price: Number(t.price),
            size: Number(t.amount),
            notional: Number(t.price) * Number(t.amount),
            side: String(t.side || '').toLowerCase() === 'sell' ? 'SELL' : 'BUY',
          })),
        };
      }
    } else if (v === 'kucoin') {
      const pair = `${coin}-USDT`;
      const r = await fetch(`https://api.kucoin.com/api/v1/market/histories?symbol=${pair}`, { signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        const body: any = await r.json();
        const rows = Array.isArray(body?.data) ? body.data.slice(-limit) : [];
        return {
          ok: true,
          venue: v,
          market: coin,
          trades: rows.map((t: any) => ({
            id: String(t.sequence || t.time),
            ts: Math.floor(Number(t.time) / 1e6) || now,
            price: Number(t.price),
            size: Number(t.size),
            notional: Number(t.price) * Number(t.size),
            side: String(t.side || '').toLowerCase() === 'sell' ? 'SELL' : 'BUY',
          })),
        };
      }
    } else if (v === 'mexc') {
      const sym = `${coin}USDT`;
      const r = await fetch(`https://api.mexc.com/api/v3/trades?symbol=${sym}&limit=${Math.min(limit, 100)}`, { signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        const rows: any = await r.json();
        return {
          ok: true,
          venue: v,
          market: coin,
          trades: (Array.isArray(rows) ? rows : []).map((t: any) => ({
            id: String(t.id || t.time),
            ts: Number(t.time || now),
            price: Number(t.price),
            size: Number(t.qty),
            notional: Number(t.price) * Number(t.qty),
            side: t.isBuyerMaker ? 'SELL' : 'BUY',
          })),
        };
      }
    } else if (v === 'bitget') {
      const sym = `${coin}USDT`;
      const r = await fetch(`https://api.bitget.com/api/v2/spot/market/fills?symbol=${sym}&limit=${Math.min(limit, 100)}`, { signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        const body: any = await r.json();
        const rows = Array.isArray(body?.data) ? body.data : [];
        return {
          ok: true,
          venue: v,
          market: coin,
          trades: rows.map((t: any) => ({
            id: String(t.tradeId || t.ts),
            ts: Number(t.ts || now),
            price: Number(t.price),
            size: Number(t.size),
            notional: Number(t.price) * Number(t.size),
            side: String(t.side || '').toLowerCase() === 'sell' ? 'SELL' : 'BUY',
          })),
        };
      }
    } else if (v === 'coinbase') {
      const pair = `${coin}-USD`;
      const r = await fetch(`https://api.exchange.coinbase.com/products/${pair}/trades?limit=${Math.min(limit, 100)}`, { signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        const rows: any = await r.json();
        return {
          ok: true,
          venue: v,
          market: coin,
          trades: (Array.isArray(rows) ? rows : []).map((t: any) => ({
            id: String(t.trade_id),
            ts: Date.parse(t.time) || now,
            price: Number(t.price),
            size: Number(t.size),
            notional: Number(t.price) * Number(t.size),
            side: String(t.side || '').toLowerCase() === 'buy' ? 'SELL' : 'BUY',
          })),
        };
      }
    } else if (v === 'htx') {
      const sym = `${coin.toLowerCase()}usdt`;
      const r = await fetch(`https://api.huobi.pro/market/history/trade?symbol=${sym}&size=${Math.min(limit, 100)}`, { signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        const body: any = await r.json();
        const rows: any[] = [];
        for (const batch of body?.data || []) {
          for (const t of batch?.data || []) rows.push(t);
        }
        return {
          ok: true,
          venue: v,
          market: coin,
          trades: rows.slice(0, limit).map((t: any) => ({
            id: String(t.tradeId || t.id || t.ts),
            ts: Number(t.ts || now),
            price: Number(t.price),
            size: Number(t.amount),
            notional: Number(t.price) * Number(t.amount),
            side: String(t.direction || '').toLowerCase() === 'sell' ? 'SELL' : 'BUY',
          })),
        };
      }
    }
  } catch {}

  return { ok: true, venue: v, market: coin, trades: [] };
}

async function fetchVenueTrades(venue: string, market: string, limit = 80) {
  const v = String(venue || 'binance').toLowerCase();
  const base = String(market || 'BTC').toUpperCase().replace(/USDT?M?$/, '').replace(/M$/, '') || 'BTC';
  const coin = ['XAU', 'GOLD', 'XAUUSD', 'XAUUSD247'].includes(base) ? 'PAXG' : base;
  const lim = Math.min(200, Math.max(20, Number(limit) || 80));
  const key = `${v}|${coin}|${lim}`;
  const now = Date.now();
  const hit = venueTradeCache.get(key);
  if (hit && now < hit.exp) return hit.data;
  let pending = inflightVenueTrades.get(key);
  if (!pending) {
    pending = fetchVenueTradesUncached(v, market, lim)
      .then((data) => {
        venueTradeCache.set(key, { exp: Date.now() + VENUE_CACHE_TTL_MS, data });
        return data;
      })
      .finally(() => {
        if (inflightVenueTrades.get(key) === pending) inflightVenueTrades.delete(key);
      });
    inflightVenueTrades.set(key, pending);
  }
  return pending;
}

export async function handleApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  RES_TO_REQ.set(res, req);
  const urlObj = new URL(req.url || '/', 'http://127.0.0.1');
  const pathname = urlObj.pathname;
  if (!pathname.startsWith('/api/')) return false;
  if (!enforceApiLock(req, res, pathname)) return true;

  const method = (req.method || 'GET').toUpperCase();

  if (pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      hosted: false,
      public_only: true,
      connected: true,
      source: 'public',
      clients: 1,
      uptime_engine: true,
    });
    return true;
  }

  if (pathname === '/api/config') {
    sendJson(res, 200, {
      app: 'SoftradeX Trade',
      version: '3.0.0',
      terminal_path: '',
      terminals: [],
      exness_terminals: [],
      mt5_ready: false,
      mt5_any_terminal: false,
      mt5_exness_branded: false,
      mt5_package: false,
      hosted: false,
      public_only: true,
      broker_connections: false,
      order_execution: false,
      data_source: 'public',
      live_stream: false,
      remember_login: false,
      bots_enabled: false,
      saved_login: '',
      saved_server: '',
      poll_interval_ms: 2500,
      history_days: 60,
      port: 8777,
      servers: {},
      common_servers: [],
      known_servers: [],
      auth_required: isAdminKeyRequired(),
      authed: isAdminAuthed(req),
    });
    return true;
  }

  if (pathname === '/api/auth') {
    sendJson(res, 200, { ok: true, auth_required: isAdminKeyRequired(), authed: isAdminAuthed(req), ttl_sec: 43200 });
    return true;
  }

  if (pathname === '/api/login') {
    const body = await readBody(req);
    const ok = issueAdminLockCookie(req, res, String(body?.password || ''));
    if (!ok) {
      sendJson(res, 401, { ok: false, auth_required: true, authed: false, error: 'Invalid access password' });
      return true;
    }
    sendJson(res, 200, { ok: true, auth_required: isAdminKeyRequired(), authed: true, ttl_sec: 43200 });
    return true;
  }

  if (pathname === '/api/logout') {
    clearAdminLockCookie(req, res);
    sendJson(res, 200, { ok: true, auth_required: isAdminKeyRequired(), authed: false, ttl_sec: 43200 });
    return true;
  }

  if (pathname === '/api/state') {
    const have = (urlObj.searchParams.get('have') || '').trim();
    const sig = getNewsSignature();
    const omitNews = Boolean(have && have === sig);
    const cacheKey = `${omitNews ? '1' : '0'}|${sig}|${sessionMarket}|${aiMarket}|${aiTimeframe}`;
    const nowMs = Date.now();
    if (stateRespCache && stateRespCache.key === cacheKey && nowMs < stateRespCache.exp) {
      sendPreencoded(res, 200, stateRespCache.json, stateRespCache.gz);
      return true;
    }
    const newsPayload = getNewsReadingPayload(sessionMarket, omitNews);
    const nowSec = Math.floor(nowMs / 1000);
    const watches = getLiveMarketWatches(false);

    const bot5: any = {
      running: false,
      symbol: sessionMarket,
      session_market: sessionMarket,
      ai_market: aiMarket,
      ai_timeframe: aiTimeframe,
      feed_state: 'ok',
      updated_ts: newsPayload.updated_ts,
      feed_updated: newsPayload.updated_ts,
      news_total: newsPayload.news_total,
      sources: newsPayload.sources,
      feed_sources: newsPayload.sources,
      source_status: newsPayload.source_status,
      news_sig: sig,
      sessions: buildSessionsPayload(sessionMarket),
      ai: buildAiMarketBoard(aiMarket, aiTimeframe, watches),
    };
    if (omitNews) {
      bot5.news_omitted = true;
    } else {
      bot5.news = newsPayload.events;
    }

    const body = {
      version: 3,
      connected: true,
      public_only: true,
      source: 'public',
      server_time: new Date(nowSec * 1000).toISOString().slice(0, 19).replace('T', ' '),
      engine_latency_ms: 4,
      account: { login: 0, name: 'Public Market Terminal', server: 'Public API', currency: 'USD', balance: 0, equity: 0 },
      positions: [],
      orders: [],
      stats: {},
      market_watch: watches,
      bot3: buildBot3Payload(sessionMarket),
      bot5,
    };
    const json = JSON.stringify(body);
    let gz: Buffer | null = null;
    try {
      if (json.length >= 1024) gz = zlib.gzipSync(json);
    } catch {}
    if (gz) stateRespCache = { key: cacheKey, exp: nowMs + 1500, json, gz };
    sendPreencoded(res, 200, json, gz);
    return true;
  }

  if (pathname === '/api/news/market') {
    const symbol = urlObj.searchParams.get('symbol') || 'XAUUSDm';
    const scan = urlObj.searchParams.get('scan') === '1' || urlObj.searchParams.get('scan') === 'true';
    const have = (urlObj.searchParams.get('have') || '').trim();
    if (scan) await refreshLiveNews(true);
    else await maybeRefreshReleasesOnDemand();
    const dxyBarsM5 = await getDxyM5Bars(false);
    const sig = getNewsSignature();
    const omitNews = Boolean(!scan && have && have === sig);
    const payload = getNewsReadingPayload(symbol, omitNews);
    sendJson(
      res,
      200,
      omitNews
        ? { ...payload, dxy_bars_m5: dxyBarsM5, news_omitted: true, news_sig: sig }
        : { ...payload, dxy_bars_m5: dxyBarsM5, news_sig: sig },
    );
    return true;
  }

  if (pathname === '/api/softradex-ai/research') {
    const symbol = urlObj.searchParams.get('symbol') || sessionMarket || 'XAUUSDm';
    const topicsRaw = (urlObj.searchParams.get('topics') || '').trim();
    const topics = topicsRaw ? topicsRaw.split('||').map(s => s.trim()).filter(Boolean).slice(0, 3) : [];
    const force = urlObj.searchParams.get('force') === '1' || urlObj.searchParams.get('force') === 'true';
    const research = await researchMarketWithInternet(symbol, topics, force);
    sendJson(res, 200, research);
    return true;
  }

  if (pathname === '/api/bot5/refresh') {
    const count = await refreshLiveNews(true);
    const newsPayload = getNewsReadingPayload(sessionMarket);
    sendJson(res, 200, {
      ok: true,
      count,
      bot5: {
        symbol: sessionMarket,
        session_market: sessionMarket,
        ai_market: aiMarket,
        ai_timeframe: aiTimeframe,
        news: newsPayload.events,
        news_total: newsPayload.events.length,
        news_sig: newsPayload.news_sig,
        sources: newsPayload.sources,
        feed_sources: newsPayload.sources,
        source_status: newsPayload.source_status,
        sessions: buildSessionsPayload(sessionMarket),
        ai: buildAiMarketBoard(aiMarket, aiTimeframe),
      },
    });
    return true;
  }

  if (pathname === '/api/bot5/config' && method === 'POST') {
    const body = await readBody(req);
    if (body.session_market) sessionMarket = String(body.session_market);
    if (body.ai_market) aiMarket = String(body.ai_market);
    if (body.ai_timeframe) aiTimeframe = String(body.ai_timeframe);
    if (body.symbol) {
      sessionMarket = String(body.symbol);
      aiMarket = String(body.symbol);
    }
    const newsPayload = getNewsReadingPayload(sessionMarket);
    sendJson(res, 200, {
      ok: true,
      bot5: {
        symbol: sessionMarket,
        session_market: sessionMarket,
        ai_market: aiMarket,
        ai_timeframe: aiTimeframe,
        news: newsPayload.events,
        news_total: newsPayload.events.length,
        news_sig: newsPayload.news_sig,
        sources: newsPayload.sources,
        feed_sources: newsPayload.sources,
        source_status: newsPayload.source_status,
        sessions: buildSessionsPayload(sessionMarket),
        ai: buildAiMarketBoard(aiMarket, aiTimeframe),
      },
    });
    return true;
  }

  if ((pathname === '/api/bot3/recalculate' || pathname === '/api/bot3/config') && method === 'POST') {
    const body = await readBody(req);
    if (body.symbol) sessionMarket = String(body.symbol);
    sendJson(res, 200, {
      ok: true,
      bot3: buildBot3Payload(sessionMarket),
    });
    return true;
  }

  if (pathname === '/api/chart/symbols') {
    sendJson(res, 200, getSymbolsPayload());
    return true;
  }

  if (pathname === '/api/chart/tvcandles' || pathname === '/api/chart/candles') {
    const symbol = urlObj.searchParams.get('symbol') || 'XAUUSDm';
    const tf = urlObj.searchParams.get('tf') || '5m';
    const count = Number(urlObj.searchParams.get('count') || 500);
    const tvSymbol = urlObj.searchParams.get('tv_symbol');
    try {
      const data = await fetchTvCandles(symbol, tf, count, tvSymbol);
      sendJson(res, 200, {
        ...data,
        meta: getSymbolMeta(symbol),
      });
    } catch (err: any) {
      sendJson(res, 503, {
        ok: false,
        symbol,
        source: 'TradingView',
        error: String(err?.message || err || 'TradingView candles unavailable'),
      });
    }
    return true;
  }

  if (pathname === '/api/chart/tvquote' || pathname === '/api/chart/ticker') {
    const symbol = urlObj.searchParams.get('symbol') || 'XAUUSDm';
    const tvSymbol = urlObj.searchParams.get('tv_symbol');
    try {
      const q = await fetchTvQuote(symbol, tvSymbol);
      sendJson(res, 200, q);
    } catch (err: any) {
      sendJson(res, 503, {
        ok: false,
        symbol,
        source: 'TradingView',
        error: String(err?.message || err || 'TradingView quote unavailable'),
      });
    }
    return true;
  }

  if (pathname === '/api/tv/setups') {
    const symbol = urlObj.searchParams.get('symbol') || 'XAUUSDm';
    try {
      const data = await fetchTvSetups(symbol);
      sendJson(res, 200, data);
    } catch (err: any) {
      sendJson(res, 503, {
        ok: false,
        symbol,
        source: 'TradingView',
        error: String(err?.message || err || 'TradingView setups unavailable'),
      });
    }
    return true;
  }

  if (pathname === '/api/chart/tape') {
    const symbol = urlObj.searchParams.get('symbol') || 'XAUUSDm';
    const limit = Number(urlObj.searchParams.get('limit') || 40);
    const data = await buildTapePayload(symbol, limit);
    sendJson(res, 200, data);
    return true;
  }

  if (pathname === '/api/orderflow/venues') {
    sendJson(res, 200, {
      venues: ['binance', 'bybit', 'okx', 'gate', 'kucoin', 'mexc', 'bitget', 'coinbase', 'htx'],
    });
    return true;
  }

  if (pathname === '/api/orderflow/trades') {
    const venue = urlObj.searchParams.get('venue') || 'binance';
    const market = urlObj.searchParams.get('market') || 'BTC';
    const limit = Number(urlObj.searchParams.get('limit') || 80);
    const data = await fetchVenueTrades(venue, market, limit);
    sendJson(res, 200, data);
    return true;
  }

  if (pathname === '/api/whales/positions') {
    // Return 404 so whale-positions.js uses PublicWhaleFeed direct browser Hyperliquid scanner
    sendJson(res, 404, { ok: false, detail: 'Use direct public scanner' });
    return true;
  }

  if (pathname === '/api/market-watch') {
    const force = urlObj.searchParams.get('force') === 'true';
    const watches = getLiveMarketWatches(force);
    sendJson(res, 200, { ok: true, watches });
    return true;
  }

  if (pathname === '/api/history' || pathname === '/api/events') {
    sendJson(res, 200, { trades: [], events: [], count: 0, total_ever: 0, symbols: [], account: null });
    return true;
  }

  sendJson(res, 200, { ok: true });
  return true;
}
