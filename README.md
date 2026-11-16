# SoftradeX Trade (React + TypeScript + Vite)

Live multi-market trading analysis terminal built with **TypeScript, React, and Vite** (no MT5 or trading bots required).

## Features
- **Live Charts & Technical Indicators:** TradingView chart + custom EMA, RSI, MACD, Bollinger & Volume panes.
- **Smart Money · OB & FVG:** Institutional Order Blocks, Fair Value Gaps, and 61.8% OTE pullback detection.
- **SL · Liquidity Zones:** Unswept stop-loss liquidity pool estimation above and below price.
- **Profit Radar · TP/SL:** 6-factor sniper setup confluence with ATR safe stop-loss, Break-Even (+1R), TP1 (1.5R), and TP2 targets.
- **Swing AI:** Independent BUY and SELL multi-timeframe setup evaluation.
- **Order Flow & Whale Positions:** Multi-exchange live trade tape (Binance, Bybit, OKX, Gate, KuCoin, MEXC, Bitget, Coinbase, HTX) + Hyperliquid whale open positions.
- **Economic Calendar & Running News:** Multi-source live calendar (Exness, Forex Factory, TradingView, Binance, FXStreet, ForexLive, Investing.com) with live countdowns.
- **Trading Sessions & Market Outlook:** Sydney, Tokyo, London, and New York session clocks + daily market bias.

## Quick Start
```bash
npm install
npm run dev
```
Then open `http://127.0.0.1:8777/dashboard` (or double-click `start.bat` on Windows).

## Project Structure
```text
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── public/                 # Static icons & images
└── src/
    ├── main.tsx            # React + TypeScript entrypoint
    ├── App.tsx             # Dashboard & Access router component
    ├── templates.ts        # Dashboard & Access HTML templates
    ├── styles/
    │   ├── dashboard.css   # Unified dashboard stylesheet
    │   └── access.css      # Access page stylesheet
    ├── modules/            # Frontend TypeScript modules
    │   ├── core-dashboard.ts
    │   ├── chart-engine.ts
    │   ├── news-calendar.ts
    │   ├── swing-ai.ts
    │   ├── profit-smart-money.ts
    │   └── orderflow-whales.ts
    └── server/             # Vite / Node TypeScript API server
        ├── api-plugin.ts
        ├── tv-feed.ts
        └── news-feed.ts
```
