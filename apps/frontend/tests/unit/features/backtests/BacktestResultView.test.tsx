import { render, screen } from '@testing-library/react';
import type { BacktestResultResponse } from '@crypto-strategy-lab/shared';
import { describe, expect, it, vi } from 'vitest';

vi.mock(
  '../../../../src/features/market-data/components/CandlestickChart',
  () => ({
    CandlestickChart: () => <div data-testid="backtest-chart" />,
  }),
);

vi.mock('../../../../src/features/backtests/hooks/useBacktest', () => ({
  useBacktest: vi.fn(),
}));

import { BacktestResultView } from '../../../../src/features/backtests/components/BacktestResultView';
import { useBacktest } from '../../../../src/features/backtests/hooks/useBacktest';

describe('BacktestResultView', () => {
  it('renders the reference result layout with six visible cards and Vietnamese explainers', () => {
    vi.mocked(useBacktest).mockReturnValue({
      error: null,
      loading: false,
      result: completedResult,
    });

    render(<BacktestResultView experimentId="experiment-1" />);

    expect(screen.getByTestId('backtest-chart')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Backtest Results' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Winrate')).toBeInTheDocument();
    expect(screen.getByText('Wins')).toBeInTheDocument();
    expect(screen.getByText('Losses')).toBeInTheDocument();
    expect(screen.getByText('Total Profit')).toBeInTheDocument();
    expect(screen.getByText('Max Drawdown')).toBeInTheDocument();
    expect(screen.getByText('Total Trades')).toBeInTheDocument();
    expect(screen.queryByText('Score')).not.toBeInTheDocument();
    expect(screen.queryByText('Profit Factor')).not.toBeInTheDocument();
    expect(screen.queryByText('Sharpe Ratio')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Cách tính Profit' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Giả định Backtest' }),
    ).toBeInTheDocument();
    expect(screen.getByText('TAKE_PROFIT')).toBeInTheDocument();
  });
});

const completedResult: BacktestResultResponse = {
  candles: [
    {
      close: '110',
      closeTime: 119_999,
      high: '111',
      isClosed: true,
      low: '99',
      open: '100',
      openTime: 60_000,
      pair: 'BTCUSDT',
      timeframe: '1m',
      volume: '10',
    },
  ],
  datasetFingerprint: 'fingerprint',
  endTime: 120_000,
  evaluatorVersion: 'default-v1',
  experimentId: 'experiment-1',
  failureReason: null,
  initialInvestment: '1000',
  jobId: 'job-1',
  metrics: {
    losses: 0,
    maxDrawdown: '0',
    maxDrawdownAmount: '0',
    profitFactor: null,
    profitFactorInfinite: true,
    return: '0.1',
    score: '0.4',
    sharpeRatio: '0',
    totalProfit: '100',
    totalTrades: 1,
    winRate: '1',
    wins: 1,
  },
  pair: 'BTCUSDT',
  simulationRulesVersion: 'historical-v1',
  slippage: '5',
  startTime: 60_000,
  status: 'completed',
  strategyId: 'ma',
  strategyParams: { fast: 20, slow: 50 },
  strategyVersionId: 'version-1',
  timeframe: '1m',
  trades: [
    {
      direction: 'LONG',
      entryPrice: '100',
      entryTime: 60_000,
      exitPrice: '110',
      exitReason: 'TAKE_PROFIT',
      exitTime: 120_000,
      id: 'trade-1',
      investment: '1000',
      pair: 'BTCUSDT',
      profit: '100',
      slippage: '0',
      stopLoss: '95',
      takeProfit: '110',
      transactionCost: '1.6',
    },
  ],
  transactionCost: '0.0008',
};
