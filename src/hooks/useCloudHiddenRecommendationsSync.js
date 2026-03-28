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

const chunkArray = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

const toKeySet = (values = []) => new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean)
);

const toSortedArray = (valueSet) => Array.from(valueSet).sort();

const areSetsEqual = (left, right) => {
  if (left.size !== right.size) return false;
  for (const key of left) {
    if (!right.has(key)) return false;
  }
  return true;
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
        .upsert(batch, { onConflict: 'user_id,media_type,tmdb_id' });
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

        if (cloudSet.size === 0 && localSet.size > 0) {
          await syncHiddenRecommendationKeySetToCloud({
            supabaseClient,
            currentUserId,
            fromSet: new Set(),
            toSet: localSet,
          });
          if (cancelled || currentRevision !== revisionRef.current) return;
          syncedCloudSetRef.current = new Set(localSet);
          cloudReadyRef.current = true;
          return;
        }

        syncedCloudSetRef.current = cloudSet;
        if (!areSetsEqual(localSet, cloudSet)) {
          writeHiddenPersonalRecommendationKeys(currentUserId, toSortedArray(cloudSet));
          onHiddenChanged?.();
        }
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

    const timer = setInterval(async () => {
      if (!cloudReadyRef.current || !cloudSchemaAvailableRef.current) return;

      try {
        const cloudSet = await fetchCloudHiddenRecommendationKeySet(supabaseClient, currentUserId);
        if (areSetsEqual(cloudSet, syncedCloudSetRef.current)) return;

        syncedCloudSetRef.current = cloudSet;
        const localSet = toKeySet(readHiddenPersonalRecommendationKeys(currentUserId));
        if (areSetsEqual(localSet, cloudSet)) return;

        writeHiddenPersonalRecommendationKeys(currentUserId, toSortedArray(cloudSet));
        onHiddenChanged?.();
      } catch (error) {
        if (error?.code === SCHEMA_MISSING_ERROR_CODE) {
          cloudSchemaAvailableRef.current = false;
          return;
        }
        console.error('Failed to poll hidden recommendations from cloud', error);
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [currentUserId, enabled, onHiddenChanged, supabaseClient]);
}
