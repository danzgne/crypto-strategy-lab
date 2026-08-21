import { describe, expect, it } from 'vitest';

import { createDomainEvent } from '../src/index';

describe('createDomainEvent', () => {
  it('wraps a catalog payload in a versioned, traceable envelope', () => {
    const event = createDomainEvent(
      'CandleClosed',
      {
        pair: 'BTCUSDT',
        timeframe: '1m',
        openTime: '2026-08-21T10:00:00.000Z',
        closeTime: '2026-08-21T10:00:59.999Z',
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
        openTime: '2026-08-21T10:00:00.000Z',
        closeTime: '2026-08-21T10:00:59.999Z',
      },
    });
  });
});
