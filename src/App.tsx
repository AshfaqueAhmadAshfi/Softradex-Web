/// <reference types="vite/client" />
import React, { useLayoutEffect, useRef } from 'react';
import { ACCESS_HTML, DASHBOARD_HTML } from './templates';
import { loadAccessModule, loadModule as loadCoreDashboard } from './modules/core-dashboard';
import { loadModule as loadOrderFlowWhales } from './modules/orderflow-whales';
import { loadModule as loadChartEngine } from './modules/chart-engine';
import { loadModule as loadNewsCalendar } from './modules/news-calendar';
import { loadModule as loadSwingAI } from './modules/swing-ai';
import { loadModule as loadProfitSmartMoney } from './modules/profit-smart-money';
import { installWorkerBridge } from './workers/calc-client';

let bootedMode: string | null = null;

function reveal(): void {
  const root = document.getElementById('root');
  if (root) root.style.visibility = 'visible';
  document.documentElement.classList.add('sx-ready');
}

function bootDashboardModules(): void {
  const domReadyQueue: Array<(ev: Event) => void> = [];
  const origAddEventListener = document.addEventListener.bind(document);
  const origReadyStateDescriptor =
    Object.getOwnPropertyDescriptor(Document.prototype, 'readyState') ||
    Object.getOwnPropertyDescriptor(document, 'readyState');

  try {
    Object.defineProperty(document, 'readyState', { configurable: true, get: () => 'loading' });
  } catch {}

  document.addEventListener = function (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ): void {
    if (type === 'DOMContentLoaded' && listener) {
      domReadyQueue.push((ev: Event) => {
        if (typeof listener === 'function') listener.call(document, ev);
        else if (typeof listener.handleEvent === 'function') listener.handleEvent(ev);
      });
      return;
    }
    origAddEventListener(type, listener as EventListener, options);
  } as typeof document.addEventListener;

  try {
    installWorkerBridge();
    loadCoreDashboard();
    loadOrderFlowWhales();
    loadChartEngine();
    loadNewsCalendar();
    loadSwingAI();
    loadProfitSmartMoney();
  } finally {
    document.addEventListener = origAddEventListener;
    try {
      if (origReadyStateDescriptor) Object.defineProperty(document, 'readyState', origReadyStateDescriptor);
      else delete (document as any).readyState;
    } catch {}
  }

  const ev = new Event('DOMContentLoaded');
  for (const fn of domReadyQueue) {
    try {
      fn(ev);
    } catch (err) {
      console.error('[SoftradeX Init]', err);
    }
  }
}

export function App(): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isAccess = typeof window !== 'undefined' && window.location.pathname.startsWith('/access');

  useLayoutEffect(() => {
    const root = containerRef.current;
    if (!root || bootedMode) return;
    bootedMode = isAccess ? 'access' : 'dashboard';

    // Load the stylesheet FIRST, then insert the markup, so the page never
    // flashes unstyled content on reload.
    const cssReady = isAccess ? import('./styles/access.css') : import('./styles/dashboard.css');
    const fontsReady: Promise<unknown> = (document as any).fonts?.ready
      ? Promise.race([(document as any).fonts.ready, new Promise((r) => setTimeout(r, 250))])
      : Promise.resolve();

    void Promise.all([cssReady, fontsReady]).then(() => {
      if (isAccess) {
        document.title = 'SoftradeX — Your Market Universe';
        document.body.className = 'access-page';
        root.innerHTML = ACCESS_HTML;
        requestAnimationFrame(() => {
          loadAccessModule();
          reveal();
        });
        return;
      }
      document.title = 'SoftradeX Trading Dashboard';
      const dark = document.documentElement.classList.contains('sx-dark');
      document.body.className = dark ? 'softradex-glass-ui sx-dark' : 'softradex-glass-ui';
      root.innerHTML = DASHBOARD_HTML;
      requestAnimationFrame(() => {
        bootDashboardModules();
        requestAnimationFrame(reveal);
      });
    });
  }, [isAccess]);

  return <div ref={containerRef} id="sx-root-mount" />;
}

export default App;
