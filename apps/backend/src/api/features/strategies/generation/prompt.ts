import type { GenerationWireResponse } from './wireSchema';

export const STRATEGY_GENERATION_CONSUMER_ID = 'strategy-generation';

export const MAX_GENERATION_INPUT_CHARS = 6000;

const WORKED_EXAMPLE: GenerationWireResponse = {
  name: 'SMA_CROSS_RSI_FILTER',
  description:
    'Long when the fast SMA crosses above the slow SMA while RSI confirms momentum.',
  tags: ['sma', 'crossover', 'rsi'],
  indicators: [
    { name: 'SMA', as: 'SMA_FAST', period: 10 },
    { name: 'SMA', as: 'SMA_SLOW', period: 30 },
    { name: 'RSI', as: null, period: 14 },
  ],
  conditions: {
    long: [
      {
        indicator: 'SMA_FAST',
        operator: '>',
        value: null,
        indicatorRef: 'SMA_SLOW',
      },
      { indicator: 'RSI', operator: '>', value: 50, indicatorRef: null },
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
};

const INSTRUCTIONS = `You compile a trading idea into a single RuleStrategy definition, matching the JSON schema exactly.

Supported indicators (use ONLY these three names, spelled exactly): RSI, SMA, BollingerBands.
- RSI: period defaults to 14.
- SMA: period defaults to 20. If you declare SMA more than once (for example a fast/slow crossover), give every declaration a distinct "as" alias, since two unaliased declarations of the same indicator collide.
- BollingerBands: period defaults to 20, stdDev defaults to 2. It produces three referenceable outputs named "<alias>_Upper", "<alias>_Lower", and "<alias>_Middle" (default alias "BB").
Every indicator field you do not have a value for must be explicit null, never omitted.

A condition compares one indicator reference (or the literal "Close") against exactly one of a numeric "value" or another indicator reference "indicatorRef". Set exactly one of those two fields on every condition and set the other to null; never set both, never leave both null. Conditions inside "long" and inside "short" combine as AND. Leave a direction's list empty ([]) when the input describes no rule for that direction.

If the input asks for an indicator outside {RSI, SMA, BollingerBands} (for example MACD, EMA, Stochastic, ATR, or Volume), do not invent it. Instead substitute the closest supported indicator into "indicators"/"conditions", and add the user's own wording for the unsupported concept as a string entry in "unsupportedRequests". Leave "unsupportedRequests" as [] when everything requested is already supported.

Defaults when the input does not say otherwise: "timeframe": "1h", "applicability": {"pairsMode": "USDT_ALL", "customPairs": null}. Set "applicability.pairsMode" to "CUSTOM" and list uppercase pair symbols (for example "BTCUSDT") in "customPairs" only when the input names specific pairs; otherwise "customPairs" must be null. Set "riskManagement" to null when the input does not mention a stop loss or take profit.

Invent a short, descriptive "name" (uppercase, underscore-separated), a one-sentence "description", and 2 to 5 lowercase "tags" naming the indicators or style used.`;

export function buildGenerationPrompt(
  kind: 'USER_PROMPT' | 'WEB_IMPORT',
  content: string,
): string {
  const truncated = content.slice(0, MAX_GENERATION_INPUT_CHARS);
  const workedExample = JSON.stringify(WORKED_EXAMPLE, null, 2);
  const inputBlock =
    kind === 'USER_PROMPT'
      ? `Natural-language strategy description from the user:\n"""\n${truncated}\n"""`
      : `Extracted text content from a webpage the user linked. It may contain unrelated boilerplate such as navigation, ads, or comments; ignore anything that is not about the trading strategy itself:\n"""\n${truncated}\n"""`;

  return `${INSTRUCTIONS}\n\nWorked example, combining an aliased indicator, an indicatorRef comparison, and a literal value comparison:\n${workedExample}\n\n${inputBlock}`;
}
