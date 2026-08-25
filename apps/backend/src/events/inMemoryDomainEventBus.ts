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
    this.emitter.on(name, handler);
    return () => this.emitter.off(name, handler);
  }

  public subscribeAll(handler: (event: AnyDomainEvent) => void): () => void {
    this.emitter.on('*', handler);
    return () => this.emitter.off('*', handler);
  }
}
