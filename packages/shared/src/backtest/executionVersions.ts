/**
 * Execution-version constants shared between the backend (which stamps them onto
 * an Experiment at creation time) and the Backtest Worker (which registers matching
 * implementations and refuses to substitute a different one at run time).
 */
export const CURRENT_SIMULATION_RULES_VERSION = 'historical-v1';
export const CURRENT_EVALUATOR_VERSION = 'default-v1';

/**
 * Resolves the running process' application build revision. Both the backend and the
 * Backtest Worker read the same `BUILD_REVISION` environment variable so an Experiment's
 * recorded revision can be compared against the worker executing it later. Defaults to
 * `'dev'` when unset, so local development never fails a build-revision comparison.
 */
export function resolveBuildRevision(
  env: Record<string, string | undefined> = process.env,
): string {
  const raw = env.BUILD_REVISION;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : 'dev';
}
