// Dynamic circuit / wire-connection overlay linking every live analysis module inside
// #binance-term-workspace cleanly to the central .binance-chart-wrapper hub.

export interface WirePoint {
  x: number;
  y: number;
}

export interface WireRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
}

export interface WireSpec {
  id: string;
  label: string;
  side: 'left' | 'bottom' | 'right';
  chartPort: number;
  accentLight: string;
  accentDark: string;
  readStatus: () => { active: boolean; polarity: 'buy' | 'sell' | 'neutral' };
}

export interface WireRoute {
  id: string;
  label: string;
  points: WirePoint[];
  tributaries: WirePoint[][];
  srcPin: WirePoint;
  dstPin: WirePoint;
  junction?: WirePoint;
  accent: string;
  active: boolean;
  polarity: 'buy' | 'sell' | 'neutral';
}

interface WorkspaceWiresApi {
  refresh: () => void;
  triggerBurst: (id?: string) => void;
  getRoutes: () => WireRoute[];
  getLowerRoutes: () => WireRoute[];
}

declare global {
  interface Window {
    SoftradeXWorkspaceWires?: WorkspaceWiresApi;
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function parseCount(elId: string): number {
  const el = document.getElementById(elId);
  if (!el) return 0;
  const m = String(el.textContent || '').match(/\d+/);
  return m ? Number(m[0]) : 0;
}

function parseConfidence(elId: string): number {
  const el = document.getElementById(elId);
  if (!el) return 0;
  const m = String(el.textContent || '').match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? Number(m[1]) : 0;
}

function readPolarityFromText(elId: string): 'buy' | 'sell' | 'neutral' {
  const txt = String(document.getElementById(elId)?.textContent || '').toUpperCase();
  if (/\bBUY\b|\bBULL|\bUP\b|\bLONG\b/.test(txt) && !/\bNO\s+TRADE\b|\bWAIT\b|\bSCANNING\b/.test(txt)) return 'buy';
  if (/\bSELL\b|\bBEAR|\bDOWN\b|\bSHORT\b/.test(txt) && !/\bNO\s+TRADE\b|\bWAIT\b|\bSCANNING\b/.test(txt)) return 'sell';
  return 'neutral';
}

export const WORKSPACE_WIRE_SPECS: WireSpec[] = [
  {
    id: 'market-news-terminal',
    label: '24H NEWS',
    side: 'left',
    chartPort: 0.21,
    accentLight: '#0284c7',
    accentDark: '#38bdf8',
    readStatus: () => {
      const pol = readPolarityFromText('mnt-fixed-side');
      const count = parseCount('mnt-count');
      return { active: count > 0 || pol !== 'neutral', polarity: pol };
    }
  },
  {
    id: 'swing-ai-board',
    label: 'SELL SWING AI',
    side: 'left',
    chartPort: 0.56,
    accentLight: '#dc2626',
    accentDark: '#f87171',
    readStatus: () => {
      const conf = parseConfidence('sai-conf');
      const phase = String(document.getElementById('sai-phase-label')?.textContent || '').toUpperCase();
      const onChart = conf > 65 && phase !== 'NO TRADE' && phase !== 'WAIT';
      return { active: onChart || phase === 'RUNNING' || phase === 'ARMED', polarity: 'sell' };
    }
  },
  {
    id: 'smart-money-panel',
    label: 'SMART MONEY',
    side: 'left',
    chartPort: 0.87,
    accentLight: '#4f46e5',
    accentDark: '#818cf8',
    readStatus: () => {
      const buys = parseCount('smc-buy-count');
      const sells = parseCount('smc-sell-count');
      return {
        active: buys + sells > 0,
        polarity: buys > sells ? 'buy' : sells > buys ? 'sell' : 'neutral'
      };
    }
  },
  {
    id: 'stop-liquidity-panel',
    label: 'SL ZONES',
    side: 'bottom',
    chartPort: 0.17,
    accentLight: '#d97706',
    accentDark: '#fbbf24',
    readStatus: () => {
      const buys = parseCount('slz-buy-count');
      const sells = parseCount('slz-sell-count');
      return {
        active: buys + sells > 0,
        polarity: buys > sells ? 'buy' : sells > buys ? 'sell' : 'neutral'
      };
    }
  },
  {
    id: 'next-candle-panel',
    label: 'NEXT CANDLE AI',
    side: 'bottom',
    chartPort: 0.50,
    accentLight: '#7c3aed',
    accentDark: '#a78bfa',
    readStatus: () => {
      const pol = readPolarityFromText('ncp-verdict-badge');
      return { active: pol !== 'neutral', polarity: pol };
    }
  },
  {
    id: 'profit-radar-panel',
    label: 'PROFIT RADAR',
    side: 'bottom',
    chartPort: 0.83,
    accentLight: '#059669',
    accentDark: '#34d399',
    readStatus: () => {
      const pol = readPolarityFromText('prp-verdict');
      return { active: pol !== 'neutral', polarity: pol };
    }
  },
  {
    id: 'running-news-panel',
    label: 'RUNNING NEWS',
    side: 'right',
    chartPort: 0.21,
    accentLight: '#0284c7',
    accentDark: '#22d3ee',
    readStatus: () => {
      const txt = String(document.getElementById('rnews-count')?.textContent || '').toUpperCase();
      const rows = document.querySelectorAll('#running-news-list .mnt-row').length;
      const active = rows > 0 || (txt !== '' && txt !== 'SCANNING' && txt !== '0' && txt !== '0 ACTIVE');
      return { active, polarity: 'neutral' };
    }
  },
  {
    id: 'buy-swing-ai-board',
    label: 'BUY SWING AI',
    side: 'right',
    chartPort: 0.56,
    accentLight: '#059669',
    accentDark: '#34d399',
    readStatus: () => {
      const conf = parseConfidence('sbi-conf');
      const phase = String(document.getElementById('sbi-phase-label')?.textContent || '').toUpperCase();
      const onChart = conf > 65 && phase !== 'NO TRADE' && phase !== 'WAIT';
      return { active: onChart || phase === 'RUNNING' || phase === 'ARMED', polarity: 'buy' };
    }
  },
  {
    id: 'whale-positions-panel',
    label: 'WHALE POSITIONS',
    side: 'right',
    chartPort: 0.87,
    accentLight: '#2563eb',
    accentDark: '#60a5fa',
    readStatus: () => {
      const buys = parseCount('whp-buy-count');
      const sells = parseCount('whp-sell-count');
      return {
        active: buys + sells > 0,
        polarity: buys > sells ? 'buy' : sells > buys ? 'sell' : 'neutral'
      };
    }
  }
];

function clamp(val: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.max(min, Math.min(max, val));
}

function roundCoord(n: number): number {
  return Math.round(n * 10) / 10;
}

export function toWireRect(rect: { left: number; top: number; right: number; bottom: number; width: number; height: number }, origin: { left: number; top: number }): WireRect {
  const left = rect.left - origin.left;
  const top = rect.top - origin.top;
  const right = rect.right - origin.left;
  const bottom = rect.bottom - origin.top;
  return {
    left,
    top,
    right,
    bottom,
    width: rect.width,
    height: rect.height,
    cx: left + rect.width / 2,
    cy: top + rect.height / 2
  };
}

/** Remove duplicate and collinear waypoints, then render smooth rounded PCB corners. */
export function buildRoundedOrthogonalPath(rawPoints: WirePoint[], radius = 5): string {
  const dedup: WirePoint[] = [];
  for (const pt of rawPoints) {
    const last = dedup[dedup.length - 1];
    if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) >= 0.6) {
      dedup.push({ x: roundCoord(pt.x), y: roundCoord(pt.y) });
    }
  }
  if (dedup.length < 2) return '';

  const pts: WirePoint[] = [dedup[0]];
  for (let i = 1; i < dedup.length - 1; i++) {
    const prev = pts[pts.length - 1];
    const curr = dedup[i];
    const next = dedup[i + 1];
    const cross = (curr.x - prev.x) * (next.y - curr.y) - (curr.y - prev.y) * (next.x - curr.x);
    if (Math.abs(cross) > 0.5) pts.push(curr);
  }
  pts.push(dedup[dedup.length - 1]);

  if (pts.length === 2) {
    return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  }

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const vx1 = p1.x - p0.x;
    const vy1 = p1.y - p0.y;
    const vx2 = p2.x - p1.x;
    const vy2 = p2.y - p1.y;
    const len1 = Math.hypot(vx1, vy1);
    const len2 = Math.hypot(vx2, vy2);
    const r = Math.min(radius, len1 * 0.45, len2 * 0.45);
    if (r < 0.8 || len1 < 0.5 || len2 < 0.5) {
      d += ` L ${p1.x} ${p1.y}`;
      continue;
    }
    const ax = roundCoord(p1.x - (vx1 / len1) * r);
    const ay = roundCoord(p1.y - (vy1 / len1) * r);
    const bx = roundCoord(p1.x + (vx2 / len2) * r);
    const by = roundCoord(p1.y + (vy2 / len2) * r);
    d += ` L ${ax} ${ay} Q ${p1.x} ${p1.y} ${bx} ${by}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

export function computeWireRoute(
  spec: WireSpec,
  node: WireRect,
  chart: WireRect,
  wsWidth: number,
  isDark: boolean,
  trunkIndexLeft: number,
  trunkIndexRight: number
): WireRoute | null {
  if (node.width < 12 || node.height < 12 || chart.width < 20 || chart.height < 20) return null;

  const st = spec.readStatus();
  const accent = isDark ? spec.accentDark : spec.accentLight;
  const tributaries: WirePoint[][] = [];

  // Desktop Case 1: Left Rail adjacent or corner below-left of chart
  if (node.right <= chart.left + 2) {
    const gutterW = Math.max(8, chart.left - node.right);
    const laneX = node.right + gutterW * 0.5;
    const anchorOffset = spec.id === 'market-news-terminal'
      ? Math.min(92, node.height * 0.36)
      : spec.id === 'swing-ai-board'
        ? Math.min(136, node.height * 0.41)
        : 32;
    const sy = clamp(node.top + anchorOffset, node.top + 18, node.bottom - 18);
    const ty = clamp(chart.top + chart.height * spec.chartPort, chart.top + 28, chart.bottom - 26);

    const points: WirePoint[] = [
      { x: node.right, y: sy },
      { x: laneX, y: sy },
      { x: laneX, y: ty },
      { x: chart.left, y: ty }
    ];
    return {
      id: spec.id,
      label: spec.label,
      points,
      tributaries,
      srcPin: { x: node.right + 2.5, y: sy },
      dstPin: { x: chart.left - 2.5, y: ty },
      junction: Math.abs(sy - ty) > 10 ? { x: laneX, y: ty } : undefined,
      accent,
      active: st.active,
      polarity: st.polarity
    };
  }

  // Desktop Case 2: Right Rail adjacent or corner below-right of chart
  if (node.left >= chart.right - 2) {
    const gutterW = Math.max(8, node.left - chart.right);
    const laneX = chart.right + gutterW * 0.5;
    const anchorOffset = spec.id === 'running-news-panel'
      ? Math.min(92, node.height * 0.36)
      : spec.id === 'buy-swing-ai-board'
        ? Math.min(136, node.height * 0.41)
        : 32;
    const sy = clamp(node.top + anchorOffset, node.top + 18, node.bottom - 18);
    const ty = clamp(chart.top + chart.height * spec.chartPort, chart.top + 28, chart.bottom - 26);

    const points: WirePoint[] = [
      { x: node.left, y: sy },
      { x: laneX, y: sy },
      { x: laneX, y: ty },
      { x: chart.right, y: ty }
    ];
    return {
      id: spec.id,
      label: spec.label,
      points,
      tributaries,
      srcPin: { x: node.left - 2.5, y: sy },
      dstPin: { x: chart.right + 2.5, y: ty },
      junction: Math.abs(sy - ty) > 10 ? { x: laneX, y: ty } : undefined,
      accent,
      active: st.active,
      polarity: st.polarity
    };
  }

  // Case 3: Immediately beneath chart (row 2 directly under chart)
  if (node.top >= chart.bottom - 2 && node.top - chart.bottom <= 48 && node.right > chart.left && node.left < chart.right) {
    const gapH = Math.max(8, node.top - chart.bottom);
    const midY = chart.bottom + gapH * 0.5;
    const sx = clamp(node.cx, chart.left + 28, chart.right - 28);
    const offset = node.cx < chart.cx - 48 ? 22 : node.cx > chart.cx + 48 ? -22 : 0;
    const tx = clamp(sx + offset, chart.left + 20, chart.right - 20);

    const points: WirePoint[] = offset === 0
      ? [{ x: sx, y: node.top }, { x: tx, y: chart.bottom }]
      : [{ x: sx, y: node.top }, { x: sx, y: midY }, { x: tx, y: midY }, { x: tx, y: chart.bottom }];

    if (offset === 0 && node.width >= 150) {
      tributaries.push(
        [{ x: sx - 22, y: node.top }, { x: sx - 22, y: midY + 1 }, { x: sx, y: midY + 1 }],
        [{ x: sx + 22, y: node.top }, { x: sx + 22, y: midY + 1 }, { x: sx, y: midY + 1 }]
      );
    } else if (offset !== 0 && node.width >= 150) {
      const flankX = offset > 0 ? sx - 18 : sx + 18;
      tributaries.push([
        { x: clamp(flankX, node.left + 16, node.right - 16), y: node.top },
        { x: clamp(flankX, node.left + 16, node.right - 16), y: midY },
        { x: sx, y: midY }
      ]);
    }

    return {
      id: spec.id,
      label: spec.label,
      points,
      tributaries,
      srcPin: { x: sx, y: node.top - 2.5 },
      dstPin: { x: tx, y: chart.bottom + 2.5 },
      junction: { x: offset === 0 ? sx : tx, y: midY },
      accent,
      active: st.active,
      polarity: st.polarity
    };
  }

  // Case 4: Responsive tablet/mobile rows further below chart
  if (node.top > chart.bottom + 48) {
    // Tablet wide profit-radar-panel spanning chart center: route straight up center gap between liquidity & nextcandle
    if (spec.id === 'profit-radar-panel' && node.width > chart.width * 0.65 && chart.width >= 480) {
      const cx = chart.cx;
      const sx = clamp(cx, node.left + 24, node.right - 24);
      const midY = node.top - 7;
      return {
        id: spec.id,
        label: spec.label,
        points: [
          { x: sx, y: node.top },
          { x: sx, y: midY },
          { x: cx, y: midY },
          { x: cx, y: chart.bottom }
        ],
        tributaries: [],
        srcPin: { x: sx, y: node.top - 2.5 },
        dstPin: { x: cx, y: chart.bottom + 2.5 },
        junction: { x: sx, y: midY },
        accent,
        active: st.active,
        polarity: st.polarity
      };
    }

    // Side outer bus trunk on tablet/mobile
    const goRight = spec.side === 'right' || node.cx > chart.cx + 24;
    const laneIdx = goRight ? trunkIndexRight : trunkIndexLeft;
    const sy = clamp(node.top + 28, node.top + 16, node.bottom - 16);
    const ty = clamp(chart.bottom - 26 - laneIdx * 16, chart.top + 42, chart.bottom - 20);

    if (!goRight) {
      const trunkX = Math.max(3, Math.min(node.left, chart.left) - 4 - (laneIdx % 3) * 2.5);
      return {
        id: spec.id,
        label: spec.label,
        points: [
          { x: node.left, y: sy },
          { x: trunkX, y: sy },
          { x: trunkX, y: ty },
          { x: chart.left, y: ty }
        ],
        tributaries: [],
        srcPin: { x: Math.max(2, node.left - 2.5), y: sy },
        dstPin: { x: Math.max(2, chart.left - 2.5), y: ty },
        junction: { x: trunkX, y: ty },
        accent,
        active: st.active,
        polarity: st.polarity
      };
    }

    const trunkX = Math.min(wsWidth - 3, Math.max(node.right, chart.right) + 4 + (laneIdx % 3) * 2.5);
    return {
      id: spec.id,
      label: spec.label,
      points: [
        { x: node.right, y: sy },
        { x: trunkX, y: sy },
        { x: trunkX, y: ty },
        { x: chart.right, y: ty }
      ],
      tributaries: [],
      srcPin: { x: Math.min(wsWidth - 2, node.right + 2.5), y: sy },
      dstPin: { x: Math.min(wsWidth - 2, chart.right + 2.5), y: ty },
      junction: { x: trunkX, y: ty },
      accent,
      active: st.active,
      polarity: st.polarity
    };
  }

  return null;
}

function createSvgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el;
}

export const LOWER_WIRE_SPECS: WireSpec[] = [
  {
    id: 'stage-news',
    label: '01 NEXT EVENT',
    side: 'left',
    chartPort: 0.40,
    accentLight: '#d97706',
    accentDark: '#fbbf24',
    readStatus: () => {
      const pol = readPolarityFromText('watch-bias-pill');
      return { active: pol !== 'neutral', polarity: pol };
    }
  },
  {
    id: 'sessions-board',
    label: '08 SESSIONS',
    side: 'left',
    chartPort: 0.42,
    accentLight: '#059669',
    accentDark: '#34d399',
    readStatus: () => {
      const liveCount = document.querySelectorAll('#sessions-grid .sess-row.live').length;
      const pol = readPolarityFromText('sessions-summary');
      return { active: liveCount > 0, polarity: pol };
    }
  },
  {
    id: 'stage-dial',
    label: '02 ORDER FLOW',
    side: 'bottom',
    chartPort: 0.44,
    accentLight: '#0284c7',
    accentDark: '#38bdf8',
    readStatus: () => {
      const rows = document.querySelectorAll('#tt-rows .tt-row, .traders-terminal-panel .tt-row').length;
      const pol = readPolarityFromText('tt-summary');
      return { active: rows > 0 || pol !== 'neutral', polarity: pol };
    }
  },
  {
    id: 'venues-flow-terminal',
    label: '12 VENUES FLOW',
    side: 'right',
    chartPort: 0.58,
    accentLight: '#2563eb',
    accentDark: '#60a5fa',
    readStatus: () => {
      const rows = document.querySelectorAll('#vft-rows .vft-row').length;
      const buyTxt = String(document.getElementById('vft-buy')?.textContent || '0').replace(/[^0-9.]/g, '');
      const sellTxt = String(document.getElementById('vft-sell')?.textContent || '0').replace(/[^0-9.]/g, '');
      const b = Number(buyTxt) || 0;
      const s = Number(sellTxt) || 0;
      return {
        active: rows > 0 || b + s > 0,
        polarity: b > s * 1.05 ? 'buy' : s > b * 1.05 ? 'sell' : 'neutral'
      };
    }
  },
  {
    id: 'stage-outlook',
    label: '03 AI DIRECTION',
    side: 'right',
    chartPort: 0.62,
    accentLight: '#7c3aed',
    accentDark: '#a78bfa',
    readStatus: () => {
      const pills = document.querySelectorAll('#watch-outlook-chips .outlook-pill');
      const sel = document.querySelector('#watch-outlook-chips .outlook-pill.selected') || pills[0];
      const txt = String(sel?.textContent || '').toUpperCase();
      const pol: 'buy' | 'sell' | 'neutral' = /\bBUY\b/.test(txt) ? 'buy' : /\bSELL\b/.test(txt) ? 'sell' : 'neutral';
      return { active: pills.length > 0 && pol !== 'neutral', polarity: pol };
    }
  }
];

export interface LowerRouteContext {
  dashW: number;
  isDark: boolean;
  term: WireRect;
  chart: WireRect;
  stopLiq: WireRect | null;
  nextCandle: WireRect | null;
  profitRadar: WireRect | null;
  stageNews: WireRect | null;
  stageDial: WireRect | null;
  stageOutlook: WireRect | null;
  stageSessions: WireRect | null;
  sessionsBoard: WireRect | null;
  venuesTerminal: WireRect | null;
}

export function computeLowerPipelineRoutes(ctx: LowerRouteContext): WireRoute[] {
  const {
    dashW, isDark, term, chart,
    stopLiq, nextCandle, profitRadar,
    stageNews, stageDial, stageOutlook, stageSessions, sessionsBoard, venuesTerminal
  } = ctx;

  if (chart.width < 40 || chart.height < 40) return [];

  const specMap = new Map(LOWER_WIRE_SPECS.map((s) => [s.id, s]));
  const rectById: Record<string, WireRect | null> = {
    'stage-news': stageNews,
    'sessions-board': sessionsBoard,
    'stage-dial': stageDial,
    'venues-flow-terminal': venuesTerminal,
    'stage-outlook': stageOutlook
  };

  const dropL =
    stopLiq && nextCandle && stopLiq.right < nextCandle.left - 4 &&
    Math.abs(stopLiq.top - nextCandle.top) < 22 && stopLiq.top >= chart.bottom - 2
      ? (stopLiq.right + nextCandle.left) * 0.5
      : null;

  const dropR =
    nextCandle && profitRadar && nextCandle.right < profitRadar.left - 4 &&
    Math.abs(nextCandle.top - profitRadar.top) < 22 && nextCandle.top >= chart.bottom - 2
      ? (nextCandle.right + profitRadar.left) * 0.5
      : null;

  const colGap1X =
    stageNews && stageDial && stageNews.right < stageDial.left - 4 &&
    Math.abs(stageNews.top - stageDial.top) < 22
      ? (stageNews.right + stageDial.left) * 0.5
      : null;

  const colGap2X =
    stageDial && stageOutlook && stageDial.right < stageOutlook.left - 4 &&
    Math.abs(stageDial.top - stageOutlook.top) < 22
      ? (stageDial.right + stageOutlook.left) * 0.5
      : null;

  const row1MinTop = Math.min(
    stageNews ? stageNews.top : Infinity,
    stageDial ? stageDial.top : Infinity,
    stageOutlook ? stageOutlook.top : Infinity
  );
  const rowGapH = isFinite(row1MinTop) ? row1MinTop - term.bottom : 0;
  const isDesktopPlanar = !!(
    dropL !== null &&
    dropR !== null &&
    colGap1X !== null &&
    colGap2X !== null &&
    stageNews &&
    stageDial &&
    stageOutlook &&
    rowGapH >= 8
  );

  const routes: WireRoute[] = [];

  if (isDesktopPlanar && dropL !== null && dropR !== null && colGap1X !== null && colGap2X !== null && stageNews && stageDial && stageOutlook) {
    const yTop = term.bottom + rowGapH * 0.27;
    const yMid = term.bottom + rowGapH * 0.52;
    const yBot = term.bottom + rowGapH * 0.77;
    const row1Bot = Math.max(stageNews.bottom, stageDial.bottom, stageOutlook.bottom);
    const stageSessTop = stageSessions ? stageSessions.top : Math.min(sessionsBoard?.top ?? Infinity, venuesTerminal?.top ?? Infinity);
    const bus2Y = isFinite(stageSessTop) && stageSessTop > row1Bot + 4
      ? row1Bot + (stageSessTop - row1Bot) * 0.5
      : row1Bot + 10;

    // 1. 01 NEXT EVENT -> yTop -> dropL - 4.5 -> chart bottom
    {
      const spec = specMap.get('stage-news')!;
      const st = spec.readStatus();
      const accent = isDark ? spec.accentDark : spec.accentLight;
      const sx = stageNews.cx;
      const sy = stageNews.top;
      const lx = dropL - 4.5;
      routes.push({
        id: spec.id,
        label: spec.label,
        points: [{ x: sx, y: sy }, { x: sx, y: yTop }, { x: lx, y: yTop }, { x: lx, y: chart.bottom }],
        tributaries: [],
        srcPin: { x: sx, y: sy - 2 },
        dstPin: { x: lx, y: chart.bottom + 2.5 },
        junction: { x: lx, y: yTop },
        accent,
        active: st.active,
        polarity: st.polarity
      });
    }

    // 2. 08 SESSIONS -> bus2Y -> colGap1X -> yMid -> dropL -> chart bottom (planar, zero cross)
    if (sessionsBoard && sessionsBoard.width >= 20 && sessionsBoard.height >= 20) {
      const spec = specMap.get('sessions-board')!;
      const st = spec.readStatus();
      const accent = isDark ? spec.accentDark : spec.accentLight;
      const sx = clamp(colGap1X - 24, sessionsBoard.left + 130, Math.max(sessionsBoard.left + 130, colGap1X - 8));
      const sy = sessionsBoard.top;
      const lx = dropL;
      routes.push({
        id: spec.id,
        label: spec.label,
        points: [
          { x: sx, y: sy },
          { x: sx, y: bus2Y },
          { x: colGap1X, y: bus2Y },
          { x: colGap1X, y: yMid },
          { x: lx, y: yMid },
          { x: lx, y: chart.bottom }
        ],
        tributaries: [],
        srcPin: { x: sx, y: sy - 2 },
        dstPin: { x: lx, y: chart.bottom + 2.5 },
        junction: { x: colGap1X, y: yMid },
        accent,
        active: st.active,
        polarity: st.polarity
      });
    }

    // 3. 02 TRADERS ORDER FLOW -> yBot -> dropL + 4.5 -> chart bottom
    {
      const spec = specMap.get('stage-dial')!;
      const st = spec.readStatus();
      const accent = isDark ? spec.accentDark : spec.accentLight;
      const sx = stageDial.cx;
      const sy = stageDial.top;
      const lx = dropL + 4.5;
      routes.push({
        id: spec.id,
        label: spec.label,
        points: [{ x: sx, y: sy }, { x: sx, y: yBot }, { x: lx, y: yBot }, { x: lx, y: chart.bottom }],
        tributaries: [],
        srcPin: { x: sx, y: sy - 2 },
        dstPin: { x: lx, y: chart.bottom + 2.5 },
        junction: { x: lx, y: yBot },
        accent,
        active: st.active,
        polarity: st.polarity
      });
    }

    // 4. 12 VENUES FLOW -> bus2Y -> colGap2X -> yMid -> dropR - 3 -> chart bottom (planar, zero cross)
    if (venuesTerminal && venuesTerminal.width >= 20 && venuesTerminal.height >= 20) {
      const spec = specMap.get('venues-flow-terminal')!;
      const st = spec.readStatus();
      const accent = isDark ? spec.accentDark : spec.accentLight;
      const sx = clamp(venuesTerminal.left + 26, venuesTerminal.left + 14, Math.max(venuesTerminal.left + 14, venuesTerminal.right - 72));
      const sy = venuesTerminal.top;
      const rx = dropR - 3;
      routes.push({
        id: spec.id,
        label: spec.label,
        points: [
          { x: sx, y: sy },
          { x: sx, y: bus2Y },
          { x: colGap2X, y: bus2Y },
          { x: colGap2X, y: yMid },
          { x: rx, y: yMid },
          { x: rx, y: chart.bottom }
        ],
        tributaries: [],
        srcPin: { x: sx, y: sy - 2 },
        dstPin: { x: rx, y: chart.bottom + 2.5 },
        junction: { x: colGap2X, y: yMid },
        accent,
        active: st.active,
        polarity: st.polarity
      });
    }

    // 5. 03 AI DIRECTION -> yTop -> dropR + 3 -> chart bottom
    {
      const spec = specMap.get('stage-outlook')!;
      const st = spec.readStatus();
      const accent = isDark ? spec.accentDark : spec.accentLight;
      const sx = stageOutlook.cx;
      const sy = stageOutlook.top;
      const rx = dropR + 3;
      routes.push({
        id: spec.id,
        label: spec.label,
        points: [{ x: sx, y: sy }, { x: sx, y: yTop }, { x: rx, y: yTop }, { x: rx, y: chart.bottom }],
        tributaries: [],
        srcPin: { x: sx, y: sy - 2 },
        dstPin: { x: rx, y: chart.bottom + 2.5 },
        junction: { x: rx, y: yTop },
        accent,
        active: st.active,
        polarity: st.polarity
      });
    }

    return routes;
  }

  // Responsive Tablet / Mobile fallback: outer #dash side gutter trunks up to chart left/right edge
  let leftIdx = 0;
  let rightIdx = 0;
  for (const spec of LOWER_WIRE_SPECS) {
    const r = rectById[spec.id];
    if (!r || r.width < 20 || r.height < 20) continue;
    const st = spec.readStatus();
    const accent = isDark ? spec.accentDark : spec.accentLight;
    const useRight = dashW >= 720 && r.left >= chart.cx - 20;
    const sy = clamp(r.top + 26, r.top + 14, r.bottom - 14);
    if (!useRight) {
      const idx = leftIdx++;
      const trunkX = Math.max(3, Math.min(r.left, chart.left) - 4 - idx * 2.4);
      const ty = clamp(chart.bottom - 24 - idx * 14, chart.top + 36, chart.bottom - 18);
      routes.push({
        id: spec.id,
        label: spec.label,
        points: [{ x: r.left, y: sy }, { x: trunkX, y: sy }, { x: trunkX, y: ty }, { x: chart.left, y: ty }],
        tributaries: [],
        srcPin: { x: Math.max(2, r.left - 2.5), y: sy },
        dstPin: { x: Math.max(2, chart.left - 2.5), y: ty },
        junction: { x: trunkX, y: ty },
        accent,
        active: st.active,
        polarity: st.polarity
      });
    } else {
      const idx = rightIdx++;
      const trunkX = Math.min(dashW - 3, Math.max(r.right, chart.right) + 4 + idx * 2.4);
      const ty = clamp(chart.bottom - 24 - idx * 14, chart.top + 36, chart.bottom - 18);
      routes.push({
        id: spec.id,
        label: spec.label,
        points: [{ x: r.right, y: sy }, { x: trunkX, y: sy }, { x: trunkX, y: ty }, { x: chart.right, y: ty }],
        tributaries: [],
        srcPin: { x: Math.min(dashW - 2, r.right + 2.5), y: sy },
        dstPin: { x: Math.min(dashW - 2, chart.right + 2.5), y: ty },
        junction: { x: trunkX, y: ty },
        accent,
        active: st.active,
        polarity: st.polarity
      });
    }
  }
  return routes;
}

export function loadModule(): void {
  const workspace = document.getElementById('binance-term-workspace');
  if (!workspace) return;

  let svg = document.getElementById('workspace-wire-layer') as unknown as SVGSVGElement | null;
  if (!svg) {
    svg = createSvgEl('svg', {
      id: 'workspace-wire-layer',
      class: 'workspace-wire-layer',
      'aria-hidden': 'true'
    });
    workspace.insertBefore(svg, workspace.firstChild);
  }

  const dash = document.getElementById('dash');
  let dashSvg = document.getElementById('dash-wire-layer') as unknown as SVGSVGElement | null;
  if (dash && !dashSvg) {
    dashSvg = createSvgEl('svg', {
      id: 'dash-wire-layer',
      class: 'dash-wire-layer',
      'aria-hidden': 'true'
    });
    dash.insertBefore(dashSvg, dash.firstChild);
  }

  const burstDeadlines = new Map<string, number>();
  const lastBurstTriggerAt = new Map<string, number>();
  const upperGroupNodes = new Map<string, { g: SVGGElement; panel: HTMLElement | null; spec: WireSpec; accent: string }>();
  const lowerGroupNodes = new Map<string, { g: SVGGElement; panel: HTMLElement | null; spec: WireSpec; accent: string }>();
  let hoveredId: string | null = null;
  let lastRoutes: WireRoute[] = [];
  let lastLowerRoutes: WireRoute[] = [];
  let geometryDirty = true;
  let lastUpperGeomSig = '';
  let lastLowerGeomSig = '';
  let renderPending = false;
  let statePending = false;
  let burstTimerId = 0;

  function renderPortSocket(parent: SVGGElement, pt: WirePoint, role: 'src' | 'dst'): void {
    const outer = createSvgEl('circle', {
      class: `sx-wire-port sx-wire-port-${role}`,
      cx: roundCoord(pt.x),
      cy: roundCoord(pt.y),
      r: role === 'dst' ? 4.2 : 3.6
    });
    const inner = createSvgEl('circle', {
      class: `sx-wire-pin sx-wire-pin-${role}`,
      cx: roundCoord(pt.x),
      cy: roundCoord(pt.y),
      r: role === 'dst' ? 2 : 1.7
    });
    parent.appendChild(outer);
    parent.appendChild(inner);
  }

  function applyWireGroupClasses(
    entry: { g: SVGGElement; panel: HTMLElement | null; spec: WireSpec; accent: string },
    isDark: boolean,
    now: number,
    isLower: boolean
  ): boolean {
    const { g, panel, spec } = entry;
    const st = spec.readStatus();
    const accent = isDark ? spec.accentDark : spec.accentLight;
    if (entry.accent !== accent) {
      entry.accent = accent;
      g.setAttribute('style', `--wire-accent: ${accent};`);
      if (panel) panel.style.setProperty('--sx-wire-accent', accent);
    }
    const isHovered = hoveredId === spec.id;
    const isBursting = (burstDeadlines.get(spec.id) || 0) > now;
    const wantCls = [
      'sx-wire-group',
      isLower ? 'sx-wire-lower' : '',
      st.active ? 'is-active' : 'is-standby',
      isHovered ? 'is-hovered' : '',
      isBursting ? 'is-burst' : ''
    ].filter(Boolean).join(' ');
    if (g.getAttribute('class') !== wantCls) g.setAttribute('class', wantCls);
    if (g.getAttribute('data-wire-polarity') !== st.polarity) g.setAttribute('data-wire-polarity', st.polarity);
    if (panel) {
      panel.classList.toggle('is-wire-active', st.active);
      panel.classList.toggle('is-wire-hovered', isHovered);
      panel.classList.toggle('is-wire-burst', isBursting);
    }
    return st.active;
  }

  function syncStatesOnly(): void {
    statePending = false;
    const chartEl = workspace.querySelector('.binance-chart-wrapper') as HTMLElement | null;
    const isDark = document.documentElement.classList.contains('sx-dark') || document.body.classList.contains('sx-dark');
    const now = Date.now();
    if (hoveredId) {
      workspace.setAttribute('data-wire-hover', hoveredId);
      chartEl?.setAttribute('data-wire-hub-hover', hoveredId);
      dash?.setAttribute('data-wire-hover', hoveredId);
    } else {
      workspace.removeAttribute('data-wire-hover');
      chartEl?.removeAttribute('data-wire-hub-hover');
      dash?.removeAttribute('data-wire-hover');
    }
    let activeCount = 0;
    for (const entry of upperGroupNodes.values()) {
      if (applyWireGroupClasses(entry, isDark, now, false)) activeCount++;
    }
    chartEl?.setAttribute('data-wire-active-count', String(activeCount));
    for (const entry of lowerGroupNodes.values()) {
      applyWireGroupClasses(entry, isDark, now, true);
    }
  }

  function buildWireGroup(
    route: WireRoute,
    spec: WireSpec,
    panelEl: HTMLElement | null,
    isLower: boolean,
    now: number
  ): SVGGElement | null {
    const d = buildRoundedOrthogonalPath(route.points, 5.5);
    if (!d) return null;
    const isHovered = hoveredId === route.id;
    const isBursting = (burstDeadlines.get(route.id) || 0) > now;
    if (panelEl) {
      panelEl.setAttribute('data-wire-node', route.id);
      panelEl.style.setProperty('--sx-wire-accent', route.accent);
      panelEl.classList.toggle('is-wire-active', route.active);
      panelEl.classList.toggle('is-wire-hovered', isHovered);
      panelEl.classList.toggle('is-wire-burst', isBursting);
    }

    const g = createSvgEl('g', {
      class: [
        'sx-wire-group',
        isLower ? 'sx-wire-lower' : '',
        route.active ? 'is-active' : 'is-standby',
        isHovered ? 'is-hovered' : '',
        isBursting ? 'is-burst' : ''
      ].filter(Boolean).join(' '),
      'data-wire-id': route.id,
      'data-wire-polarity': route.polarity,
      style: `--wire-accent: ${route.accent};`
    });

    for (const tribPts of route.tributaries) {
      const td = buildRoundedOrthogonalPath(tribPts, 4);
      if (!td) continue;
      g.appendChild(createSvgEl('path', { class: 'sx-wire-tributary', d: td }));
      const tip = tribPts[0];
      if (tip) {
        g.appendChild(createSvgEl('circle', {
          class: 'sx-wire-pin-minor',
          cx: roundCoord(tip.x),
          cy: roundCoord(tip.y - 2),
          r: 2
        }));
      }
    }

    g.appendChild(createSvgEl('path', { class: 'sx-wire-halo', d }));
    g.appendChild(createSvgEl('path', { class: 'sx-wire-rail', d }));
    g.appendChild(createSvgEl('path', { class: 'sx-wire-core', d }));
    g.appendChild(createSvgEl('path', { class: 'sx-wire-flow', d }));

    if (route.junction) {
      g.appendChild(createSvgEl('circle', {
        class: 'sx-wire-via',
        cx: roundCoord(route.junction.x),
        cy: roundCoord(route.junction.y),
        r: 2.1
      }));
    }

    renderPortSocket(g, route.srcPin, 'src');
    renderPortSocket(g, route.dstPin, 'dst');
    return g;
  }

  function renderNow(forceGeometry = true): void {
    renderPending = false;
    statePending = false;
    if (!forceGeometry && !geometryDirty && upperGroupNodes.size > 0) {
      syncStatesOnly();
      return;
    }
    geometryDirty = false;
    const section = document.getElementById('binance-terminal-section');
    const chartEl = workspace.querySelector('.binance-chart-wrapper') as HTMLElement | null;
    if (!svg || !chartEl || section?.classList.contains('collapsed')) {
      if (svg) svg.innerHTML = '';
      if (dashSvg) dashSvg.innerHTML = '';
      upperGroupNodes.clear();
      lowerGroupNodes.clear();
      lastUpperGeomSig = '';
      lastLowerGeomSig = '';
      lastRoutes = [];
      lastLowerRoutes = [];
      return;
    }

    // Batch ALL DOM geometry reads before ANY DOM writes to eliminate layout thrashing
    const wsRectRaw = workspace.getBoundingClientRect();
    const chartRectRaw = chartEl.getBoundingClientRect();
    if (wsRectRaw.width < 40 || wsRectRaw.height < 40 || chartRectRaw.width < 20 || chartRectRaw.height < 20) {
      svg.innerHTML = '';
      if (dashSvg) dashSvg.innerHTML = '';
      upperGroupNodes.clear();
      lowerGroupNodes.clear();
      lastUpperGeomSig = '';
      lastLowerGeomSig = '';
      lastRoutes = [];
      lastLowerRoutes = [];
      return;
    }

    const upperPanels: Array<{ spec: WireSpec; el: HTMLElement; rect: ClientRect | DOMRect }> = [];
    for (const spec of WORKSPACE_WIRE_SPECS) {
      const el = document.getElementById(spec.id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width >= 12 && r.height >= 12) upperPanels.push({ spec, el, rect: r });
    }

    const expanded = section?.classList.contains('workspace-expanded') || !!document.fullscreenElement;
    const dashVisible = !!(dash && dashSvg && !dash.classList.contains('hidden') && !expanded);
    const dashRectRaw = dashVisible ? dash!.getBoundingClientRect() : null;
    const termRectRaw = dashVisible && section ? section.getBoundingClientRect() : null;
    const lowerRectsRaw = dashVisible ? {
      stopLiq: document.getElementById('stop-liquidity-panel')?.getBoundingClientRect() || null,
      nextCandle: document.getElementById('next-candle-panel')?.getBoundingClientRect() || null,
      profitRadar: document.getElementById('profit-radar-panel')?.getBoundingClientRect() || null,
      stageNews: document.getElementById('stage-news')?.getBoundingClientRect() || null,
      stageDial: document.getElementById('stage-dial')?.getBoundingClientRect() || null,
      stageOutlook: document.getElementById('stage-outlook')?.getBoundingClientRect() || null,
      stageSessions: document.getElementById('stage-sessions')?.getBoundingClientRect() || null,
      sessionsBoard: document.getElementById('sessions-board')?.getBoundingClientRect() || null,
      venuesTerminal: document.getElementById('venues-flow-terminal')?.getBoundingClientRect() || null
    } : null;

    // Now perform pure route computation + DOM writes
    const origin = { left: wsRectRaw.left, top: wsRectRaw.top };
    const chartRect = toWireRect(chartRectRaw, origin);
    const isDark = document.documentElement.classList.contains('sx-dark') || document.body.classList.contains('sx-dark');
    const now = Date.now();

    const routes: WireRoute[] = [];
    const upperItems: Array<{ route: WireRoute; spec: WireSpec; el: HTMLElement }> = [];
    let trunkIdxLeft = 0;
    let trunkIdxRight = 0;
    let activeCount = 0;
    let upperSigParts: string[] = [
      String(roundCoord(wsRectRaw.width)),
      String(roundCoord(wsRectRaw.height)),
      String(roundCoord(chartRect.left)),
      String(roundCoord(chartRect.top)),
      String(roundCoord(chartRect.width)),
      String(roundCoord(chartRect.height))
    ];

    for (const item of upperPanels) {
      const nodeRect = toWireRect(item.rect, origin);
      const isTabletStack = nodeRect.top > chartRect.bottom + 48;
      const route = computeWireRoute(item.spec, nodeRect, chartRect, wsRectRaw.width, isDark, trunkIdxLeft, trunkIdxRight);
      if (!route) continue;
      if (isTabletStack) {
        if (item.spec.side === 'right' || nodeRect.cx > chartRect.cx + 24) trunkIdxRight++;
        else trunkIdxLeft++;
      }
      routes.push(route);
      if (route.active) activeCount++;
      upperItems.push({ route, spec: item.spec, el: item.el });
      upperSigParts.push(`${route.id}:${roundCoord(nodeRect.left)},${roundCoord(nodeRect.top)},${roundCoord(nodeRect.width)},${roundCoord(nodeRect.height)}`);
    }

    const upperSig = upperSigParts.join('|');
    chartEl.setAttribute('data-wire-hub', 'chart');
    if (hoveredId) {
      workspace.setAttribute('data-wire-hover', hoveredId);
      chartEl.setAttribute('data-wire-hub-hover', hoveredId);
    } else {
      workspace.removeAttribute('data-wire-hover');
      chartEl.removeAttribute('data-wire-hub-hover');
    }

    if (upperSig !== lastUpperGeomSig || upperGroupNodes.size !== upperItems.length) {
      lastUpperGeomSig = upperSig;
      svg.setAttribute('viewBox', `0 0 ${roundCoord(wsRectRaw.width)} ${roundCoord(wsRectRaw.height)}`);
      svg.setAttribute('width', String(roundCoord(wsRectRaw.width)));
      svg.setAttribute('height', String(roundCoord(wsRectRaw.height)));
      upperGroupNodes.clear();
      const frag = document.createDocumentFragment();
      for (const { route, spec, el } of upperItems) {
        const g = buildWireGroup(route, spec, el, false, now);
        if (!g) continue;
        upperGroupNodes.set(route.id, { g, panel: el, spec, accent: route.accent });
        frag.appendChild(g);
      }
      svg.replaceChildren(frag);
    } else {
      for (const entry of upperGroupNodes.values()) {
        applyWireGroupClasses(entry, isDark, now, false);
      }
    }
    chartEl.setAttribute('data-wire-active-count', String(activeCount));
    lastRoutes = routes;

    // Lower pipeline sections (#flow-pipeline -> .binance-chart-wrapper via #dash-wire-layer)
    if (!dashVisible || !dash || !dashSvg || !dashRectRaw || !termRectRaw || !lowerRectsRaw || dashRectRaw.width < 60 || dashRectRaw.height < 60 || termRectRaw.width < 40) {
      if (dashSvg) dashSvg.innerHTML = '';
      lowerGroupNodes.clear();
      lastLowerGeomSig = '';
      lastLowerRoutes = [];
      return;
    }

    const dashOrigin = { left: dashRectRaw.left, top: dashRectRaw.top };
    const normRect = (r: ClientRect | DOMRect | null): WireRect | null =>
      r && r.width >= 12 && r.height >= 12 ? toWireRect(r, dashOrigin) : null;

    const lowerRoutes = computeLowerPipelineRoutes({
      dashW: dashRectRaw.width,
      isDark,
      term: toWireRect(termRectRaw, dashOrigin),
      chart: toWireRect(chartRectRaw, dashOrigin),
      stopLiq: normRect(lowerRectsRaw.stopLiq),
      nextCandle: normRect(lowerRectsRaw.nextCandle),
      profitRadar: normRect(lowerRectsRaw.profitRadar),
      stageNews: normRect(lowerRectsRaw.stageNews),
      stageDial: normRect(lowerRectsRaw.stageDial),
      stageOutlook: normRect(lowerRectsRaw.stageOutlook),
      stageSessions: normRect(lowerRectsRaw.stageSessions),
      sessionsBoard: normRect(lowerRectsRaw.sessionsBoard),
      venuesTerminal: normRect(lowerRectsRaw.venuesTerminal)
    });

    if (hoveredId) dash.setAttribute('data-wire-hover', hoveredId);
    else dash.removeAttribute('data-wire-hover');

    const lowerSpecMap = new Map(LOWER_WIRE_SPECS.map((s) => [s.id, s]));
    const lowerSigParts = [
      String(roundCoord(dashRectRaw.width)),
      String(roundCoord(dashRectRaw.height)),
      ...lowerRoutes.map((r) => `${r.id}:${r.points.map((p) => `${roundCoord(p.x)},${roundCoord(p.y)}`).join(';')}`)
    ];
    const lowerSig = lowerSigParts.join('|');

    if (lowerSig !== lastLowerGeomSig || lowerGroupNodes.size !== lowerRoutes.length) {
      lastLowerGeomSig = lowerSig;
      dashSvg.setAttribute('viewBox', `0 0 ${roundCoord(dashRectRaw.width)} ${roundCoord(dashRectRaw.height)}`);
      dashSvg.setAttribute('width', String(roundCoord(dashRectRaw.width)));
      dashSvg.setAttribute('height', String(roundCoord(dashRectRaw.height)));
      lowerGroupNodes.clear();
      const dashFrag = document.createDocumentFragment();
      for (const route of lowerRoutes) {
        const spec = lowerSpecMap.get(route.id);
        const panelEl = document.getElementById(route.id);
        if (!spec) continue;
        const g = buildWireGroup(route, spec, panelEl, true, now);
        if (!g) continue;
        lowerGroupNodes.set(route.id, { g, panel: panelEl, spec, accent: route.accent });
        dashFrag.appendChild(g);
      }
      dashSvg.replaceChildren(dashFrag);
    } else {
      for (const entry of lowerGroupNodes.values()) {
        applyWireGroupClasses(entry, isDark, now, true);
      }
    }
    lastLowerRoutes = lowerRoutes;
  }

  function scheduleRender(): void {
    geometryDirty = true;
    if (renderPending) return;
    renderPending = true;
    window.requestAnimationFrame(() => renderNow(true));
  }

  function scheduleStateSync(): void {
    if (renderPending || statePending) return;
    if (geometryDirty || upperGroupNodes.size === 0) {
      scheduleRender();
      return;
    }
    statePending = true;
    window.requestAnimationFrame(syncStatesOnly);
  }

  function scheduleBurstCleanup(): void {
    if (burstTimerId) return;
    burstTimerId = window.setTimeout(() => {
      burstTimerId = 0;
      const now = Date.now();
      for (const [k, exp] of burstDeadlines.entries()) {
        if (exp <= now) burstDeadlines.delete(k);
      }
      scheduleStateSync();
      if (burstDeadlines.size > 0) scheduleBurstCleanup();
    }, 1350);
  }

  function triggerBurst(id?: string): void {
    const now = Date.now();
    const expiry = now + 1300;
    const targets = id
      ? [id]
      : [...WORKSPACE_WIRE_SPECS.map((s) => s.id), ...LOWER_WIRE_SPECS.map((s) => s.id)];
    let changed = false;
    for (const t of targets) {
      const last = lastBurstTriggerAt.get(t) || 0;
      if (id && now - last < 950) continue;
      lastBurstTriggerAt.set(t, now);
      burstDeadlines.set(t, expiry);
      changed = true;
    }
    if (changed) {
      scheduleStateSync();
      scheduleBurstCleanup();
    }
  }

  // Hover & keyboard focus feedback linking panel <-> wire <-> chart port (upper + lower panels)
  for (const spec of [...WORKSPACE_WIRE_SPECS, ...LOWER_WIRE_SPECS]) {
    const panelEl = document.getElementById(spec.id);
    if (!panelEl) continue;
    panelEl.addEventListener('pointerenter', () => {
      if (hoveredId !== spec.id) {
        hoveredId = spec.id;
        scheduleStateSync();
      }
    });
    panelEl.addEventListener('pointerleave', () => {
      if (hoveredId === spec.id) {
        hoveredId = null;
        scheduleStateSync();
      }
    });
    panelEl.addEventListener('focusin', () => {
      if (hoveredId !== spec.id) {
        hoveredId = spec.id;
        scheduleStateSync();
      }
    });
    panelEl.addEventListener('focusout', (ev: FocusEvent) => {
      const related = ev.relatedTarget as Node | null;
      if (hoveredId === spec.id && (!related || !panelEl.contains(related))) {
        hoveredId = null;
        scheduleStateSync();
      }
    });
  }

  const chartEl = workspace.querySelector('.binance-chart-wrapper') as HTMLElement | null;
  if (chartEl) {
    chartEl.addEventListener('pointerenter', () => {
      workspace.classList.add('is-hub-hovered');
      dash?.classList.add('is-hub-hovered');
    });
    chartEl.addEventListener('pointerleave', () => {
      workspace.classList.remove('is-hub-hovered');
      dash?.classList.remove('is-hub-hovered');
    });
  }

  // Geometry observers (resize, fullscreen, sidebar collapse, layout changes)
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => scheduleRender());
    const sec = document.getElementById('binance-terminal-section');
    if (dash) ro.observe(dash);
    if (sec) ro.observe(sec);
    ro.observe(workspace);
    if (chartEl) ro.observe(chartEl);
  }

  if (typeof MutationObserver !== 'undefined') {
    const moTheme = new MutationObserver(() => scheduleStateSync());
    moTheme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    const section = document.getElementById('binance-terminal-section');
    if (section) {
      const moSec = new MutationObserver(() => scheduleRender());
      moSec.observe(section, { attributes: true, attributeFilter: ['class'] });
    }
  }

  // Live module signal listeners -> zero-reflow state/burst sync along active wires
  const eventMap: Array<[string, string[]]> = [
    ['chart:liquidity-zones', ['stop-liquidity-panel']],
    ['chart:next-candle-update', ['next-candle-panel']],
    ['chart:smc-radar-update', ['profit-radar-panel', 'smart-money-panel']],
    ['swing:state', ['swing-ai-board', 'buy-swing-ai-board']],
    ['swing:structure', ['swing-ai-board', 'buy-swing-ai-board']],
    ['orderflow:update', ['whale-positions-panel', 'stage-dial', 'venues-flow-terminal']],
    ['orderflow:prints', ['stage-dial', 'venues-flow-terminal']],
    ['traders:stats', ['stage-dial']],
    ['whale:prints', ['whale-positions-panel']],
    ['market:outlook-data', ['market-news-terminal', 'running-news-panel', 'stage-outlook', 'stage-news']],
    ['chart:market', []],
    ['chart:interval', []],
    ['chart:bars-loaded', []]
  ];
  for (const [evtName, ids] of eventMap) {
    const targets: EventTarget[] = [window];
    const root = document.getElementById('dash');
    if (root && !targets.includes(root)) targets.push(root);
    for (const tgt of targets) {
      tgt.addEventListener(evtName, () => {
        if (ids.length) {
          const now = Date.now();
          let anyNew = false;
          for (const id of ids) {
            const prev = lastBurstTriggerAt.get(id) || 0;
            if (now - prev >= 1000) {
              lastBurstTriggerAt.set(id, now);
              burstDeadlines.set(id, now + 1250);
              anyNew = true;
            }
          }
          if (anyNew) {
            scheduleStateSync();
            scheduleBurstCleanup();
          } else {
            scheduleStateSync();
          }
        } else {
          triggerBurst();
        }
      });
    }
  }

  window.addEventListener('resize', scheduleRender, { passive: true });
  document.addEventListener('fullscreenchange', scheduleRender);
  window.addEventListener('softradex:theme', scheduleStateSync);

  // Light periodic state-only sync (zero getBoundingClientRect reflows)
  window.setInterval(() => {
    if (!document.hidden) scheduleStateSync();
  }, 4000);

  window.SoftradeXWorkspaceWires = {
    refresh: () => renderNow(true),
    triggerBurst,
    getRoutes: () => lastRoutes.slice(),
    getLowerRoutes: () => lastLowerRoutes.slice()
  };

  scheduleRender();
  window.setTimeout(scheduleRender, 220);
  window.setTimeout(scheduleRender, 900);
}
