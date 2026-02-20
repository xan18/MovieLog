import { useEffect, useRef, useState } from 'react';
import { sanitizeLibraryData } from '../utils/librarySanitizer.js';

const SYNC_DEBOUNCE_MS = 550;
const UPSERT_BATCH_SIZE = 200;
const DELETE_BATCH_SIZE = 300;

const normalizeMediaType = (value) => (value === 'tv' ? 'tv' : 'movie');

const toLibraryKey = (mediaType, tmdbId) => `${normalizeMediaType(mediaType)}:${Number(tmdbId)}`;

const buildLibrarySnapshot = (library) => {
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
      fingerprint: JSON.stringify(item),
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

  useEffect(() => {
    if (!enabled || !supabaseClient || !currentUserId) {
      setCloudReady(false);
      setCloudSyncError('');
      skipNextSyncRef.current = false;
      syncedSnapshotRef.current = new Map();
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
        const { data, error } = await supabaseClient
          .from('library_items')
          .select('media_type, tmdb_id, payload')
          .eq('user_id', currentUserId);

        if (cancelled || revision !== syncRevisionRef.current) return;

        if (error) {
          setCloudSyncError(error.message || syncErrorFallback);
          setCloudReady(true);
          return;
        }

        const remoteLibrary = sanitizeLibraryData((data || []).map((row) => row.payload));
        syncedSnapshotRef.current = buildLibrarySnapshot(remoteLibrary);

        if (remoteLibrary.length > 0) {
          skipNextSyncRef.current = true;
          setLibrary(remoteLibrary);
        }

        setCloudReady(true);
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
  }, [currentUserId, enabled, setLibrary, supabaseClient, syncErrorFallback]);

  useEffect(() => {
    if (!enabled || !supabaseClient || !currentUserId || !cloudReady) return;

    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }

    const timer = setTimeout(async () => {
      const previousSnapshot = syncedSnapshotRef.current;
      const nextSnapshot = buildLibrarySnapshot(library);

      const rowsToUpsert = [];
      const deleteBuckets = {
        movie: [],
        tv: [],
      };

      nextSnapshot.forEach((nextValue, key) => {
        const previous = previousSnapshot.get(key);
        if (!previous || previous.fingerprint !== nextValue.fingerprint) {
          rowsToUpsert.push({
            user_id: currentUserId,
            media_type: nextValue.mediaType,
            tmdb_id: nextValue.tmdbId,
            payload: nextValue.item,
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
          const { error } = await supabaseClient
            .from('library_items')
            .upsert(batch, { onConflict: 'user_id,media_type,tmdb_id' });
          if (error) throw error;
        }

        for (const mediaType of ['movie', 'tv']) {
          const ids = deleteBuckets[mediaType];
          if (!ids.length) continue;
          for (const batch of chunkArray(ids, DELETE_BATCH_SIZE)) {
            const { error } = await supabaseClient
              .from('library_items')
              .delete()
              .eq('user_id', currentUserId)
              .eq('media_type', mediaType)
              .in('tmdb_id', batch);
            if (error) throw error;
          }
        }

        if (syncRevisionRef.current === revision) {
          syncedSnapshotRef.current = nextSnapshot;
        }
      } catch (error) {
        if (syncRevisionRef.current !== revision) return;
        setCloudSyncError(error?.message || syncErrorFallback);
        console.error('Cloud sync failed', error);
      }
    }, SYNC_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [cloudReady, currentUserId, enabled, library, supabaseClient, syncErrorFallback]);

  const resetCloudState = () => {
    setCloudSyncError('');
    setCloudReady(false);
    skipNextSyncRef.current = false;
    syncedSnapshotRef.current = new Map();
    syncRevisionRef.current += 1;
  };

  return {
    cloudReady,
    cloudSyncError,
    setCloudSyncError,
    resetCloudState,
  };
}
