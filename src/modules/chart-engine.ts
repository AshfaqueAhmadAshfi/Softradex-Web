// @ts-nocheck
/* Consolidated TypeScript module */
export function loadModule(): void {
  (window as any).SOFTRADEX_PUBLIC_ONLY = true;

// ==================== tv-chart.js ====================
/* ==========================================================================
   TradingView chart host (tv-chart.js)
   --------------------------------------------------------------------------
   The built-in candle chart is drawn by the browser from candles this server
   has to fetch first - on a busy shared host that first fetch is slow. This
   module puts TradingView's streaming chart in the same slot instead:

   - the embed is a plain iframe that TradingView's own CDN renders, so the
     page needs no third-party script and nothing can block it at load time,
   - our symbol tabs / timeframe tabs rewrite the frame's embed config, so the
     chart follows the market without touching the rest of the dashboard,
   - every market is mapped to a real TradingView symbol (exchange:SYMBOL),
   - a market TradingView has no symbol for keeps the built-in chart,
   - while TradingView is on screen the candle feed stops being asked for
     history (window.SOFT_TV_ACTIVE), so the host only serves the small
     ticker request the price ribbon needs.

   Nothing else changes: the ticker strip, pressure dials, whale tape and
   order-flow boards keep their own feeds and know nothing about this file.
   ========================================================================== */
(function () {
  'use strict';

  var STORAGE_KEY = 'softradex.chart.tv';   // '1' TradingView, '0' built-in
  var FRAME_BASE = 'https://www.tradingview-widget.com/embed-widget/advanced-chart/';

  // The frame is third-party: when it is blocked (ISP/regional filtering, a
  // captive portal, an ad-blocker, no internet) it either never fires `load`
  // or fires it over TradingView's own error page. Both used to leave the
  // chart slot empty forever with the toggle still reading "ON", so the embed
  // is now watched: no answer inside LOAD_TIMEOUT_MS = fall back to the
  // built-in candle chart and say why.
  var LOAD_TIMEOUT_MS = 12000;
  var RETRY_AFTER_MS = 60000;   // automatic second chance after a failure
  var MAX_AUTO_RETRIES = 2;     // then only the Retry button / toggle retries

  function $(id) { return document.getElementById(id); }

  /* ---------------------------------------------------- symbol mapping --- */
  // Markets whose TradingView symbol cannot be derived from the broker name.
  var EXPLICIT = {
    // metals
    XAUUSDm: 'OANDA:XAUUSD',
    XAGUSDm: 'OANDA:XAGUSD',
    XAUEURm: 'OANDA:XAUEUR',
    XAUGBPm: 'OANDA:XAUGBP',
    XPTUSDm: 'OANDA:XPTUSD',
    XPDUSDm: 'OANDA:XPDUSD',
    // energy
    USOILm: 'TVC:USOIL',
    UKOILm: 'TVC:UKOIL',
    XNGUSDm: 'NYMEX:NG1!',
    // indices
    USTECm: 'NASDAQ:NDX',
    US500m: 'SP:SPX',
    US30m: 'DJ:DJI',
    DXY: 'TVC:DXY',
    DE30m: 'XETR:DAX',
    FR40m: 'EURONEXT:CAC',
    AUS200m: 'ASX:AXJO',
    // US stocks - qualified with the exchange they actually trade on
    AAPLm: 'NASDAQ:AAPL',
    MSFTm: 'NASDAQ:MSFT',
    AMZNm: 'NASDAQ:AMZN',
    GOOGLm: 'NASDAQ:GOOGL',
    TSLAm: 'NASDAQ:TSLA',
    NVDAm: 'NASDAQ:NVDA',
    METAm: 'NASDAQ:META',
    INTCm: 'NASDAQ:INTC',
    AMDm: 'NASDAQ:AMD',
    NEFLm: 'NASDAQ:NFLX',
    JPMm: 'NYSE:JPM',
    BAm: 'NYSE:BA',
    DISm: 'NYSE:DIS',
    NKEm: 'NYSE:NKE',
    COINm: 'NASDAQ:COIN',
    PFEm: 'NYSE:PFE',
    Vm: 'NYSE:V',
    MAm: 'NYSE:MA',
    KOm: 'NYSE:KO',
    WMTm: 'NASDAQ:WMT',
    XOMm: 'NYSE:XOM'
  };

  // Exotic crosses live on the IDC feed rather than on OANDA.
  var FOREX_EXOTIC = {
    USDSGD: 1, USDHKD: 1, USDTRY: 1, USDZAR: 1, USDMXN: 1, USDCNH: 1,
    USDSEK: 1, USDNOK: 1, USDDKK: 1, USDPLN: 1, USDTHB: 1, EURTRY: 1,
    EURSGD: 1
  };

  // Our timeframe buttons -> TradingView interval tokens.
  var TF_MAP = { '1m': '1', '5m': '5', '15m': '15', '1h': '60', '4h': '240', '1d': 'D' };

  // 9 MA + 21 MA + the MT5 ZigZag, drawn on every TradingView frame. The
  // widget takes studies from the same embed config as the symbol, so all
  // three follow the market/timeframe automatically.
  //
  // `inputs.length` is what sets each MA period: without it both studies load
  // with the default length (9) and look like a single line.
  //
  // ZigZag maps the MT5 parameters: period -> depth 12 and deviation 5 are
  // real inputs of TradingView's ZigZag (the widget legend shows "Zigzag 5
  // 12", so both are accepted). MT5's third parameter, backstep 3, has no
  // counterpart in TradingView's built-in study - it is sent for
  // completeness and ignored there rather than silently dropped here.
  var STUDIES = [
    { id: 'MASimple@tv-basicstudies', inputs: { length: 9 } },
    { id: 'MASimple@tv-basicstudies', inputs: { length: 21 } },
    { id: 'ZigZag@tv-basicstudies', inputs: { depth: 12, deviation: 5, backstep: 3 } }
  ];

  // Returns 'EXCHANGE:SYMBOL', or '' when TradingView has nothing for it -
  // the caller then leaves the built-in chart in place instead of showing a
  // TradingView "no data" error.
  function tvSymbolFor(key, meta) {
    var k = String(key || '').trim();
    var bare = k.replace(/m$/i, '').toUpperCase();
    if (EXPLICIT[k]) return EXPLICIT[k];
    if (EXPLICIT[bare]) return EXPLICIT[bare];
    if (EXPLICIT[bare + 'm']) return EXPLICIT[bare + 'm'];
    var kind = String((meta && meta.kind) || '').toLowerCase();
    // XAUUSDm -> XAUUSD, BTCUSDTm -> BTCUSDT, Vm -> V, ChinaHm -> ChinaH
    var base = bare;
    if (base === 'XAUUSD247' || base === 'XAUUSD') return 'OANDA:XAUUSD';

    if (kind === 'crypto') {
      // BTCUSDT -> BTC, ETHUSD -> ETH, DOGEUSD -> DOGE
      var coin = base.replace(/USDT$/, '').replace(/USD$/, '');
      if (/^[A-Z0-9]{2,10}$/.test(coin)) return 'BINANCE:' + coin + 'USDT';
      return '';
    }
    if (kind === 'forex') {
      if (!/^[A-Z]{6}$/.test(base)) return '';
      return (FOREX_EXOTIC[base] ? 'FX_IDC:' : 'OANDA:') + base;
    }
    // metals quoted against EUR/GBP/AUD, HK50 / UK100 / JP225 and friends
    // have no entry we can trust -> '' = built-in chart stays.
    return '';
  }

  // The embed reads its whole configuration from the URL fragment, so a new
  // symbol/timeframe only changes the fragment. That alone does NOT reload the
  // widget (a fragment-only src change is a same-document navigation), so the
  // caller passes a one-off marker that changes the document URL instead.
  function currentTheme() {
    return document.documentElement.classList.contains('sx-dark') ? 'dark' : 'light';
  }

  function frameKey() { return tvSymbol + '|' + tvInterval + '|' + currentTheme(); }

  function frameSrc(symbol, interval, marker) {
    var cfg = encodeURIComponent(JSON.stringify({
      autosize: true,
      width: '100%',
      height: '100%',
      symbol: symbol,
      interval: interval,
      timezone: 'Etc/UTC',
      style: '1',                 // candles
      theme: currentTheme(),
      studies: STUDIES,           // 9 MA and 21 MA overlay
      hide_side_toolbar: true,    // the dashboard already has the tabs
      allow_symbol_change: false,
      withdateranges: false,
      save_image: false,
      support_host: 'https://www.tradingview.com'
    }));
    return FRAME_BASE + (marker ? '?locale=en&sdx=' + marker : '?locale=en') + '#' + cfg;
  }

  /* ------------------------------------------------------------ state ---- */
  var wrapper = null;        // .binance-chart-wrapper (flex column)
  var box = null;            // #tv-chart-box
  var frame = null;          // the embed <iframe>
  var btn = null;            // toolbar toggle
  var notice = null;         // "TradingView unavailable" banner

  var tvSymbol = 'OANDA:XAUUSD';
  var tvInterval = '5';
  var hasMapping = true;     // current market has a TradingView symbol
  // The dashboard now has a single chart: TradingView. The old built-in
  // canvas is never brought back (the indicator studies that needed it are
  // hidden as well).
  var wantActive = true;

  var frameReady = false;    // the current src actually painted something
  var tvBroken = false;      // embed unreachable -> the built-in chart draws
  var brokenReason = '';
  var loadTimer = null;
  var retryTimer = null;
  var autoRetries = 0;
  var frameSeq = 0;          // bumps on every real chart load (see frameSrc)
  var lastW = 0;             // last laid-out slot size - the embed is re-fitted
  var lastH = 0;             // when it changes (see scheduleFit)
  var frameW = 0;            // ... and its own size, because the indicator
  var frameH = 0;            // stack hides the frame without resizing the box
  var frameWatcher = null;
  var fitTimer = null;
  var quoteBusy = false;      // one /api/chart/tvquote request at a time
  var quoteRequest = null;

  function clearLoadTimer() {
    if (loadTimer) { clearTimeout(loadTimer); loadTimer = null; }
  }

  function clearRetry() {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  }

  function armLoadTimer() {
    clearLoadTimer();
    loadTimer = setTimeout(function () {
      loadTimer = null;
      if (!frameReady) markBroken('timeout');
    }, LOAD_TIMEOUT_MS);
  }

  /* -------------------------------------------------- failure handling --- */
  // Called when the embed never answers. The built-in candle chart is put back
  // on screen (it draws from this server, so it works without TradingView) and
  // the reason is shown instead of an empty grey box.
  function markBroken(reason) {
    clearLoadTimer();
    if (tvBroken) return;
    tvBroken = true;
    frameReady = false;
    brokenReason = reason || 'timeout';
    showNotice();
    applyVisibility();
    if (autoRetries < MAX_AUTO_RETRIES) {
      autoRetries++;
      clearRetry();
      retryTimer = setTimeout(function () { retryTimer = null; retryNow(); }, RETRY_AFTER_MS);
    }
  }

  function markOk() {
    clearLoadTimer();
    clearRetry();
    frameReady = true;
    autoRetries = 0;
    if (tvBroken) {
      tvBroken = false;
      brokenReason = '';
      hideNotice();
    }
    syncVisible();
    // Always refresh the visibility: the loading placeholder is only removed
    // by the `tv-frame-ready` class, which applyVisibility() owns. Returning
    // early on a healthy frame left "Loading …" painted on top of a chart that
    // had already drawn - it disappeared only after toggling TradingView
    // off and on again.
    applyVisibility();
  }

  // Reload the same symbol/timeframe: re-assigning an identical src is a
  // no-op for the browser, so the dataset guard has to be cleared first.
  function retryNow() {
    clearRetry();
    clearLoadTimer();
    tvBroken = false;
    frameReady = false;
    brokenReason = '';
    hideNotice();
    if (frame) {
      frame.dataset.tv = '';
      applyFrame();
    } else {
      mountWidget();
    }
    applyVisibility();
  }

  function ensureNotice() {
    if (notice && notice.isConnected) return notice;
    if (!wrapper) return null;
    notice = document.createElement('div');
    notice.className = 'tv-offline-notice';
    notice.id = 'tv-offline-notice';
    notice.setAttribute('role', 'status');
    notice.innerHTML = '<span class="tv-offline-icon">⚠</span>' +
      '<span class="tv-offline-text">TradingView did not answer.</span>' +
      '<button type="button" class="tv-offline-retry">Retry TradingView</button>';
    var retryBtn = notice.querySelector('.tv-offline-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        autoRetries = 0;
        retryNow();
      });
    }
    wrapper.appendChild(notice);
    return notice;
  }

  function showNotice() {
    var el = ensureNotice();
    if (!el) return;
    var text = el.querySelector('.tv-offline-text');
    if (text) {
      text.textContent = brokenReason === 'offline'
        ? 'No internet connection - TradingView cannot load. Retry when the connection is back.'
        : 'TradingView did not answer (blocked or offline). Retry TradingView.';
    }
    el.classList.add('show');
  }

  function hideNotice() {
    if (notice) notice.classList.remove('show');
  }

  function onFrameLoad() {
    // A freshly appended iframe fires one synthetic load for its blank
    // document before any src is applied - only the real embed counts.
    if (!frame) return;
    var src = frame.getAttribute('src') || '';
    if (src.indexOf('tradingview-widget.com') === -1) return;
    markOk();
  }

  // The dashboard mounts this module while #dash is still display:none (the
  // unlock gate) and a 0x0 iframe is never painted by TradingView - the slot
  // stayed on "loading" until the toggle remounted it. Load the embed the
  // first time the slot has a real size instead.
  var sizeWatcher = null;
  var sizePolls = 0;

  function boxHasSize() {
    return !!(box && box.clientWidth > 4 && box.clientHeight > 4);
  }

  function watchBoxSize() {
    if (!box) return;
    if (typeof ResizeObserver !== 'undefined') {
      if (sizeWatcher) return;
      sizeWatcher = new ResizeObserver(function () {
        if (!boxHasSize() || !wantActive || !hasMapping) return;
        if (!frame) { mountWidget(); return; }
        if (frame.dataset.tv !== frameKey() || !frameReady) { applyFrame(); return; }
        var w = box.clientWidth, h = box.clientHeight;
        // Once TradingView has loaded cleanly, do not reload its iframe on layout
        // reflows — reloading resets the user's zoom back to default.
        if (Math.abs(w - lastW) <= 24 && Math.abs(h - lastH) <= 24) return;
        lastW = w;
        lastH = h;
        if (!frameReady) scheduleFit();
      });
      sizeWatcher.observe(box);
      return;
    }
    // no ResizeObserver: poll for a bounded two minutes
    if (sizePolls >= 120) return;
    sizePolls++;
    setTimeout(function () {
      if (!boxHasSize()) { watchBoxSize(); return; }
      sizePolls = 0;
      if (wantActive && hasMapping) applyFrame();
    }, 1000);
  }

  /* --------------------------------------------------- re-fit on resize --- */
  // The embed lays its bars out and fits its price scale once, for the size it
  // is given. When the dashboard re-flows afterwards (sidebar, workspace dock,
  // indicator stack, window resize) an already-drawn widget keeps that old
  // geometry: the live candles slide to the left and the current price ends up
  // outside the visible scale - the "I have to look below the chart to see the
  // price" report. Re-opening the embed once the new size has settled makes
  // TradingView fit the range to the last bar again.
  function scheduleFit() {
    if (fitTimer) clearTimeout(fitTimer);
    fitTimer = setTimeout(function () {
      fitTimer = null;
      if (!frame || !wantActive || !hasMapping || !boxHasSize()) return;
      frame.dataset.tv = '';
      applyFrame();
    }, 700);
  }

  /* ------------------------------------------------- TradingView quote --- */
  // The header price has to be the price the candles are drawn at. MT5 quotes
  // the broker's own feed, which sits a few tenths of a percent away from the
  // OANDA feed the embed shows; this asks the server for the TradingView quote
  // of the same instrument and publishes it for the ribbon.
  function pollTvQuote() {
    if (document.hidden) return null;
    if (quoteBusy || !ourSymbol || !tvSymbol) return window.__SOFT_QUOTE_INFLIGHT && window.__SOFT_QUOTE_INFLIGHT.promise || null;
    var requestedSymbol = ourSymbol, requestedTv = tvSymbol;
    var controller = new AbortController();
    quoteRequest = controller;
    quoteBusy = true;
    var timeout = setTimeout(function () { controller.abort(); }, 10000);
    var p = fetch('/api/chart/tvquote?symbol=' + encodeURIComponent(requestedSymbol) + '&tv_symbol=' + encodeURIComponent(requestedTv), {
      cache: 'no-store', signal: controller.signal
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (controller !== quoteRequest || requestedSymbol !== ourSymbol || requestedTv !== tvSymbol) return null;
        if (!d || !d.ok || !(Number(d.price) > 0) || d.tv_symbol !== requestedTv) return null;
        window.SOFT_TV_QUOTE = {
          symbol: requestedSymbol,
          tv_symbol: d.tv_symbol,
          price: Number(d.price),
          change: Number(d.change) || 0,
          high: Number(d.high) || 0,
          low: Number(d.low) || 0,
          market_open: d.market_open !== false,
          tv_digits: Number.isInteger(d.tv_digits) ? Number(d.tv_digits) : undefined,
          exchange_ts: Number(d.exchange_ts) || 0,
          at: Number(d.updated) > 0 ? Number(d.updated) * 1000 : Date.now(),
          source: 'TradingView'
        };
        window.dispatchEvent(new CustomEvent('chart:tv-quote', { detail: window.SOFT_TV_QUOTE }));
        return window.SOFT_TV_QUOTE;
      })
      .catch(function () { return null; /* keep the last good quote */ })
      .finally(function () {
        clearTimeout(timeout);
        if (controller === quoteRequest) { quoteBusy = false; quoteRequest = null; }
        if (window.__SOFT_QUOTE_INFLIGHT && window.__SOFT_QUOTE_INFLIGHT.promise === p) window.__SOFT_QUOTE_INFLIGHT = null;
      });
    window.__SOFT_QUOTE_INFLIGHT = { symbol: requestedSymbol, tv_symbol: requestedTv, at: Date.now(), promise: p };
    return p;
  }

  function startQuoteFeed() {
    pollTvQuote();
    setInterval(function () {
      if (!document.hidden) pollTvQuote();
    }, 2500);
  }

  function mountWidget() {
    if (frame || !box) return;
    frame = document.createElement('iframe');
    frame.className = 'tv-chart-frame';
    frame.setAttribute('title', 'TradingView chart');
    frame.setAttribute('frameborder', '0');
    frame.setAttribute('allowtransparency', 'true');
    // The vendor widget still registers unload handlers. Explicitly opt its
    // own origin into this deprecated feature, leaving the rest of the page
    // and unrelated origins under the browser's default permissions policy.
    frame.setAttribute('allow', "unload 'src'");
    // TradingView refuses to draw when the embed arrives with a referrer it
    // does not like (an IP host such as http://192.168.x.x/ or
    // http://127.0.0.1:8787 shows "Something went wrong" inside the frame).
    // The chart is read-only, so nothing here needs a referrer.
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.addEventListener('load', onFrameLoad);
    frame.addEventListener('error', function () { markBroken('blocked'); });
    box.appendChild(frame);
    // Defer initial geometry measurements to the next animation frame so
    // bootDashboardModules does not trigger a synchronous full-document layout.
    if (typeof ResizeObserver !== 'undefined') {
      frameWatcher = new ResizeObserver(function () {
        var w = frame.clientWidth, h = frame.clientHeight;
        if (w <= 4 || h <= 4) return;
        if (Math.abs(w - frameW) <= 24 && Math.abs(h - frameH) <= 24) return;
        frameW = w;
        frameH = h;
        syncVisible();
        if (!frameReady) return;      // the load in flight will paint this size
        scheduleFit();
      });
      frameWatcher.observe(frame);
    }
    requestAnimationFrame(function () {
      if (!frame || !box) return;
      lastW = box.clientWidth;
      lastH = box.clientHeight;
      frameW = frame.clientWidth;
      frameH = frame.clientHeight;
      applyFrame();
    });
  }

  function isIndicatorStackActive() {
    return !!(wrapper && wrapper.classList.contains('ind-stack-on'));
  }

  // Point the frame at the current symbol/timeframe - a no-op when it already
  // shows them, so a redraw of the dashboard does not reload the chart.
  function applyFrame() {
    if (!frame || isIndicatorStackActive()) return;
    // Still hidden (locked dashboard): wait for the slot to get a size.
    if (!boxHasSize()) { watchBoxSize(); return; }
    var key = frameKey();
    if (frame.dataset.tv === key) {
      // Already requested - keep the watchdog armed if the frame is still
      // silent, otherwise a re-entrant applyVisibility() would disarm it.
      if (!frameReady && !loadTimer) armLoadTimer();
      return;
    }
    frame.dataset.tv = key;
    frameReady = false;
    if (box) box.classList.remove('tv-frame-ready');
    armLoadTimer();
    // The embed keeps its whole config in the URL fragment, so switching a
    // symbol only changes the fragment - and a fragment-only src assignment is
    // a same-document navigation: the widget never reloads and the chart kept
    // drawing the first market. A one-off query marker makes it a real load.
    frameSeq++;
    frame.src = frameSrc(tvSymbol, tvInterval, frameSeq);
  }

  /* ------------------------------------------- which chart is on screen -- */
  // Visibility only controls layout. The embed and the indicator stack share
  // the same TradingView instrument and quote regardless of this flag.
  function syncVisible() {
    var shown = !!(frame && frame.isConnected && frame.offsetParent !== null &&
      getComputedStyle(frame).display !== 'none');
    if (window.SOFT_TV_VISIBLE === shown) return;
    window.SOFT_TV_VISIBLE = shown;
    window.dispatchEvent(new CustomEvent('chart:tv-visible', { detail: { visible: shown } }));
  }

  function updateButton() {
    if (!btn) return;
    var show = wantActive && hasMapping && !tvBroken;
    btn.classList.toggle('active', show);
    btn.classList.toggle('tv-na', wantActive && (!hasMapping || tvBroken));
    var label = $('tv-toggle-text');
    if (label) {
      label.textContent = show ? 'TradingView · ON'
        : (tvBroken ? 'TradingView · retry'
          : (wantActive ? 'TradingView · n/a' : 'TradingView · OFF'));
    }
    btn.title = tvBroken
      ? 'TradingView could not be reached - the built-in chart is on screen; click to try TradingView again'
      : (!hasMapping
        ? 'TradingView has no symbol for this market - the built-in chart stays'
        : 'Switch the candle chart between TradingView and the built-in chart');
  }

  // `persist` false = a temporary switch: the indicator layer needs the
  // built-in chart to draw the ported studies, but the reader's TradingView
  // preference must survive a reload.
  function setWantActive(value, persist) {
    wantActive = !!value;
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, wantActive ? '1' : '0'); } catch (e) {}
    }
    applyVisibility();
  }

  function applyVisibility() {
    // TradingView is the only chart. Even when the embed fails we keep its
    // slot and show the retry notice; the built-in canvas never appears.
    if (wrapper) wrapper.classList.add('tv-mode');
    if (box) {
      box.classList.toggle('tv-frame-ready', frameReady);
      box.style.display = 'block';
    }
    var canvasBox = wrapper && wrapper.querySelector('.binance-canvas-box');
    if (canvasBox) canvasBox.style.display = 'none';

    window.SOFT_TV_ACTIVE = true;
    updateButton();
    window.dispatchEvent(new CustomEvent('chart:tv-mode', { detail: { active: true } }));

    requestAnimationFrame(function () {
      if (hasMapping && !isIndicatorStackActive()) {
        watchBoxSize();      // a hidden slot cannot paint the embed
        mountWidget();       // mounts + arms the load watchdog
        applyFrame();
      }
      syncVisible();
    });
  }

  /* ------------------------------------------------------- cross chip --- */
  // The hosted TradingView widget ignores style overrides (`studies_overrides`
  // changes nothing - checked pixel by pixel), so its two moving averages
  // cannot be recoloured from here. The crossover, though, is ours to compute:
  // MA9 vs MA21 from the same candle feed the built-in chart uses, shown as a
  // chip beside the chart toggle so the golden/death cross is readable at a
  // glance while the TradingView frame is on screen.
  var badge = null;
  var crossTimer = null;
  var crossSeq = 0;
  var ourSymbol = '';
  var ourTf = '';

  function smaAt(closes, i, n) {
    if (i < n - 1) return null;
    var sum = 0;
    for (var k = i - n + 1; k <= i; k++) sum += closes[k];
    return sum / n;
  }

  function ensureBadge() {
    if (badge && badge.isConnected) return badge;
    var anchor = $('tv-chart-toggle');
    if (!anchor || !anchor.parentNode) return null;
    badge = document.createElement('div');
    badge.className = 'tv-cross-badge pending';
    badge.id = 'tv-cross-badge';
    badge.title = 'MA 9 vs MA 21 crossover on the chart you are looking at';
    badge.innerHTML = '<span class="tv-cross-label">MA 9 / 21</span>' +
      '<span class="tv-cross-sub">reading candles&hellip;</span>';
    anchor.parentNode.insertBefore(badge, anchor.nextSibling);
    return badge;
  }

  // bars arrive as [time, open, high, low, close, volume]. Returns the current
  // side of the crossover plus the bar where it last flipped, or null when the
  // feed gave us too little history to average over.
  function analyseCross(bars) {
    if (!Array.isArray(bars)) return null;
    var closes = [], stamps = [];
    for (var i = 0; i < bars.length; i++) {
      var bar = bars[i];
      var close = Array.isArray(bar) ? bar[4] : Number(bar && bar.c);
      var time = Array.isArray(bar) ? bar[0] : Number(bar && bar.t);
      if (!isFinite(close)) return null;
      closes.push(close);
      stamps.push(time);
    }
    var last = closes.length - 1;
    if (last < 21) return null;

    function diff(i) {
      var fast = smaAt(closes, i, 9);
      var slow = smaAt(closes, i, 21);
      if (fast === null || slow === null) return 0;
      return fast - slow;
    }

    var now = diff(last);
    var crossAt = 0;
    for (var j = 21; j <= last; j++) {
      var d = diff(j), prev = diff(j - 1);
      if (prev !== 0 && d !== 0 && ((prev < 0 && d > 0) || (prev > 0 && d < 0))) {
        crossAt = stamps[j];   // the most recent flip inside the window
      }
    }
    return {
      golden: now > 0,
      crossAt: crossAt,
      ma9: smaAt(closes, last, 9),
      ma21: smaAt(closes, last, 21)
    };
  }

  function fmtPrice(value) {
    if (!isFinite(value)) return '--';
    return value >= 1000 ? value.toFixed(2) : value.toFixed(value < 10 ? 5 : 3);
  }

  function paintBadge(result) {
    var box = ensureBadge();
    if (!box || !result) return;
    box.classList.toggle('golden', !!result.golden);
    box.classList.toggle('death', !result.golden);
    box.classList.remove('pending');
    var label = box.querySelector('.tv-cross-label');
    if (label) label.textContent = result.golden ? 'GOLDEN CROSS' : 'DEATH CROSS';
    var sub = box.querySelector('.tv-cross-sub');
    if (sub) {
      var when = result.crossAt ? new Date(result.crossAt) : null;
      var hh = when ? ('0' + when.getUTCHours()).slice(-2) + ':' +
        ('0' + when.getUTCMinutes()).slice(-2) : '';
      sub.textContent = (hh ? 'crossed ' + hh + ' \u00b7 ' : '') +
        'MA9 ' + fmtPrice(result.ma9) + ' \u00b7 MA21 ' + fmtPrice(result.ma21);
    }
  }

  async function refreshCross() {
    var box = ensureBadge();
    if (!box) return;
    var term = window.SoftradeXTerminal;
    var sym = (term && typeof term.getCurrentSymbol === 'function')
      ? term.getCurrentSymbol() : ourSymbol;
    var tf = (term && typeof term.getInterval === 'function')
      ? term.getInterval() : ourTf;
    if (!sym || !tf) return;
    var token = ++crossSeq;
    try {
      var res = await fetch('/api/chart/candles?symbol=' + encodeURIComponent(sym) +
        '&tf=' + encodeURIComponent(tf) + '&count=60', { cache: 'no-store' });
      if (!res.ok || token !== crossSeq) return;
      var data = await res.json();
      if (token !== crossSeq) return;
      paintBadge(analyseCross(data && data.bars));
    } catch (e) {
      // keep the last label - a dropped request must not blank the chip
    }
  }

  function startCrossFeed() {
    ensureBadge();
    void refreshCross();
    if (crossTimer) clearInterval(crossTimer);
    // 60 bars every 20s is a few KB - the cross only changes on a new bar,
    // so anything faster would be traffic without information.
    crossTimer = setInterval(function () {
      if (!document.hidden) void refreshCross();
    }, 20000);
  }

  /* ------------------------------------------------------------- wiring -- */
  function init() {
    wrapper = document.querySelector('#binance-terminal-section .binance-chart-wrapper');
    box = $('tv-chart-box');
    btn = $('tv-chart-toggle');
    if (!wrapper || !box) return;

    if (btn) {
      btn.addEventListener('click', function () {
        // While the embed is known-bad the button means "try again", so a user
        // who clicks it is not silently flipped back to a broken preference.
        if (tvBroken) { autoRetries = 0; retryNow(); return; }
        setWantActive(!wantActive, true);
      });
    }

    // Network state changes are the usual reason a third-party embed dies, so
    // react to them instead of waiting for the next timer.
    window.addEventListener('offline', function () {
      if (window.SOFT_TV_ACTIVE === true || (wantActive && hasMapping)) markBroken('offline');
    });
    window.addEventListener('online', function () {
      if (!tvBroken) return;
      autoRetries = 0;
      retryNow();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      if (tvBroken && autoRetries < MAX_AUTO_RETRIES) {
        autoRetries++;
        retryNow();
        return;
      }
      // ResizeObserver notifications only arrive while the page is being
      // painted, so a chart revealed while the tab was in the background kept
      // its old geometry until something else resized it. Re-check on return.
      if (frame && frameReady) {
        var w = frame.clientWidth, h = frame.clientHeight;
        if (w > 4 && h > 4 && (Math.abs(w - frameW) > 24 || Math.abs(h - frameH) > 24)) {
          frameW = w;
          frameH = h;
          scheduleFit();
        }
      }
    });

    // The terminal announces every market change - map it and follow along.
    window.addEventListener('chart:market', function (ev) {
      var detail = ev.detail || {};
      var meta = detail.meta || {};
      var key = detail.symbol || meta.symbol || '';
      if (key !== ourSymbol) {
        if (quoteRequest) quoteRequest.abort();
        quoteRequest = null;
        quoteBusy = false;
        window.SOFT_TV_QUOTE = null;
      }
      ourSymbol = key;
      void refreshCross();       // new market = new candles = new crossover
      var mapped = tvSymbolFor(key, meta);
      if (mapped) {
        tvSymbol = mapped;
        hasMapping = true;
      } else {
        tvSymbol = '';
        hasMapping = false;
      }
      applyVisibility();
      pollTvQuote();
    });

    window.addEventListener('chart:interval', function (ev) {
      var tf = (ev.detail && ev.detail.tf) || '';
      ourTf = tf;
      void refreshCross();
      if (TF_MAP[tf]) {
        tvInterval = TF_MAP[tf];
        applyVisibility();
      }
    });

    // The dashboard opens on the TradingView chart, full stop: a stored
    // "built-in chart" preference from an older visit no longer hides it.
    wantActive = true;
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) {}

    // The indicator stack shows/hides the frame by toggling a class on the
    // wrapper, so lazy-mount TradingView when the stack turns off.
    if (typeof MutationObserver !== 'undefined' && wrapper) {
      new MutationObserver(function () {
        if (!isIndicatorStackActive() && wantActive && hasMapping) {
          watchBoxSize();
          mountWidget();
          applyFrame();
        }
        syncVisible();
      }).observe(wrapper, {
        attributes: true,
        attributeFilter: ['class']
      });
    }

    applyVisibility();
    startCrossFeed();
    startQuoteFeed();
    window.addEventListener('softradex:theme', function () {
      if (box && frame && !isIndicatorStackActive()) applyFrame();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Small surface for debugging from the browser console.
  window.TvChartHost = {
    symbolFor: tvSymbolFor,
    current: function () {
      return {
        symbol: tvSymbol,
        interval: tvInterval,
        active: window.SOFT_TV_ACTIVE === true,
        ready: frameReady,
        broken: tvBroken,
        reason: brokenReason
      };
    },
    retry: function () { autoRetries = 0; retryNow(); },
    refreshQuote: pollTvQuote,
    // Re-open the embed at the size it has now (fresh price scale, last bar in
    // view). The resize/visibility paths call this on their own.
    refit: function () { scheduleFit(); },
    // Switch the chart without touching the saved preference (the indicator
    // layer uses this so TradingView comes back on the next reload).
    setActive: function (value, persist) { setWantActive(value, persist !== false); }
  };
})();


// ==================== chart-overlay.js ====================
/* ==========================================================================
   Chart overlay (chart-overlay.js)
   --------------------------------------------------------------------------
   Two live cards that sit INSIDE the TradingView chart box, because the
   TradingView embed draws its own canvas and the built-in overlay (the news
   rails drawn by chart-news-events.js) cannot paint on top of it:

   1. WHALES - the big prints of the charted market, split into BUY and SELL,
      with the participation of each side and the last few prints.
      Source: /api/chart/tape (the same tape the whale board reads).

   2. NEWS - the next economic events that carry a predicted move for THIS
      market, each with its direction and the amount it is expected to move,
      plus the summed UP / DOWN expectation.
      Source: window.ChartNewsOverlay.getEvents() - the calendar the news
      section already refreshes - with /api/state as the fallback.

   Nothing here invents numbers: a row without a predicted move is not given
   one, and the card simply stays empty until the feeds answer.
   ========================================================================== */
(function () {
  'use strict';

  var TAPE_MS = 12000;        // whale tape refresh
  var NEWS_MS = 20000;        // news card repaint
  var MAX_NEWS = 50;          // all selected-market events in the 24h window
  var MAX_WHALES = 6;
  var HORIZON_SEC = 24 * 3600;

  var $ = function (id) { return document.getElementById(id); };

  var root = null;
  var box = null;
  var symbol = '';
  var digits = 2;

  // LARGE FLOW is a floating readout: the reader can park it anywhere over the
  // chart (TradingView frame or the indicator panes) and the spot survives
  // reloads. Stored as a fraction of the free travel so it stays put when the
  // chart box changes size between the two chart modes.
  var DRAG_KEY = 'softradex.chart.flowcard';
  var dragPos = null;
  var dragging = false;

  var prints = [];
  var tapeAt = 0;
  var tapeBusy = false;

  var newsRows = [];
  var newsSig = '';
  var newsBusy = false;

  /* ----------------------------------------------------------- helpers -- */
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function marketKey(v) {
    return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function marketMatch(a, b) {
    var x = marketKey(a);
    var y = marketKey(b);
    if (!x || !y) return false;
    if (x === y) return true;
    var short = x.length <= y.length ? x : y;
    var long = x.length <= y.length ? y : x;
    return short.length >= 5 && long.indexOf(short) === 0 && long.length - short.length <= 4;
  }

  function fmtPrice(p) {
    var v = Number(p);
    if (!isFinite(v)) return '—';
    var d = v >= 1000 ? 2 : digits;
    return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function fmtClock(ms) {
    var d = new Date(Number(ms) || Date.now());
    return String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
  }

  function fmtMin(ts) {
    var mins = Math.max(0, Math.round((ts - Date.now() / 1000) / 60));
    if (mins < 60) return 'in ' + mins + 'm';
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    if (h < 24) return m ? 'in ' + h + 'h ' + m + 'm' : 'in ' + h + 'h';
    return 'in ' + Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
  }

  function fmtMoney(v) {
    var n = Math.abs(Number(v) || 0);
    if (!isFinite(n) || n === 0) return '';
    var txt = n >= 100 ? n.toFixed(0) : n >= 1 ? n.toFixed(2) : n.toFixed(4);
    return txt.replace(/\.?0+$/, '');
  }

  function normSide(v) {
    var s = String(v || '').toLowerCase();
    if (s === 'buy' || s === 'up' || s === 'bullish') return 'UP';
    if (s === 'sell' || s === 'down' || s === 'bearish') return 'DOWN';
    return '';
  }

  /* ------------------------------------------------------------- whales -- */
  function fetchTape() {
    if (tapeBusy || !symbol) return;
    tapeBusy = true;
    fetch('/api/chart/tape?symbol=' + encodeURIComponent(symbol) + '&limit=40', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || symbol !== (data.symbol || symbol)) return;
        var meta = data.meta || null;
        if (meta && meta.digits !== undefined) digits = Number(meta.digits) || digits;
        prints = Array.isArray(data.prints) ? data.prints : [];
        tapeAt = Date.now();
        renderWhales();
        // The candle chart listens for this and marks the exact candles the
        // whales bought / sold in (markers cannot be drawn inside the
        // TradingView frame, so the tape feeds both views).
        window.dispatchEvent(new CustomEvent('whale:prints', {
          detail: { symbol: symbol, prints: prints }
        }));
      })
      .catch(function () { /* keep the last tape */ })
      .finally(function () { tapeBusy = false; });
  }

  function whaleStats() {
    var buy = 0;
    var sell = 0;
    var buyPart = 0;
    var sellPart = 0;
    for (var i = 0; i < prints.length; i++) {
      var p = prints[i];
      var side = String(p.side || '').toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
      var part = Math.max(1, Number(p.ticks) || 1);
      if (side === 'BUY') { buy++; buyPart += part; } else { sell++; sellPart += part; }
    }
    var total = buy + sell;
    return {
      buy: buy, sell: sell, buyPart: buyPart, sellPart: sellPart,
      buyPct: total ? Math.round((buy / total) * 100) : 0,
      partPct: (buyPart + sellPart) ? Math.round((buyPart / (buyPart + sellPart)) * 100) : 0,
      total: total
    };
  }

  function renderWhales() {
    var wrap = $('tvo-w-body');
    if (!wrap) return;
    var st = whaleStats();
    if (!st.total) {
      wrap.innerHTML = '<div class="tvo-empty">waiting for large-flow prints…</div>';
      return;
    }
    var bias = st.partPct >= 56 ? 'BUY' : st.partPct <= 44 ? 'SELL' : 'WAIT';
    var confidence = Math.min(100, Math.abs(st.partPct - 50) * 2);
    var rows = prints.slice(0, MAX_WHALES).map(function (p) {
      var isBuy = String(p.side || '').toUpperCase() !== 'SELL';
      var part = Math.max(1, Number(p.ticks) || 1);
      return '<li class="tvo-w-row">' +
        '<span class="tvo-w-time">' + esc(fmtClock(p.tm)) + '</span>' +
        '<span class="tvo-w-side ' + (isBuy ? 'buy' : 'sell') + '">' + (isBuy ? '▲ BUY' : '▼ SELL') + '</span>' +
        '<span class="tvo-w-px">' + esc(fmtPrice(p.px)) + '</span>' +
        '<span class="tvo-w-part">' + part + 't</span>' +
        '</li>';
    }).join('');

    wrap.innerHTML =
      '<div class="tvo-flow-call ' + bias.toLowerCase() + '"><span>LARGE-FLOW ADVISORY</span><b>' + bias + '</b><em>' + confidence + '% confidence</em></div>' +
      '<div class="tvo-w-split">' +
        '<div class="tvo-w-col buy"><span>BUY</span><b>' + st.buy + '</b><em>' + st.buyPart + ' trades</em></div>' +
        '<div class="tvo-w-col sell"><span>SELL</span><b>' + st.sell + '</b><em>' + st.sellPart + ' trades</em></div>' +
      '</div>' +
      '<div class="tvo-bar"><i class="buy" style="width:' + st.partPct + '%"></i><i class="sell" style="width:' + (100 - st.partPct) + '%"></i></div>' +
      '<div class="tvo-w-cap"><span>BUY ' + st.partPct + '%</span><span>SELL ' + (100 - st.partPct) + '%</span></div>' +
      '<ul class="tvo-w-list">' + rows + '</ul>';
  }

  /* --------------------------------------------------------------- news -- */
  function eventsFromCalendar() {
    var overlay = window.ChartNewsOverlay;
    if (overlay && typeof overlay.getEvents === 'function') {
      var rows = overlay.getEvents();
      if (rows && rows.length) return rows;
    }
    return newsRows;
  }

  function impactFor(ev) {
    var impacts = Array.isArray(ev.impacted) ? ev.impacted
      : (Array.isArray(ev.impacted_markets) ? ev.impacted_markets : []);
    for (var i = 0; i < impacts.length; i++) {
      if (marketMatch(impacts[i].market, symbol)) return impacts[i];
    }
    return null;
  }

  function eventSide(ev, imp) {
    if (imp) {
      var d = normSide(imp.side) || normSide(imp.direction);
      if (d) return d;
    }
    return normSide(ev.side) || 'WAIT';
  }

  function eventMove(ev, imp) {
    if (!imp) return { amount: 0, text: '' };
    var raw = imp.move_abs !== undefined ? imp.move_abs : imp.move_dollar;
    var amount = Math.abs(Number(raw) || 0);
    var text = String(imp.move_text_en || '').replace(/\s*(UP|DOWN)\s*$/i, '').trim();
    if (!text && amount) text = fmtMoney(amount);
    return { amount: amount, text: text };
  }

  function upcomingForMarket() {
    var nowSec = Date.now() / 1000;
    var all = eventsFromCalendar() || [];
    var out = [];
    for (var i = 0; i < all.length; i++) {
      var e = all[i];
      if (window.DashboardPanels && window.DashboardPanels.newsPhase(e, nowSec) !== 'upcoming') continue;
      var ts = Number(e.ts);
      if (!(ts > nowSec - 120) || ts > nowSec + HORIZON_SEC) continue;
      out.push(e);
    }
    // Only events mapped by backend.news_bot.compute_market_impacts onto THIS
    // market. Keep low + medium + high, sort by release time, and preserve the
    // complete next-24-hour list; the scrollable terminal owns presentation.
    return out.filter(function (e) { return !!impactFor(e); })
      .sort(function (a, b) { return Number(a.ts) - Number(b.ts); })
      .slice(0, MAX_NEWS);
  }

  function renderNews() {
    var wrap = $('tvo-n-body');
    if (!wrap) return;
    var rows = upcomingForMarket();
    var up = 0;
    var down = 0;
    var html = rows.map(function (e) {
      var imp = impactFor(e);
      var side = eventSide(e, imp);
      var mv = eventMove(e, imp);
      var level = String(e.impact || 'low').toLowerCase();
      if (['low', 'medium', 'high'].indexOf(level) < 0) level = 'low';
      if (side === 'UP') up += mv.amount;
      else if (side === 'DOWN') down += mv.amount;
      var cls = side === 'UP' ? 'buy' : side === 'DOWN' ? 'sell' : 'wait';
      var chip = side === 'UP' ? '▲ BUY' : side === 'DOWN' ? '▼ SELL' : '• WAIT';
      var move = mv.text ? '<b class="tvo-n-move ' + cls + '">' + esc(mv.text) + '</b>' : '';
      var at = new Date(Number(e.ts) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return '<li class="tvo-n-row impact-' + level + '">' +
        '<span class="tvo-n-level">' + level.toUpperCase() + '</span>' +
        '<span class="tvo-n-chip ' + cls + '">' + chip + '</span>' +
        '<span class="tvo-n-main">' +
          '<span class="tvo-n-title">' + esc(String(e.title || '—')) + '</span>' +
          '<span class="tvo-n-sub">' + esc(at) + ' · ' + esc(String(e.currency || '')) + ' · ' + esc(fmtMin(Number(e.ts))) + '</span>' +
        '</span>' + move +
        '</li>';
    }).join('');

    if (!rows.length) {
      wrap.innerHTML = '<div class="tvo-empty">no news mapped to ' + esc(symbol || 'this market') + ' yet</div>';
      return;
    }

    var upTxt = up ? '+$' + fmtMoney(up) : '—';
    var downTxt = down ? '-$' + fmtMoney(down) : '—';
    var upPct = (up + down) ? Math.round((up / (up + down)) * 100) : 50;

    wrap.innerHTML =
      '<div class="tvo-n-totals">' +
        '<div class="tvo-n-total buy"><span>EST. UP · 24H</span><b>' + upTxt + '</b></div>' +
        '<div class="tvo-n-total sell"><span>EST. DOWN · 24H</span><b>' + downTxt + '</b></div>' +
      '</div>' +
      '<div class="tvo-bar news"><i class="buy" style="width:' + upPct + '%"></i><i class="sell" style="width:' + (100 - upPct) + '%"></i></div>' +
      '<ul class="tvo-n-list">' + html + '</ul>';
  }

  function refreshNewsSource() {
    var access = window.SoftradeXStateAccess;
    if (!access || !access.ready) return;
    var overlay = window.ChartNewsOverlay;
    if (overlay && typeof overlay.getEvents === 'function') {
      var rows = overlay.getEvents();
      if (rows && rows.length) { renderNews(); return; }
    }
    if (newsBusy) return;
    newsBusy = true;
    var revision = access.revision;
    fetch('/api/state' + (newsSig ? '?have=' + encodeURIComponent(newsSig) : ''),
      { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (st) {
        if (!access.ready || access.revision !== revision) return;
        // "news_omitted" means the feed left the calendar out because this
        // browser already has it - keep the last list rather than clearing it.
        if (!(st && st.bot5 && Array.isArray(st.bot5.news))) { renderNews(); return; }
        var rows = st.bot5.news;
        if (st.bot5.news_sig) newsSig = st.bot5.news_sig;
        newsRows = rows.map(function (r) {
          return Object.assign({}, r, {
            ts: Number(r.ts) || 0,
            title: r.title || r.event || '—',
            currency: r.currency || '',
            impact: String(r.impact || 'low').toLowerCase(),
            side: r.side || '',
            impacted: Array.isArray(r.impacted_markets) ? r.impacted_markets : []
          });
        }).filter(function (r) { return r.ts > 0; });
        renderNews();
      })
      .catch(function () { if (access.ready && access.revision === revision) renderNews(); })
      .finally(function () {
        newsBusy = false;
        if (access.ready && access.revision !== revision) refreshNewsSource();
      });
  }

  /* -------------------------------------------------------------- mount -- */
  function build() {
    box = $('tv-chart-box');
    if (!box || root) return;
    root = document.createElement('div');
    root.className = 'tvo';
    root.id = 'tv-chart-overlay';
    root.innerHTML =
        '<div class="tvo-card tvo-whales">' +
        '<div class="tvo-head"><span class="tvo-dot"></span>LARGE FLOW · CHART' +
          '<button type="button" class="tvo-hint" id="tvo-candle-hint"' +
            ' title="Whale buy/sell arrows on the candles - opens the candle chart">🐋 arrows</button>' +
          '<em id="tvo-w-src">TAPE</em></div>' +
        '<div id="tvo-w-body"><div class="tvo-empty">loading big prints…</div></div>' +
      '</div>' +
        '<div class="tvo-card tvo-news">' +
        '<div class="tvo-head"><span class="tvo-dot news"></span>MARKET NEWS · NEXT 24H' +
          '<em id="tvo-n-src">AI ESTIMATE</em></div>' +
        '<div id="tvo-n-body"><div class="tvo-empty">loading the calendar…</div></div>' +
      '</div>';
    box.appendChild(root);
  }

  /* ------------------------------------------------------ drag position -- */
  function loadDragPos() {
    try {
      var raw = JSON.parse(localStorage.getItem(DRAG_KEY) || 'null');
      if (raw && isFinite(raw.x) && isFinite(raw.y)) {
        return { x: Math.max(0, Math.min(1, Number(raw.x))), y: Math.max(0, Math.min(1, Number(raw.y))) };
      }
    } catch (e) { /* a broken preference just keeps the default corner */ }
    return null;
  }

  function applyDragPos() {
    var card = root && root.querySelector('.tvo-whales');
    if (!card || !box) return;
    // A resize / chart:refresh fired mid-drag used to snap the card back to
    // the last saved spot under the reader's pointer.
    if (dragging) return;
    if (!dragPos) {
      card.classList.remove('tvo-free');
      card.style.left = '';
      card.style.top = '';
      card.style.right = '';
      return;
    }
    card.classList.add('tvo-free');
    var freeX = Math.max(0, box.clientWidth - card.offsetWidth);
    var freeY = Math.max(0, box.clientHeight - card.offsetHeight);
    card.style.left = Math.round(dragPos.x * freeX) + 'px';
    card.style.top = Math.round(dragPos.y * freeY) + 'px';
    card.style.right = 'auto';
  }

  // The whole card is the grip (it used to be only the ~10px header line,
  // which was very hard to hit). Buttons inside the card stay buttons, and a
  // double-click puts the card back in its default corner.
  var DRAG_THRESHOLD = 3;   // px of travel before a press becomes a drag

  function makeDraggable() {
    var card = root.querySelector('.tvo-whales');
    if (!card) return;
    var drag = null;

    function place(x, y) {
      card.style.left = Math.round(x) + 'px';
      card.style.top = Math.round(y) + 'px';
      card.style.right = 'auto';
    }

    card.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0) return;
      // the whale-arrow hint (and any future control) stays clickable
      if (ev.target && ev.target.closest && ev.target.closest('button, a, input, select')) return;
      var rect = card.getBoundingClientRect();
      var boxRect = box.getBoundingClientRect();
      drag = {
        id: ev.pointerId,
        startX: ev.clientX,
        startY: ev.clientY,
        dx: ev.clientX - rect.left,
        dy: ev.clientY - rect.top,
        w: rect.width,
        h: rect.height,
        boxRect: boxRect,
        moved: false
      };
      try { if (card.setPointerCapture) card.setPointerCapture(ev.pointerId); } catch (e) {}
      ev.preventDefault();
    });

    card.addEventListener('pointermove', function (ev) {
      if (!drag || ev.pointerId !== drag.id) return;
      if (!drag.moved) {
        if (Math.abs(ev.clientX - drag.startX) < DRAG_THRESHOLD &&
            Math.abs(ev.clientY - drag.startY) < DRAG_THRESHOLD) return;
        drag.moved = true;
        dragging = true;
        card.classList.add('dragging', 'tvo-free');
        // the TradingView iframe must not swallow the pointer mid-drag
        box.classList.add('tvo-dragging');
      }
      var maxX = Math.max(0, drag.boxRect.width - drag.w);
      var maxY = Math.max(0, drag.boxRect.height - drag.h);
      place(
        Math.max(0, Math.min(maxX, ev.clientX - drag.boxRect.left - drag.dx)),
        Math.max(0, Math.min(maxY, ev.clientY - drag.boxRect.top - drag.dy))
      );
      ev.preventDefault();
    });

    function endDrag() {
      if (!drag) return;
      var d = drag;
      drag = null;
      dragging = false;
      card.classList.remove('dragging');
      box.classList.remove('tvo-dragging');
      // a plain click must not save a position (it used to save 0,0 and the
      // card jumped to the top-left corner on the next resize)
      if (!d.moved) return;
      var maxX = Math.max(0, d.boxRect.width - d.w);
      var maxY = Math.max(0, d.boxRect.height - d.h);
      var x = parseFloat(card.style.left) || 0;
      var y = parseFloat(card.style.top) || 0;
      dragPos = { x: maxX > 0 ? x / maxX : 0, y: maxY > 0 ? y / maxY : 0 };
      try { localStorage.setItem(DRAG_KEY, JSON.stringify(dragPos)); } catch (e) {}
    }

    card.addEventListener('pointerup', endDrag);
    card.addEventListener('pointercancel', endDrag);
    card.addEventListener('lostpointercapture', endDrag);

    card.addEventListener('dblclick', function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest('button, a, input, select')) return;
      dragPos = null;
      try { localStorage.removeItem(DRAG_KEY); } catch (e) {}
      applyDragPos();
    });
  }

  function onMarket(sym, meta) {
    var next = String(sym || '');
    if (!next) return;
    var changed = next !== symbol;
    symbol = next;
    if (meta && meta.digits !== undefined) digits = Number(meta.digits) || digits;
    if (changed) {
      prints = [];
      renderWhales();
      renderNews();
      fetchTape();
    }
  }

  function init() {
    build();
    if (!root) return;

    dragPos = loadDragPos();
    makeDraggable();
    applyDragPos();
    // The chart box resizes between the TradingView frame and the indicator
    // panes (and on window resize): keep the parked card inside it.
    window.addEventListener('resize', applyDragPos);
    window.addEventListener('chart:refresh', applyDragPos);
    if (typeof ResizeObserver === 'function') {
      try { new ResizeObserver(function () { applyDragPos(); }).observe(box); } catch (e) {}
    }

    // One click back to the candle chart, where the whale markers sit on the
    // exact candle the print happened in.
    var hint = $('tvo-candle-hint');
    if (hint) {
      hint.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var toggle = $('tv-chart-toggle');
        if (toggle) toggle.click();
      });
    }

    var term = window.SoftradeXTerminal;
    var cur = term && typeof term.getCurrentSymbol === 'function' ? term.getCurrentSymbol() : '';
    if (cur) onMarket(cur, null);

    window.addEventListener('chart:market', function (ev) {
      var d = (ev && ev.detail) || {};
      onMarket(d.symbol || (d.meta && d.meta.symbol), d.meta);
    });

    window.addEventListener('chart:snapshot', function (ev) {
      var d = (ev && ev.detail) || {};
      if (d.symbol && d.symbol !== symbol) onMarket(d.symbol, d.meta);
      if (!tapeAt || Date.now() - tapeAt > TAPE_MS) fetchTape();
    });

    // TradingView mounted/toggled: rebuild the tape + calendar for the market
    // that is on screen right now.
    window.addEventListener('chart:refresh', function () {
      fetchTape();
      refreshNewsSource();
    });

    var stalePressure = $('tvo-pressure');
    if (stalePressure && stalePressure.parentNode) stalePressure.parentNode.removeChild(stalePressure);

    setInterval(function () { if (!document.hidden) fetchTape(); }, TAPE_MS);
    setInterval(function () { if (!document.hidden) refreshNewsSource(); }, NEWS_MS);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { fetchTape(); refreshNewsSource(); }
    });

    refreshNewsSource();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 300);
  }

  window.ChartOverlay = {
    current: function () { return { symbol: symbol, prints: prints.length }; },
    refresh: function () { fetchTape(); refreshNewsSource(); }
  };
  window.addEventListener('softradex:state-access', function () {
    if (window.SoftradeXStateAccess && window.SoftradeXStateAccess.ready) {
      refreshNewsSource();
    } else {
      newsRows = [];
      newsSig = '';
      renderNews();
    }
  });
})();


// ==================== tv-setups.js ====================
/* Next extreme execution setups, priced live from the chart.
   --------------------------------------------------------------------------
   Ten levels, all measured on the daily candles the chart itself draws:

     Today Low · Today High
     Previous Day Low · Previous Day High
     This Week Low · This Week High
     Previous Week Low · Previous Week High
     This Month Low · This Month High

   Two feeds keep the panel honest:

   1. /api/chart/candles (tf=1d) - the daily bars behind those ten levels.
   2. /api/chart/ticker          - the live price, polled every 5 s, so the
      price and every distance next to it move with the chart.
   -------------------------------------------------------------------------- */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  var LEVELS_MS = 60000;   // re-read the daily extremes
  var PRICE_MS = 5000;     // follow the chart price
  var LEVEL_COUNT = 10;    // today/prev-day/week/prev-week/month, low + high
  var WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  var symbol = '';
  var levels = [];         // [{ action, label, scope, price }]
  var livePrice = 0;
  var updatedAt = 0;
  var feedNote = '';
  var levelsBusy = false;
  var priceBusy = false;
  var levelsTimer = null;
  var priceTimer = null;
  var marketGeneration = 0;
  var levelsAbort = null, priceAbort = null;
  var quoteMaxAge = 15000;

  function instrument() {
    return window.TvChartHost && typeof window.TvChartHost.symbolFor === 'function'
      ? window.TvChartHost.symbolFor(symbol) : '';
  }

  function acceptQuote(data) {
    if (!data || cleanSymbol(data.symbol).toUpperCase() !== cleanSymbol(symbol).toUpperCase()) return false;
    var target = instrument();
    if (target && data.tv_symbol !== target) return false;
    var stamp = Number(data.at || data.updated_at || data.updated || 0);
    if (stamp < 1e12) stamp *= 1000;
    if (!(Number(data.price) > 0) || data.stale || !stamp
        || Date.now() - stamp > quoteMaxAge || stamp > Date.now() + 5000 || stamp < updatedAt) return false;
    livePrice = Number(data.price);
    updatedAt = stamp;
    paint();
    return true;
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtPrice(v) {
    var n = Number(v);
    if (!isFinite(n) || n <= 0) return '—';
    var d = n >= 1000 ? 2 : n >= 10 ? 3 : 5;
    return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function fmtPct(v) {
    var n = Number(v);
    return isFinite(n) && n >= 0 ? n.toFixed(2) + '%' : '—';
  }
  function cleanSymbol(v) { return String(v || '').replace(/m$/, ''); }

  // UTC Monday 00:00 of the week that holds ts - the same week boundary the
  // chart's daily bars fall on, so "this week" means the current calendar week.
  function weekStartUTC(ts) {
    var d = new Date(Number(ts));
    var back = (d.getUTCDay() + 6) % 7;   // Sunday(0) -> 6, Monday(1) -> 0
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back);
  }

  function statusFor(level, price) {
    if (!(level > 0) || !(price > 0)) {
      return { status: 'PENDING', cls: 'pending', pct: null, dist: Infinity };
    }
    var dist = Math.abs(price - level);
    var pct = (dist / price) * 100;
    if (dist <= price * 0.0006) return { status: 'AT LEVEL', cls: 'trigger', pct: pct, dist: dist };
    if (pct <= 0.35) return { status: 'IMMINENT', cls: 'imminent', pct: pct, dist: dist };
    if (pct <= 1.2) return { status: 'APPROACHING', cls: 'approaching', pct: pct, dist: dist };
    return { status: 'PENDING', cls: 'pending', pct: pct, dist: dist };
  }

  function paint() {
    var list = $('tvs-list');
    if (!list) return;
    var symEl = $('tvs-symbol');
    if (symEl) symEl.textContent = cleanSymbol(symbol) || 'XAUUSD';
    var currentPrice = Date.now() - updatedAt <= quoteMaxAge ? livePrice : 0;
    var priceEl = $('tvs-price');
    if (priceEl) priceEl.textContent = fmtPrice(currentPrice);
    var updEl = $('tvs-updated');
    if (updEl) {
      updEl.textContent = updatedAt
        ? new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : '—';
    }
    var countEl = $('tvs-count');
    if (countEl) countEl.textContent = levels.length + ' / ' + LEVEL_COUNT;

    if (!levels.length) {
      list.innerHTML = '<div class="tvs-empty">' + esc(feedNote || 'Loading the daily levels…') + '</div>';
      return;
    }

    var price = currentPrice;
    var rows = levels.map(function (row) {
      return { row: row, st: statusFor(Number(row.price), price) };
    }).sort(function (a, b) { return a.st.dist - b.st.dist; });

    list.innerHTML = rows.map(function (item, i) {
      var row = item.row;
      var st = item.st;
      var buy = String(row.action || '').toUpperCase() === 'BUY';
      var cls = buy ? 'buy' : 'sell';
      return '<div class="tvs-row ' + cls + '">' +
        '<span class="tvs-rank">#' + (i + 1) + '</span>' +
        '<span class="tvs-action ' + cls + '">' + (buy ? '▲ BUY' : '▼ SELL') + '</span>' +
        '<span class="tvs-main"><b>' + esc(row.label || 'Extreme level') + '</b>' +
          '<small><span class="tvs-status status-' + esc(st.cls) + '">' + esc(st.status) + '</span> · ' + esc(row.scope || '') + '</small></span>' +
        '<span class="tvs-level">' + fmtPrice(row.price) + '</span>' +
        '<span class="tvs-dist ' + cls + '">' + fmtPct(st.pct) + '</span>' +
      '</div>';
    }).join('');
  }

  /* ------------------------------------------------ levels from the chart */
  function loadLevels() {
    if (levelsBusy || !symbol) return;
    levelsBusy = true;
    var requested = symbol, generation = marketGeneration, target = instrument();
    var controller = new AbortController(); levelsAbort = controller;
    var timeout = setTimeout(function () { controller.abort(); }, 25000);
    fetch('/api/chart/' + (target ? 'tvcandles' : 'candles') + '?symbol=' + encodeURIComponent(requested) +
      '&tf=1d&count=400' + (target ? '&tv_symbol=' + encodeURIComponent(target) : ''),
      { cache: 'no-store', signal: controller.signal })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (generation !== marketGeneration || requested !== symbol
            || (data && data.symbol && cleanSymbol(data.symbol).toUpperCase() !== cleanSymbol(requested).toUpperCase())) return;
        var bars = (data && Array.isArray(data.bars) ? data.bars : []).filter(function (b) {
          return Array.isArray(b) && isFinite(Number(b[2])) && isFinite(Number(b[3]));
        });
        if (bars.length < 2) {
          levels = [];
          feedNote = 'No daily candles for ' + (cleanSymbol(symbol) || 'this market') + ' yet.';
          paint();
          return;
        }
        var last = bars[bars.length - 1];
        var prev = bars[bars.length - 2];

        var lastDate = new Date(Number(last[0]));
        var thisWeekStart = weekStartUTC(lastDate.getTime());
        var prevWeekStart = thisWeekStart - WEEK_MS;
        var monthHigh = -Infinity, monthLow = Infinity;
        var weekHigh = -Infinity, weekLow = Infinity;
        var prevWeekHigh = -Infinity, prevWeekLow = Infinity;
        bars.forEach(function (b) {
          var ts = Number(b[0]);
          var d = new Date(ts);
          var h = Number(b[2]), l = Number(b[3]);
          if (d.getUTCFullYear() === lastDate.getUTCFullYear() &&
              d.getUTCMonth() === lastDate.getUTCMonth()) {
            if (h > monthHigh) monthHigh = h;
            if (l < monthLow) monthLow = l;
          }
          if (ts >= thisWeekStart) {
            if (h > weekHigh) weekHigh = h;
            if (l < weekLow) weekLow = l;
          } else if (ts >= prevWeekStart) {
            if (h > prevWeekHigh) prevWeekHigh = h;
            if (l < prevWeekLow) prevWeekLow = l;
          }
        });

        levels = [
          { action: 'BUY', label: 'Today Low', scope: 'DAY', price: Number(last[3]) },
          { action: 'SELL', label: 'Today High', scope: 'DAY', price: Number(last[2]) },
          { action: 'BUY', label: 'Previous Day Low', scope: 'PREV DAY', price: Number(prev[3]) },
          { action: 'SELL', label: 'Previous Day High', scope: 'PREV DAY', price: Number(prev[2]) },
          { action: 'BUY', label: 'This Week Low', scope: 'WEEK', price: weekLow },
          { action: 'SELL', label: 'This Week High', scope: 'WEEK', price: weekHigh },
          { action: 'BUY', label: 'Previous Week Low', scope: 'PREV WEEK', price: prevWeekLow },
          { action: 'SELL', label: 'Previous Week High', scope: 'PREV WEEK', price: prevWeekHigh },
          { action: 'SELL', label: 'This Month High', scope: 'MONTH', price: monthHigh },
          { action: 'BUY', label: 'This Month Low', scope: 'MONTH', price: monthLow }
        ].filter(function (row) {
          return isFinite(Number(row.price)) && Number(row.price) > 0;
        });

        feedNote = levels.length ? '' : 'No extreme level inside the chart window.';
        paint();
      })
      .catch(function () {
        if (generation !== marketGeneration) return;
        levels = [];
        feedNote = 'The chart feed is not answering right now.';
        paint();
      })
      .finally(function () { clearTimeout(timeout); if (generation === marketGeneration) { levelsBusy = false; levelsAbort = null; } });
  }

  /* ---------------------------------------------------- price from chart */
  function loadPrice() {
    if (priceBusy || !symbol) return;
    if (acceptQuote(window.SOFT_TV_QUOTE) && Date.now() - updatedAt < 4500) return;
    var inflight = window.__SOFT_QUOTE_INFLIGHT;
    if (inflight && inflight.symbol === symbol && (Date.now() - inflight.at) < 3000 && inflight.promise) {
      priceBusy = true;
      var g0 = marketGeneration, req0 = symbol;
      inflight.promise.then(function (q) {
        if (g0 === marketGeneration && req0 === symbol && q) acceptQuote(q);
      }).finally(function () {
        if (g0 === marketGeneration) priceBusy = false;
      });
      return;
    }
    priceBusy = true;
    var requested = symbol, generation = marketGeneration, target = instrument();
    var controller = new AbortController(); priceAbort = controller;
    var timeout = setTimeout(function () { controller.abort(); }, 12000);
    fetch('/api/chart/' + (target ? 'tvquote' : 'ticker') + '?symbol=' + encodeURIComponent(requested) +
      (target ? '&tv_symbol=' + encodeURIComponent(target) : ''), { cache: 'no-store', signal: controller.signal })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (t) {
        if (generation === marketGeneration && requested === symbol) acceptQuote(t);
      })
      .catch(function () { /* keep the last price */ })
      .finally(function () { clearTimeout(timeout); if (generation === marketGeneration) { priceBusy = false; priceAbort = null; } });
  }

  function setSymbol(next) {
    var s = String(next || '');
    if (!s || s === symbol) return;
    symbol = s;
    marketGeneration++;
    if (levelsAbort) levelsAbort.abort();
    if (priceAbort) priceAbort.abort();
    levelsBusy = priceBusy = false;
    levels = [];
    livePrice = 0;
    updatedAt = 0;
    feedNote = 'Loading the daily levels…';
    paint();
    loadPrice();
    loadLevels();
  }

  function init() {
    var term = window.SoftradeXTerminal;
    symbol = (term && typeof term.getCurrentSymbol === 'function')
      ? String(term.getCurrentSymbol() || '') : '';
    if (!symbol) symbol = 'XAUUSDm';
    paint();
    loadPrice();
    loadLevels();

    window.addEventListener('chart:market', function (ev) {
      var d = (ev && ev.detail) || {};
      setSymbol(d.symbol || (d.meta && d.meta.symbol) || '');
    });
    window.addEventListener('chart:refresh', function () { loadPrice(); loadLevels(); });
    window.addEventListener('chart:tv-quote', function (ev) { acceptQuote(ev && ev.detail); });
    window.addEventListener('tv:quote', function (ev) { acceptQuote(ev && ev.detail); });

    if (levelsTimer) clearInterval(levelsTimer);
    levelsTimer = setInterval(function () { if (!document.hidden) loadLevels(); }, LEVELS_MS);
    if (priceTimer) clearInterval(priceTimer);
    priceTimer = setInterval(function () { if (!document.hidden) loadPrice(); }, PRICE_MS);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { loadPrice(); loadLevels(); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.TvSetups = {
    refresh: function () { loadPrice(); loadLevels(); },
    state: function () { return { symbol: symbol, price: Date.now() - updatedAt <= quoteMaxAge ? livePrice : 0,
      updatedAt: updatedAt, tv_symbol: instrument(), levels: levels }; }
  };
})();


// ==================== setups-strip.js ====================
/* All available extreme levels in one compact grid, nearest first. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  var POLL_MS = 2000;

  var track = null;
  var heading = null;
  var sig = '';

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function px(v) {
    var n = Number(v);
    if (!isFinite(n) || n <= 0) return '—';
    var decimals = n >= 1000 ? 2 : n >= 10 ? 3 : 5;
    return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  function pct(v) {
    if (v == null) return '—';
    var n = Number(v);
    return isFinite(n) && n >= 0 ? n.toFixed(2) + '%' : '—';
  }

  function chips(levels, price) {
    return levels.map(function (lv) {
      var buy = String(lv.action || '').toUpperCase() === 'BUY';
      var cls = buy ? 'buy' : 'sell';
      var dist = price > 0 ? Math.abs(price - Number(lv.price)) / price * 100 : null;
      return '<div class="bset-chip ' + cls + '" title="' + esc(lv.label + ' · ' + (lv.scope || '') + ' · ' + (buy ? 'BUY' : 'SELL')) + '">' +
        '<span class="bset-side">' + (buy ? '▲' : '▼') + '</span>' +
        '<span class="bset-body"><b>' + esc(lv.label || 'Level') + '</b>' +
        '<small>' + esc(lv.scope || '') + '</small></span>' +
        '<span class="bset-dist">' + pct(dist) + '</span>' +
        '<span class="bset-price">' + px(lv.price) + '</span>' +
      '</div>';
    }).join('');
  }

  function render(levels, price) {
    if (!track) return;
    var sorted = levels.slice().sort(function (a, b) {
      return Math.abs(price - Number(a.price)) - Math.abs(price - Number(b.price));
    });
    track.innerHTML = chips(sorted, price) || '<div class="bset-empty">Waiting for daily levels…</div>';
    if (heading) heading.textContent = sorted.length ? 'NEXT ' + sorted.length + ' EXTREME SETUPS' : 'EXTREME SETUPS';
  }

  function poll() {
    if (document.hidden) return;
    var st = window.TvSetups && typeof window.TvSetups.state === 'function'
      ? window.TvSetups.state() : null;
    if (!st || !Array.isArray(st.levels)) return;
    var levels = st.levels;
    var price = Number(st.price) || 0;
    var next = (st.symbol || '') + '|' + price + '|' + levels.length;
    for (var i = 0; i < levels.length; i++) {
      var lv = levels[i];
      next += '|' + lv.action + ':' + lv.price + ':' + lv.label;
    }
    if (next === sig) return;
    sig = next;
    render(levels, price);
  }

  function init() {
    track = $('bset-track');
    var strip = $('b-strip-setups');
    if (!track || !strip) return;
    heading = $('bset-heading');

    poll();
    setInterval(poll, 3000);
    window.addEventListener('chart:refresh', poll);
    window.addEventListener('chart:market', poll);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();


// ==================== extreme-levels.js ====================
/* Draw Bot 3's five planned extreme prices over both chart views. */
(function () {
  'use strict';

  var setups = [];
  var setupSymbol = '';
  var range = null;
  var calculationTimer = null;
  var calculationToken = 0;
  var dynamicSymbol = '';

  function normalize(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function matches(a, b) {
    var left = normalize(a);
    var right = normalize(b);
    return left && right && (left === right || left.replace(/M$/, '') === right.replace(/M$/, ''));
  }

  function priceText(value) {
    var number = Number(value);
    if (!isFinite(number)) return '--';
    return number >= 1000 ? number.toFixed(2) : number < 10 ? number.toFixed(5) : number.toFixed(3);
  }

  function weekKey(timestamp) {
    var date = new Date(Number(timestamp) * 1000);
    var day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - day + 1);
    return date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0') + '-' + String(date.getUTCDate()).padStart(2, '0');
  }

  function dayHighLow(bars) {
    var high = -Infinity;
    var low = Infinity;
    bars.forEach(function (bar) {
      high = Math.max(high, Number(bar[2]));
      low = Math.min(low, Number(bar[3]));
    });
    return { high: high, low: low };
  }

  function calculateSetups(bars, symbol) {
    if (!Array.isArray(bars) || bars.length < 2) return;
    var valid = bars.filter(function (bar) {
      return Array.isArray(bar) && isFinite(Number(bar[2])) && isFinite(Number(bar[3]));
    });
    if (valid.length < 2) return;
    var current = valid[valid.length - 1];
    var currentWeek = weekKey(current[0]);
    var weekKeys = [];
    valid.forEach(function (bar) {
      var key = weekKey(bar[0]);
      if (weekKeys.indexOf(key) < 0) weekKeys.push(key);
    });
    var previousWeek = weekKeys.length > 1 ? weekKeys[weekKeys.length - 2] : '';
    var today = dayHighLow([current]);
    var thisWeek = dayHighLow(valid.filter(function (bar) { return weekKey(bar[0]) === currentWeek; }));
    var prevBars = valid.filter(function (bar) { return weekKey(bar[0]) === previousWeek; });
    var previous = prevBars.length ? dayHighLow(prevBars) : thisWeek;
    var price = Number(current[4]);
    var previousBuy = Math.abs(price - previous.low) < Math.abs(price - previous.high);
    setups = [
      { action: 'BUY', label: 'Today Lower Low (LL)', price: today.low },
      { action: 'SELL', label: 'Today Higher High (HH)', price: today.high },
      { action: 'BUY', label: 'This Week Lower Low (LL)', price: thisWeek.low },
      { action: 'SELL', label: 'This Week Higher High (HH)', price: thisWeek.high },
      { action: previousBuy ? 'BUY' : 'SELL', label: previousBuy ? 'Prev Week Low (Floor)' : 'Prev Week High (Ceiling)', price: previousBuy ? previous.low : previous.high }
    ];
    setupSymbol = symbol;
    dynamicSymbol = symbol;
    window.dispatchEvent(new CustomEvent('bot3:planned-trades', {
      detail: { symbol: symbol, planned: setups, source: 'chart-extreme-calculation' }
    }));
    render();
  }

  function refreshCalculation(symbol) {
    if (!symbol) return;
    var terminal = window.SoftradeXTerminal;
    var token = ++calculationToken;
    fetch('/api/chart/candles?symbol=' + encodeURIComponent(symbol) + '&tf=1d&count=60', { cache: 'no-store' })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (data) {
        if (token !== calculationToken || !data || !Array.isArray(data.bars)) return;
        calculateSetups(data.bars, symbol);
      })
      .catch(function () { /* keep the last calculated levels */ });
    if (calculationTimer) clearInterval(calculationTimer);
    calculationTimer = setInterval(function () {
      if (!document.hidden) refreshCalculation(symbol);
    }, 60000);
  }

  function ensureLayer(box) {
    if (!box) return null;
    var layer = box.querySelector('.extreme-levels-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'extreme-levels-layer';
      box.appendChild(layer);
    }
    return layer;
  }

  function render() {
    if (document.hidden || window.SOFT_TV_ACTIVE) return;
    var box = document.getElementById('binance-canvas-box');
    if (!box || box.style.display === 'none') return;
    var terminal = window.SoftradeXTerminal;
    var chartSymbol = terminal && typeof terminal.getCurrentSymbol === 'function'
      ? terminal.getCurrentSymbol() : '';
    var validRange = range && isFinite(range.min) && isFinite(range.max) && range.max > range.min;
    var visible = validRange && matches(setupSymbol, chartSymbol);
    var boxes = [box];

    boxes.forEach(function (b) {
      var layer = ensureLayer(b);
      if (!layer) return;
      if (!visible) {
        if (layer.childElementCount) layer.innerHTML = '';
        return;
      }
      var height = Number(range.height) || b.clientHeight || 1;
      var html = setups.slice(0, 5).map(function (setup) {
        var price = Number(setup.price);
        if (!isFinite(price) || price <= 0) return '';
        var y = (range.max - price) / (range.max - range.min) * height;
        if (y < -8 || y > height + 8) return '';
        var isBuy = String(setup.action || '').toUpperCase() === 'BUY';
        var side = isBuy ? 'BUY' : 'SELL';
        return '<div class="extreme-price-line ' + (isBuy ? 'buy' : 'sell') + '" style="top:' + y.toFixed(2) + 'px">' +
          '<span class="extreme-price-label">' + side + ' · ' + priceText(price) + '</span>' +
          '</div>';
      }).join('');
      layer.innerHTML = html;
    });
  }

  window.addEventListener('bot3:planned-trades', function (event) {
    var detail = event.detail || {};
    if (detail.source !== 'chart-extreme-calculation' && dynamicSymbol && matches(dynamicSymbol, detail.symbol)) return;
    setups = Array.isArray(detail.planned) ? detail.planned : [];
    setupSymbol = detail.symbol || '';
    render();
  });

  window.addEventListener('chart:market', function (event) {
    var detail = event.detail || {};
    var symbol = detail.symbol || (detail.meta && detail.meta.symbol) || '';
    if (symbol && !matches(dynamicSymbol, symbol)) {
      setups = [];
      setupSymbol = symbol;
      render();
    }
    refreshCalculation(symbol);
  });

  window.addEventListener('chart:price-range', function (event) {
    range = event.detail || null;
    render();
  });

  window.addEventListener('resize', render);
  function bootExtremeLevels() {
    render();
    setTimeout(function () {
      var terminal = window.SoftradeXTerminal;
      if (terminal && typeof terminal.getCurrentSymbol === 'function') {
        refreshCalculation(terminal.getCurrentSymbol());
      }
    }, 500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootExtremeLevels);
  else bootExtremeLevels();
})();


// ==================== chart-indicators.js ====================
/* ==========================================================================
   Chart indicators (chart-indicators.js)
   --------------------------------------------------------------------------
   The three Pine Script indicators shipped in /Indicator, ported to this
   dashboard's own engine and drawn as THREE SEPARATE PANES inside the chart
   panel - one study per pane, never mixed on a single surface:

     1. MSB · OB      Indicator/Chart Indicator 1.txt  (EmreKb, Pine v5)
                      candles + zigzag structure, MSB lines/labels and the
                      Bu-OB / Be-OB / Bu-BB / Be-BB boxes.
     2. WaveTrend     Indicator/chart indicator 2.txt  (LazyBear, Pine v4)
                      oscillator pane: WT1 / WT2 with the +-53 / +-60 bands and
                      the WT1-WT2 area.
     3. ICT Killzones Indicator/chart indicator 3.txt  (TFO, Pine v6)
                      candles + Asia/London/NY AM/NY PM session boxes, session
                      high/low pivots (extended until mitigated) and previous
                      day/week high, low and midline levels. The script's stats
                      table and its text_area driven level/opening-price lists
                      are not drawn; everything else follows its defaults.

   Why a port: the hosted TradingView embed refuses custom Pine ("It is not
   possible to add pine scripts to widgets at this time"), and a cross-origin
   iframe cannot be painted into. The panes therefore read the same
   TradingView instrument's /api/chart/tvcandles series and share its bar geometry
   (chart:geometry), so every study lines up with the candles.

   Nothing here invents prices: with no bars the panes stay empty.
   ========================================================================== */
(function () {
  'use strict';

  var STORE_KEY = 'softradex.chart.ind2';   // v2: the study bar now opens with MSB · OB on
  var ZOOM_KEY = 'softradex.chart.ind.zoom';
  var TF_SECONDS = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 };
  var CANDLE_COUNT = 1500;
  var MAX_HISTORY_COUNT = 5000;
  var REFRESH_MS = 12000;
  var lastRenderKey = '';
  var paneSizes = new WeakMap();
  var paneRadar = new WeakMap();
  var paneHover = new WeakMap();
  var fvgCache = { key: '', res: null };
  var paneObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(function (entries) {
    var changed = false;
    entries.forEach(function (entry) {
      var width = Math.round(entry.contentRect.width), height = Math.round(entry.contentRect.height);
      var previous = paneSizes.get(entry.target);
      if (!previous || previous.width !== width || previous.height !== height) {
        paneSizes.set(entry.target, {width: width, height: height});
        changed = true;
      }
    });
    if (changed) schedule();
  }) : null;

  var INDICATORS = [
    {
      id: 'msb',
      label: 'MSB · OB',
      sub: 'Chart Indicator 1 · Market Structure Break & Order Block',
      title: 'Market Structure Break & Order Block (Indicator/Chart Indicator 1.txt) — zigzag MSB, Bu-OB / Be-OB and break blocks'
    },
    {
      id: 'wavetrend',
      label: 'WaveTrend',
      sub: 'chart indicator 2 · WaveTrend [LazyBear]',
      title: 'WaveTrend [LazyBear] (Indicator/chart indicator 2.txt) — WT1 / WT2 with ±53 and ±60 bands'
    },
    {
      id: 'killzones',
      label: 'ICT Killzones',
      sub: 'chart indicator 3 · ICT Killzones & Pivots [TFO]',
      title: 'ICT Killzones & Pivots [TFO] (Indicator/chart indicator 3.txt) — Asia/London/NY session boxes, session pivots, previous day and week levels'
    }
  ];

  var LIGHT_COLORS = {
    background: '#ffffff',
    up: '#089981',
    upFill: 'rgba(8, 153, 129, 0.16)',
    upLine: 'rgba(8, 153, 129, 0.75)',
    down: '#f23645',
    downFill: 'rgba(242, 54, 69, 0.16)',
    downLine: 'rgba(242, 54, 69, 0.75)',
    structure: '#64748b',
    text: '#1f2937',
    muted: '#64748b',
    grid: '#e6edf9',
    tagBg: 'rgba(255, 255, 255, 0.90)',
    fvgUpLine: 'rgba(5, 150, 105, 0.85)',
    fvgDownLine: 'rgba(220, 38, 38, 0.85)',
    obUpLine: 'rgba(4, 120, 87, 0.85)',
    obDownLine: 'rgba(185, 28, 28, 0.85)',
    radarEntry: '#2563eb',
    radarSl: '#dc2626',
    radarBe: '#d97706',
    radarTp1: '#059669',
    radarTp2: '#0d9488',
    radarRingBg: '#ffffff'
  };
  var DARK_COLORS = {
    background: '#0b1220',
    up: '#34d399',
    upFill: 'rgba(52, 211, 153, 0.18)',
    upLine: 'rgba(52, 211, 153, 0.78)',
    down: '#f87171',
    downFill: 'rgba(248, 113, 113, 0.18)',
    downLine: 'rgba(248, 113, 113, 0.78)',
    structure: '#94a3b8',
    text: '#e2e8f0',
    muted: '#94a3b8',
    grid: 'rgba(148, 163, 184, 0.14)',
    tagBg: 'rgba(15, 23, 42, 0.90)',
    fvgUpLine: 'rgba(52, 211, 153, 0.88)',
    fvgDownLine: 'rgba(248, 113, 113, 0.88)',
    obUpLine: 'rgba(52, 211, 153, 0.90)',
    obDownLine: 'rgba(248, 113, 113, 0.90)',
    radarEntry: '#60a5fa',
    radarSl: '#f87171',
    radarBe: '#fbbf24',
    radarTp1: '#34d399',
    radarTp2: '#2dd4bf',
    radarRingBg: '#0b1220'
  };
  var COLORS = Object.assign({}, LIGHT_COLORS);
  function syncIndicatorTheme() {
    var dark = document.documentElement.classList.contains('sx-dark');
    Object.assign(COLORS, dark ? DARK_COLORS : LIGHT_COLORS);
  }
  syncIndicatorTheme();

  /* ------------------------------------------------------------ state ---- */
  var enabled = {};
  (function restore() {
    var saved = null;
    try { saved = localStorage.getItem(STORE_KEY); } catch (e) { /* private mode */ }
    // First visit: the chart opens with the market-structure study already on,
    // so the site lands on candles + MSB / OB instead of a bare chart. A saved
    // choice (including "everything off") is always respected - with no study
    // on, the TradingView chart is what shows.
    if (saved === null) {
      enabled.msb = true;
      savePrefs();
      return;
    }
    try {
      var raw = JSON.parse(saved || '[]');
      if (Array.isArray(raw)) raw.forEach(function (id) { enabled[String(id)] = true; });
    } catch (e) {
      enabled.msb = true;
    }
  })();

  var bars = [];              // [{ t, o, h, l, c, v }] oldest -> newest
  var dataSymbol = '';
  var dataTf = '';
  var dataInstrument = '';
  var dataError = '';
  var barsRequest = null;
  var barsRequestKey = '';
  var livePrice = 0;
  var livePriceAt = 0;
  var dataToken = 0;
  var loading = false;
  var historyTarget = CANDLE_COUNT;
  var historyLoading = false;
  var historyMaxed = false;
  var refreshTimer = null;

  var geometry = null;        // chart:geometry (bar slot, price band, pan)
  var stack = null;           // #chart-indicator-stack
  // shared viewport for every pane: how many bars are in view and how far
  // back the reader panned (TradingView style wheel zoom + drag pan + y-scale drag)
  // 78 bars fills the pane like a TradingView chart. offset 0 = newest bar sits on right edge.
  function defaultRightOffset(barCount) {
    var b = isFinite(barCount) ? barCount : (view.bars || 78);
    return -Math.max(4, Math.min(20, Math.round(b * 0.13)));
  }

  var view = { bars: 78, offset: -10, yZoom: 1, yPan: 0 };
  var MIN_BARS = 6;
  var MAX_BARS = 800;
  (function restoreZoom() {
    try {
      var savedBars = Number(localStorage.getItem(ZOOM_KEY));
      if (isFinite(savedBars) && savedBars >= MIN_BARS && savedBars <= MAX_BARS) {
        view.bars = Math.round(savedBars);
      }
    } catch (e) {}
    view.offset = defaultRightOffset(view.bars);
  })();
  function saveZoom() {
    try { localStorage.setItem(ZOOM_KEY, String(Math.round(view.bars))); } catch (e) {}
  }
  var rafPending = false;
  var toastTimer = null;
  var signalStack = [];       // [{ id, kind, side, label, price, stop, tp1, tp2, zoneLow, zoneHigh, showSl, touchPrice, extremeAnchor }]
  var dismissedSignals = {};  // { [id]: { side, bandLow, bandHigh, slBreach } }
  var lastSignalPrice = 0;
  var beaconTimer = null;
  var paneSwingBoxes = new WeakMap();

  function stopBeaconPulse() {
    if (beaconTimer) {
      clearInterval(beaconTimer);
      beaconTimer = null;
    }
  }

  function syncBeaconPulse() {
    if (signalStack.length > 0 && !document.hidden) {
      if (!beaconTimer) {
        beaconTimer = setInterval(function () {
          if (signalStack.length > 0 && !document.hidden) schedule();
          else stopBeaconPulse();
        }, 180);
      }
    } else {
      stopBeaconPulse();
    }
  }

  function currentBeaconPulse() {
    if (!signalStack.length) return 0;
    return 0.5 + 0.5 * Math.sin(Date.now() * 0.0065);
  }

  function collectSmartMoneyLevels() {
    var engine = window.SmartMoneyZones;
    var st = engine && typeof engine.state === 'function' ? engine.state() : null;
    var levels = [];
    if (st && sameMarket(st.symbol, dataSymbol) && st.smc) {
      ['buy', 'sell'].forEach(function (side) {
        var rows = Array.isArray(st.smc[side]) ? st.smc[side] : [];
        rows.forEach(function (z) {
          var acc = Number(z.accuracy);
          if (!Number.isFinite(acc) || acc <= 60) return;
          var lbl = zoneLabelKind(z);
          var zLo = Number(z.zoneLow), zHi = Number(z.zoneHigh);
          var px = Number(z.entry) || ((zLo + zHi) * 0.5);
          if (!lbl || !isFinite(px) || px <= 0) return;
          var fallbackRisk = Math.max(px * 0.0015, Math.abs(zHi - zLo));
          var sl = isFinite(Number(z.stop)) && Number(z.stop) > 0
            ? Number(z.stop) : (side === 'buy' ? px - fallbackRisk : px + fallbackRisk);
          var risk = Math.max(px * 0.0004, Math.abs(px - sl));
          var tp1 = isFinite(Number(z.tp1)) && Number(z.tp1) > 0
            ? Number(z.tp1) : (side === 'buy' ? px + risk * 1.5 : px - risk * 1.5);
          var tp2 = isFinite(Number(z.tp2)) && Number(z.tp2) > 0
            ? Number(z.tp2) : (side === 'buy' ? px + risk * 2.5 : px - risk * 2.5);
          levels.push({
            id: 'smc:' + (z.id || (side + ':' + lbl + ':' + px.toFixed(4))),
            kind: 'smc',
            side: side,
            isFvg: lbl.indexOf('FVG') >= 0,
            label: lbl,
            accuracy: Math.round(acc),
            price: px,
            stop: sl,
            tp1: tp1,
            tp2: tp2,
            zoneLow: isFinite(zLo) ? zLo : px,
            zoneHigh: isFinite(zHi) ? zHi : px,
            dist: isFinite(Number(z.distPct)) ? Number(z.distPct) : 99
          });
        });
      });
    }
    return levels;
  }

  function collectSignalLevels() {
    var out = collectSmartMoneyLevels();
    var pr = window.ProfitRadar && typeof window.ProfitRadar.state === 'function' ? window.ProfitRadar.state() : null;
    var radar = pr && pr.radar;
    if (radar && sameMarket(pr.symbol, dataSymbol) && Number(radar.entry) > 0 && Number(radar.stop) > 0) {
      var side = String(radar.side || 'BUY').toLowerCase() === 'sell' ? 'sell' : 'buy';
      var entry = Number(radar.entry);
      out.push({
        id: 'radar:entry',
        kind: 'radar',
        side: side,
        isFvg: false,
        label: 'PROFIT RADAR · ' + (side === 'buy' ? 'BUY' : 'SELL'),
        price: entry,
        stop: Number(radar.stop),
        tp1: Number(radar.tp1),
        tp2: Number(radar.tp2),
        zoneLow: entry,
        zoneHigh: entry,
        dist: livePrice > 0 ? Math.abs(livePrice - entry) / livePrice * 100 : 0
      });
    }
    return out;
  }

  function levelMetrics(lv) {
    var risk = Math.max(lv.price * 0.00035, Math.abs(lv.price - lv.stop));
    // Require live price to actually reach the drawn horizontal line (lv.price),
    // not merely graze an invisible wide H1/M15 box edge far away from the line.
    var touchPad = lv.kind === 'radar'
      ? Math.max(lv.price * 0.00010, Math.min(risk * 0.10, lv.price * 0.00022))
      : Math.max(lv.price * 0.00012, Math.min(risk * 0.12, lv.price * 0.00025));
    var bandLow = lv.price - touchPad;
    var bandHigh = lv.price + touchPad;
    var tpConfirmMove = Math.max(lv.price * 0.00022, Math.min(risk * 0.16, 1.3));
    var slMargin = Math.max(lv.price * 0.00022, risk * 0.30);
    var slBreach = lv.side === 'buy'
      ? Math.max(lv.stop, lv.price - slMargin)
      : Math.min(lv.stop, lv.price + slMargin);
    return {
      risk: risk, touchPad: touchPad, bandLow: bandLow, bandHigh: bandHigh,
      tpConfirmMove: tpConfirmMove, slBreach: slBreach
    };
  }

  function isSlDirection(lv, m, price) {
    return lv.side === 'buy' ? price <= m.slBreach : price >= m.slBreach;
  }

  function hasArrivedAtLevel(lv, m, price, prevPrice) {
    if (price >= m.bandLow && price <= m.bandHigh) return true;
    if (prevPrice > 0 && isFinite(prevPrice) && !isSlDirection(lv, m, prevPrice)) {
      var crossed = (prevPrice - lv.price) * (price - lv.price) <= 0;
      var continuousTick = Math.abs(price - prevPrice) <= Math.max(m.touchPad * 5, m.risk * 0.75);
      var nearTarget = Math.abs(price - lv.price) <= Math.max(m.touchPad * 2, m.tpConfirmMove * 1.4);
      if (crossed && continuousTick && nearTarget) return true;
    }
    return false;
  }

  function evaluateLiveSignal(price) {
    if (!(price > 0) || !isFinite(price)) {
      if (signalStack.length) { signalStack = []; syncBeaconPulse(); }
      return;
    }
    var levels = collectSignalLevels();
    var byId = Object.create(null);
    levels.forEach(function (lv) { byId[lv.id] = lv; });

    // Sync stack entries with live panel data and drop zones that vanished or relocated away from the triggered price
    var pruned = [];
    for (var si = 0; si < signalStack.length; si++) {
      var cur = signalStack[si];
      var fresh = byId[cur.id];
      if (!fresh) continue;
      var fm = levelMetrics(fresh);
      if (Math.abs(fresh.price - cur.price) > Math.max(fm.touchPad * 2, fm.risk * 0.35) &&
          !(price >= fm.bandLow && price <= fm.bandHigh)) {
        continue;
      }
      pruned.push(Object.assign({}, cur, {
        label: fresh.label,
        side: fresh.side,
        price: fresh.price,
        stop: fresh.stop,
        tp1: fresh.tp1,
        tp2: fresh.tp2,
        zoneLow: fresh.zoneLow,
        zoneHigh: fresh.zoneHigh
      }));
    }
    signalStack = pruned;

    // Remember which IDs were already dismissed entering this tick so clearing a cooldown never re-arms on the same tick.
    var blockedThisTick = Object.create(null);
    Object.keys(dismissedSignals).forEach(function (id) {
      blockedThisTick[id] = true;
      var d = dismissedSignals[id];
      var rearmPad = d.touchPad * 0.25;
      var stillInSameZones = (d.side === 'buy' ? price <= d.bandHigh + rearmPad : price >= d.bandLow - rearmPad);
      if (!byId[id] || !stillInSameZones) delete dismissedSignals[id];
    });

    // Rule 2, Rule 3 & Rule 4b: prune ANY stacked level whose SL was breached, and update TP progress
    var surviving = [];
    for (var si2 = 0; si2 < signalStack.length; si2++) {
      var sItem = signalStack[si2];
      var sM = levelMetrics(sItem);
      if (isSlDirection(sItem, sM, price)) {
        dismissedSignals[sItem.id] = {
          side: sItem.side, bandLow: sM.bandLow, bandHigh: sM.bandHigh, touchPad: sM.touchPad
        };
        blockedThisTick[sItem.id] = true;
        continue;
      }
      if (sItem.side === 'buy') {
        sItem.extremeAnchor = Math.min(sItem.extremeAnchor, price);
        if ((price - sItem.extremeAnchor) >= sM.tpConfirmMove || price >= sItem.price + sM.tpConfirmMove) {
          sItem.showSl = true;
        }
      } else {
        sItem.extremeAnchor = Math.max(sItem.extremeAnchor, price);
        if ((sItem.extremeAnchor - price) >= sM.tpConfirmMove || price <= sItem.price - sM.tpConfirmMove) {
          sItem.showSl = true;
        }
      }
      surviving.push(sItem);
    }
    signalStack = surviving;

    // Rule 1 & Rule 4a: check if market arrived at a new SMART MONEY or PROFIT RADAR level
    var curTop = signalStack.length ? signalStack[signalStack.length - 1] : null;
    var curTopM = curTop ? levelMetrics(curTop) : null;
    var candidates = [];
    for (var li = 0; li < levels.length; li++) {
      var lv = levels[li];
      if (dismissedSignals[lv.id] || blockedThisTick[lv.id]) continue;
      if (signalStack.some(function (s) { return s.id === lv.id; })) continue;
      var m = levelMetrics(lv);
      if (isSlDirection(lv, m, price)) continue;
      if (curTop && curTopM) {
        var minSep = Math.max(price * 0.0003, Math.min(m.risk, curTopM.risk) * 0.40);
        if (Math.abs(lv.price - curTop.price) < minSep) continue;
      }
      if (hasArrivedAtLevel(lv, m, price, lastSignalPrice)) {
        candidates.push({ lv: lv, m: m, d: Math.abs(price - lv.price) });
      }
    }
    if (candidates.length) {
      candidates.sort(function (a, b) {
        if (curTop && (a.lv.side !== curTop.side) !== (b.lv.side !== curTop.side)) {
          return a.lv.side !== curTop.side ? -1 : 1;
        }
        return a.d - b.d;
      });
      var chosen = candidates[0].lv;
      signalStack.push({
        id: chosen.id,
        kind: chosen.kind,
        side: chosen.side,
        label: chosen.label,
        price: chosen.price,
        stop: chosen.stop,
        tp1: chosen.tp1,
        tp2: chosen.tp2,
        zoneLow: chosen.zoneLow,
        zoneHigh: chosen.zoneHigh,
        showSl: false,
        touchPrice: price,
        extremeAnchor: price
      });
      if (signalStack.length > 4) signalStack.shift();
    }

    lastSignalPrice = price;
    syncBeaconPulse();
  }

  function liveSignalSig() {
    if (!signalStack.length) return '0';
    var top = signalStack[signalStack.length - 1];
    var pulseBucket = Math.round(currentBeaconPulse() * 5);
    return signalStack.length + ':' + top.id + ':' + (top.showSl ? '1' : '0') + ':' +
      top.price.toFixed(3) + ':' + pulseBucket;
  }

  function collectRunningSwingPositions() {
    var api = window.SwingAI;
    var st = api && typeof api.state === 'function' ? api.state() : null;
    if (!st || !sameMarket(st.symbol, dataSymbol)) return [];
    var out = [];
    var seen = Object.create(null);
    ['BUY', 'SELL'].forEach(function (side) {
      var candidates = [];
      if (st.scales && st.scales[side]) {
        if (st.scales[side].SHORT) candidates.push(st.scales[side].SHORT);
        if (st.scales[side].MAJOR) candidates.push(st.scales[side].MAJOR);
      }
      if (st.plans && st.plans[side]) candidates.push(st.plans[side]);
      candidates.forEach(function (p) {
        if (!p || !p.running || p.hit || p.doneAt) return;
        var entry = Number(p.observedEntry || p.entry);
        var tp = Number(p.target);
        var sl = Number(p.stop);
        if (!(entry > 0) || !(tp > 0) || !(sl > 0) || !isFinite(entry) || !isFinite(tp) || !isFinite(sl)) return;
        if (side === 'BUY' && !(tp > entry && sl < entry)) return;
        if (side === 'SELL' && !(tp < entry && sl > entry)) return;
        var scale = String(p.scale || '');
        var dedupKey = side + '|' + scale + '|' + entry.toFixed(4) + '|' + tp.toFixed(4) + '|' + sl.toFixed(4);
        if (seen[dedupKey]) return;
        seen[dedupKey] = true;
        var risk = Math.max(1e-9, Math.abs(entry - sl));
        out.push({
          side: side,
          scale: scale,
          tfLabel: String(p.tfLabel || ''),
          entry: entry,
          tp: tp,
          sl: sl,
          startAt: Number(p.startAt || p.startedQuoteAt || 0),
          rr: Math.abs(tp - entry) / risk,
          saved: false,
          savedStatus: 'RUNNING'
        });
      });
    });
    if (Array.isArray(st.savedZones)) {
      st.savedZones.forEach(function (z) {
        if (!z) return;
        var side = z.side === 'BUY' ? 'BUY' : z.side === 'SELL' ? 'SELL' : '';
        var entry = Number(z.entry);
        var tp = Number(z.tp);
        var sl = Number(z.sl);
        if (!side || !(entry > 0) || !(tp > 0) || !(sl > 0)) return;
        if (side === 'BUY' && !(tp > entry && sl < entry)) return;
        if (side === 'SELL' && !(tp < entry && sl > entry)) return;
        var scale = String(z.scale || '');
        var dedupKey = side + '|' + scale + '|' + entry.toFixed(4) + '|' + tp.toFixed(4) + '|' + sl.toFixed(4);
        if (seen[dedupKey]) return;
        seen[dedupKey] = true;
        var risk = Math.max(1e-9, Math.abs(entry - sl));
        out.push({
          side: side,
          scale: scale,
          tfLabel: String(z.tfLabel || ''),
          entry: entry,
          tp: tp,
          sl: sl,
          startAt: Number(z.startAt || z.savedAt || 0),
          rr: Math.abs(tp - entry) / risk,
          saved: true,
          savedStatus: String(z.status || 'OPEN')
        });
      });
    }
    return out;
  }

  function swingPositionSig() {
    var list = collectRunningSwingPositions();
    if (!list.length) return '0';
    return list.map(function (p) {
      return p.side + ':' + (p.scale || '') + ':' + (p.saved ? '1:' + (p.savedStatus || '') : '0') + ':' + p.entry.toFixed(4) + ':' + p.tp.toFixed(4) + ':' + p.sl.toFixed(4) + ':' + (p.startAt || 0);
    }).join('|');
  }

  function findBarIndexAt(tsMs) {
    if (!bars.length) return 0;
    if (!(tsMs > 0)) return Math.max(0, bars.length - 1);
    for (var i = bars.length - 1; i >= 0; i--) {
      if (bars[i].t <= tsMs) return i;
    }
    return 0;
  }

  function computeSwingPositionBoxes(v) {
    var list = collectRunningSwingPositions();
    if (!list.length || !bars.length) return [];
    var topB = v.padT + 1;
    var botB = v.padT + v.plotH - 1;
    var endIdx = bars.length - 1;
    var endCenterX = v.xAt(endIdx);
    var curSpot = livePrice > 0 ? livePrice : Number(bars[endIdx].c);
    var boxes = [];
    list.forEach(function (pos, idx) {
      var startIdx = findBarIndexAt(pos.startAt);
      var startCenterX = v.xAt(startIdx);
      var rawLeft = startCenterX - v.slot * 0.45 + (list.length > 1 ? idx * 6 : 0);
      var minBoxW = Math.max(108, v.slot * 12);
      var rawRight = Math.max(rawLeft + minBoxW, endCenterX + v.slot * 0.45);
      var left = Math.max(2, rawLeft);
      var right = Math.min(v.chartW - 2, rawRight);
      if (right <= 2 || left >= v.chartW - 2 || right - left < 4) return;

      var yEntry = v.yOf(pos.entry);
      var yTp = v.yOf(pos.tp);
      var ySl = v.yOf(pos.sl);
      var tpY0 = Math.max(topB, Math.min(yEntry, yTp));
      var tpY1 = Math.min(botB, Math.max(yEntry, yTp));
      var slY0 = Math.max(topB, Math.min(yEntry, ySl));
      var slY1 = Math.min(botB, Math.max(yEntry, ySl));

      var yEntryClamped = Math.max(topB, Math.min(botB, yEntry));
      var yLive = isFinite(curSpot) && curSpot > 0 ? v.yOf(curSpot) : yEntry;
      var yLiveClamped = Math.max(topB, Math.min(botB, yLive));
      var hasMove = Math.abs(yLive - yEntry) >= 3;
      var diagStartX = Math.max(left, Math.min(right, startCenterX));
      var diagEndX = endCenterX > diagStartX + 4 ? Math.min(right, endCenterX) : right;
      var diagEndY = hasMove ? yLiveClamped : yEntryClamped;
      var diagInProfit = pos.side === 'BUY' ? curSpot >= pos.entry : curSpot <= pos.entry;

      boxes.push({
        side: pos.side,
        scale: pos.scale || '',
        tfLabel: pos.tfLabel || '',
        saved: !!pos.saved,
        savedStatus: pos.savedStatus || 'OPEN',
        entry: pos.entry,
        tp: pos.tp,
        sl: pos.sl,
        rr: pos.rr,
        startAt: pos.startAt,
        startIdx: startIdx,
        left: left,
        right: right,
        yEntry: yEntry,
        yTp: yTp,
        ySl: ySl,
        topB: topB,
        botB: botB,
        diagStartX: diagStartX,
        diagStartY: yEntryClamped,
        diagEndX: diagEndX,
        diagEndY: diagEndY,
        diagHasMove: hasMove,
        diagInProfit: diagInProfit,
        tpRect: tpY1 > tpY0 ? { x: left, y: tpY0, w: right - left, h: tpY1 - tpY0 } : null,
        slRect: slY1 > slY0 ? { x: left, y: slY0, w: right - left, h: slY1 - slY0 } : null
      });
    });
    return boxes;
  }

  function drawSwingPositionsBack(c, v) {
    var boxes = computeSwingPositionBoxes(v);
    if (!boxes.length) return [];
    var isDark = document.documentElement.classList.contains('sx-dark');
    var tpFill = isDark ? 'rgba(8, 153, 129, 0.24)' : 'rgba(8, 153, 129, 0.19)';
    var slFill = isDark ? 'rgba(242, 54, 69, 0.24)' : 'rgba(242, 54, 69, 0.19)';
    var tpStroke = isDark ? 'rgba(16, 185, 129, 0.72)' : 'rgba(8, 153, 129, 0.70)';
    var slStroke = isDark ? 'rgba(248, 113, 113, 0.72)' : 'rgba(242, 54, 69, 0.70)';

    boxes.forEach(function (box) {
      c.save();
      if (box.saved) c.setLineDash([5, 3]);
      if (box.tpRect) {
        c.fillStyle = box.saved
          ? (isDark ? 'rgba(8, 153, 129, 0.14)' : 'rgba(8, 153, 129, 0.11)')
          : tpFill;
        c.fillRect(box.tpRect.x, box.tpRect.y, box.tpRect.w, box.tpRect.h);
        c.strokeStyle = tpStroke;
        c.lineWidth = 1;
        c.strokeRect(box.tpRect.x + 0.5, box.tpRect.y + 0.5, Math.max(1, box.tpRect.w - 1), Math.max(1, box.tpRect.h - 1));
      }
      if (box.slRect) {
        c.fillStyle = box.saved
          ? (isDark ? 'rgba(242, 54, 69, 0.14)' : 'rgba(242, 54, 69, 0.11)')
          : slFill;
        c.fillRect(box.slRect.x, box.slRect.y, box.slRect.w, box.slRect.h);
        c.strokeStyle = slStroke;
        c.lineWidth = 1;
        c.strokeRect(box.slRect.x + 0.5, box.slRect.y + 0.5, Math.max(1, box.slRect.w - 1), Math.max(1, box.slRect.h - 1));
      }
      if (box.yEntry >= box.topB && box.yEntry <= box.botB) {
        line(c, box.left, box.yEntry, box.right, box.yEntry,
          isDark ? 'rgba(226, 232, 240, 0.90)' : 'rgba(30, 41, 59, 0.80)', 1.3, box.saved ? [5, 3] : undefined);
      }
      c.setLineDash([]);
      // Diagonal dashed position line from starting candle entry strictly to the latest candle's real price
      if (!box.saved && box.diagHasMove && box.diagEndX > box.diagStartX + 4) {
        var diagCol = box.diagInProfit ? COLORS.up : COLORS.down;
        line(c, box.diagStartX, box.diagStartY, box.diagEndX, box.diagEndY, hexAlpha(diagCol, 0.92), 1.4, [4, 3]);
        c.fillStyle = diagCol;
        c.beginPath();
        c.arc(box.diagStartX, box.diagStartY, 2.5, 0, Math.PI * 2);
        c.fill();
        c.beginPath();
        c.arc(box.diagEndX, box.diagEndY, 2.8, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    });
    return boxes;
  }

  function drawSwingPositionsFront(c, v, digits, boxes) {
    if (!boxes || !boxes.length) return;
    var isDark = document.documentElement.classList.contains('sx-dark');
    var usedAxisY = [];
    boxes.forEach(function (box) {
      c.save();
      var bw = box.right - box.left;
      var tpEdgeVisible = box.yTp >= box.topB && box.yTp <= box.botB;
      var slEdgeVisible = box.ySl >= box.topB && box.ySl <= box.botB;
      var entryVisible = box.yEntry >= box.topB && box.yEntry <= box.botB;
      var scaleTag = (box.saved ? 'SAVED ' : '') + (box.scale ? (box.scale + ' ') : '');
      var hitSuffix = box.saved && box.savedStatus === 'TP_HIT' ? ' · TP HIT ✓'
        : box.saved && box.savedStatus === 'SL_HIT' ? ' · SL HIT ✕' : '';

      // Subtle dashed guides out to price scale + collision-free axis pills
      function axisPill(yPx, bg, text) {
        var py = yPx;
        for (var step = 0; step < 6; step++) {
          if (!usedAxisY.some(function (u) { return Math.abs(u - py) < 16; })) break;
          py = Math.max(box.topB + 8, Math.min(box.botB - 8, yPx + (step % 2 === 0 ? 1 : -1) * (Math.floor(step / 2) + 1) * 16));
        }
        usedAxisY.push(py);
        c.fillStyle = bg;
        c.fillRect(v.chartW, py - 8, v.axisW, 16);
        c.font = '700 8.5px "JetBrains Mono", monospace';
        c.fillStyle = '#ffffff';
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillText(text, v.chartW + 3, py);
      }

      if (tpEdgeVisible) {
        line(c, box.right, box.yTp, v.chartW, box.yTp, COLORS.up, 1, [3, 3]);
        axisPill(box.yTp, COLORS.up, formatChartPx(box.tp, digits));
      }
      if (slEdgeVisible) {
        line(c, box.right, box.ySl, v.chartW, box.ySl, COLORS.down, 1, [3, 3]);
        axisPill(box.ySl, COLORS.down, formatChartPx(box.sl, digits));
      }
      if (entryVisible) {
        var entryBg = isDark ? '#334155' : '#475569';
        line(c, box.right, box.yEntry, v.chartW, box.yEntry, entryBg, 1, [2, 3]);
        axisPill(box.yEntry, entryBg, formatChartPx(box.entry, digits));
      }

      // Crisp corner labels inside the TradingView Long/Short box
      if (bw >= 72) {
        c.font = '700 8px "JetBrains Mono", monospace';
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        if (box.tpRect && box.tpRect.h >= 15) {
          var tpLblY = box.side === 'BUY' ? box.tpRect.y + 8 : box.tpRect.y + box.tpRect.h - 8;
          c.fillStyle = COLORS.up;
          c.fillText(scaleTag + 'TP · ' + formatChartPx(box.tp, digits) + ' (+' + box.rr.toFixed(1) + 'R)', box.left + 6, tpLblY, bw - 12);
        }
        if (box.slRect && box.slRect.h >= 15) {
          var slLblY = box.side === 'BUY' ? box.slRect.y + box.slRect.h - 8 : box.slRect.y + 8;
          c.fillStyle = COLORS.down;
          c.fillText(scaleTag + 'SL · ' + formatChartPx(box.sl, digits), box.left + 6, slLblY, bw - 12);
        }
        if (entryVisible) {
          var entRoom = box.tpRect ? box.tpRect.h : 0;
          if (entRoom >= 24) {
            var entLblY = box.side === 'BUY' ? box.yEntry - 7 : box.yEntry + 8;
            if (entLblY >= box.topB + 6 && entLblY <= box.botB - 6) {
              c.fillStyle = isDark ? 'rgba(241, 245, 249, 0.92)' : 'rgba(15, 23, 42, 0.90)';
              c.fillText((box.saved ? 'PIN ' : '') + box.side + ' ' + (box.scale || 'SWING') + ' · ' + formatChartPx(box.entry, digits) + hitSuffix, box.left + 6, entLblY, bw - 12);
            }
          }
        }
      }
      c.restore();
    });
  }

  function $(id) { return document.getElementById(id); }

  function anyEnabled() {
    return INDICATORS.some(function (ind) { return enabled[ind.id] === true; });
  }

  function savePrefs() {
    var list = INDICATORS.filter(function (ind) { return enabled[ind.id]; })
      .map(function (ind) { return ind.id; });
    try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch (e) {}
  }

  function currentSymbol() {
    var terminal = window.SoftradeXTerminal;
    if (terminal && typeof terminal.getCurrentSymbol === 'function') {
      return String(terminal.getCurrentSymbol() || '');
    }
    return dataSymbol;
  }

  function currentTf() {
    // softradex-terminal.js exports getInterval(); other builds expose
    // getCurrentInterval(). Reading only one of them left the studies stuck on
    // the timeframe they were first loaded with, so both are accepted here.
    var terminal = window.SoftradeXTerminal || window.BinanceTerminal;
    if (terminal) {
      var tf = '';
      if (typeof terminal.getCurrentInterval === 'function') tf = String(terminal.getCurrentInterval() || '');
      else if (typeof terminal.getInterval === 'function') tf = String(terminal.getInterval() || '');
      if (TF_SECONDS[tf]) return tf;
    }
    return dataTf || '5m';
  }

  function tfSeconds() {
    return TF_SECONDS[dataTf] || TF_SECONDS[currentTf()] || 300;
  }

  /* ------------------------------------------------------------- data ---- */
  function mappedInstrument(symbol) {
    var host = window.TvChartHost;
    var terminal = window.SoftradeXTerminal || window.BinanceTerminal;
    var meta = terminal && terminal.MARKETS && terminal.MARKETS[symbol];
    return host && typeof host.symbolFor === 'function' ? host.symbolFor(symbol, meta || {}) : '';
  }

  function acceptQuote(q) {
    if (!dataInstrument || !q || q.symbol !== dataSymbol || q.tv_symbol !== dataInstrument ||
        currentSymbol() !== dataSymbol || currentTf() !== dataTf) return false;
    var price = Number(q.price), at = Number(q.at), now = Date.now();
    if (!(price > 0) || !isFinite(price) || !at || at < livePriceAt ||
        now - at > 30000 || at > now + 5000) return false;
    livePrice = price;
    livePriceAt = at;
    evaluateLiveSignal(livePrice);
    // Keep the live forming candle synchronized with TradingView ticks in-place
    // so historical references remain intact and studies only recalculate tail updates.
    var last = bars[bars.length - 1];
    if (last) {
      var tfMs = tfSeconds() * 1000;
      var tickTs = Number(q.exchange_ts) > 0 ? Number(q.exchange_ts) * 1000 : at;
      var bucket = Math.floor(tickTs / tfMs) * tfMs;
      if (bucket === last.t) {
        var nextH = Math.max(last.h, price);
        var nextL = Math.min(last.l, price);
        if (last.c === price && last.h === nextH && last.l === nextL) return true;
        last.h = nextH;
        last.l = nextL;
        last.c = price;
      } else if (bucket > last.t && bucket - last.t <= tfMs * 2 && q.market_open !== false) {
        bars.push({ t: bucket, o: last.c, h: Math.max(last.c, price),
          l: Math.min(last.c, price), c: price, v: 0 });
      }
    }
    schedule();
    return true;
  }

  function normalise(rows) {
    if (!Array.isArray(rows)) return [];
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!Array.isArray(row) || row.length < 5) continue;
      var o = Number(row[1]), h = Number(row[2]), l = Number(row[3]), c = Number(row[4]);
      if (!isFinite(o) || !isFinite(h) || !isFinite(l) || !isFinite(c)) continue;
      // the feed answers in seconds; the chart's own klines carry milliseconds
      var t = Math.round(Number(row[0]));
      if (t > 0 && t < 1e11) t *= 1000;
      out.push({ t: t, o: o, h: h, l: l, c: c, v: Number(row[5]) || 0 });
    }
    return out;
  }

  function loadBars(requestedCount) {
    var symbol = currentSymbol();
    var tf = currentTf();
    if (!symbol) return;
    var instrument = mappedInstrument(symbol);
    var wanted = Math.max(CANDLE_COUNT, Math.min(MAX_HISTORY_COUNT, Number(requestedCount) || historyTarget || CANDLE_COUNT));
    var isBackfill = wanted > Math.max(CANDLE_COUNT, bars.length) && dataSymbol === symbol && dataTf === tf && dataInstrument === instrument;
    var key = symbol + '|' + tf + '|' + instrument + '|' + wanted;
    if (barsRequest && barsRequestKey === key) return;
    if (barsRequest) barsRequest.abort();
    var token = ++dataToken;
    var controller = new AbortController();
    barsRequest = controller;
    barsRequestKey = key;
    if (dataSymbol !== symbol || dataTf !== tf || dataInstrument !== instrument) {
      bars = [];
      livePrice = livePriceAt = 0;
      historyTarget = CANDLE_COUNT;
      historyMaxed = false;
      wanted = CANDLE_COUNT;
    }
    dataSymbol = symbol;
    dataTf = tf;
    dataInstrument = instrument;
    dataError = '';
    if (isBackfill) historyLoading = true;
    else loading = true;
    syncButtons();
    schedule();
    var timeout = setTimeout(function () { controller.abort(); }, wanted > 1500 ? 30000 : 25000);
    var url = (instrument ? '/api/chart/tvcandles' : '/api/chart/candles') +
      '?symbol=' + encodeURIComponent(symbol) + '&tf=' + encodeURIComponent(tf) + '&count=' + wanted;
    if (instrument) url += '&tv_symbol=' + encodeURIComponent(instrument);
    fetch(url, { cache: 'no-store', signal: controller.signal })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (data) {
        if (token !== dataToken || symbol !== currentSymbol() || tf !== currentTf()) return;
        if (instrument && (!data || !data.ok || data.symbol !== symbol ||
            data.tf !== tf || data.tv_symbol !== instrument)) throw new Error('TradingView candles unavailable');
        var next = normalise(data && data.bars);
        if (!next.length) throw new Error('Candles unavailable');
        var prevLen = bars.length;
        // Never allow a smaller background response to shrink existing history and trigger auto zoom-in.
        if (bars.length >= 250 && next.length < bars.length * 0.8 &&
            dataSymbol === symbol && dataTf === tf && dataInstrument === instrument) {
          var firstNextT = next[0].t;
          var prefix = [];
          for (var pi = 0; pi < bars.length; pi++) {
            if (bars[pi].t < firstNextT) prefix.push(bars[pi]);
            else break;
          }
          bars = prefix.concat(next).slice(-MAX_HISTORY_COUNT);
        } else {
          bars = next;
        }
        if (wanted > CANDLE_COUNT && bars.length < Math.min(wanted * 0.85, MAX_HISTORY_COUNT) && bars.length <= prevLen) {
          historyMaxed = true;
        }
        view.offset = clampOffset(view.offset);
        if (!acceptQuote(window.SOFT_TV_QUOTE) && !(livePrice > 0)) {
          livePrice = bars[bars.length - 1].c;
          livePriceAt = 0;
        }
        schedule();
      })
      .catch(function () {
        if (token !== dataToken) return;
        if (!bars.length) dataError = instrument ? 'TradingView candles unavailable' : 'Market candles unavailable';
      })
      .finally(function () {
        clearTimeout(timeout);
        if (token !== dataToken) return;
        barsRequest = null;
        loading = false;
        historyLoading = false;
        syncButtons();
        schedule();
      });
  }

  function maybeLoadMoreHistory(visibleStart) {
    if (!bars.length || loading || historyLoading || historyMaxed) return;
    if (visibleStart > 80 || historyTarget >= MAX_HISTORY_COUNT) return;
    historyTarget = Math.min(MAX_HISTORY_COUNT, Math.max(bars.length, historyTarget) + 1500);
    loadBars(historyTarget);
  }

  function armRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(function () {
      if (anyEnabled()) loadBars();
    }, REFRESH_MS);
  }

  var msbCache = { key: '', res: null };
  var wtCache = { key: '', res: null };
  var nyStampCache = new Map();

  function seriesKey(series) {
    var n = series ? series.length : 0;
    if (!n) return '';
    var last = series[n - 1];
    return dataSymbol + '|' + dataTf + '|' + n + '|' + series[0].t + '|' + last.t + '|' + last.o + '|' + last.h + '|' + last.l + '|' + last.c;
  }

  /* ================================================== 1. MSB-OB ========== */
  // Direct port of the Pine v5 script. Memoized by series snapshot so 60fps
  // zoom/pan frames and unchanged ticks reuse structure in O(1).
  function computeMSB(series) {
    var sk = seriesKey(series);
    if (sk && msbCache.key === sk && msbCache.res) return msbCache.res;
    var LEN = 9;            // zigzag_len
    var FIB = 0.33;         // fib_factor
    var n = series.length;
    var result = { zigzag: [], msb: [], boxes: [] };
    if (n < LEN * 3) { msbCache = { key: sk, res: result }; return result; }

    var toUp = new Array(n);
    var toDown = new Array(n);
    var i, k;
    for (i = 0; i < n; i++) {
      var hi = -Infinity, lo = Infinity;
      for (k = Math.max(0, i - LEN + 1); k <= i; k++) {
        if (series[k].h > hi) hi = series[k].h;
        if (series[k].l < lo) lo = series[k].l;
      }
      toUp[i] = series[i].h >= hi;
      toDown[i] = series[i].l <= lo;
    }

    function lastTrue(flags, end) {
      for (var j = end; j >= 0; j--) if (flags[j]) return j;
      return -1;
    }

    var lowVal = new Array(n), lowIdx = new Array(n);
    var highVal = new Array(n), highIdx = new Array(n);
    var lowFlag = new Array(n), highFlag = new Array(n);

    for (i = 0; i < n; i++) {
      var upSince = lastTrue(toUp, i - 1);
      var upWin = (upSince >= 0 && (i - 1 - upSince) > 0) ? (i - 1 - upSince) : 1;
      var lo2 = Infinity;
      for (k = Math.max(0, i - upWin + 1); k <= i; k++) if (series[k].l < lo2) lo2 = series[k].l;
      lowVal[i] = lo2;
      lowFlag[i] = lowVal[i] === series[i].l;

      var downSince = lastTrue(toDown, i - 1);
      var downWin = (downSince >= 0 && (i - 1 - downSince) > 0) ? (i - 1 - downSince) : 1;
      var hi2 = -Infinity;
      for (k = Math.max(0, i - downWin + 1); k <= i; k++) if (series[k].h > hi2) hi2 = series[k].h;
      highVal[i] = hi2;
      highFlag[i] = highVal[i] === series[i].h;
    }
    for (i = 0; i < n; i++) {
      lowIdx[i] = lastTrue(lowFlag, i);
      highIdx[i] = lastTrue(highFlag, i);
    }

    var trend = 1;
    var market = 1;
    var highPts = [];
    var lowPts = [];
    var lastL0 = NaN;
    var lastH0 = NaN;
    var buOb = [], beOb = [], buBb = [], beBb = [];

    for (i = 0; i < n; i++) {
      var prevTrend = trend;
      if (trend === 1 && toDown[i]) trend = -1;
      else if (trend === -1 && toUp[i]) trend = 1;
      var trendChanged = trend !== prevTrend;

      if (trendChanged) {
        if (trend === 1 && lowIdx[i] >= 0) lowPts.push({ i: lowIdx[i], p: lowVal[i] });
        if (trend === -1 && highIdx[i] >= 0) highPts.push({ i: highIdx[i], p: highVal[i] });
      }

      if (highPts.length < 2 || lowPts.length < 2) continue;

      var h0 = highPts[highPts.length - 1];
      var h1 = highPts[highPts.length - 2];
      var l0 = lowPts[lowPts.length - 1];
      var l1 = lowPts[lowPts.length - 2];

      if (trendChanged) {
        if (trend === 1) result.zigzag.push({ x1: h0.i, y1: h0.p, x2: l0.i, y2: l0.p });
        else result.zigzag.push({ x1: l0.i, y1: l0.p, x2: h0.i, y2: h0.p });
      }

      var before = market;
      if (!(lastL0 === l0.p || lastH0 === h0.p)) {
        if (market === 1 && l0.p < l1.p && l0.p < l1.p - Math.abs(h0.p - l1.p) * FIB) market = -1;
        else if (market === -1 && h0.p > h1.p && h0.p > h1.p + Math.abs(h1.p - l0.p) * FIB) market = 1;
      }
      var marketChanged = market !== before;
      if (marketChanged) {
        lastL0 = l0.p;
        lastH0 = h0.p;
      }

      if (marketChanged) {
        var buObIdx = i, buBbIdx = i, beObIdx = i, beBbIdx = i;
        if (market === 1) {
          result.msb.push({ dir: 1, i0: h1.i, i1: h0.i, p: h1.p, labelI: Math.round((h1.i + l0.i) / 2), labelP: h1.p });
          var scanEnd = (i - LEN >= 0 && lowIdx[i - LEN] >= 0) ? lowIdx[i - LEN] : i;
          for (k = Math.max(0, h1.i); k <= Math.min(scanEnd, i - 1); k++) {
            if (series[k].o > series[k].c) buObIdx = k;
          }
          for (k = Math.max(0, l1.i - LEN); k <= Math.min(h1.i, i - 1); k++) {
            if (series[k].o < series[k].c) buBbIdx = k;
          }
          buOb.push(makeBox(series, buObIdx, i, 'Bu-OB', 1));
          buBb.push(makeBox(series, buBbIdx, i, l0.p < l1.p ? 'Bu-BB' : 'Bu-MB', 1));
        } else {
          result.msb.push({ dir: -1, i0: l1.i, i1: l0.i, p: l1.p, labelI: Math.round((l1.i + h0.i) / 2), labelP: l1.p });
          var scanEnd2 = (i - LEN >= 0 && highIdx[i - LEN] >= 0) ? highIdx[i - LEN] : i;
          for (k = Math.max(0, l1.i); k <= Math.min(scanEnd2, i - 1); k++) {
            if (series[k].o < series[k].c) beObIdx = k;
          }
          for (k = Math.max(0, h1.i - LEN); k <= Math.min(l1.i, i - 1); k++) {
            if (series[k].o > series[k].c) beBbIdx = k;
          }
          beOb.push(makeBox(series, beObIdx, i, 'Be-OB', -1));
          beBb.push(makeBox(series, beBbIdx, i, h0.p > h1.p ? 'Be-BB' : 'Be-MB', -1));
        }
      }

      maintain(buOb, series[i], i, 1);
      maintain(beOb, series[i], i, -1);
      maintain(buBb, series[i], i, 1);
      maintain(beBb, series[i], i, -1);
    }

    result.boxes = buOb.concat(buBb, beOb, beBb).filter(function (b) { return !b.gone; });
    msbCache = { key: sk, res: result };
    return result;
  }

  function makeBox(series, from, created, text, dir) {
    var bar = series[Math.max(0, Math.min(from, series.length - 1))];
    return {
      from: from,
      right: Math.min(series.length - 1, created + 10),
      top: bar.h,
      bottom: bar.l,
      text: text,
      dir: dir,
      gone: false
    };
  }

  function maintain(list, bar, i, dir) {
    for (var k = 0; k < list.length; k++) {
      var b = list[k];
      if (b.gone) continue;
      if (dir === 1) {
        if (bar.c < b.bottom) b.gone = true;
        else if (bar.c < b.top) { /* price inside the demand block */ }
        else b.right = i;
      } else {
        if (bar.c > b.top) b.gone = true;
        else if (bar.c > b.bottom) { /* price inside the supply block */ }
        else b.right = i;
      }
    }
  }

  /* ============================================ 2. WaveTrend ============== */
  function ema(values, length) {
    var out = new Array(values.length);
    var k = 2 / (length + 1);
    var prev = null;
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      if (!isFinite(v)) { out[i] = null; continue; }
      prev = prev === null ? v : v * k + prev * (1 - k);
      out[i] = prev;
    }
    return out;
  }

  function sma(values, length) {
    var out = new Array(values.length);
    for (var i = 0; i < values.length; i++) {
      if (i < length - 1) { out[i] = null; continue; }
      var sum = 0, ok = true;
      for (var k = i - length + 1; k <= i; k++) {
        if (!isFinite(values[k])) { ok = false; break; }
        sum += values[k];
      }
      out[i] = ok ? sum / length : null;
    }
    return out;
  }

  function computeWaveTrend(series) {
    var sk = seriesKey(series);
    if (sk && wtCache.key === sk && wtCache.res) return wtCache.res;
    var N1 = 10, N2 = 21;
    var ap = series.map(function (b) { return (b.h + b.l + b.c) / 3; });
    var esa = ema(ap, N1);
    var dev = ap.map(function (v, i) { return Math.abs(v - esa[i]); });
    var d = ema(dev, N1);
    var ci = ap.map(function (v, i) {
      var denom = 0.015 * d[i];
      return denom ? (v - esa[i]) / denom : 0;
    });
    var wt1 = ema(ci, N2);
    var wt2 = sma(wt1, 4);
    var out = { wt1: wt1, wt2: wt2 };
    wtCache = { key: sk, res: out };
    return out;
  }

  /* ======================================== 3. ICT Killzones ============== */
  var NY_FMT = null;
  function nyStamp(ts) {
    var cachedStamp = nyStampCache.get(ts);
    if (cachedStamp) return cachedStamp;
    if (!NY_FMT) {
      try {
        NY_FMT = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hour12: false
        });
      } catch (e) { NY_FMT = null; }
    }
    if (!NY_FMT) return null;
    // normalise() keeps the feed's milliseconds; older feeds answered in
    // seconds. Multiplying milliseconds by 1000 again shifted every session
    // to a year ~58,000, so no killzone ever matched a bar.
    var ms = ts > 0 && ts < 1e11 ? ts * 1000 : ts;
    var date = new Date(ms);
    if (!isFinite(date.getTime())) return null;
    var parts = NY_FMT.formatToParts(date);
    var out = { y: 0, m: 0, d: 0, h: 0, min: 0 };
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p.type === 'year') out.y = Number(p.value);
      else if (p.type === 'month') out.m = Number(p.value);
      else if (p.type === 'day') out.d = Number(p.value);
      else if (p.type === 'hour') out.h = Number(p.value) % 24;
      else if (p.type === 'minute') out.min = Number(p.value);
    }
    out.minutes = out.h * 60 + out.min;
    out.dayKey = out.y + '-' + out.m + '-' + out.d;
    var dow = new Date(Date.UTC(out.y, out.m - 1, out.d)).getUTCDay();
    var back = dow === 0 ? 6 : dow - 1;                     // Monday based week
    out.weekKey = new Date(Date.UTC(out.y, out.m - 1, out.d - back)).toISOString().slice(0, 10);
    if (nyStampCache.size > 1500) nyStampCache.clear();
    nyStampCache.set(ts, out);
    return out;
  }

  // Defaults from the script's inputs: KZ1 Asia 20:00-00:00, KZ2 London
  // 02:00-05:00, KZ3 NY AM 09:30-11:00, KZ5 NY PM 13:30-16:00 (KZ4 and KZ6 are
  // off by default). All times follow America/New_York, like the script.
  var KILLZONES = [
    { id: 'ASIA', from: 20 * 60, to: 24 * 60, color: '#2196f3' },
    { id: 'LNDN', from: 2 * 60, to: 5 * 60, color: '#f23645' },
    { id: 'NYAM', from: 9 * 60 + 30, to: 11 * 60, color: '#089981' },
    { id: 'NYPM', from: 13 * 60 + 30, to: 16 * 60, color: '#e040fb' }
  ];
  var SESSION_LIMIT = 3;   // max_days input
  // A session replay formats every bar with Intl. Cache by snapshot key so
  // pan, zoom, and unchanged quote ticks reuse results in O(1).
  var kzCache = { key: '', res: null };

  function inSession(minutes, kz) {
    if (kz.to <= 24 * 60) return minutes >= kz.from && minutes < kz.to;
    return minutes >= kz.from || minutes < (kz.to - 24 * 60);
  }

  function computeKillzones(series) {
    var sk = seriesKey(series);
    if (sk && kzCache.key === sk && kzCache.res) return kzCache.res;
    var blocks = [];
    var stamps = series.map(function (b) { return nyStamp(b.t); });

    KILLZONES.forEach(function (kz) {
      var run = null;
      for (var i = 0; i < series.length; i++) {
        var st = stamps[i];
        var on = st && inSession(st.minutes, kz);
        if (on) {
          if (!run) {
            run = { kz: kz, i0: i, i1: i, high: series[i].h, low: series[i].l };
            blocks.push(run);
          }
          run.i1 = i;
          if (series[i].h > run.high) run.high = series[i].h;
          if (series[i].l < run.low) run.low = series[i].l;
        } else if (run) {
          run = null;
        }
      }
    });

    var byKz = {};
    blocks.forEach(function (b) {
      (byKz[b.kz.id] = byKz[b.kz.id] || []).push(b);
    });
    var kept = [];
    Object.keys(byKz).forEach(function (id) {
      kept = kept.concat(byKz[id].slice(-SESSION_LIMIT));
    });

    // pivots extend to the right until price trades through them
    kept.forEach(function (b) {
      var hiEnd = b.i1;
      var loEnd = b.i1;
      for (var j = b.i1 + 1; j < series.length; j++) {
        if (hiEnd === b.i1 && series[j].h > b.high) hiEnd = j;
        if (loEnd === b.i1 && series[j].l < b.low) loEnd = j;
        if (hiEnd !== b.i1 && loEnd !== b.i1) break;
      }
      b.hiEnd = hiEnd;
      b.loEnd = loEnd;
    });

    // previous day / week highs, lows and midlines (dhl, dmid, whl, wmid)
    var days = [];
    var weeks = [];
    for (var i = 0; i < series.length; i++) {
      var st = stamps[i];
      if (!st) continue;
      var day = days[days.length - 1];
      if (!day || day.key !== st.dayKey) {
        day = { key: st.dayKey, i0: i, high: series[i].h, low: series[i].l };
        days.push(day);
      }
      day.i1 = i;
      if (series[i].h > day.high) day.high = series[i].h;
      if (series[i].l < day.low) day.low = series[i].l;

      var week = weeks[weeks.length - 1];
      if (!week || week.key !== st.weekKey) {
        week = { key: st.weekKey, i0: i, high: series[i].h, low: series[i].l };
        weeks.push(week);
      }
      week.i1 = i;
      if (series[i].h > week.high) week.high = series[i].h;
      if (series[i].l < week.low) week.low = series[i].l;
    }

    var levels = [];
    var prevDay = days.length > 1 ? days[days.length - 2] : null;
    var prevWeek = weeks.length > 1 ? weeks[weeks.length - 2] : null;
    if (prevDay) {
      levels.push({ i0: prevDay.i1, p: prevDay.high, label: 'PDH', color: '#0ea5e9' });
      levels.push({ i0: prevDay.i1, p: prevDay.low, label: 'PDL', color: '#0ea5e9' });
      levels.push({ i0: prevDay.i1, p: (prevDay.high + prevDay.low) / 2, label: 'PDM', color: '#94a3b8' });
    }
    if (prevWeek) {
      levels.push({ i0: prevWeek.i1, p: prevWeek.high, label: 'PWH', color: '#8b5cf6' });
      levels.push({ i0: prevWeek.i1, p: prevWeek.low, label: 'PWL', color: '#8b5cf6' });
      levels.push({ i0: prevWeek.i1, p: (prevWeek.high + prevWeek.low) / 2, label: 'PWM', color: '#c4b5fd' });
    }

    var latest = {};
    kept.forEach(function (b) {
      if (!latest[b.kz.id] || b.i1 > latest[b.kz.id]) latest[b.kz.id] = b.i1;
    });

    kzCache = { key: sk, res: { blocks: kept, levels: levels, latest: latest } };
    return kzCache.res;
  }

  /* ================================================= pane geometry ======= */
  // Each pane maps bars the way the main chart does: one slot per bar, the
  // right edge three slots away from the price axis, the reader's pan in
  // pixels (scaled to the pane width). The price band is per pane, from the
  // candles it actually has on screen.
  function candleView(w, h) {
    var axisW = 68;
    var padT = 8;
    var padB = 12;
    var chartW = Math.max(48, w - axisW);
    var total = bars.length;
    var wantBars = isFinite(view.bars) ? view.bars : 78;
    var visible = Math.max(4, Math.min(wantBars, total || wantBars));
    var slot = chartW / Math.max(4, visible);
    var minBack = -Math.max(4, visible - 5);
    var maxBack = Math.max(0, total - 5);
    var wantBack = isFinite(view.offset)
      ? Math.max(minBack, Math.min(maxBack, view.offset))
      : defaultRightOffset(wantBars);
    var baseRightX = chartW - slot;
    var rightFloat = (total - 1) - wantBack;

    // Continuous float index mapping: supports both panning back into history (> 0)
    // and TradingView-style leftward dragging into right-side future margin (< 0).
    function xAt(index) { return baseRightX - (rightFloat - index) * slot; }
    var rightEdgeX = total ? xAt(total - 1) : baseRightX;

    var start = total ? Math.max(0, Math.min(total - 1, Math.floor(rightFloat - visible))) : 0;
    var end = total ? Math.max(start + 1, Math.min(total, Math.ceil(rightFloat + 1.5))) : 0;

    var min = Infinity, max = -Infinity;
    for (var i = start; i < end && i < total; i++) {
      if (!bars[i]) break;
      if (bars[i].l < min) min = bars[i].l;
      if (bars[i].h > max) max = bars[i].h;
    }
    if (end === total && livePrice > 0) {
      min = Math.min(min, livePrice);
      max = Math.max(max, livePrice);
    }
    if (end === total && isFinite(min) && isFinite(max) &&
        (Number(view.yZoom) || 1) === 1 && Math.abs(Number(view.yPan) || 0) < 1e-4) {
      var barSpan = Math.max(max - min, 1e-6);
      collectRunningSwingPositions().forEach(function (pos) {
        [pos.entry, pos.tp, pos.sl].forEach(function (lvl) {
          if (isFinite(lvl) && lvl > 0 && Math.abs(lvl - (min + max) * 0.5) <= barSpan * 1.8) {
            min = Math.min(min, lvl);
            max = Math.max(max, lvl);
          }
        });
      });
    }
    if (!isFinite(min) || !isFinite(max) || max <= min) {
      min = isFinite(min) ? min * 0.999 : 0;
      max = isFinite(max) ? max * 1.001 : 1;
      if (max <= min) max = min + 1;
    }
    var basePad = (max - min) * 0.05;
    var baseSpan = Math.max(1e-8, (max - min) + basePad * 2);
    var baseMid = (max + min) * 0.5;
    var yZoom = Math.max(0.15, Math.min(8, Number(view.yZoom) || 1));
    var yPan = Number(view.yPan) || 0;
    var scaledSpan = baseSpan / yZoom;
    var center = baseMid + yPan * baseSpan;
    var plotMin = center - scaledSpan * 0.5;
    var plotMax = center + scaledSpan * 0.5;
    var plotH = Math.max(20, h - padT - padB);

    return {
      w: w, h: h, chartW: chartW, axisW: axisW, padT: padT, plotH: plotH,
      slot: slot, rightEdgeX: rightEdgeX, start: start, end: end,
      plotMin: plotMin, plotMax: plotMax, baseSpan: baseSpan, yZoom: yZoom,
      xAt: xAt,
      yOf: function (p) {
        return padT + plotH - ((p - plotMin) / (plotMax - plotMin)) * plotH;
      }
    };
  }

  /* ================================================= painters ============ */
  function line(c, x1, y1, x2, y2, color, width, dash) {
    if (!isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2)) return;
    c.save();
    c.strokeStyle = color;
    c.lineWidth = width || 1;
    if (dash) c.setLineDash(dash);
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
    c.restore();
  }

  function tag(c, text, x, y, color, align, limitX) {
    if (!isFinite(x) || !isFinite(y)) return;
    c.save();
    c.font = '600 9px "JetBrains Mono", monospace';
    c.textBaseline = 'middle';
    var w = c.measureText(text).width + 6;
    var bx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    var maxX = (limitX || Infinity) - w - 2;
    if (bx > maxX) bx = Math.max(2, maxX);
    if (bx < 2) bx = 2;
    // Draw clean haloed text with left alignment matching `bx` (no opaque dark cutout box behind labels).
    c.textAlign = 'left';
    c.lineJoin = 'round';
    c.lineWidth = 2.8;
    c.strokeStyle = hexAlpha(COLORS.background === '#ffffff' ? '#ffffff' : '#0b1220', 0.78);
    c.strokeText(text, bx + 3, y);
    c.fillStyle = color;
    c.fillText(text, bx + 3, y);
    c.restore();
  }

  function hexAlpha(hex, alpha) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length !== 6) return 'rgba(100, 116, 139, ' + alpha + ')';
    var r = parseInt(h.slice(0, 2), 16);
    var g = parseInt(h.slice(2, 4), 16);
    var b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
  }

  function drawCandles(c, v) {
    var barW = Math.max(1, Math.min(9, v.slot * 0.66));
    for (var i = v.start; i < v.end; i++) {
      var b = bars[i];
      var x = v.xAt(i);
      if (x < -v.slot || x > v.chartW + v.slot) continue;
      var up = b.c >= b.o;
      var yH = v.yOf(b.h);
      var yL = v.yOf(b.l);
      var yO = v.yOf(b.o);
      var yC = v.yOf(b.c);
      c.strokeStyle = up ? 'rgba(8, 153, 129, 0.85)' : 'rgba(242, 54, 69, 0.85)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x, yH);
      c.lineTo(x, yL);
      c.stroke();
      var top = Math.min(yO, yC);
      var height = Math.max(1, Math.abs(yC - yO));
      c.fillStyle = up ? 'rgba(8, 153, 129, 0.9)' : 'rgba(242, 54, 69, 0.9)';
      c.fillRect(x - barW / 2, top, barW, height);
    }
  }

  function drawLivePrice(c, v, digits) {
    if (!livePrice) return;
    if (v.end !== bars.length && (livePrice < v.plotMin || livePrice > v.plotMax)) return;
    var y = v.yOf(livePrice);
    if (!isFinite(y) || y < v.padT - 8 || y > v.padT + v.plotH + 8) return;
    var last = bars[bars.length - 1];
    var color = last && livePrice < last.o ? COLORS.down : COLORS.up;
    line(c, 0, y, v.chartW, y, color, 1, [3, 3]);
    c.save();
    c.fillStyle = color;
    c.fillRect(v.chartW, y - 8, v.axisW, 16);
    c.font = '600 9px "JetBrains Mono", monospace';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillStyle = '#ffffff';
    c.fillText(formatChartPx(livePrice, digits), v.chartW + 5, y);
    c.restore();
  }

  function normMarketKey(sym) {
    return String(sym || '').trim().toUpperCase().replace(/M$/i, '').replace(/[^A-Z0-9]/g, '');
  }

  function sameMarket(a, b) {
    var left = normMarketKey(a), right = normMarketKey(b);
    return !!(left && right && (left === right ||
      (left === 'GOLD' && right === 'XAUUSD') || (left === 'XAUUSD' && right === 'GOLD')));
  }

  var CHART_PX_FMT = Object.create(null);
  function formatChartPx(value, digits) {
    var n = Number(value);
    if (!isFinite(n) || n <= 0) return '—';
    var d = Math.max(0, Math.min(8, Number(digits) || 0));
    var fmt = CHART_PX_FMT[d];
    if (!fmt) {
      fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
      CHART_PX_FMT[d] = fmt;
    }
    return fmt.format(n);
  }

  function computeChartFVGs(series) {
    var sk = seriesKey(series);
    if (sk && fvgCache.key === sk && fvgCache.res) return fvgCache.res;
    var n = series ? series.length : 0;
    if (n < 15) {
      var empty = [];
      fvgCache = { key: sk, res: empty };
      return empty;
    }
    var trSum = 0, trCount = 0;
    for (var t = Math.max(1, n - 20); t < n; t++) {
      var prevC = series[t - 1].c;
      var tr = Math.max(series[t].h - series[t].l, Math.abs(series[t].h - prevC), Math.abs(series[t].l - prevC));
      if (isFinite(tr) && tr > 0) { trSum += tr; trCount++; }
    }
    var atr = trCount ? trSum / trCount : 0;
    if (!(atr > 0)) {
      var none = [];
      fvgCache = { key: sk, res: none };
      return none;
    }

    var out = [];
    var scanFrom = Math.max(1, n - 120);
    for (var i = scanFrom; i < n - 1; i++) {
      var prev = series[i - 1], next = series[i + 1];
      if (next.l > prev.h && (next.l - prev.h) >= atr * 0.14) {
        var bullFilled = false;
        for (var k1 = i + 2; k1 < n; k1++) {
          if (series[k1].l <= prev.h) { bullFilled = true; break; }
        }
        if (!bullFilled) {
          var bEntry = (prev.h + next.l) * 0.5;
          var bStop = Math.min(prev.l, prev.h - atr * 0.35);
          var bRisk = Math.max(atr * 0.4, bEntry - bStop);
          out.push({
            side: 'buy',
            label: 'FVG',
            entry: bEntry,
            stop: bStop,
            tp1: bEntry + bRisk * 1.5,
            tp2: bEntry + bRisk * 2.5,
            zoneLow: prev.h,
            zoneHigh: next.l,
            fromIdx: Math.max(0, i - 1),
            rightIdx: n - 1
          });
        }
      }
      if (next.h < prev.l && (prev.l - next.h) >= atr * 0.14) {
        var bearFilled = false;
        for (var k2 = i + 2; k2 < n; k2++) {
          if (series[k2].h >= prev.l) { bearFilled = true; break; }
        }
        if (!bearFilled) {
          var sEntry = (next.h + prev.l) * 0.5;
          var sStop = Math.max(prev.h, prev.l + atr * 0.35);
          var sRisk = Math.max(atr * 0.4, sStop - sEntry);
          out.push({
            side: 'sell',
            label: 'FVG',
            entry: sEntry,
            stop: sStop,
            tp1: sEntry - sRisk * 1.5,
            tp2: sEntry - sRisk * 2.5,
            zoneLow: next.h,
            zoneHigh: prev.l,
            fromIdx: Math.max(0, i - 1),
            rightIdx: n - 1
          });
        }
      }
    }
    var trimmed = out.slice(-10);
    fvgCache = { key: sk, res: trimmed };
    return trimmed;
  }

  function zoneLabelKind(zone) {
    var tags = Array.isArray(zone.tags) ? zone.tags.join(' ') : '';
    var text = (String(zone.kind || '') + ' ' + tags).toUpperCase();
    var hasOb = text.indexOf('OB') >= 0;
    var hasFvg = text.indexOf('FVG') >= 0;
    if (!hasOb && !hasFvg) return '';
    var core = hasOb && hasFvg ? 'OB + FVG' : (hasFvg ? 'FVG' : 'OB');
    return zone.tf ? (core + ' · ' + zone.tf) : core;
  }

  function overlapsPrice(aLow, aHigh, bLow, bHigh) {
    var hi = Math.min(aHigh, bHigh), lo = Math.max(aLow, bLow);
    if (hi <= lo) return false;
    var span = Math.min(aHigh - aLow, bHigh - bLow);
    return span > 0 && (hi - lo) / span >= 0.55;
  }

  function drawBeaconBulb(c, x, y, color, pulse) {
    if (!isFinite(x) || !isFinite(y)) return;
    c.save();
    c.beginPath();
    c.arc(x, y, 7.5 + pulse * 3.5, 0, Math.PI * 2);
    c.fillStyle = hexAlpha(color, 0.22 + pulse * 0.16);
    c.fill();
    c.shadowColor = color;
    c.shadowBlur = 12 + pulse * 8;
    c.beginPath();
    c.arc(x, y, 4.2 + pulse * 0.6, 0, Math.PI * 2);
    c.fillStyle = color;
    c.fill();
    c.shadowBlur = 0;
    c.beginPath();
    c.arc(x, y, 1.7, 0, Math.PI * 2);
    c.fillStyle = '#ffffff';
    c.fill();
    c.restore();
  }

  function drawZoneGuides(c, v, digits, z, lineLeft, includeSl, entryY) {
    var usedTagY = [entryY - 6];
    var items = [];
    if (includeSl) items.push({ key: 'SL', val: z.stop, col: COLORS.down, dash: [4, 3] });
    items.push({ key: 'TP1', val: z.tp1, col: COLORS.up, dash: [2, 3] });
    items.push({ key: 'TP2', val: z.tp2, col: COLORS.up, dash: [2, 3] });
    var guides = [];
    items.forEach(function (gd) {
      if (!isFinite(gd.val) || gd.val <= 0) return;
      var gy = v.yOf(gd.val);
      if (!isFinite(gy)) return;
      var inView = gy >= v.padT + 6 && gy <= v.padT + v.plotH - 6;
      if (inView) {
        line(c, lineLeft + 10, gy, v.chartW, gy, gd.col, 1.2, gd.dash);
        var tagY = gy - 7;
        if (usedTagY.some(function (py) { return Math.abs(py - tagY) < 12; })) tagY = gy + 8;
        tagY = Math.max(v.padT + 7, Math.min(v.padT + v.plotH - 7, tagY));
        usedTagY.push(tagY);
        tag(c, gd.key + ' · ' + formatChartPx(gd.val, digits), v.chartW - 6, tagY, gd.col, 'right', v.chartW);
        guides.push({ key: gd.key, val: gd.val, onScreen: true });
      } else {
        var arrow = gy < v.padT + 6 ? ' ↑' : ' ↓';
        var edgeY = gy < v.padT + 6 ? (v.padT + 8) : (v.padT + v.plotH - 8);
        while (usedTagY.some(function (py) { return Math.abs(py - edgeY) < 12; })) {
          edgeY += gy < v.padT + 6 ? 12 : -12;
        }
        edgeY = Math.max(v.padT + 7, Math.min(v.padT + v.plotH - 7, edgeY));
        usedTagY.push(edgeY);
        tag(c, gd.key + ' · ' + formatChartPx(gd.val, digits) + arrow, v.chartW - 6, edgeY, gd.col, 'right', v.chartW);
        guides.push({ key: gd.key, val: gd.val, onScreen: false });
      }
    });
    return guides;
  }

  function drawSmartMoneyZones(c, v, digits, holder) {
    var levels = collectSmartMoneyLevels();
    if (!levels.length) return [];

    var liveFocus = signalStack.length ? signalStack[signalStack.length - 1] : null;
    levels.forEach(function (z) {
      z.dist = livePrice > 0 ? Math.abs(livePrice - z.price) / livePrice * 100 : (z.dist || 99);
    });
    levels.sort(function (a, b) {
      if (liveFocus) {
        if (a.id === liveFocus.id && b.id !== liveFocus.id) return -1;
        if (b.id === liveFocus.id && a.id !== liveFocus.id) return 1;
      }
      return a.dist - b.dist;
    });

    var lineLeft = Math.max(8, v.chartW - Math.min(160, Math.round(v.chartW * 0.24)));
    var hoverId = holder ? (paneHover.get(holder) || '') : '';
    if (hoverId && hoverId.indexOf('smc:') !== 0) {
      var pr = window.ProfitRadar && typeof window.ProfitRadar.state === 'function' ? window.ProfitRadar.state() : null;
      if (pr && pr.radar && sameMarket(pr.symbol, dataSymbol) &&
          (hoverId === 'sl' || hoverId === 'entry' || hoverId === 'be' || hoverId === 'tp1' || hoverId === 'tp2')) {
        return [];
      }
    }
    var hoverIsSmc = hoverId.indexOf('smc:') === 0 && levels.some(function (lvl) { return lvl.id === hoverId; });
    if (hoverId.indexOf('smc:') === 0 && !hoverIsSmc && holder) {
      paneHover.set(holder, '');
      hoverId = '';
    }

    var usedY = [];
    var visibleLevels = [];
    levels.forEach(function (z) {
      if (hoverIsSmc && z.id !== hoverId) return;
      if (z.price < v.plotMin || z.price > v.plotMax) return;
      var y = v.yOf(z.price);
      if (!isFinite(y) || y < v.padT + 10 || y > v.padT + v.plotH - 8) return;
      // Keep spacing clean so labels & thin right-side rays never overlap.
      if (!hoverIsSmc && usedY.some(function (py) { return Math.abs(py - y) < 15; })) return;
      usedY.push(y);
      visibleLevels.push({ z: z, y: y });
    });

    if (hoverIsSmc && !visibleLevels.length) {
      hoverIsSmc = false;
      hoverId = '';
      if (holder) paneHover.set(holder, '');
      levels.forEach(function (z) {
        if (z.price < v.plotMin || z.price > v.plotMax) return;
        var y = v.yOf(z.price);
        if (!isFinite(y) || y < v.padT + 10 || y > v.padT + v.plotH - 8) return;
        if (usedY.some(function (py) { return Math.abs(py - y) < 15; })) return;
        usedY.push(y);
        visibleLevels.push({ z: z, y: y });
      });
    }

    var pulse = currentBeaconPulse();
    var orderedLevels = visibleLevels.slice().sort(function (a, b) {
      var aFocus = (hoverId === a.z.id) || (!hoverId && liveFocus && liveFocus.kind === 'smc' && liveFocus.id === a.z.id);
      var bFocus = (hoverId === b.z.id) || (!hoverId && liveFocus && liveFocus.kind === 'smc' && liveFocus.id === b.z.id);
      if (aFocus !== bFocus) return aFocus ? 1 : -1;
      return 0;
    });
    var targets = [];
    orderedLevels.forEach(function (entry) {
      var z = entry.z;
      var y = entry.y;
      var active = hoverId === z.id;
      var isLit = !hoverId && liveFocus && liveFocus.kind === 'smc' && liveFocus.id === z.id;
      var dimmed = !hoverId && liveFocus && !isLit;
      var up = z.side === 'buy';
      var stroke = z.isFvg ? (up ? COLORS.fvgUpLine : COLORS.fvgDownLine) : (up ? COLORS.obUpLine : COLORS.obDownLine);
      var textColor = up ? COLORS.up : COLORS.down;

      c.save();
      if (isLit) {
        // Glowing beam under the active lit zone line
        c.save();
        c.globalAlpha = 0.22 + pulse * 0.16;
        c.strokeStyle = textColor;
        c.lineWidth = 4.5 + pulse * 2.5;
        c.beginPath();
        c.moveTo(lineLeft, y);
        c.lineTo(v.chartW, y);
        c.stroke();
        c.restore();
      }

      c.globalAlpha = (active || isLit) ? 0.98 : (dimmed ? 0.30 : 0.56);
      c.strokeStyle = stroke;
      c.lineWidth = (active || isLit) ? 1.7 : 1;
      if (z.isFvg) c.setLineDash([4, 4]);
      c.beginPath();
      c.moveTo(lineLeft, y);
      c.lineTo(v.chartW, y);
      c.stroke();
      c.setLineDash([]);

      c.font = ((active || isLit) ? '700 ' : '600 ') + '8.5px "JetBrains Mono", monospace';
      var chartText = z.label + ' ' + z.accuracy + '%';
      var tw = c.measureText(chartText).width + 6;
      var lx = Math.max(4, Math.min(v.chartW - tw - 48, lineLeft));
      var ly = Math.max(v.padT + 7, y - 6);
      if (active || isLit) {
        c.save();
        c.globalAlpha = 0.98;
        c.fillStyle = hexAlpha(textColor, 0.14);
        c.fillRect(lx, ly - 5.5, tw, 11);
        if (isLit) {
          c.shadowColor = textColor;
          c.shadowBlur = 10 + pulse * 6;
        }
        c.strokeStyle = textColor;
        c.lineWidth = 1;
        c.strokeRect(lx + 0.5, ly - 5.5, tw - 1, 11);
        c.restore();
      }
      c.globalAlpha = (active || isLit) ? 1 : (dimmed ? 0.5 : 0.92);
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.lineJoin = 'round';
      c.lineWidth = 2.6;
      c.strokeStyle = hexAlpha(COLORS.background === '#ffffff' ? '#ffffff' : '#0b1220', 0.78);
      c.strokeText(chartText, lx + 3, ly);
      c.fillStyle = textColor;
      c.fillText(chartText, lx + 3, ly);

      if (isLit) drawBeaconBulb(c, Math.max(8, lx - 9), ly, textColor, pulse);

      var guides = [];
      if (active || isLit) {
        c.globalAlpha = 1;
        c.fillStyle = textColor;
        c.fillRect(v.chartW, y - 8, v.axisW, 16);
        c.font = '600 9px "JetBrains Mono", monospace';
        c.fillStyle = '#ffffff';
        c.fillText(formatChartPx(z.price, digits), v.chartW + 3, y);

        var showSl = active ? true : !!(liveFocus && liveFocus.showSl);
        guides = drawZoneGuides(c, v, digits, z, lineLeft, showSl, y);
      }
      c.restore();

      var slStr = formatChartPx(z.stop, digits);
      var tp1Str = formatChartPx(z.tp1, digits);
      var tp2Str = formatChartPx(z.tp2, digits);
      targets.push({
        id: z.id,
        kind: 'smc',
        lit: !!isLit,
        showSl: isLit ? !!(liveFocus && liveFocus.showSl) : active,
        y: y,
        lineLeft: lineLeft,
        lineRight: v.chartW,
        lx: lx,
        ly: ly,
        tw: tw,
        cx: lx + tw * 0.5,
        cy: ly,
        color: textColor,
        title: 'SMART MONEY · ' + z.label,
        tag: z.accuracy + '% ACC · ' + (up ? 'TP UP ↑' : 'TP DOWN ↓') + ' · 1.5R / 2.5R',
        pxText: 'SL: ' + slStr + '  |  TP1: ' + tp1Str + '  |  TP2: ' + tp2Str,
        clipped: false,
        guides: guides,
        sub: 'Entry ' + formatChartPx(z.price, digits) + ' · Zone ' + formatChartPx(z.zoneLow, digits) + '–' + formatChartPx(z.zoneHigh, digits)
      });
    });
    return targets;
  }

  function radarSignature() {
    var engine = window.SmartMoneyZones;
    var st = engine && typeof engine.state === 'function' ? engine.state() : null;
    if (!st || !sameMarket(st.symbol, dataSymbol)) return '';
    var zoneSig = function (z) {
      return [z.id, z.kind, z.tf, z.accuracy || 0, z.entry, z.stop, z.tp1, z.tp2, z.zoneLow, z.zoneHigh, Array.isArray(z.tags) ? z.tags.join('+') : ''].join(':');
    };
    var b = st.smc && Array.isArray(st.smc.buy) ? st.smc.buy.map(zoneSig).join(',') : '';
    var s = st.smc && Array.isArray(st.smc.sell) ? st.smc.sell.map(zoneSig).join(',') : '';
    var r = st.radar;
    var rk = r ? [r.side, r.edgePct, r.entry, r.stop, r.beTrigger, r.tp1, r.tp2].join(':') : '';
    return b + '|' + s + '|' + rk;
  }

  function buildRadarMarkers(v, digits) {
    var pr = window.ProfitRadar && typeof window.ProfitRadar.state === 'function' ? window.ProfitRadar.state() : null;
    var radar = pr && pr.radar;
    if (!radar || !sameMarket(pr.symbol, dataSymbol) || !(radar.entry > 0)) return [];
    var passedChecks = Array.isArray(radar.checks) ? radar.checks.filter(function (ck) { return ck && ck.ok; }).length : 0;
    var totalChecks = Array.isArray(radar.checks) ? radar.checks.length : 6;
    var rrText = isFinite(radar.rr) ? ('1:' + Number(radar.rr).toFixed(2)) : '1:2.50';
    var sideEdge = radar.side + ' EDGE ' + radar.edgePct + '%';

    var slStr = formatChartPx(radar.stop, digits);
    var tp1Str = formatChartPx(radar.tp1, digits);
    var tp2Str = formatChartPx(radar.tp2, digits);
    var tpSlSummary = 'SL ' + slStr + ' · TP1 ' + tp1Str + ' · TP2 ' + tp2Str;

    var raw = [
      {
        id: 'sl',
        code: 'SL',
        badge: 'SAFE SL',
        price: Number(radar.stop),
        color: COLORS.radarSl,
        tag: '-' + Number(radar.stopPct || 0).toFixed(2) + '%',
        title: 'PROFIT RADAR · SAFE SL',
        sub: (radar.slPoolProtected ? 'Pool-protected SL' : '1.35x ATR structural SL') + ' · TP1 ' + tp1Str + ' · TP2 ' + tp2Str
      },
      {
        id: 'entry',
        code: 'E',
        badge: radar.side + ' ENTRY',
        price: Number(radar.entry),
        color: COLORS.radarEntry,
        tag: sideEdge,
        title: 'PROFIT RADAR · ' + radar.side + ' ENTRY',
        sub: passedChecks + '/' + totalChecks + ' checks · ' + rrText + ' · ' + tpSlSummary
      },
      {
        id: 'be',
        code: 'BE',
        badge: 'BE (+1R)',
        price: Number(radar.beTrigger),
        color: COLORS.radarBe,
        tag: '+1.0R',
        title: 'PROFIT RADAR · BREAK-EVEN (+1R)',
        sub: 'SL->Entry (' + formatChartPx(radar.entry, digits) + ') · ' + tpSlSummary
      },
      {
        id: 'tp1',
        code: 'T1',
        badge: 'TP1',
        price: Number(radar.tp1),
        color: COLORS.radarTp1,
        tag: '+' + Number(radar.tp1R || 1.5).toFixed(1) + 'R',
        title: 'PROFIT RADAR · TP1 LOCK',
        sub: 'Close 50% (' + Number(radar.tp1R || 1.5).toFixed(1) + 'R) · SL ' + slStr + ' · TP2 ' + tp2Str
      },
      {
        id: 'tp2',
        code: 'T2',
        badge: 'TP2',
        price: Number(radar.tp2),
        color: COLORS.radarTp2,
        tag: rrText + ' R:R',
        title: 'PROFIT RADAR · TP2 TARGET',
        sub: 'Final ' + rrText + ' target · SL ' + slStr + ' · TP1 ' + tp1Str
      }
    ].filter(function (m) { return isFinite(m.price) && m.price > 0; });

    var baseX = Math.max(24, Math.min(v.chartW - 14, v.rightEdgeX + Math.max(11, v.slot * 1.35)));
    var minY = v.padT + 10, maxY = v.padT + v.plotH - 10;
    var items = raw.map(function (m) {
      var rawY = v.yOf(m.price);
      var clipped = rawY < v.padT ? 'up' : (rawY > v.padT + v.plotH ? 'down' : false);
      var cy = Math.max(minY, Math.min(maxY, rawY));
      return Object.assign(m, {
        pxText: formatChartPx(m.price, digits),
        rawY: rawY,
        cy: cy,
        cx: baseX,
        clipped: clipped,
        r: 5
      });
    }).sort(function (a, b) { return a.cy - b.cy; });

    // Stagger horizontally when markers sit close in Y so every small circle stays crisp and hoverable.
    for (var i = 0; i < items.length; i++) {
      for (var step = 0; step < 5; step++) {
        var collide = false;
        for (var j = 0; j < i; j++) {
          if (Math.hypot(items[i].cx - items[j].cx, items[i].cy - items[j].cy) < 15) {
            collide = true;
            break;
          }
        }
        if (!collide) break;
        var nextX = baseX - (step + 1) * 16;
        if (nextX >= 20) {
          items[i].cx = nextX;
        } else {
          items[i].cy = Math.max(minY, Math.min(maxY, items[i].cy + (items[i].cy < (minY + maxY) * 0.5 ? 14 : -14)));
        }
      }
    }
    return items;
  }

  function syncRadarTooltip(holder, marker, w, h) {
    if (!holder) return;
    var tip = holder.querySelector('.chart-radar-tooltip');
    if (!marker) {
      if (tip) {
        tip.hidden = true;
        tip.dataset.sig = '';
      }
      return;
    }
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'chart-radar-tooltip';
      tip.setAttribute('role', 'status');
      tip.setAttribute('aria-live', 'polite');
      holder.appendChild(tip);
    }
    var clipHint = marker.clipped === 'up' ? ' ↑ above view' : (marker.clipped === 'down' ? ' ↓ below view' : '');
    var sig = marker.id + '|' + marker.pxText + '|' + marker.tag + '|' + clipHint + '|' + marker.sub;
    if (tip.dataset.sig !== sig) {
      tip.dataset.sig = sig;
      tip.innerHTML =
        '<div class="crt-head">' +
          '<span class="crt-dot" style="background:' + marker.color + '"></span>' +
          '<span class="crt-title">' + marker.title + '</span>' +
          '<span class="crt-tag" style="color:' + marker.color + ';border-color:' + hexAlpha(marker.color, 0.4) + ';background:' + hexAlpha(marker.color, 0.14) + '">' + marker.tag + '</span>' +
        '</div>' +
        '<div class="crt-price">' + marker.pxText + (clipHint ? '<small>' + clipHint + '</small>' : '') + '</div>' +
        '<div class="crt-sub">' + marker.sub + '</div>';
    }
    tip.hidden = false;
    var tipW = tip.offsetWidth || 235;
    var tipH = tip.offsetHeight || 64;
    var left = marker.kind === 'smc'
      ? (marker.lx - tipW - 10 >= 6 ? marker.lx - tipW - 10 : marker.cx + 14)
      : marker.cx + 14;
    if (left + tipW > w - 8) left = (marker.kind === 'smc' ? marker.lx : marker.cx) - tipW - 14;
    left = Math.max(8, Math.min(Math.max(8, w - tipW - 8), left));
    var top = Math.max(8, Math.min(Math.max(8, h - tipH - 10), marker.cy - tipH * 0.5));
    tip.style.left = Math.round(left) + 'px';
    tip.style.top = Math.round(top) + 'px';
  }

  function drawProfitRadarCircles(c, v, digits, holder, w, h, smcTargets) {
    var markers = buildRadarMarkers(v, digits);
    var hoverId = holder ? (paneHover.get(holder) || '') : '';
    var hoveredSmc = (hoverId.indexOf('smc:') === 0 && Array.isArray(smcTargets))
      ? (smcTargets.find(function (t) { return t.id === hoverId; }) || null)
      : null;

    // While hovering an OB / FVG item, hide all Profit Radar circles so only that focused OB / FVG remains.
    if (hoveredSmc) {
      if (holder) {
        paneRadar.set(holder, { markers: [], smcTargets: smcTargets || [], w: w, h: h, chartW: v.chartW });
        syncRadarTooltip(holder, hoveredSmc, w, h);
      }
      return;
    }

    var hovered = hoverId ? (markers.find(function (m) { return m.id === hoverId; }) || null) : null;
    var liveFocus = signalStack.length ? signalStack[signalStack.length - 1] : null;
    var liveRadarLit = !hovered && liveFocus && liveFocus.kind === 'radar';
    var pulse = currentBeaconPulse();

    var visibleMarkers;
    if (hovered) {
      visibleMarkers = markers.filter(function (m) {
        return m.id === hoverId || m.id === 'sl' || m.id === 'tp1' || m.id === 'tp2';
      });
    } else if (liveRadarLit) {
      visibleMarkers = markers.filter(function (m) {
        return m.id === 'entry' || m.id === 'tp1' || m.id === 'tp2' || (liveFocus.showSl && m.id === 'sl');
      });
    } else {
      visibleMarkers = markers;
    }

    if (holder) {
      paneRadar.set(holder, {
        markers: visibleMarkers,
        smcTargets: hovered ? [] : (smcTargets || []),
        w: w,
        h: h,
        chartW: v.chartW
      });
    }

    var usedTagY = [];
    visibleMarkers.forEach(function (m) {
      var active = hovered && m.id === hoverId;
      var isLitEntry = liveRadarLit && m.id === 'entry';
      var isLitTarget = liveRadarLit && (m.id === 'tp1' || m.id === 'tp2' || (liveFocus.showSl && m.id === 'sl'));
      c.save();
      if (hovered || isLitEntry || isLitTarget) {
        var guideLeft = Math.max(8, Math.min(m.cx - 18, v.chartW - 145));
        if (!m.clipped) {
          line(c, guideLeft, m.cy, v.chartW, m.cy, m.color, (active || isLitEntry) ? 1.45 : 1.05, [3, 3]);
        }
        var arrow = m.clipped === 'up' ? ' ↑' : (m.clipped === 'down' ? ' ↓' : '');
        var tagY = m.clipped ? (m.clipped === 'up' ? v.padT + 8 : v.padT + v.plotH - 8) : (m.cy - 8);
        while (usedTagY.some(function (py) { return Math.abs(py - tagY) < 13; })) {
          tagY += m.clipped === 'down' ? -13 : 13;
        }
        tagY = Math.max(v.padT + 7, Math.min(v.padT + v.plotH - 7, tagY));
        usedTagY.push(tagY);
        var tagLabel = (m.id === 'sl' ? 'SL' : m.id === 'tp1' ? 'TP1' : m.id === 'tp2' ? 'TP2' : m.badge) +
          ' · ' + m.pxText + arrow;
        tag(c, tagLabel, Math.min(m.cx - 8, v.chartW - 6), tagY, m.color, 'right', v.chartW);

        if ((active || isLitEntry) && !m.clipped) {
          c.fillStyle = m.color;
          c.fillRect(v.chartW, m.cy - 8, v.axisW, 16);
          c.font = '600 9px "JetBrains Mono", monospace';
          c.textAlign = 'left';
          c.textBaseline = 'middle';
          c.fillStyle = '#ffffff';
          c.fillText(m.pxText, v.chartW + 3, m.cy);
        }
      }

      if (isLitEntry) {
        drawBeaconBulb(c, m.cx, m.cy, m.color, pulse);
      } else {
        if (!hovered && liveFocus && !liveRadarLit) c.globalAlpha = 0.45;
        // Subtle radar halo ring around each small dot
        c.beginPath();
        c.arc(m.cx, m.cy, (active || isLitTarget) ? 10 : 7.5, 0, Math.PI * 2);
        c.strokeStyle = hexAlpha(m.color, (active || isLitTarget) ? 0.62 : 0.34);
        c.lineWidth = (active || isLitTarget) ? 1.5 : 1;
        c.stroke();

        // Main small Profit Radar circle
        c.beginPath();
        c.arc(m.cx, m.cy, (active || isLitTarget) ? 6.5 : 4.8, 0, Math.PI * 2);
        c.fillStyle = m.color;
        c.fill();
        c.lineWidth = 1.5;
        c.strokeStyle = COLORS.radarRingBg;
        c.stroke();

        // Tiny inner core dot for clean radar bullseye look
        c.beginPath();
        c.arc(m.cx, m.cy, (active || isLitTarget) ? 2.2 : 1.6, 0, Math.PI * 2);
        c.fillStyle = COLORS.radarRingBg;
        c.fill();
      }
      c.restore();
    });

    if (holder) {
      if (hoverId && !hovered) paneHover.set(holder, '');
      syncRadarTooltip(holder, hovered, w, h);
    }
  }

  function nicePriceStep(span, plotH, minStep) {
    var target = Math.max(4, Math.min(12, Math.floor(plotH / 44)));
    var rough = span / target;
    if (!(rough > 0) || !isFinite(rough)) return 1;
    var mag = Math.pow(10, Math.floor(Math.log10(rough)));
    var norm = rough / mag;
    var mult = norm <= 1.15 ? 1 : norm <= 2.2 ? 2 : norm <= 2.9 ? 2.5 : norm <= 5.5 ? 5 : 10;
    var step = mult * mag;
    return minStep > 0 ? Math.max(minStep, step) : step;
  }

  function drawGrid(c, v, digits) {
    c.save();
    c.strokeStyle = COLORS.grid;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(v.chartW + 0.5, 0);
    c.lineTo(v.chartW + 0.5, v.h);
    c.stroke();

    c.fillStyle = COLORS.muted;
    c.font = '600 8.5px "JetBrains Mono", monospace';
    c.textAlign = 'left';
    c.textBaseline = 'middle';

    if (digits <= 0) {
      for (var g = 0; g <= 3; g++) {
        var gy = v.padT + v.plotH * (g / 3);
        c.beginPath();
        c.moveTo(0, gy);
        c.lineTo(v.chartW, gy);
        c.stroke();
      }
      c.restore();
      return;
    }

    var span = v.plotMax - v.plotMin;
    var minStep = Math.pow(10, -digits);
    var step = nicePriceStep(span, v.plotH, minStep);
    var stepDecimals = step >= 1 && Math.abs(step - Math.round(step)) < 1e-6
      ? Math.min(digits, 2)
      : Math.min(digits, Math.max(0, Math.ceil(-Math.log10(step) - 1e-6) + (Math.abs((step * Math.pow(10, Math.floor(-Math.log10(step)))) - 2.5) < 0.01 ? 1 : 0)));
    var firstTick = Math.ceil(v.plotMin / step) * step;
    var maxLines = 28;
    for (var idx = 0; idx < maxLines; idx++) {
      var tickPrice = Number((firstTick + idx * step).toFixed(8));
      if (tickPrice > v.plotMax) break;
      var y = v.yOf(tickPrice);
      if (y < v.padT + 8 || y > v.padT + v.plotH - 8) continue;
      c.strokeStyle = COLORS.grid;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(v.chartW, y);
      c.stroke();
      c.fillStyle = COLORS.muted;
      c.fillText(tickPrice.toLocaleString('en-US', {
        minimumFractionDigits: stepDecimals,
        maximumFractionDigits: stepDecimals
      }), v.chartW + 6, y);
    }
    c.restore();
  }

  function drawMSB(c, v) {
    var res = computeMSB(bars);
    var i, x1, x2, y;

    for (i = 0; i < res.zigzag.length; i++) {
      var z = res.zigzag[i];
      line(c, v.xAt(z.x1), v.yOf(z.y1), v.xAt(z.x2), v.yOf(z.y2), COLORS.structure, 1);
    }

    for (i = 0; i < res.boxes.length; i++) {
      var b = res.boxes[i];
      x1 = v.xAt(b.from);
      x2 = v.xAt(b.right);
      var yTop = v.yOf(b.top);
      var yBottom = v.yOf(b.bottom);
      if (!isFinite(x1) || !isFinite(x2) || !isFinite(yTop) || !isFinite(yBottom)) continue;
      if (x2 < -20 || x1 > v.chartW) continue;
      var up = b.dir === 1;
      var yLine = up ? yTop : yBottom;
      if (!isFinite(yLine) || yLine < v.padT || yLine > v.padT + v.plotH) continue;
      var lx1 = Math.max(0, x1);
      var lx2 = Math.min(v.chartW, x2);
      if (lx2 <= lx1) continue;
      line(c, lx1, yLine, lx2, yLine, up ? COLORS.upLine : COLORS.downLine, 1.25);
    }

    for (i = 0; i < res.msb.length; i++) {
      var m = res.msb[i];
      var color = m.dir === 1 ? COLORS.up : COLORS.down;
      line(c, v.xAt(m.i0), v.yOf(m.p), v.xAt(m.i1), v.yOf(m.p), color, 2);
      tag(c, 'MSB', v.xAt(m.labelI), v.yOf(m.labelP) + (m.dir === 1 ? -9 : 9), color, 'center', v.chartW);
    }
  }

  function drawKillzones(c, v) {
    var res = computeKillzones(bars);
    var i, j;

    for (i = 0; i < res.blocks.length; i++) {
      var b = res.blocks[i];
      var x0 = v.xAt(b.i0);
      var x1 = v.xAt(b.i1);
      var yTop = v.yOf(b.high);
      var yBottom = v.yOf(b.low);
      if (!isFinite(x0) || !isFinite(x1) || !isFinite(yTop) || !isFinite(yBottom)) continue;
      if (x1 < -20 || x0 > v.chartW) continue;
      c.save();
      c.fillStyle = hexAlpha(b.kz.color, 0.10);
      c.fillRect(x0, yTop, Math.max(1, x1 - x0), Math.max(1, yBottom - yTop));
      c.strokeStyle = hexAlpha(b.kz.color, 0.45);
      c.lineWidth = 1;
      c.strokeRect(x0 + 0.5, yTop + 0.5, Math.max(1, x1 - x0), Math.max(1, yBottom - yTop));
      c.restore();

      line(c, x0, yTop, v.xAt(b.hiEnd), yTop, hexAlpha(b.kz.color, 0.85), 1, [4, 3]);
      line(c, x0, yBottom, v.xAt(b.loEnd), yBottom, hexAlpha(b.kz.color, 0.85), 1, [4, 3]);
      if (b.i1 === res.latest[b.kz.id]) {
        tag(c, b.kz.id + ' H', v.xAt(b.hiEnd), yTop - 7, b.kz.color, 'right', v.chartW);
        tag(c, b.kz.id + ' L', v.xAt(b.loEnd), yBottom + 8, b.kz.color, 'right', v.chartW);
      }
    }

    for (j = 0; j < res.levels.length; j++) {
      var lv = res.levels[j];
      var lx = v.xAt(lv.i0);
      var ly = v.yOf(lv.p);
      if (!isFinite(lx) || !isFinite(ly)) continue;
      line(c, lx, ly, v.chartW, ly, hexAlpha(lv.color, 0.7), 1, [2, 3]);
      tag(c, lv.label, v.chartW - 2, ly, lv.color, 'right', v.chartW);
    }
  }

  function drawWaveTrend(c, v) {
    var res = computeWaveTrend(bars);
    var values = [];
    res.wt1.forEach(function (val) { if (isFinite(val)) values.push(val); });
    res.wt2.forEach(function (val) { if (isFinite(val)) values.push(val); });
    if (!values.length) return;

    var min = Math.min(-62, Math.min.apply(null, values));
    var max = Math.max(62, Math.max.apply(null, values));
    var span = (max - min) || 1;
    var top = v.padT;
    var height = v.plotH;

    function yOf(val) { return top + height - ((val - min) / span) * height; }

    var gapOuter = Math.abs(yOf(60) - yOf(53));
    [[60, COLORS.down, true], [53, COLORS.down, gapOuter >= 11], [0, '#94a3b8', true], [-53, COLORS.up, gapOuter >= 11], [-60, COLORS.up, true]]
      .forEach(function (lvl) {
        line(c, 0, yOf(lvl[0]), v.chartW, yOf(lvl[0]), lvl[1], 1, lvl[0] === 0 ? null : [3, 3]);
        if (!lvl[2]) return;
        c.save();
        c.font = '600 8px "JetBrains Mono", monospace';
        c.fillStyle = lvl[1];
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillText(String(lvl[0]), v.chartW + 5, yOf(lvl[0]));
        c.restore();
      });

    var fromIdx = Math.max(0, v.start - 2);
    var toIdx = Math.min(bars.length - 1, v.end + 1);
    c.save();
    c.beginPath();
    var started = false, i, x;
    for (i = fromIdx; i <= toIdx; i++) {
      if (!isFinite(res.wt1[i])) continue;
      x = v.xAt(i);
      if (!isFinite(x)) continue;
      if (!started) { c.moveTo(x, yOf(res.wt1[i])); started = true; }
      else c.lineTo(x, yOf(res.wt1[i]));
    }
    for (i = toIdx; i >= fromIdx; i--) {
      if (!isFinite(res.wt2[i])) continue;
      x = v.xAt(i);
      if (!isFinite(x)) continue;
      c.lineTo(x, yOf(res.wt2[i]));
    }
    c.closePath();
    c.fillStyle = 'rgba(59, 130, 246, 0.18)';
    c.fill();
    c.restore();

    function plot(arr, color, dash) {
      c.save();
      c.strokeStyle = color;
      c.lineWidth = 1.5;
      if (dash) c.setLineDash(dash);
      c.beginPath();
      var on = false;
      for (var k = fromIdx; k <= toIdx; k++) {
        if (!isFinite(arr[k])) { on = false; continue; }
        var xx = v.xAt(k);
        if (!isFinite(xx)) { on = false; continue; }
        if (!on) { c.moveTo(xx, yOf(arr[k])); on = true; }
        else c.lineTo(xx, yOf(arr[k]));
      }
      c.stroke();
      c.restore();
    }

    plot(res.wt1, COLORS.up, null);
    plot(res.wt2, COLORS.down, [4, 3]);

    var last = -1;
    for (i = bars.length - 1; i >= 0; i--) { if (isFinite(res.wt1[i])) { last = i; break; } }
    if (last >= 0) tag(c, 'WT ' + res.wt1[last].toFixed(1), 4, top + 8, COLORS.text, 'left', v.chartW);
  }

  /* ================================================= stack + panes ======= */
  function ensureStack() {
    var wrap = document.querySelector('.binance-chart-wrapper');
    if (!wrap) return null;
    var el = document.getElementById('chart-indicator-stack');
    if (!el) {
      el = document.createElement('div');
      el.id = 'chart-indicator-stack';
      el.className = 'chart-indicator-stack';
      INDICATORS.forEach(function (ind) {
        var pane = document.createElement('div');
        pane.className = 'chart-ind-pane';
        pane.setAttribute('data-pane', ind.id);
        pane.innerHTML = '<div class="chart-ind-pane-head"><b>' + ind.label + '</b><span>' + ind.sub + '</span>' +
          '<div class="chart-ind-controls" role="group" aria-label="Chart scale controls">' +
            '<button type="button" class="chart-ind-ctl" data-ctl="x-out" title="Zoom out (smaller candles)">&minus;</button>' +
            '<button type="button" class="chart-ind-ctl" data-ctl="x-in" title="Zoom in (larger candles)">+</button>' +
            '<button type="button" class="chart-ind-ctl" data-ctl="y-out" title="Compress price height">&updownarrow;&minus;</button>' +
            '<button type="button" class="chart-ind-ctl" data-ctl="y-in" title="Stretch price height">&updownarrow;+</button>' +
            '<button type="button" class="chart-ind-ctl" data-ctl="auto" title="Auto fit &amp; reset view">Auto</button>' +
          '</div>' +
          '<em class="chart-ind-pane-zoom">scroll = zoom · drag = pan</em></div>' +
          '<div class="chart-ind-pane-canvas"><canvas></canvas></div>';
        el.appendChild(pane);
      });
      el.querySelectorAll('.chart-ind-ctl').forEach(function (btn) {
        btn.addEventListener('click', function (ev) {
          ev.stopPropagation();
          var ctl = btn.getAttribute('data-ctl');
          if (ctl === 'x-in') applyZoomBars(view.bars <= 12 ? view.bars - 2 : Math.round(view.bars * 0.78));
          else if (ctl === 'x-out') applyZoomBars(Math.max(view.bars + 6, Math.round(view.bars * 1.28)));
          else if (ctl === 'y-in') scaleYBy(1.25);
          else if (ctl === 'y-out') scaleYBy(0.8);
          else if (ctl === 'auto') resetView();
        });
      });
      el.querySelectorAll('.chart-ind-pane-canvas').forEach(function (holder) {
        bindPaneInput(holder);
        if (paneObserver) {
          paneSizes.set(holder, {width: 0, height: 0});
          paneObserver.observe(holder);
        }
      });
      var anchor = wrap.querySelector('.binance-canvas-box');
      if (anchor && anchor.nextSibling) wrap.insertBefore(el, anchor.nextSibling);
      else wrap.appendChild(el);
    }
    stack = el;
    return el;
  }

  // TradingView-style navigation: wheel zooms (shift/wheel-x pans, axis/alt scales Y)
  // and dragging moves smoothly both left (future blank space) and right (history).
  function clampOffset(value) {
    if (!isFinite(value)) return defaultRightOffset(view.bars);
    var visible = Math.max(4, Math.min(view.bars, bars.length || view.bars));
    var minOffset = -Math.max(4, visible - 5);
    var maxOffset = Math.max(0, (bars.length || visible) - 5);
    var clamped = Math.max(minOffset, Math.min(maxOffset, Number(value)));
    if (bars.length) {
      var nextStart = Math.max(0, Math.floor((bars.length - 1) - clamped - visible));
      if (nextStart <= 80) maybeLoadMoreHistory(nextStart);
    }
    return clamped;
  }

  function paneSlot(holder) {
    if (!holder) return 8;
    var chartW = Math.max(48, holder.clientWidth - 68);
    var visible = Math.max(4, Math.min(view.bars, bars.length || view.bars));
    return chartW / Math.max(4, visible);
  }

  function applyZoomBars(nextBars, anchorFrac) {
    var clamped = Math.max(MIN_BARS, Math.min(MAX_BARS, Math.round(nextBars)));
    if (!isFinite(clamped)) return;
    if (clamped !== view.bars) {
      var oldBars = view.bars;
      var nextOffset;
      if (typeof anchorFrac === 'number' && isFinite(anchorFrac)) {
        var frac = Math.max(0, Math.min(1, anchorFrac));
        nextOffset = view.offset + (1 - frac) * (oldBars - clamped);
      } else if (view.offset <= 0) {
        nextOffset = view.offset * (clamped / Math.max(4, oldBars));
      } else {
        nextOffset = view.offset + 0.5 * (oldBars - clamped);
      }
      view.bars = clamped;
      view.offset = clampOffset(nextOffset);
      saveZoom();
      schedule();
    }
  }

  function scaleYBy(factor) {
    var next = Math.max(0.15, Math.min(8, (Number(view.yZoom) || 1) * (Number(factor) || 1)));
    if (!isFinite(next)) return;
    if (Math.abs(next - view.yZoom) > 1e-4) {
      view.yZoom = next;
      schedule();
    }
  }

  function resetView() {
    view.bars = 78;
    view.offset = defaultRightOffset(78);
    view.yZoom = 1;
    view.yPan = 0;
    saveZoom();
    lastRenderKey = '';
    schedule();
  }

  function bindPaneInput(holder) {
    if (!holder || holder.dataset.bound === '1') return;
    holder.dataset.bound = '1';

    holder.addEventListener('wheel', function (ev) {
      var rect = holder.getBoundingClientRect();
      var mx = ev.clientX - rect.left;
      var chartW = Math.max(48, rect.width - 68);
      var onAxis = rect.width > 0 && mx >= chartW;
      var modeScale = ev.deltaMode === 1 ? 16 : (ev.deltaMode === 2 ? 120 : 1);
      var dx = (Number(ev.deltaX) || 0) * modeScale;
      var dy = (Number(ev.deltaY) || 0) * modeScale;
      var absX = Math.abs(dx);
      var absY = Math.abs(dy);
      if ((onAxis || ev.altKey) && !ev.ctrlKey) {
        ev.preventDefault();
        if (absY < 0.75) return;
        scaleYBy(Math.exp(Math.max(-0.45, Math.min(0.45, -dy * 0.0018))));
        return;
      }
      var horizontal = ev.shiftKey || (absX > absY * 1.15 && absX >= 2);
      if (horizontal) {
        ev.preventDefault();
        var panDelta = ev.shiftKey ? (dy || dx) : dx;
        if (Math.abs(panDelta) < 0.5) return;
        view.offset = clampOffset(view.offset - (panDelta / paneSlot(holder)));
        schedule();
        return;
      }
      ev.preventDefault();
      // Ignore zero/sub-pixel inertia events so trackpad bounce after zooming out never zooms back in.
      if (absY < 0.75) return;
      var factor = Math.exp(Math.max(-0.45, Math.min(0.45, dy * 0.0014)));
      var target = Math.round(view.bars * factor);
      if (target === view.bars) target = dy > 0 ? view.bars + 1 : view.bars - 1;
      applyZoomBars(target, chartW > 0 ? mx / chartW : 1);
    }, { passive: false });

    holder.addEventListener('dblclick', function (ev) {
      var rect = holder.getBoundingClientRect();
      var mx = ev.clientX - rect.left;
      var chartW = Math.max(48, rect.width - 68);
      if (rect.width > 0 && mx >= chartW) {
        view.yZoom = 1;
        view.yPan = 0;
        schedule();
      }
    });

    var drag = null;
    var activePointers = new Map();
    var pinchStart = null;

    function pointerDistance() {
      var pts = Array.from(activePointers.values());
      if (pts.length < 2) return 0;
      return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }

    holder.addEventListener('pointerdown', function (ev) {
      if (ev.pointerType === 'touch') {
        activePointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        if (activePointers.size === 2) {
          drag = null;
          holder.classList.remove('dragging');
          pinchStart = { dist: pointerDistance(), bars: view.bars };
          return;
        }
      } else {
        if (ev.button !== 0) return;
        ev.preventDefault();
      }
      paneHover.set(holder, '');
      syncRadarTooltip(holder, null, 0, 0);
      var rect = holder.getBoundingClientRect();
      var mx = ev.clientX - rect.left;
      var chartW = Math.max(48, rect.width - 68);
      if (rect.width > 0 && mx >= chartW) {
        drag = { mode: 'yaxis', x: ev.clientX, y: ev.clientY, yZoom: view.yZoom };
        holder.style.cursor = 'ns-resize';
      } else {
        drag = { mode: 'pan', x: ev.clientX, y: ev.clientY, offset: view.offset, yPan: view.yPan };
        holder.classList.add('dragging');
      }
      if (holder.setPointerCapture) {
        try { holder.setPointerCapture(ev.pointerId); } catch (e) {}
      }
    });
    holder.addEventListener('pointermove', function (ev) {
      if (activePointers.has(ev.pointerId)) {
        activePointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      }
      if (pinchStart && activePointers.size >= 2) {
        var dist = pointerDistance();
        if (dist > 8 && pinchStart.dist > 8) {
          // Spreading fingers apart = zoom in (fewer bars); pinching together = zoom out (more bars).
          applyZoomBars(pinchStart.bars * (pinchStart.dist / dist));
        }
        return;
      }
      if (drag) {
        if (drag.mode === 'yaxis') {
          var dyAxis = ev.clientY - drag.y;
          var yFactor = Math.exp(Math.max(-2.2, Math.min(2.2, -dyAxis * 0.008)));
          view.yZoom = Math.max(0.15, Math.min(8, drag.yZoom * yFactor));
          schedule();
          return;
        }
        view.offset = clampOffset(drag.offset + ((ev.clientX - drag.x) / paneSlot(holder)));
        if (Math.abs(view.yZoom - 1) > 0.015 || Math.abs(drag.yPan) > 0.001) {
          var plotHDrag = Math.max(20, holder.clientHeight - 20);
          var panDeltaY = ((ev.clientY - drag.y) / plotHDrag) / Math.max(0.15, view.yZoom);
          view.yPan = Math.max(-2, Math.min(2, drag.yPan + panDeltaY));
        }
        schedule();
        return;
      }
      var rect = holder.getBoundingClientRect();
      var mx = ev.clientX - rect.left;
      var my = ev.clientY - rect.top;
      var chartW = Math.max(48, rect.width - 68);
      if (rect.width > 0 && mx >= chartW) {
        holder.style.cursor = 'ns-resize';
        if (paneHover.get(holder)) {
          paneHover.set(holder, '');
          syncRadarTooltip(holder, null, 0, 0);
          schedule();
        }
        return;
      }
      var info = paneRadar.get(holder);
      var markers = info && Array.isArray(info.markers) ? info.markers : [];
      var smcTargets = info && Array.isArray(info.smcTargets) ? info.smcTargets : [];
      if (!info || (!markers.length && !smcTargets.length)) {
        holder.style.cursor = '';
        return;
      }
      var hit = null, bestD = 15;
      markers.forEach(function (m) {
        var d = Math.hypot(mx - m.cx, my - m.cy);
        if (d <= bestD) { bestD = d; hit = m; }
      });
      if (!hit && smcTargets.length) {
        var bestSmcDist = 14;
        smcTargets.forEach(function (t) {
          var onPill = mx >= t.lx - 8 && mx <= t.lx + t.tw + 8 && Math.abs(my - t.ly) <= 13;
          var onRay = mx >= t.lineLeft - 14 && mx <= t.lineRight && Math.abs(my - t.y) <= 12;
          if (!onPill && !onRay) return;
          var d = onPill ? Math.abs(my - t.ly) * 0.5 : Math.abs(my - t.y);
          if (d < bestSmcDist) {
            bestSmcDist = d;
            hit = Object.assign({}, t, { cx: Math.max(24, Math.min(info.chartW - 14, mx)), cy: t.y });
          }
        });
      }
      var nextHover = hit ? hit.id : '';
      holder.style.cursor = hit ? 'pointer' : '';
      if (nextHover !== (paneHover.get(holder) || '')) {
        paneHover.set(holder, nextHover);
        syncRadarTooltip(holder, hit, info.w, info.h);
        schedule();
      } else if (hit) {
        syncRadarTooltip(holder, hit, info.w, info.h);
      }
    });
    function stopDrag(ev) {
      if (ev && activePointers.has(ev.pointerId)) activePointers.delete(ev.pointerId);
      if (activePointers.size < 2) pinchStart = null;
      drag = null;
      holder.classList.remove('dragging');
    }
    holder.addEventListener('pointerup', stopDrag);
    holder.addEventListener('pointercancel', stopDrag);
    holder.addEventListener('pointerleave', function () {
      if (drag && activePointers.size === 0) stopDrag();
      holder.style.cursor = '';
      if (paneHover.get(holder)) {
        paneHover.set(holder, '');
        syncRadarTooltip(holder, null, 0, 0);
        schedule();
      }
    });
  }

  /* The TradingView overlay layer (large-flow tape, market news, pressure)
     stays on screen above the panes, so it has to start where the pane stack
     starts — measured, because the legend and the indicator bar above it can
     wrap to different heights. */
  var lastStackTopVal = '';
  var stackTopDirty = true;
  function syncStackTop() {
    stackTopDirty = false;
    var wrap = document.querySelector('.binance-chart-wrapper');
    var el = document.getElementById('chart-indicator-stack');
    if (!wrap) return;
    if (wrap.classList.contains('ind-stack-on') && el) {
      var firstHead = el.querySelector('.chart-ind-pane.on .chart-ind-pane-head');
      var headH = firstHead && firstHead.offsetHeight > 0 ? (firstHead.offsetHeight + 2) : 26;
      var nextVal = (el.offsetTop + headH) + 'px';
      if (lastStackTopVal !== nextVal) {
        lastStackTopVal = nextVal;
        wrap.style.setProperty('--ind-stack-top', nextVal);
      }
    } else if (lastStackTopVal !== '') {
      lastStackTopVal = '';
      wrap.style.removeProperty('--ind-stack-top');
    }
  }

  function applyStack() {
    var wrap = document.querySelector('.binance-chart-wrapper');
    var el = ensureStack();
    if (!wrap || !el) return;
    var on = anyEnabled();
    wrap.classList.toggle('ind-stack-on', on);
    INDICATORS.forEach(function (ind) {
      var pane = el.querySelector('[data-pane="' + ind.id + '"]');
      if (pane) pane.classList.toggle('on', enabled[ind.id] === true);
    });
    stackTopDirty = true;
    if (on) schedule();
    requestAnimationFrame(syncStackTop);
  }

  window.addEventListener('resize', function () { stackTopDirty = true; syncStackTop(); });

  function schedule() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () {
      rafPending = false;
      render();
    });
  }

  function digitsFor(price) {
    var q = window.SOFT_TV_QUOTE;
    var terminal = window.SoftradeXTerminal || window.BinanceTerminal;
    var meta = terminal && terminal.MARKETS && terminal.MARKETS[dataSymbol];
    var d = (meta && Number.isInteger(meta.decimals) && meta.decimals >= 0 && meta.decimals <= 8)
      ? meta.decimals
      : (price >= 1000 ? 2 : price >= 10 ? 3 : 5);
    if (q && q.symbol === dataSymbol && Number.isInteger(q.tv_digits) && q.tv_digits >= 0 && q.tv_digits <= 8) {
      var cap = price >= 10000 ? 2 : price >= 1000 ? 3 : 8;
      d = Math.min(cap, Math.max(d, q.tv_digits));
    }
    return d;
  }

  function paintPane(canvas, id) {
    var holder = canvas.parentNode;
    // ResizeObserver measures after layout. Reading dimensions on every quote
    // forced pending live-tape changes to lay out the entire dashboard here.
    var size = paneSizes.get(holder);
    var w = size ? size.width : holder.clientWidth;
    var h = size ? size.height : holder.clientHeight;
    if (!w || !h) return;
    var dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    }
    var c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    c.fillStyle = COLORS.background;
    c.fillRect(0, 0, w, h);

    if (!bars.length) {
      c.fillStyle = COLORS.muted;
      c.font = '12px sans-serif';
      c.textAlign = 'center';
      c.fillText(dataError || (loading ? 'Loading candles…' : 'Waiting for market data…'), w / 2, h / 2);
      if (holder) syncRadarTooltip(holder, null, 0, 0);
      return;
    }

    if (id === 'wavetrend') {
      var vOsc = candleView(w, h);
      drawGrid(c, vOsc, 0);
      drawWaveTrend(c, vOsc);
      return;
    }

    var v = candleView(w, h);
    maybeLoadMoreHistory(v.start);
    var digits = digitsFor((v.plotMax + v.plotMin) / 2);
    drawGrid(c, v, digits);
    var swingBoxes = drawSwingPositionsBack(c, v);
    if (holder) paneSwingBoxes.set(holder, swingBoxes);
    drawCandles(c, v);
    if (id === 'msb') drawMSB(c, v);
    else if (id === 'killzones') drawKillzones(c, v);
    var smcTargets = drawSmartMoneyZones(c, v, digits, holder);
    drawSwingPositionsFront(c, v, digits, swingBoxes);
    drawLivePrice(c, v, digits);
    drawProfitRadarCircles(c, v, digits, holder, w, h, smcTargets);
  }

  function render() {
    if (document.hidden) return;
    var el = stack || ensureStack();
    var wrap = document.querySelector('.binance-chart-wrapper');
    if (!el || !wrap || !wrap.classList.contains('ind-stack-on')) return;
    if (currentSymbol() && dataSymbol &&
        (currentSymbol() !== dataSymbol || currentTf() !== dataTf)) {
      if (!loading) loadBars();
      return;
    }
    evaluateLiveSignal(livePrice);
    var activeMask = INDICATORS.map(function (ind) { return enabled[ind.id] ? '1' : '0'; }).join('');
    var firstPane = el.querySelector('.chart-ind-pane.on .chart-ind-pane-canvas');
    var firstSize = firstPane ? paneSizes.get(firstPane) : null;
    var hoverSig = INDICATORS.map(function (ind) {
      var p = el.querySelector('[data-pane="' + ind.id + '"] .chart-ind-pane-canvas');
      return p ? (paneHover.get(p) || '') : '';
    }).join(',');
    var themeSig = document.documentElement.classList.contains('sx-dark') ? 'D' : 'L';
    var rKey = seriesKey(bars) + '|' + bars.length + '|' + livePrice + '|' + view.bars + '|' + view.offset.toFixed(2) + '|' +
      view.yZoom.toFixed(3) + '|' + view.yPan.toFixed(4) + '|' +
      activeMask + '|' + (firstSize ? firstSize.width + 'x' + firstSize.height : '') + '|' +
      radarSignature() + '|' + liveSignalSig() + '|' + swingPositionSig() + '|' + hoverSig + '|' + themeSig + '|' +
      (loading ? 'L' : '') + (historyLoading ? 'H' : '') + '|' + (dataError || '');
    if (rKey === lastRenderKey) return;
    lastRenderKey = rKey;
    if (stackTopDirty) syncStackTop();
    INDICATORS.forEach(function (ind) {
      if (!enabled[ind.id]) return;
      var pane = el.querySelector('[data-pane="' + ind.id + '"]');
      var canvas = pane && pane.querySelector('canvas');
      if (canvas) paintPane(canvas, ind.id);
      var zoom = pane && pane.querySelector('.chart-ind-pane-zoom');
      if (zoom) {
        var meta = [view.bars + ' bars'];
        var offInt = Math.round(view.offset);
        if (offInt >= 1) meta.push(offInt + ' back');
        else if (view.offset < defaultRightOffset(view.bars) - 2) meta.push(Math.abs(offInt) + ' fwd');
        if (Math.abs(view.yZoom - 1) > 0.03) meta.push('Y ' + Math.round(view.yZoom * 100) + '%');
        if (historyLoading) meta.push('loading…');
        zoom.textContent = meta.join(' · ');
      }
      var autoBtn = pane && pane.querySelector('[data-ctl="auto"]');
      if (autoBtn) {
        autoBtn.classList.toggle('is-manual',
          Math.abs(view.yZoom - 1) > 0.02 || Math.abs(view.yPan) > 0.002 ||
          Math.abs(view.offset - defaultRightOffset(view.bars)) > 2);
      }
    });
  }

  /* ======================================================== UI =========== */
  function flashNote(text) {
    var el = document.getElementById('chart-ind-toast');
    if (!el) {
      var host = ensureStack();
      if (!host) return;
      el = document.createElement('div');
      el.id = 'chart-ind-toast';
      el.className = 'chart-ind-toast';
      host.appendChild(el);
    }
    el.textContent = text;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 5200);
  }

  function syncButtons() {
    var bar = $('chart-indicator-bar');
    if (!bar) return;
    INDICATORS.forEach(function (ind) {
      var btn = bar.querySelector('[data-indicator="' + ind.id + '"]');
      if (!btn) return;
      var on = enabled[ind.id] === true;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var hint = bar.querySelector('.chart-indicator-hint');
    if (hint) {
      hint.textContent = anyEnabled() && dataInstrument
        ? 'TradingView · ' + dataInstrument + (dataError ? ' · unavailable' : '')
        : (anyEnabled() ? 'separate pane · own study' : 'Pine port · separate panes');
    }
  }

  function toggle(id) {
    if (enabled[id]) delete enabled[id];
    else enabled[id] = true;
    // Opening a study starts with TradingView-style right breathing room while preserving zoom.
    if (!isFinite(view.bars) || view.bars < MIN_BARS || view.bars > MAX_BARS) view.bars = 78;
    view.offset = defaultRightOffset(view.bars);
    lastRenderKey = '';
    savePrefs();
    syncButtons();
    applyStack();
    if (anyEnabled()) {
      flashNote('TradingView\u2019s widget cannot run Pine scripts \u2014 the study opens in its own pane inside the chart.');
      if (!bars.length || currentSymbol() !== dataSymbol || currentTf() !== dataTf) loadBars();
    }
    schedule();
  }

  function bindButtons() {
    var bar = $('chart-indicator-bar');
    if (!bar) return;
    INDICATORS.forEach(function (ind) {
      var btn = bar.querySelector('[data-indicator="' + ind.id + '"]');
      if (!btn) return;
      btn.addEventListener('click', function () { toggle(ind.id); });
    });
    syncButtons();
    applyStack();
  }

  /* ==================================================== wiring =========== */
  window.addEventListener('chart:geometry', function (ev) {
    geometry = ev.detail || null;
  });

  window.addEventListener('chart:tv-quote', function (ev) { acceptQuote(ev.detail); });
  window.addEventListener('swing:state', function () {
    lastRenderKey = '';
    if (anyEnabled()) schedule();
  });
  window.addEventListener('chart:smc-radar-update', function () {
    lastRenderKey = '';
    if (anyEnabled()) schedule();
  });

  window.addEventListener('chart:price-range', function (ev) {
    if (!geometry) return;
    var d = ev.detail || {};
    if (isFinite(d.min) && isFinite(d.max) && d.max > d.min) {
      geometry.plotMin = d.min;
      geometry.plotMax = d.max;
    }
  });

  window.addEventListener('chart:market', function (ev) {
    var symbol = (ev.detail && ev.detail.symbol) || '';
    if (symbol && symbol !== dataSymbol) {
      ++dataToken;
      if (barsRequest) barsRequest.abort();
      barsRequest = null;
      loading = false;
      historyLoading = false;
      historyMaxed = false;
      historyTarget = CANDLE_COUNT;
      bars = [];
      livePrice = livePriceAt = 0;
      lastRenderKey = '';
      signalStack = [];
      dismissedSignals = {};
      lastSignalPrice = 0;
      stopBeaconPulse();
      view.offset = defaultRightOffset(view.bars);
      view.yZoom = 1;
      view.yPan = 0;
      if (anyEnabled()) loadBars();
    }
    schedule();
  });

  window.addEventListener('chart:interval', function (ev) {
    var tf = (ev.detail && ev.detail.tf) || '';
    if (tf && tf !== dataTf) {
      ++dataToken;
      if (barsRequest) barsRequest.abort();
      barsRequest = null;
      loading = false;
      historyLoading = false;
      historyMaxed = false;
      historyTarget = CANDLE_COUNT;
      bars = [];
      livePrice = livePriceAt = 0;
      lastRenderKey = '';
      signalStack = [];
      dismissedSignals = {};
      lastSignalPrice = 0;
      stopBeaconPulse();
      view.offset = defaultRightOffset(view.bars);
      view.yZoom = 1;
      view.yPan = 0;
      if (anyEnabled()) loadBars();
    }
    schedule();
  });

  window.addEventListener('resize', function () { schedule(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) schedule(); });
  window.addEventListener('softradex:theme', function () {
    syncIndicatorTheme();
    schedule();
  });

  function bootChartIndicators() {
    bindButtons();
    if (anyEnabled()) loadBars();
    armRefresh();
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootChartIndicators);
  else bootChartIndicators();

  window.ChartIndicators = {
    list: function () { return INDICATORS.slice(); },
    active: function () {
      return INDICATORS.filter(function (ind) { return enabled[ind.id]; })
        .map(function (ind) { return ind.id; });
    },
    setEnabled: function (id, on) {
      if (on) enabled[id] = true;
      else delete enabled[id];
      if (!isFinite(view.bars) || view.bars < MIN_BARS || view.bars > MAX_BARS) view.bars = 78;
      view.offset = defaultRightOffset(view.bars);
      lastRenderKey = '';
      savePrefs();
      syncButtons();
      applyStack();
      if (anyEnabled()) loadBars();
      schedule();
    },
    toggle: toggle,
    zoomBy: function (factor) {
      var next = Math.round(view.bars * (Number(factor) || 1));
      if (next === view.bars && factor > 1) next = view.bars + 6;
      else if (next === view.bars && factor < 1) next = view.bars - 6;
      applyZoomBars(next);
    },
    scaleYBy: scaleYBy,
    panBackBy: function (delta) {
      view.offset = clampOffset(view.offset + (Number(delta) || 0));
      schedule();
    },
    resetZoom: resetView,
    debug: function () {
      var pane = document.querySelector('[data-pane="msb"] canvas');
      if (!pane) return null;
      var holder = pane.parentNode;
      var info = holder ? paneRadar.get(holder) : null;
      var v = candleView(pane.clientWidth, pane.clientHeight);
      var digits = digitsFor((v.plotMax + v.plotMin) / 2);
      var step = nicePriceStep(v.plotMax - v.plotMin, v.plotH, Math.pow(10, -digits));
      var niceTicks = [];
      if (step > 0 && isFinite(step)) {
        var tFirst = Math.ceil(v.plotMin / step) * step;
        for (var tk = tFirst; tk <= v.plotMax + step * 1e-6 && niceTicks.length < 24; tk += step) {
          var tickY = v.yOf(tk);
          if (tickY >= v.padT + 2 && tickY <= v.h - 4) niceTicks.push(formatChartPx(tk, digits));
        }
      }
      return {
        bars: bars.length,
        historyTarget: historyTarget,
        first: bars[0] || null,
        last: bars[bars.length - 1] || null,
        tf: dataTf,
        view: {
          bars: view.bars, offset: view.offset, yZoom: v.yZoom, yPan: view.yPan,
          slot: v.slot, start: v.start, end: v.end
        },
        plotMin: v.plotMin,
        plotMax: v.plotMax,
        niceStep: step,
        niceTicks: niceTicks,
        slot: v.slot,
        rightEdgeX: v.rightEdgeX,
        paneSize: [pane.clientWidth, pane.clientHeight],
        radarMarkers: info ? info.markers.map(function (m) {
          var liveTop = signalStack.length ? signalStack[signalStack.length - 1] : null;
          var rLit = !!(liveTop && liveTop.kind === 'radar' &&
            (m.id === 'entry' || m.id === 'tp1' || m.id === 'tp2' || (liveTop.showSl && m.id === 'sl')));
          return { id: m.id, price: m.price, cx: m.cx, cy: m.cy, badge: m.badge, lit: rLit };
        }) : [],
        smcTargets: info && Array.isArray(info.smcTargets) ? info.smcTargets.map(function (t) {
          return { id: t.id, title: t.title, cx: t.cx, cy: t.cy, pxText: t.pxText, guides: t.guides || [], lit: !!t.lit, showSl: !!t.showSl };
        }) : [],
        liveSignal: signalStack.length ? (function () {
          var top = signalStack[signalStack.length - 1];
          var actGuides = ['TP1', 'TP2'];
          if (top.showSl) actGuides.unshift('SL');
          return {
            id: top.id, kind: top.kind, side: top.side, label: top.label,
            price: top.price, stop: top.stop, tp1: top.tp1, tp2: top.tp2,
            showSl: !!top.showSl, guides: actGuides,
            stackDepth: signalStack.length,
            stackIds: signalStack.map(function (s) { return s.id; })
          };
        })() : null,
        swingPositions: holder && paneSwingBoxes.get(holder) ? paneSwingBoxes.get(holder) : [],
        hoveredRadar: holder ? (paneHover.get(holder) || '') : ''
      };
    },
    // diagnostic view of the ICT session replay (used to verify the pane and
    // to compare the boxes against the feed's bar timestamps)
    killzones: function () {
      if (!bars.length) return null;
      var res = computeKillzones(bars);
      return {
        blocks: res.blocks.map(function (b) {
          return {
            id: b.kz.id, i0: b.i0, i1: b.i1, high: b.high, low: b.low,
            hiEnd: b.hiEnd, loEnd: b.loEnd,
            t0: bars[b.i0].t, t1: bars[b.i1].t
          };
        }),
        latest: res.latest,
        levels: res.levels
      };
    },
    state: function () {
      return {
        active: window.ChartIndicators.active(),
        bars: bars.length,
        symbol: dataSymbol,
        tf: dataTf,
        tvSymbol: dataInstrument,
        price: livePrice,
        priceAt: livePriceAt,
        loading: loading,
        error: dataError,
        geometry: geometry,
        stack: !!stack && stack.classList.contains('on'),
        panes: INDICATORS.filter(function (ind) {
          var pane = document.querySelector('[data-pane="' + ind.id + '"]');
          return pane && pane.classList.contains('on');
        }).map(function (ind) { return ind.id; })
      };
    }
  };
})();


}
