/// <reference lib="webworker" />

import { detectSmartMoney, type CandleRow, type SmcZone } from '../modules/smc-core';
import {
  analyzeFinancialText,
  estimateNewsDirection,
  isMacroNoiseHeadline,
} from '../modules/news-analyzer-core';

export type { CandleRow, SmcZone };

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
  barsM5?: number[][];
  dxyBarsM5?: number[][];
  items: NewsEstimateInput[];
}

export interface SmcRequest {
  id: number;
  type: 'detect-smc';
  symbol: string;
  price: number;
  nowMs: number;
  frames: Record<string, CandleRow[] | undefined>;
}

type WorkerRequest = SmcRequest | NewsBatchRequest;

/** Batch-estimate directional biases for calendar & headline items off-thread using shared analyzer core. */
function estimateNewsBatch(req: NewsBatchRequest) {
  const { symbol, now, quote, market, barsM5, dxyBarsM5 } = req;
  const preScoredHeadlines = (req.headlines || [])
    .filter((h) => h && Number(h.ts) <= now && Number(h.ts) >= now - 86400 && !isMacroNoiseHeadline(String(h.title || '')))
    .sort((a, b) => Number(b.ts) - Number(a.ts))
    .map((h) => {
      const titleLower = String(h.title || '').toLowerCase();
      const bias = analyzeFinancialText(`${h.title || ''} ${h.description || ''}`, symbol, h.currency || h.country || '').score;
      return { ...h, _titleLower: titleLower, _bias: bias };
    });

  const out: Record<string, any> = {};
  for (const item of req.items) {
    out[item.key] = estimateNewsDirection({
      symbol,
      event: item.event,
      impact: item.impact,
      prediction: item.prediction,
      quote,
      market,
      now,
      headlines: preScoredHeadlines,
      headlinesPreSorted: true,
      barsM5,
      dxyBarsM5,
    });
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
