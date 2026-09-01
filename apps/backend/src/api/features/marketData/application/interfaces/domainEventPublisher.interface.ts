import type { AnyDomainEvent } from '@crypto-strategy-lab/shared';

export interface DomainEventPublisher {
  publish(event: AnyDomainEvent): void | Promise<void>;
}

export const NOOP_DOMAIN_EVENT_PUBLISHER: DomainEventPublisher = {
  publish: () => undefined,
};
