import type {
  AnyDomainEvent,
  DomainEventEnvelope,
  DomainEventName,
} from '@crypto-strategy-lab/shared';

import type { DomainEventPublisher } from '../api/features/marketData/application/interfaces/domainEventPublisher.interface';

type DomainEventHandler<TName extends DomainEventName> = (
  event: DomainEventEnvelope<TName>,
) => void | Promise<void>;

interface Subscription {
  consumedEventIds: Set<string>;
  handler: (event: AnyDomainEvent) => void | Promise<void>;
}

export class InMemoryDomainEventBus implements DomainEventPublisher {
  private readonly subscriptions = new Map<
    DomainEventName | '*',
    Set<Subscription>
  >();

  public publish(event: AnyDomainEvent): Promise<void> {
    const subscriptions = [
      ...(this.subscriptions.get(event.name) ?? []),
      ...(this.subscriptions.get('*') ?? []),
    ];
    const pending: Promise<void>[] = [];

    for (const subscription of subscriptions) {
      if (subscription.consumedEventIds.has(event.eventId)) continue;
      const result = subscription.handler(event);
      if (isPromise(result)) {
        pending.push(
          result.then(() => {
            subscription.consumedEventIds.add(event.eventId);
          }),
        );
      } else {
        subscription.consumedEventIds.add(event.eventId);
      }
    }

    if (pending.length === 0) return Promise.resolve();
    return Promise.all(pending).then(() => undefined);
  }

  public subscribe<TName extends DomainEventName>(
    name: TName,
    handler: DomainEventHandler<TName>,
  ): () => void {
    return this.addSubscription(name, {
      consumedEventIds: new Set<string>(),
      handler: (event) => handler(event as DomainEventEnvelope<TName>),
    });
  }

  public subscribeAll(
    handler: (event: AnyDomainEvent) => void | Promise<void>,
  ): () => void {
    return this.addSubscription('*', {
      consumedEventIds: new Set<string>(),
      handler,
    });
  }

  private addSubscription(
    name: DomainEventName | '*',
    subscription: Subscription,
  ): () => void {
    const subscriptions = this.subscriptions.get(name) ?? new Set();
    subscriptions.add(subscription);
    this.subscriptions.set(name, subscriptions);
    return () => {
      subscriptions.delete(subscription);
      if (subscriptions.size === 0) this.subscriptions.delete(name);
    };
  }
}

function isPromise(value: void | Promise<void>): value is Promise<void> {
  return value !== undefined && typeof value.then === 'function';
}
