import { useEffect, useRef } from 'react';

export function useAutoLoadMoreOnScroll({
  enabled,
  canLoadMore,
  isLoading = false,
  itemCount = 0,
  onLoadMore,
  root = null,
  rootMargin = '240px 0px',
  threshold = 0,
}) {
  const sentinelRef = useRef(null);
  const onLoadMoreRef = useRef(onLoadMore);
  const lastTriggerSignatureRef = useRef('');

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    if (!enabled || !canLoadMore || isLoading) return;
    if (typeof window === 'undefined' || typeof window.IntersectionObserver === 'undefined') return;

    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry?.isIntersecting) return;
      if (!enabled || !canLoadMore || isLoading) return;

      const signature = `${itemCount}:${Number(canLoadMore)}:${Number(isLoading)}`;
      if (lastTriggerSignatureRef.current === signature) return;
      lastTriggerSignatureRef.current = signature;
      onLoadMoreRef.current?.();
    }, { root, rootMargin, threshold });

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [enabled, canLoadMore, isLoading, itemCount, root, rootMargin, threshold]);

  useEffect(() => {
    if (!enabled || !canLoadMore) {
      lastTriggerSignatureRef.current = '';
    }
  }, [enabled, canLoadMore]);

  return sentinelRef;
}
