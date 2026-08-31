import { describe, expect, it } from 'vitest';

import {
  buildGenerationPrompt,
  MAX_GENERATION_INPUT_CHARS,
} from '@/api/features/strategies/generation/prompt';

describe('buildGenerationPrompt', () => {
  it('includes the supported indicator names', () => {
    const prompt = buildGenerationPrompt('USER_PROMPT', 'buy the dip');
    expect(prompt).toContain('RSI');
    expect(prompt).toContain('SMA');
    expect(prompt).toContain('BollingerBands');
  });

  it('instructs the model to report unsupported indicator requests', () => {
    const prompt = buildGenerationPrompt('USER_PROMPT', 'buy the dip');
    expect(prompt).toContain('unsupportedRequests');
  });

  it('carries a worked example combining an alias, an indicatorRef, and a literal value', () => {
    const prompt = buildGenerationPrompt('USER_PROMPT', 'buy the dip');
    expect(prompt).toContain('"as"');
    expect(prompt).toContain('"indicatorRef"');
    expect(prompt).toMatch(/"value":\s*\d/);
  });

  it('embeds the user natural-language text verbatim for USER_PROMPT', () => {
    const prompt = buildGenerationPrompt(
      'USER_PROMPT',
      'Long when RSI under 30',
    );
    expect(prompt).toContain('Long when RSI under 30');
  });

  it('frames WEB_IMPORT content as extracted webpage text to be filtered for boilerplate', () => {
    const prompt = buildGenerationPrompt(
      'WEB_IMPORT',
      'Menu Home About | The strategy buys when RSI < 30 | Cookie notice',
    );
    expect(prompt.toLowerCase()).toContain('webpage');
    expect(prompt).toContain(
      'Menu Home About | The strategy buys when RSI < 30 | Cookie notice',
    );
  });

  it('truncates input longer than the generation input cap', () => {
    const longInput = 'a'.repeat(MAX_GENERATION_INPUT_CHARS + 500);
    const prompt = buildGenerationPrompt('USER_PROMPT', longInput);
    expect(prompt).not.toContain('a'.repeat(MAX_GENERATION_INPUT_CHARS + 1));
    expect(prompt.match(/a+/)?.[0].length).toBeLessThanOrEqual(
      MAX_GENERATION_INPUT_CHARS,
    );
  });
});
