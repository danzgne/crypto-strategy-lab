# Next.js feature-oriented frontend research

> **Decision outcome:** The team subsequently accepted the Next.js option described in this note. ADR-0009
> records that choice and supersedes ADR-0001's original Vite frontend decision.

**Researched:** 2026-08-21
**Scope:** current Next.js App Router, TypeScript, Tailwind CSS, a separate Express API, and Socket.IO. The
`issue-27-monorepo-scaffold` draft branch was not inspected.

## Recommendation

Keep the accepted **React/TypeScript/Vite** decision for Crypto Strategy Lab unless the team can name a concrete
need for server rendering, streaming, or Next.js layouts that is worth another runtime and another rendering
model.

This is not a quality objection to Next.js. The App Router is production-capable and supports a clean
feature-first structure. The fit is weaker here because:

- the accepted architecture already assigns HTTP business logic, authentication, persistence, and Socket.IO to
  Express ([ADR-0001](../adr/0001-tech-stack-and-modular-monolith.md),
  [ADR-0005](../adr/0005-authentication-multi-tenancy-and-admin-role.md));
- the whole product is behind login, so public SEO/static-content benefits are small;
- candlestick charts, live subscriptions, interactive strategy controls, and browser state must be Client
  Components in Next.js; Next.js documents that state, effects, event handlers, custom hooks, and browser APIs
  require Client Components ([Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components));
- Vite produces a bundle suitable for static hosting, whereas a Next application using Server Components and
  request-time cookie checks needs a Next runtime ([Vite production build](https://vite.dev/guide/build),
  [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting)).

[Issue #27](https://github.com/danzgne/crypto-strategy-lab/issues/27) also explicitly requires React/TS/Vite.
Selecting Next.js therefore requires an ADR that supersedes
ADR-0001 and an update to #27; it should not happen as an incidental scaffold choice.

Choose Next.js if the team deliberately wants server-rendered first loads, streaming/Suspense at route
boundaries, built-in layouts, or a future public/SEO-facing product area. Otherwise, Vite is the smaller and
better-aligned production surface for this authenticated realtime SPA.

The rest of this note is the recommended structure **if Next.js is selected**.

## Architectural rules

1. `src/app` owns URLs, layouts, metadata, loading/error boundaries, and page composition. Pages stay thin.
2. `src/features` owns product behavior and is organized by domain feature, not by technical layer globally.
3. `src/shared` owns genuinely cross-feature frontend infrastructure and reusable UI.
4. `packages/shared` owns backend/frontend transport contracts and domain-event envelopes; it must not contain
   React components or browser state.
5. Express remains the only business API and the Socket.IO server. Do not reproduce its controllers or business
   rules in Next Route Handlers or Server Actions.
6. A feature exposes a small public interface. Other code must not deep-import its internals.

Next.js supports putting `app` under the optional `src` folder. Route groups such as `(dashboard)` organize
routes without changing URLs, `_private` folders are excluded from routing, and colocated files do not become
public routes unless a `page` or `route` file exists
([project structure and conventions](https://nextjs.org/docs/app/getting-started/project-structure)). We should
still keep durable feature code outside `app`: URL restructuring should not force a product-module move.

## Proposed structure

```text
apps/frontend/
├── public/
├── src/
│   ├── app/                              # Routing and page composition only
│   │   ├── (auth)/                       # Group name is not part of the URL
│   │   │   ├── layout.tsx
│   │   │   └── login/
│   │   │       └── page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── _components/              # Dashboard-route-only UI
│   │   │   │   └── dashboardShell.tsx
│   │   │   ├── _providers/
│   │   │   │   └── dashboardProviders.tsx
│   │   │   ├── layout.tsx                # Session gate and dashboard shell
│   │   │   ├── loading.tsx
│   │   │   ├── error.tsx
│   │   │   ├── page.tsx                  # Main market dashboard
│   │   │   ├── strategies/
│   │   │   │   └── page.tsx
│   │   │   ├── backtests/
│   │   │   │   └── [experimentId]/
│   │   │   │       └── page.tsx
│   │   │   ├── discovery/
│   │   │   │   └── page.tsx
│   │   │   ├── leaderboard/
│   │   │   │   └── page.tsx
│   │   │   └── news/
│   │   │       └── page.tsx
│   │   ├── globals.css
│   │   ├── layout.tsx                    # Root HTML/body and global metadata
│   │   ├── not-found.tsx
│   │   └── global-error.tsx
│   │
│   ├── features/
│   │   ├── auth/
│   │   │   ├── api/                      # Named Express endpoint calls
│   │   │   │   ├── authClient.ts
│   │   │   │   └── authServer.ts
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── schemas/                  # Form/response validation
│   │   │   ├── types/
│   │   │   ├── index.ts                  # Client-safe public exports
│   │   │   └── server.ts                 # Server-only public exports
│   │   ├── market-data/
│   │   │   ├── api/
│   │   │   ├── components/
│   │   │   │   └── candlestickChart.client.tsx
│   │   │   ├── hooks/
│   │   │   │   └── useMarketSubscription.ts
│   │   │   ├── state/
│   │   │   ├── types/
│   │   │   └── index.ts
│   │   ├── strategy-library/
│   │   ├── combinations/
│   │   ├── backtests/
│   │   ├── discovery/
│   │   ├── leaderboard/
│   │   └── news/
│   │
│   └── shared/
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
│       ├── ui/                            # Button, Card, Dialog, Skeleton, etc.
│       ├── hooks/
│       ├── lib/
│       └── types/
│
├── tests/                                 # Centralized, but mirrors features
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

Do not create every feature directory empty in the scaffold. Create the structure when its first vertical slice
is implemented.

### Import boundaries

Use these dependency directions:

```text
app → features → shared
               ↘ packages/shared
shared ─────────→ packages/shared
```

- `app` may compose multiple features.
- A feature may import `shared` and transport contracts, but never `app`.
- A feature must not deep-import another feature. If cross-feature reuse is real, import that feature's
  `index.ts`/`server.ts`, compose at the page level, or move a genuinely generic capability to `shared`.
- `shared` must not import a feature.
- Add ESLint restricted-import rules for `@/features/*/*` deep imports and for reverse dependencies; directory
  names alone do not enforce architecture.
- Use `server-only` in `authServer.ts`, `serverHttpClient.ts`, and server environment modules so an accidental
  Client Component import fails at build time; Next.js explicitly supports this guard
  ([preventing environment poisoning](https://nextjs.org/docs/app/getting-started/server-and-client-components#preventing-environment-poisoning)).

If `packages/shared` ships uncompiled TypeScript, configure `transpilePackages` for its package name; Next.js
provides this for local monorepo packages
([`transpilePackages`](https://nextjs.org/docs/app/api-reference/config/next-config-js/transpilePackages)).

## Server and Client Components

Pages and layouts are Server Components by default. Keep them that way for session checks, initial REST reads,
and composing the page. Add `'use client'` only at the first component that needs state, effects, event handlers,
context, Socket.IO, or browser/chart APIs. Once a module has `'use client'`, its imports and descendants enter the
client module graph, so marking the dashboard root as client code would erase much of Next.js's advantage
([Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)).

For this project:

- candlestick charts, chart controls, Socket.IO hooks, and interactive forms are Client Components;
- dashboard pages/layouts and non-interactive shells remain Server Components;
- render client providers as deep as possible—normally inside `(dashboard)/layout.tsx`, not around `<html>`—as
  recommended by Next.js's provider guidance;
- browser-only chart libraries may be loaded with `next/dynamic` and `ssr: false` from a Client Component when
  they are not SSR-safe ([lazy loading](https://nextjs.org/docs/app/guides/lazy-loading)).

## Express data access and session authentication

Use one transport path, not scattered `fetch` calls:

```text
Server Component → feature api/*Server → serverHttpClient → Express
Client Component → feature api/*Client → browserHttpClient → Express
Socket hook      → shared/realtime/socketClient             → Express Socket.IO
```

Feature API functions should return frontend DTOs and throw one typed `ApiError`. The shared HTTP clients own
base URL, credentials, response-envelope parsing, abort/timeout behavior, and request IDs. Pages and components
must not know Express paths or parse `ApiResponse` directly.

Prefer a production reverse proxy that exposes the frontend, `/api`, and `/socket.io` on one site. This keeps
the browser configuration and session cookie simple. If the browser calls a different Express origin, the HTTP
client must send credentials and Express must allow the exact frontend origin with credentials; wildcard origin
is incompatible with credentialed Socket.IO requests
([Socket.IO `withCredentials`](https://socket.io/docs/v4/client-options/#withcredentials)).

The accepted auth design remains authoritative:

- Express sets, validates, refreshes, and clears the httpOnly session cookie.
- Client code never reads or stores the session token.
- The dashboard Server layout calls Express's current-session endpoint. A server-side call explicitly forwards
  the incoming cookie obtained with Next.js `cookies()`; reading cookies makes that route request-time rendered
  ([Next.js `cookies`](https://nextjs.org/docs/app/api-reference/functions/cookies)).
- A 401 redirects to `/login`, but this is only a UI gate. Express must authenticate and authorize every HTTP
  request, and the Socket.IO handshake must validate the same cookie.
- Login/logout should call Express rather than add a second Next.js auth implementation.

Do not introduce catch-all Next Route Handlers merely to mirror Express. Next.js says Server Components should
fetch their source directly because calling a Route Handler adds an HTTP round trip; Route Handlers are also not
a full backend replacement ([Backend for Frontend guide](https://nextjs.org/docs/app/guides/backend-for-frontend)).
Use one only for a genuine frontend-specific adaptation that Express should not own.

## Socket.IO integration

Socket.IO must be initialized from client code. Keep one browser-side `Manager`/socket instance, connect it in a
dashboard-scoped provider, register listeners in effects, and always remove those listeners during cleanup. A
market-data hook should subscribe/unsubscribe chart IDs without creating one connection per chart. Socket.IO's
client documentation describes Manager reuse and credentialed cookie requests
([client options](https://socket.io/docs/v4/client-options/)); its Next.js guide places the client behind a
`'use client'` boundary ([Socket.IO with Next.js](https://socket.io/how-to/use-with-nextjs)).

Do **not** attach Socket.IO to a custom Next.js server. Express already owns the realtime server. Next.js warns
that custom servers remove important optimizations and cannot be combined with standalone output
([custom server](https://nextjs.org/docs/app/guides/custom-server)). Production routing should send
`/socket.io` directly to Express.

## Data freshness and caching

Use an explicit policy per resource:

- private user/session/strategy/backtest/leaderboard data: `cache: 'no-store'`;
- initial market candles: fresh REST snapshot followed by Socket.IO updates;
- rapidly changing realtime values: browser/socket state, never the Next server cache;
- globally shared, slower-changing reference/news data: cache only with an explicit lifetime/invalidation rule.

Current Next.js `fetch` is not cached by default; identical fetches in one React render are memoized, and caching
is opt-in ([fetching data](https://nextjs.org/docs/app/getting-started/fetching-data)). Keeping `no-store`
explicit on tenant-private calls makes the security policy reviewable. Never put user-specific results in a
shared cache key. Socket events should update the owning client state/cache rather than call `router.refresh()`
on every tick.

Use `loading.tsx` at meaningful route boundaries and smaller `<Suspense>` boundaries around independently slow
panels. `loading.tsx` automatically creates a Suspense boundary
([loading convention](https://nextjs.org/docs/app/api-reference/file-conventions/loading)).

## Errors and not-found behavior

- Show expected API outcomes—validation errors, unauthorized, conflicts—as typed UI state.
- Throw unexpected rendering failures to the nearest segment `error.tsx`; it must be a Client Component.
- Keep `global-error.tsx` for root-layout failure and include its own `<html>` and `<body>`.
- Use `notFound()` plus the closest `not-found.tsx` for missing resources.
- Treat Socket.IO disconnect/reconnect as normal connection state, not an exception boundary.

These distinctions follow the current Next.js error guidance
([error handling](https://nextjs.org/docs/app/getting-started/error-handling)).

## Tailwind CSS

Use current Tailwind CSS with its PostCSS integration:

```js
// postcss.config.mjs
export default { plugins: { '@tailwindcss/postcss': {} } };
```

```css
/* src/app/globals.css */
@import 'tailwindcss';

@theme {
  /* project color, spacing, typography, and breakpoint tokens */
}
```

This is the current official Next.js setup; Tailwind v4 uses `@tailwindcss/postcss` and a CSS import rather than
the old v3 directives ([Tailwind Next.js guide](https://tailwindcss.com/docs/installation/framework-guides/nextjs),
[Tailwind v4 upgrade guide](https://tailwindcss.com/docs/upgrade-guide)). Import `globals.css` once in the root
layout. Put reusable primitives in `shared/ui`, feature-specific compositions in their feature, and design
tokens in `@theme`; do not turn global CSS into a feature stylesheet.

## Environment variables

Prefer relative browser URLs through the same-site reverse proxy. When separate URLs are unavoidable:

```text
BACKEND_INTERNAL_URL=...       # server only
NEXT_PUBLIC_API_URL=...        # browser visible
NEXT_PUBLIC_SOCKET_URL=...     # browser visible
```

Only `NEXT_PUBLIC_` variables are included in the client bundle, and their values are frozen at `next build`, so
they must never contain secrets and can complicate promoting one Docker image between environments
([environment variables](https://nextjs.org/docs/pages/guides/environment-variables)). Validate server and
client environment modules separately and commit only `.env.example`, never populated `.env*` files.

## Tests and production gates

Centralizing tests under `apps/frontend/tests` is compatible with Next.js; its Vitest guide explicitly permits
either `__tests__` or colocated tests. Preserve feature ownership by mirroring the source tree:

- unit: pure formatters, reducers/state, schemas, and hooks;
- component/integration: user-visible feature behavior with React Testing Library and mocked HTTP/socket
  boundaries;
- E2E: Playwright against real production builds of Next + Express, covering login-cookie flow, protected-route
  redirects, Socket.IO connect/disconnect, four-chart subscriptions, and one critical backtest workflow.

Next.js currently recommends E2E coverage for async Server Components because Vitest does not fully support
them ([Next.js Vitest guide](https://nextjs.org/docs/app/guides/testing/vitest),
[testing overview](https://nextjs.org/docs/app/guides/testing)).

CI should run, in order: dependency lockfile install, formatting check, ESLint, TypeScript, unit/integration tests,
`next build`, then Playwright smoke tests. Do not set `typescript.ignoreBuildErrors`; Next fails production builds
on TypeScript errors by default ([TypeScript build option](https://nextjs.org/docs/app/api-reference/config/next-config-js/typescript)).
On current Next.js, `next build` no longer runs lint, so lint must remain an explicit CI step
([Next.js 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16)).

For self-hosting, run the built-in Next server behind a reverse proxy; use standalone output for a smaller Docker
runtime when needed, but verify monorepo tracing for files outside `apps/frontend`
([self-hosting](https://nextjs.org/docs/app/guides/self-hosting),
[`output: 'standalone'`](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)). Do not merge a
framework migration until the production build and a real Socket.IO E2E round trip pass in CI.

## Decision checkpoint

Before changing the scaffold, the team should answer one question:

> Which required Crypto Strategy Lab screen materially benefits from Next server rendering or streaming enough
> to justify replacing the already accepted Vite SPA and operating a frontend server?

If there is no concrete answer, keep Vite and apply the same `features` / `shared` / centralized-test boundaries
there. If there is, adopt the Next.js structure above and record the decision before implementation.
