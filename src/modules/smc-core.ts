export interface CandleRow extends Array<number> {}

export interface SmcZone {
  id: string;
  side: 'buy' | 'sell';
  kind: string;
  tf: string;
  weight: number;
  accuracy: number;
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

interface NormalizedFrame {
  bars: CandleRow[];
  scale: number;
}

export function barTime(v: number): number {
  const n = Number(v);
  return n < 1e11 ? n * 1000 : n;
}

export function barsFor(rows: CandleRow[] | undefined, duration: number, nowMs: number): CandleRow[] {
  const cutoff = Number(nowMs) || Date.now();
  const byTime = new Map<number, CandleRow>();
  for (const b of rows || []) {
    if (!Array.isArray(b) || b.length < 5) continue;
    const t = barTime(b[0]);
    if (t + duration > cutoff) continue;
    if (
      Number.isFinite(Number(b[1])) && Number(b[1]) > 0 &&
      Number.isFinite(Number(b[2])) && Number(b[2]) > 0 &&
      Number.isFinite(Number(b[3])) && Number(b[3]) > 0 &&
      Number.isFinite(Number(b[4])) && Number(b[4]) > 0
    ) {
      byTime.set(t, b);
    }
  }
  return [...byTime.entries()]
    .sort((a, b) => a[0] - b[0])
    .map((entry) => entry[1]);
}

export function atrOf(bars: CandleRow[]): number {
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

function frameScale(bars: CandleRow[], livePrice: number): number {
  if (!bars.length) return 1;
  const lastClose = Number(bars[bars.length - 1][4]);
  if (!(lastClose > 0)) return 1;
  const mismatch = Math.abs(livePrice - lastClose) / lastClose;
  return mismatch > 0.08 ? livePrice / lastClose : 1;
}

function makeZoneChecker(bars: CandleRow[], scale: number, tfDuration: number, m5: NormalizedFrame | null) {
  const lastClosedTfEnd = bars.length ? barTime(bars[bars.length - 1][0]) + tfDuration : 0;
  const m5LastClose = m5 && m5.bars.length ? barTime(m5.bars[m5.bars.length - 1][0]) + 300000 : 0;
  return {
    /**
     * True if any completed bar on same TF (>= startIdx) or intra-hour closed M5 bar
     * (after both the pattern close and the last closed bar of this TF) breaches predicate.
     */
    anyBarAfter(startIdx: number, patCloseTs: number, pred: (low: number, high: number, isOlder: boolean) => boolean): boolean {
      for (let k = startIdx; k < bars.length; k++) {
        const low = Number(bars[k][3]) * scale;
        const high = Number(bars[k][2]) * scale;
        if (pred(low, high, k < bars.length - 1)) return true;
      }
      if (m5 && tfDuration > 300000) {
        const m5AfterTs = Math.max(patCloseTs, lastClosedTfEnd);
        const s = m5.scale;
        for (let m = 0; m < m5.bars.length; m++) {
          const mb = m5.bars[m];
          const closeTs = barTime(mb[0]) + 300000;
          if (closeTs <= m5AfterTs) continue;
          const low = Number(mb[3]) * s;
          const high = Number(mb[2]) * s;
          if (pred(low, high, closeTs < m5LastClose)) return true;
        }
      }
      return false;
    },
  };
}

function frameTrendBias(bars: CandleRow[], scale: number): -1 | 0 | 1 {
  if (!bars || bars.length < 22) return 0;
  const k9 = 2 / 10;
  const k21 = 2 / 22;
  let ema9 = Number(bars[0][4]) * scale;
  let ema21 = ema9;
  for (let i = 1; i < bars.length; i++) {
    const c = Number(bars[i][4]) * scale;
    ema9 = c * k9 + ema9 * (1 - k9);
    ema21 = c * k21 + ema21 * (1 - k21);
  }
  const lastClose = Number(bars[bars.length - 1][4]) * scale;
  if (lastClose > ema21 && ema9 > ema21) return 1;
  if (lastClose < ema21 && ema9 < ema21) return -1;
  return 0;
}

function scoreZoneAccuracy(params: {
  base: number;
  tfKey: string;
  side: 'buy' | 'sell';
  impulseBoost: number;
  barsAgo: number;
  pristine: boolean;
  m15Bias: -1 | 0 | 1;
  h1Bias: -1 | 0 | 1;
}): number {
  const tfBoost = params.tfKey === 'H1' ? 14 : params.tfKey === 'M15' ? 8 : 0;
  const freshBoost = params.barsAgo <= 10 ? 6 : params.barsAgo <= 24 ? 3 : params.barsAgo > 42 ? -4 : 0;
  const virginBoost = params.pristine ? 4 : -3;
  const dir = params.side === 'buy' ? 1 : -1;
  const h1Adj = params.h1Bias === 0 ? 0 : params.h1Bias === dir ? 7 : -8;
  const m15Adj = params.m15Bias === 0 ? 0 : params.m15Bias === dir ? 5 : -4;
  return Math.round(Math.max(15, Math.min(95, params.base + tfBoost + params.impulseBoost + freshBoost + virginBoost + h1Adj + m15Adj)));
}

/**
 * Detect unmitigated Bullish/Bearish Fair Value Gaps (FVG), Order Blocks (OB),
 * and chronologically valid Fibonacci OTE (61.8% - 70.5%) entry zones across M5 / M15 / H1.
 * Only zones strictly above `minAccuracy` (default 60%) are returned.
 */
export function detectSmartMoney(
  frames: Record<string, CandleRow[] | undefined> | undefined,
  livePrice: number,
  nowMs: number,
  minAccuracy = 60,
): { buy: SmcZone[]; sell: SmcZone[] } {
  const price = Number(livePrice);
  if (!(price > 0) || !frames) return { buy: [], sell: [] };

  const tfDefs = [
    { key: 'M5', duration: 300000, weight: 1 },
    { key: 'M15', duration: 900000, weight: 2 },
    { key: 'H1', duration: 3600000, weight: 3 },
  ];

  const m5Raw = barsFor(frames.M5, 300000, nowMs);
  const m5Ctx: NormalizedFrame | null = m5Raw.length >= 15
    ? { bars: m5Raw, scale: frameScale(m5Raw, price) }
    : null;
  const m15Raw = barsFor(frames.M15, 900000, nowMs);
  const h1Raw = barsFor(frames.H1, 3600000, nowMs);
  const m15Bias = m15Raw.length >= 22 ? frameTrendBias(m15Raw, frameScale(m15Raw, price)) : 0;
  const h1Bias = h1Raw.length >= 22 ? frameTrendBias(h1Raw, frameScale(h1Raw, price)) : 0;

  const candidates: SmcZone[] = [];

  for (const tf of tfDefs) {
    const bars = tf.key === 'M5' && m5Ctx ? m5Ctx.bars
      : tf.key === 'M15' ? m15Raw
      : tf.key === 'H1' ? h1Raw
      : barsFor(frames[tf.key], tf.duration, nowMs);
    if (bars.length < 15) continue;
    const scale = tf.key === 'M5' && m5Ctx ? m5Ctx.scale : frameScale(bars, price);
    const a = atrOf(bars) * scale;
    if (!(a > 0)) continue;

    const checker = makeZoneChecker(bars, scale, tf.duration, tf.key === 'M5' ? null : m5Ctx);
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
      const patCloseTs = barTime(bNext[0]) + tf.duration;
      const range = high - low;
      const bodyRatio = range > 0 ? Math.abs(close - open) / range : 0;

      // 1. Fair Value Gaps (3-candle ICT imbalance).
      const bullGap = nextLow - prevHigh;
      if (nextLow > prevHigh && bullGap >= a * 0.12 && (close > open || bullGap >= a * 0.2)) {
        const entry = prevHigh + bullGap * 0.5;
        if (prevHigh < price && (entry <= price || price <= nextLow)) {
          const mitigated = checker.anyBarAfter(i + 2, patCloseTs, (l, _h, isOlder) =>
            l <= prevHigh || (isOlder && l <= prevHigh + bullGap * 0.25 && price > nextLow),
          );
          if (!mitigated) {
            const pristine = !checker.anyBarAfter(i + 2, patCloseTs, (l) => l < nextLow);
            const gapAtr = bullGap / a;
            const impulseBoost = (gapAtr >= 0.55 ? 11 : gapAtr >= 0.30 ? 7 : gapAtr >= 0.18 ? 3 : 0) +
              (close > open && bodyRatio >= 0.55 ? 4 : 0);
            const accuracy = scoreZoneAccuracy({
              base: 43,
              tfKey: tf.key,
              side: 'buy',
              impulseBoost,
              barsAgo: bars.length - 1 - i,
              pristine,
              m15Bias,
              h1Bias,
            });
            const stop = Math.min(prevLow, prevHigh - a * 0.35);
            const risk = Math.max(a * 0.4, entry - stop);
            candidates.push({
              id: `${tf.key}:BU-FVG:${barTime(b[0])}`,
              side: 'buy',
              kind: 'BU-FVG',
              tf: tf.key,
              weight: tf.weight,
              accuracy,
              entry,
              zoneLow: prevHigh,
              zoneHigh: nextLow,
              stop: entry - risk,
              tp1: entry + risk * 1.5,
              tp2: entry + risk * 2.5,
              band: a * 0.22,
              time: barTime(b[0]),
              note: `${tf.key} Bullish Fair Value Gap (unfilled 3-bar displacement imbalance)`,
            });
          }
        }
      }

      const bearGap = prevLow - nextHigh;
      if (nextHigh < prevLow && bearGap >= a * 0.12 && (close < open || bearGap >= a * 0.2)) {
        const entry = prevLow - bearGap * 0.5;
        if (prevLow > price && (entry >= price || price >= nextHigh)) {
          const mitigated = checker.anyBarAfter(i + 2, patCloseTs, (_l, h, isOlder) =>
            h >= prevLow || (isOlder && h >= prevLow - bearGap * 0.25 && price < nextHigh),
          );
          if (!mitigated) {
            const pristine = !checker.anyBarAfter(i + 2, patCloseTs, (_l, h) => h > nextHigh);
            const gapAtr = bearGap / a;
            const impulseBoost = (gapAtr >= 0.55 ? 11 : gapAtr >= 0.30 ? 7 : gapAtr >= 0.18 ? 3 : 0) +
              (close < open && bodyRatio >= 0.55 ? 4 : 0);
            const accuracy = scoreZoneAccuracy({
              base: 43,
              tfKey: tf.key,
              side: 'sell',
              impulseBoost,
              barsAgo: bars.length - 1 - i,
              pristine,
              m15Bias,
              h1Bias,
            });
            const stop = Math.max(prevHigh, prevLow + a * 0.35);
            const risk = Math.max(a * 0.4, stop - entry);
            candidates.push({
              id: `${tf.key}:BE-FVG:${barTime(b[0])}`,
              side: 'sell',
              kind: 'BE-FVG',
              tf: tf.key,
              weight: tf.weight,
              accuracy,
              entry,
              zoneLow: nextHigh,
              zoneHigh: prevLow,
              stop: entry + risk,
              tp1: entry - risk * 1.5,
              tp2: entry - risk * 2.5,
              band: a * 0.22,
              time: barTime(b[0]),
              note: `${tf.key} Bearish Fair Value Gap (unfilled 3-bar supply imbalance)`,
            });
          }
        }
      }

      // 2. Order Blocks (last opposing candle before displacement + 3-bar swing structure break).
      if (range < a * 0.08) continue;

      let priorHigh = -Infinity;
      let priorLow = Infinity;
      const priorStart = Math.max(0, i - 3);
      for (let pr = priorStart; pr < i; pr++) {
        const ph = Number(bars[pr][2]) * scale;
        const pl = Number(bars[pr][3]) * scale;
        if (ph > priorHigh) priorHigh = ph;
        if (pl < priorLow) priorLow = pl;
      }

      const laEnd = Math.min(bars.length - 1, i + 3);
      let bosBuyIdx = -1;
      let bosSellIdx = -1;
      let maxAfterClose = -Infinity;
      let minAfterClose = Infinity;
      for (let la = i + 1; la <= laEnd; la++) {
        const cv = Number(bars[la][4]) * scale;
        if (cv > maxAfterClose) maxAfterClose = cv;
        if (cv < minAfterClose) minAfterClose = cv;
        if (bosBuyIdx === -1 && cv > priorHigh && maxAfterClose - low >= a * 0.85) bosBuyIdx = la;
        if (bosSellIdx === -1 && cv < priorLow && high - minAfterClose >= a * 0.85) bosSellIdx = la;
      }

      // 2a. Bullish OB: down-close candle followed by bullish BOS above prior swing high.
      if (close < open && bosBuyIdx > i) {
        const entry = (low + high) * 0.5;
        if (low < price && (entry <= price || price <= high)) {
          let brokenEarly = false;
          for (let k = i + 1; k <= bosBuyIdx; k++) {
            if (Number(bars[k][3]) * scale < low) { brokenEarly = true; break; }
          }
          const bosCloseTs = barTime(bars[bosBuyIdx][0]) + tf.duration;
          const mitigated = brokenEarly || checker.anyBarAfter(bosBuyIdx + 1, bosCloseTs, (l, _h, isOlder) =>
            l < low || (isOlder && l <= low + range * 0.25 && price > high),
          );
          if (!mitigated) {
            const pristine = !checker.anyBarAfter(bosBuyIdx + 1, bosCloseTs, (l) => l < high);
            const bosAtr = (maxAfterClose - low) / a;
            const impulseBoost = (bosAtr >= 1.8 ? 11 : bosAtr >= 1.2 ? 7 : 3) + (bodyRatio >= 0.45 ? 4 : 0);
            const accuracy = scoreZoneAccuracy({
              base: 48,
              tfKey: tf.key,
              side: 'buy',
              impulseBoost,
              barsAgo: bars.length - 1 - i,
              pristine,
              m15Bias,
              h1Bias,
            });
            const stop = low - a * 0.25;
            const risk = Math.max(a * 0.45, entry - stop);
            candidates.push({
              id: `${tf.key}:BU-OB:${barTime(b[0])}`,
              side: 'buy',
              kind: 'BU-OB',
              tf: tf.key,
              weight: tf.weight + 1,
              accuracy,
              entry,
              zoneLow: low,
              zoneHigh: high,
              stop: entry - risk,
              tp1: entry + risk * 1.5,
              tp2: entry + risk * 2.5,
              band: a * 0.25,
              time: barTime(b[0]),
              note: `${tf.key} Bullish Order Block (unmitigated institutional demand before BOS)`,
            });
          }
        }
      }

      // 2b. Bearish OB: up-close candle followed by bearish BOS below prior swing low.
      if (close > open && bosSellIdx > i) {
        const entry = (low + high) * 0.5;
        if (high > price && (entry >= price || price >= low)) {
          let brokenEarly = false;
          for (let k = i + 1; k <= bosSellIdx; k++) {
            if (Number(bars[k][2]) * scale > high) { brokenEarly = true; break; }
          }
          const bosCloseTs = barTime(bars[bosSellIdx][0]) + tf.duration;
          const mitigated = brokenEarly || checker.anyBarAfter(bosSellIdx + 1, bosCloseTs, (_l, h, isOlder) =>
            h > high || (isOlder && h >= high - range * 0.25 && price < low),
          );
          if (!mitigated) {
            const pristine = !checker.anyBarAfter(bosSellIdx + 1, bosCloseTs, (_l, h) => h > low);
            const bosAtr = (high - minAfterClose) / a;
            const impulseBoost = (bosAtr >= 1.8 ? 11 : bosAtr >= 1.2 ? 7 : 3) + (bodyRatio >= 0.45 ? 4 : 0);
            const accuracy = scoreZoneAccuracy({
              base: 48,
              tfKey: tf.key,
              side: 'sell',
              impulseBoost,
              barsAgo: bars.length - 1 - i,
              pristine,
              m15Bias,
              h1Bias,
            });
            const stop = high + a * 0.25;
            const risk = Math.max(a * 0.45, stop - entry);
            candidates.push({
              id: `${tf.key}:BE-OB:${barTime(b[0])}`,
              side: 'sell',
              kind: 'BE-OB',
              tf: tf.key,
              weight: tf.weight + 1,
              accuracy,
              entry,
              zoneLow: low,
              zoneHigh: high,
              stop: entry + risk,
              tp1: entry - risk * 1.5,
              tp2: entry - risk * 2.5,
              band: a * 0.25,
              time: barTime(b[0]),
              note: `${tf.key} Bearish Order Block (unmitigated institutional supply before BOS)`,
            });
          }
        }
      }
    }

    // 3. Chronologically ordered Fibonacci Golden Pocket OTE (61.8% - 70.5%).
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
      const spanAtr = span / a;
      const oteImpulse = spanAtr >= 2.8 ? 9 : spanAtr >= 2.0 ? 5 : 2;
      if (loIdx < hiIdx && hiIdx - loIdx >= 2) {
        const oteBuy618 = swingHi - span * 0.618;
        const oteBuy705 = swingHi - span * 0.705;
        const hiTs = barTime(bars[hiIdx][0]) + tf.duration;
        if (swingLo < price && (oteBuy618 <= price || price <= swingHi)) {
          const invalidOte = checker.anyBarAfter(hiIdx + 1, hiTs, (l, _h, isOlder) =>
            l <= swingLo || (isOlder && l <= oteBuy705 && price > swingHi - span * 0.35),
          );
          if (!invalidOte) {
            const pristine = !checker.anyBarAfter(hiIdx + 1, hiTs, (l) => l < oteBuy618);
            const accuracy = scoreZoneAccuracy({
              base: 40,
              tfKey: tf.key,
              side: 'buy',
              impulseBoost: oteImpulse,
              barsAgo: bars.length - 1 - hiIdx,
              pristine,
              m15Bias,
              h1Bias,
            });
            const risk = Math.max(a * 0.5, oteBuy618 - (swingLo - a * 0.15));
            candidates.push({
              id: `${tf.key}:BU-OTE:${barTime(bars[loIdx][0])}`,
              side: 'buy',
              kind: 'OTE 61.8%',
              tf: tf.key,
              weight: tf.weight,
              accuracy,
              entry: oteBuy618,
              zoneLow: oteBuy705,
              zoneHigh: oteBuy618,
              stop: oteBuy618 - risk,
              tp1: oteBuy618 + risk * 1.5,
              tp2: Math.max(swingHi, oteBuy618 + risk * 2.5),
              band: a * 0.2,
              time: barTime(bars[loIdx][0]),
              note: `${tf.key} Golden Pocket OTE (61.8%–70.5% Fibonacci discount pullback)`,
            });
          }
        }
      } else if (hiIdx < loIdx && loIdx - hiIdx >= 2) {
        const oteSell618 = swingLo + span * 0.618;
        const oteSell705 = swingLo + span * 0.705;
        const loTs = barTime(bars[loIdx][0]) + tf.duration;
        if (swingHi > price && (oteSell618 >= price || price >= swingLo)) {
          const invalidOte = checker.anyBarAfter(loIdx + 1, loTs, (_l, h, isOlder) =>
            h >= swingHi || (isOlder && h >= oteSell705 && price < swingLo + span * 0.35),
          );
          if (!invalidOte) {
            const pristine = !checker.anyBarAfter(loIdx + 1, loTs, (_l, h) => h > oteSell618);
            const accuracy = scoreZoneAccuracy({
              base: 40,
              tfKey: tf.key,
              side: 'sell',
              impulseBoost: oteImpulse,
              barsAgo: bars.length - 1 - loIdx,
              pristine,
              m15Bias,
              h1Bias,
            });
            const risk = Math.max(a * 0.5, swingHi + a * 0.15 - oteSell618);
            candidates.push({
              id: `${tf.key}:BE-OTE:${barTime(bars[hiIdx][0])}`,
              side: 'sell',
              kind: 'OTE 61.8%',
              tf: tf.key,
              weight: tf.weight,
              accuracy,
              entry: oteSell618,
              zoneLow: oteSell618,
              zoneHigh: oteSell705,
              stop: oteSell618 + risk,
              tp1: oteSell618 - risk * 1.5,
              tp2: Math.min(swingLo, oteSell618 - risk * 2.5),
              band: a * 0.2,
              time: barTime(bars[hiIdx][0]),
              note: `${tf.key} Golden Pocket OTE (61.8%–70.5% Fibonacci premium rally)`,
            });
          }
        }
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
      const tol = Math.min(price * 0.0018, Math.max(c.band || 0, price * 0.0005));
      if (!cur || Math.abs(c.entry - cur.entry) > tol) {
        groups.push({ ...c, count: 1, tags: [`${c.kind} · ${c.tf}`] });
        continue;
      }
      const prevWeight = cur.weight;
      cur.count = (cur.count || 1) + 1;
      if (c.weight >= prevWeight) {
        cur.kind = c.kind;
        cur.tf = c.tf;
        cur.note = c.note;
      }
      cur.weight = prevWeight + c.weight;
      cur.accuracy = Math.max(cur.accuracy, c.accuracy);
      cur.entry = (cur.entry * prevWeight + c.entry * c.weight) / cur.weight;
      cur.zoneLow = Math.min(cur.zoneLow, c.zoneLow);
      cur.zoneHigh = Math.max(cur.zoneHigh, c.zoneHigh);
      cur.stop = side === 'buy' ? Math.min(cur.stop, c.stop) : Math.max(cur.stop, c.stop);
      const risk = Math.max(price * 0.00035, side === 'buy' ? cur.entry - cur.stop : cur.stop - cur.entry);
      cur.stop = side === 'buy' ? cur.entry - risk : cur.entry + risk;
      cur.tp1 = side === 'buy' ? cur.entry + risk * 1.5 : cur.entry - risk * 1.5;
      cur.tp2 = side === 'buy' ? cur.entry + risk * 2.5 : cur.entry - risk * 2.5;
      const tag = `${c.kind} · ${c.tf}`;
      if (!cur.tags!.includes(tag)) cur.tags!.push(tag);
    }
    return groups
      .map((g) => {
        const tags = g.tags || [];
        const tagText = tags.join(' ').toUpperCase();
        const tfs = new Set(tags.map((t) => t.split('·')[1]?.trim()).filter(Boolean));
        const hasOb = tagText.includes('OB');
        const hasFvg = tagText.includes('FVG');
        const hasOte = tagText.includes('OTE');
        const tfStackBonus = Math.min(16, Math.max(0, tfs.size - 1) * 8);
        const kindStackBonus = (hasOb && hasFvg ? 9 : 0) + (hasOte && (hasOb || hasFvg) ? 5 : 0);
        const accuracy = Math.round(Math.max(15, Math.min(97, g.accuracy + tfStackBonus + kindStackBonus)));
        const distPct = (Math.abs(price - g.entry) / price) * 100;
        const inZone = price >= g.zoneLow && price <= g.zoneHigh;
        const state = inZone ? 'IN ZONE' : distPct <= 0.35 ? 'NEAR' : 'READY';
        return { ...g, accuracy, distPct, state };
      })
      .filter((g) =>
        (side === 'buy' ? g.stop < g.entry && price > g.stop : g.stop > g.entry && price < g.stop) &&
        g.accuracy > minAccuracy,
      )
      .sort((a, b) => (a.distPct || 0) - (b.distPct || 0) || b.accuracy - a.accuracy || b.weight - a.weight)
      .slice(0, 6);
  }

  return {
    buy: mergeSide('buy'),
    sell: mergeSide('sell'),
  };
}
