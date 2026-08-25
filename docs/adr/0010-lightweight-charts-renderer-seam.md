# Lightweight Charts behind a frontend renderer seam

**Status:** accepted. Resolves the frontend chart-rendering decision for the realtime market-data dashboard.

## Context

The realtime dashboard needs interactive financial charts: candlesticks, volume, indicator overlays, realtime
forming-candle updates, and strategy markers. The first vertical slice drew SVG primitives directly inside the
market-data feature. That was useful for proving the data flow, but it left scaling, crosshair, zooming, resizing,
and multi-pane behavior as product code.

The chart library must remain a rendering implementation detail. It must not become a second market-data client or
make the chart feature depend on `MarketDataService`, `BinanceAdapter`, Socket.IO hooks, or the Strategy Registry.

## Decision

Use TradingView **Lightweight Charts** as the default browser renderer behind a small
`FinancialChartRenderer` interface. The seam has three parts:

1. The market-data feature maps normalized `Candle` and `StrategySignalUpdate` values into plain
   `FinancialChartData` (candles, volume bars, lines, and markers).
2. `CandlestickChart` depends on the renderer interface and accepts an injected renderer, so tests and future
   product areas can provide another adapter without changing the feature's data flow.
3. `lightweightChartsRenderer` is the only module that imports `lightweight-charts`. It owns chart creation,
   series management, markers, panes, resizing, and cleanup. It receives no socket, service, exchange, or strategy
   dependencies and performs no network access.

The existing frontend Socket.IO hooks remain responsible for subscriptions. The renderer receives their resulting
plain data through React props; it does not subscribe to the market stream itself.

## Alternatives considered

- **Keep custom SVG rendering** — rejected for the main chart. It duplicates financial-chart interaction and scale
  behavior that a specialized renderer already provides.
- **TradingView Advanced Charts** — rejected for this scope. It is access-gated and non-redistributable, and its
  larger feature set is not needed for the dashboard.
- **TradingView widgets** — rejected because widgets are tied to TradingView's data experience, while this system
  must render data delivered by its own Market Data Service.
- **Import Lightweight Charts directly in every feature** — rejected because it spreads vendor-specific series and
  lifecycle knowledge across callers.

## Consequences

- Chart interaction, price scaling, volume panes, and marker placement are delegated to a maintained renderer.
- A different chart library or a specialized backtest renderer can implement the same interface later.
- The default chart palette is light to match the dashboard; future theme changes remain localized to renderer
  presentation tokens and do not affect market-data or strategy contracts.
- The adapter must preserve the required TradingView attribution in the public application.
- The adapter explicitly enables the library's TradingView attribution logo; the project also retains the
  `Copyright 2023 TradingView, Inc.` notice in this decision record alongside the dependency's Apache-2.0 license.
- The chart remains client-only: creation and cleanup happen in effects because the renderer requires browser DOM
  APIs.
- Renderer tests use a fake `FinancialChartRenderer`, while data mapping is tested as a pure feature function.

## Coupling checks

- `CandlestickChart` imports the renderer interface and frontend composition root, never `lightweight-charts`.
- `lightweightChartsRenderer` imports only the chart library and neutral renderer types.
- No chart renderer module imports Binance, Socket.IO, backend services, repositories, or strategy execution code.
- Replacing the chart library is localized to the renderer adapter and its composition root; the transport contracts,
  market hooks, and strategy pipeline remain unchanged.
