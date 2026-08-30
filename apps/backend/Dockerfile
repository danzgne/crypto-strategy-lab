# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.19.0 --activate
WORKDIR /workspace

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/backtest-worker/package.json apps/backtest-worker/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/strategy-engine/package.json packages/strategy-engine/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY tsconfig.base.json eslint.config.mjs prisma.config.ts ./
COPY prisma prisma
COPY packages/shared packages/shared
COPY packages/strategy-engine packages/strategy-engine
COPY apps/backend apps/backend
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm prisma:generate \
    && pnpm --filter @crypto-strategy-lab/shared build \
    && pnpm --filter @crypto-strategy-lab/strategy-engine build \
    && pnpm --filter @crypto-strategy-lab/backend build \
    && pnpm --filter @crypto-strategy-lab/backend deploy --prod /opt/backend

FROM build AS migrate
CMD ["pnpm", "prisma:migrate:deploy"]

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-http-header-size=131072"
WORKDIR /app
COPY --from=build --chown=node:node /opt/backend ./
USER node
EXPOSE 3100
CMD ["node", "dist/index.js"]

