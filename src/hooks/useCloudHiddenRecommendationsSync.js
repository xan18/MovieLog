import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearHiddenPersonalRecommendationsForUser,
  getPersonalRecommendationKey,
  parsePersonalRecommendationKey,
  readHiddenPersonalRecommendationKeys,
} from '../services/personalRecommendations.js';

const HIDDEN_RECOMMENDATIONS_TABLE = 'hidden_personal_recommendations';
const POLL_INTERVAL_MS = 15 * 1000;
const SCHEMA_MISSING_ERROR_CODE = '42P01';
const POSTGREST_SCHEMA_MISSING_ERROR_CODE = 'PGRST205';
const UPSERT_BATCH_SIZE = 200;
const HIDDEN_TABLE_MISSING_MESSAGE = 'Hidden recommendations table is missing. Run supabase/hidden_recommendations_schema.sql.';

const toSortedKeyArray = (keySet) => Array.from(keySet).sort();

const areSetsEqual = (left, right) => {
  if (left.size !== right.size) return false;
  for (const key of left) {
    if (!right.has(key)) return false;
  }
  return true;
};

const mergeSets = (...sets) => {
  const merged = new Set();
  sets.forEach((setValue) => {
    if (!(setValue instanceof Set)) return;
    setValue.forEach((key) => merged.add(key));
  });
  return merged;
};

const chunkArray = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const mapRowsToHiddenKeySet = (rows = []) => {
  const keySet = new Set();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const key = getPersonalRecommendationKey(row?.media_type, row?.tmdb_id);
    if (!key) return;
    keySet.add(key);
  });
  return keySet;
};

const fetchCloudHiddenKeySet = async (supabaseClient, currentUserId) => {
  const { data, error } = await supabaseClient
    .from(HIDDEN_RECOMMENDATIONS_TABLE)
    .select('media_type, tmdb_id')
    .eq('user_id', currentUserId);

  if (error) throw error;
  return mapRowsToHiddenKeySet(data);
};

const insertMissingCloudHiddenKeys = async ({
  supabaseClient,
  currentUserId,
  targetSet,
  sourceSet,
}) => {
  const rowsToInsert = [];
  targetSet.forEach((key) => {
    if (sourceSet.has(key)) return;
    const parsed = parsePersonalRecommendationKey(key);
    if (!parsed) return;
    rowsToInsert.push({
      user_id: currentUserId,
      media_type: parsed.mediaType,
      tmdb_id: parsed.id,
    });
  });

  if (rowsToInsert.length === 0) return;

  for (const batch of chunkArray(rowsToInsert, UPSERT_BATCH_SIZE)) {
    const { error } = await supabaseClient
      .from(HIDDEN_RECOMMENDATIONS_TABLE)
      .insert(batch, {
        onConflict: 'user_id,media_type,tmdb_id',
        ignoreDuplicates: true,
      });
    if (error) throw error;
  }
};

const getSyncErrorMessage = (error, fallbackMessage = '') => (
  error?.message || fallbackMessage || 'Cloud sync failed'
);

const isMissingHiddenRecommendationsTableError = (error) => {
  const code = String(error?.code || '').trim().toUpperCase();
  if (code === SCHEMA_MISSING_ERROR_CODE || code === POSTGREST_SCHEMA_MISSING_ERROR_CODE) return true;
  const message = String(error?.message || '').toLowerCase();
  return message.includes('could not find the table')
    && message.includes('hidden_personal_recommendations');
};

export function useCloudHiddenRecommendationsSync({
  enabled,
  supabaseClient,
  currentUserId,
  pollIntervalMs = POLL_INTERVAL_MS,
  syncErrorFallback = '',
}) {
  const [hiddenRecommendationKeys, setHiddenRecommendationKeys] = useState([]);
  const [hiddenRecommendationsReady, setHiddenRecommendationsReady] = useState(false);
  const [hiddenRecommendationsError, setHiddenRecommendationsError] = useState('');

  const hiddenSetRef = useRef(new Set());
  const revisionRef = useRef(0);

  const applyHiddenSet = useCallback((nextSet) => {
    hiddenSetRef.current = new Set(nextSet);
    setHiddenRecommendationKeys(toSortedKeyArray(nextSet));
  }, []);

  const clearHiddenState = useCallback(() => {
    hiddenSetRef.current = new Set();
    setHiddenRecommendationKeys([]);
  }, []);

  const refreshHiddenRecommendations = useCallback(async () => {
    if (!enabled || !supabaseClient || !currentUserId) {
      clearHiddenState();
      return false;
    }

    try {
      const cloudSet = await fetchCloudHiddenKeySet(supabaseClient, currentUserId);
      if (!areSetsEqual(cloudSet, hiddenSetRef.current)) {
        applyHiddenSet(cloudSet);
      }
      setHiddenRecommendationsError('');
      return true;
    } catch (error) {
      if (isMissingHiddenRecommendationsTableError(error)) {
        setHiddenRecommendationsError(HIDDEN_TABLE_MISSING_MESSAGE);
      } else {
        setHiddenRecommendationsError(getSyncErrorMessage(error, syncErrorFallback));
      }
      console.error('Failed to refresh hidden recommendations from cloud', error);
      return false;
    }
  }, [applyHiddenSet, clearHiddenState, currentUserId, enabled, supabaseClient, syncErrorFallback]);

  useEffect(() => {
    if (!enabled || !supabaseClient || !currentUserId) {
      revisionRef.current += 1;
      clearHiddenState();
      setHiddenRecommendationsReady(false);
      setHiddenRecommendationsError('');
      return;
    }

    let cancelled = false;
    const revision = revisionRef.current + 1;
    revisionRef.current = revision;

    setHiddenRecommendationsReady(false);
    setHiddenRecommendationsError('');

    const initialize = async () => {
      try {
        const cloudSet = await fetchCloudHiddenKeySet(supabaseClient, currentUserId);
        if (cancelled || revision !== revisionRef.current) return;

        const legacyLocalSet = new Set(readHiddenPersonalRecommendationKeys(currentUserId));
        const targetSet = mergeSets(cloudSet, legacyLocalSet);

        if (!areSetsEqual(targetSet, cloudSet)) {
          await insertMissingCloudHiddenKeys({
            supabaseClient,
            currentUserId,
            targetSet,
            sourceSet: cloudSet,
          });
          if (cancelled || revision !== revisionRef.current) return;
        }

        if (legacyLocalSet.size > 0) {
          clearHiddenPersonalRecommendationsForUser(currentUserId);
        }

        applyHiddenSet(targetSet);
        setHiddenRecommendationsError('');
      } catch (error) {
        if (cancelled || revision !== revisionRef.current) return;
        if (isMissingHiddenRecommendationsTableError(error)) {
          setHiddenRecommendationsError(HIDDEN_TABLE_MISSING_MESSAGE);
        } else {
          setHiddenRecommendationsError(getSyncErrorMessage(error, syncErrorFallback));
        }
        console.error('Failed to initialize hidden recommendations cloud sync', error);
      } finally {
        if (cancelled || revision !== revisionRef.current) return;
        setHiddenRecommendationsReady(true);
      }
    };

    initialize();

    return () => {
      cancelled = true;
    };
  }, [
    applyHiddenSet,
    clearHiddenState,
    currentUserId,
    enabled,
    syncErrorFallback,
    supabaseClient,
  ]);

  useEffect(() => {
    if (!enabled || !supabaseClient || !currentUserId || !hiddenRecommendationsReady) return undefined;

    let cancelled = false;
    let inFlight = false;
    const normalizedPollInterval = Math.max(5000, Number(pollIntervalMs) || POLL_INTERVAL_MS);

    const timer = setInterval(async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      await refreshHiddenRecommendations();
      inFlight = false;
    }, normalizedPollInterval);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [
    currentUserId,
    enabled,
    hiddenRecommendationsReady,
    pollIntervalMs,
    refreshHiddenRecommendations,
    supabaseClient,
  ]);

  const hideRecommendation = useCallback(async (mediaType, id) => {
    if (!enabled || !supabaseClient || !currentUserId) return false;

    const key = getPersonalRecommendationKey(mediaType, id);
    const parsed = parsePersonalRecommendationKey(key);
    if (!parsed) return false;

    const nextSet = new Set(hiddenSetRef.current);
    if (nextSet.has(parsed.key)) return false;

    const { error } = await supabaseClient
      .from(HIDDEN_RECOMMENDATIONS_TABLE)
      .insert({
        user_id: currentUserId,
        media_type: parsed.mediaType,
        tmdb_id: parsed.id,
      }, {
        onConflict: 'user_id,media_type,tmdb_id',
        ignoreDuplicates: true,
      });

    if (error) {
      if (isMissingHiddenRecommendationsTableError(error)) {
        setHiddenRecommendationsError(HIDDEN_TABLE_MISSING_MESSAGE);
      } else {
        setHiddenRecommendationsError(getSyncErrorMessage(error, syncErrorFallback));
      }
      console.error('Failed to hide recommendation in cloud', error);
      return false;
    }

    nextSet.add(parsed.key);
    applyHiddenSet(nextSet);
    setHiddenRecommendationsError('');
    return true;
  }, [applyHiddenSet, currentUserId, enabled, supabaseClient, syncErrorFallback]);

  const unhideRecommendation = useCallback(async (mediaType, id) => {
    if (!enabled || !supabaseClient || !currentUserId) return false;

    const key = getPersonalRecommendationKey(mediaType, id);
    const parsed = parsePersonalRecommendationKey(key);
    if (!parsed) return false;

    const { error } = await supabaseClient
      .from(HIDDEN_RECOMMENDATIONS_TABLE)
      .delete()
      .eq('user_id', currentUserId)
      .eq('media_type', parsed.mediaType)
      .eq('tmdb_id', parsed.id);

    if (error) {
      if (isMissingHiddenRecommendationsTableError(error)) {
        setHiddenRecommendationsError(HIDDEN_TABLE_MISSING_MESSAGE);
      } else {
        setHiddenRecommendationsError(getSyncErrorMessage(error, syncErrorFallback));
      }
      console.error('Failed to unhide recommendation in cloud', error);
      return false;
    }

    const nextSet = new Set(hiddenSetRef.current);
    const changed = nextSet.delete(parsed.key);
    if (changed) applyHiddenSet(nextSet);
    setHiddenRecommendationsError('');
    return changed;
  }, [applyHiddenSet, currentUserId, enabled, supabaseClient, syncErrorFallback]);

  const clearHiddenRecommendations = useCallback(async () => {
    if (!enabled || !supabaseClient || !currentUserId) return false;
    if (hiddenSetRef.current.size === 0) return false;

    const { error } = await supabaseClient
      .from(HIDDEN_RECOMMENDATIONS_TABLE)
      .delete()
      .eq('user_id', currentUserId);

    if (error) {
      if (isMissingHiddenRecommendationsTableError(error)) {
        setHiddenRecommendationsError(HIDDEN_TABLE_MISSING_MESSAGE);
      } else {
        setHiddenRecommendationsError(getSyncErrorMessage(error, syncErrorFallback));
      }
      console.error('Failed to clear hidden recommendations in cloud', error);
      return false;
    }

    applyHiddenSet(new Set());
    setHiddenRecommendationsError('');
    return true;
  }, [applyHiddenSet, currentUserId, enabled, supabaseClient, syncErrorFallback]);

  return {
    hiddenRecommendationKeys,
    hiddenRecommendationsReady,
    hiddenRecommendationsError,
    refreshHiddenRecommendations,
    hideRecommendation,
    unhideRecommendation,
    clearHiddenRecommendations,
  };
}
