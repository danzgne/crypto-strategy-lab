import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StrategyCatalog } from '@crypto-strategy-lab/shared';
import { DiscoverySessionControl } from '../../../../src/features/search/components/DiscoverySessionControl';
import { DiscoveryProgressCard } from '../../../../src/features/search/components/DiscoveryProgressCard';
import { DiscoveryRunHistoryTable } from '../../../../src/features/search/components/DiscoveryRunHistoryTable';
import type { UseDiscoverySessionResult } from '../../../../src/features/search/hooks/useDiscoverySession';

const catalog: StrategyCatalog = {
  strategies: [
    { id: 'ma', paramsSchema: { properties: {}, type: 'object' } },
    { id: 'rsi', paramsSchema: { properties: {}, type: 'object' } },
    { id: 'bb', paramsSchema: { properties: {}, type: 'object' } },
    {
      id: 'sr',
      paramsSchema: { properties: {}, type: 'object' },
    },
  ],
  strategyIds: ['ma', 'rsi', 'bb', 'sr'],
};

function createMockDiscovery(
  overrides?: Partial<UseDiscoverySessionResult>,
): UseDiscoverySessionResult {
  return {
    error: null,
    history: [],
    loading: false,
    pauseSession: vi.fn(),
    pinExperiment: vi.fn(),
    progress: null,
    refreshHistory: vi.fn(),
    resumeSession: vi.fn(),
    session: null,
    startSession: vi.fn(),
    stopSession: vi.fn(),
    ...overrides,
  };
}

describe('Discovery UI Components', () => {
  describe('DiscoverySessionControl', () => {
    it('shows 3 methods with only Random Search active and the others disabled', () => {
      const mockDiscovery = createMockDiscovery();
      render(
        <DiscoverySessionControl catalog={catalog} discovery={mockDiscovery} />,
      );

      expect(screen.getByText('Random Search')).toBeInTheDocument();
      expect(screen.getByText('Domain-guided')).toBeInTheDocument();
      expect(screen.getByText('Genetic')).toBeInTheDocument();

      const domainBtn = screen.getByRole('button', { name: /Domain-guided/i });
      const geneticBtn = screen.getByRole('button', { name: /Genetic/i });
      expect(domainBtn).toBeDisabled();
      expect(geneticBtn).toBeDisabled();
    });

    it('starts discovery session when Start Discovery Session is clicked', async () => {
      const mockDiscovery = createMockDiscovery();
      render(
        <DiscoverySessionControl catalog={catalog} discovery={mockDiscovery} />,
      );

      const startBtn = screen.getByRole('button', {
        name: /Start Discovery Session/i,
      });
      fireEvent.click(startBtn);

      expect(mockDiscovery.startSession).toHaveBeenCalledWith(
        expect.objectContaining({
          algorithm: 'random',
          searchSpace: expect.objectContaining({
            pair: 'BTCUSDT',
            timeframe: '1h',
          }),
        }),
      );
    });

    it('displays pause and stop buttons when session is active', () => {
      const mockDiscovery = createMockDiscovery({
        session: {
          algorithm: 'random',
          bestScore: 1.2,
          searchSpace: {
            enabledStrategies: [],
            endTime: 0,
            pair: 'BTCUSDT',
            permittedCombinationModes: ['majority'],
            startTime: 0,
            timeframe: '1h',
          },
          sessionId: 's-1',
          startedAt: Date.now(),
          status: 'ACTIVE',
          stopPolicy: {},
          totalAcceptedCandidates: 10,
          totalRunsCompleted: 0,
          userId: 'u-1',
        },
      });

      render(
        <DiscoverySessionControl catalog={catalog} discovery={mockDiscovery} />,
      );

      expect(
        screen.getByRole('button', { name: /Pause Discovery/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Stop Session/i }),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Pause Discovery/i }));
      expect(mockDiscovery.pauseSession).toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: /Stop Session/i }));
      expect(mockDiscovery.stopSession).toHaveBeenCalled();
    });

    it('populates form fields from active discovery session', () => {
      const mockDiscovery = createMockDiscovery({
        session: {
          algorithm: 'random',
          bestScore: 2.5,
          searchSpace: {
            enabledStrategies: [{ id: 'ma' }, { id: 'rsi' }],
            endTime: 1700000000000,
            pair: 'ETHUSDT',
            permittedCombinationModes: ['weighted'],
            startTime: 1690000000000,
            timeframe: '15m',
          },
          sessionId: 's-active-1',
          startedAt: Date.now(),
          status: 'ACTIVE',
          stopPolicy: {
            maxCandidates: 150,
            timeBudgetMs: 30 * 60 * 1000,
          },
          totalAcceptedCandidates: 45,
          totalRunsCompleted: 1,
          userId: 'u-1',
        },
      });

      render(
        <DiscoverySessionControl catalog={catalog} discovery={mockDiscovery} />,
      );

      const pairSelect = screen.getByRole('combobox', { name: /Market Pair/i });
      const timeframeSelect = screen.getByRole('combobox', {
        name: /Timeframe/i,
      });
      const maxCandidatesInput = screen.getByLabelText(
        /Max Candidates \/ Run/i,
      );
      const timeBudgetInput = screen.getByLabelText(/Time Budget \(min\)/i);

      expect(pairSelect).toHaveValue('ETHUSDT');
      expect(timeframeSelect).toHaveValue('15m');
      expect(maxCandidatesInput).toHaveValue(150);
      expect(timeBudgetInput).toHaveValue(30);
    });

    it('restores draft settings from localStorage when no active session exists', () => {
      const storedConfig = {
        maxCandidates: 80,
        modes: ['majority'],
        pair: 'SOLUSDT',
        strategies: ['bb', 'sr'],
        timeBudgetMinutes: 45,
        timeframe: '4h',
      };
      localStorage.setItem(
        'crypto-strategy-lab:discovery-form-config',
        JSON.stringify(storedConfig),
      );

      const mockDiscovery = createMockDiscovery({ session: null });
      render(
        <DiscoverySessionControl catalog={catalog} discovery={mockDiscovery} />,
      );

      const pairSelect = screen.getByRole('combobox', { name: /Market Pair/i });
      const timeframeSelect = screen.getByRole('combobox', {
        name: /Timeframe/i,
      });
      const maxCandidatesInput = screen.getByLabelText(
        /Max Candidates \/ Run/i,
      );
      const timeBudgetInput = screen.getByLabelText(/Time Budget \(min\)/i);

      expect(pairSelect).toHaveValue('SOLUSDT');
      expect(timeframeSelect).toHaveValue('4h');
      expect(maxCandidatesInput).toHaveValue(80);
      expect(timeBudgetInput).toHaveValue(45);

      localStorage.removeItem('crypto-strategy-lab:discovery-form-config');
    });
  });

  describe('DiscoveryProgressCard', () => {
    it('renders progress, best score, in-flight jobs, and terminal stop reason callout', () => {
      const mockDiscovery = createMockDiscovery({
        progress: {
          acceptedCandidates: 47,
          bestScore: 1.8421,
          inFlightJobs: 3,
          maxCandidates: 100,
          sessionId: 's-1',
          sessionStatus: 'ACTIVE',
          stopReason: 'CANDIDATE_CAP',
          totalRunsCompleted: 2,
          userId: 'u-1',
        },
      });

      render(<DiscoveryProgressCard discovery={mockDiscovery} />);

      expect(screen.getByText('Tiến trình Discovery')).toBeInTheDocument();
      expect(screen.getByText('47')).toBeInTheDocument();
      expect(screen.getByText('/ 100')).toBeInTheDocument();
      expect(screen.getByText('1.8421')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByTestId('stop-reason-box')).toHaveTextContent(
        'CANDIDATE_CAP',
      );
      expect(screen.getByTestId('stop-reason-box')).toHaveTextContent(
        'Reached candidate quota of 100 accepted unique strategies.',
      );
    });

    it('renders live evaluating candidate banner and best strategy spotlight card', () => {
      const mockDiscovery = createMockDiscovery({
        progress: {
          acceptedCandidates: 12,
          bestCandidate: {
            experimentId: 'exp-best-123',
            maxDrawdown: 0.05,
            mode: 'weighted',
            name: 'Composite (weighted)',
            profit: 520.75,
            returnPct: 0.285,
            score: 2.4581,
            strategyIds: ['ma', 'rsi'],
            winRate: 0.72,
          },
          bestScore: 2.4581,
          inFlightJobs: 1,
          latestCandidate: {
            mode: 'majority',
            name: 'Composite (majority)',
            pair: 'BTCUSDT',
            strategyIds: ['bb', 'sr'],
            timeframe: '1h',
          },
          maxCandidates: 100,
          sessionId: 's-live-1',
          sessionStatus: 'ACTIVE',
          totalRunsCompleted: 0,
          userId: 'u-1',
        },
      });

      render(<DiscoveryProgressCard discovery={mockDiscovery} />);

      // Evaluating banner assertions
      const banner = screen.getByTestId('evaluating-candidate-banner');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent('Đang đánh giá (Evaluating):');
      expect(banner).toHaveTextContent('Composite (majority)');
      expect(banner).toHaveTextContent('BTCUSDT • 1h');
      expect(banner).toHaveTextContent('Majority Vote');
      expect(banner).toHaveTextContent('BB');
      expect(banner).toHaveTextContent('SR');

      // Best candidate spotlight assertions
      const spotlight = screen.getByTestId('best-candidate-spotlight');
      expect(spotlight).toBeInTheDocument();
      expect(spotlight).toHaveTextContent('Best Candidate Spotlight');
      expect(spotlight).toHaveTextContent('2.4581');
      expect(spotlight).toHaveTextContent('+520.75 USDT');
      expect(spotlight).toHaveTextContent('72.0%');
      expect(spotlight).toHaveTextContent('+28.5%');

      const tradesLink = screen.getByTestId('view-best-backtest-link');
      expect(tradesLink).toHaveAttribute('href', '/backtests/exp-best-123');
    });
  });

  describe('DiscoveryRunHistoryTable', () => {
    it('renders historical runs list with stop reasons', () => {
      const mockDiscovery = createMockDiscovery({
        history: [
          {
            acceptedCandidates: 100,
            algorithm: 'random',
            bestScore: 2.15,
            id: 'run-history-1',
            ownerId: 'u-1',
            startedAt: new Date('2026-09-01T10:00:00Z').toISOString(),
            status: 'COMPLETED',
            stopReason: 'CANDIDATE_CAP',
            stoppedAt: new Date('2026-09-01T10:14:00Z').toISOString(),
          },
        ],
      });

      render(<DiscoveryRunHistoryTable discovery={mockDiscovery} />);

      expect(screen.getByText(/Search Runs History/i)).toBeInTheDocument();
      expect(screen.getByText('run-hist')).toBeInTheDocument();
      expect(screen.getByText('CANDIDATE_CAP')).toBeInTheDocument();
      expect(screen.getByText('2.1500')).toBeInTheDocument();
    });

    it('paginates runs list when more than 10 items exist', () => {
      const historyItems = Array.from({ length: 15 }, (_, i) => ({
        acceptedCandidates: 30,
        algorithm: 'random' as const,
        bestScore: 0.5 + i * 0.01,
        id: `run-${String(i + 1).padStart(2, '0')}-test`,
        ownerId: 'u-1',
        startedAt: new Date(Date.now() - i * 60000).toISOString(),
        status: 'COMPLETED' as const,
        stopReason: 'NO_IMPROVEMENT' as const,
        stoppedAt: new Date().toISOString(),
      }));

      const mockDiscovery = createMockDiscovery({ history: historyItems });
      render(<DiscoveryRunHistoryTable discovery={mockDiscovery} />);

      // Shows total count and pagination indicator
      expect(screen.getByText('Search Runs History (15)')).toBeInTheDocument();
      expect(screen.getByTestId('history-pagination-info')).toHaveTextContent(
        'Showing 1 to 10 of 15 runs',
      );
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

      // First page shows item 1 (run-01-t) but not item 15 (run-15-t)
      expect(screen.getByText('run-01-t')).toBeInTheDocument();
      expect(screen.queryByText('run-15-t')).not.toBeInTheDocument();

      const prevBtn = screen.getByRole('button', {
        name: /Previous history page/i,
      });
      const nextBtn = screen.getByRole('button', {
        name: /Next history page/i,
      });

      expect(prevBtn).toBeDisabled();
      expect(nextBtn).toBeEnabled();

      // Click Next to navigate to Page 2
      fireEvent.click(nextBtn);

      expect(screen.getByTestId('history-pagination-info')).toHaveTextContent(
        'Showing 11 to 15 of 15 runs',
      );
      expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
      expect(screen.getByText('run-15-t')).toBeInTheDocument();
      expect(screen.queryByText('run-01-t')).not.toBeInTheDocument();

      expect(prevBtn).toBeEnabled();
      expect(nextBtn).toBeDisabled();

      // Click Previous to go back to Page 1
      fireEvent.click(prevBtn);
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
      expect(screen.getByText('run-01-t')).toBeInTheDocument();
    });
  });
});
