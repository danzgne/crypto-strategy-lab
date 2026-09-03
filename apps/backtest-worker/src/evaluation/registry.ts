import { CURRENT_EVALUATOR_VERSION } from '@crypto-strategy-lab/shared/backtest';

import { VersionRegistry, type VersionFactory } from '../versionRegistry';
import { DefaultEvaluator } from './defaultEvaluator';
import type { Evaluator } from './interfaces/evaluator.interface';

export type EvaluatorFactory = VersionFactory<Evaluator>;

/**
 * Maps an Evaluator version to the implementation that computes metrics for it.
 */
export const EvaluatorRegistry = new VersionRegistry<Evaluator>('Evaluator');

EvaluatorRegistry.register(
  CURRENT_EVALUATOR_VERSION,
  () => new DefaultEvaluator(),
);
