import { describe, expect, it } from 'vitest';

import { createDomainEvent } from '../src/index';

describe('createDomainEvent', () => {
  it('wraps a catalog payload in a versioned, traceable envelope', () => {
    const event = createDomainEvent(
      'CandleClosed',
      {
        pair: 'BTCUSDT',
        timeframe: '1m',
        openTime: 1_755_773_400_000,
        closeTime: 1_755_773_459_999,
      },
      {
        eventId: 'event-27',
        occurredAt: '2026-08-21T10:01:00.000Z',
      },
    );

    expect(event).toEqual({
      eventId: 'event-27',
      name: 'CandleClosed',
      version: 1,
      occurredAt: '2026-08-21T10:01:00.000Z',
      payload: {
        pair: 'BTCUSDT',
        timeframe: '1m',
        openTime: 1_755_773_400_000,
        closeTime: 1_755_773_459_999,
      },
    });
  });
});
