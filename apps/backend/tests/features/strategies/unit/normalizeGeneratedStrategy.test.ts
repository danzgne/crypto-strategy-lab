import { describe, expect, it } from 'vitest';

import { normalizeGeneratedStrategy } from '@/api/features/strategies/generation/normalizeGeneratedStrategy';
import type { GenerationWireResponse } from '@/api/features/strategies/generation/wireSchema';

function baseWireResponse(
  overrides: Partial<GenerationWireResponse> = {},
): GenerationWireResponse {
  return {
    name: 'RSI_BB_LB_LONG',
    description: 'LONG when RSI < 30 and price below the Bollinger Lower Band',
    tags: ['RSI', 'Bollinger'],
    indicators: [
      { name: 'RSI', as: null, period: 14 },
      { name: 'BollingerBands', as: null, period: 20, stdDev: 2 },
    ],
    conditions: {
      long: [
        { indicator: 'RSI', operator: '<', value: 30, indicatorRef: null },
        {
          indicator: 'Close',
          operator: '<',
          value: null,
          indicatorRef: 'BB_Lower',
        },
      ],
      short: [],
    },
    riskManagement: {
      stopLoss: { type: 'percent', value: 2 },
      takeProfit: { type: 'percent', value: 4 },
    },
    timeframe: '1h',
    applicability: { pairsMode: 'USDT_ALL', customPairs: null },
    unsupportedRequests: [],
    ...overrides,
  };
}

describe('normalizeGeneratedStrategy', () => {
  it('passes through name, description, tags, and unsupportedRequests unchanged', () => {
    const result = normalizeGeneratedStrategy(
      baseWireResponse({ unsupportedRequests: ['MACD'] }),
    );
    expect(result.name).toBe('RSI_BB_LB_LONG');
    expect(result.description).toBe(
      'LONG when RSI < 30 and price below the Bollinger Lower Band',
    );
    expect(result.tags).toEqual(['RSI', 'Bollinger']);
    expect(result.unsupportedRequests).toEqual(['MACD']);
  });

  it('strips a literal value condition down to indicator/operator/value', () => {
    const result = normalizeGeneratedStrategy(baseWireResponse());
    expect(result.params.conditions.long[0]).toEqual({
      indicator: 'RSI',
      operator: '<',
      value: 30,
    });
  });

  it('strips an indicatorRef condition down to indicator/operator/indicatorRef', () => {
    const result = normalizeGeneratedStrategy(baseWireResponse());
    expect(result.params.conditions.long[1]).toEqual({
      indicator: 'Close',
      operator: '<',
      indicatorRef: 'BB_Lower',
    });
  });

  it('drops null value and null indicatorRef together, leaving neither key', () => {
    const result = normalizeGeneratedStrategy(
      baseWireResponse({
        conditions: {
          long: [
            {
              indicator: 'RSI',
              operator: '<',
              value: null,
              indicatorRef: null,
            },
          ],
          short: [],
        },
      }),
    );
    expect(result.params.conditions.long[0]).toEqual({
      indicator: 'RSI',
      operator: '<',
    });
  });

  it('drops a null "as" alias from an indicator declaration', () => {
    const result = normalizeGeneratedStrategy(baseWireResponse());
    expect(result.params.indicators[0]).toEqual({ name: 'RSI', period: 14 });
  });

  it('keeps a non-null "as" alias on an indicator declaration', () => {
    const result = normalizeGeneratedStrategy(
      baseWireResponse({
        indicators: [{ name: 'SMA', as: 'SMA_FAST', period: 10 }],
      }),
    );
    expect(result.params.indicators[0]).toEqual({
      name: 'SMA',
      as: 'SMA_FAST',
      period: 10,
    });
  });

  it('drops a null period, leaving only the declared name', () => {
    const result = normalizeGeneratedStrategy(
      baseWireResponse({
        indicators: [{ name: 'SMA', as: null, period: null }],
      }),
    );
    expect(result.params.indicators[0]).toEqual({ name: 'SMA' });
  });

  it('keeps riskManagement when both stopLoss and takeProfit are set', () => {
    const result = normalizeGeneratedStrategy(baseWireResponse());
    expect(result.params.riskManagement).toEqual({
      stopLoss: { type: 'percent', value: 2 },
      takeProfit: { type: 'percent', value: 4 },
    });
  });

  it('omits riskManagement entirely when the wire value is null', () => {
    const result = normalizeGeneratedStrategy(
      baseWireResponse({ riskManagement: null }),
    );
    expect(result.params.riskManagement).toBeUndefined();
    expect('riskManagement' in result.params).toBe(false);
  });

  it('omits riskManagement when stopLoss and takeProfit are both null', () => {
    const result = normalizeGeneratedStrategy(
      baseWireResponse({
        riskManagement: { stopLoss: null, takeProfit: null },
      }),
    );
    expect('riskManagement' in result.params).toBe(false);
  });

  it('keeps a partial riskManagement with only stopLoss set', () => {
    const result = normalizeGeneratedStrategy(
      baseWireResponse({
        riskManagement: {
          stopLoss: { type: 'percent', value: 5 },
          takeProfit: null,
        },
      }),
    );
    expect(result.params.riskManagement).toEqual({
      stopLoss: { type: 'percent', value: 5 },
    });
  });

  it('omits applicability entirely when the wire value is null', () => {
    const result = normalizeGeneratedStrategy(
      baseWireResponse({ applicability: null }),
    );
    expect('applicability' in result.params).toBe(false);
  });

  it('omits applicability when pairsMode is CUSTOM but customPairs is null', () => {
    const result = normalizeGeneratedStrategy(
      baseWireResponse({
        applicability: { pairsMode: 'CUSTOM', customPairs: null },
      }),
    );
    expect('applicability' in result.params).toBe(false);
  });

  it('keeps applicability.pairs as USDT_ALL', () => {
    const result = normalizeGeneratedStrategy(
      baseWireResponse({
        applicability: { pairsMode: 'USDT_ALL', customPairs: null },
      }),
    );
    expect(result.params.applicability).toEqual({ pairs: 'USDT_ALL' });
  });

  it('keeps applicability.pairs as an explicit pair list', () => {
    const result = normalizeGeneratedStrategy(
      baseWireResponse({
        applicability: {
          pairsMode: 'CUSTOM',
          customPairs: ['BTCUSDT', 'ETHUSDT'],
        },
      }),
    );
    expect(result.params.applicability).toEqual({
      pairs: ['BTCUSDT', 'ETHUSDT'],
    });
  });

  it('passes the timeframe through unchanged', () => {
    const result = normalizeGeneratedStrategy(
      baseWireResponse({ timeframe: '4h' }),
    );
    expect(result.params.timeframe).toBe('4h');
  });

  it('never includes name, description, tags, or unsupportedRequests inside params', () => {
    const result = normalizeGeneratedStrategy(baseWireResponse());
    expect(result.params).not.toHaveProperty('name');
    expect(result.params).not.toHaveProperty('description');
    expect(result.params).not.toHaveProperty('tags');
    expect(result.params).not.toHaveProperty('unsupportedRequests');
  });
});
