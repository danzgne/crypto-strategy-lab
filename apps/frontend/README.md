# Frontend architecture

The frontend uses Next.js App Router, TypeScript, and Tailwind CSS. It is organized as feature modules so that
product behavior stays local, route changes do not move feature implementations, and generic UI can be reused
without depending on a product feature.

This README records the agreed frontend target. ADR-0009 supersedes ADR-0001's original Vite choice after the
team accepted Next.js App Router for the production frontend structure. The supporting research is in
[`docs/research/nextjs-feature-frontend-structure.md`](../../docs/research/nextjs-feature-frontend-structure.md).

Do not create every directory in this document empty. Add a feature or optional subdirectory with its first real
vertical slice.

## Ownership rule

The same JSX syntax appears in three places, but ownership is different:

| Location       | Owns                                                                 | Example                                             |
| -------------- | -------------------------------------------------------------------- | --------------------------------------------------- |
| `src/app`      | URLs, layouts, metadata, loading/error states, and route composition | `/backtests/[experimentId]`                         |
| `src/features` | Product behavior and product-aware UI                                | `TradeTable`, `CandlestickChart`, `StrategyBuilder` |
| `src/shared`   | Generic frontend infrastructure and UI without product knowledge     | `Button`, `Dialog`, HTTP client                     |

Use this placement test:

1. If deleting one URL or layout would delete the code, keep it in `app`.
2. If the code understands a product term such as Candle, Strategy, Trade, SearchRun, or NewsItem, keep it in the
   owning feature.
3. If it is useful without knowing anything about Crypto Strategy Lab, keep it in `shared`.

Route-private `_components` and `_providers` folders are allowed by Next.js, but do not create them initially.
Keep small route-only markup in `page.tsx` or `layout.tsx`; extract it beside the route only when that file becomes
hard to read and the extracted code has no feature or shared owner.

## Dependency direction

```text
app → features → shared
               ↘ packages/shared
shared ────────→ packages/shared
```

- `app` may compose multiple features.
- A feature may import `shared` and browser-safe contracts from the monorepo's `packages/shared`.
- A feature must not import `app`.
- `shared` must not import a feature.
- A feature must not deep-import another feature's implementation. Compose the features in `app`, use the other
  feature's explicit public interface, or move genuinely generic code to `shared`.
- A feature's `index.ts` explicitly exports its small client-safe interface. If it has server-only exports, expose
  them separately from `server.ts` and protect their implementation with `server-only`.
- Do not build one wildcard barrel that exports the whole frontend. Keep public feature exports small and explicit.

### Chart renderer seam

The market-data feature owns the mapping from `Candle` and strategy signal contracts to neutral financial chart
data. It depends on `FinancialChartRenderer`, not on a vendor chart API. The default
`lightweightChartsRenderer` adapter is the only module that imports `lightweight-charts`; it has no Socket.IO,
Binance, backend-service, repository, or Strategy Registry dependency and performs no network access.

`MarketDataDashboard`, `MarketPanel`, and `CandlestickChart` accept an optional renderer for future product areas
and tests. This keeps chart lifecycle and vendor-specific series configuration behind one deep interface while
leaving market subscriptions and strategy execution in their existing modules. When the renderer reaches the oldest
loaded logical range, it reports a neutral boundary callback; the market-data hook then requests older candles through
the typed Market Data Service transport. See
[`ADR-0010`](../../docs/adr/0010-lightweight-charts-renderer-seam.md).

## Route composition

Pages stay thin and use feature modules:

```tsx
import { MarketDataDashboard } from '@/features/market-data';

export default function RealtimePage() {
  return <MarketDataDashboard />;
}
```

The page decides where a capability appears. The feature implements that capability. A generic shared UI
primitive supports the feature:

```text
shared/ui/Table
  → generic rows, columns, and interaction

features/backtests/TradeTable
  → understands entry, exit, fees, slippage, and profit

app/(dashboard)/backtests/[experimentId]/page.tsx
  → decides that TradeTable appears at this URL
```

## Server and Client Components

Keep pages and layouts as Server Components by default. Add `"use client"` only to the first module that needs
state, effects, event handlers, context, Socket.IO, or browser/chart APIs. Everything imported below a client
entry joins the client module graph, so never mark the root layout or the entire dashboard as a Client Component.

For this project:

- route layouts, initial session checks, and non-interactive shells stay on the server;
- candlestick charts, realtime controls, Socket.IO hooks, and interactive forms run on the client;
- props passed from a Server Component to a Client Component must be serializable;
- client providers should wrap only the routes that need them, as deep in the tree as practical.

## Backend and realtime flows

Next.js does not replace the Express backend. Express remains authoritative for authentication, authorization,
market data, strategies, search, backtests, ranking, news, and persistence.

```text
Server Component
  → Feature *Server function
  → shared/api/serverHttpClient
  → Express

Client Component
  → Feature *Client function
  → shared/api/browserHttpClient
  → Express

Realtime feature
  → shared/realtime/socketClient
  → Express Socket.IO
```

- Components and pages must not scatter raw `fetch` calls or Express paths throughout the tree.
- Feature API functions return feature-owned DTOs and normalize backend failures into one shared `ApiError`.
- The shared HTTP clients own the base URL, credentials, request IDs, cancellation/timeout behavior, and parsing of
  the backend's `ApiResponse` envelope.
- Do not mirror Express endpoints in catch-all Next Route Handlers or duplicate business workflows in Server
  Actions. A Next handler is allowed only for a genuine frontend-specific adaptation.
- The frontend never calls Binance or another exchange directly.

Socket.IO is client-only. Keep one browser connection, register named listeners from effects, remove the same
listeners during cleanup, and subscribe/unsubscribe chart IDs without creating one connection per chart. Socket
disconnect and reconnect are normal feature state (`LIVE`, `RECONNECTING`, or `STALE`), not rendering exceptions.

## Authentication

The existing authentication decision remains authoritative:

- Express owns the httpOnly, Postgres-backed session cookie.
- Browser code never reads or stores the session token.
- The protected dashboard layout may call Express's current-session endpoint and redirect a missing session to
  `/login`, but this is only a user-experience gate.
- Express authorizes every HTTP operation, and the Socket.IO handshake validates the same cookie.
- Role checks in the frontend control visibility only; they are never the security enforcement point.

## File structure

```text
apps/frontend/
├── README.md
├── public/
├── src/
│   ├── app/                              # Next.js routes and composition only
│   │   ├── (auth)/                       # Route group; not part of the URL
│   │   │   └── login/
│   │   │       └── page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx                # Session gate and dashboard shell
│   │   │   ├── loading.tsx
│   │   │   ├── error.tsx
│   │   │   ├── realtime/
│   │   │   │   └── page.tsx
│   │   │   ├── strategies/
│   │   │   │   └── page.tsx
│   │   │   ├── discovery/
│   │   │   │   └── page.tsx
│   │   │   ├── backtests/
│   │   │   │   └── [experimentId]/
│   │   │   │       └── page.tsx
│   │   │   ├── leaderboard/
│   │   │   │   └── page.tsx
│   │   │   ├── news/
│   │   │   │   └── page.tsx
│   │   │   └── settings/
│   │   │       └── page.tsx
│   │   ├── globals.css
│   │   ├── layout.tsx                    # Root HTML/body and metadata
│   │   ├── page.tsx                      # Redirect to the default authenticated route
│   │   ├── not-found.tsx
│   │   └── global-error.tsx
│   │
│   ├── features/
│   │   ├── dashboard/
│   │   │   ├── components/
│   │   │   │   ├── DashboardShell.tsx
│   │   │   │   └── ProductLogoMark.tsx
│   │   │   └── index.ts
│   │   ├── auth/
│   │   │   ├── api/
│   │   │   │   ├── authClient.ts
│   │   │   │   └── authServer.ts
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── schemas/
│   │   │   ├── types/
│   │   │   ├── index.ts
│   │   │   └── server.ts
│   │   ├── market-data/
│   │   │   ├── api/
│   │   │   ├── charting/
│   │   │   │   └── marketChartData.ts  # Candle/signals → neutral chart data
│   │   │   ├── components/
│   │   │   │   ├── MarketDataDashboard.tsx
│   │   │   │   ├── RealtimeConnectionPanel.tsx
│   │   │   │   └── CandlestickChart.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useRealtimeConnection.ts
│   │   │   │   └── useMarketSubscription.ts
│   │   │   ├── state/
│   │   │   ├── types/
│   │   │   └── index.ts
│   │   ├── strategy-library/
│   │   ├── combinations/
│   │   ├── discovery/
│   │   ├── backtests/
│   │   ├── leaderboard/
│   │   └── news/
│   │
│   └── shared/
│       ├── charting/
│       │   ├── chartRenderer.ts       # Vendor-neutral renderer interface
│       │   ├── lightweightChartsRenderer.ts
│       │   └── defaultChartRenderer.ts
│       ├── api/
│       │   ├── apiError.ts
│       │   ├── browserHttpClient.ts
│       │   └── serverHttpClient.ts
│       ├── config/
│       │   ├── env.client.ts
│       │   └── env.server.ts
│       ├── realtime/
│       │   ├── socketClient.ts
│       │   ├── socketProvider.tsx
│       │   └── useSocket.ts
│       ├── ui/
│       ├── hooks/
│       ├── lib/
│       └── types/
│
├── tests/                                 # Centralized but still feature-oriented
│   ├── unit/
│   │   ├── features/
│   │   └── shared/
│   ├── integration/
│   │   └── features/
│   ├── e2e/
│   ├── fixtures/
│   ├── mocks/
│   └── setup/
├── .env.example
├── next.config.ts
├── postcss.config.mjs
├── eslint.config.mjs
├── vitest.config.mts
├── playwright.config.ts
├── tsconfig.json
├── Dockerfile
└── package.json
```

## Tailwind CSS

Use Tailwind through its PostCSS integration and import it once from `src/app/globals.css`. Keep project design
tokens with the Tailwind theme/CSS variables, reusable primitives in `shared/ui`, and product-aware compositions
inside their features. Use CSS Modules only for isolated styling that utilities cannot express cleanly.

## Tests and production gates

- Unit tests cover pure formatters, reducers/state, schemas, hooks, and synchronous UI behavior.
- Integration tests cover feature behavior with HTTP and Socket.IO adapters replaced by controlled test adapters.
- Issue #27 tests the connection card and Socket.IO lifecycle with Vitest, while its production Compose dashboard is
  browser-smoke-tested against the real backend.
- Add Playwright to CI with the first end-to-end product flow. That suite will cover the production build with
  Express: login cookie flow, protected navigation, realtime connect/disconnect, four chart subscriptions, and a
  complete backtest flow.
- Verify future async Server Components through E2E tests rather than fragile implementation-level unit tests.
- Current CI runs lockfile installation, migration deployment, formatting, ESLint, TypeScript, unit/integration
  tests, `next build`, and Compose validation. Never suppress TypeScript build failures.

## Production deployment

Run Next.js and Express as separate processes behind one reverse proxy:

```text
Browser
  → Reverse proxy
      /                 → Next.js
      /api/*            → Express
      /socket.io/*      → Express Socket.IO
```

Do not attach Socket.IO to a custom Next.js server. Keeping one browser-visible origin simplifies the session
cookie and avoids cross-origin credential configuration. Only variables prefixed with `NEXT_PUBLIC_` may enter
browser code, and those variables must never contain secrets.
