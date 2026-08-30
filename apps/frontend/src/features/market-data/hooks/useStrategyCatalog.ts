'use client';

import type { StrategyCatalog } from '@crypto-strategy-lab/shared';
import { useEffect, useRef, useState } from 'react';

import {
  getRealtimeSocket,
  type AppSocket,
} from '../../../shared/realtime/socketClient';

export type StrategyCatalogSocket = AppSocket;

export interface UseStrategyCatalogOptions {
  socketFactory?: () => StrategyCatalogSocket;
}

const EMPTY_CATALOG: StrategyCatalog = { strategyIds: [], strategies: [] };

export function useStrategyCatalog({
  socketFactory = getRealtimeSocket,
}: UseStrategyCatalogOptions = {}): StrategyCatalog {
  const [catalog, setCatalog] = useState<StrategyCatalog>(EMPTY_CATALOG);
  const socketFactoryRef = useRef(socketFactory);

  useEffect(() => {
    const socket = socketFactoryRef.current();
    let active = true;
    const requestCatalog = (): void => {
      if (active) socket.emit('strategy:catalog:request');
    };
    const handleCatalog = (nextCatalog: StrategyCatalog): void => {
      if (!active) return;
      const strategies = nextCatalog.strategies ?? [];
      const providedStrategyIds = nextCatalog.strategyIds ?? [];
      const strategyIds =
        providedStrategyIds.length > 0
          ? [...providedStrategyIds]
          : strategies.map(({ id }) => id);
      setCatalog({ strategyIds, strategies: [...strategies] });
    };

    socket.on('connect', requestCatalog);
    socket.on('strategy:catalog', handleCatalog);
    if (socket.connected) {
      requestCatalog();
    } else {
      socket.connect();
    }

    return () => {
      active = false;
      socket.off('connect', requestCatalog);
      socket.off('strategy:catalog', handleCatalog);
    };
  }, []);

  return catalog;
}
