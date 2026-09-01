import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type {
  SaveStrategyRequest,
  StrategyCatalog,
} from '@crypto-strategy-lab/shared';
import { SingularStrategyBuilder } from '../../../../src/features/combinations';

const catalog: StrategyCatalog = {
  strategyIds: ['ma', 'rsi'],
  strategies: [
    {
      id: 'ma',
      paramsSchema: {
        type: 'object',
        properties: {
          fast: { type: 'integer', default: 20, minimum: 1 },
          slow: { type: 'integer', default: 50, minimum: 2 },
        },
      },
    },
    {
      id: 'rsi',
      paramsSchema: {
        type: 'object',
        properties: { period: { type: 'integer', default: 14, minimum: 2 } },
      },
    },
  ],
};

describe('SingularStrategyBuilder', () => {
  it('creates and saves a named standalone strategy version', async () => {
    const onSave = vi.fn<(request: SaveStrategyRequest) => void>();
    render(<SingularStrategyBuilder catalog={catalog} onSave={onSave} />);

    expect(
      screen.getByRole('heading', { name: 'Singular Strategy' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Select MA strategy' }),
    ).toHaveAttribute('aria-pressed', 'true');

    fireEvent.change(screen.getByRole('spinbutton', { name: 'MA fast' }), {
      target: { value: '10' },
    });
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Singular strategy name' }),
      {
        target: { value: 'Fast trend' },
      },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Save singular strategy' }),
    );

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        name: 'Fast trend',
        params: { fast: 10, slow: 50 },
        strategyId: 'ma',
      }),
    );
  });
});
