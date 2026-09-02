import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { StrategyParamsSchema } from '@crypto-strategy-lab/shared';

import { DefaultParamsEditor } from '../../../../src/features/strategies/editors/DefaultParamsEditor';

const emptySchema: StrategyParamsSchema = { type: 'object', properties: {} };

const maSchema: StrategyParamsSchema = {
  type: 'object',
  properties: {
    fast: { type: 'integer', default: 20 },
    slow: { type: 'integer', default: 50 },
  },
};

describe('DefaultParamsEditor', () => {
  it('picks up the real schema once it loads, instead of staying stuck on the empty fallback the caller rendered first', () => {
    const params = { fast: 20, slow: 50 };

    const { rerender } = render(
      <DefaultParamsEditor
        idPrefix="entry-1"
        onChange={vi.fn()}
        params={params}
        paramsSchema={emptySchema}
      />,
    );

    expect(
      screen.getByText('This strategy has no configurable parameters.'),
    ).toBeInTheDocument();

    rerender(
      <DefaultParamsEditor
        idPrefix="entry-1"
        onChange={vi.fn()}
        params={params}
        paramsSchema={maSchema}
      />,
    );

    expect(screen.getByLabelText('fast')).toHaveValue(20);
    expect(screen.getByLabelText('slow')).toHaveValue(50);
  });
});
