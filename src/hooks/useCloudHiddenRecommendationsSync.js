import { useEffect, useRef } from 'react';
import {
  getPersonalRecommendationKey,
  parsePersonalRecommendationKey,
  readHiddenPersonalRecommendationKeys,
  writeHiddenPersonalRecommendationKeys,
} from '../services/personalRecommendations.js';

const HIDDEN_RECOMMENDATIONS_TABLE = 'hidden_personal_recommendations';
const POLL_INTERVAL_MS = 15 * 1000;
const SCHEMA_MISSING_ERROR_CODE = '42P01';
const HIDDEN_SYNC_SNAPSHOT_PREFIX = 'movielog:personal-recommendations:hidden:cloud-sync:v2';

const chunkArray = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

const toKeySet = (values = []) => {
  const set = new Set();
  (Array.isArray(values) ? values : []).forEach((value) => {
    const parsed = parsePersonalRecommendationKey(String(value || '').trim());
    if (!parsed?.key) return;
    set.add(parsed.key);
  });
  return set;
};

const toSortedArray = (valueSet) => Array.from(valueSet).sort();

const mergeKeySets = (...sets) => {
  const merged = new Set();
  sets.forEach((setValue) => {
    if (!(setValue instanceof Set)) return;
    setValue.forEach((key) => merged.add(key));
  });
  return merged;
};

const areSetsEqual = (left, right) => {
  if (left.size !== right.size) return false;
  for (const key of left) {
    if (!right.has(key)) return false;
  }
  return true;
};

const buildHiddenSyncSnapshotStorageKey = (userId) => {
  const normalizedUserId = String(userId || 'anonymous').trim() || 'anonymous';
  return `${HIDDEN_SYNC_SNAPSHOT_PREFIX}:${normalizedUserId}`;
};

const readHiddenCloudSyncSnapshot = (userId) => {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(buildHiddenSyncSnapshotStorageKey(userId));
    if (!raw || raw === '1') return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      window.localStorage.removeItem(buildHiddenSyncSnapshotStorageKey(userId));
      return null;
    }
    const normalized = toKeySet(parsed);
    if (normalized.size !== parsed.length) {
      window.localStorage.setItem(
        buildHiddenSyncSnapshotStorageKey(userId),
        JSON.stringify(toSortedArray(normalized))
      );
    }
    return normalized;
  } catch {
    try {
      window.localStorage.removeItem(buildHiddenSyncSnapshotStorageKey(userId));
    } catch {
      // ignore localStorage failures
    }
    return null;
  }
};

const writeHiddenCloudSyncSnapshot = (userId, keySet) => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      buildHiddenSyncSnapshotStorageKey(userId),
      JSON.stringify(toSortedArray(keySet))
    );
  } catch {
    // ignore localStorage failures
  }
};

const resolveSyncTargetSet = ({
  baselineSet,
  localSet,
  cloudSet,
}) => {
  if (areSetsEqual(localSet, cloudSet)) return new Set(localSet);
  if (!(baselineSet instanceof Set)) return mergeKeySets(localSet, cloudSet);

  const localMatchesBaseline = areSetsEqual(localSet, baselineSet);
  const cloudMatchesBaseline = areSetsEqual(cloudSet, baselineSet);

  if (localMatchesBaseline && !cloudMatchesBaseline) return new Set(cloudSet);
  if (!localMatchesBaseline && cloudMatchesBaseline) return new Set(localSet);

  return mergeKeySets(localSet, cloudSet);
};

const fetchCloudHiddenRecommendationKeySet = async (supabaseClient, currentUserId) => {
  const { data, error } = await supabaseClient
    .from(HIDDEN_RECOMMENDATIONS_TABLE)
    .select('media_type, tmdb_id')
    .eq('user_id', currentUserId);

  if (error) throw error;
  const keys = (Array.isArray(data) ? data : [])
    .map((row) => getPersonalRecommendationKey(row?.media_type, row?.tmdb_id))
    .filter(Boolean);
  return toKeySet(keys);
};

const syncHiddenRecommendationKeySetToCloud = async ({
  supabaseClient,
  currentUserId,
  fromSet,
  toSet,
}) => {
  const rowsToUpsert = [];
  const deleteBuckets = {
    movie: [],
    tv: [],
  };

  toSet.forEach((key) => {
    if (fromSet.has(key)) return;
    const parsed = parsePersonalRecommendationKey(key);
    if (!parsed) return;
    rowsToUpsert.push({
      user_id: currentUserId,
      media_type: parsed.mediaType,
      tmdb_id: parsed.id,
    });
  });

  fromSet.forEach((key) => {
    if (toSet.has(key)) return;
    const parsed = parsePersonalRecommendationKey(key);
    if (!parsed) return;
    deleteBuckets[parsed.mediaType].push(parsed.id);
  });

  if (rowsToUpsert.length > 0) {
    for (const batch of chunkArray(rowsToUpsert, 200)) {
      const { error } = await supabaseClient
        .from(HIDDEN_RECOMMENDATIONS_TABLE)
        .insert(batch, {
          onConflict: 'user_id,media_type,tmdb_id',
          ignoreDuplicates: true,
        });
      if (error) throw error;
    }
  }

  for (const mediaType of ['movie', 'tv']) {
    const tmdbIds = deleteBuckets[mediaType];
    if (tmdbIds.length === 0) continue;
    for (const batch of chunkArray(tmdbIds, 300)) {
      const { error } = await supabaseClient
        .from(HIDDEN_RECOMMENDATIONS_TABLE)
        .delete()
        .eq('user_id', currentUserId)
        .eq('media_type', mediaType)
        .in('tmdb_id', batch);
      if (error) throw error;
    }
  }
};

export function useCloudHiddenRecommendationsSync({
  enabled,
  supabaseClient,
  currentUserId,
  hiddenVersion = 0,
  onHiddenChanged,
}) {
  const syncedCloudSetRef = useRef(new Set());
  const cloudReadyRef = useRef(false);
  const cloudSchemaAvailableRef = useRef(true);
  const revisionRef = useRef(0);

  useEffect(() => {
    if (!enabled || !supabaseClient || !currentUserId) {
      syncedCloudSetRef.current = new Set();
      cloudReadyRef.current = false;
      cloudSchemaAvailableRef.current = true;
      revisionRef.current += 1;
      return;
    }

    let cancelled = false;
    const currentRevision = revisionRef.current + 1;
    revisionRef.current = currentRevision;
    cloudReadyRef.current = false;
    cloudSchemaAvailableRef.current = true;

    const initializeSync = async () => {
      try {
        const cloudSet = await fetchCloudHiddenRecommendationKeySet(supabaseClient, currentUserId);
        if (cancelled || currentRevision !== revisionRef.current) return;

        const localSet = toKeySet(readHiddenPersonalRecommendationKeys(currentUserId));
        const baselineSet = readHiddenCloudSyncSnapshot(currentUserId);
        const targetSet = resolveSyncTargetSet({
          baselineSet,
          localSet,
          cloudSet,
        });

        if (!areSetsEqual(cloudSet, targetSet)) {
          await syncHiddenRecommendationKeySetToCloud({
            supabaseClient,
            currentUserId,
            fromSet: cloudSet,
            toSet: targetSet,
          });
          if (cancelled || currentRevision !== revisionRef.current) return;
        }

        syncedCloudSetRef.current = new Set(targetSet);
        if (!areSetsEqual(localSet, targetSet)) {
          writeHiddenPersonalRecommendationKeys(currentUserId, toSortedArray(targetSet));
          onHiddenChanged?.();
        }
        writeHiddenCloudSyncSnapshot(currentUserId, targetSet);
      } catch (error) {
        if (cancelled || currentRevision !== revisionRef.current) return;

        if (error?.code === SCHEMA_MISSING_ERROR_CODE) {
          cloudSchemaAvailableRef.current = false;
          console.warn(
            'Cloud sync for hidden recommendations is disabled. Run supabase/hidden_recommendations_schema.sql.',
            error
          );
          return;
        }

        console.error('Failed to initialize cloud hidden recommendations sync', error);
      } finally {
        if (!cancelled && currentRevision === revisionRef.current) {
          cloudReadyRef.current = true;
        }
      }
    };

    initializeSync();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, enabled, onHiddenChanged, supabaseClient]);

  useEffect(() => {
    if (!enabled || !supabaseClient || !currentUserId) return;
    if (!cloudReadyRef.current || !cloudSchemaAvailableRef.current) return;

    const localSet = toKeySet(readHiddenPersonalRecommendationKeys(currentUserId));
    if (areSetsEqual(localSet, syncedCloudSetRef.current)) return;

    let cancelled = false;
    const currentRevision = revisionRef.current + 1;
    revisionRef.current = currentRevision;

    const pushLocalChanges = async () => {
      try {
        await syncHiddenRecommendationKeySetToCloud({
          supabaseClient,
          currentUserId,
          fromSet: new Set(syncedCloudSetRef.current),
          toSet: localSet,
        });
        if (cancelled || currentRevision !== revisionRef.current) return;
        syncedCloudSetRef.current = new Set(localSet);
        writeHiddenCloudSyncSnapshot(currentUserId, localSet);
      } catch (error) {
        if (cancelled || currentRevision !== revisionRef.current) return;
        if (error?.code === SCHEMA_MISSING_ERROR_CODE) {
          cloudSchemaAvailableRef.current = false;
          console.warn(
            'Cloud sync for hidden recommendations is disabled. Run supabase/hidden_recommendations_schema.sql.',
            error
          );
          return;
        }
        console.error('Failed to sync hidden recommendations to cloud', error);
      }
    };

    pushLocalChanges();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, enabled, hiddenVersion, supabaseClient]);

  useEffect(() => {
    if (!enabled || !supabaseClient || !currentUserId) return undefined;

    let cancelled = false;
    let inFlight = false;

    const timer = setInterval(async () => {
      if (cancelled || inFlight) return;
      if (!cloudReadyRef.current || !cloudSchemaAvailableRef.current) return;

      try {
        inFlight = true;
        const baselineSet = new Set(syncedCloudSetRef.current);
        const cloudSet = await fetchCloudHiddenRecommendationKeySet(supabaseClient, currentUserId);
        if (cancelled) return;
        if (areSetsEqual(cloudSet, baselineSet)) return;

        const localSet = toKeySet(readHiddenPersonalRecommendationKeys(currentUserId));
        const targetSet = resolveSyncTargetSet({
          baselineSet,
          localSet,
          cloudSet,
        });

        if (!areSetsEqual(cloudSet, targetSet)) {
          await syncHiddenRecommendationKeySetToCloud({
            supabaseClient,
            currentUserId,
            fromSet: cloudSet,
            toSet: targetSet,
          });
          if (cancelled) return;
        }

        if (!areSetsEqual(localSet, targetSet)) {
          writeHiddenPersonalRecommendationKeys(currentUserId, toSortedArray(targetSet));
          onHiddenChanged?.();
        }

        syncedCloudSetRef.current = new Set(targetSet);
        writeHiddenCloudSyncSnapshot(currentUserId, targetSet);
      } catch (error) {
        if (error?.code === SCHEMA_MISSING_ERROR_CODE) {
          cloudSchemaAvailableRef.current = false;
          return;
        }
        console.error('Failed to poll hidden recommendations from cloud', error);
      } finally {
        inFlight = false;
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [currentUserId, enabled, onHiddenChanged, supabaseClient]);
}
