import { EventEmitter } from 'node:events';

import type {
  AnyDomainEvent,
  DomainEventEnvelope,
  DomainEventName,
} from '@crypto-strategy-lab/shared';

import type { DomainEventPublisher } from '../api/features/marketData/application/interfaces/domainEventPublisher.interface';

type DomainEventHandler<TName extends DomainEventName> = (
  event: DomainEventEnvelope<TName>,
) => void;

export class InMemoryDomainEventBus implements DomainEventPublisher {
  private readonly emitter = new EventEmitter();

  public publish(event: AnyDomainEvent): void {
    this.emitter.emit(event.name, event);
    this.emitter.emit('*', event);
  }

  public subscribe<TName extends DomainEventName>(
    name: TName,
    handler: DomainEventHandler<TName>,
  ): () => void {
    const consumedEventIds = new Set<string>();
    const listener = (event: DomainEventEnvelope<TName>): void => {
      if (consumedEventIds.has(event.eventId)) return;
      handler(event);
      consumedEventIds.add(event.eventId);
    };
    this.emitter.on(name, listener);
    return () => this.emitter.off(name, listener);
  }

  public subscribeAll(handler: (event: AnyDomainEvent) => void): () => void {
    const consumedEventIds = new Set<string>();
    const listener = (event: AnyDomainEvent): void => {
      if (consumedEventIds.has(event.eventId)) return;
      handler(event);
      consumedEventIds.add(event.eventId);
    };
    this.emitter.on('*', listener);
    return () => this.emitter.off('*', listener);
  }
}
