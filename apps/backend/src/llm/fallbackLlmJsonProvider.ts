import type { AppLogger } from '../utils/logger';
import { createAppLogger } from '../utils/logger';

import type {
  LlmJsonGenerateInput,
  LlmJsonGenerateResult,
  LlmJsonProvider,
} from './llmJsonProvider.interface';

const DEFAULT_COOLDOWN_MS = 5 * 60_000;

export interface ProviderAvailability {
  readonly provider: string;
  readonly available: boolean;
  readonly cooldownUntil?: number;
}

export interface FallbackLlmJsonProviderDependencies {
  providers: readonly LlmJsonProvider[];
  logger?: AppLogger;
  cooldownMs?: number;
  now?: () => number;
}

export class FallbackLlmJsonProvider implements LlmJsonProvider {
  public readonly name = 'fallback-chain';

  private readonly providers: readonly LlmJsonProvider[];

  private readonly logger: AppLogger;

  private readonly cooldownMs: number;

  private readonly now: () => number;

  private readonly cooldownUntilByKey = new Map<string, number>();

  public constructor({
    providers,
    logger = createAppLogger({
      service: 'fallback-llm-json-provider',
      enabled: false,
    }),
    cooldownMs = DEFAULT_COOLDOWN_MS,
    now = () => Date.now(),
  }: FallbackLlmJsonProviderDependencies) {
    this.providers = providers;
    this.logger = logger;
    this.cooldownMs = cooldownMs;
    this.now = now;
  }

  public async generate<T>(
    input: LlmJsonGenerateInput<T>,
  ): Promise<LlmJsonGenerateResult<T>> {
    for (const provider of this.providers) {
      if (this.isCoolingDown(provider.name, input.consumerId)) {
        this.logger.warn(
          { consumerId: input.consumerId, provider: provider.name },
          'Skipping cooling-down LLM JSON provider',
        );
        continue;
      }

      const startedAt = this.now();
      const result = await provider.generate(input);
      const durationMs = this.now() - startedAt;

      if (result.outcome === 'SUCCESS') {
        this.logger.info(
          {
            consumerId: input.consumerId,
            provider: provider.name,
            status: 'success',
            durationMs,
          },
          'LLM JSON provider answered',
        );
        return result;
      }

      if (result.outcome === 'SCHEMA_INVALID') {
        this.logger.warn(
          {
            consumerId: input.consumerId,
            provider: provider.name,
            status: 'schema_invalid',
            durationMs,
            issuePaths: result.issues.map((issue) => issue.path),
          },
          'LLM JSON provider returned a schema-invalid response',
        );
        return result;
      }

      this.startCooldown(provider.name, input.consumerId);
      this.logger.warn(
        {
          consumerId: input.consumerId,
          provider: provider.name,
          status: 'hard_failure',
          durationMs,
        },
        'LLM JSON provider failed; trying the next provider',
      );
    }

    return { outcome: 'ALL_PROVIDERS_UNAVAILABLE' };
  }

  public getAvailability(consumerId: string): ProviderAvailability[] {
    return this.providers.map((provider) => {
      const cooldownUntil = this.cooldownUntilByKey.get(
        this.cooldownKey(provider.name, consumerId),
      );
      if (cooldownUntil === undefined || cooldownUntil <= this.now()) {
        return { provider: provider.name, available: true };
      }
      return { provider: provider.name, available: false, cooldownUntil };
    });
  }

  private isCoolingDown(providerName: string, consumerId: string): boolean {
    const cooldownUntil = this.cooldownUntilByKey.get(
      this.cooldownKey(providerName, consumerId),
    );
    return cooldownUntil !== undefined && cooldownUntil > this.now();
  }

  private startCooldown(providerName: string, consumerId: string): void {
    this.cooldownUntilByKey.set(
      this.cooldownKey(providerName, consumerId),
      this.now() + this.cooldownMs,
    );
  }

  private cooldownKey(providerName: string, consumerId: string): string {
    return `${providerName} ${consumerId}`;
  }
}
