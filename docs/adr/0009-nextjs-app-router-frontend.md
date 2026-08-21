# Next.js App Router for the frontend

**Status:** accepted. Supersedes the React/Vite frontend portion of [ADR-0001](0001-tech-stack-and-modular-monolith.md).

ADR-0001 originally selected a React/TypeScript/Vite SPA. During issue #27 planning, the team chose a
production-oriented, feature-based frontend and accepted Next.js App Router, TypeScript, and Tailwind CSS after
reviewing the additional runtime and rendering tradeoffs. The accepted structure is documented in
[`apps/frontend/README.md`](../../apps/frontend/README.md).

## Decision

Use Next.js App Router as the frontend runtime while keeping Express as the only business API and Socket.IO
server.

- `src/app` owns routes, layouts, metadata, and composition.
- `src/features` owns product behavior and product-aware UI.
- `src/shared` owns generic UI and browser infrastructure.
- Client Components are limited to interactive leaves such as Socket.IO hooks and chart controls.
- The browser connects to Express directly for HTTP and Socket.IO; Next Route Handlers and Server Actions must
  not duplicate backend workflows.
- Production images use Next's standalone output. The current build uses Next's supported Webpack builder because
  it is reliable in restricted CI and container build environments where Turbopack's worker may not bind an
  internal loopback port.

## Consequences

- The frontend is a server process rather than a static Vite bundle, so local Compose and deployment must run it
  separately from Express.
- App Router layouts and server/client boundaries provide a stable production structure for future authenticated
  dashboard routes.
- The team must keep Express authoritative for authentication, authorization, domain logic, and persistence to
  avoid creating two backend implementations.
- Browser-only environment values must use the `NEXT_PUBLIC_` prefix and can never contain secrets.
- Issue #27's original Vite wording is obsolete; its transport and visible-status outcomes remain unchanged.
