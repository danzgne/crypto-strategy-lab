import { describe, expect, it } from 'vitest';

import {
  pairMatchesRuleApplicability,
  paneForIndicatorReference,
  renderRuleCondition,
  renderRuleConditions,
  type RuleCondition,
} from '../src/index';

describe('renderRuleCondition', () => {
  it('renders a literal-value condition', () => {
    const condition: RuleCondition = {
      indicator: 'RSI',
      operator: '<',
      value: 30,
    };
    expect(renderRuleCondition(condition)).toBe('RSI < 30');
  });

  it('renders an indicator-to-indicator condition', () => {
    const condition: RuleCondition = {
      indicator: 'Close',
      operator: '<',
      indicatorRef: 'BB_Lower',
    };
    expect(renderRuleCondition(condition)).toBe('Close < BB_Lower');
  });
});

describe('renderRuleConditions', () => {
  it('joins multiple conditions with AND', () => {
    const conditions: RuleCondition[] = [
      { indicator: 'RSI', operator: '<', value: 30 },
      { indicator: 'Close', operator: '>', indicatorRef: 'SMA' },
    ];
    expect(renderRuleConditions(conditions)).toBe('RSI < 30 AND Close > SMA');
  });
});

describe('pairMatchesRuleApplicability', () => {
  it('allows any pair when applicability is undefined', () => {
    expect(pairMatchesRuleApplicability('BTCUSDT', undefined)).toBe(true);
  });

  it('matches USDT_ALL against any uppercased USDT pair', () => {
    expect(pairMatchesRuleApplicability('btcusdt', { pairs: 'USDT_ALL' })).toBe(
      true,
    );
    expect(pairMatchesRuleApplicability('BTCBUSD', { pairs: 'USDT_ALL' })).toBe(
      false,
    );
  });

  it('matches an explicit pair list case-insensitively', () => {
    expect(
      pairMatchesRuleApplicability('btcusdt', { pairs: ['BTCUSDT'] }),
    ).toBe(true);
    expect(
      pairMatchesRuleApplicability('ETHUSDT', { pairs: ['BTCUSDT'] }),
    ).toBe(false);
  });

  it('treats an empty pair list as unrestricted', () => {
    expect(pairMatchesRuleApplicability('ETHUSDT', { pairs: [] })).toBe(true);
  });

  it('matches a lowercase-stored pair list against an uppercase pair', () => {
    expect(
      pairMatchesRuleApplicability('BTCUSDT', { pairs: ['btcusdt'] }),
    ).toBe(true);
  });
});

describe('paneForIndicatorReference', () => {
  it('routes RSI to pane 1', () => {
    expect(paneForIndicatorReference('RSI')).toBe(1);
  });

  it('defaults every other reference to pane 0', () => {
    expect(paneForIndicatorReference('SMA')).toBe(0);
    expect(paneForIndicatorReference('BB_Upper')).toBe(0);
  });
});
