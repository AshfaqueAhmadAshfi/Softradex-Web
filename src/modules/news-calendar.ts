// @ts-nocheck
/* Consolidated TypeScript module */
export function loadModule(): void {
  (window as any).SOFTRADEX_PUBLIC_ONLY = true;

// ==================== news-direction.js ====================
/* Selected-market directional estimates from release data, RSS text and live
   structure. Signal strength is a model score, not a calibrated probability. */
(function () {
  'use strict';
  function base(v) {
    var key = String(v || '').replace(/m$/, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return ({XAUUSD247:'XAUUSD',BTCUSD:'BTCUSDT',ETHUSD:'ETHUSDT',USTECX100:'USTEC',NAS100:'USTEC'})[key] || key;
  }
  function sign(n) { return n > 0 ? 1 : n < 0 ? -1 : 0; }
  function clamp(n, limit) { return Math.max(-limit, Math.min(limit, n)); }
  function side(v) { return /BUY|UP|BULL/i.test(v || '') ? 1 : /SELL|DOWN|BEAR/i.test(v || '') ? -1 : 0; }
  function currencySign(symbol, currency) {
    var key = base(symbol), c = String(currency || '').toUpperCase();
    if (c === key || (c === 'TECH' && /USTEC|US500|US30|^[A-Z]{2,5}$/.test(key))) return 1;
    if (c === 'OIL' && /USOIL|UKOIL|XNG/.test(key)) return 1;
    if (c === 'BTC' && /^(BTC|ETH|SOL|XRP|BNB|DOGE|ADA|LTC)/.test(key)) return 1;
    if (/^(XAU|XAG|XPT|XPD)/.test(key) && c === key.slice(0,3)) return 1;
    if (/^[A-Z]{6}$/.test(key) && c === key.slice(0,3)) return 1;
    if (/^[A-Z]{6}$/.test(key) && c === key.slice(3)) return -1;
    if (c === 'USD') {
      if (key === 'DXY' || /^USD/.test(key)) return 1;
      if (/USD[T]?$/.test(key) || /^(USTEC|US500|US30|USOIL|UKOIL|[A-Z]{2,5})$/.test(key)) return -1;
    }
    return 0;
  }
  var UP_WORDS = 'rall(?:y|ies)|ris(?:e|es|ing)|gain(?:s|ing)?|jump(?:s)?|surge(?:s)?|rebound(?:s)?|bullish|upside';
  var DOWN_WORDS = 'fall(?:s|ing)?|drop(?:s|ping)?|slip(?:s|ping)?|slide(?:s|ing)?|sell.?off|bearish|headwinds|downside|declin(?:e|es|ing)';
  var POS_GENERIC_RE = new RegExp('\\b(?:' + UP_WORDS + '|stronger)\\b');
  var NEG_GENERIC_RE = new RegExp('\\b(?:' + DOWN_WORDS + '|weaker)\\b');
  var HAWK_RE = /\b(hawkish|rate hike|hike rates|tightening|higher for longer)\b/;
  var DOVE_RE = /\b(dovish|rate cut|cut rates|easing)\b/;
  var FED_RE = /\b(fed|fomc|federal reserve)\b/;
  var ECB_RE = /\becb\b/;
  var BOE_RE = /\bboe\b/;
  var BOJ_RE = /\bboj\b/;
  var INVERSE_RE = /unemployment|jobless|claims|job cut|oil inventories|oil stocks/;
  var NAME_RE_CACHE = Object.create(null);
  function nameRegexes(names) {
    var c = NAME_RE_CACHE[names];
    if (!c) {
      c = NAME_RE_CACHE[names] = {
        pos: new RegExp('\\b(?:' + names + ')\\b.{0,35}\\b(?:' + UP_WORDS + ')\\b'),
        neg: new RegExp('\\b(?:' + names + ')\\b.{0,35}\\b(?:' + DOWN_WORDS + ')\\b')
      };
    }
    return c;
  }
  var TOPIC_PATTERNS = ['fed|fomc|rate|central bank','inflation|cpi|pce|ppi','jobs|payroll|nfp|claims|unemployment',
    'oil|crude|opec|energy','bitcoin|crypto|ethereum','gold|bullion|silver','gdp|growth|pmi|retail',
    'stock|nasdaq|earnings|equities'].map(function(k) { return new RegExp('\\b(?:'+k+')\\b', 'i'); });

  function textBias(text, symbol, currency) {
    var t = String(text || '').toLowerCase(), key = base(symbol);
    var names = /^XAU/.test(key) ? 'gold|bullion' : /^XAG/.test(key) ? 'silver' : /^BTC/.test(key) ? 'bitcoin|btc' : /^ETH/.test(key) ? 'ethereum|ether' : /USOIL|UKOIL/.test(key) ? 'oil|crude|brent|wti' : /USTEC/.test(key) ? 'nasdaq|tech stocks' : '';
    if (names) {
      var nre = nameRegexes(names);
      var pos = nre.pos.test(t);
      var neg = nre.neg.test(t);
      if (pos !== neg) return pos ? 1 : -1;
    }
    // Policy wording concerns the named central bank's currency, even when
    // the headline was classified as a gold story by the RSS parser.
    var policyCurrency = FED_RE.test(t) ? 'USD' : ECB_RE.test(t) ? 'EUR' : BOE_RE.test(t) ? 'GBP' : BOJ_RE.test(t) ? 'JPY' : currency;
    var hawk = HAWK_RE.test(t);
    var dove = DOVE_RE.test(t);
    if (hawk !== dove) return (hawk ? 1 : -1) * currencySign(symbol, policyCurrency);
    var positive = POS_GENERIC_RE.test(t);
    var negative = NEG_GENERIC_RE.test(t);
    return positive === negative ? 0 : (positive ? 1 : -1) * currencySign(symbol, currency);
  }
  function matchedTopics(text) {
    var t = String(text || '');
    var out = [];
    for (var i = 0; i < TOPIC_PATTERNS.length; i++) {
      if (TOPIC_PATTERNS[i].test(t)) out.push(TOPIC_PATTERNS[i]);
    }
    return out;
  }
  function estimate(input) {
    var ev = input.event, symbol = input.symbol, now = input.now || Date.now()/1000;
    var score = 0, evidence = [], basis = 'MODEL BIAS', q = input.quote, market = input.market;
    function add(n, reason) { if (n) { score += n; evidence.push(reason); } }
    var actual = ev.actual != null && ev.actual !== '' ? Number(ev.actual) : NaN;
    var forecast = ev.forecast != null && ev.forecast !== '' ? Number(ev.forecast) : NaN;
    var previous = ev.previous != null && ev.previous !== '' ? Number(ev.previous) : NaN;
    var comparison = isFinite(actual) && isFinite(forecast) ? forecast : previous;
    var value = isFinite(actual) ? actual : forecast;
    var evTitleLower = String(ev.title || '').toLowerCase();
    var inverse = INVERSE_RE.test(evTitleLower);
    var delta = isFinite(value) && isFinite(comparison) ? sign(value-comparison) * (inverse ? -1 : 1) : 0;
    if (delta && currencySign(symbol, ev.currency || ev.country)) {
      add(delta * currencySign(symbol, ev.currency || ev.country) * (isFinite(actual) ? 6 : 3),
        isFinite(actual) ? 'Actual vs forecast/previous surprise' : 'Forecast vs previous: pre-release estimate');
      if (isFinite(actual)) basis = 'RELEASE + MODEL';
    } else if (input.impact && side(input.impact.side || input.impact.direction)) {
      add(side(input.impact.side || input.impact.direction) * (isFinite(actual) ? 5 : 3), input.impact.reason || 'Market-specific event effect');
      if (isFinite(actual)) basis = 'RELEASE + MODEL';
    }
    add(textBias(ev.title + ' ' + (ev.description || ''), symbol, ev.currency || ev.country) * 2, 'Headline / RSS excerpt wording');
    var matched = matchedTopics(ev.title), seen = Object.create(null), related = [], contextScore = 0;
    var srcHeadlines = input.headlinesPreSorted
      ? (input.headlines || [])
      : (input.headlines || []).filter(function(h) { return h.ts <= now && h.ts >= now-86400; }).sort(function(a,b) { return b.ts-a.ts; });
    for (var hi = 0; hi < srcHeadlines.length && related.length < 40; hi++) {
      var h = srcHeadlines[hi];
      if (!h) continue;
      if (input.headlinesPreSorted && (h.ts > now || h.ts < now - 86400)) continue;
      var key = h._titleLower || String(h.title || '').toLowerCase();
      if (seen[key] || key === evTitleLower) continue;
      if (matched.length) {
        var topicHit = false;
        for (var ti = 0; ti < matched.length; ti++) { if (matched[ti].test(h.title || '')) { topicHit = true; break; } }
        if (!topicHit) continue;
      }
      seen[key] = true;
      var bias = h._bias !== undefined ? h._bias : textBias(h.title + ' ' + (h.description || ''), symbol, h.currency || h.country);
      if (bias) { contextScore += bias * Math.exp(-(now-h.ts)/21600); related.push({title:h.title,source:h.source,ts:h.ts}); }
    }
    add(clamp(contextScore,2), related.length + ' related published headline(s)');
    if (market && market.symbol === symbol && market.fresh && market.vote) {
      add(clamp(Number(market.vote.score) / 12 || 0, 1.5), 'Live multi-timeframe price structure');
    }
    if (q && q.symbol === symbol && now*1000-q.at <= 15000 && q.at <= now*1000+5000 && Number(q.price)>0) {
      add(clamp(Number(q.change) / 0.3 || 0, 1), 'TradingView daily price change');
      // Resolve an otherwise tied model using observed market continuation.
      if (!score) { score = Number(q.change) < 0 ? -0.05 : 0.05; evidence.push('Flat/mixed evidence: low-strength continuation bias'); }
    }
    if (!evidence.length) return null;
    var chosen = score >= 0 ? 'BUY' : 'SELL', prediction = input.prediction || {};
    var atr = market && market.symbol === symbol && market.fresh && market.reads.M5 ? Number(market.reads.M5.atr) : 0;
    var move = Math.abs(Number(prediction.move_abs != null ? prediction.move_abs : prediction.move_dollar) || 0);
    if (!move && atr) move = atr * ({high:3,medium:2,low:1.25}[ev.impact] || 1.25);
    return {market:symbol,side:chosen,direction:chosen === 'BUY' ? 'UP' : 'DOWN',move_abs:move,
      strength:Math.min(90,Math.round(20+Math.abs(score)*9)),score:Math.round(score*100)/100,
      basis:basis,reason:evidence.join(' · '),related:related.slice(0,4),at:now*1000};
  }
  window.NewsDirection = {estimate:estimate};
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
  function relevanceFor(ev, targetSymbol) {
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
  function directionalEstimate(ev, now) {
    if (!window.NewsDirection) return null;
    if (!locksRestored) {
      locksRestored = true;
      try { lockedDirections = JSON.parse(localStorage.getItem('softradex.news.bias.v1') || '{}'); } catch(e) {}
      if (!lockedDirections || typeof lockedDirections !== 'object') lockedDirections = Object.create(null);
    }
    var key = marketBase(symbol) + '|' + eventKey(ev), phase = phaseFor(ev, now);
    if (phase === 'running' && lockedDirections[key] && lockedDirections[key].expires > now) return lockedDirections[key];
    var wEst = workerEstimates[key];
    if (wEst && now - (wEst.at / 1000) <= 15) return wEst;
    var imp = impactFor(ev), state = window.SwingAI && window.SwingAI.state ? window.SwingAI.state() : null;
    var estimate = window.NewsDirection.estimate({symbol:symbol,event:ev,impact:imp,prediction:predictionFor(ev,imp),
      quote:liveQuote(),market:state,now:now,headlines:getRelevantHeadlines(now),headlinesPreSorted:true});
    if (phase === 'running' && estimate) {
      estimate.locked = true; estimate.expires = Number(ev.ts) + impactWindow(ev);
      lockedDirections[key] = estimate;
      Object.keys(lockedDirections).forEach(function(k) { if (lockedDirections[k].expires <= now) delete lockedDirections[k]; });
      try { localStorage.setItem('softradex.news.bias.v1',JSON.stringify(lockedDirections)); } catch(e) {}
    }
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
  function renderNewsList(id, rows, now) {
    var list = $(id);
    if (!list) return;
    var opened = Object.create(null);
    if (list.querySelectorAll) Array.prototype.forEach.call(list.querySelectorAll('details[open]'), function(el) { opened[el.dataset.key] = true; });
    var contextStarted = false;
    var html = rows.length ? rows.map(function(ev) {
      var prediction = directionalEstimate(ev, now);
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
        '<span class="mnt-summary-side ' + side.toLowerCase() + '" title="' + (prediction ? 'Estimated ' + side + ' bias · ' + prediction.strength + '% model strength' : 'Data unavailable') + '">' + (side === 'BUY' ? 'BUY ↑' : side === 'SELL' ? 'SELL ↓' : 'DATA') + '</span>' +
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
      var scroll = list.scrollTop;
      list.innerHTML = html;
      list.scrollTop = scroll;
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
    var workerApi = window.SoftCalcWorker;
    if (workerApi && typeof workerApi.estimateNews === 'function' && workerApi.available && workerApi.available() && rows.length > 12) {
      var qLive = liveQuote(), sLive = window.SwingAI && window.SwingAI.state ? window.SwingAI.state() : null;
      var qBucket = qLive ? Math.round(qLive.price / (qLive.price * 0.0005 || 1)) : 0;
      var wKey = symbol + '|' + newsMergeGen + '|' + qBucket + '|' + (sLive ? Number(sLive.updatedAt || 0) : 0);
      if (wKey !== lastWorkerKey) {
        lastWorkerKey = wKey;
        var reqGen = ++workerBatchGen;
        var reqSym = symbol;
        var reqItems = rows.map(function(ev) {
          var imp = impactFor(ev);
          return { key: marketBase(reqSym) + '|' + eventKey(ev), event: ev, impact: imp, prediction: predictionFor(ev, imp) };
        });
        workerApi.estimateNews({
          symbol: reqSym,
          now: now,
          quote: qLive,
          market: sLive,
          headlines: getRelevantHeadlines(now),
          items: reqItems
        }).then(function(res) {
          if (reqGen !== workerBatchGen || reqSym !== symbol || !res || !res.estimates) return;
          workerEstimates = res.estimates;
        }).catch(function() {});
      }
    }
    var active = rows.filter(function(ev) { return phaseFor(ev, now) === 'running'; });
    var recent = rows.filter(function(ev) { return recentHeadline(ev, now); });
    var headlines = rows.filter(function(ev) { return phaseFor(ev, now) === 'context'; }).sort(function(a,b) { return Number(b.ts)-Number(a.ts); }); var monitoredHeadlines = recent.length ? recent : (!active.length ? headlines.slice(0, 6) : []);
    var running = active.concat(monitoredHeadlines).sort(function(a,b) { return Number(b.ts)-Number(a.ts); });
    var upcoming = rows.filter(function(ev) { return phaseFor(ev, now) === 'upcoming'; });
    setText('mnt-market', symbol || 'MARKET');
    setText('rnews-market', symbol || 'MARKET');
    setText('mnt-count', upcoming.length + ' EVENTS · ' + headlines.length + ' HEADLINES' + (scanState === 'idle' ? '' : ' · ' + scanState.toUpperCase()));
    setText('rnews-count', active.length + ' RELEASES · ' + monitoredHeadlines.length + ' HEADLINES');
    renderNewsList('mnt-list', upcoming.concat(headlines), now);
    renderNewsList('running-news-list', running, now);
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
        if (st.news_omitted) {
          applyExnessBrowser();
          renderSources(visibleEvents(Date.now() / 1000));
          fetchExnessBrowser();
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
      if (changed) { newsSnapshotReady = false; eventReferences = Object.create(null); news = []; sourceStatus=[]; lastNewsHtml=Object.create(null); lastSourcesHtml=''; lastSourceSummary=''; newsServerSig=''; lastSavedSig=''; newsMergeGen++; cachedHeadlinesKey=''; workerEstimates=Object.create(null); workerBatchGen++; lastWorkerKey=''; lastQuoteNewsAt=0; lastQuoteNewsPrice=NaN; clearTimeout(quoteNewsTimer); quoteNewsTimer=null; if (newsAbort) newsAbort.abort(); clearTimeout(newsRetryTimer); newsRequest++; newsBusy = false; newsFailures=0; scanState='scanning'; }
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
    refreshTimer = setInterval(function() { if (!document.hidden) { fetchNews(); renderPressure(); } }, 15000);
    fetchNews(true); renderNews(); renderPressure(); updateMntTimers(); syncButton();
  }
  // Keep the impact countdown alive even when the workspace init is delayed
  // or the panel is re-mounted; a hidden browser tab is throttled by Chrome.
  setInterval(updateMntTimers, 1000);
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden) { updateMntTimers(); fetchNews(true); }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.ChartWorkspace = { relevanceFor: relevanceFor, impactFor: impactFor,
    directionFor: function(ev, market) { return ev && marketMatch(market, symbol) ? directionalEstimate(ev, Date.now()/1000) : null; },
    expand: function(){setExpanded(true);}, close: function(){setExpanded(false);}, refresh: function(){fetchNews(true);renderPressure();},
    newsState: function(){var now=Date.now()/1000; return {symbol:symbol,sources:sourceStatus,events:visibleEvents(now),
      signals:visibleEvents(now).map(function(e) { return {title:e.title,phase:phaseFor(e,now),estimate:directionalEstimate(e,now)}; })};} };
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
