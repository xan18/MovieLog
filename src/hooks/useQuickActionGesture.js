import { useCallback, useEffect, useRef } from 'react';

const DEFAULT_LONG_PRESS_MS = 440;
const DEFAULT_MOVE_THRESHOLD = 12;

export function useQuickActionGesture(openQuickActions, options = {}) {
  const longPressMs = options.longPressMs ?? DEFAULT_LONG_PRESS_MS;
  const moveThreshold = options.moveThreshold ?? DEFAULT_MOVE_THRESHOLD;

  const timerRef = useRef(null);
  const longPressResetTimerRef = useRef(null);
  const touchStartRef = useRef(null);
  const activeItemRef = useRef(null);
  const longPressTriggeredRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearLongPressResetTimer = useCallback(() => {
    if (longPressResetTimerRef.current) {
      clearTimeout(longPressResetTimerRef.current);
      longPressResetTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    clearTimer();
    clearLongPressResetTimer();
  }, [clearLongPressResetTimer, clearTimer]);

  const triggerQuickActions = useCallback((item, x, y) => {
    if (!item) return;
    openQuickActions(item, x, y);
  }, [openQuickActions]);

  const onContextMenu = useCallback((event, item) => {
    event.preventDefault();
    event.stopPropagation();
    triggerQuickActions(item, event.clientX, event.clientY);
  }, [triggerQuickActions]);

  const onTouchStart = useCallback((event, item) => {
    if (!event.touches || event.touches.length === 0) return;
    const touch = event.touches[0];
    clearLongPressResetTimer();
    activeItemRef.current = item;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    longPressTriggeredRef.current = false;
    clearTimer();

    timerRef.current = setTimeout(() => {
      const point = touchStartRef.current || {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      };
      longPressTriggeredRef.current = true;
      triggerQuickActions(activeItemRef.current, point.x, point.y);
    }, longPressMs);
  }, [clearTimer, longPressMs, triggerQuickActions]);

  const onTouchMove = useCallback((event) => {
    if (!touchStartRef.current || !event.touches || event.touches.length === 0) return;
    const touch = event.touches[0];
    const dx = Math.abs(touch.clientX - touchStartRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartRef.current.y);
    if (dx > moveThreshold || dy > moveThreshold) clearTimer();
  }, [clearTimer, moveThreshold]);

  const onTouchEnd = useCallback(() => {
    clearTimer();
    touchStartRef.current = null;
    activeItemRef.current = null;
    if (longPressTriggeredRef.current) {
      clearLongPressResetTimer();
      longPressResetTimerRef.current = setTimeout(() => {
        longPressTriggeredRef.current = false;
        longPressResetTimerRef.current = null;
      }, 800);
    }
  }, [clearLongPressResetTimer, clearTimer]);

  const consumeLongPress = useCallback(() => {
    if (!longPressTriggeredRef.current) return false;
    longPressTriggeredRef.current = false;
    return true;
  }, []);

  return {
    onContextMenu,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel: onTouchEnd,
    consumeLongPress,
  };
}
