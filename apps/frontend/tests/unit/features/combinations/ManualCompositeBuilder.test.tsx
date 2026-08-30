import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type {
  CompositeStrategyRequest,
  StrategyCatalog,
} from '@crypto-strategy-lab/shared';

import { ManualCompositeBuilder } from '../../../../src/features/combinations';

const catalog: StrategyCatalog = {
  strategyIds: ['ma', 'rsi'],
  strategies: [
    {
      id: 'ma',
      paramsSchema: {
        type: 'object',
        properties: {
          fast: { type: 'integer', default: 20 },
          slow: { type: 'integer', default: 50 },
        },
      },
    },
    {
      id: 'rsi',
      paramsSchema: {
        type: 'object',
        properties: {
          period: { type: 'integer', default: 14 },
        },
      },
    },
  ],
};

describe('ManualCompositeBuilder', () => {
  it('builds a weighted composite from unique members with dynamic parameters and no mode/error panels', async () => {
    const onCompositeChange = vi.fn();
    render(
      <ManualCompositeBuilder
        catalog={catalog}
        onCompositeChange={onCompositeChange}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Composite Strategy' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Composition mode' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    const addStrategy = screen.getByRole('combobox', {
      name: 'Add strategy to composite',
    });
    fireEvent.change(addStrategy, { target: { value: 'ma' } });
    fireEvent.change(addStrategy, { target: { value: 'rsi' } });

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

    fireEvent.change(addStrategy, { target: { value: 'ma' } });
    expect(screen.getAllByRole('spinbutton', { name: 'MA fast' })).toHaveLength(
      2,
    );
    const secondMaFast = screen.getAllByRole('spinbutton', {
      name: 'MA fast',
    })[1];
    if (secondMaFast === undefined) throw new Error('Expected second MA');
    fireEvent.change(secondMaFast, { target: { value: '5' } });
    await waitFor(() => {
      expect(onCompositeChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          members: expect.arrayContaining([
            expect.objectContaining({
              strategyId: 'ma',
              params: { fast: 10, slow: 50 },
            }),
            expect.objectContaining({
              strategyId: 'ma',
              params: { fast: 5, slow: 50 },
            }),
          ]),
        }),
      );
    });

    fireEvent.change(secondMaFast, { target: { value: '10' } });
    await waitFor(() =>
      expect(onCompositeChange).toHaveBeenLastCalledWith(null),
    );

    fireEvent.change(secondMaFast, { target: { value: '5' } });
    await waitFor(() => {
      expect(onCompositeChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          members: expect.arrayContaining([
            expect.objectContaining({
              strategyId: 'ma',
              params: { fast: 10, slow: 50 },
            }),
            expect.objectContaining({
              strategyId: 'ma',
              params: { fast: 5, slow: 50 },
            }),
          ]),
        }),
      );
    });
  });
});
