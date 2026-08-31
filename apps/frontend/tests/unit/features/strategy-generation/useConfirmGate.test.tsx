import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConfirmGate } from '../../../../src/features/strategy-generation/hooks/useConfirmGate';

describe('useConfirmGate', () => {
  it('runs the action immediately when confirmation is not required', () => {
    const { result } = renderHook(() => useConfirmGate(false));
    const action = vi.fn();

    act(() => result.current.trigger(action));

    expect(action).toHaveBeenCalledTimes(1);
    expect(result.current.armed).toBe(false);
  });

  it('arms on the first call and runs on the second call while required', () => {
    const { result } = renderHook(() => useConfirmGate(true));
    const action = vi.fn();

    act(() => result.current.trigger(action));
    expect(action).not.toHaveBeenCalled();
    expect(result.current.armed).toBe(true);

    act(() => result.current.trigger(action));
    expect(action).toHaveBeenCalledTimes(1);
    expect(result.current.armed).toBe(false);
  });

  it('disarms itself after the confirm window elapses', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useConfirmGate(true));
      const action = vi.fn();

      act(() => result.current.trigger(action));
      expect(result.current.armed).toBe(true);

      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(result.current.armed).toBe(false);

      act(() => result.current.trigger(action));
      expect(action).not.toHaveBeenCalled();
      expect(result.current.armed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
