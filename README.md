# Crypto Strategy Lab

Crypto Strategy Backtesting and Simulation System. This system uses a **Modular Monolith** architecture designed as a `pnpm workspace` monorepo.

## Project Structure
- `packages/shared`: Contains Prisma configuration (Schema, Models), Database Connection, Seed script, and the Backtest Queue logic.
- `apps/backtest-worker`: A standalone worker that processes the `BacktestJob` queue (implementing an Exponential Backoff algorithm and atomic lock mechanisms).
- *(Other modules such as the backend API, frontend, and sentiment service will be added here)*

---

## Prerequisites
- **Node.js** >= 20.0.0
- **pnpm** >= 9 (Install via: `npm install -g pnpm`)

---

## Local Development Guide

### Step 1: Start the Database (Prisma Postgres)
At the root of the project, open Terminal 1 and run the following command (keep this terminal open):
```bash
npx prisma dev
```
*This command launches a local Prisma Postgres instance and automatically creates/configures the `.env` file containing the `DATABASE_URL`.*

### Step 2: Install Dependencies and Configure Schema
Open Terminal 2 at the root directory, install dependencies, and push the database schema:
```bash
# Install dependencies
pnpm install

# Generate the Prisma Client (so TypeScript recognizes the models)
npx pnpm --filter @crypto-strategy-lab/shared run prisma:generate

# Push the schema to the local database
npx pnpm --filter @crypto-strategy-lab/shared run prisma:db-push
```

### Step 3: Seed the Database
To populate the system with dummy data, including creating a sample Job in the queue:
```bash
npx pnpm --filter @crypto-strategy-lab/shared run prisma:seed
```

### Step 4: Start the Job Worker
The Worker will automatically connect to the Database, fetch jobs in the `PENDING` state, and process them:
```bash
npx pnpm --filter @crypto-strategy-lab/backtest-worker start
```
*Note: If the queue is empty, the Worker will intelligently fall back to a sleep mode using Exponential Backoff.*

---

## Testing
Run automated tests (especially the test designed to prevent Race Conditions among concurrent Workers):
```bash
npx pnpm --filter @crypto-strategy-lab/shared test
```
