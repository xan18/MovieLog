import { useCallback, useEffect, useMemo, useState } from 'react';
import { tmdbFetchJson } from '../services/tmdb.js';
import {
  PERSONAL_RECOMMENDATIONS_CACHE_TTL_MS,
  PERSONAL_RECOMMENDATIONS_MAX_RESULTS,
  PERSONAL_RECOMMENDATIONS_PAGE_SIZE,
  buildLibraryFingerprint,
  buildPersonalRecommendations,
  buildPersonalRecommendationsCacheKey,
  clearPersonalRecommendationsCache,
  mapWithConcurrency,
  pickRecommendationSeeds,
  readPersonalRecommendationsCache,
  writePersonalRecommendationsCache,
} from '../services/personalRecommendations.js';

const REQUEST_CONCURRENCY = 3;

export function usePersonalRecommendations({
  library,
  lang,
  currentUserId,
  enabled = true,
  maxResults = PERSONAL_RECOMMENDATIONS_MAX_RESULTS,
  pageSize = PERSONAL_RECOMMENDATIONS_PAGE_SIZE,
  cacheTtlMs = PERSONAL_RECOMMENDATIONS_CACHE_TTL_MS,
}) {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);
  const [visibleCount, setVisibleCount] = useState(pageSize);

  const tmdbLanguage = lang === 'ru' ? 'ru-RU' : 'en-US';
  const seeds = useMemo(() => pickRecommendationSeeds(library), [library]);
  const seedCount = seeds.length;
  const libraryFingerprint = useMemo(() => buildLibraryFingerprint(library), [library]);

  const cacheKey = useMemo(() => buildPersonalRecommendationsCacheKey({
    userId: currentUserId || 'anonymous',
    language: tmdbLanguage,
    libraryFingerprint,
  }), [currentUserId, libraryFingerprint, tmdbLanguage]);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [cacheKey, pageSize]);

  const refresh = useCallback(() => {
    clearPersonalRecommendationsCache(cacheKey);
    setRefreshToken((prev) => prev + 1);
  }, [cacheKey]);

  useEffect(() => {
    let cancelled = false;
    if (!enabled) return () => {
      cancelled = true;
    };

    if (seedCount === 0) {
      setError('');
      setLoading(false);
      setRecommendations([]);
      return () => {
        cancelled = true;
      };
    }

    const cached = readPersonalRecommendationsCache(cacheKey, cacheTtlMs);
    if (cached) {
      setError('');
      setLoading(false);
      setRecommendations(cached);
      return () => {
        cancelled = true;
      };
    }

    const loadRecommendations = async () => {
      setError('');
      setLoading(true);
      try {
        const seedGroups = await mapWithConcurrency(
          seeds,
          REQUEST_CONCURRENCY,
          async (seed) => {
            const payload = await tmdbFetchJson(`/${seed.mediaType}/${seed.id}/recommendations`, {
              language: tmdbLanguage,
              page: 1,
            });

            return {
              seed,
              results: Array.isArray(payload?.results) ? payload.results : [],
            };
          }
        );

        if (cancelled) return;
        const rankedRecommendations = buildPersonalRecommendations({
          library,
          seedGroups,
          maxResults,
        });
        setRecommendations(rankedRecommendations);
        writePersonalRecommendationsCache(cacheKey, rankedRecommendations);
      } catch (fetchError) {
        if (cancelled) return;
        console.error('Failed to load personal recommendations', fetchError);
        setRecommendations([]);
        setError(fetchError?.message || 'Failed to load personal recommendations');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadRecommendations();

    return () => {
      cancelled = true;
    };
  }, [
    cacheKey,
    cacheTtlMs,
    enabled,
    lang,
    library,
    maxResults,
    refreshToken,
    seedCount,
    seeds,
    tmdbLanguage,
  ]);

  const visibleRecommendations = useMemo(
    () => recommendations.slice(0, visibleCount),
    [recommendations, visibleCount]
  );

  const hasMore = visibleCount < recommendations.length;

  const showMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + pageSize, recommendations.length));
  }, [pageSize, recommendations.length]);

  return {
    seedCount,
    recommendations,
    visibleRecommendations,
    loading,
    error,
    hasMore,
    showMore,
    refresh,
  };
}
