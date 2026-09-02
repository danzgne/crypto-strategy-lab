import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { LibraryEntryDetail } from '@crypto-strategy-lab/shared';
import type { StrategyLibraryState } from '../../../../src/features/strategies';

const { addVersion, refresh } = vi.hoisted(() => ({
  addVersion: vi.fn(),
  refresh: vi.fn(),
}));

const ruleEntry: LibraryEntryDetail = {
  id: 'entry-1',
  name: 'RSI_THRESHOLD',
  description: null,
  tags: [],
  kind: 'singular',
  strategyId: 'rule',
  source: 'USER_PROMPT',
  sourceInput: 'Long when RSI below 30',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  archivedAt: null,
  latestVersion: {
    id: 'version-1',
    versionTag: 'tag-1',
    libraryVersion: '1.0.1',
    createdAt: '2026-09-01T00:00:00.000Z',
    params: {
      indicators: [{ name: 'RSI', period: 14 }],
      conditions: {
        long: [{ indicator: 'RSI', operator: '<', value: 25 }],
        short: [{ indicator: 'RSI', operator: '<', value: 75 }],
      },
      timeframe: '5m',
    },
  },
  versions: [
    {
      id: 'version-1',
      versionTag: 'tag-1',
      libraryVersion: '1.0.1',
      createdAt: '2026-09-01T00:00:00.000Z',
      params: {
        indicators: [{ name: 'RSI', period: 14 }],
        conditions: {
          long: [{ indicator: 'RSI', operator: '<', value: 25 }],
          short: [{ indicator: 'RSI', operator: '<', value: 75 }],
        },
        timeframe: '5m',
      },
    },
  ],
};

addVersion.mockResolvedValue(ruleEntry);

const secondVersion = {
  id: 'version-2',
  versionTag: 'tag-2',
  libraryVersion: '1.0.2',
  createdAt: '2026-09-02T00:00:00.000Z',
  params: {
    indicators: [{ name: 'RSI', period: 21 }],
    conditions: ruleEntry.latestVersion.params!.conditions,
    timeframe: '5m',
  },
};

const entryWithSecondVersion: LibraryEntryDetail = {
  ...ruleEntry,
  latestVersion: secondVersion,
  versions: [...ruleEntry.versions, secondVersion],
};

const emptyLibrary: StrategyLibraryState = {
  builtins: [],
  entries: [],
  total: 0,
  loading: false,
  loadingMore: false,
  error: null,
  hasMore: false,
  showArchived: false,
  setShowArchived: vi.fn(),
  loadMore: vi.fn(),
  refresh: vi.fn(),
};

vi.mock('../../../../src/features/strategies/hooks/useLibraryEntry', () => ({
  useLibraryEntry: () => {
    const [entry, setEntry] = useState<LibraryEntryDetail>(ruleEntry);
    refresh.mockImplementation(async () => {
      setEntry(entryWithSecondVersion);
    });
    return { entry, loading: false, error: null, notFound: false, refresh };
  },
}));

vi.mock('../../../../src/features/strategies/hooks/useStrategyLibrary', () => ({
  useStrategyLibrary: () => emptyLibrary,
}));

vi.mock(
  '../../../../src/features/strategies/api/strategyLibraryClient',
  async () => {
    const actual = await vi.importActual<
      typeof import('../../../../src/features/strategies/api/strategyLibraryClient')
    >('../../../../src/features/strategies/api/strategyLibraryClient');
    return {
      ...actual,
      strategyLibraryClient: { ...actual.strategyLibraryClient, addVersion },
    };
  },
);

import { StrategyEntryDetail } from '../../../../src/features/strategies/components/StrategyEntryDetail';

describe('StrategyEntryDetail', () => {
  it('renders the RuleStrategy editor for a rule entry standalone, without any other page having registered it first', () => {
    render(<StrategyEntryDetail entryId="entry-1" />);

    expect(screen.getByLabelText('Timeframe')).toHaveValue('5m');
    expect(
      screen.queryByText('This strategy has no configurable parameters.'),
    ).not.toBeInTheDocument();
  });

  it('saves the currently-loaded params, not an empty draft, when only the Library Version changes', async () => {
    render(<StrategyEntryDetail entryId="entry-1" />);

    fireEvent.change(screen.getByLabelText('Save as new Library Version'), {
      target: { value: '1.0.2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save version' }));

    await waitFor(() => expect(addVersion).toHaveBeenCalledTimes(1));
    expect(addVersion).toHaveBeenCalledWith('entry-1', {
      libraryVersion: '1.0.2',
      params: ruleEntry.latestVersion.params,
    });
  });

  it('shows the new version after saving, instead of leaving the old one selected', async () => {
    addVersion.mockResolvedValueOnce(entryWithSecondVersion);
    render(<StrategyEntryDetail entryId="entry-1" />);

    fireEvent.change(screen.getByLabelText('Save as new Library Version'), {
      target: { value: '1.0.2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save version' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Period for indicator 1')).toHaveValue(21),
    );
    expect(screen.queryByText(/not latest/)).not.toBeInTheDocument();
    expect(screen.getByText('v1.0.1')).toBeInTheDocument();
  });
});
