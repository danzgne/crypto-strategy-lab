'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const CONFIRM_WINDOW_MS = 4000;

/**
 * Requires a second call to `trigger` within CONFIRM_WINDOW_MS before running
 * `action`, but only while `requiresConfirm` is true. Used to guard an action
 * that would silently discard unsaved work.
 */
export function useConfirmGate(requiresConfirm: boolean) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => clearTimeout(timer.current);
  }, []);

  const trigger = useCallback(
    (action: () => void) => {
      if (!requiresConfirm || armed) {
        setArmed(false);
        clearTimeout(timer.current);
        action();
        return;
      }
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), CONFIRM_WINDOW_MS);
    },
    [armed, requiresConfirm],
  );

  return { armed, trigger };
}
