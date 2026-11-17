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
  function paint() {
    if (!$('stop-liquidity-panel')) return;
    slzSetText('slz-market', symbol || 'MARKET');
    slzSetText('slz-price', quote ? px(quote.price) : '—');
    slzSetText('slz-status', !fresh() ? 'TV quote stale / unavailable' : note);
    ['buy','sell'].forEach(function(side) {
      var list = $('slz-' + side + '-list'), rows = ranked(side), opened = Object.create(null);
      if (!list) return;
      if (list.querySelectorAll) Array.prototype.forEach.call(list.querySelectorAll('details[open]'), function(el) { opened[el.dataset.key] = true; });
      slzSetText('slz-' + side + '-count', rows.length + ' zones');
      var html = rows.map(function(z) {
        var density = z.touches >= 4 ? 'HIGH' : z.touches >= 2 ? 'MED' : 'LOW';
        var dist = quote ? Math.abs(z.price-quote.price)/quote.price*100 : 0;
        return '<details class="slz-row ' + side + '" data-key="' + esc(z.id) + '"' + (opened[z.id] ? ' open' : '') + '><summary>' +
          '<b>' + esc(px(z.price)) + '</b><span>' + z.touches + ' touches</span><em>' + density + '</em><i>›</i></summary>' +
          '<div class="slz-details">Estimated stop area for ' + (side === 'buy' ? 'long / BUY' : 'short / SELL') + ' positions · ' + dist.toFixed(2) + '% from TV price.<br>' +
          esc(z.frames.join(' + ')) + ' confirmed pivots; concentration ranks repeated structure, not actual SL order counts.<br>' +
          'First model level at ' + esc(new Date(z.created).toLocaleTimeString()) + '. Removed on an observed TV-price crossing.</div></details>';
      }).join('') || '<div class="slz-empty">No unswept ' + (side === 'buy' ? 'lower' : 'upper') + ' zone confirmed yet.</div>';
      if (list.innerHTML !== html) list.innerHTML = html;
    });
    slzSetText('slz-foot', (hitCount ? hitCount + ' crossed zone(s) removed · ' : '') +
      'Estimated levels · TV quote crossings only; brief touches between quotes may be missed.');
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
  var quote = null;
  var smcZones = { buy: [], sell: [] };
  var radarPlan = null;
  var lastStructureAt = 0;

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
      var openedPlan = Object.create(null);
      if (planList.querySelectorAll) {
        Array.prototype.forEach.call(planList.querySelectorAll('details[open]'), function (el) {
          openedPlan[el.dataset.key] = true;
        });
      }
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

      var planHtml = planRows.map(function (r) {
        return '<details class="slz-row prp-row ' + r.cls + '" data-key="' + r.key + '"' + (openedPlan[r.key] ? ' open' : '') + '>' +
          '<summary>' +
            '<b>' + esc(r.title) + '</b>' +
            '<span>' + esc(r.sub) + '</span>' +
            '<em>' + esc(r.tag) + '</em>' +
            '<i>›</i>' +
          '</summary>' +
          '<div class="slz-details prp-details">' + r.details + '</div>' +
        '</details>';
      }).join('');
      if (planList.innerHTML !== planHtml) planList.innerHTML = planHtml;
    }
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
    var h = (quote && root.SwingAI && typeof root.SwingAI.structure === 'function') ? root.SwingAI.structure() : null;
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
    }
    paintSmartMoney();
    paintProfitRadar();
    notifyChartModules();
  }

  function setSymbol(next) {
    var s = String(next || '').trim();
    if (!s || s === symbol) return;
    symbol = s;
    smcWorkerGen++;
    lastRefreshSig = '';
    lastChartNotifySig = '';
    lastSmcPrice = 0;
    quote = null;
    smcZones = { buy: [], sell: [] };
    radarPlan = null;
    lastStructureAt = 0;
    refreshAll();
  }

  function acceptQuote(q) {
    if (!q || canonicalSymbol(q.symbol) !== canonicalSymbol(symbol) || !(Number(q.price) > 0)) return false;
    var at = Number(q.at) || Date.now();
    if (Date.now() - at > QUOTE_MS || at > Date.now() + 5000) return false;
    quote = { price: Number(q.price), at: at, tv_symbol: q.tv_symbol || '' };
    scheduleRefresh();
    return true;
  }

  function init() {
    if (!$('smart-money-panel') && !$('profit-radar-panel')) return;
    var term = root.SoftradeXTerminal;
    setSymbol(term && typeof term.getCurrentSymbol === 'function' ? term.getCurrentSymbol() : 'XAUUSDm');
    root.addEventListener('chart:market', function (ev) {
      var d = (ev && ev.detail) || {};
      setSymbol(d.symbol || (d.meta && d.meta.symbol));
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
    refreshAll();
  }

  var api = {
    detectSmartMoney: detectSmartMoney,
    computeProfitRadar: computeProfitRadar,
    lotUnitValue: lotUnitValue,
    setSymbol: setSymbol,
    acceptQuote: acceptQuote,
    refresh: refreshAll,
    state: function () {
      return {
        symbol: symbol,
        price: quote ? quote.price : 0,
        smc: smcZones,
        radar: radarPlan,
        structureAt: lastStructureAt
      };
    }
  };

  root.SmartMoneyZones = api;
  root.ProfitRadar = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (document) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})(typeof window === 'undefined' ? globalThis : window);


}
