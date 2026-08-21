'use client';

import { useRealtimeConnection } from '../hooks/useRealtimeConnection';
import { ConnectionStatusCard } from './ConnectionStatusCard';

export function RealtimeConnectionPanel() {
  const connection = useRealtimeConnection();

  return <ConnectionStatusCard connection={connection} />;
}
