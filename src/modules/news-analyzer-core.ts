/**
 * Shared Financial News Reader, Clause-Aware NLP & Post-Event Price-Reaction Analyzer.
 *
 * Used identically across:
 *   - Server RSS / Web Research Engine (`src/server/news-feed.ts`)
 *   - Browser Web Worker (`src/workers/calc-worker.ts`)
 *   - Dashboard News & SOFTRADEX AI Modules (`src/modules/news-calendar.ts`)
 *
 * Core safeguards:
 *   1. Never uses 24h daily % change (`q.change`) as an event reaction signal.
 *   2. Attributes regional currencies ("Canadian Dollar" -> CAD, not USD) accurately.
 *   3. Strips past-tense recap clauses ("after sliding to...") and respects negation/
 *      softening modifiers ("limiting hawkish", "slow, steady", "pare rate cut bets").
 *   4. Measures real post-event M5 price reaction vs baseline candle at `ev.ts` (in ATR)
 *      and vetoes / flips / flags WAIT whenever live price action contradicts stale text.
 */

export interface NewsCandleBar {
  0: number;
  1: number;
  2: number;
  3: number;
  4: number;
  5?: number;
}

export interface TextAnalysisResult {
  score: number;
  assetAction: number;
  policyAction: number;
  policyCurrency: string;
  moderatePolicy: boolean;
  reasonTags: string[];
}

export interface PostEventReaction {
  ready: boolean;
  atr: number;
  curPrice: number;
  baselinePrice: number;
  evMoveAbs: number;
  evMoveAtr: number;
  impulse15mAtr: number;
  impulse30mAtr: number;
  slopeAtr: number;
  elapsedSec: number;
  direction: 'UP' | 'DOWN' | 'FLAT';
}

export interface NewsEstimateInput {
  symbol: string;
  event: Record<string, any>;
  now?: number;
  impact?: Record<string, any> | null;
  prediction?: Record<string, any> | null;
  quote?: Record<string, any> | null;
  market?: Record<string, any> | null;
  headlines?: Record<string, any>[];
  headlinesPreSorted?: boolean;
  barsM5?: number[][];
  dxyBarsM5?: number[][];
}

export interface NewsEstimateOutput {
  market: string;
  side: 'BUY' | 'SELL' | 'WAIT';
  direction: 'UP' | 'DOWN' | 'WAIT';
  move_abs: number;
  strength: number;
  score: number;
  basis: string;
  conflict: boolean;
  hasActual: boolean;
  reactionAtr: number;
  reason: string;
  related: Array<{ title: string; source: string; ts: number }>;
  at: number;
}

const SYM_ALIAS: Record<string, string> = {
  GOLD: 'XAUUSD',
  XAUUSD247: 'XAUUSD',
  BTCUSD: 'BTCUSDT',
  ETHUSD: 'ETHUSDT',
  USTECX100: 'USTEC',
  NAS100: 'USTEC',
  NDX: 'USTEC',
  SPX: 'US500',
  WTI: 'USOIL',
  BRENT: 'UKOIL',
};

const BULL_VERBS =
  'rall(?:y|ies|ied|ying)|ris(?:e|es|ing)|rose|gain(?:s|ed|ing)?|jump(?:s|ed|ing)?|surg(?:e|es|ed|ing)|rebound(?:s|ed|ing)?|recover(?:s|ed|ing)?|bounc(?:e|es|ed|ing)|climb(?:s|ed|ing)?|advanc(?:e|es|ed|ing)|pick(?:s|ed|ing)? up|edg(?:e|es|ed)? (?:up|higher)|mov(?:e|es|ed|ing) higher|tick(?:s|ed)? up|break(?:s)? out|soar(?:s|ed|ing)?|par(?:e|es|ed|ing) losses|trim(?:s|med|ming)? losses|holds? gains|extends? gains|bids? return';

const BEAR_VERBS =
  'fall(?:s|ing)?|fell|drop(?:s|ped|ping)?|slip(?:s|ped|ping)?|slid(?:e|es|ing)?|slid|sink(?:s|ing)?|sank|plung(?:e|es|ed|ing)|crash(?:es|ed|ing)?|tumbl(?:e|es|ed|ing)|sell.?offs?|slump(?:s|ed|ing)?|declin(?:e|es|ed|ing)|retreat(?:s|ed|ing)?|edg(?:e|es|ed)? lower|mov(?:e|es|ed|ing) lower|par(?:e|es|ed|ing) gains|trim(?:s|med|ming)? gains|under pressure|extends? losses';

const POS_GENERIC_RE = new RegExp(`\\b(?:${BULL_VERBS}|stronger)\\b`);
const NEG_GENERIC_RE = new RegExp(`\\b(?:${BEAR_VERBS}|weaker)\\b`);

const RECAP_NEG_RE =
  /\b(?:after|following|from|erasing|reversing)\s+(?:an?\s+)?(?:earlier\s+|overnight\s+|intraday\s+|recent\s+)?(?:drop|fall|falling|drop(?:ping)?|slid(?:e|ing)|dip(?:ping)?|declin(?:e|ing)|slump(?:ing)?|sell.?off|plunge|lows?)\b/g;
const RECAP_POS_RE =
  /\b(?:after|following|from|erasing|reversing)\s+(?:an?\s+)?(?:earlier\s+|overnight\s+|intraday\s+|recent\s+)?(?:rall(?:y|ying)|surg(?:e|ing)|jump(?:ing)?|gain(?:s|ing)?|ris(?:e|ing)|spike|highs?|peaks?)\b/g;

const NEGATION_PREFIX_RE =
  /(?:^|[,;:.()]|\b)(?:no|not|unlikely|less|limit(?:s|ed|ing)?|rule(?:s|d)? out|halt(?:s|ed|ing)?|paus(?:e|es|ed|ing)|end(?:s|ed|ing)?|reced(?:e|es|ed|ing)|fad(?:e|es|ed|ing)|dampen(?:s|ed|ing)?|cool(?:s|ed|ing)?|delay(?:s|ed|ing)?|push(?:es|ed|ing)? back|dial(?:s|ed|ing)? back|scal(?:e|es|ed|ing)? back|reduc(?:e|es|ed|ing)?|par(?:e|es|ed|ing)?(?: back)?|avoid(?:s|ed|ing)?)(?:\s+[a-z0-9'-]+){0,5}\s*$/;

const MODERATE_PREFIX_RE =
  /\b(?:slow,?\s*steady|gradual|small,?\s*incremental|measured|modest|cautious|unclear how far|data.?dependent|patient)\b/i;

const HAWK_PHRASES_RE = /\b(hawkish|rate hikes?|hikes? rates?|rais(?:e|es|ing) rates?|tightening|higher for longer|more restriction)\b/g;
const DOVE_PHRASES_RE = /\b(dovish|rate cuts?|cuts? rates?|lower(?:ing)? rates?|fed pause|hold(?:s|ing)? rates? steady|easing cycle)\b/g;

const DOLLAR_UP_RE =
  /\b(?:u\.?s\.?\s+dollar|greenback|dxy|dollar|treasury yields?|real yields?|bond yields?)\b.{0,28}\b(?:rall(?:y|ies|ied)|surg(?:e|es|ed)|jump(?:s|ed)?|climb(?:s|ed)?|advanc(?:e|es|ed)|gain(?:s|ed)?|strengthen(?:s|ed)?|firm(?:s|ed)?|rebound(?:s|ed)?|march(?:es|ed)? higher|spike(?:s|d)?)\b/;

const DOLLAR_DOWN_RE =
  /\b(?:u\.?s\.?\s+dollar|greenback|dxy|dollar|treasury yields?|real yields?|bond yields?)\b.{0,28}\b(?:fall(?:s|ing)?|fell|drop(?:s|ped)?|slip(?:s|ped)?|slid(?:e|es)?|slid|weaken(?:s|ed)?|retreat(?:s|ed)?|pull(?:s|ed)? back|eas(?:e|es|ed)|cool(?:s|ed)?|dip(?:s|ped)?|lose(?:s)? ground)\b/;

const REGIONAL_DOLLAR_RE = /\b(?:canadian|australian|new zealand|singapore|hong kong|taiwan)\s+dollar\b/g;

function maskRegionalDollars(low: string): string {
  if (!low.includes('dollar')) return low;
  if (
    !low.includes('canadian') &&
    !low.includes('australian') &&
    !low.includes('new zealand') &&
    !low.includes('singapore') &&
    !low.includes('hong kong') &&
    !low.includes('taiwan')
  ) {
    return low;
  }
  return low.replace(REGIONAL_DOLLAR_RE, (m) => ' '.repeat(m.length));
}

const DATA_USD_BULL_RE =
  /\b(hot cpi|hot inflation|inflation accelerates?|sticky inflation|nfp beats?|payroll surge|strong jobs|beats? forecast)\b/;
const DATA_USD_BEAR_RE =
  /\b(cpi cools?|inflation cools?|inflation slows?|pce cools?|soft inflation|disinflation|weak jobs|weak nfp|payrolls? miss|unemployment rises?|jobless claims (?:rise|jump|surge)|misses? forecast)\b/;

const INVERSE_RE =
  /unemployment|jobless|claims|layoff|job cut|oil inventories|oil stocks/;

const STOCK_NOISE_RE =
  /\b(earnings call transcript|eps beat|revenue miss|stock hits 52-week|price target|reiterates? .* rating|drill program|penny stocks?|dividend update|announces dividend|ipo\b|openai|hugging face|spacex|stock split|fiscal q[1-4]|q[1-4] 20\d\d (?:slides|results|earnings))\b/i;

const HAS_CB_WORD_RE =
  /\b(?:fed|fomc|federal reserve|powell|warsh|hammack|waller|barkin|schmid|jefferson|bostic|kashkari|williams|ecb|lagarde|vujcic|boe|bank of england|bailey|boj|bank of japan|ueda|boc|bank of canada|macklem|rba|reserve bank of australia|bullock|rbnz)\b/;

const TOPIC_PATTERNS = [
  'fed|fomc|powell|warsh|hammack|waller|barkin|schmid|rate|central bank',
  'inflation|cpi|pce|ppi',
  'jobs|payroll|nfp|claims|unemployment',
  'oil|crude|opec|energy',
  'bitcoin|crypto|ethereum',
  'gold|bullion|silver|xau',
  'gdp|growth|pmi|retail',
  'stock|nasdaq|equities',
].map((k) => new RegExp(`\\b(?:${k})\\b`, 'i'));

const MAX_CACHE_ENTRIES = 6500;
const NOISE_CACHE = new Map<string, boolean>();
const TOPIC_MASK_CACHE = new Map<string, number>();
const TEXT_ANALYSIS_CACHE = new Map<string, TextAnalysisResult>();
const CUR_WORD_RE_CACHE = new Map<string, RegExp>();
const HEADLINE_SCORE_CACHE = new WeakMap<object, Map<string, number>>();

function cacheSet<K, V>(map: Map<K, V>, k: K, v: V): void {
  if (map.size >= MAX_CACHE_ENTRIES) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(k, v);
}

function getTopicMask(text: string): number {
  const cached = TOPIC_MASK_CACHE.get(text);
  if (cached !== undefined) return cached;
  let mask = 0;
  for (let i = 0; i < TOPIC_PATTERNS.length; i++) {
    if (TOPIC_PATTERNS[i].test(text)) mask |= 1 << i;
  }
  cacheSet(TOPIC_MASK_CACHE, text, mask);
  return mask;
}

function curWordRegex(curLower: string): RegExp {
  let re = CUR_WORD_RE_CACHE.get(curLower);
  if (!re) {
    re = new RegExp(`\\b${curLower}\\b`);
    CUR_WORD_RE_CACHE.set(curLower, re);
  }
  return re;
}

const NAME_RE_CACHE = new Map<string, { pos: RegExp; neg: RegExp }>();
function nameRegexes(names: string) {
  let pair = NAME_RE_CACHE.get(names);
  if (!pair) {
    pair = {
      pos: new RegExp(`\\b(?:${names})\\b.{0,38}\\b(?:${BULL_VERBS})\\b`),
      neg: new RegExp(`\\b(?:${names})\\b.{0,38}\\b(?:${BEAR_VERBS})\\b`),
    };
    NAME_RE_CACHE.set(names, pair);
  }
  return pair;
}

export function canonicalNewsBase(v: unknown): string {
  const key = String(v || '').replace(/m$/i, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
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

export function newsCurrencySign(symbol: string, currency: string): number {
  const key = canonicalNewsBase(symbol);
  const c = String(currency || '').toUpperCase();
  if (!c) return 0;
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

export function isMacroNoiseHeadline(title: string): boolean {
  const t = String(title || '').trim();
  if (!t) return true;
  const cached = NOISE_CACHE.get(t);
  if (cached !== undefined) return cached;
  const noisy = STOCK_NOISE_RE.test(t);
  cacheSet(NOISE_CACHE, t, noisy);
  return noisy;
}

/**
 * Infer exact macro currency & importance from headline copy without misclassifying
 * CAD/AUD/NZD "dollars" as USD.
 */
export function inferMacroCurrency(
  text: string,
  fallback = 'USD',
): { currency: string; impact: 'high' | 'medium' | 'low' } {
  const low = String(text || '').toLowerCase();
  let currency = String(fallback || 'USD').toUpperCase();

  if (/\b(gold|xau|xauusd|bullion|precious metal)\b/.test(low)) currency = 'XAU';
  else if (/\b(silver|xag|xagusd)\b/.test(low)) currency = 'XAG';
  else if (/\b(bitcoin|btc|ethereum|eth|crypto|blockchain|binance|solana|xrp|altcoin|stablecoin)\b/.test(low)) currency = 'BTC';
  else if (/\b(oil|crude|brent|wti|opec)\b/.test(low)) currency = 'OIL';
  else if (/\b(canadian dollar|loonie|bank of canada|\bboc\b|canada cpi|canada inflation|canada jobs)\b/.test(low)) currency = 'CAD';
  else if (/\b(australian dollar|aussie|\brba\b|reserve bank of australia)\b/.test(low)) currency = 'AUD';
  else if (/\b(new zealand dollar|kiwi|\brbnz\b)\b/.test(low)) currency = 'NZD';
  else if (/\b(euro|ecb|eurozone|eurusd)\b/.test(low)) currency = 'EUR';
  else if (/\b(pound|sterling|boe|gbpusd|uk economy|uk inflation|uk jobs)\b/.test(low)) currency = 'GBP';
  else if (/\b(yen|boj|bank of japan|usdjpy|japan)\b/.test(low)) currency = 'JPY';
  else if (/\b(swiss franc|snb|usdchf)\b/.test(low)) currency = 'CHF';
  else if (/\b(india|indian|rupee|\brbi\b)\b/.test(low)) currency = 'INR';
  else if (/\b(brazil|brazilian|brazilian real)\b/.test(low)) currency = 'BRL';
  else if (/\b(china|chinese|yuan|renminbi|pboc)\b/.test(low)) currency = 'CNY';
  else if (
    /\b(fed|fomc|federal reserve|powell|warsh|hammack|waller|barkin|schmid|williams|jefferson|bostic|kashkari|goolsbee|us cpi|u\.s\. cpi|nonfarm|payroll|nfp|nasdaq|s&p|treasury yields?|dxy|greenback|u\.s\. dollar|us dollar|dollar|usd)\b/.test(
      maskRegionalDollars(low),
    )
  ) {
    currency = 'USD';
  }

  const highRe =
    /\b(fed|fomc|powell|warsh|hammack|waller|barkin|schmid|rate|cpi|pce|inflation|payroll|nfp|gdp|crash|surge|plunge|etf|sec|tariff|war|recession|emergency|record)\b/;
  return { currency, impact: highRe.test(low) ? 'high' : 'medium' };
}

/**
 * Scan all occurrences of policy phrases while checking preceding negation/softening words.
 */
function scanPolicyMatches(txt: string, re: RegExp, baseWeight: number): { net: number; moderated: boolean } {
  let net = 0;
  let moderated = false;
  re.lastIndex = 0;
  const unclearPos = txt.includes('unclear how far');
  try {
    let m: RegExpExecArray | null;
    while ((m = re.exec(txt)) !== null) {
      const start = m.index;
      const prefix = txt.slice(Math.max(0, start - 55), start);
      if (NEGATION_PREFIX_RE.test(prefix)) {
        // Negating or ruling out a hike flips toward dovish, and vice versa
        net -= baseWeight * 0.85;
      } else if (MODERATE_PREFIX_RE.test(prefix) || unclearPos) {
        // Gradual / incremental / uncertain path carries smaller impulse and avoids over-conviction
        net += baseWeight * 0.45;
        moderated = true;
      } else {
        net += baseWeight;
      }
    }
  } finally {
    re.lastIndex = 0;
  }
  return { net, moderated };
}

const EMPTY_TEXT_ANALYSIS: TextAnalysisResult = {
  score: 0,
  assetAction: 0,
  policyAction: 0,
  policyCurrency: 'USD',
  moderatePolicy: false,
  reasonTags: [],
};

interface BaseTextSignals {
  noisy: boolean;
  currentClause: string;
  policyCurrency: string;
  policyBaseScore: number;
  usdExtraScore: number;
  moderatePolicy: boolean;
  goldCatalyst: number;
  goldSafeHaven: boolean;
  cryptoCatalyst: number;
  fxMacroMentioned: boolean;
  currencyMentioned: boolean;
  genericDir: number;
}

const BASE_TEXT_CACHE = new Map<string, BaseTextSignals>();

function extractBaseTextSignals(raw: string, cur: string): BaseTextSignals {
  const bKey = `${cur}\n${raw}`;
  const hit = BASE_TEXT_CACHE.get(bKey);
  if (hit !== undefined) return hit;

  if (isMacroNoiseHeadline(raw)) {
    const empty: BaseTextSignals = {
      noisy: true,
      currentClause: '',
      policyCurrency: cur,
      policyBaseScore: 0,
      usdExtraScore: 0,
      moderatePolicy: false,
      goldCatalyst: 0,
      goldSafeHaven: false,
      cryptoCatalyst: 0,
      fxMacroMentioned: false,
      currencyMentioned: false,
      genericDir: 0,
    };
    cacheSet(BASE_TEXT_CACHE, bKey, empty);
    return empty;
  }

  const hasRecapWord =
    raw.includes('after') || raw.includes('following') || raw.includes('from') || raw.includes('erasing') || raw.includes('reversing');
  const currentClause = hasRecapWord ? raw.replace(RECAP_NEG_RE, ' ').replace(RECAP_POS_RE, ' ') : raw;

  let policyCurrency = cur;
  if (HAS_CB_WORD_RE.test(raw)) {
    policyCurrency = /\b(fed|fomc|federal reserve|powell|warsh|hammack|waller|barkin|schmid|jefferson|bostic|kashkari|williams)\b/.test(raw)
      ? 'USD'
      : /\b(ecb|lagarde|vujcic)\b/.test(raw)
        ? 'EUR'
        : /\b(boe|bank of england|bailey)\b/.test(raw)
          ? 'GBP'
          : /\b(boj|bank of japan|ueda)\b/.test(raw)
            ? 'JPY'
            : /\b(boc|bank of canada|macklem)\b/.test(raw)
              ? 'CAD'
              : /\b(rba|reserve bank of australia|bullock)\b/.test(raw)
                ? 'AUD'
                : /\b(rbnz)\b/.test(raw)
                  ? 'NZD'
                  : cur;
  }

  const mayHaveHawk =
    raw.includes('hawk') || raw.includes('rate') || raw.includes('hike') || raw.includes('tighten') || raw.includes('longer') || raw.includes('restrict');
  const mayHaveDove = raw.includes('dov') || raw.includes('rate') || raw.includes('pause') || raw.includes('easing');
  const hawkRes = mayHaveHawk ? scanPolicyMatches(raw, HAWK_PHRASES_RE, 1.3) : { net: 0, moderated: false };
  const doveRes = mayHaveDove ? scanPolicyMatches(raw, DOVE_PHRASES_RE, 1.3) : { net: 0, moderated: false };
  const policyBaseScore = hawkRes.net - doveRes.net;
  const moderatePolicy = hawkRes.moderated || doveRes.moderated;

  let usdExtraScore = 0;
  if (DATA_USD_BULL_RE.test(raw)) usdExtraScore += 1.25;
  if (DATA_USD_BEAR_RE.test(raw)) usdExtraScore -= 1.25;
  if (raw.includes('dollar') || raw.includes('greenback') || raw.includes('dxy') || raw.includes('yield')) {
    const usdText = maskRegionalDollars(raw);
    if (DOLLAR_UP_RE.test(usdText)) usdExtraScore += 1.35;
    if (DOLLAR_DOWN_RE.test(usdText)) usdExtraScore -= 1.35;
  }

  let goldCatalyst = 0;
  let goldSafeHaven = false;
  if (
    /\b(safe haven|geopolit|conflict|war|escalation|tariff|sanctions?|central bank buy|stock bust|risk.?off|uncertainty|could disappoint)\b/.test(raw)
  ) {
    goldCatalyst += 1.4;
    goldSafeHaven = true;
  }
  if (/\b(ceasefire|peace deal|de-escalation|risk.?on surge)\b/.test(raw)) {
    goldCatalyst -= 1.2;
  }

  let cryptoCatalyst = 0;
  if (/\b(etf inflow|institutional buying|sec approves?|adoption|halving)\b/.test(raw)) cryptoCatalyst += 1.5;
  if (/\b(etf outflow|crackdown|lawsuit|hack|liquidation|sec sues?)\b/.test(raw)) cryptoCatalyst -= 1.5;

  const curLower = cur.toLowerCase();
  const fxMacroMentioned = /\b(fed|fomc|ecb|boe|boj|cpi|pce|nfp|payroll|gdp|dollar|usd|eur|gbp|jpy)\b/.test(raw);
  const currencyMentioned = curLower === 'usd'
    ? /\b(u\.s\.|us |fed|fomc|cpi|pce|nfp|payroll|treasury|dollar|usd|inflation|jobs|gdp|yields)\b/.test(raw)
    : curLower && curLower.length === 3
      ? curWordRegex(curLower).test(raw)
      : false;

  const gPos = POS_GENERIC_RE.test(currentClause);
  const gNeg = NEG_GENERIC_RE.test(currentClause);
  const genericDir = gPos !== gNeg ? (gPos ? 1 : -1) : 0;

  const sigs: BaseTextSignals = {
    noisy: false,
    currentClause,
    policyCurrency,
    policyBaseScore,
    usdExtraScore,
    moderatePolicy,
    goldCatalyst,
    goldSafeHaven,
    cryptoCatalyst,
    fxMacroMentioned,
    currencyMentioned,
    genericDir,
  };
  cacheSet(BASE_TEXT_CACHE, bKey, sigs);
  return sigs;
}

/**
 * Analyze headline/event text with recap stripping, negation handling, central-bank currency attribution,
 * and asset-specific direction extraction.
 */
export function analyzeFinancialText(text: string, symbol: string, currency: string): TextAnalysisResult {
  const raw = String(text || '').toLowerCase();
  const cur = String(currency || 'USD').toUpperCase();
  if (!raw.trim()) {
    return cur === 'USD'
      ? EMPTY_TEXT_ANALYSIS
      : { score: 0, assetAction: 0, policyAction: 0, policyCurrency: cur, moderatePolicy: false, reasonTags: [] };
  }

  const key = canonicalNewsBase(symbol);
  const cacheKey = `${key}\n${cur}\n${raw}`;
  const cached = TEXT_ANALYSIS_CACHE.get(cacheKey);
  if (cached !== undefined) return cached;

  const base = extractBaseTextSignals(raw, cur);
  if (base.noisy) {
    const res: TextAnalysisResult = {
      score: 0,
      assetAction: 0,
      policyAction: 0,
      policyCurrency: cur,
      moderatePolicy: false,
      reasonTags: [],
    };
    cacheSet(TEXT_ANALYSIS_CACHE, cacheKey, res);
    return res;
  }

  const isGold = /^XAU|^XAG/.test(key);
  const isCrypto = /^(BTC|ETH|SOL|XRP|BNB|DOGE|ADA|LINK|AVAX)/.test(key);
  const usdSign = newsCurrencySign(symbol, 'USD');
  const reasonTags: string[] = [];

  // 1. Direct asset price-action verb check
  let assetAction = 0;
  const names = /^XAU/.test(key)
    ? (raw.includes('gold') || raw.includes('bullion') || raw.includes('xau') ? 'gold|bullion|xau/usd|xauusd' : '')
    : /^XAG/.test(key)
      ? (raw.includes('silver') || raw.includes('xag') ? 'silver|xag/usd|xagusd' : '')
      : /^BTC/.test(key)
        ? (raw.includes('bitcoin') || raw.includes('btc') ? 'bitcoin|btc' : '')
        : /^ETH/.test(key)
          ? (raw.includes('eth') ? 'ethereum|ether|eth' : '')
          : /USOIL|UKOIL/.test(key)
            ? (raw.includes('oil') || raw.includes('crude') || raw.includes('brent') || raw.includes('wti') ? 'oil|crude|brent|wti' : '')
            : /USTEC|US500|US30/.test(key)
              ? (raw.includes('nasdaq') || raw.includes('s&p') || raw.includes('dow') || raw.includes('tech') ? 'nasdaq|s&p|dow|tech stocks' : '')
              : '';
  if (names) {
    const nre = nameRegexes(names);
    const pos = nre.pos.test(base.currentClause);
    const neg = nre.neg.test(base.currentClause);
    if (pos !== neg) {
      assetAction = pos ? 1.5 : -1.5;
      reasonTags.push(pos ? 'asset rising' : 'asset falling');
    }
  }

  // 2. Policy currency & central-bank tone (negation-safe)
  const policyCurrency = base.policyCurrency;
  const pSign = newsCurrencySign(symbol, policyCurrency);
  const policyCurrencyScore = base.policyBaseScore + (usdSign !== 0 ? base.usdExtraScore : 0);
  const moderatePolicy = base.moderatePolicy;

  const policyAction = pSign !== 0 ? clampNum(policyCurrencyScore * pSign, 2.2) : 0;
  if (Math.abs(policyAction) >= 0.4) {
    reasonTags.push(policyAction > 0 ? `${policyCurrency} dovish/weak` : `${policyCurrency} hawkish/firm`);
  }

  // 3. Asset-class macro/fundamental catalysts
  let catalystAction = 0;
  if (isGold) {
    catalystAction = base.goldCatalyst;
    if (base.goldSafeHaven) reasonTags.push('safe-haven demand');
  } else if (isCrypto) {
    catalystAction = base.cryptoCatalyst;
  }

  // 4. Generic directional wording fallback ONLY when headline actually references the target asset or its explicit currency/policy
  let genericAction = 0;
  if (!assetAction && base.genericDir !== 0) {
    const assetMentioned =
      /^XAU/.test(key) ? /\b(gold|bullion|xau|precious metal)\b/.test(raw)
      : /^XAG/.test(key) ? /\b(silver|xag|precious metal)\b/.test(raw)
      : /^BTC/.test(key) ? /\b(bitcoin|btc|crypto)\b/.test(raw)
      : /^ETH/.test(key) ? /\b(ethereum|ether|eth|crypto)\b/.test(raw)
      : /USOIL|UKOIL/.test(key) ? /\b(oil|crude|brent|wti|opec)\b/.test(raw)
      : /USTEC|US500|US30/.test(key) ? /\b(nasdaq|s&p|dow|wall street|stocks|equities)\b/.test(raw)
      : base.fxMacroMentioned;
    if (assetMentioned || base.currencyMentioned) {
      const cSign = newsCurrencySign(symbol, currency);
      if (cSign !== 0) genericAction = base.genericDir * cSign * 0.85;
    }
  }

  // If a forecast headline mentions background "bearish bias" while explicit current move says asset "moves higher", let assetAction lead
  const combined = assetAction * 1.15 + policyAction + catalystAction + genericAction;
  const capped = clampNum(combined, 2.5);
  const result: TextAnalysisResult = {
    score: Math.abs(capped) < 0.15 ? 0 : Number(capped.toFixed(3)),
    assetAction,
    policyAction,
    policyCurrency,
    moderatePolicy,
    reasonTags,
  };
  cacheSet(TEXT_ANALYSIS_CACHE, cacheKey, result);
  return result;
}

/** Compatibility single-number bias (-2..2 scale) for callers expecting numeric polarity. */
export function textBias(text: string, symbol: string, currency: string): number {
  const res = analyzeFinancialText(text, symbol, currency);
  if (res.score > 0.35) return Math.min(2, res.score);
  if (res.score < -0.35) return Math.max(-2, res.score);
  return 0;
}

function normBarTsSec(rawTs: number): number {
  const n = Number(rawTs) || 0;
  return n > 1e11 ? Math.floor(n / 1000) : Math.floor(n);
}

/** Compute 14-period Wilder-style or SMA ATR from OHLC bars (`[ts, o, h, l, c, v]`). */
export function computeAtrFromBars(bars: number[][], period = 14): number {
  if (!Array.isArray(bars) || bars.length < 3) return 0;
  const slice = bars.slice(-Math.max(period + 4, 18));
  let sum = 0;
  let cnt = 0;
  for (let i = 1; i < slice.length; i++) {
    const h = Number(slice[i][2]);
    const l = Number(slice[i][3]);
    const prevC = Number(slice[i - 1][4]);
    if (!Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(prevC)) continue;
    const tr = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
    if (Number.isFinite(tr) && tr > 0) {
      sum += tr;
      cnt++;
    }
  }
  return cnt > 0 ? sum / cnt : 0;
}

/**
 * Measure actual post-event price reaction since `evTs` AND live M5 impulse / slope in ATR units.
 * Replaces buggy 24h daily `% change` with true real-time price reaction since news release.
 */
export function computePostEventReaction(
  barsM5: number[][] | undefined,
  evTsSec: number,
  nowSec: number,
  livePrice?: number,
  knownAtr?: number,
): PostEventReaction {
  const bars = Array.isArray(barsM5)
    ? barsM5
        .filter((b) => Array.isArray(b) && b.length >= 5 && Number(b[4]) > 0)
        .slice()
        .sort((a, b) => Number(a[0]) - Number(b[0]))
    : [];

  const cur = Number.isFinite(Number(livePrice)) && Number(livePrice) > 0
    ? Number(livePrice)
    : bars.length
      ? Number(bars[bars.length - 1][4])
      : 0;

  if (bars.length < 4 || !(cur > 0)) {
    return {
      ready: false,
      atr: Number(knownAtr) || 0,
      curPrice: cur,
      baselinePrice: cur,
      evMoveAbs: 0,
      evMoveAtr: 0,
      impulse15mAtr: 0,
      impulse30mAtr: 0,
      slopeAtr: 0,
      elapsedSec: Math.max(0, nowSec - evTsSec),
      direction: 'FLAT',
    };
  }

  const calcAtr = computeAtrFromBars(bars, 14);
  const atr = Number(knownAtr) > 0 ? Number(knownAtr) : calcAtr > 0 ? calcAtr : cur * 0.0012;

  const ref3 = Number(bars[Math.max(0, bars.length - 4)][4]) || cur;
  const ref6 = Number(bars[Math.max(0, bars.length - 7)][4]) || cur;
  const impulse15mAtr = atr > 0 ? (cur - ref3) / atr : 0;
  const impulse30mAtr = atr > 0 ? (cur - ref6) / atr : 0;

  // EMA9 - EMA21 slope normalized by ATR
  let ema9 = Number(bars[0][4]);
  let ema21 = Number(bars[0][4]);
  const a9 = 2 / 10;
  const a21 = 2 / 22;
  for (let i = 1; i < bars.length; i++) {
    const c = Number(bars[i][4]);
    ema9 = ema9 + a9 * (c - ema9);
    ema21 = ema21 + a21 * (c - ema21);
  }
  const slopeAtr = atr > 0 ? (ema9 - ema21) / atr : 0;

  // Find exact candle right before/at evTsSec as event baseline
  let baselinePrice = Number(bars[Math.max(0, bars.length - 4)][1]) || cur;
  if (evTsSec > 0 && nowSec >= evTsSec) {
    let chosen: number[] | null = null;
    for (let i = bars.length - 1; i >= 0; i--) {
      const bSec = normBarTsSec(bars[i][0]);
      if (bSec <= evTsSec) {
        chosen = bars[i];
        break;
      }
    }
    if (chosen) {
      const bSec = normBarTsSec(chosen[0]);
      // If candle straddles evTsSec, use its open (pre-news); if strictly before evTsSec, use close
      baselinePrice = bSec === evTsSec ? Number(chosen[1]) : Number(chosen[4]);
    }
  }

  const evMoveAbs = cur - baselinePrice;
  const evMoveAtr = atr > 0 && nowSec >= evTsSec ? evMoveAbs / atr : 0;
  const primary = nowSec >= evTsSec ? evMoveAtr : impulse15mAtr;
  const direction: 'UP' | 'DOWN' | 'FLAT' = primary >= 0.35 ? 'UP' : primary <= -0.35 ? 'DOWN' : 'FLAT';

  return {
    ready: true,
    atr,
    curPrice: cur,
    baselinePrice,
    evMoveAbs,
    evMoveAtr,
    impulse15mAtr,
    impulse30mAtr,
    slopeAtr,
    elapsedSec: Math.max(0, nowSec - evTsSec),
    direction,
  };
}

function parseCalendarNum(raw: unknown): number {
  if (raw == null || raw === '') return NaN;
  const s = String(raw).trim().replace(/,/g, '');
  if (!s) return NaN;
  const m = s.match(/^([+-]?\d+(?:\.\d+)?)\s*([%kmbKtT])?$/);
  if (!m) {
    const n = Number(s.replace(/[^\d.+-]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  }
  let val = Number(m[1]);
  if (!Number.isFinite(val)) return NaN;
  const suffix = (m[2] || '').toUpperCase();
  if (suffix === 'K') val *= 1e3;
  else if (suffix === 'M') val *= 1e6;
  else if (suffix === 'B') val *= 1e9;
  else if (suffix === 'T') val *= 1e12;
  return val;
}

/**
 * Determine if numeric actual vs forecast/previous indicates an economic surprise.
 */
function numericSurpriseScore(ev: Record<string, any>, symbol: string): { score: number; hasActual: boolean; reason: string } {
  const actual = parseCalendarNum(ev.actual);
  const forecast = parseCalendarNum(ev.forecast);
  const previous = parseCalendarNum(ev.previous);
  const comparison = Number.isFinite(actual) && Number.isFinite(forecast) ? forecast : previous;
  const value = Number.isFinite(actual) ? actual : forecast;
  const evTitleLower = String(ev.title || ev.event || '').toLowerCase();
  const inverse = INVERSE_RE.test(evTitleLower);
  const delta = Number.isFinite(value) && Number.isFinite(comparison) ? signNum(value - comparison) * (inverse ? -1 : 1) : 0;
  const curSign = newsCurrencySign(symbol, ev.currency || ev.country || '');
  const hasActual = Number.isFinite(actual);

  if (delta && curSign) {
    return {
      score: delta * curSign * (hasActual ? 6 : 2.2),
      hasActual,
      reason: hasActual ? 'Actual vs forecast/previous surprise' : 'Forecast vs previous (pre-release)',
    };
  }
  return { score: 0, hasActual, reason: '' };
}

/**
 * Upgraded multi-factor NewsDirection estimator:
 * - Numeric surprise when released
 * - Clause-aware NLP on event + tightly time-decayed breaking headlines (90m half-life, post-event 2.5x)
 * - Intraday live M5/DXY post-event price reaction (NO 24h daily change poison!)
 * - Conflict & pre-speech uncertainty gate: emits WAIT instead of opposite trade call when text vs price fight.
 */
export function estimateNewsDirection(input: NewsEstimateInput): NewsEstimateOutput | null {
  const ev = input.event || {};
  const symbol = input.symbol;
  const symBase = canonicalNewsBase(symbol);
  const now = input.now || Date.now() / 1000;
  const q = input.quote;
  const market = input.market;
  const evTs = Number(ev.ts) || now;
  const isHeadline = ev.kind === 'headline';
  const isRunning = !isHeadline && now >= evTs;

  const evidence: string[] = [];
  let releaseScore = 0;
  let preTextScore = 0;
  let postTextScore = 0;
  let basis = 'MODEL BIAS';

  // 1. Numeric calendar release surprise
  const numSup = numericSurpriseScore(ev, symbol);
  const hasActual = numSup.hasActual;
  if (numSup.score) {
    releaseScore += numSup.score;
    evidence.push(numSup.reason);
    if (hasActual) basis = 'RELEASE + MODEL';
  } else if (input.impact && sideVal(input.impact.side || input.impact.direction)) {
    const impW = hasActual ? 5 : 2.5;
    releaseScore += sideVal(input.impact.side || input.impact.direction) * impW;
    evidence.push(input.impact.reason || 'Market-specific event effect');
    if (hasActual) basis = 'RELEASE + MODEL';
  }

  // 2. Event's own headline / excerpt analysis
  const evTextRes = analyzeFinancialText(`${ev.title || ev.event || ''} ${ev.description || ''}`, symbol, ev.currency || ev.country || '');
  if (evTextRes.score) {
    const ownW = evTextRes.score * 1.4;
    if (evTs >= now - 1800) postTextScore += ownW;
    else preTextScore += ownW;
    evidence.push('Event text' + (evTextRes.reasonTags.length ? ` (${evTextRes.reasonTags.join(', ')})` : ''));
  }

  // 3. Related headlines with sharp 90-minute half-life & post-event breaking wire priority
  const evTitle = String(ev.title || ev.event || '');
  const evTitleLower = evTitle.toLowerCase();
  const evMask = getTopicMask(evTitleLower);
  const seen = new Set<string>();
  const related: Array<{ title: string; source: string; ts: number }> = [];
  let ctxPre = 0;
  let ctxPost = 0;

  const srcHeadlines = input.headlinesPreSorted
    ? input.headlines || []
    : (input.headlines || [])
        .filter((h) => h && Number(h.ts) <= now && Number(h.ts) >= now - 86400)
        .sort((a, b) => Number(b.ts) - Number(a.ts));

  for (let hi = 0; hi < srcHeadlines.length && related.length < 40; hi++) {
    const h = srcHeadlines[hi];
    if (!h) continue;
    const hTs = Number(h.ts) || 0;
    if (input.headlinesPreSorted && (hTs > now || hTs < now - 86400)) continue;
    const hTitle = String(h.title || '');
    const key = h._titleLower || hTitle.toLowerCase();
    if (!key || seen.has(key) || key === evTitleLower || isMacroNoiseHeadline(hTitle)) continue;
    if (evMask !== 0 && (evMask & getTopicMask(key)) === 0) continue;
    seen.add(key);

    let hScore: number;
    if (h._bias !== undefined && typeof h._bias === 'number') {
      hScore = h._bias;
    } else {
      let hMap = HEADLINE_SCORE_CACHE.get(h);
      const cachedScore = hMap?.get(symBase);
      if (cachedScore !== undefined) {
        hScore = cachedScore;
      } else {
        const computed = analyzeFinancialText(`${hTitle} ${h.description || ''}`, symbol, h.currency || h.country || '').score;
        hScore = computed;
        if (!hMap) {
          hMap = new Map<string, number>();
          HEADLINE_SCORE_CACHE.set(h, hMap);
        }
        hMap.set(symBase, hScore);
      }
    }
    if (hScore) {
      // Sharp 90-minute half-life (5400s): 10h-old morning headlines decay to ~0.01 weight
      const decay = Math.exp(-Math.max(0, now - hTs) / 5400);
      const isPostEv = isRunning && hTs >= evTs - 600;
      const contrib = hScore * decay * (isPostEv ? 2.4 : 0.9);
      if (isPostEv) ctxPost += contrib;
      else ctxPre += contrib;
      related.push({ title: hTitle, source: String(h.source || ''), ts: hTs });
    }
  }
  preTextScore += clampNum(ctxPre, 1.8);
  postTextScore += clampNum(ctxPost, 2.8);
  if (related.length) evidence.push(`${related.length} recent headline(s)`);

  // 4. Live M5 price reaction since evTs & intraday SwingAI M5/M15 momentum (NO 24h daily change!)
  const m5Atr = market && canonicalNewsBase(market.symbol) === symBase && market.fresh && market.reads?.M5
    ? Number(market.reads.M5.atr) || 0
    : 0;
  const freshQ =
    q && canonicalNewsBase(q.symbol) === symBase && now * 1000 - Number(q.at) <= 15000 && Number(q.at) <= now * 1000 + 5000 && Number(q.price) > 0
      ? q
      : null;
  const livePx = freshQ ? Number(freshQ.price) : undefined;
  const rx = computePostEventReaction(input.barsM5, evTs, now, livePx, m5Atr);
  const dxyRx = computePostEventReaction(input.dxyBarsM5, evTs, now);

  let reactionScore = 0;
  let structureScore = 0;

  if (market && canonicalNewsBase(market.symbol) === symBase && market.fresh && market.reads) {
    // Intraday M5 + M15 alignment carries intraday truth during news, scaled modestly
    const s5 = Number(market.reads.M5?.score || 0);
    const s15 = Number(market.reads.M15?.score || 0);
    const vScore = Number(market.vote?.score || 0);
    const ltf = (s5 + s15) * 0.35 + vScore * 0.04;
    if (Math.abs(ltf) >= 0.25) {
      structureScore = clampNum(ltf, 1.5);
      evidence.push('Live M5/M15 structure');
    }
  }

  if (rx.ready) {
    if (isRunning && rx.elapsedSec >= 45 && (Math.abs(rx.evMoveAtr) >= 0.35 || Math.abs(rx.impulse15mAtr) >= 0.5)) {
      const rxRaw = rx.evMoveAtr * 2.1 + rx.impulse15mAtr * 1.1 + rx.slopeAtr * 0.6;
      const rxCap = !hasActual ? 5.6 : 2.6;
      reactionScore = clampNum(rxRaw, rxCap);
      evidence.push(
        `Live reaction ${rx.evMoveAtr >= 0 ? '+' : ''}${rx.evMoveAtr.toFixed(2)} ATR (${rx.evMoveAbs >= 0 ? '+' : ''}${rx.evMoveAbs.toFixed(rx.atr >= 1 ? 2 : 4)})`,
      );
    } else if (!isRunning && Math.abs(rx.impulse30mAtr) >= 0.45) {
      reactionScore = clampNum(rx.impulse30mAtr * 1.15 + rx.slopeAtr * 0.5, 1.6);
      evidence.push(`Intraday 30m impulse (${rx.impulse30mAtr >= 0 ? '+' : ''}${rx.impulse30mAtr.toFixed(2)} ATR)`);
    }
  }

  if (dxyRx.ready && Math.abs(dxyRx.evMoveAtr || dxyRx.impulse15mAtr) >= 0.45) {
    const usdSign = newsCurrencySign(symbol, 'USD');
    if (usdSign !== 0) {
      const dMove = isRunning ? dxyRx.evMoveAtr : dxyRx.impulse30mAtr;
      reactionScore += clampNum(signNum(dMove) * Math.min(1.4, Math.abs(dMove)) * usdSign, 1.4);
      evidence.push('Intraday DXY reaction');
    }
  }

  // Combine directional drivers
  const fundAndTextScore = releaseScore + postTextScore + preTextScore;
  let totalScore = fundAndTextScore + reactionScore + structureScore;
  let conflict = false;

  // 5. ZERO-MISTAKE CONFLICT & PRE-EVENT GUARD
  const isSpeechOrQualitative =
    !isHeadline &&
    !hasActual &&
    /\b(speaks?|speech|remarks|testimony|press conference|minutes|statement|meeting)\b/i.test(evTitleLower);

  const reactionMove = isRunning ? rx.evMoveAtr : rx.impulse15mAtr;
  const strongRxUp = rx.ready && (reactionMove >= 0.55 || rx.impulse15mAtr >= 0.68);
  const strongRxDown = rx.ready && (reactionMove <= -0.55 || rx.impulse15mAtr <= -0.68);
  const rxSide: 'BUY' | 'SELL' | '' = strongRxUp ? 'BUY' : strongRxDown ? 'SELL' : '';
  const textModelSide: 'BUY' | 'SELL' | '' =
    fundAndTextScore >= 0.35 ? 'BUY' : fundAndTextScore <= -0.35 ? 'SELL' : '';

  let side: 'BUY' | 'SELL' | 'WAIT' = 'WAIT';

  if (isRunning && rxSide && textModelSide && rxSide !== textModelSide) {
    // Live market broke strongly opposite to text/model! Never blindly counter-trade FOMC spikes.
    if (!hasActual && (Math.abs(postTextScore) < 1.8 || Math.sign(postTextScore) === (rxSide === 'BUY' ? 1 : -1))) {
      // Stale/ambiguous pre-speech bias contradicted by strong real post-event breakout -> follow live reaction!
      totalScore = rxSide === 'BUY' ? Math.max(2.6, Math.abs(reactionScore)) : -Math.max(2.6, Math.abs(reactionScore));
      side = rxSide;
      basis = 'POST-EVENT REACTION';
      evidence.unshift(`Market broke ${rxSide === 'BUY' ? 'UP' : 'DOWN'} post-news (+${Math.abs(reactionMove).toFixed(2)} ATR) — overriding stale pre-event text`);
    } else {
      // Genuine severe clash between strong release/breaking headlines and opposite live price -> WAIT!
      conflict = true;
      side = 'WAIT';
      basis = 'CONFLICT · WAIT';
      evidence.unshift(`CONFLICT: News leans ${textModelSide} while live price moved ${rxSide === 'BUY' ? 'UP' : 'DOWN'} (${reactionMove >= 0 ? '+' : ''}${reactionMove.toFixed(2)} ATR) — wait for alignment`);
    }
  } else if (!isRunning && isSpeechOrQualitative && !hasActual && Math.abs(totalScore) < 2.2 && !Math.abs(releaseScore)) {
    // Pre-speech with no numeric actual and weak/mixed clues -> do not manufacture a fake trade signal!
    side = 'WAIT';
    basis = 'PENDING SPEECH';
    evidence.push('Pre-speech neutral — wait for remarks & live M5 breakout');
  } else if (Math.abs(totalScore) >= 0.55) {
    side = totalScore > 0 ? 'BUY' : 'SELL';
    if (isRunning && !hasActual && rxSide === side) basis = 'REACTION + MODEL';
  } else {
    side = 'WAIT';
    basis = 'MIXED · WAIT';
  }

  if (!evidence.length) return null;

  const pred = input.prediction || {};
  const atr = rx.atr || m5Atr;
  let move = Math.abs(Number(pred.move_abs != null ? pred.move_abs : pred.move_dollar) || 0);
  if (!move && atr) move = atr * ({ high: 3, medium: 2, low: 1.25 }[String(ev.impact || 'low')] || 1.25);

  const absScore = Math.abs(totalScore);
  const strength =
    side === 'WAIT'
      ? Math.min(48, Math.round(24 + absScore * 6))
      : Math.min(92, Math.round(32 + absScore * 9));

  return {
    market: symbol,
    side,
    direction: side === 'BUY' ? 'UP' : side === 'SELL' ? 'DOWN' : 'WAIT',
    move_abs: move,
    strength,
    score: Number(totalScore.toFixed(2)),
    basis,
    conflict,
    hasActual,
    reactionAtr: Number(reactionMove.toFixed(2)),
    reason: evidence.join(' · '),
    related: related.slice(0, 4),
    at: now * 1000,
  };
}
