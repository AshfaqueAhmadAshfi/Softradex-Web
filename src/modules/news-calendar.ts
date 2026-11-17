// @ts-nocheck
/* Consolidated TypeScript module */
import {
  analyzeFinancialText,
  canonicalNewsBase,
  computePostEventReaction,
  estimateNewsDirection,
  isMacroNoiseHeadline,
} from './news-analyzer-core';

export function loadModule(): void {
  (window as any).SOFTRADEX_PUBLIC_ONLY = true;

// ==================== news-direction.js ====================
/* Selected-market directional estimates backed by shared clause-aware NLP,
   release surprise math, and live M5/DXY post-event price reaction verification. */
(function () {
  'use strict';
  function estimate(input) {
    return estimateNewsDirection(input);
  }
  window.NewsDirection = { estimate: estimate };
})();


// ==================== running-news-alert.js ====================
/* Notify once for a newly running release or a fresh selected-market headline. */
(function (root) {
  'use strict';
  function createObserver(onNew, onReset) {
    let market = '', primed = false;
    const seen = new Map();
    function observe(snapshot) {
      if (!snapshot || !snapshot.market) return;
      if (market !== snapshot.market) {
        market = snapshot.market;
        primed = false;
        seen.clear();
        if (onReset) onReset();
      }
      // An empty loading screen is not the first news snapshot.
      if (!snapshot.ready) return;
      const now = Number(snapshot.now);
      for (const [key, expires] of seen) if (expires <= now) seen.delete(key);
      const fresh = [];
      for (const event of snapshot.events || []) {
        if (!event.key || !(event.expiresAt > now)) continue;
        if (!seen.has(event.key)) fresh.push(event);
        seen.set(event.key, event.expiresAt);
      }
      if (primed && fresh.length) onNew(fresh, snapshot.label || market);
      primed = true;
    }
    return {observe};
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {createObserver};
  if (!root.document) return;

  const doc = root.document;
  const popup = doc.createElement('aside');
  popup.id = 'running-news-popup';
  popup.className = 'running-news-popup';
  popup.setAttribute('role', 'status');
  popup.setAttribute('aria-live', 'polite');
  popup.setAttribute('aria-atomic', 'true');
  let timer = null, deadline = 0;

  function moveToVisiblePage() {
    const parent = doc.fullscreenElement || doc.body;
    if (popup.parentElement !== parent) parent.appendChild(popup);
  }
  function hide() {
    if (timer !== null) root.clearTimeout(timer);
    timer = null;
    deadline = 0;
    popup.classList.remove('is-visible');
  }
  function textElement(tag, className, text) {
    const node = doc.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  }
  function show(events, label) {
    hide();
    moveToVisiblePage();
    const content = doc.createDocumentFragment();
    content.appendChild(textElement('div', 'rnews-alert-kicker', 'SOFTRADEX · NEWS ALERT'));
    content.appendChild(textElement('h2', 'rnews-alert-heading', events.length === 1
      ? (events[0].headline ? 'New market headline' : 'New running news') : events.length + ' new news updates'));
    content.appendChild(textElement('p', 'rnews-alert-market', label));
    const list = textElement('div', 'rnews-alert-items', '');
    events.slice(0, 3).forEach(event => {
      const item = textElement('div', 'rnews-alert-item', '');
      item.appendChild(textElement('strong', 'rnews-alert-title', event.title || 'New market update'));
      item.appendChild(textElement('span', 'rnews-alert-meta',
        (event.headline ? 'Recent headline · impact unconfirmed' : 'Scheduled release now running') +
        (event.source ? ' · ' + event.source : '')));
      list.appendChild(item);
    });
    content.appendChild(list);
    if (events.length > 3) content.appendChild(textElement('p', 'rnews-alert-more',
      '+' + (events.length - 3) + ' more updates in the news panels'));
    content.appendChild(textElement('p', 'rnews-alert-footer', 'Closes automatically in 5 seconds'));
    const progress = textElement('div', 'rnews-alert-progress', '');
    progress.setAttribute('aria-hidden', 'true');
    progress.appendChild(doc.createElement('span'));
    content.appendChild(progress);
    popup.replaceChildren(content);
    popup.classList.add('is-visible');
    deadline = Date.now() + 5000;
    timer = root.setTimeout(hide, 5000);
  }
  moveToVisiblePage();
  doc.addEventListener('fullscreenchange', moveToVisiblePage);
  doc.addEventListener('visibilitychange', () => {
    if (!doc.hidden && deadline && Date.now() >= deadline) hide();
  });
  root.RunningNewsAlerts = createObserver(show, hide);
})(typeof window === 'undefined' ? globalThis : window);


// ==================== chart-workspace.js ====================
/* Chart workspace controls: expanded/fullscreen chart + order-flow + 24h news.
   The calculations shown here are explicitly estimates; no signal is a promise. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var section, workspace, button, icon, label, symbol = '', news = [], newsSig = '';
  var refreshTimer = null;
  var eventReferences = Object.create(null), lastNewsHtml = Object.create(null);
  var lastSourcesHtml = '', lastSourceSummary = '', lastWindowText = '', lastWindowMinute = -1;
  var quoteNewsTimer = null, lastQuoteNewsAt = 0, lastQuoteNewsPrice = NaN;
  var newsServerSig = '', lastSavedSig = '', newsMergeGen = 0;
  var cachedRenderHeadlines = [], cachedHeadlinesKey = '';
  var workerEstimates = Object.create(null), workerBatchGen = 0, lastWorkerKey = '';
  var dxyBarsM5 = [], lastReleaseScanAt = 0;
  var fixed24hState = { market: '', side: 'BUY', buyPct: 51, sellPct: 49, winPct: 51, buyCount: 0, sellCount: 0, waitCount: 0 };
  var lastFixedRenderSig = '';
  function getRelevantHeadlines(now) {
    var key = symbol + '|' + newsMergeGen;
    if (cachedHeadlinesKey !== key) {
      cachedHeadlinesKey = key;
      var dirMod = window.NewsDirection;
      cachedRenderHeadlines = news
        .filter(function(h) { return h.kind === 'headline' && !!relevanceFor(h); })
        .sort(function(a, b) { return Number(b.ts) - Number(a.ts); });
      for (var i = 0; i < cachedRenderHeadlines.length; i++) {
        var h = cachedRenderHeadlines[i];
        h._titleLower = String(h.title || '').toLowerCase();
      }
    }
    return cachedRenderHeadlines.filter(function(h) { return h.ts <= now && h.ts >= now - 86400; });
  }
  function setText(id, val) {
    var el = $(id);
    if (el && el.textContent !== val) el.textContent = val;
  }
  var newsBusy = false;
  var sourceStatus = [], newsRequest = 0, newsAbort = null;
  var newsRetryTimer = null, newsFailures = 0, scanState = 'scanning';
  var newsSnapshotReady = false;
  var NEWS_CACHE_KEY = 'softradex.news.snapshot.v1.';
  var EXNESS_API = 'https://pwapi.ex2b.com/api/v1/calendar/events/';
  var exnessBrowser = { rows: [], status: null, nextFetch: 0, busy: false };
  var SOURCE_NAMES = {'tradingview':'TradingView','forex-factory':'Forex Factory','investing.com':'Investing.com','exness':'Exness','binance':'Binance',
    'fxstreet':'FXStreet','forexlive':'ForexLive','actionforex':'ActionForex','cnbc':'CNBC','marketwatch':'MarketWatch',
    'federal-reserve':'Federal Reserve','coindesk':'CoinDesk','google-news':'Google News'};
  var SOURCE_URLS = {'tradingview':'https://www.tradingview.com/economic-calendar/',
    'forex-factory':'https://www.forexfactory.com/calendar','investing.com':'https://www.investing.com/economic-calendar/',
    'exness':'https://www.exness.com/calendar/','binance':'https://www.binance.com/en/support/announcement',
    'fxstreet':'https://www.fxstreet.com/news','forexlive':'https://www.forexlive.com/',
    'actionforex':'https://www.actionforex.com/','cnbc':'https://www.cnbc.com/markets/',
    'marketwatch':'https://www.marketwatch.com/','federal-reserve':'https://www.federalreserve.gov/newsevents/pressreleases.htm',
    'coindesk':'https://www.coindesk.com/','google-news':'https://news.google.com/'};
  var lockedDirections = Object.create(null), locksRestored = false;
  // Impact windows are display-only estimates; the event time itself is real.
  var IMPACT_WINDOW = { low: 15 * 60, medium: 30 * 60, high: 60 * 60 };

  function marketKey(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function marketBase(v) {
    var raw = String(v || ''), key = marketKey(raw.replace(/m$/, ''));
    var aliases = { GOLD: 'XAUUSD', XAUUSD247: 'XAUUSD', BTCUSD: 'BTCUSDT', ETHUSD: 'ETHUSDT',
      NAS100: 'USTEC', USTECX100: 'USTEC', NDX: 'USTEC', SPX: 'US500', WTI: 'USOIL', BRENT: 'UKOIL' };
    return aliases[key] || key;
  }
  function marketMatch(a, b) {
    return !!marketBase(a) && marketBase(a) === marketBase(b);
  }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function(c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function impactFor(ev, targetSymbol) {
    targetSymbol = targetSymbol || symbol;
    var arr = Array.isArray(ev.impacted_markets) ? ev.impacted_markets : (Array.isArray(ev.impacted) ? ev.impacted : []);
    // The backend's unknown-currency fallback assigns broad sentiment rows to
    // gold/equities/crypto. Those rows are not evidence of a specific spillover.
    var generic = /^(?:[A-Z]+ headline (?:beat lifts market|miss softens) sentiment|Gold dips on firmer currency sentiment|Gold supported on macroeconomic caution|Equities supported by economic beat|Equities soften on economic miss|Crypto sentiment supported by macro data|Crypto softens on cautious sentiment|Industrial commodity demand outlook|Commodities soften on slower demand)$/i;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && marketMatch(arr[i].market, targetSymbol) && !generic.test(String(arr[i].reason || ''))) return arr[i];
    }
    return null;
  }
  var _relCache = new WeakMap();
  function relevanceFor(ev, targetSymbol) {
    targetSymbol = targetSymbol || symbol;
    if (!ev || typeof ev !== 'object') return null;
    var rMap = _relCache.get(ev);
    var rSymKey = marketBase(targetSymbol);
    if (rMap && Object.prototype.hasOwnProperty.call(rMap, rSymKey)) return rMap[rSymKey];
    var computed = computeRelevanceFor(ev, targetSymbol);
    if (!rMap) { rMap = Object.create(null); _relCache.set(ev, rMap); }
    rMap[rSymKey] = computed;
    return computed;
  }
  function computeRelevanceFor(ev, targetSymbol) {
    targetSymbol = targetSymbol || symbol;
    if ((ev.sources || [ev.source]).indexOf('binance') >= 0) {
      // A coin listing is specific to that asset. USD quotation alone does not
      // make every Binance announcement relevant to Gold or every crypto pair.
      var targets = [ev.market,ev.symbol].concat(Array.isArray(ev.markets) ? ev.markets : []);
      var selected = marketBase(targetSymbol), asset = selected.replace(/(?:USDT|USDC|USD)$/,'');
      var fiatOrMetal = /^(XAU|XAG|XPT|XPD)/.test(selected) || /^(USD|EUR|GBP|AUD|NZD|CAD|CHF|JPY|CNH|CNY|SGD|HKD|ZAR|MXN|NOK|SEK|DKK|TRY|BRL|PLN|CZK|HUF|INR|KRW|RUB|SAR|CLP){2}$/.test(selected);
      if (targets.some(function(m) {
        var target = marketBase(m);
        return marketMatch(m,targetSymbol) || (!fiatOrMetal && /(?:USDT|USDC)$/.test(target) && target.replace(/(?:USDT|USDC)$/,'') === asset);
      })) return 'Official Binance notice for ' + targetSymbol;
      var selectedCrypto = !fiatOrMetal && /(?:USD|USDT|USDC)$/.test(selected);
      if (ev.market_scope === 'exchange' && selectedCrypto) return 'Potential Binance exchange-wide crypto spillover';
      return null;
    }
    var selectedMetal = /^XAU|^XAG/.test(marketBase(targetSymbol));
    var text = String((ev.title || ev.event || '') + ' ' + (ev.description || '')).toLowerCase();
    var policy = /\b(fed|fomc|federal reserve|ecb|boe|boj|bank of england|bank of japan|mpc|buba|boc|bank of canada|rba|rbnz|reserve bank|snb|swiss national bank|pboc|people'?s bank of china)\b/.test(text);
    if (selectedMetal && ev.kind === 'headline') {
      var metalNames = /^XAU/.test(marketBase(targetSymbol)) ? /\b(gold|bullion|xauusd)\b/ : /\b(silver|xagusd)\b/;
      if (metalNames.test(text)) return 'Direct precious-metal news';
      if (policy || /\b(us dollar|dollar index|dxy|greenback|treasury yields?|real yields?|us inflation|u\.s\. inflation|cpi|pce|ppi|nonfarm|payroll|us jobs|u\.s\. jobs|government shutdown)\b/.test(text)) return 'Potential USD / yield effect on precious metals';
      if (/\b(geopolitical|safe.haven|war|ceasefire)\b/.test(text)) return 'Potential safe-haven effect';
      return null;
    }
    var direct = [ev.market, ev.symbol].concat(Array.isArray(ev.markets) ? ev.markets : []);
    if (direct.some(function(m) { return marketMatch(m, targetSymbol); })) return 'Direct market news';
    var key = marketBase(targetSymbol), title = String(ev.title || ev.event || '').toLowerCase();
    var currency = String(ev.currency || ev.country || '').toUpperCase();
    var crypto = /(?:USD|USDT)$/.test(key) && /^(BTC|ETH|SOL|XRP|LTC|BCH|ADA|DOGE|BNB|LINK|DOT|AVAX)/.test(key);
    var oil = /^(USOIL|UKOIL|XNGUSD)$/.test(key);
    var metal = /^(XAU|XAG|XPT|XPD)/.test(key);
    if (metal && /^(EUR|GBP|JPY|CHF|AUD|CAD|NZD|CNY|CNH)$/.test(currency) && policy && /\b(speaks?|speech|rate|monetary|policy|testimony|decision)\b/.test(text)) return 'Potential ' + currency + ' policy spillover through USD / yields';
    if (metal && /^(EUR|GBP|JPY|CHF|AUD|CAD|NZD|CNY|CNH)$/.test(currency) &&
        /^(high|medium)$/.test(ev.impact) && /\b(gdp|inflation|consumer price|producer price|cpi|ppi|pmi|employment|unemployment)\b/.test(text)) {
      return 'Potential ' + currency + ' macro spillover through currency, yields or metal demand';
    }
    // Asset-specific releases do not become relevant to every USD instrument
    // merely because the calendar attaches USD to them.
    if (/\b(bitcoin|ethereum|crypto|blockchain)\b/.test(title) && !crypto) return null;
    if (/\b(crude oil|natural gas|oil stocks|oil inventories|oil rig|gas rig|baker hughes|opec)\b/.test(title) && !oil) return null;
    if (impactFor(ev, targetSymbol)) return 'Mapped effect on ' + targetSymbol;
    var exposures = [];
    if (/^(EUR|GBP|USD|AUD|NZD|CAD|CHF|JPY|CNH|CNY|CLP|XOF|SGD|HKD|ZAR|MXN|NOK|SEK|DKK|TRY|BRL|PLN|CZK|HUF|INR|KRW|RUB|SAR|COP){2}$/.test(key)) exposures = [key.slice(0, 3), key.slice(3)];
    else if (metal) exposures = [key.slice(0, 3), key.slice(-3), 'USD'];
    else if (crypto) exposures = ['USD', 'BTC', 'CRYPTO'];
    else if (oil) exposures = ['USD', 'OIL'];
    else if (/^(USTEC|US500|US30|DXY)$/.test(key)) exposures = ['USD', 'TECH'];
    else if (key === 'DE30') exposures = ['EUR'];
    else if (key === 'FR40') exposures = ['EUR'];
    else if (key === 'AUS200') exposures = ['AUD'];
    else if (/^[A-Z]{2,5}$/.test(key)) exposures = ['USD', 'TECH'];
    if (exposures.indexOf(currency) >= 0) return currency + ' exposure of ' + targetSymbol;
    if (metal && /^XAU/.test(key) && /\b(gold|bullion|xauusd)\b/.test(title)) return 'Gold market news';
    if (metal && /^XAG/.test(key) && /\b(silver|xagusd)\b/.test(title)) return 'Silver market news';
    if (crypto && /\b(bitcoin|ethereum|crypto|blockchain)\b/.test(title)) return 'Crypto market news';
    return null;
  }
  function normSide(v) {
    v = String(v || '').toUpperCase();
    return /BUY|UP|BULL/.test(v) ? 'BUY' : /SELL|DOWN|BEAR/.test(v) ? 'SELL' : 'WAIT';
  }
  function eventKey(ev) {
    var title = String(ev.title || ev.event || '').trim().toLowerCase();
    // Provider titles differ for the same named speech. Keep separate CPI / jobs
    // releases, but combine verified same-time, same-currency central-bank speeches.
    var speech = title.replace(/([a-z])speech\b/g, '$1 speech').match(/^(?:fomc member|fed|mpc member|boe) (.+?) (?:speaks|speech)$/);
    if (ev.kind !== 'headline' && speech) title = 'policy speech ' + speech[1];
    return [ev.ts, ev.currency || ev.country || '', title].join('|');
  }
  function impactWindow(ev) {
    return window.DashboardPanels.impactSeconds(ev);
  }
  function phaseFor(ev, now) {
    // Headlines use a recency window; publication is not an impact-start claim.
    return window.DashboardPanels.newsPhase(ev, now);
  }
  function recentHeadline(ev, now) {
    // Recency is a monitoring filter, not a claimed impact-start timestamp.
    return ev.kind === 'headline' && phaseFor(ev, now) === 'context' && now - Number(ev.ts) < impactWindow(ev);
  }
  function headlineMonitorEnd(ev) {
    var expires = window.DashboardPanels.newsExpires(ev), impEnd = Number(ev.ts) + impactWindow(ev); return (Date.now() / 1000 >= impEnd && expires > impEnd) ? expires : Math.min(impEnd, expires);
  }
  function restoreNews() {
    try {
      var saved = JSON.parse(localStorage.getItem(NEWS_CACHE_KEY + marketBase(symbol)) || 'null');
      if (!saved || saved.symbol !== symbol || !Array.isArray(saved.events) ||
          !saved.at || Date.now() - saved.at > 86400000 || saved.at > Date.now() + 5000) return;
      mergeNews(saved.events); sourceStatus = saved.sources || []; scanState = 'cached';
    } catch(e) {}
  }
  function saveNews(payload) {
    try { localStorage.setItem(NEWS_CACHE_KEY + marketBase(symbol), JSON.stringify({symbol:symbol,at:Date.now(),events:payload.events,sources:payload.sources || []})); } catch(e) {}
  }
  function predictionFor(ev, imp) {
    if (imp) return imp;
    var p = ev.predicted_move;
    return p && marketMatch(p.market, symbol) ? p : null;
  }
  var NEWS_LOCK_KEY = 'softradex.news.bias.v2';
  function getLiveM5Bars() {
    try {
      var st = window.SwingAI && typeof window.SwingAI.structure === 'function' ? window.SwingAI.structure() : null;
      if (st && st.symbol && !marketMatch(st.symbol, symbol)) return [];
      var m5 = st && st.frames && Array.isArray(st.frames.M5) ? st.frames.M5 : [];
      return m5.length ? m5.slice(-64) : [];
    } catch (e) {
      return [];
    }
  }
  var dirEstCache = Object.create(null);
  var dirEstBucket = 0;
  function directionalEstimate(ev, now, resolveRunning) {
    if (!window.NewsDirection) return null;
    if (!locksRestored) {
      locksRestored = true;
      try { lockedDirections = JSON.parse(localStorage.getItem(NEWS_LOCK_KEY) || '{}'); } catch(e) {}
      if (!lockedDirections || typeof lockedDirections !== 'object') lockedDirections = Object.create(null);
    }
    var runMode = !!resolveRunning;
    var key = marketBase(symbol) + '|' + eventKey(ev), phase = phaseFor(ev, now);
    var lockKey = key + (runMode ? '|run' : '');
    var evActualStr = ev.actual != null ? String(ev.actual).trim() : '';
    var m5Bars = getLiveM5Bars(), qLive = liveQuote();
    var locked = lockedDirections[lockKey];
    if (phase === 'running' && locked && locked.expires > now) {
      var evHasActual = evActualStr !== '';
      var lockedStaleActual = evHasActual && (!locked.hasActual || String(locked.actualVal || '') !== evActualStr);
      var rx = m5Bars.length ? computePostEventReaction(m5Bars, Number(ev.ts) || now, now, qLive ? Number(qLive.price) : undefined) : null;
      var lockedReversed = !!(rx && rx.ready && !locked.hasActual && (
        (locked.side === 'SELL' && rx.evMoveAtr >= 0.72) ||
        (locked.side === 'BUY' && rx.evMoveAtr <= -0.72)
      ));
      var lockedInvalid = locked.side === 'WAIT' || !!locked.conflict;
      if (!lockedStaleActual && !lockedReversed && !lockedInvalid) return locked;
      delete lockedDirections[lockKey];
    }
    var wEst = !runMode ? workerEstimates[key] : null;
    if (wEst && now - (wEst.at / 1000) <= 12 && wEst._phase === phase && wEst._actual === evActualStr) return wEst;
    var bucketNow = Math.floor(now / 15);
    if (dirEstBucket !== bucketNow) { dirEstCache = Object.create(null); dirEstBucket = bucketNow; }
    var swState = window.SwingAI && window.SwingAI.state ? window.SwingAI.state() : null;
    var qB = qLive ? Math.round(Number(qLive.price) / (Number(qLive.price) * 0.0005 || 1)) : 0;
    var swSig = swState && swState.fresh ? (swState.verdict || '') + ':' + Math.round((Number(swState.score) || 0) * 10) : '';
    var dCacheKey = lockKey + '|' + phase + '|' + newsMergeGen + '|' + qB + '|' + swSig + '|' + evActualStr + '|' + m5Bars.length + '|' + dxyBarsM5.length;
    if (Object.prototype.hasOwnProperty.call(dirEstCache, dCacheKey)) return dirEstCache[dCacheKey];
    var imp = impactFor(ev);
    var estimate = window.NewsDirection.estimate({
      symbol: symbol, event: ev, impact: imp, prediction: predictionFor(ev, imp),
      quote: qLive, market: swState, now: now, headlines: getRelevantHeadlines(now),
      headlinesPreSorted: true, barsM5: m5Bars,
      dxyBarsM5: dxyBarsM5.length >= 4 ? dxyBarsM5 : undefined,
      resolveRunning: runMode
    });
    // Lock only verified actual surprises (strength >= 58) or confirmed 5m+ post-event breakouts (no conflict)
    var canLock = phase === 'running' && estimate && estimate.side !== 'WAIT' && !estimate.conflict &&
      Number(estimate.strength || 0) >= 58 &&
      (estimate.hasActual || (now >= Number(ev.ts) + 300 && Math.abs(Number(estimate.reactionAtr) || 0) >= 0.55));
    if (canLock) {
      estimate.locked = true;
      estimate.actualVal = evActualStr;
      estimate.expires = Number(ev.ts) + impactWindow(ev);
      lockedDirections[lockKey] = estimate;
      Object.keys(lockedDirections).forEach(function(k) { if (lockedDirections[k].expires <= now) delete lockedDirections[k]; });
      try { localStorage.setItem(NEWS_LOCK_KEY, JSON.stringify(lockedDirections)); } catch(e) {}
    }
    dirEstCache[dCacheKey] = estimate;
    return estimate;
  }
  function moveAmount(prediction) {
    if (!prediction) return 0;
    return Math.abs(Number(prediction.move_abs != null ? prediction.move_abs : prediction.move_dollar) || 0);
  }
  function moveText(value) {
    var n = Number(value) || 0, key = marketKey(symbol).replace(/M$/, '');
    if (!n) return '—';
    if (/^(EUR|GBP|USD|AUD|CAD|CHF|NZD|JPY)[A-Z]{3}$/.test(key)) {
      return (n * (/JPY$/.test(key) ? 100 : 10000)).toFixed(1) + ' pips';
    }
    var digits = n >= 1 ? 2 : 5;
    return '$' + n.toLocaleString('en-US', { maximumFractionDigits: digits });
  }
  function priceText(n) {
    return n > 0 ? n.toLocaleString('en-US', { minimumFractionDigits: n < 10 ? 5 : 2, maximumFractionDigits: n < 10 ? 5 : 2 }) : '—';
  }
  function liveQuote() {
    var q = window.SOFT_TV_QUOTE;
    return q && q.symbol === symbol && Number(q.price) > 0 && q.at > 0 &&
      Date.now() - q.at <= 15000 && q.at <= Date.now() + 5000 ? q : null;
  }
  function mergeNews(incoming) {
    newsSnapshotReady = true;
    newsMergeGen++;
    cachedHeadlinesKey = '';
    var now = Date.now() / 1000, byKey = Object.create(null);
    // A release can vanish from an upcoming-only response at its start. Keep
    // it only while its own impact window runs; never retain COMPLETE rows.
    news.forEach(function (ev) {
      if (phaseFor(ev, now) === 'running' || phaseFor(ev, now) === 'context') byKey[eventKey(ev)] = ev;
    });
    incoming.forEach(function (ev) {
      if (ev && Number(ev.ts) > 0 && phaseFor(ev, now) !== 'expired') {
        var key = eventKey(ev), old = byKey[key];
        byKey[key] = old ? Object.assign({}, old, ev, {
          sources: Array.from(new Set((old.sources || [old.source]).concat(ev.sources || [ev.source]).filter(Boolean))),
          impact:IMPACT_WINDOW[old.impact] > IMPACT_WINDOW[ev.impact] ? old.impact : ev.impact,
          impact_window_sec: Math.max(impactWindow(old), impactWindow(ev))
        }) : ev;
      }
    });
    news = Object.keys(byKey).map(function (key) { return byKey[key]; });
  }
  function visibleEvents(now) {
    var end = now + 24 * 3600;
    return news.filter(function (ev) {
      return Number(ev.ts) > 0 && Number(ev.ts) <= end && phaseFor(ev, now) !== 'expired' && !!relevanceFor(ev);
    }).sort(function (a, b) {
      var ar = phaseFor(a, now) === 'running', br = phaseFor(b, now) === 'running';
      if (ar !== br) return ar ? -1 : 1;
      var ac = phaseFor(a,now) === 'context', bc = phaseFor(b,now) === 'context';
      if (ac !== bc) return ac ? 1 : -1;
      return (ar || ac ? Number(b.ts) - Number(a.ts) : Number(a.ts) - Number(b.ts)) || eventKey(a).localeCompare(eventKey(b));
    });
  }
  function entryTiming(ev, now) {
    var start = Number(ev.ts), impact = ev.impact;
    var lead = impact === 'high' ? 900 : impact === 'medium' ? 600 : 300;
    var settle = impact === 'high' ? 300 : impact === 'medium' ? 180 : 60;
    if (now < start - lead) return 'EST. PRE-NEWS RISK IN ' + hms(start - lead - now);
    if (now < start) return 'VOLATILITY RISK · RELEASE IN ' + hms(start - now);
    if (now < start + settle) return 'EST. CONFIRMATION WAIT ' + hms(start + settle - now);
    return 'DIRECTION BIAS SET · ENTRY REQUIRES RETRACE CONFIRMATION';
  }
  function levelPlan(ev, prediction, side, now) {
    var q = liveQuote(), key = eventKey(ev), move = moveAmount(prediction);
    if (!q || !move) return null;
    if (phaseFor(ev, now) === 'running' && !eventReferences[key]) {
      eventReferences[key] = { price: Number(q.price), at: q.at };
    }
    var reference = eventReferences[key] || { price: Number(q.price), at: q.at };
    var base = reference.price;
    var state = window.SwingAI && window.SwingAI.state ? window.SwingAI.state() : null;
    var atr = state && state.symbol === symbol && state.fresh && state.reads.M5 ? Number(state.reads.M5.atr) || 0 : 0;
    var buffer = Math.max(move * 0.25, Math.min(move * 0.5, atr * 0.5));
    var sell = side === 'SELL', buy = side === 'BUY';
    var entry = sell ? base + buffer : buy ? base - buffer : 0;
    return { reference: base, referenceAt: reference.at, move: move,
      entryLow: Math.max(0, entry - buffer * 0.15), entryHigh: entry + buffer * 0.15,
      target: sell ? Math.max(0, base - move) : buy ? base + move : 0,
      down: Math.max(0, base - move), up: base + move,
      invalidation: sell ? entry + buffer : buy ? Math.max(0, entry - buffer) : 0 };
  }
  function levelsHtml(levels, side, running) {
    if (!levels) return '<div class="mnt-plan-empty">Price levels wait for a fresh TradingView quote and a market-specific move estimate.</div>';
    function cell(label, value) { return '<div><small>' + label + '</small><b>' + esc(value) + '</b></div>'; }
    var html = cell('REFERENCE', priceText(levels.reference));
    if (side === 'WAIT') {
      html += cell('DOWN SCENARIO', priceText(levels.down)) + cell('UP SCENARIO', priceText(levels.up)) +
        cell('EST. RANGE', '±' + moveText(levels.move));
    } else {
      html += cell(running ? (side === 'SELL' ? 'UP-SPIKE SELL ZONE' : 'DOWN-SPIKE BUY ZONE') : 'PRE-NEWS WATCH / HOLD ZONE', priceText(levels.entryLow) + ' – ' + priceText(levels.entryHigh)) +
        cell('EXIT TARGET · ' + (side === 'SELL' ? 'DOWN' : 'UP'), priceText(levels.target)) +
        cell(side === 'SELL' ? 'EST. DROP FROM REF' : 'EST. RISE FROM REF', moveText(levels.move)) +
        cell('INVALIDATION', priceText(levels.invalidation));
    }
    return '<div class="mnt-plan">' + html + '</div><div class="mnt-reference-note">' +
      'TV reference at ' + esc(new Date(levels.referenceAt).toLocaleTimeString()) +
      ' · conditional levels; retrace and target may not occur</div>';
  }
  function eventTime(ts) {
    return new Date(Number(ts) * 1000).toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  function eventTimezone(ts) {
    // The event's offset can differ from today's offset across a DST change.
    var offset = -new Date(Number(ts) * 1000).getTimezoneOffset();
    var hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
    var minutes = String(Math.abs(offset) % 60).padStart(2, '0');
    var zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time';
    return zone + ' (UTC' + (offset >= 0 ? '+' : '-') + hours + ':' + minutes + ')';
  }
  function hms(secs) {
    var s = Math.max(0, Math.ceil(Number(secs) || 0));
    return String(Math.floor(s / 3600)).padStart(2, '0') + ':' + String(Math.floor((s % 3600) / 60)).padStart(2, '0') +
      ':' + String(s % 60).padStart(2, '0');
  }
  function timerText(ts, impact, windowSec, compact) {
    var now = Date.now() / 1000;
    var start = Number(ts) || 0;
    var win = Number(windowSec) || IMPACT_WINDOW[impact] || IMPACT_WINDOW.low;
    if (now < start) return (compact ? '' : 'IMPACT IN ') + hms(start - now);
    if (now < start + win) return (compact ? '' : 'IMPACT LEFT ') + hms(start + win - now);
    return 'COMPLETE';
  }
  function updateMntTimers() {
    if (document.hidden) return;
    var now = Date.now() / 1000;
    updateWindow(now);
    var rows = document.querySelectorAll('.mnt-row');
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      var rowEv = { ts: Number(row.dataset.ts), kind: row.dataset.kind, impact_window_sec: Number(row.dataset.window),
        headline_window_sec: Number(row.dataset.headlineWindow) };
      if (phaseFor(rowEv, now) !== row.dataset.phase) { renderNews(); return; }
      if (rowEv.kind === 'headline' && row.parentElement && row.parentElement.id === 'running-news-list' && row.dataset.monitoringFallback !== 'true' && !recentHeadline(rowEv, now)) { renderNews(); return; }
    }
    var nodes = document.querySelectorAll('.mnt-timer');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var compact = el.dataset.compact === 'true';
      var monitoring = el.dataset.monitoring === 'true';
      var txt = monitoring ? hms((Number(el.dataset.monitoringExpires) || Number(el.dataset.ts) + Number(el.dataset.window)) - now)
        : timerText(Number(el.dataset.ts), el.dataset.impact, Number(el.dataset.window), compact);
      if (el.textContent !== txt) el.textContent = txt;
      var shouldLive = (monitoring || el.dataset.phase === 'running') && txt !== 'COMPLETE';
      if (el.classList.contains('live') !== shouldLive) el.classList.toggle('live', shouldLive);
    }
    var entryNodes = document.querySelectorAll('.mnt-entry-timer');
    for (var j = 0; j < entryNodes.length; j++) {
      var node = entryNodes[j];
      var entryTxt = entryTiming({ ts: Number(node.dataset.ts), impact: node.dataset.impact }, now);
      if (node.textContent !== entryTxt) node.textContent = entryTxt;
    }
  }
  var lastListRenderSig = Object.create(null);
  function renderNewsList(id, rows, now) {
    var list = $(id);
    if (!list) return;
    var isRunningPanel = id === 'running-news-list';
    var qL = liveQuote();
    var qSig = qL ? Math.round(Number(qL.price) / (Number(qL.price) * 0.0005 || 1)) : 0;
    var swL = window.SwingAI && window.SwingAI.state ? window.SwingAI.state() : null;
    var swLSig = swL && swL.fresh ? (swL.verdict || '') + ':' + Math.round((Number(swL.score) || 0) * 10) : '';
    var sigParts = [symbol, newsMergeGen, workerBatchGen, qSig, swLSig, getLiveM5Bars().length, dxyBarsM5.length, Math.floor(now / 15), rows.length];
    for (var si = 0; si < rows.length; si++) {
      var r0 = rows[si];
      sigParts.push(r0.ts, phaseFor(r0, now), r0.actual || '', r0.impact || '', r0.kind || '');
    }
    var listSig = sigParts.join('|');
    if (lastListRenderSig[id] === listSig) return;
    lastListRenderSig[id] = listSig;
    var opened = Object.create(null);
    if (list.querySelectorAll) Array.prototype.forEach.call(list.querySelectorAll('details[open]'), function(el) { opened[el.dataset.key] = true; });
    var contextStarted = false;
    var html = rows.length ? rows.map(function(ev) {
      var prediction = directionalEstimate(ev, now, isRunningPanel);
      var impact = String(ev.impact || 'low').toLowerCase();
      if (['low','medium','high'].indexOf(impact) < 0) impact = 'low';
      var side = prediction ? prediction.side : 'DATA';
      var signed = side === 'BUY' ? '+' : side === 'SELL' ? '−' : '±';
      var win = impactWindow(ev), phase = phaseFor(ev, now);
      var attrs = ' data-ts="' + esc(ev.ts) + '" data-impact="' + impact + '" data-window="' + win + '" data-headline-window="' + (Number(ev.headline_window_sec) || 0) + '" data-phase="' + phase + '"';
      var timed = ev.kind !== 'headline';
      var monitoring = !timed && id === 'running-news-list';
      var timer = timed ? timerText(ev.ts, impact, win, true) : 'UNSCHEDULED';
      var clockLabel = monitoring ? 'WATCH LEFT' : phase === 'running' ? 'IMPACT LEFT' : timed ? 'IMPACT IN' : 'IMPACT TIME';
      var dateLabel = phase === 'running' ? 'Impact window started' : 'Scheduled impact window start';
      var scheduled = timed ? eventTime(ev.ts) + ' · ' + eventTimezone(ev.ts) : 'No scheduled release time; market impact timing is unconfirmed.';
      var clockHtml = '<span class="mnt-clock ' + phase + '"><small>' + clockLabel + '</small>' +
        (monitoring ? '<span class="mnt-timer live"' + attrs + ' data-monitoring="true" data-monitoring-expires="' + headlineMonitorEnd(ev) + '">' + hms(headlineMonitorEnd(ev) - now) + '</span>' : timed ? '<span class="mnt-timer' + (phase === 'running' ? ' live' : '') + '"' + attrs + ' data-compact="true">' + esc(timer) + '</span>' : '<span class="mnt-time-unknown">UNSCHEDULED</span>') + '</span>';
      var startHtml = timed ? '<time class="mnt-start" datetime="' + esc(new Date(Number(ev.ts) * 1000).toISOString()) + '" title="' + esc(dateLabel + ': ' + scheduled) + '">' + esc(eventTime(ev.ts)) + '</time>' : '';
      var reason = prediction ? prediction.reason : 'Directional data unavailable; a fresh market quote is needed.';
      var actual = ev.actual != null && ev.actual !== '' ? ' · actual ' + ev.actual : '';
      if (ev.forecast != null && ev.forecast !== '') actual += ' · forecast ' + ev.forecast;
      var levels = levelPlan(ev, prediction, side, now);
      var key = eventKey(ev), title = ev.title || ev.event || 'Economic event';
      var heading = '';
      if (phase === 'context' && !contextStarted) { contextStarted = true; heading = '<div class="mnt-context-heading">' + (monitoring ? 'RECENT HEADLINES · MONITORING' : 'HEADLINES · LAST 24H · IMPACT UNCONFIRMED') + '</div>'; }
      var related = prediction && prediction.related.length ? '<p class="mnt-reason">Related research: ' + prediction.related.map(function(h) { return esc(h.source + ': ' + h.title); }).join(' · ') + '</p>' : '';
      var providers = ev.sources || [ev.source || 'calendar'];
      var sourceNames = providers.map(function(p) { return SOURCE_NAMES[p] || p; }).join(' + ');
      var sourceNote = providers.map(function(p) { var status=sourceStatus.find(function(s) {return s.name===p;});
        if (!status) return '';
        var part=status.parts && status.parts[ev.kind || 'calendar'];
        return (SOURCE_NAMES[p] || p) + ': ' + (part ? part.state : status.state) + (part && part.error ? ' · ' + part.error : '');
      }).filter(Boolean).join(' · ');
      var url = /^https?:\/\//i.test(ev.url || '') ? '<a href="' + esc(ev.url) + '" target="_blank" rel="noopener noreferrer">Read source ↗</a>' : '';
      return heading + '<details class="mnt-row ' + impact + ' ' + phase + '"' + attrs + ' data-kind="' + esc(ev.kind || 'calendar') + '"' + (monitoring && !recentHeadline(ev, now) ? ' data-monitoring-fallback="true"' : '') + ' data-key="' + esc(key) + '"' + (opened[key] ? ' open' : '') + '>' +
        '<summary class="mnt-summary" title="' + esc(title + ' · ' + (timed ? dateLabel + ': ' : '') + scheduled) + '">' +
        clockHtml + '<span class="mnt-event-info"><b class="mnt-name">' + esc(title) + '</b>' + startHtml + '<small class="mnt-row-sources">' + esc(sourceNames) + '</small></span>' +
        '<span class="mnt-summary-side ' + side.toLowerCase() + '" title="' + (prediction ? 'Estimated ' + side + ' bias · ' + prediction.strength + '% model strength' : 'Data unavailable') + '">' + (side === 'BUY' ? 'BUY ↑' : side === 'SELL' ? 'SELL ↓' : side === 'WAIT' ? 'WAIT ◇' : 'DATA') + '</span>' +
        '<strong class="mnt-summary-move ' + side.toLowerCase() + '">' + signed + moveText(moveAmount(prediction)) + '</strong><i class="mnt-chevron">›</i></summary>' +
        '<div class="mnt-details"><b class="mnt-full-title">' + esc(title) + '</b>' +
        '<div class="mnt-start-info"><b>' + (timed ? dateLabel.toUpperCase() : 'IMPACT TIMING') + ':</b> ' + esc(scheduled) + '</div>' +
        (timed ? '<p class="mnt-reason">Impact countdown uses the scheduled release time. The market reaction can be delayed or absent.</p>' : '') +
        '<div class="mnt-source">' + esc((ev.currency || ev.country || '') + ' · ' + sourceNames) + ' ' + url + '</div>' +
        '<div class="mnt-source">' + esc(sourceNote) + '</div>' +
        (ev.schedule_context ? '<p class="mnt-reason">Official event schedule: ' + esc(ev.schedule_context) + '</p>' : '') +
        (phase === 'context' ? '<p class="mnt-reason">Recent relevant headline for reading. Its current price impact is unconfirmed; publication is not an impact-start time.</p>' : '') +
        '<div class="mnt-bias-note">' + (prediction ? esc(prediction.basis + ' · ' + prediction.strength + '% MODEL STRENGTH' + (prediction.locked ? ' · LOCKED ' + new Date(prediction.at).toLocaleTimeString() : '')) : 'MODEL DATA UNAVAILABLE') + ' · estimates, not a fixed future outcome</div>' +
        '<div class="mnt-status"><b>' + (monitoring ? 'HEADLINE · MONITORING' : phase === 'running' ? '● RUNNING' : phase === 'context' ? 'HEADLINE CONTEXT' : 'UPCOMING') + ' · ' + impact.toUpperCase() + '</b>' +
        (timed ? '<span class="mnt-timer' + (phase === 'running' ? ' live' : '') + '"' + attrs + '>' + esc(timerText(ev.ts, impact, win)) + '</span><small>est. impact ' + Math.round(win / 60) + ' min</small>' : '<small>' + (monitoring ? 'Monitoring ' + Math.round((headlineMonitorEnd(ev) - Number(ev.ts)) / 60) + ' min from publication · impact unconfirmed' : 'Unscheduled headline · impact time unknown') + '</small>') + '</div>' +
        (phase === 'context' ? '' : '<div class="mnt-entry-timer" data-ts="' + esc(ev.ts) + '" data-impact="' + impact + '">' + esc(entryTiming(ev, now)) + '</div>' + levelsHtml(levels, side, phase === 'running')) +
        (ev.description ? '<p class="mnt-reason">Source context: ' + esc(ev.description) + '</p>' : '') + related +
        '<p class="mnt-reason">' + esc(reason + actual) + '</p>' +
        '<p class="mnt-reason">' + esc(relevanceFor(ev)) + ' · Watch levels are conditional: wait for price confirmation; the first news spike can reverse.</p></div>' +
      '</details>';
    }).join('') : '<div class="mnt-empty">' + (id === 'running-news-list' ? 'No running release or recent headline to monitor for ' : 'No relevant upcoming release or recent headline for ') + esc(symbol || 'this market') + '.</div>';
    if (html !== lastNewsHtml[id]) {
      var hadPrev = Boolean(lastNewsHtml[id]);
      var scroll = hadPrev ? list.scrollTop : 0;
      list.innerHTML = html;
      if (hadPrev && scroll > 0) list.scrollTop = scroll;
      lastNewsHtml[id] = html;
    }
  }
  function renderNews(force) {
    if (document.hidden && force !== true) return;
    var now = Date.now() / 1000;
    news = news.filter(function(ev) { return phaseFor(ev, now) !== 'expired'; });
    var keys = news.map(eventKey);
    Object.keys(eventReferences).forEach(function(key) { if (keys.indexOf(key) < 0) delete eventReferences[key]; });
    var rows = visibleEvents(now);
    var active = rows.filter(function(ev) { return phaseFor(ev, now) === 'running'; });
    var workerApi = window.SoftCalcWorker;
    if (workerApi && typeof workerApi.estimateNews === 'function' && workerApi.available && workerApi.available() && rows.length > 12) {
      var qLive = liveQuote(), sLive = window.SwingAI && window.SwingAI.state ? window.SwingAI.state() : null;
      var qBucket = qLive ? Math.round(qLive.price / (qLive.price * 0.0005 || 1)) : 0;
      var sSig = sLive && sLive.fresh ? (sLive.verdict || '') + ':' + Math.round((Number(sLive.score) || 0) * 10) : '';
      var phaseSig = active.map(function(e) { return eventKey(e) + ':' + String(e.actual || ''); }).join(';');
      var wKey = symbol + '|' + newsMergeGen + '|' + qBucket + '|' + sSig + '|' + dxyBarsM5.length + '|' + phaseSig;
      if (wKey !== lastWorkerKey) {
        lastWorkerKey = wKey;
        var reqGen = ++workerBatchGen;
        var reqSym = symbol;
        var reqPhaseByKey = Object.create(null);
        var reqActualByKey = Object.create(null);
        var reqItems = rows.map(function(ev) {
          var imp = impactFor(ev);
          var k = marketBase(reqSym) + '|' + eventKey(ev);
          reqPhaseByKey[k] = phaseFor(ev, now);
          reqActualByKey[k] = ev.actual != null ? String(ev.actual).trim() : '';
          return { key: k, event: ev, impact: imp, prediction: predictionFor(ev, imp) };
        });
        workerApi.estimateNews({
          symbol: reqSym,
          now: now,
          quote: qLive,
          market: sLive,
          headlines: getRelevantHeadlines(now),
          barsM5: getLiveM5Bars(),
          dxyBarsM5: dxyBarsM5.length >= 4 ? dxyBarsM5 : undefined,
          items: reqItems
        }).then(function(res) {
          if (reqGen !== workerBatchGen || reqSym !== symbol || !res || !res.estimates) return;
          var nextEst = res.estimates;
          Object.keys(nextEst).forEach(function(k) {
            if (nextEst[k]) {
              nextEst[k]._phase = reqPhaseByKey[k];
              nextEst[k]._actual = reqActualByKey[k];
            }
          });
          workerEstimates = nextEst;
        }).catch(function() {});
      }
    }
    var recent = rows.filter(function(ev) { return recentHeadline(ev, now); });
    var headlines = rows.filter(function(ev) { return phaseFor(ev, now) === 'context'; }).sort(function(a,b) { return Number(b.ts)-Number(a.ts); }); var monitoredHeadlines = recent.length ? recent : (!active.length ? headlines.slice(0, 6) : []);
    var running = active.concat(monitoredHeadlines).sort(function(a,b) { return Number(b.ts)-Number(a.ts); });
    var upcoming = rows.filter(function(ev) { return phaseFor(ev, now) === 'upcoming'; });
    setText('mnt-market', symbol || 'MARKET');
    setText('rnews-market', symbol || 'MARKET');
    setText('mnt-count', upcoming.length + ' EVENTS · ' + headlines.length + ' HEADLINES' + (scanState === 'idle' ? '' : ' · ' + scanState.toUpperCase()));
    setText('rnews-count', active.length + ' RELEASES · ' + monitoredHeadlines.length + ' HEADLINES');
    renderNewsList('mnt-list', upcoming.concat(headlines.slice(0, 40)), now);
    renderNewsList('running-news-list', running, now);
    updateAiWorldRobot(upcoming, headlines, now, running, false);
    updateFixed24hDirection(rows, now);
    if (window.RunningNewsAlerts) window.RunningNewsAlerts.observe({
      market: marketBase(symbol), label: symbol, now: now, ready: newsSnapshotReady,
      events: active.concat(recent).map(function(ev) {
        return {key: eventKey(ev), title: ev.title || ev.event, headline: ev.kind === 'headline',
          source: (ev.sources || [ev.source]).map(function(name) { return SOURCE_NAMES[name] || name; }).filter(Boolean).join(' · '),
          expiresAt: ev.kind === 'headline' ? headlineMonitorEnd(ev) : Number(ev.ts) + impactWindow(ev)};
      })
    });
    renderSources(rows);
  }
  function updateFixed24hDirection(rows, now) {
    var list = Array.isArray(rows) ? rows : [];
    var buyW = 0, sellW = 0, weakBuyW = 0, weakSellW = 0;
    var buyCount = 0, sellCount = 0, waitCount = 0;
    for (var i = 0; i < list.length; i++) {
      var ev = list[i];
      if (!ev) continue;
      var pred = directionalEstimate(ev, now);
      var imp = String(ev.impact || 'low').toLowerCase();
      var impW = imp === 'high' ? 3.0 : imp === 'medium' ? 1.8 : 0.85;
      var ph = phaseFor(ev, now);
      var dt = Number(ev.ts || now) - now;
      var phW = ph === 'running' && pred && pred.hasActual ? 3.2
        : ph === 'running' ? 2.2
        : ev.kind === 'headline' ? (Math.abs(dt) <= 7200 ? 1.7 : 0.85)
        : (dt <= 7200 ? 1.65 : dt <= 21600 ? 1.2 : 0.85);
      var strW = pred && Number(pred.strength) > 0 ? Number(pred.strength) / 100 : 0.45;
      var w = impW * phW * strW;
      if (pred && pred.side === 'BUY') {
        buyW += w; buyCount++;
      } else if (pred && pred.side === 'SELL') {
        sellW += w; sellCount++;
      } else {
        waitCount++;
        var sc = pred ? Number(pred.score) || 0 : 0;
        if (sc > 0.12) weakBuyW += sc * 0.3 * impW;
        else if (sc < -0.12) weakSellW += Math.abs(sc) * 0.3 * impW;
      }
    }

    var totalW = buyW + sellW;
    var buyPct = 50, sellPct = 50;
    if (totalW > 0) {
      buyPct = Math.round((buyW / totalW) * 100);
      sellPct = 100 - buyPct;
    } else if (weakBuyW + weakSellW > 0) {
      buyPct = Math.round((weakBuyW / (weakBuyW + weakSellW)) * 100);
      sellPct = 100 - buyPct;
    } else if (aiWorldState && (aiWorldState.dir === 'BUY' || aiWorldState.dir === 'SELL')) {
      buyPct = aiWorldState.dir === 'BUY' ? Math.max(55, Number(aiWorldState.pct) || 60) : (100 - Math.max(55, Number(aiWorldState.pct) || 60));
      sellPct = 100 - buyPct;
    } else {
      var sw = window.SwingAI && typeof window.SwingAI.state === 'function' ? window.SwingAI.state() : null;
      var sVal = sw && sw.fresh ? Number(sw.score) || 0 : 0;
      buyPct = sVal >= 0 ? 52 : 48;
      sellPct = 100 - buyPct;
    }

    // Never allow a 50/50 tie: break tie cleanly so BUY or SELL strictly wins by %
    if (buyPct === 50) {
      var tieDelta = (buyW - sellW) || (weakBuyW - weakSellW) || (aiWorldState.dir === 'BUY' ? 1 : aiWorldState.dir === 'SELL' ? -1 : 0);
      if (!tieDelta) {
        var sw2 = window.SwingAI && typeof window.SwingAI.state === 'function' ? window.SwingAI.state() : null;
        tieDelta = sw2 && sw2.fresh && Number(sw2.score) < 0 ? -1 : 1;
      }
      buyPct = tieDelta >= 0 ? 51 : 49;
      sellPct = 100 - buyPct;
    }

    var side = buyPct > sellPct ? 'BUY' : 'SELL';
    var winPct = side === 'BUY' ? buyPct : sellPct;
    fixed24hState = {
      market: symbol || 'MARKET',
      side: side,
      buyPct: buyPct,
      sellPct: sellPct,
      winPct: winPct,
      buyCount: buyCount,
      sellCount: sellCount,
      waitCount: waitCount
    };

    var term = $('market-news-terminal');
    var bar = $('mnt-fixed-bar');
    if (term && !bar) {
      bar = document.createElement('div');
      bar.id = 'mnt-fixed-bar';
      bar.className = 'mnt-fixed-bar buy';
      bar.innerHTML = '<div class="mnt-fixed-top"><span class="mnt-fixed-lbl">24H FIXED DIRECTION</span><strong class="mnt-fixed-side" id="mnt-fixed-side">SCANNING</strong><span class="mnt-fixed-pcts" id="mnt-fixed-pcts">BUY --% · SELL --%</span></div><div class="mnt-fixed-track"><i id="mnt-fixed-fill" style="width:50%"></i></div>';
      var head = term.querySelector('.mnt-head');
      if (head && head.nextSibling) term.insertBefore(bar, head.nextSibling);
      else term.insertBefore(bar, term.firstChild);
    }
    var sig = side + '|' + buyPct + '|' + sellPct + '|' + buyCount + '|' + sellCount;
    if (bar && sig !== lastFixedRenderSig) {
      lastFixedRenderSig = sig;
      bar.className = 'mnt-fixed-bar ' + side.toLowerCase();
      var sideEl = $('mnt-fixed-side');
      var pctsEl = $('mnt-fixed-pcts');
      var fillEl = $('mnt-fixed-fill');
      if (sideEl) sideEl.textContent = (side === 'BUY' ? '▲ BUY · ' : '▼ SELL · ') + winPct + '%';
      if (pctsEl) pctsEl.textContent = 'BUY ' + buyPct + '% (' + buyCount + ') · SELL ' + sellPct + '% (' + sellCount + ')';
      if (fillEl) fillEl.style.width = buyPct + '%';
      if (aiRobotOpen) renderAiRobotPopContent();
    }
  }

  var aiWorldState = {
    dir: 'WAIT', pct: 0, headlineCount: 0, next24Count: 0, webCount: 0,
    panelBuyCount: 0, panelSellCount: 0, panelDir: 'WAIT',
    webDir: 'WAIT', webState: 'SCANNING', webSources: [],
    dxyText: '', us10yText: '', pillars: [], releaseBadge: null,
    msg: 'Reading NEXT 24H news & checking global feeds...', items: [], market: 'MARKET'
  };
  var aiRobotOpen = false, aiRobotPinned = false, aiCloseTimer = null;
  var aiInternetCache = Object.create(null);
  var lastRobotInputs = { upcoming: [], headlines: [], running: [] };

  function clearAiCloseTimer() {
    if (aiCloseTimer) { clearTimeout(aiCloseTimer); aiCloseTimer = null; }
  }

  function inferWorldMacroSide(ev, sym) {
    var title = String((ev && (ev.title || ev.event)) || '');
    if (isMacroNoiseHeadline(title)) return { side: 'WAIT', strength: 0 };
    var txt = (title + ' ' + String((ev && ev.description) || '') + ' ' + String((ev && ev.predicted_move) || '')).trim();
    var mkt = String(canonicalNewsBase(sym || symbol || 'XAUUSD'));
    var cur = String((ev && (ev.currency || ev.country)) || (/^XAU/.test(mkt) ? 'XAU' : 'USD')).toUpperCase();
    var res = analyzeFinancialText(txt, mkt, cur);
    var score = res.score;
    if (!score && ev && ev.predicted_move) {
      if (/\b(buy|up|rise|bull|rally|surge|higher)\b/i.test(ev.predicted_move)) score = 1;
      else if (/\b(sell|down|drop|bear|fall|dip|lower)\b/i.test(ev.predicted_move)) score = -1;
    }
    if (score >= 0.4) return { side: 'BUY', strength: Math.min(86, Math.round(56 + score * 12)) };
    if (score <= -0.4) return { side: 'SELL', strength: Math.min(86, Math.round(56 + Math.abs(score) * 12)) };
    return { side: 'WAIT', strength: 0 };
  }

  function ageLabel(ts, nowSec) {
    var t = Number(ts) || 0;
    if (!t) return 'LIVE';
    var diff = Math.round(t - nowSec);
    if (diff > 60) {
      var mAhead = Math.round(diff / 60);
      return mAhead >= 60 ? 'in ' + Math.round(mAhead / 60) + 'h' : 'in ' + mAhead + 'm';
    }
    var ago = Math.max(1, Math.round((nowSec - t) / 60));
    if (ago < 60) return ago + 'm ago';
    if (ago < 1440) return Math.round(ago / 60) + 'h ago';
    return Math.round(ago / 1440) + 'd ago';
  }

  function collectNext24Topics(next24List) {
    var topics = [], seenT = Object.create(null);
    for (var i = 0; i < next24List.length && topics.length < 3; i++) {
      var ev = next24List[i];
      if (!ev || !ev.title) continue;
      var imp = String(ev.impact || '').toLowerCase();
      if (imp !== 'high' && imp !== 'medium' && i > 2) continue;
      var t = String(ev.title).trim().slice(0, 60);
      var k = t.toLowerCase();
      if (t && !seenT[k]) { seenT[k] = true; topics.push(t); }
    }
    return topics;
  }

  function ensureInternetResearch(next24List, force) {
    var sym = String(symbol || 'XAUUSDm').trim();
    if (!sym) return;
    var cache = aiInternetCache[sym];
    var nowMs = Date.now();
    var ttl = force ? 15000 : 45000;
    if (cache && (cache.busy || (!force && nowMs - cache.ts < ttl) || (force && cache.data && nowMs - cache.ts < 15000))) {
      return;
    }
    var prevData = cache ? cache.data : null;
    aiInternetCache[sym] = { ts: nowMs, busy: true, data: prevData, failed: false };
    var topics = collectNext24Topics(next24List || []);
    var qs = '/api/softradex-ai/research?symbol=' + encodeURIComponent(sym) +
      (topics.length ? '&topics=' + encodeURIComponent(topics.join('||')) : '') +
      (force ? '&force=1' : '');
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var abortTimer = controller ? setTimeout(function () { controller.abort(); }, 10000) : null;
    fetch(qs, { cache: 'no-store', signal: controller ? controller.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        if (!data || !data.ok) return;
        var cur = aiInternetCache[sym] || { ts: 0, busy: false, data: null };
        cur.ts = Date.now();
        cur.busy = false;
        cur.failed = false;
        cur.data = data;
        aiInternetCache[sym] = cur;
        if (sym === String(symbol || 'XAUUSDm').trim()) {
          updateAiWorldRobot(lastRobotInputs.upcoming, lastRobotInputs.headlines, Date.now() / 1000, lastRobotInputs.running, true);
        }
      })
      .catch(function () {
        if (aiInternetCache[sym]) {
          aiInternetCache[sym].busy = false;
          aiInternetCache[sym].failed = true;
          if (aiRobotOpen && sym === String(symbol || 'XAUUSDm').trim()) {
            updateAiWorldRobot(lastRobotInputs.upcoming, lastRobotInputs.headlines, Date.now() / 1000, lastRobotInputs.running, true);
          }
        }
      })
      .finally(function () { if (abortTimer) clearTimeout(abortTimer); });
  }

  function buildWorldNewsDigest(upcoming, headlines, now, running) {
    var pool = [];
    var seen = Object.create(null);
    var seenTitle = Object.create(null);
    var keptTitleTokens = [];
    function normTokens(str) {
      return String(str || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(function (w) { return w.length >= 4; });
    }
    function isDupTitle(raw) {
      var tk = String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (!tk || seenTitle[tk]) return true;
      var toks = normTokens(tk);
      for (var ti = 0; ti < keptTitleTokens.length; ti++) {
        var prev = keptTitleTokens[ti];
        if (!toks.length || !prev.length) continue;
        var hits = 0;
        for (var k = 0; k < toks.length; k++) if (prev.indexOf(toks[k]) >= 0) hits++;
        if (hits / Math.max(1, Math.min(toks.length, prev.length)) >= 0.65) return true;
      }
      seenTitle[tk] = true;
      keptTitleTokens.push(toks);
      return false;
    }

    var runningTimed = (Array.isArray(running) ? running : [])
      .filter(function (e) { return e && e.kind !== 'headline' && phaseFor(e, now) === 'running'; })
      .sort(function (a, b) { return (Number(b.ts) || 0) - (Number(a.ts) || 0); });
    var next24Raw = (Array.isArray(running) ? running : [])
      .concat(Array.isArray(upcoming) ? upcoming : [])
      .concat(Array.isArray(headlines) ? headlines : []);

    var calBuyScore = 0, calSellScore = 0, panelBuyCount = 0, panelSellCount = 0, next24Count = 0;
    var freshCalBuy = 0, freshCalSell = 0;
    var hasActiveActual = false, activeActualSide = 'WAIT', activeActualTitle = '', activeStopHunt = false;

    function recencyFactor(ev) {
      var ts = Number(ev.ts) || now;
      var age = now - ts;
      if (ev.kind !== 'headline' && phaseFor(ev, now) === 'running') {
        var hasAct = ev.actual != null && String(ev.actual).trim() !== '';
        return hasAct ? 3.2 : 2.1;
      }
      if (age < 0) {
        var ahead = Math.abs(age);
        if (ahead <= 1800) return 1.85;
        if (ahead <= 7200) return 1.15;
        if (ahead <= 18000) return 0.65;
        return 0.28; // distant events tomorrow shouldn't drown out live catalysts
      }
      if (age <= 2700) return 2.0;
      if (age <= 7200) return 1.3;
      if (age <= 21600) return 0.55;
      return 0.2;
    }

    function pushPanelItem(ev, fromNext24) {
      if (!ev) return;
      var k = eventKey(ev);
      var rawTitle = String(ev.title || ev.event || 'Market news');
      if (isMacroNoiseHeadline(rawTitle) || seen[k] || isDupTitle(rawTitle)) return;
      seen[k] = true;

      var pred = directionalEstimate(ev, now);
      var hasPanelDir = !!(pred && (pred.side === 'BUY' || pred.side === 'SELL'));
      var isWaitOrGuard = !!(pred && pred.side === 'WAIT');
      if (pred && pred.basis === 'STOP-HUNT GUARD' && ev.kind !== 'headline' && phaseFor(ev, now) === 'running') {
        activeStopHunt = true;
      }
      var predBasis = String((pred && pred.basis) || '');
      var isTrueActualSurprise = !!(pred && pred.hasActual && hasPanelDir && /RELEASE|ACTUAL/.test(predBasis));
      if (isTrueActualSurprise && phaseFor(ev, now) === 'running' && (String(ev.impact || '') === 'high' || String(ev.impact || '') === 'medium')) {
        hasActiveActual = true;
        activeActualSide = pred.side;
        activeActualTitle = rawTitle;
      }
      var inferred = hasPanelDir
        ? { side: pred.side, strength: Math.max(30, Number(pred.strength) || 64) }
        : (isWaitOrGuard ? { side: 'WAIT', strength: 0 } : inferWorldMacroSide(ev, symbol));

      var imp = String(ev.impact || 'low').toLowerCase();
      var impW = imp === 'high' ? 1.75 : imp === 'medium' ? 1.25 : 0.65;
      var kindW = ev.kind === 'headline' ? 1.05 : 1.35;
      var timeW = recencyFactor(ev);
      var strW = inferred.strength > 0 ? inferred.strength / 100 : 0.25;
      var actBoost = pred && pred.hasActual ? 1.45 : 1.0;
      var weight = impW * kindW * timeW * strW * actBoost;
      var srcNames = (ev.sources || [ev.source || 'calendar']).map(function (srcKey) { return SOURCE_NAMES[srcKey] || srcKey; }).filter(Boolean).join(' + ');

      if (fromNext24) {
        next24Count++;
        var isVeryRecent = Math.abs(now - (Number(ev.ts) || now)) <= 10800;
        if (inferred.side === 'BUY') {
          calBuyScore += weight; panelBuyCount++;
          if (isVeryRecent) freshCalBuy += weight;
        } else if (inferred.side === 'SELL') {
          calSellScore += weight; panelSellCount++;
          if (isVeryRecent) freshCalSell += weight;
        }
      }

      pool.push({
        key: k,
        tagKind: pred && pred.hasActual ? 'LIVE' : '24H',
        title: rawTitle + (pred && pred.hasActual && ev.actual != null ? ' [ACT ' + ev.actual + ']' : ''),
        src: srcNames || 'NEXT 24H',
        when: ageLabel(ev.ts, now),
        ts: Number(ev.ts) || 0,
        kind: ev.kind || 'event',
        impact: imp,
        hasPanelDir: hasPanelDir,
        hasActual: !!(pred && pred.hasActual),
        side: inferred.side,
        strength: inferred.strength,
        weight: weight
      });
    }

    for (var i = 0; i < next24Raw.length; i++) pushPanelItem(next24Raw[i], true);

    var extra = (Array.isArray(news) ? news : []).slice().sort(function (a, b) {
      return (Number(b && b.ts) || 0) - (Number(a && a.ts) || 0);
    });
    for (var j = 0; j < extra.length && pool.length < 18; j++) {
      if (relevanceFor(extra[j])) pushPanelItem(extra[j], true);
    }

    // Pillar 2: Deduplicated Live Internet Research (Google / Bing / Yahoo / Live Wire)
    var symKey = String(symbol || 'XAUUSDm').trim();
    var netEntry = aiInternetCache[symKey];
    var netData = netEntry && netEntry.data ? netEntry.data : null;
    var webBuyScore = 0, webSellScore = 0, freshWebBuy = 0, freshWebSell = 0, webBuyHits = 0, webSellHits = 0, webCount = 0;
    var webItems = [];
    var dxyText = '', us10yText = '';
    var mac = (netData && netData.macro) || {};

    if (netData && Array.isArray(netData.internet_articles)) {
      for (var w = 0; w < netData.internet_articles.length; w++) {
        var art = netData.internet_articles[w];
        if (!art || !art.title) continue;
        var wTitle = String(art.title).trim();
        if (isMacroNoiseHeadline(wTitle) || isDupTitle(wTitle)) continue;
        var wtk = wTitle.toLowerCase().replace(/\s+/g, ' ');
        var wSide = (art.side === 'BUY' || art.side === 'SELL') ? art.side : inferWorldMacroSide({ title: wTitle }, symbol).side;
        var wStr = Number(art.strength) || (wSide === 'WAIT' ? 0 : 62);
        var artTs = Number(art.ts) || now;
        var artDecay = Math.max(0.2, Math.exp(-Math.max(0, now - artTs) / 7200));
        var wWt = Number(art.weight) || (wSide === 'WAIT' ? 0.25 : 0.95 * artDecay);
        var artFresh = (now - artTs) <= 10800;
        if (wSide === 'BUY') {
          webBuyScore += wWt; webBuyHits++;
          if (artFresh) freshWebBuy += wWt;
        } else if (wSide === 'SELL') {
          webSellScore += wWt; webSellHits++;
          if (artFresh) freshWebSell += wWt;
        }
        webCount++;
        webItems.push({
          key: 'web|' + wtk,
          tagKind: 'WEB',
          title: wTitle,
          src: String(art.source || art.engine || 'INTERNET'),
          when: ageLabel(artTs, now),
          ts: artTs,
          kind: 'web',
          impact: 'high',
          side: wSide,
          strength: wStr,
          weight: wWt
        });
      }
    }

    // Check server release alert too
    var srvRel = netData && netData.release_alert;
    if (!hasActiveActual && srvRel && srvRel.hasActual && (srvRel.side === 'BUY' || srvRel.side === 'SELL') && !srvRel.conflict) {
      hasActiveActual = true;
      activeActualSide = srvRel.side;
      activeActualTitle = srvRel.title || 'Economic Release';
    }
    if (srvRel && srvRel.conflict) activeStopHunt = true;

    // Pillar 3: Macro Intermarket (DXY + US10Y Treasury Yield)
    var macroBuyScore = 0, macroSellScore = 0;
    if (mac.dxy_impact_for_symbol === 'BUY' || mac.dxy_impact_for_symbol === 'SELL') {
      var dxyMove = Number(mac.dxy_60m_pct != null && mac.sym_atr_impulse != null ? mac.dxy_60m_pct : (mac.dxy_change_pct || 0));
      dxyText = 'DXY ' + (dxyMove >= 0 ? '+' : '') + dxyMove.toFixed(2) + '% -> ' + mac.dxy_impact_for_symbol;
      var dxyW = Math.min(1.85, Math.max(0.9, 0.85 + Math.abs(dxyMove) * 2.8));
      if (mac.dxy_impact_for_symbol === 'BUY') macroBuyScore += dxyW;
      else macroSellScore += dxyW;
    }
    if (mac.us10y_price && Math.abs(Number(mac.us10y_change_pct || 0)) >= 0.35) {
      var yPct = Number(mac.us10y_change_pct);
      us10yText = 'US10Y ' + (yPct >= 0 ? '+' : '') + yPct.toFixed(2) + '%';
      var srvMacro = netData && netData.factors && netData.factors.macro;
      if (srvMacro && (srvMacro.us10y_side === 'BUY' || srvMacro.us10y_side === 'SELL')) {
        if (srvMacro.us10y_side === 'BUY') macroBuyScore += 0.85;
        else macroSellScore += 0.85;
      }
    }

    // Pillar 4: Real-time M5 Price Reaction + Order Flow + SwingAI Structure (no raw flip during 0-120s sweep!)
    var flowBuyScore = 0, flowSellScore = 0;
    var m5Bars = getLiveM5Bars();
    var qLive = liveQuote();
    var swState = window.SwingAI && typeof window.SwingAI.state === 'function' ? window.SwingAI.state() : null;
    var m5Atr = swState && swState.reads && swState.reads.M5 ? Number(swState.reads.M5.atr) || 0 : 0;
    var hasRunningRelease = runningTimed.length > 0;
    var runningElapsed = hasRunningRelease ? Math.max(0, now - Number(runningTimed[0].ts || now)) : 9999;
    var openingSweepGuard = hasRunningRelease && !hasActiveActual && runningElapsed < 120;
    var baselineTs = hasRunningRelease ? Number(runningTimed[0].ts) : (now - 900);
    var clientRx = m5Bars.length ? computePostEventReaction(m5Bars, baselineTs, now, qLive ? Number(qLive.price) : undefined, m5Atr) : null;
    var liveRxAtr = clientRx && clientRx.ready
      ? (hasRunningRelease ? clientRx.evMoveAtr : clientRx.impulse15mAtr)
      : (mac.sym_atr_impulse != null ? Number(mac.sym_atr_impulse) : 0);
    var hasLiveRx = (clientRx && clientRx.ready) || (mac.sym_atr_impulse != null);

    if (hasLiveRx && Math.abs(liveRxAtr) >= 0.45) {
      // Dampen weight during unconfirmed 0-120s opening spike so stop-hunts don't whipsaw AI verdict
      var rxMult = openingSweepGuard ? 0.35 : 1.15;
      var rxW = Math.min(2.6, Math.abs(liveRxAtr) * rxMult);
      if (liveRxAtr > 0) flowBuyScore += rxW;
      else flowSellScore += rxW;
      if (!dxyText) {
        dxyText = 'M5 LIVE ' + (liveRxAtr >= 0 ? '+' : '') + liveRxAtr.toFixed(2) + ' ATR -> ' + (liveRxAtr > 0 ? 'BUY' : 'SELL');
      } else {
        dxyText += ' | M5 ' + (liveRxAtr >= 0 ? '+' : '') + liveRxAtr.toFixed(2) + ' ATR';
      }
    }
    if (swState && swState.fresh && swState.reads && swState.reads.M5 && swState.reads.M15) {
      var m5s = Number(swState.reads.M5.score || 0);
      var m15s = Number(swState.reads.M15.score || 0);
      var stNet = (m5s + m15s) * 0.28;
      if (stNet >= 0.35) flowBuyScore += Math.min(0.95, stNet);
      else if (stNet <= -0.35) flowSellScore += Math.min(0.95, Math.abs(stNet));
    }

    var flowApi = window.MultiExchangeOrderFlow;
    var flowTotals = flowApi && typeof flowApi.getOpenTotals === 'function' ? flowApi.getOpenTotals() : null;
    if (flowTotals && (Number(flowTotals.buy || 0) + Number(flowTotals.sell || 0)) > 0) {
      var fTotal = Number(flowTotals.buy) + Number(flowTotals.sell);
      var fBuyPct = (Number(flowTotals.buy) / fTotal) * 100;
      if (fBuyPct >= 58) flowBuyScore += 0.65;
      else if (fBuyPct <= 42) flowSellScore += 0.65;
    }

    var calSide = calBuyScore - calSellScore > 0.45 ? 'BUY' : calSellScore - calBuyScore > 0.45 ? 'SELL' : 'WAIT';
    var webSide = webBuyScore - webSellScore > 0.35 ? 'BUY' : webSellScore - webBuyScore > 0.35 ? 'SELL' : 'WAIT';
    var macroSide = macroBuyScore - macroSellScore > 0.35 ? 'BUY' : macroSellScore - macroBuyScore > 0.35 ? 'SELL' : 'WAIT';
    var flowSide = flowBuyScore - flowSellScore > 0.45 ? 'BUY' : flowSellScore - flowBuyScore > 0.45 ? 'SELL' : 'WAIT';
    var pillars = [
      { label: '24H DATA', side: calSide },
      { label: 'WEB WIRE', side: webSide },
      { label: 'DXY/YIELD', side: macroSide },
      { label: 'M5/FLOW', side: flowSide }
    ];

    var totalBuy = calBuyScore + webBuyScore + macroBuyScore + flowBuyScore;
    var totalSell = calSellScore + webSellScore + macroSellScore + flowSellScore;
    // Live verified actual release carries strong priority over stale pre-release web articles
    if (hasActiveActual && (activeActualSide === 'BUY' || activeActualSide === 'SELL')) {
      if (activeActualSide === 'BUY') totalBuy += 3.0;
      else totalSell += 3.0;
    }
    var combinedTotal = totalBuy + totalSell;

    var dir = 'WAIT', pct = 0, conflictWarn = false;
    var rxThresh = hasRunningRelease ? 0.72 : 1.35;
    var hasStrongLiveUp = !openingSweepGuard && hasLiveRx && liveRxAtr >= rxThresh;
    var hasStrongLiveDown = !openingSweepGuard && hasLiveRx && liveRxAtr <= -rxThresh;

    if (activeStopHunt && !hasActiveActual) {
      conflictWarn = true;
      dir = 'WAIT';
      pct = 34;
    } else if (openingSweepGuard && Math.abs(liveRxAtr) >= 0.45 && calSide !== 'WAIT' && ((calSide === 'BUY' && liveRxAtr < 0) || (calSide === 'SELL' && liveRxAtr > 0))) {
      // Unreleased 0-2m opening wick fighting pre-event consensus -> NEVER flip, hold WAIT cleanly!
      conflictWarn = true;
      dir = 'WAIT';
      pct = 36;
    } else if (combinedTotal > 0) {
      var rawDir = totalBuy >= totalSell ? 'BUY' : 'SELL';
      var liveOppose = (rawDir === 'SELL' && hasStrongLiveUp) || (rawDir === 'BUY' && hasStrongLiveDown);
      var edgeRatio = Math.abs(totalBuy - totalSell) / combinedTotal;

      if (hasActiveActual && activeActualSide !== 'WAIT') {
        var actualOppose = (activeActualSide === 'SELL' && hasStrongLiveUp) || (activeActualSide === 'BUY' && hasStrongLiveDown);
        if (actualOppose && Math.abs(liveRxAtr) >= 1.15) {
          conflictWarn = true;
          dir = 'WAIT';
          pct = 42;
        } else {
          dir = activeActualSide;
          var alignAgree = (calSide === dir ? 1 : 0) + (webSide === dir ? 1 : 0) + (macroSide === dir ? 1 : 0) + (flowSide === dir ? 1 : 0);
          pct = Math.min(95, 50 + alignAgree * 11);
        }
      } else if (liveOppose) {
        var oppLiveSide = liveRxAtr > 0 ? 'BUY' : 'SELL';
        var freshOppText = oppLiveSide === 'BUY' ? (freshCalSell + freshWebSell) : (freshCalBuy + freshWebBuy);
        if (freshOppText < 2.2 && runningElapsed >= 150 && Math.abs(liveRxAtr) >= 0.9 && macroSide !== (oppLiveSide === 'BUY' ? 'SELL' : 'BUY')) {
          dir = oppLiveSide;
          pct = Math.min(72, Math.max(56, Math.round(54 + Math.abs(liveRxAtr) * 8)));
        } else {
          conflictWarn = true;
          dir = 'WAIT';
          pct = 40;
        }
      } else if (mac.conflict && ((panelBuyCount + panelSellCount === 0) || webSide === 'WAIT')) {
        conflictWarn = true;
        dir = 'WAIT';
        pct = 38;
      } else if (edgeRatio >= 0.14) {
        dir = totalBuy > totalSell ? 'BUY' : 'SELL';
        var agreeCount = (calSide === dir ? 1 : 0) + (webSide === dir ? 1 : 0) + (macroSide === dir ? 1 : 0) + (flowSide === dir ? 1 : 0);
        pct = Math.max(55, Math.min(95, Math.round(50 + edgeRatio * 28 + agreeCount * 4)));
      } else {
        dir = 'WAIT';
        pct = 44;
      }
    }

    var webState = '4-FACTOR AI';
    if (openingSweepGuard && conflictWarn) webState = 'SWEEP GUARD';
    else if (conflictWarn) webState = 'CONFLICT · WAIT';
    else if (hasActiveActual) webState = 'ACTUAL + AI -> ' + dir;
    else if (netEntry && netEntry.busy && !netData) webState = 'CHECKING WEB...';
    else if (netData && Array.isArray(netData.sources_checked) && netData.sources_checked.length > 1) {
      if (webSide === 'WAIT' && dir === 'WAIT') webState = 'WEB SCANNED';
      else if (calSide !== 'WAIT' && calSide === webSide && macroSide === dir) webState = '3-PILLAR ALIGNED';
      else if (calSide !== 'WAIT' && calSide === webSide) webState = 'WEB CONFIRMED ' + dir;
      else if (calSide !== 'WAIT' && calSide !== dir) webState = 'MACRO REVISED -> ' + dir;
      else webState = 'WEB DATA -> ' + dir;
    }

    var releaseBadge = null;
    if (openingSweepGuard) {
      releaseBadge = {
        cls: 'wait',
        tag: 'SWEEP GUARD (0-2M)',
        text: (runningTimed[0].title || 'Release') + ' started ' + Math.round(runningElapsed) + 's ago — waiting for actual/M5 body'
      };
    } else if (hasActiveActual) {
      releaseBadge = {
        cls: activeActualSide === 'BUY' ? 'buy' : 'sell',
        tag: 'LIVE ACTUAL PRINT',
        text: activeActualTitle + ' -> favors ' + activeActualSide
      };
    } else if (runningTimed.length) {
      releaseBadge = {
        cls: dir === 'BUY' ? 'buy' : dir === 'SELL' ? 'sell' : 'wait',
        tag: 'ACTIVE RELEASE',
        text: (runningTimed[0].title || 'Event') + ' running (' + Math.round(runningElapsed / 60) + 'm)'
      };
    }

    pool.sort(function (a, b) {
      var ac = a.hasActual ? 1 : 0;
      var bc = b.hasActual ? 1 : 0;
      var ai = a.impact === 'high' ? 2 : a.impact === 'medium' ? 1 : 0;
      var bi = b.impact === 'high' ? 2 : b.impact === 'medium' ? 1 : 0;
      return (bc - ac) || (b.weight - a.weight) || (bi - ai) || (b.ts - a.ts);
    });
    var displayItems = [];
    var pIdx = 0, wIdx = 0;
    while (displayItems.length < 5 && (pIdx < pool.length || wIdx < webItems.length)) {
      if (pIdx < pool.length && (displayItems.length < 3 || wIdx >= webItems.length)) displayItems.push(pool[pIdx++]);
      else if (wIdx < webItems.length) displayItems.push(webItems[wIdx++]);
    }

    var mktLabel = symbol || 'MARKET';
    var topCue = displayItems[0] ? displayItems[0].title : '';
    var srcList = (netData && Array.isArray(netData.sources_checked) ? netData.sources_checked : ['NEWS · NEXT 24H']).slice(0, 4).join(', ');
    var msg = '';
    if (openingSweepGuard && dir === 'WAIT') {
      msg = 'HOLD WAIT (Opening 0-2m Sweep Guard) - News just started without actual print; blocking opening wick whipsaws until M5 confirms.';
    } else if (conflictWarn) {
      msg = 'WAIT (Pillar Conflict) - Fundamentals leaned ' + (totalBuy >= totalSell ? 'BUY' : 'SELL') + ' while live M5 price moved ' +
        (liveRxAtr > 0 ? 'UP +' : 'DOWN ') + liveRxAtr.toFixed(2) + ' ATR. Wait for candle close alignment.';
    } else if (dir === 'WAIT') {
      msg = 'MIXED / LOW CONVICTION for ' + mktLabel + ' - Pillars not aligned strongly enough; wait for clean macro catalyst or M5 breakout.';
    } else {
      var alignCount = pillars.filter(function (p) { return p.side === dir; }).length;
      msg = 'TAKE ' + dir + ' (' + alignCount + '/4 pillars aligned) - ' + (hasActiveActual ? 'Verified ACTUAL print + ' : '') +
        next24Count + ' 24H items' + (netData ? ' + ' + (netData.internet_articles ? netData.internet_articles.length : 0) + ' web (' + srcList + ')' : '') +
        (dxyText ? ' | ' + dxyText : '') + (topCue ? '. Top: ' + topCue : '');
    }

    return {
      dir: dir,
      pct: pct,
      headlineCount: next24Count + webCount,
      next24Count: next24Count,
      webCount: netData && Array.isArray(netData.internet_articles) ? netData.internet_articles.length : webCount,
      panelBuyCount: panelBuyCount,
      panelSellCount: panelSellCount,
      panelDir: calSide,
      webDir: webSide,
      webBuyHits: webBuyHits,
      webSellHits: webSellHits,
      webState: webState,
      webSources: netData && Array.isArray(netData.sources_checked) ? netData.sources_checked : ['NEWS · NEXT 24H'],
      dxyText: dxyText,
      us10yText: us10yText,
      pillars: pillars,
      releaseBadge: releaseBadge,
      msg: msg,
      market: mktLabel,
      items: displayItems
    };
  }

  function ensureAiRobotPop() {
    var pop = $('mnt-ai-robot-pop');
    var host = document.fullscreenElement || $('dash') || document.body;
    if (!pop) {
      pop = document.createElement('div');
      pop.id = 'mnt-ai-robot-pop';
      pop.className = 'mnt-ai-robot-pop';
      pop.setAttribute('role', 'dialog');
      pop.setAttribute('aria-label', 'Softradex AI World News Reader');
      pop.hidden = true;
      pop.addEventListener('mouseenter', clearAiCloseTimer);
      pop.addEventListener('mouseleave', scheduleCloseAiPop);
      pop.addEventListener('pointerenter', clearAiCloseTimer);
    }
    if (host && pop.parentElement !== host) host.appendChild(pop);
    return pop;
  }

  function positionAiRobotPop(btn, pop) {
    if (!btn || !pop) return;
    var r = btn.getBoundingClientRect();
    var vw = window.innerWidth || document.documentElement.clientWidth || 1280;
    var vh = window.innerHeight || document.documentElement.clientHeight || 800;
    var pw = Math.min(352, vw - 16);
    pop.style.width = pw + 'px';
    var ph = pop.offsetHeight || 280;
    var left = r.right - pw;
    if (left < 8) left = Math.max(8, Math.min(vw - pw - 8, r.left));
    var top = r.bottom + 8;
    if (top + ph > vh - 8) top = Math.max(8, r.top - ph - 8);
    pop.style.left = Math.round(left) + 'px';
    pop.style.top = Math.round(top) + 'px';
  }

  function renderAiRobotPopContent() {
    var pop = ensureAiRobotPop();
    var st = aiWorldState;
    var sideCls = st.dir === 'BUY' ? 'buy' : st.dir === 'SELL' ? 'sell' : 'wait';
    var callText = st.dir === 'BUY' ? 'TAKE BUY &uarr;' : st.dir === 'SELL' ? 'TAKE SELL &darr;' : 'WAIT / MIXED &loz;';
    var netTagCls = st.webDir === 'BUY' ? 'buy' : st.webDir === 'SELL' ? 'sell' : sideCls;
    var factorsHtml = '';
    if (Array.isArray(st.pillars) && st.pillars.length) {
      factorsHtml = '<div class="arp-pillars">' + st.pillars.map(function (p) {
        var pc = p.side === 'BUY' ? 'buy' : p.side === 'SELL' ? 'sell' : 'wait';
        var pSide = p.side === 'BUY' ? 'BUY &uarr;' : p.side === 'SELL' ? 'SELL &darr;' : 'NEUT';
        return '<div class="arp-pillar ' + pc + '"><span>' + esc(p.label) + '</span><b>' + pSide + '</b></div>';
      }).join('') + '</div>';
    }
    var alertHtml = st.releaseBadge
      ? '<div class="arp-release-alert ' + (st.releaseBadge.cls || 'wait') + '">' +
          '<b>' + esc(st.releaseBadge.tag) + '</b><span>' + esc(st.releaseBadge.text) + '</span>' +
        '</div>'
      : '';
    var itemsHtml = st.items.length
      ? st.items.map(function (it) {
          var cls = it.side === 'BUY' ? 'buy' : it.side === 'SELL' ? 'sell' : 'wait';
          var pill = it.side === 'BUY' ? 'BUY &uarr;' : it.side === 'SELL' ? 'SELL &darr;' : 'NEWS';
          var kindCls = it.tagKind === 'WEB' ? 'web' : (it.tagKind === 'LIVE' ? 'live' : 'local');
          return '<div class="arp-item ' + cls + '">' +
            '<div class="arp-item-top">' +
            '<span class="arp-badge-kind ' + kindCls + '">' + esc(it.tagKind) + '</span>' +
            '<span class="arp-src">' + esc(it.src) + '</span>' +
            '<span class="arp-when">' + esc(it.when) + '</span>' +
            '<b class="arp-pill ' + cls + '">' + pill + '</b></div>' +
            '<div class="arp-title">' + esc(it.title) + '</div></div>';
        }).join('')
      : '<div class="arp-empty">Softradex AI is reading NEXT 24H news &amp; scanning the internet for ' + esc(st.market || symbol || 'MARKET') + '...</div>';

    pop.innerHTML =
      '<div class="arp-head">' +
        '<span class="arp-head-dot ' + sideCls + '"></span>' +
        '<b>SOFTRADEX AI &middot; ' + esc(st.market || symbol || 'MARKET') + '</b>' +
        '<em>' + st.next24Count + ' 24H &middot; ' + st.webCount + ' WEB</em>' +
      '</div>' +
      '<div class="arp-net-bar">' +
        '<span>24H FIXED: <b>' + esc(fixed24hState.side) + ' ' + fixed24hState.winPct + '%</b> (B ' + fixed24hState.buyPct + '% / S ' + fixed24hState.sellPct + '%)</span>' +
        (st.dxyText ? '<span>' + esc(st.dxyText) + '</span>' : '') +
        (st.us10yText ? '<span>' + esc(st.us10yText) + '</span>' : '') +
        '<em class="arp-net-tag ' + netTagCls + '">' + esc(st.webState) + '</em>' +
      '</div>' +
      factorsHtml +
      alertHtml +
      '<div class="arp-list">' + itemsHtml + '</div>' +
      '<div class="arp-verdict ' + sideCls + '">' +
        '<div class="arp-v-row">' +
          '<span class="arp-v-lbl">FINAL AI DIRECTION</span>' +
          '<strong class="arp-v-call ' + sideCls + '">' + callText + '</strong>' +
          '<em class="arp-v-pct">' + (st.pct ? st.pct + '% CONF' : 'SCANNING') + '</em>' +
        '</div>' +
        '<div class="arp-v-bar"><i class="' + sideCls + '" style="width:' + Math.max(8, st.pct || 18) + '%"></i></div>' +
        '<p class="arp-v-msg">' + esc(st.msg) + '</p>' +
      '</div>';
    return pop;
  }

  function openAiRobotPop(pin) {
    clearAiCloseTimer();
    if (pin === true) aiRobotPinned = true;
    var btn = $('mnt-ai-robot');
    if (!btn) return;
    aiRobotOpen = true;
    var next24Raw = lastRobotInputs.running.concat(lastRobotInputs.upcoming, lastRobotInputs.headlines);
    ensureInternetResearch(next24Raw, false);
    var pop = renderAiRobotPopContent();
    pop.hidden = false;
    btn.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    positionAiRobotPop(btn, pop);
  }

  function closeAiRobotPop(force) {
    clearAiCloseTimer();
    if (aiRobotPinned && !force) return;
    aiRobotOpen = false;
    aiRobotPinned = false;
    var btn = $('mnt-ai-robot');
    var pop = $('mnt-ai-robot-pop');
    if (btn) {
      btn.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
    if (pop) pop.hidden = true;
  }

  function scheduleCloseAiPop() {
    clearAiCloseTimer();
    if (aiRobotPinned) return;
    aiCloseTimer = setTimeout(function () { closeAiRobotPop(false); }, 170);
  }

  function bindAiWorldRobot() {
    var btn = $('mnt-ai-robot');
    if (!btn || btn.dataset.aiBound) return;
    btn.dataset.aiBound = '1';
    btn.addEventListener('mouseenter', function () { openAiRobotPop(false); });
    btn.addEventListener('pointerenter', function () { openAiRobotPop(false); });
    btn.addEventListener('focus', function () { openAiRobotPop(false); });
    btn.addEventListener('mouseleave', scheduleCloseAiPop);
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (aiRobotOpen && aiRobotPinned) closeAiRobotPop(true);
      else openAiRobotPop(true);
    });
    document.addEventListener('click', function (e) {
      if (!aiRobotOpen) return;
      var t = e.target;
      var pop = $('mnt-ai-robot-pop');
      if (btn.contains(t) || (pop && pop.contains(t))) return;
      closeAiRobotPop(true);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && aiRobotOpen) closeAiRobotPop(true);
    });
    window.addEventListener('resize', function () {
      if (aiRobotOpen) positionAiRobotPop($('mnt-ai-robot'), $('mnt-ai-robot-pop'));
    });
  }

  function updateAiWorldRobot(upcoming, headlines, now, running, skipFetch) {
    bindAiWorldRobot();
    lastRobotInputs = {
      upcoming: Array.isArray(upcoming) ? upcoming : [],
      headlines: Array.isArray(headlines) ? headlines : [],
      running: Array.isArray(running) ? running : []
    };
    if (!skipFetch) {
      ensureInternetResearch(lastRobotInputs.running.concat(lastRobotInputs.upcoming, lastRobotInputs.headlines), false);
    }
    aiWorldState = buildWorldNewsDigest(lastRobotInputs.upcoming, lastRobotInputs.headlines, now, lastRobotInputs.running);
    var btn = $('mnt-ai-robot');
    var badge = $('mnt-ai-bot-side');
    if (btn) {
      btn.classList.toggle('is-buy', aiWorldState.dir === 'BUY');
      btn.classList.toggle('is-sell', aiWorldState.dir === 'SELL');
      btn.classList.toggle('is-wait', aiWorldState.dir === 'WAIT');
    }
    if (badge) {
      var cls = aiWorldState.dir === 'BUY' ? 'buy' : aiWorldState.dir === 'SELL' ? 'sell' : 'wait';
      badge.className = cls;
      badge.textContent = aiWorldState.dir === 'BUY' ? 'BUY' : aiWorldState.dir === 'SELL' ? 'SELL' : (aiWorldState.headlineCount ? 'WAIT' : 'SCAN');
    }
    if (aiRobotOpen) {
      var pop = renderAiRobotPopContent();
      positionAiRobotPop(btn, pop);
    }
  }
  function updateWindow(nowSec) {
    var minute = Math.floor((nowSec || Date.now() / 1000) / 60);
    if (minute !== lastWindowMinute) {
      lastWindowMinute = minute;
      var baseSec = minute * 60;
      lastWindowText = 'NEXT 24H: ' + eventTime(baseSec) + ' → ' + eventTime(baseSec + 86400);
    }
    setText('mnt-window', lastWindowText);
  }
  function exnessRows(data) {
    if (!Array.isArray(data)) throw new Error('Invalid Exness calendar payload');
    var currencies = { US:'USD', GB:'GBP', EU:'EUR', EA:'EUR', DE:'EUR', FR:'EUR', IT:'EUR', ES:'EUR',
      NL:'EUR', BE:'EUR', AT:'EUR', PT:'EUR', IE:'EUR', FI:'EUR', GR:'EUR', JP:'JPY', CN:'CNY',
      AU:'AUD', NZ:'NZD', CA:'CAD', CH:'CHF', IN:'INR', BR:'BRL', ZA:'ZAR', MX:'MXN', RU:'RUB',
      SG:'SGD', HK:'HKD', KR:'KRW', TR:'TRY', NO:'NOK', SE:'SEK', DK:'DKK', PL:'PLN', CZ:'CZK',
      HU:'HUF', CL:'CLP', CO:'COP', SA:'SAR' };
    return data.filter(function(e) {
      return e && e.title && !e.isDayLongEvent && typeof e.time === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(e.time) && Number.isFinite(Date.parse(e.time));
    }).map(function(e) {
      var country = String(e.country || '').toUpperCase();
      var currency = currencies[country] || (/^[A-Z]{3}$/.test(e.currency || '') ? e.currency : country);
      var title = String(e.title).replace(/([a-z])Speech\b/g, '$1 Speech');
      var impact = /^(high|medium|low)$/.test(e.impact) ? e.impact : 'low';
      var win = IMPACT_WINDOW[impact];
      if (/\b(cpi|ppi|pce|inflation|consumer price|producer price|non.?farm|payroll|interest rate|rate decision|monetary policy|fomc minutes)\b/i.test(title)) win = 21600;
      else if (/\b(fomc|fed|ecb|boe|boj|mpc|buba|central bank)\b.*\b(speak|speaks|speech|testimony|press conference)\b|\b(gdp|retail sales|jobless|unemployment|employment|pmi)\b/i.test(title)) win = 7200;
      return { title:title, currency:currency, country:currency, ts:Date.parse(e.time)/1000, kind:'calendar',
        source:'exness', sources:['exness'], url:'https://my.exness.com/pa/analytics/economic-calendar',
        impact:impact, impact_window_sec:win, actual:e.actual, forecast:e.forecast, previous:e.previous,
        description:String(e.description || '') };
    });
  }
  function applyExnessBrowser() {
    if (!exnessBrowser.status) return;
    var status = sourceStatus.find(function(s) { return s.name === 'exness'; });
    if (!status || (status.parts && status.parts.calendar && status.parts.calendar.state === 'ok' && status.parts.calendar.transport !== 'browser')) return;
    var parts = Object.assign({}, status.parts, { calendar:exnessBrowser.status });
    var headline = parts.headline;
    sourceStatus = sourceStatus.map(function(s) {
      return s.name === 'exness' ? Object.assign({}, s, { parts:parts,
        count:exnessBrowser.rows.length + Number(headline && headline.count || 0),
        updated:exnessBrowser.status.updated,
        state:exnessBrowser.status.state === 'ok' ? (headline && headline.state !== 'ok' ? 'partial' : 'ok') : s.state }) : s;
    });
  }
  function fetchExnessBrowser() {
    var provider = sourceStatus.find(function(s) { return s.name === 'exness'; });
    if (!provider || !provider.parts || !provider.parts.calendar ||
        (provider.parts.calendar.state === 'ok' && provider.parts.calendar.transport !== 'browser') ||
        exnessBrowser.busy || Date.now() < exnessBrowser.nextFetch) return;
    exnessBrowser.busy = true;
    var controller = new AbortController(), timeout = setTimeout(function() { controller.abort(); }, 12000);
    var now = Date.now(), rows = [];
    function page(n) {
      var query = 'start=' + encodeURIComponent(new Date(now-21600000).toISOString()) +
        '&end=' + encodeURIComponent(new Date(now+86400000).toISOString()) + '&lang=en&page=' + n;
      // This calendar is a public cross-origin endpoint. Never forward broker
      // cookies, tokens or account credentials into a dashboard request.
      return fetch(EXNESS_API + '?' + query, { credentials:'omit', cache:'no-store', signal:controller.signal })
        .then(function(r) { if (!r.ok) throw new Error('Exness browser HTTP ' + r.status); return r.json(); })
        .then(function(data) {
          rows = rows.concat(exnessRows(data));
          if (data.length >= 50) {
            if (n >= 20) throw new Error('Exness calendar pagination incomplete');
            return page(n+1);
          }
        });
    }
    return page(1).then(function() {
      exnessBrowser.rows = rows;
      exnessBrowser.status = {state:'ok',count:rows.length,updated:Date.now()/1000,transport:'browser'};
      exnessBrowser.nextFetch = Date.now()+300000;
      applyExnessBrowser(); mergeNews(news.concat(rows)); renderNews();
      saveNews({events:news,sources:sourceStatus});
    }).catch(function(e) {
      exnessBrowser.nextFetch = Date.now()+60000;
      exnessBrowser.status = {state:exnessBrowser.rows.length ? 'cached' : 'unavailable',count:exnessBrowser.rows.length,
        updated:Date.now()/1000,transport:'browser',error:String(e.message || e)};
      applyExnessBrowser(); renderNews();
    }).finally(function() { clearTimeout(timeout); exnessBrowser.busy = false; });
  }
  function renderSources(rows) {
    var now = Date.now() / 1000;
    updateWindow(now);
    var sourcesEl = $('mnt-sources');
    if (!sourcesEl) return;
    var names = SOURCE_NAMES, issues = 0;
    var statusByName = Object.create(null);
    for (var sIdx = 0; sIdx < sourceStatus.length; sIdx++) {
      if (sourceStatus[sIdx] && sourceStatus[sIdx].name) statusByName[sourceStatus[sIdx].name] = sourceStatus[sIdx];
    }
    var countsByName = Object.create(null);
    for (var rIdx = 0; rIdx < rows.length; rIdx++) {
      var ev = rows[rIdx];
      var isHeadline = ev.kind === 'headline';
      var phase = isHeadline ? '' : phaseFor(ev, now);
      var srcs = ev.sources || [ev.source];
      for (var j = 0; j < srcs.length; j++) {
        var srcName = srcs[j];
        if (!srcName) continue;
        var c = countsByName[srcName] || (countsByName[srcName] = { upcoming: 0, running: 0, headlines: 0 });
        if (isHeadline) c.headlines++;
        else if (phase === 'upcoming') c.upcoming++;
        else if (phase === 'running') c.running++;
      }
    }
    var sourcesHtml = Object.keys(names).map(function(name) {
      var status = statusByName[name] || { state: 'loading' };
      var c = countsByName[name] || { upcoming: 0, running: 0, headlines: 0 };
      var upcoming = c.upcoming, running = c.running, headlines = c.headlines;
      var calendar = status.parts && status.parts.calendar;
      if (calendar && calendar.state !== 'ok') issues++;
      var note = Object.keys(status.parts || {}).map(function(k) { var p = status.parts[k]; return k + ': ' + p.state + (p.transport === 'browser' ? ' via public browser feed' : '') + (p.error ? ' · ' + p.error : ''); }).join(' / ');
      var explanation = calendar && calendar.state !== 'ok' ? 'Calendar ' + calendar.state + ': ' + (calendar.error || 'cached data only')
        : (calendar && !upcoming && !running ? 'No relevant release in this 24h window' : calendar && calendar.transport === 'browser' ? 'Live calendar via public browser feed' : status.state);
      return '<span class="mnt-provider ' + esc(status.state) + '" title="' + esc(note || status.state) + '">' + esc(names[name]) +
        '<b>' + upcoming + ' upcoming · ' + running + ' running · ' + headlines + ' headlines</b><small>' + esc(explanation) +
        '</small><a href="' + SOURCE_URLS[name] + '" target="_blank" rel="noopener noreferrer">Open source ↗</a></span>';
    }).join('');
    if (sourcesHtml !== lastSourcesHtml) {
      sourcesEl.innerHTML = sourcesHtml;
      lastSourcesHtml = sourcesHtml;
    }
    var summaryText = 'NEWS SOURCES' + (issues ? ' · ' + issues + ' CALENDAR FEEDS UNAVAILABLE / CACHED' : ' · SELECTED MARKET');
    if (summaryText !== lastSourceSummary) {
      lastSourceSummary = summaryText;
      setText('mnt-source-summary', summaryText);
    }
  }
  function fetchNews(scan) {
    // The market catalogue can still be loading during workspace initialization.
    if (newsBusy || !String(symbol || '').trim()) return;
    clearTimeout(newsRetryTimer);
    newsBusy = true;
    var requested = symbol, generation = ++newsRequest;
    newsAbort = new AbortController();
    var controller = newsAbort;
    var timeout = setTimeout(function() { controller.abort(); }, 12000);
    var haveParam = !scan && newsSnapshotReady && news.length && newsServerSig ? '&have=' + encodeURIComponent(newsServerSig) : '';
    fetch('/api/news/market?symbol=' + encodeURIComponent(requested) + (scan ? '&scan=1' : '') + haveParam, { cache: 'no-store', signal:controller.signal })
      .then(function(r) { if (!r.ok) throw new Error('News HTTP ' + r.status); return r.json(); })
      .then(function(st) {
        if (generation !== newsRequest || requested !== symbol) return;
        if (!st || st.symbol !== symbol || !Array.isArray(st.events)) throw new Error('Invalid market news payload');
        sourceStatus = st.sources || [];
        scanState = st.scan && st.scan.state === 'scanning' ? 'scanning' : 'idle';
        newsFailures = 0;
        if (st.news_sig) newsServerSig = String(st.news_sig);
        if (Array.isArray(st.dxy_bars_m5) && st.dxy_bars_m5.length) dxyBarsM5 = st.dxy_bars_m5;
        if (st.news_omitted) {
          applyExnessBrowser();
          renderSources(visibleEvents(Date.now() / 1000));
          fetchExnessBrowser();
          renderNews();
          return;
        }
        applyExnessBrowser();
        mergeNews(st.events.concat(exnessBrowser.rows));
        if (!newsServerSig || newsServerSig !== lastSavedSig || exnessBrowser.rows.length) {
          lastSavedSig = newsServerSig || String(Date.now());
          saveNews({events:news,sources:sourceStatus});
        }
        renderNews(true);
        fetchExnessBrowser();
      }).catch(function() {
        if (generation !== newsRequest) return;
        scanState = 'retrying'; newsFailures++; renderNews();
        newsRetryTimer = setTimeout(function() { fetchNews(true); }, Math.min(30000, 2000 * Math.pow(2, newsFailures-1)));
      }).finally(function () { clearTimeout(timeout); if (generation === newsRequest) newsBusy = false; });
  }
  function renderPressure() {
    if (document.hidden) return;
    var flow = window.MultiExchangeOrderFlow;
    var t = flow && typeof flow.getOpenTotals === 'function' ? flow.getOpenTotals() : null;
    var buy = Number(t && t.buy) || 0, sell = Number(t && t.sell) || 0, total = buy + sell;
    var pct = total ? Math.round(buy / total * 100) : 50;
    var edge = Math.abs(pct - 50) * 2;
    var side = edge < 12 ? 'WAIT' : pct > 50 ? 'BUY' : 'SELL';
    var s = $('vfb-advisory-side'), c = $('vfb-advisory-confidence'), bar = $('vfb-advisory-buy'), reason = $('vfb-advisory-reason');
    if (s) { s.textContent = side; s.className = side.toLowerCase(); }
    if (c) c.textContent = edge + '% confidence';
    if (bar) bar.style.width = pct + '%';
    if (reason) reason.textContent = total ? ('Verified venue/open-position flow: BUY ' + pct + '% · SELL ' + (100-pct) + '%. Advisory, not a guarantee.') : 'Waiting for verified live flow. Estimates are not trade guarantees.';
    window.dispatchEvent(new CustomEvent('chart:pressure', { detail: { symbol: symbol, buyPct: pct, sellPct: 100-pct, side: side, confidence: edge, buy: buy, sell: sell } }));
  }
  function expanded() { return section && section.classList.contains('workspace-expanded'); }
  function syncButton() {
    var on = expanded();
    if (button) {
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
      button.setAttribute('aria-label', on ? 'Exit Full Screen' : 'Full Screen');
      button.title = on ? 'Exit full screen workspace' : 'Full screen: chart + left and right panels';
      button.classList.toggle('active', on);
    }
    if (icon) icon.textContent = on ? '✕' : '⛶';
    if (label) label.textContent = on ? 'Exit Full Screen' : 'Full Screen';
  }
  function startAtSetups() {
    var strip = $('binance-ticker-strip');
    if (!expanded() || !strip || !section.getBoundingClientRect || !strip.getBoundingClientRect) return;
    var padding = parseFloat(window.getComputedStyle(section).paddingTop) || 0;
    var top = section.scrollTop + strip.getBoundingClientRect().top - section.getBoundingClientRect().top - section.clientTop - padding;
    section.scrollTop = Math.max(0, top);
    section.scrollLeft = 0;
  }
  function setExpanded(on) {
    if (!section) return;
    section.classList.toggle('workspace-expanded', !!on);
    document.documentElement.classList.toggle('chart-workspace-open', !!on);
    syncButton();
    if (on) startAtSetups();
    else section.scrollTop = 0;
    setTimeout(function() { window.dispatchEvent(new Event('resize')); }, 80);
  }
  function toggle() {
    if (expanded()) {
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function(){});
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (section.requestFullscreen) section.requestFullscreen({ navigationUI: 'hide' }).then(startAtSetups).catch(function(){});
  }
  function init() {
    section = $('binance-terminal-section'); workspace = $('binance-term-workspace'); button = $('binance-term-expand');
    icon = $('b-expand-icon'); label = $('b-expand-text');
    if (!section || !workspace) return;
    if (button) button.addEventListener('click', toggle);
    document.addEventListener('fullscreenchange', function() {
      if (document.fullscreenElement === section) startAtSetups();
      else if (!document.fullscreenElement && expanded()) setExpanded(false);
    });
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && expanded() && !document.fullscreenElement) setExpanded(false); });
    var t = window.SoftradeXTerminal;
    symbol = t && t.getCurrentSymbol ? String(t.getCurrentSymbol() || '') : 'XAUUSDm';
    restoreNews();
    window.addEventListener('chart:market', function(e) {
      var d = e.detail || {}, next = String(d.symbol || (d.meta && d.meta.symbol) || symbol);
      var changed = next !== symbol;
      if (changed) { newsSnapshotReady = false; eventReferences = Object.create(null); dirEstCache = Object.create(null); lastListRenderSig = Object.create(null); lastFixedRenderSig = ''; news = []; sourceStatus=[]; lastNewsHtml=Object.create(null); lastSourcesHtml=''; lastSourceSummary=''; newsServerSig=''; lastSavedSig=''; newsMergeGen++; cachedHeadlinesKey=''; workerEstimates=Object.create(null); workerBatchGen++; lastWorkerKey=''; lastQuoteNewsAt=0; lastQuoteNewsPrice=NaN; clearTimeout(quoteNewsTimer); quoteNewsTimer=null; if (newsAbort) newsAbort.abort(); clearTimeout(newsRetryTimer); newsRequest++; newsBusy = false; newsFailures=0; scanState='scanning'; }
      symbol = next; if (changed) restoreNews(); renderNews(); renderPressure(); fetchNews(true);
    });
    window.addEventListener('chart:tv-quote', function(e) {
      if (document.hidden) return;
      var d = (e && e.detail) || {};
      var qSym = String(d.symbol || (d.quote && d.quote.symbol) || '').trim();
      if (qSym && !marketMatch(qSym, symbol)) return;
      var price = Number(d.price != null ? d.price : (d.quote && d.quote.price));
      var nowMs = Date.now();
      var pctMove = isFinite(price) && isFinite(lastQuoteNewsPrice) && lastQuoteNewsPrice > 0
        ? Math.abs(price - lastQuoteNewsPrice) / lastQuoteNewsPrice : 1;
      if (nowMs - lastQuoteNewsAt < 10000 && pctMove < 0.0008) return;
      if (quoteNewsTimer) return;
      quoteNewsTimer = setTimeout(function() {
        quoteNewsTimer = null;
        if (document.hidden) return;
        lastQuoteNewsAt = Date.now();
        if (isFinite(price) && price > 0) lastQuoteNewsPrice = price;
        renderNews();
      }, 1200);
    });
    window.addEventListener('chart:refresh', function() { fetchNews(true); renderPressure(); });
    window.addEventListener('orderflow:update', function(e) {
      var d = (e && e.detail) || {};
      if (!d.symbol || marketMatch(d.symbol, symbol)) renderPressure();
    });
    refreshTimer = setInterval(function() {
      if (document.hidden) return;
      var nowSec = Date.now() / 1000;
      var releaseDue = news.some(function(ev) {
        if (!ev || ev.kind === 'headline') return false;
        var imp = String(ev.impact || 'low').toLowerCase();
        if (imp !== 'high' && imp !== 'medium') return false;
        var ts = Number(ev.ts || 0);
        return ts >= nowSec - 240 && ts <= nowSec + 15 && !String(ev.actual == null ? '' : ev.actual).trim();
      });
      if (releaseDue && Date.now() - lastReleaseScanAt >= 20000) {
        lastReleaseScanAt = Date.now();
        exnessBrowser.nextFetch = 0;
        fetchNews(true);
      } else {
        fetchNews();
      }
      renderPressure();
    }, 15000);
    bindAiWorldRobot(); fetchNews(true); syncButton();
    requestAnimationFrame(function() { renderNews(); renderPressure(); updateMntTimers(); });
  }
  // Keep the impact countdown alive even when the workspace init is delayed
  // or the panel is re-mounted; a hidden browser tab is throttled by Chrome.
  setInterval(updateMntTimers, 1000);
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden) { updateMntTimers(); fetchNews(true); }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.ChartWorkspace = { relevanceFor: relevanceFor, impactFor: impactFor,
    getDxyBarsM5: function() { return dxyBarsM5; },
    fixed24hState: function() { return Object.assign({}, fixed24hState); },
    directionFor: function(ev, market) { return ev && marketMatch(market, symbol) ? directionalEstimate(ev, Date.now()/1000) : null; },
    expand: function(){setExpanded(true);}, close: function(){setExpanded(false);}, refresh: function(){fetchNews(true);renderPressure();},
    aiNewsState: function(){ return Object.assign({}, aiWorldState, { open: aiRobotOpen }); },
    newsState: function(){
      var now = Date.now() / 1000;
      var evs = visibleEvents(now);
      var res = { symbol: symbol, sources: sourceStatus, events: evs };
      var cachedSigs = null;
      Object.defineProperty(res, 'signals', {
        enumerable: true,
        get: function() {
          if (!cachedSigs) {
            cachedSigs = evs.map(function(e) {
              return { title: e.title, phase: phaseFor(e, now), estimate: directionalEstimate(e, now) };
            });
          }
          return cachedSigs;
        }
      });
      return res;
    } };
})();


// ==================== market-outlook-data.js ====================
/* Independent daily candle reads for dashboard estimates.
   Two requests at a time, persistent ten-minute cache and event-market priority. */
(function (root) {
  'use strict';
  function create(options) {
    const now = options.now || Date.now;
    const cache = new Map(), queued = new Set(), pending = new Set(), queue = [], restored = new Set();
    const ttl = 10 * 60 * 1000, retry = 2 * 60 * 1000;
    const storagePrefix = 'softradex.outlook.daily.v1.';
    let priority = new Set();
    let watched = [], active = 0;
    const key = symbol => root.DashboardPanels.canonical(symbol);
    function cached(symbol) {
      const id = key(symbol);
      if (!cache.has(id) && !restored.has(id)) {
        restored.add(id);
        try {
          const saved = JSON.parse(options.storage && options.storage.getItem(storagePrefix + id) || 'null');
          if (saved && Number(saved.at) > 0 && now() - saved.at < ttl && saved.at <= now() + 5000 &&
              saved.read && saved.read.ready && Number.isFinite(saved.read.score) && Number.isFinite(saved.read.atr)) {
            cache.set(id, { at: Number(saved.at), until: Number(saved.at) + ttl,
              read: saved.read, source: saved.source });
          }
        } catch (_) { /* Storage can be disabled; live reads still work. */ }
      }
      return cache.get(id);
    }
    function get(symbol) {
      const row = cached(symbol);
      if (!row || !row.read || now() - row.at >= ttl) return null;
      return { symbol, fresh: true, source: row.source,
        vote: { score: row.read.score * 3 }, reads: { D1: row.read } };
    }
    async function load(symbol) {
      const id = key(symbol);
      pending.add(id);
      active++;
      try {
        const data = await options.request(symbol);
        if (key(data.symbol) !== id) throw new Error('Wrong market candle response');
        const time = now();
        const bars = (data.bars || []).filter(b => Array.isArray(b) && Number(b[0]) > 0 &&
          Number(b[0]) + 86400000 <= time).sort((a,b) => a[0]-b[0]);
        const last = bars[bars.length-1];
        if (!last || time - Number(last[0]) > 4 * 86400000) throw new Error('Daily history is stale');
        const reading = options.analyze(bars, Number(last[4]), 'D1');
        if (!reading || !reading.ready) throw new Error('Not enough closed daily candles');
        cache.set(id, { at: time, until: time + ttl, read: reading,
          source: data.meta && data.meta.source || 'public daily candles' });
        try {
          if (options.storage) options.storage.setItem(storagePrefix + id, JSON.stringify(cache.get(id)));
        } catch (_) { /* Quota/private mode must not block analysis. */ }
      } catch (error) {
        cache.set(id, { at: now(), until: now() + retry, error: String(error.message || error) });
      } finally {
        pending.delete(id);
        active--;
        if (options.notify) options.notify();
        pump();
      }
    }
    function pump() {
      while (active < 2 && queue.length) {
        const symbol = queue.shift();
        queued.delete(key(symbol));
        void load(symbol);
      }
    }
    function prioritize(symbols) {
      priority = new Set((symbols || []).map(key));
      queue.sort((a,b) => Number(priority.has(key(b))) - Number(priority.has(key(a))));
      pump();
    }
    function ensure(symbols, selected) {
      watched = root.DashboardPanels.marketList(symbols, selected);
      watched.forEach(symbol => {
        const id = key(symbol), row = cached(symbol);
        if (pending.has(id) || queued.has(id) || row && now() < row.until) return;
        queued.add(id);
        queue.push(symbol);
      });
      prioritize([...priority]);
    }
    function status() {
      return { total: watched.length, ready: watched.filter(s => get(s)).length,
        pending: pending.size + queue.length,
        unavailable: watched.filter(s => cache.get(key(s))?.error).length };
    }
    return { ensure, get, status, prioritize };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { create };
  if (root.document) {
    let repaint = null;
    root.MarketOutlookData = create({
      storage: { getItem: key => root.localStorage.getItem(key),
        setItem: (key, value) => root.localStorage.setItem(key, value) },
      request: async symbol => {
        const response = await fetch('/api/chart/candles?symbol=' + encodeURIComponent(symbol) + '&tf=1d&count=80',
          { cache: 'no-store', signal: AbortSignal.timeout(18000) });
        if (!response.ok) throw new Error('Daily candle API unavailable');
        return response.json();
      },
      analyze: (...args) => root.SwingAI.analyzeCandles(...args),
      notify: () => {
        if (repaint) return;
        repaint = setTimeout(() => {
          repaint = null;
          root.dispatchEvent(new CustomEvent('market:outlook-data'));
        }, 1000);
      }
    });
  }
})(typeof window === 'undefined' ? globalThis : window);


}
