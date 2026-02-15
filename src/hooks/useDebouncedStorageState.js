import { useEffect, useRef, useState } from 'react';

export const useDebouncedStorageState = (
  key,
  initialValue,
  {
    debounceMs = 0,
    serialize = (value) => JSON.stringify(value),
    deserialize = (raw) => JSON.parse(raw),
    normalize = (value) => value,
  } = {}
) => {
  const serializeRef = useRef(serialize);
  const deserializeRef = useRef(deserialize);
  const normalizeRef = useRef(normalize);

  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return initialValue;
      return normalizeRef.current(deserializeRef.current(raw));
    } catch {
      return initialValue;
    }
  });

  const timerRef = useRef(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const persist = () => {
      try {
        localStorage.setItem(key, serializeRef.current(state));
      } catch (err) {
        if (err instanceof DOMException && err.name === 'QuotaExceededError') {
          console.warn('[useDebouncedStorageState] localStorage quota exceeded — data not saved.');
        }
      }
    };
    if (debounceMs > 0) {
      timerRef.current = setTimeout(persist, debounceMs);
    } else {
      persist();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [debounceMs, key, state]);

  return [state, setState];
};
