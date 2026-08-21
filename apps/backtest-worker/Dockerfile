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
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY tsconfig.base.json eslint.config.mjs prisma.config.ts ./
COPY prisma prisma
COPY apps/backtest-worker apps/backtest-worker
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm prisma:generate \
    && pnpm --filter @crypto-strategy-lab/backtest-worker build \
    && pnpm --filter @crypto-strategy-lab/backtest-worker deploy --prod /opt/backtest-worker

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /opt/backtest-worker ./
USER node
CMD ["node", "dist/index.js"]
