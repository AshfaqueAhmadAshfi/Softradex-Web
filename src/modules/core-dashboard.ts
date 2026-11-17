// @ts-nocheck
/* Consolidated TypeScript module */
export function loadModule(): void {
  (window as any).SOFTRADEX_PUBLIC_ONLY = true;
  const isDarkTheme = () => document.documentElement.classList.contains('sx-dark');

// ==================== contact.js ====================
/* Keep the complete social dock visible inside the chart's native fullscreen. */
(function () {
  'use strict';
  var contact = document.querySelector('[data-sx-social-dock]');
  if (!contact) return;
  document.addEventListener('fullscreenchange', function () {
    var parent = document.fullscreenElement || document.body;
    if (contact.parentElement !== parent) parent.appendChild(contact);
  });
})();


// ==================== live-tape-renderer.js ====================
/* Execution records are immutable: retain existing rows as new prints arrive. */
(function (root) {
  'use strict';
  const tapes = new WeakMap();
  function render(element, rows, keyOf, rowHtml, emptyHtml) {
    let tape = tapes.get(element);
    if (!tape) {
      tape = {nodes: new Map(), empty: null};
      tapes.set(element, tape);
      element.textContent = '';
    }
    if (!rows.length) {
      if (tape.empty !== emptyHtml || tape.nodes.size) element.innerHTML = emptyHtml || '';
      tape.nodes.clear();
      tape.empty = emptyHtml;
      return;
    }
    if (tape.empty !== null) { element.textContent = ''; tape.empty = null; }
    const keys = rows.map(keyOf);
    const wanted = new Set(keys);
    for (const [key, node] of tape.nodes) {
      if (!wanted.has(key)) { node.remove(); tape.nodes.delete(key); }
    }
    const missing = rows.filter((row, index) => !tape.nodes.has(keys[index]));
    if (missing.length) {
      const template = element.ownerDocument.createElement('template');
      template.innerHTML = missing.map(rowHtml).join('');
      Array.from(template.content.children).forEach((node, index) => tape.nodes.set(keyOf(missing[index]), node));
    }
    let cursor = element.firstElementChild;
    for (const key of keys) {
      const node = tape.nodes.get(key);
      if (node === cursor) cursor = cursor.nextElementSibling;
      else element.insertBefore(node, cursor);
    }
  }
  root.LiveTapeRenderer = {render};
})(window);


// ==================== dashboard-panels.js ====================
/* Shared data rules for dashboard cards and the all-market next-day outlook. */
(function (root) {
  'use strict';
  function canonical(value) {
    const key = String(value || '').replace(/m$/, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return ({ XAUUSD247: 'XAUUSD', GOLD: 'XAUUSD', BTCUSD: 'BTCUSDT', ETHUSD: 'ETHUSDT',
      NAS100: 'USTEC', USTECX100: 'USTEC', NDX: 'USTEC' })[key] || key;
  }
  function marketList(symbols, selected) {
    const seen = new Set(), rows = [];
    // Keep catalogue order; selecting a market only moves its row to the top.
    [selected].concat(symbols || []).forEach(value => {
      const symbol = typeof value === 'string' ? value : value && value.symbol;
      const key = canonical(symbol);
      if (!key || seen.has(key)) return;
      seen.add(key);
      rows.push(symbol);
    });
    return rows;
  }
  function impactSeconds(event) {
    return Math.min(21600, Math.max(60, Number(event.impact_window_sec) ||
      ({ high: 3600, medium: 1800, low: 900 })[event.impact] || 900));
  }
  function newsKind(event) {
    return event.kind || (['google-news', 'investing.com', 'yahoo-finance', 'exness', 'binance'].includes(event.source)
      ? 'headline' : 'calendar');
  }
  function newsExpires(event) {
    const readingWindow = Number(event.headline_window_sec);
    const seconds = newsKind(event) === 'headline' && Number.isFinite(readingWindow) && readingWindow > 0
      ? Math.min(86400, Math.max(60, readingWindow)) : impactSeconds(event);
    return Number(event.ts) + seconds;
  }
  function newsPhase(event, now) {
    const start = Number(event.ts);
    if (!(start > 0) || !Number.isFinite(start) || now >= newsExpires(event)) return 'expired';
    if (newsKind(event) === 'headline') return now < start ? 'expired' : 'context';
    return now < start ? 'upcoming' : 'running';
  }
  function selectEvent(events, symbol, impact, now, relevant) {
    const rows = (events || []).filter(e => e && newsKind(e) !== 'headline' &&
      newsPhase(e, now) !== 'expired' && (!impact || e.impact === impact) && relevant(e, symbol));
    rows.sort((a, b) => Number(a.ts) - Number(b.ts));
    return rows.find(e => Number(e.ts) > now) || rows[rows.length - 1] || null;
  }
  function eventImpacts(event, symbols, selected, now, relevant, estimate, contextFor, news) {
    if (!event) return [];
    const headlines = (news || [])
      .filter(e => e && newsPhase(e, now) === 'context')
      .sort((a, b) => Number(b.ts) - Number(a.ts));
    headlines.forEach(h => {
      if (h && h.title && !h._titleLower) h._titleLower = String(h.title).toLowerCase();
    });
    return marketList(symbols, selected).filter(symbol => relevant(event, symbol)).map(symbol => {
      const context = contextFor ? contextFor(symbol) || {} : {};
      const market = context.market && canonical(context.market.symbol) === canonical(symbol)
        ? { ...context.market, symbol } : null;
      const quote = context.quote && canonical(context.quote.symbol) === canonical(symbol)
        ? { ...context.quote, symbol } : null;
      let reading = estimate(event, symbol, { market, quote, headlinesPreSorted: true,
        headlines: headlines.filter(e => relevant(e, symbol)) });
      if (reading && reading.market && canonical(reading.market) !== canonical(symbol)) reading = null;
      const side = reading && ['BUY', 'SELL'].includes(reading.side) ? reading.side : '';
      return { market: symbol, side, direction: side === 'BUY' ? 'UP' : side === 'SELL' ? 'DOWN' : '',
        strength: side ? Math.max(0, Math.min(90, Number(reading.strength) || 0)) : 0,
        move_abs: side ? Math.max(0, Number(reading.move_abs) || 0) : 0,
        reason: reading && reading.reason || 'Relevant event; directional evidence is not available yet.' };
    });
  }
  function tomorrowWindow(now) {
    const start = new Date(now * 1000);
    start.setDate(start.getDate() + 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start: start.getTime() / 1000, end: end.getTime() / 1000 };
  }
  function outlook(events, symbol, now, relevant, estimate, market, quote) {
    const window = tomorrowWindow(now), seen = new Set();
    let buy = 0, sell = 0, buyPoints = 0, sellPoints = 0, top = null;
    (events || []).filter(e => e && e.kind !== 'headline' && Number(e.ts) >= window.start &&
      Number(e.ts) < window.end && relevant(e, symbol)).sort((a, b) => a.ts - b.ts).forEach(e => {
        const key = [e.ts, e.currency || e.country, String(e.title || '').toLowerCase()].join('|');
        if (seen.has(key)) return;
        seen.add(key);
        const reading = estimate(e);
        if (!reading || !['BUY', 'SELL'].includes(reading.side)) return;
        const weight = ({ high: 3, medium: 2, low: 1 })[e.impact] || 1;
        if (reading.side === 'BUY') { buy++; buyPoints += weight; }
        else { sell++; sellPoints += weight; }
        if (!top) top = e;
      });
    const same = market && canonical(market.symbol) === canonical(symbol);
    const technical = same && market.fresh && market.vote ? Number(market.vote.score) || 0 : 0;
    let verdict = buyPoints > sellPoints ? 'BUY' : sellPoints > buyPoints ? 'SELL' :
      technical >= 2 ? 'BUY' : technical <= -2 ? 'SELL' :
        buy + sell || (same && market.fresh && market.vote) ? 'MIXED' : 'DATA UNAVAILABLE';
    const confidence = buyPoints !== sellPoints
      ? Math.min(90, Math.round(100 * Math.abs(buyPoints - sellPoints) / (buyPoints + sellPoints)))
      : Math.min(75, Math.round(Math.abs(technical) * 3));
    const daily = same && market.fresh && market.reads && market.reads.D1;
    const atr = daily && daily.ready ? Number(daily.atr) || 0 : 0;
    const quoteFresh = quote && canonical(quote.symbol) === canonical(symbol) && Number(quote.price) > 0 &&
      now * 1000 - Number(quote.at) <= 15000 && Number(quote.at) <= now * 1000 + 5000;
    const move = atr > 0 && quoteFresh ? atr : null;
    const signed = move !== null && verdict === 'BUY' ? move : move !== null && verdict === 'SELL' ? -move : null;
    const precision = atr >= 1 ? 2 : 5;
    const text = signed !== null ? (signed > 0 ? '+' : '-') + Math.abs(signed).toFixed(precision) +
      (signed > 0 ? ' UP · est.' : ' DOWN · est.') : move !== null ? '~' + move.toFixed(precision) + ' RANGE · est.' : 'Price range unavailable';
    return { market: symbol, verdict, confidence, buy, sell, signals: buy + sell,
      forecast_dollar: signed, forecast_text: text, source: buyPoints !== sellPoints ? 'news' : technical ? 'market structure' : 'flat',
      top_event: top ? top.title : '', top_ts: top ? Number(top.ts) : 0,
      window_start: window.start, window_end: window.end,
      reason: move !== null ? 'Estimated travel from measured D1 ATR; signal strength is not a probability.' : 'Fresh daily candles and quote are required for a price-range estimate.' };
  }
  const _outlookRowCache = new Map();
  let _outlookEventsSig = '';
  function outlookAll(events, symbols, selected, now, relevant, estimate, contextFor) {
    const window = tomorrowWindow(now);
    const evLen = events ? events.length : 0;
    const evSig = `${evLen}|${evLen ? (events[0]?.ts || 0) : 0}|${evLen ? (events[evLen - 1]?.ts || 0) : 0}|${window.start}`;
    if (_outlookEventsSig !== evSig || _outlookRowCache.size > 128) {
      _outlookRowCache.clear();
      _outlookEventsSig = evSig;
    }
    // Filter & sort the time windows once so 28+ market rows do not re-sort
    // hundreds of headlines on every evaluation.
    const upcoming = (events || []).filter(e => e && e.kind !== 'headline' &&
      Number(e.ts) >= window.start && Number(e.ts) < window.end);
    const published = (events || [])
      .filter(e => e && newsPhase(e, now) === 'context')
      .sort((a, b) => Number(b.ts) - Number(a.ts));
    published.forEach(h => {
      if (h && h.title && !h._titleLower) h._titleLower = String(h.title).toLowerCase();
    });
    const timeBucket = Math.floor(now / 20);
    return marketList(symbols, selected).map(symbol => {
      const context = contextFor ? contextFor(symbol) || {} : {};
      // News, quote and candle context must belong to this row, even when the
      // caller supplies the currently selected market's snapshot for every row.
      const market = context.market && canonical(context.market.symbol) === canonical(symbol) ? context.market : null;
      const quote = context.quote && canonical(context.quote.symbol) === canonical(symbol) ? context.quote : null;
      const mD1 = market && market.fresh && market.reads && market.reads.D1;
      const qFresh = quote && Number(quote.price) > 0 && now * 1000 - Number(quote.at) <= 15000 ? 1 : 0;
      const mScore = market && market.fresh && market.vote ? Math.round((Number(market.vote.score) || 0) * 4) : '';
      const rowKey = `${symbol}|${mD1 && mD1.ready ? Number(mD1.atr || 0).toFixed(4) : ''}|${mScore}|${qFresh}|${timeBucket}`;
      const cachedRow = _outlookRowCache.get(rowKey);
      if (cachedRow) return cachedRow;
      const news = upcoming.filter(e => relevant(e, symbol));
      const headlines = news.length ? published.filter(e => relevant(e, symbol)) : [];
      const row = outlook(news, symbol, now, relevant,
        event => estimate(event, symbol, { market, quote, headlines, headlinesPreSorted: true }), market, quote);
      _outlookRowCache.set(rowKey, row);
      return row;
    });
  }
  const api = { canonical, marketList, impactSeconds, newsKind, newsExpires, newsPhase, selectEvent, eventImpacts, tomorrowWindow, outlook, outlookAll };
  root.DashboardPanels = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);


// ==================== softradex-terminal.js ====================
/**
 * Exness MT5 Pro Chart Terminal
 * Candles, 24h statistics and ticks come straight from the connected Exness
 * MetaTrader 5 account. No exchange feed, no simulated prices, no seed data.
 * Features:
 * - Real-time Candlestick & Volume Canvas Chart with High-DPI support
 * - SMA(7) and SMA(25) Technical Overlays
 * - Dedicated low-latency WebSocket tick stream (/ws/chart)
 * - 24h ticker ribbon (price, change, high, low, tick activity)
 * - Timeframe switching (1m, 5m, 15m, 1h, 4h, 1D)
 * - 100% native, 0% TradingView dependency
 */
(function () {
  'use strict';

  // --- Feed identity --------------------------------------------------
  // Pages can pre-set window.SOFTRADEX_CONFIG to select a feed catalogue.
  const FEED_CFG = (typeof window.SOFTRADEX_CONFIG === 'object' && window.SOFTRADEX_CONFIG) || {};
  const FEED_NAME = FEED_CFG.feedName || 'SoftradeX';
  const SYMBOLS_URL = FEED_CFG.symbolsUrl || '/api/chart/symbols';
  const FEED_WS_PATH = FEED_CFG.wsPath || '/ws/chart';

  // --- Configuration & State ---
  const MARKETS = {};              // filled live from /api/chart/symbols
  const TF_SECONDS = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 };
  const PRICE_AXIS_W = 76;
  let marketsReady = false;
  let feedSource = 'public';
  let pendingSymbol = '';
  let currentSymbol = '';
  let currentInterval = '5m';
  let klines = []; // Array of { time, open, high, low, close, volume, whale?: {...} }
  let tickerData = { price: 0, open24: 0, change: 0, high: 0, low: 0, vol: 0 };
  let chartReady = false;
  let serverOffsetSec = 0;
  let lastTickAt = 0;
  let lastWhaleScan = 0;
  let feed = null;
  let feedReconnectTimer = null;
  let feedRetry = 0;
  let lastFrameAt = 0;             // any frame (tick or heartbeat) proves the socket is alive
  let feedErrorRetryTimer = null;
  let marketsRetryTimer = null;
  let marketsRetryMs = 2000;
  let canvas = null;
  let ctx = null;
  let crosshair = null; // { x, y, candle }
  let dpr = window.devicePixelRatio || 1;

  // Viewport & Interactive Pan / Zoom Navigation State
  let visibleCandlesCount = 55; // Zoom level: how many candles fit in viewport (16 to 220)
  let panOffset = 0;            // Pixels panned back into history (0 = live, > 0 = history)
  let priceZoom = 1;            // Vertical price scale: below 1 zooms into price movement
  let pricePan = 0;             // Vertical price shift, measured in base price-range units
  let isDragging = false;
  let isPriceDragging = false;
  let dragStartX = 0;
  let dragStartPricePan = 0;
  let dragStartPriceY = 0;
  let dragStartPan = 0;
  let hasMovedDuringDrag = false;

  let lastWhaleAlert = null; // kept for the chart alert banner (set from big prints)
  let plannedLevelPrices = [];

  window.addEventListener('bot3:planned-trades', function (event) {
    const planned = (event.detail && event.detail.planned) || [];
    plannedLevelPrices = planned.map((item) => Number(item.price)).filter((price) => isFinite(price) && price > 0);
    if (chartReady) renderChart();
  });

  // Canvas Rounded Rectangle helper
  function drawRoundRect(c, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // Detect Institutional / Whale volume anomalies in historical & incoming klines
  function detectWhaleActivities(list) {
    if (!list || list.length < 5) return;
    const vols = list.map(c => c.volume).filter(v => v > 0);
    if (vols.length < 5) return;
    const sum = vols.reduce((a, b) => a + b, 0);
    const mean = sum / vols.length;
    const variance = vols.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / vols.length;
    const stdDev = Math.sqrt(variance);
    const threshold = mean + 1.25 * stdDev;

    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      // Keep real-time WebSocket verified whale data and the real whale-tape
      // prints intact - those say WHO bought, the volume scan only says WHEN
      // volume was unusual.
      if (c.whale && (c.whale.realtime || c.whale.tape)) continue;

      if (c.volume >= threshold && c.volume > mean * 1.35) {
        const isBull = c.close >= c.open;
        const body = Math.abs(c.close - c.open);
        const lowerWick = Math.min(c.open, c.close) - c.low;
        const upperWick = c.high - Math.max(c.open, c.close);

        let side = isBull ? 'BUY' : 'SELL';
        // Significant wick absorption analysis
        if (lowerWick > body * 1.2 && lowerWick > upperWick) {
          side = 'BUY';
        } else if (upperWick > body * 1.2 && upperWick > lowerWick) {
          side = 'SELL';
        }

        c.whale = {
          side: side,
          vol: c.volume,
          ratio: (c.volume / mean).toFixed(1),
          realtime: false
        };
      }
    }
  }

  // Real big prints (the whale tape) put a 🐋 BUY / 🐋 SELL marker on the exact
  // candle they happened in, at the side the whales took. The tape is the same
  // one the whale board reads, so chart and board can never disagree.
  let whaleTape = null;

  // Candle times arrive in ms from the public feed (and in seconds from MT5),
  // so everything is compared in ms here.
  function tapeMs(v) {
    const n = Number(v);
    if (!(n > 0)) return 0;
    return n < 1e12 ? n * 1000 : n;
  }

  function applyWhaleTape(prints, sym) {
    if (!Array.isArray(prints) || !prints.length) return;
    if (sym && currentSymbol && String(sym) !== String(currentSymbol)) return;
    if (!klines.length) return;
    for (let i = 0; i < prints.length; i++) {
      const p = prints[i];
      const t = tapeMs(p.tm);
      if (!t) continue;
      let idx = -1;
      for (let k = klines.length - 1; k >= 0; k--) {
        if (tapeMs(klines[k].time) <= t) { idx = k; break; }
      }
      if (idx < 0) continue;
      const c = klines[idx];
      if (c.whale && c.whale.realtime) continue;
      c.whale = {
        side: String(p.side || '').toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
        vol: Number(p.ticks) || 0,
        ratio: '',
        px: Number(p.px) || 0,
        tm: Number(p.tm) || 0,
        realtime: false,
        tape: true,
      };
    }
  }

  function $(id) {
    return document.getElementById(id);
  }

  function formatNumber(num, decimals = 2) {
    if (isNaN(num) || num === null || num === undefined) return '--';
    return Number(num).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function formatCompact(num) {
    const n = Number(num);
    if (isNaN(n)) return '--';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return n.toFixed(2);
  }

  function candleOrderFlow(candle) {
    const terminal = window.TradersTerminal;
    if (!terminal || typeof terminal.getCandleFlow !== 'function' || !candle) {
      return { buy: 0, sell: 0 };
    }
    const seconds = TF_SECONDS[currentInterval] || 300;
    try {
      return terminal.getCandleFlow(candle.time, seconds) || { buy: 0, sell: 0 };
    } catch (e) {
      return { buy: 0, sell: 0 };
    }
  }

  function currencyMark() {
    return '$';
  }

  function formatTime(timestamp, interval) {
    // MT5 stamps are server-clock epochs; shift them back to the local clock.
    const d = new Date(Number(timestamp) - serverOffsetSec * 1000);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    if (interval === '1d') {
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${month}/${day}`;
    }
    return `${hh}:${mm}`;
  }

  // --- Calculate Simple Moving Average (SMA) ---
  function computeSMA(data, period) {
    const sma = new Array(data.length).fill(null);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i].close;
      if (i >= period) {
        sum -= data[i - period].close;
        sma[i] = sum / period;
      } else if (i === period - 1) {
        sma[i] = sum / period;
      }
    }
    return sma;
  }

  // --------------------------------------------------------------- helpers
  function escHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
  }

  function normSym(v) {
    return String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function feedLabel() {
    return feedSource === 'public' ? 'Public Feed' : FEED_NAME;
  }

  function setStatus(title, sub, kind) {
    const overlay = $('chart-status-overlay');
    if (!overlay) return;
    if (!title) {
      overlay.hidden = true;
      return;
    }
    overlay.hidden = false;
    overlay.className = 'chart-status-overlay ' + (kind || 'loading');
    const t = $('chart-status-title');
    const s = $('chart-status-sub');
    if (t) t.textContent = title;
    if (s) s.textContent = sub || '';
  }

  let feedPulseStale = false;

  function setFeedPulse(state) {
    const pulse = $('b-term-pulse');
    if (!pulse) return;
    feedPulseStale = (state === 'stale');
    pulse.classList.remove('online', 'stale');
    if (state === 'stale') {
      pulse.classList.add('stale');
      pulse.title = 'Market data paused - the market may be closed or the API is slow';
    } else if (state) {
      pulse.classList.add('online');
      pulse.title = 'Live public API market data';
    } else {
      pulse.title = 'Waiting for public market data…';
    }
  }

  // ------------------------------------------------------- Exness catalog
  async function apiJson(path, timeoutMs) {
    // A wedged request must never stall the chart (or a polling host): every
    // call is bounded, so a slow public feed just fails this round.
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl
      ? setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, Number(timeoutMs) || 15000)
      : null;
    try {
      const resp = await fetch(path, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: ctrl ? ctrl.signal : undefined
      });
      if (!resp.ok) {
        let detail = 'HTTP ' + resp.status;
        try {
          const j = await resp.json();
          if (j && j.detail) detail = j.detail;
        } catch (e) {}
        throw new Error(detail);
      }
      return await resp.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function resolveSymbol(sym) {
    const raw = normSym(sym);
    if (!raw) return '';
    const keys = Object.keys(MARKETS);
    for (const key of keys) {
      if (normSym(key) === raw) return key;
      const alts = (MARKETS[key].alts || []).map(normSym);
      if (alts.indexOf(raw) !== -1) return key;
    }
    const base = raw.replace(/M$/, '').replace(/247$/, '');
    for (const key of keys) {
      if (normSym(key).replace(/M$/, '') === base) return key;
    }
    // Same instrument, different broker suffix (XAUUSD247m -> XAUUSDm, ...)
    if (raw.indexOf('XAU') === 0 && raw.indexOf('GBP') === -1 && MARKETS['XAUUSDm']) return 'XAUUSDm';
    if (raw.indexOf('BTC') === 0 && MARKETS['BTCUSDTm']) return 'BTCUSDTm';
    if (raw.indexOf('ETH') === 0 && MARKETS['ETHUSDm']) return 'ETHUSDm';
    if ((raw.indexOf('NAS') === 0 || raw.indexOf('US100') === 0) && MARKETS['USTECm']) return 'USTECm';
    return '';
  }

  let currentCategory = 'all';
  let marketSearchQuery = '';
  let marketsCollapsed = false;

  function syncMarketListToggle() {
    const tabs = $('binance-symbol-tabs');
    const btn = $('market-list-toggle');
    if (!tabs || !btn) return;
    tabs.classList.toggle('market-list-collapsed', marketsCollapsed);
    const label = marketsCollapsed ? 'Show all markets' : 'Collapse market list';
    btn.setAttribute('aria-expanded', String(!marketsCollapsed));
    btn.setAttribute('aria-label', label);
    btn.title = label;
  }

  function renderSymbolTabs() {
    const tabs = $('binance-symbol-tabs');
    if (!tabs) return;
    const q = (marketSearchQuery || '').trim().toLowerCase();
    const allKeys = Object.keys(MARKETS);
    const keys = allKeys.filter(key => {
      const m = MARKETS[key] || {};
      const kind = (m.kind || 'other').toLowerCase();
      // A search is global: typing "gold" must find gold even while the
      // CRYPTO tab is selected. The category only narrows the plain list.
      if (!q && currentCategory !== 'all' && kind !== currentCategory) {
        return false;
      }
      if (q) {
        const text = (key + ' ' + (m.label || '') + ' ' + (m.pair || '') + ' ' + (m.description || '')).toLowerCase();
        if (text.indexOf(q) === -1) return false;
      }
      return true;
    });

    if (keys.length === 0) {
      const emptyLabel = q ? 'No markets match your search'
        : ('No markets found in ' + currentCategory.toUpperCase());
      tabs.innerHTML = '<span style="font-size:11px;color:#64748b;padding:4px 8px;white-space:nowrap;">' + escHtml(emptyLabel) + '</span>';
      return;
    }

    const rows = keys.map(key => {
      const m = MARKETS[key] || {};
      const isActive = key === currentSymbol;
      return '<button type="button" class="b-tab-btn' + (isActive ? ' active' : '') + '" data-symbol="' + escHtml(key) + '" data-kind="' + escHtml(m.kind || '') + '" title="' +
        escHtml((m.description || key) + ' · ' + feedLabel()) + '">' +
        '<span class="b-icon">' + escHtml(m.icon || '📊') + '</span> ' +
        '<span class="b-sym">' + escHtml(m.label || key) + '</span>' +
        '<span class="b-pair">/' + escHtml(m.pair || 'USD') + '</span></button>';
    }).join('');
    tabs.innerHTML = rows;
    tabs.dataset.ready = '1';
    updateActiveTabs._lastKey = '';
    updateActiveTabs();
  }

  function updateActiveTabs() {
    const tabKey = `${currentSymbol}|${currentInterval}|${currentCategory}`;
    if (updateActiveTabs._lastKey === tabKey) return;
    const symChanged = updateActiveTabs._lastSym !== currentSymbol;
    updateActiveTabs._lastKey = tabKey;
    updateActiveTabs._lastSym = currentSymbol;
    let activeBtn = null;
    document.querySelectorAll('#binance-symbol-tabs .b-tab-btn').forEach(btn => {
      const isAct = btn.dataset.symbol === currentSymbol;
      btn.classList.toggle('active', isAct);
      if (isAct) activeBtn = btn;
    });
    document.querySelectorAll('#binance-tf-tabs .b-tf-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.interval === currentInterval);
    });
    document.querySelectorAll('#exness-cat-tabs .exness-cat-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.cat === currentCategory);
    });
    // Bring the active symbol into the tab strip ONLY when symbol changes,
    // deferred past the style writes to avoid forced synchronous reflow.
    if (symChanged && activeBtn) {
      const targetBtn = activeBtn;
      requestAnimationFrame(() => {
        const strip = document.getElementById('binance-symbol-tabs');
        if (!strip || !targetBtn.isConnected) return;
        try {
          const left = targetBtn.offsetLeft - (strip.clientWidth - targetBtn.offsetWidth) / 2;
          strip.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
        } catch (e) {
          try { strip.scrollLeft = Math.max(0, targetBtn.offsetLeft - strip.clientWidth / 2); } catch (e2) {}
        }
      });
    }
  }

  async function loadMarkets() {
    try {
      const data = await apiJson(SYMBOLS_URL);
      if (!data || !data.available || !data.symbols || !data.symbols.length) {
        setStatus(FEED_NAME + ' API unavailable',
          (data && data.message) || 'Public market data is temporarily unavailable. Check the internet connection and retry.', 'error');
        scheduleMarketsRetry();
        return false;
      }
      feedSource = data.source || 'public';
      const proTag = document.querySelector('#binance-terminal-section .term-pro-tag');
      if (proTag && feedSource === 'public')         proTag.textContent = 'LIVE FEED';
      Object.keys(MARKETS).forEach(k => { delete MARKETS[k]; });
      data.symbols.forEach(m => {
        MARKETS[m.symbol] = Object.assign({}, m, {
          decimals: Number(m.digits) || 2,
          pairLabel: (m.label || m.symbol) + ' / ' + (m.pair || 'USD')
        });
      });
      marketsReady = true;
      marketsRetryMs = 2000;
      if (marketsRetryTimer) {
        clearTimeout(marketsRetryTimer);
        marketsRetryTimer = null;
      }
      renderSymbolTabs();
      const wanted = pendingSymbol ? resolveSymbol(pendingSymbol) : '';
      const first = wanted || resolveSymbol('XAUUSDm') || Object.keys(MARKETS)[0];
      pendingSymbol = '';
      if (first) switchMarket(first, { silent: true });

      return true;
    } catch (err) {
      setStatus(FEED_NAME + ' feed unavailable', String(err && err.message ? err.message : err), 'error');
      scheduleMarketsRetry();
      return false;
    }
  }

  // The terminal can come back (or the account can log in) after the page has
  // already loaded. Keep asking until the catalog is here instead of leaving
  // the chart empty until a manual reload.
  function scheduleMarketsRetry() {
    if (marketsRetryTimer || marketsReady) return;
    marketsRetryTimer = setTimeout(() => {
      marketsRetryTimer = null;
      loadMarkets();
    }, marketsRetryMs);
    marketsRetryMs = Math.min(marketsRetryMs * 2, 10000);
  }

  let chartRafPending = false;

  function scheduleChartRender() {
    if (chartRafPending) return;
    chartRafPending = true;
    requestAnimationFrame(() => {
      chartRafPending = false;
      renderChart();
    });
  }

  // SMA of just the trailing window (identical value to computeSMA's last
  // element, without sweeping the whole candle array on every mouse move).
  function tailSMA(data, period) {
    const n = data.length;
    if (n < period) return null;
    let sum = 0;
    for (let i = n - period; i < n; i++) sum += data[i].close;
    return sum / period;
  }

  // ------------------------------------------------ HTTP polling fallback
  // cPanel / Passenger cannot hold a WebSocket open, so on such a host the same
  // chart is built from the REST endpoints. Everything downstream is shared:
  // a poll produces the exact frame shape the socket sends, so the renderer,
  // whale scan, legend and ticker ribbon need no special case.
  let feedWsFails = 0;
  let pollTimer = null;
  let pollBusy = false;
  let pollCycle = 0;
  let pollTicker = null;
  let pollTickerSymbol = '';

  async function pollFeedOnce() {
    if (document.hidden || pollBusy || !currentSymbol) return;
    pollBusy = true;
    const symbol = currentSymbol;
    const tf = currentInterval;
    // While the TradingView chart draws the candles itself (tv-chart.js),
    // reuse fresh TV quotes and only fetch ticker if quote stream fell behind.
    if (window.SOFT_TV_ACTIVE) {
      try {
        const freshTvq = tvQuoteNow();
        if (freshTvq && window.SOFT_TV_QUOTE && (Date.now() - Number(window.SOFT_TV_QUOTE.at || 0)) < 5000) {
          lastTickAt = Date.now();
          setFeedPulse(true);
          updateTickerDisplay(freshTvq);
          return;
        }
        const ticker = await apiJson('/api/chart/ticker?symbol=' + encodeURIComponent(symbol), 12000);
        if (symbol !== currentSymbol || !ticker) return;
        pollTicker = ticker;
        pollTickerSymbol = symbol;
        lastTickAt = Date.now();
        setFeedPulse(true);
        updateTickerDisplay(ticker);
      } catch (e) {
        setFeedPulse(false);
      } finally {
        // this branch returns early - it must release the guard itself or
        // every later cycle is skipped and the price ribbon freezes
        pollBusy = false;
      }
      return;
    }
    try {
      const data = await apiJson('/api/chart/candles?symbol=' + encodeURIComponent(symbol) +
        '&tf=' + encodeURIComponent(tf) + '&count=360', 20000);
      // The 24h ribbon changes slowly: refreshing it every third cycle keeps
      // the shared host from serving two chart requests every five seconds.
      pollCycle += 1;
      if (pollTickerSymbol !== symbol || pollCycle % 3 === 1) {
        try {
          pollTicker = await apiJson('/api/chart/ticker?symbol=' + encodeURIComponent(symbol), 12000);
          pollTickerSymbol = symbol;
        } catch (e) { /* keep the previous ribbon */ }
      }
      const ticker = pollTickerSymbol === symbol ? pollTicker : null;
      // a symbol/timeframe switch while the request was in flight wins
      if (symbol !== currentSymbol || tf !== currentInterval) return;
      if (!data || !data.bars || !data.bars.length) {
        setStatus('No candles from ' + feedLabel(),
          'The public feed returned no bars for ' + symbol + '.', 'error');
        return;
      }
      lastFrameAt = Date.now();
      lastTickAt = Date.now();
      setFeedPulse(true);
      handleFeedFrame({
        t: 'snap', s: symbol, tf: tf, meta: data.meta, bars: data.bars, ticker: ticker
      });
    } catch (err) {
      setFeedPulse(false);
    } finally {
      pollBusy = false;
    }
  }

  function startPolling() {
    if (pollTimer) return;
    setFeedPulse(true);
    void pollFeedOnce();
    pollTimer = setInterval(() => { void pollFeedOnce(); }, 5000);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  function pollNow() {
    if (pollTimer) void pollFeedOnce();
  }

  // tv-chart.js turns its TradingView chart off (user toggle, or a market
  // TradingView has no symbol for) and asks for one fresh frame: without it
  // the built-in chart would stay on the last picture it had, because the
  // candle fetches were skipped while TradingView was on screen.
  window.addEventListener('chart:refresh', function () {
    if (feed && feed.readyState === WebSocket.OPEN) sendSubscription();
    else pollNow();
  });

  // chart-overlay.js publishes the whale tape every time it refreshes it. The
  // candle chart paints the markers from it (the TradingView frame cannot take
  // drawings, which is why this lives here and not in the overlay).
  window.addEventListener('whale:prints', function (ev) {
    const d = (ev && ev.detail) || {};
    whaleTape = { symbol: d.symbol || '', prints: Array.isArray(d.prints) ? d.prints : [] };
    applyWhaleTape(whaleTape.prints, whaleTape.symbol);
    // Only the candle chart paints these - a repaint while TradingView owns
    // the box would cost a frame and show nothing.
    if (!window.SOFT_TV_ACTIVE && window.SoftradeXTerminal &&
        typeof window.SoftradeXTerminal.refresh === 'function') {
      window.SoftradeXTerminal.refresh();
    }
  });

  // ------------------------------------------------------- live Exness feed
  function connectFeed() {
    if (window.SOFTRADEX_PUBLIC_ONLY) { startPolling(); return; }
    if (window.SOFTRADEX_PUBLIC_ONLY || FEED_CFG.liveStream === false) { startPolling(); return; }
    if (feed && (feed.readyState === WebSocket.CONNECTING || feed.readyState === WebSocket.OPEN)) return;
    if (feedReconnectTimer) {
      clearTimeout(feedReconnectTimer);
      feedReconnectTimer = null;
    }
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let socket;
    try {
      socket = new WebSocket(proto + '//' + location.host + FEED_WS_PATH);
    } catch (err) {
      feedReconnectTimer = setTimeout(connectFeed, 1500);
      return;
    }
    feed = socket;
    socket.onopen = () => {
      feedRetry = 0;
      feedWsFails = 0;
      stopPolling();
      lastFrameAt = Date.now();
      setFeedPulse(true);
      sendSubscription();
    };
    socket.onmessage = (event) => {
      lastFrameAt = Date.now();
      let msg;
      try { msg = JSON.parse(event.data); } catch (e) { return; }
      handleFeedFrame(msg);
    };
    socket.onerror = () => {
      try { socket.close(); } catch (e) {}
    };
    socket.onclose = () => {
      if (feed === socket) feed = null;
      feedWsFails += 1;
      // A WSGI host refuses every upgrade: two dead sockets in a row means
      // "no WebSockets here", so switch the chart to REST polling.
      if (feedWsFails >= 2) startPolling();
      if (!pollTimer) setFeedPulse(false);
      feedRetry = Math.min(feedRetry + 1, 8);
      feedReconnectTimer = setTimeout(connectFeed,
        pollTimer ? 30000 : Math.min(400 * feedRetry, 4000));
    };
  }

  function sendSubscription() {
    pollNow();   // no-op unless the chart is on the REST polling fallback
    if (!feed || feed.readyState !== WebSocket.OPEN || !currentSymbol) return;
    feed.send(JSON.stringify({ type: 'sub', symbol: currentSymbol, tf: currentInterval }));
  }

  function handleFeedFrame(msg) {
    if (!msg || !msg.t) return;
    if (msg.t === 'snap') {
      if (msg.s !== currentSymbol) return;
      if (msg.tf && msg.tf !== currentInterval) return;
      applySnapshot(msg);
    } else if (msg.t === 'tick') {
      if (msg.s !== currentSymbol) return;
      applyTick(msg);
    } else if (msg.t === 'hb') {
      // heartbeat only - onmessage already refreshed lastFrameAt
    } else if (msg.t === 'error') {
      if (msg.s && msg.s !== currentSymbol) return;
      chartReady = false;
      setStatus('Chart error', msg.message || 'The feed could not return this chart.', 'error');
      // The server retries on its own; this is the belt-and-braces path for a
      // terminal that was restarted mid-snapshot.
      if (!feedErrorRetryTimer) {
        feedErrorRetryTimer = setTimeout(() => {
          feedErrorRetryTimer = null;
          if (feed && feed.readyState === WebSocket.OPEN) sendSubscription();
        }, 3000);
      }
    }
  }

  function applySnapshot(msg) {
    const meta = msg.meta || MARKETS[currentSymbol] || {};
    if (meta && meta.symbol) {
      MARKETS[meta.symbol] = Object.assign({}, MARKETS[meta.symbol] || {}, meta, {
        decimals: Number(meta.digits) || 2
      });
    }
    serverOffsetSec = Number(msg.offset) || 0;
    klines = (msg.bars || []).map(b => ({
      time: Number(b[0]),
      open: Number(b[1]),
      high: Number(b[2]),
      low: Number(b[3]),
      close: Number(b[4]),
      volume: Number(b[5]) || 0
    })).filter(c => isFinite(c.time) && isFinite(c.close));
    if (!klines.length) {
      chartReady = false;
      setStatus('No candles from ' + feedLabel(),
        'Check that ' + currentSymbol + ' is available on ' + feedLabel() + '.', 'error');
      return;
    }
    detectWhaleActivities(klines);
    if (whaleTape) applyWhaleTape(whaleTape.prints, whaleTape.symbol);
    chartReady = true;
    lastTickAt = Date.now();
    setStatus('', '', '');
    if (msg.ticker) updateTickerDisplay(msg.ticker);
    const m = MARKETS[currentSymbol] || meta;
    const legendSym = $('b-legend-sym');
    if (legendSym) {
      legendSym.textContent = (m.label || currentSymbol) + ' / ' + (m.pair || 'USD') +
        ' · ' + currentInterval.toUpperCase() +
        (feedSource === 'public' ? ' · PUBLIC' : '');
    }
    renderChart();
    updateLegend(klines[klines.length - 1]);
    window.dispatchEvent(new CustomEvent('chart:snapshot', {
      detail: { symbol: currentSymbol, meta: m, ticker: msg.ticker || null }
    }));
  }

  function applyTick(msg) {
    if (!chartReady || !klines.length) return;
    const price = Number(msg.b) || 0;
    const tm = Number(msg.tm) || 0;
    if (!price || !tm) return;
    const step = (TF_SECONDS[currentInterval] || 300) * 1000;
    const bucket = Math.floor(tm / step) * step;
    const last = klines[klines.length - 1];
    const addVol = Number(msg.d) || 0;
    if (bucket > last.time) {
      klines.push({
        time: bucket,
        open: last.close,
        high: Math.max(last.close, price),
        low: Math.min(last.close, price),
        close: price,
        volume: addVol
      });
      if (klines.length > 1200) klines.shift();
    } else if (bucket === last.time) {
      last.high = Math.max(last.high, price);
      last.low = Math.min(last.low, price);
      last.close = price;
      last.volume = (Number(last.volume) || 0) + addVol;
    } else {
      return;
    }
    lastTickAt = Date.now();
    if (feedPulseStale) setFeedPulse(true);   // a fresh tick proves the stream is alive again
    const now = Date.now();
    if (now - lastWhaleScan > 2500) {
      lastWhaleScan = now;
      detectWhaleActivities(klines);
      if (whaleTape) applyWhaleTape(whaleTape.prints, whaleTape.symbol);
    }
    const open24 = Number(tickerData.open24) || 0;
    updateTickerDisplay({
      price: price,
      change: open24 ? ((price - open24) / open24) * 100 : Number(tickerData.change) || 0
    });
    scheduleChartRender();
    if (!crosshair) updateLegend(last);
  }

  // The embed and the custom indicator panes use the same TV instrument.
  // Hiding the iframe must never switch the header back to a proxy price.
  function tvInstrumentNow() {
    const host = window.TvChartHost;
    return window.SOFT_TV_ACTIVE && host && typeof host.symbolFor === 'function'
      ? host.symbolFor(currentSymbol, MARKETS[currentSymbol] || {}) : '';
  }

  function tvQuoteNow() {
    const q = window.SOFT_TV_QUOTE;
    const instrument = tvInstrumentNow();
    if (!q || !instrument || q.tv_symbol !== instrument) return null;
    if (!(Number(q.price) > 0)) return null;
    if (!q.at || Date.now() - q.at > 25000) return null;
    if (q.symbol && currentSymbol && q.symbol !== currentSymbol) return null;
    return { price: Number(q.price), change: Number(q.change) || 0,
      high: Number(q.high) || 0, low: Number(q.low) || 0 };
  }

  // --- Update Ticker UI ---
  function updateTickerDisplay(data) {
    const elPrice = $('b-live-price');
    const elChange = $('b-live-change');
    const elHigh = $('b-24h-high');
    const elLow = $('b-24h-low');
    const elVol = $('b-24h-vol');

    const meta = MARKETS[currentSymbol] || { decimals: 2 };
    const decimals = meta.decimals;

    const tvq = tvQuoteNow();
    if (tvq) data = { ...data, ...tvq };
    else if (tvInstrumentNow()) {
      // During a TV outage keep its last price; a public ticker for another
      // instrument must not replace it, even when indicators hide the iframe.
      data = { ...data };
      delete data.price;
      delete data.change;
      delete data.high;
      delete data.low;
    }

    if (elPrice && data.price) {
      const oldPrice = tickerData.price;
      elPrice.textContent = formatNumber(data.price, decimals);
      if (oldPrice && oldPrice !== data.price) {
        // No forced reflow: these classes only change the colour (with a CSS
        // transition), and reading offsetWidth on every tick forced a style +
        // layout of the whole page.
        elPrice.classList.remove('tick-up', 'tick-down');
        elPrice.classList.add(data.price > oldPrice ? 'tick-up' : 'tick-down');
      }
    }

    if (elChange && data.change !== undefined) {
      const isPos = data.change >= 0;
      elChange.textContent = (isPos ? '+' : '') + data.change.toFixed(2) + '%';
      elChange.className = 'b-change ' + (isPos ? 'up' : 'down');
    }

    if (elHigh && data.high) {
      elHigh.textContent = formatNumber(data.high, decimals);
    }
    if (elLow && data.low) {
      elLow.textContent = formatNumber(data.low, decimals);
    }
    if (elVol && data.vol) {
      // Exness reports participation as tick volume, not a quote notional.
      elVol.textContent = formatCompact(data.vol);
    }

    tickerData = { ...tickerData, ...data };
  }

  window.addEventListener('chart:tv-visible', function () {
    const q = tvQuoteNow();
    if (q) updateTickerDisplay({ price: q.price, change: q.change });
  });

  // The TradingView quote arrives on its own clock (every few seconds), so the
  // ribbon follows it even between MT5 ticks.
  window.addEventListener('chart:tv-quote', function (ev) {
    const q = ev.detail || {};
    if (!(Number(q.price) > 0)) return;
    if (q.symbol && currentSymbol && q.symbol !== currentSymbol) return;
    updateTickerDisplay({ price: Number(q.price), change: Number(q.change) || 0 });
  });

  // --- Update Legend (OHLCV & SMA) ---
  function updateLegend(candle) {
    if (!candle) return;
    const meta = MARKETS[currentSymbol] || { label: currentSymbol, decimals: 2 };
    const dec = meta.decimals;

    const elSym = $('b-legend-sym');
    const elO = $('b-ohlc-o');
    const elH = $('b-ohlc-h');
    const elL = $('b-ohlc-l');
    const elC = $('b-ohlc-c');
    const elV = $('b-ohlc-v');

    if (elSym) elSym.textContent = `${meta.label} / ${meta.pair || 'USD'} · ${currentInterval.toUpperCase()}` +
      (feedSource === 'public' ? ' · PUBLIC' : '');
    if (elO) elO.textContent = formatNumber(candle.open, dec);
    if (elH) elH.textContent = formatNumber(candle.high, dec);
    if (elL) elL.textContent = formatNumber(candle.low, dec);
    if (elC) {
      elC.textContent = formatNumber(candle.close, dec);
      elC.className = candle.close >= candle.open ? 'txt-up' : 'txt-down';
    }
    if (elV) elV.textContent = formatCompact(candle.volume);

    // Compute only the trailing SMA values for the legend (fast on hot paths)
    if (klines.length > 7) {
      const last7 = tailSMA(klines, 7);
      const last25 = tailSMA(klines, 25);
      const elSma7 = $('b-sma-7');
      const elSma25 = $('b-sma-25');
      if (elSma7 && last7) elSma7.textContent = formatNumber(last7, dec);
      if (elSma25 && last25) elSma25.textContent = formatNumber(last25, dec);
    }

    // Update Whale Flow Status in Legend
    const elWhale = $('b-whale-status');
    const elWhaleTxt = $('b-whale-stat-txt');
    if (elWhale && elWhaleTxt) {
      if (candle && candle.whale) {
        const w = candle.whale;
        const sideTxt = w.side === 'BUY' ? 'BUY (ACCUM)' : 'SELL (DUMP)';
        elWhaleTxt.textContent = `${sideTxt} · ${formatCompact(w.vol)} ${meta.unit || ''}`;
        elWhale.className = 'b-legend-ind whale-ind ' + (w.side === 'BUY' ? 'whale-buy' : 'whale-sell');
      } else {
        elWhaleTxt.textContent = 'SCANNING';
        elWhale.className = 'b-legend-ind whale-ind';
      }
    }
  }

  // --- Render Candlestick Chart on Canvas ---
  function renderChart() {
    if (!canvas || !ctx) return;
    // The canvas is sized by resizeCanvas() (ResizeObserver + window resize).
    // Measuring the box here ran on every tick and forced a full synchronous
    // style + layout of the dashboard (~70 ms) for no visual gain.
    if (!canvas.width || !canvas.height) {
      resizeCanvas();
      if (!canvas.width || !canvas.height) return;
    }

    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    if (width <= 0 || height <= 0 || klines.length === 0) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 1. Clear background
    ctx.fillStyle = isDarkTheme() ? '#0b1220' : '#ffffff';
    ctx.fillRect(0, 0, width, height);

    const priceWidth = PRICE_AXIS_W; // Right axis reservation
    const timeHeight = 22; // Bottom axis reservation
    const chartW = width - priceWidth;
    const chartH = height - timeHeight;
    const volH = Math.min(chartH * 0.22, 60);
    const candleH = chartH - volH;

    const candleSlot = chartW / visibleCandlesCount;
    const candleBarW = Math.max(2, Math.floor(candleSlot * 0.72));
    const rightMarginCandles = 3;
    // The news overlay reserves a future lane on the right (exactly where
    // the next candles will print) so upcoming events can be timed.
    const newsLaneW = (window.ChartNewsOverlay && typeof window.ChartNewsOverlay.laneWidth === 'function')
      ? window.ChartNewsOverlay.laneWidth(chartW) : 0;
    const rightEdgeX = chartW - (rightMarginCandles * candleSlot) - newsLaneW;

    // Helper: calculate X for candle index i (0 = oldest, klines.length - 1 = newest)
    function candleIndexToX(i) {
      return rightEdgeX - ((klines.length - 1 - i) * candleSlot) + panOffset;
    }

    // 2. Calculate Min / Max Price & Volume ONLY for candles currently in view
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let maxVol = 0;
    let visibleCount = 0;

    for (let i = 0; i < klines.length; i++) {
      const c = klines[i];
      const cx = candleIndexToX(i);
      if (cx >= -candleSlot * 2 && cx <= chartW + candleSlot * 2) {
        visibleCount++;
        if (c.low < minPrice) minPrice = c.low;
        if (c.high > maxPrice) maxPrice = c.high;
        if (c.volume > maxVol) maxVol = c.volume;
      }
    }

    if (visibleCount === 0 || minPrice === Infinity || minPrice === maxPrice) {
      for (let i = Math.max(0, klines.length - visibleCandlesCount); i < klines.length; i++) {
        const c = klines[i];
        if (c.low < minPrice) minPrice = c.low;
        if (c.high > maxPrice) maxPrice = c.high;
        if (c.volume > maxVol) maxVol = c.volume;
      }
    }

    if (minPrice === maxPrice || minPrice === Infinity) {
      minPrice = minPrice * 0.99;
      maxPrice = maxPrice * 1.01;
    }

    // Keep the predicted news targets on screen so their price marks and
    // dollar moves stay readable next to the axis.
    if (window.ChartNewsOverlay && typeof window.ChartNewsOverlay.priceBounds === 'function') {
      const nb = window.ChartNewsOverlay.priceBounds({ klines: klines, symbol: currentSymbol });
      if (nb) {
        // Extend only so far: a target $1,100 away must not flatten the
        // candles into a line - it then gets an off-scale axis badge instead.
        const baseSpan = Math.abs(maxPrice - minPrice) || 1;
        if (isFinite(nb.min) && nb.min < minPrice && (minPrice - nb.min) <= baseSpan * 1.5) minPrice = nb.min;
        if (isFinite(nb.max) && nb.max > maxPrice && (nb.max - maxPrice) <= baseSpan * 1.5) maxPrice = nb.max;
      }
    }

    // Keep Bot 3's five planned extreme levels inside the same price scale,
    // so the green BUY and red SELL lines remain visible on market changes.
    plannedLevelPrices.forEach((price) => {
      if (price < minPrice) minPrice = price;
      if (price > maxPrice) maxPrice = price;
    });

    // Add 12% price buffer top and bottom to ensure whale badges have clear margin
    const baseRange = Math.max(maxPrice - minPrice, 0.0000001);
    const baseCenter = (minPrice + maxPrice) / 2;
    const scaledRange = baseRange * priceZoom;
    const viewCenter = baseCenter + pricePan * baseRange;
    const bufTop = scaledRange * 0.12;
    const bufBtm = scaledRange * 0.12;
    const plotMin = viewCenter - scaledRange / 2 - bufBtm;
    const plotMax = viewCenter + scaledRange / 2 + bufTop;
    const plotRange = plotMax - plotMin;

    window.dispatchEvent(new CustomEvent('chart:price-range', {
      detail: { symbol: currentSymbol, min: plotMin, max: plotMax, height: candleH }
    }));

    // Same mapping the candles use, for the indicator layer (MSB-OB, WaveTrend,
    // ICT Killzones): one slot per bar, right edge fixed, pan in pixels.
    window.dispatchEvent(new CustomEvent('chart:geometry', {
      detail: {
        symbol: currentSymbol,
        tf: currentInterval,
        width: width,
        chartW: chartW,
        candleH: candleH,
        slot: candleSlot,
        visible: visibleCandlesCount,
        rightEdgeX: rightEdgeX,
        panOffset: panOffset,
        count: klines.length,
        lastTime: klines.length ? klines[klines.length - 1].time : 0,
        plotMin: plotMin,
        plotMax: plotMax
      }
    }));

    function priceToY(p) {
      return candleH - ((p - plotMin) / plotRange) * candleH;
    }

    // 3. Draw Background Grid Lines
    ctx.strokeStyle = isDarkTheme() ? 'rgba(148, 163, 184, 0.14)' : '#e6edf9';
    ctx.lineWidth = 1;

    // Horizontal Price Grids (4 lines) - tick prices must stay readable on the
    // chart surface and must not fight the last-price badge below
    ctx.fillStyle = isDarkTheme() ? '#94a3b8' : '#475569';
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const gridSteps = 4;
    const lastTagY = klines.length ? priceToY(klines[klines.length - 1].close) : -999;
    for (let g = 0; g <= gridSteps; g++) {
      const y = candleH * (g / gridSteps);
      const priceAtY = plotMax - (g / gridSteps) * plotRange;

      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartW, y);
      ctx.stroke();

      // Right axis tick text - clamped inside the canvas (drawn at y=0 the top
      // label was clipped in half) and skipped where the price badge sits
      const labelY = Math.min(candleH - 8, Math.max(8, y));
      if (Math.abs(labelY - lastTagY) > 12) {
        ctx.fillText(formatNumber(priceAtY, MARKETS[currentSymbol]?.decimals || 2), chartW + 6, labelY);
      }
    }

    // Vertical Time Grids (Dynamic intervals based on zoom level)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const timeStepInterval = Math.max(5, Math.floor(visibleCandlesCount / 6));
    for (let i = 0; i < klines.length; i += timeStepInterval) {
      const x = candleIndexToX(i);
      if (x >= 25 && x <= chartW - 25) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, chartH);
        ctx.stroke();

        ctx.fillText(formatTime(klines[i].time, currentInterval), x, chartH + 5);
      }
    }

    // 4. Draw Volume Histogram
    for (let i = 0; i < klines.length; i++) {
      const x = candleIndexToX(i);
      if (x < -candleSlot || x > chartW + candleSlot) continue;
      const c = klines[i];
      const vRatio = maxVol > 0 ? (c.volume / maxVol) : 0;
      const barH = vRatio * (volH - 6);
      const isUp = c.close >= c.open;
      ctx.fillStyle = isUp ? 'rgba(5, 150, 105, 0.30)' : 'rgba(220, 38, 38, 0.24)';
      ctx.fillRect(x - candleBarW / 2, chartH - barH, candleBarW, barH);
    }

    // 5. Draw SMAs
    const sma7 = computeSMA(klines, 7);
    const sma25 = computeSMA(klines, 25);

    function drawLine(arr, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < klines.length; i++) {
        const val = arr[i];
        if (val === null || val === undefined) continue;
        const x = candleIndexToX(i);
        if (x < -60 || x > chartW + 60) continue;
        const y = priceToY(val);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    drawLine(sma7, '#2563eb'); // Blue SMA7
    drawLine(sma25, '#7c3aed'); // Violet SMA25

    // 5.5. Draw Whale Volumetric Aura Glows
    for (let i = 0; i < klines.length; i++) {
      const c = klines[i];
      if (!c.whale) continue;
      const x = candleIndexToX(i);
      if (x < -50 || x > chartW + 50) continue;
      const isBuy = c.whale.side === 'BUY';
      const auraColor = isBuy ? 'rgba(5, 150, 105, ' : 'rgba(220, 38, 38, ';

      const yHigh = priceToY(c.high);
      const yLow = priceToY(c.low);
      const topY = Math.max(0, yHigh - 14);
      const auraH = Math.min(candleH, (yLow - yHigh) + 28);
      const auraW = Math.max(candleBarW * 2.5, 18);

      const auraGrad = ctx.createRadialGradient(x, (yHigh + yLow) / 2, 2, x, (yHigh + yLow) / 2, Math.max(auraW, auraH / 2));
      auraGrad.addColorStop(0, auraColor + '0.22)');
      auraGrad.addColorStop(0.65, auraColor + '0.06)');
      auraGrad.addColorStop(1, auraColor + '0)');

      ctx.fillStyle = auraGrad;
      ctx.fillRect(x - auraW, topY, auraW * 2, auraH);
    }

    // 6. Draw Candlesticks
    for (let i = 0; i < klines.length; i++) {
      const x = candleIndexToX(i);
      if (x < -candleSlot * 2 || x > chartW + candleSlot * 2) continue;
      const c = klines[i];
      const isUp = c.close >= c.open;
      const color = isUp ? '#059669' : '#dc2626';

      const yOpen = priceToY(c.open);
      const yClose = priceToY(c.close);
      const yHigh = priceToY(c.high);
      const yLow = priceToY(c.low);

      // Wick line
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, yHigh);
      ctx.lineTo(x, yLow);
      ctx.stroke();

      // Body rect
      const topY = Math.min(yOpen, yClose);
      const bodyH = Math.max(1.5, Math.abs(yClose - yOpen));
      ctx.fillStyle = color;
      ctx.fillRect(x - candleBarW / 2, topY, candleBarW, bodyH);
    }

    // 6.25. Show active open BUY/SELL notional on the live candle only.
    // These labels are sourced from the terminal's running positions, never
    // from generated chart volume.
    for (let i = 0; i < klines.length; i++) {
      const c = klines[i];
      // Open-flow totals belong only to the currently forming candle.
      // Historical candles must not retain or display running-position labels.
      if (i !== klines.length - 1) continue;
      const x = candleIndexToX(i);
      if (x < -candleSlot * 2 || x > chartW + candleSlot * 2) continue;
      const flow = candleOrderFlow(c);
      if (!(flow.buy > 0 || flow.sell > 0)) continue;

      const yHigh = priceToY(c.high);
      const yLow = priceToY(c.low);
      const labelYTop = Math.max(11, yHigh - 25);
      const labelYBottom = Math.min(candleH - 11, yLow + 25);
      ctx.save();
      const compact = candleSlot < 32;
      const drawFlowLabel = (text, y, color, direction) => {
        ctx.save();
        ctx.fillStyle = color;
        ctx.font = compact ? 'bold 7px "JetBrains Mono", monospace' : 'bold 8px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (compact) {
          // Narrow candles cannot hold a horizontal label. Rotate it around
          // this candle's x-center so it can never spill into its neighbours.
          ctx.translate(x, y);
          ctx.rotate(direction * Math.PI / 2);
          ctx.fillText(text, 0, 0);
        } else {
          const pad = 4;
          const width = ctx.measureText(text).width + pad * 2;
          ctx.fillStyle = isDarkTheme() ? 'rgba(15, 23, 42, 0.90)' : 'rgba(255, 255, 255, 0.92)';
          ctx.fillRect(x - width / 2, y - 7, width, 14);
          ctx.fillStyle = color;
          ctx.fillText(text, x, y);
        }
        ctx.restore();
      };

      if (flow.buy > 0) {
        drawFlowLabel(`BUY ${currencyMark(currentSymbol)}${formatCompact(flow.buy)}`, labelYTop, '#059669', -1);
      }
      if (flow.sell > 0) {
        drawFlowLabel(`SELL ${currencyMark(currentSymbol)}${formatCompact(flow.sell)}`, labelYBottom, '#dc2626', 1);
      }
      ctx.restore();
    }

    // 6.5. Draw Whale Badges & Anchor Pointers on Candles
    for (let i = 0; i < klines.length; i++) {
      const c = klines[i];
      if (!c.whale) continue;
      const x = candleIndexToX(i);
      if (x < -50 || x > chartW + 50) continue;
      const isBuy = c.whale.side === 'BUY';
      const isLast = (i === klines.length - 1);

      const yHigh = priceToY(c.high);
      const yLow = priceToY(c.low);

      const badgeW = 48;
      const badgeH = 15;
      const badgeX = x - badgeW / 2;
      let badgeY;

      ctx.save();

      if (isBuy) {
        // Whale Buy: Badge positioned BELOW candle lower wick
        badgeY = yLow + 8;

        // Pointer line from low wick tip to badge top
        ctx.strokeStyle = '#059669';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(x, yLow + 1);
        ctx.lineTo(x, badgeY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Badge Container
        drawRoundRect(ctx, badgeX, badgeY, badgeW, badgeH, 3.5);
        ctx.fillStyle = '#dcfce7'; // Soft emerald tint
        ctx.fill();
        ctx.strokeStyle = '#059669';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Badge Text
        ctx.fillStyle = '#059669';
        ctx.font = 'bold 8.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🐋 BUY', x, badgeY + badgeH / 2);
      } else {
        // Whale Sell: Badge positioned ABOVE candle upper wick
        badgeY = yHigh - badgeH - 8;

        // Pointer line from high wick tip to badge bottom
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(x, yHigh - 1);
        ctx.lineTo(x, badgeY + badgeH);
        ctx.stroke();
        ctx.setLineDash([]);

        // Badge Container
        drawRoundRect(ctx, badgeX, badgeY, badgeW, badgeH, 3.5);
        ctx.fillStyle = '#fee2e2'; // Soft ruby tint
        ctx.fill();
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Badge Text
        ctx.fillStyle = '#dc2626';
        ctx.font = 'bold 8.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🐋 SELL', x, badgeY + badgeH / 2);
      }

      // If active candle has live whale trade, draw crisp radar pulse ring
      if (isLast && c.whale.realtime) {
        const pulseY = priceToY(c.close);
        ctx.strokeStyle = isBuy ? '#059669' : '#dc2626';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, pulseY, 7, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    }

    // 6.9. Economic-calendar events: released markers, the future lane on
    // the right and the next-event countdown on the running candle.
    if (window.ChartNewsOverlay && typeof window.ChartNewsOverlay.draw === 'function') {
      window.ChartNewsOverlay.draw({
        ctx: ctx,
        chartW: chartW,
        chartH: chartH,
        candleH: candleH,
        candleSlot: candleSlot,
        rightEdgeX: rightEdgeX,
        klines: klines,
        tfSec: TF_SECONDS[currentInterval],
        priceToY: priceToY,
        candleIndexToX: candleIndexToX,
        laneW: newsLaneW,
        priceWidth: priceWidth,
        symbol: currentSymbol,
      });
    }

    // 7. Draw Current Price Line & Badge
    if (klines.length > 0) {
      const last = klines[klines.length - 1];
      const lastY = priceToY(last.close);
      const isUp = last.close >= last.open;
      const tagColor = isUp ? '#059669' : '#dc2626';

      // Dashed line across chart
      ctx.strokeStyle = tagColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, lastY);
      ctx.lineTo(chartW, lastY);
      ctx.stroke();
      ctx.setLineDash([]); // reset dash

      // Price badge on right axis
      ctx.fillStyle = tagColor;
      ctx.fillRect(chartW + 2, lastY - 9, priceWidth - 4, 18);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(formatNumber(last.close, MARKETS[currentSymbol]?.decimals || 2), chartW + (priceWidth - 4) / 2 + 2, lastY);
    }

    // 7.5. Live / Panned Indicator Badge (Clickable)
    const badgeX = chartW - 80;
    const badgeY = 8;
    const badgeW = 74;
    const badgeH = 20;

    ctx.save();
    drawRoundRect(ctx, badgeX, badgeY, badgeW, badgeH, 4);
    if (panOffset > 10) {
      ctx.fillStyle = 'rgba(37, 99, 235, 0.12)';
      ctx.fill();
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.fillStyle = '#2563eb';
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('▶ TO LIVE', badgeX + badgeW / 2, badgeY + badgeH / 2);
    } else {
      ctx.fillStyle = 'rgba(5, 150, 105, 0.10)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(5, 150, 105, 0.30)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#059669';
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('● LIVE', badgeX + badgeW / 2, badgeY + badgeH / 2);
    }
    ctx.restore();

    // 8. Draw Crosshair Hover Indicator
    if (crosshair && crosshair.x >= 0 && crosshair.x <= chartW && crosshair.y >= 0 && crosshair.y <= chartH) {
      const dark = isDarkTheme();
      const tagBg = dark ? '#1e293b' : '#e2e8f0';
      const tagInk = dark ? '#f1f5f9' : '#0f172a';
      ctx.strokeStyle = dark ? 'rgba(226, 232, 240, 0.35)' : 'rgba(15, 23, 42, 0.35)';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 3]);

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(crosshair.x, 0);
      ctx.lineTo(crosshair.x, chartH);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(0, crosshair.y);
      ctx.lineTo(chartW, crosshair.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Crosshair Price Tag on Right
      const hoveredPrice = plotMax - (crosshair.y / candleH) * plotRange;
      ctx.fillStyle = tagBg;
      ctx.fillRect(chartW + 2, crosshair.y - 8, priceWidth - 4, 16);
      ctx.fillStyle = tagInk;
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(formatNumber(hoveredPrice, MARKETS[currentSymbol]?.decimals || 2), chartW + (priceWidth - 4) / 2 + 2, crosshair.y);

      // Crosshair Time Tag on Bottom
      if (crosshair.candle) {
        const timeText = formatTime(crosshair.candle.time, currentInterval);
        const timeTagW = 60;
        ctx.fillStyle = tagBg;
        ctx.fillRect(crosshair.x - timeTagW / 2, chartH + 2, timeTagW, 16);
        ctx.fillStyle = tagInk;
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(timeText, crosshair.x, chartH + 10);
      }

      // 8.5. If hovered candle is a Whale Candle, show dedicated HUD card
      if (crosshair.candle && crosshair.candle.whale) {
        const hc = crosshair.candle;
        const hw = hc.whale;
        const isBuy = hw.side === 'BUY';
        const cardW = 175;
        const cardH = 76;
        let cardX = crosshair.x + 14;
        if (cardX + cardW > chartW - 10) cardX = crosshair.x - cardW - 14;
        let cardY = Math.max(10, Math.min(chartH - cardH - 10, crosshair.y - cardH / 2));

        ctx.save();
        drawRoundRect(ctx, cardX, cardY, cardW, cardH, 6);
        ctx.fillStyle = dark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255, 255, 255, 0.97)';
        ctx.fill();
        ctx.strokeStyle = isBuy ? '#059669' : '#dc2626';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.font = 'bold 9.5px "JetBrains Mono", monospace';
        ctx.fillStyle = isBuy ? (dark ? '#34d399' : '#059669') : (dark ? '#f87171' : '#dc2626');
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`🐋 WHALE ${isBuy ? 'INFLOW (BUY)' : 'OUTFLOW (SELL)'}`, cardX + 10, cardY + 10);

        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillStyle = dark ? '#94a3b8' : '#64748b';
        ctx.fillText(`Type: ${hw.realtime ? 'LIVE TAKER ORDER' : 'INSTITUTIONAL ACCUM'}`, cardX + 10, cardY + 28);

        const unit = MARKETS[currentSymbol]?.unit || '';
        ctx.fillText(`Whale Vol: `, cardX + 10, cardY + 44);
        ctx.fillStyle = tagInk;
        ctx.fillText(`${formatCompact(hw.vol)} ${unit}`, cardX + 78, cardY + 44);

        ctx.fillStyle = dark ? '#94a3b8' : '#64748b';
        ctx.fillText(`Candle Vol: `, cardX + 10, cardY + 58);
        ctx.fillStyle = tagInk;
        ctx.fillText(`${formatCompact(hc.volume)} ${unit}`, cardX + 78, cardY + 58);

        ctx.restore();
      }
    }

    // 9. Floating Live Whale Alert Flash Banner (if active < 5s)
    if (lastWhaleAlert && Date.now() - lastWhaleAlert.time < 5000) {
      const dark = isDarkTheme();
      const age = Date.now() - lastWhaleAlert.time;
      const opacity = Math.max(0, 1 - age / 5000);
      const isBuy = lastWhaleAlert.side === 'BUY';
      const unit = MARKETS[lastWhaleAlert.symbol]?.unit || '';
      const bannerW = Math.min(340, chartW - 24);
      const bannerH = 26;
      const bannerX = (chartW - bannerW) / 2;
      const bannerY = 12;

      ctx.save();
      ctx.globalAlpha = opacity;
      drawRoundRect(ctx, bannerX, bannerY, bannerW, bannerH, 13);
      ctx.fillStyle = dark ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.95)';
      ctx.fill();
      ctx.strokeStyle = isBuy ? '#059669' : '#dc2626';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.font = 'bold 9.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isBuy ? (dark ? '#34d399' : '#059669') : (dark ? '#f87171' : '#dc2626');
      const alertMsg = `⚡ LIVE WHALE ${lastWhaleAlert.side}: ${formatNumber(lastWhaleAlert.qty, 2)} ${unit} (${currencyMark(lastWhaleAlert.symbol)}${formatCompact(lastWhaleAlert.usd)})`;
      ctx.fillText(alertMsg, bannerX + bannerW / 2, bannerY + bannerH / 2);
      ctx.restore();
    }
  }

  // --- Switch Market Symbol (Exness instrument) ---
  function switchMarket(symbol, opts) {
    if (!marketsReady) {
      pendingSymbol = String(symbol || '');
      return false;
    }
    const key = resolveSymbol(symbol);
    if (!key) return false;
    if (key === currentSymbol && chartReady) return true;
    currentSymbol = key;
    const meta = MARKETS[key] || {};
    const kind = (meta.kind || '').toLowerCase();
    if (kind && currentCategory !== 'all' && currentCategory !== kind && !marketSearchQuery) {
      currentCategory = kind;
      renderSymbolTabs();
    }

    // Reset local data & show loading state (never seed fake candles)
    klines = [];
    crosshair = null;
    panOffset = 0;
    priceZoom = 1;
    pricePan = 0;
    chartReady = false;
    lastTickAt = 0;
    tickerData = { price: 0, open24: 0, change: 0, high: 0, low: 0, vol: 0 };
    updateActiveTabs();

    const legendSym = $('b-legend-sym');
    if (legendSym) {
      legendSym.textContent = (meta.label || key) + ' / ' + (meta.pair || 'USD') +
        ' · ' + currentInterval.toUpperCase();
    }
    setStatus('Loading ' + (meta.label || key) + ' from ' + feedLabel() + '…',
      (feedSource === 'public' ? 'live Binance + Yahoo candles' : 'real MetaTrader 5 candles') +
        ' · ' + currentInterval, 'loading');
    renderChart();

    const priceEl = $('b-live-price');
    if (priceEl) priceEl.textContent = '--';
    const changeEl = $('b-live-change');
    if (changeEl) {
      changeEl.textContent = '--%';
      changeEl.className = 'b-change';
    }
    ['b-24h-high', 'b-24h-low', 'b-24h-vol'].forEach(id => {
      const el = $(id);
      if (el) el.textContent = '--';
    });

    if (!feed || feed.readyState !== WebSocket.OPEN) connectFeed();
    else sendSubscription();
    pollNow();   // REST polling hosts reload immediately on a symbol/TF switch

    // Keep the existing Traders Order Flow Terminal in sync with the chart.
    if (window.TradersTerminal && typeof window.TradersTerminal.switchMarket === 'function') {
      try { window.TradersTerminal.switchMarket(meta.symbol || key); } catch (e) {}
    }
    window.dispatchEvent(new CustomEvent('chart:market', {
      detail: { symbol: meta.symbol || key, meta: meta }
    }));
    return true;
  }

  // --- Switch Timeframe Interval ---
  function switchInterval(interval) {
    if (!TF_SECONDS[interval] || interval === currentInterval) return;
    currentInterval = interval;
    updateActiveTabs();
    panOffset = 0;
    priceZoom = 1;
    pricePan = 0;
    setStatus('Loading ' + currentInterval + ' candles…', feedLabel(), 'loading');
    if (!feed || feed.readyState !== WebSocket.OPEN) connectFeed();
    else sendSubscription();
    pollNow();   // REST polling hosts reload immediately on a symbol/TF switch
    window.dispatchEvent(new CustomEvent('chart:interval', { detail: { tf: currentInterval } }));
  }

  // --- Resize Canvas to Container ---
  function resizeCanvas() {
    const box = $('binance-canvas-box');
    if (!box || !canvas) return;
    dpr = window.devicePixelRatio || 1;
    const bw = box.clientWidth;
    const bh = box.clientHeight;
    if (bw > 0 && bh > 0) {
      const nextW = Math.floor(bw * dpr);
      const nextH = Math.floor(bh * dpr);
      if (canvas.width === nextW && canvas.height === nextH) return;
      canvas.width = nextW;
      canvas.height = nextH;
      canvas.style.width = bw + 'px';
      canvas.style.height = bh + 'px';
      scheduleChartRender();
    }
  }

  // --- Interactive Drag-to-Pan, Mouse Wheel Zoom & Touch Navigation ---
  function setupChartInteractions() {
    if (!canvas) return;

    // Helper: calculate max pan limit
    function getMaxPan() {
      const chartW = (canvas.width / dpr) - PRICE_AXIS_W;
      const candleSlot = chartW / visibleCandlesCount;
      return Math.max(0, (klines.length - 8) * candleSlot);
    }

    // Helper: find candle index at X coordinate
    function getCandleIndexAtX(x) {
      if (klines.length === 0) return -1;
      const chartW = (canvas.width / dpr) - PRICE_AXIS_W;
      const candleSlot = chartW / visibleCandlesCount;
      const rightEdgeX = chartW - (3 * candleSlot);
      const diffFromRight = rightEdgeX + panOffset - x;
      const offsetIndex = Math.round(diffFromRight / candleSlot);
      const idx = klines.length - 1 - offsetIndex;
      return Math.max(0, Math.min(klines.length - 1, idx));
    }

    // --- Mouse Drag to Pan ---
    canvas.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return; // Left click only
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const chartW = (canvas.width / dpr) - PRICE_AXIS_W;
      if (e.clientX - rect.left > chartW) {
        isPriceDragging = true;
        dragStartPriceY = e.clientY;
        dragStartPricePan = pricePan;
        canvas.style.cursor = 'ns-resize';
        return;
      }
      isDragging = true;
      hasMovedDuringDrag = false;
      dragStartX = e.clientX;
      dragStartPan = panOffset;
      canvas.style.cursor = 'grabbing';
    });

    let moveRaf = 0;
    let lastMoveEvt = null;
    let cachedCanvasRect = null;
    let cachedRectAt = 0;
    const resetRect = () => { cachedCanvasRect = null; };
    window.addEventListener('scroll', resetRect, { passive: true });
    window.addEventListener('resize', resetRect, { passive: true });

    window.addEventListener('mousemove', function (e) {
      if (!canvas) return;
      const box = canvas.parentElement;
      if (!isDragging && !isPriceDragging) {
        if (document.hidden || window.SOFT_TV_ACTIVE || (box && box.style.display === 'none')) return;
      }

      if (isPriceDragging) {
        const chartH = (canvas.height / dpr) - 22;
        pricePan = dragStartPricePan - ((e.clientY - dragStartPriceY) / Math.max(chartH, 1)) * (1.2 / priceZoom);
        scheduleChartRender();
        return;
      }

      if (isDragging) {
        e.preventDefault();
        const dx = e.clientX - dragStartX;
        if (Math.abs(dx) > 3) hasMovedDuringDrag = true;
        panOffset = Math.max(0, Math.min(getMaxPan(), dragStartPan + dx));
        scheduleChartRender();
        return;
      }

      lastMoveEvt = e;
      if (moveRaf) return;
      moveRaf = requestAnimationFrame(function () {
        moveRaf = 0;
        const ev = lastMoveEvt;
        if (!ev || !canvas || window.SOFT_TV_ACTIVE) return;
        const now = performance.now();
        if (!cachedCanvasRect || now - cachedRectAt > 300) {
          cachedCanvasRect = canvas.getBoundingClientRect();
          cachedRectAt = now;
        }
        const rect = cachedCanvasRect;
        if (!rect || rect.width <= 0 || rect.height <= 0) return;
        const x = ev.clientX - rect.left;
        const y = ev.clientY - rect.top;
        const chartW = (canvas.width / dpr) - PRICE_AXIS_W;
        const chartH = (canvas.height / dpr) - 22;

        if (x >= 0 && x <= chartW && y >= 0 && y <= chartH && klines.length > 0) {
          const idx = getCandleIndexAtX(x);
          if (idx >= 0 && idx < klines.length) {
            const candle = klines[idx];
            crosshair = { x, y, candle };
            updateLegend(candle);
          } else {
            crosshair = null;
          }
          scheduleChartRender();
        } else if (crosshair) {
          crosshair = null;
          if (klines.length > 0) updateLegend(klines[klines.length - 1]);
          scheduleChartRender();
        }
      });
    }, { passive: true });

    window.addEventListener('mouseup', function () {
      if (isPriceDragging) {
        isPriceDragging = false;
        if (canvas) canvas.style.cursor = 'crosshair';
      }
      if (isDragging) {
        isDragging = false;
        if (canvas) canvas.style.cursor = 'crosshair';
      }
    });

    canvas.addEventListener('mouseleave', function () {
      if (!isDragging) {
        crosshair = null;
        if (klines.length > 0) updateLegend(klines[klines.length - 1]);
        scheduleChartRender();
      }
    });

    // --- Mouse Wheel Zoom ---
    function zoomChart(delta) {
      const previous = visibleCandlesCount;
      visibleCandlesCount = Math.max(16, Math.min(220, visibleCandlesCount + delta));
      const chartW = (canvas.width / dpr) - PRICE_AXIS_W;
      if (visibleCandlesCount !== previous && chartW > 0) {
        const previousSlot = chartW / previous;
        const nextSlot = chartW / visibleCandlesCount;
        panOffset = Math.max(0, Math.min(getMaxPan(), panOffset + chartW * 0.5 * (nextSlot / previousSlot - 1)));
      }
      scheduleChartRender();
    }

    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      if (e.shiftKey) {
        priceZoom = Math.max(0.25, Math.min(3, priceZoom * (e.deltaY < 0 ? 0.9 : 1.1)));
        scheduleChartRender();
        return;
      }
      zoomChart(e.deltaY < 0 ? -4 : 4);
    }, { passive: false });

    const zoomIn = $('chart-zoom-in');
    const zoomOut = $('chart-zoom-out');
    const zoomReset = $('chart-zoom-reset');
    if (zoomIn) zoomIn.addEventListener('click', () => {
      if (window.ChartIndicators && window.ChartIndicators.active && window.ChartIndicators.active().length) {
        window.ChartIndicators.zoomBy(0.82);
        return;
      }
      zoomChart(-4);
    });
    if (zoomOut) zoomOut.addEventListener('click', () => {
      if (window.ChartIndicators && window.ChartIndicators.active && window.ChartIndicators.active().length) {
        window.ChartIndicators.zoomBy(1.22);
        return;
      }
      zoomChart(4);
    });
    if (zoomReset) zoomReset.addEventListener('click', () => {
      if (window.ChartIndicators && window.ChartIndicators.active && window.ChartIndicators.active().length) {
        window.ChartIndicators.resetZoom();
        return;
      }
      visibleCandlesCount = 55;
      panOffset = 0;
      scheduleChartRender();
    });
    const priceUp = $('chart-price-up');
    const priceDown = $('chart-price-down');
    const priceReset = $('chart-price-reset');
    if (priceUp) priceUp.addEventListener('click', () => {
      if (window.ChartIndicators && window.ChartIndicators.active && window.ChartIndicators.active().length && window.ChartIndicators.scaleYBy) {
        window.ChartIndicators.scaleYBy(1.22);
        return;
      }
      pricePan += 0.15;
      scheduleChartRender();
    });
    if (priceDown) priceDown.addEventListener('click', () => {
      if (window.ChartIndicators && window.ChartIndicators.active && window.ChartIndicators.active().length && window.ChartIndicators.scaleYBy) {
        window.ChartIndicators.scaleYBy(0.82);
        return;
      }
      pricePan -= 0.15;
      scheduleChartRender();
    });
    if (priceReset) priceReset.addEventListener('click', () => {
      if (window.ChartIndicators && window.ChartIndicators.active && window.ChartIndicators.active().length) {
        window.ChartIndicators.resetZoom();
        return;
      }
      priceZoom = 1;
      pricePan = 0;
      scheduleChartRender();
    });

    // --- Click: Handle "▶ TO LIVE" Button ---
    canvas.addEventListener('click', function (e) {
      if (hasMovedDuringDrag) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const chartW = (canvas.width / dpr) - PRICE_AXIS_W;
      const badgeX = chartW - 80;
      const badgeY = 8;
      if (x >= badgeX && x <= badgeX + 74 && y >= badgeY && y <= badgeY + 20) {
        panOffset = 0;
        scheduleChartRender();
      }
    });

    // --- Double Click: Reset View ---
    canvas.addEventListener('dblclick', function () {
      panOffset = 0;
      visibleCandlesCount = 55;
      scheduleChartRender();
    });

    // --- Touch Screen Drag & Pinch Zoom ---
    let touchStartX = 0;
    let touchStartPan = 0;
    let touchInitialPinch = 0;
    let touchInitialCount = 55;

    canvas.addEventListener('touchstart', function (e) {
      e.preventDefault();
      if (e.touches.length === 1) {
        isDragging = true;
        hasMovedDuringDrag = false;
        touchStartX = e.touches[0].clientX;
        touchStartPan = panOffset;
      } else if (e.touches.length === 2) {
        isDragging = false;
        touchInitialPinch = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        touchInitialCount = visibleCandlesCount;
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', function (e) {
      e.preventDefault();
      const chartW = (canvas.width / dpr) - PRICE_AXIS_W;
      const candleSlot = chartW / visibleCandlesCount;
      const maxPanOffset = Math.max(0, (klines.length - 8) * candleSlot);

      if (e.touches.length === 1 && isDragging) {
        const dx = e.touches[0].clientX - touchStartX;
        if (Math.abs(dx) > 3) hasMovedDuringDrag = true;
        panOffset = Math.max(0, Math.min(maxPanOffset, touchStartPan + dx));
        scheduleChartRender();
      } else if (e.touches.length === 2 && touchInitialPinch > 0) {
        const currentPinch = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const scale = touchInitialPinch / currentPinch;
        visibleCandlesCount = Math.max(16, Math.min(220, Math.round(touchInitialCount * scale)));
        scheduleChartRender();
      }
    }, { passive: false });

    canvas.addEventListener('touchend', function () {
      isDragging = false;
      touchInitialPinch = 0;
    }, { passive: true });
  }

  // --- Initialize SoftradeX Terminal ---
  function initSoftradeXTerminal() {
    canvas = $('binance-candlestick-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    requestAnimationFrame(resizeCanvas);
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('softradex:theme', scheduleChartRender);
    if (window.ResizeObserver) {
      const box = $('binance-canvas-box');
      if (box) {
        new ResizeObserver(() => resizeCanvas()).observe(box);
      }
    }
    setupChartInteractions();

    // Symbol Tabs Listener
    const symTabs = $('binance-symbol-tabs');
    if (symTabs) {
      symTabs.addEventListener('click', e => {
        const btn = e.target.closest('.b-tab-btn');
        if (!btn || !btn.dataset.symbol) return;
        switchMarket(btn.dataset.symbol);
      });
    }

    const marketListToggle = $('market-list-toggle');
    if (marketListToggle) {
      marketListToggle.addEventListener('click', () => {
        marketsCollapsed = !marketsCollapsed;
        syncMarketListToggle();
        updateActiveTabs();
      });
      syncMarketListToggle();
    }

    // Market Category Tabs Listener
    const catTabs = $('exness-cat-tabs');
    if (catTabs) {
      catTabs.addEventListener('click', e => {
        const btn = e.target.closest('.exness-cat-btn');
        if (!btn || !btn.dataset.cat) return;
        currentCategory = btn.dataset.cat;
        document.querySelectorAll('#exness-cat-tabs .exness-cat-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.cat === currentCategory);
        });
        renderSymbolTabs();
      });
    }

    // Market Search Input Listener
    const searchInp = $('exness-market-search');
    if (searchInp) {
      searchInp.addEventListener('input', e => {
        marketSearchQuery = e.target.value;
        renderSymbolTabs();
      });
    }

    // Timeframe Tabs Listener
    const tfTabs = $('binance-tf-tabs');
    if (tfTabs) {
      tfTabs.addEventListener('click', e => {
        const btn = e.target.closest('.b-tf-btn');
        if (!btn || !btn.dataset.interval) return;
        switchInterval(btn.dataset.interval);
      });
    }

    // Terminal Collapse / Expand Toggle
    const toggleBtn = $('binance-term-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const section = $('binance-terminal-section');
        if (!section) return;
        const isCollapsed = section.classList.toggle('collapsed');
        const icon = $('b-toggle-icon');
        const text = $('b-toggle-text');
        if (icon) icon.textContent = isCollapsed ? '+' : '−';
        if (text) text.textContent = isCollapsed ? 'Expand' : 'Collapse';
        if (!isCollapsed) {
          setTimeout(resizeCanvas, 50);
        }
      });
    }

    // Initial load: live Exness catalog + the tick socket
    loadMarkets();
    connectFeed();

    // Stale-feed watch: if no fresh tick arrives for 45 s (weekend market
    // close, terminal closed), the pulse goes amber instead of pretending.
    // The next real tick flips it straight back to live green.
    setInterval(() => {
      if (!chartReady || !lastTickAt) return;
      if (!feed || feed.readyState !== WebSocket.OPEN) return;
      if (Date.now() - lastTickAt > 45000) setFeedPulse('stale');
    }, 5000);

    // Stream watchdog: frames (ticks or the 1 s server heartbeat) must keep
    // arriving. A half-dead socket (Windows sleep, dropped NAT entry) never
    // fires onclose, so it is closed by force and the reconnect path runs.
    setInterval(() => {
      if (!feed || feed.readyState !== WebSocket.OPEN) return;
      if (lastFrameAt && Date.now() - lastFrameAt > 12000) {
        try { feed.close(); } catch (e) {}
      }
    }, 4000);

    // A page restored from bfcache / a slept machine gets an immediate revive.
    function reviveStream() {
      if (!feed || feed.readyState === WebSocket.CLOSED || feed.readyState === WebSocket.CLOSING) {
        connectFeed();
        return;
      }
      if (feed.readyState === WebSocket.OPEN && lastFrameAt &&
          Date.now() - lastFrameAt > 12000) {
        try { feed.close(); } catch (e) {}
      }
    }
    window.addEventListener('pageshow', reviveStream);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) reviveStream();
    });
  }

  // Global API export for dashboard cross-functional integration
  window.SoftradeXTerminal = window.BinanceTerminal = {
    switchMarket,
    switchInterval,
    connectFeed,
    resolveSymbol,
    hasMarket: (sym) => !!resolveSymbol(sym),
    getCurrentSymbol: () => currentSymbol,
    getInterval: () => currentInterval,
    getMarkets: () => Object.keys(MARKETS),
    getLastTickAt: () => lastTickAt,
    refresh: renderChart,
    // Candles currently carrying a marker from the real whale tape - used by
    // support to confirm the tape reached the chart.
    whaleMarks: () => klines.filter(c => c.whale && c.whale.tape).length,
    MARKETS
  };

  // Auto-init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSoftradeXTerminal);
  } else {
    setTimeout(initSoftradeXTerminal, 100);
  }

})();


// ==================== chart-news-events.js ====================
/**
 * Chart News Events
 * Draws the live economic-calendar / Google-News events (the same feed the
 * "05 · NEXT EVENT" stage renders) straight onto the candlestick chart.
 *
 *  - released events inside the visible history get a thin marker line
 *  - upcoming events are placed at the exact time they will print, inside a
 *    reserved "future" lane on the right of the chart (where the next candles
 *    will appear), with a numbered list of the next headlines
 *  - the running candle carries a live countdown tag of the next event
 *
 * Direction colour: green = UP / BUY, red = DOWN / SELL, amber = WAIT.
 * The overlay never writes to the DOM and never touches the news section.
 */
(function () {
  'use strict';

  const REFRESH_MS = 30000;      // calendar refresh
  const TICK_MS = 15000;         // countdown repaint
  const HORIZON_SEC = 12 * 3600;      // furthest event that gets a rail / price mark
  const LIST_HORIZON_SEC = 72 * 3600; // the side list also shows the next 3 days,
                                      // so weekends (next release on Monday) are never blank
  const PAST_WINDOW_SEC = 2 * 3600;
  const MAX_FUTURE_ROWS = 4;

  const COLORS = { UP: '#059669', DOWN: '#dc2626', WAIT: '#d97706' };
  const IMPACT_ALPHA = { high: 1, medium: 0.72, low: 0.42 };

  let events = [];       // normalised rows, sorted by time
  let upcomingCount = 0; // events inside the drawn horizon (drives the lane)
  let fetching = false;
  let haveSig = '';      // signature of the list this overlay holds (?have=)

  function marketKey(v) {
    return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function marketMatch(a, b) {
    const x = marketKey(a);
    const y = marketKey(b);
    if (!x || !y) return false;
    if (x === y) return true;
    const short = x.length <= y.length ? x : y;
    const long = x.length <= y.length ? y : x;
    return short.length >= 5 && long.indexOf(short) === 0 && long.length - short.length <= 4;
  }

  function normSide(v) {
    const s = String(v || '').toLowerCase();
    if (s === 'buy' || s === 'up' || s === 'bullish') return 'UP';
    if (s === 'sell' || s === 'down' || s === 'bearish') return 'DOWN';
    return '';
  }

  // Predicted impact of the event on the market currently on the chart.
  function impactFor(ev, symbol) {
    const impacts = Array.isArray(ev.impacted) ? ev.impacted : [];
    if (!symbol) return null;
    for (let i = 0; i < impacts.length; i++) {
      if (marketMatch(impacts[i].market, symbol)) return impacts[i];
    }
    return null;
  }

  // Direction of the event for the market currently on the chart, so gold and
  // the same calendar row can disagree without contradicting each other.
  function directionFor(ev, symbol) {
    const imp = impactFor(ev, symbol);
    if (imp) {
      const d = normSide(imp.side) || normSide(imp.direction);
      if (d) return d;
    }
    return normSide(ev.side) || 'WAIT';
  }

  // Dollar / point amount the event is expected to move this market.
  function moveAbs(imp) {
    if (!imp) return 0;
    const raw = imp.move_abs !== undefined ? imp.move_abs : imp.move_dollar;
    const v = Math.abs(Number(raw));
    return isFinite(v) && v > 0 ? v : 0;
  }

  function moveText(imp) {
    if (!imp) return '';
    const first = String(imp.move_text_en || '').trim().split(/\s+/)[0];
    if (/[0-9]/.test(first)) return first;
    const signed = Number(imp.signed_dollar !== undefined ? imp.signed_dollar : imp.move_dollar);
    if (!isFinite(signed) || signed === 0) return '';
    const abs = Math.abs(signed);
    return (signed > 0 ? '+' : '-') + '$' + abs.toFixed(abs >= 100 ? 1 : 2);
  }

  function fmtPrice(p) {
    const abs = Math.abs(p);
    const dec = abs >= 100 ? 2 : abs >= 1 ? 4 : 5;
    return p.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  function visibleFuture(nowSec) {
    const out = [];
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (window.DashboardPanels.newsPhase(e, nowSec) !== 'upcoming') continue;
      if (e.ts < nowSec - 300 || e.ts > nowSec + LIST_HORIZON_SEC) continue;
      out.push(e);
    }
    if (!out.length) return out;
    // High/medium events keep the chart readable; low-impact rows only show
    // when the calendar has nothing stronger queued.
    const strong = out.filter(e => e.impact !== 'low');
    return (strong.length ? strong : out).slice(0, MAX_FUTURE_ROWS);
  }

  function visiblePast(nowSec, firstCandleTs) {
    const out = [];
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (window.DashboardPanels.newsPhase(e, nowSec) !== 'running') continue;
      if (e.ts > nowSec || e.ts < nowSec - PAST_WINDOW_SEC) continue;
      if (firstCandleTs && e.ts < firstCandleTs) continue;
      if (e.impact === 'low') continue;
      out.push(e);
    }
    return out;
  }

  function refreshUpcoming() {
    // The lane exists whenever the side list has rows - including the Monday
    // releases while the market is still closed on Saturday/Sunday.
    upcomingCount = visibleFuture(Date.now() / 1000).length;
  }

  // Width the chart reserves on the right for the upcoming-event lane.
  function laneWidth(chartW) {
    if (!upcomingCount) return 0;
    if (!chartW || chartW < 420) return 0;
    return Math.min(196, Math.max(150, Math.round(chartW * 0.2)));
  }

  async function refreshNews() {
    const access = window.SoftradeXStateAccess;
    if (!access || !access.ready || fetching) return;
    const revision = access.revision;
    fetching = true;
    try {
      const res = await fetch('/api/state' + (haveSig ? '?have=' + encodeURIComponent(haveSig) : ''),
        { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const st = await res.json();
      if (!access.ready || access.revision !== revision) return;
      const rows = (st && st.bot5 && Array.isArray(st.bot5.news)) ? st.bot5.news : null;
      // A poll that answers "news_omitted" (the cPanel-safe state feed leaves
      // out the 1 MB calendar when the browser already holds it) must not be
      // read as an empty calendar - keep the last list instead.
      if (!rows) {
        refreshUpcoming();
        return;
      }
      if (st.bot5 && st.bot5.news_sig) haveSig = st.bot5.news_sig;
      const next = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const ts = Number(r && r.ts);
        if (!(ts > 0)) continue;
        next.push({
          ...r,
          ts: ts,
          title: String(r.title || r.event || '—'),
          currency: String(r.currency || ''),
          impact: String(r.impact || 'low').toLowerCase(),
          kind: window.DashboardPanels.newsKind(r),
          impact_window_sec: window.DashboardPanels.impactSeconds(r),
          side: r.side || '',
          impacted: Array.isArray(r.impacted_markets) ? r.impacted_markets : [],
          forecast: r.forecast || '',
          previous: r.previous || '',
        });
      }
      next.sort((a, b) => a.ts - b.ts);
      events = next;
      refreshUpcoming();
      repaint();
    } catch (e) {
      // Keep the last good calendar; the chart simply redraws it.
    } finally {
      fetching = false;
      if (access.ready && access.revision !== revision) void refreshNews();
    }
  }

  function repaint() {
    if (window.SoftradeXTerminal && typeof window.SoftradeXTerminal.refresh === 'function') {
      window.SoftradeXTerminal.refresh();
    }
  }

  function fmtClock(ts) {
    const d = new Date(ts * 1000);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return h + ':' + m;
  }

  function fmtCountdown(minutes) {
    const mins = Math.max(0, Math.round(minutes));
    if (mins < 60) return mins + 'm';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h < 24) return m ? h + 'h ' + m + 'm' : h + 'h';
    const d = Math.floor(h / 24);
    return d + 'd ' + (h % 24) + 'h';
  }

  function trimToWidth(ctx, text, maxW) {
    if (maxW <= 8) return '';
    if (ctx.measureText(text).width <= maxW) return text;
    let cut = text;
    while (cut.length > 1 && ctx.measureText(cut + '…').width > maxW) {
      cut = cut.slice(0, -1);
    }
    return cut + '…';
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  // Price levels the chart must keep on screen: the projected targets of the
  // next releases that carry a move for the current market.
  function priceBounds(args) {
    const klines = args && args.klines;
    if (!klines || !klines.length) return null;
    const nowSec = Date.now() / 1000;
    const close = Number(klines[klines.length - 1].close);
    if (!(close > 0)) return null;
    let lo = Infinity;
    let hi = -Infinity;
    let n = 0;
    for (let i = 0; i < events.length && n < 2; i++) {
      const e = events[i];
      if (window.DashboardPanels.newsPhase(e, nowSec) === 'expired' || e.kind === 'headline') continue;
      if (e.ts < nowSec - 60 || e.ts > nowSec + HORIZON_SEC || e.impact === 'low') continue;
      const imp = impactFor(e, args.symbol);
      const dist = moveAbs(imp);
      if (!dist) continue;
      const dir = directionFor(e, args.symbol);
      if (dir === 'WAIT') continue;
      const target = close + (dir === 'UP' ? dist : -dist);
      lo = Math.min(lo, target);
      hi = Math.max(hi, target);
      n++;
    }
    return n ? { min: lo, max: hi } : null;
  }

  function draw(v) {
    const ctx = v.ctx;
    if (!ctx || !v.klines || !v.klines.length || !(v.candleSlot > 0)) return;
    if (!events.length) return;

    const chartW = v.chartW;
    const chartH = v.chartH;
    const lastIdx = v.klines.length - 1;
    const lastCandle = v.klines[lastIdx];
    const tfSec = v.tfSec || 300;
    const nowSec = Date.now() / 1000;
    const future = visibleFuture(nowSec);
    // Only the next 12h get vertical time rails; a Monday event is listed but
    // its rail would be meaningless on a 5m chart.
    const rails = future.filter(e => e.ts - nowSec <= HORIZON_SEC);
    const past = visiblePast(nowSec, v.klines[0].time);
    if (!future.length && !past.length) return;

    const xNow = v.candleIndexToX(lastIdx);
    const midTs = lastCandle.time + tfSec / 2;
    const xOfTs = ts => xNow + ((ts - midTs) * v.candleSlot) / tfSec;
    const laneW = v.laneW || 0;

    ctx.save();
    ctx.lineWidth = 1;

    // ---- released events inside the visible history -------------------
    for (let i = 0; i < past.length; i++) {
      const e = past[i];
      const x = xOfTs(e.ts);
      if (x < 6 || x > chartW - 6) continue;
      const dir = directionFor(e, v.symbol);
      const color = COLORS[dir] || COLORS.WAIT;
      const alpha = IMPACT_ALPHA[e.impact] || 0.5;

      ctx.globalAlpha = 0.16 * alpha;
      ctx.strokeStyle = color;
      ctx.setLineDash([2, 5]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, chartH);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.globalAlpha = 0.5 * alpha;
      ctx.fillStyle = color;
      ctx.font = '7px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(dir === 'UP' ? '▲' : dir === 'DOWN' ? '▼' : '•', x, 2);
    }

    ctx.globalAlpha = 1;

    // ---- upcoming events: the reserved future lane --------------------
    if (laneW > 0 && future.length) {
      const rows = future;
      const rowH = 26;
      const listH = rows.length * rowH + 20;
      const listTop = chartH - listH;
      const x0 = chartW - laneW + 5;

      const darkOverlay = isDarkTheme();
      ctx.fillStyle = darkOverlay ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.90)';
      roundRect(ctx, chartW - laneW - 1, listTop, laneW + 1, listH, 4);
      ctx.fill();
      ctx.strokeStyle = darkOverlay ? 'rgba(96, 165, 250, 0.25)' : 'rgba(37, 99, 235, 0.18)';
      ctx.stroke();

      ctx.fillStyle = darkOverlay ? '#94a3b8' : '#64748b';
      ctx.font = 'bold 8px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('FUTURE NEWS · UP / DOWN', x0, listTop + 9);

      // Rails spread across the lane in real time order: the nearest release
      // sits next to the running candle, the furthest at the right edge, so a
      // quiet 5m chart can still show events that are hours away.
      const maxX = chartW - 8;
      const laneStart = chartW - laneW + 8;
      const span = Math.max(20, maxX - laneStart);
      const railLast = rails.length ? rails[rails.length - 1].ts : nowSec + 60;
      const horizonMin = Math.max(60, Math.min(720, (railLast - nowSec) / 60));
      const placed = rails.map((e) => {
        const dir = directionFor(e, v.symbol);
        const mins = Math.max(0, (e.ts - nowSec) / 60);
        return {
          x: laneStart + span * Math.min(1, mins / horizonMin),
          e: e,
          dir: dir,
          color: COLORS[dir] || COLORS.WAIT,
          alpha: IMPACT_ALPHA[e.impact] || 0.5,
        };
      });
      for (let i = 1; i < placed.length; i++) {
        if (placed[i].x < placed[i - 1].x + 26) placed[i].x = placed[i - 1].x + 26;
      }
      const over = placed.length ? placed[placed.length - 1].x - maxX : 0;
      if (over > 0) {
        for (let i = 0; i < placed.length; i++) {
          placed[i].x = Math.max(laneStart, placed[i].x - over);
        }
      }

      for (let i = 0; i < rows.length; i++) {
        const e = rows[i];
        const dir = directionFor(e, v.symbol);
        const color = COLORS[dir] || COLORS.WAIT;
        const rowTop = listTop + 18 + i * rowH;
        const line1 = rowTop + 7;
        const line2 = rowTop + 17;

        // ---- list row: time · direction · countdown, then the headline
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x0 + 4, line1, e.impact === 'high' ? 4.5 : 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = isDarkTheme() ? '#e2e8f0' : '#334155';
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(fmtClock(e.ts), x0 + 11, line1);

        ctx.fillStyle = color;
        ctx.font = 'bold 8px "JetBrains Mono", monospace';
        const dirTxt = dir === 'UP' ? '▲ UP' : dir === 'DOWN' ? '▼ DOWN' : '• WAIT';
        ctx.fillText(dirTxt, x0 + 42, line1);

        const mins = (e.ts - nowSec) / 60;
        ctx.fillStyle = isDarkTheme() ? 'rgba(148, 163, 184, 0.95)' : 'rgba(100, 116, 139, 0.95)';
        ctx.font = '7.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillText('in ' + fmtCountdown(mins), chartW - 5, line1);

        // expected dollar / point move, then the headline
        const mv = moveText(impactFor(e, v.symbol));
        let titleX = x0;
        if (mv) {
          ctx.fillStyle = color;
          ctx.font = 'bold 7.5px "JetBrains Mono", monospace';
          ctx.textAlign = 'left';
          ctx.fillText(mv, x0, line2);
          titleX = x0 + ctx.measureText(mv).width + 5;
        }
        ctx.fillStyle = isDarkTheme() ? 'rgba(226, 232, 240, 0.88)' : 'rgba(51, 65, 85, 0.85)';
        ctx.font = '7.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(trimToWidth(ctx, e.title, chartW - 5 - titleX), titleX, line2);
      }

      // ---- vertical rails at the exact future time
      for (let i = 0; i < placed.length; i++) {
        const p = placed[i];
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.alpha > 0.8 ? 1.6 : 1.2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(p.x, 34);
        ctx.lineTo(p.x, listTop - 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // arrow head at both ends of the rail so the column is readable
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(p.x - 3.5, 34);
        ctx.lineTo(p.x + 3.5, 34);
        ctx.lineTo(p.x, 39);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(p.x - 3, listTop - 6);
        ctx.lineTo(p.x + 3, listTop - 6);
        ctx.lineTo(p.x, listTop - 1);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.globalAlpha = 1;

    // ---- projected target price marks ---------------------------------
    // The axis badge carries the exact level the event is expected to reach
    // plus the dollar / point move, for the two nearest releases.
    const marks = [];
    const liveY = v.priceToY(lastCandle.close);
    // Price marks are taken from the nearest releases that actually carry a
    // predicted move for THIS market, so gold can skip an AUD/JPY print that
    // has no gold forecast and pick the next USD one instead.
    const markSources = [];
    for (let i = 0; i < events.length && markSources.length < 6; i++) {
      const e = events[i];
      if (window.DashboardPanels.newsPhase(e, nowSec) === 'expired' || e.kind === 'headline') continue;
      if (e.ts < nowSec - 60 || e.ts > nowSec + HORIZON_SEC || e.impact === 'low') continue;
      if (!impactFor(e, v.symbol)) continue;
      markSources.push(e);
    }
    for (let i = 0; i < markSources.length && marks.length < 2; i++) {
      const e = markSources[i];
      const imp = impactFor(e, v.symbol);
      const dist = moveAbs(imp);
      if (!dist) continue;
      const dir = directionFor(e, v.symbol);
      if (dir === 'WAIT') continue;
      const target = lastCandle.close + (dir === 'UP' ? dist : -dist);
      const rawY = v.priceToY(target);
      const offScale = rawY < 12 || rawY > v.candleH - 16;
      const y = Math.max(12, Math.min(v.candleH - 16, rawY));
      if (Math.abs(y - liveY) < 20) continue;
      if (marks.some(m => Math.abs(m.y - y) < 24)) continue;
      marks.push({
        y: y, e: e, dir: dir, color: COLORS[dir], mv: moveText(imp),
        target: target, offScale: offScale,
      });
    }
    for (let i = 0; i < marks.length; i++) {
      const m = marks[i];
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      // A target outside the visible price range is not a level on this screen,
      // so it only gets a stub next to the axis instead of a full-width line.
      ctx.moveTo(m.offScale ? chartW - 34 : 0, m.y);
      ctx.lineTo(chartW, m.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      if (!m.offScale) {
        ctx.fillStyle = isDarkTheme() ? 'rgba(148, 163, 184, 0.95)' : 'rgba(100, 116, 139, 0.95)';
        ctx.font = '7.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        const label = fmtClock(m.e.ts) + '  ' + m.mv + '  ' + (m.e.currency || '') + ' ' + (m.e.title || '');
        ctx.fillText(trimToWidth(ctx, label, chartW * 0.6), 4, m.y - 2);
      }

      const axisW = (v.priceWidth || 76) - 4;
      ctx.fillStyle = m.color;
      roundRect(ctx, chartW + 2, m.y - 11, axisW, 22, 3);
      ctx.fill();
      ctx.fillStyle = '#071018';
      ctx.font = 'bold 8px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const priceTxt = (m.offScale ? (m.dir === 'UP' ? '▲ ' : '▼ ') : '') + fmtPrice(m.target);
      ctx.fillText(priceTxt, chartW + 2 + axisW / 2, m.y - 4);
      ctx.font = 'bold 7px "JetBrains Mono", monospace';
      ctx.fillText(m.mv, chartW + 2 + axisW / 2, m.y + 6);
    }

    // ---- next event on the running candle -----------------------------
    if (future.length) {
      const next = future[0];
      const dir = directionFor(next, v.symbol);
      const color = COLORS[dir] || COLORS.WAIT;
      const mins = (next.ts - nowSec) / 60;
      const nextMove = moveText(impactFor(next, v.symbol));
      const label = (dir === 'UP' ? '▲ UP ' : dir === 'DOWN' ? '▼ DOWN ' : '• WAIT ') +
        (mins >= 0 ? fmtCountdown(mins) : 'NOW') + (nextMove ? ' · ' + nextMove : '');

      ctx.font = 'bold 8px "JetBrains Mono", monospace';
      const tw = ctx.measureText(label).width + 10;
      // Keep the tag on the candle side of the lane so it never hides the
      // future-news list that lives on the right edge.
      const laneStart = laneW > 0 ? chartW - laneW : chartW;
      let tx = xNow + 8;
      if (tx + tw > laneStart - 6) tx = xNow - tw - 8;
      if (tx < 4) tx = Math.max(4, laneStart - tw - 6);
      const ty = Math.max(8, Math.min(chartH - 16, v.priceToY(lastCandle.close) + 14));

      ctx.fillStyle = isDarkTheme() ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.92)';
      roundRect(ctx, tx, ty, tw, 13, 3);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, tx + tw / 2, ty + 7);
    }

    ctx.restore();
  }

  window.ChartNewsOverlay = {
    laneWidth, draw, priceBounds, refresh: refreshNews, getEvents: () => events.slice(),
  };

  window.addEventListener('softradex:state-access', () => {
    if (window.SoftradeXStateAccess && window.SoftradeXStateAccess.ready) {
      void refreshNews();
    } else {
      events = [];
      haveSig = '';
      upcomingCount = 0;
      repaint();
    }
  });

  refreshNews();
  setInterval(() => { if (!document.hidden) refreshNews(); }, REFRESH_MS);
  setInterval(() => {
    if (document.hidden || window.SOFT_TV_ACTIVE) return;
    refreshUpcoming();
    repaint();
  }, TICK_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { refreshNews(); if (!window.SOFT_TV_ACTIVE) repaint(); }
  });
  window.addEventListener('softradex:theme', () => {
    if (!window.SOFT_TV_ACTIVE) repaint();
  });
})();


// ==================== news-list-renderer.js ====================
/* Build the complete calendar in short tasks, only while its drawer is visible. */
(function (root) {
  'use strict';
  function create(options) {
    const element = options.element;
    const hasIdle = typeof root.requestIdleCallback === 'function';
    const schedule = options.schedule || (hasIdle ? (fn => root.requestIdleCallback(fn, { timeout: 60 })) : (fn => setTimeout(fn, 16)));
    const cancel = options.cancel || (hasIdle ? (id => root.cancelIdleCallback(id)) : clearTimeout);
    const visible = options.visible || (() => true);
    const batchSize = options.batchSize || 24;
    let timer = null, job = null, key = null;
    function pause() {
      if (timer !== null) cancel(timer);
      timer = null;
    }
    function step() {
      timer = null;
      if (!job || !visible()) return;
      const current = job;
      if (current.index === 0) element.innerHTML = '';
      const end = Math.min(current.index + batchSize, current.rows.length);
      const html = current.rows.slice(current.index, end).map(current.render).join('');
      if (html) element.insertAdjacentHTML('beforeend', html);
      current.index = end;
      if (current.scroll && (element.scrollHeight >= current.scroll + element.clientHeight || end === current.rows.length)) {
        element.scrollTop = current.scroll;
      }
      if (!current.rows.length) element.innerHTML = options.empty || '';
      if (end < current.rows.length) resume();
      else { job = null; if (options.complete) options.complete(); }
    }
    function resume() {
      if (job && timer === null && visible()) timer = schedule(step);
    }
    function update(rows, nextKey, render) {
      if (key !== nextKey) {
        pause();
        key = nextKey;
        job = {rows: rows.slice(), render, index: 0, scroll: element.scrollTop};
      }
      resume();
    }
    return {update, pause, resume};
  }
  root.NewsListRenderer = {create};
  if (typeof module !== 'undefined' && module.exports) module.exports = {create};
})(typeof window === 'undefined' ? globalThis : window);


// ==================== app.js ====================
/* ==========================================================================
   Exness Trading Dashboard - frontend
   Plain JS (no build step) + WebSocket. Only changed DOM nodes are touched,
   so updates stay smooth even at 10 messages/second.
   ========================================================================== */
'use strict';

/* ------------------------------------------------------------- utilities */
const $ = (id) => document.getElementById(id);
const el = (sel, root = document) => root.querySelector(sel);

const nfLocale = (v, d = 2) => {
  if (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) return '—';
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
};
// Fast twin of nfLocale: toLocaleString costs ~0.25ms per call and the dials,
// ticker and curve axes call nf() several hundred times per second. Same
// output - grouped thousands, exactly d decimals - built with string maths.
const nf = (v, d = 2) => {
  if (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  const neg = n < 0 || Object.is(n, -0);   // Intl renders -0 as "-0.00"
  let s = Math.abs(n).toString();
  if (s.indexOf('e') !== -1 || s.indexOf('E') !== -1) {
    // extreme magnitudes fall back to the locale formatter (same as before)
    return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  const dot = s.indexOf('.');
  let ip = dot === -1 ? s : s.slice(0, dot);
  let fp = dot === -1 ? '' : s.slice(dot + 1);
  if (fp.length > d) {
    // half-expand on the shortest round-trip decimal - exactly what
    // Intl.NumberFormat does (1.005 -> "1.01", not toFixed's "1.00")
    let digits = ip + fp.slice(0, d);
    if (fp.charCodeAt(d) - 48 >= 5) {
      const arr = digits.split('');
      let i = arr.length - 1;
      while (i >= 0) {
        if (arr[i] === '9') { arr[i] = '0'; i--; }
        else { arr[i] = String.fromCharCode(arr[i].charCodeAt(0) + 1); break; }
      }
      if (i < 0) arr.unshift('1');
      digits = arr.join('');
    }
    const intLen = digits.length - d;
    ip = intLen > 0 ? digits.slice(0, intLen) : '0';
    fp = d > 0 ? (intLen > 0 ? digits.slice(intLen) : digits.padStart(d, '0')) : '';
  } else {
    fp = fp.padEnd(d, '0');
  }
  const frac = d > 0 ? '.' + fp : '';
  let out = '';
  for (let i = 0; i < ip.length; i++) {
    if (i > 0 && (ip.length - i) % 3 === 0) out += ',';
    out += ip[i];
  }
  return (neg ? '-' : '') + out + frac;
};
const signed = (v, d = 2) => {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  return (n > 0 ? '+' : '') + nf(n, d);
};
const fmtPrice = (v) => {
  if (v === null || v === undefined || v === '' || Number(v) === 0) return '—';
  const n = Math.abs(Number(v));
  if (n >= 1000) return nf(v, 2);
  if (n >= 100) return nf(v, 2);
  if (n >= 10) return nf(v, 3);
  return nf(v, 5);
};
const pad = (n) => String(n).padStart(2, '0');
// MT5 epochs are "server clock" values -> render them in UTC so they match the terminal
const dtUtc = (ts) => new Date(Number(ts) * 1000);
const timeStr = (ts) => {
  if (!ts) return '—';
  const d = dtUtc(ts);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
};
const dateStr = (ts) => {
  if (!ts) return '—';
  const d = dtUtc(ts);
  const today = new Date();
  const sameDay = d.getUTCFullYear() === today.getUTCFullYear() && d.getUTCMonth() === today.getUTCMonth() && d.getUTCDate() === today.getUTCDate();
  return `${sameDay ? '' : pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1) + ' '}${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
};
const durStr = (a, b) => {
  if (!a || !b || b < a) return '—';
  let s = b - a;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${s}s`;
};
const valClass = (v) => (Number(v) > 0 ? 'value-win' : Number(v) < 0 ? 'value-loss' : 'flat-color');
const rowClass = (v) => (Number(v) > 0 ? 'row-win' : Number(v) < 0 ? 'row-loss' : '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------------------------------------------------------- i18n */
const I18N = {
  en: {
    serverTime: 'Server time', disconnected: 'Disconnected', connected: 'Connected',
    connecting: 'Connecting…', errorState: 'Error', account: 'Account', balance: 'Balance',
    equity: 'Equity', margin: 'Margin', freeMargin: 'Free margin', marginLevel: 'Margin level',
    leverage: 'Leverage', unlimited: 'Unlimited', today: 'Today', session: 'Session', totalProfitToday: 'Total profit today',
    wins: 'Profitable trades', losses: 'Losing trades', winRate: 'Win rate', floating: 'Floating P/L',
    profitFactor: 'Profit factor', bestWorst: 'Best / Worst', volume: 'Lots traded',
    openPositions: 'Open positions', symbol: 'Symbol', side: 'Side', lots: 'Lots',
    openPrice: 'Open', currentPrice: 'Current', sl: 'S/L', tp: 'T/P', swap: 'Swap',
    profit: 'P/L', opened: 'Opened', noPositions: 'No open positions right now.',
    activity: 'Activity', tradeHistory: 'Trade history', allTime: 'All time', allResults: 'All results',
    winsOnly: 'Wins only', lossesOnly: 'Losses only', exportCsv: 'Export CSV', closeTime: 'Close time',
    closePrice: 'Close', commission: 'Comm.', netPL: 'Net P/L', magic: 'Magic', comment: 'Comment',
    duration: 'Duration', noHistory: 'No closed trades in this range yet.', loadMore: 'Load more',
    settingsTitle: 'Settings', pollInterval: 'Live refresh (ms)', historyRefresh: 'History sync (ms)',
    historyDays: 'History depth (days)', save: 'Save', close: 'Close', disconnect: 'Disconnect',
    connectTitle: 'SoftradeX Account Login', connect: 'Login',
    viewDashboard: 'View Dashboard',
    login: 'Login (account number)', password: 'Password', server: 'Server',
    serverPick: 'Please choose your Exness server…',
    serverReal: 'Exness Real accounts',
    serverTrial: 'Exness Demo / Trial accounts',
    serverOther: 'Other server (type it manually)…',
    serverHint: 'Choose your Exness server from the list.',
    serverHintCustom: 'Type the exact server name, e.g. Exness-MT5Real6',
    needLogin: 'Enter your Exness account number',
    mt5Ready: 'MT5 terminal ready:',
    mt5ReadySub: 'the dashboard starts it and logs in for you — no need to open it.',
    mt5NoExness: 'MT5 terminal found (any MT5 build can log in to Exness).',
    mt5Missing: 'No MetaTrader 5 terminal found on this PC.',
    mt5Download: 'Exness MT5 →',
    mt5DownloadPlain: 'MetaTrader 5 →',
    mt5Recheck: 'Re-check',
    marketLiveTicker: 'MARKET LIVE',
    liveRatesTitle: 'LIVE MARKET RATES',
    realtimeStreaming: '24/7 STREAM',
    priceCurvesTitle: 'Market Price Curves',
    priceCurvesSub: 'Real-time price curve & live WebSocket stream',
    watchTitle: 'Market Pressure Watch Dials',
    watchSubtitle: 'Live candle volume & buyer/seller pressure gauge (streamed - no refresh timer)',
    flowLive: 'LIVE',
    flowStepMarket: 'Market', flowStepMarketHint: 'pick one market - every stage below follows it',
    flowHeroEyebrow: 'START HERE · SELECT YOUR MARKET',
    flowSignalSub: 'the AI is still reading the flow',
    flowCurveTitle: 'Live curve', flowCurveSub: 'selected market · tick by tick',
    flowStepDial: 'Traders order flow', flowStepDialHint: 'every print of the market you selected',
    flowStepSetups: 'Next setups', flowStepSetupsHint: 'the next 5 extreme executions, recalculated every 60 s',
    flowStepNews: 'Next event', flowStepNewsHint: 'impact level + countdown to the release',
    flowStepSessions: 'Sessions', flowStepSessionsHint: 'live clocks, buy/sell bias & dollar forecast',
    flowStepAi: 'Full AI analysis', flowStepAiHint: '1m · 5m · 15m · 1h · 4h · 1Day candles + dials + news',
    flowStepOutlook: 'AI direction · next day', flowStepOutlookHint: 'every news source read into one verdict per market',
    flowStepHistory: 'History', flowStepHistoryHint: 'every closed trade - where the flow ended',
    flowStepPerf: 'Performance', flowStepPerfHint: 'today · 7D · 30D · 90D · this session',
    railPositions: 'Positions', railBots: 'News',
    flowNoDial: 'No order-flow quote for this market yet - pick another market or connect the terminal.',
    flowNoDialShort: 'Connect the terminal to fill this dial.',
    flowMarketOpen: 'Market open', flowMarketClosed: 'Market closed', flowNoQuote: 'No quote',
    flowClosedTrades: 'closed trades', flowNoSession: 'no session open',
    sessNoneRunning: 'No session is running right now - the next one opens soon.',
    botTitle: 'Auto Trading', botLot: 'Lot size', botGap: 'Gap ($)', botSL: 'SL ($)',
    bot2Title: 'Auto Trading (Candle & Structure)', bot2MaxTrades: 'Max Trades', bot2TP: 'TP ($)', bot2SL: 'SL ($)',
    bot2BlockStart: 'First block (s)', bot2BlockEnd: 'Last block (s)', bot2BlockMidFrom: 'Mid from (s)', bot2BlockMidTo: 'Mid to (s)',
    bot2BlockHint: '1-minute candle time-window: no trade in the first N seconds, the last N seconds, or the middle window - values you enter are used exactly.',
    bot2Trend: 'Watch',
    bot2Watch: 'Watch',
    bot2WatchPct: 'Watch %',
    bot2WatchHint: "Watch ON: trades only when that side's dial pressure is at or above the Watch % you enter — nothing is fixed at 60%. Watch OFF: the dial is ignored and the bot follows the candle (candle up → BUY, candle down → SELL), one trade every 2.5s. Reverse flips whichever direction it would take.",
    bot2Reverse: 'Reverse',
    bot2CheckTrend: 'Check Direction',
    bot2TrendSystemTitle: '2.5s Direction System',
    bot2TrendDetailsFooter: '⏱️ Automatic 2.5-second direction check: trades in the direction the switch allows',
    bot2StructLevels: 'Structure Levels (Day & Weekend)',
    bot3Title: 'Auto Trading (Extreme High & Low Structure)',
    bot3StructLevels: 'Extreme Structure Levels (Today, This Week & Prev Week)',
    bot3TfToday: 'Today (D1)',
    bot3TfThisWeek: 'This Week (W1)',
    bot3TfPrevWeek: 'Prev Week',
    bot3RadarTitle: 'Trade Execution Radar & Timer',
    bot3PlannedTitle: 'Next 5 Extreme Execution Setups (Upcoming Trades)',
    bot3PlannedCycle: '⚡ 60s Auto Calculation',
    bot3PlannedFooter: '🔄 Automatic 60-second recalculation: tracking live D1, W1 & Prev W1 extreme levels',
    recalcNow: 'Recalc',
    bot4Title: 'Auto Trading (Pre-Trade Ladder)',
    bot4PriceGap: 'Price Gap ($)',
    bot4PreGap: 'Pre Trade Gap ($)',
    bot4PreValue: 'Pre Trade Value',
    bot4Hint: 'Pre Trade Value = levels on each side (N buy above + N sell below). Price Gap = distance from the market price to the first pre-trade, Pre Trade Gap = distance between two pre-trades. Numbering Lot Size ON → lots auto-number 0.01, 0.02, 0.03 … on both sides.',
    bot4Numbering: 'Numbering Lot Size',
    bot4LadderTitle: 'Pre-Trade Ladder (Buy above / Sell below)',
    bot4BuyCol: 'BUY ↑ pre-trades above market',
    bot4SellCol: 'SELL ↓ pre-trades below market',
    botSymbol: 'Market', botPickSymbol: 'Pick a gold symbol…',
    botMarketSwitched: 'Market switched to', botMarketNow: 'Selected market',
    marketClosed: 'Market Closed',
    marketClosedWarn: 'This market is currently closed',
    marketClosedCannotStart: 'Cannot start bot: Market is currently closed',
    condTitle: 'Conditions (what the bot does)',
    condSymbol: 'Trades only this symbol', condMissing: 'not on this account',
    condInstead: 'not on this account — using this instead',
    condGap: 'Gap', condSL: 'Buy SL sits on the SellStop level, Sell SL on the BuyStop level —',
    condLot: 'Lot', condLock: 'SL lock: profit', condSL2: 'SL only ever moves forward - if profit falls back it stays where it was.',
    condTrail: 'Trailing: from profit',
    condReArm: 'If the market hits the stop-loss: the old buy + sell are cleared completely, then a fresh BuyStop and SellStop are placed from the current market price.',
    botStart: 'START', botStop: 'STOP',
    botClose: 'Close now', botRunning: 'RUNNING', botStopped: 'STOPPED', botOffline: 'OFFLINE',
    botGold: 'GOLD', botRules: 'Rules', botLock: 'lock', botTrail: 'trail',
    botFrom: 'from', botPendings: 'Pending', botNoPending: 'none',
    botTrade: 'Trade', botNoTrade: 'none', botRisk: 'Risk/trade', botStats: 'trades',
    botOpened: 'opened', botClosed: 'closed',
    botConfirmStart: 'Start the gold bot with this lot size?',
    botPerTrade: 'per trade if the stop-loss is hit',
    botConfirmClose: 'Close the open position now and cancel the pending orders?',
    botStarted: 'Bot STARTED — arming the BuyStop / SellStop',
    botStoppedMsg: 'Bot STOPPED — pending orders cancelled',
    botClosedMsg: 'Closed positions',
    priceMapTitle: 'Live Level Map',
    bot5Title: 'Economic News & Market Analysis',
    bot5Mode: 'Trading style', bot5ModeAnticipate: 'Anticipate', bot5ModeStraddle: 'Straddle', bot5ModeFollow: 'Follow',
    bot5Impact: 'Min impact', bot5ImpactHigh: 'High', bot5ImpactMedium: 'Medium', bot5ImpactAll: 'All',
    bot5Pre: 'Pre minutes', bot5Post: 'Post minutes',
    bot5Hint: 'The bot reads the economic calendar, tells you BUY or SELL and when to enter, then trades the news window: it opens Pre minutes before the release and closes Post minutes after it. Anticipate = one position in the news direction, Straddle = both sides parked, Follow = trade the actual reaction.',
    bot5ManualTitle: 'Add your own event (always available offline)',
    bot5ManualAdd: '+ Add event', bot5ManualClear: 'Clear all',
    bot5NextEvent: 'Next event', bot5NoNews: 'No upcoming high-impact event',
    bot5NewsList: 'All economic news', bot5Refresh: '🔄 Refresh news',
    bot5AllMarket: 'ALL MARKET', bot5WatchOnly: 'Watch only', bot5NewsTotal: 'events',
    bot5OutlookTitle: '🤖 AI Market Direction · next day',
    bot5OutlookSub: 'date-wise · which market moves how many $ (±) · every news source read',
    sessTitle: '🌐 Trading Sessions · live clock & AI dollar forecast',
    sessSub: 'Sydney (Australian) · Tokyo (Asian) · London (European) · New York (North American)',
    sessMarket: 'Market', sessOpen: 'OPEN', sessClosed: 'CLOSED',
    sessSydney: 'Sydney', sessTokyo: 'Tokyo', sessLondon: 'London', sessNewYork: 'New York',
    sessRegAu: 'Australian', sessRegAsia: 'Asian', sessRegEu: 'European', sessRegNa: 'North American',
    sessStartsIn: 'starts in', sessEndsIn: 'ends in', sessWeekend: 'weekend break · reopens Monday',
    sessPeak: 'PEAK', sessPeakTip: 'London + New York overlap - the heaviest liquidity of the day',
    sessAi: 'AI forecast', sessMostMove: 'moves the most here', sessMixed: 'MIXED',
    sessAiUp: 'BUY Target', sessAiDown: 'SELL Target', sessRange: 'range', sessPriceUnit: 'price units',
    sessBuyTarget: 'BUY Forecast', sessSellTarget: 'SELL Forecast', sessExpRange: 'Expected Range',
    sessAllMarketsTitle: 'All Markets Session Direction & Dollar Forecast',
    sessAllMarketsLive: 'LIVE SESSION', sessAllMarketsNext: 'NEXT SESSION',
    sessUpDays: 'days closed up', sessDaysAvg: 'avg of', sessLot: 'lot',
    sessBestUp: 'best up', sessBestDown: 'best down', sessDial: 'dial',
    sessFlowTip: 'live watch-dial buyers vs sellers on this market',
    sessNoData: 'no session history yet - connect the terminal',
    sessLoading: 'Starting the session clock…', sessUpdated: 'updated',
    sessClockOnly: 'clock only (no terminal)',
    aiTitle: '🧠 Full AI Market Analysis · live BUY / SELL',
    aiSub: '1m · 5m · 15m · 1h · 4h · 1Day candles + news + live dials → where the price goes',
    aiMarket: 'Market', aiTimeframe: 'timeframe',
    aiAi: 'AI', aiBuy: 'BUY', aiSell: 'SELL', aiNoTrade: 'NO TRADE',
    aiConfidence: 'confidence', aiScore: 'score',
    aiUp: 'up', aiDown: 'down', aiRisk: 'risk',
    aiUpTarget: 'up target', aiDownTarget: 'down target',
    aiLevels: 'levels', aiRange: 'expected range',
    aiUpdated: 'updated', aiLoading: 'Reading the candles…',
    aiNoTerminal: 'waiting for public API candles',
    aiNoData: 'not enough closed candles yet',
    aiPriceNow: 'price now', aiClosed: 'closed candles',
    aiWhy: 'why',
    bot6Title: 'Auto Trading (Pre-Trade Entry)', bot6Short: 'Bot 6',
    bot6Distance: 'Distance ($)', bot6Pressure: 'Min Pressure (%)', bot6Side: 'Side',
    bot6SideWatch: 'Watch (auto)', bot6SideBuy: 'Buy only', bot6SideSell: 'Sell only', bot6SideBoth: 'Both sides',
    bot6WatchGate: 'Watch Check', bot6AiGate: 'AI Check', bot6WatchTitle: '👁️ Market Pressure Watch',
    bot6RulesTitle: '💰 TP / SL Rule In Force', bot6EntryTitle: '🎯 Parked Pre-Trade',
    bot6Hint: 'The pre-trade (pending order) is parked Distance ($) away from the live market price, in the direction the Market Pressure Watch allows. Watch NEUTRAL, or pressure below Min Pressure % → no trade. TP > 0 = fixed take profit, 0 = no TP. SL > 0 = fixed stop loss, SL = 0 → from $0.80 of profit the SL is set at 70% of the profit and follows it up, never back down.',
    bot6NoEntry: 'No pre-trade parked',
    bot7Title: 'Auto Trading (Reversal Candle)', bot7Short: 'Bot 7',
    bot7Reverse: 'Reversal Distance ($)', bot7CandleTitle: '🕯️ Candle Reversal Radar',
    bot2Timeframe: 'Timeframe',
    bot7LastCandle: 'Last closed candle',
    bot7Hint: "The bot reads the last closed candle and measures the reversal from the point the market turned from: the candle's close, which then follows the lowest low (bear candle) / highest high (bull candle) while the price keeps running that way - so a candle that drops, goes deeper and then suddenly snaps back still fires, from the real turning point. The moment the price travels back by the Reversal Distance ($) the trade is fired instantly in the new direction (bull candle breaks back down → SELL, bear candle breaks back up → BUY). Reversal Distance 0 = the candle's own body. Each closed candle can fire once. Turn level / trigger / left to fire are shown live in the radar. TP/SL follow the same rule as Bot 6 (SL 0 = 70% profit lock from $0.80).",
    advanced: 'Advanced', terminal: 'MT5 terminal (terminal64.exe)',
    terminalHint: 'Leave on "Auto-detect" unless you have several terminals installed.',
    remember: 'Remember login + server on this PC',
    connectSub: 'Enter your SoftradeX login, password and server. You only reach the dashboard after a successful login.',
    badgeReal: 'LIVE · REAL', badgeDemo: 'DEMO ACCOUNT', badgeContest: 'CONTEST ACCOUNT',
    badgeEa: 'EA BRIDGE', loggedOut: 'LOGGED OUT', offline: 'OFFLINE',
    drawerBotsTitle: 'Economic news',
    flowBalanceTitle: 'LIVE TRADE FLOW',
  },

};
const LANG = 'en';
const t = (k) => I18N.en[k] || k;

function applyLang() {
  document.querySelectorAll('[data-i18n]').forEach((n) => {
    const k = n.getAttribute('data-i18n');
    const v = t(k);
    if (v && v !== k) n.textContent = v;
  });
  document.documentElement.lang = LANG;
  if (typeof updateVoiceMuteButtons === 'function') updateVoiceMuteButtons();
  if (S) renderStatLabels();
  // the sessions and AI panels carry text built in JS, so they are rebuilt from
  // the last snapshot instead of waiting for the next engine push
  if (S) {
    sessionsSig = '';
    aiSig = '';
    renderSessions(S);
    renderAiMarket(S);
    renderFlowStage(S);
  }
}

/* --------------------------------------------------------------- state */
let S = null;                 // latest snapshot from the backend
let ws = null;
let wsRetry = 0;
let wsAlive = false;
let lastServerMsgAt = 0;
let wasConnected = false;
let dashboardPreview = false;
let dashboardPreviewUnlocked = false;
let dashboardPasswordResolve = null;
let connectViewPinned = false;   // user explicitly opened the login screen
let botsEnabled = false;
let period = 'today';
let histPeriod = '7';
let histResult = 'all';
let histSymbol = '';
let histSearch = '';
let histSortKey = 'close_time';   // history table sort column (set by header click)
let histSortDir = 'desc';         // 'asc' | 'desc'
let extraRows = [];           // pages fetched through /api/history
let posRows = new Map();      // ticket -> <tr>
let histSig = '';
let lastClosedId = null;
let lastEventTs = 0;
// Voice alerts were removed from the dashboard: the speech queue stays silent
// (and its scroll/highlight side effects never run).
let voiceMuted = true;
let speechQueue = [];
let isSpeaking = false;
let currentSpeakingKey = null;
let seenEventKeys = new Set();
let _bot5LiveRefreshAt = 0;
let feedInitialized = false;

/* -------------------------------------------------------------- websocket */
let wsReconnectTimer = null;

/* Hosted hosting (cPanel / Passenger) closes every WebSocket upgrade, so a
   socket that never opens twice in a row means "this host has no WebSockets" -
   the dashboard then polls the very same snapshot over HTTP. The numbers are
   identical, only the transport differs. */
let httpPollTimer = null;
let httpPollGeneration = 0;
let wakeHttpPoll = null;
let wsFailStreak = 0;
// Signature of the news calendar this tab holds. The cPanel-safe state feed
// leaves the 1 MB list out of a poll while this matches (?have=), so the state
// request stays a few KB instead of a megabyte every 2.5 s.
let newsHaveSig = '';

function startHttpPoll() {
  if (CFG.auth_required && !CFG.authed) return;
  if (httpPollTimer) return;
  const generation = ++httpPollGeneration;
  const tick = async () => {
    // Schedule the next poll after this request, so a slow host cannot overlap requests.
    httpPollTimer = -1;
    if (document.hidden && S) {
      if (generation === httpPollGeneration) httpPollTimer = setTimeout(tick, 2500);
      return;
    }
    // bounded: a slowed-down shared host must not queue up poll after poll
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const abort = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, 10000) : null;
    try {
      const resp = await fetch('/api/state' + (newsHaveSig ? '?have=' + encodeURIComponent(newsHaveSig) : ''), {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: ctrl ? ctrl.signal : undefined
      });
      if (generation !== httpPollGeneration) return;
      if (resp.status === 401 || resp.status === 403) { pausePrivateState(); return; }
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      if (!data || generation !== httpPollGeneration) return;
      lastServerMsgAt = Date.now();
      // Hydrate once even in a hidden tab; later frames keep the visibility throttle.
      if (!S) applyState(data);
      else queueStateFrame(data);
      const foot = $('foot-ws');
      if (foot) { foot.textContent = 'http: live (polling)'; foot.style.color = '#93c5fd'; }
    } catch (e) {
      const foot = $('foot-ws');
      if (foot) { foot.textContent = 'http: retrying…'; foot.style.color = '#fca5a5'; }
    } finally {
      if (abort) clearTimeout(abort);
      if (generation === httpPollGeneration) httpPollTimer = setTimeout(tick, 3500);
    }
  };
  wakeHttpPoll = () => {
    if (generation !== httpPollGeneration || httpPollTimer === -1) return;
    if (httpPollTimer) clearTimeout(httpPollTimer);
    void tick();
  };
  tick();
}

function stopHttpPoll() {
  httpPollGeneration++;
  wakeHttpPoll = null;
  if (httpPollTimer) { clearTimeout(httpPollTimer); httpPollTimer = null; }
}

function pausePrivateState() {
  CFG.auth_required = true;
  CFG.authed = false;
  setPrivateStateReady(false);
  dashboardPreviewUnlocked = false;
  stopHttpPoll();
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
  const oldSocket = ws;
  ws = null; wsAlive = false;
  if (oldSocket) {
    oldSocket.onmessage = null; oldSocket.onclose = null; oldSocket.onerror = null;
    if (oldSocket.readyState === 0) oldSocket.onopen = () => oldSocket.close();
    else { try { oldSocket.close(); } catch (e) {} }
  }
  const foot = $('foot-ws');
  if (foot) { foot.textContent = 'session: sign in required'; foot.style.color = '#fca5a5'; }
  if (typeof window.requestDashboardLogin === 'function') void window.requestDashboardLogin();
}

function connectWS() {
  if (CFG.auth_required && !CFG.authed) { pausePrivateState(); return; }
  if (window.SOFTRADEX_PUBLIC_ONLY || CFG.live_stream === false) { startHttpPoll(); return; }
  // exactly one live socket: a superseded one must never keep feeding the UI,
  // otherwise every reconnect doubles the live frame rate (dial traffic is ~20/s)
  let sock;
  try { sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`); }
  catch (e) { scheduleReconnect(); return; }
  ws = sock;

  sock.onopen = () => {
    if (ws !== sock) return;
    wsAlive = true; wsRetry = 0;
    wsFailStreak = 0;
    stopHttpPoll();
    lastServerMsgAt = Date.now();
    $('foot-ws').textContent = 'socket: live';
    $('foot-ws').style.color = '#86efac';
    sock.send(JSON.stringify({ type: 'refresh' }));
  };
  sock.onmessage = (ev) => {
    if (ws !== sock) return;
    lastServerMsgAt = Date.now();
    let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (msg.type === 'state') { queueStateFrame(msg.data); }
    else if (msg.type === 'watch') { queueWatchFrame(msg.data); }
    else if (msg.type === 'notify') { toast(msg.data.kind, msg.data.message); }
  };
  sock.onclose = () => {
    if (ws !== sock) return;   // stale socket - a newer one already took over
    wsAlive = false;
    wsFailStreak += 1;
    // Two sockets in a row that never opened = a host without WebSocket
    // support (Passenger on cPanel), not an outage.
    if (wsFailStreak >= 2) startHttpPoll();
    $('foot-ws').textContent = httpPollTimer ? 'http: live (polling)' : 'socket: reconnecting…';
    $('foot-ws').style.color = httpPollTimer ? '#93c5fd' : '';
    scheduleReconnect();
  };
  sock.onerror = () => { try { sock.close(); } catch (e) {} };
}

/* The engine pushes a full state snapshot whenever anything moves - with live
   prices in its change gate that is 6-8 frames per second, and one snapshot
   repaints the whole dashboard (~35 ms). Keep only the newest snapshot and
   paint at most ~4 per second: the dials and the chart already stream their
   own 20 fps tick frames, so nothing visible waits for this. */
let _statePending = null;
let _stateLastAt = 0;
let _stateTimer = null;
function applyPendingState() {
  _stateTimer = null;
  if (document.hidden) return;
  _stateLastAt = Date.now();
  const next = _statePending;
  _statePending = null;
  if (next) applyState(next);
}
function queueStateFrame(data) {
  if (!data) return;
  // Preserve a calendar delivered between frames even when the next frame omits it.
  if (data.bot5 && !Array.isArray(data.bot5.news) && _statePending?.bot5 && Array.isArray(_statePending.bot5.news)) {
    data.bot5.news = _statePending.bot5.news;
    data.bot5.news_sig = _statePending.bot5.news_sig;
  }
  _statePending = data;
  if (document.hidden) return;
  const wait = 250 - (Date.now() - _stateLastAt);
  if (wait <= 0) {
    if (_stateTimer) { clearTimeout(_stateTimer); _stateTimer = null; }
    applyPendingState();
    return;
  }
  if (_stateTimer) return;
  _stateTimer = setTimeout(applyPendingState, wait);
}

function scheduleReconnect() {
  if (wsReconnectTimer) return;   // one pending reconnect, never a chain of them
  wsRetry = Math.min(wsRetry + 1, 12);
  wsReconnectTimer = setTimeout(() => {
    wsReconnectTimer = null;
    if (CFG.auth_required && !CFG.authed) return;
    if (window.SOFTRADEX_PUBLIC_ONLY || CFG.live_stream === false) return;
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;
    connectWS();
  }, httpPollTimer ? 20000 : Math.min(400 * wsRetry, 4000));
}

/* ------------------------------------------------------------ state apply */
/* ------------------------------------------------- live trade flow balance (.flow-balance) */
// Sits under the live curve. OUR side = every open trade of the logged-in
// account (manual + every bot) on the selected market. WORLD side = the
// whole market's 5-minute taker buy vs sell volume and trader long/short
// accounts, pulled live from Binance public data (crypto pairs; gold uses
// PAXGUSDT as the world-wide proxy). Nothing is faked: instruments Binance
// does not trade honestly report "no world data for this market".
const FLOW_BAL_SYMBOLS = {
  BTCUSDTM: 'BTCUSDT', BTCUSDM: 'BTCUSDT', BTCUSDT: 'BTCUSDT', BTCUSD: 'BTCUSDT',
  ETHUSDTM: 'ETHUSDT', ETHUSDM: 'ETHUSDT', ETHUSDT: 'ETHUSDT',
  SOLUSDTM: 'SOLUSDT', SOLUSDT: 'SOLUSDT',
  XAUUSDM: 'PAXGUSDT', XAUUSD: 'PAXGUSDT', XAUUSD247M: 'PAXGUSDT',
};

function _fbFetchJson(url) {
  return fetch(url, { headers: { 'Accept': 'application/json' } })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))));
}
const _fbMoney = (v) => {
  const n = Number(v) || 0;
  if (n >= 1e9) return `$${nf(n / 1e9, 1)}B`;
  if (n >= 1e6) return `$${nf(n / 1e6, 1)}M`;
  if (n >= 1e3) return `$${nf(n / 1e3, 1)}K`;
  return `$${nf(n, 0)}`;
};

/* Our side: manual + all bots, counted by lots and live dollars */
function updateFlowBalanceOurs(d) {
  const cell = $('fb-ours');
  if (!cell) return;
  const isBn = LANG === 'bn';
  const sym = (flowSymbol() || '').toUpperCase();
  const norm = (s) => String(s || '').toUpperCase().replace(/M$/, '');
  const src = d || S || {};
  const pos = Array.isArray(src.positions) ? src.positions : [];
  let buyLots = 0, sellLots = 0, buyNet = 0, sellNet = 0, buyN = 0, sellN = 0;
  pos.forEach((p) => {
    if (sym && norm(p.symbol) !== norm(sym)) return;
    const lots = Number(p.volume || 0);
    const net = Number(p.net !== undefined ? p.net : (p.profit || 0));
    if (String(p.side || '').toLowerCase() === 'buy') { buyLots += lots; buyNet += net; buyN++; }
    else { sellLots += lots; sellNet += net; sellN++; }
  });
  if (buyN + sellN === 0) {
    cell.innerHTML = `<b>${isBn ? '💻 আমাদের অ্যাকাউন্ট (বট + ম্যানুয়াল)' : '💻 Our account (bots + manual)'}</b>` +
      `<span class="fb-flat">${isBn ? `${esc(sym || '—')} মার্কেটে এখন কোনো ওপেন ট্রেড নেই` : `no open trades on ${esc(sym || '—')} right now`}</span>`;
    return;
  }
  cell.innerHTML = `<b>${isBn ? '💻 আমাদের অ্যাকাউন্ট (বট + ম্যানুয়াল)' : '💻 Our account (bots + manual)'}</b>` +
    `<span class="fb-buy">▲ BUY ${buyN} · ${nf(buyLots, 2)} lots · ${signed(buyNet)}</span>` +
    `<span class="fb-sell">▼ SELL ${sellN} · ${nf(sellLots, 2)} lots · ${signed(sellNet)}</span>` +
    `<span class="fb-flat">${isBn ? 'ফ্লোটিং' : 'floating'} ${signed(buyNet + sellNet)}</span>`;
}

/* World side: live 5m taker volume split + trader account long/short */
async function pollFlowBalanceWorld() {
  if (document.hidden) return;
  const cell = $('fb-world');
  if (!cell) return;
  const isBn = LANG === 'bn';
  const sym = (flowSymbol() || '').toUpperCase();
  const binSym = FLOW_BAL_SYMBOLS[sym] || null;
  const label = `🌍 ${isBn ? 'সারা পৃথিবী' : 'Whole world'}${binSym ? ' · ' + binSym : ''}`;
  if (!binSym) {
    cell.innerHTML = `<b>${esc(label)}</b>` +
      `<span class="fb-flat">${isBn ? esc(sym) + ' মার্কেটের বিশ্বব্যাপী ডেটা ফিড এখনো নেই' : 'no world-wide data feed for ' + esc(sym) + ' yet'}</span>`;
    return;
  }
  try {
    const [taker, glob, tick] = await Promise.all([
      _fbFetchJson(`https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=${binSym}&period=5m&limit=1`),
      _fbFetchJson(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${binSym}&period=5m&limit=1`),
      _fbFetchJson(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${binSym}`),
    ]);
    const t = Array.isArray(taker) ? (taker[0] || {}) : {};
    const g = Array.isArray(glob) ? (glob[0] || {}) : {};
    const quoteVol = Number((tick && tick.quoteVolume) || 0);
    const buyVol = Number(t.buyVol || 0);
    const sellVol = Number(t.sellVol || 0);
    const share = (buyVol + sellVol) > 0 ? buyVol / (buyVol + sellVol) : 0.5;
    const buyUsd = quoteVol * share;
    const sellUsd = quoteVol * (1 - share);
    const longAcc = Math.round(Number(g.longAccount || 0.5) * 100);
    const shortAcc = 100 - longAcc;
    cell.innerHTML = `<b>${esc(label)}</b>` +
      `<span class="fb-buy">▲ BUY ${_fbMoney(buyUsd)} (${Math.round(share * 100)}%)</span>` +
      `<span class="fb-sell">▼ SELL ${_fbMoney(sellUsd)} (${Math.round((1 - share) * 100)}%)</span>` +
      `<span class="fb-acc">${isBn ? 'ট্রেডার অ্যাকাউন্ট' : 'trader accounts'} ${longAcc}% / ${shortAcc}%</span>`;
  } catch (e) {
    cell.innerHTML = `<b>${esc(label)}</b><span class="fb-flat">${isBn ? 'বিশ্ব-ডেটা ফিড এই মুহূর্তে পৌঁছাচ্ছে না' : 'world data feed unreachable right now'}</span>`;
  }
}

function applyState(data) {
  if (!data) return;
  const prev = S;
  // The engine leaves the (1 MB) calendar out of frames where it did not
  // change; keep showing the last list it did send.
  if (data.bot5 && !Array.isArray(data.bot5.news)
      && prev && prev.bot5 && Array.isArray(prev.bot5.news)) {
    data.bot5.news = prev.bot5.news;
  }
  // Remember which list we hold, so the next poll can ask the server to leave
  // it out of the response.
  if (data.bot5 && Array.isArray(data.bot5.news) && data.bot5.news_sig) {
    newsHaveSig = data.bot5.news_sig;
  }
  S = data;
  if (window.TradersTerminal && typeof window.TradersTerminal.onSnapshot === 'function') {
    window.TradersTerminal.onSnapshot(data);
  }
  const connected = !!data.connected || data.status === 'connected' || (data.mode === 'ea');
  if (!connected && wasConnected) fullResetUI();
  wasConnected = connected;
  renderConnection(data);
  syncBotStartButtons(connected);
  if (!connectViewPinned && (connected || dashboardPreview)) {
    $('connect-view').classList.add('hidden');
    $('dash').classList.remove('hidden');
    scheduleFlowWires();   // the connectors measure as soon as the dashboard is on screen
  } else {
    $('connect-view').classList.remove('hidden');
    $('dash').classList.add('hidden');
  }
  if (data.error && data.status === 'error') showConnectError(data.error);
  renderAccount(data);
  renderStats(data);
  if (data.market_statuses) {
    marketStatuses = data.market_statuses;
  }
  if (data.market_watch && Array.isArray(data.market_watch) && data.market_watch.length) {
    // live stream push (engine tick): patch the watch dials in place - no timer involved
    marketWatches = data.market_watch;
    applyMarketWatchState();   // (also refreshes the ticker tape)
  }
  // Bots 1-4, 6 and 7 live inside the side drawer only. Repainting them at
  // every engine frame while that drawer is shut was the single most expensive
  // thing on the page (15k hidden nodes + innerHTML rebuilds), so they are
  // painted once when the drawer opens instead. Bot 5 also feeds the news
  // panel on the main page, so it always renders.
  if (botsDrawerOpen()) {
    renderBotsPanels(data);
  }
  try { renderBot3(data); } catch (e) { console.error('renderBot3 error:', e); }
  try { renderBot5(data); } catch (e) { console.error('renderBot5 error:', e); }
  try { renderSessions(data); } catch (e) { console.error('renderSessions error:', e); }
  try { renderAiMarket(data); } catch (e) { console.error('renderAiMarket error:', e); }
  try { renderFlowStage(data); } catch (e) { console.error('renderFlowStage error:', e); }
  try { renderPositions(data); } catch (e) { console.error('renderPositions error:', e); }
  try { updateFlowBalanceOurs(data); } catch (e) { console.error('updateFlowBalanceOurs error:', e); }
  try { renderHistory(data); } catch (e) { console.error('renderHistory error:', e); }
  try { renderFeed(data); } catch (e) { console.error('renderFeed error:', e); }
  try { renderFooter(data); } catch (e) { console.error('renderFooter error:', e); }
  try { detectNewClosed(prev, data); } catch (e) { console.error('detectNewClosed error:', e); }
}

/* True while the bots drawer is on screen. Its contents are skipped by the
   browser when closed (content-visibility), so repainting them is wasted work. */
function botsDrawerOpen() {
  const dash = $('dash');
  return !!dash && dash.classList.contains('drawer-right-open');
}

function renderBotsPanels(d) {
  if (!d || !botsEnabled || CFG.order_execution === false) return;
  try { renderBot(d); } catch (e) { console.error('renderBot error:', e); }
  try { renderBot2(d); } catch (e) { console.error('renderBot2 error:', e); }
  try { renderBot3(d); } catch (e) { console.error('renderBot3 error:', e); }
  try { renderBot4(d); } catch (e) { console.error('renderBot4 error:', e); }
  try { renderBot6(d); } catch (e) { console.error('renderBot6 error:', e); }
  try { renderBot7(d); } catch (e) { console.error('renderBot7 error:', e); }
}

/* Wipe every trace of the previous session (used on disconnect / logout) */
function fullResetUI() {
  posRows.forEach((tr) => tr.remove());
  posRows.clear();
  $('positions-body').innerHTML = '';
  $('history-body').innerHTML = '';
  const feedElem = $('feed');
  if (feedElem) feedElem.innerHTML = '';
  $('pos-count').textContent = '0';
  $('hist-count').textContent = '0';
  const rhEl = $('rail-hist-count');
  if (rhEl) rhEl.textContent = '0';
  const thEl = $('tab-badge-hist');
  if (thEl) thEl.textContent = '0';
  const rfEl = $('rail-feed-count');
  if (rfEl) rfEl.textContent = '0';
  const tfEl = $('tab-badge-feed');
  if (tfEl) tfEl.textContent = '0';
  const fbEl = $('feed-badge');
  if (fbEl) fbEl.textContent = '0';
  $('pos-total').textContent = '0.00';
  histSig = '';
  lastClosedId = null;
  lastEventTs = 0;
  extraRows = [];
  seenEventKeys.clear();
  feedInitialized = false;
  speechQueue = [];
  if ('speechSynthesis' in window) {
    try { window.speechSynthesis.cancel(); } catch (e) {}
  }
  if (typeof clearSpeakingHighlight === 'function') clearSpeakingHighlight();
  isSpeaking = false;
  currentSpeakingKey = null;
  ['acc-login', 'acc-server', 'acc-balance', 'acc-equity', 'acc-margin',
    'acc-marginfree', 'acc-marginlevel', 'acc-leverage'].forEach((id) => { $(id).textContent = '—'; });

  if (typeof closeFlowDrawers === 'function') closeFlowDrawers();
}

/* ------------------------------------------------------------- connection */
function renderConnection(d) {
  const w = $('conn-widget'), txt = $('conn-text'), badge = $('source-badge');
  let widget = 'offline', text = t('disconnected'), cls = 'badge badge-off', label = t('loggedOut');

  if (d.status === 'connecting') {
    text = t('connecting'); label = '…';
  } else if (d.status === 'error') {
    widget = 'error'; text = t('errorState'); label = 'ERROR';
  } else if (d.source === 'public') {
    widget = 'online'; text = 'Public market APIs'; cls = 'badge badge-live'; label = 'API DATA';
  } else if (d.source === 'mt5') {
    widget = 'online'; text = t('connected');
    if (d.account_kind === 'demo') { cls = 'badge badge-demo'; label = t('badgeDemo'); }
    else if (d.account_kind === 'contest') { cls = 'badge badge-demo'; label = t('badgeContest'); }
    else if (d.account_kind === 'real') { cls = 'badge badge-live'; label = t('badgeReal'); }
    else { cls = 'badge badge-live'; label = 'LIVE MT5'; }
  } else if (d.source === 'ea') {
    widget = 'online'; text = t('connected'); cls = 'badge badge-ea'; label = t('badgeEa');
  }

  if (w) {
    w.classList.remove('online', 'offline', 'error');
    w.classList.add(widget);
  }
  if (txt && txt.textContent !== text) txt.textContent = text;
  if (badge) {
    if (badge.textContent !== label) badge.textContent = label;
    if (badge.className !== cls) badge.className = cls;
  }
  const disconnect = $('topbar-disconnect');
  if (disconnect) disconnect.classList.add('hidden');
}

/* ---------------------------------------------------------------- account */
function renderAccount(d) {
  const a = d.account || {};
  const has = !!d.account;
  const cur = has ? (a.currency || 'USD') : '';
  const set = (id, v) => { const n = $(id); if (n && n.textContent !== v) n.textContent = v; };
  set('acc-login', a.login ? String(a.login) : '—');
  set('acc-server', a.server || '—');
  set('acc-balance', has ? `${nf(a.balance)} ${cur}` : '—');
  set('acc-equity', has ? `${nf(a.equity)} ${cur}` : '—');
  set('acc-margin', has ? nf(a.margin) : '—');
  set('acc-marginfree', has ? nf(a.margin_free) : '—');
  set('acc-marginlevel', has && a.margin_level ? `${nf(a.margin_level, 1)}%` : '—');
  // Exness reports "Unlimited" leverage as 1:2000000000
  const lev = Number(a.leverage || 0);
  set('acc-leverage', has && lev ? (lev >= 1e9 ? t('unlimited') : `1:${lev}`) : '—');
}

/* ------------------------------------------------------------------ stats */
function renderStatLabels() {
  const lbl = { today: t('totalProfitToday'), '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', session: 'This session' };
  if (LANG === 'bn') {
    lbl['7d'] = 'শেষ ৭ দিন'; lbl['30d'] = 'শেষ ৩০ দিন'; lbl['90d'] = 'শেষ ৯০ দিন'; lbl.session = 'এই সেশন';
  }
  $('stat-net-label').textContent = lbl[period] || t('totalProfitToday');
}

function renderStats(d) {
  const s = (d.stats && d.stats[period]) || {};
  const cur = (d.account && d.account.currency) || 'USD';
  const net = Number(s.net_profit || 0);

  const netEl = $('stat-net');
  netEl.textContent = signed(net) + (s.trades ? '' : '');
  netEl.className = 'stat-value big ' + (net > 0 ? 'pos-color' : net < 0 ? 'neg-color' : 'flat-color');
  $('stat-net-sub').textContent = `${s.trades || 0} closed · ${cur} · pf ${s.profit_factor ?? '—'}`;

  $('stat-wins').textContent = nf(s.wins || 0, 0);
  $('stat-wins-sub').textContent = `gross +${nf(s.gross_profit || 0)}`;
  $('stat-losses').textContent = nf(s.losses || 0, 0);
  $('stat-losses-sub').textContent = `gross -${nf(s.gross_loss || 0)}`;
  $('stat-winrate').textContent = `${nf(s.win_rate || 0, 1)}%`;
  $('stat-winrate-sub').textContent = `${s.wins || 0}W / ${s.losses || 0}L${s.breakeven ? ` / ${s.breakeven}BE` : ''}`;

  const fl = Number(s.floating || 0);
  const flEl = $('stat-floating');
  flEl.textContent = signed(fl);
  flEl.className = 'stat-value ' + (fl > 0 ? 'pos-color' : fl < 0 ? 'neg-color' : 'flat-color');
  $('stat-floating-sub').textContent = `${s.open_count || 0} open · ${nf(s.open_volume || 0)} lots`;

  $('stat-pf').textContent = s.profit_factor === null || s.profit_factor === undefined ? (s.gross_profit > 0 ? '∞' : '—') : nf(s.profit_factor, 2);
  $('stat-pf-sub').textContent = `expectancy ${signed(s.expectancy || 0)}`;

  const bw = $('stat-bw');
  bw.innerHTML = `<span class="${Number(s.best) > 0 ? 'value-win' : ''}">${signed(s.best)}</span> / <span class="${Number(s.worst) < 0 ? 'value-loss' : ''}">${signed(s.worst)}</span>`;
  $('stat-bw-sub').textContent = `${s.best_symbol || '—'} / ${s.worst_symbol || '—'}`;

  $('stat-volume').textContent = nf(s.volume || 0);
  $('stat-volume-sub').textContent = `${s.max_win_streak || 0}W streak · ${s.max_loss_streak || 0}L streak`;

  document.querySelectorAll('#period-seg .seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.period === period));
}

/* -------------------------------------------------------------- positions */
function renderPositions(d) {
  const body = $('positions-body');
  const list = d.positions || [];
  $('pos-count').textContent = list.length;
  const total = list.reduce((a, p) => a + Number(p.profit || 0) + Number(p.swap || 0), 0);
  const tot = $('pos-total');
  tot.textContent = signed(total);
  tot.className = 'panel-total ' + valClass(total);
  $('pos-empty').classList.toggle('hidden', list.length > 0);

  const seen = new Set();
  list.forEach((p) => {
    const key = String(p.ticket);
    seen.add(key);
    let tr = posRows.get(key);
    if (!tr) {
      tr = document.createElement('tr');
      tr.innerHTML = '<td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td class="num"></td><td></td>';
      tr.classList.add('flash');
      posRows.set(key, tr);
      body.appendChild(tr);
    }
    const c = tr.children;
    const net = Number(p.profit || 0) + Number(p.swap || 0);
    setCell(c[0], p.symbol || '—');
    c[1].innerHTML = `<span class="${p.side === 'buy' ? 'side-buy' : 'side-sell'}">${esc((p.side || '').toUpperCase())}</span>`;
    setCell(c[2], nf(p.volume, 2));
    setCell(c[3], fmtPrice(p.price_open));
    setCell(c[4], fmtPrice(p.price_current));
    setCell(c[5], fmtPrice(p.sl));
    setCell(c[6], fmtPrice(p.tp));
    setCell(c[7], nf(p.swap, 2));
    setCell(c[8], signed(net));
    c[8].className = 'num ' + valClass(net);
    setCell(c[9], dateStr(p.time));
    const cls = rowClass(net);
    if (tr.dataset.rc !== cls) { tr.className = cls; tr.dataset.rc = cls; }
  });
  posRows.forEach((tr, key) => {
    if (!seen.has(key)) { tr.remove(); posRows.delete(key); }
  });
  // keep DOM order in sync with the data order
  list.forEach((p) => {
    const tr = posRows.get(String(p.ticket));
    if (tr && tr.nextSibling !== null) body.appendChild(tr);
  });
}
function setCell(node, v) { if (node && node.textContent !== String(v)) node.textContent = v; }

/* ---------------------------------------------------------------- history */
function histSince() {
  const nowS = S && S.server_epoch ? S.server_epoch : Math.floor(Date.now() / 1000);
  if (histPeriod === 'today') return (S && S.day_start) || (nowS - 86400);
  if (histPeriod === 'all') return 0;
  return nowS - Number(histPeriod) * 86400;
}
function historyRows() {
  if (!S) return [];
  const map = new Map();
  // a null/0 position_id must not collapse every such row onto one map key
  const keyOf = (r, i) => String(r.position_id || r.ticket || `row-${i}`);
  (extraRows || []).forEach((r, i) => map.set(keyOf(r, i), r));
  (S.history || []).forEach((r, i) => map.set(keyOf(r, i), r));
  let rows = Array.from(map.values());
  const since = histSince();
  rows = rows.filter((r) => Number(r.close_time || 0) >= since);
  if (histResult === 'win') rows = rows.filter((r) => Number(r.net_profit) > 0);
  if (histResult === 'loss') rows = rows.filter((r) => Number(r.net_profit) < 0);
  if (histSymbol) rows = rows.filter((r) => (r.symbol || '').toUpperCase() === histSymbol.toUpperCase());
  if (histSearch) {
    const q = histSearch.toLowerCase();
    rows = rows.filter((r) => String(r.comment || '').toLowerCase().includes(q) || String(r.ticket || '').includes(q) || String(r.position_id).includes(q));
  }
  rows.sort((a, b) => Number(b.close_time) - Number(a.close_time));
  return rows;
}
function renderHistory(d) {
  const rows = historyRows();
  // header sort: the server sends newest-first; any header click reorders this
  // local copy (no refetch needed). Ties fall back to close_time desc so the
  // list never jumps randomly between renders.
  const NUMERIC_KEYS = new Set(['close_time', 'open_time', 'volume', 'open_price', 'close_price', 'commission', 'swap', 'net_profit', 'magic']);
  const durOf = (r) => (Number(r.close_time || 0) - Number(r.open_time || 0));
  const valOf = (r) => {
    if (histSortKey === 'duration') return durOf(r);
    if (NUMERIC_KEYS.has(histSortKey)) return Number(r[histSortKey] || 0);
    return String(r[histSortKey] || '');
  };
  rows.sort((a, b) => {
    const av = valOf(a);
    const bv = valOf(b);
    let cmp = (typeof av === 'number' && typeof bv === 'number') ? (av - bv) : String(av).localeCompare(String(bv));
    if (!cmp) cmp = Number(b.close_time || 0) - Number(a.close_time || 0);
    return histSortDir === 'asc' ? cmp : -cmp;
  });
  document.querySelectorAll('#history-head-row th[data-key]').forEach((th) => {
    th.classList.toggle('sorted', th.dataset.key === histSortKey);
    th.classList.toggle('sorted-asc', th.dataset.key === histSortKey && histSortDir === 'asc');
    th.classList.toggle('sorted-desc', th.dataset.key === histSortKey && histSortDir === 'desc');
  });
  $('hist-count').textContent = rows.length;
  const rhEl = $('rail-hist-count');
  if (rhEl) rhEl.textContent = rows.length;
  const thEl = $('tab-badge-hist');
  if (thEl) thEl.textContent = rows.length;
  $('hist-empty').classList.toggle('hidden', rows.length > 0);

  const sig = histPeriod + '|' + histResult + '|' + histSymbol + '|' + histSearch + '|' + histSortKey + '|' + histSortDir + '|' + rows.length + '|' +
    (rows[0] ? rows[0].position_id : '') + '|' + (rows[rows.length - 1] ? rows[rows.length - 1].position_id : '') + '|' +
    rows.reduce((a, r) => a + Number(r.net_profit || 0), 0).toFixed(2);
  if (sig === histSig) return;
  histSig = sig;

  const body = $('history-body');
  const html = rows.slice(0, 600).map((r) => {
    const net = Number(r.net_profit || 0);
    return `<tr class="${rowClass(net)}">
      <td class="ts">${dateStr(r.close_time)}</td>
      <td>${esc(r.symbol || '')}</td>
      <td><span class="${r.side === 'buy' ? 'side-buy' : 'side-sell'}">${esc((r.side || '').toUpperCase())}</span></td>
      <td>${nf(r.volume, 2)}</td>
      <td>${fmtPrice(r.open_price)}</td>
      <td>${fmtPrice(r.close_price)}</td>
      <td>${nf(r.commission, 2)}</td>
      <td>${nf(r.swap, 2)}</td>
      <td class="num ${valClass(net)}">${signed(net)}</td>
      <td>${r.magic ? esc(r.magic) : '—'}</td>
      <td>${esc(r.comment || '')}${r.source && r.source !== 'mt5' ? ` <span class="muted">[${esc(r.source)}]</span>` : ''}</td>
      <td class="ts">${durStr(r.open_time, r.close_time)}</td>
    </tr>`;
  }).join('');
  body.innerHTML = html;

  const net = rows.reduce((a, r) => a + Number(r.net_profit || 0), 0);
  const wins = rows.filter((r) => Number(r.net_profit) > 0).length;
  const losses = rows.filter((r) => Number(r.net_profit) < 0).length;
  $('hist-foot').innerHTML = `showing ${Math.min(rows.length, 600)} of ${rows.length} · <span class="${valClass(net)}">${signed(net)}</span> · ${wins}W / ${losses}L · total ever: ${d.history_total || 0}`;

  const syms = Array.from(new Set(rows.map((r) => r.symbol).filter(Boolean))).sort();
  const dl = $('symbol-list');
  if (dl.dataset.n !== syms.join(',')) { dl.dataset.n = syms.join(','); dl.innerHTML = syms.map((s) => `<option value="${esc(s)}">`).join(''); }
}

/* ------------------------------------------------------------ market pressure watch dials */
let marketWatches = [];
let marketStatuses = {};

function findWatchForSymbol(sym) {
  if (!sym || !marketWatches || !marketWatches.length) return null;
  const sUpper = String(sym).toUpperCase().trim();
  let w = marketWatches.find(x => String(x.symbol || '').toUpperCase() === sUpper);
  if (!w) {
    w = marketWatches.find(x => String(x.symbol || '').toUpperCase().replace(/M$/, '').replace(/\.$/, '') === sUpper.replace(/M$/, '').replace(/\.$/, ''));
  }
  if (!w) {
    w = marketWatches.find(x => String(x.displayName || '').toUpperCase() === sUpper);
  }
  return w || marketWatches[0] || null;
}

function getMarketInfo(sym) {
  if (!sym) return { open: false, status: 'CLOSED', reason: 'EMPTY' };
  const sUpper = String(sym).toUpperCase().trim();
  // 1. Check live marketWatches array
  if (marketWatches && marketWatches.length) {
    let w = marketWatches.find(x => String(x.symbol || '').toUpperCase() === sUpper);
    if (!w) {
      w = marketWatches.find(x => String(x.symbol || '').toUpperCase().replace(/M$/, '').replace(/\.$/, '') === sUpper.replace(/M$/, '').replace(/\.$/, ''));
    }
    if (!w) {
      w = marketWatches.find(x => String(x.displayName || '').toUpperCase() === sUpper);
    }
    if (w && w.market_open !== undefined) {
      return {
        open: !!w.market_open,
        status: w.market_status || (w.market_open ? 'OPEN' : 'CLOSED'),
        reason: w.market_reason || '',
        message: w.market_message || ''
      };
    }
  }
  // 2. Check S.market_statuses or cached marketStatuses map
  const stMap = (S && S.market_statuses) || marketStatuses;
  if (stMap) {
    const direct = stMap[sym] || stMap[sUpper] || stMap[sUpper.replace(/M$/, '').replace(/\.$/, '')];
    if (direct && direct.open !== undefined) {
      return direct;
    }
  }
  // 3. Fallback schedule check
  const is247 = sUpper.includes('BTC') || sUpper.includes('ETH') || sUpper.includes('CRYPTO') || sUpper.includes('247');
  if (is247) return { open: true, status: 'OPEN', reason: 'CRYPTO_247', message: 'Crypto 24/7' };
  if (sUpper === 'DXY' || sUpper.includes('INDEX')) return { open: false, status: 'UNAVAILABLE', reason: 'NOT_FOUND', message: 'Not available' };

  const now = new Date();
  const utcDay = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  const utcHour = now.getUTCHours();
  const utcMin = now.getUTCMinutes();

  // Weekend: Friday 21:55 UTC to Sunday 21:00 UTC
  if (utcDay === 6) return { open: false, status: 'CLOSED', reason: 'WEEKEND_CLOSED', message: 'Weekend closure' };
  if (utcDay === 0 && utcHour < 21) return { open: false, status: 'CLOSED', reason: 'WEEKEND_CLOSED', message: 'Weekend closure' };
  if (utcDay === 5 && (utcHour > 21 || (utcHour === 21 && utcMin >= 55))) return { open: false, status: 'CLOSED', reason: 'WEEKEND_CLOSED', message: 'Weekend closure' };

  // Daily break: Mon-Thu 21:00 UTC to 22:00 UTC for gold/metals, crude oil, and US indices
  const isBreakMarket = sUpper.includes('XAU') || sUpper.includes('GOLD') || sUpper.includes('OIL') || sUpper.includes('TEC') || sUpper.includes('US30') || sUpper.includes('100');
  if (isBreakMarket && utcHour === 21) {
    return { open: false, status: 'CLOSED', reason: 'SESSION_CLOSED', message: 'Daily break (21:00-22:00 UTC)' };
  }

  return { open: true, status: 'OPEN', reason: 'DEFAULT' };
}

function isMarketOpen(sym) {
  return getMarketInfo(sym).open !== false;
}

function updateAllMarketChips() {
  document.querySelectorAll('.chip[data-sym]').forEach(btn => {
    const sym = btn.dataset.sym;
    if (!sym) return;
    const isOpen = isMarketOpen(sym);
    btn.classList.toggle('market-off', !isOpen);
    btn.classList.toggle('disabled', !isOpen);
    if (!isOpen) {
      btn.setAttribute('title', LANG === 'bn' ? `${sym} মার্কেটটি বর্তমানে বন্ধ (Market Closed)` : `${sym} market is currently closed`);
    } else if (btn.getAttribute('title')?.includes('closed') || btn.getAttribute('title')?.includes('বন্ধ')) {
      btn.removeAttribute('title');
    }
    let offTag = btn.querySelector('.chip-off-tag');
    if (!isOpen) {
      if (!offTag) {
        offTag = document.createElement('span');
        offTag.className = 'chip-off-tag';
        offTag.textContent = 'OFF';
        btn.appendChild(offTag);
      }
    } else {
      if (offTag) offTag.remove();
    }
  });

  // Also update ticker tape items
  document.querySelectorAll('.ticker-item[data-sym], .login-ticker-item[data-sym]').forEach(item => {
    const sym = item.dataset.sym;
    if (!sym) return;
    const isOpen = isMarketOpen(sym);
    item.classList.toggle('ticker-off', !isOpen);
    let offPill = item.querySelector('.ticker-off-pill');
    if (!isOpen) {
      if (!offPill) {
        offPill = document.createElement('span');
        offPill.className = 'ticker-off-pill';
        offPill.textContent = 'OFF';
        const symEl = item.querySelector('.ticker-sym, .login-ticker-sym');
        if (symEl) symEl.appendChild(offPill);
        else item.appendChild(offPill);
      }
    } else {
      if (offPill) offPill.remove();
    }
  });
}


function renderVuSegments(pct, type) {
  const activeCount = Math.min(8, Math.max(1, Math.round((Number(pct || 50) / 100) * 8)));
  let html = '';
  for (let i = 0; i < 8; i++) {
    const isActive = type === 'buy' ? (i >= 8 - activeCount) : (i < activeCount);
    html += `<span class="vu-seg${isActive ? ' active' : ''}"></span>`;
  }
  return html;
}

function generateGaugeSvg(sym, dominant, buyerPct, sellerPct) {
  let ticksSvg = '';
  for (let th = -65; th <= 65; th += 5) {
    const rad = (th * Math.PI) / 180;
    const sin = Math.sin(rad);
    const cos = Math.cos(rad);
    const isMajor = Math.abs(th) % 15 === 0 || Math.abs(th) === 65 || th === 0;
    const rOut = 84;
    const rIn = isMajor ? 73 : 78;
    const x1 = (110 + rIn * sin).toFixed(1);
    const y1 = (106 - rIn * cos).toFixed(1);
    const x2 = (110 + rOut * sin).toFixed(1);
    const y2 = (106 - rOut * cos).toFixed(1);
    const strokeColor = th < -5 ? '#22c55e' : (th > 5 ? '#ef4444' : '#38bdf8');
    const strokeW = isMajor ? '2.4' : '1.2';
    const opacity = isMajor ? '1' : '0.6';
    ticksSvg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${strokeColor}" stroke-width="${strokeW}" opacity="${opacity}" />`;
  }

  return `
    <svg class="watch-gauge-svg" viewBox="0 0 220 160">
      <defs>
        <linearGradient id="mGradBuy" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#059669" />
          <stop offset="100%" stop-color="#22c55e" />
        </linearGradient>
        <linearGradient id="mGradSell" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ef4444" />
          <stop offset="100%" stop-color="#b91c1c" />
        </linearGradient>
        <filter id="mGlowGreen" x="-25%" y="-25%" width="150%" height="150%">
          <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#22c55e" flood-opacity="0.75"/>
        </filter>
        <filter id="mGlowRed" x="-25%" y="-25%" width="150%" height="150%">
          <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#ef4444" flood-opacity="0.75"/>
        </filter>
        <filter id="mGlowBlue" x="-25%" y="-25%" width="150%" height="150%">
          <feDropShadow dx="0" dy="0" stdDeviation="2.5" flood-color="#38bdf8" flood-opacity="0.8"/>
        </filter>
      </defs>

      <!-- Recessed Machine Guide Channel -->
      <path d="M 35.7 71.3 A 82 82 0 0 1 184.3 71.3" fill="none" stroke="rgba(203, 213, 225, 0.95)" stroke-width="13" stroke-linecap="round" />
      <path d="M 35.7 71.3 A 82 82 0 0 1 184.3 71.3" fill="none" stroke="rgba(15, 23, 42, 0.07)" stroke-width="1.2" stroke-linecap="round" />

      <!-- Glowing High-Voltage Pressure Arcs -->
      <path d="M 35.7 71.3 A 82 82 0 0 1 110 24" fill="none" stroke="url(#mGradBuy)" stroke-width="8" stroke-linecap="round" filter="url(#mGlowGreen)" opacity="1" />
      <path d="M 110 24 A 82 82 0 0 1 184.3 71.3" fill="none" stroke="url(#mGradSell)" stroke-width="8" stroke-linecap="round" filter="url(#mGlowRed)" opacity="1" />

      <!-- Concentric Micro-Track -->
      <path d="M 42 75 A 72 72 0 0 1 178 75" fill="none" stroke="rgba(15, 23, 42, 0.12)" stroke-width="1" stroke-dasharray="3 3" />

      <!-- Precision Radiated Ticks -->
      ${ticksSvg}

      <!-- Center Zero-Index (12 o'clock) -->
      <polygon points="110,17 105,25 115,25" fill="#38bdf8" filter="url(#mGlowBlue)" />
      <circle cx="110" cy="30" r="2.2" fill="#38bdf8" filter="url(#mGlowBlue)" />
      <text x="110" y="13" class="gauge-center-zero">0Δ</text>

      <!-- Cockpit Etchings -->
      <text x="21" y="89" class="gauge-label-buy">BUY</text>
      <text x="21" y="100" class="gauge-sub-buy">100%</text>

      <text x="199" y="89" class="gauge-label-sell">SELL</text>
      <text x="199" y="100" class="gauge-sub-sell">100%</text>

      <text x="68" y="48" class="gauge-tech-hash">« TORQUE</text>
      <text x="152" y="48" class="gauge-tech-hash">PRESSURE »</text>

      <!-- Crosshairs -->
      <line x1="102" y1="106" x2="118" y2="106" stroke="rgba(56, 189, 248, 0.35)" stroke-width="1.2" />
      <line x1="110" y1="98" x2="110" y2="114" stroke="rgba(56, 189, 248, 0.35)" stroke-width="1.2" />
      <circle cx="110" cy="106" r="12" fill="none" stroke="rgba(56, 189, 248, 0.25)" stroke-width="1.2" stroke-dasharray="2 2" />
    </svg>
  `;
}


function renderMarketWatches() {
  const grid = $('market-watch-grid');
  if (!grid) return;
  if (!marketWatches || marketWatches.length === 0) {
    grid.innerHTML = '<div style="color:var(--txt-dim);padding:14px;font-size:13px;grid-column:1/-1;text-align:center;">Analyzing market symbols and order flow...</div>';
    return;
  }

  // The pipeline shows exactly ONE dial: the market picked in the top box.
  const activeSym = flowSymbol();
  const row = activeSym ? findWatchForSymbol(activeSym) : null;

  // Overall market pressure summary (patched live on every stream push)
  updateWatchSummaryPill();

  if (!activeSym || !row) {
    if (grid.dataset.one !== String(activeSym)) {
      grid.dataset.one = String(activeSym);
      grid.innerHTML = `<div class="watch-dial-empty">${esc(activeSym ? t('flowNoDial') : t('flowNoDialShort'))}</div>`;
    }
    return;
  }
  grid.dataset.one = String(activeSym);

  grid.innerHTML = [row].map((w, idx) => {
    const sym = w.symbol || '';
    const isActive = sym.toUpperCase() === activeSym.toUpperCase();
    const dominant = String(w.dominant || 'NEUTRAL').toUpperCase();
    const domCls = watchDominantClass(dominant);
    const needleDeg = Number(w.needle_deg || 0);
    const buyerPct = Number(w.buyer_pct || 50);
    const sellerPct = Number(w.seller_pct || 50);
    const digits = Number(w.digits || 2);
    const priceStr = w.ask ? nf(w.ask, digits) : '—';
    const spreadStr = esc(w.spread !== undefined ? String(w.spread) : '—');
    const { flow, arrow: flowArrow } = watchFlowMeta(w.candle_flow);
    const isLive = w.live !== false;
    const isOpen = w.market_open !== false;
    const domBadgeText = !isOpen ? 'MARKET OFF' : watchAnnunciatorText(dominant, buyerPct, sellerPct);
    const cardTitle = !isOpen
      ? (LANG === 'bn' ? `${sym} মার্কেটটি বর্তমানে বন্ধ (Market Closed)` : `${sym} market is currently closed`)
      : (LANG === 'bn' ? 'ক্লিক করে এই মার্কেট সিলেক্ট করুন' : 'Click to select this market');
    const stateBadgeHtml = !isOpen
      ? `<span class="machine-off-badge${isActive ? ' active-off' : ''}">MARKET OFF</span>`
      : (isActive ? `<span class="machine-engaged-badge">ENGAGED</span>` : `<span class="machine-standby-badge">STANDBY</span>`);

    return `
      <div class="watch-card${isActive ? ' active-target' : ''}${!isOpen ? ' market-off' : ''}" data-sym="${esc(sym)}" title="${esc(cardTitle)}">
        <!-- 4 Machine Hex Socket Screws -->
        <div class="machine-bolt bolt-tl"></div>
        <div class="machine-bolt bolt-tr"></div>
        <div class="machine-bolt bolt-bl"></div>
        <div class="machine-bolt bolt-br"></div>

        <!-- Machine Card Top Strip -->
        <div class="machine-card-header">
          <div class="machine-chip-id">
            <span class="machine-led-pulse ${!isOpen ? 'off' : domCls}"></span>
            <span class="machine-label-text">CHRONO-${String(idx + 1).padStart(2, '0')}</span>
          </div>
          <span class="machine-clock${isLive ? '' : ' sim'}" title="${isLive ? 'Last live reading' : (w.price_source === 'public' ? 'Public API price — Yahoo / Binance' : 'Simulated data — MT5 not connected')}">${watchClockText(w.updated_at)}</span>
          ${stateBadgeHtml}
        </div>

        <!-- Machine Watch Dial Case -->
        <div class="watch-case">
          <div class="watch-bezel">
            <div class="watch-bezel-rim"></div>
            
            ${generateGaugeSvg(sym, dominant, buyerPct, sellerPct)}

            <!-- Rotating Machine Needle -->
            <div class="watch-hand-wrap" style="transform: rotate(${needleDeg}deg);">
              <div class="watch-hand-counterweight"></div>
              <div class="watch-hand-lance ${domCls}">
                <div class="lance-core"></div>
              </div>
              <div class="watch-hand-boss">
                <div class="boss-center-screw"></div>
              </div>
            </div>

            <!-- Center Hub: Market Name in the Middle -->
            <div class="watch-center-hub">
              <div class="watch-market-plate">
                <span class="watch-market-symbol">${esc(w.displayName || sym)}</span>
              </div>
              <div class="watch-price-display">${priceStr}</div>
              <div class="watch-annunciator ${!isOpen ? 'off' : domCls}">
                <span class="annunciator-lamp ${!isOpen ? 'off' : ''}"></span>
                <span class="annunciator-text">${domBadgeText}</span>
              </div>
            </div>

            <div class="watch-glass-sheen"></div>
          </div>
        </div>

        <!-- Machine Lower Telemetry Deck -->
        <div class="watch-telemetry-deck">
          <div class="watch-pressure-split">
            <span class="pressure-label buyer">
              <span class="tele-dot green"></span>
              BUY: <b>${buyerPct}%</b>
            </span>
            <span class="tele-divider">//</span>
            <span class="pressure-label seller">
              SELL: <b>${sellerPct}%</b>
              <span class="tele-dot red"></span>
            </span>
          </div>

          <!-- 16-Segment Dual LED VU-Meter -->
          <div class="vu-meter-rack" title="Buyer: ${buyerPct}% · Seller: ${sellerPct}%">
            <div class="vu-meter-bar vu-buy">
              ${renderVuSegments(buyerPct, 'buy')}
            </div>
            <div class="vu-meter-divider"></div>
            <div class="vu-meter-bar vu-sell">
              ${renderVuSegments(sellerPct, 'sell')}
            </div>
          </div>

          <!-- Big Buyer / Seller pressure readout (the space under the dial) -->
          <div class="watch-pressure-bigrack" title="Buyer: ${buyerPct}% · Seller: ${sellerPct}%">
            <div class="wpb wpb-buyer">
              <span class="wpb-name">BUYER</span>
              <b class="wpb-val">${buyerPct}%</b>
              <span class="wpb-sub">${LANG === 'bn' ? 'বায়ার চাপ' : 'buyer pressure'}</span>
            </div>
            <div class="wpb-vs">⇄</div>
            <div class="wpb wpb-seller">
              <span class="wpb-name">SELLER</span>
              <b class="wpb-val">${sellerPct}%</b>
              <span class="wpb-sub">${LANG === 'bn' ? 'সেলার চাপ' : 'seller pressure'}</span>
            </div>
          </div>

          <!-- Machine Specs Row: price / watch direction / flow / spread / target -->
          <div class="machine-specs-row">
            <div class="spec-item">
              <span class="spec-k">PRICE</span>
              <span class="spec-v spec-bid">${w.bid ? nf(w.bid, digits) : '—'}</span>
            </div>
            <div class="spec-item">
              <span class="spec-k">DIR</span>
              <span class="spec-v spec-direction ${String(w.direction || 'FLAT').toLowerCase()}">${String(w.direction || 'FLAT').toUpperCase() === 'UP' ? '▲ UP' : String(w.direction || 'FLAT').toUpperCase() === 'DOWN' ? '▼ DOWN' : '► FLAT'}</span>
            </div>
            <div class="spec-item">
              <span class="spec-k">FLOW</span>
              <span class="spec-v flow-val spec-flow ${flow}">${flowArrow} ${flow.toUpperCase()}</span>
            </div>
            <div class="spec-item">
              <span class="spec-k">SPREAD</span>
              <span class="spec-v spec-spread">${spreadStr}</span>
            </div>
            <div class="spec-item">
              <span class="spec-k">TARGET</span>
              <span class="spec-v target-btn spec-target${!isOpen ? ' disabled' : (isActive ? ' active' : '')}" title="${!isOpen ? (LANG === 'bn' ? 'মার্কেট বন্ধ' : 'Market closed') : ''}">${!isOpen ? 'OFF' : (isActive ? 'ACTIVE' : 'SELECT')}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');


  // The dial mirrors the market picker at the top of the pipeline - the box owns
  // the choice, so the grid stays read-only.
}


/* ------------------------------------------------------------ auto trading */
function renderPriceMap() {}
function tickBot2TrendCountdown() {}
function renderBot() {}
function bindBotUI() {}
function renderBot2() {}
function bindBot2UI() {}
function renderBot3(d) {
  const b = d.bot3 || {};
  const cfg = b.config || {};
  const running = !!b.running;
  const live = !!d.connected;
  const wanted = b.symbol_requested || cfg.symbol || 'XAUUSDm';
  const sym = b.symbol || '';
  const symOk = !!b.symbol_ok && sym;
  const shown = symOk ? sym : wanted;
  const b3Panel = $('bot3-panel');
  if (b3Panel) {
    const chip = $('bot3-chip');
    if (chip) {
      chip.className = 'bot-chip ' + (!live ? 'offline' : running ? 'running' : 'stopped');
      chip.textContent = !live ? t('botOffline') : running ? t('botRunning') : t('botStopped');
    }

    if ($('bot3-start')) $('bot3-start').classList.toggle('active', running);
    if ($('bot3-stop')) $('bot3-stop').classList.toggle('active', !running && live);

    if ($('bot3-symbol')) $('bot3-symbol').textContent = shown;

    let priceStr = '';
    if (b.ask && b.bid) {
      const askStr = fmtPrice(b.ask);
      const bidStr = fmtPrice(b.bid);
      const spStr = b.spread !== undefined ? esc(String(b.spread)) : '';
      priceStr = ` · Ask <b>${askStr}</b> / Bid <b>${bidStr}</b> <span style="font-size:11px;color:var(--txt-faint)">(Spread ${spStr})</span>`;
    }
    if ($('bot3-symbol-name')) {
      $('bot3-symbol-name').innerHTML = `${esc(shown)}${priceStr}`;
      $('bot3-symbol-name').style.color = symOk ? 'var(--accent)' : '#fca5a5';
    }

    // ---- market chips
    const pick = $('bot3-market-chips');
    if (pick) {
      const options = (b.symbol_options && b.symbol_options.length ? b.symbol_options : []);
      const list = options.length ? options.slice() : [shown];
      if (!list.includes(shown)) list.unshift(shown);
      if (live) {
        const sig = list.join(',') + '|' + shown;
        if (pick.dataset.n !== sig) {
          pick.dataset.n = sig;
          pick.innerHTML = list.map((s) =>
            `<button type="button" class="chip${s === shown ? ' active' : ''}" data-sym="${esc(s)}">${esc(s)}</button>`).join('');
        }
        pick.classList.remove('hidden');
      } else {
        pick.classList.remove('hidden');
        pick.querySelectorAll('.chip').forEach(c => {
          c.classList.toggle('active', c.dataset.sym === shown);
        });
      }
    }
    setBotCurveSymbol('bot3', shown);

    // inputs update if not focused
    const lotEl = $('bot3-lot');
    if (lotEl && document.activeElement !== lotEl && cfg.lot !== undefined) lotEl.value = cfg.lot;
    const maxTradesEl = $('bot3-max-trades');
    if (maxTradesEl && document.activeElement !== maxTradesEl && cfg.max_trades !== undefined) maxTradesEl.value = cfg.max_trades;
    const tpEl = $('bot3-tp');
    if (tpEl && document.activeElement !== tpEl && cfg.tp !== undefined) tpEl.value = Number(cfg.tp).toFixed(2);
    const slEl = $('bot3-sl');
    if (slEl && document.activeElement !== slEl && cfg.sl !== undefined) slEl.value = Number(cfg.sl).toFixed(2);

    // Timeframe Toggle (D1, W1, PREV)
    const levelsData = b.levels || {};
    const tf = (cfg.timeframe || 'D1').toUpperCase();
    document.querySelectorAll('#bot3-tf-toggle .chip').forEach(btn => {
      btn.classList.toggle('active', (btn.dataset.tf || '').toUpperCase() === tf);
    });

    // Extract levels for selected timeframe
    let curLevels = {};
    let hhSub = 'Higher High';
    let lhSub = 'Lower High';
    let hlSub = 'Higher Low';
    let llSub = 'Lower Low';

    if (tf === 'W1') {
      curLevels = levelsData.w1 || {};
      hhSub = 'This Week High (HH)';
      lhSub = 'This Week LH';
      hlSub = 'This Week HL';
      llSub = 'This Week Low (LL)';
    } else if (tf === 'PREV') {
      curLevels = levelsData.prev || {};
      hhSub = 'Prev Week High (HH)';
      lhSub = 'Prev Week LH';
      hlSub = 'Prev Week HL';
      llSub = 'Prev Week Low (LL)';
    } else {
      curLevels = levelsData.d1 || {};
      hhSub = 'Today High (HH)';
      lhSub = 'Today LH';
      hlSub = 'Today HL';
      llSub = 'Today Low (LL)';
    }

    if ($('bot3-hh')) $('bot3-hh').textContent = curLevels.hh ? fmtPrice(curLevels.hh) : '—';
    if ($('bot3-lh')) $('bot3-lh').textContent = curLevels.lh ? fmtPrice(curLevels.lh) : '—';
    if ($('bot3-hl')) $('bot3-hl').textContent = curLevels.hl ? fmtPrice(curLevels.hl) : '—';
    if ($('bot3-ll')) $('bot3-ll').textContent = curLevels.ll ? fmtPrice(curLevels.ll) : '—';

    if ($('bot3-hh-sub')) $('bot3-hh-sub').textContent = hhSub;
    if ($('bot3-lh-sub')) $('bot3-lh-sub').textContent = lhSub;
    if ($('bot3-hl-sub')) $('bot3-hl-sub').textContent = hlSub;
    if ($('bot3-ll-sub')) $('bot3-ll-sub').textContent = llSub;

    // Active touch highlight
    const curMid = (Number(b.ask || 0) + Number(b.bid || 0)) / 2;
    const tol = Math.max(Number(b.spread || 0) * 3, curMid * 0.0006);
    const cards = document.querySelectorAll('#bot3-struct-grid .struct-card');
    if (cards.length === 4 && curMid > 0) {
      cards[0].classList.toggle('active-touch', !!curLevels.hh && Math.abs(curMid - curLevels.hh) <= tol);
      cards[1].classList.toggle('active-touch', !!curLevels.lh && Math.abs(curMid - curLevels.lh) <= tol);
      cards[2].classList.toggle('active-touch', !!curLevels.hl && Math.abs(curMid - curLevels.hl) <= tol);
      cards[3].classList.toggle('active-touch', !!curLevels.ll && Math.abs(curMid - curLevels.ll) <= tol);
    }
  }

  // ---- Radar Timer & Zone Pill
  const zonePill = $('bot3-zone-pill');
  if (zonePill) {
    const zs = b.zone_status || 'MIDDLE (WAITING)';
    zonePill.textContent = zs;
    zonePill.className = 'radar-zone-pill ' + (zs.includes('BUY') ? 'in-buy' : zs.includes('SELL') ? 'in-sell' : '');
  }

  // Sync 60s auto-recalculation timer with backend countdown
  if (b.recalc_countdown !== undefined && b.recalc_countdown !== null && !_bot3RecalcPending) {
    if (Math.abs(bot3RecalcRemaining - b.recalc_countdown) > 2) {
      bot3RecalcRemaining = Number(b.recalc_countdown);
    }
  }
  updateBot3TimerPills(bot3RecalcRemaining);
  if (b.last_recalc_ts) {
    updateBot3LastUpdated(b.last_recalc_ts);
  }

  // ---- Next 5 Planned Trades List
  const plannedEl = $('bot3-planned-trades');
  const planned = b.planned_trades || [];
  if (plannedEl) {
    if (!planned.length) {
      plannedEl.innerHTML = `
        <div class="pt-empty-state">
          <span class="pt-empty-icon">⏳</span>
          <span class="pt-empty-text">${LANG === 'bn' ? 'এক্সট্রিম সেটআপ হিসাব হচ্ছে... অপেক্ষা করুন' : 'Calculating extreme setups... Please wait'}</span>
        </div>
      `;
    } else {
      const isBn = LANG === 'bn';
      plannedEl.innerHTML = planned.map((p) => {
        const rank = p.priority_rank || p.id || 1;
        const rankCls = rank === 1 ? 'rank-1' : (rank === 2 ? 'rank-2' : '');
        const isBuy = (p.action || '').toUpperCase() === 'BUY';
        const touchCls = p.is_touch ? ' touching' : '';
        const statusCls = p.status_cls || (p.is_touch ? 'trigger' : 'pending');
        const statusTxt = isBn ? (p.status_text_bn || p.status_text || 'অপেক্ষমাণ') : (p.status_text || 'PENDING');

        const distStr = (p.distance !== undefined && p.distance !== null && p.distance !== '') ? `$${fmtPrice(p.distance)} away` : (isBn ? 'লেভেলে আছে' : 'at level');
        const distPctStr = (p.dist_pct !== undefined && p.dist_pct !== null) ? ` (${p.dist_pct}%)` : '';
        const distDisplay = distStr + distPctStr;
        const nearCls = (p.is_touch || (p.dist_pct !== undefined && p.dist_pct <= 0.35)) ? ' near' : '';

        const desc = isBn ? (p.reason_bn || p.reason) : p.reason;
        const tpValEst = p.est_tp_price ? fmtPrice(p.est_tp_price) : '--';
        const slValEst = p.est_sl_price ? fmtPrice(p.est_sl_price) : '--';
        const tpDollar = p.tp ? `$${p.tp}` : `$${nf(b.config ? b.config.tp || 0.5 : 0.5, 2)}`;
        const slDollar = p.sl ? `$${p.sl}` : `$${nf(b.config ? b.config.sl || 5.0 : 5.0, 2)}`;

        return `
          <div class="pt-card ${isBuy ? 'buy' : 'sell'}${touchCls}">
            <div class="pt-card-header">
              <div class="pt-card-tags">
                <span class="pt-rank-badge ${rankCls}">#${rank}</span>
                <span class="pt-badge">${esc(p.action)}</span>
                <span class="pt-scope-tag">${esc(p.scope || '')}</span>
              </div>
              <span class="pt-status-pill status-${statusCls}">${esc(statusTxt)}</span>
            </div>
            <div class="pt-card-body">
              <div class="pt-info">
                <span class="pt-name">${esc(p.label)}</span>
                <span class="pt-desc">${esc(desc)}</span>
              </div>
              <div class="pt-metrics">
                <div class="pt-metric-row">
                  <span class="pt-metric-lbl">${isBn ? 'লেভেল' : 'Level'}:</span>
                  <span class="pt-price">${fmtPrice(p.price)}</span>
                </div>
                <div class="pt-metric-row">
                  <span class="pt-metric-lbl">${isBn ? 'দূরত্ব' : 'Dist'}:</span>
                  <span class="pt-dist${nearCls}">${esc(distDisplay)}</span>
                </div>
              </div>
            </div>
            <div class="pt-card-targets">
              <span class="pt-target-tag tp">🎯 TP: ${tpValEst} (+${tpDollar})</span>
              <span class="pt-target-tag sl">🛡️ SL: ${slValEst} (-${slDollar})</span>
            </div>
          </div>
        `;
      }).join('');
    }
  }
  window.dispatchEvent(new CustomEvent('bot3:planned-trades', {
    detail: { symbol: shown, planned: planned }
  }));

  if (b3Panel) {
    const lotEl = $('bot3-lot');
    const maxTradesEl = $('bot3-max-trades');
    const tpEl = $('bot3-tp');
    const slEl = $('bot3-sl');
    const lot = Number(lotEl ? lotEl.value : (cfg.lot || 0.01));
    const maxTrades = Number(maxTradesEl ? maxTradesEl.value : (cfg.max_trades || 1));
    const tpVal = Number(tpEl ? tpEl.value : (cfg.tp || 0.50));
    const slVal = Number(slEl ? slEl.value : (cfg.sl || 5.00));

    // Conditions list
    const isBn = LANG === 'bn';
    const conds = isBn ? [
      `<b>১. চরম সীমা লেভেল চেক:</b> আজকের দিন (D1), চলতি সপ্তাহ ওপেনিং (W1) এবং গত সপ্তাহের (Prev W1) সব Higher High (HH) এবং Lower Low (LL) নিয়মিত স্ক্যান করে।`,
      `<b>২. এক্সট্রিম রেঞ্জ এন্ট্রি:</b> মার্কেট একদম <b>নিচে (LL)</b> নামলে <b>BUY</b> ট্রেড নিবে; মার্কেট একদম <b>উপরে (HH)</b> উঠলে <b>SELL</b> ট্রেড নিবে (TP <b>$${nf(tpVal, 2)}</b>, SL <b>$${nf(slVal, 2)}</b>)।`,
      `<b>৩. মিডল জোন ফিল্টার:</b> রেঞ্জের মাঝে কোনো ট্রেড নিবে না — শুধুই একদম উপর বা নিচ থেকে হাই-প্রোবাবিলিটি ট্রেড নিবে।`,
      `<b>৪. রানিং লিমিট:</b> লট <b>${lot}</b> · একসাথে সর্বোচ্চ <b>${maxTrades}</b> টি ট্রেড রানিং থাকবে।`,
    ] : [
      `<b>1. Extreme Structure Monitoring:</b> Continuously tracks Today (D1), This Week (W1), and Previous Week (Prev W1) Higher High (HH) and Lower Low (LL) extremes.`,
      `<b>2. Extreme Sniper Execution:</b> When market is at the absolute <b>bottom (LL)</b> -> Take <b>BUY</b>; when at the absolute <b>top (HH)</b> -> Take <b>SELL</b> (TP <b>$${nf(tpVal, 2)}</b>, SL <b>$${nf(slVal, 2)}</b>).`,
      `<b>3. Middle Range Filter:</b> Strictly NO TRADES in the middle zone — exclusively snipes extremes.`,
      `<b>4. Trade Limits:</b> Lot <b>${lot}</b> · Maximum <b>${maxTrades}</b> concurrent trade(s) running at once.`,
    ];
    const condEl = $('bot3-cond');
    if (condEl) condEl.innerHTML = conds.map((c) => `<li>${c}</li>`).join('');

    // Running line & pos
    const pos = b.positions || [];
    const runningCount = b.running_count !== undefined ? b.running_count : pos.length;
    const runEl = $('bot3-running-line');
    if (runEl) runEl.innerHTML = `<b>${isBn ? 'রানিং ট্রেড' : 'Running Trades'}:</b> <b>${runningCount} / ${maxTrades}</b> (Slot: ${maxTrades - runningCount > 0 ? (maxTrades - runningCount) + ' available' : 'FULL'})`;

    const posEl = $('bot3-pos');
    if (posEl) {
      posEl.innerHTML = pos.length
        ? pos.map((p) => {
            const side = (p.side || 'buy').toUpperCase();
            const sideColor = side === 'BUY' ? 'var(--win)' : 'var(--loss)';
            const net = Number(p.net || 0);
            const netStr = `${net >= 0 ? '+' : ''}$${net.toFixed(2)}`;
            const netColor = net >= 0 ? 'var(--win)' : 'var(--loss)';
            return `<span style="font-family:var(--mono)">#${p.ticket} <b style="color:${sideColor}">${side}</b> ${p.volume} @ ${fmtPrice(p.price_open)} &rarr; <b style="color:${netColor}">${netStr}</b></span>`;
          }).join(' · ')
        : (isBn ? 'নেই' : 'none');
    }

    const stats = b.stats || {};
    const opened = stats.opened || 0;
    const closed = stats.closed || 0;
    const realized = stats.realized !== undefined ? Number(stats.realized).toFixed(2) : '0.00';
    const actionText = b.last_action ? ` · <i>${esc(b.last_action)}</i>` : '';
    const lastEl = $('bot3-last');
    if (lastEl) {
      lastEl.innerHTML = `${esc(t('botMarketNow'))}: <b>${esc(shown)}</b> · ` +
        `${opened} ${t('botOpened')} / ${closed} ${t('botClosed')} (P/L: $${realized})${actionText}`;
      lastEl.className = 'bot-line' + (b.last_error ? ' warn' : '');
    }
    renderPriceMap('bot3', b);
  }
}

async function bot3Post(path, body) {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const j = await res.json();
    if (!res.ok) {
      const msg = (j.error && j.error.message) || j.detail || 'Request failed';
      toast('error', msg);
      return j;
    }
    if (j.bot3) { if (S) { S.bot3 = j.bot3; renderBot3(S); } }
    return j;
  } catch (e) { toast('error', String(e)); return {}; }
}

function bindBot3UI() {
  const b3Start = $('bot3-start');
  if (b3Start) {
    b3Start.addEventListener('click', async () => {
      const sym = (S && S.bot3 && S.bot3.symbol) || 'XAUUSDm';
      if (!isMarketOpen(sym)) {
        toast('error', LANG === 'bn' ? `${sym} মার্কেটটি বর্তমানে বন্ধ থাকায় বট চালু করা যাবে না` : `Cannot start bot: ${sym} market is currently closed`);
        return;
      }
      const lot = Number($('bot3-lot')?.value || 0.01);
      const maxTrades = Number($('bot3-max-trades')?.value || 1);
      const tp = Number($('bot3-tp')?.value || 0.50);
      const sl = Number($('bot3-sl')?.value || 5.00);
      const ok = window.confirm(
        LANG === 'bn'
          ? `এক্সট্রিম স্ট্রাকচার বট চালু করবেন?\n\nলট: ${lot}\nসর্বোচ্চ রানিং ট্রেড: ${maxTrades}\nTP: $${tp} | SL: $${sl}`
          : `Start Extreme Structure Bot?\n\nLot: ${lot}\nMax Trades: ${maxTrades}\nTP: $${tp} | SL: $${sl}`
      );
      if (!ok) return;
      const res = await bot3Post('/api/bot3/start', { lot, max_trades: maxTrades, tp, sl });
      if (res && res.ok) toast('ok', LANG === 'bn' ? 'বট ৩ চালু হয়েছে' : 'Bot 3 Started');
    });
  }

  const b3Stop = $('bot3-stop');
  if (b3Stop) {
    b3Stop.addEventListener('click', async () => {
      const res = await bot3Post('/api/bot3/stop', {});
      if (res && res.ok) toast('ok', LANG === 'bn' ? 'বট ৩ বন্ধ করা হলো' : 'Bot 3 Stopped');
    });
  }

  const b3Close = $('bot3-close');
  if (b3Close) {
    b3Close.addEventListener('click', async () => {
      if (!window.confirm(LANG === 'bn' ? 'বট ৩ এর সব খোলা ট্রেড এখনই ক্লোজ করবেন?' : 'Close all Bot 3 open positions right now?')) return;
      const res = await bot3Post('/api/bot3/close', {});
      if (res && res.ok) toast('ok', `${LANG === 'bn' ? 'ক্লোজ করা ট্রেড' : 'Closed positions'} (${res.closed || 0})`);
    });
  }

  const b3Lot = $('bot3-lot');
  if (b3Lot) {
    b3Lot.addEventListener('change', () => {
      void bot3Post('/api/bot3/config', { lot: Number(b3Lot.value || 0.01) });
    });
  }
  const b3MaxTrades = $('bot3-max-trades');
  if (b3MaxTrades) {
    b3MaxTrades.addEventListener('change', () => {
      void bot3Post('/api/bot3/config', { max_trades: Math.max(1, parseInt(b3MaxTrades.value || 1, 10)) });
    });
  }
  const b3Tp = $('bot3-tp');
  if (b3Tp) {
    b3Tp.addEventListener('change', () => {
      void bot3Post('/api/bot3/config', { tp: Number(b3Tp.value || 0.50) });
    });
  }
  const b3Sl = $('bot3-sl');
  if (b3Sl) {
    b3Sl.addEventListener('change', () => {
      void bot3Post('/api/bot3/config', { sl: Number(b3Sl.value || 5.00) });
    });
  }

  const b3Chips = $('bot3-market-chips');
  if (b3Chips) {
    b3Chips.addEventListener('click', async (e) => {
      const chip = e.target && e.target.closest ? e.target.closest('.chip') : null;
      if (!chip || !chip.dataset.sym) return;
      const sym = chip.dataset.sym;
      if (chip.classList.contains('market-off') || !isMarketOpen(sym)) {
        toast('warn', LANG === 'bn' ? `${sym} মার্কেটটি বর্তমানে বন্ধ রয়েছে (Market Closed)` : `${sym} market is currently closed`);
        return;
      }

      document.querySelectorAll('#bot3-market-chips .chip')
        .forEach(c => c.classList.toggle('active', c.dataset.sym === sym));
      if ($('bot3-symbol')) $('bot3-symbol').textContent = sym;
      if ($('bot3-symbol-name')) $('bot3-symbol-name').textContent = sym;
      b3Chips.dataset.n = '';
      setBotCurveSymbol('bot3', sym);

      const res = await bot3Post('/api/bot3/config', { symbol: sym });
      if (res && res.ok) {
        if (res.bot3) {
          if (S) S.bot3 = res.bot3;
          renderBot3(S);
        }
        toast('ok', `${t('botMarketSwitched')}: ${sym}`);
        if (wsAlive) ws.send(JSON.stringify({ type: 'refresh' }));
      }
    });
  }

  const b3Tf = $('bot3-tf-toggle');
  if (b3Tf) {
    b3Tf.addEventListener('click', async (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('button') : null;
      if (!btn || !btn.dataset.tf) return;
      const tf = btn.dataset.tf;
      document.querySelectorAll('#bot3-tf-toggle .chip').forEach(b => b.classList.toggle('active', b === btn));
      const res = await bot3Post('/api/bot3/config', { timeframe: tf });
      if (res && res.ok && res.bot3) {
        if (S) S.bot3 = res.bot3;
        renderBot3(S);
      }
    });
  }

  const recalcBtn = $('bot3-recalc-btn');
  if (recalcBtn) {
    recalcBtn.addEventListener('click', () => {
      void triggerBot3Recalculate(true);
    });
  }
}

/* ------------------------------------------------------ bot 4 (pre-trade ladder) */
function renderBot4() {}
function renderBot4Ladder() {}
function bindBot4UI() {}
const BOT5_MODES = ['anticipate', 'straddle', 'follow'];
const BOT5_IMPACTS = ['high', 'medium', 'all'];

/* Short labels for every news site that feeds the calendar */
const NEWS_SRC_LABEL = {
  'tradingview': 'TV',
  'forex-factory': 'FF',
  'investing.com': 'INV',
  'yahoo-finance': 'YH',
  'google-news': 'G',
};

// ---- fast stand-in for toLocaleString(weekday, hour, minute) --------------
// Locale formatting costs ~0.5ms per call and the news page formats 460 rows
// on every rebuild - this keeps the exact same text at ~0ms.
const _WD_SHORT_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const _WD_SHORT_BN = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহস্পতি', 'শুক্র', 'শনি'];
const _BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
const _bnDigits = (s) => String(s).replace(/[0-9]/g, (c) => _BN_DIGITS[c.charCodeAt(0) - 48]);

function fmtNewsWhen(ts, bn) {
  const d = new Date(Number(ts) * 1000);
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (!bn) return `${_WD_SHORT_EN[d.getDay()]} ${String(d.getHours()).padStart(2, '0')}:${mm}`;
  const h12 = String(d.getHours() % 12 || 12).padStart(2, '0');
  return `${_WD_SHORT_BN[d.getDay()]} ${_bnDigits(h12)}:${_bnDigits(mm)} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}

function newsRelativeTime(ts, isPast, nowSec) {
  const diffSec = ts - nowSec, mins = Math.round(diffSec / 60), isBn = LANG === 'bn';
  if (isPast) {
    const ago = Math.max(1, Math.round(-diffSec / 60));
    return '📰 ' + (ago < 60 ? (isBn ? `${ago}মি. আগে` : `${ago}m ago`)
      : ago < 1440 ? (isBn ? `${Math.floor(ago / 60)}ঘ. আগে` : `${Math.floor(ago / 60)}h ago`)
        : (isBn ? `${Math.floor(ago / 1440)}দিন আগে` : `${Math.floor(ago / 1440)}d ago`));
  }
  if (diffSec <= 0) return isBn ? '⏱ লাইভ' : '⏱ LIVE';
  if (mins < 60) return isBn ? `আর ${mins}মি.` : `in ${mins}m`;
  if (mins < 1440) {
    const h = Math.floor(mins / 60), rm = mins % 60;
    return isBn ? `আর ${h}ঘ.${rm ? ` ${rm}মি.` : ''}` : `in ${h}h${rm ? ` ${rm}m` : ''}`;
  }
  const days = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60);
  return isBn ? `আর ${days}দিন ${h}ঘ.` : `in ${days}d ${h}h`;
}

let newsRelativeMinute = -1;
function updateNewsRelativeTimes(force = false) {
  if (document.hidden || !botsDrawerOpen()) return;
  const now = Date.now() / 1000, minute = Math.floor(now / 60);
  if (!force && minute === newsRelativeMinute) return;
  newsRelativeMinute = minute;
  document.querySelectorAll('#bot5-news .news-row[data-news-time]').forEach(row => {
    const label = row.querySelector('.news-min');
    const text = newsRelativeTime(Number(row.dataset.newsTime), row.dataset.newsPast === 'true', now);
    if (label && label.textContent !== text) label.textContent = text;
  });
}

function renderBot5(d) {
  const b = d.bot5 || {};
  const cfg = b.config || {};
  const running = !!b.running;
  const live = !!d.connected;
  const isBn = LANG === 'bn';

  const chip = $('bot5-chip');
  if (chip) {
    chip.className = 'bot-chip ' + (!live ? 'offline' : running ? 'running' : 'stopped');
    chip.textContent = !live ? t('botOffline') : running ? t('botRunning') : t('botStopped');
  }
  if ($('bot5-start')) $('bot5-start').classList.toggle('active', running);
  if ($('bot5-stop')) $('bot5-stop').classList.toggle('active', !running && live);

  // ---- symbol + live price
  const wanted = b.symbol_requested || cfg.symbol || 'XAUUSDm';
  const sym = b.symbol || '';
  const symOk = !!b.symbol_ok && sym;
  const shown = symOk ? sym : wanted;
  if ($('bot5-symbol')) $('bot5-symbol').textContent = shown;

  let priceStr = '';
  if (b.ask && b.bid) {
    priceStr = ` · Ask <b>${fmtPrice(b.ask)}</b> / Bid <b>${fmtPrice(b.bid)}</b>`;
  }
  if ($('bot5-symbol-name')) {
    $('bot5-symbol-name').innerHTML = `${esc(shown)}${priceStr}`;
    $('bot5-symbol-name').style.color = symOk ? 'var(--accent)' : '#fca5a5';
  }

  // ---- market chips: ALL MARKETS the news engine covers -----------------
  const pick = $('bot5-market-chips');
  if (pick) {
    const options = (b.symbol_options && b.symbol_options.length ? b.symbol_options : []);
    const list = options.length ? options.slice() : [shown];
    if (!list.includes(shown)) list.unshift(shown);
    if (live) {
      const sig = list.join(',') + '|' + shown;
      if (pick.dataset.n !== sig) {
        pick.dataset.n = sig;
        pick.innerHTML = list.map((s) =>
          `<button type="button" class="chip${s === shown ? ' active' : ''}" data-sym="${esc(s)}">${esc(s)}</button>`).join('');
      }
      pick.classList.remove('hidden');
    } else {
      pick.classList.remove('hidden');
      pick.querySelectorAll('.chip').forEach(c => {
        c.classList.toggle('active', c.dataset.sym === shown);
      });
    }
  }
  setBotCurveSymbol('bot5', shown);

  // ---- feed pill + state --------------------------------------------
  const fp = $('bot5-feed-pill');
  if (fp) {
    const err = b.feed_error;
    fp.className = 'pill ' + (err ? 'down' : b.feed_count ? 'up' : '');
    fp.textContent = err ? 'NEWS ⚠' : 'NEWS';
    fp.title = err || '';
  }
  const fs = $('bot5-feed-state');
  if (fs) {
    let src = String(b.feed_source || (b.feed_count ? 'cache' : '—'));
    const when = b.feed_updated
      ? new Date(Number(b.feed_updated) * 1000).toLocaleTimeString(LANG === 'bn' ? 'bn-BD' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
      : '';
    fs.textContent = `${src} · ${b.feed_count || 0} ${isBn ? 'ইভেন্ট' : 'events'}${when ? ` · ${when}` : ''}`;
    fs.className = 'radar-timer-pill' + (b.feed_error ? ' warn' : '');
    fs.title = b.feed_error || '';
  }

  // ---- inputs update if not focused ---------------------------------
  const setNum = (id, val, min) => {
    const el = $(id);
    if (!el || val === undefined || val === null) return;
    if (document.activeElement !== el && Number(el.value) !== Number(val)) el.value = val;
    if (min !== undefined) el.min = min;
  };
  setNum('bot5-lot', cfg.lot);
  setNum('bot5-max-trades', cfg.max_trades, 1);
  setNum('bot5-pre', cfg.pre_minutes, 0);
  setNum('bot5-post', cfg.post_minutes, 1);
  setNum('bot5-tp', cfg.tp);
  setNum('bot5-sl', cfg.sl);
  const modeEl = $('bot5-mode');
  if (modeEl && document.activeElement !== modeEl && BOT5_MODES.includes(cfg.mode)) modeEl.value = cfg.mode;
  const impEl = $('bot5-impact');
  if (impEl && document.activeElement !== impEl && BOT5_IMPACTS.includes(cfg.min_impact)) impEl.value = cfg.min_impact;

  window.__lastPollData = d;

  // ---- next-event card + bias + impacted markets --------------------
  let curImpactFilter = (window.__activeNewsImpactFilter || 'high').toLowerCase();
  const panelSymbol = flowSymbol() || shown;
  const workspace = window.ChartWorkspace;
  const relevantNews = (event, market) => workspace && workspace.relevanceFor
    ? !!workspace.relevanceFor(event, market)
    : (event.impacted_markets || []).some(m => window.DashboardPanels.canonical(m.market) === window.DashboardPanels.canonical(market));
  const wsNewsState = workspace && typeof workspace.newsState === 'function' ? workspace.newsState() : null;
  const baseNews = (Array.isArray(b.news) && b.news.length) ? b.news : (wsNewsState && Array.isArray(wsNewsState.events) ? wsNewsState.events : []);
  const marketNews = baseNews
    .filter(e => e && window.DashboardPanels.newsPhase(e, Date.now()/1000) !== 'expired');
  renderBot5.nextNewsExpiry = marketNews.reduce((deadline, e) =>
    Math.min(deadline, window.DashboardPanels.newsExpires(e)), Infinity);
  const allNewsList = marketNews.filter(e => relevantNews(e, panelSymbol));
  const scheduledForMarket = allNewsList.filter(n => window.DashboardPanels.newsKind(n) !== 'headline');
  if (!window.__userPickedNewsImpactFilter && !scheduledForMarket.some(n => String(n.impact || 'low').toLowerCase() === curImpactFilter)) {
    const fallbackTier = ['high', 'medium', 'low'].find(tier =>
      scheduledForMarket.some(n => String(n.impact || 'low').toLowerCase() === tier));
    if (fallbackTier) {
      curImpactFilter = fallbackTier;
      window.__activeNewsImpactFilter = fallbackTier;
    }
  }
  const matchingNews = scheduledForMarket.filter(n => String(n.impact || 'low').toLowerCase() === curImpactFilter);

  const filterBar = $('news-impact-filter-bar');
  if (filterBar) {
    filterBar.querySelectorAll('.news-impact-btn').forEach(btn => {
      btn.classList.toggle('active', (btn.dataset.impact || '').toLowerCase() === curImpactFilter);
    });
  }

  const ev = window.DashboardPanels.selectEvent(allNewsList, panelSymbol, curImpactFilter, Date.now()/1000, relevantNews);
  window.__currentNewsCardEvent = ev;
  const card = $('bot5-next-card');
  const wCard = $('watch-next-card');

  // Derive explicit bias & direction from the event, its impacted platform markets, or live dials
  const selectedImpact = ev && workspace && workspace.impactFor ? workspace.impactFor(ev, panelSymbol) : null;
  const swingState = window.SwingAI && window.SwingAI.state ? window.SwingAI.state() : null;
  const swingStruct = window.SwingAI && window.SwingAI.structure ? window.SwingAI.structure() : null;
  const panelM5Bars = swingStruct && swingStruct.frames && Array.isArray(swingStruct.frames.M5) &&
    window.DashboardPanels.canonical(swingStruct.symbol || panelSymbol) === window.DashboardPanels.canonical(panelSymbol)
    ? swingStruct.frames.M5.slice(-64) : undefined;
  const estimateEvent = event => window.NewsDirection && window.NewsDirection.estimate({
    event, symbol: panelSymbol, now: Date.now()/1000, quote: window.SOFT_TV_QUOTE, market: swingState,
    barsM5: panelM5Bars,
    impact: workspace && workspace.impactFor ? workspace.impactFor(event, panelSymbol) : null,
    headlines: allNewsList.filter(n => n.kind === 'headline') });
  const evEstimate = ev && ((workspace && workspace.directionFor && workspace.directionFor(ev, panelSymbol)) || estimateEvent(ev));
  const bias = { side: evEstimate ? evEstimate.side : selectedImpact ? selectedImpact.side : '',
    reason: evEstimate ? evEstimate.reason : selectedImpact ? selectedImpact.reason : 'No supported market-direction evidence yet',
    confident: !!(evEstimate && evEstimate.strength >= 60) };
  const impChips = $('bot5-next-impacted-chips');
  const wImpChips = $('watch-next-impacted-chips');
  if (ev) {
    if (card) card.classList.remove('flat');
    if (wCard) wCard.classList.remove('flat');
    const titleTxt = ev.title || '—';
    const evTitle = $('bot5-event-title');
    if (evTitle) evTitle.textContent = titleTxt;
    const wTitle = $('watch-event-title');
    if (wTitle) wTitle.textContent = titleTxt;

    // Countdown is derived from the absolute release time on every paint.
    const mins = Math.round((Number(ev.ts || 0) - Date.now() / 1000) / 60);
    const whenTxt = mins >= 0
      ? (isBn ? `আর ${fmtCountdown(mins)}` : `in ${fmtCountdown(mins)}`)
      : (isBn ? `${fmtCountdown(-mins)} আগে` : `${fmtCountdown(-mins)} ago`);
    const metaHtml =
      `<span class="news-impact imp-${esc(ev.impact || 'low')}">${esc(String(ev.impact || 'low').toUpperCase())}</span>` +
      `<span class="news-cur">${esc(ev.currency || '')}</span>` +
      `<span class="news-when">${whenTxt}</span>` +
      (ev.forecast ? `<span class="news-fp">${isBn ? 'ফোরকাস্ট' : 'F'}: ${esc(ev.forecast)}</span>` : '') +
      (ev.previous ? `<span class="news-fp">${isBn ? 'প্রিভিয়াস' : 'P'}: ${esc(ev.previous)}</span>` : '');
    const evMeta = $('bot5-event-meta');
    if (evMeta) evMeta.innerHTML = metaHtml;
    const wMeta = $('watch-event-meta');
    if (wMeta) wMeta.innerHTML = metaHtml;

    const side = String(bias.side || '').toUpperCase();
    const confident = !!bias.confident;
    const pillClass = 'news-bias-pill ' + (side === 'BUY' ? 'buy' : side === 'SELL' ? 'sell' : 'wait') + (confident ? ' confident' : '');
    const pillText = side === 'BUY' ? '▲ BUY' : side === 'SELL' ? '▼ SELL' : (isBn ? 'ওয়েট' : 'WAIT');

    const pill = $('bot5-bias-pill');
    if (pill) {
      pill.className = pillClass;
      pill.textContent = pillText;
    }
    const wPill = $('watch-bias-pill');
    if (wPill) {
      wPill.className = pillClass;
      wPill.textContent = pillText;
    }

    const reasonTxt = bias.reason || (isBn ? 'বিয়াস হিসাব হচ্ছে…' : 'Calculating bias…');
    const evReason = $('bot5-bias-reason');
    if (evReason) evReason.textContent = reasonTxt;
    const wReason = $('watch-bias-reason');
    if (wReason) wReason.textContent = reasonTxt;

    // AI Expected Move (e.g. +$18.50 UP / -$22.00 DOWN)
    const moveAbs = evEstimate ? Number(evEstimate.move_abs) || 0 : 0;
    const pred = moveAbs > 0 ? { market: panelSymbol, direction: side === 'BUY' ? 'UP' : 'DOWN',
      text_en: (side === 'BUY' ? '+' : '-') + moveAbs.toFixed(moveAbs >= 1 ? 2 : 5) + (side === 'BUY' ? ' UP' : ' DOWN') + ' · estimate' } : null;
    let predHtml = '';
    const moveSide = side || (pred && pred.direction === 'UP' ? 'BUY' : (pred && pred.direction === 'DOWN' ? 'SELL' : ''));
    if (pred && (pred.text_en || pred.val_str) && moveSide) {
      const isBuy = moveSide.toLowerCase() === 'buy';
      const moveTxt = isBn ? (pred.text_bn || pred.text_en || pred.val_str) : (pred.text_en || pred.val_str);
      const tip = `${isBn ? 'AI প্রত্যাশিত মুভ' : 'AI Expected Move'}: ${moveTxt} (${pred.range_str || ''}) · ${esc(pred.market || '')}`;
      predHtml = `<span class="news-pred-pill ${isBuy ? 'up' : 'down'}" title="${esc(tip)}">
        <span class="pred-ai-tag">⚡ AI</span>
        <span>${esc(moveTxt)}</span>
      </span>`;
    }
    const predEl = $('bot5-predicted-move');
    if (predEl) predEl.innerHTML = predHtml;
    const wPredEl = $('watch-predicted-move');
    if (wPredEl) wPredEl.innerHTML = predHtml;

    // Calculate this event's effect per relevant catalogue market. An empty
    // backend impacted_markets array is not an asynchronous loading state.
    const terminal = window.SoftradeXTerminal;
    const catalogue = terminal && terminal.getMarkets ? terminal.getMarkets() : [];
    const impactSymbols = catalogue.length ? catalogue : b.symbol_options || [panelSymbol];
    const daily = window.MarketOutlookData;
    const now = Date.now()/1000;
    const impactKey = JSON.stringify([ev.title, ev.ts, ev.currency, ev.impact,
      ev.actual, ev.forecast, ev.previous, ev.impacted_markets, panelSymbol, impactSymbols, b.feed_updated,
      marketNews.length, daily && daily.status().ready, evEstimate && evEstimate.side]);
    let impactCache = renderBot5.eventImpactCache;
    if (!impactCache || impactCache.key !== impactKey || now - impactCache.at >= 10) {
      const rows = window.DashboardPanels.eventImpacts(ev, impactSymbols, panelSymbol, now, relevantNews,
        (event, symbol, context) => {
          if (window.DashboardPanels.canonical(symbol) === window.DashboardPanels.canonical(panelSymbol) && evEstimate) return evEstimate;
          return window.NewsDirection && window.NewsDirection.estimate({ event, symbol, now,
            market: context.market, quote: context.quote, headlines: context.headlines,
            headlinesPreSorted: context.headlinesPreSorted,
            impact: workspace && workspace.impactFor ? workspace.impactFor(event, symbol) : null });
        }, symbol => ({ market: swingState && swingState.fresh &&
            window.DashboardPanels.canonical(swingState.symbol) === window.DashboardPanels.canonical(symbol)
            ? swingState : daily && daily.get(symbol), quote: window.SOFT_TV_QUOTE }), marketNews);
      impactCache = renderBot5.eventImpactCache = { key: impactKey, at: now, rows };
    }
    const impacts = impactCache.rows;
    if (daily && daily.prioritize) daily.prioritize(impacts.map(m => m.market));
    let chipsHtml = '';
    if (impacts.length) {
      chipsHtml = impacts.map(m => {
        const isBuy = m.side === 'BUY', hasSide = !!m.side;
        const direction = isBuy ? '▲ BUY · UP' : hasSide ? '▼ SELL · DOWN' : (isBn ? 'দিক অনিশ্চিত' : 'NO SIGNAL');
        const move = m.move_abs > 0 ? (isBuy ? '+' : '−') + m.move_abs.toFixed(m.move_abs >= 1 ? 2 : 5) + ' · ' : '';
        const detail = hasSide ? `${move}${m.strength}% ${isBn ? 'সিগন্যাল · অনুমান' : 'strength · estimate'}`
          : (isBn ? 'দিক নির্ধারণের তথ্য নেই' : 'Directional evidence unavailable');
        return `<div class="imp-market-pill ${isBuy ? 'buy' : hasSide ? 'sell' : 'uncertain'}" data-market="${esc(m.market)}" title="${esc(m.reason)}">
          <span class="imp-sym">${esc(m.market)}</span>
          <span class="imp-dir">${direction}</span>
          <span class="imp-detail">${esc(detail)}</span>
        </div>`;
      }).join('');
    } else {
      chipsHtml = `<span class="imp-none">${isBn ? 'এই ইভেন্টের প্রভাব পড়ে এমন কোনো উপলভ্য মার্কেট পাওয়া যায়নি।' : 'No supported market has a mapped effect from this event.'}</span>`;
    }
    [impChips, wImpChips].filter(Boolean).forEach(target => {
      if (target.__impactHtml === chipsHtml) return;
      const scroll = target.scrollTop;
      target.innerHTML = chipsHtml;
      target.__impactHtml = chipsHtml;
      target.scrollTop = scroll;
    });
  } else {
    const predEl = $('bot5-predicted-move');
    if (predEl) predEl.innerHTML = '';
    const wPredEl = $('watch-predicted-move');
    if (wPredEl) wPredEl.innerHTML = '';
    if (card) card.classList.add('flat');
    if (wCard) wCard.classList.add('flat');
    const noNewsTxt = t('bot5NoNews');
    const evTitle = $('bot5-event-title');
    if (evTitle) evTitle.textContent = noNewsTxt;
    const wTitle = $('watch-event-title');
    if (wTitle) wTitle.textContent = noNewsTxt;

    const evMeta = $('bot5-event-meta');
    if (evMeta) evMeta.innerHTML = '—';
    const wMeta = $('watch-event-meta');
    if (wMeta) wMeta.innerHTML = '—';

    const pillWait = isBn ? 'ওয়েট' : 'WAIT';
    const pill = $('bot5-bias-pill');
    if (pill) {
      pill.className = 'news-bias-pill wait';
      pill.textContent = pillWait;
    }
    const wPill = $('watch-bias-pill');
    if (wPill) {
      wPill.className = 'news-bias-pill wait';
      wPill.textContent = pillWait;
    }

    const noEvReason = b.feed_error || (isBn ? 'কোনো ইভেন্ট নেই' : 'No event queued');
    const evReason = $('bot5-bias-reason');
    if (evReason) evReason.textContent = noEvReason;
    const wReason = $('watch-bias-reason');
    if (wReason) wReason.textContent = noEvReason;

    [impChips, wImpChips].filter(Boolean).forEach(target => {
      target.innerHTML = '—'; target.__impactHtml = null;
    });
    renderBot5.eventImpactCache = null;
    if (window.MarketOutlookData && window.MarketOutlookData.prioritize) window.MarketOutlookData.prioritize([]);
  }
  const planTxt = b.plan || '—';
  const planEl = $('bot5-plan');
  if (planEl) planEl.textContent = planTxt;
  const wPlanEl = $('watch-plan');
  if (wPlanEl) wPlanEl.textContent = planTxt;

  // Render filtered news items in #watch-filtered-news-list
  const wFilteredList = $('watch-filtered-news-list');
  if (wFilteredList) {
    let filtHtml = '';
    if (!matchingNews.length) {
      filtHtml = `<div style="text-align:center; padding: 6px; color:#94a3b8; font-size:10px;">No ${curImpactFilter.toUpperCase()} impact events scheduled</div>`;
    } else {
      filtHtml = matchingNews.slice(0, 5).map(n => {
        const side = String(n.side || '').toUpperCase();
        const sideClass = side === 'BUY' ? 'buy' : side === 'SELL' ? 'sell' : '';
        const mins = Number(n.ts) > 0 ? Math.round((Number(n.ts) - Date.now() / 1000) / 60) : Number(n.minutes_to || 0);
        const timeStr = mins >= 0 ? `in ${fmtCountdown(mins)}` : `${fmtCountdown(-mins)} ago`;
        return `<div class="news-filtered-item">
          <div class="nfi-left">
            <span class="nfi-cur">${esc(n.currency || '')}</span>
            <span class="nfi-title">${esc(n.title || '')}</span>
          </div>
          <div class="nfi-right" style="display:flex; align-items:center; gap:8px;">
            ${side ? `<span class="nfi-side ${sideClass}">${side === 'BUY' ? '▲ BUY' : '▼ SELL'}</span>` : ''}
            <span class="nfi-time">${timeStr}</span>
          </div>
        </div>`;
      }).join('');
    }
    if (wFilteredList.__filtHtml !== filtHtml) {
      wFilteredList.innerHTML = filtHtml;
      wFilteredList.__filtHtml = filtHtml;
    }
  }

  // ---- AI direction board: NEXT-DAY window --------------------------------
  // The board always reads the NEXT day's market, never today's: on the 18th
  // it shows the 19th's verdicts, on the 19th the 20th's (18 -> 19 -> 20 ...),
  // computed from tomorrow 00:00 -> tomorrow 24:00 (local).
  const outEl = $('bot5-outlook-chips');
  const wOutEl = $('watch-outlook-chips');
  if (outEl || wOutEl) {
    const terminal = window.SoftradeXTerminal;
    const catalogue = terminal && terminal.getMarkets ? terminal.getMarkets() : [];
    // The chart catalogue covers every available market; the news engine's
    // older symbol_options list is only a fallback while the catalogue loads.
    const markets = catalogue.length ? catalogue : b.symbol_options || [panelSymbol];
    const now = Date.now()/1000;
    const dailyData = window.MarketOutlookData;
    if (dailyData) dailyData.ensure(markets, panelSymbol);
    const scan = dailyData && dailyData.status();
    const swingSig = swingState && swingState.fresh
      ? `${swingState.symbol || ''}:${swingState.verdict || ''}:${Math.round(Number(swingState.score || 0) * 10)}`
      : '';
    const outCacheKey = [
      b.news_sig || '',
      b.feed_updated || 0,
      panelSymbol,
      markets.length,
      marketNews.length,
      scan ? `${scan.ready}/${scan.total}/${scan.pending}/${scan.unavailable}` : '',
      swingSig,
      LANG,
      Math.floor(now / 20),
    ].join('|');
    let outHtml = '';
    if (renderBot5._outlookCache && renderBot5._outlookCache.key === outCacheKey) {
      outHtml = renderBot5._outlookCache.html;
    } else {
      const list = window.DashboardPanels.outlookAll(marketNews, markets, panelSymbol, now, relevantNews,
        (event, symbol, context) => window.NewsDirection && window.NewsDirection.estimate({
          event, symbol, now, market: context.market, quote: context.quote, headlines: context.headlines,
          headlinesPreSorted: context.headlinesPreSorted,
          impact: workspace && workspace.impactFor ? workspace.impactFor(event, symbol) : null }),
        symbol => ({ market: swingState && swingState.fresh &&
            window.DashboardPanels.canonical(swingState.symbol) === window.DashboardPanels.canonical(symbol)
            ? swingState : dailyData && dailyData.get(symbol), quote: window.SOFT_TV_QUOTE }));
      const reading = list[0];
      const pills = list.map(o => {
        const v = String(o.verdict || '').toUpperCase();
        const cls = v === 'BUY' ? 'buy' : v === 'SELL' ? 'sell' : 'mixed';
        const arrow = v === 'BUY' ? '▲' : v === 'SELL' ? '▼' : '◆';
        const conf = Number(o.confidence || 0);
        const fTxt = String(o.forecast_text || '');
        const fCls = String(o.forecast_dollar || 0) > 0 ? 'up' : String(o.forecast_dollar || 0) < 0 ? 'down' : '';
        const when = Number(o.top_ts || 0)
          ? new Date(Number(o.top_ts) * 1000).toLocaleString(LANG === 'bn' ? 'bn-BD' : 'en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
          : '';
        const flowTxt = (o.buyer_pct !== undefined && o.seller_pct !== undefined)
          ? `${isBn ? 'ডায়াল' : 'dial'} BUY ${Number(o.buyer_pct).toFixed(0)}% / SELL ${Number(o.seller_pct).toFixed(0)}%`
          : '';
        const srcTxt = o.source === 'live flow'
          ? (isBn ? 'লাইভ ফ্লো (নিউজ নেই বা সমান)' : 'live flow (no news / tie)')
          : (o.source === 'news' ? (isBn ? 'নিউজ' : 'news') : o.source === 'market structure' ? 'measured candle structure' : 'insufficient / mixed data');
        const tip = [
          o.top_event || '',
          when,
          `${isBn ? 'সোর্স' : 'source'}: ${srcTxt}`,
          flowTxt,
          `${isBn ? 'প্রত্যাশিত' : 'expected'}: ${fTxt}`,
          `${Number(o.buy || 0)}B/${Number(o.sell || 0)}S · ${isBn ? 'কনফিডেন্স' : 'signal strength'} ${conf}%`,
        ].filter(Boolean).join(' · ');
        const mark = o.source === 'live flow' ? ' ⚡' : '';
        const selected = window.DashboardPanels.canonical(o.market) === window.DashboardPanels.canonical(panelSymbol);
        return `<span class="outlook-pill ${cls}${selected ? ' selected' : ''}" data-market="${esc(o.market)}" title="${esc(tip)}">` +
          `<b>${esc(o.market)}</b>` +
          `<span class="outlook-verdict">${arrow} ${v}${mark}</span>` +
          `<span class="outlook-forecast ${fCls}">${esc(fTxt)}</span>` +
          `<span class="outlook-count">${Number(o.buy || 0)}B/${Number(o.sell || 0)}S · ${conf}% strength</span>` +
        `</span>`;
      }).join('');
      const start = new Date(reading.window_start * 1000), end = new Date(reading.window_end * 1000);
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const scanTxt = scan ? ` · D1 ${scan.ready}/${scan.total}${scan.pending ? ' · scanning ' + scan.pending : ''}${scan.unavailable ? ' · unavailable ' + scan.unavailable : ''}` : '';
      outHtml = `<div class="outlook-window">${list.length} ${isBn ? 'মার্কেট' : 'markets'} · ${esc(start.toLocaleDateString([], {day:'numeric',month:'short'}))} · 00:00–00:00 ${esc(end.toLocaleDateString([], {day:'numeric',month:'short'}))} · ${esc(timezone)}${esc(scanTxt)}</div><div class="outlook-date-row">${pills}</div>`;
      renderBot5._outlookCache = { key: outCacheKey, html: outHtml };
    }
    [outEl, wOutEl].filter(Boolean).forEach(target => {
      if (target.__outlookHtml === outHtml) return;
      const oldList = target.querySelector('.outlook-date-row');
      const scroll = target.dataset.outlookSelected === panelSymbol && oldList ? oldList.scrollTop : 0;
      target.innerHTML = outHtml;
      target.__outlookHtml = outHtml;
      target.dataset.outlookSelected = panelSymbol;
      target.querySelector('.outlook-date-row').scrollTop = scroll;
    });
  }

  // ---- news list -----------------------------------------------------
  // Shows ALL news (every currency + impact). Expired rows are skipped here and
  // removed live by tickBot5Countdown the second their time passes.
  const nowSec = Date.now() / 1000;
  const rawNews = (Array.isArray(b.news) && b.news.length) ? b.news : baseNews;
  // Upcoming releases leave this reading list when they start. Headlines
  // leave at their monitoring deadline, including stale cached responses.
  // ALL ECONOMIC NEWS panel impact filter: 'all' | 'high' | 'medium' | 'low'
  const allFilt = String((typeof window !== 'undefined' && window.__allNewsImpactFilter) || 'all').toLowerCase();
  const news = rawNews
    .filter(n => n && window.DashboardPanels.newsPhase(n, nowSec) !== 'expired')
    .filter(n => window.DashboardPanels.newsKind(n) === 'headline' || Number(n.ts) > nowSec)
    .filter(n => allFilt === 'all' || String(n.impact || 'low').toLowerCase() === allFilt);
  document.querySelectorAll('#news-impact-all-bar .news-impact-btn').forEach(btn => {
    btn.classList.toggle('active', (btn.dataset.imp || '').toLowerCase() === allFilt);
  });
  const totalCount = Number(b.news_total || news.filter(n => window.DashboardPanels.newsKind(n) !== 'headline').length || 0);
  const totalTxt = totalCount ? ` <span class="news-total-pill">${totalCount}</span>` : '';
  const headEl = $('bot5-news-count');
  if (headEl && headEl.dataset.sig !== totalTxt) {
    headEl.dataset.sig = totalTxt;
    headEl.innerHTML = totalTxt;
  }
  // which news sites are feeding this list, and how many events each brought
  const srcEl = $('bot5-news-sources');
  if (srcEl) {
    const srcs = (Array.isArray(b.feed_sources) && b.feed_sources.length)
      ? b.feed_sources
      : (wsNewsState && Array.isArray(wsNewsState.sources) ? wsNewsState.sources.filter(s => Number(s.count || 0) > 0) : []);
    const srcHtml = srcs.length
      ? srcs.map(s => {
          const name = String(s.name || '');
          const cls = name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
          const label = NEWS_SRC_LABEL[name] || name.slice(0, 3).toUpperCase();
          return `<span class="news-src-badge src-${esc(cls)}" title="${esc(name)}">${esc(label)} · ${Number(s.count || 0)}</span>`;
        }).join('')
      : '';
    if (srcEl.dataset.sig !== srcHtml) {
      srcEl.dataset.sig = srcHtml;
      srcEl.innerHTML = srcHtml;
    }
  }
  const newsEl = $('bot5-news');
  // The list holds 400+ rows; rebuilding it on every engine push (~3/sec) was
  // the single most expensive thing this page did - it churned the DOM and
  // forced a full page layout that every canvas read then paid for. Rebuild
  // only when the payload changes and the drawer is open. Relative time labels
  // update in place; expired rows are removed by the countdown clock.
  let newsSig = `${b.news_sig || b.feed_updated || ''}|${LANG}|${news.length}|${Number(b.news_total || 0)}|${allFilt}`;
  for (let ni = 0; ni < news.length; ni++) {
    const n0 = news[ni];
    newsSig += `|${Number(n0.ts || 0)}:${n0.traded ? 1 : 0}:${String(n0.side || '')}`;
  }
  const newsVisible = botsDrawerOpen() && $('view-bots')?.classList.contains('active') && !document.hidden;
  const newsDirty = !!newsEl && newsVisible && newsEl.dataset.sig !== newsSig;
  if (newsEl && newsDirty) {
    newsEl.dataset.sig = newsSig;
    // tell the decorative candle background a heavy (400+ row) rebuild is
    // coming: it drops to ~15 fps for a moment so the main thread stays free
    try { window.dispatchEvent(new Event('softradex:busy')); } catch (e) {}
  }
  if (newsEl && newsDirty && !news.length) {
    newsEl.__renderer?.pause();
    newsEl.__renderer = null;
    newsEl.innerHTML = `<div class="news-empty">${isBn ? 'ক্যালেন্ডারে কোনো আসন্ন ইভেন্ট নেই' : 'No upcoming events on the calendar'}</div>`;
  } else if (newsEl && newsDirty) {
    const renderRow = (n) => {
      const ts = Number(n.ts || 0);
      const isPast = n.past === true;
      const expires = window.DashboardPanels.newsKind(n) === 'headline'
        ? window.DashboardPanels.newsExpires(n) : ts;
      if (expires <= Date.now() / 1000) return '';
      const side = String(n.side || '').toUpperCase();
      const whenTxt = newsRelativeTime(ts, isPast, Date.now() / 1000);
      const when = ts ? fmtNewsWhen(ts, LANG === 'bn') : '';
      const fStr = n.forecast != null ? `<span class="news-forecast-tag" title="Forecast: ${esc(n.forecast)}">F: ${esc(n.forecast)}</span>` : '';

      const pred = n.predicted_move;
      let moveBadge = '';
      if (pred && pred.text_en && side) {
        const isBuy = side === 'BUY';
        const txt = isBn ? (pred.text_bn || pred.text_en) : pred.text_en;
        const tip = `${isBn ? 'AI প্রত্যাশিত মার্কেট মুভ' : 'AI Expected Market Move'}: ${txt} (${pred.range_str || ''}) · ${esc(pred.market || '')}`;
        moveBadge = `<span class="news-row-move ${isBuy ? 'up' : 'down'}" title="${esc(tip)}">
          <span class="move-icon">⚡ AI</span>
          <span>${esc(txt)}</span>
        </span>`;
      }

      const impacts = Array.isArray(n.impacted_markets) ? n.impacted_markets : [];
      // every affected market is listed with its direction - the backend sends
      // the full list, nothing is collapsed into "+N more"
      const impactPills = impacts.map(m => {
        const isBuy = String(m.side || '').toUpperCase() === 'BUY';
        const mTxt = isBn ? (m.move_text_bn || m.move_text_en || '') : (m.move_text_en || '');
        const mTag = mTxt ? `<span class="market-dir-move">${esc(mTxt)}</span>` : '';
        return `<span class="market-dir-pill ${isBuy ? 'buy' : 'sell'}" title="${esc(m.market)} · ${esc(m.reason || '')}${m.range_str ? ` (${esc(m.range_str)})` : ''}">` +
          `<b>${esc(m.market)}</b>: ${isBuy ? '▲ BUY' : '▼ SELL'}${mTag ? ' · ' + mTag : ''}` +
        `</span>`;
      }).join('');
      const watchOnly = (n.qualified === false && !isPast)
        ? `<span class="news-watch-tag" title="${esc(t('bot5WatchOnly'))}">👁</span>` : '';
      const srcLabel = NEWS_SRC_LABEL[String(n.source || '')] || '';
      const srcTag = srcLabel
        ? `<span class="news-src-badge" title="${esc((n.publisher ? n.publisher + ' · ' : '') + (n.source || ''))}">${esc(srcLabel)}</span>` : '';

      return `<div class="news-row${n.traded ? ' traded' : ''}${(n.qualified === false && !isPast) ? ' watch-only' : ''}${isPast ? ' published' : ''}" data-ts="${expires}" data-news-time="${ts}" data-news-past="${isPast}">
        <div class="news-row-top">
          <span class="news-impact imp-${esc(n.impact || 'low')}">${esc(String(n.impact || 'low').toUpperCase())}</span>
          <span class="news-cur">${esc(n.currency || '')}</span>
          <span class="news-title" title="${esc(n.title || '')}">${esc(n.title || '')}</span>
          ${fStr}
          ${srcTag}
          <span class="news-time">${esc(when)}</span>
          <span class="news-min">${whenTxt}</span>
          ${side ? `<span class="news-side ${side === 'BUY' ? 'buy' : 'sell'}">${side === 'BUY' ? '▲ BUY' : '▼ SELL'}</span>` : ''}
          ${moveBadge}
          ${watchOnly}
          ${n.traded ? `<span class="news-traded">✓</span>` : ''}
        </div>
        ${impacts.length ? `<div class="news-row-impacts"><span class="impacts-label">${isBn ? 'ইমপ্যাক্ট:' : 'Markets:'}</span>${impactPills}</div>` : ''}
      </div>`;
    };
    if (window.NewsListRenderer) {
      if (!newsEl.__renderer) newsEl.__renderer = window.NewsListRenderer.create({
        element: newsEl,
        visible: () => !document.hidden && botsDrawerOpen() && $('view-bots')?.classList.contains('active'),
        complete: () => updateNewsRelativeTimes(true)
      });
      newsEl.__renderer.update(news, newsSig, renderRow);
    } else newsEl.innerHTML = news.map(renderRow).join('');
  }

  // ---- status lines --------------------------------------------------
  const rl = $('bot5-running-line');
  if (rl) {
    const modeTxt = { anticipate: isBn ? 'অ্যান্টিসিপেট' : 'Anticipate', straddle: isBn ? 'স্ট্র্যাডল' : 'Straddle', follow: isBn ? 'ফলো' : 'Follow' }[cfg.mode] || cfg.mode;
    rl.innerHTML = `<b>${isBn ? 'স্টাইল' : 'Style'}:</b> ${esc(modeTxt)} · ` +
      `${b.open || 0} ${isBn ? 'ওপেন' : 'open'} · ${b.pending || 0} ${isBn ? 'পেন্ডিং' : 'pending'} · ` +
      `${isBn ? 'ফ্লোটিং' : 'Floating'}: <span class="${Number(b.floating || 0) >= 0 ? 'up' : 'down'}">${signed(b.floating || 0)}</span>`;
  }
  const posEl = $('bot5-pos');
  if (posEl) {
    const ps = b.positions || [];
    const parts = ps.map((p) => {
      const side = String(p.side || '').toUpperCase();
      const net = Number(p.net || 0);
      return `${side} ${nf(p.lot, 2)} @ ${fmtPrice(p.entry)} (${net >= 0 ? '+' : ''}${net.toFixed(2)})`;
    });
    posEl.innerHTML = `<b>${isBn ? 'ট্রেড' : 'Trades'}:</b> ${parts.length ? parts.join(' · ') : (isBn ? 'নেই' : 'none')}`;
  }
  const stats = b.stats || {};
  const last = b.last_error
    ? `<span style="color:#fca5a5">${esc(b.last_error)}</span>`
    : esc(b.last_action || '—');
  const lastEl = $('bot5-last');
  if (lastEl) {
    lastEl.innerHTML = `${esc(t('botMarketNow'))}: <b>${esc(shown)}</b> · ` +
      `${stats.opened || 0} ${esc(t('botOpened'))} / ${stats.closed || 0} ${esc(t('botClosed'))} · ` +
      `${isBn ? 'রিয়েলাইজড' : 'Realized'}: $${Number(stats.realized || 0).toFixed(2)} · ${last}`;
    lastEl.className = 'bot-line' + (b.last_error ? ' warn' : '');
  }

  // ---- price map ------------------------------------------------------
  if ($('bot5-pricemap')) renderPriceMap('bot5', b);
}

window.addEventListener('market:outlook-data', () => {
  const payload = window.__lastPollData;
  if (payload) renderBot5(payload);
});

function fmtCountdown(mins) {
  const m = Math.max(0, Math.round(Number(mins) || 0));
  if (m >= 1440) return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}m`;
}

/* 1-second live countdown to the next news event and immediate auto-removal of expired news */
/* ==========================================================================
   Trading sessions board — Sydney (Australian), Tokyo (Asian), London
   (European), New York (North American).

   The clock is computed by the backend (daylight-saving aware, absolute open /
   close epochs) and then ticked locally at 1 Hz between pushes, so the
   countdown never waits for the next WebSocket frame. The AI reading next to
   each session is measured - the last ~20 days of M15 bars clipped to that
   session window give the average dollars up, dollars down and the net drift
   that decides BUY / SELL.
   ========================================================================== */
let sessionsBoard = null;
let sessionsSig = '';
let sessionsClockAnchor = null;

const SESSION_LABEL = { sydney: 'sessSydney', tokyo: 'sessTokyo', london: 'sessLondon', newyork: 'sessNewYork' };
const SESSION_REGION = { sydney: 'sessRegAu', tokyo: 'sessRegAsia', london: 'sessRegEu', newyork: 'sessRegNa' };

function sessHms(secs) {
  const s = Math.max(0, Math.round(Number(secs) || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function sessMoney(v) { return '$' + Math.abs(Number(v) || 0).toFixed(2); }

function sessWhen(row, secs) {
  if (row.state === 'open') return `LIVE · Ends in ${sessHms(secs)}`;
  if (row.weekend) return `Weekend break · starts in ${sessHms(secs)}`;
  return `Starts in ${sessHms(secs)}`;
}

function sessRowHtml(row, board) {
  const key = String(row.key || '');
  const isOpen = row.state === 'open';
  const st = row.stats || null;
  const flow = row.flow || {};
  const flowSide = String(flow.dominant || '').toUpperCase();
  const region = row.region_en || (SESSION_REGION[key] ? t(SESSION_REGION[key]) : '') || '';
  const peak = row.peak ? `<span class="sess-peak" title="London + New York overlap - heaviest liquidity">PEAK</span>` : '';
  const statePill = `<span class="sess-state ${isOpen ? 'open' : 'closed'}">${isOpen ? 'OPEN' : 'CLOSED'}</span>`;

  let aiHtml = `<div class="sess-nodata">No session history - connect terminal</div>`;
  if (st) {
    const v = String(st.verdict || 'MIXED').toUpperCase();
    const cls = v === 'BUY' ? 'buy' : v === 'SELL' ? 'sell' : 'mixed';
    const arrow = v === 'BUY' ? '▲' : v === 'SELL' ? '▼' : '◆';

    const buyAmt = sessMoney(st.buy_money !== undefined ? st.buy_money : st.up_money);
    const sellAmt = sessMoney(st.sell_money !== undefined ? st.sell_money : st.down_money);
    const rangeAmt = sessMoney(st.range_money);

    const allM = Array.isArray(row.all_markets) ? row.all_markets : [];
    const mSum = row.market_summary || {};

    let marketsHtml = '';
    if (allM.length) {
      marketsHtml = `<div class="sess-markets-block">` +
        `<div class="sess-markets-title">` +
          `<span>🌐 All Markets in Session:</span>` +
          `<span class="sess-markets-count-badge">${mSum.buy_count || 0} BUY · ${mSum.sell_count || 0} SELL</span>` +
        `</div>` +
        `<div class="sess-markets-list">` +
          allM.map(m => {
            const mv = String(m.verdict || 'MIXED').toUpperCase();
            const mcls = mv === 'BUY' ? 'buy' : mv === 'SELL' ? 'sell' : 'mixed';
            const marr = mv === 'BUY' ? '▲' : mv === 'SELL' ? '▼' : '◆';
            const cleanSym = String(m.symbol || '').replace(/m$/, '');
            const mVal = mv === 'BUY' ? `+$${Number(m.buy_money || 0).toFixed(1)}` : mv === 'SELL' ? `-$${Number(m.sell_money || 0).toFixed(1)}` : `~$${Number(m.range_money || 0).toFixed(1)}`;
            const isCur = String(board.symbol || '') === m.symbol;
            return `<button type="button" class="sess-mini-chip ${mcls}${isCur ? ' active' : ''}" data-sym="${esc(m.symbol)}" title="${esc(m.symbol)}: ${mv} (${mVal})">` +
              `<b>${esc(cleanSym)}</b> ${marr} ${mv} <small>${mVal}</small>` +
            `</button>`;
          }).join('') +
        `</div>` +
      `</div>`;
    }

    aiHtml =
      `<div class="sess-action-line">` +
        `<span class="sess-action-label">ACTION:</span>` +
        `<span class="sess-action-pill ${cls}">${arrow} ${v}</span>` +
        `${st.confidence ? `<span class="sess-win-stat">${st.confidence}% conf</span>` : ''}` +
      `</div>` +
      `<div class="sess-fc-grid">` +
        `<div class="sess-fc-card buy" title="Estimated upward potential if BUY">` +
          `<span class="sess-fc-tag">▲ BUY TARGET</span>` +
          `<span class="sess-fc-amt">+${buyAmt} Up</span>` +
        `</div>` +
        `<div class="sess-fc-card sell" title="Estimated downward potential if SELL">` +
          `<span class="sess-fc-tag">▼ SELL TARGET</span>` +
          `<span class="sess-fc-amt">-${sellAmt} Down</span>` +
        `</div>` +
        `<div class="sess-fc-card range" title="Expected total session range">` +
          `<span class="sess-fc-tag">↕ EXP RANGE</span>` +
          `<span class="sess-fc-amt">↕ ${rangeAmt}</span>` +
        `</div>` +
      `</div>` +
      `<div class="sess-ai-verdict-line">` +
        `${flowSide ? `<span class="sess-flow ${flowSide === 'BUY' ? 'buy' : flowSide === 'SELL' ? 'sell' : 'flat'}" title="Live watch-dial buyer vs seller">DIAL ${flowSide === 'BUY' ? '▲' : flowSide === 'SELL' ? '▼' : '◆'} ${esc(flowSide)} ${Number(flow.buyer_pct || 0).toFixed(0)}%</span>` : ''}` +
        `<span class="sess-win-stat">${st.up_days || 0}/${st.days || 20} days up</span>` +
      `</div>` +
      marketsHtml;
  }

  const secs = isOpen ? Number(row.closes_in_sec || 0) : Number(row.opens_in_sec || 0);
  const pct = isOpen ? Math.max(0, Math.min(100, Number(row.progress || 0) * 100)) : 0;
  return `<div class="sess-row ${isOpen ? 'live' : 'closed'}${row.peak ? ' peak' : ''}" data-key="${esc(key)}">` +
      `<div class="sess-top">` +
        `<span class="sess-name">${esc(t(SESSION_LABEL[key] || '') || row.name_en || key)}</span>` +
        `<span class="sess-region">${esc(region)}</span>` +
        `${peak}${statePill}` +
      `</div>` +
      `<div class="sess-count" data-key="${esc(key)}">${esc(sessWhen(row, secs))}</div>` +
      `<div class="sess-bar"><span class="sess-bar-fill" style="width:${pct.toFixed(1)}%"></span></div>` +
      `<div class="sess-time-block">` +
        `<div class="sess-time-row"><span><b>Starts:</b> ${esc(row.open_utc || '--:--')} UTC</span><span><b>Ends:</b> ${esc(row.close_utc || '--:--')} UTC</span></div>` +
        `<div class="sess-time-row sub"><span>Local: ${esc(row.open_local || '--:--')} – ${esc(row.close_local || '--:--')}</span><span>(${esc(row.tz_offset || 'Local')})</span></div>` +
      `</div>` +
      aiHtml +
    `</div>`;
}

function renderSessions(data) {
  const grid = $('sessions-grid');
  if (!grid) return;
  const board = (data && data.bot5 && data.bot5.sessions) || null;
  const sel = $('sessions-market');
  const sumEl = $('sessions-summary');
  const updEl = $('sessions-updated');
  if (!board || !Array.isArray(board.sessions) || !board.sessions.length) {
    if (sessionsSig !== 'empty') {
      sessionsSig = 'empty';
      grid.innerHTML = `<div class="sessions-loading">${esc(t('sessLoading'))}</div>`;
    }
    return;
  }
  bindSessionsUI();
  sessionsBoard = board;
  if (!sessionsClockAnchor || sessionsClockAnchor.stamp !== Number(board.now_utc)) {
    sessionsClockAnchor = { stamp: Number(board.now_utc), server: Number(board.now_utc) || Date.now()/1000, received: Date.now() };
  }

  if (sel) {
    const syms = Array.isArray(board.symbols) && board.symbols.length
      ? board.symbols.slice()
      : (board.symbol ? [board.symbol] : []);
    const cur = String(board.symbol || '');
    const msig = syms.join('|') + '#' + cur;
    if (sel.dataset.sig !== msig) {
      sel.dataset.sig = msig;
      sel.innerHTML = syms.map(s => `<option value="${esc(s)}"${s === cur ? ' selected' : ''}>${esc(s)}</option>`).join('');
    }
  }

  const radarBadge = $('sess-active-session-badge');
  const radarCounts = $('sess-radar-counts');
  const radarChips = $('sess-radar-chips');
  if (radarChips) {
    const openSess = (board.sessions || []).find(r => r.state === 'open') || (board.sessions || [])[0];
    if (openSess) {
      const sKey = openSess.key;
      const sName = t(SESSION_LABEL[sKey] || '') || openSess.name_en || sKey;
      if (radarBadge) {
        const badgeTxt = `${openSess.state === 'open' ? '🔴 LIVE: ' : 'NEXT: '}${sName.toUpperCase()}`;
        const badgeColor = openSess.state === 'open' ? 'var(--win)' : 'var(--accent)';
        if (radarBadge.textContent !== badgeTxt) radarBadge.textContent = badgeTxt;
        if (radarBadge.style.color !== badgeColor) radarBadge.style.color = badgeColor;
      }
      const sMarkets = Array.isArray(openSess.all_markets) ? openSess.all_markets : [];
      const sSum = openSess.market_summary || {};
      const rSig = `${sKey}|${board.symbol || ''}|${sSum.buy_count || 0}|${sSum.sell_count || 0}|${sSum.mixed_count || 0}|` +
        sMarkets.map(m => `${m.symbol}:${m.verdict}:${m.buy_money}:${m.sell_money}`).join(',');
      if (radarChips.dataset.sig !== rSig) {
        radarChips.dataset.sig = rSig;
        if (radarCounts) {
          radarCounts.innerHTML = `<span style="color:var(--win)">${sSum.buy_count || 0} BUY ▲</span> · ` +
            `<span style="color:var(--loss)">${sSum.sell_count || 0} SELL ▼</span>` +
            (sSum.mixed_count ? ` · <span style="color:var(--warn)">${sSum.mixed_count} MIXED</span>` : '');
        }
        if (sMarkets.length) {
          radarChips.innerHTML = sMarkets.map(m => {
            const mv = String(m.verdict || 'MIXED').toUpperCase();
            const mcls = mv === 'BUY' ? 'buy' : mv === 'SELL' ? 'sell' : 'mixed';
            const marr = mv === 'BUY' ? '▲' : mv === 'SELL' ? '▼' : '◆';
            const cleanSym = String(m.symbol || '').replace(/m$/, '');
            const isCur = String(board.symbol || '') === m.symbol;
            const amtStr = mv === 'BUY' ? `+$${Number(m.buy_money || 0).toFixed(1)}` : mv === 'SELL' ? `-$${Number(m.sell_money || 0).toFixed(1)}` : `~$${Number(m.range_money || 0).toFixed(1)}`;
            return `<button type="button" class="sess-radar-pill ${mcls}${isCur ? ' active' : ''}" data-sym="${esc(m.symbol)}" title="${esc(m.symbol)}: ${mv} (${amtStr})">` +
              `<span class="pill-sym">${esc(cleanSym)}</span>` +
              `<span class="pill-dir">${marr} ${mv}</span>` +
              `<span class="pill-amt">${amtStr}</span>` +
            `</button>`;
          }).join('');
        } else {
          radarChips.innerHTML = `<span style="font-size:11px;color:var(--txt-faint)">Loading all markets forecast for this session…</span>`;
        }
      }
    }
  }

  // Render ALL 4 sessions (Sydney, Tokyo, London, New York)
  const allSessions = Array.isArray(board.sessions) && board.sessions.length ? board.sessions : [];
  const sig = [board.symbol, board.updated, board.source, board.tz_data ? 1 : 0, allSessions.length,
    allSessions.map(r => `${r.key}:${r.state}:${r.open_ts}:${r.peak ? 1 : 0}:${(r.flow || {}).dominant || ''}:${r.stats ? `${r.stats.verdict}${r.stats.up_money}${r.stats.down_money}${r.stats.days}` : '-'}:${(r.all_markets || []).length}`).join(',')].join('#');
  if (sig !== sessionsSig) {
    sessionsSig = sig;
    grid.innerHTML = allSessions.length
      ? allSessions.map(r => sessRowHtml(r, board)).join('')
      : `<div class="sessions-loading">Starting the session clock…</div>`;
  }

  const sum = board.summary || null;
  if (sumEl) {
    if (!sum) {
      const noTxt = `${board.symbol || ''} — No session data`;
      if (sumEl.textContent !== noTxt) { sumEl.textContent = noTxt; sumEl.dataset.sig = ''; }
    } else {
      const v = String(sum.verdict || 'MIXED').toUpperCase();
      const name = t(SESSION_LABEL[sum.key] || '') || sum.name_en || '';
      const buyM = sessMoney(sum.buy_money !== undefined ? sum.buy_money : sum.up_money);
      const sellM = sessMoney(sum.sell_money !== undefined ? sum.sell_money : sum.down_money);
      const rangeM = sessMoney(sum.range_money);
      const sumSig = `${board.symbol}|${name}|${v}|${buyM}|${sellM}|${rangeM}`;
      if (sumEl.dataset.sig !== sumSig) {
        sumEl.dataset.sig = sumSig;
        const arrow = v === 'BUY' ? '▲' : v === 'SELL' ? '▼' : '◆';
        sumEl.innerHTML = `<span class="sess-sum-market">${esc(board.symbol || '')}</span>` +
          `<span class="sess-sum-txt">🤖 AI Forecast: <b>${esc(name)}</b> moves the most here — ` +
          `<b class="${v === 'BUY' ? 'buy' : v === 'SELL' ? 'sell' : 'mixed'}">${arrow} ${esc(v)}</b> · ` +
          `BUY Target: <b style="color:var(--win)">+${buyM} Up</b> · ` +
          `SELL Target: <b style="color:var(--loss)">-${sellM} Down</b> · ` +
          `Range: <b style="color:#38bdf8">${rangeM}</b></span>`;
      }
    }
  }
  if (updEl) {
    const ago = Math.max(0, Math.round(Date.now() / 1000 - Number(board.history_updated || board.updated || 0)));
    const uTxt = `${t('sessUpdated')} ${ago}s · ${board.source === 'mt5' ? 'MT5 M15' : board.source === 'tradingview+public' ? 'SoftradeX + public M15' : t('sessClockOnly')}`;
    if (updEl.textContent !== uTxt) updEl.textContent = uTxt;
  }
  tickSessionsClock();
}

/* 1 Hz local tick: countdowns + the progress bar of the open session */
function tickSessionsClock() {
  const rows = document.querySelectorAll('.sess-row');
  if (!rows.length || !sessionsBoard) return;
  const anchor = sessionsClockAnchor;
  const nowUtc = anchor ? anchor.server + (Date.now() - anchor.received)/1000 : Date.now()/1000;
  const byKey = {};
  (sessionsBoard.sessions || []).forEach(r => { byKey[r.key] = r; });
  rows.forEach(el => {
    const row = byKey[el.dataset.key];
    if (!row) return;
    const isOpen = nowUtc >= Number(row.open_ts) && nowUtc < Number(row.close_ts);
    const secs = isOpen ? Number(row.close_ts || 0) - nowUtc : Number(row.open_ts || 0) - nowUtc;
    const countEl = el._countEl || (el._countEl = el.querySelector('.sess-count'));
    if (countEl) {
      const cTxt = sessWhen({...row, state: isOpen ? 'open' : 'closed'}, secs);
      if (countEl.textContent !== cTxt) countEl.textContent = cTxt;
    }
    const bar = el._barEl || (el._barEl = el.querySelector('.sess-bar-fill'));
    if (bar) {
      let wStr = '0%';
      if (isOpen) {
        const span = Math.max(1, Number(row.close_ts || 0) - Number(row.open_ts || 0));
        const done = Math.max(0, Math.min(1, (nowUtc - Number(row.open_ts || 0)) / span));
        wStr = (done * 100).toFixed(1) + '%';
      }
      if (bar.style.width !== wStr) bar.style.width = wStr;
    }
    el.classList.toggle('live', isOpen);
    el.classList.toggle('closed', !isOpen);
  });
}

async function sessPost(path, body) {
  try {
    const r = await fetch(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) {
      const msg = (j.error && j.error.message) || 'Request failed';
      toast('error', msg);
      return {};
    }
    return j;
  } catch (e) { toast('error', String(e)); return {}; }
}

function bindSessionsUI() {
  const sel = $('sessions-market');
  if (sel && !sel.dataset.bound) {
    sel.dataset.bound = '1';
    sel.addEventListener('change', async () => {
      const sym = String(sel.value || '');
      if (!sym) return;
      sel.disabled = true;
      const j = await sessPost('/api/bot5/config', { session_market: sym });
      sel.disabled = false;
      if (j && j.bot5) {
        if (S) S.bot5 = j.bot5;
        sessionsSig = '';                 // force the AI numbers to be redrawn
        renderSessions({ bot5: j.bot5 });
        renderBot5(S || { bot5: j.bot5 });
      }
    });
  }

  const boardEl = $('sessions-board');
  if (boardEl && !boardEl.dataset.chipsBound) {
    boardEl.dataset.chipsBound = '1';
    boardEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('.sess-mini-chip, .sess-radar-pill');
      if (!btn || !btn.dataset.sym) return;
      const sym = btn.dataset.sym;
      if (sel) sel.value = sym;
      const j = await sessPost('/api/bot5/config', { session_market: sym });
      if (j && j.bot5) {
        if (S) S.bot5 = j.bot5;
        sessionsSig = '';
        renderSessions({ bot5: j.bot5 });
        renderBot5(S || { bot5: j.bot5 });
      }
    });
  }
}

/* ==========================================================================
   Full AI market analysis — 5m / 10m / 15m / 1h.

   The backend reads the last 140 *closed* candles of every timeframe and turns
   four independent readings (EMA trend, momentum vs ATR, swing break, RSI) into
   BUY / SELL / NEUTRAL per timeframe; the timeframe verdicts are then voted
   together with the news bias and the live watch dials into one verdict, and
   the expected travel (ATR x 2) gives the price targets: how far up and how far
   down this market is expected to go, in price and in account money.

   Live update: every engine-tick WebSocket frame carries the fresh payload, so
   the whole panel follows the price without a timer of its own.
   ========================================================================== */
let aiBoard = null;
let aiSig = '';

const AI_TF_LABEL = { M1: '1m', M5: '5m', M15: '15m', H1: '1h', H4: '4h', D1: '1Day', M10: '10m' };

function aiSide(v) {
  const s = String(v || '').toUpperCase();
  return s === 'BUY' ? 'buy' : s === 'SELL' ? 'sell' : 'mixed';
}

function aiSideTxt(v) {
  const s = String(v || '').toUpperCase();
  if (s === 'BUY') return t('aiBuy');
  if (s === 'SELL') return t('aiSell');
  return t('aiNoTrade');
}

function aiArrow(v) {
  const s = String(v || '').toUpperCase();
  return s === 'BUY' ? '▲' : s === 'SELL' ? '▼' : '◆';
}

function aiMoney(v) {
  const n = Number(v) || 0;
  return `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(2)}`;
}

function aiPx(v, digits) { return (Number(v) || 0).toFixed(Number(digits) === 0 ? 2 : Number(digits || 2)); }

function aiRowHtml(row, board) {
  const v = String(row.verdict || '').toUpperCase();
  const cls = aiSide(v);
  const sel = String(board.timeframe || '') === String(row.key || '') ? ' sel' : '';
  const digits = Number(board.digits || 2);
  const name = esc(AI_TF_LABEL[row.key] || row.key);
  const reasons = (row.reasons || []).join(' · ');
  if (!row.ready) {
    return `<div class="ai-row${sel}" data-key="${esc(row.key)}">` +
      `<div class="ai-row-top"><span class="ai-tf-name">${name}</span>` +
      `<span class="ai-conf">${esc(t('aiNoData'))}</span></div>` +
    `</div>`;
  }
  const mpp = Number(board.money_per_price || 0);
  const upMoney = Number(row.up_distance || 0) * mpp;
  const downMoney = Number(row.down_distance || 0) * mpp;
  const score = Number(row.score || 0);
  return `<div class="ai-row ${cls}${sel}" data-key="${esc(row.key)}" title="${esc(reasons)}">` +
    `<div class="ai-row-top">` +
      `<span class="ai-tf-name">${name}</span>` +
      `<span class="sess-verdict ${cls}">${aiArrow(v)} ${esc(aiSideTxt(v))}</span>` +
      `<span class="ai-conf">${Number(row.confidence || 0)}%</span>` +
    `</div>` +
    `<div class="ai-row-mid"><span>RSI ${Number(row.rsi || 0).toFixed(0)}</span>` +
      `<span>ATR ${aiPx(row.atr, digits)}</span>` +
      `<span>${esc(t('aiScore'))} ${score >= 0 ? '+' : ''}${score}</span></div>` +
    `<div class="ai-row-up">▲ ${esc(t('aiUp'))} ${aiPx(row.up_price, digits)} <small>${aiMoney(Math.abs(upMoney))}</small></div>` +
    `<div class="ai-row-down">▼ ${esc(t('aiDown'))} ${aiPx(row.down_price, digits)} <small>${aiMoney(-Math.abs(downMoney))}</small></div>` +
    `<div class="ai-row-note">${esc((row.reasons || []).slice(0, 3).join(' · '))}</div>` +
  `</div>`;
}

function renderAiMarket(data) {
  const board = (data && data.bot5 && data.bot5.ai) || null;
  if (!$('ai-market-board')) return;
  const grid = $('ai-grid');
  const sel = $('ai-market');
  const tabs = $('ai-tf-tabs');
  const verEl = $('ai-verdict');
  const tgtEl = $('ai-targets');
  const updEl = $('ai-updated');
  if (!board || !Array.isArray(board.rows) || !board.rows.length) {
    if (aiSig !== 'empty') {
      aiSig = 'empty';
      if (grid) grid.innerHTML = `<div class="ai-empty">${esc(t('aiNoData'))}</div>`;
    }
    return;
  }
  bindAiMarketUI();
  aiBoard = board;

  // market selector — only what this account can actually trade
  if (sel) {
    const syms = Array.isArray(board.symbols) && board.symbols.length
      ? board.symbols.slice()
      : (board.symbol ? [board.symbol] : []);
    const cur = String(board.symbol || '');
    const msig = syms.join('|') + '#' + cur;
    if (sel.dataset.sig !== msig) {
      sel.dataset.sig = msig;
      sel.innerHTML = syms.map(s => `<option value="${esc(s)}"${s === cur ? ' selected' : ''}>${esc(s)}</option>`).join('');
    }
  }

  // Ensure all 6 timeframes (1m, 5m, 15m, 1h, 4h, 1Day) are always represented
  const EXPECTED_TFS = ['M1', 'M5', 'M15', 'H1', 'H4', 'D1'];
  const existingMap = {};
  (board.rows || []).forEach(r => { if (r && r.key) existingMap[r.key] = r; });
  const allRows = EXPECTED_TFS.map(tf => {
    if (existingMap[tf]) return existingMap[tf];
    return {
      key: tf,
      name: AI_TF_LABEL[tf] || tf,
      ready: false,
      verdict: 'MIXED',
      score: 0,
      confidence: 0,
      reasons: ['Awaiting public API candles for ' + (AI_TF_LABEL[tf] || tf)],
    };
  });

  // timeframe tabs — click one to make it the timeframe of the targets
  if (tabs) {
    const tsig = `${board.timeframe}|${LANG}|` + allRows.map(r => `${r.key}:${r.verdict}`).join(',');
    if (tabs.dataset.sig !== tsig) {
      tabs.dataset.sig = tsig;
      tabs.innerHTML = allRows.map(r => {
        const on = String(board.timeframe || '') === String(r.key || '');
        const label = esc(AI_TF_LABEL[r.key] || r.key);
        const tip = `${t('aiTimeframe')}: ${label} · ${aiArrow(r.verdict)} ${aiSideTxt(r.verdict)} ${Number(r.confidence || 0)}%`;
        return `<span class="ai-tab ${aiSide(r.verdict)}${on ? ' sel' : ''}" data-tf="${esc(r.key)}" title="${esc(tip)}">${label} ${aiArrow(r.verdict)}</span>`;
      }).join('');
    }
  }

  const digits = Number(board.digits || 2);
  const comb = board.combined || {};
  const tgt = board.target || {};

  // the one-line AI answer: which side, how confident, on which timeframe
  if (verEl) {
    const v = String(comb.verdict || '').toUpperCase();
    const why = (comb.reasons || []).join(' · ');
    const pxStr = Number(board.price) > 0 ? aiPx(board.price, digits) : '—';
    const verSig = `${LANG}|${v}|${Number(comb.confidence || 0)}|${board.timeframe || ''}|${pxStr}|${why}`;
    if (verEl.dataset.sig !== verSig) {
      verEl.dataset.sig = verSig;
      verEl.innerHTML = `<span class="ai-side ${aiSide(v)}">${aiArrow(v)} ${esc(aiSideTxt(v))}</span> ` +
        `<b>${Number(comb.confidence || 0)}%</b> ${esc(t('aiConfidence'))} · ` +
        `${esc(t('aiTimeframe'))} <b>${esc(AI_TF_LABEL[board.timeframe] || board.timeframe || '')}</b> · ` +
        `${esc(t('aiPriceNow'))} <b>${pxStr}</b>` +
        `${why ? `<span class="ai-why" title="${esc(why)}">${esc(t('aiWhy'))}: ${esc(why)}</span>` : ''}`;
    }
  }

  // the price targets: how far this market travels up and down from here
  if (tgtEl) {
    const tgtSig = tgt.ready
      ? `${LANG}|1|${tgt.primary_side}|${tgt.up_price}|${tgt.down_price}|${tgt.up_money}|${tgt.down_money}|${tgt.level_up}|${tgt.level_down}|${digits}`
      : `${LANG}|0`;
    if (tgtEl.dataset.sig !== tgtSig) {
      tgtEl.dataset.sig = tgtSig;
      if (tgt.ready) {
        const upRole = String(tgt.primary_side || '').toUpperCase() === 'BUY' ? t('aiUpTarget') : t('aiRisk');
        const downRole = String(tgt.primary_side || '').toUpperCase() === 'SELL' ? t('aiDownTarget') : t('aiRisk');
        tgtEl.innerHTML =
          `<span class="ai-target up" title="${esc(t('aiUpTarget'))}"><b>▲ ${esc(t('aiUp'))} ${aiPx(tgt.up_price, digits)}</b> ` +
            `<small>${aiMoney(tgt.up_money)} · ${esc(upRole)}</small></span>` +
          `<span class="ai-target down" title="${esc(t('aiDownTarget'))}"><b>▼ ${esc(t('aiDown'))} ${aiPx(tgt.down_price, digits)}</b> ` +
            `<small>${aiMoney(-Math.abs(tgt.down_money))} · ${esc(downRole)}</small></span>` +
          `<span class="ai-target level"><b>${esc(t('aiLevels'))}</b> ` +
            `<small>${aiPx(tgt.level_up, digits)} / ${aiPx(tgt.level_down, digits)}</small></span>`;
      } else {
        tgtEl.innerHTML = `<span class="ai-target">${esc(t('aiNoData'))}</span>`;
      }
    }
  }

  const sig = [board.symbol, board.timeframe, board.source, board.digits, LANG,
    (comb.verdict || '') + Number(comb.confidence || 0),
    tgt.ready ? `${tgt.up_price}:${tgt.down_price}` : '-',
    allRows.map(r => `${r.key}:${r.verdict}:${r.score}:${r.confidence}:${r.up_price}:${r.down_price}:${r.rsi}:${r.atr}:${r.ready ? 1 : 0}`).join(',')].join('#');
  if (sig !== aiSig) {
    aiSig = sig;
    if (grid) grid.innerHTML = allRows.map(r => aiRowHtml(r, board)).join('');
  }
  tickAiAge();
}

/* 1 Hz: the payload is only re-pushed when the numbers change, so the age line
   keeps ticking locally in between */
function tickAiAge() {
  const el = $('ai-updated');
  if (!el || !aiBoard) return;
  const ago = Math.max(0, Math.round(Date.now() / 1000 - Number(aiBoard.updated || 0)));
  const txt = `${t('aiUpdated')} ${ago}s · ${aiBoard.source === 'public' ? 'Public API · closed candles' : t('aiNoData')}`;
  if (el.textContent !== txt) el.textContent = txt;
}

function bindAiMarketUI() {
  const sel = $('ai-market');
  if (sel && !sel.dataset.bound) {
    sel.dataset.bound = '1';
    sel.addEventListener('change', async () => {
      const sym = String(sel.value || '');
      if (!sym) return;
      sel.disabled = true;
      const j = await sessPost('/api/bot5/config', { ai_market: sym });
      sel.disabled = false;
      if (j && j.bot5) {
        if (S) S.bot5 = j.bot5;
        aiSig = '';                         // force every card and target to redraw
        renderAiMarket({ bot5: j.bot5 });
      }
    });
  }
  const tabs = $('ai-tf-tabs');
  if (tabs && !tabs.dataset.bound) {
    tabs.dataset.bound = '1';
    tabs.addEventListener('click', async (ev) => {
      const el = ev.target && ev.target.closest ? ev.target.closest('.ai-tab') : null;
      if (!el) return;
      const key = String(el.dataset.tf || '');
      if (!key || (aiBoard && aiBoard.timeframe === key)) return;
      const j = await sessPost('/api/bot5/config', { ai_timeframe: key });
      if (j && j.bot5) {
        if (S) S.bot5 = j.bot5;
        aiSig = '';
        renderAiMarket({ bot5: j.bot5 });
      }
    });
  }
}

/* ==========================================================================
   SIGNAL PIPELINE — one market drives the whole vertical flow.

   The market box at the top owns the flow: picking a market writes it to the
   news engine (ai_market + session_market, which feed the live dial, the AI
   board and the session board) and to the extreme planner (bot 3). Every stage
   below then reports on that same market, and the wires between the stages
   carry the live numbers of the stage they leave.
   ========================================================================== */
let flowPick = '';          // optimistic selection while the backend round-trips

function flowBoard() { return (S && S.bot5 && S.bot5.ai) || null; }

/* The selected chart market leads the pipeline; backend snapshots can lag it. */
function flowSymbol() {
  const chart = window.SoftradeXTerminal || window.BinanceTerminal;
  const selected = chart && typeof chart.getCurrentSymbol === 'function' ? chart.getCurrentSymbol() : '';
  if (String(selected || '').trim()) return String(selected).trim();
  const board = flowBoard();
  const backend = board && board.symbol ? String(board.symbol) : '';
  if (flowPick && backend && backend.toUpperCase() === flowPick.toUpperCase()) flowPick = '';
  const sess = (S && S.bot5 && S.bot5.sessions) || null;
  return String(flowPick || backend || (sess && sess.symbol) || '').trim();
}

/* Buyer / seller pressure of the selected market: the dial row first (it moves
   ~20x per second), the AI reading second, a neutral 50/50 last. */
function flowPressure(sym) {
  const w = findWatchForSymbol(sym) || {};
  const board = flowBoard() || {};
  const flow = board.flow || {};
  const rawBuyer = w.buyer_pct !== undefined ? w.buyer_pct : flow.buyer_pct;
  const rawSeller = w.seller_pct !== undefined ? w.seller_pct : flow.seller_pct;
  const buyer = Number(rawBuyer);
  const seller = Number(rawSeller);
  return {
    buyer: Number.isFinite(buyer) ? buyer : 50,
    seller: Number.isFinite(seller) ? seller : (Number.isFinite(buyer) ? 100 - buyer : 50),
    dominant: String(w.dominant || flow.dominant || 'NEUTRAL').toUpperCase(),
  };
}

function flowTag(id, text) {
  const el = $(id);
  if (!el) return;
  const b = el.querySelector('b');
  if (b && b.textContent !== text) b.textContent = text;
}

/* The one user action of the pipeline: pick the market everything follows. */
async function selectFlowMarket(sym) {
  sym = String(sym || '').trim();
  if (!sym) return;
  flowPick = sym;

  // 1. Synchronize all active bots' selected symbol state
  if (typeof _botSelectedSymbols !== 'undefined') {
    _botSelectedSymbols.bot1 = sym;
    _botSelectedSymbols.bot2 = sym;
    _botSelectedSymbols.bot3 = sym;
    _botSelectedSymbols.bot4 = sym;
    _botSelectedSymbols.bot5 = sym;
    _botSelectedSymbols.bot6 = sym;
    _botSelectedSymbols.bot7 = sym;
  }

  // 2. Synchronize Live Curves across stages
  if (typeof setBotCurveSymbol === 'function') {
    setBotCurveSymbol('flow', sym);
    setBotCurveSymbol('bot1', sym);
    setBotCurveSymbol('bot2', sym);
    setBotCurveSymbol('bot3', sym);
    setBotCurveSymbol('bot4', sym);
    setBotCurveSymbol('bot5', sym);
  }

  // 3. Synchronize the Exness MT5 chart with the selected market.
  // The chart resolves broker suffixes itself (XAUUSD247m -> XAUUSDm, ...).
  const activeTerm = window.SoftradeXTerminal || window.BinanceTerminal;
  if (activeTerm && typeof activeTerm.switchMarket === 'function') {
    const target = typeof activeTerm.resolveSymbol === 'function'
      ? activeTerm.resolveSymbol(sym)
      : '';
    if (target) activeTerm.switchMarket(target);
  }

  // 3b. Synchronize Traders Order Flow Terminal directly with Market 01.
  // force=true: hard reset — the tape is wiped and rebuilt for THIS market
  // only (nothing from any previously selected market can leak through).
  if (window.TradersTerminal && typeof window.TradersTerminal.switchMarket === 'function') {
    window.TradersTerminal.switchMarket(sym, true);
  }

  // 4. Synchronize market select dropdowns in Sessions and AI board
  const sessSel = $('sessions-market');
  if (sessSel) {
    if (!Array.from(sessSel.options).some(o => o.value === sym)) {
      sessSel.innerHTML += `<option value="${esc(sym)}">${esc(sym)}</option>`;
    }
    sessSel.value = sym;
  }
  const aiSel = $('ai-market');
  if (aiSel) {
    if (!Array.from(aiSel.options).some(o => o.value === sym)) {
      aiSel.innerHTML += `<option value="${esc(sym)}">${esc(sym)}</option>`;
    }
    aiSel.value = sym;
  }

  // 5. Instantly refresh every stage that follows Market 01
  renderFlowStage(S || {});
  renderMarketWatches();          // 02 · Market Pressure Watch Dials
  updateAllMarketChips();
  void pollFlowBalanceWorld();    // the flow strip follows the selected market
  if (typeof renderAiMarket === 'function') renderAiMarket(S || {});   // 06 · Full AI analysis
  if (typeof renderSessions === 'function') renderSessions(S || {});   // 08 · Sessions
  if (typeof renderBot5 === 'function') renderBot5(S || {});           // 05 · Next event + 03 · AI direction

  // 6. Update backend configurations
  try {
    const rets = await Promise.all([
      sessPost('/api/bot5/config', { ai_market: sym, session_market: sym }),
      sessPost('/api/bot3/config', { symbol: sym }),
    ]);
    if (S) {
      if (rets[0] && rets[0].bot5) S.bot5 = rets[0].bot5;
      if (rets[1] && rets[1].bot3) S.bot3 = rets[1].bot3;
    }
  } catch (e) {}
  // the backend recalculated for the selected market — repaint every stage again
  if (S) {
    renderFlowStage(S);
    renderMarketWatches();
    if (typeof renderAiMarket === 'function') renderAiMarket(S);
    if (typeof renderSessions === 'function') renderSessions(S);
    if (typeof renderBot5 === 'function') renderBot5(S);
    if (typeof renderBot3 === 'function') renderBot3(S);    // 07 · Next setups
  }
  if (wsAlive) { try { ws.send(JSON.stringify({ type: 'refresh' })); } catch (e) {} }
}

function renderFlowStage(d) {
  if (!$('flow-pipeline')) return;
  d = d || {};
  const board = flowBoard() || {};
  const sym = flowSymbol();
  const w = findWatchForSymbol(sym) || {};
  const digits = Number(w.digits !== undefined ? w.digits : (board.digits || 2));
  const f = flowPressure(sym);

  // ---- market chips: comprehensive list of all markets
  const DEFAULT_MARKET_LIST = [
    'XAUUSDm', 'BTCUSDTm', 'ETHUSDTm', 'EURUSDm', 'GBPUSDm',
    'USDJPYm', 'AUDUSDm', 'USDCADm', 'USDCHFm', 'USOILm', 'USTECm', 'US30m'
  ];
  let syms = [];
  if (Array.isArray(board.symbols) && board.symbols.length) {
    syms = board.symbols.slice();
  }
  if (marketWatches && marketWatches.length) {
    marketWatches.forEach(wItem => {
      if (wItem.symbol && !syms.includes(wItem.symbol)) syms.push(wItem.symbol);
    });
  }
  DEFAULT_MARKET_LIST.forEach(dm => {
    if (!syms.includes(dm) && !syms.includes(dm.replace(/m$/, ''))) syms.push(dm);
  });
  if (sym && !syms.includes(sym)) syms.unshift(sym);

  // the market picker is the chip row below (there is no <select> element)
  const chips = $('flow-market-chips');
  if (chips) {
    const top = syms.slice(0, 12);
    const csig = top.join('|') + '#' + sym;
    if (chips.dataset.sig !== csig) {
      chips.dataset.sig = csig;
      chips.innerHTML = top.map(s => `<button type="button" class="mh-chip${s === sym ? ' on' : ''}" data-sym="${esc(s)}">${esc(String(s).replace(/m$/, ''))}</button>`).join('');
    }
  }

  // ---- the live price block
  const price = Number(w.ask || w.bid || board.price || 0);
  setCell($('flow-price'), price > 0 ? nf(price, digits) : '—');
  setCell($('flow-symbol-label'), String(w.displayName || sym || '—').toUpperCase());
  const chgEl = $('flow-change');
  if (chgEl) {
    const dir = String(w.direction || '').toUpperCase();
    const chg = Number(w.change_pct || 0);
    const arrow = dir === 'UP' ? '▲' : (dir === 'DOWN' ? '▼' : '►');
    const txt = price > 0
      ? `${arrow} ${dir || 'FLAT'}${chg ? ` · ${chg > 0 ? '+' : ''}${chg.toFixed(2)}%` : ''}`
      : '—';
    if (chgEl.textContent !== txt) chgEl.textContent = txt;
    chgEl.className = 'mh-change' + (chg > 0 ? ' pos' : (chg < 0 ? ' neg' : ''));
  }

  // ---- the AI answer of the selected market + its live pressure
  const comb = board.combined || {};
  const verdict = String(comb.verdict || '').toUpperCase();
  const sigEl = $('flow-signal');
  if (sigEl) {
    const txt = `${aiArrow(verdict)} ${aiSideTxt(verdict)}${comb.confidence ? ` ${Number(comb.confidence)}%` : ''}`;
    if (sigEl.textContent !== txt) sigEl.textContent = txt;
    const wantCls = `mh-signal ${aiSide(verdict)}`;
    if (sigEl.className !== wantCls) sigEl.className = wantCls;
  }
  setCell($('flow-signal-sub'), String((comb.reasons || [])[0] || t('flowSignalSub')));
  const barEl = $('flow-bar-buy');
  if (barEl) barEl.style.width = `${Math.max(2, Math.min(98, f.buyer))}%`;
  setCell($('flow-buy-pct'), `${f.buyer.toFixed(0)}%`);
  setCell($('flow-sell-pct'), `${f.seller.toFixed(0)}%`);

  // ---- quotes
  const d2 = digits > 4 ? 5 : digits;
  setCell($('flow-bid'), w.bid ? nf(w.bid, d2) : '—');
  setCell($('flow-ask'), w.ask ? nf(w.ask, d2) : '—');
  setCell($('flow-spread'), (w.spread !== undefined && w.spread !== null) ? String(w.spread) : '—');

  // ---- market state pill
  const st = $('flow-market-status');
  if (st) {
    let cls = 'mh-status';
    let txt;
    if (!sym) { cls = 'mh-status muted'; txt = '—'; }
    else if (price <= 0) { cls = 'mh-status muted'; txt = t('flowNoQuote'); }
    else if (w.market_open === false) { cls = 'mh-status off'; txt = t('flowMarketClosed'); }
    else { txt = t('flowMarketOpen'); }
    if (st.textContent !== txt) st.textContent = txt;
    if (st.className !== cls) st.className = cls;
  }

  // ---- the wires between the stages carry the live numbers
  const hist = _priceHistory[getHistoryKey(sym)] || [];
  flowTag('flow-tag-dial', `${sym || '—'} → NEXT EVENT · LIVE`);
  flowTag('flow-tag-setups', `BUYER ${f.buyer.toFixed(0)}% / SELLER ${f.seller.toFixed(0)}%`);
  const planned = ((d.bot3 || {}).planned_trades || []).length;
  const nowSec0 = Date.now() / 1000;
  const news24 = ((d.bot5 || {}).news || []).filter(n => { const ts = Number(n.ts || 0); return ts > nowSec0 && ts <= nowSec0 + 86400; }).length;
  flowTag('flow-tag-news', news24 ? `NEXT EVENT → DIAL · ${news24} IN 24H` : 'NEXT EVENT → DIAL · WATCHING');
  flowTag('flow-tag-curve', `${sym || '—'} · ${hist.length} TICKS · ${String(w.direction || '').toUpperCase() || 'FLAT'}`);
  const cdEl = $('watch-countdown');
  const evEl = $('watch-event-title');
  const cdTxt = cdEl ? String(cdEl.textContent || '').trim() : '';
  const evTxt = evEl ? String(evEl.textContent || '').trim() : '';
  flowTag('flow-tag-session', (cdTxt && evTxt && cdTxt !== '—') ? `${cdTxt} · ${evTxt.slice(0, 32)}` : t('bot5NoNews'));
  const sessBoard = (d.bot5 || {}).sessions || {};
  const running = (sessBoard.sessions || []).filter(r => r.state === 'open');
  flowTag('flow-tag-ai', running.length
    ? `${running.map(r => String(t(SESSION_LABEL[r.key] || '') || r.name_en || r.key).toUpperCase()).join(' + ')} OPEN`
    : t('flowNoSession'));
  const outlook = (d.bot5 || {}).outlook || [];
  const oRow = outlook.find(o => String(o.market || '').toUpperCase() === sym.toUpperCase()) || null;
  flowTag('flow-tag-outlook', (verdict || oRow)
    ? `AI ${verdict || '—'} ${Number(comb.confidence || 0)}% → 24H ${oRow ? `${String(oRow.verdict || '').toUpperCase()} ${Number(oRow.confidence || 0)}%` : '—'}`
    : 'AI → 24H');
  const hcEl = $('hist-count');
  flowTag('flow-tag-history', `${hcEl ? String(hcEl.textContent || '0') : '0'} ${t('flowClosedTrades')}`);

  // ---- the curve headline
  setCell($('flow-curve-sub'), `${sym || '—'} · ${hist.length} ticks`);

  // ---- rail badges
  const posEl = $('rail-pos-count');
  if (posEl) {
    const n = (d.positions || []).length;
    setCell(posEl, String(n));
    posEl.classList.toggle('hot', n > 0);
    const tpEl = $('tab-badge-pos');
    if (tpEl) setCell(tpEl, String(n));
  }
  const botEl = $('rail-bot-count');
  if (botEl) {
    const n = ['bot', 'bot2', 'bot3', 'bot4', 'bot5', 'bot6', 'bot7']
      .filter(k => d[k] && d[k].running).length;
    setCell(botEl, `${n}/7`);
    botEl.classList.toggle('hot', n > 0);
    const tbEl = $('tab-badge-bots');
    if (tbEl) setCell(tbEl, `${n}/7`);
  }
}

/* Ultra-lightweight in-place price patch for high frequency 30-100ms watch frames (no reflow). */
function updateFlowStageLivePrices() {
  const sym = flowSymbol();
  if (!sym) return;
  const w = findWatchForSymbol(sym);
  if (!w) return;
  const digits = Number(w.digits !== undefined ? w.digits : 2);
  const price = Number(w.ask || w.bid || 0);
  if (price > 0) setCell($('flow-price'), nf(price, digits));
  if (window.TradersTerminal && typeof window.TradersTerminal.onPriceTick === 'function') {
    window.TradersTerminal.onPriceTick(sym, price, w.bid, w.ask, S);
  }
  const chgEl = $('flow-change');
  if (chgEl) {
    const dir = String(w.direction || '').toUpperCase();
    const chg = Number(w.change_pct || 0);
    const arrow = dir === 'UP' ? '▲' : (dir === 'DOWN' ? '▼' : '►');
    const txt = price > 0
      ? `${arrow} ${dir || 'FLAT'}${chg ? ` · ${chg > 0 ? '+' : ''}${chg.toFixed(2)}%` : ''}`
      : '—';
    if (chgEl.textContent !== txt) chgEl.textContent = txt;
    chgEl.className = 'mh-change' + (chg > 0 ? ' pos' : (chg < 0 ? ' neg' : ''));
  }
  const f = flowPressure(sym);
  const barEl = $('flow-bar-buy');
  if (barEl) barEl.style.width = `${Math.max(2, Math.min(98, f.buyer))}%`;
  setCell($('flow-buy-pct'), `${f.buyer.toFixed(0)}%`);
  setCell($('flow-sell-pct'), `${f.seller.toFixed(0)}%`);
  const d2 = digits > 4 ? 5 : digits;
  if (w.bid) setCell($('flow-bid'), nf(w.bid, d2));
  if (w.ask) setCell($('flow-ask'), nf(w.ask, d2));
  if (w.spread !== undefined && w.spread !== null) setCell($('flow-spread'), String(w.spread));
  flowTag('flow-tag-setups', `BUYER ${f.buyer.toFixed(0)}% / SELLER ${f.seller.toFixed(0)}%`);
}

/* ----------------------------------------------------- the side drawers */
function setBotsDrawerFullscreen(on) {
  const drawer = $('bots-drawer');
  if (!drawer) return;
  drawer.classList.toggle('fullscreen', !!on);
  const toggle = $('bots-fs-toggle');
  const icon = $('bots-fs-icon');
  const label = $('bots-fs-label');
  if (toggle) toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
  if (icon) icon.textContent = on ? '🗗' : '⛶';
  if (label) label.textContent = on ? 'Side View' : 'Fullscreen';
}

function closeFlowDrawers() {
  const dash = $('dash');
  if (!dash) return;
  // Clear the fixed fullscreen surface before hiding its contents.
  setBotsDrawerFullscreen(false);
  $('bot5-news')?.__renderer?.pause();
  dash.classList.remove('drawer-left-open', 'drawer-right-open');
  const scrim = $('drawer-scrim');
  if (scrim) scrim.hidden = true;
  document.body.classList.remove('no-scroll');
  ['rail-positions', 'rail-history', 'rail-bots', 'rail-activity'].forEach(id => {
    const rail = $(id);
    if (rail) rail.setAttribute('aria-expanded', 'false');
  });
  ['positions-drawer', 'bots-drawer'].forEach(id => {
    const drawer = $(id);
    if (drawer) drawer.setAttribute('aria-hidden', 'true');
  });
}

function initFlowUI() {
  const dash = $('dash');
  const scrim = $('drawer-scrim');
  const switchLeftDrawerTab = (tabName) => {
    const isPos = tabName === 'positions';
    const posTab = $('tab-btn-positions');
    const histTab = $('tab-btn-history');
    const posView = $('view-positions');
    const histView = $('view-history');
    if (posTab) posTab.classList.toggle('active', isPos);
    if (histTab) histTab.classList.toggle('active', !isPos);
    if (posView) posView.classList.toggle('active', isPos);
    if (histView) histView.classList.toggle('active', !isPos);
  };
  window.__switchLeftDrawerTab = switchLeftDrawerTab;

  const switchRightDrawerTab = (tabName) => {
    const isBots = tabName === 'bots';
    const botsTab = $('tab-btn-bots');
    const actTab = $('tab-btn-activity');
    const botsView = $('view-bots');
    const actView = $('view-activity');
    if (botsTab) botsTab.classList.toggle('active', isBots);
    if (actTab) actTab.classList.toggle('active', !isBots);
    if (botsView) botsView.classList.toggle('active', isBots);
    if (actView) actView.classList.toggle('active', !isBots);
    if (!isBots) $('bot5-news')?.__renderer?.pause();
    else if ((typeof botsDrawerOpen === 'function' ? botsDrawerOpen() : !!dash?.classList?.contains('drawer-right-open')) && typeof renderBot5 === 'function') { renderBot5(S || window.__lastPollData || {}); $('bot5-news')?.__renderer?.resume(); }
  };
  window.__switchRightDrawerTab = switchRightDrawerTab;

  const setDrawer = (side, tab) => {
    if (!dash) return;
    if (!side) { closeFlowDrawers(); return; }
    if (side !== 'right') setBotsDrawerFullscreen(false);
    dash.classList.toggle('drawer-left-open', side === 'left');
    dash.classList.toggle('drawer-right-open', side === 'right');
    const open = !!side;
    if (scrim) scrim.hidden = !open;
    document.body.classList.toggle('no-scroll', open);
    const lp = $('rail-positions');
    if (lp) lp.setAttribute('aria-expanded', side === 'left' ? 'true' : 'false');
    const lh = $('rail-history');
    if (lh) lh.setAttribute('aria-expanded', side === 'left' ? 'true' : 'false');
    const rb = $('rail-bots');
    if (rb) rb.setAttribute('aria-expanded', side === 'right' ? 'true' : 'false');
    const ra = $('rail-activity');
    if (ra) ra.setAttribute('aria-expanded', side === 'right' ? 'true' : 'false');
    const pd = $('positions-drawer');
    if (pd) pd.setAttribute('aria-hidden', side === 'left' ? 'false' : 'true');
    const bd = $('bots-drawer');
    if (bd) bd.setAttribute('aria-hidden', side === 'right' ? 'false' : 'true');
    // the drawer was paused while shut - paint it with the newest engine state
    if (side === 'right') {
      if (S && typeof renderBotsPanels === 'function') renderBotsPanels(S);
      if (typeof renderBot5 === 'function') renderBot5(S || window.__lastPollData || {});
      $('bot5-news')?.__renderer?.resume();
    }

    if (side === 'left' && tab) {
      switchLeftDrawerTab(tab);
    }
    if (side === 'right' && tab) {
      switchRightDrawerTab(tab);
    }
  };
  window.__setFlowDrawer = setDrawer;

  const toggle = (side, tab) => {
    const isOpen = !!dash && dash.classList.contains(side === 'left' ? 'drawer-left-open' : 'drawer-right-open');
    playTactileClick('click');
    if (isOpen) {
      if (side === 'left' && tab) {
        const isCurrentlyPos = $('tab-btn-positions')?.classList.contains('active');
        const currentTab = isCurrentlyPos ? 'positions' : 'history';
        if (tab !== currentTab) {
          switchLeftDrawerTab(tab);
          return;
        }
      }
      if (side === 'right' && tab) {
        const isCurrentlyBots = $('tab-btn-bots')?.classList.contains('active');
        const currentTab = isCurrentlyBots ? 'bots' : 'activity';
        if (tab !== currentTab) {
          switchRightDrawerTab(tab);
          return;
        }
      }
      setDrawer(null);
    } else {
      setDrawer(side, tab || (side === 'left' ? 'positions' : 'bots'));
    }
  };

  const posBtn = $('rail-positions');
  if (posBtn && !posBtn.dataset.bound) {
    posBtn.dataset.bound = '1';
    posBtn.addEventListener('click', () => toggle('left', 'positions'));
  }
  const histBtn = $('rail-history');
  if (histBtn && !histBtn.dataset.bound) {
    histBtn.dataset.bound = '1';
    histBtn.addEventListener('click', () => toggle('left', 'history'));
  }
  const tabPos = $('tab-btn-positions');
  if (tabPos && !tabPos.dataset.bound) {
    tabPos.dataset.bound = '1';
    tabPos.addEventListener('click', () => switchLeftDrawerTab('positions'));
  }
  const tabHist = $('tab-btn-history');
  if (tabHist && !tabHist.dataset.bound) {
    tabHist.dataset.bound = '1';
    tabHist.addEventListener('click', () => switchLeftDrawerTab('history'));
  }
  const botBtn = $('rail-bots');
  if (botBtn && !botBtn.dataset.bound) {
    botBtn.dataset.bound = '1';
    botBtn.addEventListener('click', () => toggle('right', 'bots'));
  }
  const actBtn = $('rail-activity');
  if (actBtn && !actBtn.dataset.bound) {
    actBtn.dataset.bound = '1';
    actBtn.addEventListener('click', () => toggle('right', 'activity'));
  }
  const tabBots = $('tab-btn-bots');
  if (tabBots && !tabBots.dataset.bound) {
    tabBots.dataset.bound = '1';
    tabBots.addEventListener('click', () => switchRightDrawerTab('bots'));
  }
  const tabAct = $('tab-btn-activity');
  if (tabAct && !tabAct.dataset.bound) {
    tabAct.dataset.bound = '1';
    tabAct.addEventListener('click', () => switchRightDrawerTab('activity'));
  }
  if (scrim && !scrim.dataset.bound) {
    scrim.dataset.bound = '1';
    scrim.addEventListener('click', () => setDrawer(null));
  }
  document.querySelectorAll('[data-drawer-close]').forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => setDrawer(null));
  });
  if (!window.__flowEscapeBound) {
    window.__flowEscapeBound = true;
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeFlowDrawers(); });
  }

  // Fullscreen toggle for Bots Drawer
  const fsToggle = $('bots-fs-toggle');
  if (fsToggle && !fsToggle.dataset.bound) {
    fsToggle.dataset.bound = '1';
    fsToggle.addEventListener('click', () => {
      const drawer = $('bots-drawer');
      if (!drawer) return;
      setBotsDrawerFullscreen(!drawer.classList.contains('fullscreen'));
    });
  }

  // Quick Nav Tabs for Bots Drawer
  const quickNav = $('bots-quick-nav');
  if (quickNav && !quickNav.dataset.bound) {
    quickNav.dataset.bound = '1';
    quickNav.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('.b-nav-pill') : null;
      if (!btn || !btn.dataset.bot) return;
      quickNav.querySelectorAll('.b-nav-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const targetId = btn.dataset.bot;
      const allPanels = document.querySelectorAll('#bots-drawer .bot-panel');
      if (targetId === 'all') {
        allPanels.forEach(p => {
          p.classList.remove('bot-highlight');
        });
        const firstPanel = document.getElementById('all-news-panel') || document.getElementById('bot1-panel');
        if (firstPanel) firstPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        allPanels.forEach(p => {
          if (p.id === targetId) {
            p.classList.add('bot-highlight');
          } else {
            p.classList.remove('bot-highlight');
          }
        });
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
  }

  const chips = $('flow-market-chips');
  if (chips && !chips.dataset.bound) {
    chips.dataset.bound = '1';
    chips.addEventListener('click', (ev) => {
      const btn = ev.target && ev.target.closest ? ev.target.closest('.mh-chip') : null;
      if (!btn || !btn.dataset.sym) return;
      void selectFlowMarket(btn.dataset.sym);
    });
  }

  const newsFilterBar = $('news-impact-filter-bar');
  if (newsFilterBar && !newsFilterBar.dataset.bound) {
    newsFilterBar.dataset.bound = '1';
    newsFilterBar.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('.news-impact-btn') : null;
      if (!btn || !btn.dataset.impact) return;
      playTactileClick('click');
      window.__userPickedNewsImpactFilter = true;
      window.__activeNewsImpactFilter = btn.dataset.impact.toLowerCase();
      newsFilterBar.querySelectorAll('.news-impact-btn').forEach(b => b.classList.toggle('active', b === btn));
      const payload = window.__lastPollData || (typeof S !== 'undefined' ? S : null) || {};
      renderBot5(payload);
    });
  }

  // ALL ECONOMIC NEWS panel: ALL / HIGH / MEDIUM / LOW filter
  const allNewsBar = $('news-impact-all-bar');
  if (allNewsBar && !allNewsBar.dataset.bound) {
    allNewsBar.dataset.bound = '1';
    allNewsBar.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('.news-impact-btn') : null;
      if (!btn || !btn.dataset.imp) return;
      playTactileClick('click');
      window.__allNewsImpactFilter = btn.dataset.imp.toLowerCase();
      allNewsBar.querySelectorAll('.news-impact-btn').forEach(b => b.classList.toggle('active', b === btn));
      const payload = window.__lastPollData || (typeof S !== 'undefined' ? S : null);
      if (payload) renderBot5(payload);   // re-filters and re-renders the list
    });
  }



  initSoftradeXTerminalUI();
  setupFlowWires();
}

function initSoftradeXTerminalUI() {
  // Handled natively by softradex-terminal.js (Pure WebSocket & REST, 0% TradingView)
}
function initBinanceTerminalUI() {
  initSoftradeXTerminalUI();
}

/* ================= LIVE DATA WIRES BETWEEN THE STAGES =================
   The pipeline stages (01 → 05 → 02 → 03 → 04 → 08 → 06 → 07 → 09) are
   joined with glowing circuit wires that CARRY the live numbers: every
   wire tag (BUYER %, TICKS, countdowns, verdicts) is updated by the same
   feeds that drive the cards. Orthogonal, rounded, PCB-style routing,
   measured from the real layout, so the wires survive every breakpoint. */
const FLOW_LINK_ROUTES = [
  ['flow-tag-dial',    'stage-market',   'stage-news'],
  ['flow-tag-news',    'stage-news',     'stage-dial'],
  ['flow-tag-outlook', 'stage-dial',     'stage-outlook'],
  ['flow-tag-curve',   'stage-outlook',  'stage-curve'],
  ['flow-tag-session', 'stage-curve',    'stage-sessions'],
  ['flow-tag-ai',      'stage-sessions', 'stage-ai'],
  ['flow-tag-setups',  'stage-ai',       'stage-setups'],
];
let _flowWiresRAF = 0;

function scheduleFlowWires() {
  return;
}

function updateFlowWires() {
  return;
}

function setupFlowWires() {
  document.body.classList.remove('wires-on');
}

function tickBot5Countdown() {
  if (document.hidden) return;
  const now = Date.now() / 1000;
  const el = $('bot5-countdown');
  const wEl = $('watch-countdown');
  const b5 = S && S.bot5;
  updateNewsRelativeTimes();
  let ev = window.__currentNewsCardEvent || null;
  if (now >= renderBot5.nextNewsExpiry || (ev && window.DashboardPanels.newsPhase(ev, now) === 'expired')) {
    renderBot5(S || {});
    ev = window.__currentNewsCardEvent || null;
  }
  if (el || wEl) {
    if (!ev || !ev.ts) {
      if (el) el.textContent = '—';
      if (wEl) wEl.textContent = '—';
    } else {
      const secs = Math.round(Number(ev.ts) - now);
      if (secs <= 0) {
        const liveTxt = 'IMPACT · ' + sessHms(Number(ev.ts) + window.DashboardPanels.impactSeconds(ev) - now);
        if (el) el.textContent = liveTxt;
        if (wEl) {
          wEl.textContent = liveTxt;
          wEl.className = 'news-countdown soon';
        }
        const whenTxt = LANG === 'bn' ? 'লাইভ চলছে' : 'LIVE NOW';
        const nw1 = $('bot5-event-meta');
        if (nw1) {
          const wSpan = nw1.querySelector('.news-when');
          if (wSpan && wSpan.textContent !== whenTxt) wSpan.textContent = whenTxt;
        }
        const nw2 = $('watch-event-meta');
        if (nw2) {
          const wSpan = nw2.querySelector('.news-when');
          if (wSpan && wSpan.textContent !== whenTxt) wSpan.textContent = whenTxt;
        }
        // Once event starts/passes, auto-refresh to advance to the next event
        // (throttled: a 1 Hz refresh for the whole post window spams the socket)
        if (wsAlive && secs <= -2) {
          const tnow = Date.now();
          if (tnow - (_bot5LiveRefreshAt || 0) > 5000) {
            _bot5LiveRefreshAt = tnow;
            try { ws.send(JSON.stringify({ type: 'refresh' })); } catch (e) {}
          }
        }
      } else {
        const m = Math.floor(secs / 60), s = secs % 60;
        const countTxt = m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
        const countCls = 'news-countdown' + (secs <= 300 ? ' soon' : '');
        if (el) {
          el.textContent = 'STARTS IN ' + countTxt;
          el.className = countCls;
        }
        if (wEl) {
          wEl.textContent = 'STARTS IN ' + countTxt;
          wEl.className = countCls;
        }
        const mins = Math.round(secs / 60);
        const whenTxt = mins >= 0
          ? (LANG === 'bn' ? `আর ${fmtCountdown(mins)}` : `in ${fmtCountdown(mins)}`)
          : (LANG === 'bn' ? `${fmtCountdown(-mins)} আগে` : `${fmtCountdown(-mins)} ago`);
        const nw1 = $('bot5-event-meta');
        if (nw1) {
          const wSpan = nw1.querySelector('.news-when');
          if (wSpan && wSpan.textContent !== whenTxt) wSpan.textContent = whenTxt;
        }
        const nw2 = $('watch-event-meta');
        if (nw2) {
          const wSpan = nw2.querySelector('.news-when');
          if (wSpan && wSpan.textContent !== whenTxt) wSpan.textContent = whenTxt;
        }
      }
    }
  }

  // "previous news show korbe na. jeta sesh ota chole jeba" -> 
  // Live auto-removal of finished news from DOM immediately every second
  const rows = botsDrawerOpen() ? document.querySelectorAll('#bot5-news .news-row') : [];
  if (rows && rows.length) {
    let removed = false;
    rows.forEach((row) => {
      const ts = Number(row.dataset.ts || 0);
      if (ts && ts <= now) {
        row.remove();
        removed = true;
      }
    });
    if (removed && !document.querySelector('#bot5-news .news-row')) {
      const newsEl = $('bot5-news');
      if (newsEl) {
        newsEl.innerHTML = `<div class="news-empty">${LANG === 'bn' ? 'ক্যালেন্ডারে কোনো আসন্ন ইভেন্ট নেই' : 'No upcoming events on the calendar'}</div>`;
      }
    }
    // the live list is a rolling window: ask the engine for fresh rows when the
    // next event is close, so newly expired rows are replaced by newer ones
    if (removed && wsAlive && !_bot5NewsRefreshPending) {
      _bot5NewsRefreshPending = true;
      setTimeout(() => {
        _bot5NewsRefreshPending = false;
        try { ws.send(JSON.stringify({ type: 'refresh' })); } catch (e) {}
      }, 1500);
    }
  }
}
let _bot5NewsRefreshPending = false;

function renderBot5Manual() {
  // Manual event creation removed per user request
}

async function bot5Post(path, body) {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const j = await res.json();
    if (!res.ok) {
      const msg = (j.error && j.error.message) || j.detail || 'Request failed';
      toast('error', msg);
      return j;
    }
    if (j.bot5) { if (S) { S.bot5 = j.bot5; renderBot5(S); } }
    return j;
  } catch (e) { toast('error', String(e)); return {}; }
}

function bindBot5UI() {
  const b5Start = $('bot5-start');
  if (b5Start) {
    b5Start.addEventListener('click', async () => {
      const sym = (S && S.bot5 && S.bot5.symbol) || 'XAUUSDm';
      if (!isMarketOpen(sym)) {
        toast('error', LANG === 'bn' ? `${sym} মার্কেটটি বর্তমানে বন্ধ থাকায় বট চালু করা যাবে না` : `Cannot start bot: ${sym} market is currently closed`);
        return;
      }
      const lot = Number($('bot5-lot').value || 0.01);
      const mode = $('bot5-mode').value || 'anticipate';
      const impact = $('bot5-impact').value || 'high';
      const pre = Math.max(0, parseInt($('bot5-pre').value || 5, 10));
      const post = Math.max(1, parseInt($('bot5-post').value || 15, 10));
      const ok = window.confirm(
        LANG === 'bn'
          ? `নিউজ ট্রেডার বট চালু করবেন?\n\nলট: ${lot}\nস্টাইল: ${mode}\nইমপ্যাক্ট: ${impact}\nপ্রি: ${pre} মিনিট · পোস্ট: ${post} মিনিট`
          : `Start News Trader Bot?\n\nLot: ${lot}\nStyle: ${mode}\nImpact: ${impact}\nPre: ${pre} min · Post: ${post} min`
      );
      if (!ok) return;
      const res = await bot5Post('/api/bot5/start', { lot, mode, min_impact: impact, pre_minutes: pre, post_minutes: post });
      if (res && res.ok) toast('ok', LANG === 'bn' ? 'বট ৫ (নিউজ ট্রেডার) চালু হয়েছে' : 'Bot 5 (News Trader) Started');
    });
  }

  const b5Stop = $('bot5-stop');
  if (b5Stop) {
    b5Stop.addEventListener('click', async () => {
      const res = await bot5Post('/api/bot5/stop', {});
      if (res && res.ok) toast('ok', LANG === 'bn' ? 'বট ৫ বন্ধ করা হলো' : 'Bot 5 Stopped');
    });
  }

  const b5Close = $('bot5-close');
  if (b5Close) {
    b5Close.addEventListener('click', async () => {
      if (!window.confirm(LANG === 'bn' ? 'বট ৫ এর সব খোলা ট্রেড এখনই ক্লোজ করবেন?' : 'Close all Bot 5 open positions right now?')) return;
      const res = await bot5Post('/api/bot5/close', {});
      if (res && res.ok) toast('ok', `${LANG === 'bn' ? 'ক্লোজ করা ট্রেড' : 'Closed positions'} (${res.closed || 0})`);
    });
  }

  const b5Refresh = $('bot5-refresh');
  if (b5Refresh) {
    b5Refresh.addEventListener('click', async () => {
      toast('ok', LANG === 'bn' ? 'ক্যালেন্ডার আনা হচ্ছে…' : 'Fetching calendar…');
      const res = await bot5Post('/api/bot5/refresh', {});
      if (res && res.ok) {
        toast('ok', LANG === 'bn' ? `ক্যালেন্ডার: ${res.count || 0} ইভেন্ট` : `Calendar: ${res.count || 0} events`);
        if (wsAlive) ws.send(JSON.stringify({ type: 'refresh' }));
      }
    });
  }

  const b5Mode = $('bot5-mode');
  if (b5Mode) b5Mode.addEventListener('change', () => { void bot5Post('/api/bot5/config', { mode: b5Mode.value }); });
  const b5Impact = $('bot5-impact');
  if (b5Impact) b5Impact.addEventListener('change', () => { void bot5Post('/api/bot5/config', { min_impact: b5Impact.value }); });
  const b5Lot = $('bot5-lot');
  if (b5Lot) b5Lot.addEventListener('change', () => { void bot5Post('/api/bot5/config', { lot: Number(b5Lot.value || 0.01) }); });
  const b5MaxTrades = $('bot5-max-trades');
  if (b5MaxTrades) b5MaxTrades.addEventListener('change', () => { void bot5Post('/api/bot5/config', { max_trades: Math.max(1, parseInt(b5MaxTrades.value || 1, 10)) }); });
  const b5Pre = $('bot5-pre');
  if (b5Pre) b5Pre.addEventListener('change', () => { void bot5Post('/api/bot5/config', { pre_minutes: Math.max(0, parseInt(b5Pre.value || 5, 10)) }); });
  const b5PostEl = $('bot5-post');
  if (b5PostEl) b5PostEl.addEventListener('change', () => { void bot5Post('/api/bot5/config', { post_minutes: Math.max(1, parseInt(b5PostEl.value || 15, 10)) }); });
  const b5Tp = $('bot5-tp');
  if (b5Tp) b5Tp.addEventListener('change', () => { void bot5Post('/api/bot5/config', { tp: Math.max(0, Number(b5Tp.value || 3.0)) }); });
  const b5Sl = $('bot5-sl');
  if (b5Sl) b5Sl.addEventListener('change', () => { void bot5Post('/api/bot5/config', { sl: Math.max(0, Number(b5Sl.value || 3.0)) }); });

  const b5Chips = $('bot5-market-chips');
  if (b5Chips) {
    b5Chips.addEventListener('click', async (e) => {
      const chip = e.target && e.target.closest ? e.target.closest('.chip') : null;
      if (!chip || !chip.dataset.sym) return;
      const sym = chip.dataset.sym;
      if (chip.classList.contains('market-off') || !isMarketOpen(sym)) {
        toast('warn', LANG === 'bn' ? `${sym} মার্কেটটি বর্তমানে বন্ধ রয়েছে (Market Closed)` : `${sym} market is currently closed`);
        return;
      }
      document.querySelectorAll('#bot5-market-chips .chip')
        .forEach(c => c.classList.toggle('active', c.dataset.sym === sym));
      if ($('bot5-symbol')) $('bot5-symbol').textContent = sym;
      if ($('bot5-symbol-name')) $('bot5-symbol-name').textContent = sym;
      b5Chips.dataset.n = '';
      setBotCurveSymbol('bot5', sym);
      const res = await bot5Post('/api/bot5/config', { symbol: sym });
      if (res && res.ok) {
        if (res.bot5) {
          if (S) S.bot5 = res.bot5;
          renderBot5(S);
        }
        toast('ok', `${t('botMarketSwitched')}: ${sym}`);
        if (wsAlive) ws.send(JSON.stringify({ type: 'refresh' }));
      }
    });
  }
}

/* ----------------------------------------------------------- voice alerts & feed */
function hashStr(str) {
  let hash = 0;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

/* ------------------------------------------ bot 6 (pre-trade entry) */
function renderWatchBox(elId, w, minPct, isBn) {
  const el = $(elId);
  if (!el) return;
  const buyer = Number(w.buyer_pct || 0);
  const seller = Number(w.seller_pct || 0);
  const dom = String(w.dominant || 'NEUTRAL').toUpperCase();
  if (!buyer && !seller) {
    el.innerHTML = `<div class="lr-empty">${isBn ? 'ওয়াচ ডায়ালে এখনো ডাটা আসেনি — নিরাপদে ট্রেড বন্ধ' : 'No dial data yet - trading is safely blocked'}</div>`;
    return;
  }
  const okBuy = buyer >= minPct;
  const okSell = seller >= minPct;
  const bar = (lbl, val, ok, cls) => `
    <div class="ladder-row ${ok ? 'filled' : ''}">
      <span class="lr-no">${lbl}</span>
      <span class="lr-price">${nf(val, 1)}%</span>
      <span class="lr-lot">${ok ? (isBn ? 'পাস' : 'PASS') : '< ' + nf(minPct, 0) + '%'}</span>
      <span class="lr-state ${ok ? 'st-filled' : 'st-cancelled'}">${ok ? '✔' : '✘'}</span>
    </div>`;
  const reason = String(w.reason || '');
  el.innerHTML = bar('BUY', buyer, okBuy) + bar('SELL', seller, okSell)
    + `<div class="lr-empty">${isBn ? 'থ্রেশহোল্ড' : 'threshold'} ${nf(minPct, 0)}% · ${esc(dom)}`
    + (reason ? ` — ${esc(reason)}` : '') + `</div>`;
}

function renderBot6() {}
function bindBot6UI() {}
function renderBot7() {}
function bindBot7UI() {}
function clearSpeakingHighlight() {
  if (currentSpeakingKey) {
    const el = document.getElementById(currentSpeakingKey);
    if (el) el.classList.remove('voice-light-pulse');
  }
}

function updateVoiceMuteButtons() {
  const topbarBtn = $('topbar-mute-btn');
  const panelBtn = $('voice-mute-btn');
  const panelIcon = $('voice-icon');
  const panelLbl = $('voice-lbl');

  if (topbarBtn) {
    topbarBtn.textContent = voiceMuted ? '🔇' : '🔊';
    topbarBtn.title = voiceMuted
      ? (LANG === 'bn' ? 'ভয়েস আনমিউট করুন (সাউন্ড অন)' : 'Unmute Voice Announcements')
      : (LANG === 'bn' ? 'ভয়েস মিউট করুন (সাউন্ড অফ)' : 'Mute Voice Announcements');
    topbarBtn.classList.toggle('muted', voiceMuted);
  }

  if (panelBtn) {
    panelBtn.classList.toggle('muted', voiceMuted);
    panelBtn.title = voiceMuted
      ? (LANG === 'bn' ? 'ভয়েস আনমিউট করুন' : 'Click to Unmute Voice')
      : (LANG === 'bn' ? 'ভয়েস মিউট করুন' : 'Click to Mute Voice');
  }
  if (panelIcon) {
    panelIcon.textContent = voiceMuted ? '🔇' : '🔊';
  }
  if (panelLbl) {
    panelLbl.textContent = voiceMuted ? 'Voice: OFF' : 'Voice: ON';
  }
}

function setVoiceMute(muted, showToast = true) {
  voiceMuted = !!muted;
  localStorage.setItem('exdash.voice_muted', voiceMuted ? 'true' : 'false');
  if (voiceMuted) {
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }
    clearSpeakingHighlight();
    speechQueue = [];
    isSpeaking = false;
    currentSpeakingKey = null;
  }
  updateVoiceMuteButtons();
  if (showToast) {
    toast('ok', voiceMuted
      ? (LANG === 'bn' ? 'ভয়েস অ্যালার্ট বন্ধ করা হয়েছে 🔇' : 'Voice Announcements Muted 🔇')
      : (LANG === 'bn' ? 'ভয়েস অ্যালার্ট চালু করা হয়েছে 🔊' : 'Voice Announcements Active 🔊'));
  }
}

function formatEventForSpeech(e) {
  if (!e) return '';
  const msg = String(e.message || '').trim();
  if (!msg) return '';

  const isBn = (LANG === 'bn');

  // 1. Profit trade closed: e.g. "closed #123 EURUSD -> +0.15" or "Take profit reached -> +0.20"
  const winMatch = msg.match(/(?:closed|tp|profit).*?->\s*\+?([\d.]+)/i);
  if (winMatch) {
    const amt = winMatch[1];
    return isBn ? `ট্রেড প্রফিটে ক্লোজ হয়েছে, লাভ ${amt} ডলার` : `Trade closed in profit, plus ${amt} dollars`;
  }

  // 2. Loss trade closed: e.g. "closed #123 EURUSD -> -0.15" or "Stop loss reached -> -0.20"
  const lossMatch = msg.match(/(?:closed|sl|loss).*?->\s*-([\d.]+)/i);
  if (lossMatch) {
    const amt = lossMatch[1];
    return isBn ? `ট্রেড লসে ক্লোজ হয়েছে, লস ${amt} ডলার` : `Trade closed with loss, minus ${amt} dollars`;
  }

  // 3. Any other closed trade with -> value
  const anyClosedMatch = msg.match(/closed.*?->\s*([+-]?[\d.]+)/i);
  if (anyClosedMatch) {
    const val = Number(anyClosedMatch[1]);
    if (val >= 0) {
      return isBn ? `ট্রেড ক্লোজ হয়েছে, লাভ ${val} ডলার` : `Trade closed in profit, plus ${val} dollars`;
    } else {
      return isBn ? `ট্রেড ক্লোজ হয়েছে, লস ${Math.abs(val)} ডলার` : `Trade closed with loss, minus ${Math.abs(val)} dollars`;
    }
  }

  // 4. Trend updates: e.g. "Bot 2 60s Trend: UP (BULLISH)"
  if (/trend/i.test(msg) || /bullish|bearish/i.test(msg)) {
    if (/bullish|up/i.test(msg)) {
      return isBn ? 'ট্রেন্ড আপডেট: মার্কেট বুলিশ আপ ট্রেন্ড' : 'Trend update: Market Bullish UP';
    }
    if (/bearish|down/i.test(msg)) {
      return isBn ? 'ট্রেন্ড আপডেট: মার্কেট বেয়ারিশ ডাউন ট্রেন্ড' : 'Trend update: Market Bearish DOWN';
    }
  }

  // 5. Bot orders: BUY / SELL
  const buyMatch = msg.match(/\b(buy)\b/i);
  const sellMatch = msg.match(/\b(sell)\b/i);
  const symMatch = msg.match(/\b([A-Z]{6}|[A-Z]{3}\/[A-Z]{3})\b/);
  const symbol = symMatch ? symMatch[1].replace('/', '') : '';

  if (buyMatch) {
    return isBn ? `নতুন বাই অর্ডার এক্সিকিউট হয়েছে ${symbol}` : `New Buy order executed ${symbol}`;
  }
  if (sellMatch) {
    return isBn ? `নতুন সেল অর্ডার এক্সিকিউট হয়েছে ${symbol}` : `New Sell order executed ${symbol}`;
  }

  // 6. Connect / Disconnect
  if (/login successful|connected/i.test(msg)) {
    return isBn ? 'অ্যাকাউন্ট সফলভাবে কানেক্ট হয়েছে' : 'Account connected successfully';
  }
  if (/disconnected|logged out/i.test(msg)) {
    return isBn ? 'অ্যাকাউন্ট ডিসকানেক্ট হয়েছে' : 'Account disconnected';
  }

  // 7. Generic message cleanup: strip symbols like ->, #, *, [], emojis
  let clean = msg
    .replace(/->/g, ' to ')
    .replace(/[#@*▲▼★⚡✓✔✕✖•|]/g, ' ')
    .replace(/\[.*?\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (clean.length > 90) clean = clean.slice(0, 85);
  return clean;
}

function processSpeechQueue() {
  if (voiceMuted) return;
  if (!('speechSynthesis' in window)) return;
  if (isSpeaking) return;
  if (speechQueue.length === 0) return;

  const item = speechQueue.shift();
  if (!item || !item.speechText) {
    processSpeechQueue();
    return;
  }

  isSpeaking = true;
  currentSpeakingKey = item.elId;

  // Clear any existing highlight and light up the new line like an illuminated lamp
  clearSpeakingHighlight();
  const el = document.getElementById(item.elId);
  if (el) {
    // Only the lamp lights up: scrolling the page to the spoken line used to
    // drag the reader back up the dashboard every few seconds while a bot was
    // talking, so a reader who scrolled down could not stay there.
    el.classList.add('voice-light-pulse');
  }

  try {
    const utterance = new SpeechSynthesisUtterance(item.speechText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Pick best available voice
    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length) {
      if (LANG === 'bn') {
        const bnVoice = voices.find(v => v.lang && v.lang.startsWith('bn'));
        if (bnVoice) utterance.voice = bnVoice;
      }
      if (!utterance.voice) {
        const enVoice = voices.find(v => /natural|google|zira|david/i.test(v.name) && v.lang.startsWith('en'))
                     || voices.find(v => v.lang && v.lang.startsWith('en'));
        if (enVoice) utterance.voice = enVoice;
      }
    }

    const onFinish = () => {
      if (el) el.classList.remove('voice-light-pulse');
      currentSpeakingKey = null;
      isSpeaking = false;
      // Slight pause between events so speech is crisp, natural, and never overlaps
      setTimeout(() => {
        processSpeechQueue();
      }, 350);
    };

    utterance.onend = onFinish;
    utterance.onerror = (err) => {
      console.warn('SpeechSynthesis error:', err);
      onFinish();
    };

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.error('Speech synthesis failure:', err);
    if (el) el.classList.remove('voice-light-pulse');
    currentSpeakingKey = null;
    isSpeaking = false;
    setTimeout(() => { processSpeechQueue(); }, 350);
  }
}

/* ------------------------------------------------------------------- feed */
function renderFeed(d) {
  const evs = d.events || [];
  const feedEl = $('feed');
  const badgeEl = $('feed-badge');
  const tabBadgeEl = $('tab-badge-feed');
  const railFeedEl = $('rail-feed-count');

  if (!evs.length) {
    if (feedEl) feedEl.innerHTML = '<li class="k-info"><span class="t">--:--</span><span>waiting for activity…</span></li>';
    if (badgeEl) badgeEl.textContent = '0';
    if (tabBadgeEl) tabBadgeEl.textContent = '0';
    if (railFeedEl) railFeedEl.textContent = '0';
    return;
  }

  // 1. Initial load snapshot handling:
  // "2. Update na asha porjonto kisu bolbe na." -> On first load, record existing events so they are not spoken.
  if (!feedInitialized) {
    evs.forEach((e) => {
      const key = `${e.ts}_${e.kind || ''}_${e.message || ''}`;
      seenEventKeys.add(key);
    });
    if (seenEventKeys.size > 1500) seenEventKeys = new Set(Array.from(seenEventKeys).slice(-800));
    feedInitialized = true;
  } else {
    // 2. Identify newly arrived events and queue for speech sequentially:
    const newItems = [];
    evs.forEach((e) => {
      const key = `${e.ts}_${e.kind || ''}_${e.message || ''}`;
      if (!seenEventKeys.has(key)) {
        seenEventKeys.add(key);
        if (seenEventKeys.size > 1500) seenEventKeys = new Set(Array.from(seenEventKeys).slice(-800));
        const speechText = formatEventForSpeech(e);
        if (speechText) {
          const elId = `feed-evt-${e.ts}-${Math.abs(hashStr(key))}`;
          newItems.push({
            key,
            ts: e.ts || 0,
            kind: e.kind,
            rawText: e.message,
            speechText: speechText,
            elId: elId
          });
        }
      }
    });

    if (newItems.length > 0 && !voiceMuted) {
      // Sort oldest to newest so they speak in chronological sequence
      newItems.sort((a, b) => (a.ts || 0) - (b.ts || 0));
      newItems.forEach((it) => speechQueue.push(it));
      processSpeechQueue();
    }
  }

  const cntStr = String(evs.length);
  setCell(badgeEl, cntStr);
  setCell(tabBadgeEl, cntStr);
  setCell(railFeedEl, cntStr);

  // Re-render feed list only when visible items or active speaker changes
  if (feedEl) {
    const top40 = evs.slice(0, 40);
    const feedSig = `${currentSpeakingKey || ''}|${top40.map(e => `${e.ts}_${e.kind}_${e.message}`).join('|')}`;
    if (feedEl.dataset.sig !== feedSig) {
      feedEl.dataset.sig = feedSig;
      feedEl.innerHTML = top40.map((e) => {
        let kind = String(e.kind || 'info');
        if (kind === 'trade') kind = /closed/i.test(e.message) ? (/->\s*-/.test(e.message) ? 'trade loss' : 'trade') : 'trade';
        const cls = 'k-' + kind.toLowerCase().replace(/[^a-z-]/g, '');
        const txt = esc(String(e.message || ''));
        const colored = txt.replace(/-&gt;\s*([+-]?[\d.]+)/, (m, v) => `-&gt; <span class="${Number(v) > 0 ? 'value-win' : 'value-loss'}">${v}</span>`);

        const key = `${e.ts}_${e.kind || ''}_${e.message || ''}`;
        const elId = `feed-evt-${e.ts}-${Math.abs(hashStr(key))}`;
        const isLit = (currentSpeakingKey === elId);

        return `<li id="${elId}" class="${cls} ${isLit ? 'voice-light-pulse' : ''}"><span class="t">${esc(e.server_time || '')}</span><span>${colored}</span></li>`;
      }).join('');
    }
  }
}

/* ----------------------------------------------------------------- footer */
function renderFooter(d) {
  const src = { public: 'source: public market APIs', none: 'source: waiting for API data' }[d.source] || 'source: idle';
  setCell($('foot-source'), src);
  setCell($('foot-latency'), `engine ${d.engine_latency_ms ?? '—'} ms`);
  setCell($('foot-version'), `${CFG.app || 'SoftradeX'} v${CFG.version || '1.0.0'}`);
  const now = new Date();
  setCell($('server-clock'), d.server_time ? d.server_time.split(' ')[1] : '--:--:--');
  setCell($('last-update'), `updated ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} (local)`);
}

/* ---------------------------------------------------------------- toasts */
function toast(kind, message) {
  const box = $('toasts');
  const div = document.createElement('div');
  let cls = 'ok';
  if (kind === 'error' || /failed/i.test(message)) cls = 'err';
  else if (kind === 'warn') cls = 'ok';
  else if (/closed/i.test(message)) cls = /-\d/.test(message.replace('->', '')) ? 'loss' : 'win';
  div.className = 'toast ' + cls;
  div.innerHTML = `<div class="tt">${esc(kind === 'error' ? 'Error' : 'Update')}</div><div class="tm">${esc(message)}</div>`;
  box.appendChild(div);
  setTimeout(() => { div.style.opacity = '0'; div.style.transform = 'translateY(6px)'; div.style.transition = 'all .3s'; }, 5200);
  setTimeout(() => div.remove(), 5600);
  while (box.children.length > 5) box.firstChild.remove();
}

function detectNewClosed(prev, d) {
  const top = (d.history || [])[0];
  if (!top) return;
  const id = String(top.position_id);
  if (lastClosedId === null) { lastClosedId = id; return; }
  if (id !== lastClosedId) {
    lastClosedId = id;
    const net = Number(top.net_profit || 0);
    toast('trade', `Closed ${top.symbol} ${top.side} ${top.volume} -> ${net > 0 ? '+' : ''}${nf(net)}`);
  }
}

/* --------------------------------------------------------------- handlers */
function showConnectError(err) {
  const box = $('connect-error');
  if (!err) { box.classList.add('hidden'); return; }
  const code = err.code ? ` <span class="muted">(#${err.code})</span>` : '';
  box.innerHTML = `<b>${esc(err.message || 'Connection failed')}</b>${code}${err.hint ? `<br><span class="muted">${esc(err.hint)}</span>` : ''}`;
  box.classList.remove('hidden');
}

function bindUI() {
  function closeDashboardPassword(accepted) {
    const modal = $('dashboard-password-modal');
    if (modal) modal.classList.add('hidden');
    const input = $('dashboard-password-input');
    if (input) input.value = '';
    const resolve = dashboardPasswordResolve;
    dashboardPasswordResolve = null;
    if (resolve) resolve(accepted);
  }
  function askDashboardPassword() {
    if (dashboardPasswordResolve) return Promise.resolve(false);
    const modal = $('dashboard-password-modal');
    const input = $('dashboard-password-input');
    const error = $('dashboard-password-error');
    if (!modal || !input) return Promise.resolve(false);
    modal.classList.remove('hidden');
    if (error) error.textContent = '';
    setTimeout(() => input.focus(), 30);
    return new Promise((resolve) => { dashboardPasswordResolve = resolve; });
  }
  window.requestDashboardLogin = askDashboardPassword;
  function unlockDashboardPreview() {
    if (!CFG.auth_required || CFG.authed || dashboardPreviewUnlocked) return true;
    return askDashboardPassword().then((entered) => {
      if (!entered) return false;
      dashboardPreviewUnlocked = true;
      showConnectError(null);
      return true;
    });
  }
  const passwordForm = $('dashboard-password-form');
  if (passwordForm) {
    passwordForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = $('dashboard-password-input');
      const error = $('dashboard-password-error');
      try {
        const response = await fetch('/api/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({password: input ? input.value : ''}) });
        const result = await response.json();
        if (!response.ok || !result || result.ok !== true || result.authed !== true) throw new Error(result && result.error || 'Incorrect password or login temporarily blocked');
        CFG.authed = true;
        stopHttpPoll();
        setPrivateStateReady(true);
        connectWS();
        if (!httpPollTimer) void loadInitial();
        closeDashboardPassword(true);
      } catch (e) {
        if (error) error.textContent = String(e.message || e);
        if (input) { input.select(); input.focus(); }
      }
    });
  }
  const passwordCancel = $('dashboard-password-cancel');
  const passwordCancelText = $('dashboard-password-cancel-text');
  if (passwordCancel) passwordCancel.addEventListener('click', () => closeDashboardPassword(false));
  if (passwordCancelText) passwordCancelText.addEventListener('click', () => closeDashboardPassword(false));
  const passwordModal = $('dashboard-password-modal');
  if (passwordModal) passwordModal.addEventListener('click', (event) => {
    if (event.target === passwordModal) closeDashboardPassword(false);
  });
  $('view-dashboard-btn').addEventListener('click', async () => {
    if (!(await unlockDashboardPreview())) return;
    dashboardPreview = true;
    connectViewPinned = false;
    $('connect-view').classList.add('hidden');
    $('dash').classList.remove('hidden');
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      if (window.SoftradeXTerminal && window.SoftradeXTerminal.refresh) {
        window.SoftradeXTerminal.refresh();
      }
    }, 60);
    toast('ok', LANG === 'bn' ? 'SoftradeX ড্যাশবোর্ড ও চার্ট দেখানো হচ্ছে' : 'SoftradeX dashboard & chart opened');
  });
  const connWidget = $('conn-widget');
  if (connWidget) {
    connWidget.title = 'Public API market data · click to refresh';
    connWidget.style.cursor = 'pointer';
    connWidget.addEventListener('click', () => { void loadInitial(); void fetchMarketWatch(true); });
  }
  bindBotUI();
  bindBot2UI();
  bindBot3UI();
  bindBot4UI();
  bindBot5UI();
  bindBot6UI();
  bindBot7UI();
  const watchRefreshBtn = $('watch-refresh-btn');
  if (watchRefreshBtn) {
    // manual only - the dials themselves run off the live WebSocket stream
    watchRefreshBtn.addEventListener('click', () => {
      void fetchMarketWatch(true);
      toast('ok', LANG === 'bn' ? 'মার্কেট ওয়াচ প্রেশার রিফ্রেশ হয়েছে' : 'Market Watch Pressure refreshed');
    });
  }
  const THEME_STORAGE_KEY = 'softradex.theme';
  function syncThemeButton() {
    const dark = isDarkTheme();
    document.body.classList.toggle('sx-dark', dark);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', dark ? '#070b14' : '#f4f7fd');
    const btn = $('theme-toggle-btn');
    if (btn) {
      btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
      btn.title = dark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
      btn.setAttribute('aria-label', dark ? 'Switch to Light Mode' : 'Switch to Dark Mode');
      const lbl = btn.querySelector('.theme-toggle-label');
      if (lbl) lbl.textContent = dark ? 'Light' : 'Dark';
    }
  }
  function applyTheme(dark, persist) {
    document.documentElement.classList.toggle('sx-dark', !!dark);
    document.body.classList.toggle('sx-dark', !!dark);
    if (persist) {
      try { localStorage.setItem(THEME_STORAGE_KEY, dark ? 'dark' : 'light'); } catch (e) {}
    }
    syncThemeButton();
    window.dispatchEvent(new CustomEvent('softradex:theme', { detail: { theme: dark ? 'dark' : 'light' } }));
  }
  syncThemeButton();
  const themeToggleBtn = $('theme-toggle-btn');
  if (themeToggleBtn && !themeToggleBtn.dataset.bound) {
    themeToggleBtn.dataset.bound = '1';
    themeToggleBtn.addEventListener('click', () => {
      applyTheme(!isDarkTheme(), true);
    });
  }
  window.addEventListener('storage', (e) => {
    if (e && e.key === THEME_STORAGE_KEY) applyTheme(e.newValue === 'dark', false);
  });

  const topbarMuteBtn = $('topbar-mute-btn');
  if (topbarMuteBtn) {
    topbarMuteBtn.addEventListener('click', () => {
      setVoiceMute(!voiceMuted, true);
    });
  }
  const feedVoiceMuteBtn = $('voice-mute-btn');
  if (feedVoiceMuteBtn) {
    feedVoiceMuteBtn.addEventListener('click', () => {
      setVoiceMute(!voiceMuted, true);
    });
  }
  const primeSpeech = () => {
    if ('speechSynthesis' in window && !window.__speechPrimed) {
      window.__speechPrimed = true;
      try {
        const u = new SpeechSynthesisUtterance('');
        window.speechSynthesis.speak(u);
      } catch (e) {}
    }
  };
  window.addEventListener('click', primeSpeech, { once: true });
  window.addEventListener('touchstart', primeSpeech, { once: true });
  document.querySelectorAll('#period-seg .seg-btn').forEach((b) => b.addEventListener('click', () => { period = b.dataset.period; renderStatLabels(); if (S) { renderStats(S); } }));
  $('refresh-btn').addEventListener('click', () => { if (wsAlive) ws.send(JSON.stringify({ type: 'refresh' })); else loadInitial(); });
  $('hist-period').addEventListener('change', (e) => { histPeriod = e.target.value; histSig = ''; extraRows = []; if (S) renderHistory(S); void loadMore(true); });
  // sortable history table headers (th-close + every other column)
  const headRow = $('history-head-row');
  if (headRow && !headRow.dataset.bound) {
    headRow.dataset.bound = '1';
    headRow.addEventListener('click', (e) => {
      const th = e.target && e.target.closest ? e.target.closest('th[data-key]') : null;
      if (!th) return;
      playTactileClick('click');
      const key = th.dataset.key;
      if (histSortKey === key) {
        histSortDir = histSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        histSortKey = key;
        // numbers & time read best biggest/newest first, text reads best A→Z
        histSortDir = (['symbol', 'side', 'comment'].includes(key)) ? 'asc' : 'desc';
      }
      histSig = '';
      if (S) renderHistory(S);
    });
  }
  $('hist-result').addEventListener('change', (e) => { histResult = e.target.value; histSig = ''; if (S) renderHistory(S); });
  $('hist-symbol').addEventListener('input', (e) => { histSymbol = e.target.value.trim(); histSig = ''; if (S) renderHistory(S); });
  $('hist-search').addEventListener('input', (e) => { histSearch = e.target.value.trim(); histSig = ''; if (S) renderHistory(S); });
  $('hist-csv').addEventListener('click', () => {
    const q = histPeriod === 'all' ? 3650 : (histPeriod === 'today' ? 1 : histPeriod);
    window.open(`/api/export.csv?days=${q}${histSymbol ? '&symbol=' + encodeURIComponent(histSymbol) : ''}`, '_blank');
  });
  $('hist-more').addEventListener('click', () => loadMore(false));
  // settings
  const modal = $('settings-modal');
  $('settings-btn').addEventListener('click', () => {
    $('set-poll').value = CFG.poll_interval_ms || 400;
    $('set-hist').value = 2000;
    $('set-days').value = CFG.history_days || 60;
    modal.classList.remove('hidden');
  });
  $('set-close').addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
  $('set-save').addEventListener('click', async () => {
    const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ poll_interval_ms: Number($('set-poll').value), history_interval_ms: Number($('set-hist').value), history_days: Number($('set-days').value) }) });
    modal.classList.add('hidden');
    toast(res && res.ok ? 'ok' : 'error', res && res.ok ? 'Settings saved' : 'Settings could not be saved');
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') modal.classList.add('hidden'); });
}

let CFG = {};

// Auxiliary calendar readers wait for configuration/login and discard responses
// from an earlier session. This is available to scripts loaded before app.js.
function setPrivateStateReady(ready) {
  const access = window.SoftradeXStateAccess ||
    (window.SoftradeXStateAccess = {ready: false, revision: 0});
  const next = !!ready;
  if (access.ready === next) return;
  access.ready = next;
  access.revision++;
  window.dispatchEvent(new CustomEvent('softradex:state-access', {detail: {ready: next}}));
}

async function loadMore(reset) {
  if (reset) extraRows = [];
  const btn = $('hist-more');
  btn.disabled = true;
  try {
    const days = histPeriod === 'today' ? 1 : (histPeriod === 'all' ? 3650 : Number(histPeriod));
    const offset = extraRows.length;
    const url = `/api/history?days=${days}&limit=500&offset=${offset}` + (histSymbol ? `&symbol=${encodeURIComponent(histSymbol)}` : '');
    const r = await fetch(url);
    const j = await r.json();
    if (j.trades && j.trades.length) {
      extraRows = extraRows.concat(j.trades);
      histSig = '';
      if (S) renderHistory(S);
    }
    btn.classList.toggle('hidden', !(j.count === 500));
  } catch (e) {} finally { btn.disabled = false; }
}

async function loadInitial() {
  if (CFG.auth_required && !CFG.authed) return;
  const generation = httpPollGeneration;
  try {
    const r = await fetch('/api/state');
    if (generation !== httpPollGeneration) return;
    if (r.status === 401 || r.status === 403) { pausePrivateState(); return; }
    if (!r.ok) return;
    const j = await r.json();
    if (j && Object.keys(j).length) applyState(j);
  } catch (e) {}
}

/* Order execution is unavailable in this public market dashboard. */
const BOT_START_BUTTONS = ['bot-start', 'bot2-start', 'bot3-start', 'bot4-start',
  'bot5-start', 'bot6-start', 'bot7-start'];
function syncBotStartButtons(connected) {
  const ready = botsEnabled && (connected !== undefined ? connected : wasConnected);
  BOT_START_BUTTONS.forEach((id) => {
    const btn = $(id);
    if (!btn) return;
    btn.disabled = !ready;
    btn.title = ready ? '' : 'Order execution is unavailable in this public API dashboard';
  });
}

async function loadConfig(silent) {
  let fresh;
  try {
    const r = await fetch('/api/config');
    if (!r.ok) throw new Error('Configuration HTTP ' + r.status);
    fresh = await r.json();
    if (!fresh || typeof fresh !== 'object' || Array.isArray(fresh)) throw new Error('Invalid configuration response');
  } catch (e) { if (!silent) { CFG = {}; setPrivateStateReady(false); } return; }
  CFG = fresh;
  botsEnabled = false;
  syncBotStartButtons();
  $('foot-version').textContent = `${CFG.app} v${CFG.version}`;
  setPrivateStateReady(!CFG.auth_required || !!CFG.authed);

}

/* ------------------------------------------------------------------- market watch dials
   LIVE STREAM MODE - no timer, no countdown:
   every WebSocket state snapshot carries `market_watch` (recomputed on each engine
   tick), so applyState() patches the machine cards in place: needle sweep, price,
   pressure, VU meter and the per-dial measurement clock all move with the live feed.
   fetchMarketWatch() is only a one-shot seed at boot plus the manual refresh button;
   it is never scheduled. */

async function fetchMarketWatch(force = false) {
  try {
    const url = '/api/market-watch' + (force ? '?force=true' : '');
    const r = await fetch(url);
    if (!r.ok) return;
    const data = await r.json();
    if (!data || !Array.isArray(data.watches)) return;
    marketWatches = data.watches;
    applyMarketWatchState();
    updateMarketTickerTape(marketWatches);
  } catch (e) {
    // silent fail - the live WebSocket stream keeps the dials updated
  }
}

/* Live measurement clock for a dial: local time of the last reading, to 0.01 s.
   The engine streams ticks about 20x per second, so the hundredths really move. */
function watchClockText(tsSec) {
  const d = new Date(Number(tsSec) * 1000);
  if (!Number.isFinite(d.getTime())) return '--:--:--.--';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(Math.floor(d.getMilliseconds() / 10))}`;
}

function watchDominantClass(dominant) {
  return dominant === 'BUYER' ? 'buyer' : (dominant === 'SELLER' ? 'seller' : 'neutral');
}

function watchAnnunciatorText(dominant, buyerPct, sellerPct) {
  if (dominant === 'BUYER') return LANG === 'bn' ? `বায়ার চাপ ${buyerPct}%` : `BUYER ${buyerPct}%`;
  if (dominant === 'SELLER') return LANG === 'bn' ? `সেলার চাপ ${sellerPct}%` : `SELLER ${sellerPct}%`;
  return LANG === 'bn' ? 'নিরপেক্ষ ৫০%' : 'NEUTRAL 50%';
}

function watchFlowMeta(flowRaw) {
  const flow = String(flowRaw || 'SIDEWAYS').toLowerCase();
  const arrow = flow === 'bullish' ? '▲' : (flow === 'bearish' ? '▼' : '►');
  return { flow, arrow };
}

/* Panel header badge - shows the clock of the freshest pushed reading. */
function updateWatchStreamBadge() {
  const badge = $('watch-timer-badge');
  const txt = $('watch-timer-text');
  if (!badge || !txt || !marketWatches.length) return;
  const anyLive = marketWatches.some((w) => w && w.live !== false);
  // offline + public prices = real Yahoo / Binance quotes, not the simulator
  const anyPublic = marketWatches.some((w) => w && w.live === false && w.price_source === 'public');
  const newest = marketWatches.reduce((m, w) => Math.max(m, Number(w.updated_at) || 0), 0);
  badge.classList.add('live');
  badge.classList.toggle('sim', !anyLive && !anyPublic);
  txt.textContent = `${anyLive ? 'LIVE' : (anyPublic ? 'PUBLIC' : 'SIM')} · ${watchClockText(newest)}`;
}

/* Light live frame pushed on every engine tick: dials, ticker and lightweight price displays only. */
function applyMarketWatchFrame(frame) {
  if (!frame || !Array.isArray(frame.watches) || !frame.watches.length) return;
  marketWatches = frame.watches;
  const grid = $('market-watch-grid');
  if (grid && (!grid.querySelector('.watch-card') && !grid.querySelector('.watch-dial-empty'))) {
    renderMarketWatches();
  }
  updateMarketWatchDials();
  updateWatchSummaryPill();
  updateWatchStreamBadge();
  updatePriceCurves();
  updateMarketTickerTape(marketWatches);
  updateFlowStageLivePrices();
}

// The quote stream pushes a frame every 30ms (24+/sec). Patching the dials,
// the ticker and the curve recorder on all of them made this the most
// expensive path on the page. Coalesce: keep only the newest frame and
// process at most one every 100ms - the needle still sweeps smoothly via its
// CSS transition, and recordPriceTick throttles itself to 350ms anyway.
let _watchFramePending = null;
let _watchFrameLast = 0;
let _watchFrameTimer = null;
function queueWatchFrame(frame) {
  if (!frame || !Array.isArray(frame.watches) || !frame.watches.length) return;
  _watchFramePending = frame;
  const elapsed = Date.now() - _watchFrameLast;
  if (elapsed >= 100) {
    _watchFrameLast = Date.now();
    const f = _watchFramePending;
    _watchFramePending = null;
    applyMarketWatchFrame(f);
    return;
  }
  if (_watchFrameTimer) return;
  _watchFrameTimer = setTimeout(() => {
    _watchFrameTimer = null;
    _watchFrameLast = Date.now();
    const f = _watchFramePending;
    _watchFramePending = null;
    if (f) applyMarketWatchFrame(f);
  }, 100 - elapsed);
}

/* Structure changed (boot / different symbol set) -> full machine rebuild. */
function applyMarketWatchState() {
  const grid = $('market-watch-grid');
  if (!grid || !marketWatches.length) return;
  const sig = marketWatches.map((w) => String(w.symbol || '')).join(',') + '#' + flowSymbol();
  if (grid.dataset.sig !== sig || (!grid.querySelector('.watch-card') && !grid.querySelector('.watch-dial-empty'))) {
    grid.dataset.sig = sig;
    renderMarketWatches();
  }
  updateMarketWatchDials();
  updateWatchSummaryPill();
  updateWatchStreamBadge();
  updatePriceCurves();
  updateMarketTickerTape(marketWatches);
  updateAllMarketChips();
  // 01 MARKET hero (price / bid / ask / spread / wires) must react on every live
  // frame, not just the slow poll - otherwise the selected market's price crawls.
  try { renderFlowStage(S || {}); } catch (e) {}
}

/* In-place live patch - keeps the CSS transitions (needle sweep, VU fade) intact. */
function updateMarketWatchDials() {
  const grid = $('market-watch-grid');
  if (!grid) return;
  const activeSym = flowSymbol().toUpperCase();
  const bySym = new Map(marketWatches.map((w) => [String(w.symbol || '').toUpperCase(), w]));
  // one formatted clock per distinct reading - a frame carries the same stamp for every dial
  const clockCache = new Map();
  const clockFor = (ts) => {
    const key = Math.floor((Number(ts) || 0) * 100);
    let text = clockCache.get(key);
    if (text === undefined) { text = watchClockText(ts); clockCache.set(key, text); }
    return text;
  };
  const setTxt = (el, val) => { const s = String(val); if (el && el.textContent !== s) el.textContent = s; };
  const setCls = (el, cls) => { if (el && el.className !== cls) el.className = cls; };

  grid.querySelectorAll('.watch-card').forEach((card) => {
    const w = bySym.get(String(card.dataset.sym || '').toUpperCase());
    if (!w) return;

    let refs = card._mwRefs;
    if (!refs) {
      refs = card._mwRefs = {
        wrap: card.querySelector('.watch-hand-wrap'),
        lance: card.querySelector('.watch-hand-lance'),
        symEl: card.querySelector('.watch-market-symbol'),
        priceEl: card.querySelector('.watch-price-display'),
        ann: card.querySelector('.watch-annunciator'),
        annTxt: card.querySelector('.annunciator-text'),
        buyLabel: card.querySelector('.pressure-label.buyer b'),
        sellLabel: card.querySelector('.pressure-label.seller b'),
        rack: card.querySelector('.vu-meter-rack'),
        vuBuy: card.querySelector('.vu-meter-rack .vu-buy'),
        vuSell: card.querySelector('.vu-meter-rack .vu-sell'),
        bigRack: card.querySelector('.watch-pressure-bigrack'),
        bBig: card.querySelector('.wpb-buyer .wpb-val'),
        sBig: card.querySelector('.wpb-seller .wpb-val'),
        flowEl: card.querySelector('.spec-flow'),
        dirEl: card.querySelector('.spec-direction'),
        spreadEl: card.querySelector('.spec-spread'),
        bidEl: card.querySelector('.spec-bid'),
        clockEl: card.querySelector('.machine-clock'),
        led: card.querySelector('.machine-led-pulse'),
        stateBadge: card.querySelector('.machine-engaged-badge, .machine-standby-badge, .machine-off-badge'),
        targetBtn: card.querySelector('.spec-target'),
      };
    }

    const buyerPct = Number(w.buyer_pct || 50);
    const sellerPct = Number(w.seller_pct || 50);
    const needleDeg = Number(w.needle_deg || 0);
    const dominant = String(w.dominant || 'NEUTRAL').toUpperCase();
    const domCls = watchDominantClass(dominant);
    const digits = Number(w.digits || 2);
    const { flow, arrow } = watchFlowMeta(w.candle_flow);
    const isLive = w.live !== false;
    const isActive = !!activeSym && String(w.symbol || '').toUpperCase() === activeSym;
    const isOpen = w.market_open !== false;
    const pressureKey = `${dominant}|${buyerPct}|${sellerPct}|${flow}|${isOpen ? 1 : 0}`;
    const pressureChanged = !card._mwState || card._mwState.pressureKey !== pressureKey;

    const rot = `rotate(${needleDeg}deg)`;
    if (refs.wrap && refs.wrap.style.transform !== rot) refs.wrap.style.transform = rot;
    setCls(refs.lance, `watch-hand-lance ${domCls}`);

    setTxt(refs.symEl, w.displayName || w.symbol || '');
    setTxt(refs.priceEl, w.ask ? nf(w.ask, digits) : '—');
    if (pressureChanged) {
      setCls(refs.ann, `watch-annunciator ${!isOpen ? 'off' : domCls}`);
      setTxt(refs.annTxt, !isOpen ? 'MARKET OFF' : watchAnnunciatorText(dominant, buyerPct, sellerPct));

      setTxt(refs.buyLabel, `${buyerPct}%`);
      setTxt(refs.sellLabel, `${sellerPct}%`);
      if (refs.rack) {
        const rackTitle = `Buyer: ${buyerPct}% · Seller: ${sellerPct}%`;
        if (refs.rack.title !== rackTitle) refs.rack.title = rackTitle;
        patchVuSegments(refs.vuBuy, buyerPct, 'buy');
        patchVuSegments(refs.vuSell, sellerPct, 'sell');
      }
      if (refs.bigRack) {
        const bigTitle = `Buyer: ${buyerPct}% · Seller: ${sellerPct}%`;
        if (refs.bigRack.title !== bigTitle) refs.bigRack.title = bigTitle;
        setTxt(refs.bBig, `${buyerPct}%`);
        setTxt(refs.sBig, `${sellerPct}%`);
        refs.bigRack.classList.toggle('buyer-lead', dominant === 'BUYER');
        refs.bigRack.classList.toggle('seller-lead', dominant === 'SELLER');
      }
      if (refs.flowEl) {
        setCls(refs.flowEl, `spec-v flow-val spec-flow ${flow}`);
        setTxt(refs.flowEl, `${arrow} ${flow.toUpperCase()}`);
      }
      if (refs.dirEl) {
        const dir = String(w.direction || 'FLAT').toUpperCase();
        const chg = Number(w.change_pct || 0);
        setCls(refs.dirEl, `spec-v spec-direction ${dir.toLowerCase()}`);
        setTxt(refs.dirEl, `${dir === 'UP' ? '▲' : dir === 'DOWN' ? '▼' : '►'} ${dir}${chg ? ` ${chg > 0 ? '+' : ''}${chg.toFixed(2)}%` : ''}`);
      }
      card._mwState = { pressureKey };
    }

    if (refs.spreadEl && w.spread != null) setTxt(refs.spreadEl, w.spread);
    if (refs.bidEl && w.bid != null) setTxt(refs.bidEl, nf(w.bid, digits));

    if (refs.clockEl) {
      setTxt(refs.clockEl, clockFor(w.updated_at));
      const cTitle = isLive ? 'Last live reading'
        : (w.price_source === 'public' ? 'Public API price - Yahoo / Binance' : 'Simulated data - MT5 not connected');
      if (refs.clockEl.title !== cTitle) refs.clockEl.title = cTitle;
      refs.clockEl.classList.toggle('sim', !isLive);
    }

    setCls(refs.led, `machine-led-pulse ${!isOpen ? 'off' : domCls}`);
    card.classList.toggle('active-target', isActive);
    card.classList.toggle('market-off', !isOpen);

    if (refs.stateBadge) {
      if (!isOpen) {
        setCls(refs.stateBadge, `machine-off-badge${isActive ? ' active-off' : ''}`);
        setTxt(refs.stateBadge, 'MARKET OFF');
      } else {
        const want = isActive ? 'machine-engaged-badge' : 'machine-standby-badge';
        if (refs.stateBadge.className !== want) {
          refs.stateBadge.className = want;
          refs.stateBadge.textContent = isActive ? 'ENGAGED' : 'STANDBY';
        }
      }
    }
    if (refs.targetBtn) {
      if (!isOpen) {
        setCls(refs.targetBtn, 'spec-v target-btn spec-target disabled');
        setTxt(refs.targetBtn, 'OFF');
        const offTitle = LANG === 'bn' ? 'মার্কেট বন্ধ' : 'Market closed';
        if (refs.targetBtn.title !== offTitle) refs.targetBtn.title = offTitle;
      } else {
        setCls(refs.targetBtn, `spec-v target-btn spec-target${isActive ? ' active' : ''}`);
        setTxt(refs.targetBtn, isActive ? 'ACTIVE' : 'SELECT');
        if (refs.targetBtn.hasAttribute('title')) refs.targetBtn.removeAttribute('title');
      }
    }
  });
}

function patchVuSegments(bar, pct, type) {
  if (!bar) return;
  const segs = bar.querySelectorAll('.vu-seg');
  if (!segs.length) return;
  const active = Math.min(8, Math.max(1, Math.round((Number(pct || 50) / 100) * 8)));
  segs.forEach((seg, i) => {
    seg.classList.toggle('active', type === 'buy' ? i >= 8 - active : i < active);
  });
}

/* Overall buyer/seller pressure summary pill (live). */
function updateWatchSummaryPill() {
  const sumPill = $('watch-summary-pill');
  if (!sumPill || !marketWatches.length) return;
  // the single dial reads its own market, not the average of every market
  const own = findWatchForSymbol(flowSymbol());
  const rows = own ? [own] : marketWatches;
  let totalBuy = 0, totalSell = 0;
  rows.forEach((w) => {
    totalBuy += Number(w.buyer_pct || 50);
    totalSell += Number(w.seller_pct || 50);
  });
  const avgBuy = Math.round(totalBuy / rows.length);
  const avgSell = Math.round(totalSell / rows.length);
  const stateKey = avgBuy >= avgSell + 5 ? `B:${avgBuy}` : avgSell >= avgBuy + 5 ? `S:${avgSell}` : 'N:50';
  if (sumPill._lastStateKey === stateKey) return;
  sumPill._lastStateKey = stateKey;
  if (avgBuy >= avgSell + 5) {
    sumPill.textContent = `BUYER DOMINANT (${avgBuy}%)`;
    sumPill.style.background = 'rgba(34, 197, 94, 0.2)';
    sumPill.style.color = '#4ade80';
    sumPill.style.borderColor = '#22c55e';
  } else if (avgSell >= avgBuy + 5) {
    sumPill.textContent = `SELLER DOMINANT (${avgSell}%)`;
    sumPill.style.background = 'rgba(239, 68, 68, 0.2)';
    sumPill.style.color = '#f87171';
    sumPill.style.borderColor = '#ef4444';
  } else {
    sumPill.textContent = 'BALANCED (50/50)';
    sumPill.style.background = 'rgba(148, 163, 184, 0.15)';
    sumPill.style.color = '#cbd5e1';
    sumPill.style.borderColor = 'rgba(148, 163, 184, 0.3)';
  }
}

/* ================= MARKET PRICE CURVES ENGINE ================= */
/*
   Selected Market Live Price Curve for Bot 1, Bot 2, Bot 3, Bot 4, Bot 5.
   Rolling price history per symbol (max 300 points), rendered as smooth
   canvas line charts with glowing gradient fill beside each bot's market chips.
*/
const MAX_CURVE_POINTS = 300;
const _priceHistory = {};   // symbol -> [{t, bid, ask}]
let _curvesLastRenderTs = 0;

const _botSelectedSymbols = {
  bot1: 'XAUUSDm',
  bot2: 'BTCUSDTm',
  bot3: 'XAUUSDm',
  bot4: 'XAUUSDm',
  bot5: 'XAUUSDm',
};

function getHistoryKey(sym) {
  // Exness copies carry a broker suffix ("XAUUSDm") while the market-watch
  // feed publishes the clean pair ("XAUUSD"). Both must share ONE rolling
  // history, otherwise the selected market's curve never receives a live
  // tick and keeps drawing its synthetic seed at a stale price forever.
  return String(sym || '').toUpperCase().replace(/M$/, '');
}

function getBasePriceForSym(sym) {
  const s = String(sym || '').toUpperCase();
  if (s.includes('BTC')) return 83750.00;
  if (s.includes('XAU') || s.includes('GOLD')) return 2652.40;
  if (s.includes('EURUSD')) return 1.0854;
  if (s.includes('GBPUSD')) return 1.2914;
  if (s.includes('USDJPY')) return 152.42;
  if (s.includes('OIL')) return 71.35;
  if (s.includes('TEC') || s.includes('100')) return 19885.50;
  if (s.includes('30')) return 42160.00;
  if (s.includes('ETH')) return 2648.50;
  if (s.includes('DXY')) return 104.55;
  return 100.0;
}

function findWatchForSymbol(sym) {
  if (!sym) return null;
  const sUpper = String(sym).toUpperCase();
  const marketKey = value => {
    const key = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/M$/, '');
    return ({BTCUSD:'BTCUSDT',ETHUSD:'ETHUSDT',SOLUSD:'SOLUSDT',GOLD:'XAUUSD',XAUUSD247:'XAUUSD'})[key] || key;
  };
  const sClean = marketKey(sym);
  
  if (marketWatches && marketWatches.length) {
    let w = marketWatches.find(x => String(x.symbol || '').toUpperCase() === sUpper);
    if (w) return w;
    w = marketWatches.find(x => marketKey(x.symbol) === sClean);
    if (w) return w;
  }

  if (typeof _tickerData !== 'undefined') {
    if (_tickerData.has(sUpper)) return _tickerData.get(sUpper);
    if (_tickerData.has(sClean)) return _tickerData.get(sClean);
    for (const [key, row] of _tickerData) if (marketKey(key) === sClean) return row;
  }

  return null;
}

/* Collect a new price tick from live market watches or bot state. */
function recordPriceTick(sym, bid, ask) {
  if (!sym || (!bid && !ask)) return;
  const key = getHistoryKey(sym);
  const cleanKey = key.replace(/M$/, '').replace(/\.$/, '');
  const now = Date.now();
  const b = Number(bid || ask);
  const a = Number(ask || bid);

  [key, cleanKey].forEach(k => {
    if (!_priceHistory[k]) _priceHistory[k] = [];
    const arr = _priceHistory[k];
    if (arr.length && now - arr[arr.length - 1].t < 350) return;
    // A jump this big between two consecutive ticks is never a live move: it is
    // a stale fallback price (the disconnected demo feed seeds gold at 2652)
    // or an overnight session gap. Drop the old points instead of stretching
    // the whole curve - and its HIGH/LOW stats - across both levels.
    const lastP = arr[arr.length - 1];
    if (lastP && lastP.bid > 0 && Math.abs(b - lastP.bid) > lastP.bid * 0.02) arr.length = 0;
    arr.push({ t: now, bid: b, ask: a });
    if (arr.length > MAX_CURVE_POINTS) arr.shift();
  });
}

function ensurePriceHistorySeeded(sym, currentPrice, digits) {
  if (!sym) return;
  const historyKey = getHistoryKey(sym);
  if (!_priceHistory[historyKey] || _priceHistory[historyKey].length < 2) {
    _priceHistory[historyKey] = [];
    // seed from the LIVE quote when we have one - the hardcoded fallback price
    // is only a last resort, otherwise the chart opens stretched to an old level
    const live = findWatchForSymbol(sym) || {};
    const livePrice = Number(live.bid || live.ask || 0);
    const basePrice = currentPrice > 0 ? currentPrice
      : (livePrice > 0 ? livePrice : getBasePriceForSym(sym));
    const d = digits || symbolDefaultDigits(sym);
    const now = Date.now();
    const count = 15;
    for (let i = count; i >= 0; i--) {
      const wobble = (Math.sin(i * 0.8) * 0.0008 + (Math.random() - 0.48) * 0.0006) * basePrice;
      const p = Number((basePrice + wobble).toFixed(d));
      const spread = d > 4 ? 0.00015 : 0.25;
      _priceHistory[historyKey].push({
        t: now - i * 1000,
        bid: p,
        ask: Number((p + spread).toFixed(d)),
      });
    }
  }
}

function getBotSelectedSymbol(botKey) {
  if (botKey === 'flow') {
    // the pipeline curve is the selected market's live curve
    return flowSymbol() || 'XAUUSDm';
  }
  if (botKey === 'bot1') {
    const el = $('bot-symbol-name');
    const txt = el ? el.textContent.split('·')[0].trim() : '';
    if (txt) return txt;
    return (S && S.bot && S.bot.symbol) || _botSelectedSymbols.bot1 || 'XAUUSDm';
  }
  if (botKey === 'bot2') {
    const el = $('bot2-symbol-name');
    const txt = el ? el.textContent.split('·')[0].trim() : '';
    if (txt) return txt;
    return (S && S.bot2 && S.bot2.symbol) || _botSelectedSymbols.bot2 || 'BTCUSDTm';
  }
  if (botKey === 'bot3') {
    const el = $('bot3-symbol-name');
    const txt = el ? el.textContent.split('·')[0].trim() : '';
    if (txt) return txt;
    return (S && S.bot3 && S.bot3.symbol) || _botSelectedSymbols.bot3 || 'XAUUSDm';
  }
  if (botKey === 'bot4') {
    const el = $('bot4-symbol-name');
    const txt = el ? el.textContent.split('·')[0].trim() : '';
    if (txt) return txt;
    return (S && S.bot4 && S.bot4.symbol) || _botSelectedSymbols.bot4 || 'XAUUSDm';
  }
  if (botKey === 'bot5') {
    const el = $('bot5-symbol-name');
    const txt = el ? el.textContent.split('·')[0].trim() : '';
    if (txt) return txt;
    return (S && S.bot5 && S.bot5.symbol) || _botSelectedSymbols.bot5 || 'XAUUSDm';
  }
  return 'XAUUSDm';
}

function setBotCurveSymbol(botKey, sym) {
  if (!botKey || !sym) return;
  _botSelectedSymbols[botKey] = sym;
  const box = $(`${botKey}-curve-box`);
  if (!box) return;

  const card = $(`${botKey}-curve-card`);
  if (!card || card.dataset.sym !== sym) {
    const w = findWatchForSymbol(sym) || { symbol: sym };
    const digits = Number(w.digits !== undefined ? w.digits : symbolDefaultDigits(sym));
    const priceVal = Number(w.ask || w.bid || 0);
    const priceStr = priceVal ? nf(priceVal, digits) : '—';
    const dir = String(w.direction || 'FLAT').toUpperCase();
    const dirCls = dir === 'UP' ? 'up' : dir === 'DOWN' ? 'down' : 'flat';
    const dirIcon = dir === 'UP' ? '▲' : dir === 'DOWN' ? '▼' : '►';
    const chg = Number(w.change_pct || 0);
    const chgStr = chg ? `${chg > 0 ? '+' : ''}${chg.toFixed(2)}%` : '+0.00%';
    const chgCls = chg > 0 ? 'pos' : chg < 0 ? 'neg' : 'flat';

    box.innerHTML = `
      <div class="price-curve-card bot-curve-card" data-sym="${esc(sym)}" id="${botKey}-curve-card">
        <div class="curve-card-header">
          <div class="curve-card-left">
            <span class="curve-symbol-badge" id="${botKey}-curve-badge">${esc(w.displayName || sym)}</span>
            <span class="curve-serial">LIVE CURVE</span>
          </div>
          <div class="curve-card-right">
            <span class="curve-change ${chgCls}" id="${botKey}-curve-chg">${chgStr}</span>
            <span class="curve-direction-pill ${dirCls}" id="${botKey}-curve-dir">${dirIcon} ${dir}</span>
            <span class="curve-live-price" id="${botKey}-curve-price">${priceStr}</span>
          </div>
        </div>
        <div class="curve-chart-wrap bot-curve-chart-wrap" id="${botKey}-curve-wrap">
          <canvas id="${botKey}-curve-canvas"></canvas>
        </div>
        <div class="curve-stats-bar" id="${botKey}-curve-stats">
          <span class="curve-stat"><span class="curve-stat-label">O</span> <span class="curve-stat-value" id="${botKey}-curve-open">—</span></span>
          <span class="curve-stat"><span class="curve-stat-label">H</span> <span class="curve-stat-value high" id="${botKey}-curve-high">—</span></span>
          <span class="curve-stat"><span class="curve-stat-label">L</span> <span class="curve-stat-value low" id="${botKey}-curve-low">—</span></span>
          <span class="curve-stat"><span class="curve-stat-label">C</span> <span class="curve-stat-value" id="${botKey}-curve-close">—</span></span>
          <span class="curve-stat"><span class="curve-stat-label">SPREAD</span> <span class="curve-stat-value" id="${botKey}-curve-spread">—</span></span>
          <span class="curve-stat"><span class="curve-stat-label">TICKS</span> <span class="curve-stat-value" id="${botKey}-curve-ticks">0</span></span>
        </div>
      </div>
    `;

    ensurePriceHistorySeeded(sym, priceVal, digits);
  }

  drawBotCurve(botKey, sym);
}

/* Canvas sizes are cached here. Reading clientWidth/clientHeight from inside
   the live draw path forced a full synchronous style + layout of this very
   large dashboard (~70 ms per curve, eight curves per frame) - that is what
   made the page stutter. The box is measured once when the card is built and
   afterwards only by a ResizeObserver. */
const _curveBoxes = new Map();   // botKey -> { wrap, w, h, dpr }

function curveBoxFor(botKey, wrap) {
  let box = _curveBoxes.get(botKey);
  if (box && box.wrap === wrap) return box;
  if (box && box.ro) { try { box.ro.disconnect(); } catch (e) {} }
  box = { wrap, w: 0, h: 0, dpr: window.devicePixelRatio || 1, ro: null };
  _curveBoxes.set(botKey, box);
  if (window.ResizeObserver) {
    try {
      box.ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const rect = entry.contentRect || {};
          box.w = Math.round(rect.width || 0);
          box.h = Math.round(rect.height || 0);
        }
        box.dpr = window.devicePixelRatio || 1;
        const card = $(`${botKey}-curve-card`);
        if (card && card.dataset.sym) drawBotCurve(botKey, card.dataset.sym);
      });
      box.ro.observe(wrap);
    } catch (e) { /* without ResizeObserver the one-time measure below still works */ }
  }
  return box;
}

function drawBotCurve(botKey, sym) {
  const canvas = $(`${botKey}-curve-canvas`);
  if (!canvas) return;
  // the bot cards live in the side drawer: painting them while it is shut is
  // invisible work (the browser also warns about rendering hidden subtrees)
  if (!botsDrawerOpen() && canvas.closest && canvas.closest('#bots-drawer')) return;
  const wrap = canvas.parentElement;
  if (!wrap) return;
  const box = curveBoxFor(botKey, wrap);
  if (!box.w || !box.h) {
    // first draw after the card was built - measured once, then cached
    box.w = wrap.clientWidth;
    box.h = wrap.clientHeight;
    box.dpr = window.devicePixelRatio || 1;
  }
  const W = box.w;
  const H = box.h;
  if (!W || !H) return;

  const dpr = box.dpr || 1;
  const targetW = Math.floor(W * dpr);
  const targetH = Math.floor(H * dpr);
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(dpr, dpr);

  const historyKey = getHistoryKey(sym);
  const points = _priceHistory[historyKey] || [];
  const w = findWatchForSymbol(sym) || {};
  const digits = Number(w.digits !== undefined ? w.digits : symbolDefaultDigits(sym));
  const d = digits > 4 ? 5 : digits;

  const pad = { top: 12, right: 12, bottom: 8, left: 12 };
  const cw = W - pad.left - pad.right;
  const ch = H - pad.top - pad.bottom;

  // Background
  ctx.fillStyle = isDarkTheme() ? 'rgba(11, 18, 32, 0.88)' : 'rgba(255, 255, 255, 0.75)';
  ctx.fillRect(0, 0, W, H);

  if (points.length < 2) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Syncing candle flow…', W / 2, H / 2);
    ctx.restore();
    return;
  }

  // --- Aggregate ticks into Candlesticks (OHLC) ---
  const numCandles = Math.min(22, Math.max(10, Math.floor(cw / 18)));
  const bucket = Math.max(1, Math.floor(points.length / numCandles));
  const candles = [];
  let minP = Infinity, maxP = -Infinity, maxVol = 1;

  for (let ci = 0; ci < points.length; ci += bucket) {
    const chunk = points.slice(ci, ci + bucket);
    if (!chunk.length) continue;
    const cOpen = chunk[0].bid;
    const cClose = chunk[chunk.length - 1].bid;
    let cHigh = -Infinity, cLow = Infinity;
    for (let pi = 0; pi < chunk.length; pi++) {
      const pBid = chunk[pi].bid;
      if (pBid > cHigh) cHigh = pBid;
      if (pBid < cLow) cLow = pBid;
    }
    const cVol = chunk.length;
    if (cHigh > maxP) maxP = cHigh;
    if (cLow < minP) minP = cLow;
    if (cVol > maxVol) maxVol = cVol;
    candles.push({ open: cOpen, high: cHigh, low: cLow, close: cClose, volume: cVol });
  }

  if (minP === Infinity || maxP === -Infinity || minP === maxP) {
    const fallbackP = points[points.length - 1].bid || 100;
    minP = fallbackP * 0.998;
    maxP = fallbackP * 1.002;
  }

  const range = maxP - minP || 1;
  const margin = range * 0.08;
  const plotMin = minP - margin;
  const plotMax = maxP + margin;
  const priceRange = plotMax - plotMin;

  const candleW = Math.max(4, (cw / candles.length) * 0.62);
  const getX = (i) => pad.left + (i + 0.5) * (cw / candles.length);
  const getY = (p) => pad.top + (1 - (p - plotMin) / priceRange) * ch;

  // Grid lines
  ctx.strokeStyle = isDarkTheme() ? 'rgba(148, 163, 184, 0.14)' : 'rgba(37, 99, 235, 0.10)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const gy = pad.top + (i / 3) * ch;
    ctx.beginPath();
    ctx.moveTo(pad.left, gy);
    ctx.lineTo(W - pad.right, gy);
    ctx.stroke();
  }

  // Draw Candlesticks (Wicks + Bodies)
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const cx = getX(i);
    const isBull = c.close >= c.open;
    const candleColor = isBull ? '#059669' : '#dc2626';
    const bodyTop = getY(Math.max(c.open, c.close));
    const bodyBot = getY(Math.min(c.open, c.close));
    const bodyH = Math.max(2, bodyBot - bodyTop);

    // Wick
    ctx.strokeStyle = candleColor;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx, getY(c.high));
    ctx.lineTo(cx, getY(c.low));
    ctx.stroke();

    // Body
    ctx.fillStyle = isBull ? 'rgba(5, 150, 105, 0.80)' : 'rgba(220, 38, 38, 0.80)';
    ctx.fillRect(cx - candleW / 2, bodyTop, candleW, bodyH);

    // Volume bar
    const vH = Math.min(ch * 0.22, (c.volume / maxVol) * (ch * 0.22));
    ctx.fillStyle = isBull ? 'rgba(5, 150, 105, 0.18)' : 'rgba(220, 38, 38, 0.16)';
    ctx.fillRect(cx - candleW / 2, H - pad.bottom - vH, candleW, vH);
  }

  // Draw Spline Glow Curve connecting candle closes
  if (candles.length > 1) {
    const isOverallUp = candles[candles.length - 1].close >= candles[0].open;
    const curveColor = isOverallUp ? '#2563eb' : '#d97706';

    const grad = ctx.createLinearGradient(0, pad.top, 0, H - pad.bottom);
    grad.addColorStop(0, isOverallUp ? 'rgba(37, 99, 235, 0.16)' : 'rgba(217, 119, 6, 0.14)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.beginPath();
    ctx.moveTo(getX(0), getY(candles[0].close));
    for (let i = 1; i < candles.length; i++) {
      const prevX = getX(i - 1);
      const prevY = getY(candles[i - 1].close);
      const curX = getX(i);
      const curY = getY(candles[i].close);
      const midX = (prevX + curX) / 2;
      ctx.bezierCurveTo(midX, prevY, midX, curY, curX, curY);
    }
    ctx.lineTo(getX(candles.length - 1), H - pad.bottom);
    ctx.lineTo(getX(0), H - pad.bottom);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Glowing curve line
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(candles[0].close));
    for (let i = 1; i < candles.length; i++) {
      const prevX = getX(i - 1);
      const prevY = getY(candles[i - 1].close);
      const curX = getX(i);
      const curY = getY(candles[i].close);
      const midX = (prevX + curX) / 2;
      ctx.bezierCurveTo(midX, prevY, midX, curY, curX, curY);
    }
    ctx.strokeStyle = curveColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.strokeStyle = isOverallUp ? 'rgba(37, 99, 235, 0.32)' : 'rgba(217, 119, 6, 0.30)';
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  // Live price pulse & tag
  const lastPoint = points[points.length - 1];
  const lastBid = lastPoint.bid;
  const lastX = getX(candles.length - 1);
  const lastY = getY(lastBid);

  ctx.beginPath();
  ctx.arc(lastX, lastY, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = '#2563eb';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(lastX, lastY, 7, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(37, 99, 235, 0.25)';
  ctx.fill();

  // Price dashed line
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = 'rgba(37, 99, 235, 0.32)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, lastY);
  ctx.lineTo(W - pad.right, lastY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Price tag badge
  const priceLabel = nf(lastBid, d);
  ctx.font = '8.5px "JetBrains Mono", monospace';
  const lblW = ctx.measureText(priceLabel).width + 8;
  const lblH = 13;
  const lblX = Math.max(pad.left, W - pad.right - lblW - 2);
  const lblY = Math.max(pad.top, Math.min(H - pad.bottom - lblH, lastY - lblH / 2));
  const darkBadge = isDarkTheme();
  ctx.fillStyle = darkBadge ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.94)';
  ctx.strokeStyle = darkBadge ? 'rgba(96, 165, 250, 0.55)' : 'rgba(37, 99, 235, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(lblX, lblY, lblW, lblH, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = darkBadge ? '#93c5fd' : '#2563eb';
  ctx.textAlign = 'center';
  ctx.fillText(priceLabel, lblX + lblW / 2, lblY + 9.5);

  ctx.restore();

  // Update header and stats (OHLC + Ticks)
  const lastCandle = candles[candles.length - 1] || {};
  const openEl = $(`${botKey}-curve-open`);
  const highEl = $(`${botKey}-curve-high`);
  const lowEl = $(`${botKey}-curve-low`);
  const closeEl = $(`${botKey}-curve-close`);
  const spreadEl = $(`${botKey}-curve-spread`);
  const ticksEl = $(`${botKey}-curve-ticks`);
  const priceEl = $(`${botKey}-curve-price`);

  if (priceEl) priceEl.textContent = nf(lastBid, d);
  if (openEl) openEl.textContent = lastCandle.open ? nf(lastCandle.open, d) : '—';
  if (highEl) highEl.textContent = maxP !== -Infinity ? nf(maxP, d) : '—';
  if (lowEl) lowEl.textContent = minP !== Infinity ? nf(minP, d) : '—';
  if (closeEl) closeEl.textContent = lastCandle.close ? nf(lastCandle.close, d) : '—';
  if (spreadEl && lastPoint && lastPoint.ask) {
    spreadEl.textContent = nf(Math.abs(lastPoint.ask - lastPoint.bid), d);
  }
  if (ticksEl) ticksEl.textContent = String(points.length);

  const firstBid = points[0].bid;
  const isUp = lastBid >= firstBid;
  const dirPill = $(`${botKey}-curve-dir`);
  if (dirPill) {
    dirPill.className = `curve-direction-pill ${isUp ? 'up' : 'down'}`;
    dirPill.textContent = `${isUp ? '▲' : '▼'} ${isUp ? 'UP' : 'DOWN'}`;
  }

  const chgEl = $(`${botKey}-curve-chg`);
  if (chgEl) {
    const chg = firstBid > 0 ? ((lastBid - firstBid) / firstBid) * 100 : (w.change_pct || 0);
    const chgStr = `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`;
    chgEl.className = `curve-change ${chg > 0 ? 'pos' : chg < 0 ? 'neg' : 'flat'}`;
    chgEl.textContent = chgStr;
  }
}

/* Update all selected bot curves from the latest market telemetry. */
function updatePriceCurves() {
  if (marketWatches && marketWatches.length) {
    marketWatches.forEach((w) => {
      if (w.symbol && (w.bid || w.ask)) {
        recordPriceTick(w.symbol, w.bid || w.ask, w.ask || w.bid);
      }
    });
  }

  const now = Date.now();
  if (now - _curvesLastRenderTs < 200) return;
  _curvesLastRenderTs = now;

  ['bot1', 'bot2', 'bot3', 'bot4', 'bot5', 'flow'].forEach((botKey) => {
    const sym = getBotSelectedSymbol(botKey);
    if (!sym) return;
    const card = $(`${botKey}-curve-card`);
    if (!card || card.dataset.sym !== sym) {
      setBotCurveSymbol(botKey, sym);
    } else {
      drawBotCurve(botKey, sym);
    }
  });
}

window.addEventListener('softradex:theme', () => {
  _curvesLastRenderTs = 0;
  updatePriceCurves();
});

/* ================= LIVE ROTATING MARKET TICKER TAPE ENGINE (Market Name + Price Gurbe) ================= */
/*
   Continuous rotating ticker tape running across both Login page and Dashboard.
   Populates Set A and Set B (identical clones) into #market-ticker-track and
   #login-ticker-track for seamless, gapless 360-degree CSS translation loop.
   In-place DOM updates on incoming ticks with green/red flash animations.
*/
const DEFAULT_TICKER_MARKETS = [
  { symbol: 'XAUUSD', displayName: 'XAU/USD (Gold)', digits: 2 },
  { symbol: 'EURUSD', displayName: 'EUR/USD', digits: 5 },
  { symbol: 'BTCUSD', displayName: 'BTC/USD (Bitcoin)', digits: 2 },
  { symbol: 'GBPUSD', displayName: 'GBP/USD', digits: 5 },
  { symbol: 'USDJPY', displayName: 'USD/JPY', digits: 3 },
  { symbol: 'USOIL', displayName: 'US OIL (Crude)', digits: 2 },
  { symbol: 'USTEC', displayName: 'NAS100 (Tech)', digits: 2 },
  { symbol: 'US30', displayName: 'US30 (Dow Jones)', digits: 2 },
  { symbol: 'ETHUSD', displayName: 'ETH/USD (Ethereum)', digits: 2 },
  { symbol: 'AUDUSD', displayName: 'AUD/USD', digits: 5 },
  { symbol: 'GBPJPY', displayName: 'GBP/JPY', digits: 3 },
  { symbol: 'DXY', displayName: 'USD INDEX', digits: 2 },
];

const _tickerData = new Map();
let _tickerInitialized = false;
let _microTicksTimer = null;

function tickerSymbol(value) {
  const symbol = String(value || '').trim().replace(/m$/, '').toUpperCase();
  return symbol === 'BTCUSD' ? 'BTCUSDT' : symbol;
}

function symbolDefaultDigits(sym) {
  const s = String(sym || '').toUpperCase();
  if (s.includes('JPY')) return 3;
  if (s.includes('BTC') || s.includes('XAU') || s.includes('GOLD') || s.includes('OIL') || s.includes('US30') || s.includes('100') || s.includes('TEC') || s.includes('DXY')) return 2;
  return 5;
}

function buildTickerItemHtml(w, copyId, isCompact = false) {
  const sym = String(w.symbol || '').toUpperCase();
  const name = w.displayName || sym;
  const digits = Number(w.digits !== undefined ? w.digits : symbolDefaultDigits(sym));
  const priceVal = Number(w.ask || w.bid || 0);
  const priceStr = priceVal ? nf(priceVal, digits) : '—';
  const dir = String(w.direction || 'FLAT').toUpperCase();
  const dirCls = dir === 'UP' ? 'up' : (dir === 'DOWN' ? 'down' : 'flat');
  const dirIcon = dir === 'UP' ? '▲' : (dir === 'DOWN' ? '▼' : '►');
  const chg = Number(w.change_pct || 0);
  const chgStr = priceVal > 0 ? `${chg > 0 ? '+' : ''}${chg.toFixed(2)}%` : '—';
  const spread = Number(w.spread || 0);
  const spreadStr = spread > 0 ? (digits > 4 ? (spread * 100000).toFixed(1) : spread.toFixed(1)) : '';
  const isOpen = (typeof isMarketOpen === 'function') ? isMarketOpen(sym) : true;
  const offCls = !isOpen ? ' ticker-off' : '';
  const offPill = !isOpen ? '<span class="ticker-off-pill">OFF</span>' : '';

  if (isCompact) {
    return `
      <div class="login-ticker-item${offCls}" data-sym="${esc(sym)}">
        <span class="login-ticker-sym">${esc(sym)}${offPill}</span>
        <span class="login-ticker-price" id="login-tk-price-${esc(sym)}-${copyId}">${priceStr}</span>
        <span class="login-ticker-chg ${dirCls}" id="login-tk-chg-${esc(sym)}-${copyId}">${dirIcon} ${chgStr}</span>
      </div>
    `;
  }

  return `
    <div class="ticker-item${offCls}" data-sym="${esc(sym)}" onclick="onTickerItemClick('${esc(sym)}')">
      <span class="ticker-sym">${esc(name)}${offPill}</span>
      <span class="ticker-price" id="tk-price-${esc(sym)}-${copyId}">${priceStr}</span>
      <span class="ticker-chg ${dirCls}" id="tk-chg-${esc(sym)}-${copyId}">${dirIcon} ${chgStr}</span>
      ${spreadStr ? `<span class="ticker-spread" id="tk-sp-${esc(sym)}-${copyId}">SP ${spreadStr}</span>` : ''}
    </div>
  `;
}

function initMarketTickerTape() {
  if (_tickerInitialized) return;
  _tickerInitialized = true;

  DEFAULT_TICKER_MARKETS.forEach(m => {
    _tickerData.set(tickerSymbol(m.symbol), { ...m });
  });

  renderMarketTickerDom(true);
  startDisconnectedMicroTicks();

  // Initialize bot curves for Bot 1..5
  ['bot1', 'bot2', 'bot3', 'bot4', 'bot5'].forEach(botKey => {
    const sym = getBotSelectedSymbol(botKey);
    setBotCurveSymbol(botKey, sym);
  });
}

function renderMarketTickerDom(force = false) {
  const topTrack = $('market-ticker-track');
  const loginTrack = $('login-ticker-track');
  const items = Array.from(_tickerData.values());
  if (!items.length) return;

  if (topTrack && (force || !topTrack.children.length)) {
    const setA = items.map(w => buildTickerItemHtml(w, 'a', false)).join('');
    const setB = items.map(w => buildTickerItemHtml(w, 'b', false)).join('');
    topTrack.innerHTML = setA + setB;
  }

  if (loginTrack && (force || !loginTrack.children.length)) {
    const setA = items.map(w => buildTickerItemHtml(w, 'a', true)).join('');
    const setB = items.map(w => buildTickerItemHtml(w, 'b', true)).join('');
    loginTrack.innerHTML = setA + setB;
  }
}

function updateMarketTickerTape(watches) {
  if (!_tickerInitialized) {
    initMarketTickerTape();
  }
  if (!watches || !Array.isArray(watches) || !watches.length) return;

  let hasNew = false;
  watches.forEach(w => {
    if (!w || !w.symbol) return;
    const sym = tickerSymbol(w.symbol);
    if (!_tickerData.has(sym)) {
      hasNew = true;
    }
  });

  watches.forEach(w => {
    if (!w || !w.symbol) return;
    const sym = tickerSymbol(w.symbol);
    const existing = _tickerData.get(sym);
    const newPrice = w.price_source === 'sim' || w.stale ? 0 : Number(w.ask || w.bid || 0);
    const digits = Number(w.digits !== undefined ? w.digits : (existing ? existing.digits : symbolDefaultDigits(sym)));

    let priceDir = null;
    if (existing && newPrice > 0 && existing.ask > 0) {
      if (newPrice > existing.ask) priceDir = 'up';
      else if (newPrice < existing.ask) priceDir = 'down';
    }

    _tickerData.set(sym, {
      ...(existing || {}),
      ...w,
      symbol: sym,
      displayName: w.displayName || (existing ? existing.displayName : sym),
      ask: newPrice,
      bid: newPrice > 0 ? Number(w.bid) || newPrice : 0,
      digits,
      direction: w.direction || (priceDir === 'up' ? 'UP' : (priceDir === 'down' ? 'DOWN' : (existing ? existing.direction : 'FLAT'))),
      change_pct: w.change_pct !== undefined ? w.change_pct : (existing ? existing.change_pct : 0),
    });

    {
      const priceStr = newPrice > 0 ? nf(newPrice, digits) : '—';
      const chg = Number(w.change_pct !== undefined ? w.change_pct : (existing ? existing.change_pct : 0));
      const chgStr = newPrice > 0 ? `${chg > 0 ? '+' : ''}${chg.toFixed(2)}%` : '—';
      const dir = String(w.direction || (priceDir === 'up' ? 'UP' : (priceDir === 'down' ? 'DOWN' : (existing ? existing.direction : 'FLAT')))).toUpperCase();
      const dirCls = dir === 'UP' ? 'up' : (dir === 'DOWN' ? 'down' : 'flat');
      const dirIcon = dir === 'UP' ? '▲' : (dir === 'DOWN' ? '▼' : '►');

      ['a', 'b'].forEach(copyId => {
        const pEl = $(`tk-price-${sym}-${copyId}`);
        if (pEl) {
          if (pEl.textContent !== priceStr) pEl.textContent = priceStr;
          if (priceDir) {
            pEl.classList.remove('tick-up', 'tick-down');
            pEl.classList.add(priceDir === 'up' ? 'tick-up' : 'tick-down');
            if (pEl._tkTimer) clearTimeout(pEl._tkTimer);
            pEl._tkTimer = setTimeout(() => { pEl.classList.remove('tick-up', 'tick-down'); }, 700);
          }
        }
        const cEl = $(`tk-chg-${sym}-${copyId}`);
        if (cEl) {
          const wantCls = `ticker-chg ${dirCls}`;
          const wantTxt = `${dirIcon} ${chgStr}`;
          if (cEl.className !== wantCls) cEl.className = wantCls;
          if (cEl.textContent !== wantTxt) cEl.textContent = wantTxt;
        }

        const lpEl = $(`login-tk-price-${sym}-${copyId}`);
        if (lpEl) {
          if (lpEl.textContent !== priceStr) lpEl.textContent = priceStr;
          if (priceDir) {
            lpEl.style.color = priceDir === 'up' ? '#4ade80' : '#f87171';
            if (lpEl._tkTimer) clearTimeout(lpEl._tkTimer);
            lpEl._tkTimer = setTimeout(() => { lpEl.style.color = '#38bdf8'; }, 700);
          }
        }
        const lcEl = $(`login-tk-chg-${sym}-${copyId}`);
        if (lcEl) {
          const wantLCls = `login-ticker-chg ${dirCls}`;
          const wantLTxt = `${dirIcon} ${chgStr}`;
          if (lcEl.className !== wantLCls) lcEl.className = wantLCls;
          if (lcEl.textContent !== wantLTxt) lcEl.textContent = wantLTxt;
        }
      });
    }
  });

  const topTrack = $('market-ticker-track');
  if (hasNew) {
    renderMarketTickerDom(true);
  }
}

function startDisconnectedMicroTicks() {
  // Transport loss preserves the unavailable state; only provider quotes move prices.
}

function onTickerItemClick(sym) {
  if (!sym) return;
  if (!isMarketOpen(sym)) {
    toast('warn', LANG === 'bn' ? `${sym} মার্কেটটি বর্তমানে বন্ধ রয়েছে (Market Closed)` : `${sym} market is currently closed`);
  }
  playTactileClick('click');
  const upSym = sym.toUpperCase();
  document.querySelectorAll(`.ticker-item[data-sym="${upSym}"]`).forEach(el => {
    el.classList.add('active-sym');
    setTimeout(() => el.classList.remove('active-sym'), 1500);
  });

  // clicking a ticker market drives the whole pipeline to that market
  const list = ((S && S.bot5 && S.bot5.ai && S.bot5.ai.symbols) || []).map(s => String(s).toUpperCase());
  if (list.includes(upSym)) void selectFlowMarket(upSym);

  const watchCard = $(`watch-card-${upSym}`);
  const curveCard = $(`curve-card-${upSym}`);
  const target = curveCard || watchCard;
  if (target && !$('dash').classList.contains('hidden')) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('active-target');
    setTimeout(() => target.classList.remove('active-target'), 2000);
  }
}

/* ------------------------------------------------------------------- bot 3 recalculate timer */
let bot3RecalcRemaining = 60;
let _bot3RecalcPending = false;
let _bot3LastRecalcDoneTs = 0;

function updateBot3TimerPills(sec) {
  const isBn = LANG === 'bn';
  const timerPill = $('bot3-planned-timer');
  if (timerPill) {
    if (sec <= 0 || _bot3RecalcPending) {
      timerPill.textContent = isBn ? '🔄 হিসাব হচ্ছে...' : '🔄 Recalculating...';
      timerPill.className = 'planned-timer-pill recalculating';
    } else {
      timerPill.textContent = `⏱️ ${sec}s`;
      timerPill.className = 'planned-timer-pill' + (sec <= 10 ? ' urgent' : '');
    }
  }
  const radarTimer = $('bot3-timer');
  if (radarTimer) {
    radarTimer.textContent = `⏱️ ${sec}s`;
    radarTimer.className = 'radar-timer-pill' + (sec <= 10 ? ' urgent' : '');
  }
}

function updateBot3LastUpdated(ts) {
  const el = $('bot3-last-updated');
  if (!el) return;
  const isBn = LANG === 'bn';
  let d = ts ? new Date(ts * 1000) : new Date();
  if (isNaN(d.getTime())) d = new Date();
  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  el.textContent = (isBn ? 'আপডেট: ' : 'Updated: ') + timeStr;
}

function flashBot3RecalcPulse() {
  const wrap = document.querySelector('.planned-trades-card-wrap');
  if (wrap) {
    wrap.classList.add('recalc-flash');
    setTimeout(() => wrap.classList.remove('recalc-flash'), 900);
  }
}

async function triggerBot3Recalculate(manual = false) {
  if (!botsEnabled || CFG.order_execution === false) {
    // Public setup analysis has its own read-only refresh; bot3's mutation
    // endpoint is disabled by the server in this dashboard.
    if (manual && window.TvSetups) window.TvSetups.refresh();
    return;
  }
  if (_bot3RecalcPending) return;
  _bot3RecalcPending = true;
  updateBot3TimerPills(0);
  const btn = $('bot3-recalc-btn');
  if (btn) btn.classList.add('loading');

  try {
    const res = await bot3Post('/api/bot3/recalculate', {});
    if (res && res.ok) {
      if (res.bot3 && S) {
        S.bot3 = res.bot3;
        renderBot3(S);
      }
      bot3RecalcRemaining = 60;
      _bot3LastRecalcDoneTs = Date.now();
      updateBot3LastUpdated(Date.now() / 1000);
      flashBot3RecalcPulse();
      if (manual) {
        toast('ok', LANG === 'bn' ? 'এক্সট্রিম সেটআপ হিসাব সম্পন্ন হয়েছে' : 'Extreme Setups Recalculated');
      }
    }
  } catch (err) {
    console.error('Bot 3 recalculate failed', err);
  } finally {
    _bot3RecalcPending = false;
    if (btn) btn.classList.remove('loading');
    updateBot3TimerPills(bot3RecalcRemaining);
  }
}

function tickBot3RecalcTimer() {
  if (document.hidden || !botsEnabled || CFG.order_execution === false) return;
  if (_bot3RecalcPending) return;
  bot3RecalcRemaining--;
  if (bot3RecalcRemaining <= 0) {
    bot3RecalcRemaining = 60;
    void triggerBot3Recalculate(false);
  } else {
    updateBot3TimerPills(bot3RecalcRemaining);
  }
}

/* ------------------------------------------------------------------- 3D Tilt & Cyber Audio Engine */
let currentTiltEl = null;

function resetTilt(el) {
  if (!el) return;
  el.style.setProperty('--rx', '0deg');
  el.style.setProperty('--ry', '0deg');
  el.style.setProperty('--mx', '50%');
  el.style.setProperty('--my', '0%');
  el.classList.remove('is-hovered-3d');
}

function playTactileClick(type = 'click') {
  if (voiceMuted) return;
  try {
    const ctx = window._audioCtx || (window._audioCtx = new (window.AudioContext || window.webkitAudioContext)());
    if (ctx.state === 'suspended') void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    if (type === 'start') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(780, now + 0.08);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.08);
    } else if (type === 'stop') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.09);
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.09);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.03);
      gain.gain.setValueAtTime(0.025, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.03);
    }
  } catch (e) {
    // AudioContext blocked until gesture or unsupported
  }
}

function init3DTiltEngine() {
  const tiltSelector = '.watch-card, .stat-card, .acc-item, .connect-card, .struct-card, .bot2-trend-box';
  let tiltRect = null;
  let tiltRectAt = 0;
  let tiltRaf = 0;
  let lastTiltEv = null;
  window.addEventListener('scroll', () => { tiltRect = null; }, { passive: true });

  document.addEventListener('pointerover', (e) => {
    const target = e.target && e.target.closest ? e.target.closest(tiltSelector) : null;
    if (target) {
      if (currentTiltEl && currentTiltEl !== target) resetTilt(currentTiltEl);
      currentTiltEl = target;
      tiltRect = null;
      target.classList.add('is-hovered-3d');
    }
  }, { passive: true });

  document.addEventListener('pointerout', (e) => {
    if (currentTiltEl && (!e.relatedTarget || !currentTiltEl.contains(e.relatedTarget))) {
      resetTilt(currentTiltEl);
      currentTiltEl = null;
      tiltRect = null;
    }
  }, { passive: true });

  document.addEventListener('pointermove', (e) => {
    if (!currentTiltEl) return;
    lastTiltEv = e;
    if (tiltRaf) return;
    tiltRaf = requestAnimationFrame(() => {
      tiltRaf = 0;
      if (!currentTiltEl || !lastTiltEv) return;
      const now = performance.now();
      if (!tiltRect || now - tiltRectAt > 300) {
        tiltRect = currentTiltEl.getBoundingClientRect();
        tiltRectAt = now;
      }
      if (!tiltRect.width || !tiltRect.height) return;
      const relX = Math.max(0, Math.min(1, (lastTiltEv.clientX - tiltRect.left) / tiltRect.width));
      const relY = Math.max(0, Math.min(1, (lastTiltEv.clientY - tiltRect.top) / tiltRect.height));
      const tiltX = (relY - 0.5) * -12;
      const tiltY = (relX - 0.5) * 12;
      const mx = Math.round(relX * 100);
      const my = Math.round(relY * 100);

      currentTiltEl.style.setProperty('--rx', `${tiltX.toFixed(2)}deg`);
      currentTiltEl.style.setProperty('--ry', `${tiltY.toFixed(2)}deg`);
      currentTiltEl.style.setProperty('--mx', `${mx}%`);
      currentTiltEl.style.setProperty('--my', `${my}%`);
    });
  }, { passive: true });

  // Tactile audio feedback on interactions
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button, .btn, .chip, .seg-btn, .icon-btn');
    if (!btn) return;
    if (btn.classList.contains('bot-start')) {
      playTactileClick('start');
    } else if (btn.classList.contains('bot-stop') || btn.classList.contains('danger-btn')) {
      playTactileClick('stop');
    } else {
      playTactileClick('click');
    }
  });
}

/* ------------------------------------------------------------------- init */
function initDashboard() {
  bindUI();
  updateVoiceMuteButtons();
  applyLang();
  renderStatLabels();
  init3DTiltEngine();
  void loadConfig().then(() => {
    connectWS();
    if (!httpPollTimer) void loadInitial();
  });
  setInterval(() => { if (!wsAlive && !httpPollTimer) void loadInitial(); }, 3000);

  setInterval(() => { if (wsAlive) { try { ws.send(JSON.stringify({ type: 'ping' })); } catch (e) {} } }, 20000);
  // Half-dead socket watchdog: a sleeping machine / dropped NAT entry does not
  // fire onclose, so a socket silent for several ping cycles is recycled.
  setInterval(() => {
    if (!wsAlive || !lastServerMsgAt) return;
    if (Date.now() - lastServerMsgAt > 60000) {
      try { ws.close(); } catch (e) {}
    }
  }, 15000);
  // live 1-second countdown ticker for Bot 3 60-second extreme setups recalculation
  setInterval(tickBot3RecalcTimer, 1000);
  // live 1-second countdown ticker for Bot 5 next news event
  setInterval(tickBot5Countdown, 1000);
  // the session clock ticks locally so no countdown ever waits for a push
  setInterval(() => { if (!document.hidden) tickSessionsClock(); }, 1000);
  // the AI panel's "updated Ns ago" line ticks locally between pushes
  setInterval(() => { if (!document.hidden) tickAiAge(); }, 1000);
  // Market Pressure Watch Dials: NO ticker at all. One seed fetch here, then every
  // engine-tick WebSocket snapshot patches the dials in place (live time included).
  initFlowUI();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (_stateTimer) { clearTimeout(_stateTimer); _stateTimer = null; }
      $('bot5-news')?.__renderer?.pause();
    } else {
      if (_statePending) queueStateFrame(_statePending);
      else if (S) renderBot5(S);
      if (wakeHttpPoll) wakeHttpPoll();
      $('bot5-news')?.__renderer?.resume();
      tickBot5Countdown();
      tickSessionsClock();
    }
  });
  initMarketTickerTape();
  void fetchMarketWatch();
  // live trade flow balance: our side rides the engine ticks, the whole world
  // (Binance public data) refreshes every 10 s
  void pollFlowBalanceWorld();
  setInterval(pollFlowBalanceWorld, 10000);
  // Market Pressure Watch Dials: NO timer. The live WebSocket state snapshot
  // (every engine tick) patches the dials in place. No setInterval needed.
  /* ==========================================================================
     ORDER FLOW BRIDGE: 02 MARKET PRESSURE WATCH DIALS
     Streams live order tape buyer vs seller pressure directly to Stage 05 Dials.
     ========================================================================== */
  window.applyOrderFlowToWatchDials = function(stats) {
    if (!stats) return;
    const sym = String(stats.symbol || flowSymbol() || 'GOLD').trim();
    const buyPct = Math.max(1, Math.min(99, Math.round(Number(stats.buyPct) || 50)));
    const sellPct = 100 - buyPct;
    // Needle degrees: -65deg is BUY 100%, 0deg is 50/50, +65deg is SELL 100%
    const needleDeg = Number((((50 - buyPct) / 50) * 65).toFixed(1));
    const dominant = buyPct >= 55 ? 'BUYER' : (sellPct >= 55 ? 'SELLER' : 'NEUTRAL');
    const domCls = dominant.toLowerCase();
    const flow = buyPct > 52 ? 'bullish' : (sellPct > 52 ? 'bearish' : 'sideways');

    // Update in-memory marketWatches item
    let w = typeof findWatchForSymbol === 'function' ? findWatchForSymbol(sym) : null;
    if (w) {
      w.buyer_pct = buyPct;
      w.seller_pct = sellPct;
      w.needle_deg = needleDeg;
      w.dominant = dominant;
      w.candle_flow = flow;
      w.direction = buyPct >= 50 ? 'UP' : 'DOWN';
      if (stats.lastPrice > 0) {
        w.ask = stats.lastPrice;
        w.bid = stats.lastPrice - (w.spread || 0.1);
      }
      w.updated_at = Date.now() / 1000;
      w.live = true;
    }

    // Direct DOM Patch for instantaneous 60fps needle, VU-meter, and pressure readouts
    const grid = $('market-watch-grid');
    if (grid) {
      const card = grid.querySelector('.watch-card');
      if (card && w && String(card.dataset.sym || '').toUpperCase() === String(w.symbol || '').toUpperCase()) {
        // 1. Rotate Needle
        const wrap = card.querySelector('.watch-hand-wrap');
        if (wrap) wrap.style.transform = `rotate(${needleDeg}deg)`;
        const lance = card.querySelector('.watch-hand-lance');
        if (lance) lance.className = `watch-hand-lance ${domCls}`;

        // 2. Annunciator Lamp & Text
        const ann = card.querySelector('.watch-annunciator');
        const annTxt = card.querySelector('.annunciator-text');
        if (ann) ann.className = `watch-annunciator ${domCls}`;
        if (annTxt) {
          annTxt.textContent = buyPct >= 72
            ? (LANG === 'bn' ? 'তীব্র বায়ার চাপ (BUY FLOW)' : 'STRONG BUYER FLOW')
            : (buyPct >= 55
              ? (LANG === 'bn' ? `বায়ার চাপ ${buyPct}%` : `BUYER PRESSURE ${buyPct}%`)
              : (sellPct >= 72
                ? (LANG === 'bn' ? 'তীব্র সেলার চাপ (SELL FLOW)' : 'STRONG SELLER FLOW')
                : (sellPct >= 55
                  ? (LANG === 'bn' ? `সেলার চাপ ${sellPct}%` : `SELLER PRESSURE ${sellPct}%`)
                  : (LANG === 'bn' ? 'অর্ডার ফ্লো ব্যালান্সড ৫০%' : 'ORDER FLOW BALANCED 50%'))));
        }

        // 3. Live Price Display
        if (stats.lastPrice > 0) {
          const priceEl = card.querySelector('.watch-price-display');
          if (priceEl) priceEl.textContent = Number(stats.lastPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const bidEl = card.querySelector('.spec-bid');
          if (bidEl) bidEl.textContent = Number(stats.lastPrice).toFixed(2);
        }

        // 4. Pressure Split Header Labels
        const buyLabel = card.querySelector('.pressure-label.buyer b');
        const sellLabel = card.querySelector('.pressure-label.seller b');
        if (buyLabel) buyLabel.textContent = `${buyPct}%`;
        if (sellLabel) sellLabel.textContent = `${sellPct}%`;

        // 5. Dual 16-Segment LED VU-Meter
        const rack = card.querySelector('.vu-meter-rack');
        if (rack) {
          rack.title = `Buyer: ${buyPct}% · Seller: ${sellPct}%`;
          if (typeof patchVuSegments === 'function') {
            patchVuSegments(rack.querySelector('.vu-buy'), buyPct, 'buy');
            patchVuSegments(rack.querySelector('.vu-sell'), sellPct, 'sell');
          }
        }

        // 6. Big Buyer vs Seller Readout Box
        const bBig = card.querySelector('.wpb-buyer .wpb-val');
        const sBig = card.querySelector('.wpb-seller .wpb-val');
        if (bBig) bBig.textContent = `${buyPct}%`;
        if (sBig) sBig.textContent = `${sellPct}%`;

        const bigRack = card.querySelector('.watch-pressure-bigrack');
        if (bigRack) {
          bigRack.title = `Buyer: ${buyPct}% · Seller: ${sellPct}%`;
          bigRack.classList.toggle('buyer-lead', dominant === 'BUYER');
          bigRack.classList.toggle('seller-lead', dominant === 'SELLER');
        }

        // 7. Direction and Flow Specs
        const flowEl = card.querySelector('.spec-flow');
        if (flowEl) {
          const arrow = buyPct >= 50 ? '▲' : '▼';
          flowEl.className = `spec-v flow-val spec-flow ${flow}`;
          flowEl.textContent = `${arrow} ${flow.toUpperCase()}`;
        }
        const dirEl = card.querySelector('.spec-direction');
        if (dirEl) {
          const dir = buyPct >= 50 ? 'UP' : 'DOWN';
          dirEl.className = `spec-v spec-direction ${dir.toLowerCase()}`;
          dirEl.textContent = `${dir === 'UP' ? '▲' : '▼'} ${dir}`;
        }

        // 8. Live Clock on Machine Face
        const clockEl = card.querySelector('.machine-clock');
        if (clockEl) {
          clockEl.textContent = watchClockText(Date.now() / 1000);
          clockEl.classList.remove('sim');
        }
      }
    }

    // 9. Update Summary Pill in Stage 05 Header
    if (typeof updateWatchSummaryPill === 'function') {
      try { updateWatchSummaryPill(); } catch (e) {}
    }
  };

  /* ==========================================================================
     ORDER FLOW BRIDGE: 03 FULL AI MARKET ANALYSIS (live BUY / SELL)
     Feeds real-time execution order flow into AI Market Analysis & computes
     live Direction (BUY / SELL / BALANCED), Confidence %, Targets, and Timeframes.
     ========================================================================== */
  window.applyOrderFlowToAiMarket = function(stats) {
    if (!stats) return;
    const sym = String(stats.symbol || flowSymbol() || 'GOLD').trim();
    const buyPct = Math.max(1, Math.min(99, Math.round(Number(stats.buyPct) || 50)));
    const sellPct = 100 - buyPct;
    const price = Number(stats.lastPrice);
    if (!Number.isFinite(price) || price <= 0) return;
    const digits = sym.includes('EUR') || sym.includes('GBP') ? 5 : (sym.includes('JPY') ? 3 : 2);

    // Compute live Direction & Confidence from order flow tape
    let verdict = 'BALANCED';
    let sideClass = 'mixed';
    let arrow = '◆';
    let sideText = LANG === 'bn' ? 'ব্যালান্সড (অপেক্ষা করুন)' : 'BALANCED (WAIT)';
    let confidence = 50;

    if (buyPct >= 65) {
      verdict = buyPct >= 75 ? 'STRONG_BUY' : 'BUY';
      sideClass = 'buy';
      arrow = '▲';
      sideText = buyPct >= 75
        ? (LANG === 'bn' ? 'তীব্র বাই (STRONG BUY)' : 'STRONG BUY')
        : (LANG === 'bn' ? 'বাই (BUY)' : 'BUY');
      confidence = Math.min(98, Math.max(55, Math.round(buyPct + (Math.abs(stats.netDelta || 0) > 50000 ? 5 : 0))));
    } else if (sellPct >= 65) {
      verdict = sellPct >= 75 ? 'STRONG_SELL' : 'SELL';
      sideClass = 'sell';
      arrow = '▼';
      sideText = sellPct >= 75
        ? (LANG === 'bn' ? 'তীব্র সেল (STRONG SELL)' : 'STRONG SELL')
        : (LANG === 'bn' ? 'সেল (SELL)' : 'SELL');
      confidence = Math.min(98, Math.max(55, Math.round(sellPct + (Math.abs(stats.netDelta || 0) > 50000 ? 5 : 0))));
    } else if (buyPct > 52) {
      verdict = 'BUY';
      sideClass = 'buy';
      arrow = '▲';
      sideText = LANG === 'bn' ? 'বাই (BUY)' : 'BUY';
      confidence = Math.round(52 + (buyPct - 50) * 1.6);
    } else if (sellPct > 52) {
      verdict = 'SELL';
      sideClass = 'sell';
      arrow = '▼';
      sideText = LANG === 'bn' ? 'সেল (SELL)' : 'SELL';
      confidence = Math.round(52 + (sellPct - 50) * 1.6);
    }

    // Dynamic targets & levels
    const atrEst = price * (sym.includes('BTC') ? 0.008 : 0.0035);
    const upDist = atrEst * (buyPct / 50);
    const downDist = atrEst * (sellPct / 50);
    const upPrice = price + upDist;
    const downPrice = price - downDist;
    const upMoney = upDist * 10;
    const downMoney = -downDist * 10;
    const levelUp = price + (atrEst * 1.65);
    const levelDown = price - (atrEst * 1.65);

    // Update in-memory aiBoard
    if (!aiBoard) {
      aiBoard = {
        symbol: sym,
        timeframe: 'M5',
        price: price,
        digits: digits,
        source: 'order_flow',
        updated: Date.now() / 1000,
        combined: {},
        target: {},
        rows: []
      };
    }
    aiBoard.symbol = sym;
    aiBoard.price = price;
    aiBoard.digits = digits;
    aiBoard.updated = Date.now() / 1000;
    aiBoard.combined = {
      verdict: sideClass === 'buy' ? 'BUY' : (sideClass === 'sell' ? 'SELL' : 'MIXED'),
      confidence: confidence,
      reasons: [
        `Order Flow: ${buyPct}% Buyers / ${sellPct}% Sellers`,
        `Net Delta: ${stats.netDelta >= 0 ? '+' : ''}$${Math.abs(stats.netDelta || 0).toLocaleString()}`,
        `Tape Speed: ${stats.speed || '0.0'} tx/s`
      ]
    };
    aiBoard.target = {
      ready: true,
      primary_side: sideClass === 'sell' ? 'SELL' : 'BUY',
      up_price: upPrice,
      down_price: downPrice,
      up_money: upMoney,
      down_money: downMoney,
      level_up: levelUp,
      level_down: levelDown
    };

    // 1. Update #ai-verdict (The prominent one-line AI answer)
    const verEl = $('ai-verdict');
    if (verEl) {
      const deltaSign = (stats.netDelta || 0) >= 0 ? '+' : '';
      const deltaStr = `${deltaSign}$${Math.abs(stats.netDelta || 0).toLocaleString()}`;
      verEl.innerHTML = `
        <span class="ai-side ${sideClass}">${arrow} ${sideText}</span>
        <b>${confidence}%</b> ${LANG === 'bn' ? 'কনফিডেন্স' : 'Confidence'} · 
        ${LANG === 'bn' ? 'অর্ডার ফ্লো' : 'Order Flow'} <b>${buyPct}% BUY / ${sellPct}% SELL</b> · 
        ${LANG === 'bn' ? 'প্রাইস' : 'Price Now'} <b>${price.toFixed(digits)}</b>
        <span class="ai-why" title="Traders Order Flow Terminal Auto-Analysis">
          ${LANG === 'bn' ? 'কারণ' : 'Why'}: ${stats.speed} tx/s · Delta ${deltaStr}
        </span>
      `;
    }

    // 2. Update #ai-targets (Price targets and travel corridors)
    const tgtEl = $('ai-targets');
    if (tgtEl) {
      const upRole = sideClass === 'buy' ? (LANG === 'bn' ? 'টার্গেট' : 'Target') : (LANG === 'bn' ? 'রিস্ক' : 'Risk');
      const downRole = sideClass === 'sell' ? (LANG === 'bn' ? 'টার্গেট' : 'Target') : (LANG === 'bn' ? 'রিস্ক' : 'Risk');
      tgtEl.innerHTML = `
        <span class="ai-target up" title="${LANG === 'bn' ? 'আপ টার্গেট' : 'Up Target'}">
          <b>▲ ${LANG === 'bn' ? 'আপ' : 'UP'} ${upPrice.toFixed(digits)}</b>
          <small>+$${Math.abs(upMoney).toFixed(1)} · ${upRole}</small>
        </span>
        <span class="ai-target down" title="${LANG === 'bn' ? 'ডাউন টার্গেট' : 'Down Target'}">
          <b>▼ ${LANG === 'bn' ? 'ডাউন' : 'DOWN'} ${downPrice.toFixed(digits)}</b>
          <small>-$${Math.abs(downMoney).toFixed(1)} · ${downRole}</small>
        </span>
        <span class="ai-target level">
          <b>${LANG === 'bn' ? 'লেভেলস' : 'Levels'}</b>
          <small>${levelUp.toFixed(digits)} / ${levelDown.toFixed(digits)}</small>
        </span>
      `;
    }

    // 3. Update #ai-tf-tabs (Timeframe buttons: 1m, 5m, 15m, 1h, 4h, 1Day)
    const tabs = $('ai-tf-tabs');
    if (tabs) {
      const TFS = [
        { k: 'M1', lbl: '1m', v: sideClass === 'buy' ? 'BUY' : (sideClass === 'sell' ? 'SELL' : 'MIXED') },
        { k: 'M5', lbl: '5m', v: sideClass === 'buy' ? 'BUY' : (sideClass === 'sell' ? 'SELL' : 'MIXED') },
        { k: 'M15', lbl: '15m', v: sideClass === 'buy' ? 'BUY' : (sideClass === 'sell' ? 'SELL' : 'MIXED') },
        { k: 'H1', lbl: '1h', v: buyPct >= 58 ? 'BUY' : (sellPct >= 58 ? 'SELL' : 'MIXED') },
        { k: 'H4', lbl: '4h', v: buyPct >= 62 ? 'BUY' : (sellPct >= 62 ? 'SELL' : 'MIXED') },
        { k: 'D1', lbl: '1Day', v: buyPct >= 65 ? 'BUY' : (sellPct >= 65 ? 'SELL' : 'MIXED') }
      ];
      tabs.innerHTML = TFS.map(item => {
        const itemArrow = item.v === 'BUY' ? '▲' : (item.v === 'SELL' ? '▼' : '◆');
        const itemSide = item.v === 'BUY' ? 'buy' : (item.v === 'SELL' ? 'sell' : 'mixed');
        const on = (aiBoard.timeframe || 'M5') === item.k ? ' sel' : '';
        return `<span class="ai-tab ${itemSide}${on}" data-tf="${item.k}">${item.lbl} ${itemArrow}</span>`;
      }).join('');
    }

    // 4. Update #ai-updated status age
    const updEl = $('ai-updated');
    if (updEl) {
      updEl.textContent = LANG === 'bn'
        ? `আপডেট: ০ সেকেন্ড আগে · TRADERS ORDER FLOW টার্মিনাল লাইভ অটো-আপডেট`
        : `Updated: 0s ago · TRADERS ORDER FLOW TERMINAL Live Auto-Update`;
    }

    // 5. Update Timeframe Detail Grid (#ai-grid)
    const grid = $('ai-grid');
    if (grid && (!grid.children.length || grid.querySelector('.ai-empty'))) {
      const TFS = [
        { k: 'M1', name: '1m', tfConf: confidence },
        { k: 'M5', name: '5m', tfConf: confidence },
        { k: 'M15', name: '15m', tfConf: Math.max(50, confidence - 3) },
        { k: 'H1', name: '1h', tfConf: Math.max(50, confidence - 6) },
        { k: 'H4', name: '4h', tfConf: Math.max(50, confidence - 9) },
        { k: 'D1', name: '1Day', tfConf: Math.max(50, confidence - 12) }
      ];
      grid.innerHTML = TFS.map(tfItem => {
        const tfVerdict = sideClass === 'buy' ? 'BUY' : (sideClass === 'sell' ? 'SELL' : 'MIXED');
        const tfArrow = sideClass === 'buy' ? '▲' : (sideClass === 'sell' ? '▼' : '◆');
        const selClass = (aiBoard.timeframe || 'M5') === tfItem.k ? ' sel' : '';
        return `
          <div class="ai-row ${sideClass}${selClass}" data-key="${tfItem.k}">
            <div class="ai-row-top">
              <span class="ai-tf-name">${tfItem.name}</span>
              <span class="sess-verdict ${sideClass}">${tfArrow} ${tfVerdict}</span>
              <span class="ai-conf">${tfItem.tfConf}%</span>
            </div>
            <div class="ai-row-mid">
              <span>Order Flow</span>
              <span>Speed ${stats.speed || '0.0'} tx/s</span>
              <span>Delta ${stats.netDelta >= 0 ? '+' : ''}$${Math.abs(stats.netDelta || 0).toFixed(0)}</span>
            </div>
            <div class="ai-row-up">▲ UP ${upPrice.toFixed(digits)} <small>+$${Math.abs(upMoney).toFixed(1)}</small></div>
            <div class="ai-row-down">▼ DOWN ${downPrice.toFixed(digits)} <small>-$${Math.abs(downMoney).toFixed(1)}</small></div>
            <div class="ai-row-note">Traders Order Flow Terminal · ${buyPct}% Buyers / ${sellPct}% Sellers</div>
          </div>
        `;
      }).join('');
    } else if (grid) {
      grid.querySelectorAll('.ai-row').forEach(rowEl => {
        const tfVerdict = sideClass === 'buy' ? 'BUY' : (sideClass === 'sell' ? 'SELL' : 'MIXED');
        const tfArrow = sideClass === 'buy' ? '▲' : (sideClass === 'sell' ? '▼' : '◆');
        rowEl.className = `ai-row ${sideClass}${rowEl.classList.contains('sel') ? ' sel' : ''}`;
        const verdEl = rowEl.querySelector('.sess-verdict');
        if (verdEl) {
          verdEl.className = `sess-verdict ${sideClass}`;
          verdEl.textContent = `${tfArrow} ${tfVerdict}`;
        }
        const confEl = rowEl.querySelector('.ai-conf');
        if (confEl) confEl.textContent = `${confidence}%`;
        const upEl = rowEl.querySelector('.ai-row-up');
        if (upEl) upEl.innerHTML = `▲ UP ${upPrice.toFixed(digits)} <small>+$${Math.abs(upMoney).toFixed(1)}</small>`;
        const downEl = rowEl.querySelector('.ai-row-down');
        if (downEl) downEl.innerHTML = `▼ DOWN ${downPrice.toFixed(digits)} <small>-$${Math.abs(downMoney).toFixed(1)}</small>`;
        const noteEl = rowEl.querySelector('.ai-row-note');
        if (noteEl) noteEl.textContent = `Traders Order Flow: ${buyPct}% Buyers / ${sellPct}% Sellers · Live`;
      });
    }
  };

  window.addEventListener('resize', () => {
    ['bot1', 'bot2', 'bot3', 'bot4', 'bot5', 'flow'].forEach(botKey => {
      const sym = getBotSelectedSymbol(botKey);
      drawBotCurve(botKey, sym);
    });
  });
}

// Expose shared helpers & state on window for cross-module integration
window.toast = toast;
window.flowSymbol = flowSymbol;
window.renderMarketWatches = renderMarketWatches;
window.selectFlowMarket = selectFlowMarket;
window.onTickerItemClick = onTickerItemClick;
window.isMarketOpen = isMarketOpen;
window.fmtPrice = fmtPrice;
window.esc = esc;
window.nf = nf;
window.t = t;
window.renderBot5 = renderBot5;
window.renderBot3 = renderBot3;
window.applyState = applyState;
try {
  Object.defineProperty(window, 'S', { get: () => S, set: (v) => { S = v; }, configurable: true });
  Object.defineProperty(window, 'CFG', { get: () => CFG, set: (v) => { CFG = v; }, configurable: true });
  Object.defineProperty(window, 'LANG', { get: () => LANG, configurable: true });
} catch (e) {}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDashboard);
else initDashboard();


// ==================== about-me.js ====================
/* Shared About Me modal behavior for the login and both dashboards. */
(function () {
  function closeModal(modal) {
    if (modal) modal.classList.add('hidden');
  }

  function openModal() {
    var modal = document.getElementById('about-me-modal');
    if (modal) modal.classList.remove('hidden');
  }

  document.addEventListener('click', function (event) {
    var openButton = event.target.closest('[data-about-open]');
    if (openButton) {
      event.preventDefault();
      openModal();
      return;
    }
    var closeButton = event.target.closest('[data-about-close]');
    if (closeButton) {
      closeModal(document.getElementById('about-me-modal'));
      return;
    }
    var modal = document.getElementById('about-me-modal');
    if (modal && event.target === modal) closeModal(modal);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeModal(document.getElementById('about-me-modal'));
  });
})();


// ==================== dashboard-navigation.js ====================
/* Revoke the current browser session, then return to the access website. */
(function () {
  'use strict';
  const button = document.getElementById('dashboard-logout');
  if (!button) return;
  const label = button.querySelector('span');
  let pending = false;
  button.addEventListener('click', async () => {
    if (pending) return;
    pending = true;
    button.disabled = true;
    label.textContent = 'Logging out…';
    try {
      const response = await fetch('/api/logout', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        signal: AbortSignal.timeout(10000)
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) throw new Error('Logout could not be completed. Please try again.');
      window.location.replace('/access');
    } catch (error) {
      const message = 'Logout could not be completed. Please try again.';
      button.title = message;
      if (typeof window.toast === 'function') window.toast('error', message);
    } finally {
      pending = false;
      button.disabled = false;
      label.textContent = 'Logout';
    }
  });
})();



}
export function loadAccessModule(): void {

(function () {
  if (window.__sxAboutMeBound) return;
  window.__sxAboutMeBound = true;
  function closeModal(modal) {
    if (modal) modal.classList.add('hidden');
  }
  function openModal() {
    var modal = document.getElementById('about-me-modal');
    if (modal) modal.classList.remove('hidden');
  }
  document.addEventListener('click', function (event) {
    var openButton = event.target && event.target.closest ? event.target.closest('[data-about-open]') : null;
    if (openButton) {
      event.preventDefault();
      openModal();
      return;
    }
    var closeButton = event.target && event.target.closest ? event.target.closest('[data-about-close]') : null;
    if (closeButton) {
      closeModal(document.getElementById('about-me-modal'));
      return;
    }
    var modal = document.getElementById('about-me-modal');
    if (modal && event.target === modal) closeModal(modal);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeModal(document.getElementById('about-me-modal'));
  });
})();

(function () {
  'use strict';
  var stage = document.getElementById('systems');
  var toggle = document.getElementById('orbit-toggle');
  if (!stage || !toggle) return;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var manuallyPaused = false;
  var hovering = false, inView = true, frame = null, lastFrame = null, phase = 0;
  var path = stage.querySelector('.path-outer');
  var cards = Array.from(stage.querySelectorAll('.orbit-card')).map(function (card) {
    return {element: card, angle: parseFloat(card.style.getPropertyValue('--angle')) * Math.PI / 180 || 0};
  });
  var radiusX = 0, radiusY = 0;

  function positionCards() {
    cards.forEach(function (card) {
      var angle = card.angle + phase;
      card.element.style.transform = 'translate(-50%, -50%) translate3d(' +
        (Math.cos(angle) * radiusX).toFixed(2) + 'px,' + (Math.sin(angle) * radiusY).toFixed(2) + 'px,0)';
    });
  }
  function resizeOrbit() {
    if (!path) return;
    radiusX = path.clientWidth / 2;
    radiusY = path.clientHeight / 2;
    positionCards();
  }
  function moving() { return !manuallyPaused && !reduced.matches && !hovering && inView && !document.hidden; }
  function animate(time) {
    frame = null;
    if (!moving()) { lastFrame = null; return; }
    if (lastFrame === null) lastFrame = time;
    if (time - lastFrame >= 1000 / 30) {
      phase = (phase + Math.min(100, time - lastFrame) * Math.PI * 2 / 160000) % (Math.PI * 2);
      lastFrame = time;
      positionCards();
    }
    frame = requestAnimationFrame(animate);
  }
  function syncAnimation() {
    if (!moving()) {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null; lastFrame = null;
    } else if (frame === null) frame = requestAnimationFrame(animate);
  }

  function updateMotion() {
    var paused = manuallyPaused || reduced.matches;
    stage.classList.toggle('orbit-paused', paused);
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.setAttribute('aria-label', paused ? 'Resume orbital animation' : 'Pause orbital animation');
    toggle.querySelector('.motion-label').textContent = paused ? 'Resume orbit' : 'Pause orbit';
    toggle.querySelector('.motion-symbol').textContent = paused ? '▷' : 'Ⅱ';
    toggle.disabled = reduced.matches;
    if (reduced.matches) {
      toggle.querySelector('.motion-label').textContent = 'Reduced motion';
      toggle.setAttribute('aria-label', 'Orbital animation is disabled by your reduced motion preference');
    }
    syncAnimation();
  }

  toggle.addEventListener('click', function () { manuallyPaused = !manuallyPaused; updateMotion(); });
  if (reduced.addEventListener) reduced.addEventListener('change', updateMotion);
  cards.forEach(function (card) {
    card.element.addEventListener('pointerenter', function () { hovering = true; syncAnimation(); });
    card.element.addEventListener('pointerleave', function () { hovering = false; syncAnimation(); });
  });
  document.addEventListener('visibilitychange', syncAnimation);
  if (typeof IntersectionObserver !== 'undefined') new IntersectionObserver(function (entries) {
    inView = entries[0].isIntersecting;
    syncAnimation();
  }).observe(stage);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resizeOrbit).observe(stage);
  else window.addEventListener('resize', resizeOrbit);
  resizeOrbit();
  updateMotion();
})();

/* Keep the complete social dock visible inside the chart's native fullscreen. */
(function () {
  'use strict';
  var contact = document.querySelector('[data-sx-social-dock]');
  if (!contact) return;
  document.addEventListener('fullscreenchange', function () {
    var parent = document.fullscreenElement || document.body;
    if (contact.parentElement !== parent) parent.appendChild(contact);
  });
})();



}
