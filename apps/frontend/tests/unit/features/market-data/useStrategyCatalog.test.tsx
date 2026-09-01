import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  type StrategyCatalogSocket,
  useStrategyCatalog,
} from '../../../../src/features/market-data/hooks/useStrategyCatalog';

describe('useStrategyCatalog', () => {
  it('requests and stores the registry catalog from the realtime service', async () => {
    const listeners = new Map<string, (...arguments_: unknown[]) => void>();
    const socket = {
      connected: false,
      on: vi.fn(
        (event: string, listener: (...arguments_: unknown[]) => void) => {
          listeners.set(event, listener);
          return socket;
        },
      ),
      off: vi.fn((event: string) => {
        listeners.delete(event);
        return socket;
      }),
      connect: vi.fn(() => socket),
      emit: vi.fn(() => socket),
    } as unknown as StrategyCatalogSocket;
    const { result } = renderHook(() =>
      useStrategyCatalog({ socketFactory: () => socket }),
    );

    act(() => listeners.get('connect')?.());
    expect(socket.emit).toHaveBeenCalledWith('strategy:catalog:request');

    act(() =>
      listeners.get('strategy:catalog')?.({
        strategies: [
          {
            id: 'ma',
            requiresParams: false,
            paramsSchema: { type: 'object', properties: {} },
          },
          {
            id: 'rsi',
            requiresParams: false,
            paramsSchema: { type: 'object', properties: {} },
          },
        ],
      }),
    );
    await waitFor(() =>
      expect(result.current.strategies).toEqual([
        {
          id: 'ma',
          paramsSchema: { type: 'object', properties: {} },
          requiresParams: false,
        },
        {
          id: 'rsi',
          paramsSchema: { type: 'object', properties: {} },
          requiresParams: false,
        },
      ]),
    );
  });
});
