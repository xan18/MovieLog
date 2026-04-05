import { useCallback, useEffect, useMemo, useState } from 'react';
import { tmdbFetchJson } from '../services/tmdb.js';
import {
  PERSONAL_RECOMMENDATIONS_CACHE_TTL_MS,
  PERSONAL_RECOMMENDATIONS_MAX_RESULTS,
  PERSONAL_RECOMMENDATIONS_MIN_SEED_RATING,
  PERSONAL_RECOMMENDATIONS_MIN_SEED_RATING_MAX,
  PERSONAL_RECOMMENDATIONS_MIN_SEED_RATING_MIN,
  PERSONAL_RECOMMENDATIONS_PAGE_SIZE,
  buildLibraryFingerprint,
  buildPersonalRecommendations,
  buildPersonalRecommendationsCacheKey,
  clearPersonalRecommendationsCache,
  getPersonalRecommendationKey,
  mapWithConcurrency,
  pickRecommendationSeeds,
  readPersonalRecommendationsCache,
  writePersonalRecommendationsCache,
} from '../services/personalRecommendations.js';

const REQUEST_CONCURRENCY = 3;
const MAX_PAGES_PER_SEED = 3;
const RECOMMENDATION_MEDIA_TYPE_FILTERS = new Set(['all', 'movie', 'tv']);

const countDisplayableRecommendations = ({
  recommendations,
  mediaTypeFilter,
  hiddenRecommendationKeySet,
}) => (
  (Array.isArray(recommendations) ? recommendations : []).reduce((count, item) => {
    if (mediaTypeFilter !== 'all' && item?.mediaType !== mediaTypeFilter) return count;
    const key = getPersonalRecommendationKey(item?.mediaType, item?.id);
    if (key && hiddenRecommendationKeySet.has(key)) return count;
    return count + 1;
  }, 0)
);

export function usePersonalRecommendations({
  library,
  lang,
  currentUserId,
  enabled = true,
  minSeedRating = PERSONAL_RECOMMENDATIONS_MIN_SEED_RATING,
  mediaTypeFilter = 'all',
  maxResults = PERSONAL_RECOMMENDATIONS_MAX_RESULTS,
  pageSize = PERSONAL_RECOMMENDATIONS_PAGE_SIZE,
  cacheTtlMs = PERSONAL_RECOMMENDATIONS_CACHE_TTL_MS,
  hiddenRecommendationKeys = [],
}) {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);
  const [visibleCount, setVisibleCount] = useState(pageSize);

  const tmdbLanguage = lang === 'ru' ? 'ru-RU' : 'en-US';
  const normalizedMinSeedRating = Number.isFinite(Number(minSeedRating))
    ? Math.max(
      PERSONAL_RECOMMENDATIONS_MIN_SEED_RATING_MIN,
      Math.min(PERSONAL_RECOMMENDATIONS_MIN_SEED_RATING_MAX, Math.round(Number(minSeedRating)))
    )
    : PERSONAL_RECOMMENDATIONS_MIN_SEED_RATING;
  const normalizedMediaTypeFilter = RECOMMENDATION_MEDIA_TYPE_FILTERS.has(mediaTypeFilter)
    ? mediaTypeFilter
    : 'all';
  const seeds = useMemo(
    () => pickRecommendationSeeds(library, { minSeedRating: normalizedMinSeedRating }),
    [library, normalizedMinSeedRating]
  );
  const seedCount = seeds.length;
  const libraryFingerprint = useMemo(() => buildLibraryFingerprint(library), [library]);

  const cacheKey = useMemo(() => buildPersonalRecommendationsCacheKey({
    userId: currentUserId || 'anonymous',
    language: tmdbLanguage,
    libraryFingerprint,
    minSeedRating: normalizedMinSeedRating,
  }), [currentUserId, libraryFingerprint, normalizedMinSeedRating, tmdbLanguage]);
  const hiddenRecommendationKeySet = useMemo(
    () => new Set(
      (Array.isArray(hiddenRecommendationKeys) ? hiddenRecommendationKeys : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    ),
    [hiddenRecommendationKeys]
  );
  const minimumVisibleRecommendations = Math.min(
    maxResults,
    Math.max(visibleCount, pageSize)
  );

  useEffect(() => {
    setVisibleCount((prev) => (prev < pageSize ? pageSize : prev));
  }, [pageSize]);

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

    const countDisplayable = (items) => countDisplayableRecommendations({
      recommendations: items,
      mediaTypeFilter: normalizedMediaTypeFilter,
      hiddenRecommendationKeySet,
    });

    const cached = readPersonalRecommendationsCache(cacheKey, cacheTtlMs);
    if (cached && countDisplayable(cached) >= minimumVisibleRecommendations) {
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
              totalPages: Math.max(1, Number(payload?.total_pages) || 1),
              nextPage: 2,
            };
          }
        );

        if (cancelled) return;
        const rankRecommendations = () => buildPersonalRecommendations({
          library,
          seedGroups: seedGroups.map((group) => ({
            seed: group.seed,
            results: group.results,
          })),
          maxResults,
        });

        let rankedRecommendations = rankRecommendations();

        while (!cancelled && countDisplayable(rankedRecommendations) < minimumVisibleRecommendations) {
          const expandableGroups = seedGroups.filter((group) => (
            group.nextPage <= group.totalPages
            && group.nextPage <= MAX_PAGES_PER_SEED
          ));
          if (expandableGroups.length === 0) break;

          const nextPageBatches = await mapWithConcurrency(
            expandableGroups,
            REQUEST_CONCURRENCY,
            async (group) => {
              const payload = await tmdbFetchJson(`/${group.seed.mediaType}/${group.seed.id}/recommendations`, {
                language: tmdbLanguage,
                page: group.nextPage,
              });

              return {
                group,
                results: Array.isArray(payload?.results) ? payload.results : [],
                totalPages: Math.max(1, Number(payload?.total_pages) || group.totalPages || 1),
              };
            }
          );

          nextPageBatches.forEach((batch) => {
            if (!batch?.group) return;
            batch.group.totalPages = batch.totalPages;
            batch.group.nextPage += 1;
            if (Array.isArray(batch.results) && batch.results.length > 0) {
              batch.group.results = [...batch.group.results, ...batch.results];
            }
          });

          rankedRecommendations = rankRecommendations();
        }

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
    hiddenRecommendationKeySet,
    library,
    maxResults,
    minimumVisibleRecommendations,
    normalizedMediaTypeFilter,
    pageSize,
    refreshToken,
    seedCount,
    seeds,
    tmdbLanguage,
    visibleCount,
  ]);

  const filteredRecommendations = useMemo(
    () => recommendations.filter((item) => {
      if (normalizedMediaTypeFilter !== 'all' && item?.mediaType !== normalizedMediaTypeFilter) return false;
      const key = getPersonalRecommendationKey(item?.mediaType, item?.id);
      if (!key) return true;
      return !hiddenRecommendationKeySet.has(key);
    }),
    [hiddenRecommendationKeySet, normalizedMediaTypeFilter, recommendations]
  );
  const visibleRecommendations = useMemo(
    () => filteredRecommendations.slice(0, visibleCount),
    [filteredRecommendations, visibleCount]
  );

  const hasMore = visibleCount < filteredRecommendations.length;

  const showMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + pageSize, filteredRecommendations.length));
  }, [pageSize, filteredRecommendations.length]);

  return {
    seedCount,
    recommendations: filteredRecommendations,
    visibleRecommendations,
    loading,
    error,
    hasMore,
    showMore,
    refresh,
  };
}
