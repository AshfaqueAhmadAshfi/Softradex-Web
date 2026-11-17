// @ts-nocheck
/* Consolidated TypeScript module */
export function loadModule(): void {
  (window as any).SOFTRADEX_PUBLIC_ONLY = true;

// ==================== swing-ai.js ====================
/* NEXT SELL / BUY SWING AI — dual independent deterministic multi-scale swing engines.
   --------------------------------------------------------------------------
   Evaluates confirmed closed TradingView candles (M1 · M5 · M15 · H1 · H4 · D1),
   institutional SMC zones (unscaled OB / FVG / OTE), fractal swing pivots,
   and TradingView reference quotes to lock BOTH:
     - SHORT SWING (choto swing · M5/M15 intraday liquidity structure)
     - MAJOR SWING (boro swing · H1/H4/D1 higher-timeframe swing structure)
   Persists locked BUY and SELL plans + scales in localStorage per symbol and
   never shifts levels on reload or intra-bar ticks until SL/TP invalidation.
   -------------------------------------------------------------------------- */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  var TFS = [
    { key: 'M1', tf: '1m', minutes: 1, weight: 0.8 },
    { key: 'M5', tf: '5m', minutes: 5, weight: 1.4 },
    { key: 'M15', tf: '15m', minutes: 15, weight: 1.8 },
    { key: 'H1', tf: '1h', minutes: 60, weight: 1.6 },
    { key: 'H4', tf: '4h', minutes: 240, weight: 1.3 },
    { key: 'D1', tf: '1d', minutes: 1440, weight: 1.1 }
  ];
  var TOTAL_WEIGHT = TFS.reduce(function (s, t) { return s + t.weight; }, 0);
  var EMA_FAST = 9, EMA_SLOW = 21, EMA_TREND = 50;
  var RSI_N = 14, ATR_N = 14, MOMENTUM_BARS = 5, SWING = 20;
  var BB_N = 20, BB_K = 2, STOCH_N = 14, STOCH_SMOOTH = 3;
  var MACD_FAST = 12, MACD_SLOW = 26, MACD_SIGNAL = 9;
  var ATR_MOMENTUM = 0.22, EMA_TOL = 0.04, RSI_BULL = 56, RSI_BEAR = 44;
  var SIDE_SCORE = 2, MIN_BARS = 55, MIN_BARS_HTF = 40;
  var MIN_RR = 1.25, PRIMARY_CONF_MIN = 40, SECONDARY_CONF_MIN = 22;
  var CALCULATION_VERSION = 6, ENTRY_TOLERANCE_ATR = 0.06;
  var BASE_MS = 5 * 60 * 1000;
  var CANDLES_MS = 25000;
  var PRICE_MS = 3500;
  var FAIL_REBUILD_MS = 4000;
  var TIMEOUT_REBUILD_MS = 1200;
  var MAX_RESTORE_AGE_MS = 24 * 60 * 60 * 1000;
  var EXPIRED_SIGNAL_COOLDOWN_MS = 20 * 60 * 1000;
  var MAX_ETA_MIN = 720, MIN_ETA_MIN = 5;
  var LOG_KEY = 'softradex.swing.log';
  var PLAN_KEY = 'softradex.swing.plan.v4.';
  var MODE_KEY = 'softradex.swing.mode.v1.';
  var SAVED_ZONES_KEY = 'softradex.swing.savedZones.v1.';
  var MAX_SAVED_ZONES = 16;

  var SCALE_SPECS = {
    SHORT: {
      scale: 'SHORT',
      tfLabel: 'M5·M15',
      primaryKey: 'M5',
      secondaryKey: 'M15',
      obstacleKey: 'H1',
      smcFrames: ['M5', 'M15'],
      secMult: 0.55,
      minAtrMult: 0.9,
      maxAtrMult: 2.8,
      searchAtr: 5.0,
      minRR: 1.35,
      defaultRR: 1.75,
      minEta: 10,
      maxEta: 180
    },
    MAJOR: {
      scale: 'MAJOR',
      tfLabel: 'H1·H4',
      primaryKey: 'H1',
      secondaryKey: 'H4',
      obstacleKey: 'D1',
      smcFrames: ['H1'],
      secMult: 0.45,
      minAtrMult: 1.0,
      maxAtrMult: 3.2,
      searchAtr: 6.5,
      minRR: 1.5,
      defaultRR: 2.15,
      minEta: 45,
      maxEta: 720
    }
  };

  var symbol = '';
  var price = 0;
  var updatedAt = 0;
  var restoredBootAt = 0;
  var marketOpen = true;
  var quoteTvDigits = null;
  var reads = {};
  var vote = null;
  var plans = { BUY: null, SELL: null };
  var lockedScales = { BUY: { SHORT: null, MAJOR: null }, SELL: { SHORT: null, MAJOR: null } };
  var scaleMode = { BUY: 'AUTO', SELL: 'AUTO' };
  var flowBias = 50;
  var candleBusy = false;
  var bootCandlesReady = false;
  var priceBusy = false;
  var marketGeneration = 0;
  var candleBars = {};
  var candleSeenAt = {};
  var candleInstruments = {};
  var structureAt = 0;
  var quoteMaxAge = 20000;
  var tvInstrument = '';
  var candleRound = 0;
  var planNotes = { BUY: '', SELL: '' };
  var log = [];
  var flowAt = 0;
  var structureStamp = '';
  var directionModels = { BUY: null, SELL: null };
  var lastCompletedSignals = {};
  var recentExpiredSignals = {};
  var savedChartZones = [];
  var savedPlanSignatures = { BUY: '', SELL: '' };
  var runningSeqCounter = 0;
  var manualScalePickAt = { BUY: 0, SELL: 0 };
  var BOARDS = [
    { id: 'swing-ai-board', prefix: 'sai-', side: 'SELL' },
    { id: 'buy-swing-ai-board', prefix: 'sbi-', side: 'BUY' }
  ];

  /* ---------------------------------------------------------------- maths */
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function cleanSymbol(v) { return String(v || '').replace(/m$/, ''); }
  function priceDigitsFor(n) {
    n = Number(n);
    if (!isFinite(n) || n <= 0) return 2;
    var baseDigits = n < 0.01 ? 8 : n < 1 ? 6 : n < 10 ? 5
      : /JPY/.test(cleanSymbol(symbol)) && n < 1000 ? 3 : 2;
    var digits = baseDigits;
    if (Number.isInteger(quoteTvDigits) && quoteTvDigits >= 0 && quoteTvDigits <= 8) {
      var cap = n >= 10000 ? 2 : n >= 1000 ? 3 : 8;
      digits = Math.min(cap, Math.max(baseDigits, quoteTvDigits));
    }
    return digits;
  }
  function roundPx(v) {
    var n = Number(v);
    if (!isFinite(n) || n <= 0) return n;
    var factor = Math.pow(10, priceDigitsFor(n));
    return Math.round(n * factor) / factor;
  }
  function px(v) {
    var n = Number(v);
    if (!isFinite(n) || n <= 0) return '—';
    var digits = priceDigitsFor(n);
    return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n.toFixed(d) : '—'; }
  function clock(ms) {
    ms = Math.max(0, Math.round(ms / 1000));
    var h = Math.floor(ms / 3600), m = Math.floor((ms % 3600) / 60), s = ms % 60;
    if (h > 0) return h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function formatDuration(mins) {
    mins = Math.round(Number(mins) || 0);
    if (mins < 60) return mins + ' min';
    var h = Math.floor(mins / 60), m = mins % 60;
    return m ? (h + 'h ' + m + 'm') : (h + 'h');
  }
  function hhmm(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  function mean(a) { var s = 0, i; for (i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function minBarsFor(key) { return (key === 'H4' || key === 'D1') ? MIN_BARS_HTF : MIN_BARS; }

  function ema(values, n) {
    if (!values.length) return 0;
    if (values.length < n || n <= 1) return mean(values);
    var k = 2 / (n + 1), e = mean(values.slice(0, n)), i;
    for (i = n; i < values.length; i++) e = values[i] * k + e * (1 - k);
    return e;
  }

  function rsi(closes, n) {
    n = n || RSI_N;
    if (closes.length < n + 1) return 50;
    var gains = 0, losses = 0, i, d;
    for (i = 1; i <= n; i++) { d = closes[i] - closes[i - 1]; if (d > 0) gains += d; else losses -= d; }
    var ag = gains / n, al = losses / n;
    for (i = n + 1; i < closes.length; i++) {
      d = closes[i] - closes[i - 1];
      ag = (ag * (n - 1) + Math.max(d, 0)) / n;
      al = (al * (n - 1) + Math.max(-d, 0)) / n;
    }
    if (al <= 0) return ag > 0 ? 100 : 50;
    return 100 - (100 / (1 + ag / al));
  }

  function atr(highs, lows, closes, n) {
    n = n || ATR_N;
    if (closes.length < n + 1) return 0;
    var trs = [], i;
    for (i = 1; i < closes.length; i++) {
      trs.push(Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      ));
    }
    var a = mean(trs.slice(0, n));
    for (i = n; i < trs.length; i++) a = (a * (n - 1) + trs[i]) / n;
    return a;
  }

  function macdOf(closes) {
    if (closes.length < MACD_SLOW + MACD_SIGNAL) return null;
    var line = [], i, fast, slow;
    for (i = MACD_SLOW; i <= closes.length; i++) {
      var slice = closes.slice(0, i);
      fast = ema(slice, MACD_FAST);
      slow = ema(slice, MACD_SLOW);
      line.push(fast - slow);
    }
    var sig = ema(line, MACD_SIGNAL);
    var last = line[line.length - 1];
    var prev = line.length > 1 ? line[line.length - 2] : last;
    return { line: last, signal: sig, hist: last - sig, rising: last > prev };
  }

  function bollinger(closes) {
    if (closes.length < BB_N) return null;
    var win = closes.slice(-BB_N);
    var mid = mean(win);
    var varr = win.reduce(function (s, v) { return s + (v - mid) * (v - mid); }, 0) / win.length;
    var sd = Math.sqrt(varr);
    var up = mid + BB_K * sd, low = mid - BB_K * sd;
    var last = closes[closes.length - 1];
    return {
      mid: mid, up: up, low: low,
      pctB: up > low ? ((last - low) / (up - low)) * 100 : 50,
      width: mid > 0 ? ((up - low) / mid) * 100 : 0
    };
  }

  function vwapOf(rows) {
    var pv = 0, vol = 0, i;
    for (i = 0; i < rows.length; i++) {
      var r = rows[i];
      var v = Number(r[5]) || 1;
      pv += ((Number(r[2]) + Number(r[3]) + Number(r[4])) / 3) * v;
      vol += v;
    }
    return vol > 0 ? pv / vol : 0;
  }

  function stochOf(highs, lows, closes) {
    if (closes.length < STOCH_N + STOCH_SMOOTH) return null;
    var ks = [];
    for (var i = STOCH_N - 1; i < closes.length; i++) {
      var hh = Math.max.apply(null, highs.slice(i - STOCH_N + 1, i + 1));
      var ll = Math.min.apply(null, lows.slice(i - STOCH_N + 1, i + 1));
      ks.push(hh > ll ? ((closes[i] - ll) / (hh - ll)) * 100 : 50);
    }
    var k = ks[ks.length - 1];
    var d = mean(ks.slice(-STOCH_SMOOTH));
    return { k: k, d: d };
  }

  /** Extract confirmed closed fractal swing highs/lows with unbroken & rejection-wick metadata. */
  function collectFractals(rows, wing) {
    var highs = [], lows = [];
    var end = rows.length - wing;
    for (var i = wing; i < end; i++) {
      var h = Number(rows[i][2]), l = Number(rows[i][3]);
      var o = Number(rows[i][1]), c = Number(rows[i][4]);
      var t = Number(rows[i][0]);
      var isH = true, isL = true;
      for (var w = 1; w <= wing; w++) {
        if (h < Number(rows[i - w][2]) || h < Number(rows[i + w][2])) isH = false;
        if (l > Number(rows[i - w][3]) || l > Number(rows[i + w][3])) isL = false;
      }
      // Require strictly higher/lower than immediate prev+next combined to filter flat noise
      if (isH && h === Number(rows[i - 1][2]) && h === Number(rows[i + 1][2])) isH = false;
      if (isL && l === Number(rows[i - 1][3]) && l === Number(rows[i + 1][3])) isL = false;

      var range = Math.max(1e-9, h - l);
      if (isH) {
        var brokenH = false;
        for (var jh = i + 1; jh < rows.length; jh++) {
          if (Number(rows[jh][4]) > h) { brokenH = true; break; }
        }
        var upperWick = h - Math.max(o, c);
        highs.push({ price: h, idx: i, time: t, age: rows.length - 1 - i, unbroken: !brokenH, sweep: (upperWick / range) >= 0.35 });
      }
      if (isL) {
        var brokenL = false;
        for (var jl = i + 1; jl < rows.length; jl++) {
          if (Number(rows[jl][4]) < l) { brokenL = true; break; }
        }
        var lowerWick = Math.min(o, c) - l;
        lows.push({ price: l, idx: i, time: t, age: rows.length - 1 - i, unbroken: !brokenL, sweep: (lowerWick / range) >= 0.35 });
      }
    }
    return { highs: highs, lows: lows };
  }

  function swingStructure(rows) {
    var span = Math.min(rows.length - 1, SWING + 12);
    var range = rows.slice(-span), highIndex = 0, lowIndex = 0;
    range.forEach(function (b, i) {
      if (Number(b[2]) >= Number(range[highIndex][2])) highIndex = i;
      if (Number(b[3]) <= Number(range[lowIndex][3])) lowIndex = i;
    });
    var low = Number(range[lowIndex][3]), high = Number(range[highIndex][2]);
    var frac = collectFractals(rows, 2);
    if (!frac.highs.length || !frac.lows.length) {
      var narrow = collectFractals(rows, 1);
      if (!frac.highs.length) frac.highs = narrow.highs;
      if (!frac.lows.length) frac.lows = narrow.lows;
    }
    var lastH = frac.highs.length ? frac.highs[frac.highs.length - 1].price : null;
    var lastL = frac.lows.length ? frac.lows[frac.lows.length - 1].price : null;
    var leg = high > low ? { low: low, high: high } : null;
    return {
      BUY: leg,
      SELL: leg,
      leg: leg,
      pivots: {
        high: lastH,
        low: lastL,
        highs: frac.highs.slice(-14),
        lows: frac.lows.slice(-14)
      }
    };
  }

  /* -------------------------------------------------------- one timeframe */
  function read(bars, _last, key) {
    var rows = (bars || []).filter(function (b) {
      if (!Array.isArray(b) || b.length < 5) return false;
      var o = Number(b[1]), h = Number(b[2]), l = Number(b[3]), c = Number(b[4]);
      return [o, h, l, c].every(function (n) { return Number.isFinite(n) && n > 0; }) &&
        h >= Math.max(o, l, c) && l <= Math.min(o, c);
    });
    if (rows.length < minBarsFor(key)) {
      return { key: key, ready: false, score: 0, verdict: 'NEUTRAL', atr: 0, reasons: ['not enough closed candles'] };
    }

    var highs = rows.map(function (b) { return Number(b[2]); });
    var lows = rows.map(function (b) { return Number(b[3]); });
    var closes = rows.map(function (b) { return Number(b[4]); });
    var close = closes[closes.length - 1];
    var lastTime = Number(rows[rows.length - 1][0]);
    var structure = swingStructure(rows);

    var eF = ema(closes, EMA_FAST);
    var eS = ema(closes, EMA_SLOW);
    var eT = ema(closes, EMA_TREND);
    var r = rsi(closes);
    var a = atr(highs, lows, closes);
    var swingWin = Math.min(SWING, rows.length - 2);
    var swingHigh = Math.max.apply(null, highs.slice(-(swingWin + 1), -1));
    var swingLow = Math.min.apply(null, lows.slice(-(swingWin + 1), -1));
    var prevBarHigh = highs.length > 1 ? highs[highs.length - 2] : highs[0];
    var prevBarLow = lows.length > 1 ? lows[lows.length - 2] : lows[0];
    var idx = Math.max(0, closes.length - 1 - MOMENTUM_BARS);
    var momentum = close - closes[idx];
    var macd = macdOf(closes);
    var bb = bollinger(closes);
    var vwap = vwapOf(rows);
    var stoch = stochOf(highs, lows, closes);
    var moves = closes.slice(-swingWin - 1).map(function (c, i, arr) { return i ? Math.abs(c - arr[i - 1]) : 0; }).slice(1);
    var travel = moves.reduce(function (sum, v) { return sum + v; }, 0);
    var efficiency = travel > 0 ? Math.abs(close - closes[Math.max(0, closes.length - swingWin - 1)]) / travel : 0;
    var frame = TFS.find(function (tf) { return tf.key === key; });

    var score = 0, bullExt = 0, bearExt = 0, reasons = [];

    var sep = eF - eS, tol = Math.max(a * EMA_TOL, 1e-9);
    if (sep > tol && close >= eS) { score += 1; reasons.push('EMA9 > EMA21'); }
    else if (-sep > tol && close <= eS) { score -= 1; reasons.push('EMA9 < EMA21'); }

    var thr = a * ATR_MOMENTUM;
    if (thr > 0 && momentum > thr) { score += 1; reasons.push('momentum up'); }
    else if (thr > 0 && momentum < -thr) { score -= 1; reasons.push('momentum down'); }

    if (close > swingHigh) { score += 1; reasons.push('breakout high'); }
    else if (close < swingLow) { score -= 1; reasons.push('breakdown low'); }

    if (r >= RSI_BULL) { score += 1; reasons.push('RSI ' + Math.round(r)); }
    else if (r <= RSI_BEAR) { score -= 1; reasons.push('RSI ' + Math.round(r)); }
    if (r <= 36) bullExt += 1.5;
    if (r >= 64) bearExt += 1.5;

    if (macd) {
      if (macd.hist > a * 1e-6 && (macd.line > 0 || macd.rising)) { score += 1; reasons.push('MACD +'); }
      else if (macd.hist < -a * 1e-6 && (macd.line < 0 || !macd.rising)) { score -= 1; reasons.push('MACD -'); }
    }

    if (bb) {
      if (bb.pctB > 55 && close > bb.mid) { score += 1; reasons.push('above BB mid'); }
      else if (bb.pctB < 45 && close < bb.mid) { score -= 1; reasons.push('below BB mid'); }
      if (bb.pctB <= 22) bullExt += 1;
      if (bb.pctB >= 78) bearExt += 1;
    }

    if (vwap > 0) {
      if (close > vwap) { score += 1; reasons.push('over VWAP'); }
      else { score -= 1; reasons.push('under VWAP'); }
    }

    if (stoch) {
      if (stoch.k - stoch.d > 1e-6 && stoch.k < 82) { score += 1; reasons.push('Stoch up'); }
      else if (stoch.d - stoch.k > 1e-6 && stoch.k > 18) { score -= 1; reasons.push('Stoch down'); }
      if (stoch.k <= 24) bullExt += 1;
      if (stoch.k >= 76) bearExt += 1;
    }

    return {
      key: key,
      ready: true,
      score: score,
      bullExt: bullExt,
      bearExt: bearExt,
      verdict: score >= SIDE_SCORE ? 'BUY' : score <= -SIDE_SCORE ? 'SELL' : 'NEUTRAL',
      rsi: r, atr: a, emaFast: eF, emaSlow: eS, emaTrend: eT,
      momentum: momentum, swingHigh: swingHigh, swingLow: swingLow,
      prevBarHigh: prevBarHigh, prevBarLow: prevBarLow,
      close: close, lastTime: lastTime,
      structure: structure,
      macd: macd, bb: bb, vwap: vwap, stoch: stoch,
      efficiency: efficiency, travelPerMin: mean(moves) / (frame ? frame.minutes : 5),
      reasons: reasons
    };
  }

  /* ------------------------------------------- deterministic structural vote */
  function combine(list, _bias) {
    var bull = 0, bear = 0, bullW = 0, bearW = 0, totalW = 0, voters = 0, score = 0;
    var intraBull = 0, intraBear = 0, intraW = 0;
    var htfBull = 0, htfBear = 0, htfW = 0;
    var bullReversal = 0, bearReversal = 0;

    TFS.forEach(function (tf) {
      var row = list[tf.key];
      if (!row || !row.ready) return;
      var intraday = tf.minutes <= 60;
      totalW += tf.weight;
      score += row.score;
      if (intraday) intraW += tf.weight;
      else htfW += tf.weight;

      if (row.score > 0) {
        var bPow = tf.weight * (row.score / 8);
        bull += bPow;
        if (row.score >= SIDE_SCORE) bullW += tf.weight;
        if (intraday) intraBull += bPow;
        else htfBull += bPow;
        voters++;
      } else if (row.score < 0) {
        var sPow = tf.weight * (Math.abs(row.score) / 8);
        bear += sPow;
        if (row.score <= -SIDE_SCORE) bearW += tf.weight;
        if (intraday) intraBear += sPow;
        else htfBear += sPow;
        voters++;
      }
      bullReversal += tf.weight * Math.min(1, (row.bullExt || 0) / 3);
      bearReversal += tf.weight * Math.min(1, (row.bearExt || 0) / 3);
    });

    if (totalW <= 0) {
      return {
        side: 'NEUTRAL', score: 0, confidence: 0, voters: 0, htfSide: 'NEUTRAL',
        models: {
          BUY: { side: 'BUY', confidence: 0, support: 0, opposition: 0, htfAlign: 0 },
          SELL: { side: 'SELL', confidence: 0, support: 0, opposition: 0, htfAlign: 0 }
        },
        reasons: ['waiting for multi-timeframe candles']
      };
    }

    var buyRaw = ((bull + bullReversal * 0.45) / totalW) * 100;
    var sellRaw = ((bear + bearReversal * 0.45) / totalW) * 100;
    var intraBuyShare = intraW > 0 ? ((intraBull / intraW) * 100) : 0;
    var intraSellShare = intraW > 0 ? ((intraBear / intraW) * 100) : 0;
    var htfBuyAlign = htfW > 0 ? (htfBull / htfW) * 100 : 0;
    var htfSellAlign = htfW > 0 ? (htfBear / htfW) * 100 : 0;

    // Deterministic closed-candle structural strength (independent of reload orderflow ticks)
    var buyConf = Math.round(clamp(24 + buyRaw * 0.85 + intraBuyShare * 0.45 + htfBuyAlign * 0.15, 22, 94));
    var sellConf = Math.round(clamp(24 + sellRaw * 0.85 + intraSellShare * 0.45 + htfSellAlign * 0.15, 22, 94));

    var netDiff = bull - bear;
    var side = 'NEUTRAL';
    var reasons = [];
    if (netDiff > 0.12 || (bullW > bearW && intraBuyShare >= intraSellShare)) {
      side = 'BUY';
      reasons.push(intraBull > bull * 0.65 && bear > bull * 0.5 ? 'intraday BUY swing inside mixed HTF' : 'multi-TF trend leans BUY');
    } else if (netDiff < -0.12 || (bearW > bullW && intraSellShare >= intraBuyShare)) {
      side = 'SELL';
      reasons.push(intraBear > bear * 0.65 && bull > bear * 0.5 ? 'intraday SELL swing inside mixed HTF' : 'multi-TF trend leans SELL');
    } else {
      side = buyConf >= sellConf ? 'BUY' : 'SELL';
      reasons.push('balanced range · ' + side + ' edge');
    }

    var topConf = side === 'BUY' ? buyConf : sellConf;
    return {
      side: side,
      htfSide: htfBuyAlign > htfSellAlign + 8 ? 'BUY' : htfSellAlign > htfBuyAlign + 8 ? 'SELL' : 'NEUTRAL',
      score: score,
      voters: voters,
      confidence: topConf,
      coverage: Math.round((totalW / TOTAL_WEIGHT) * 100),
      models: {
        BUY: { side: 'BUY', support: bullW, opposition: bearW, confidence: buyConf, htfAlign: Math.round(htfBuyAlign) },
        SELL: { side: 'SELL', support: bearW, opposition: bullW, confidence: sellConf, htfAlign: Math.round(htfSellAlign) }
      },
      reasons: reasons
    };
  }

  /* ------------------------------------ dual-scale structural swing engine */
  function fallbackBaseFrame() {
    return (reads.M5 && reads.M5.ready ? reads.M5 : null) ||
      (reads.M15 && reads.M15.ready ? reads.M15 : null) ||
      (reads.M1 && reads.M1.ready ? reads.M1 : null) ||
      (reads.H1 && reads.H1.ready ? reads.H1 : null);
  }

  function readyFrame(key) {
    return reads[key] && reads[key].ready ? reads[key] : null;
  }

  function scaleFrames(spec) {
    var prim = readyFrame(spec.primaryKey);
    if (!prim && spec.scale === 'SHORT') prim = fallbackBaseFrame();
    if (!prim && spec.scale === 'MAJOR') prim = readyFrame('H4') || readyFrame('M15');
    if (!prim || !(prim.atr > 0)) return null;
    var sec = readyFrame(spec.secondaryKey);
    var obs = readyFrame(spec.obstacleKey);
    var atrScale = Math.max(prim.atr, sec ? sec.atr * spec.secMult : 0);
    if (!(atrScale > 0)) return null;
    return { prim: prim, sec: sec, obs: obs, a: atrScale };
  }

  function structuralBracket(side, rawEntry, frames, spec, skipObstacles) {
    var buy = side === 'BUY';
    var entry = roundPx(rawEntry);
    var prim = frames.prim, sec = frames.sec, obs = frames.obs, a = frames.a;
    if (!(a > 0) || !(entry > 0)) return null;

    var span = Math.max(0, prim.swingHigh - prim.swingLow, sec ? (sec.swingHigh - sec.swingLow) * 0.65 : 0);
    var defaultRisk = clamp(Math.max(a * 1.25, span * 0.36), a * spec.minAtrMult, a * spec.maxAtrMult);
    var minRisk = a * spec.minAtrMult, maxRisk = a * spec.maxAtrMult;

    // Stop anchor strictly behind protecting confirmed structural swing highs/lows
    var stopAnchors = [
      buy ? prim.swingLow : prim.swingHigh,
      sec ? (buy ? sec.swingLow : sec.swingHigh) : null
    ];
    [prim, sec].forEach(function (fr) {
      if (!fr || !fr.structure || !fr.structure.pivots) return;
      var arr = buy ? fr.structure.pivots.lows : fr.structure.pivots.highs;
      (arr || []).forEach(function (pv) { stopAnchors.push(pv.price); });
    });

    var validStops = stopAnchors.filter(function (lv) {
      return Number.isFinite(lv) && lv > 0 && (buy ? lv < entry - a * 0.35 : lv > entry + a * 0.35);
    });

    var stop = entry + (buy ? -defaultRisk : defaultRisk);
    if (validStops.length) {
      // Closest protecting pivot that gives at least minRisk headroom
      var candidates = validStops.map(function (lv) {
        return lv + (buy ? -a * 0.25 : a * 0.25);
      }).filter(function (st) {
        var dist = Math.abs(entry - st);
        return dist >= minRisk && dist <= maxRisk;
      });
      if (candidates.length) {
        stop = buy ? Math.max.apply(null, candidates) : Math.min.apply(null, candidates);
      }
    }
    stop = roundPx(stop);

    var actualRisk = Math.abs(entry - stop);
    if (actualRisk < minRisk * 0.8) {
      stop = roundPx(entry + (buy ? -minRisk : minRisk));
      actualRisk = Math.abs(entry - stop);
    }

    // Target aims at opposing confirmed structural swing liquidity pool >= spec.minRR
    var minTargetMove = actualRisk * spec.minRR;
    var baseMove = Math.max(a * 2.4, span * 0.65, actualRisk * spec.defaultRR);
    var target = entry + (buy ? baseMove : -baseMove);

    var tpPools = [];
    [prim, sec, obs].forEach(function (fr) {
      if (!fr) return;
      tpPools.push(buy ? fr.swingHigh : fr.swingLow);
      if (fr.structure && fr.structure.pivots) {
        var opp = buy ? fr.structure.pivots.highs : fr.structure.pivots.lows;
        (opp || []).forEach(function (pv) {
          if (pv.unbroken || pv.age <= 28) tpPools.push(pv.price);
        });
      }
    });

    var qualifyingTargets = tpPools.filter(function (lv) {
      if (!Number.isFinite(lv) || lv <= 0) return false;
      var dist = buy ? (lv - entry) : (entry - lv);
      return dist >= minTargetMove && dist <= actualRisk * 3.4;
    });
    if (qualifyingTargets.length) {
      // Pick closest major structural pool above minimum R:R, or highest-conviction HTF target
      qualifyingTargets.sort(function (x, y) {
        return Math.abs(x - entry) - Math.abs(y - entry);
      });
      var chosenTp = qualifyingTargets[Math.min(qualifyingTargets.length - 1, spec.scale === 'MAJOR' ? 1 : 0)];
      target = buy ? Math.max(entry + minTargetMove, chosenTp) : Math.min(entry - minTargetMove, chosenTp);
    }

    if (!skipObstacles && obs) {
      var obsLevel = buy ? obs.swingHigh : obs.swingLow;
      if (Number.isFinite(obsLevel) && (buy ? entry + actualRisk * 1.4 < obsLevel && obsLevel < target : target < obsLevel && obsLevel < entry - actualRisk * 1.4)) {
        target = buy ? Math.min(target, obsLevel - a * 0.1) : Math.max(target, obsLevel + a * 0.1);
      }
    }

    target = roundPx(target);
    var rr = Math.abs(target - entry) / Math.max(1e-9, Math.abs(stop - entry));
    if (![entry, target, stop, rr].every(function (n) { return Number.isFinite(n) && n > 0; })) return null;
    if (!(buy ? stop < entry && entry < target : target < entry && entry < stop)) return null;
    if (rr < spec.minRR) {
      target = roundPx(entry + (buy ? actualRisk * spec.defaultRR : -actualRisk * spec.defaultRR));
      rr = Math.abs(target - entry) / Math.max(1e-9, Math.abs(stop - entry));
    }
    return { entry: entry, target: target, stop: stop, rr: rr };
  }

  /** Build a completely deterministic structural swing plan for one scale (SHORT or MAJOR). */
  function evaluateScaleSetup(side, spec, now) {
    var frames = scaleFrames(spec);
    if (!frames) return null;

    var prim = frames.prim, sec = frames.sec, obs = frames.obs, a = frames.a;
    var buy = side === 'BUY';
    var refClose = prim.close; // Strictly closed candle reference, never intra-bar tick!

    var cands = [];
    function add(v, w, label, family) {
      v = Number(v);
      if (Number.isFinite(v) && v > 0) cands.push({ v: v, w: w, label: label, family: family || 'structure' });
    }

    // 1. Confirmed closed fractal swing pivots (highs for SELL, lows for BUY)
    [
      { fr: prim, baseW: 1.75, prefix: prim.key },
      { fr: sec, baseW: 2.15, prefix: sec ? sec.key : '' }
    ].forEach(function (src) {
      if (!src.fr || !src.fr.structure || !src.fr.structure.pivots) return;
      var pivs = buy ? src.fr.structure.pivots.lows : src.fr.structure.pivots.highs;
      (pivs || []).slice(-8).forEach(function (pv) {
        var w = src.baseW + (pv.unbroken ? 0.55 : 0) + (pv.sweep ? 0.35 : 0);
        var tag = src.prefix + (pv.unbroken ? ' liquidity ' : ' pivot ') + (buy ? 'low' : 'high');
        add(pv.price, w, tag, 'liquidity');
      });
    });

    // 2. Swing range extremes & D1 previous extremes (for MAJOR)
    add(buy ? prim.swingLow : prim.swingHigh, 1.55, prim.key + (buy ? ' low' : ' high'), 'structure');
    if (sec) add(buy ? sec.swingLow : sec.swingHigh, 1.85, sec.key + (buy ? ' low' : ' high'), 'structure');
    if (obs && spec.scale === 'MAJOR') {
      add(buy ? obs.prevBarLow : obs.prevBarHigh, 2.0, 'Prev D1 ' + (buy ? 'low' : 'high'), 'liquidity');
      add(buy ? obs.swingLow : obs.swingHigh, 1.7, 'D1 20-bar ' + (buy ? 'low' : 'high'), 'structure');
    }

    // 3. Unscaled institutional SmartMoney zones (OB / FVG / OTE) anchored to refClose
    var smcApi = window.SmartMoneyZones || window.ProfitRadar;
    if (smcApi && typeof smcApi.detectSmartMoney === 'function') {
      var smcInput = {};
      spec.smcFrames.forEach(function (fk) { if (candleBars[fk] && candleBars[fk].length) smcInput[fk] = candleBars[fk]; });
      if (Object.keys(smcInput).length) {
        var smc = smcApi.detectSmartMoney(smcInput, refClose, prim.lastTime || now);
        var zoneList = smc ? (buy ? smc.buy : smc.sell) : [];
        (zoneList || []).slice(0, 4).forEach(function (z) {
          add(z.entry, z.tf === 'H1' ? 2.05 : 1.75, z.kind + ' · ' + z.tf, 'smc');
        });
      }
    }

    // 4. Fibonacci OTE (61.8% & 50%) on closed confirmed leg
    [prim, sec].forEach(function (fr) {
      if (!fr || !fr.structure || !fr.structure.leg) return;
      var leg = fr.structure.leg, span = leg.high - leg.low;
      if (span <= a * 1.2) return;
      if (buy) {
        add(leg.high - span * 0.618, 1.65, fr.key + ' 61.8% OTE', 'fib');
        add(leg.high - span * 0.5, 1.2, fr.key + ' 50% fib', 'fib');
      } else {
        add(leg.low + span * 0.618, 1.65, fr.key + ' 61.8% OTE', 'fib');
        add(leg.low + span * 0.5, 1.2, fr.key + ' 50% fib', 'fib');
      }
    });

    // 5. Dynamic structural EMAs, BB, VWAP from closed bars
    add(prim.emaFast, 0.85, prim.key + ' EMA9', 'trend');
    add(prim.emaSlow, 1.35, prim.key + ' EMA21', 'trend');
    add(prim.emaTrend, 1.25, prim.key + ' EMA50', 'trend');
    if (sec) add(sec.emaSlow, 1.45, sec.key + ' EMA21', 'trend');
    if (spec.scale === 'SHORT' && prim.vwap) add(prim.vwap, 1.35, 'VWAP', 'volume');
    if (prim.bb) add(buy ? prim.bb.low : prim.bb.up, 1.25, prim.key + (buy ? ' BB low' : ' BB up'), 'volatility');

    if (!cands.length) return null;

    var band = Math.max(a * 0.65, refClose * 0.0005);
    var maxRange = a * spec.searchAtr;
    // Prefer true defensive pullback structural zones relative to CLOSED close (deterministic across reloads!)
    var usable = cands.filter(function (c) {
      var near = Math.abs(c.v - refClose) <= maxRange;
      var pullback = buy ? c.v <= refClose + a * 0.12 : c.v >= refClose - a * 0.12;
      return near && pullback;
    });
    if (!usable.length) {
      usable = cands.filter(function (c) {
        var near = Math.abs(c.v - refClose) <= maxRange;
        var soft = buy ? c.v <= refClose + a * 0.45 : c.v >= refClose - a * 0.45;
        return near && soft;
      });
    }
    if (!usable.length) {
      usable = cands.filter(function (c) { return Math.abs(c.v - refClose) <= maxRange * 1.3; });
    }
    if (!usable.length) {
      var structuralFallback = buy
        ? Math.min(prim.swingLow || refClose, prim.emaSlow || refClose)
        : Math.max(prim.swingHigh || refClose, prim.emaSlow || refClose);
      usable = [{ v: structuralFallback, w: 1.5, label: prim.key + ' structural ' + (buy ? 'low' : 'high'), family: 'structure' }];
    }

    usable.sort(function (x, y) { return x.v - y.v; });
    var clusters = usable.map(function (c, index) {
      var items = usable.slice(index).filter(function (item) { return item.v - c.v <= band; });
      var sum = 0, wsum = 0;
      items.forEach(function (item) { sum += item.v * item.w; wsum += item.w; });
      var meanPrice = sum / wsum;
      var distRef = Math.abs(meanPrice - refClose);
      var fams = Array.from(new Set(items.map(function (item) { return item.family; })));
      var score = wsum + (fams.length >= 2 ? 0.85 : 0) + (fams.length >= 3 ? 0.45 : 0) - (distRef / a) * 0.15;
      return { items: items, wsum: wsum, mean: roundPx(meanPrice), dist: distRef, score: score, families: fams };
    });

    clusters.sort(function (x, y) { return (y.score - x.score) || (x.dist - y.dist); });

    function bracketIntact(br) {
      return !!br && (!(price > 0) || (buy ? price > br.stop : price < br.stop));
    }
    function wasRecentlyExpired(br) {
      if (!br) return false;
      var sid = [symbol, tvInstrument || instrument(), side, spec.scale, br.entry, br.target, br.stop].join('|');
      var expAt = Number(recentExpiredSignals[sid]) || 0;
      return expAt > 0 && now - expAt < EXPIRED_SIGNAL_COOLDOWN_MS;
    }

    var chosen = null, chosenBounds = null;
    for (var i = 0; i < clusters.length; i++) {
      var cl = clusters[i];
      var br = structuralBracket(side, cl.mean, frames, spec, false);
      if (cl.items.length >= 2 && bracketIntact(br) && !wasRecentlyExpired(br)) { chosen = cl; chosenBounds = br; break; }
    }
    if (!chosen) {
      for (var i2 = 0; i2 < clusters.length; i2++) {
        var brAlt = structuralBracket(side, clusters[i2].mean, frames, spec, false);
        if (clusters[i2].items.length >= 2 && bracketIntact(brAlt)) { chosen = clusters[i2]; chosenBounds = brAlt; break; }
      }
    }
    if (!chosen) {
      for (var j = 0; j < clusters.length; j++) {
        var br2 = structuralBracket(side, clusters[j].mean, frames, spec, false) ||
          structuralBracket(side, clusters[j].mean, frames, spec, true);
        if (bracketIntact(br2) && !wasRecentlyExpired(br2)) { chosen = clusters[j]; chosenBounds = br2; break; }
      }
    }
    if (!chosen) {
      for (var j2 = 0; j2 < clusters.length; j2++) {
        var br2Alt = structuralBracket(side, clusters[j2].mean, frames, spec, false) ||
          structuralBracket(side, clusters[j2].mean, frames, spec, true);
        if (bracketIntact(br2Alt)) { chosen = clusters[j2]; chosenBounds = br2Alt; break; }
      }
    }
    if (!chosen) {
      for (var k = 0; k < clusters.length; k++) {
        var br3 = structuralBracket(side, clusters[k].mean, frames, spec, true);
        if (br3) { chosen = clusters[k]; chosenBounds = br3; break; }
      }
    }
    if (!chosen || !chosenBounds) return null;

    var labelSet = [];
    chosen.items.forEach(function (it) {
      if (labelSet.indexOf(it.label) === -1) labelSet.push(it.label);
    });

    var speedPerMin = Math.max((prim.atr * (spec.scale === 'MAJOR' ? 0.18 : 0.14)) / (spec.scale === 'MAJOR' ? 60 : 5), Number(prim.travelPerMin) || 0);
    var etaMin = clamp(Math.round(Math.abs(chosenBounds.target - chosenBounds.entry) / Math.max(1e-9, speedPerMin)), spec.minEta, spec.maxEta);
    var vModel = vote && vote.models && vote.models[side];
    var baseConf = vModel ? Number(vModel.confidence) || 35 : 35;
    var scaleBoost = chosen.families.length >= 3 ? 6 : chosen.families.length >= 2 ? 3 : 0;
    var scaleConf = Math.round(clamp(baseConf + scaleBoost, 24, 95));

    return {
      scale: spec.scale,
      tfLabel: spec.tfLabel,
      side: side,
      entry: chosenBounds.entry,
      target: chosenBounds.target,
      stop: chosenBounds.stop,
      rr: chosenBounds.rr,
      atr: roundPx(a),
      etaMin: etaMin,
      touches: chosen.items.length,
      families: chosen.families,
      labels: labelSet.slice(0, 4),
      confidence: scaleConf,
      score: vote ? vote.score : 0,
      refClose: roundPx(refClose),
      reasons: (prim.reasons || []).slice(0, 3),
      signalId: [symbol, tvInstrument || instrument(), side, spec.scale, chosenBounds.entry, chosenBounds.target, chosenBounds.stop].join('|')
    };
  }

  /* ------------------------------------------------------------- timing */
  function sessionFactor() {
    var h = new Date().getUTCHours();
    if (h >= 13 && h < 17) return { f: 1.3, name: 'LONDON + NEW YORK' };
    if (h >= 7 && h < 13) return { f: 1.1, name: 'LONDON' };
    if (h >= 17 && h < 21) return { f: 1.05, name: 'NEW YORK' };
    if (h >= 21 || h < 1) return { f: 0.85, name: 'LATE NEW YORK' };
    return { f: 0.8, name: 'ASIA' };
  }
  function nextBarOpen(now) { return Math.ceil(now / BASE_MS) * BASE_MS; }
  function shortSession(name) {
    return name === 'LONDON + NEW YORK' ? 'LDN/NY'
      : name === 'LATE NEW YORK' ? 'LATE NY'
        : name === 'NEW YORK' ? 'NY' : name;
  }

  /* ------------------------------------------------ persistence & lockstate */
  function loadLog() {
    try {
      var raw = JSON.parse(localStorage.getItem(LOG_KEY + '.' + symbol) || '[]');
      log = Array.isArray(raw) ? raw.slice(-20) : [];
    } catch (e) { log = []; }
    lastCompletedSignals = {};
    log.forEach(function (row) { if (row.signalId) lastCompletedSignals[row.signalId] = true; });
  }

  function loadModes() {
    try {
      var saved = JSON.parse(localStorage.getItem(MODE_KEY + symbol) || 'null');
      scaleMode = {
        BUY: saved && /^(AUTO|SHORT|MAJOR)$/.test(saved.BUY) ? saved.BUY : 'AUTO',
        SELL: saved && /^(AUTO|SHORT|MAJOR)$/.test(saved.SELL) ? saved.SELL : 'AUTO'
      };
    } catch (e) { scaleMode = { BUY: 'AUTO', SELL: 'AUTO' }; }
  }

  function saveModes() {
    try { localStorage.setItem(MODE_KEY + symbol, JSON.stringify(scaleMode)); } catch (e) {}
  }

  function pushLog(sidePlan, kind) {
    if (!sidePlan || sidePlan.logged) return;
    sidePlan.logged = true;
    log.push({
      t: Date.now(), side: sidePlan.side, scale: sidePlan.scale || 'SHORT',
      entry: sidePlan.observedEntry || sidePlan.entry,
      plannedEntry: sidePlan.entry, target: sidePlan.target, stop: sidePlan.stop,
      kind: kind, signalId: sidePlan.signalId, observedPrice: quoteFresh(Date.now()) ? price : null
    });
    if (sidePlan.signalId) lastCompletedSignals[sidePlan.signalId] = true;
    log = log.slice(-20);
    try { localStorage.setItem(LOG_KEY + '.' + symbol, JSON.stringify(log)); } catch (e) {}
    savePlan(sidePlan.side);
  }

  function savePlan(side) {
    try {
      var p = plans[side];
      var content = {
        symbol: symbol,
        tvSymbol: tvInstrument || instrument(),
        plan: p,
        scales: lockedScales[side]
      };
      var signature = JSON.stringify(content);
      if (signature === savedPlanSignatures[side]) return;
      localStorage.setItem(PLAN_KEY + symbol + '.' + side, JSON.stringify(Object.assign({ at: Date.now() }, content)));
      savedPlanSignatures[side] = signature;
    } catch (e) {}
  }

  function isValidPlanShape(p, side) {
    if (!p || p.calculationVersion !== CALCULATION_VERSION || p.side !== side) return false;
    if (p.hit || p.doneAt) return false;
    if (![p.entry, p.target, p.stop, p.endAt, p.created, p.etaMin, p.atr].every(function (n) { return Number.isFinite(n) && n > 0; })) return false;
    if (!(side === 'BUY' ? p.stop < p.entry && p.entry < p.target : p.target < p.entry && p.entry < p.stop)) return false;
    if (Math.abs(p.target - p.entry) / Math.max(1e-9, Math.abs(p.stop - p.entry)) < MIN_RR) return false;
    if (p.priceSource !== 'TradingView' || p.candleSource !== 'TradingView') return false;
    return true;
  }

  function savedZoneKey(z) {
    return [z.side || '', z.scale || '', Number(z.entry || 0).toFixed(4), Number(z.tp || 0).toFixed(4), Number(z.sl || 0).toFixed(4)].join('|');
  }

  function loadSavedZones() {
    try {
      var raw = JSON.parse(localStorage.getItem(SAVED_ZONES_KEY + symbol) || '[]');
      savedChartZones = Array.isArray(raw) ? raw.filter(function (z) {
        return z && z.symbol === symbol && (z.side === 'BUY' || z.side === 'SELL') &&
          Number(z.entry) > 0 && Number(z.tp) > 0 && Number(z.sl) > 0;
      }).slice(-MAX_SAVED_ZONES) : [];
    } catch (e) { savedChartZones = []; }
  }

  function persistSavedZones() {
    try { localStorage.setItem(SAVED_ZONES_KEY + symbol, JSON.stringify(savedChartZones.slice(-MAX_SAVED_ZONES))); } catch (e) {}
  }

  function isPlanSavedOnChart(p) {
    if (!p) return false;
    var key = savedZoneKey({
      side: p.side,
      scale: p.scale || 'SHORT',
      entry: Number(p.observedEntry || p.entry),
      tp: Number(p.target),
      sl: Number(p.stop)
    });
    return savedChartZones.some(function (z) { return savedZoneKey(z) === key; });
  }

  function savePlanToChart(p, reason, now) {
    if (!p) return false;
    now = now || Date.now();
    var entry = Number(p.observedEntry || p.entry);
    var tp = Number(p.target);
    var sl = Number(p.stop);
    if (!(entry > 0) || !(tp > 0) || !(sl > 0)) return false;
    var item = {
      id: (p.signalId || (p.side + '|' + entry)) + '|' + Math.round(p.startAt || now),
      symbol: symbol,
      tvSymbol: p.tvSymbol || instrument(),
      side: p.side,
      scale: p.scale || 'SHORT',
      tfLabel: p.tfLabel || '',
      entry: entry,
      tp: tp,
      sl: sl,
      rr: Number(p.observedRR || p.rr) || Math.abs(tp - entry) / Math.max(1e-9, Math.abs(entry - sl)),
      startAt: Number(p.startAt || p.created || now),
      savedAt: now,
      reason: reason || 'manual',
      status: 'OPEN',
      hitAt: 0,
      hitPrice: 0
    };
    var key = savedZoneKey(item);
    var existing = savedChartZones.find(function (z) { return savedZoneKey(z) === key; });
    if (existing) {
      if (reason === 'manual') { existing.reason = 'manual'; persistSavedZones(); }
      return false;
    }
    savedChartZones.push(item);
    if (savedChartZones.length > MAX_SAVED_ZONES) savedChartZones = savedChartZones.slice(-MAX_SAVED_ZONES);
    persistSavedZones();
    return true;
  }

  function clearSavedZones(sideOrAll) {
    if (!sideOrAll || sideOrAll === 'ALL') {
      savedChartZones = [];
    } else {
      savedChartZones = savedChartZones.filter(function (z) { return z.side !== sideOrAll; });
    }
    persistSavedZones();
    lastFactorHtmlByBoard = Object.create(null);
    paint(Date.now());
  }

  function updateSavedZonesStatus(now) {
    if (!savedChartZones.length || !quoteFresh(now) || !(price > 0)) return;
    var changed = false;
    savedChartZones.forEach(function (z) {
      if (!z || z.status !== 'OPEN') return;
      var buy = z.side === 'BUY';
      if (buy ? price >= z.tp : price <= z.tp) {
        z.status = 'TP_HIT';
        z.hitAt = now;
        z.hitPrice = price;
        changed = true;
      } else if (buy ? price <= z.sl : price >= z.sl) {
        z.status = 'SL_HIT';
        z.hitAt = now;
        z.hitPrice = price;
        changed = true;
      }
    });
    if (changed) persistSavedZones();
  }

  function hydrateRestoredPlan(p, now) {
    p.rr = Math.abs(p.target - p.entry) / Math.max(1e-9, Math.abs(p.stop - p.entry));
    if (p.running && Number.isFinite(p.observedEntry)) {
      p.observedRR = Math.abs(p.target - p.observedEntry) / Math.max(1e-9, Math.abs(p.stop - p.observedEntry));
    }
    // Enforce fixed duration across reloads: archive timed-out running swing to chart so its TP/SL stays drawn, then find a fresh swing
    if (p.endAt <= now) {
      if (p.running) savePlanToChart(p, 'timeout', now);
      if (p.signalId) recentExpiredSignals[p.signalId] = now;
      return null;
    }
    p.restored = true;
    return p;
  }

  function attachScaleSummaries(p, shortP, majorP) {
    if (!p) return null;
    p.shortSwing = summaryOf(shortP);
    p.majorSwing = summaryOf(majorP);
    return p;
  }

  function pickLatestRunning(a, b) {
    var aRun = !!(a && a.running && !a.hit && !a.doneAt);
    var bRun = !!(b && b.running && !b.hit && !b.doneAt);
    if (aRun && !bRun) return a;
    if (bRun && !aRun) return b;
    if (!aRun && !bRun) return null;
    var aSeq = Number(a.runningSeq) || 0, bSeq = Number(b.runningSeq) || 0;
    if (aSeq !== bSeq) return aSeq > bSeq ? a : b;
    var aStart = Number(a.startAt) || 0, bStart = Number(b.startAt) || 0;
    return bStart > aStart ? b : a;
  }

  function restorePlans() {
    loadModes();
    var inst = instrument();
    ['BUY', 'SELL'].forEach(function (side) {
      try {
        var saved = JSON.parse(localStorage.getItem(PLAN_KEY + symbol + '.' + side) || 'null'), now = Date.now();
        if (!saved || saved.symbol !== symbol || !saved.tvSymbol || !Number.isFinite(saved.at) ||
            saved.at > now + 5000 || now - saved.at > MAX_RESTORE_AGE_MS ||
            (inst && inst !== saved.tvSymbol)) return;

        if (saved.scales && typeof saved.scales === 'object') {
          ['SHORT', 'MAJOR'].forEach(function (sc) {
            var sp = saved.scales[sc];
            if (isValidPlanShape(sp, side)) {
              tvInstrument = saved.tvSymbol;
              var hydScale = hydrateRestoredPlan(sp, now);
              if (hydScale) {
                lockedScales[side][sc] = hydScale;
                runningSeqCounter = Math.max(runningSeqCounter, Number(hydScale.runningSeq) || 0);
              }
            }
          });
        }

        var p = saved.plan;
        if (isValidPlanShape(p, side)) {
          tvInstrument = saved.tvSymbol;
          var restored = hydrateRestoredPlan(p, now);
          if (restored) {
            runningSeqCounter = Math.max(runningSeqCounter, Number(restored.runningSeq) || 0);
            if (restored.scale && (restored.scale === 'SHORT' || restored.scale === 'MAJOR')) {
              var existingScale = lockedScales[side][restored.scale];
              var restoredTs = Math.max(restored.lastQuoteAt || 0, restored.evaluatedQuoteAt || 0, restored.created || 0);
              var existingTs = existingScale ? Math.max(existingScale.lastQuoteAt || 0, existingScale.evaluatedQuoteAt || 0, existingScale.created || 0) : 0;
              if (!existingScale || (restored.running && !existingScale.running) ||
                  (restored.signalId === existingScale.signalId && restoredTs >= existingTs)) {
                lockedScales[side][restored.scale] = restored;
              }
              plans[side] = attachScaleSummaries(lockedScales[side][restored.scale], lockedScales[side].SHORT, lockedScales[side].MAJOR);
            } else {
              plans[side] = attachScaleSummaries(restored, lockedScales[side].SHORT, lockedScales[side].MAJOR);
            }
          }
        }
        var latestRun = pickLatestRunning(lockedScales[side].SHORT, lockedScales[side].MAJOR);
        if (latestRun && (!plans[side] || !plans[side].running || scaleMode[side] === 'AUTO')) {
          scaleMode[side] = latestRun.scale || scaleMode[side];
          plans[side] = attachScaleSummaries(latestRun, lockedScales[side].SHORT, lockedScales[side].MAJOR);
        } else if (!plans[side]) {
          var pref = scaleMode[side];
          var fallback = (pref === 'SHORT' || pref === 'MAJOR')
            ? lockedScales[side][pref]
            : (lockedScales[side].SHORT || lockedScales[side].MAJOR);
          if (fallback) {
            plans[side] = attachScaleSummaries(fallback, lockedScales[side].SHORT, lockedScales[side].MAJOR);
          }
        }
      } catch (e) {}
    });
  }

  function scoreLine(side) {
    var last = log.filter(function (r) { return (!side || r.side === side) && (r.kind === 'hit' || r.kind === 'miss'); }).slice(-5);
    if (!last.length) return '';
    var hits = last.filter(function (r) { return r.kind === 'hit'; }).length;
    return 'last ' + last.length + ': ' + hits + 'H / ' + (last.length - hits) + 'M';
  }

  /* --------------------------------------------------- setup & arbitration */
  function currentFlow(now) { return flowAt && now - flowAt <= quoteMaxAge ? flowBias : 50; }
  function instrument() {
    var host = window.TvChartHost;
    if (host && typeof host.symbolFor === 'function') {
      var mapped = host.symbolFor(symbol);
      if (mapped) return mapped;
    }
    return tvInstrument;
  }
  function quoteFresh(now) {
    return price > 0 && updatedAt > 0 && now - updatedAt <= quoteMaxAge && updatedAt <= now + 5000;
  }
  function readingFresh(key, now) {
    var tf = TFS.find(function (item) { return item.key === key; });
    var bars = candleBars[key], at = candleSeenAt[key];
    if (!tf || !at || !bars || bars.length < minBarsFor(key) || at > now + 5000 || now - at > (tf.minutes < 60 ? 180000 : 360000)) return false;
    if (!candleInstruments[key] || (instrument() && candleInstruments[key] !== instrument())) return false;
    var recent = bars.slice(-minBarsFor(key)), duration = tf.minutes * 60000;
    var continuous = /^(BINANCE|COINBASE|KRAKEN|BITSTAMP|BYBIT|OKX|CRYPTO):/i.test(instrument()) ||
      /^(BTC|ETH|SOL|XRP|ADA|DOGE|BNB|LTC|AVAX|LINK|DOT|TRX|SHIB|BCH)/i.test(cleanSymbol(symbol));
    for (var i = 1; i < recent.length; i++) {
      var gap = Number(recent[i][0]) - Number(recent[i - 1][0]);
      if (gap < duration || (tf.minutes <= 15 && gap > duration * 1.5 && (continuous || gap < 3600000))) return false;
    }
    var last = Number(bars[bars.length - 1][0]);
    if (last < 1e11) last *= 1000;
    var end = last + duration;
    var q = window.SOFT_TV_QUOTE;
    var closed = !continuous && (!marketOpen || (q && q.symbol === symbol && q.market_open === false) ||
      (now - end > Math.max(120000, tf.minutes * 120000) && now - end <= 78 * 3600000));
    var maxAgeMs = closed ? 78 * 3600000 : Math.max(240000, tf.minutes * 240000);
    return end <= now && now - end <= maxAgeMs;
  }

  function freshVote(now) {
    var fresh = {};
    TFS.forEach(function (tf) { if (readingFresh(tf.key, now)) fresh[tf.key] = reads[tf.key]; });
    return combine(fresh, currentFlow(now));
  }

  /** Wrap a computed scale setup into a full immutable plan object. */
  function materializeScalePlan(setup, side, now) {
    if (!setup) return null;
    var buy = side === 'BUY';
    var entryMode = (buy ? price < setup.entry : price > setup.entry) ? 'breakout' : 'retrace';
    var sess = sessionFactor();
    var startAt = nextBarOpen(now);
    return {
      calculationVersion: CALCULATION_VERSION,
      scale: setup.scale,
      tfLabel: setup.tfLabel,
      side: side,
      entry: setup.entry,
      perfect: setup.entry,
      touches: setup.touches,
      labels: setup.labels || [],
      families: setup.families || ['structure'],
      target: setup.target,
      stop: setup.stop,
      rr: setup.rr,
      atr: setup.atr,
      etaMin: setup.etaMin,
      session: sess.name,
      confidence: setup.confidence,
      score: setup.score,
      created: now,
      priceAt: price,
      quoteAt: updatedAt,
      evaluatedPrice: price,
      evaluatedQuoteAt: updatedAt,
      priceSource: 'TradingView',
      candleSource: 'TradingView',
      tvSymbol: tvInstrument || instrument(),
      signalVerified: true,
      signalId: setup.signalId,
      structureStamp: structureStamp,
      startAt: startAt,
      endAt: startAt + setup.etaMin * 60000,
      running: false,
      entryMode: entryMode,
      hit: false,
      hitAt: 0,
      doneAt: 0,
      locked: true,
      reasons: (setup.reasons || []).concat(vote ? vote.reasons : [])
    };
  }

  /** True while an existing locked plan has NOT been hit or invalidated by market structure. */
  function isPlanStructurallyAlive(p, side, now) {
    if (!p || p.hit || p.doneAt) return false;
    var buy = side === 'BUY';
    if (!p.running && quoteFresh(now) && price > 0) {
      // Invalidated if market already breached SL without us OR closed clean past TP
      if (buy ? price <= p.stop : price >= p.stop) return false;
      var refFr = p.scale === 'MAJOR' ? (readyFrame('H1') || readyFrame('M15')) : fallbackBaseFrame();
      var refC = refFr && refFr.close > 0 ? refFr.close : 0;
      if (refC > 0 && (buy ? refC >= p.target : refC <= p.target)) return false;
    }
    return true;
  }

  function rebuildDelayFor(p) {
    return (p && (p.outcome === 'timeout' || p.outcome === 'expired')) ? TIMEOUT_REBUILD_MS : FAIL_REBUILD_MS;
  }

  function ensureScaleLock(side, scaleKey, candidateSetup, now) {
    var existing = lockedScales[side][scaleKey];
    if (existing && (existing.hit || existing.doneAt)) {
      if (plans[side] === existing && now - (existing.hitAt || existing.doneAt) <= rebuildDelayFor(existing)) {
        return existing;
      }
      lockedScales[side][scaleKey] = null;
      existing = null;
    }
    if (isPlanStructurallyAlive(existing, side, now)) {
      return existing;
    }
    if (!candidateSetup) return existing && !existing.hit && !existing.doneAt ? existing : null;
    // Also validate fresh candidate isn't immediately past SL
    var buy = side === 'BUY';
    if (price > 0 && (buy ? price <= candidateSetup.stop : price >= candidateSetup.stop)) {
      // Shift cleanly to confirmed fallback only if current candidate stop was already blown past
      return null;
    }
    var built = materializeScalePlan(candidateSetup, side, now);
    lockedScales[side][scaleKey] = built;
    return built;
  }

  function evaluateDirection(side, now) {
    var model = vote && vote.models && vote.models[side];
    var conf = model ? Number(model.confidence) || 0 : 0;
    var result = {
      side: side, eligible: false, confidence: conf, reason: '',
      short: lockedScales[side].SHORT, major: lockedScales[side].MAJOR,
      entry: null, target: null, stop: null
    };
    if (!quoteFresh(now)) { result.reason = 'Waiting for live TradingView quote'; return result; }
    var base = fallbackBaseFrame();
    if (!base || !base.ready || !(base.atr > 0)) { result.reason = 'Loading multi-timeframe TradingView structure…'; return result; }
    if (conf < SECONDARY_CONF_MIN) { result.reason = 'Insufficient ' + side + ' momentum (' + conf + '%)'; return result; }

    var shortSetup = evaluateScaleSetup(side, SCALE_SPECS.SHORT, now);
    var majorSetup = evaluateScaleSetup(side, SCALE_SPECS.MAJOR, now);

    var shortLocked = ensureScaleLock(side, 'SHORT', shortSetup, now);
    var majorLocked = ensureScaleLock(side, 'MAJOR', majorSetup, now);

    result.short = shortLocked;
    result.major = majorLocked;

    var chosenScale = scaleMode[side];
    var latestRun = pickLatestRunning(shortLocked, majorLocked);
    var picked = null;
    if (chosenScale === 'SHORT') picked = shortLocked || majorLocked;
    else if (chosenScale === 'MAJOR') picked = majorLocked || shortLocked;
    else if (latestRun) {
      picked = latestRun;
    } else {
      // AUTO: keep existing active locked plan's scale if alive; otherwise let AI pick highest-conviction
      var cur = plans[side];
      if (cur && isPlanStructurallyAlive(cur, side, now)) {
        picked = cur.scale === 'MAJOR' ? (majorLocked || shortLocked) : (shortLocked || majorLocked);
      } else if (majorLocked && shortLocked) {
        var htfStronglyAligned = model && model.htfAlign >= 45;
        var majorNear = Math.abs(majorLocked.entry - price) <= majorLocked.atr * 2.2;
        picked = (htfStronglyAligned && majorNear) ? majorLocked : shortLocked;
      } else {
        picked = shortLocked || majorLocked;
      }
    }

    if (!picked) {
      result.reason = 'Scanning ' + side + ' M5–H4 swing liquidity levels…';
      return result;
    }

    return Object.assign(result, {
      eligible: true,
      base: base,
      picked: picked,
      entry: picked.entry,
      target: picked.target,
      stop: picked.stop,
      rr: picked.rr,
      confidence: picked.confidence,
      primaryReady: conf >= PRIMARY_CONF_MIN && (!vote || vote.side === side || conf >= 48),
      reason: 'Locked ' + picked.scale + ' (' + picked.tfLabel + ') swing confluence',
      signalId: picked.signalId
    });
  }

  function applyScaleChoice(side, nextMode) {
    if (!/^(AUTO|SHORT|MAJOR)$/.test(nextMode)) return;
    scaleMode[side] = nextMode;
    manualScalePickAt[side] = Date.now();
    saveModes();
    var now = Date.now();
    // Advance existing locked scales first using real market state; never create a detached clone
    // or restart timers when toggling SHORT M5·15 / MAJOR H1·H4 / AI.
    stepPlanLifecycle(side, now);
    if (bootCandlesReady) {
      directionModels[side] = evaluateDirection(side, now);
      var dm = directionModels[side];
      var targetPlan = nextMode === 'SHORT'
        ? (dm && dm.short) || lockedScales[side].SHORT
        : nextMode === 'MAJOR'
          ? (dm && dm.major) || lockedScales[side].MAJOR
          : (dm && dm.picked) || lockedScales[side].SHORT || lockedScales[side].MAJOR;
      if (targetPlan) {
        plans[side] = attachScaleSummaries(targetPlan, lockedScales[side].SHORT, lockedScales[side].MAJOR);
        savePlan(side);
      }
    } else {
      var fallbackPlan = nextMode === 'AUTO'
        ? (plans[side] || lockedScales[side].SHORT || lockedScales[side].MAJOR)
        : lockedScales[side][nextMode];
      if (fallbackPlan) {
        plans[side] = attachScaleSummaries(fallbackPlan, lockedScales[side].SHORT, lockedScales[side].MAJOR);
        savePlan(side);
      }
    }
    paint(now);
  }

  function summaryOf(sp) {
    if (!sp) return null;
    return {
      scale: sp.scale,
      tfLabel: sp.tfLabel,
      entry: sp.entry,
      target: sp.target,
      stop: sp.stop,
      rr: sp.rr,
      etaMin: sp.etaMin,
      labels: (sp.labels || []).slice(0, 3)
    };
  }

  function buildPlanForSide(side, now) {
    var selected = directionModels[side];
    if (!selected || !selected.eligible || !selected.picked) {
      if (!plans[side] || plans[side].hit || plans[side].doneAt) {
        plans[side] = null;
        planNotes[side] = (selected && selected.reason) || 'Waiting for TradingView structure';
        savePlan(side);
      }
      return;
    }
    planNotes[side] = '';
    plans[side] = attachScaleSummaries(selected.picked, selected.short, selected.major);
    savePlan(side);
  }

  function planNeedsRebuild(p, side, now) {
    if (!p) return true;
    if (p.hit || p.doneAt) return now - (p.hitAt || p.doneAt) > rebuildDelayFor(p);
    if (p.running) return false;
    // Wait until initial multi-TF candles are loaded before judging an active restored plan!
    if (!bootCandlesReady) return false;
    if (!isPlanStructurallyAlive(p, side, now)) return true;
    return false;
  }

  function syncSummaries(side) {
    var p = plans[side];
    if (!p || p.hit || p.doneAt) return;
    attachScaleSummaries(p, lockedScales[side].SHORT, lockedScales[side].MAJOR);
    savePlan(side);
  }

  function stepPlanLifecycleForPlan(p, side, now) {
    if (!p || p.hit || p.doneAt) return false;
    var buy = side === 'BUY';

    // When the exchange session is closed, do not artificially trigger fills
    // or expire setups off stale weekend quotes.
    if (!marketOpen) {
      if (!p.running && p.endAt < now + 15 * 60000) {
        p.endAt = now + p.etaMin * 60000;
        return true;
      }
      return false;
    }

    if (now >= p.endAt) {
      if (p.signalId) recentExpiredSignals[p.signalId] = now;
      if (p.running) {
        // Save drawn Entry/TP/SL permanently on chart before closing and scanning for a new swing
        savePlanToChart(p, 'timeout', now);
        p.doneAt = now;
        p.outcome = 'timeout';
        p.exitPrice = price > 0 ? price : p.entry;
        p.exitAt = now;
        pushLog(p, 'timeout');
        return true;
      }
      p.doneAt = now;
      p.outcome = 'expired';
      p.exitPrice = price > 0 ? price : p.entry;
      p.exitAt = now;
      pushLog(p, 'expired');
      return true;
    }

    if (!quoteFresh(now)) return false;

    if (!p.running) {
      if (updatedAt <= Math.max(p.quoteAt || 0, p.evaluatedQuoteAt || 0)) return false;
      p.evaluatedQuoteAt = updatedAt;
      p.evaluatedPrice = price;

      // Check structural SL invalidation while armed
      if (buy ? price <= p.stop : price >= p.stop) {
        p.doneAt = now;
        p.outcome = 'invalidated';
        p.exitPrice = price;
        p.exitAt = now;
        return true;
      }

      var oppSide = buy ? 'SELL' : 'BUY';
      var oppRunning = !!(plans[oppSide] && plans[oppSide].running);
      var myModelConf = directionModels[side] ? Number(directionModels[side].confidence) || 0 : p.confidence;
      if (oppRunning && myModelConf < 55) return true;

      var spreadTol = p.atr * ENTRY_TOLERANCE_ATR;
      var reached = p.entryMode === 'retrace'
        ? (buy ? price <= p.entry + spreadTol : price >= p.entry - spreadTol)
        : (buy ? price >= p.entry - spreadTol : price <= p.entry + spreadTol);
      if (!reached) return true;
      if (price >= Math.max(p.target, p.stop) || price <= Math.min(p.target, p.stop)) return true;

      var observedRR = Math.abs(p.target - price) / Math.max(1e-9, Math.abs(p.stop - price));
      if (!Number.isFinite(observedRR) || observedRR < MIN_RR) return true;

      p.observedEntry = price;
      p.observedRR = observedRR;
      p.running = true;
      p.startAt = now;
      p.runningSeq = ++runningSeqCounter;
      p.endAt = now + p.etaMin * 60000;
      p.startedQuoteAt = updatedAt;
      p.lastQuoteAt = updatedAt;
      p.restored = false;
      p._justStartedNow = true;
      return true;
    }

    if (updatedAt <= Math.max(p.startedQuoteAt || 0, p.lastQuoteAt || 0)) return false;
    p.lastQuoteAt = updatedAt;
    p.restored = false;

    if (buy ? price >= p.target : price <= p.target) {
      p.hit = true;
      p.hitAt = now;
      p.exitPrice = price;
      p.exitAt = now;
      pushLog(p, 'hit');
      return true;
    }
    if (buy ? price <= p.stop : price >= p.stop) {
      p.doneAt = now;
      p.outcome = 'miss';
      p.exitPrice = price;
      p.exitAt = now;
      pushLog(p, 'miss');
      return true;
    }
    return true;
  }

  function stepPlanLifecycle(side, now) {
    var tracked = [];
    [plans[side], lockedScales[side].SHORT, lockedScales[side].MAJOR].forEach(function (sp) {
      if (sp && tracked.indexOf(sp) === -1) tracked.push(sp);
    });
    var changed = false;
    var newlyStarted = [];
    tracked.forEach(function (sp) {
      var wasRunning = !!sp.running;
      if (sp._justStartedNow) delete sp._justStartedNow;
      if (stepPlanLifecycleForPlan(sp, side, now)) changed = true;
      if (!wasRunning && sp.running && sp._justStartedNow) {
        delete sp._justStartedNow;
        newlyStarted.push(sp);
      }
    });
    // Auto-switch the board to whichever scale (SHORT or MAJOR) just started running
    // (or the latest one started when both are running together).
    if (newlyStarted.length) {
      var targetStarted = newlyStarted.length > 1
        ? pickLatestRunning(newlyStarted[0], newlyStarted[1])
        : newlyStarted[0];
      if (targetStarted) {
        if (targetStarted.scale === 'SHORT' || targetStarted.scale === 'MAJOR') {
          scaleMode[side] = targetStarted.scale;
          saveModes();
        }
        plans[side] = attachScaleSummaries(targetStarted, lockedScales[side].SHORT, lockedScales[side].MAJOR);
        changed = true;
      }
    } else {
      // If current plan isn't running yet and another scale is actively running (not overridden after it started)
      var runningLatest = pickLatestRunning(lockedScales[side].SHORT, lockedScales[side].MAJOR);
      if (runningLatest && (!plans[side] || (!plans[side].running && !(manualScalePickAt[side] > (runningLatest.startAt || 0))))) {
        if (runningLatest.scale === 'SHORT' || runningLatest.scale === 'MAJOR') {
          scaleMode[side] = runningLatest.scale;
          saveModes();
        }
        plans[side] = attachScaleSummaries(runningLatest, lockedScales[side].SHORT, lockedScales[side].MAJOR);
        changed = true;
      }
    }
    if (changed) savePlan(side);
  }

  function clearExpiredFinishedScales(side, now) {
    var displayedFinished = false;
    ['SHORT', 'MAJOR'].forEach(function (sc) {
      var sp = lockedScales[side][sc];
      if (!sp || (!sp.hit && !sp.doneAt)) return;
      var finishedAt = sp.hitAt || sp.doneAt || 0;
      if (plans[side] !== sp || now - finishedAt > rebuildDelayFor(sp)) {
        if (plans[side] === sp) displayedFinished = true;
        lockedScales[side][sc] = null;
      }
    });
    if (displayedFinished) {
      var stillRunning = pickLatestRunning(lockedScales[side].SHORT, lockedScales[side].MAJOR);
      if (stillRunning && (stillRunning.scale === 'SHORT' || stillRunning.scale === 'MAJOR')) {
        scaleMode[side] = stillRunning.scale;
        saveModes();
        plans[side] = attachScaleSummaries(stillRunning, lockedScales[side].SHORT, lockedScales[side].MAJOR);
        savePlan(side);
      }
    }
  }

  function maybeRebuild(now) {
    ['BUY', 'SELL'].forEach(function (side) {
      stepPlanLifecycle(side, now);
    });
    updateSavedZonesStatus(now);
    if (!bootCandlesReady) return;

    ['BUY', 'SELL'].forEach(function (side) {
      clearExpiredFinishedScales(side, now);
    });
    directionModels = {
      BUY: evaluateDirection('BUY', now),
      SELL: evaluateDirection('SELL', now)
    };
    if (!quoteFresh(now)) return;
    var reloadedOnFinish = false;
    ['BUY', 'SELL'].forEach(function (side) {
      if (!planNeedsRebuild(plans[side], side, now)) {
        syncSummaries(side);
        return;
      }
      var finished = !!(plans[side] && (plans[side].hit || plans[side].doneAt));
      if (finished && !candleBusy && !reloadedOnFinish) {
        reloadedOnFinish = true;
        loadCandles();
      }
      if (finished && plans[side] && plans[side].scale && lockedScales[side][plans[side].scale] === plans[side]) {
        lockedScales[side][plans[side].scale] = null;
      }
      buildPlanForSide(side, now);
    });
  }

  /* ------------------------------------------------------------ painting */
  function factorsHtml(side, plan) {
    var mode = scaleMode[side] || 'AUTO';
    var spShort = (plan && plan.shortSwing) || summaryOf(lockedScales[side].SHORT);
    var spMajor = (plan && plan.majorSwing) || summaryOf(lockedScales[side].MAJOR);
    var scaleChips = [];

    var shortTxt = spShort
      ? 'E ' + px(spShort.entry) + ' · TP ' + px(spShort.target) + ' · SL ' + px(spShort.stop)
      : 'calculating…';
    var majorTxt = spMajor
      ? 'E ' + px(spMajor.entry) + ' · TP ' + px(spMajor.target) + ' · SL ' + px(spMajor.stop)
      : 'calculating…';

    var activeScale = mode === 'AUTO' ? (plan ? plan.scale : 'AUTO') : mode;
    scaleChips.push(
      '<button type="button" class="sai-chip scale-btn' + (mode === 'SHORT' || (mode === 'AUTO' && activeScale === 'SHORT') ? ' is-active' : '') +
      '" data-board-side="' + side + '" data-scale="' + (mode === 'SHORT' ? 'AUTO' : 'SHORT') + '" title="Short Swing (M5·M15) — click to focus or reset">' +
      '<i>SHORT M5·15</i>' + esc(shortTxt) + '</button>'
    );
    scaleChips.push(
      '<button type="button" class="sai-chip scale-btn' + (mode === 'MAJOR' || (mode === 'AUTO' && activeScale === 'MAJOR') ? ' is-active' : '') +
      '" data-board-side="' + side + '" data-scale="' + (mode === 'MAJOR' ? 'AUTO' : 'MAJOR') + '" title="Major Swing (H1·H4) — click to focus or reset">' +
      '<i>MAJOR H1·H4</i>' + esc(majorTxt) + '</button>'
    );
    scaleChips.push(
      '<button type="button" class="sai-chip scale-btn' + (mode === 'AUTO' ? ' is-active' : '') +
      '" data-board-side="' + side + '" data-scale="AUTO" title="AI automatic Short + Major lock">' +
      '<i>AI</i>' + (mode === 'AUTO' ? 'AUTO S+M' : 'RESET AUTO') + '</button>'
    );

    var pinnedOnChart = !!(plan && isPlanSavedOnChart(plan));
    if (plan && !plan.hit && !plan.doneAt) {
      scaleChips.push(
        '<button type="button" class="sai-chip save-btn' + (pinnedOnChart ? ' is-saved' : '') +
        '" data-board-side="' + side + '" data-save-action="pin" title="Save this TP / SL permanently on chart">' +
        '<i>CHART</i>' + (pinnedOnChart ? '✓ SAVED' : '📌 SAVE TP/SL') + '</button>'
      );
    }
    var sideSavedCount = savedChartZones.filter(function (z) { return z && z.side === side; }).length;
    if (sideSavedCount > 0) {
      scaleChips.push(
        '<button type="button" class="sai-chip clear-btn" data-board-side="' + side +
        '" data-save-action="clear" title="Clear saved ' + side + ' TP / SL overlays from chart">' +
        '<i>SAVED ' + sideSavedCount + '</i>CLEAR ×</button>'
      );
    }

    var m5 = fallbackBaseFrame();
    var chips = [];
    if (m5 && m5.ready) {
      chips.push(['RSI', Math.round(m5.rsi), m5.rsi >= 56 ? 'up' : m5.rsi <= 44 ? 'down' : 'flat']);
      if (m5.macd) {
        var hist = m5.macd.hist;
        chips.push(['MACD', (hist >= 0 ? '+' : '') + num(hist, Math.abs(hist) < 1 ? 3 : 2), hist >= 0 ? 'up' : 'down']);
      }
      if (m5.bb) chips.push(['BB', Math.round(m5.bb.pctB) + '%', m5.bb.pctB >= 55 ? 'up' : m5.bb.pctB <= 45 ? 'down' : 'flat']);
      if (m5.vwap) chips.push(['VWAP', px(m5.vwap), m5.close >= m5.vwap ? 'up' : 'down']);
      if (m5.stoch) chips.push(['STOCH', Math.round(m5.stoch.k), m5.stoch.k >= 75 ? 'down' : m5.stoch.k <= 25 ? 'up' : 'flat']);
    }
    var bias = currentFlow(Date.now());
    chips.push(['FLOW', flowAt && Date.now() - flowAt <= quoteMaxAge ? Math.round(bias) + '% B' : 'LIVE', bias >= 52 ? 'up' : bias <= 48 ? 'down' : 'flat']);
    chips.push(['SESS', marketOpen ? shortSession(sessionFactor().name) : 'CLOSED', 'flat']);

    return scaleChips.join('') + chips.map(function (c) {
      return '<span class="sai-chip ' + c[2] + '"><i>' + esc(c[0]) + '</i>' + esc(String(c[1])) + '</span>';
    }).join('');
  }

  function primarySide() {
    var bConf = directionModels.BUY ? directionModels.BUY.confidence : 0;
    var sConf = directionModels.SELL ? directionModels.SELL.confidence : 0;
    if (plans.BUY && plans.BUY.running && !(plans.SELL && plans.SELL.running)) return 'BUY';
    if (plans.SELL && plans.SELL.running && !(plans.BUY && plans.BUY.running)) return 'SELL';
    if (vote && (vote.side === 'BUY' || vote.side === 'SELL') && Math.abs(bConf - sConf) <= 4) return vote.side;
    return bConf >= sConf ? 'BUY' : 'SELL';
  }

  function sideView(side, now) {
    now = now || Date.now();
    var p = plans[side];
    var lead = primarySide();
    var open = !!(p && !p.hit && !p.doneAt && (quoteFresh(now) || (p.restored && now - restoredBootAt < 4500)));
    return {
      side: side,
      active: open,
      primary: side === lead,
      activeSide: lead,
      lockedBy: '',
      plan: p,
      status: !open ? 'waiting'
        : p ? (p.hit ? 'complete' : p.doneAt ? 'finished' : p.running ? 'running' : (side === lead ? 'armed' : 'standby'))
          : 'waiting'
    };
  }

  var lastSwingEventSig = '';
  function scaleSigPart(p) {
    return p ? [!!p.running, !!p.hit, !!p.doneAt, p.observedEntry || p.entry, p.target, p.stop, p.startAt].join(':') : '';
  }
  function notifySwingState() {
    var savedPart = savedChartZones.map(function (z) {
      return z.side + ':' + (z.scale || '') + ':' + z.entry + ':' + z.tp + ':' + z.sl + ':' + (z.status || '');
    }).join(',');
    var sig = [
      symbol,
      scaleSigPart(plans.BUY),
      scaleSigPart(plans.SELL),
      scaleSigPart(lockedScales.BUY.SHORT),
      scaleSigPart(lockedScales.BUY.MAJOR),
      scaleSigPart(lockedScales.SELL.SHORT),
      scaleSigPart(lockedScales.SELL.MAJOR),
      savedPart
    ].join('|');
    if (sig === lastSwingEventSig) return;
    lastSwingEventSig = sig;
    window.dispatchEvent(new CustomEvent('swing:state', { detail: { symbol: symbol } }));
  }

  function paint(now) {
    now = now || Date.now();
    ['BUY', 'SELL'].forEach(function (side) {
      stepPlanLifecycle(side, now);
      var p = plans[side];
      if (p && !p.logged && (p.hit || p.doneAt)) pushLog(p, p.outcome || (p.hit ? 'hit' : 'miss'));
    });
    BOARDS.forEach(function (board) { paintBoard(now, board); });
    notifySwingState();
  }

  var lastFactorHtmlByBoard = Object.create(null);

  function paintBoard(now, board) {
    var root = $(board.id);
    if (!root) return;
    var view = sideView(board.side, now), p = view.plan;
    function field(name) { return $(board.prefix + name); }
    root.setAttribute('data-active-side', view.active ? board.side : 'NONE');

    var symEl = field('symbol');
    var symText = cleanSymbol(symbol) || 'XAUUSD';
    if (symEl && symEl.textContent !== symText) symEl.textContent = symText;
    var priceEl = field('price');
    var shownSpot = price > 0 ? price : (p && p.restored ? p.priceAt : 0);
    var priceText = px(shownSpot);
    if (priceEl && priceEl.textContent !== priceText) priceEl.textContent = priceText;
    var updEl = field('updated');
    var shownAt = updatedAt || (p && p.restored ? p.quoteAt : 0);
    var updText = shownAt ? hhmm(shownAt) : '—';
    if (updEl && updEl.textContent !== updText) updEl.textContent = updText;

    var v = vote || { side: 'NEUTRAL', confidence: 0, score: 0, reasons: [] };
    var model = directionModels[board.side];
    var shownConf = p ? Number(p.confidence) || 0 : (model ? Number(model.confidence) || 0 : 0);
    var shownScore = p && Number.isFinite(p.score) ? p.score : v.score;

    var sideEl = field('side'), confEl = field('conf'), scoreEl = field('score');
    if (sideEl) {
      var buy = view.active && board.side === 'BUY', sell = view.active && board.side === 'SELL';
      var nextSideTxt = buy ? '▲ BUY' : sell ? '▼ SELL' : '◆ WAIT';
      var nextSideCls = 'sai-side ' + (buy ? 'buy' : sell ? 'sell' : 'wait');
      if (sideEl.textContent !== nextSideTxt) sideEl.textContent = nextSideTxt;
      if (sideEl.className !== nextSideCls) sideEl.className = nextSideCls;
    }
    if (confEl) {
      var confTxt = shownConf + '% signal strength';
      if (confEl.textContent !== confTxt) confEl.textContent = confTxt;
    }
    if (scoreEl) {
      var scoreTxt = 'market score ' + (shownScore > 0 ? '+' : '') + shownScore;
      if (scoreEl.textContent !== scoreTxt) scoreEl.textContent = scoreTxt;
    }

    var fac = field('factors');
    if (fac) {
      var nextFac = factorsHtml(board.side, p);
      if (lastFactorHtmlByBoard[board.id] !== nextFac) {
        lastFactorHtmlByBoard[board.id] = nextFac;
        fac.innerHTML = nextFac;
      }
    }

    var srcEl = field('src');
    if (srcEl) {
      var isFresh = quoteFresh(now);
      var srcCls = 'sai-src ' + (isFresh ? 'ok' : 'warn');
      var bits = [isFresh
        ? 'TradingView · ' + tvInstrument + (marketOpen ? ' · LIVE' : ' · SESSION CLOSED')
        : 'TradingView quote unavailable · syncing'];
      bits.push('Locked Short + Major AI engine');
      var line = scoreLine(board.side);
      if (line) bits.push(line);
      var srcTxt = bits.join('  ·  ');
      if (srcEl.className !== srcCls) srcEl.className = srcCls;
      if (srcEl.textContent !== srcTxt) srcEl.textContent = srcTxt;
    }

    var phaseEl = field('phase'), clockEl = field('clock'), barEl = field('bar');
    var labelEl = field('phase-label');
    var entryEl = field('entry'), tgtEl = field('target'), stopEl = field('stop');
    var rrEl = field('rr'), etaEl = field('eta'), exitEl = field('exit');
    var whyEl = field('why');

    function setBar(f) {
      if (!barEl) return;
      var wStr = clamp(f, 0, 1) * 100 + '%';
      if (barEl.style.width !== wStr) barEl.style.width = wStr;
    }
    function setPhase(text, cls, label) {
      var pCls = 'sai-phase ' + cls, lCls = 'sai-plabel ' + cls, bCls = 'sai-fill ' + cls;
      if (phaseEl) {
        if (phaseEl.textContent !== text) phaseEl.textContent = text;
        if (phaseEl.className !== pCls) phaseEl.className = pCls;
      }
      if (labelEl) {
        if (labelEl.textContent !== label) labelEl.textContent = label;
        if (labelEl.className !== lCls) labelEl.className = lCls;
      }
      if (barEl && barEl.className !== bCls) barEl.className = bCls;
    }
    function setClock(txt) {
      if (clockEl && clockEl.textContent !== txt) clockEl.textContent = txt;
    }

    var bootGrace = !!(p && p.restored && now - restoredBootAt < 4500);
    if ((!quoteFresh(now) && !bootGrace) || !p) {
      setPhase((quoteFresh(now) || bootGrace) ? 'SCANNING ' + board.side + ' STRUCTURE' : 'WAITING FOR LIVE TRADINGVIEW PRICE', 'wait', 'NO TRADE');
      if (clockEl && clockEl.textContent !== '--:--') clockEl.textContent = '--:--';
      setBar(0);
      [entryEl, tgtEl, stopEl, rrEl, etaEl, exitEl].forEach(function (el) {
        if (!el) return;
        if (el.dataset.exitKey) delete el.dataset.exitKey;
        if (el.textContent !== '—') el.textContent = '—';
      });
      if (whyEl) {
        var emptyWhy = !quoteFresh(now)
          ? 'Syncing live TradingView feed for ' + (cleanSymbol(symbol) || 'market') + '.'
          : ((model && model.reason) || planNotes[board.side] || 'Reading M1–D1 candles…');
        if (whyEl.textContent !== emptyWhy) whyEl.textContent = emptyWhy;
      }
      return;
    }

    var scaleTag = (p.scale || 'SHORT') + (p.tfLabel ? ' ' + p.tfLabel : '');
    if (p.hit) {
      setPhase('TARGET HIT (' + scaleTag + ') · COMPLETE', 'done', 'DONE');
      setClock(clock(p.hitAt - p.startAt));
      setBar(1);
    } else if (p.doneAt) {
      setPhase(p.outcome === 'timeout' ? 'TIME UP · SAVED TO CHART · NEXT SWING'
        : p.outcome === 'expired' ? 'WATCH EXPIRED · RE-SCANNING'
          : p.outcome === 'invalidated' ? 'STRUCTURE SHIFT · RE-SCANNING'
            : 'STOPPED OUT · RE-CALCULATING', 'fail', p.outcome === 'timeout' ? 'SCAN NEXT' : (p.outcome ? 'EXPIRED' : 'FAILED'));
      setClock(clock(p.doneAt - p.startAt));
      setBar(1);
    } else if (p.running) {
      setPhase('SWING RUNNING · ' + scaleTag + ' · ' + clock(now - p.startAt), 'live', 'RUNNING');
      setClock(clock(p.endAt - now));
      setBar((now - p.startAt) / Math.max(1, p.endAt - p.startAt));
    } else if (!marketOpen) {
      setPhase('LOCKED ' + board.side + ' · ' + scaleTag, 'wait', view.primary ? 'ARMED' : 'STANDBY');
      setClock(formatDuration(p.etaMin));
      setBar(clamp(shownConf / 100, 0.2, 0.95));
    } else if (view.primary) {
      setPhase('PRIMARY ' + board.side + ' · ' + scaleTag + ' · FIXED', 'live', 'ARMED');
      setClock(clock(p.endAt - now));
      setBar(clamp(shownConf / 100, 0.25, 0.95));
    } else {
      setPhase('COUNTER-' + board.side + ' · ' + scaleTag + ' · LOCKED', 'wait', 'STANDBY');
      setClock(clock(p.endAt - now));
      setBar(clamp(shownConf / 100, 0.15, 0.85));
    }

    var entryTxt = px(p.observedEntry || p.entry);
    var tgtTxt = px(p.target);
    var stopTxt = px(p.stop);
    var rrTxt = '1 : ' + num(p.observedRR || p.rr, 2);
    var etaTxt = formatDuration(p.etaMin);
    if (entryEl && entryEl.textContent !== entryTxt) entryEl.textContent = entryTxt;
    if (tgtEl && tgtEl.textContent !== tgtTxt) tgtEl.textContent = tgtTxt;
    if (stopEl && stopEl.textContent !== stopTxt) stopEl.textContent = stopTxt;
    if (rrEl && rrEl.textContent !== rrTxt) rrEl.textContent = rrTxt;
    if (etaEl && etaEl.textContent !== etaTxt) etaEl.textContent = etaTxt;
    if (exitEl) {
      var exitPriceVal = (p.hit || p.doneAt) && Number.isFinite(p.exitPrice) && p.exitPrice > 0
        ? p.exitPrice
        : (p.outcome === 'miss' ? p.stop : p.target);
      var exitPriceTxt = px(exitPriceVal);
      var exitTimeTxt = (!marketOpen && !p.hit && !p.doneAt)
        ? 'At open'
        : hhmm(p.exitAt || (p.hit ? p.hitAt : (p.doneAt || p.endAt)));
      var exitKey = exitPriceTxt + '|' + exitTimeTxt;
      if (exitEl.dataset.exitKey !== exitKey) {
        exitEl.dataset.exitKey = exitKey;
        exitEl.innerHTML = '<span class="sai-exit-px">' + esc(exitPriceTxt) + '</span>' +
          '<span class="sai-exit-tm"> · ' + esc(exitTimeTxt) + '</span>';
      }
    }
    if (whyEl && shownSpot > 0) {
      var toEntry = Math.abs(shownSpot - p.entry) / Math.max(1e-9, shownSpot) * 100;
      var whyTxt = (p.touches > 1
        ? p.touches + ' levels agree (' + (p.labels || []).join(' · ') + ')'
        : ((p.labels && p.labels[0]) || 'structure at ') + ' ' + px(p.perfect)) +
        (p.observedEntry ? ' · filled at ' + px(p.observedEntry)
          : ' · ' + toEntry.toFixed(2) + '% from live') + ' · ' + (marketOpen ? p.session : 'Pre-open') + ' · ATR ' + px(p.atr);
      if (whyEl.textContent !== whyTxt) whyEl.textContent = whyTxt;
    }
  }

  /* --------------------------------------------------------------- feeds */
  function acceptQuote(q) {
    if (!q || !q.tv_symbol || q.symbol !== symbol || !(Number(q.price) > 0) || q.source !== 'TradingView') return false;
    var expected = instrument();
    if (expected && q.tv_symbol !== expected) return false;
    var at = Number(q.at) || Date.now();
    if (at < updatedAt && price > 0) return false;
    var nextPrice = Number(q.price), nextOpen = q.market_open !== false;
    var nextDigits = Number.isInteger(q.tv_digits) ? Number(q.tv_digits) : quoteTvDigits;
    if (price === nextPrice && marketOpen === nextOpen && quoteTvDigits === nextDigits &&
        tvInstrument === q.tv_symbol && updatedAt === at) {
      return true;
    }
    price = nextPrice;
    updatedAt = at;
    marketOpen = nextOpen;
    quoteTvDigits = nextDigits;
    tvInstrument = q.tv_symbol;
    rebuildReads();
    var now = Date.now();
    maybeRebuild(now);
    paint(now);
    return true;
  }

  function loadPrice() {
    if (priceBusy || !symbol) return;
    var soft = window.SOFT_TV_QUOTE;
    if (soft && soft.symbol === symbol && (Date.now() - Number(soft.at || 0)) < 4500 && acceptQuote(soft)) {
      return;
    }
    if (acceptQuote(soft)) return;
    var inflight = window.__SOFT_QUOTE_INFLIGHT;
    if (inflight && inflight.symbol === symbol && (Date.now() - inflight.at) < 3000 && inflight.promise) {
      priceBusy = true;
      var gen0 = marketGeneration, sym0 = symbol;
      inflight.promise.then(function (q) {
        if (gen0 === marketGeneration && sym0 === symbol && q) acceptQuote(q);
      }).finally(function () {
        if (gen0 === marketGeneration) priceBusy = false;
      });
      return;
    }
    var host = window.TvChartHost;
    if (!document.hidden && host && typeof host.refreshQuote === 'function') { host.refreshQuote(); }
    var requestedSymbol = symbol, generation = marketGeneration;
    priceBusy = true;
    fetchJSON('/api/chart/tvquote?symbol=' + encodeURIComponent(requestedSymbol) +
      (instrument() ? '&tv_symbol=' + encodeURIComponent(instrument()) : ''))
      .then(function (t) {
        if (generation !== marketGeneration || requestedSymbol !== symbol || !t || !t.ok) return;
        acceptQuote(t);
      })
      .catch(function () {})
      .finally(function () { if (generation === marketGeneration) priceBusy = false; });
  }

  function fetchJSON(url) {
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 12000);
    return fetch(url, { cache: 'no-store', signal: controller.signal })
      .then(function (response) { return response.ok ? response.json() : null; })
      .finally(function () { clearTimeout(timeout); });
  }

  function closedBars(rows, tf, now) {
    var unique = Object.create(null), duration = tf.minutes * 60000;
    var q = window.SOFT_TV_QUOTE;
    var isLiveSession = q && q.symbol === symbol && typeof q.market_open === 'boolean' ? q.market_open : marketOpen;
    (rows || []).forEach(function (b) {
      if (!Array.isArray(b) || b.length < 5) return;
      var time = Number(b[0]);
      if (time < 1e11) time *= 1000;
      var values = b.slice(1, 5).map(Number);
      if (!Number.isFinite(time) || time <= 0 || (isLiveSession && time + duration > now) ||
          !values.every(function (n) { return Number.isFinite(n) && n > 0; }) ||
          values[1] < Math.max(values[0], values[2], values[3]) || values[2] > Math.min(values[0], values[3])) return;
      var volume = Number(b[5]);
      unique[time] = [time].concat(values, [Number.isFinite(volume) && volume > 0 ? volume : 0]);
    });
    var sorted = Object.keys(unique).map(function (key) { return unique[key]; })
      .sort(function (a, b) { return a[0] - b[0]; });
    return sorted.slice(-140);
  }

  function loadCandles() {
    if (candleBusy || !symbol) return;
    var requestedSymbol = symbol, generation = marketGeneration;
    candleBusy = true;
    var nowStart = Date.now();
    // Always fetch all 6 timeframes on boot or whenever any HTF is missing/stale
    var slow = { H1: 1, H4: 1, D1: 1 };
    var needAll = !bootCandlesReady || (candleRound % 3 === 0) ||
      ['H1', 'H4', 'D1'].some(function (k) { return !readingFresh(k, nowStart); });
    var list = needAll ? TFS : TFS.filter(function (tf) { return !slow[tf.key]; });
    candleRound++;
    var jobs = list.map(function (tf) {
      var target = instrument();
      return fetchJSON('/api/chart/tvcandles?symbol=' + encodeURIComponent(requestedSymbol) +
        '&tf=' + tf.tf + '&count=140' + (target ? '&tv_symbol=' + encodeURIComponent(target) : ''))
        .then(function (d) {
          return {
            key: tf.key,
            instrument: d && d.tv_symbol,
            bars: d && d.ok === true && d.source === 'TradingView' && d.symbol === requestedSymbol &&
              d.tv_symbol && d.tf === tf.tf && (!target || d.tv_symbol === target) && Array.isArray(d.bars)
              ? closedBars(d.bars, tf, Date.now()) : []
          };
        })
        .catch(function () { return { key: tf.key, bars: [] }; });
    });
    Promise.all(jobs).then(function (results) {
      if (generation !== marketGeneration || requestedSymbol !== symbol) return;
      var changed = false;
      results.forEach(function (res) {
        if (res.bars.length >= minBarsFor(res.key)) {
          candleBars[res.key] = res.bars;
          candleSeenAt[res.key] = Date.now();
          candleInstruments[res.key] = res.instrument;
          changed = true;
        } else {
          candleSeenAt[res.key] = 0;
        }
      });
      if (changed) structureAt = Date.now();
      if (candleBars.M5 && candleBars.M5.length >= minBarsFor('M5')) {
        bootCandlesReady = true;
      }
      structureStamp = ['M5', 'M15', 'H1'].map(function (key) {
        var rows = candleBars[key];
        return key + ':' + (rows && rows.length ? rows[rows.length - 1].slice(0, 5).join(',') : '');
      }).join('|');
      rebuildReads();
      var now = Date.now();
      maybeRebuild(now);
      paint(now);
      if (changed) {
        window.dispatchEvent(new CustomEvent('swing:structure', {
          detail: { symbol: requestedSymbol, structureAt: structureAt }
        }));
      }
    }).finally(function () { if (generation === marketGeneration) candleBusy = false; });
  }

  function rebuildReads() {
    if (!quoteFresh(Date.now()) && !bootCandlesReady) return;
    Object.keys(candleBars).forEach(function (key) {
      if (!readingFresh(key, Date.now())) {
        reads[key] = { key: key, ready: false, score: 0, verdict: 'NEUTRAL', atr: 0, reasons: ['Candle history is stale'] };
        return;
      }
      reads[key] = read(candleBars[key], price, key);
    });
    vote = freshVote(Date.now());
  }

  function setSymbol(next) {
    var s = String(next || '');
    if (!s || s === symbol) return;
    if (symbol) {
      savePlan('BUY');
      savePlan('SELL');
    }
    symbol = s;
    savedPlanSignatures = { BUY: '', SELL: '' };
    manualScalePickAt = { BUY: 0, SELL: 0 };
    marketGeneration++;
    priceBusy = false;
    candleBusy = false;
    bootCandlesReady = false;
    restoredBootAt = Date.now();
    candleRound = 0;
    price = 0;
    updatedAt = 0;
    marketOpen = true;
    quoteTvDigits = null;
    tvInstrument = '';
    candleBars = {};
    candleSeenAt = {};
    candleInstruments = {};
    structureStamp = '';
    directionModels = { BUY: null, SELL: null };
    plans = { BUY: null, SELL: null };
    lockedScales = { BUY: { SHORT: null, MAJOR: null }, SELL: { SHORT: null, MAJOR: null } };
    planNotes = { BUY: '', SELL: '' };
    structureAt = 0;
    flowBias = 50;
    flowAt = 0;
    reads = {};
    vote = null;
    log = [];
    savedChartZones = [];
    recentExpiredSignals = {};
    loadLog();
    loadSavedZones();
    restorePlans();
    paint();
    loadPrice();
    loadCandles();
  }

  function init() {
    if (!BOARDS.some(function (board) { return !!$(board.id); })) return;
    var term = window.SoftradeXTerminal;
    symbol = (term && typeof term.getCurrentSymbol === 'function') ? String(term.getCurrentSymbol() || '') : '';
    if (!symbol) symbol = 'XAUUSDm';
    restoredBootAt = Date.now();

    BOARDS.forEach(function (board) {
      var el = $(board.id);
      if (!el) return;
      el.addEventListener('click', function (ev) {
        var saveBtn = ev.target && ev.target.closest ? ev.target.closest('button[data-save-action]') : null;
        if (saveBtn) {
          var sSide = saveBtn.getAttribute('data-board-side') || board.side;
          var act = saveBtn.getAttribute('data-save-action');
          if (act === 'pin') {
            var p = plans[sSide] || lockedScales[sSide].SHORT || lockedScales[sSide].MAJOR;
            if (p) {
              savePlanToChart(p, 'manual', Date.now());
              lastFactorHtmlByBoard = Object.create(null);
              paint(Date.now());
            }
          } else if (act === 'clear') {
            clearSavedZones(sSide);
          }
          return;
        }
        var btn = ev.target && ev.target.closest ? ev.target.closest('button.scale-btn[data-scale]') : null;
        if (!btn) return;
        var bSide = btn.getAttribute('data-board-side') || board.side;
        var nextScale = btn.getAttribute('data-scale') || 'AUTO';
        applyScaleChoice(bSide, nextScale);
      });
    });

    var lastFlowPaintAt = 0;
    window.addEventListener('orderflow:update', function (ev) {
      var d = (ev && ev.detail) || {};
      if (d.symbol !== symbol) return;
      var buy = Number(d.buy), sell = Number(d.sell);
      if (!Number.isFinite(buy) || !Number.isFinite(sell) || buy < 0 || sell < 0) return;
      var nextBias = buy + sell > 0 ? (buy / (buy + sell)) * 100 : 50;
      var prevRounded = Math.round(flowBias);
      flowBias = nextBias;
      flowAt = buy + sell > 0 ? Date.now() : 0;
      var now = Date.now();
      if (Math.round(nextBias) === prevRounded && now - lastFlowPaintAt < 1000) return;
      lastFlowPaintAt = now;
      paint(now);
    });
    window.addEventListener('chart:market', function (ev) {
      var d = (ev && ev.detail) || {};
      setSymbol(d.symbol || (d.meta && d.meta.symbol) || '');
    });
    window.addEventListener('chart:refresh', function () { loadPrice(); loadCandles(); });
    window.addEventListener('chart:tv-quote', function (ev) { acceptQuote(ev.detail); });

    loadLog();
    loadSavedZones();
    restorePlans();
    paint();
    loadPrice();
    loadCandles();
    setInterval(function () { if (!document.hidden) loadPrice(); }, PRICE_MS);
    setInterval(function () { if (!document.hidden) loadCandles(); }, CANDLES_MS);
    setInterval(function () {
      if (document.hidden) return;
      var now = Date.now();
      if (bootCandlesReady) vote = freshVote(now);
      maybeRebuild(now);
      paint(now);
    }, 1000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { loadPrice(); loadCandles(); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  var cachedStructureKey = '';
  var cachedStructureObj = null;

  window.SwingAI = {
    refresh: function () { loadPrice(); loadCandles(); },
    setScale: function (side, mode) { applyScaleChoice(side, mode); },
    savedZones: function () { return savedChartZones.map(function (z) { return Object.assign({}, z); }); },
    saveCurrent: function (side) {
      var s = side === 'BUY' || side === 'SELL' ? side : primarySide();
      var p = plans[s] || lockedScales[s].SHORT || lockedScales[s].MAJOR;
      if (!p) return false;
      var ok = savePlanToChart(p, 'manual', Date.now());
      lastFactorHtmlByBoard = Object.create(null);
      paint(Date.now());
      return ok;
    },
    clearSaved: function (sideOrAll) { clearSavedZones(sideOrAll); },
    structure: function () {
      var inst = instrument();
      var key = symbol + '|' + structureAt + '|' + inst + '|' +
        (candleInstruments.M5 === inst ? (candleBars.M5 || []).length : 0) + '|' +
        (candleInstruments.M15 === inst ? (candleBars.M15 || []).length : 0) + '|' +
        (candleInstruments.H1 === inst ? (candleBars.H1 || []).length : 0);
      if (cachedStructureObj && cachedStructureKey === key) return cachedStructureObj;
      cachedStructureKey = key;
      cachedStructureObj = {
        symbol: symbol,
        at: structureAt,
        source: 'TradingView',
        frames: {
          M5: (candleInstruments.M5 === inst ? candleBars.M5 || [] : []).map(function (b) { return b.slice(); }),
          M15: (candleInstruments.M15 === inst ? candleBars.M15 || [] : []).map(function (b) { return b.slice(); }),
          H1: (candleInstruments.H1 === inst ? candleBars.H1 || [] : []).map(function (b) { return b.slice(); })
        }
      };
      return cachedStructureObj;
    },
    analyzeCandles: read,
    state: function () {
      var lead = primarySide();
      var activePlan = plans[lead] || plans.BUY || plans.SELL;
      return {
        symbol: symbol,
        price: price,
        updatedAt: updatedAt,
        priceSource: 'TradingView',
        tvSymbol: tvInstrument,
        fresh: quoteFresh(Date.now()),
        vote: vote,
        plan: activePlan,
        plans: plans,
        scales: lockedScales,
        savedZones: savedChartZones.map(function (z) { return Object.assign({}, z); }),
        modes: scaleMode,
        reads: reads,
        flowBias: currentFlow(Date.now()),
        candleSource: 'TradingView',
        models: directionModels,
        activeSide: activePlan ? activePlan.side : 'NONE',
        panels: { SELL: sideView('SELL'), BUY: sideView('BUY') }
      };
    }
  };
})();

}
