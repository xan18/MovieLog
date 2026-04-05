import { useEffect, useRef, useState } from 'react';

const hasWindow = () => typeof window !== 'undefined';

const scheduleIdle = (callback, timeout = 2000) => {
  if (hasWindow() && typeof window.requestIdleCallback === 'function') {
    return {
      kind: 'idle',
      id: window.requestIdleCallback(callback, { timeout }),
    };
  }

  return {
    kind: 'timeout',
    id: setTimeout(callback, 0),
  };
};

const cancelIdle = (handle) => {
  if (!handle || handle.id == null) return;

  if (handle.kind === 'idle' && hasWindow() && typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(handle.id);
    return;
  }

  clearTimeout(handle.id);
};

export const useDebouncedStorageState = (
  key,
  initialValue,
  {
    debounceMs = 0,
    hydrateOnInit = true,
    serialize = (value) => JSON.stringify(value),
    deserialize = (raw) => JSON.parse(raw),
    normalize = (value) => value,
  } = {}
) => {
  const serializeRef = useRef(serialize);
  const deserializeRef = useRef(deserialize);
  const normalizeRef = useRef(normalize);

  const [state, setState] = useState(() => {
    if (!hydrateOnInit) return initialValue;
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return initialValue;
      return normalizeRef.current(deserializeRef.current(raw));
    } catch {
      return initialValue;
    }
  });

  const timerRef = useRef(null);
  const idleHandleRef = useRef(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    cancelIdle(idleHandleRef.current);
    idleHandleRef.current = null;

    const persist = () => {
      try {
        localStorage.setItem(key, serializeRef.current(state));
      } catch (err) {
        if (err instanceof DOMException && err.name === 'QuotaExceededError') {
          console.warn('[useDebouncedStorageState] localStorage quota exceeded - data not saved.');
        }
      }
    };

    if (debounceMs > 0) {
      timerRef.current = setTimeout(() => {
        idleHandleRef.current = scheduleIdle(persist);
      }, debounceMs);
    } else {
      idleHandleRef.current = scheduleIdle(persist);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      cancelIdle(idleHandleRef.current);
      idleHandleRef.current = null;
    };
  }, [debounceMs, key, state]);

  return [state, setState];
};
