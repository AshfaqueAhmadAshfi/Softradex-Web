// @ts-nocheck
/* Consolidated TypeScript module */
import { detectSmartMoney } from './smc-core';

export function loadModule(): void {
  (window as any).SOFTRADEX_PUBLIC_ONLY = true;

// ==================== stop-liquidity.js ====================
/* Estimated SL concentrations, never private stop orders.
   Reuses SwingAI's public M5/M15 candles and the shared TradingView quote.
   Confirmed, unswept swing pivots provide evidence; repeated levels cluster.
   Zones keep their first projected TV price so they cannot follow price away
   from a hit. Observed crossings suppress the same pivot evidence on reload. */
(function () {
  'use strict';
  var symbol = '', quote = null, zones = [], suppressed = Object.create(null);
  var lastStructureAt = 0, hitCount = 0, note = 'Waiting for market structure';
  var KEEP_MS = 3 * 86400000, QUOTE_MS = 15000;
  var $ = function(id) { return document.getElementById(id); };
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function(c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  }); }
  function px(v) { return Number(v).toLocaleString('en-US', {
    minimumFractionDigits: v < 10 ? 5 : 2, maximumFractionDigits: v < 10 ? 5 : 2
  }); }
  function fresh() { return !!(quote && Date.now() - quote.at <= QUOTE_MS && quote.at <= Date.now() + 5000); }
  function storageKey() { return 'softradex.slzones.v1.' + symbol; }
  function save() {
    try { localStorage.setItem(storageKey(), JSON.stringify({zones:zones, suppressed:suppressed})); } catch(e) {}
  }
  function restore() {
    zones = []; suppressed = Object.create(null);
    try {
      var saved = JSON.parse(localStorage.getItem(storageKey()) || '{}');
      var cutoff = Date.now() - KEEP_MS;
      if (Array.isArray(saved.zones)) zones = saved.zones.filter(function(z) {
        return (z.side === 'buy' || z.side === 'sell') && Number(z.price) > 0 && z.created > cutoff && Array.isArray(z.evidence);
      });
      Object.keys(saved.suppressed || {}).forEach(function(k) {
        if (Number(saved.suppressed[k]) > cutoff) suppressed[k] = Number(saved.suppressed[k]);
      });
    } catch(e) {}
  }
  function setSymbol(next) {
    if (!next || next === symbol) return;
    symbol = String(next); quote = null; lastStructureAt = 0; hitCount = 0;
    note = 'Waiting for selected-market structure'; restore(); paint();
  }
  function pruneHits() {
    if (!fresh()) return;
    var removed = false;
    zones = zones.filter(function(z) {
      var crossed = z.side === 'buy' ? quote.price <= z.price : quote.price >= z.price;
      if (crossed) {
        z.evidence.forEach(function(key) { suppressed[key] = Date.now(); });
        hitCount++; removed = true;
      }
      return !crossed && z.created > Date.now() - KEEP_MS;
    });
    if (removed) save();
  }
  function acceptQuote(q) {
    if (!q || q.symbol !== symbol || !q.tv_symbol || !(Number(q.price) > 0) || !Number(q.at)) return;
    if (Date.now() - q.at > QUOTE_MS || q.at > Date.now() + 5000 || (quote && q.at < quote.at)) return;
    quote = {price:Number(q.price), at:Number(q.at), tv_symbol:q.tv_symbol};
    pruneHits(); scan(); paint();
  }
  function barTime(v) { return Number(v) < 1e11 ? Number(v) * 1000 : Number(v); }
  function barsFor(rows, duration) {
    return (rows || []).filter(function(b) {
      return Array.isArray(b) && b.length >= 5 && barTime(b[0]) + duration <= Date.now() &&
        [1,2,3,4].every(function(i) { return isFinite(Number(b[i])) && Number(b[i]) > 0; });
    }).slice().sort(function(a,b) { return Number(a[0]) - Number(b[0]); });
  }
  function atrOf(bars) {
    var values = [];
    for (var i = Math.max(1, bars.length - 14); i < bars.length; i++) {
      values.push(Math.max(bars[i][2] - bars[i][3], Math.abs(bars[i][2] - bars[i-1][4]), Math.abs(bars[i][3] - bars[i-1][4])));
    }
    return values.length ? values.reduce(function(a,b) { return a+b; }, 0) / values.length : 0;
  }
  function pivotEvidence(rows, tf, duration, price) {
    var bars = barsFor(rows, duration), out = [];
    if (bars.length < 15) return out;
    var scale = price / Number(bars[bars.length - 1][4]);
    var a = atrOf(bars), buffer = Math.max(a * 0.12, Number(bars[bars.length - 1][4]) * 0.000015);
    for (var i = 2; i < bars.length - 2; i++) {
      var b = bars[i], neighbours = [bars[i-2],bars[i-1],bars[i+1],bars[i+2]];
      ['buy','sell'].forEach(function(side) {
        var index = side === 'buy' ? 3 : 2, value = Number(b[index]);
        var pivot = neighbours.every(function(n) { return side === 'buy' ? value <= n[index] : value >= n[index]; }) &&
          neighbours.some(function(n) { return value !== Number(n[index]); });
        if (!pivot) return;
        var stop = value + (side === 'buy' ? -buffer : buffer);
        // Ignore levels already swept in their own source history.
        var swept = bars.slice(i+1).some(function(n) { return side === 'buy' ? n[3] <= stop : n[2] >= stop; });
        var projected = stop * scale, key = tf + ':' + side + ':' + barTime(b[0]);
        if (swept || suppressed[key] || !(projected > 0)) return;
        if (side === 'buy' ? projected >= price : projected <= price) return;
        out.push({side:side, price:projected, key:key, time:barTime(b[0]), tf:tf, band:a * scale * 0.18});
      });
    }
    return out;
  }
  function groupEvidence(candidates, price) {
    var groups = [];
    ['buy','sell'].forEach(function(side) {
      var cur = null;
      candidates.filter(function(c) { return c.side === side; }).sort(function(a,b) { return a.price-b.price; }).forEach(function(c) {
        var band = Math.max(c.band, price * 0.00004);
        if (!cur || Math.abs(c.price - cur.price) > band) {
          cur = {side:side, price:c.price, members:[]}; groups.push(cur);
        }
        cur.members.push(c);
        cur.price = cur.members.reduce(function(sum,m) { return sum+m.price; }, 0) / cur.members.length;
      });
    });
    return groups;
  }
  function scan() {
    if (!fresh() || !window.SwingAI || typeof window.SwingAI.structure !== 'function') return;
    var h = window.SwingAI.structure();
    if (!h || h.symbol !== symbol || !h.at || h.at === lastStructureAt) return;
    var frames = h.frames || {}, candidates = pivotEvidence(frames.M5, 'M5', 300000, quote.price)
      .concat(pivotEvidence(frames.M15, 'M15', 900000, quote.price));
    var groups = groupEvidence(candidates, quote.price), previous = zones, used = Object.create(null);
    zones = groups.map(function(g) {
      var evidence = g.members.map(function(m) { return m.key; }).sort();
      var old = previous.find(function(z) {
        return !used[z.id] && z.side === g.side && z.evidence.some(function(k) { return evidence.indexOf(k) >= 0; });
      });
      var touches = Object.create(null);
      g.members.forEach(function(m) { touches[Math.floor(m.time / 300000)] = true; });
      var id = old ? old.id : evidence[0]; used[id] = true;
      return {id:id, side:g.side, price:old ? old.price : g.price, evidence:evidence,
        touches:Object.keys(touches).length, frames:Array.from(new Set(g.members.map(function(m) { return m.tf; }))),
        created:old ? old.created : Date.now(), updated:Date.now()};
    });
    lastStructureAt = h.at;
    note = 'M5 / M15 · public structure';
    pruneHits(); save();
  }
  function ranked(side) {
    return zones.filter(function(z) { return z.side === side; }).sort(function(a,b) {
      return b.touches-a.touches || Math.abs(a.price-(quote ? quote.price : 0))-Math.abs(b.price-(quote ? quote.price : 0));
    });
  }
  function slzSetText(id, val) {
    var el = $(id);
    if (el && el.textContent !== val) el.textContent = val;
  }
  var lastLiqEventSig = '', liqRefreshTimer = null;
  function renderZoneRow(z, opened) {
    var side = z.side === 'sell' ? 'sell' : 'buy';
    var density = z.touches >= 4 ? 'HIGH' : z.touches >= 2 ? 'MED' : 'LOW';
    var dist = quote && quote.price > 0 ? Math.abs(z.price - quote.price) / quote.price * 100 : 0;
    var prefix = side === 'buy' ? '▼ BUY ' : '▲ SELL ';
    return '<details class="slz-row ' + side + '" data-key="' + esc(z.id) + '"' + (opened[z.id] ? ' open' : '') + '><summary>' +
      '<b>' + prefix + esc(px(z.price)) + '</b><span>' + z.touches + (z.touches === 1 ? ' TOUCH · ' : ' TOUCHES · ') + esc(z.frames.join('/')) + '</span><em>' + density + '</em><i>›</i></summary>' +
      '<div class="slz-details">Estimated stop area for ' + (side === 'buy' ? 'long / BUY' : 'short / SELL') + ' positions (' + z.touches + (z.touches === 1 ? ' touch' : ' touches') + ') · ' + dist.toFixed(2) + '% from TV price.<br>' +
      esc(z.frames.join(' + ')) + ' confirmed pivots; concentration ranks repeated structure, not actual SL order counts.<br>' +
      'First model level at ' + esc(new Date(z.created).toLocaleTimeString()) + '. Removed on an observed TV-price crossing.</div></details>';
  }
  function interleaveRankedZones(buyRows, sellRows, refPrice) {
    var combined = [], maxLen = Math.max(buyRows.length, sellRows.length);
    for (var i = 0; i < maxLen; i++) {
      var b = buyRows[i], s = sellRows[i];
      if (b && s) {
        var bDist = refPrice > 0 ? Math.abs(b.price - refPrice) : 0;
        var sDist = refPrice > 0 ? Math.abs(s.price - refPrice) : 0;
        if (bDist <= sDist) { combined.push(b); combined.push(s); }
        else { combined.push(s); combined.push(b); }
      } else if (b) {
        combined.push(b);
      } else if (s) {
        combined.push(s);
      }
    }
    return combined;
  }
  function paint() {
    if (!$('stop-liquidity-panel')) return;
    slzSetText('slz-market', symbol || 'MARKET');
    slzSetText('slz-price', quote ? px(quote.price) : '—');
    slzSetText('slz-status', !fresh() ? 'TV quote stale / unavailable' : note);
    var buyRows = ranked('buy'), sellRows = ranked('sell');
    var combinedEl = $('slz-combined-list');
    if (combinedEl) {
      var openedCombined = Object.create(null);
      if (combinedEl.querySelectorAll) {
        Array.prototype.forEach.call(combinedEl.querySelectorAll('details[open]'), function(el) { openedCombined[el.dataset.key] = true; });
      }
      slzSetText('slz-buy-count', buyRows.length + ' BUY');
      slzSetText('slz-sell-count', sellRows.length + ' SELL');
      var combinedRows = interleaveRankedZones(buyRows, sellRows, quote ? quote.price : 0);
      var combinedHtml = combinedRows.map(function(z) { return renderZoneRow(z, openedCombined); }).join('') ||
        '<div class="slz-empty">No unswept BUY or SELL SL zones confirmed yet.</div>';
      if (combinedEl.innerHTML !== combinedHtml) combinedEl.innerHTML = combinedHtml;
    } else {
      ['buy','sell'].forEach(function(side) {
        var list = $('slz-' + side + '-list'), rows = side === 'buy' ? buyRows : sellRows, opened = Object.create(null);
        if (!list) return;
        if (list.querySelectorAll) Array.prototype.forEach.call(list.querySelectorAll('details[open]'), function(el) { opened[el.dataset.key] = true; });
        slzSetText('slz-' + side + '-count', rows.length + ' zones');
        var html = rows.map(function(z) { return renderZoneRow(z, opened); }).join('') ||
          '<div class="slz-empty">No unswept ' + (side === 'buy' ? 'lower' : 'upper') + ' zone confirmed yet.</div>';
        if (list.innerHTML !== html) list.innerHTML = html;
      });
    }
    slzSetText('slz-foot', (hitCount ? hitCount + ' crossed zone(s) removed · ' : '') +
      'Estimated BUY & SELL SL levels · removed on observed TV quote crossing.');
    var nextEventSig = symbol + '|' + lastStructureAt + '|' + hitCount + '|' + zones.map(function(z) { return z.id + ':' + z.touches; }).join(',');
    if (nextEventSig !== lastLiqEventSig) {
      lastLiqEventSig = nextEventSig;
      window.dispatchEvent(new CustomEvent('chart:liquidity-zones', {detail:snapshot()}));
    }
  }
  function refresh() { if (document.hidden) return; acceptQuote(window.SOFT_TV_QUOTE); scan(); paint(); }
  function scheduleRefresh() {
    if (document.hidden || liqRefreshTimer) return;
    liqRefreshTimer = setTimeout(function() { liqRefreshTimer = null; refresh(); }, 120);
  }
  function init() {
    if (!$('stop-liquidity-panel')) return;
    var term = window.SoftradeXTerminal;
    setSymbol(term && term.getCurrentSymbol ? term.getCurrentSymbol() : 'XAUUSDm');
    window.addEventListener('chart:market', function(ev) { var d = ev.detail || {}; setSymbol(d.symbol || (d.meta && d.meta.symbol)); refresh(); });
    window.addEventListener('chart:tv-quote', function(ev) { if (acceptQuote(ev.detail)) scheduleRefresh(); });
    window.addEventListener('swing:structure', scheduleRefresh);
    window.addEventListener('chart:refresh', scheduleRefresh);
    document.addEventListener('visibilitychange', function() { if (!document.hidden) refresh(); });
    setInterval(function() { if (!document.hidden) refresh(); }, 3000);
    refresh();
  }
  function snapshot() {
    var visible = ranked('buy').slice(0,4).concat(ranked('sell').slice(0,4));
    return {symbol:symbol, price:quote ? quote.price : 0, fresh:fresh(), source:'estimated public structure',
      tvSymbol:quote ? quote.tv_symbol : '',
      zones:zones.map(function(z) { return Object.assign({}, z); }),
      visibleZones:visible.map(function(z) { return Object.assign({}, z); }), removed:hitCount, structureAt:lastStructureAt};
  }
  window.StopLiquidity = {refresh:refresh, state:snapshot};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();


// ==================== profit-systems.js ====================
/* Smart Money Order Blocks / FVG & Profit Radar TP/SL + Risk Sizer.
   --------------------------------------------------------------------------
   Fills the two workspace slots with institutional trading intelligence:
   1. #smart-money-panel (left sidebar beneath NEXT SELL SWING AI):
      Detects unmitigated Bullish/Bearish Order Blocks (OB), Fair Value Gaps
      (FVG) and Fibonacci Golden Pocket (OTE 61.8%-70.5%) entry zones from
      closed M5 / M15 / H1 candles projected to the live TradingView quote.
   2. #profit-radar-panel (center bottom row beside SL · LIQUIDITY ZONES):
      Synthesizes 6-Timeframe Trend, VWAP, 13-Venue Order Flow, Stop-Liquidity
      Sweep Protection and ATR into an executable Entry / Safe-SL / Break-Even /
      TP1 / TP2 plan plus a $10 / $25 / $50 / $100 Risk & Lot Size calculator.
   -------------------------------------------------------------------------- */
(function (root) {
  'use strict';

  var document = root.document;
  var $ = function (id) { return document ? document.getElementById(id) : null; };
  var QUOTE_MS = 15000;
  var RISK_TIERS = [10, 25, 50, 100];

  var symbol = '';
  var activeTf = '5m';
  var quote = null;
  var smcZones = { buy: [], sell: [] };
  var radarPlan = null;
  var nextCandlePred = null;
  var tickHistory = [];
  var curTargetBars = Object.create(null);
  var ncpLastVerdicts = Object.create(null);
  var ncpPendingLocks = Object.create(null);
  var ncpFixedLocks = Object.create(null);
  var ncpHistories = Object.create(null);
  var ncpRegimeCache = null;
  var NCP_HIST_KEY = 'softradex.ncp.history.v1.';
  var NCP_LOCK_KEY = 'softradex.ncp.lock.v1.';
  var lastStructureAt = 0;

  var NCP_TFS = {
    '1m':  { tf: '1m',  key: 'M1',  label: '1M',  ms: 60000,    ltf: 'M1',  mid: 'M5',  htf: 'M15', lockSecs: 15 },
    '5m':  { tf: '5m',  key: 'M5',  label: '5M',  ms: 300000,   ltf: 'M1',  mid: 'M15', htf: 'H1',  lockSecs: 45 },
    '15m': { tf: '15m', key: 'M15', label: '15M', ms: 900000,   ltf: 'M5',  mid: 'H1',  htf: 'H4',  lockSecs: 90 },
    '1h':  { tf: '1h',  key: 'H1',  label: '1H',  ms: 3600000,  ltf: 'M15', mid: 'H4',  htf: 'D1',  lockSecs: 180 },
    '4h':  { tf: '4h',  key: 'H4',  label: '4H',  ms: 14400000, ltf: 'H1',  mid: 'D1',  htf: 'D1',  lockSecs: 300 },
    '1d':  { tf: '1d',  key: 'D1',  label: '1D',  ms: 86400000, ltf: 'H4',  mid: 'D1',  htf: 'D1',  lockSecs: 600 }
  };
  var NCP_TFS_BY_KEY = Object.create(null);
  Object.keys(NCP_TFS).forEach(function (k) { NCP_TFS_BY_KEY[NCP_TFS[k].key] = NCP_TFS[k]; });

  function currentChartTf() {
    var term = root.SoftradeXTerminal || root.BinanceTerminal;
    if (term) {
      var tf = '';
      if (typeof term.getCurrentInterval === 'function') tf = String(term.getCurrentInterval() || '');
      else if (typeof term.getInterval === 'function') tf = String(term.getInterval() || '');
      if (NCP_TFS[tf]) return tf;
    }
    var ci = root.ChartIndicators;
    if (ci && typeof ci.state === 'function') {
      var st = ci.state();
      if (st && NCP_TFS[st.tf]) return st.tf;
    }
    return NCP_TFS[activeTf] ? activeTf : '5m';
  }

  function formatCountdown(secs) {
    var s = Math.max(0, Math.round(Number(secs) || 0));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var rem = s % 60;
    if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(rem).padStart(2, '0');
    return m + ':' + String(rem).padStart(2, '0');
  }

  function ncpHistoryFor(tf) {
    var key = NCP_TFS[tf] ? tf : '5m';
    if (Array.isArray(ncpHistories[key])) return ncpHistories[key];
    var loaded = [];
    if (symbol) {
      try {
        var rawStr = localStorage.getItem(NCP_HIST_KEY + symbol + '.' + key);
        if (!rawStr && key === '5m') rawStr = localStorage.getItem(NCP_HIST_KEY + symbol);
        var raw = JSON.parse(rawStr || '[]');
        if (Array.isArray(raw)) {
          loaded = raw.filter(function (x) {
            return x && (x.side === 'BUY' || x.side === 'SELL') && typeof x.won === 'boolean';
          }).slice(-25);
        }
      } catch (e) {}
    }
    ncpHistories[key] = loaded;
    return loaded;
  }

  function saveNcpHistory(tf) {
    var key = NCP_TFS[tf] ? tf : '5m';
    if (!symbol) return;
    try {
      var list = ncpHistoryFor(key).slice(-25);
      localStorage.setItem(NCP_HIST_KEY + symbol + '.' + key, JSON.stringify(list));
    } catch (e) {}
  }

  function loadNcpLock(sym, tf) {
    var key = NCP_TFS[tf] ? tf : '5m';
    if (ncpFixedLocks[key] && ncpFixedLocks[key].symbol === sym) return ncpFixedLocks[key];
    if (!sym) return null;
    try {
      var raw = JSON.parse(localStorage.getItem(NCP_LOCK_KEY + sym + '.' + key) || 'null');
      if (raw && raw.version === 2 && raw.symbol === sym && raw.tf === key && raw.prediction &&
          Number(raw.prediction.projOpen) > 0 && Number(raw.prediction.projClose) > 0 &&
          Number(raw.prediction.projHigh) > 0 && Number(raw.prediction.projLow) > 0) {
        ncpFixedLocks[key] = raw;
        return raw;
      }
    } catch (e) {}
    return null;
  }

  function saveNcpLock(sym, tf, lockObj) {
    var key = NCP_TFS[tf] ? tf : '5m';
    ncpFixedLocks[key] = lockObj || null;
    if (!sym) return;
    try {
      if (lockObj) localStorage.setItem(NCP_LOCK_KEY + sym + '.' + key, JSON.stringify(lockObj));
      else localStorage.removeItem(NCP_LOCK_KEY + sym + '.' + key);
    } catch (e) {}
  }

  function compactUsd(v) {
    var n = Math.abs(Number(v) || 0);
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(2) + 'M';
    if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'K';
    return '$' + n.toFixed(0);
  }

  function updateFormingBar(bar, barId, p) {
    if (!bar || bar.barId !== barId) {
      return { barId: barId, open: p, high: p, low: p, close: p, ticks: 1 };
    }
    if (p > bar.high) bar.high = p;
    if (p < bar.low) bar.low = p;
    bar.close = p;
    bar.ticks++;
    return bar;
  }

  function recordTick(sym, priceVal, atMs) {
    if (!sym || canonicalSymbol(sym) !== canonicalSymbol(symbol)) return;
    var p = Number(priceVal);
    var t = Number(atMs) || Date.now();
    if (!(p > 0) || !Number.isFinite(t)) return;
    Object.keys(NCP_TFS).forEach(function (tfKey) {
      var barId = Math.floor(t / NCP_TFS[tfKey].ms);
      curTargetBars[tfKey] = updateFormingBar(curTargetBars[tfKey], barId, p);
    });
    var last = tickHistory.length ? tickHistory[tickHistory.length - 1] : null;
    if (last && t <= last.at && Math.abs(p - last.price) < 1e-12) return;
    tickHistory.push({ price: p, at: t });
    var cutoff = Date.now() - 120000;
    if (tickHistory.length > 240 || (tickHistory[0] && tickHistory[0].at < cutoff)) {
      tickHistory = tickHistory.filter(function (item) { return item.at >= cutoff; }).slice(-240);
    }
  }

  function allValidBars(rows) {
    return (rows || []).filter(function (b) {
      return Array.isArray(b) && b.length >= 5 &&
        [1, 2, 3, 4].every(function (i) { return Number.isFinite(Number(b[i])) && Number(b[i]) > 0; });
    }).slice().sort(function (a, b) { return barTime(a[0]) - barTime(b[0]); });
  }

  function classifyCandlePattern(o1, h1, l1, c1, o2, h2, l2, c2, streakUp, streakDn, readObj) {
    var range = Math.max(h1 - l1, c1 * 0.00005);
    var body = Math.abs(c1 - o1);
    var bodyPct = Math.round((body / range) * 100);
    var upperWick = Math.max(0, h1 - Math.max(o1, c1));
    var lowerWick = Math.max(0, Math.min(o1, c1) - l1);
    var upperWickPct = Math.min(100, Math.round((upperWick / range) * 100));
    var lowerWickPct = Math.min(100, Math.round((lowerWick / range) * 100));
    var clv = Math.min(100, Math.max(0, Math.round(((c1 - l1) / range) * 100)));
    var rRsi = Number(readObj && readObj.rsi);
    var pctB = Number(readObj && readObj.bb && readObj.bb.pctB);

    var sweepSide = '';
    if (l1 < l2 && c1 > l2 && lowerWickPct >= 34 && clv >= 52) sweepSide = 'BUY';
    else if (h1 > h2 && c1 < h2 && upperWickPct >= 34 && clv <= 48) sweepSide = 'SELL';

    var patternKey = 'NEUTRAL';
    var patternLabel = 'BALANCED';
    var patternDir = 0;

    if (sweepSide === 'BUY') {
      patternKey = 'SWEEP_BUY'; patternLabel = 'SWEEP ↑'; patternDir = 1.4;
    } else if (sweepSide === 'SELL') {
      patternKey = 'SWEEP_SELL'; patternLabel = 'SWEEP ↓'; patternDir = -1.4;
    } else if (c2 < o2 && c1 > o1 && c1 >= o2 && o1 <= c2 && bodyPct >= 45) {
      patternKey = 'BULL_ENGULF'; patternLabel = 'ENGULF ↑'; patternDir = 1.3;
    } else if (c2 > o2 && c1 < o1 && c1 <= o2 && o1 >= c2 && bodyPct >= 45) {
      patternKey = 'BEAR_ENGULF'; patternLabel = 'ENGULF ↓'; patternDir = -1.3;
    } else if (lowerWickPct >= 42 && clv >= 58) {
      patternKey = 'HAMMER'; patternLabel = 'HAMMER ↑'; patternDir = 1.15;
    } else if (upperWickPct >= 42 && clv <= 42) {
      patternKey = 'SHOOT_STAR'; patternLabel = 'SHOOT ↓'; patternDir = -1.15;
    } else if (streakUp >= 3 && ((Number.isFinite(rRsi) && rRsi >= 70) || (Number.isFinite(pctB) && pctB >= 92))) {
      patternKey = 'CLIMAX_TOP'; patternLabel = 'EXHAUST TOP'; patternDir = -1.1;
    } else if (streakDn >= 3 && ((Number.isFinite(rRsi) && rRsi <= 30) || (Number.isFinite(pctB) && pctB <= 8))) {
      patternKey = 'CLIMAX_BOT'; patternLabel = 'EXHAUST BOT'; patternDir = 1.1;
    } else if (c1 > o1 && clv >= 72 && bodyPct >= 52) {
      patternKey = 'BULL_DRIVE'; patternLabel = 'BULL DRIVE'; patternDir = 0.95;
    } else if (c1 < o1 && clv <= 28 && bodyPct >= 52) {
      patternKey = 'BEAR_DRIVE'; patternLabel = 'BEAR DRIVE'; patternDir = -0.95;
    } else if (bodyPct <= 18) {
      patternKey = 'DOJI'; patternLabel = 'DOJI CHOP'; patternDir = 0;
    } else if (c1 > o1) {
      patternKey = 'BULL_BODY'; patternLabel = 'BULL BAR'; patternDir = 0.45;
    } else if (c1 < o1) {
      patternKey = 'BEAR_BODY'; patternLabel = 'BEAR BAR'; patternDir = -0.45;
    }

    return {
      patternKey: patternKey,
      patternLabel: patternLabel,
      patternDir: patternDir,
      bodyPct: bodyPct,
      upperWickPct: upperWickPct,
      lowerWickPct: lowerWickPct,
      clv: clv,
      sweepSide: sweepSide
    };
  }

  function calibrateRegime(bars, sym, tfKey) {
    if (!bars || bars.length < 18) {
      return { regime: 'BALANCED', autocorr: 0, patternStats: Object.create(null), samples: 0 };
    }
    var lastT = barTime(bars[bars.length - 1][0]);
    var cacheKey = (sym || symbol) + '|' + (tfKey || '5m') + '|' + lastT + '|' + bars.length;
    if (ncpRegimeCache && ncpRegimeCache.key === cacheKey) return ncpRegimeCache.val;

    var slice = bars.slice(-92);
    var rets = [];
    for (var i = 0; i < slice.length; i++) {
      var o = Number(slice[i][1]), c = Number(slice[i][4]);
      rets.push(o > 0 ? (c - o) / o : 0);
    }
    // 1-bar lag autocorrelation over recent 45 bars detects Trend vs Mean-Reversion regime
    var acSlice = rets.slice(-46);
    var num = 0, den1 = 0, den2 = 0;
    for (var j = 1; j < acSlice.length; j++) {
      num += acSlice[j] * acSlice[j - 1];
      den1 += acSlice[j - 1] * acSlice[j - 1];
      den2 += acSlice[j] * acSlice[j];
    }
    var autocorr = (den1 > 0 && den2 > 0) ? (num / Math.sqrt(den1 * den2)) : 0;
    var regime = autocorr >= 0.08 ? 'TREND' : autocorr <= -0.08 ? 'MEANREV' : 'BALANCED';

    var stats = Object.create(null);
    var sUp = 0, sDn = 0;
    for (var k = 1; k < slice.length - 1; k++) {
      var b = slice[k], prev = slice[k - 1], next = slice[k + 1];
      var bo = Number(b[1]), bh = Number(b[2]), bl = Number(b[3]), bc = Number(b[4]);
      if (bc > bo) { sUp++; sDn = 0; } else if (bc < bo) { sDn++; sUp = 0; } else { sUp = 0; sDn = 0; }
      var cls = classifyCandlePattern(bo, bh, bl, bc, Number(prev[1]), Number(prev[2]), Number(prev[3]), Number(prev[4]), sUp, sDn, null);
      var nextUp = Number(next[4]) >= Number(next[1]) ? 1 : 0;
      if (!stats[cls.patternKey]) stats[cls.patternKey] = { up: 0, total: 0 };
      stats[cls.patternKey].up += nextUp;
      stats[cls.patternKey].total += 1;
    }

    var val = { regime: regime, autocorr: autocorr, patternStats: stats, samples: Math.max(0, slice.length - 2) };
    ncpRegimeCache = { key: cacheKey, val: val };
    return val;
  }

  function analyzeFrameMomentum(bars, currentPrice, atrVal, readObj, regime) {
    if (!bars || bars.length < 3) {
      return {
        score: 0, upperWickPct: 0, lowerWickPct: 0, clv: 50, bodyPct: 0,
        volRatio: 1, sweepSide: '', patternKey: 'NEUTRAL', patternLabel: 'SCANNING'
      };
    }
    var n = bars.length;
    var b1 = bars[n - 1], b2 = bars[n - 2], b3 = bars[n - 3];
    var scale = Number(b1[4]) > 0 && Math.abs(currentPrice - Number(b1[4])) / currentPrice > 0.02
      ? currentPrice / Number(b1[4]) : 1;
    var o1 = Number(b1[1]) * scale, h1 = Number(b1[2]) * scale, l1 = Number(b1[3]) * scale, c1 = Number(b1[4]) * scale;
    var o2 = Number(b2[1]) * scale, h2 = Number(b2[2]) * scale, l2 = Number(b2[3]) * scale, c2 = Number(b2[4]) * scale;
    var c3 = Number(b3[4]) * scale;

    var streakUp = 0, streakDn = 0;
    for (var s = n - 1; s >= Math.max(0, n - 5); s--) {
      if (Number(bars[s][4]) > Number(bars[s][1])) {
        if (streakDn > 0) break;
        streakUp++;
      } else if (Number(bars[s][4]) < Number(bars[s][1])) {
        if (streakUp > 0) break;
        streakDn++;
      } else break;
    }

    var pat = classifyCandlePattern(o1, h1, l1, c1, o2, h2, l2, c2, streakUp, streakDn, readObj);

    // Volume conviction ratio against recent 10-bar average
    var vol1 = Number(b1[5]) || 0, volSum = 0, volCnt = 0;
    for (var v = Math.max(0, n - 11); v < n - 1; v++) {
      var vv = Number(bars[v][5]) || 0;
      if (vv > 0) { volSum += vv; volCnt++; }
    }
    var volRatio = (vol1 > 0 && volCnt >= 3 && volSum > 0) ? (vol1 / (volSum / volCnt)) : 1;

    var score = pat.patternDir;
    // Close Location Value (CLV) directional pressure
    if (pat.clv >= 72) score += (regime === 'MEANREV' && streakUp >= 3 ? -0.35 : 0.75);
    else if (pat.clv <= 28) score -= (regime === 'MEANREV' && streakDn >= 3 ? -0.35 : 0.75);

    // 3-bar trend vs exhaustion handling
    if (c1 > c2 && c2 > c3) score += (pat.patternKey === 'CLIMAX_TOP' ? -0.6 : regime === 'MEANREV' ? 0.15 : 0.65);
    else if (c1 < c2 && c2 < c3) score -= (pat.patternKey === 'CLIMAX_BOT' ? -0.6 : regime === 'MEANREV' ? 0.15 : 0.65);

    // Volume ignition vs climax wick
    if (volRatio >= 1.35) {
      if (pat.bodyPct >= 55) score += (c1 >= o1 ? 0.65 : -0.65);
      else if (pat.lowerWickPct >= 45) score += 0.75;
      else if (pat.upperWickPct >= 45) score -= 0.75;
    }

    return {
      score: score,
      upperWickPct: pat.upperWickPct,
      lowerWickPct: pat.lowerWickPct,
      clv: pat.clv,
      bodyPct: pat.bodyPct,
      volRatio: volRatio,
      sweepSide: pat.sweepSide,
      patternKey: pat.patternKey,
      patternLabel: pat.patternLabel
    };
  }

  function renderDetailRows(listEl, rows, extraClass) {
    if (!listEl) return;
    var opened = Object.create(null);
    if (listEl.querySelectorAll) {
      Array.prototype.forEach.call(listEl.querySelectorAll('details[open]'), function (el) {
        opened[el.dataset.key] = true;
      });
    }
    var html = rows.map(function (r) {
      return '<details class="slz-row prp-row ' + (extraClass ? extraClass + ' ' : '') + r.cls + '" data-key="' + esc(r.key) + '"' + (opened[r.key] ? ' open' : '') + '>' +
        '<summary>' +
          '<b>' + esc(r.title) + '</b>' +
          '<span>' + esc(r.sub) + '</span>' +
          '<em>' + esc(r.tag) + '</em>' +
          '<i>›</i>' +
        '</summary>' +
        '<div class="slz-details prp-details">' + r.details + '</div>' +
      '</details>';
    }).join('');
    if (listEl.innerHTML !== html) listEl.innerHTML = html;
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function cleanSymbol(v) {
    return String(v || '').trim().replace(/m$/i, '').toUpperCase();
  }

  function canonicalSymbol(v) {
    if (root.DashboardPanels && typeof root.DashboardPanels.canonical === 'function') {
      return root.DashboardPanels.canonical(v);
    }
    var key = cleanSymbol(v).replace(/[^A-Z0-9]/g, '');
    return ({
      XAUUSD247: 'XAUUSD',
      GOLD: 'XAUUSD',
      BTCUSD: 'BTCUSDT',
      ETHUSD: 'ETHUSDT',
      NAS100: 'USTEC',
      USTECX100: 'USTEC',
      NDX: 'USTEC'
    })[key] || key;
  }

  function px(v, sym) {
    var n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return '—';
    var clean = cleanSymbol(sym || symbol);
    var digits = n < 0.01 ? 6 : n < 1 ? 5 : n < 10 ? 5
      : /JPY/.test(clean) && n < 1000 ? 3 : 2;
    return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function money(v) {
    var n = Number(v);
    if (!Number.isFinite(n)) return '$0.00';
    return (n < 0 ? '-$' : '+$') + Math.abs(n).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function barTime(v) {
    var n = Number(v);
    return n < 1e11 ? n * 1000 : n;
  }

  function barsFor(rows, duration, nowMs) {
    var cutoff = Number(nowMs) || Date.now();
    return (rows || []).filter(function (b) {
      return Array.isArray(b) && b.length >= 5 && barTime(b[0]) + duration <= cutoff &&
        [1, 2, 3, 4].every(function (i) { return Number.isFinite(Number(b[i])) && Number(b[i]) > 0; });
    }).slice().sort(function (a, b) { return barTime(a[0]) - barTime(b[0]); });
  }

  function atrOf(bars) {
    if (!bars || bars.length < 2) return 0;
    var values = [];
    for (var i = Math.max(1, bars.length - 14); i < bars.length; i++) {
      var h = Number(bars[i][2]), l = Number(bars[i][3]), prevC = Number(bars[i - 1][4]);
      values.push(Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC)));
    }
    return values.length ? values.reduce(function (a, b) { return a + b; }, 0) / values.length : 0;
  }

  function medianVal(arr) {
    if (!arr || !arr.length) return 0;
    var sorted = arr.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) * 0.5;
  }

  function measureCandleGeometry(bars, atrVal, currentPrice) {
    if (!bars || bars.length < 3) {
      return {
        body: atrVal * 0.52,
        bullBody: atrVal * 0.52,
        bearBody: atrVal * 0.52,
        upperWick: atrVal * 0.22,
        lowerWick: atrVal * 0.22,
        range: atrVal
      };
    }
    var slice = bars.slice(-24);
    var refClose = Number(slice[slice.length - 1][4]) || currentPrice;
    var scale = refClose > 0 && currentPrice > 0 && Math.abs(currentPrice - refClose) / currentPrice > 0.02
      ? currentPrice / refClose : 1;
    var bodies = [], bullBodies = [], bearBodies = [], upWicks = [], dnWicks = [], ranges = [];
    slice.forEach(function (b) {
      var o = Number(b[1]) * scale, h = Number(b[2]) * scale, l = Number(b[3]) * scale, c = Number(b[4]) * scale;
      if (!(o > 0 && h >= l && c > 0)) return;
      var bd = Math.abs(c - o);
      bodies.push(bd);
      if (c > o) bullBodies.push(bd);
      else if (c < o) bearBodies.push(bd);
      upWicks.push(Math.max(0, h - Math.max(o, c)));
      dnWicks.push(Math.max(0, Math.min(o, c) - l));
      ranges.push(Math.max(0, h - l));
    });
    function blendMeanMedian(list, fallback) {
      if (!list.length) return fallback;
      var avg = list.reduce(function (s, v) { return s + v; }, 0) / list.length;
      return avg * 0.5 + medianVal(list) * 0.5;
    }
    var allBody = blendMeanMedian(bodies, atrVal * 0.52);
    return {
      body: allBody,
      bullBody: blendMeanMedian(bullBodies, allBody),
      bearBody: blendMeanMedian(bearBodies, allBody),
      upperWick: blendMeanMedian(upWicks, atrVal * 0.22),
      lowerWick: blendMeanMedian(dnWicks, atrVal * 0.22),
      range: blendMeanMedian(ranges, atrVal)
    };
  }

  function roundPriceDigits(v, digits) {
    var n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return n;
    var factor = Math.pow(10, digits);
    return Math.round(n * factor) / factor;
  }

  function isUsdDollarAsset(sym) {
    var clean = cleanSymbol(sym);
    return (/USD$/.test(clean) && !/^(EURUSD|GBPUSD|AUDUSD|NZDUSD)$/i.test(clean)) ||
      /^(XAU|XAG|XPT|XPD|USOIL|UKOIL|XNG|BTC|ETH|SOL|BNB|XRP|ADA|DOGE|LTC|AVAX|LINK|DOT|TRX|SHIB|BCH|TON|SUI|NEAR|APT|UNI|AAVE|ONDO|PEPE|AAPL|MSFT|AMZN|GOOGL|TSLA|NVDA|META|INTC|AMD|NFLX|JPM|BA|DIS|NKE|COIN|PFE|V|MA|KO|WMT|XOM)/i.test(clean);
  }

  function formatMoveDelta(sym, moveVal, isBuy, digits) {
    var mag = Math.abs(Number(moveVal) || 0);
    var sign = isBuy ? '+' : '-';
    var prefix = isUsdDollarAsset(sym) ? '$' : '';
    return sign + prefix + mag.toFixed(digits);
  }

  // Contract value per 1.00 standard MT5 lot for 1.0 price-unit move.
  function lotUnitValue(sym, currentPrice) {
    var s = cleanSymbol(sym);
    var p = Number(currentPrice) || 1;
    if (/^(XAU|GOLD)/.test(s)) return { mult: 100, unit: '100 oz/lot', minLot: 0.01 };
    if (/^(XAG|SILVER)/.test(s)) return { mult: 5000, unit: '5,000 oz/lot', minLot: 0.01 };
    if (/^(USOIL|UKOIL|XTI|XBR|WTI|CL)/.test(s)) return { mult: 1000, unit: '1,000 bbl/lot', minLot: 0.01 };
    if (/^(BTC|ETH|SOL|BNB|BCH|LTC|AVAX|LINK|DOT|AAVE)/.test(s)) return { mult: 1, unit: '1 coin/lot', minLot: 0.01 };
    if (/^(XRP|ADA|DOGE|TRX|TON|SUI|NEAR|APT|UNI|ONDO|SHIB|PEPE)/.test(s)) {
      var scale = p < 0.01 ? 100000 : p < 1 ? 1000 : 100;
      return { mult: scale, unit: scale.toLocaleString('en-US') + ' coins/lot', minLot: 0.01 };
    }
    if (/^(USTEC|NAS100|US30|US500|SPX|DE40|UK100|JP225|DXY|USDX)/.test(s)) {
      return { mult: 1, unit: '1 idx/lot', minLot: 0.01 };
    }
    if (/JPY$/.test(s) && p > 10) {
      return { mult: 100000 / p, unit: '100k FX/lot', minLot: 0.01 };
    }
    if (/^[A-Z]{6}$/.test(s)) {
      return { mult: 100000, unit: '100k FX/lot', minLot: 0.01 };
    }
    return { mult: 1, unit: '1 unit/lot', minLot: 0.01 };
  }

  // Smart Money OB / FVG / OTE detection is shared via detectSmartMoney in smc-core.ts.

  // Synthesize 6-Factor Confluence, Safe SL (beyond SL liquidity clusters) & Lot Sizing.
  function computeProfitRadar(ctx) {
    var sym = (ctx && ctx.symbol) || symbol || 'XAUUSDm';
    var price = Number(ctx && ctx.price) || (quote ? quote.price : 0);
    if (!(price > 0)) return null;

    var swing = (ctx && ctx.swing) || (root.SwingAI && typeof root.SwingAI.state === 'function' ? root.SwingAI.state() : null) || {};
    var reads = swing.reads || {};
    var m5 = reads.M5 || {};
    var m15 = reads.M15 || {};
    var h1 = reads.H1 || {};
    var h4 = reads.H4 || {};
    var d1 = reads.D1 || {};
    var slState = (ctx && ctx.stopLiquidity) || (root.StopLiquidity && typeof root.StopLiquidity.state === 'function' ? root.StopLiquidity.state() : null) || {};
    var slZones = Array.isArray(slState.zones) ? slState.zones : [];
    var flowTotals = (ctx && ctx.orderFlow) || (root.MultiExchangeOrderFlow && typeof root.MultiExchangeOrderFlow.getOpenTotals === 'function' ? root.MultiExchangeOrderFlow.getOpenTotals() : null) || {};
    var smc = (ctx && ctx.smc) || smcZones || { buy: [], sell: [] };

    // 1. HTF Trend Score (H1 + H4 + D1)
    var htfScore = (Number(h1.score) || 0) + (Number(h4.score) || 0) * 1.2 + (Number(d1.score) || 0) * 1.5;
    var htfSide = htfScore >= 2 ? 'BUY' : htfScore <= -2 ? 'SELL' : 'NEUTRAL';

    // 2. LTF Momentum Score (M5 + M15)
    var ltfScore = (Number(m5.score) || 0) + (Number(m15.score) || 0) * 1.25;
    var ltfSide = ltfScore >= 2 ? 'BUY' : ltfScore <= -2 ? 'SELL' : 'NEUTRAL';

    // 3. Institutional VWAP Position
    var refVwap = Number(m5.vwap) || Number(m15.vwap) || 0;
    var vwapSide = refVwap > 0 ? (price > refVwap * 1.0001 ? 'BUY' : price < refVwap * 0.9999 ? 'SELL' : 'NEUTRAL') : 'NEUTRAL';

    // 4. 13-Venue Order Flow Bias (45s)
    var flowBuy = Number(flowTotals.buy) || 0;
    var flowSell = Number(flowTotals.sell) || 0;
    var flowPct = (flowBuy + flowSell) > 0
      ? Math.round((flowBuy / (flowBuy + flowSell)) * 100)
      : Math.round(Number(swing.flowBias) || 50);
    var flowSide = flowPct >= 55 ? 'BUY' : flowPct <= 45 ? 'SELL' : 'NEUTRAL';

    // 5. Smart Money Demand / Supply Proximity
    var nearBuyOb = smc.buy && smc.buy[0];
    var nearSellOb = smc.sell && smc.sell[0];
    var smcSide = nearBuyOb && (!nearSellOb || nearBuyOb.distPct <= nearSellOb.distPct) ? 'BUY'
      : nearSellOb ? 'SELL' : 'NEUTRAL';

    // 6. Determine dominant trade direction & confluence percentage
    var buyPoints = 0, sellPoints = 0;
    if (htfSide === 'BUY') buyPoints += 28; else if (htfSide === 'SELL') sellPoints += 28;
    if (ltfSide === 'BUY') buyPoints += 24; else if (ltfSide === 'SELL') sellPoints += 24;
    if (vwapSide === 'BUY') buyPoints += 16; else if (vwapSide === 'SELL') sellPoints += 16;
    if (flowSide === 'BUY') buyPoints += 16; else if (flowSide === 'SELL') sellPoints += 16;
    if (smcSide === 'BUY') buyPoints += 16; else if (smcSide === 'SELL') sellPoints += 16;

    var activePlan = swing.plan && !swing.plan.doneAt && !swing.plan.hit ? swing.plan : null;
    var side = activePlan ? activePlan.side
      : buyPoints > sellPoints ? 'BUY'
      : sellPoints > buyPoints ? 'SELL'
      : (swing.vote && (swing.vote.side === 'BUY' || swing.vote.side === 'SELL') ? swing.vote.side : 'BUY');

    var alignedPoints = side === 'BUY' ? buyPoints : sellPoints;
    var edgePct = activePlan ? Math.max(alignedPoints, Number(activePlan.confidence) || 65) : alignedPoints;
    var strongEdge = (side === 'BUY' && buyPoints >= 52 && buyPoints >= sellPoints + 12) ||
      (side === 'SELL' && sellPoints >= 52 && sellPoints >= buyPoints + 12) || !!activePlan;

    // ATR fallback (M5 -> M15 -> H1 -> 0.25% of price)
    var baseAtr = Number(m5.atr) || (Number(m15.atr) ? Number(m15.atr) * 0.65 : 0) || (price * 0.0022);
    if (m5.close > 0 && Math.abs(price - m5.close) / price > 0.02) {
      baseAtr = baseAtr * (price / m5.close);
    }

    // Entry & Stop-Hunt Protected SL calculation
    var isBuy = side === 'BUY';
    var entry = activePlan ? Number(activePlan.observedEntry || activePlan.entry)
      : isBuy && nearBuyOb && nearBuyOb.distPct <= 0.35 ? nearBuyOb.entry
      : !isBuy && nearSellOb && nearSellOb.distPct <= 0.35 ? nearSellOb.entry
      : price;

    var rawStop = activePlan ? Number(activePlan.stop)
      : isBuy ? entry - baseAtr * 1.35 : entry + baseAtr * 1.35;

    // Protect SL against nearby Stop-Liquidity Pools (place SL beyond the pool!)
    var slPoolProtected = false;
    var sameSidePools = slZones.filter(function (z) {
      return z.side === (isBuy ? 'buy' : 'sell') &&
        (isBuy ? z.price < entry && z.price >= entry - baseAtr * 2.6
               : z.price > entry && z.price <= entry + baseAtr * 2.6);
    });
    if (!activePlan && sameSidePools.length) {
      var nearestPool = sameSidePools[0].price;
      var safeStop = isBuy ? nearestPool - baseAtr * 0.25 : nearestPool + baseAtr * 0.25;
      if (isBuy ? safeStop < rawStop : safeStop > rawStop) {
        rawStop = safeStop;
        slPoolProtected = true;
      }
    }

    var stopDist = Math.max(price * 0.0004, Math.abs(entry - rawStop));
    var stop = isBuy ? entry - stopDist : entry + stopDist;
    var beTrigger = isBuy ? entry + stopDist : entry - stopDist;
    var tp2 = activePlan && Number(activePlan.target) > 0
      ? Number(activePlan.target)
      : (isBuy ? entry + stopDist * 2.5 : entry - stopDist * 2.5);
    var tp1Dist = Math.min(stopDist * 1.5, Math.abs(tp2 - entry) * 0.6);
    var tp1 = isBuy ? entry + tp1Dist : entry - tp1Dist;
    var tp1R = tp1Dist / stopDist;
    var rr = Math.abs(tp2 - entry) / stopDist;

    // 6-Factor Checklist items
    var checks = [
      { label: 'HTF Trend (H1/H4/D1)', ok: htfSide === side, value: htfSide },
      { label: 'LTF Structure (M5/M15)', ok: ltfSide === side, value: ltfSide },
      { label: 'Session VWAP Bias', ok: vwapSide === side, value: refVwap > 0 ? px(refVwap, sym) : 'WAIT' },
      { label: '13-Venue Order Flow', ok: flowSide === side, value: flowPct + '% BUY' },
      { label: 'SMC Demand/Supply', ok: smcSide === side, value: smcSide === 'BUY' && nearBuyOb ? nearBuyOb.kind : smcSide === 'SELL' && nearSellOb ? nearSellOb.kind : 'SCAN' },
      { label: 'SL Hunt Protection', ok: true, value: slPoolProtected ? 'POOL BUFFERED' : 'ATR BUFFERED' }
    ];

    // Position sizing for $10, $25, $50, $100 risk tiers
    var spec = lotUnitValue(sym, price);
    var lossPerOneLot = Math.max(0.0001, stopDist * spec.mult);
    var sizing = RISK_TIERS.map(function (riskUsd) {
      var rawLots = riskUsd / lossPerOneLot;
      var lots = Math.max(spec.minLot, Math.floor(rawLots * 100) / 100);
      var actualRisk = lots * lossPerOneLot;
      var profitTp1 = actualRisk * 1.5;
      var profitTp2 = actualRisk * rr;
      return {
        riskUsd: riskUsd,
        lots: lots,
        actualRisk: actualRisk,
        profitTp1: profitTp1,
        profitTp2: profitTp2,
        unitLabel: spec.unit
      };
    });

    return {
      symbol: sym,
      price: price,
      side: side,
      strongEdge: strongEdge,
      edgePct: Math.min(95, Math.max(15, Math.round(edgePct))),
      entry: entry,
      stop: stop,
      stopDist: stopDist,
      stopPct: (stopDist / entry) * 100,
      beTrigger: beTrigger,
      tp1: tp1,
      tp1R: tp1R,
      tp2: tp2,
      rr: rr,
      slPoolProtected: slPoolProtected,
      checks: checks,
      sizing: sizing,
      unitLabel: spec.unit
    };
  }

  function paintSmartMoney() {
    var panel = $('smart-money-panel');
    if (!panel) return;
    if ($('smc-market')) $('smc-market').textContent = symbol || 'MARKET';
    if ($('smc-price')) $('smc-price').textContent = quote ? px(quote.price) : '—';
    var buyRows = ((smcZones && smcZones.buy) || []).filter(function (z) { return Number(z.accuracy) > 60; });
    var sellRows = ((smcZones && smcZones.sell) || []).filter(function (z) { return Number(z.accuracy) > 60; });
    var totalZones = buyRows.length + sellRows.length;
    if ($('smc-status')) {
      $('smc-status').textContent = !quote
        ? 'Waiting for live quote'
        : totalZones
          ? 'M5 / M15 / H1 · >60% accuracy · ' + totalZones + ' zones'
          : 'M5 / M15 / H1 · no >60% accuracy zones yet';
    }

    ['buy', 'sell'].forEach(function (side) {
      var listEl = $('smc-' + side + '-list');
      var countEl = $('smc-' + side + '-count');
      var rows = side === 'buy' ? buyRows : sellRows;
      if (countEl) countEl.textContent = rows.length + ' zones';
      if (!listEl) return;
      var opened = Object.create(null);
      if (listEl.querySelectorAll) {
        Array.prototype.forEach.call(listEl.querySelectorAll('details[open]'), function (el) {
          opened[el.dataset.key] = true;
        });
      }
      var html = rows.map(function (z) {
        var acc = Math.round(Number(z.accuracy) || 0);
        var stateTxt = z.state === 'IN ZONE' ? 'IN ZONE' : z.distPct.toFixed(2) + '%';
        var badge = acc + '% · ' + stateTxt;
        return '<details class="slz-row smc-row ' + side + '" data-key="' + esc(z.id) + '"' + (opened[z.id] ? ' open' : '') + '>' +
          '<summary>' +
            '<b>' + esc(px(z.entry)) + '</b>' +
            '<span>' + esc(z.kind + ' · ' + z.tf) + '</span>' +
            '<em>' + esc(badge) + '</em>' +
            '<i>›</i>' +
          '</summary>' +
          '<div class="slz-details smc-details">' +
            '<b>' + (side === 'buy' ? 'BUY DEMAND PLAN' : 'SELL SUPPLY PLAN') + ' (' + acc + '% accuracy):</b> ' +
            'Entry <b>' + esc(px(z.entry)) + '</b> · Safe SL <b>' + esc(px(z.stop)) + '</b> · ' +
            'TP1 (1.5R) <b>' + esc(px(z.tp1)) + '</b> · TP2 (2.5R) <b>' + esc(px(z.tp2)) + '</b><br>' +
            'Zone band: ' + esc(px(z.zoneLow)) + ' – ' + esc(px(z.zoneHigh)) + ' (' + esc(z.tags.join(' + ')) + ').<br>' +
            esc(z.note) + '.' +
          '</div>' +
        '</details>';
      }).join('') || '<div class="slz-empty">No ' + (side === 'buy' ? 'BUY demand OB/FVG' : 'SELL supply OB/FVG') + ' above 60% accuracy yet.</div>';
      if (listEl.innerHTML !== html) listEl.innerHTML = html;
    });
    notifyChartModules();
  }

  function paintProfitRadar() {
    var panel = $('profit-radar-panel');
    if (!panel) return;
    var setP = function (el, txt) { if (el && el.textContent !== txt) el.textContent = txt; };
    setP($('prp-market'), symbol || 'MARKET');
    if (!radarPlan) {
      setP($('prp-verdict'), 'SCANNING');
      return;
    }
    var p = radarPlan;
    var isBuy = p.side === 'BUY';
    var sideCls = isBuy ? 'buy' : 'sell';
    var verdictText = (p.strongEdge ? (isBuy ? '▲ BUY EDGE ' : '▼ SELL EDGE ') : (isBuy ? '◆ BUY BIAS ' : '◆ SELL BIAS ')) + p.edgePct + '%';
    var vEl = $('prp-verdict');
    if (vEl) {
      var vCls = 'prp-verdict ' + (p.strongEdge ? sideCls : 'wait');
      if (vEl.textContent !== verdictText) vEl.textContent = verdictText;
      if (vEl.className !== vCls) vEl.className = vCls;
    }
    setP($('prp-edge-badge'), p.strongEdge ? (isBuy ? 'HIGH PROB BUY' : 'HIGH PROB SELL') : 'WAIT TRIGGER');
    var passedChecks = p.checks.filter(function (c) { return c.ok; }).length;
    setP($('prp-status'), passedChecks + '/6 confluence checks · R:R 1:' + p.rr.toFixed(2));
    setP($('prp-rule'), p.slPoolProtected
      ? 'SL Hunt Guard: SL buffered beyond liquidity pool · BE at ' + px(p.beTrigger)
      : 'ATR Guard: Lock 50% at TP1 (' + px(p.tp1) + ') · move SL to BE (' + px(p.beTrigger) + ')');
    setP($('prp-rr-badge'), '1 : ' + p.rr.toFixed(2) + ' R:R · SL ' + p.stopPct.toFixed(2) + '%');

    var planList = $('prp-plan-list');
    if (planList) {
      var checkSummary = p.checks.map(function (c) {
        return (c.ok ? '✓ ' : '• ') + c.label + ': ' + c.value;
      }).join('<br>');

      var planRows = [
        {
          key: 'entry',
          cls: sideCls,
          title: (isBuy ? '▲ BUY ENTRY · ' : '▼ SELL ENTRY · ') + px(p.entry),
          sub: (p.strongEdge ? 'CONFIRMED SNIPER SETUP' : 'WATCH TRIGGER') + ' · ' + passedChecks + '/6 CONFLUENCE',
          tag: p.edgePct + '% EDGE',
          details: '<b>6-Factor Profit Confluence (' + passedChecks + '/6):</b><br>' + checkSummary
        },
        {
          key: 'sl-be',
          cls: 'sell',
          title: 'SAFE SL · ' + px(p.stop),
          sub: 'BREAK-EVEN (+1R) @ ' + px(p.beTrigger) + (p.slPoolProtected ? ' · POOL GUARD' : ' · ATR GUARD'),
          tag: '-' + p.stopPct.toFixed(2) + '%',
          details: '<b>Stop-Loss & Break-Even Protection:</b><br>' +
            'Safe Stop-Loss: <b>' + esc(px(p.stop)) + '</b> (' + (p.slPoolProtected ? 'placed beyond SL liquidity cluster' : '1.35x ATR structural stop') + ').<br>' +
            'Break-Even Trigger (+1.0R): <b>' + esc(px(p.beTrigger)) + '</b> — move SL to Entry (' + esc(px(p.entry)) + ') once reached.'
        },
        {
          key: 'tp',
          cls: 'buy',
          title: 'TP1 · ' + px(p.tp1) + '   |   TP2 · ' + px(p.tp2),
          sub: 'Lock 50% at TP1 (' + (p.tp1R || 1.5).toFixed(1) + 'R) & move SL to BE · Trail 50% to TP2',
          tag: '1:' + p.rr.toFixed(2) + ' R:R',
          details: '<b>Take-Profit Scaling Plan:</b><br>' +
            'TP1 (' + (p.tp1R || 1.5).toFixed(1) + 'R Safe Lock): <b>' + esc(px(p.tp1)) + '</b> — close 50% of position & lock Break-Even.<br>' +
            'TP2 (' + p.rr.toFixed(2) + 'R Target): <b>' + esc(px(p.tp2)) + '</b> — trail remaining 50% for full swing target.'
        },
        {
          key: 'checks',
          cls: sideCls,
          title: 'CONFLUENCE · ' + passedChecks + '/6 CHECKS PASSED',
          sub: 'HTF · VWAP · 13-VENUE FLOW · LIQUIDITY · SMC · NEWS',
          tag: p.slPoolProtected ? 'POOL SL' : 'ATR SL',
          details: '<b>Confluence Breakdown:</b><br>' + checkSummary
        }
      ];

      renderDetailRows(planList, planRows, '');
    }
  }

  function simpleEma(values, period) {
    if (!values || !values.length) return 0;
    var n = Math.min(period, values.length);
    var k = 2 / (period + 1);
    var e = values.slice(0, n).reduce(function (s, v) { return s + v; }, 0) / n;
    for (var i = n; i < values.length; i++) e = values[i] * k + e * (1 - k);
    return e;
  }

  function frameDirectionFromRead(readObj, momObj, price, atrVal, regime, closedBars) {
    var rScore = Number(readObj && readObj.score) || 0;
    var rRsi = Number(readObj && readObj.rsi);
    var vwap = Number(readObj && readObj.vwap) || 0;
    var emaF = Number(readObj && readObj.emaFast) || 0;
    var emaS = Number(readObj && readObj.emaSlow) || 0;
    var macd = readObj && readObj.macd;
    var bb = readObj && readObj.bb;
    var pctB = bb && Number.isFinite(Number(bb.pctB)) ? Number(bb.pctB) : 50;

    if ((!(emaF > 0) || !(emaS > 0)) && Array.isArray(closedBars) && closedBars.length >= 12) {
      var closes = closedBars.slice(-45).map(function (b) { return Number(b[4]); });
      emaF = simpleEma(closes, 9);
      emaS = simpleEma(closes, 21);
    }

    var combined = rScore * 0.52 + momObj.score * 1.05;
    if (emaF > 0 && emaS > 0) {
      var emaDiff = emaF - emaS;
      if (emaDiff > atrVal * 0.04) combined += 0.55;
      else if (emaDiff < -atrVal * 0.04) combined -= 0.55;
    }
    if (macd && Number.isFinite(Number(macd.hist))) {
      if (macd.hist > 0 && macd.rising) combined += 0.6;
      else if (macd.hist < 0 && !macd.rising) combined -= 0.6;
      else if (macd.hist > 0 && !macd.rising) combined -= 0.25;
      else if (macd.hist < 0 && macd.rising) combined += 0.25;
    }
    if (Number.isFinite(rRsi)) {
      if (rRsi >= 73 && pctB >= 92) combined -= (regime === 'TREND' ? 0.45 : 1.15);
      else if (rRsi <= 27 && pctB <= 8) combined += (regime === 'TREND' ? 0.45 : 1.15);
      else if (rRsi >= 55 && rRsi < 72) combined += 0.45;
      else if (rRsi <= 45 && rRsi > 28) combined -= 0.45;
    }
    if (vwap > 0 && price > 0) {
      if (price > vwap + atrVal * 0.05) combined += 0.45;
      else if (price < vwap - atrVal * 0.05) combined -= 0.45;
    }
    var side = combined >= 0 ? 'BUY' : 'SELL';
    var conf = Math.min(94, Math.max(52, Math.round(52 + Math.min(42, Math.abs(combined) * 9.5))));
    return { side: side, conf: conf, score: combined };
  }

  function computeFallbackRead(closedBars) {
    if (!Array.isArray(closedBars) || closedBars.length < 20) return { ready: false, score: 0 };
    var rows = closedBars.slice(-80);
    var closes = rows.map(function (b) { return Number(b[4]); });
    var close = closes[closes.length - 1];
    var emaF = simpleEma(closes, 9);
    var emaS = simpleEma(closes, 21);
    // RSI(14)
    var gains = 0, losses = 0;
    for (var i = Math.max(1, closes.length - 14); i < closes.length; i++) {
      var d = closes[i] - closes[i - 1];
      if (d > 0) gains += d; else losses -= d;
    }
    var rsiVal = losses <= 0 ? (gains > 0 ? 100 : 50) : (100 - 100 / (1 + (gains / losses)));
    // Bollinger(20, 2)
    var bbSlice = closes.slice(-20);
    var bbMid = bbSlice.reduce(function (s, v) { return s + v; }, 0) / bbSlice.length;
    var bbVar = bbSlice.reduce(function (s, v) { return s + (v - bbMid) * (v - bbMid); }, 0) / bbSlice.length;
    var bbSd = Math.sqrt(bbVar);
    var bbUp = bbMid + 2 * bbSd, bbLow = bbMid - 2 * bbSd;
    var pctB = bbUp > bbLow ? ((close - bbLow) / (bbUp - bbLow)) * 100 : 50;
    // VWAP
    var pv = 0, vol = 0;
    for (var vi = 0; vi < rows.length; vi++) {
      var vv = Number(rows[vi][5]) || 1;
      pv += ((Number(rows[vi][2]) + Number(rows[vi][3]) + Number(rows[vi][4])) / 3) * vv;
      vol += vv;
    }
    var vwapVal = vol > 0 ? pv / vol : 0;
    // MACD(12, 26, 9)
    var macdLine = [];
    for (var mi = Math.max(26, closes.length - 20); mi <= closes.length; mi++) {
      var sl = closes.slice(0, mi);
      macdLine.push(simpleEma(sl, 12) - simpleEma(sl, 26));
    }
    var macdSig = simpleEma(macdLine, 9);
    var macdLast = macdLine.length ? macdLine[macdLine.length - 1] : 0;
    var macdPrev = macdLine.length > 1 ? macdLine[macdLine.length - 2] : macdLast;
    var macdObj = { line: macdLast, signal: macdSig, hist: macdLast - macdSig, rising: macdLast > macdPrev };

    var sc = 0;
    if (emaF > emaS && close >= emaS) sc += 1; else if (emaF < emaS && close <= emaS) sc -= 1;
    if (rsiVal >= 56) sc += 1; else if (rsiVal <= 44) sc -= 1;
    if (macdObj.hist > 0 && (macdObj.line > 0 || macdObj.rising)) sc += 1;
    else if (macdObj.hist < 0 && (macdObj.line < 0 || !macdObj.rising)) sc -= 1;
    if (pctB > 55 && close > bbMid) sc += 1; else if (pctB < 45 && close < bbMid) sc -= 1;
    if (vwapVal > 0) sc += (close > vwapVal ? 1 : -1);

    return {
      ready: true,
      score: sc,
      rsi: rsiVal,
      emaFast: emaF,
      emaSlow: emaS,
      vwap: vwapVal,
      macd: macdObj,
      bb: { mid: bbMid, up: bbUp, low: bbLow, pctB: pctB },
      close: close
    };
  }

  function gradePendingPrediction(sym, tf, currentBarId, price, targetClosed) {
    var pending = ncpPendingLocks[tf];
    var fixed = loadNcpLock(sym, tf);
    var cand = pending && pending.symbol === sym && currentBarId > pending.targetBarId
      ? pending
      : (fixed && fixed.symbol === sym && currentBarId >= fixed.targetBarId && fixed.prediction
        ? {
          symbol: sym,
          tf: tf,
          targetBarId: fixed.targetBarId,
          side: fixed.prediction.side,
          openPrice: fixed.prediction.projOpen,
          conf: fixed.prediction.confidence
        }
        : null);
    if (!cand) return;
    var tfMs = (NCP_TFS[tf] || NCP_TFS['5m']).ms;
    var closePx = price;
    var openPx = cand.openPrice;
    if (Array.isArray(targetClosed) && targetClosed.length) {
      var match = targetClosed.find(function (b) { return Math.floor(barTime(b[0]) / tfMs) === cand.targetBarId; });
      if (match) {
        openPx = Number(match[1]) || openPx;
        closePx = Number(match[4]) || closePx;
      }
    }
    if (openPx > 0 && closePx > 0 && Math.abs(closePx - openPx) > 1e-12) {
      var hist = ncpHistoryFor(tf);
      if (!hist.some(function (x) { return x.barId === cand.targetBarId; })) {
        var won = cand.side === 'BUY' ? closePx > openPx : closePx < openPx;
        hist.push({
          barId: cand.targetBarId,
          tf: tf,
          side: cand.side,
          openPx: openPx,
          closePx: closePx,
          won: won,
          conf: cand.conf,
          at: Date.now()
        });
        if (hist.length > 25) ncpHistories[tf] = hist.slice(-25);
        saveNcpHistory(tf);
      }
    }
    if (pending && pending.targetBarId === cand.targetBarId) delete ncpPendingLocks[tf];
    if (fixed && currentBarId >= fixed.targetBarId) saveNcpLock(sym, tf, null);
  }

  function computeNextCandlePrediction(ctx) {
    var sym = (ctx && ctx.symbol) || symbol || 'XAUUSDm';
    var price = Number(ctx && ctx.price) || (quote ? quote.price : 0);
    if (!(price > 0)) return null;
    var nowMs = Number(ctx && ctx.nowMs) || Date.now();
    var tf = (ctx && ctx.tf && NCP_TFS[ctx.tf]) ? ctx.tf : currentChartTf();
    activeTf = tf;
    var spec = NCP_TFS[tf] || NCP_TFS['5m'];
    var tfMs = spec.ms;
    var barId = Math.floor(nowMs / tfMs);
    var tfSec = Math.round(tfMs / 1000);
    var secsLeft = Math.max(1, tfSec - (Math.floor(nowMs / 1000) % tfSec));
    var countdownText = formatCountdown(secsLeft);
    var isSyntheticCtx = !!(ctx && Array.isArray(ctx.ticks));
    var bypassFixedLock = isSyntheticCtx || !!(ctx && ctx.forceRecompute);

    var swing = (ctx && ctx.swing) || (root.SwingAI && typeof root.SwingAI.state === 'function' ? root.SwingAI.state() : null) || {};
    var struct = (ctx && ctx.structure) || (root.SwingAI && typeof root.SwingAI.structure === 'function' ? root.SwingAI.structure() : null) || {};
    var reads = swing.reads || {};
    var frames = struct.frames || {};
    var ci = root.ChartIndicators;
    var chartTfBars = (!isSyntheticCtx && ci && typeof ci.recentBars === 'function') ? ci.recentBars(sym, tf) : [];
    var targetSourceRows = (Array.isArray(chartTfBars) && chartTfBars.length >= 4)
      ? chartTfBars
      : (frames[spec.key] || []);

    var targetRaw = allValidBars(targetSourceRows);
    var targetClosed = barsFor(targetSourceRows, tfMs, nowMs);
    var ltfMs = (NCP_TFS_BY_KEY[spec.ltf] || spec).ms;
    var midMs = (NCP_TFS_BY_KEY[spec.mid] || spec).ms;
    var ltfClosed = spec.ltf === spec.key ? targetClosed : barsFor(frames[spec.ltf], ltfMs, nowMs);
    var midClosed = spec.mid === spec.key ? targetClosed : barsFor(frames[spec.mid], midMs, nowMs);
    var targetLive = targetRaw.length && (!targetClosed.length || barTime(targetRaw[targetRaw.length - 1][0]) > barTime(targetClosed[targetClosed.length - 1][0]))
      ? targetRaw[targetRaw.length - 1] : null;

    if (!isSyntheticCtx) {
      gradePendingPrediction(sym, tf, barId, price, targetClosed);
    }

    var latestClosedBarId = targetClosed.length ? Math.floor(barTime(targetClosed[targetClosed.length - 1][0]) / tfMs) : 0;
    if (!bypassFixedLock) {
      var existingLock = loadNcpLock(sym, tf);
      if (existingLock && existingLock.symbol === sym && existingLock.tf === tf &&
          existingLock.barId === barId && nowMs < existingLock.expiresAt && existingLock.prediction) {
        var lp = existingLock.prediction;
        var invalidGap = Math.max((existingLock.baseAtr || 0) * 2.2, (lp.expectedMove || 0) * 3.0);
        var blownOut = invalidGap > 0 && Math.abs(price - lp.projOpen) > invalidGap;
        var needPrevCloseRefine = existingLock.hasClosedPrevBar === false &&
          latestClosedBarId >= barId - 1 &&
          (nowMs - existingLock.lockedAt) < Math.min(35000, tfMs * 0.25);
        if (!blownOut && !needPrevCloseRefine) {
          var hNow = ncpHistoryFor(tf);
          var wNow = hNow.filter(function (x) { return x.won; }).length;
          return Object.assign({}, lp, {
            isBarLocked: true,
            secsLeft: secsLeft,
            countdownText: countdownText,
            liveWins: wNow,
            liveTotal: hNow.length,
            liveWinPct: hNow.length > 0 ? Math.round((wNow / hNow.length) * 100) : 0
          });
        }
      }
      // Wait for real TradingView closed candles (>= 12 bars) before locking a fixed next candle
      if (targetClosed.length < 12) return null;
    }

    var targetRead = (reads[spec.key] && reads[spec.key].ready) ? reads[spec.key] : computeFallbackRead(targetClosed);
    var ltfRead = (reads[spec.ltf] && reads[spec.ltf].ready) ? reads[spec.ltf] : computeFallbackRead(ltfClosed);
    var midRead = (reads[spec.mid] && reads[spec.mid].ready) ? reads[spec.mid] : computeFallbackRead(midClosed);
    var htfRead = reads[spec.htf] || {};

    var slState = (ctx && ctx.stopLiquidity) || (root.StopLiquidity && typeof root.StopLiquidity.state === 'function' ? root.StopLiquidity.state() : null) || {};
    var slZones = Array.isArray(slState.zones) ? slState.zones : [];
    var flowTotals = (ctx && ctx.orderFlow) || (root.MultiExchangeOrderFlow && typeof root.MultiExchangeOrderFlow.getOpenTotals === 'function' ? root.MultiExchangeOrderFlow.getOpenTotals() : null) || {};
    var smc = (ctx && ctx.smc) || smcZones || { buy: [], sell: [] };
    var rawTicks = Array.isArray(ctx && ctx.ticks) ? ctx.ticks : tickHistory;

    var m5FallbackAtr = Number(reads.M5 && reads.M5.atr) || atrOf(barsFor(frames.M5, 300000, nowMs));
    var measuredTargetAtr = atrOf(targetClosed);
    var baseAtr = measuredTargetAtr || Number(targetRead.atr) ||
      (m5FallbackAtr > 0 ? m5FallbackAtr * Math.sqrt(tfMs / 300000) : (price * 0.0018 * Math.sqrt(tfMs / 300000)));
    var refCloseForScale = targetClosed.length ? Number(targetClosed[targetClosed.length - 1][4]) : Number(targetRead.close || 0);
    if (refCloseForScale > 0 && Math.abs(price - refCloseForScale) / price > 0.02) {
      baseAtr = baseAtr * (price / refCloseForScale);
    }

    // 1. Empirical Regime & Historical Pattern Calibration on Recent Closed Candles of Selected TF
    var cal = calibrateRegime(targetClosed, sym, tf);
    var targetMom = analyzeFrameMomentum(targetClosed, price, baseAtr, targetRead, cal.regime);
    var ltfAtr = atrOf(ltfClosed) || baseAtr * Math.sqrt(ltfMs / tfMs);
    var midAtr = atrOf(midClosed) || baseAtr * Math.sqrt(midMs / tfMs);
    var ltfMom = spec.ltf === spec.key ? targetMom : analyzeFrameMomentum(ltfClosed, price, ltfAtr, ltfRead, cal.regime);
    var midMom = spec.mid === spec.key ? targetMom : analyzeFrameMomentum(midClosed, price, midAtr, midRead, cal.regime);

    // 2. Live Tick Velocity, Acceleration, Up-Tick Ratio & True Forming Candle Wick/CLV
    var validTicks = (rawTicks || []).filter(function (t) {
      return t && Number(t.price) > 0 && Number(t.at) >= nowMs - 90000 && Number(t.at) <= nowMs + 5000;
    }).slice().sort(function (a, b) { return Number(a.at) - Number(b.at); });
    var t10 = validTicks.find(function (t) { return Number(t.at) >= nowMs - 10000; }) || validTicks[0] || null;
    var t15 = validTicks.find(function (t) { return Number(t.at) >= nowMs - 15000; }) || validTicks[0] || null;
    var t30 = validTicks.find(function (t) { return Number(t.at) >= nowMs - 30000; }) || validTicks[0] || null;
    var t60 = validTicks.find(function (t) { return Number(t.at) >= nowMs - 60000; }) || validTicks[0] || null;
    var d10 = t10 ? price - Number(t10.price) : 0;
    var d15 = t15 ? price - Number(t15.price) : 0;
    var d30 = t30 ? price - Number(t30.price) : 0;
    var d45 = t60 ? price - Number(t60.price) : d30;
    var accel = (d10 / 10) - (d30 / 30);

    var upTicks = 0, dnTicks = 0;
    var recentSlice = validTicks.slice(-22);
    for (var ti = 1; ti < recentSlice.length; ti++) {
      var diff = Number(recentSlice[ti].price) - Number(recentSlice[ti - 1].price);
      if (diff > 0) upTicks++;
      else if (diff < 0) dnTicks++;
    }
    var upTickPct = (upTicks + dnTicks) >= 3 ? Math.round((upTicks / (upTicks + dnTicks)) * 100) : 50;

    // Build exact live forming candle OHLC for selected TF
    var useTfBar = (!isSyntheticCtx && curTargetBars[tf] && curTargetBars[tf].barId === barId) ? curTargetBars[tf] : null;
    var barOpen = useTfBar ? useTfBar.open : (t60 ? Number(t60.price) : price);
    var barHigh = useTfBar ? Math.max(useTfBar.high, price) : price;
    var barLow = useTfBar ? Math.min(useTfBar.low, price) : price;
    validTicks.forEach(function (t) {
      if (Number(t.at) >= nowMs - 60000) {
        var tp = Number(t.price);
        if (tp > barHigh) barHigh = tp;
        if (tp < barLow) barLow = tp;
      }
    });
    if (targetLive) {
      var liveScale = Number(targetLive[4]) > 0 && Math.abs(price - Number(targetLive[4])) / price > 0.02
        ? price / Number(targetLive[4]) : 1;
      barHigh = Math.max(barHigh, Number(targetLive[2]) * liveScale);
      barLow = Math.min(barLow, Number(targetLive[3]) * liveScale);
      barOpen = Number(targetLive[1]) * liveScale;
    }

    var hasLiveRange = validTicks.length >= 2 || !!targetLive || !!(useTfBar && useTfBar.ticks >= 2);
    var wickRange = Math.max(barHigh - barLow, baseAtr * 0.12, price * 0.00005);
    var upperWick = Math.max(0, barHigh - Math.max(price, barOpen));
    var lowerWick = Math.max(0, Math.min(price, barOpen) - barLow);
    var upperWickPct = hasLiveRange ? Math.min(100, Math.round((upperWick / wickRange) * 100)) : targetMom.upperWickPct;
    var lowerWickPct = hasLiveRange ? Math.min(100, Math.round((lowerWick / wickRange) * 100)) : targetMom.lowerWickPct;
    var liveClv = hasLiveRange
      ? Math.min(100, Math.max(0, Math.round(((price - barLow) / wickRange) * 100)))
      : targetMom.clv;
    var wickDiff = lowerWickPct - upperWickPct;

    var pulseBaseAtr = Math.max(ltfAtr, baseAtr * 0.45);
    var velDenom = Math.max(pulseBaseAtr * 0.30, price * 0.00014);
    var velNorm = Math.max(-2.4, Math.min(2.4, (d15 * 0.6 + d45 * 0.4) / velDenom));
    var accelNorm = Math.max(-1.0, Math.min(1.0, (accel * 15) / velDenom));
    var tickRatioBias = (upTickPct - 50) / 30;
    var clvBias = (liveClv - 50) / 38;
    var ltfPulseRaw = velNorm * 0.85 + accelNorm * 0.45 + tickRatioBias * 0.55 + (wickDiff / 42) + clvBias * 0.45;
    if (spec.ltf !== spec.key) ltfPulseRaw = ltfPulseRaw * 0.65 + ltfMom.score * 0.55;
    else if (!hasLiveRange && ltfPulseRaw === 0) ltfPulseRaw = targetMom.score * 0.4;
    var ltfSide = ltfPulseRaw >= 0 ? 'BUY' : 'SELL';
    var ltfConf = Math.min(94, Math.max(52, Math.round(53 + Math.min(41, Math.abs(ltfPulseRaw) * 14))));
    var wickSummary = wickDiff >= 12 ? ('LOW REJ ' + lowerWickPct + '%')
      : wickDiff <= -12 ? ('HIGH REJ ' + upperWickPct + '%')
      : ('CLV ' + liveClv + '%');

    // 3. Scale-Adaptive Multi-TF Cascade & Historical Pattern Edge
    var targetSig = frameDirectionFromRead(targetRead, targetMom, price, baseAtr, cal.regime, targetClosed);
    var midSig = spec.mid === spec.key
      ? targetSig
      : frameDirectionFromRead(midRead, midMom, price, midAtr, cal.regime, midClosed);
    var htfScore = Number(htfRead.score) || 0;
    var htfSide = htfScore >= 2 ? 'BUY' : htfScore <= -2 ? 'SELL' : (spec.htf === spec.mid ? midSig.side : 'NEUTRAL');
    var refVwap = Number(targetRead.vwap) || Number(midRead.vwap) || Number(reads.M5 && reads.M5.vwap) || 0;
    var vwapSide = refVwap > 0
      ? (price > refVwap * 1.00008 ? 'BUY' : price < refVwap * 0.99992 ? 'SELL' : 'FLAT')
      : 'WAIT';

    // Empirical historical probability for the current patternKey on selected TF (Bayesian smoothed)
    var pStat = cal.patternStats && cal.patternStats[targetMom.patternKey];
    var histSamples = pStat ? pStat.total : 0;
    var histProbBuy = pStat && histSamples >= 3
      ? Math.round(((pStat.up + 2) / (histSamples + 4)) * 100)
      : 50;
    var histSide = histProbBuy >= 55 ? 'BUY' : histProbBuy <= 45 ? 'SELL' : 'NEUTRAL';
    var histWinPct = histSide === 'BUY' ? histProbBuy : histSide === 'SELL' ? (100 - histProbBuy) : 50;

    // 4. 13-Venue Order Flow & Limit Absorption Trap
    var flowBuy = Number(flowTotals.buy) || 0;
    var flowSell = Number(flowTotals.sell) || 0;
    var flowTotal = flowBuy + flowSell;
    var flowBuyPct = flowTotal > 0 ? Math.round((flowBuy / flowTotal) * 100) : Math.round(Number(swing.flowBias) || 50);
    var normMove30 = d30 / Math.max(pulseBaseAtr * 0.25, price * 0.00014);
    var sellTrap = flowBuyPct >= 58 && (normMove30 <= -0.22 || (upperWickPct >= 38 && wickDiff <= -14) || (d30 > 0 && d10 < -pulseBaseAtr * 0.06 && upperWickPct >= 30));
    var buyTrap = flowBuyPct <= 42 && (normMove30 >= 0.22 || (lowerWickPct >= 38 && wickDiff >= 14) || (d30 < 0 && d10 > pulseBaseAtr * 0.06 && lowerWickPct >= 30));
    var absorptionTrap = sellTrap ? 'SELL' : buyTrap ? 'BUY' : '';
    var absorptionTitle = sellTrap ? 'BUY ABSORB → SELL'
      : buyTrap ? 'SELL ABSORB → BUY' : '';
    var flowSide = absorptionTrap || (flowBuyPct >= 53 ? 'BUY' : flowBuyPct <= 47 ? 'SELL' : 'NEUTRAL');
    var flowDelta = flowBuy - flowSell;
    var flowSub = flowTotal > 0
      ? ('BUY ' + compactUsd(flowBuy) + ' · SELL ' + compactUsd(flowSell))
      : ('BIAS ' + flowBuyPct + '%B · LIVE TAPE');
    var flowDetail = flowTotal > 0
      ? (flowSub + ' · NET ' + (flowDelta >= 0 ? '+' : '-') + compactUsd(Math.abs(flowDelta)))
      : flowSub;

    // 5. Smart Money Demand/Supply Reaction + SL Liquidity Magnet & Stop-Hunt Sweep
    var buyOb = (smc.buy || []).find(function (z) {
      return z && Number(z.accuracy) > 60 && (z.state === 'IN ZONE' || Number(z.distPct) <= 0.16);
    }) || null;
    var sellOb = (smc.sell || []).find(function (z) {
      return z && Number(z.accuracy) > 60 && (z.state === 'IN ZONE' || Number(z.distPct) <= 0.16);
    }) || null;
    var smcSide = buyOb && (!sellOb || Number(buyOb.distPct) <= Number(sellOb.distPct)) ? 'BUY'
      : sellOb ? 'SELL' : 'NEUTRAL';
    var smcLabel = smcSide === 'BUY' && buyOb ? ('IN BUY ' + buyOb.kind)
      : smcSide === 'SELL' && sellOb ? ('IN SELL ' + sellOb.kind) : '';

    var buyPools = slZones.filter(function (z) { return z && z.side === 'buy' && Number(z.price) < price; })
      .sort(function (a, b) { return Math.abs(price - a.price) - Math.abs(price - b.price); });
    var sellPools = slZones.filter(function (z) { return z && z.side === 'sell' && Number(z.price) > price; })
      .sort(function (a, b) { return Math.abs(a.price - price) - Math.abs(b.price - price); });
    var nearBuySl = buyPools[0] || null;
    var nearSellSl = sellPools[0] || null;

    var nearBuyTouch = !!(nearBuySl && (price - Number(nearBuySl.price)) <= baseAtr * 0.28 && lowerWickPct >= 28);
    var nearSellTouch = !!(nearSellSl && (Number(nearSellSl.price) - price) <= baseAtr * 0.28 && upperWickPct >= 28);
    var sweepSide = 'NEUTRAL';
    var sweepIsReversal = false;
    var sweepTitle = smcLabel || 'STRUCTURE MODE';
    var sweepTag = smcSide !== 'NEUTRAL' ? ('SMC ' + smcSide) : 'NEUTRAL';
    if (targetMom.sweepSide === 'BUY' || nearBuyTouch) {
      sweepSide = 'BUY';
      sweepIsReversal = true;
      sweepTitle = '⚠️ LOW SWEEP → BUY';
      sweepTag = 'REV BUY';
    } else if (targetMom.sweepSide === 'SELL' || nearSellTouch) {
      sweepSide = 'SELL';
      sweepIsReversal = true;
      sweepTitle = '⚠️ HIGH SWEEP → SELL';
      sweepTag = 'REV SELL';
    } else if (smcSide !== 'NEUTRAL') {
      sweepSide = smcSide;
      sweepTitle = smcLabel + (nearSellSl && smcSide === 'BUY' ? (' · ▲' + px(nearSellSl.price, sym)) : nearBuySl && smcSide === 'SELL' ? (' · ▼' + px(nearBuySl.price, sym)) : '');
      sweepTag = 'SMC ' + smcSide;
    } else if (nearBuySl || nearSellSl) {
      var upScore = nearSellSl
        ? ((Number(nearSellSl.touches) || 1) / Math.max(0.05, ((Number(nearSellSl.price) - price) / price) * 100))
        : 0;
      var dnScore = nearBuySl
        ? ((Number(nearBuySl.touches) || 1) / Math.max(0.05, ((price - Number(nearBuySl.price)) / price) * 100))
        : 0;
      if (upScore >= dnScore && nearSellSl) {
        sweepSide = 'BUY';
        sweepTitle = 'MAGNET ▲ ' + px(nearSellSl.price, sym);
        sweepTag = 'PULL ▲';
      } else if (nearBuySl) {
        sweepSide = 'SELL';
        sweepTitle = 'MAGNET ▼ ' + px(nearBuySl.price, sym);
        sweepTag = 'PULL ▼';
      }
    }
    var upDistTxt = nearSellSl ? ('+' + (((Number(nearSellSl.price) - price) / price) * 100).toFixed(2) + '%') : '—';
    var dnDistTxt = nearBuySl ? ('-' + (((price - Number(nearBuySl.price)) / price) * 100).toFixed(2) + '%') : '—';
    var sweepSub = '▲SL ' + upDistTxt + ' · ▼SL ' + dnDistTxt;

    // 6. Synthesize Scale-Adaptive 6-Pillar Calibrated Score
    var isHigherTf = tfMs >= 3600000;
    var buyScore = 0, sellScore = 0;
    var ltfBaseW = tf === '1m' ? 20 : tf === '5m' ? 16 : tf === '15m' ? 14 : 10;
    var ltfWeight = ltfBaseW + Math.round(((ltfConf - 50) / 44) * 6);
    if (ltfSide === 'BUY') buyScore += ltfWeight; else sellScore += ltfWeight;

    var targetBaseW = isHigherTf ? 20 : 16;
    var targetWeight = targetBaseW + Math.round(((targetSig.conf - 50) / 44) * 7);
    if (targetSig.side === 'BUY') buyScore += targetWeight; else sellScore += targetWeight;

    var midWeight = isHigherTf ? 13 : 11;
    if (midSig.side === 'BUY') buyScore += midWeight; else sellScore += midWeight;

    var htfWeight = isHigherTf ? 9 : 6;
    if (htfSide === 'BUY') buyScore += htfWeight; else if (htfSide === 'SELL') sellScore += htfWeight;

    if (vwapSide === 'BUY') buyScore += 6; else if (vwapSide === 'SELL') sellScore += 6;
    if (histSide === 'BUY') buyScore += 10; else if (histSide === 'SELL') sellScore += 10;

    var flowWeight = absorptionTrap ? (isHigherTf ? 18 : 24) : Math.abs(flowBuyPct - 50) >= 10 ? (isHigherTf ? 13 : 18) : 10;
    if (flowSide === 'BUY') buyScore += flowWeight; else if (flowSide === 'SELL') sellScore += flowWeight;

    var sweepWeight = sweepIsReversal ? 16 : smcSide !== 'NEUTRAL' ? 14 : 9;
    if (sweepSide === 'BUY') buyScore += sweepWeight; else if (sweepSide === 'SELL') sellScore += sweepWeight;

    var rawNextSide = buyScore >= sellScore ? 'BUY' : 'SELL';
    var rawMargin = Math.abs(buyScore - sellScore);

    // Anti-flicker hysteresis inside the same live candle unless trap/sweep or decisive margin
    var nextSide = rawNextSide;
    var isBarLocked = !bypassFixedLock;
    var lockWindow = spec.lockSecs || 45;
    if (!isSyntheticCtx) {
      var pend = ncpPendingLocks[tf];
      var lastV = ncpLastVerdicts[tf];
      if (pend && pend.symbol === sym && pend.targetBarId === barId + 1 && secsLeft <= lockWindow) {
        if (rawNextSide !== pend.side && (absorptionTrap || sweepIsReversal || rawMargin >= 24)) {
          pend.side = rawNextSide;
        } else {
          nextSide = pend.side;
        }
        isBarLocked = true;
      } else if (lastV && lastV.symbol === sym && lastV.barId === barId) {
        if (rawNextSide !== lastV.side && rawMargin < 10 && !absorptionTrap && !sweepIsReversal) {
          nextSide = lastV.side;
        }
      }
    }

    var totalScore = Math.max(1, buyScore + sellScore);
    var edgeMargin = Math.abs(buyScore - sellScore) / totalScore;
    var alignedCount = [ltfSide, targetSig.side, midSig.side].filter(function (s) { return s === nextSide; }).length;
    var alignBonus = alignedCount === 3 ? 6 : alignedCount === 2 ? 2 : -6;
    var chopPenalty = (targetMom.patternKey === 'DOJI' || (Number(targetRead.efficiency) > 0 && Number(targetRead.efficiency) < 0.16)) ? -5 : 0;
    var trapBonus = (absorptionTrap === nextSide || (sweepIsReversal && sweepSide === nextSide)) ? 5 : 0;
    var confidence = Math.min(95, Math.max(50, Math.round(52 + edgeMargin * 40 + alignBonus + chopPenalty + trapBonus)));
    var quality = confidence >= 76 ? 'HIGH' : confidence >= 64 ? 'STRONG' : 'WAIT';

    if (!isSyntheticCtx) {
      ncpLastVerdicts[tf] = { symbol: sym, barId: barId, side: nextSide, margin: rawMargin };
      if (secsLeft <= lockWindow && quality !== 'WAIT' && (!ncpPendingLocks[tf] || ncpPendingLocks[tf].targetBarId !== barId + 1 || ncpPendingLocks[tf].symbol !== sym)) {
        ncpPendingLocks[tf] = { symbol: sym, tf: tf, targetBarId: barId + 1, side: nextSide, openPrice: price, conf: confidence };
        isBarLocked = true;
      }
    }

    // 7. Empirical Directional Candle Body & Wick OHLC Projection for Selected Timeframe
    var isBuySide = nextSide === 'BUY';
    var geom = measureCandleGeometry(targetClosed, baseAtr, price);
    var dirBody = isBuySide ? geom.bullBody : geom.bearBody;
    var typicalBody = (dirBody > 0 ? dirBody * 0.6 + geom.body * 0.4 : geom.body) || (baseAtr * 0.52);
    var convMult = 0.55 + ((confidence - 50) / 45) * 0.72;
    var volBoost = Math.max(0.82, Math.min(1.25, 0.88 + (targetMom.volRatio - 1) * 0.22));
    var rawMove = typicalBody * convMult * volBoost;
    var minMove = Math.max(price * 0.00015, baseAtr * 0.22);
    var maxMove = Math.max(minMove * 1.4, baseAtr * 1.35);
    var rawExpectedMove = Math.max(minMove, Math.min(maxMove, rawMove));

    // Blend softly toward immediate SL magnet or SMC zone in the predicted direction when within 1 candle range
    var dirMagnet = isBuySide
      ? (nearSellSl ? Number(nearSellSl.price) - price : (sellOb ? Number(sellOb.entry) - price : 0))
      : (nearBuySl ? price - Number(nearBuySl.price) : (buyOb ? price - Number(buyOb.entry) : 0));
    if (dirMagnet >= rawExpectedMove * 0.55 && dirMagnet <= rawExpectedMove * 1.45) {
      rawExpectedMove = Math.max(minMove, Math.min(maxMove, rawExpectedMove * 0.7 + dirMagnet * 0.3));
    }

    var moveDigits = price < 0.01 ? 6 : price < 1 ? 5 : price < 10 ? 5 : /JPY/.test(cleanSymbol(sym)) && price < 1000 ? 3 : 2;
    var minTick = Math.pow(10, -moveDigits);
    var projOpen = roundPriceDigits(price, moveDigits);
    var projClose = roundPriceDigits(isBuySide ? (projOpen + rawExpectedMove) : (projOpen - rawExpectedMove), moveDigits);
    if (Math.abs(projClose - projOpen) < minTick) {
      projClose = roundPriceDigits(isBuySide ? (projOpen + minTick) : (projOpen - minTick), moveDigits);
    }
    var expectedMove = roundPriceDigits(Math.abs(projClose - projOpen), moveDigits);

    var tipUp = geom.upperWick > 0 ? geom.upperWick : (baseAtr * 0.22);
    var tipDn = geom.lowerWick > 0 ? geom.lowerWick : (baseAtr * 0.22);
    var rawHigh, rawLow;
    if (isBuySide) {
      var dnTail = Math.max(expectedMove * 0.10, Math.min(expectedMove * 0.55, tipDn * (0.65 + (100 - confidence) / 140)));
      var upTail = Math.max(expectedMove * 0.08, Math.min(expectedMove * 0.42, tipUp * 0.80));
      rawLow = projOpen - dnTail;
      rawHigh = projClose + upTail;
    } else {
      var upTail2 = Math.max(expectedMove * 0.10, Math.min(expectedMove * 0.55, tipUp * (0.65 + (100 - confidence) / 140)));
      var dnTail2 = Math.max(expectedMove * 0.08, Math.min(expectedMove * 0.42, tipDn * 0.80));
      rawHigh = projOpen + upTail2;
      rawLow = projClose - dnTail2;
    }
    var projHigh = roundPriceDigits(Math.max(projOpen, projClose, rawHigh), moveDigits);
    var projLow = roundPriceDigits(Math.min(projOpen, projClose, rawLow), moveDigits);
    var deltaLabel = formatMoveDelta(sym, expectedMove, isBuySide, moveDigits);

    var hist = ncpHistoryFor(tf);
    var liveTotal = hist.length;
    var liveWins = hist.filter(function (x) { return x.won; }).length;
    var liveWinPct = liveTotal > 0 ? Math.round((liveWins / liveTotal) * 100) : 0;

    var resultObj = {
      symbol: sym,
      tf: tf,
      tfKey: spec.key,
      tfLabel: spec.label,
      tfMs: tfMs,
      barId: barId,
      price: projOpen,
      side: nextSide,
      confidence: confidence,
      quality: quality,
      isBarLocked: isBarLocked,
      expectedMove: expectedMove,
      projectedPrice: projClose,
      projOpen: projOpen,
      projClose: projClose,
      projHigh: projHigh,
      projLow: projLow,
      deltaLabel: deltaLabel,
      moveDigits: moveDigits,
      countdownText: countdownText,
      secsLeft: secsLeft,
      ltfKey: spec.ltf,
      ltfSide: ltfSide,
      ltfConf: ltfConf,
      targetKey: spec.key,
      targetSide: targetSig.side,
      targetConf: targetSig.conf,
      midKey: spec.mid,
      midSide: midSig.side,
      midConf: midSig.conf,
      htfKey: spec.htf,
      htfSide: htfSide,
      m1Side: ltfSide,
      m1Conf: ltfConf,
      m5Side: targetSig.side,
      m5Conf: targetSig.conf,
      m15Side: midSig.side,
      m15Conf: midSig.conf,
      alignedCount: alignedCount,
      patternLabel: targetMom.patternLabel,
      patternKey: targetMom.patternKey,
      regime: cal.regime,
      histWinPct: histWinPct,
      histSamples: histSamples,
      liveWins: liveWins,
      liveTotal: liveTotal,
      liveWinPct: liveWinPct,
      liveClv: liveClv,
      upTickPct: upTickPct,
      volRatio: targetMom.volRatio,
      upperWickPct: upperWickPct,
      lowerWickPct: lowerWickPct,
      wickSummary: wickSummary,
      vwapSide: vwapSide,
      flowBuyPct: flowBuyPct,
      flowSide: flowSide,
      absorptionTrap: absorptionTrap,
      absorptionTitle: absorptionTitle,
      flowSub: flowSub,
      flowDetail: flowDetail,
      smcSide: smcSide,
      smcLabel: smcLabel,
      sweepSide: sweepSide,
      sweepIsReversal: sweepIsReversal,
      sweepTitle: sweepTitle,
      sweepSub: sweepSub,
      sweepTag: sweepTag,
      buyScore: buyScore,
      sellScore: sellScore,
      d15: d15,
      d45: d45,
      tickCount: validTicks.length
    };

    if (!bypassFixedLock) {
      saveNcpLock(sym, tf, {
        version: 2,
        symbol: sym,
        tf: tf,
        barId: barId,
        targetBarId: barId + 1,
        expiresAt: (barId + 1) * tfMs,
        lockedAt: nowMs,
        hasClosedPrevBar: latestClosedBarId >= barId - 1,
        baseAtr: baseAtr,
        prediction: resultObj
      });
    }
    return resultObj;
  }

  function setElText(id, txt) {
    var el = $(id);
    if (el && el.textContent !== txt) el.textContent = txt;
  }

  function paintNextCandlePredictor() {
    var badgeEl = $('ncp-verdict-badge');
    var listEl = $('ncp-list');
    if (!badgeEl && !listEl && !$('next-candle-panel')) return;
    var curSpec = NCP_TFS[currentChartTf()] || NCP_TFS['5m'];
    setElText('ncp-market', symbol || 'MARKET');
    setElText('ncp-tf-badge', curSpec.label);
    if (!nextCandlePred) {
      if (badgeEl) {
        badgeEl.textContent = 'SCANNING';
        badgeEl.className = 'ncp-verdict-badge';
      }
      setElText('ncp-status', 'Waiting for live TV quote…');
      setElText('ncp-rule', 'Syncing ' + curSpec.label + ' candle structure, tick velocity, 13-venue flow & SL pools…');
      setElText('ncp-sub-badge', curSpec.label + ' PULSE');
      if (listEl) {
        listEl.innerHTML = '<div class="slz-empty">Waiting for live TV quote & ' + esc(curSpec.label) + ' candle structure…</div>';
      }
      return;
    }
    var p = nextCandlePred;
    var isBuy = p.side === 'BUY';
    var isWait = p.quality === 'WAIT';
    var sideCls = isWait ? '' : (isBuy ? 'buy' : 'sell');
    var rowSideCls = isBuy ? 'buy' : 'sell';
    var moveDigits = Number.isInteger(p.moveDigits) ? p.moveDigits : 2;
    var expTxt = p.deltaLabel || formatMoveDelta(p.symbol, p.expectedMove, isBuy, moveDigits);

    setElText('ncp-tf-badge', p.tfLabel);
    if (badgeEl) {
      var badgeText = isWait
        ? ('◆ CHOP ' + p.confidence + '%')
        : ((isBuy ? '▲ NEXT BUY ' : '▼ NEXT SELL ') + p.confidence + '%');
      var badgeCls = 'ncp-verdict-badge' + (sideCls ? ' ' + sideCls : '');
      if (badgeEl.textContent !== badgeText) badgeEl.textContent = badgeText;
      if (badgeEl.className !== badgeCls) badgeEl.className = badgeCls;
    }
    var accBit = p.liveTotal >= 2
      ? ('LIVE ' + p.liveWinPct + '% (' + p.liveWins + '/' + p.liveTotal + ')')
      : (p.histSamples >= 3 ? ('HIST ' + p.histWinPct + '% (' + p.histSamples + ')') : (p.alignedCount + '/3 TF'));
    setElText('ncp-status', (p.isBarLocked ? 'FIXED · ' : '') + p.regime + ' · ' + p.patternLabel + ' · ' + accBit);
    setElText('ncp-rule', p.absorptionTrap
      ? ('⚠️ ' + p.absorptionTitle + ' · ' + p.tfLabel + ' target ' + px(p.projClose) + ' (' + expTxt + ')')
      : p.sweepIsReversal
        ? (p.sweepTitle + ' · ' + p.tfLabel + ' target ' + px(p.projClose) + ' (' + expTxt + ')')
        : isWait
          ? ((p.isBarLocked ? '🔒 FIXED CHOP (' : 'Low-edge chop (') + p.confidence + '%) · ' + p.tfLabel + ' lean ' + expTxt + ' · ' + p.countdownText)
          : ((p.isBarLocked ? '🔒 FIXED ' : 'Next ') + p.tfLabel + ' target ' + px(p.projClose) + ' (' + expTxt + ') · ' + p.countdownText));
    setElText('ncp-sub-badge', p.buyScore + 'B / ' + p.sellScore + 'S · ' + (p.isBarLocked ? 'FIXED ' : '') + p.countdownText);
    if (!listEl) return;

    var tfSummary = (p.ltfKey === p.targetKey)
      ? ('PULSE' + (p.ltfSide === 'BUY' ? '▲' : '▼') + p.ltfConf + ' · ' + p.targetKey + (p.targetSide === 'BUY' ? '▲' : '▼') + p.targetConf + ' · ' + p.midKey + (p.midSide === 'BUY' ? '▲' : '▼') + p.midConf)
      : (p.ltfKey + (p.ltfSide === 'BUY' ? '▲' : '▼') + p.ltfConf + ' · ' + p.targetKey + (p.targetSide === 'BUY' ? '▲' : '▼') + p.targetConf + ' · ' + p.midKey + (p.midSide === 'BUY' ? '▲' : '▼') + p.midConf);

    var rows = [
      {
        key: 'next-tf-candle',
        cls: rowSideCls,
        title: (isWait ? '◆ LEAN ' + p.side + ' · ' : (isBuy ? '▲ BUY · ' : '▼ SELL · ')) + px(p.projClose),
        sub: (p.isBarLocked ? 'LOCKED ' : (p.tfLabel + ' ')) + p.countdownText + ' · MOVE ' + expTxt,
        tag: isWait ? ('CHOP ' + p.confidence + '%') : (p.confidence + '%'),
        details: '<b>Next ' + esc(p.tfLabel) + ' Candle Projection (' + esc(p.symbol) + ' · ' + esc(p.regime) + '):</b><br>' +
          'Projected Open: <b>' + esc(px(p.projOpen)) + '</b> → Target Close: <b>' + esc(px(p.projClose)) + '</b> (' + esc(expTxt) + ') · Range: <b>' + esc(px(p.projLow)) + ' – ' + esc(px(p.projHigh)) + '</b>.<br>' +
          '6-Pillar Score: BUY ' + p.buyScore + ' vs SELL ' + p.sellScore + ' · Quality: <b>' + esc(p.quality) + '</b> · Closes in <b>' + esc(p.countdownText) + '</b>' + (p.isBarLocked ? ' (Pre-Close Locked)' : '') + '.<br>' +
          (p.liveTotal > 0 ? ('Live ' + esc(p.tfLabel) + ' Track Record: <b>' + p.liveWins + '/' + p.liveTotal + ' (' + p.liveWinPct + '%)</b>.') : ('Pattern Historical Edge: <b>' + p.histWinPct + '%</b> across ' + p.histSamples + ' recent ' + esc(p.tfLabel) + ' bars.'))
      },
      {
        key: 'mtf-pulse',
        cls: p.alignedCount >= 2 ? rowSideCls : (p.ltfSide === 'BUY' ? 'buy' : 'sell'),
        title: tfSummary,
        sub: p.patternLabel + ' · ' + p.wickSummary + ' · ' + p.regime,
        tag: p.alignedCount + '/3',
        details: '<b>Pattern, Regime & Multi-TF Cascade (' + p.tickCount + ' ticks · ' + p.upTickPct + '% up-ticks):</b><br>' +
          esc(p.tfLabel) + ' Candle Pattern: <b>' + esc(p.patternLabel) + '</b> · Live CLV: <b>' + p.liveClv + '%</b> · Vol Ratio: <b>' + p.volRatio.toFixed(2) + 'x</b>.<br>' +
          '15s Delta: ' + (p.d15 >= 0 ? '+' : '') + p.d15.toFixed(moveDigits) + ' · 60s Delta: ' + (p.d45 >= 0 ? '+' : '') + p.d45.toFixed(moveDigits) + ' · VWAP: <b>' + esc(p.vwapSide) + '</b>.'
      },
      {
        key: 'flow-absorption',
        cls: p.flowSide === 'BUY' ? 'buy' : p.flowSide === 'SELL' ? 'sell' : rowSideCls,
        title: p.absorptionTrap ? ('⚠️ ' + p.absorptionTitle) : ('FLOW ' + p.flowBuyPct + '%B / ' + (100 - p.flowBuyPct) + '%S'),
        sub: p.flowSub,
        tag: p.absorptionTrap ? 'TRAP' : p.flowSide,
        details: '<b>Order Flow & Absorption Guard:</b><br>' +
          esc(p.flowDetail || p.flowSub) + '.<br>' +
          (p.absorptionTrap
            ? 'Divergence detected: aggressive retail taker volume is failing to advance price, signalling institutional limit absorption.'
            : 'Rolling 45s taker flow across Binance + 12 public venues agrees with structural flow bias.')
      },
      {
        key: 'sl-magnet',
        cls: p.sweepSide === 'BUY' ? 'buy' : p.sweepSide === 'SELL' ? 'sell' : rowSideCls,
        title: p.sweepTitle,
        sub: p.sweepSub,
        tag: p.sweepTag,
        details: '<b>Smart Money OB/FVG & SL Liquidity Pull:</b><br>' +
          (p.smcLabel ? ('SMC Reaction: <b>' + esc(p.smcLabel) + '</b>.<br>') : '') +
          esc(p.sweepSub) + '.<br>' +
          (p.sweepIsReversal
            ? 'Recent wick swept an active stop-loss pocket and snapped back — high-probability next-candle reversal zone.'
            : 'Unswept SL pools & SMC zones act as immediate short-term magnets for the next candle.')
      }
    ];

    renderDetailRows(listEl, rows, 'ncp-row');
  }

  var lastNextCandleNotifySig = '';
  function notifyNextCandleChart() {
    if (typeof root.dispatchEvent !== 'function') return;
    var p = nextCandlePred;
    var sig = p
      ? [p.symbol, p.tf, p.side, p.quality, p.confidence, p.projOpen.toFixed(4), p.projClose.toFixed(4), p.projHigh.toFixed(4), p.projLow.toFixed(4)].join(':')
      : (symbol + '|0');
    if (sig === lastNextCandleNotifySig) return;
    lastNextCandleNotifySig = sig;
    root.dispatchEvent(new CustomEvent('chart:next-candle-update'));
  }

  function refreshNextCandleAI() {
    if (!quote) {
      var q = root.SOFT_TV_QUOTE;
      if (q && canonicalSymbol(q.symbol) === canonicalSymbol(symbol) && Number(q.price) > 0) {
        quote = { price: Number(q.price), at: Number(q.at) || Date.now(), tv_symbol: q.tv_symbol || '' };
      }
    }
    if (!quote) {
      nextCandlePred = null;
      paintNextCandlePredictor();
      notifyNextCandleChart();
      return;
    }
    recordTick(symbol, quote.price, quote.at);
    nextCandlePred = computeNextCandlePrediction({
      symbol: symbol,
      tf: currentChartTf(),
      price: quote.price,
      smc: smcZones,
      nowMs: Date.now()
    });
    paintNextCandlePredictor();
    notifyNextCandleChart();
  }

  var lastRefreshSig = '';
  var lastChartNotifySig = '';
  var lastSmcPrice = 0;
  var refreshTimer = null;
  var smcWorkerGen = 0;

  function smcZoneSig(z) {
    return [
      z.id, z.kind, z.tf, z.accuracy || 0, z.entry, z.stop, z.tp1, z.tp2,
      z.zoneLow, z.zoneHigh,
      Array.isArray(z.tags) ? z.tags.join('+') : ''
    ].join(':');
  }

  function notifyChartModules() {
    notifyNextCandleChart();
    if (typeof root.dispatchEvent !== 'function') return;
    var b = (smcZones && smcZones.buy) || [];
    var s = (smcZones && smcZones.sell) || [];
    var sig = symbol + '|' +
      b.map(smcZoneSig).join(',') + '|' +
      s.map(smcZoneSig).join(',') + '|' +
      (radarPlan ? [radarPlan.side, radarPlan.entry, radarPlan.stop, radarPlan.beTrigger, radarPlan.tp1, radarPlan.tp2, radarPlan.edgePct].join(':') : '');
    if (sig === lastChartNotifySig) return;
    lastChartNotifySig = sig;
    root.dispatchEvent(new CustomEvent('chart:smc-radar-update'));
  }

  function scheduleRefresh() {
    if (document && document.hidden) return;
    if (refreshTimer) return;
    refreshTimer = setTimeout(function () {
      refreshTimer = null;
      refreshAll();
    }, 150);
  }

  function refreshAll() {
    if (document && document.hidden) return;
    var tf = currentChartTf();
    activeTf = tf;
    var q = root.SOFT_TV_QUOTE;
    if (q && canonicalSymbol(q.symbol) === canonicalSymbol(symbol) && Number(q.price) > 0) {
      var at = Number(q.at) || Date.now();
      if (Date.now() - at <= QUOTE_MS && at <= Date.now() + 5000) {
        quote = { price: Number(q.price), at: at, tv_symbol: q.tv_symbol || '' };
      }
    }
    var swingState = root.SwingAI && typeof root.SwingAI.state === 'function' ? root.SwingAI.state() : null;
    if (!quote && swingState && canonicalSymbol(swingState.symbol) === canonicalSymbol(symbol) && Number(swingState.price) > 0) {
      quote = { price: Number(swingState.price), at: Number(swingState.updatedAt) || Date.now(), tv_symbol: swingState.tvSymbol || '' };
    }
    if (quote) {
      recordTick(symbol, quote.price, quote.at);
    }
    var h = (quote && root.SwingAI && typeof root.SwingAI.structure === 'function') ? root.SwingAI.structure() : null;
    var ci = root.ChartIndicators;
    var ciState = ci && typeof ci.state === 'function' ? ci.state() : null;
    var liqState = root.StopLiquidity && typeof root.StopLiquidity.state === 'function' ? root.StopLiquidity.state() : null;
    var activePlan = swingState && swingState.plan;
    var flowTotals = (root.MultiExchangeOrderFlow && typeof root.MultiExchangeOrderFlow.getOpenTotals === 'function')
      ? root.MultiExchangeOrderFlow.getOpenTotals()
      : null;
    var flowBuy = flowTotals ? (Number(flowTotals.buy) || 0) : 0;
    var flowSell = flowTotals ? (Number(flowTotals.sell) || 0) : 0;
    var flowSig = (flowBuy + flowSell) > 0
      ? Math.round((flowBuy / (flowBuy + flowSell)) * 100)
      : (swingState ? Math.round(Number(swingState.flowBias) || 50) : '');
    var nextSig = [
      symbol,
      tf,
      ciState && ciState.tf === tf ? ciState.bars : 0,
      quote ? quote.price : 0,
      h ? h.at : 0,
      swingState ? ((swingState.activeSide || '') + '|' + (activePlan ? activePlan.entry + '|' + activePlan.target + '|' + activePlan.stop : '')) : '',
      liqState ? liqState.removed + '|' + (liqState.visibleZones ? liqState.visibleZones.length : 0) : '',
      flowSig
    ].join('#');
    if (nextSig === lastRefreshSig) return;
    lastRefreshSig = nextSig;

    if (h && canonicalSymbol(h.symbol) === canonicalSymbol(symbol) && h.frames) {
      var structChanged = Number(h.at) !== lastStructureAt;
      var priceMoved = !lastSmcPrice || Math.abs(quote.price - lastSmcPrice) / lastSmcPrice >= 0.0006;
      if (structChanged || priceMoved) {
        var hasColdZones = !((smcZones.buy && smcZones.buy.length) || (smcZones.sell && smcZones.sell.length));
        var workerApi = root.SoftCalcWorker;
        if (!hasColdZones && workerApi && typeof workerApi.detectSmc === 'function' && workerApi.available && workerApi.available()) {
          var reqGen = ++smcWorkerGen;
          var reqSym = symbol;
          var reqPrice = quote.price;
          var reqAt = Number(h.at) || Date.now();
          lastStructureAt = reqAt;
          lastSmcPrice = reqPrice;
          workerApi.detectSmc(reqSym, { M5: h.frames.M5, M15: h.frames.M15, H1: h.frames.H1 }, reqPrice, Date.now())
            .then(function (res) {
              if (reqGen !== smcWorkerGen || reqSym !== symbol || !res || !res.smcZones) return;
              smcZones = res.smcZones;
              if (quote) {
                radarPlan = computeProfitRadar({
                  symbol: symbol,
                  price: quote.price,
                  swing: root.SwingAI && typeof root.SwingAI.state === 'function' ? root.SwingAI.state() : swingState,
                  smc: smcZones
                });
              }
              paintSmartMoney();
              paintProfitRadar();
              notifyChartModules();
            })
            .catch(function () {});
        } else {
          smcZones = detectSmartMoney(h.frames, quote.price, Date.now());
          lastStructureAt = Number(h.at) || Date.now();
          lastSmcPrice = quote.price;
        }
      }
    }
    if (quote) {
      radarPlan = computeProfitRadar({
        symbol: symbol,
        price: quote.price,
        swing: swingState,
        smc: smcZones
      });
      nextCandlePred = computeNextCandlePrediction({
        symbol: symbol,
        tf: tf,
        price: quote.price,
        swing: swingState,
        structure: h,
        stopLiquidity: liqState,
        orderFlow: flowTotals,
        smc: smcZones
      });
    } else {
      nextCandlePred = null;
    }
    paintSmartMoney();
    paintProfitRadar();
    paintNextCandlePredictor();
    notifyChartModules();
  }

  function setSymbol(next) {
    var s = String(next || '').trim();
    if (!s || s === symbol) return;
    symbol = s;
    activeTf = currentChartTf();
    smcWorkerGen++;
    lastRefreshSig = '';
    lastChartNotifySig = '';
    lastNextCandleNotifySig = '';
    lastSmcPrice = 0;
    quote = null;
    smcZones = { buy: [], sell: [] };
    radarPlan = null;
    nextCandlePred = null;
    tickHistory = [];
    curTargetBars = Object.create(null);
    ncpLastVerdicts = Object.create(null);
    ncpPendingLocks = Object.create(null);
    ncpFixedLocks = Object.create(null);
    ncpHistories = Object.create(null);
    ncpRegimeCache = null;
    ncpHistoryFor(activeTf);
    loadNcpLock(symbol, activeTf);
    lastStructureAt = 0;
    refreshAll();
  }

  function acceptQuote(q) {
    if (!q || canonicalSymbol(q.symbol) !== canonicalSymbol(symbol) || !(Number(q.price) > 0)) return false;
    var at = Number(q.at) || Date.now();
    if (Date.now() - at > QUOTE_MS || at > Date.now() + 5000) return false;
    quote = { price: Number(q.price), at: at, tv_symbol: q.tv_symbol || '' };
    recordTick(symbol, quote.price, at);
    refreshNextCandleAI();
    scheduleRefresh();
    return true;
  }

  function init() {
    if (!$('smart-money-panel') && !$('profit-radar-panel') && !$('next-candle-panel') && !$('next-candle-predictor')) return;
    var term = root.SoftradeXTerminal;
    setSymbol(term && typeof term.getCurrentSymbol === 'function' ? term.getCurrentSymbol() : 'XAUUSDm');
    root.addEventListener('chart:market', function (ev) {
      var d = (ev && ev.detail) || {};
      setSymbol(d.symbol || (d.meta && d.meta.symbol));
    });
    root.addEventListener('chart:interval', function (ev) {
      var tf = (ev && ev.detail && ev.detail.tf) || currentChartTf();
      if (NCP_TFS[tf]) activeTf = tf;
      ncpRegimeCache = null;
      lastRefreshSig = '';
      refreshAll();
      refreshNextCandleAI();
    });
    root.addEventListener('chart:bars-loaded', function () {
      lastRefreshSig = '';
      refreshAll();
    });
    root.addEventListener('chart:tv-quote', function (ev) { acceptQuote(ev && ev.detail); });
    root.addEventListener('swing:structure', scheduleRefresh);
    root.addEventListener('orderflow:update', scheduleRefresh);
    root.addEventListener('chart:liquidity-zones', scheduleRefresh);
    root.addEventListener('chart:refresh', scheduleRefresh);
    if (document) {
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) refreshAll();
      });
    }
    setInterval(function () {
      if (!document || !document.hidden) refreshAll();
    }, 2500);
    setInterval(function () {
      if (!document || !document.hidden) refreshNextCandleAI();
    }, 1000);
    refreshAll();
  }

  var api = {
    detectSmartMoney: detectSmartMoney,
    computeProfitRadar: computeProfitRadar,
    computeNextCandlePrediction: computeNextCandlePrediction,
    lotUnitValue: lotUnitValue,
    setSymbol: setSymbol,
    acceptQuote: acceptQuote,
    refresh: refreshAll,
    state: function () {
      return {
        symbol: symbol,
        tf: activeTf,
        price: quote ? quote.price : 0,
        smc: smcZones,
        radar: radarPlan,
        nextCandle: nextCandlePred,
        structureAt: lastStructureAt
      };
    }
  };

  root.SmartMoneyZones = api;
  root.ProfitRadar = api;
  root.NextCandleAI = {
    predict: computeNextCandlePrediction,
    refresh: refreshNextCandleAI,
    state: function () { return nextCandlePred; },
    history: function (tf) { return ncpHistoryFor(tf || activeTf).slice(); }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (document) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})(typeof window === 'undefined' ? globalThis : window);


}
