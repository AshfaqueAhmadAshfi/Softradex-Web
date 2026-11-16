import type { CandleRow, NewsEstimateInput, SmcZone } from './calc-worker';

type WorkerResponse =
  | { id: number; ok: true; type: 'detect-smc'; symbol: string; smcZones: { buy: SmcZone[]; sell: SmcZone[] } }
  | { id: number; ok: true; type: 'estimate-news'; symbol: string; estimates: Record<string, any> }
  | { id: number; ok: false; error: string };

let sharedWorker: Worker | null = null;
let workerFailed = false;
let nextReqId = 1;
const pending = new Map<number, { resolve: (val: any) => void; reject: (err: Error) => void }>();

function getWorker(): Worker | null {
  if (workerFailed || typeof Worker === 'undefined') return null;
  if (sharedWorker) return sharedWorker;
  try {
    sharedWorker = new Worker(new URL('./calc-worker.ts', import.meta.url), { type: 'module' });
    sharedWorker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const data = ev.data;
      if (!data) return;
      const entry = pending.get(data.id);
      if (!entry) return;
      pending.delete(data.id);
      if (data.ok) entry.resolve(data);
      else entry.reject(new Error(('error' in data ? data.error : '') || 'Worker computation failed'));
    };
    sharedWorker.onerror = () => {
      workerFailed = true;
      for (const [, entry] of pending) entry.reject(new Error('Worker failed'));
      pending.clear();
      sharedWorker = null;
    };
    return sharedWorker;
  } catch {
    workerFailed = true;
    return null;
  }
}

function callWorker<T>(payload: Record<string, any>): Promise<T> {
  const w = getWorker();
  if (!w) return Promise.reject(new Error('Worker unavailable'));
  const id = nextReqId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ ...payload, id });
  });
}

/** Offload multi-timeframe SMC zone detection to the dedicated Web Worker. */
export function detectSmcInWorker(
  symbol: string,
  frames: Record<string, CandleRow[] | undefined>,
  price: number,
  nowMs: number,
): Promise<{ symbol: string; smcZones: { buy: SmcZone[]; sell: SmcZone[] } }> {
  return callWorker({ type: 'detect-smc', symbol, frames, price, nowMs });
}

/** Offload batch news directional bias scoring to the dedicated Web Worker. */
export function estimateNewsInWorker(input: {
  symbol: string;
  now: number;
  quote: Record<string, any> | null;
  market: Record<string, any> | null;
  headlines: Record<string, any>[];
  items: NewsEstimateInput[];
}): Promise<{ symbol: string; estimates: Record<string, any> }> {
  return callWorker({ type: 'estimate-news', ...input });
}

/** Attach global worker bridge so non-ESM legacy modules can offload heavy work seamlessly. */
export function installWorkerBridge(): void {
  (window as any).SoftCalcWorker = {
    detectSmc: detectSmcInWorker,
    estimateNews: estimateNewsInWorker,
    available: () => !workerFailed && typeof Worker !== 'undefined',
  };
}
