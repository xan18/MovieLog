import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { sanitizeLibraryData, sanitizeLibraryEntry } from '../utils/librarySanitizer.js';

const SYNC_DEBOUNCE_MS = 550;
const UPSERT_BATCH_SIZE = 80;
const DELETE_BATCH_SIZE = 120;
const LOAD_BATCH_SIZE = 1000;
const LOAD_REQUEST_CONCURRENCY = 2;
const MIN_ADAPTIVE_BATCH_SIZE = 20;
const STATEMENT_TIMEOUT_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 250;
const CLOUD_LIBRARY_CACHE_PREFIX = 'movielog:cloud-library-cache:v1';
const CLOUD_LIBRARY_RPC_NAME = 'get_library_payloads';

const normalizeMediaType = (value) => (value === 'tv' ? 'tv' : 'movie');

const toLibraryKey = (mediaType, tmdbId) => `${normalizeMediaType(mediaType)}:${Number(tmdbId)}`;

const buildCloudLibraryCacheKey = (userId) => `${CLOUD_LIBRARY_CACHE_PREFIX}:${String(userId || '').trim()}`;

const readCloudLibraryCache = (userId) => {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  const cacheKey = buildCloudLibraryCacheKey(userId);
  if (!cacheKey) return null;

  try {
    const raw = window.localStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeCloudLibraryCache = (userId, library) => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const cacheKey = buildCloudLibraryCacheKey(userId);
  if (!cacheKey) return;
  try {
    window.localStorage.setItem(cacheKey, JSON.stringify(Array.isArray(library) ? library : []));
  } catch {
    // ignore
  }
};

// Serializing a large library is synchronous. Let the restored library paint first.
const scheduleCloudLibraryCacheWrite = (userId, library) => {
  const persist = () => writeCloudLibraryCache(userId, sanitizeLibraryData(library));
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(persist, { timeout: 3000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(persist, 100);
  return () => clearTimeout(id);
};

const getLibraryItemFingerprint = (item, fingerprintCache) => {
  if (!item || typeof item !== 'object') return '';
  if (!(fingerprintCache instanceof WeakMap)) return JSON.stringify(item);

  const cached = fingerprintCache.get(item);
  if (typeof cached === 'string') return cached;

  const nextFingerprint = JSON.stringify(item);
  fingerprintCache.set(item, nextFingerprint);
  return nextFingerprint;
};

const buildLibrarySnapshot = (library, fingerprintCache = null) => {
  const snapshot = new Map();
  (Array.isArray(library) ? library : []).forEach((item) => {
    const mediaType = normalizeMediaType(item?.mediaType);
    const tmdbId = Number(item?.id);
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) return;
    const key = toLibraryKey(mediaType, tmdbId);
    snapshot.set(key, {
      mediaType,
      tmdbId,
      item,
      fingerprint: getLibraryItemFingerprint(item, fingerprintCache),
    });
  });
  return snapshot;
};

const chunkArray = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

const mapWithConcurrency = async (items, concurrency, mapper) => {
  if (!Array.isArray(items) || items.length === 0) return [];
  const workerLimit = Math.max(1, Number(concurrency) || 1);
  const results = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(workerLimit, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isStatementTimeoutError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('statement timeout')
    || message.includes('canceling statement due to statement timeout');
};

const isMissingFunctionError = (error) => {
  const code = String(error?.code || '').toUpperCase();
  if (code === '42883' || code === 'PGRST202' || code === 'PGRST204') return true;
  const message = String(error?.message || '').toLowerCase();
  return message.includes('function')
    && message.includes('does not exist');
};

const withStatementTimeoutRetry = async (operation, attempts = STATEMENT_TIMEOUT_RETRY_ATTEMPTS) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await operation();
      // Supabase resolves HTTP errors; it does not reject unless throwOnError is used.
      if (result?.error) throw result.error;
      return result;
    } catch (error) {
      lastError = error;
      if (!isStatementTimeoutError(error) || attempt >= attempts) throw error;
      await sleep(RETRY_BASE_DELAY_MS * attempt);
    }
  }
  throw lastError;
};

const runAdaptiveBatch = async ({
  items,
  minBatchSize = MIN_ADAPTIVE_BATCH_SIZE,
  executeBatch,
}) => {
  if (!Array.isArray(items) || items.length === 0) return;

  try {
    await withStatementTimeoutRetry(() => executeBatch(items));
  } catch (error) {
    if (isStatementTimeoutError(error) && items.length > minBatchSize) {
      const middle = Math.ceil(items.length / 2);
      await runAdaptiveBatch({
        items: items.slice(0, middle),
        minBatchSize,
        executeBatch,
      });
      await runAdaptiveBatch({
        items: items.slice(middle),
        minBatchSize,
        executeBatch,
      });
      return;
    }
    throw error;
  }
};

export const loadCloudLibraryRows = async ({ supabaseClient, currentUserId }) => {
  let useRpc = true;
  const loadPage = (from, to, includeCount = false) => withStatementTimeoutRetry(() => {
    const countOptions = includeCount ? { count: 'exact' } : {};
    const query = useRpc
      ? supabaseClient.rpc(CLOUD_LIBRARY_RPC_NAME, {}, countOptions)
      : supabaseClient
        .from('library_items')
        .select('payload', countOptions)
        .eq('user_id', currentUserId)
        .order('id', { ascending: true });
    return query.range(from, to);
  });

  let firstPage;
  try {
    firstPage = await loadPage(0, LOAD_BATCH_SIZE - 1, true);
  } catch (rpcError) {
    if (!isMissingFunctionError(rpcError)) throw rpcError;
    useRpc = false;
    firstPage = await loadPage(0, LOAD_BATCH_SIZE - 1, true);
  }

  const firstRows = Array.isArray(firstPage.data) ? firstPage.data : [];
  const hasExactCount = firstPage.count != null && Number.isFinite(Number(firstPage.count));
  const totalRows = hasExactCount ? Math.max(0, Number(firstPage.count)) : null;
  if (totalRows === 0) return [];
  if (firstRows.length === 0) {
    if (totalRows > 0) throw new Error('Cloud library returned an incomplete page.');
    return [];
  }
  // PostgREST can cap rows below the requested range, including RPC responses.
  // Advance by the page size actually returned so no records are skipped.
  const pageSize = firstRows.length;
  if (totalRows == null) {
    const rows = [...firstRows];
    while (true) {
      const page = await loadPage(rows.length, rows.length + pageSize - 1);
      const batch = Array.isArray(page.data) ? page.data : [];
      rows.push(...batch);
      if (batch.length < pageSize) return rows;
    }
  }
  if (firstRows.length >= totalRows) return firstRows;

  const ranges = [];
  for (let from = firstRows.length; from < totalRows; from += pageSize) {
    ranges.push({
      from,
      to: Math.min(totalRows - 1, from + pageSize - 1),
    });
  }

  const batches = await mapWithConcurrency(
    ranges,
    LOAD_REQUEST_CONCURRENCY,
    async ({ from, to }) => {
      const { data } = await loadPage(from, to);
      const rows = Array.isArray(data) ? data : [];
      if (rows.length !== to - from + 1) throw new Error('Cloud library returned an incomplete page.');
      return rows;
    }
  );

  return firstRows.concat(...batches);
};

export function useCloudLibrarySync({
  enabled,
  supabaseClient,
  currentUserId,
  library,
  setLibrary,
  syncErrorFallback,
}) {
  const [cloudReady, setCloudReady] = useState(false);
  const [cloudSyncError, setCloudSyncError] = useState('');

  const skipNextSyncRef = useRef(false);
  const syncedSnapshotRef = useRef(new Map());
  const syncRevisionRef = useRef(0);
  const itemFingerprintCacheRef = useRef(new WeakMap());
  const cancelCacheWriteRef = useRef(null);

  const queueCacheWrite = useCallback((userId, nextLibrary) => {
    cancelCacheWriteRef.current?.();
    cancelCacheWriteRef.current = scheduleCloudLibraryCacheWrite(userId, nextLibrary);
  }, []);

  useEffect(() => () => cancelCacheWriteRef.current?.(), []);

  const applyLibraryState = useCallback((nextLibrary) => {
    startTransition(() => {
      setLibrary(nextLibrary);
    });
  }, [setLibrary]);

  useEffect(() => {
    if (!enabled || !supabaseClient || !currentUserId) {
      setCloudReady(false);
      setCloudSyncError('');
      skipNextSyncRef.current = false;
      syncedSnapshotRef.current = new Map();
      itemFingerprintCacheRef.current = new WeakMap();
      syncRevisionRef.current += 1;
      return;
    }

    let cancelled = false;
    const revision = syncRevisionRef.current + 1;
    syncRevisionRef.current = revision;
    setCloudReady(false);
    setCloudSyncError('');

    const loadCloudLibrary = async () => {
      try {
        const cachedLibraryRaw = readCloudLibraryCache(currentUserId);
        if (Array.isArray(cachedLibraryRaw)) {
          const cachedLibrary = sanitizeLibraryData(cachedLibraryRaw);
          if (cachedLibrary.length > 0) {
            skipNextSyncRef.current = true;
            applyLibraryState(cachedLibrary);
          }
        }

        const rows = await loadCloudLibraryRows({
          supabaseClient,
          currentUserId,
        });

        if (cancelled || revision !== syncRevisionRef.current) return;

        const remoteLibrary = sanitizeLibraryData(rows.map((row) => row.payload));
        syncedSnapshotRef.current = buildLibrarySnapshot(remoteLibrary, itemFingerprintCacheRef.current);
        skipNextSyncRef.current = true;
        applyLibraryState(remoteLibrary);

        setCloudReady(true);
        queueCacheWrite(currentUserId, remoteLibrary);
      } catch (error) {
        if (cancelled || revision !== syncRevisionRef.current) return;
        setCloudSyncError(error?.message || syncErrorFallback);
        setCloudReady(true);
        console.error('Failed to load cloud library', error);
      }
    };

    loadCloudLibrary();

    return () => {
      cancelled = true;
    };
  }, [applyLibraryState, currentUserId, enabled, queueCacheWrite, supabaseClient, syncErrorFallback]);

  useEffect(() => {
    if (!enabled || !supabaseClient || !currentUserId || !cloudReady) return;

    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }

    const timer = setTimeout(async () => {
      const previousSnapshot = syncedSnapshotRef.current;
      const nextSnapshot = buildLibrarySnapshot(library, itemFingerprintCacheRef.current);

      const rowsToUpsert = [];
      const deleteBuckets = {
        movie: [],
        tv: [],
      };

      nextSnapshot.forEach((nextValue, key) => {
        const previous = previousSnapshot.get(key);
        if (!previous || previous.fingerprint !== nextValue.fingerprint) {
          const sanitizedPayload = sanitizeLibraryEntry(nextValue.item);
          rowsToUpsert.push({
            user_id: currentUserId,
            media_type: nextValue.mediaType,
            tmdb_id: nextValue.tmdbId,
            payload: sanitizedPayload || nextValue.item,
          });
        }
      });

      previousSnapshot.forEach((previousValue, key) => {
        if (nextSnapshot.has(key)) return;
        deleteBuckets[previousValue.mediaType].push(previousValue.tmdbId);
      });

      if (rowsToUpsert.length === 0 && deleteBuckets.movie.length === 0 && deleteBuckets.tv.length === 0) {
        return;
      }

      const revision = syncRevisionRef.current + 1;
      syncRevisionRef.current = revision;
      setCloudSyncError('');

      try {
        for (const batch of chunkArray(rowsToUpsert, UPSERT_BATCH_SIZE)) {
          await runAdaptiveBatch({
            items: batch,
            executeBatch: async (adaptiveBatch) => {
              const { error } = await supabaseClient
                .from('library_items')
                .upsert(adaptiveBatch, { onConflict: 'user_id,media_type,tmdb_id' });
              if (error) throw error;
            },
          });
        }

        for (const mediaType of ['movie', 'tv']) {
          const ids = deleteBuckets[mediaType];
          if (!ids.length) continue;
          for (const batch of chunkArray(ids, DELETE_BATCH_SIZE)) {
            await runAdaptiveBatch({
              items: batch,
              executeBatch: async (adaptiveBatch) => {
                const { error } = await supabaseClient
                  .from('library_items')
                  .delete()
                  .eq('user_id', currentUserId)
                  .eq('media_type', mediaType)
                  .in('tmdb_id', adaptiveBatch);
                if (error) throw error;
              },
            });
          }
        }

        if (syncRevisionRef.current === revision) {
          syncedSnapshotRef.current = nextSnapshot;
          queueCacheWrite(
            currentUserId,
            Array.from(nextSnapshot.values())
              .map((entry) => entry.item)
          );
        }
      } catch (error) {
        if (syncRevisionRef.current !== revision) return;
        setCloudSyncError(error?.message || syncErrorFallback);
        console.error('Cloud sync failed', error);
      }
    }, SYNC_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [cloudReady, currentUserId, enabled, library, queueCacheWrite, supabaseClient, syncErrorFallback]);

  const resetCloudState = () => {
    setCloudSyncError('');
    setCloudReady(false);
    skipNextSyncRef.current = false;
    syncedSnapshotRef.current = new Map();
    itemFingerprintCacheRef.current = new WeakMap();
    syncRevisionRef.current += 1;
  };

  return {
    cloudReady,
    cloudSyncError,
    setCloudSyncError,
    resetCloudState,
  };
}
