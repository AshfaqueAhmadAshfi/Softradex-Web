/// <reference lib="webworker" />

export interface CandleRow extends Array<number> {}

export interface SmcZone {
  id: string;
  side: 'buy' | 'sell';
  kind: string;
  tf: string;
  weight: number;
  entry: number;
  zoneLow: number;
  zoneHigh: number;
  stop: number;
  tp1: number;
  tp2: number;
  band: number;
  time: number;
  note: string;
  count?: number;
  tags?: string[];
  distPct?: number;
  state?: string;
}

export interface SmcRequest {
  id: number;
  type: 'detect-smc';
  symbol: string;
  price: number;
  nowMs: number;
  frames: Record<string, CandleRow[] | undefined>;
}

export interface NewsEstimateInput {
  key: string;
  event: Record<string, any>;
  impact: Record<string, any> | null;
  prediction: Record<string, any> | null;
}

export interface NewsBatchRequest {
  id: number;
  type: 'estimate-news';
  symbol: string;
  now: number;
  quote: Record<string, any> | null;
  market: Record<string, any> | null;
  headlines: Record<string, any>[];
  items: NewsEstimateInput[];
}

type WorkerRequest = SmcRequest | NewsBatchRequest;

function barTime(v: number): number {
  const n = Number(v);
  return n < 1e11 ? n * 1000 : n;
}

function barsFor(rows: CandleRow[] | undefined, duration: number, nowMs: number): CandleRow[] {
  const cutoff = Number(nowMs) || Date.now();
  const out: CandleRow[] = [];
  for (const b of rows || []) {
    if (!Array.isArray(b) || b.length < 5) continue;
    if (barTime(b[0]) + duration > cutoff) continue;
    if (
      Number.isFinite(Number(b[1])) && Number(b[1]) > 0 &&
      Number.isFinite(Number(b[2])) && Number(b[2]) > 0 &&
      Number.isFinite(Number(b[3])) && Number(b[3]) > 0 &&
      Number.isFinite(Number(b[4])) && Number(b[4]) > 0
    ) {
      out.push(b);
    }
  }
  out.sort((a, b) => barTime(a[0]) - barTime(b[0]));
  return out;
}

function atrOf(bars: CandleRow[]): number {
  if (!bars || bars.length < 2) return 0;
  let sum = 0;
  let count = 0;
  const start = Math.max(1, bars.length - 14);
  for (let i = start; i < bars.length; i++) {
    const h = Number(bars[i][2]);
    const l = Number(bars[i][3]);
    const prevC = Number(bars[i - 1][4]);
    sum += Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
    count++;
  }
  return count ? sum / count : 0;
}

/** Detect unmitigated Order Blocks, Fair Value Gaps, and Fibonacci OTE zones off-thread. */
function detectSmartMoney(frames: Record<string, CandleRow[] | undefined>, livePrice: number, nowMs: number) {
  const price = Number(livePrice);
  if (!(price > 0) || !frames) return { buy: [] as SmcZone[], sell: [] as SmcZone[] };
  const candidates: SmcZone[] = [];
  const tfDefs = [
    { key: 'M5', duration: 300000, weight: 1 },
    { key: 'M15', duration: 900000, weight: 2 },
    { key: 'H1', duration: 3600000, weight: 3 },
  ];

  for (const tf of tfDefs) {
    const bars = barsFor(frames[tf.key], tf.duration, nowMs);
    if (bars.length < 15) continue;
    const lastClose = Number(bars[bars.length - 1][4]);
    if (!(lastClose > 0)) continue;
    const scale = price / lastClose;
    const a = atrOf(bars) * scale;
    if (!(a > 0)) continue;

    const startIdx = Math.max(3, bars.length - 55);
    for (let i = startIdx; i < bars.length - 2; i++) {
      const b = bars[i];
      const open = Number(b[1]) * scale;
      const high = Number(b[2]) * scale;
      const low = Number(b[3]) * scale;
      const close = Number(b[4]) * scale;

      const bPrev = bars[i - 1];
      const bNext = bars[i + 1];
      const prevHigh = Number(bPrev[2]) * scale;
      const prevLow = Number(bPrev[3]) * scale;
      const nextHigh = Number(bNext[2]) * scale;
      const nextLow = Number(bNext[3]) * scale;

      if (nextLow > prevHigh && nextLow - prevHigh >= a * 0.12) {
        const fvgBuyEntry = prevHigh + (nextLow - prevHigh) * 0.5;
        if (fvgBuyEntry <= price * 1.0015 && prevHigh < price) {
          let fvgBuyMitigated = false;
          for (let k1 = i + 2; k1 < bars.length; k1++) {
            if (Number(bars[k1][3]) * scale <= prevHigh) { fvgBuyMitigated = true; break; }
          }
          if (!fvgBuyMitigated) {
            const fvgBuyStop = Math.min(prevLow, prevHigh - a * 0.35);
            const fvgBuyRisk = Math.max(a * 0.4, fvgBuyEntry - fvgBuyStop);
            candidates.push({
              id: `${tf.key}:BU-FVG:${barTime(b[0])}`,
              side: 'buy',
              kind: 'BU-FVG',
              tf: tf.key,
              weight: tf.weight,
              entry: fvgBuyEntry,
              zoneLow: prevHigh,
              zoneHigh: nextLow,
              stop: fvgBuyEntry - fvgBuyRisk,
              tp1: fvgBuyEntry + fvgBuyRisk * 1.5,
              tp2: fvgBuyEntry + fvgBuyRisk * 2.5,
              band: a * 0.22,
              time: barTime(b[0]),
              note: `${tf.key} Bullish Fair Value Gap (unfilled 3-bar displacement imbalance)`,
            });
          }
        }
      }

      if (nextHigh < prevLow && prevLow - nextHigh >= a * 0.12) {
        const fvgSellEntry = prevLow - (prevLow - nextHigh) * 0.5;
        if (fvgSellEntry >= price * 0.9985 && prevLow > price) {
          let fvgSellMitigated = false;
          for (let k2 = i + 2; k2 < bars.length; k2++) {
            if (Number(bars[k2][2]) * scale >= prevLow) { fvgSellMitigated = true; break; }
          }
          if (!fvgSellMitigated) {
            const fvgSellStop = Math.max(prevHigh, prevLow + a * 0.35);
            const fvgSellRisk = Math.max(a * 0.4, fvgSellStop - fvgSellEntry);
            candidates.push({
              id: `${tf.key}:BE-FVG:${barTime(b[0])}`,
              side: 'sell',
              kind: 'BE-FVG',
              tf: tf.key,
              weight: tf.weight,
              entry: fvgSellEntry,
              zoneLow: nextHigh,
              zoneHigh: prevLow,
              stop: fvgSellEntry + fvgSellRisk,
              tp1: fvgSellEntry - fvgSellRisk * 1.5,
              tp2: fvgSellEntry - fvgSellRisk * 2.5,
              band: a * 0.22,
              time: barTime(b[0]),
              note: `${tf.key} Bearish Fair Value Gap (unfilled 3-bar supply imbalance)`,
            });
          }
        }
      }

      const laEnd = Math.min(bars.length, i + 4);
      let maxAfterClose = -Infinity;
      let minAfterClose = Infinity;
      for (let la = i + 1; la < laEnd; la++) {
        const cv = Number(bars[la][4]) * scale;
        if (cv > maxAfterClose) maxAfterClose = cv;
        if (cv < minAfterClose) minAfterClose = cv;
      }
      const priorStart = Math.max(0, i - 3);
      let priorHigh = -Infinity;
      let priorLow = Infinity;
      for (let pr = priorStart; pr < i; pr++) {
        const ph = Number(bars[pr][2]) * scale;
        const pl = Number(bars[pr][3]) * scale;
        if (ph > priorHigh) priorHigh = ph;
        if (pl < priorLow) priorLow = pl;
      }

      if (close <= open && maxAfterClose - low >= a * 0.85 && maxAfterClose > priorHigh) {
        const obBuyEntry = low + (high - low) * 0.6;
        if (obBuyEntry <= price * 1.001 && low < price) {
          let obBuyInvalidated = false;
          for (let k3 = i + 2; k3 < bars.length; k3++) {
            if (Number(bars[k3][3]) * scale < low) { obBuyInvalidated = true; break; }
          }
          if (!obBuyInvalidated) {
            const obBuyStop = low - a * 0.25;
            const obBuyRisk = Math.max(a * 0.45, obBuyEntry - obBuyStop);
            candidates.push({
              id: `${tf.key}:BU-OB:${barTime(b[0])}`,
              side: 'buy',
              kind: 'BU-OB',
              tf: tf.key,
              weight: tf.weight + 1,
              entry: obBuyEntry,
              zoneLow: low,
              zoneHigh: high,
              stop: obBuyEntry - obBuyRisk,
              tp1: obBuyEntry + obBuyRisk * 1.5,
              tp2: obBuyEntry + obBuyRisk * 2.5,
              band: a * 0.25,
              time: barTime(b[0]),
              note: `${tf.key} Bullish Order Block (unmitigated institutional demand before BOS)`,
            });
          }
        }
      }

      if (close >= open && high - minAfterClose >= a * 0.85 && minAfterClose < priorLow) {
        const obSellEntry = high - (high - low) * 0.6;
        if (obSellEntry >= price * 0.999 && high > price) {
          let obSellInvalidated = false;
          for (let k4 = i + 2; k4 < bars.length; k4++) {
            if (Number(bars[k4][2]) * scale > high) { obSellInvalidated = true; break; }
          }
          if (!obSellInvalidated) {
            const obSellStop = high + a * 0.25;
            const obSellRisk = Math.max(a * 0.45, obSellStop - obSellEntry);
            candidates.push({
              id: `${tf.key}:BE-OB:${barTime(b[0])}`,
              side: 'sell',
              kind: 'BE-OB',
              tf: tf.key,
              weight: tf.weight + 1,
              entry: obSellEntry,
              zoneLow: low,
              zoneHigh: high,
              stop: obSellEntry + obSellRisk,
              tp1: obSellEntry - obSellRisk * 1.5,
              tp2: obSellEntry - obSellRisk * 2.5,
              band: a * 0.25,
              time: barTime(b[0]),
              note: `${tf.key} Bearish Order Block (unmitigated institutional supply before BOS)`,
            });
          }
        }
      }
    }

    const winStart = Math.max(0, bars.length - 30);
    let hiIdx = winStart;
    let loIdx = winStart;
    for (let idx = winStart + 1; idx < bars.length; idx++) {
      if (Number(bars[idx][2]) >= Number(bars[hiIdx][2])) hiIdx = idx;
      if (Number(bars[idx][3]) <= Number(bars[loIdx][3])) loIdx = idx;
    }
    const swingHi = Number(bars[hiIdx][2]) * scale;
    const swingLo = Number(bars[loIdx][3]) * scale;
    const span = swingHi - swingLo;
    if (span >= a * 1.4) {
      const oteBuy618 = swingHi - span * 0.618;
      const oteBuy705 = swingHi - span * 0.705;
      if (oteBuy618 < price && swingLo < oteBuy705) {
        const oteBuyRisk = Math.max(a * 0.5, oteBuy618 - (swingLo - a * 0.15));
        candidates.push({
          id: `${tf.key}:BU-OTE:${barTime(bars[loIdx][0])}`,
          side: 'buy',
          kind: 'OTE 61.8%',
          tf: tf.key,
          weight: tf.weight,
          entry: oteBuy618,
          zoneLow: oteBuy705,
          zoneHigh: oteBuy618,
          stop: oteBuy618 - oteBuyRisk,
          tp1: oteBuy618 + oteBuyRisk * 1.5,
          tp2: Math.max(swingHi, oteBuy618 + oteBuyRisk * 2.5),
          band: a * 0.2,
          time: barTime(bars[loIdx][0]),
          note: `${tf.key} Golden Pocket OTE (61.8%–70.5% Fibonacci discount pullback)`,
        });
      }
      const oteSell618 = swingLo + span * 0.618;
      const oteSell705 = swingLo + span * 0.705;
      if (oteSell618 > price && swingHi > oteSell705) {
        const oteSellRisk = Math.max(a * 0.5, swingHi + a * 0.15 - oteSell618);
        candidates.push({
          id: `${tf.key}:BE-OTE:${barTime(bars[hiIdx][0])}`,
          side: 'sell',
          kind: 'OTE 61.8%',
          tf: tf.key,
          weight: tf.weight,
          entry: oteSell618,
          zoneLow: oteSell618,
          zoneHigh: oteSell705,
          stop: oteSell618 + oteSellRisk,
          tp1: oteSell618 - oteSellRisk * 1.5,
          tp2: Math.min(swingLo, oteSell618 - oteSellRisk * 2.5),
          band: a * 0.2,
          time: barTime(bars[hiIdx][0]),
          note: `${tf.key} Golden Pocket OTE (61.8%–70.5% Fibonacci premium rally)`,
        });
      }
    }
  }

  function mergeSide(side: 'buy' | 'sell'): SmcZone[] {
    const list = candidates
      .filter((c) => c.side === side)
      .sort((a, b) => a.entry - b.entry);
    const groups: SmcZone[] = [];
    for (const c of list) {
      const cur = groups[groups.length - 1];
      const tol = Math.max(c.band || 0, price * 0.0005);
      if (!cur || Math.abs(c.entry - cur.entry) > tol) {
        groups.push({ ...c, count: 1, tags: [`${c.kind} · ${c.tf}`] });
        continue;
      }
      cur.count = (cur.count || 1) + 1;
      if (c.weight >= cur.weight) {
        cur.kind = c.kind;
        cur.tf = c.tf;
        cur.note = c.note;
      }
      cur.weight += c.weight;
      cur.entry = (cur.entry + c.entry) / 2;
      cur.zoneLow = Math.min(cur.zoneLow, c.zoneLow);
      cur.zoneHigh = Math.max(cur.zoneHigh, c.zoneHigh);
      cur.stop = side === 'buy' ? Math.min(cur.stop, c.stop) : Math.max(cur.stop, c.stop);
      const risk = Math.abs(cur.entry - cur.stop);
      cur.tp1 = side === 'buy' ? cur.entry + risk * 1.5 : cur.entry - risk * 1.5;
      cur.tp2 = side === 'buy' ? cur.entry + risk * 2.5 : cur.entry - risk * 2.5;
      const tag = `${c.kind} · ${c.tf}`;
      if (cur.tags && !cur.tags.includes(tag)) cur.tags.push(tag);
    }
    return groups
      .map((g) => {
        const distPct = (Math.abs(price - g.entry) / price) * 100;
        const inZone = (price >= g.zoneLow && price <= g.zoneHigh) || distPct <= 0.08;
        const state = inZone ? 'IN ZONE' : distPct <= 0.35 ? 'NEAR' : 'READY';
        return { ...g, distPct, state };
      })
      .sort((a, b) => (a.distPct || 0) - (b.distPct || 0) || b.weight - a.weight)
      .slice(0, 6);
  }

  return { buy: mergeSide('buy'), sell: mergeSide('sell') };
}

const SYM_ALIAS: Record<string, string> = {
  XAUUSD247: 'XAUUSD',
  BTCUSD: 'BTCUSDT',
  ETHUSD: 'ETHUSDT',
  USTECX100: 'USTEC',
  NAS100: 'USTEC',
};

const UP_WORDS = 'rall(?:y|ies)|ris(?:e|es|ing)|gain(?:s|ing)?|jump(?:s)?|surge(?:s)?|rebound(?:s)?|bullish|upside';
const DOWN_WORDS = 'fall(?:s|ing)?|drop(?:s|ping)?|slip(?:s|ping)?|slide(?:s|ing)?|sell.?off|bearish|headwinds|downside|declin(?:e|es|ing)';
const POS_GENERIC_RE = new RegExp(`\\b(?:${UP_WORDS}|stronger)\\b`);
const NEG_GENERIC_RE = new RegExp(`\\b(?:${DOWN_WORDS}|weaker)\\b`);
const HAWK_RE = /\b(hawkish|rate hike|hike rates|tightening|higher for longer)\b/;
const DOVE_RE = /\b(dovish|rate cut|cut rates|easing)\b/;
const FED_RE = /\b(fed|fomc|federal reserve)\b/;
const ECB_RE = /\becb\b/;
const BOE_RE = /\bboe\b/;
const BOJ_RE = /\bboj\b/;
const INVERSE_RE = /unemployment|jobless|claims|job cut|oil inventories|oil stocks/;
const IMPACT_MULT: Record<string, number> = { high: 3, medium: 2, low: 1.25 };

const TOPIC_REGEXES = [
  'fed|fomc|rate|central bank',
  'inflation|cpi|pce|ppi',
  'jobs|payroll|nfp|claims|unemployment',
  'oil|crude|opec|energy',
  'bitcoin|crypto|ethereum',
  'gold|bullion|silver',
  'gdp|growth|pmi|retail',
  'stock|nasdaq|earnings|equities',
].map((k) => new RegExp(`\\b(?:${k})\\b`, 'i'));

const NAME_BIAS_CACHE = new Map<string, { pos: RegExp; neg: RegExp }>();
function nameRegexes(names: string) {
  let pair = NAME_BIAS_CACHE.get(names);
  if (!pair) {
    pair = {
      pos: new RegExp(`\\b(?:${names})\\b.{0,35}\\b(?:${UP_WORDS})\\b`),
      neg: new RegExp(`\\b(?:${names})\\b.{0,35}\\b(?:${DOWN_WORDS})\\b`),
    };
    NAME_BIAS_CACHE.set(names, pair);
  }
  return pair;
}

function normBase(v: string): string {
  const key = String(v || '').replace(/m$/, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return SYM_ALIAS[key] || key;
}

function signNum(n: number): number {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

function clampNum(n: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, n));
}

function sideVal(v: unknown): number {
  const s = String(v || '');
  return /BUY|UP|BULL/i.test(s) ? 1 : /SELL|DOWN|BEAR/i.test(s) ? -1 : 0;
}

function currencySign(symbol: string, currency: string): number {
  const key = normBase(symbol);
  const c = String(currency || '').toUpperCase();
  if (c === key || (c === 'TECH' && /USTEC|US500|US30|^[A-Z]{2,5}$/.test(key))) return 1;
  if (c === 'OIL' && /USOIL|UKOIL|XNG/.test(key)) return 1;
  if (c === 'BTC' && /^(BTC|ETH|SOL|XRP|BNB|DOGE|ADA|LTC)/.test(key)) return 1;
  if (/^(XAU|XAG|XPT|XPD)/.test(key) && c === key.slice(0, 3)) return 1;
  if (/^[A-Z]{6}$/.test(key) && c === key.slice(0, 3)) return 1;
  if (/^[A-Z]{6}$/.test(key) && c === key.slice(3)) return -1;
  if (c === 'USD') {
    if (key === 'DXY' || /^USD/.test(key)) return 1;
    if (/USD[T]?$/.test(key) || /^(USTEC|US500|US30|USOIL|UKOIL|[A-Z]{2,5})$/.test(key)) return -1;
  }
  return 0;
}

function textBias(text: string, symbol: string, currency: string): number {
  const t = String(text || '').toLowerCase();
  const key = normBase(symbol);
  const names = /^XAU/.test(key)
    ? 'gold|bullion'
    : /^XAG/.test(key)
      ? 'silver'
      : /^BTC/.test(key)
        ? 'bitcoin|btc'
        : /^ETH/.test(key)
          ? 'ethereum|ether'
          : /USOIL|UKOIL/.test(key)
            ? 'oil|crude|brent|wti'
            : /USTEC/.test(key)
              ? 'nasdaq|tech stocks'
              : '';
  if (names) {
    const res = nameRegexes(names);
    const pos = res.pos.test(t);
    const neg = res.neg.test(t);
    if (pos !== neg) return pos ? 1 : -1;
  }
  const policyCurrency = FED_RE.test(t)
    ? 'USD'
    : ECB_RE.test(t)
      ? 'EUR'
      : BOE_RE.test(t)
        ? 'GBP'
        : BOJ_RE.test(t)
          ? 'JPY'
          : currency;
  const hawk = HAWK_RE.test(t);
  const dove = DOVE_RE.test(t);
  if (hawk !== dove) return (hawk ? 1 : -1) * currencySign(symbol, policyCurrency);
  const positive = POS_GENERIC_RE.test(t);
  const negative = NEG_GENERIC_RE.test(t);
  return positive === negative ? 0 : (positive ? 1 : -1) * currencySign(symbol, currency);
}

/** Batch-estimate directional biases for calendar & headline items off-thread. */
function estimateNewsBatch(req: NewsBatchRequest) {
  const { symbol, now, quote, market } = req;
  const validHeadlines = (req.headlines || [])
    .filter((h) => Number(h.ts) <= now && Number(h.ts) >= now - 86400)
    .sort((a, b) => Number(b.ts) - Number(a.ts))
    .map((h) => ({
      raw: h,
      titleLower: String(h.title || '').toLowerCase(),
      bias: textBias(`${h.title || ''} ${h.description || ''}`, symbol, h.currency || h.country || ''),
    }));

  const out: Record<string, any> = {};
  for (const item of req.items) {
    const ev = item.event;
    let score = 0;
    const evidence: string[] = [];
    let basis = 'MODEL BIAS';
    const add = (n: number, reason: string) => {
      if (n) {
        score += n;
        evidence.push(reason);
      }
    };
    const actual = ev.actual != null && ev.actual !== '' ? Number(ev.actual) : NaN;
    const forecast = ev.forecast != null && ev.forecast !== '' ? Number(ev.forecast) : NaN;
    const previous = ev.previous != null && ev.previous !== '' ? Number(ev.previous) : NaN;
    const comparison = Number.isFinite(actual) && Number.isFinite(forecast) ? forecast : previous;
    const value = Number.isFinite(actual) ? actual : forecast;
    const titleLower = String(ev.title || '').toLowerCase();
    const inverse = INVERSE_RE.test(titleLower);
    const delta = Number.isFinite(value) && Number.isFinite(comparison) ? signNum(value - comparison) * (inverse ? -1 : 1) : 0;
    const curSign = currencySign(symbol, ev.currency || ev.country || '');
    if (delta && curSign) {
      add(
        delta * curSign * (Number.isFinite(actual) ? 6 : 3),
        Number.isFinite(actual) ? 'Actual vs forecast/previous surprise' : 'Forecast vs previous: pre-release estimate',
      );
      if (Number.isFinite(actual)) basis = 'RELEASE + MODEL';
    } else if (item.impact && sideVal(item.impact.side || item.impact.direction)) {
      add(
        sideVal(item.impact.side || item.impact.direction) * (Number.isFinite(actual) ? 5 : 3),
        item.impact.reason || 'Market-specific event effect',
      );
      if (Number.isFinite(actual)) basis = 'RELEASE + MODEL';
    }
    add(textBias(`${ev.title || ''} ${ev.description || ''}`, symbol, ev.currency || ev.country || '') * 2, 'Headline / RSS excerpt wording');

    const matched = TOPIC_REGEXES.filter((re) => re.test(ev.title || ''));
    const seen = new Set<string>();
    const related: any[] = [];
    let contextScore = 0;
    for (const h of validHeadlines) {
      if (related.length >= 40) break;
      if (seen.has(h.titleLower) || h.titleLower === titleLower) continue;
      if (matched.length && !matched.some((re) => re.test(h.raw.title || ''))) continue;
      seen.add(h.titleLower);
      if (h.bias) {
        contextScore += h.bias * Math.exp(-(now - Number(h.raw.ts)) / 21600);
        related.push({ title: h.raw.title, source: h.raw.source, ts: h.raw.ts });
      }
    }
    add(clampNum(contextScore, 2), `${related.length} related published headline(s)`);

    if (market && market.symbol === symbol && market.fresh && market.vote) {
      add(clampNum(Number(market.vote.score) / 12 || 0, 1.5), 'Live multi-timeframe price structure');
    }
    if (quote && quote.symbol === symbol && now * 1000 - quote.at <= 15000 && quote.at <= now * 1000 + 5000 && Number(quote.price) > 0) {
      add(clampNum(Number(quote.change) / 0.3 || 0, 1), 'TradingView daily price change');
      if (!score) {
        score = Number(quote.change) < 0 ? -0.05 : 0.05;
        evidence.push('Flat/mixed evidence: low-strength continuation bias');
      }
    }
    if (!evidence.length) {
      out[item.key] = null;
      continue;
    }
    const chosen = score >= 0 ? 'BUY' : 'SELL';
    const pred = item.prediction || {};
    const atr = market && market.symbol === symbol && market.fresh && market.reads?.M5 ? Number(market.reads.M5.atr) : 0;
    let move = Math.abs(Number(pred.move_abs != null ? pred.move_abs : pred.move_dollar) || 0);
    if (!move && atr) move = atr * (IMPACT_MULT[ev.impact] || 1.25);
    out[item.key] = {
      market: symbol,
      side: chosen,
      direction: chosen === 'BUY' ? 'UP' : 'DOWN',
      move_abs: move,
      strength: Math.min(90, Math.round(20 + Math.abs(score) * 9)),
      score: Math.round(score * 100) / 100,
      basis,
      reason: evidence.join(' · '),
      related: related.slice(0, 4),
      at: now * 1000,
    };
  }
  return out;
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (!msg) return;
  try {
    if (msg.type === 'detect-smc') {
      const smcZones = detectSmartMoney(msg.frames, msg.price, msg.nowMs);
      self.postMessage({ id: msg.id, ok: true, type: 'detect-smc', symbol: msg.symbol, smcZones });
    } else if (msg.type === 'estimate-news') {
      const estimates = estimateNewsBatch(msg);
      self.postMessage({ id: msg.id, ok: true, type: 'estimate-news', symbol: msg.symbol, estimates });
    }
  } catch (err) {
    self.postMessage({ id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
