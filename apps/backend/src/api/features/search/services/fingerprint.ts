import { createHash } from 'node:crypto';

import type { CombinationConfig } from '@crypto-strategy-lab/shared';
import { canonicalizeValue } from '@crypto-strategy-lab/shared/strategy';

export interface StrategySnapshotInput {
  strategyId: string;
  params: Record<string, unknown>;
}

export function computeCandidateFingerprint(
  strategyIds: readonly string[],
  parameterSnapshots: readonly Record<string, unknown>[],
  combinationConfig?: CombinationConfig | null,
): string {
  const members = strategyIds.map((strategyId, index) => ({
    params: parameterSnapshots[index] ?? {},
    strategyId,
  }));

  const canonicalPayload = {
    combinationConfig: combinationConfig
      ? {
          mode: combinationConfig.mode,
          ...(combinationConfig.threshold !== undefined
            ? { threshold: combinationConfig.threshold }
            : {}),
          ...(combinationConfig.weights !== undefined
            ? { weights: combinationConfig.weights }
            : {}),
          ...(combinationConfig.stopLoss !== undefined
            ? { stopLoss: combinationConfig.stopLoss }
            : {}),
          ...(combinationConfig.takeProfit !== undefined
            ? { takeProfit: combinationConfig.takeProfit }
            : {}),
        }
      : null,
    members,
  };

  const canonicalJson = canonicalizeValue(canonicalPayload);
  return createHash('sha256').update(canonicalJson).digest('hex');
}
