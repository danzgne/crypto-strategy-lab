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
    { id: 'bollinger', paramsSchema: { properties: {}, type: 'object' } },
    {
      id: 'support-resistance',
      paramsSchema: { properties: {}, type: 'object' },
    },
  ],
  strategyIds: ['ma', 'rsi', 'bollinger', 'support-resistance'],
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
  });
});
