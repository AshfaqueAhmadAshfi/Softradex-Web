// @ts-nocheck
/* Consolidated TypeScript module */
export function loadModule(): void {
  (window as any).SOFTRADEX_PUBLIC_ONLY = true;

// ==================== traders-terminal.js ====================
/* Anonymous executions from the same verified venue feeds as the board. */
(function () {
  'use strict';
  const FLOW_WINDOW = 45000, HISTORY_WINDOW = 300000;
  let activeSymbol = '', prints = [], seen = new Set(), filter = 'all', paused = false;
  let paintTimer = null, tapeSignature = '', lastPrice = 0;
  const priceFormat = new Intl.NumberFormat('en-US', {maximumFractionDigits: 5});
  const qtyFormat = new Intl.NumberFormat('en-US', {maximumFractionDigits: 6});
  const timeFormat = new Intl.DateTimeFormat(undefined, {hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false});
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const canonical = v => {
    const key = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/M$/, '');
    return ({XAU:'XAUUSD',GOLD:'XAUUSD',XAUUSD247:'XAUUSD',BTC:'BTCUSDT',BTCUSD:'BTCUSDT',ETH:'ETHUSDT',ETHUSD:'ETHUSDT',SOL:'SOLUSDT',SOLUSD:'SOLUSDT'})[key] || key;
  };
  const money = v => {
    const n = Math.abs(Number(v) || 0);
    return '$' + (n >= 1e6 ? (n/1e6).toFixed(2)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : n.toFixed(2));
  };
  function set(selector, text) { document.querySelectorAll(selector).forEach(e => { if(e.textContent!==text)e.textContent = text; }); }
  function selectedMarket() {
    const terminal = window.SoftradeXTerminal || window.BinanceTerminal;
    return terminal?.getCurrentSymbol?.() || terminal?.symbol?.() ||
      (typeof window.flowSymbol === 'function' ? window.flowSymbol() : '') ||
      document.getElementById('flow-symbol-label')?.textContent || '';
  }
  function trim(now) {
    const cutoff = (now || Date.now()) - HISTORY_WINDOW;
    let drop = 0;
    while (drop < prints.length && prints[drop].ts < cutoff) drop++;
    if (prints.length - drop > 20000) drop = prints.length - 20000;
    if (drop > 0) prints.splice(0, drop);
  }
  function totals() {
    const now = Date.now();
    trim(now);
    const flowCutoff = now - FLOW_WINDOW;
    const speedCutoff = now - 3000;
    let buyVol = 0, sellVol = 0, buyCount = 0, sellCount = 0, speedCount = 0;
    for (let i = prints.length - 1; i >= 0; i--) {
      const t = prints[i];
      if (t.ts < flowCutoff) break;
      if (t.ts >= speedCutoff) speedCount++;
      if (t.side === 'BUY') { buyVol += t.value; buyCount++; }
      else { sellVol += t.value; sellCount++; }
    }
    const totalVol = buyVol + sellVol;
    return {symbol:activeSymbol,buyVol,sellVol,totalVol,buyPct:totalVol?buyVol/totalVol*100:50,sellPct:totalVol?sellVol/totalVol*100:50,
      buyCount,sellCount,openBuyVol:0,openSellVol:0,openBuyCount:0,openSellCount:0,openCount:0,closeCount:0,closeVol:0,
      netDelta:buyVol-sellVol,speed:speedCount/3,lastPrice};
  }
  function receive(detail) {
    if (!detail || !activeSymbol || canonical(detail.symbol)!==canonical(activeSymbol)) return;
    const list = Array.isArray(detail.trades) ? detail.trades : [];
    if (!list.length) return;
    const now = Date.now();
    const minTs = now - HISTORY_WINDOW, maxTs = now + 5000;
    let outOfOrder = false;
    let prevTs = prints.length ? prints[prints.length - 1].ts : 0;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      const price=Number(t.price),qty=Number(t.qty),ts=Number(t.ts),side=String(t.side).toUpperCase();
      if (!(price>0) || !(qty>0) || !(ts>0) || ts>maxTs || ts<minTs || (side!=='BUY'&&side!=='SELL')) continue;
      const id=[detail.venue,detail.pair,t.id||[ts,side,price,qty].join('|')].join(':');
      if(seen.has(id))continue;
      seen.add(id);if(seen.size>30000)seen.delete(seen.values().next().value);
      if (ts < prevTs) outOfOrder = true;
      prevTs = ts;
      prints.push({id,side,price,qty,ts,value:price*qty,venue:detail.venue,pair:detail.pair});
    }
    if (outOfOrder) prints.sort((a,b)=>a.ts-b.ts);
    if(prints.length)lastPrice=prints[prints.length-1].price;
    schedulePaint();
  }
  function schedulePaint(){if(!paintTimer)paintTimer=setTimeout(()=>{paintTimer=null;paint();},200);}
  let lastMetaKey = '', lastStatsKey = '', lastStaticSet = false;
  function paint(force){
    if(document.hidden&&!force)return;
    const stats=totals();
    const sources=window.MultiExchangeOrderFlow?.getBreakdown?.()||[];
    const healthy=sources.filter(s=>s.id!=='traders'&&['LIVE','QUIET'].includes(s.status)).length;
    const pairCount=sources.filter(s=>s.id!=='traders'&&s.pair).length;
    const status=paused?'Display paused · feed continues':healthy?healthy+'/'+pairCount+' feeds responding · anonymous executed flow · rolling 45s':pairCount?'Venue feeds unavailable / connecting · retrying':'No public exchange tape for '+(activeSymbol||'this market');
    const metaKey = stats.buyCount+'|'+stats.sellCount+'|'+Math.round(stats.buyVol)+'|'+Math.round(stats.sellVol)+'|'+stats.speed.toFixed(1)+'|'+healthy+'|'+paused+'|'+activeSymbol;
    if (metaKey !== lastMetaKey || force) {
      lastMetaKey = metaKey;
      set('.tt-buy-vol-val',stats.buyPct.toFixed(0)+'% ('+money(stats.buyVol)+')');
      set('.tt-sell-vol-val',stats.sellPct.toFixed(0)+'% ('+money(stats.sellVol)+')');
      set('.tt-close-stat-val',(stats.buyCount+stats.sellCount)+' prints ('+money(stats.totalVol)+')');
      set('.tt-speed-val',stats.speed.toFixed(1)+' tx/s');
      const buyW = stats.buyPct+'%', sellW = stats.sellPct+'%';
      document.querySelectorAll('.tt-meter-buy, #tt-meter-buy').forEach(e=>{if(e.style.width!==buyW)e.style.width=buyW;});
      document.querySelectorAll('.tt-meter-sell, #tt-meter-sell').forEach(e=>{if(e.style.width!==sellW)e.style.width=sellW;});
      const deltaHtml = 'DELTA: <b class="'+(stats.netDelta>=0?'pos':'neg')+'">'+(stats.netDelta>=0?'+':'-')+money(stats.netDelta)+'</b>';
      document.querySelectorAll('.tt-foot-net-delta').forEach(e=>{if(e.innerHTML!==deltaHtml)e.innerHTML=deltaHtml;});
      set('.tt-status-text, #tt-status-text',status);
    }
    const statsKey = Math.round(stats.buyVol)+'|'+Math.round(stats.sellVol)+'|'+stats.buyCount+'|'+stats.sellCount+'|'+stats.lastPrice;
    if (statsKey !== lastStatsKey || force) {
      lastStatsKey = statsKey;
      for(const name of ['applyOrderFlowToWatchDials','applyOrderFlowToAiMarket'])if(typeof window[name]==='function')window[name](stats);
      window.dispatchEvent(new CustomEvent('traders:stats',{detail:stats}));
    }
    if(paused&&!force)return;
    const visible=[];
    for(let i=prints.length-1;i>=0&&visible.length<80;i--){
      const t=prints[i];
      if(filter==='buy'?t.side==='BUY':filter==='sell'?t.side==='SELL':filter==='whale'?t.value>=25000:filter!=='close') visible.push(t);
    }
    const signature=activeSymbol+'|'+filter+'|'+visible.map(t=>t.id).join('|');
    if(signature===tapeSignature)return;tapeSignature=signature;
    const rowHtml=t=>{
      const side=t.side==='BUY'?'buy':'sell';
      return '<div class="tt-row '+side+(t.value>=25000?' whale-trade':'')+'"><span class="tt-cell-time">'+esc(timeFormat.format(t.ts))+'</span><b class="tt-cell-side '+side+'">'+t.side+'</b><span class="tt-cell-action"><span class="tt-action-badge open">EXECUTED</span></span><span class="tt-cell-price">'+priceFormat.format(t.price)+'</span><span class="tt-cell-amount">'+qtyFormat.format(t.qty)+'</span><strong class="tt-cell-total">'+money(t.value)+'</strong><span class="tt-cell-trader" title="'+esc(t.pair)+'">'+esc(String(t.venue).toUpperCase())+' · '+esc(t.pair)+'</span></div>';
    };
    const empty='<div class="tt-divider-row">No recent verified executions for '+esc(activeSymbol||'this market')+'.</div>';
    document.querySelectorAll('.tt-tape-body').forEach(e=>{
      if(window.LiveTapeRenderer)window.LiveTapeRenderer.render(e,visible,t=>activeSymbol+'|'+t.id,rowHtml,empty);
      else e.innerHTML=visible.length?visible.map(rowHtml).join(''):empty;
    });
    if(!lastStaticSet){
      lastStaticSet=true;
      set('.tt-realized-val, .tt-unrealized-val, .tt-winrate-val, .tt-open-count-val','N/A');
      const runningMsg='Public feeds do not publish running positions or SL/TP exits.';
      document.querySelectorAll('.tt-running-body').forEach(e=>{if(e.textContent!==runningMsg)e.textContent=runningMsg;});
    }
  }
  function switchMarket(symbol){
    const next=String(symbol||'').trim();
    if(!next)return;
    const changed=canonical(next)!==canonical(activeSymbol);
    if(!changed){
      activeSymbol=next;
      set('#tt-connected-symbol, .tt-connected-symbol, #tt-sidebar-connected-symbol',activeSymbol.toUpperCase());
      paint();return;
    }
    activeSymbol=next;prints=[];seen.clear();lastPrice=0;tapeSignature='';
    set('#tt-connected-symbol, .tt-connected-symbol, #tt-sidebar-connected-symbol',activeSymbol.toUpperCase());
    if(typeof window.renderMarketWatches==='function')window.renderMarketWatches();
    // A market switch must discard the previous tape, even while paused/hidden.
    paint(true);
  }
  function init(){
    window.addEventListener('orderflow:prints',e=>receive(e.detail));
    window.addEventListener('chart:market',e=>switchMarket(e.detail?.symbol||e.detail?.meta?.symbol));
    document.querySelectorAll('.traders-terminal-panel').forEach(panel=>{
      panel.querySelectorAll('.tt-filter-btn').forEach(button=>{
        if(button.dataset.filter==='open')button.textContent='EXECUTED';
        if(button.dataset.filter==='close'){button.disabled=true;button.title='Position exits are not published by public trade APIs';}
        button.addEventListener('click',()=>{filter=button.dataset.filter||'all';document.querySelectorAll('.tt-filter-btn').forEach(e=>e.classList.toggle('active',e.dataset.filter===filter));tapeSignature='';paint();});
      });
      const closedLabel=panel.querySelector('.tt-close-stat .tt-stat-lbl');if(closedLabel)closedLabel.textContent='EXECUTED · 45s';
      const routeLabel=panel.querySelector('.tt-columns-head .tt-col-trader');if(routeLabel)routeLabel.textContent='VENUE / PAIR';
      panel.querySelector('[id$="pause-btn"], .tt-pause-btn')?.addEventListener('click',e=>{paused=!paused;e.currentTarget.textContent=paused?'▶':'⏸';tapeSignature='';paint();});
      panel.querySelector('[id$="clear-btn"], .tt-clear-btn')?.addEventListener('click',()=>{prints=[];tapeSignature='';paint();});
    });
    switchMarket(selectedMarket());
    let lastIdlePaint = 0;
    setInterval(()=>{if(document.hidden)return;const symbol=selectedMarket();if(symbol&&canonical(symbol)!==canonical(activeSymbol)){switchMarket(symbol);return;}const now=Date.now();if(prints.length>0||now-lastIdlePaint>=3000){lastIdlePaint=now;paint();}},1000);
  }
  window.TradersTerminal={switchMarket,getActiveSymbol:()=>activeSymbol,onSnapshot:()=>{},onTradeClosed:()=>{},
    onPriceTick:(symbol,price)=>{if(canonical(symbol)===canonical(activeSymbol)&&Number(price)>0)lastPrice=Number(price);},
    addTrade:t=>{if(t?.verified)receive({symbol:t.symbol,venue:t.venue,pair:t.pair,trades:[t]});},
    getOpenVolume:()=>({openBuyVol:0,openSellVol:0,openBuyCount:0,openSellCount:0}),getRunningPositions:()=>[],
    getAnalysisStats:()=>({realizedPnl:null,unrealizedPnl:null,winCount:0,lossCount:0,openCount:0,turnover:totals().totalVol,lastPrice}),
    getCandleFlow:(time,interval)=>{const start=Number(time)<1e11?Number(time)*1000:Number(time),end=start+(Number(interval)||300)*1000;return prints.filter(t=>t.ts>=start&&t.ts<end).reduce((out,t)=>{out[t.side==='BUY'?'buy':'sell']+=t.value;return out;},{buy:0,sell:0});}
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();


// ==================== binance-order-flow-terminal.js ====================
/**
 * Binance Order Flow Terminal
 * Captures real Binance aggregate trades for the market selected in Stage 01.
 * Binance aggTrade messages identify the taker side:
 *   m=true  -> the taker sold
 *   m=false -> the taker bought
 */
(function () {
  'use strict';

  const PAIRS = {
    BTC: 'btcusdt',
    ETH: 'ethusdt',
    SOL: 'solusdt',
    XAU: 'paxgusdt',
    GOLD: 'paxgusdt'
  };
  const states = new Map();
  let selectedSymbol = '';
  let selectedPair = '';
  let socket = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let paused = false;
  let filter = 'ALL';
  let marketGeneration = 0, pollBusy = false, paintTimer = null;
  let pendingPrints = [];
  const numberFormats = new Map();
  const timeFormat = new Intl.DateTimeFormat(undefined, {hour: 'numeric', minute: '2-digit', second: '2-digit'});

  function $(id) { return document.getElementById(id); }

  function stateFor(pair) {
    if (!states.has(pair)) {
      states.set(pair, { buy: 0, sell: 0, buyCount: 0, sellCount: 0, trades: [], seen: new Set(), lastPollAt: 0, lastDataAt: 0, error: '', _calcAt: 0, _dirty: false, tapeKey: '' });
    }
    const state = states.get(pair);
    const now = Date.now();
    const cutoff = now - 45000;
    let drop = 0;
    while (drop < state.trades.length && state.trades[drop].ts < cutoff) drop++;
    if (drop > 0) {
      state.trades.splice(0, drop);
      state._dirty = true;
    }
    if (!state._dirty && now - (state._calcAt || 0) < 200) return state;
    let buy = 0, sell = 0, buyCount = 0;
    for (let i = 0; i < state.trades.length; i++) {
      const t = state.trades[i];
      if (t.side === 'BUY') { buy += t.notional; buyCount++; }
      else sell += t.notional;
    }
    state.buy = buy;
    state.sell = sell;
    state.buyCount = buyCount;
    state.sellCount = state.trades.length - buyCount;
    state._calcAt = now;
    state._dirty = false;
    return state;
  }

  function compact(value) {
    const n = Number(value) || 0;
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n.toFixed(2);
  }

  function number(value, decimals) {
    if (!numberFormats.has(decimals)) numberFormats.set(decimals, new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals, maximumFractionDigits: decimals
    }));
    return numberFormats.get(decimals).format(Number(value) || 0);
  }

  function pairForSymbol(symbol) {
    const raw = String(symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    for (const key of Object.keys(PAIRS)) {
      if (raw.indexOf(key) === 0) return PAIRS[key];
    }
    if (/^[A-Z0-9]+USDT$/.test(raw)) return raw.toLowerCase();
    return '';
  }

  function setText(id, value) {
    const el = $(id);
    if (el && el.textContent !== String(value)) el.textContent = value;
  }

  function combinedTotals() {
    const state = stateFor(selectedPair);
    const combined = window.MultiExchangeOrderFlow &&
      typeof window.MultiExchangeOrderFlow.getOpenTotals === 'function'
      ? window.MultiExchangeOrderFlow.getOpenTotals() : null;
    if (combined) {
      return {
        buy: Number(combined.buy) || 0,
        sell: Number(combined.sell) || 0,
        venueBuy: Number(combined.venueBuy) || 0,
        venueSell: Number(combined.venueSell) || 0,
        binanceBuy: Number(combined.binanceBuy) || 0,
        binanceSell: Number(combined.binanceSell) || 0,
        tradersBuy: Number(combined.tradersBuy) || 0,
        tradersSell: Number(combined.tradersSell) || 0,
        breakdown: combined.breakdown || [],
        buyCount: state.buyCount,
        sellCount: state.sellCount
      };
    }
    let tradersBuy = 0;
    let tradersSell = 0;
    const terminal = window.TradersTerminal;
    if (terminal && typeof terminal.getOpenVolume === 'function') {
      try {
        const totals = terminal.getOpenVolume() || {};
        tradersBuy = Number(totals.openBuyVol) || 0;
        tradersSell = Number(totals.openSellVol) || 0;
      } catch (e) {}
    }
    const otherExchanges = window.MultiExchangeOrderFlow &&
      typeof window.MultiExchangeOrderFlow.getTotals === 'function'
      ? window.MultiExchangeOrderFlow.getTotals() : { buy: 0, sell: 0 };
    const breakdown = window.MultiExchangeOrderFlow &&
      typeof window.MultiExchangeOrderFlow.getBreakdown === 'function'
      ? window.MultiExchangeOrderFlow.getBreakdown() : [];
    const venueBuy = Number(otherExchanges.buy) || 0;
    const venueSell = Number(otherExchanges.sell) || 0;
    const binanceBuy = Number(state.buy) || 0;
    const binanceSell = Number(state.sell) || 0;
    return {
      // The top chips represent every source once: 12 public venue tapes,
      // Binance's own tape, and the Traders terminal's running open positions.
      buy: venueBuy + binanceBuy + tradersBuy,
      sell: venueSell + binanceSell + tradersSell,
      venueBuy,
      venueSell,
      binanceBuy,
      binanceSell,
      tradersBuy,
      tradersSell,
      breakdown,
      buyCount: state.buyCount,
      sellCount: state.sellCount
    };
  }

  // One line per source so the chip total can be read back to every terminal
  // on the page: the 12 venues, Binance, then the Traders open positions.
  function sourceLines(totals, side) {
    const lines = [
      `12 VENUES ${side.toUpperCase()}: ${compact(totals['venue' + side])}`,
      `BINANCE ${side.toUpperCase()}: ${compact(totals['binance' + side])}`
    ];
    const key = side === 'Buy' ? 'buy' : 'sell';
    const venues = (totals.breakdown || []).filter(entry => !entry.extra);
    for (let i = 0; i < venues.length; i += 3) {
      lines.push(venues.slice(i, i + 3)
        .map(entry => `${entry.name} ${compact(entry[key])}`)
        .join(' + '));
    }
    lines.push(`TOTAL ${side.toUpperCase()} EXECUTED FLOW: ${compact(totals[side === 'Buy' ? 'buy' : 'sell'])}`);
    return lines.join('\n');
  }

  let lastChipKey = '';
  function updateTopChips() {
    if (document.hidden) return;
    const totals = combinedTotals();
    const buy = compact(totals.buy);
    const sell = compact(totals.sell);
    const key = `${selectedPair}|${buy}|${sell}|${compact(totals.binanceBuy)}|${compact(totals.binanceSell)}|${compact(totals.venueBuy)}|${compact(totals.venueSell)}`;
    if (key === lastChipKey) return;
    lastChipKey = key;
    document.querySelectorAll('.b-open-buy-val').forEach(el => { if (el.textContent !== buy) el.textContent = buy; });
    document.querySelectorAll('.b-open-sell-val').forEach(el => { if (el.textContent !== sell) el.textContent = sell; });
    const buyChip = $('b-open-buy-chip');
    const sellChip = $('b-open-sell-chip');
    if (sellChip) {
      sellChip.title = `COMBINED ${selectedPair.toUpperCase()} SELL FLOW (12 venues + Binance, rolling 45s): ${sell}\n` +
        sourceLines(totals, 'Sell');
    }
    if (buyChip) {
      buyChip.title = `COMBINED ${selectedPair.toUpperCase()} BUY FLOW (12 venues + Binance, rolling 45s): ${buy}\n` +
        sourceLines(totals, 'Buy');
    }
  }

  function render() {
    if (document.hidden) return;
    const state = stateFor(selectedPair);
    const total = state.buy + state.sell;
    const buyPct = total ? Math.round((state.buy / total) * 100) : 0;
    const sellPct = total ? 100 - buyPct : 0;
    setText('bof-market', selectedPair ? selectedPair.toUpperCase() : '—');
    setText('bof-status', paused ? 'DISPLAY PAUSED' : feedStatus(state));
    setText('bof-buy-total', compact(state.buy));
    setText('bof-sell-total', compact(state.sell));
    setText('bof-buy-pct', `${buyPct}%`);
    setText('bof-sell-pct', `${sellPct}%`);
    const body = $('bof-tape');
    if (!body || paused) return;
    const rows = [];
    for (let i = state.trades.length - 1; i >= 0 && rows.length < 80; i--) {
      const tr = state.trades[i];
      if (filter === 'ALL' || tr.side === filter) rows.push(tr);
    }
    const first = rows[0], last = rows[rows.length - 1];
    const tapeKey = filter + '|' + rows.length + '|' + (first ? first.id : '') + '|' + (last ? last.id : '');
    if (tapeKey === state.tapeKey) return;
    state.tapeKey = tapeKey;
    const rowHtml = tr => `
      <div class="bof-row ${tr.side === 'BUY' ? 'buy' : 'sell'}">
        <span>${timeFormat.format(tr.ts)}</span>
        <b>${tr.side}</b>
        <span>${number(tr.price, tr.price >= 100 ? 2 : 5)}</span>
        <span>${number(tr.qty, 6)}</span>
        <strong>${compact(tr.notional)}</strong>
      </div>`;
    if (window.LiveTapeRenderer) window.LiveTapeRenderer.render(body, rows,
      tr => selectedPair + '|' + tr.id, rowHtml, '');
    else body.innerHTML = rows.map(rowHtml).join('');
  }

  function setConnection(kind, text) {
    const dot = $('bof-pulse');
    if (dot) dot.className = 'bof-pulse ' + kind;
    setText('bof-status', text);
  }

  function closeSocket() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (socket) {
      const old = socket;
      socket = null;
      old.onmessage = old.onerror = old.onclose = null;
      old.onopen = null;
      if (old.readyState === 0) {
        old.onopen = () => { old.onopen = null; old.close(); };
      } else if (old.readyState === 1) {
        old.close();
      }
    }
  }

  function scheduleReconnect() {
    if (!selectedPair || reconnectTimer) return;
    const wait = Math.min(30000, 1000 * Math.pow(1.7, reconnectAttempt++));
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, wait);
  }

  function connect() {
    closeSocket();
    if (!selectedPair) {
      setConnection('offline', 'NO BINANCE PAIR');
      render();
      return;
    }
    setConnection('connecting', 'CONNECTING');
    try {
      socket = new WebSocket(`wss://stream.binance.com:9443/ws/${selectedPair}@aggTrade`);
      socket.onopen = () => {
        reconnectAttempt = 0;
        setConnection('live', 'CONNECTED');
        render();
      };
      socket.onmessage = event => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.s && String(msg.s).toLowerCase() !== selectedPair) return;
          ingest([{id:msg.a, side:msg.m ? 'SELL' : 'BUY', price:msg.p, qty:msg.q, ts:msg.T}]);
        } catch (e) {
          setConnection('error', 'INVALID BINANCE DATA');
        }
      };
      socket.onerror = () => setConnection('error', 'BINANCE STREAM ERROR');
      socket.onclose = () => {
        socket = null;
        if (selectedPair) {
          setConnection('connecting', 'RECONNECTING');
          scheduleReconnect();
        }
      };
    } catch (e) {
      setConnection('error', 'BINANCE UNAVAILABLE');
      scheduleReconnect();
    }
  }

  function switchMarket(symbol) {
    const nextSymbol = String(symbol || '');
    const nextPair = pairForSymbol(nextSymbol);
    // XAUUSD, XAUUSDm and PAXGUSDT all map to one stream: never tear down a
    // healthy connection just because the label around it changed.
    if (nextPair && nextPair === selectedPair && socket) {
      selectedSymbol = nextSymbol;
      updateTopChips();
      return;
    }
    selectedSymbol = nextSymbol;
    selectedPair = nextPair; marketGeneration++; pollBusy = false; pendingPrints = [];
    closeSocket();
    reconnectAttempt = 0;
    updateTopChips();
    render();
    connect(); pollFallback();
  }

  function feedStatus(state) {
    if (!selectedPair) return 'NO PAIR';
    const live = (socket && socket.readyState === 1) || Date.now() - Math.max(state.lastPollAt,state.lastDataAt) < 15000;
    return live ? (state.trades.length ? 'LIVE' : 'QUIET') : state.error ? 'UNAVAILABLE' : 'CONNECTING';
  }
  function ingest(rows) {
    const state = stateFor(selectedPair);
    const now = Date.now(), maxTs = now + 5000;
    let outOfOrder = false;
    let prevTs = state.trades.length ? state.trades[state.trades.length - 1].ts : 0;
    for (let i = 0; i < rows.length; i++) {
      const t = rows[i];
      const price = Number(t.price), qty = Number(t.qty), ts = Number(t.ts);
      if (!(price > 0) || !(qty > 0) || !(ts > 0) || ts > maxTs || (t.side !== 'BUY' && t.side !== 'SELL')) continue;
      const id = String(t.id == null ? [ts,t.side,price,qty].join('|') : t.id);
      if (state.seen.has(id)) continue;
      state.seen.add(id); if (state.seen.size > 30000) state.seen.delete(state.seen.values().next().value);
      if (ts < prevTs) outOfOrder = true;
      prevTs = ts;
      const trade = {id,ts,side:t.side,price,qty,notional:price*qty};
      state.trades.push(trade); pendingPrints.push(trade); state.lastDataAt = now;
      state._dirty = true;
    }
    if (outOfOrder) state.trades.sort((a,b) => a.ts - b.ts);
    if (!paintTimer) paintTimer = setTimeout(() => {
      paintTimer = null;
      const batch = pendingPrints; pendingPrints = [];
      if (batch.length) window.dispatchEvent(new CustomEvent('orderflow:prints', {
        detail: {symbol:selectedSymbol,venue:'binance',pair:selectedPair.toUpperCase(),trades:batch}
      }));
      updateTopChips(); render();
    }, 200);
  }
  async function pollFallback() {
    if (document.hidden) return;
    if (pollBusy || !selectedPair) return;
    // Skip redundant REST polling while the live WebSocket is delivering prints.
    if (socket && socket.readyState === 1 && Date.now() - (stateFor(selectedPair).lastDataAt || 0) < 10000) return;
    const generation = marketGeneration, pair = selectedPair, symbol = selectedSymbol;
    pollBusy = true;
    try {
      const response = await fetch('/api/orderflow/trades?venue=binance&market=' + encodeURIComponent(symbol) + '&limit=200',
        {cache:'no-store',signal:AbortSignal.timeout(12000)});
      if (generation !== marketGeneration) return;
      if (!response.ok) { stateFor(pair).error = 'HTTP ' + response.status; return; }
      const data = await response.json();
      if (generation !== marketGeneration || String(data.pair).toLowerCase() !== pair) return;
      const state = stateFor(pair); state.lastPollAt = Date.now(); state.error = '';
      ingest(data.trades || []);
    } catch(e) { if (generation === marketGeneration) stateFor(pair).error = 'Feed unavailable'; }
    finally { if (generation === marketGeneration) pollBusy = false; }
  }

  function bind() {
    document.querySelectorAll('[data-bof-filter]').forEach(button => {
      button.addEventListener('click', () => {
        filter = button.dataset.bofFilter;
        document.querySelectorAll('[data-bof-filter]').forEach(el => el.classList.toggle('active', el === button));
        render();
      });
    });
    const pause = $('bof-pause');
    if (pause) pause.addEventListener('click', () => {
      paused = !paused;
      pause.textContent = paused ? '▶' : 'Ⅱ';
      pause.classList.toggle('active', paused);
      setText('bof-status', paused ? 'PAUSED' : 'CONNECTED');
    });
    window.addEventListener('chart:market', event => {
      switchMarket(event.detail && event.detail.symbol);
    });
    window.BinanceOrderFlowBridge = {
      active: true,
      getTotals: () => {
        const state = stateFor(selectedPair);
        return { buy: state.buy, sell: state.sell, symbol: selectedSymbol, pair: selectedPair.toUpperCase(), status: feedStatus(state), count: state.trades.length, updatedAt: Math.max(state.lastPollAt,state.lastDataAt) };
      },
      refresh: updateTopChips
    };
    updateTopChips();
    window.setInterval(() => { if (!document.hidden && !paused) { updateTopChips(); render(); } }, 1000);
    window.setInterval(pollFallback, 5000);
    const initial = $('tt-sidebar-connected-symbol') || $('tt-connected-symbol');
    switchMarket(initial ? initial.textContent : '');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();


// ==================== multi-exchange-order-flow.js ====================
/**
 * Additional public exchange order-flow terminals.
 * These streams are read-only and never place orders.
 */
(function () {
  'use strict';

  const EXCHANGES = [
    { id: 'coinbase', name: 'COINBASE', pairs: { BTC: 'BTC-USD', ETH: 'ETH-USD', SOL: 'SOL-USD', XAU: 'PAXG-USD', GOLD: 'PAXG-USD' } },
    { id: 'kraken', name: 'KRAKEN', pairs: { BTC: 'BTC/USD', ETH: 'ETH/USD', SOL: 'SOL/USD', XAU: 'PAXG/USD', GOLD: 'PAXG/USD' } },
    { id: 'okx', name: 'OKX', pairs: { BTC: 'BTC-USDT', ETH: 'ETH-USDT', SOL: 'SOL-USDT', XAU: 'PAXG-USDT', GOLD: 'PAXG-USDT' } },
    { id: 'bitget', name: 'BITGET', pairs: { BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT', XAU: 'PAXGUSDT', GOLD: 'PAXGUSDT' } },
    { id: 'gate', name: 'GATE.IO', pairs: { BTC: 'BTC_USDT', ETH: 'ETH_USDT', SOL: 'SOL_USDT', XAU: 'PAXG_USDT', GOLD: 'PAXG_USDT' } },
    // Bitstamp serves the right headers by handshake but drops them once it
    // throttles the 3s poll, so the browser blocks it. Bybit answers CORS and
    // its spot book lists XAUT (Tether Gold) for the gold view.
    { id: 'bybit', name: 'BYBIT', pairs: { BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT', XAU: 'XAUTUSDT', GOLD: 'XAUTUSDT' } },
    // These six publish a keyless trade API without CORS headers, so their
    // public tapes are normalised by /api/orderflow/trades on our backend.
    { id: 'kucoin', name: 'KUCOIN', proxy: true, pairs: { BTC: 'BTC-USDT', ETH: 'ETH-USDT', SOL: 'SOL-USDT', XAU: 'PAXG-USDT', GOLD: 'PAXG-USDT' } },
    { id: 'bitfinex', name: 'BITFINEX', proxy: true, pairs: { BTC: 'BTCUSD', ETH: 'ETHUSD', SOL: 'SOLUSD', XAU: 'XAUT:USD', GOLD: 'XAUT:USD' } },
    { id: 'mexc', name: 'MEXC', proxy: true, pairs: { BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT' } },
    { id: 'gemini', name: 'GEMINI', proxy: true, pairs: { BTC: 'btcusd', ETH: 'ethusd', SOL: 'solusd', XAU: 'paxgusd', GOLD: 'paxgusd' } },
    { id: 'deribit', name: 'DERIBIT', proxy: true, pairs: { BTC: 'BTC-PERPETUAL', ETH: 'ETH-PERPETUAL', SOL: 'SOL_USDC-PERPETUAL' } },
    { id: 'htx', name: 'HTX', proxy: true, pairs: { BTC: 'btcusdt', ETH: 'ethusdt', SOL: 'solusdt', XAU: 'xautusdt', GOLD: 'xautusdt' } }
  ];
  // Binance and the Traders Order Flow terminal live on the same board as the
  // 12 public tapes. They are not exchange entries (no pair / proxy), so they
  // are appended as explicit sources instead of being folded into EXCHANGES.
  const BOARD_SOURCES = EXCHANGES.concat([
    { id: 'binance', name: 'BINANCE', extra: true },
    { id: 'traders', name: 'TRADERS ORDER FLOW', extra: true }
  ]);
  const totals = {};
  const LIVE_WINDOW_MS = 45000;
  let selectedSymbol = '';
  let selectedMarket = '';
  let marketGeneration = 0;
  let sockets = {};
  let pollTimer = null;

  const $ = id => document.getElementById(id);
  const priceFormat = new Intl.NumberFormat('en-US', {maximumFractionDigits: 5});
  const qtyFormat = new Intl.NumberFormat('en-US', {maximumFractionDigits: 6});
  const timeFormat = new Intl.DateTimeFormat(undefined, {hour: 'numeric', minute: '2-digit', second: '2-digit'});
  const compact = n => {
    n = Number(n) || 0;
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n.toFixed(2);
  };
  const symbolKey = symbol => {
    const s = String(symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return ['BTC', 'ETH', 'SOL', 'XAU', 'GOLD'].find(key => s.indexOf(key) === 0) || '';
  };
  const state = id => totals[id] || (totals[id] = { buy: 0, sell: 0, trades: [], seen: new Set() });
  const set = (id, text) => { const el = $(id); if (el && el.textContent !== String(text)) el.textContent = text; };
  let cachedOpenTotals = null, cachedOpenAt = 0, totalsDirty = true, boardTimer = null, lastBoardEventKey = '', lastBoardDispatchAt = 0;

  // ------------------------------------------------------------------
  // Combined board: every venue keeps its own BUY / SELL totals, then the
  // Traders terminal's running open-position amounts are added to the
  // grand total that feeds the BUY OPEN / SELL OPEN chips.
  // ------------------------------------------------------------------
  let boardRefs = null;

  function venueBreakdown() {
    return EXCHANGES.reduce((out, ex) => {
      const s = state(ex.id);
      pruneLiveTrades(s);
      recalculate(s);
      const live = (sockets[ex.id] && sockets[ex.id].readyState === 1) ||
        Date.now() - (s.lastPollAt || 0) < 15000 || Date.now() - (s.lastDataAt || 0) < 15000;
      out.push({ id: ex.id, name: ex.name, buy: s.buy, sell: s.sell, pair: s.pair || '',
        count: s.trades.length, price: s.lastPrice || 0, updatedAt: s.lastPollAt || s.lastDataAt || 0,
        status: !s.pair ? 'NO PAIR' : live ? (s.trades.length ? 'LIVE' : 'QUIET') : s.lastError ? 'UNAVAILABLE' : 'CONNECTING' });
      return out;
    }, []);
  }

  function venueTotals() {
    return venueBreakdown().reduce((out, venue) => {
      out.buy += venue.buy;
      out.sell += venue.sell;
      return out;
    }, { buy: 0, sell: 0 });
  }

  function binanceVolumes() {
    const bridge = window.BinanceOrderFlowBridge;
    if (!bridge || typeof bridge.getTotals !== 'function') {
      return { buy: 0, sell: 0, pair: '' };
    }
    try {
      const volume = bridge.getTotals() || {};
      if (symbolKey(volume.symbol) !== selectedSymbol) return {buy:0,sell:0,pair:"",status:"CONNECTING"};
      return {
        buy: Number(volume.buy) || 0,
        sell: Number(volume.sell) || 0,
        pair: symbolKey(volume.symbol) === selectedSymbol ? String(volume.pair || '') : '',
        status: symbolKey(volume.symbol) === selectedSymbol ? volume.status || 'CONNECTING' : 'CONNECTING',
        count: volume.count || 0, updatedAt: volume.updatedAt || 0
      };
    } catch (e) {
      return { buy: 0, sell: 0, pair: '' };
    }
  }

  function traderVolumes() {
    const terminal = window.TradersTerminal;
    if (!terminal || typeof terminal.getOpenVolume !== 'function') {
      return { buy: 0, sell: 0, count: 0 };
    }
    try {
      const volume = terminal.getOpenVolume() || {};
      return {
        buy: Number(volume.openBuyVol) || 0,
        sell: Number(volume.openSellVol) || 0,
        count: (Number(volume.openBuyCount) || 0) + (Number(volume.openSellCount) || 0)
      };
    } catch (e) {
      return { buy: 0, sell: 0, count: 0 };
    }
  }

  // Every source that contributes to the board: the 12 public tapes, Binance's
  // own aggregate-trade flow, then the Traders terminal's running positions.
  function sourceBreakdown() {
    const rows = venueBreakdown();
    const binance = binanceVolumes();
    rows.push({
      id: 'binance', name: 'BINANCE', buy: binance.buy, sell: binance.sell,
      pair: binance.pair, status: binance.status, count: binance.count, updatedAt: binance.updatedAt, extra: true
    });
    const traders = traderVolumes();
    rows.push({
      id: 'traders', name: 'TRADERS ORDER FLOW', buy: traders.buy, sell: traders.sell,
      pair: 'POSITIONS', extra: true, count: traders.count
    });
    return rows;
  }

  function openTotals() {
    const now = Date.now();
    if (!totalsDirty && cachedOpenTotals && now - cachedOpenAt < 250) return cachedOpenTotals;
    const breakdown = sourceBreakdown();
    let totalBuy = 0, totalSell = 0, venueBuy = 0, venueSell = 0, binanceBuy = 0, binanceSell = 0, tradersBuy = 0, tradersSell = 0, tradersCount = 0;
    for (let i = 0; i < breakdown.length; i++) {
      const source = breakdown[i];
      if (source.id === 'traders') {
        tradersBuy = source.buy || 0;
        tradersSell = source.sell || 0;
        tradersCount = source.count || 0;
      } else {
        totalBuy += source.buy;
        totalSell += source.sell;
        if (source.id === 'binance') {
          binanceBuy = source.buy || 0;
          binanceSell = source.sell || 0;
        } else if (!source.extra) {
          venueBuy += source.buy;
          venueSell += source.sell;
        }
      }
    }
    cachedOpenTotals = {
      buy: totalBuy,
      sell: totalSell,
      venueBuy,
      venueSell,
      binanceBuy,
      binanceSell,
      tradersBuy,
      tradersSell,
      tradersCount,
      breakdown
    };
    cachedOpenAt = now;
    totalsDirty = false;
    return cachedOpenTotals;
  }

  function boardUi() {
    if (boardRefs) return boardRefs;
    const root = $('venue-flow-board');
    const list = $('vfb-list');
    if (!root || !list) return null;
    boardRefs = {
      root, list,
      market: $('vfb-market'),
      buy: $('vfb-buy'), sell: $('vfb-sell'),
      buyPct: $('vfb-buy-pct'), sellPct: $('vfb-sell-pct'),
      barBuy: $('vfb-bar-buy'), barSell: $('vfb-bar-sell'),
      venueBuy: $('vfb-venue-buy'), venueSell: $('vfb-venue-sell'),
      binanceBuy: $('vfb-binance-buy'), binanceSell: $('vfb-binance-sell'),
      posBuy: $('vfb-pos-buy'), posSell: $('vfb-pos-sell'),
      updated: $('vfb-updated'),
      rows: Object.create(null)
    };
    if (list.dataset.ready !== '1') {
      list.innerHTML = BOARD_SOURCES.map(source => `
        <div class="vfb-venue${source.extra ? ' extra' : ''}" data-vfb="${source.id}">
          <div class="vfb-venue-top"><b>${source.name}</b><em class="vfb-venue-pct">0%</em></div>
          <div class="vfb-venue-vals"><span class="buy">B <b>$0.00</b></span><span class="sell">S <b>$0.00</b></span></div>
          <div class="vfb-venue-bar"><i class="buy"></i><i class="sell"></i></div>
        </div>`).join('');
      list.dataset.ready = '1';
      BOARD_SOURCES.forEach(source => {
        const row = list.querySelector(`[data-vfb="${source.id}"]`);
        if (!row) return;
        boardRefs.rows[source.id] = {
          root: row,
          pct: row.querySelector('.vfb-venue-pct'),
          buy: row.querySelector('.vfb-venue-vals .buy b'),
          sell: row.querySelector('.vfb-venue-vals .sell b'),
          barBuy: row.querySelector('.vfb-venue-bar .buy'),
          barSell: row.querySelector('.vfb-venue-bar .sell')
        };
      });
    }
    return boardRefs;
  }

  function updateBoard(forceEvent) {
    if (document.hidden) return;
    const ui = boardUi();
    if (!ui) return;
    const totals = openTotals();
    const grand = totals.buy + totals.sell;
    const buyPct = grand ? Math.round(totals.buy / grand * 100) : 0;
    const sellPct = grand ? 100 - buyPct : 0;

    set('vfb-market', selectedSymbol || '—');
    set('vfb-buy', compact(totals.buy));
    set('vfb-sell', compact(totals.sell));
    set('vfb-buy-pct', buyPct + '%');
    set('vfb-sell-pct', sellPct + '%');
    set('vfb-venue-buy', compact(totals.venueBuy));
    set('vfb-venue-sell', compact(totals.venueSell));
    set('vfb-binance-buy', compact(totals.binanceBuy));
    set('vfb-binance-sell', compact(totals.binanceSell));
    set('vfb-pos-buy', compact(totals.tradersBuy));
    set('vfb-pos-sell', compact(totals.tradersSell));
    const buyW = buyPct + '%', sellW = sellPct + '%';
    if (ui.barBuy && ui.barBuy.style.width !== buyW) ui.barBuy.style.width = buyW;
    if (ui.barSell && ui.barSell.style.width !== sellW) ui.barSell.style.width = sellW;

    let statusSig = '';
    for (let i = 0; i < totals.breakdown.length; i++) {
      const entry = totals.breakdown[i];
      statusSig += entry.id + ':' + entry.status + ':' + entry.count + ';';
      const row = ui.rows[entry.id];
      if (!row) continue;
      const total = entry.buy + entry.sell;
      const pct = total ? Math.round(entry.buy / total * 100) : 0;
      const live = entry.id === 'traders' ? true : !!entry.pair;
      row.root.classList.toggle('off', !live);
      if (row.pct) {
        const pctTxt = entry.id === 'traders' ? (entry.count ? entry.count + ' POS' : 'NO POS')
          : !live ? (entry.id === 'binance' ? 'WAITING' : 'NO PAIR')
          : ['UNAVAILABLE','CONNECTING','QUIET'].includes(entry.status) ? entry.status : pct + '% BUY';
        if (row.pct.textContent !== pctTxt) row.pct.textContent = pctTxt;
      }
      const bStr = compact(entry.buy), sStr = compact(entry.sell);
      if (row.buy && row.buy.textContent !== bStr) row.buy.textContent = bStr;
      if (row.sell && row.sell.textContent !== sStr) row.sell.textContent = sStr;
      const rbW = pct + '%', rsW = (total ? 100 - pct : 0) + '%';
      if (row.barBuy && row.barBuy.style.width !== rbW) row.barBuy.style.width = rbW;
      if (row.barSell && row.barSell.style.width !== rsW) row.barSell.style.width = rsW;
    }
    const updTxt = 'UPDATED ' + timeFormat.format(Date.now());
    if (ui.updated && ui.updated.textContent !== updTxt) ui.updated.textContent = updTxt;
    const evKey = `${selectedMarket}|${compact(totals.buy)}|${compact(totals.sell)}|${buyPct}|${statusSig}`;
    const now = Date.now();
    if (forceEvent || evKey !== lastBoardEventKey || now - lastBoardDispatchAt >= 2000) {
      lastBoardEventKey = evKey;
      lastBoardDispatchAt = now;
      window.dispatchEvent(new CustomEvent('orderflow:update', {
        detail: {
          symbol: selectedMarket, buy: totals.buy, sell: totals.sell, buyPct, sellPct,
          breakdown: totals.breakdown
        }
      }));
    }
  }

  function scheduleBoardUpdate() {
    totalsDirty = true;
    if (boardTimer) return;
    boardTimer = setTimeout(() => {
      boardTimer = null;
      updateBoard();
      const bridge = window.BinanceOrderFlowBridge;
      if (bridge && typeof bridge.refresh === 'function') bridge.refresh();
    }, 250);
  }

  function render(id, withTape) {
    if (document.hidden) return;
    if (withTape === undefined) withTape = true;
    const s = state(id);
    pruneLiveTrades(s);
    recalculate(s);
    set(`mof-${id}-buy`, compact(s.buy));
    set(`mof-${id}-sell`, compact(s.sell));
    const live = (sockets[id] && sockets[id].readyState === 1) || Date.now() - (s.lastPollAt || 0) < 15000;
    set(`mof-${id}-status`, !s.pair ? 'NO PAIR' : live ? (s.trades.length ? 'CONNECTED' : 'QUIET') : s.lastError ? 'UNAVAILABLE' : 'CONNECTING');
    const total = s.buy + s.sell;
    set(`mof-${id}-buy-pct`, total ? Math.round(s.buy / total * 100) + '%' : '0%');
    set(`mof-${id}-sell-pct`, total ? Math.round(s.sell / total * 100) + '%' : '0%');
    const tape = $(`mof-${id}-tape`);
    if (tape && withTape) {
      const len = s.trades.length;
      const first = len ? s.trades[0] : null;
      const last = len ? s.trades[len - 1] : null;
      const key = len + '|' + (last ? last.id || last.ts : '') + '|' + (first ? first.ts : '');
      if (key !== s.tapeKey) {
        s.tapeKey = key;
        const rows = s.trades.slice(-60).reverse();
        const rowHtml = tr => `
          <div class="mof-row ${tr.side === 'BUY' ? 'buy' : 'sell'}">
            <span>${timeFormat.format(tr.ts)}</span>
            <b>${tr.side}</b>
            <span>${priceFormat.format(Number(tr.price))}</span>
            <span>${qtyFormat.format(Number(tr.qty))}</span>
            <strong>${compact(tr.value)} <small>EXECUTED</small></strong>
          </div>`;
        if (window.LiveTapeRenderer) window.LiveTapeRenderer.render(tape, rows,
          tr => s.pair + '|' + tr.id, rowHtml, '');
        else tape.innerHTML = rows.map(rowHtml).join('');
      }
    }
  }

  // Coalesce burst prints per venue and refresh the shared board once.
  const renderTimers = Object.create(null);
  function scheduleRender(id) {
    if (renderTimers[id]) return;
    renderTimers[id] = setTimeout(() => {
      delete renderTimers[id];
      render(id);
      const current = state(id), batch = current.pendingTrades || [];
      current.pendingTrades = [];
      if (batch.length) window.dispatchEvent(new CustomEvent('orderflow:prints', {
        detail: { symbol: selectedMarket, venue: id, pair: current.pair, trades: batch }
      }));
      scheduleBoardUpdate();
    }, 220);
  }

  function pruneLiveTrades(s) {
    const cutoff = Date.now() - LIVE_WINDOW_MS;
    let drop = 0;
    while (drop < s.trades.length && s.trades[drop].ts < cutoff) drop++;
    if (drop > 0) {
      s.trades.splice(0, drop);
      s._dirty = true;
    }
  }

  function recalculate(s) {
    const now = Date.now();
    if (!s._dirty && now - (s._calcAt || 0) < 200) return;
    let buy = 0, sell = 0;
    for (let i = 0; i < s.trades.length; i++) {
      const tr = s.trades[i];
      if (tr.side === 'BUY') buy += tr.value;
      else sell += tr.value;
    }
    s.buy = buy;
    s.sell = sell;
    s._calcAt = now;
    s._dirty = false;
  }

  function close(id) {
    if (sockets[id]) {
      const old = sockets[id];
      delete sockets[id];
      old.onmessage = old.onerror = old.onclose = null;
      // Let a pending handshake finish before closing it. Closing CONNECTING
      // sockets causes Chrome's "closed before ... established" warning.
      old.onopen = null;
      if (old.readyState === 0) {
        old.onopen = () => { old.onopen = null; old.close(); };
      } else if (old.readyState === 1) {
        old.close();
      }
    }
  }

  function addTrade(id, side, price, qty, tradeId, ts) {
    const s = state(id);
    const value = Number(price) * Number(qty);
    if (!(value > 0)) return;
    if (tradeId && s.seen.has(String(tradeId))) return;
    if (tradeId) {
      s.seen.add(String(tradeId));
      if (s.seen.size > 30000) s.seen.delete(s.seen.values().next().value);
    }
    // Kraken's REST feed encodes the taker side as 'b'/'s' while the other
    // exchanges send 'buy'/'sell' or 'Buy'/'Sell'. Classify by the first
    // letter, or every Kraken buy was booked as a sell and its BUY total
    // stayed empty while the tape showed a BUY row.
    const direction = String(side).toUpperCase();
    const when = Number(ts);
    if (!['BUY','SELL','B','S'].includes(direction) || !Number.isFinite(when) || when <= 0 || when > Date.now() + 5000) return;
    const isBuy = direction.charAt(0) === 'B';
    const now = Date.now();
    s.lastDataAt = now;
    s._dirty = true;
    totalsDirty = true;
    const trade = { id: tradeId || [when,direction,price,qty].join('|'), side: isBuy ? 'BUY' : 'SELL',
      price: Number(price), qty: Number(qty), value, ts: when };
    const n = s.trades.length;
    if (!n || when >= s.trades[n - 1].ts) {
      s.trades.push(trade);
    } else {
      let idx = n - 1;
      while (idx > 0 && s.trades[idx - 1].ts > when) idx--;
      s.trades.splice(idx, 0, trade);
    }
    (s.pendingTrades || (s.pendingTrades = [])).push(trade);
    if (when >= (s.lastTradeAt || 0)) { s.lastTradeAt = when; s.lastPrice = trade.price; }
    if (s.trades.length > 20200) s.trades.splice(0, s.trades.length - 20000);
    scheduleRender(id);
  }

  async function pollTrades(ex, pair) {
    if (document.hidden) return;
    const s = state(ex.id), generation = marketGeneration, market = selectedMarket;
    if (s.pollBusy) return;
    // Skip REST fallback polling while the venue WebSocket is actively delivering trades.
    const ws = sockets[ex.id];
    if (ws && ws.readyState === 1 && Date.now() - (s.lastDataAt || 0) < 10000) return;
    s.pollBusy = true;
    try {
      const response = await fetch(`/api/orderflow/trades?venue=${encodeURIComponent(ex.id)}&market=${encodeURIComponent(market)}&limit=100`,
        { cache:'no-store', signal:AbortSignal.timeout(12000) });
      if (generation !== marketGeneration || pair !== s.pair) return;
      if (!response.ok) { s.lastError = 'HTTP ' + response.status; return; }
      const data = await response.json();
      if (generation !== marketGeneration || pair !== s.pair || data.pair !== pair) return;
      s.lastPollAt = Date.now(); s.lastError = '';
      (Array.isArray(data.trades) ? data.trades : []).forEach(t => addTrade(ex.id,t.side,t.price,t.qty,t.id,t.ts));
      render(ex.id);
    } catch (e) { if (generation === marketGeneration) s.lastError = 'Feed unavailable'; }
    finally { if (generation === marketGeneration) s.pollBusy = false; }
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (document.hidden) return;
      EXCHANGES.forEach(ex => {
        const pair = state(ex.id).pair;
        if (pair) {
          pollTrades(ex, pair);
          // Once per poll is enough to drop prints that aged out of the live
          // window; the key guard inside render() keeps an unchanged tape
          // from being rebuilt.
          render(ex.id, true);
        }
      });
    }, 5000);
    setInterval(() => {
      if (document.hidden) return;
      EXCHANGES.forEach(ex => render(ex.id, false));
      totalsDirty = true;
      updateBoard();
      const bridge = window.BinanceOrderFlowBridge;
      if (bridge && typeof bridge.refresh === 'function') bridge.refresh();
    }, 1000);
  }

  function connectCoinbase(pair, id) {
    const ws = sockets[id] = new WebSocket('wss://advanced-trade-ws.coinbase.com/ws');
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe', channel: 'market_trades', product_ids: [pair] }));
      state(id).connected = true; render(id);
    };
    const generation = marketGeneration;
    ws.onmessage = event => {
      if (generation !== marketGeneration) return;
      try {
        const msg = JSON.parse(event.data);
        (msg.events || []).forEach(ev => (ev.trades || []).forEach(tr => {
          addTrade(id, String(tr.side).toUpperCase() === 'SELL' ? 'BUY' : 'SELL', tr.price, tr.size,
                   tr.trade_id, Date.parse(tr.time));
        }));
      } catch (e) {}
    };
    ws.onclose = () => { state(id).connected = false; render(id); };
  }

  function connectKraken(pair, id) {
    const ws = sockets[id] = new WebSocket('wss://ws.kraken.com/v2');
    ws.onopen = () => {
      ws.send(JSON.stringify({ method: 'subscribe', params: { channel: 'trade', symbol: [pair] } }));
      state(id).connected = true; render(id);
    };
    const generation = marketGeneration;
    ws.onmessage = event => {
      if (generation !== marketGeneration) return;
      try {
        const msg = JSON.parse(event.data);
        // Keep the exchange trade id: the REST poll returns the same trades,
        // and without the id every one of them is counted twice.
        (msg.data || []).forEach(tr => addTrade(id, String(tr.side).toUpperCase(), tr.price, tr.qty,
          tr.trade_id, Date.parse(tr.timestamp)));
      } catch (e) {}
    };
    ws.onclose = () => { state(id).connected = false; render(id); };
  }

  function connectOkx(pair, id) {
    const ws = sockets[id] = new WebSocket('wss://ws.okx.com:8443/ws/v5/public');
    ws.onopen = () => {
      ws.send(JSON.stringify({ op: 'subscribe', args: [{ channel: 'trades', instId: pair }] }));
      state(id).connected = true; render(id);
    };
    const generation = marketGeneration;
    ws.onmessage = event => {
      if (generation !== marketGeneration) return;
      try {
        const msg = JSON.parse(event.data);
        (msg.data || []).forEach(tr => addTrade(id, tr.side === 'sell' ? 'SELL' : 'BUY', tr.px, tr.sz,
          tr.tradeId, Number(tr.ts)));
      } catch (e) {}
    };
    ws.onclose = () => { state(id).connected = false; render(id); };
  }

  function switchMarket(symbol) {
    const nextKey = symbolKey(symbol);
    // The chart fires chart:market for the same market more than once while
    // it boots; reconnecting every exchange each time only churns sockets.
    if (nextKey === selectedSymbol && (nextKey || selectedMarket === String(symbol || ''))) {
      selectedMarket = String(symbol || '');
      updateBoard();
      return;
    }
    selectedSymbol = nextKey; selectedMarket = String(symbol || ''); marketGeneration++; totalsDirty = true; lastBoardEventKey = '';
    EXCHANGES.forEach(ex => {
      close(ex.id);
      const s = state(ex.id);
      s.buy = 0;
      s.sell = 0;
      s.trades = [];
      s.seen = new Set();
      s.tapeKey = '';
      s.pair = ex.pairs[selectedSymbol] || '';
      s.connected = false;
      s.lastDataAt = 0;
      s.lastPollAt = 0; s.lastError = ''; s.pollBusy = false; s.pendingTrades = []; s.lastTradeAt = 0; s.lastPrice = 0;
      render(ex.id);
      if (!s.pair) return;
      pollTrades(ex, s.pair);
      if (ex.id === 'coinbase') connectCoinbase(s.pair, ex.id);
      if (ex.id === 'kraken') connectKraken(s.pair, ex.id);
      if (ex.id === 'okx') connectOkx(s.pair, ex.id);
    });
    updateBoard();
  }

  function bind() {
    window.MultiExchangeOrderFlow = {
      // Venue-only totals (12 public tapes).
      getTotals: venueTotals,
      // One entry per contributing source (12 venues + Binance + Traders), so
      // the board and the chip tooltip can show exactly where each amount came
      // from.
      getBreakdown: sourceBreakdown,
      // Every source above. This is the number that feeds BUY OPEN / SELL
      // OPEN, and it includes Binance and the Traders running positions once.
      getOpenTotals: openTotals
    };
    window.addEventListener('chart:market', e => switchMarket(e.detail && e.detail.symbol));
    const first = $('tt-sidebar-connected-symbol') || $('tt-connected-symbol');
    switchMarket(first ? first.textContent : '');
    updateBoard();
    startPolling();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();


// ==================== venues-flow-terminal.js ====================
/* The combined venue table shows public executions, never account identities. */
(function () {
  'use strict';
  const ORDER=['binance','coinbase','kraken','okx','bitget','gate','bybit','kucoin','bitfinex','mexc','gemini','deribit','htx'];
  const NAMES={binance:'BINANCE',coinbase:'COINBASE',kraken:'KRAKEN',okx:'OKX',bitget:'BITGET',gate:'GATE.IO',bybit:'BYBIT',kucoin:'KUCOIN',bitfinex:'BITFINEX',mexc:'MEXC',gemini:'GEMINI',deribit:'DERIBIT',htx:'HTX'};
  const $=id=>document.getElementById(id);
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const money=v=>{const n=Number(v)||0;return '$'+(n>=1e6?(n/1e6).toFixed(2)+'M':n>=1e3?(n/1e3).toFixed(1)+'K':n.toFixed(2));};
  let refs=null;
  function build(){
    const box=$('vft-rows');if(!box)return;
    box.innerHTML=ORDER.map(id=>'<div class="vft-row" data-vft="'+id+'"><span class="vft-company">'+NAMES[id]+'</span><span class="vft-pos">CONNECTING</span><span class="vft-amount">$0.00</span><span class="vft-buy">$0.00</span><span class="vft-sell">$0.00</span><span class="vft-pair">Connecting</span><span class="vft-status">CONNECTING</span></div>').join('');
    refs={};for(const id of ORDER){const row=box.querySelector('[data-vft="'+id+'"]');refs[id]={row,fields:[...row.children]};}
  }
  function paint(detail){
    if(!refs)build();if(!refs)return;
    const entries=new Map((detail?.breakdown||[]).map(e=>[e.id,e]));
    let buyTotal=0,sellTotal=0,healthy=0;
    for(const id of ORDER){
      const e=entries.get(id)||{status:'CONNECTING'},fields=refs[id].fields;
      const status=e.status||(!e.pair?'NO PAIR':'CONNECTING');
      const buy=Math.max(0,Number(e.buy)||0),sell=Math.max(0,Number(e.sell)||0),available=!!e.pair;
      if(available){buyTotal+=buy;sellTotal+=sell;}
      if(['LIVE','QUIET'].includes(status))healthy++;
      const side=!available?'N/A':buy+sell===0?'QUIET':buy===sell?'BALANCED':buy>sell?'BUY':'SELL';
      const values=[NAMES[id],side,available?money(Math.max(buy,sell)):'N/A',available?money(buy):'N/A',available?money(sell):'N/A',e.pair||'No market pair',status];
      fields.forEach((field,index)=>{if(field.textContent!==values[index])field.textContent=values[index];});
      fields[1].classList.toggle('buy',side==='BUY');fields[1].classList.toggle('sell',side==='SELL');
      refs[id].row.dataset.status=status;
      fields[6].title=status==='QUIET'?'Feed is responding; no executions in the last 45 seconds':status==='NO PAIR'?'This venue has no supported tape for the selected market':status==='UNAVAILABLE'?'Public API is unavailable; retrying':status;
    }
    if($('vft-buy'))$('vft-buy').textContent=money(buyTotal);
    if($('vft-sell'))$('vft-sell').textContent=money(sellTotal);
    if($('vft-updated'))$('vft-updated').textContent=(detail?.symbol||'Selected market')+' · '+healthy+'/13 responding · 45s';
  }
  function refresh(){paint({symbol:window.TradersTerminal?.getActiveSymbol?.(),breakdown:window.MultiExchangeOrderFlow?.getBreakdown?.()||[]});}
  function init(){build();refresh();window.addEventListener('orderflow:update',e=>paint(e.detail));}
  window.VenuesFlowTerminal={refresh};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();


// ==================== whale-flow.js ====================
/**
 * Big Player Order Flow Terminal
 * ------------------------------------------------------------------
 * Sits at the very bottom of the dashboard and reads the SAME live Exness
 * MetaTrader 5 tick feed that powers the chart. It highlights unusually large
 * price impulses ("big prints"), the side they hit, and whether the market
 * actually followed in the next 6 seconds.
 *
 * Nothing here is simulated: rows come from real MT5 ticks / real 1m bars.
 * Burst size is real tick participation, and follow-through is measured on
 * later ticks, not invented.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var section = null;
  var symbol = '';
  var meta = null;
  var digits = 2;
  var offsetSec = 0;
  var lastPrice = 0;
  var priceWindow = [];          // { t, p } over the last 5 minutes
  var ws = null;
  var wsTimer = null;
  var wsRetry = 0;
  var wsFails = 0;
  var lastFrameAt = 0;
  var errRetryTimer = null;
  var paused = false;
  var buffered = [];
  var pendingRows = {};
  var buyCount = 0;
  var sellCount = 0;
  var followed = 0;
  var measured = 0;
  var rowCount = 0;
  var MAX_ROWS = 60;
  var lastLiveAt = 0;
  var publicSeen = new Set();

  function publicKey(value) {
    return window.DashboardPanels ? window.DashboardPanels.canonical(value) : String(value || '').toUpperCase().replace(/M$/, '');
  }
  function followPublic(value) {
    if (!value || publicKey(value) === publicKey(symbol)) return;
    symbol = value;
    meta = null;
    publicSeen.clear();
    buyCount = sellCount = followed = measured = 0;
    buffered = []; priceWindow = []; lastPrice = 0; pendingRows = {};
    setMarketHeader(); updateStats();
    emptyTape('Waiting for verified public executions of $25,000 or more.');
    status('Public venue feeds · ' + symbol + ' · large executions only', '');
    metric('wf-follow', '—', 'wf-follow-sub', 'Position exits are not published');
  }
  var moveTimer = 0;
  function scheduleMarketMove() {
    if (moveTimer) return;
    moveTimer = setTimeout(function() { moveTimer = 0; updateMarketMove(); }, 900);
  }
  function acceptPublic(detail) {
    if (!detail || publicKey(detail.symbol) !== publicKey(symbol) || !symbol) return;
    var now = Date.now();
    var list = Array.isArray(detail.trades) ? detail.trades : [];
    if (list.length > 1) list = list.slice().sort(function(a,b) {return Number(a.ts)-Number(b.ts);});
    list.forEach(function(trade) {
      var price=Number(trade.price), qty=Number(trade.qty), when=Number(trade.ts), side=String(trade.side).toUpperCase();
      if (!(price>0) || !(qty>0) || !isFinite(price*qty) || price*qty<25000 ||
          !(when>0) || when>now+5000 || when<now-300000 || ['BUY','SELL'].indexOf(side)<0) return;
      var id=[detail.venue,detail.pair,trade.id || [when,side,price,qty].join('|')].join(':');
      if (publicSeen.has(id)) return;
      publicSeen.add(id);
      if (publicSeen.size>2000) publicSeen.delete(publicSeen.values().next().value);
      addRow({id:id,side:side,px:price,tm:when,value:price*qty,venue:detail.venue,pair:detail.pair,public:true},true);
      lastLiveAt=now;
      status('Verified public executions · $25,000+ · anonymous venue fills', 'online');
    });
    metric('wf-follow', '—', 'wf-follow-sub', 'Position exits are not published');
  }
  function initPublic() {
    var term=window.SoftradeXTerminal;
    followPublic(term && term.getCurrentSymbol ? term.getCurrentSymbol() : '');
    window.addEventListener('chart:market',function(e) {var d=e.detail || {};followPublic(d.symbol || (d.meta || {}).symbol);});
    window.addEventListener('orderflow:prints',function(e) {acceptPublic(e.detail);});
    window.addEventListener('chart:tv-quote',function(e) {
      var q=e.detail || {};
      if (publicKey(q.symbol)!==publicKey(symbol) || !(Number(q.price)>0) || !isFinite(Number(q.price)) || !(Number(q.at)>0) || Date.now()-Number(q.at)>15000 || Number(q.at)>Date.now()+5000) return;
      lastPrice=Number(q.price);priceWindow.push({t:Date.now(),p:lastPrice});scheduleMarketMove();
    });
    setInterval(function() {
      if (document.hidden) return;
      if (lastLiveAt && Date.now()-lastLiveAt>30000) status('Waiting for the next $25,000+ verified execution', '');
      updateMarketMove();
    },5000);
    var legend=section.querySelector('.wf-legend');
    if (legend) legend.textContent='$25,000+ public executions · venue instruments can differ from the chart · wallet identities are not disclosed';
    var columns=section.querySelectorAll('.wf-columns span');
    if (columns[3]) columns[3].textContent='EXECUTED USD';
    if (columns[4]) columns[4].textContent='POSITION';
    if (columns[5]) columns[5].textContent='EXIT DATA';
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function fmt(n, dec) {
    var v = Number(n);
    if (!isFinite(v)) return '--';
    var d = typeof dec === 'number' ? dec : digits;
    return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function fmtSigned(n, dec) {
    var v = Number(n) || 0;
    return (v > 0 ? '+' : v < 0 ? '−' : '±') + fmt(Math.abs(v), dec);
  }

  function fmtTime(ms) {
    var d = new Date(Number(ms) - offsetSec * 1000);
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    var ss = String(d.getSeconds()).padStart(2, '0');
    return hh + ':' + mm + ':' + ss;
  }

  function pulse(state) {
    var el = $('wf-pulse');
    if (!el) return;
    el.className = 'wf-pulse' + (state ? ' ' + state : '');
    el.title = state === 'online'
      ? 'Live Exness MT5 tick stream'
      : state === 'error'
        ? 'Exness feed error'
        : 'Waiting for the Exness tick stream…';
  }

  function status(text, kind) {
    var el = $('wf-status');
    if (el) el.textContent = text;
    if (kind === 'online') pulse('online');
    else if (kind === 'error') pulse('error');
    else pulse('');
  }

  function setMarketHeader() {
    var m = meta || {};
    var nameEl = $('wf-market');
    if (nameEl) {
      nameEl.textContent = (m.label || symbol || '—') + (m.pair ? ' / ' + m.pair : '');
    }
    var subEl = $('wf-market-sub');
    if (subEl) {
      subEl.textContent = symbol
        ? symbol + (m.description ? ' · ' + m.description : '') + (window.SOFTRADEX_PUBLIC_ONLY ? ' · public executions $25,000+' : ' · 6s follow')
        : 'waiting for the chart…';
    }
  }

  function metric(id, text, subId, subText) {
    var el = $(id);
    if (el) el.textContent = text;
    if (subId) {
      var s = $(subId);
      if (s) s.textContent = subText;
    }
  }

  function updateStats() {
    var total = buyCount + sellCount;
    var buyPct = total ? Math.round((buyCount / total) * 100) : 0;
    var sellPct = total ? 100 - buyPct : 0;
    metric('wf-buy', String(buyCount), 'wf-buy-pct', buyPct + '%');
    metric('wf-sell', String(sellCount), 'wf-sell-pct', sellPct + '%');

    var delta = buyCount - sellCount;
    var bias = 'BALANCED';
    if (total >= 3) {
      if (delta >= Math.max(2, total * 0.18)) bias = 'BUYERS IN CONTROL';
      else if (delta <= -Math.max(2, total * 0.18)) bias = 'SELLERS IN CONTROL';
    }
    metric('wf-delta', (delta > 0 ? '+' : '') + delta, 'wf-bias', bias);

    if (measured > 0) {
      var rate = Math.round((followed / measured) * 100);
      metric('wf-follow', rate + '%', 'wf-follow-sub', followed + ' of ' + measured + ' followed');
    } else {
      metric('wf-follow', '—', 'wf-follow-sub', 'measuring…');
    }

    var buyBar = $('wf-meter-buy');
    var sellBar = $('wf-meter-sell');
    if (buyBar) buyBar.style.width = buyPct + '%';
    if (sellBar) sellBar.style.width = sellPct + '%';
  }

  function updateMarketMove() {
    var now = Date.now();
    if (window.SOFTRADEX_PUBLIC_ONLY && priceWindow.length && now-priceWindow[priceWindow.length-1].t>30000) {
      metric('wf-move','—','wf-move-sub','Waiting for a fresh chart quote');
      return;
    }
    var drop = 0;
    while (drop < priceWindow.length && now - priceWindow[drop].t > 300000) drop++;
    if (drop > 0) priceWindow.splice(0, drop);
    if (!priceWindow.length || !lastPrice) {
      metric('wf-move', '—', 'wf-move-sub', 'no live ticks yet');
      return;
    }
    var first = priceWindow[0].p;
    var delta = lastPrice - first;
    var pct = first ? (delta / first) * 100 : 0;
    metric('wf-move', fmtSigned(delta), 'wf-move-sub',
      (delta >= 0 ? '▲ ' : '▼ ') + (pct >= 0 ? '+' : '') + pct.toFixed(2) + '% · 5 min');
    var el = $('wf-move');
    if (el) el.style.color = delta > 0 ? '#0ECB81' : delta < 0 ? '#F6465D' : '#e2e8f0';
  }

  function followCell(row) {
    var fv = Number(row.fv);
    if (!isFinite(fv)) return '<span class="wf-follow pending">measuring…</span>';
    var cls = fv > 0 ? 'up' : fv < 0 ? 'down' : 'flat';
    var word = cls === 'up' ? '▲ FOLLOWED ' : cls === 'down' ? '▼ FADED ' : '• HELD ';
    return '<span class="wf-follow ' + cls + '">' + word + fmtSigned(fv) + '</span>';
  }

  function buildRow(row) {
    var side = String(row.side || '').toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
    var isBuy = side === 'BUY';
    var price = Number(row.px) || 0;
    var ticks = Number(row.ticks) || 0;
    var mv = Number(row.mv) || 0;
    var live = String(row.src || '') === 'live';
    var el = document.createElement('div');
    el.className = 'wf-row fresh' + (live ? ' whale' : '');
    el.dataset.id = String(row.id || '');
    el.innerHTML =
      '<span class="wf-time">' + esc(fmtTime(row.tm)) + '</span>' +
      '<span><span class="wf-side ' + (isBuy ? 'buy' : 'sell') + '">' +
        (isBuy ? '▲ BUY' : '▼ SELL') + '</span></span>' +
      '<span class="wf-price ' + (isBuy ? 'buy' : 'sell') + '">' + fmt(price) + '</span>' +
      '<span class="wf-burst">' + (row.public ? '$' + fmt(row.value,0) : ticks ? '<b>' + ticks + '</b> tick' + (ticks === 1 ? '' : 's') : '—') + '</span>' +
      '<span class="wf-move ' + (isBuy ? 'up' : 'down') + '">' +
        (row.public ? '—' : (isBuy ? '▲ ' : '▼ ') + fmt(mv)) + '</span>' +
      '<span class="wf-follow-slot">' +
        (row.public ? '<span class="wf-follow">Not published</span>' : live ? '<span class="wf-follow pending">measuring 6s…</span>' : followCell(row)) +
      '</span>' +
      '<span class="wf-src' + (live ? ' live' : '') + '">' + (row.public ? esc(String(row.venue || '').toUpperCase() + ' · ' + (row.pair || '')) : live ? 'TICK' : '1M') + '</span>';
    return el;
  }

  function removeEmpty() {
    var empty = $('wf-empty');
    if (empty && empty.parentNode) empty.parentNode.removeChild(empty);
  }

  function emptyTape(message) {
    var tape = $('wf-tape');
    if (!tape) return;
    tape.innerHTML = '<div class="wf-empty" id="wf-empty">' + esc(message) + '</div>';
    pendingRows = {};
    rowCount = 0;
  }

  function addRow(row, prepend) {
    if (!row) return;
    var live = String(row.src || '') === 'live';
    var side = String(row.side || '').toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
    if (side === 'BUY') buyCount++; else sellCount++;
    updateStats();

    if (paused) {
      buffered.push(row);
      if (buffered.length > MAX_ROWS) buffered.shift();
      return;
    }
    renderRow(row, prepend !== false);
  }

  function renderRow(row, prepend) {
    var tape = $('wf-tape');
    if (!tape) return;
    removeEmpty();
    var el = buildRow(row);
    if (prepend) tape.insertBefore(el, tape.firstChild);
    else tape.appendChild(el);
    rowCount++;
    // lastElementChild guarantees the loop always makes progress, even if a
    // text node sits at the end of the tape.
    while (tape.children.length > MAX_ROWS && tape.lastElementChild) {
      tape.removeChild(tape.lastElementChild);
    }
    if (String(row.src || '') === 'live' && row.id) pendingRows[String(row.id)] = el;
  }

  function applyFollow(msg) {
    var id = String(msg.id || '');
    var el = pendingRows[id];
    var st = String(msg.st || 'FLAT');
    var mv = Number(msg.mv) || 0;
    measured++;
    if (st === 'UP') followed++;
    updateStats();
    if (!el) return;
    var slot = el.querySelector('.wf-follow-slot');
    if (!slot) return;
    var word = st === 'UP' ? '▲ FOLLOWED ' : st === 'DOWN' ? '▼ FADED ' : '• HELD ';
    slot.innerHTML = '<span class="wf-follow ' + (st === 'UP' ? 'up' : st === 'DOWN' ? 'down' : 'flat') +
      '">' + word + fmtSigned(mv) + '</span>';
    delete pendingRows[id];
  }

  // ------------------------------------------------------------- transport
  function connect() {
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;
    if (wsTimer) { clearTimeout(wsTimer); wsTimer = null; }
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var socket;
    try {
      socket = new WebSocket(proto + '//' + location.host + '/ws/chart');
    } catch (e) {
      wsTimer = setTimeout(connect, 1500);
      return;
    }
    ws = socket;
    socket.onopen = function () {
      wsRetry = 0;
      wsFails = 0;
      lastFrameAt = Date.now();
      pulse('online');
      if (symbol) socket.send(JSON.stringify({ type: 'sub', symbol: symbol, tf: '1m' }));
    };
    socket.onmessage = function (event) {
      lastFrameAt = Date.now();
      var msg;
      try { msg = JSON.parse(event.data); } catch (e) { return; }
      if (!msg || !msg.t) return;
      if (msg.t === 'snap') {
        if (msg.s !== symbol) return;
        applySnapshot(msg);
      } else if (msg.t === 'tick') {
        if (msg.s !== symbol) return;
        applyTick(msg);
      } else if (msg.t === 'print') {
        if (msg.s !== symbol) return;
        applyTick({ b: msg.px, tm: msg.tm });
        addRow(msg, true);
        lastLiveAt = Date.now();
        status('LIVE · Exness MT5 · big prints streaming', 'online');
      } else if (msg.t === 'follow') {
        if (msg.s !== symbol) return;
        applyFollow(msg);
      } else if (msg.t === 'hb') {
        // heartbeat only - onmessage already refreshed lastFrameAt
      } else if (msg.t === 'error') {
        if (msg.s && msg.s !== symbol) return;
        status('Exness feed error: ' + (msg.message || 'unknown'), 'error');
        // retry the subscription so a briefly-offline terminal recovers
        if (errRetryTimer) clearTimeout(errRetryTimer);
        errRetryTimer = setTimeout(function () {
          errRetryTimer = null;
          if (ws && ws.readyState === WebSocket.OPEN && symbol) {
            ws.send(JSON.stringify({ type: 'sub', symbol: symbol, tf: '1m' }));
          }
        }, 3000);
      }
    };
    socket.onerror = function () {
      try { socket.close(); } catch (e) {}
    };
    socket.onclose = function () {
      if (ws === socket) ws = null;
      pulse('');
      if (!symbol) return;
      wsFails += 1;
      // Hosted hosting (cPanel / Passenger) has no WebSocket at all: stop
      // hammering a 404 every few seconds and say so instead of pretending.
      if (wsFails >= 2) {
        status('HTTP hosting · live tape needs the WebSocket stream', '');
        return;
      }
      wsRetry = Math.min(wsRetry + 1, 8);
      wsTimer = setTimeout(connect, Math.min(500 * wsRetry, 5000));
    };
  }

  function applySnapshot(msg) {
    meta = msg.meta || meta;
    if (meta && meta.digits !== undefined) digits = Number(meta.digits) || digits;
    offsetSec = Number(msg.offset) || 0;
    setMarketHeader();
    status('LIVE · Exness MT5 · tick-burst detector running', 'online');
    var ticker = msg.ticker || {};
    if (ticker.price) {
      lastPrice = Number(ticker.price) || lastPrice;
      priceWindow.push({ t: Date.now(), p: lastPrice });
    }
  }

  function applyTick(msg) {
    var p = Number(msg.b) || 0;
    if (!p) return;
    lastPrice = p;
    var now = Date.now();
    priceWindow.push({ t: now, p: p });
    if (priceWindow.length > 1300) priceWindow.splice(0, priceWindow.length - 1200);
    lastLiveAt = now;
    status('LIVE · Exness MT5 · big-player tape streaming', 'online');
  }

  // --------------------------------------------------------------- market
  function resolve(sym) {
    var term = window.SoftradeXTerminal;
    if (term && typeof term.resolveSymbol === 'function') {
      var key = term.resolveSymbol(sym);
      if (key) return key;
    }
    return String(sym || '').trim();
  }

  function follow(sym) {
    var key = resolve(sym);
    if (!key) return;
    if (key === symbol && ws && ws.readyState === WebSocket.OPEN) return;
    symbol = key;
    meta = (window.SoftradeXTerminal && window.SoftradeXTerminal.MARKETS)
      ? window.SoftradeXTerminal.MARKETS[key] || null
      : null;
    digits = meta && meta.digits !== undefined ? Number(meta.digits) : 2;
    buyCount = sellCount = followed = measured = 0;
    priceWindow = [];
    buffered = [];
    pendingRows = {};
    updateStats();
    updateMarketMove();
    setMarketHeader();
    emptyTape('Connecting to ' + symbol + ' · waiting for the first big prints…');
    status('Subscribing to ' + symbol + ' on Exness…', '');

    fetch('/api/chart/tape?symbol=' + encodeURIComponent(key) + '&limit=40', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || symbol !== key) return;
        if (data.meta) {
          meta = data.meta;
          digits = Number(meta.digits) || digits;
          setMarketHeader();
        }
        var rows = data.prints || [];
        rows.forEach(function (row) { addRow(row, false); });
        if (!rows.length) {
          emptyTape('Listening to ' + symbol + ' · the first unusual burst will appear here.');
        } else {
          status('LIVE · Exness MT5 · ' + rows.length + ' recent unusual 1m prints loaded', 'online');
        }
      })
      .catch(function () {
        emptyTape('Tape history unavailable · live prints will still stream in.');
      });

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'sub', symbol: symbol, tf: '1m' }));
    } else {
      connect();
    }
  }

  function resume() {
    paused = false;
    var btn = $('wf-pause');
    if (btn) {
      btn.textContent = '⏸ Pause';
      btn.classList.remove('paused');
      btn.title = 'Pause the live tape';
    }
    var rows = buffered.slice().reverse();
    buffered = [];
    rows.forEach(function (row) { renderRow(row, true); });
  }

  function init() {
    section = $('whale-flow-section');
    if (!section) return;

    var pauseBtn = $('wf-pause');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', function () {
        if (paused) {
          resume();
        } else {
          paused = true;
          pauseBtn.textContent = '▶ Resume';
          pauseBtn.classList.add('paused');
          pauseBtn.title = 'Resume the live tape';
        }
      });
    }

    var clearBtn = $('wf-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        buyCount = sellCount = followed = measured = 0;
        buffered = [];
        pendingRows = {};
        updateStats();
        emptyTape('Tape cleared · listening for the next big print…');
      });
    }

    if (window.SOFTRADEX_PUBLIC_ONLY) { initPublic(); return; }
    window.addEventListener('chart:market', function (ev) {
      var detail = (ev && ev.detail) || {};
      if (detail.symbol) follow(detail.symbol);
    });
    window.addEventListener('chart:snapshot', function (ev) {
      var detail = (ev && ev.detail) || {};
      if (detail.symbol && detail.symbol !== symbol) follow(detail.symbol);
    });

    var term = window.SoftradeXTerminal;
    var current = term && typeof term.getCurrentSymbol === 'function' ? term.getCurrentSymbol() : '';
    if (current) {
      follow(current);
    } else {
      fetch('/api/chart/symbols', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data || !data.available || !data.symbols || !data.symbols.length) {
            status((data && data.message) || 'Exness terminal is not connected', 'error');
            return;
          }
          var pick = data.symbols[0].symbol;
          data.symbols.forEach(function (m) {
            if (m.symbol === 'XAUUSDm') pick = m.symbol;
          });
          follow(pick);
        })
        .catch(function (err) {
          status('Exness feed unavailable: ' + (err && err.message ? err.message : err), 'error');
        });
    }

    setInterval(function () { if (!document.hidden) updateMarketMove(); }, 2000);
    setInterval(function () {
      if (paused) return;
      if (!lastLiveAt) return;
      if (Date.now() - lastLiveAt > 10000 && ws && ws.readyState === WebSocket.OPEN) {
        status('LIVE · waiting for the next Exness tick…', 'online');
      }
    }, 5000);
    // Stream watchdog: the server heartbeat arrives even on a quiet market, so
    // a socket with no frames at all is half-dead and must be reconnected.
    setInterval(function () {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (lastFrameAt && Date.now() - lastFrameAt > 15000) {
        try { ws.close(); } catch (e) {}
      }
    }, 5000);

    updateStats();
    updateMarketMove();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 260);
  }
})();


// ==================== public-whale-feed.js ====================
/* Public wallet discovery + authoritative holdings; works without a proxy route. */
(function (root) {
  'use strict';
  const INFO = 'https://api.hyperliquid.xyz/info';
  const SOURCES = ['USDC', 'HYPE'].map(token => 'https://api.hypurrscan.io/holdersWithLimit/' + token + '/100');
  const ADDRESS = /^0x[0-9a-f]{40}$/i, MIN = 100000, MAX = 24;
  const CRYPTO = 'BTC ETH SOL XRP DOGE ADA BNB LTC AVAX LINK DOT BCH TRX SUI TON NEAR APT SHIB PEPE UNI AAVE ONDO'.split(' ');
  const unique = values => [...new Set(values)];
  function contractFor(market) {
    const key = String(market).trim().toUpperCase().replace(/M$/, '');
    if (['GOLD', 'XAUUSD', 'XAUUSD247'].includes(key)) return {coin: 'xyz:GOLD', dex: 'xyz', label: 'Gold perpetual'};
    if (['SILVER', 'XAGUSD'].includes(key)) return {coin: 'xyz:SILVER', dex: 'xyz', label: 'Silver perpetual'};
    const coin = CRYPTO.find(base => [base, base + 'USD', base + 'USDT', base + 'USDC'].includes(key));
    return coin ? {coin, dex: '', label: coin + ' perpetual'} : null;
  }
  function number(value) {
    if (value == null || typeof value === 'boolean' || (typeof value === 'string' && !value.trim()) ||
        !Number.isFinite(Number(value))) throw new Error('Invalid position number');
    return Number(value);
  }
  function parsePosition(data, coin) {
    if (!data || !Array.isArray(data.assetPositions)) throw new Error('Invalid position snapshot');
    const matched = [];
    for (const item of data.assetPositions) {
      const p = item && item.position;
      if (!p || typeof p.coin !== 'string') throw new Error('Invalid position snapshot');
      const size = number(p.szi);
      if (p.coin !== coin) continue;
      if (matched.length) throw new Error('Duplicate position');
      matched.push(p);
      if (size !== 0 && (number(p.entryPx) <= 0 || number(p.positionValue) <= 0)) throw new Error('Invalid open position');
    }
    if (!matched.length || number(matched[0].szi) === 0) return null;
    const p = matched[0], size = number(p.szi);
    return {side: size > 0 ? 'BUY' : 'SELL', size: Math.abs(size), entry_price: number(p.entryPx), value_usd: number(p.positionValue)};
  }
  function holderWallets(data) {
    const holders = data && (data.holders || data.addresses);
    if (!holders || typeof holders !== 'object' || Array.isArray(holders)) throw new Error('Invalid public wallet list');
    return Object.entries(holders).slice(0, 1000).filter(([wallet, value]) => ADDRESS.test(wallet) && Number(value) > 0 && Number.isFinite(Number(value)))
      .sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 100).map(([wallet]) => wallet.toLowerCase());
  }
  async function http(url, body, signal) {
    const controller = new AbortController(), abort = () => controller.abort();
    if (signal && signal.aborted) abort();
    if (signal) signal.addEventListener('abort', abort, {once: true});
    const timer = setTimeout(abort, 6000);
    try {
      const response = await root.fetch(url, {method: body ? 'POST' : 'GET', signal: controller.signal,
        headers: body ? {'Content-Type': 'application/json'} : {}, body: body ? JSON.stringify(body) : undefined});
      if (!response.ok) throw new Error('Public feed returned HTTP ' + response.status);
      return await response.json();
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', abort);
    }
  }
  async function discover(signal) {
    const results = await Promise.allSettled(SOURCES.map(url => http(url, null, signal).then(holderWallets)));
    const groups = results.filter(result => result.status === 'fulfilled').map(result => result.value);
    if (!groups.length) throw new Error('Public wallet discovery unavailable');
    const wallets = [];
    for (let i = 0; i < Math.max(...groups.map(group => group.length)); i++) {
      for (const group of groups) if (group[i]) wallets.push(group[i]);
    }
    return {wallets: unique(wallets).slice(0, 200), partial: groups.length !== SOURCES.length};
  }
  function create(options = {}) {
    const info = options.info || ((body, signal) => http(INFO, body, signal));
    const discovery = options.discovery || discover;
    const clock = options.clock || Date.now;
    let storage = options.storage;
    if (storage === undefined) { try { storage = root.localStorage; } catch (_) {} }
    const states = new Map();
    let pool = [], poolAt = 0, poolPartial = false;
    function read(key) { try { return storage && JSON.parse(storage.getItem(key)); } catch (_) { return null; } }
    function write(key, value) { try { if (storage) storage.setItem(key, JSON.stringify(value)); } catch (_) {} }
    const savedPool = read('softradex.whales.discovery.v2');
    if (savedPool && Array.isArray(savedPool.wallets)) {
      pool = savedPool.wallets.filter(wallet => typeof wallet === 'string' && ADDRESS.test(wallet)).slice(0, 200);
      poolAt = Number(savedPool.at) || 0;
    }
    function stateFor(mapping) {
      if (!states.has(mapping.coin)) {
        const state = {mapping, rows: new Map(), checked: new Map(), updated: 0, metadataAt: 0,
          busy: false, status: 'scanning', message: 'Scanning public wallets', total: 0, count: 0};
        const saved = read('softradex.whales.positions.v2.' + mapping.coin);
        for (const row of (saved && Array.isArray(saved.positions) ? saved.positions : []).slice(0, MAX)) {
          if (row.contract === mapping.coin && ADDRESS.test(row.wallet) && ['BUY', 'SELL'].includes(row.side) &&
              ['size', 'entry_price', 'value_usd', 'verified_at', 'first_seen_at'].every(key => Number.isFinite(row[key]) && row[key] > 0)) {
            state.rows.set(row.wallet.toLowerCase(), {...row, failed: true});
          }
        }
        states.set(mapping.coin, state);
      }
      return states.get(mapping.coin);
    }
    function snapshot(market) {
      const mapping = contractFor(market);
      const base = {market, scanner_version: 2, provider: 'Hyperliquid', threshold_usd: MIN, scan_seconds: 15,
        max_tracked: MAX, discovery_sources: ['Hyperliquid recent trades', 'Hypurrscan public holders']};
      if (!mapping) return {...base, contract: '', contract_label: '', positions: [], buy_count: 0, sell_count: 0,
        status: 'unsupported', scanning: false, message: 'No public held-position coverage for this market', updated_at: 0};
      const state = stateFor(mapping);
      const positions = [...state.rows.values()].map(row => ({...row, stale: row.failed || clock() - row.verified_at > 60000}))
        .sort((a, b) => b.value_usd - a.value_usd);
      return {...base, contract: mapping.coin, contract_label: mapping.label, positions,
        buy_count: positions.filter(row => row.side === 'BUY').length, sell_count: positions.filter(row => row.side === 'SELL').length,
        status: state.status, scanning: state.busy, message: state.message, updated_at: state.updated,
        wallets_checked: state.count, candidates_total: state.total};
    }
    async function scan(market, signal) {
      const mapping = contractFor(market);
      if (!mapping) return snapshot(market);
      const state = stateFor(mapping);
      if (state.busy) return snapshot(market);
      state.busy = true;
      let failures = 0;
      try {
        if (!state.metadataAt || clock() - state.metadataAt > 3600000) {
          const meta = await info({type: 'meta', ...(mapping.dex ? {dex: mapping.dex} : {})}, signal);
          if (!meta || !Array.isArray(meta.universe)) throw new Error('Invalid contract metadata');
          if (!meta.universe.some(row => row.name === mapping.coin)) {
            const error = new Error('Selected contract is not listed by the provider');
            error.unsupported = true; throw error;
          }
          state.metadataAt = clock();
        }
        if (!poolAt || clock() - poolAt >= 900000) {
          try {
            const result = await discovery(signal), wallets = Array.isArray(result) ? result : result.wallets;
            if (!Array.isArray(wallets)) throw new Error('Invalid discovery response');
            pool = unique(wallets.filter(wallet => typeof wallet === 'string' && ADDRESS.test(wallet)).map(wallet => wallet.toLowerCase())).slice(0, 200);
            poolAt = clock(); poolPartial = !!result.partial;
            write('softradex.whales.discovery.v2', {wallets: pool, at: poolAt});
          } catch (_) { failures++; }
        }
        if (poolPartial) failures++;
        let recent = [];
        try {
          const trades = await info({type: 'recentTrades', coin: mapping.coin}, signal);
          if (!Array.isArray(trades)) throw new Error('Invalid recent trades');
          for (const trade of trades.slice(0, 50)) {
            if (!trade || trade.coin !== mapping.coin || !Array.isArray(trade.users)) throw new Error('Invalid recent trades');
            recent.push(...trade.users.filter(wallet => typeof wallet === 'string' && ADDRESS.test(wallet)).map(wallet => wallet.toLowerCase()));
          }
          recent = unique(recent);
        } catch (_) { failures++; }
        const order = wallets => wallets.filter(wallet => !state.rows.has(wallet))
          .sort((a, b) => (state.checked.get(a) || 0) - (state.checked.get(b) || 0));
        const broad = order(pool), fresh = order(recent);
        const added = unique([...broad.slice(0, 12), ...fresh.slice(0, 4), ...broad.slice(12), ...fresh.slice(4)])
          .slice(0, Math.min(16, MAX - state.rows.size));
        const tracked = [...state.rows.keys()].sort((a, b) => (state.checked.get(a) || 0) - (state.checked.get(b) || 0));
        const wallets = [...tracked.slice(0, 24 - added.length), ...added];
        state.total = unique([...pool, ...recent, ...tracked]).length; state.count = 0;
        for (let i = 0; i < wallets.length; i += 4) {
          if (signal && signal.aborted) throw new Error('Scan interrupted');
          const batch = wallets.slice(i, i + 4);
          const results = await Promise.allSettled(batch.map(wallet => info({type: 'clearinghouseState', user: wallet,
            ...(mapping.dex ? {dex: mapping.dex} : {})}, signal).then(data => parsePosition(data, mapping.coin))));
          results.forEach((result, index) => {
            const wallet = batch[index], previous = state.rows.get(wallet), at = clock();
            state.checked.set(wallet, at); state.count++;
            if (result.status === 'rejected') {
              failures++; if (previous) state.rows.set(wallet, {...previous, failed: true}); return;
            }
            const position = result.value;
            if (!position || (position.value_usd < MIN && (!previous || previous.side !== position.side))) state.rows.delete(wallet);
            else state.rows.set(wallet, {...position, wallet, contract: mapping.coin, verified_at: at, failed: false,
              first_seen_at: previous ? previous.first_seen_at : at});
          });
        }
        const retained = new Set([...pool, ...recent, ...state.rows.keys()]);
        for (const wallet of state.checked.keys()) if (!retained.has(wallet)) state.checked.delete(wallet);
        state.status = failures ? state.rows.size || wallets.length ? 'partial' : 'unavailable' : 'ok';
        state.message = failures ? 'Some public checks failed; keeping last verified holdings' : 'Public wallet scan complete';
      } catch (error) {
        state.status = error.unsupported ? 'unsupported' : 'unavailable';
        state.message = error.unsupported ? error.message : 'Public feeds unavailable; keeping last verified holdings';
        for (const [wallet, row] of state.rows) state.rows.set(wallet, {...row, failed: true});
      } finally {
        state.busy = false; state.updated = clock();
        write('softradex.whales.positions.v2.' + mapping.coin, {positions: [...state.rows.values()]});
      }
      return snapshot(market);
    }
    return {scan, snapshot};
  }
  const api = {create, contractFor, parsePosition, holderWallets};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PublicWhaleFeed = api;
})(typeof window === 'undefined' ? globalThis : window);


// ==================== whale-positions.js ====================
/* Authoritative public wallet snapshots only; executions are not holdings. */
(function () {
  'use strict';
  var symbol = '', generation = 0, timer = null, controller = null, snapshot = null;
  var publicFeed = window.PublicWhaleFeed ? window.PublicWhaleFeed.create() : null, transport = 'server';
  var POLL_MS = 15000, STALE_MS = 60000;
  var $ = function (id) { return document.getElementById(id); };
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c];
    });
  }
  function number(value, max) {
    return Number(value).toLocaleString('en-US', {maximumFractionDigits: max});
  }
  function valid(data, market) {
    return data && data.market === market && Array.isArray(data.positions) &&
      ['ok', 'scanning', 'partial', 'unavailable', 'unsupported'].indexOf(data.status) >= 0 &&
      data.positions.every(function (row) {
        return row.contract === data.contract && /^0x[0-9a-f]{40}$/i.test(row.wallet) &&
          (row.side === 'BUY' || row.side === 'SELL') &&
          [row.entry_price, row.size, row.value_usd, row.verified_at].every(function (v) { return Number.isFinite(v) && v > 0; });
      });
  }
  function paint() {
    if (!$('whale-positions-panel')) return;
    var data = snapshot, rows = data ? data.positions : [], now = Date.now();
    var status = data ? data.status : 'scanning';
    $('whp-market').textContent = symbol || 'MARKET';
    $('whp-contract').textContent = !data ? 'Hyperliquid · verifying contract' :
      data.contract ? 'Hyperliquid · ' + data.contract_label + ' (' + data.contract + ')' : 'Hyperliquid · no position coverage';
    $('whp-status').textContent = data && data.scanning ? 'SCANNING' : status === 'ok' ? 'LIVE' : status.toUpperCase();
    $('whp-status').dataset.state = status;
    $('whp-note').textContent = data && status === 'unsupported' ? data.message :
      '$100,000+ to qualify · avg. entry · perpetual exposure differs from spot';
    ['BUY', 'SELL'].forEach(function (side) {
      // Counts refer to unique tracked wallets, not all market participants.
      var seen = Object.create(null);
      var selected = rows.filter(function (row) {
        if (row.side !== side || seen[row.wallet.toLowerCase()]) return false;
        seen[row.wallet.toLowerCase()] = true;
        return true;
      });
      var key = side.toLowerCase();
      $('whp-' + key + '-count').textContent = String(selected.length);
      var html = selected.map(function (row) {
        var stale = row.stale || now - row.verified_at > STALE_MS;
        var wallet = row.wallet, short = wallet.slice(0, 6) + '…' + wallet.slice(-4);
        var time = new Date(row.verified_at).toLocaleTimeString('en-US', {hour12: false});
        return '<div class="whp-row' + (stale ? ' stale' : '') + '">' +
          '<a class="whp-wallet" href="https://app.hyperliquid.xyz/explorer/address/' + esc(wallet) + '" target="_blank" rel="noopener noreferrer" title="Public wallet: ' + esc(wallet) + '" aria-label="View public wallet ' + esc(wallet) + '">Wallet ' + esc(short) + ' ↗</a>' +
          '<b class="whp-entry"><small>AVG. ENTRY</small>' + esc(number(row.entry_price, row.entry_price < 10 ? 6 : 2)) + '</b>' +
          '<span class="whp-value" title="Position value in USD">$' + esc(number(row.value_usd, 0)) + '</span>' +
          '<span class="whp-size">' + esc(number(row.size, 5)) + ' ' + esc(data.contract.split(':').pop()) + '</span>' +
          '<span class="whp-holding">' + (stale ? 'LAST VERIFIED · ' : 'OPEN AT CHECK · ') + esc(time) + '</span></div>';
      }).join('');
      if (!html) {
        var empty = status === 'unsupported' ? 'No public coverage for this market.' :
          status === 'unavailable' || status === 'partial' ? 'Coverage incomplete. Waiting for verified data.' :
          !data || status === 'scanning' ? 'Discovering wallets…' : 'No qualifying ' + side + ' wallets discovered.';
        html = '<p class="whp-empty">' + esc(empty) + '</p>';
      }
      var list = $('whp-' + key + '-list');
      if (list.innerHTML !== html) list.innerHTML = html;
    });
    var staleCount = rows.filter(function (row) { return row.stale || now - row.verified_at > STALE_MS; }).length;
    $('whp-foot').textContent = (data && data.updated_at ? 'Scan ' + new Date(data.updated_at).toLocaleTimeString('en-US', {hour12:false}) + ' · ' : '') +
      (data && data.wallets_checked ? data.wallets_checked + ' wallets checked · ' : '') +
      (staleCount ? staleCount + ' last verified · ' : '') +
      (data && (status === 'unavailable' || status === 'partial') ? data.message + '. ' : '') +
      'Holdings: Hyperliquid · discovery: Hypurrscan + recent fills. Partial coverage; company names undisclosed. Auto scan ~15s; exits removed after verified checks.';
    var foot = $('whp-foot');
    if (document.createElement && foot.appendChild) {
      var attribution = document.createElement('a');
      attribution.href = 'https://hypurrscan.io/about'; attribution.target = '_blank'; attribution.rel = 'noopener noreferrer';
      attribution.textContent = ' Hypurrscan source'; foot.appendChild(attribution);
    }
  }
  function schedule(delay) {
    clearTimeout(timer);
    timer = setTimeout(scan, delay);
  }
  function scan(initial) {
    clearTimeout(timer);
    if ((!initial && document.hidden) || !symbol || controller) return;
    var requested = symbol, token = generation, current = new AbortController();
    controller = current;
    var timeout = setTimeout(function () { current.abort(); }, 8000);
    function directScan() {
      if (!publicFeed || token !== generation) throw new Error('Public scanner unavailable');
      clearTimeout(timeout);
      if (current.signal.aborted) { current = new AbortController(); controller = current; }
      timeout = setTimeout(function () { current.abort(); }, 30000);
      transport = 'public';
      var task = publicFeed.scan(requested, current.signal);
      snapshot = publicFeed.snapshot(requested); paint();
      return task;
    }
    var task = transport === 'public' ? directScan() : fetch('/api/whales/positions?market=' + encodeURIComponent(requested), {
      cache: 'no-store', credentials: 'same-origin', signal: current.signal
    }).then(function (response) {
      if (!response.ok) {
        var error = new Error('Position feed unavailable');
        error.auth = response.status === 401 || response.status === 403;
        throw error;
      }
      return response.json().then(function(data) {
        // Older running Python instances can serve new assets but lack the new
        // route/scanner. Read the same public feeds directly until restarted.
        return publicFeed && data.scanner_version !== 2 ? directScan() : data;
      });
    }).catch(function(error) {
      if (publicFeed && !error.auth && token === generation) return directScan();
      throw error;
    });
    task.then(function (data) {
      if (token !== generation || requested !== symbol) return;
      if (!valid(data, requested)) throw new Error('Invalid position snapshot');
      // An unavailable/initial scan is not evidence that prior holdings exited.
      if (snapshot && snapshot.contract === data.contract &&
          (data.status === 'unavailable' || data.status === 'unsupported' || data.status === 'scanning')) {
        var returned = Object.create(null);
        data.positions.forEach(function (row) { returned[row.wallet.toLowerCase()] = true; });
        data.positions = data.positions.concat(snapshot.positions.filter(function (row) {
          return !returned[row.wallet.toLowerCase()];
        }).map(function (row) { return Object.assign({}, row, {stale: true}); }));
      }
      snapshot = data;
      paint();
    }).catch(function () {
      if (token !== generation || requested !== symbol) return;
      snapshot = Object.assign({}, snapshot || {positions: [], contract: '', contract_label: ''}, {
        status: 'unavailable', scanning: false, message: 'Feed unavailable; keeping last verified positions',
        positions: (snapshot ? snapshot.positions : []).map(function (row) { return Object.assign({}, row, {stale: true}); })
      });
      paint();
    }).finally(function () {
      clearTimeout(timeout);
      if (controller === current) controller = null;
      if (token === generation && !document.hidden) schedule(snapshot && snapshot.scanning ? 2000 : POLL_MS);
    });
  }
  function setMarket(next) {
    next = String(next || '').trim();
    if (!next || next === symbol) return;
    generation++;
    clearTimeout(timer);
    if (controller) controller.abort();
    controller = null;
    symbol = next;
    snapshot = null;
    if (publicFeed) {
      var saved = publicFeed.snapshot(next);
      if (saved.positions.length) snapshot = saved;
    }
    paint();
    // Always perform the first snapshot, including inside a hidden preview.
    // Later periodic scans still pause while the page is hidden.
    scan(true);
  }
  function init() {
    if (!$('whale-positions-panel')) return;
    var terminal = window.SoftradeXTerminal;
    setMarket((terminal && terminal.getCurrentSymbol ? terminal.getCurrentSymbol() : '') || 'XAUUSDm');
    window.addEventListener('chart:market', function (event) {
      var data = event.detail || {};
      setMarket(data.symbol || (data.meta && data.meta.symbol));
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        clearTimeout(timer);
      } else {
        paint();
        scan();
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();


}
