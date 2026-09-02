import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type {
  CompositeStrategyRequest,
  LibraryBuiltin,
} from '@crypto-strategy-lab/shared';

import { ManualCompositeBuilder } from '../../../../src/features/combinations';

const builtins: LibraryBuiltin[] = [
  {
    strategyId: 'ma',
    paramsSchema: {
      type: 'object',
      properties: {
        fast: { type: 'integer', default: 20 },
        slow: { type: 'integer', default: 50 },
      },
    },
  },
  {
    strategyId: 'rsi',
    paramsSchema: {
      type: 'object',
      properties: {
        period: { type: 'integer', default: 14 },
      },
    },
  },
];

describe('ManualCompositeBuilder', () => {
  it('builds a weighted composite from unique members with dynamic parameters', async () => {
    const onCompositeChange = vi.fn();
    render(
      <ManualCompositeBuilder
        builtins={builtins}
        entries={[]}
        onCompositeChange={onCompositeChange}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Composite Strategy' }),
    ).toBeInTheDocument();

    const addStrategy = screen.getByRole('combobox', {
      name: 'Add strategy to composite',
    });
    fireEvent.change(addStrategy, { target: { value: 'builtin:ma' } });
    fireEvent.change(addStrategy, { target: { value: 'builtin:rsi' } });

    await waitFor(() =>
      expect(onCompositeChange).toHaveBeenLastCalledWith({
        mode: 'weighted',
        members: [
          {
            strategyId: 'ma',
            params: { fast: 20, slow: 50 },
            weight: 1,
          },
          { strategyId: 'rsi', params: { period: 14 }, weight: 1 },
        ],
        threshold: 0.3,
      } satisfies CompositeStrategyRequest),
    );

    expect(screen.getByRole('spinbutton', { name: 'MA fast' })).toHaveValue(20);
    expect(
      screen.getByRole('spinbutton', { name: 'Weight for MA' }),
    ).toHaveValue(1);
    expect(
      screen.getByRole('spinbutton', { name: 'Weighted threshold' }),
    ).toHaveValue(0.3);

    fireEvent.change(screen.getByRole('spinbutton', { name: 'MA fast' }), {
      target: { value: '10' },
    });
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Weighted threshold' }),
      { target: { value: '0.5' } },
    );

    await waitFor(() => {
      expect(onCompositeChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          threshold: 0.5,
          members: expect.arrayContaining([
            expect.objectContaining({
              strategyId: 'ma',
              params: { fast: 10, slow: 50 },
            }),
          ]),
        }),
      );
    });
  });

  it('lists saved singular entries alongside built-ins in the member picker', () => {
    render(
      <ManualCompositeBuilder
        builtins={builtins}
        entries={[
          {
            id: 'entry-1',
            name: 'My RSI dip',
            description: null,
            tags: [],
            kind: 'singular',
            strategyId: 'rsi',
            source: 'MANUAL',
            sourceInput: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            archivedAt: null,
            latestVersion: {
              id: 'version-1',
              versionTag: 'tag',
              libraryVersion: '1.0.0',
              createdAt: '2026-01-01T00:00:00.000Z',
              params: { period: 7 },
            },
          },
        ]}
      />,
    );

    expect(
      screen.getByRole('option', { name: 'Saved · My RSI dip' }),
    ).toBeInTheDocument();
  });
});
