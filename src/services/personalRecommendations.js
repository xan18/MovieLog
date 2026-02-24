export const PERSONAL_RECOMMENDATIONS_MIN_SEED_RATING = 8;
export const PERSONAL_RECOMMENDATIONS_MAX_RESULTS = 100;
export const PERSONAL_RECOMMENDATIONS_PAGE_SIZE = 20;
export const PERSONAL_RECOMMENDATIONS_CACHE_TTL_MS = 10 * 60 * 1000;

const CACHE_PREFIX = 'movielog:personal-recommendations:v1';
const HIDDEN_PREFIX = 'movielog:personal-recommendations:hidden:v1';

const normalizeMediaType = (mediaType) => {
  if (mediaType === 'movie' || mediaType === 'tv') return mediaType;
  return '';
};

const normalizeId = (id) => {
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0) return 0;
  return numericId;
};

const normalizeRating = (rating) => {
  const numericRating = Math.round(Number(rating) || 0);
  if (!Number.isFinite(numericRating)) return 0;
  return Math.max(0, Math.min(10, numericRating));
};

const normalizeDateAdded = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return 0;
  return numericValue;
};

const resolveItemTitle = (item) => {
  const title = (item?.title || item?.name || '').trim();
  if (title) return title;
  const id = normalizeId(item?.id);
  return id > 0 ? `TMDB #${id}` : 'Untitled';
};

const simpleHash = (input) => {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
};

const getSeedWeightByRating = (rating) => {
  const normalized = normalizeRating(rating);
  if (normalized >= 10) return 3;
  if (normalized >= 9) return 2;
  return 1;
};

export const getPersonalRecommendationKey = (mediaType, id) => {
  const normalizedMediaType = normalizeMediaType(mediaType);
  const normalizedId = normalizeId(id);
  if (!normalizedMediaType || normalizedId === 0) return '';
  return `${normalizedMediaType}-${normalizedId}`;
};

export const parsePersonalRecommendationKey = (key) => {
  const value = String(key || '').trim();
  const match = /^((movie)|(tv))-(\d+)$/.exec(value);
  if (!match) return null;
  const mediaType = match[1];
  const id = Number(match[4]);
  if (!mediaType || !Number.isFinite(id) || id <= 0) return null;
  return { key: value, mediaType, id };
};

const buildHiddenRecommendationsStorageKey = (userId) => {
  const normalizedUserId = String(userId || 'anonymous').trim() || 'anonymous';
  return `${HIDDEN_PREFIX}:${normalizedUserId}`;
};

export const readHiddenPersonalRecommendationKeys = (userId) => {
  if (typeof window === 'undefined' || !window.localStorage) return [];

  const storageKey = buildHiddenRecommendationsStorageKey(userId);
  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (!rawValue) return [];

    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      window.localStorage.removeItem(storageKey);
      return [];
    }

    const normalizedUnique = Array.from(new Set(
      parsed
        .map((value) => String(value || '').trim())
        .filter((value) => /^((movie)|(tv))-\d+$/.test(value))
    ));

    if (normalizedUnique.length !== parsed.length) {
      window.localStorage.setItem(storageKey, JSON.stringify(normalizedUnique));
    }

    return normalizedUnique;
  } catch {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    return [];
  }
};

export const hidePersonalRecommendationForUser = (userId, mediaType, id) => {
  if (typeof window === 'undefined' || !window.localStorage) return false;

  const recommendationKey = getPersonalRecommendationKey(mediaType, id);
  if (!recommendationKey) return false;

  const storageKey = buildHiddenRecommendationsStorageKey(userId);
  const currentKeys = readHiddenPersonalRecommendationKeys(userId);
  if (currentKeys.includes(recommendationKey)) return false;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify([...currentKeys, recommendationKey]));
    return true;
  } catch {
    return false;
  }
};

export const unhidePersonalRecommendationForUser = (userId, mediaType, id) => {
  if (typeof window === 'undefined' || !window.localStorage) return false;

  const recommendationKey = getPersonalRecommendationKey(mediaType, id);
  if (!recommendationKey) return false;

  const storageKey = buildHiddenRecommendationsStorageKey(userId);
  const currentKeys = readHiddenPersonalRecommendationKeys(userId);
  if (!currentKeys.includes(recommendationKey)) return false;

  const nextKeys = currentKeys.filter((key) => key !== recommendationKey);
  try {
    if (nextKeys.length === 0) window.localStorage.removeItem(storageKey);
    else window.localStorage.setItem(storageKey, JSON.stringify(nextKeys));
    return true;
  } catch {
    return false;
  }
};

export const clearHiddenPersonalRecommendationsForUser = (userId) => {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  const storageKey = buildHiddenRecommendationsStorageKey(userId);
  try {
    const hadAny = Boolean(window.localStorage.getItem(storageKey));
    window.localStorage.removeItem(storageKey);
    return hadAny;
  } catch {
    return false;
  }
};

export const pickRecommendationSeeds = (library = []) => {
  if (!Array.isArray(library) || library.length === 0) return [];

  const byKey = new Map();

  library.forEach((item) => {
    const mediaType = normalizeMediaType(item?.mediaType);
    const id = normalizeId(item?.id);
    const rating = normalizeRating(item?.rating);
    if (!mediaType || id === 0 || rating < PERSONAL_RECOMMENDATIONS_MIN_SEED_RATING) return;

    const seed = {
      mediaType,
      id,
      rating,
      title: resolveItemTitle(item),
      dateAdded: normalizeDateAdded(item?.dateAdded),
    };

    const key = getPersonalRecommendationKey(mediaType, id);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, seed);
      return;
    }

    const shouldReplace = seed.rating > existing.rating
      || (seed.rating === existing.rating && seed.dateAdded > existing.dateAdded);
    if (shouldReplace) byKey.set(key, seed);
  });

  return Array.from(byKey.values()).sort((a, b) => (
    (b.rating - a.rating)
    || (b.dateAdded - a.dateAdded)
    || a.title.localeCompare(b.title)
  ));
};

export const buildLibraryFingerprint = (library = []) => {
  if (!Array.isArray(library) || library.length === 0) return 'empty';

  const parts = library
    .map((item) => {
      const mediaType = normalizeMediaType(item?.mediaType);
      const id = normalizeId(item?.id);
      if (!mediaType || id === 0) return null;
      const rating = normalizeRating(item?.rating);
      const dateAdded = normalizeDateAdded(item?.dateAdded);
      return `${mediaType}:${id}:${rating}:${dateAdded}`;
    })
    .filter(Boolean)
    .sort();

  if (parts.length === 0) return 'empty';
  return parts.join('|');
};

export const buildPersonalRecommendationsCacheKey = ({
  userId,
  language,
  libraryFingerprint,
}) => {
  const normalizedUserId = (userId || 'anonymous').trim();
  const normalizedLanguage = (language || 'en-US').trim();
  const hash = simpleHash(libraryFingerprint || 'empty');
  return `${CACHE_PREFIX}:${normalizedUserId}:${normalizedLanguage}:${hash}`;
};

export const readPersonalRecommendationsCache = (cacheKey, ttlMs = PERSONAL_RECOMMENDATIONS_CACHE_TTL_MS) => {
  if (typeof window === 'undefined' || !window.sessionStorage || !cacheKey) return null;

  try {
    const rawValue = window.sessionStorage.getItem(cacheKey);
    if (!rawValue) return null;

    const parsed = JSON.parse(rawValue);
    const timestamp = Number(parsed?.timestamp) || 0;
    const recommendations = Array.isArray(parsed?.recommendations) ? parsed.recommendations : null;
    if (!timestamp || !recommendations) {
      window.sessionStorage.removeItem(cacheKey);
      return null;
    }

    if (Date.now() - timestamp > ttlMs) {
      window.sessionStorage.removeItem(cacheKey);
      return null;
    }

    return recommendations;
  } catch {
    try {
      window.sessionStorage.removeItem(cacheKey);
    } catch {
      // ignore
    }
    return null;
  }
};

export const writePersonalRecommendationsCache = (cacheKey, recommendations) => {
  if (typeof window === 'undefined' || !window.sessionStorage || !cacheKey) return;
  if (!Array.isArray(recommendations)) return;

  try {
    window.sessionStorage.setItem(cacheKey, JSON.stringify({
      timestamp: Date.now(),
      recommendations,
    }));
  } catch {
    // ignore cache write failures
  }
};

export const clearPersonalRecommendationsCache = (cacheKey) => {
  if (typeof window === 'undefined' || !window.sessionStorage || !cacheKey) return;
  try {
    window.sessionStorage.removeItem(cacheKey);
  } catch {
    // ignore cache clear failures
  }
};

export const mapWithConcurrency = async (items, concurrency, mapper) => {
  if (!Array.isArray(items) || items.length === 0) return [];
  if (typeof mapper !== 'function') return [];

  const workerLimit = Math.max(1, Number(concurrency) || 1);
  const results = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(workerLimit, items.length) },
    async () => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        if (currentIndex >= items.length) break;
        results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      }
    }
  );

  await Promise.all(workers);
  return results;
};

export const buildPersonalRecommendations = ({
  library = [],
  seedGroups = [],
  maxResults = PERSONAL_RECOMMENDATIONS_MAX_RESULTS,
  maxReasonSeeds = 2,
}) => {
  if (!Array.isArray(seedGroups) || seedGroups.length === 0) return [];

  const libraryKeySet = new Set(
    (Array.isArray(library) ? library : [])
      .map((item) => getPersonalRecommendationKey(item?.mediaType, item?.id))
      .filter(Boolean)
  );

  const byCandidateKey = new Map();

  seedGroups.forEach((group) => {
    const seedMediaType = normalizeMediaType(group?.seed?.mediaType);
    const seedId = normalizeId(group?.seed?.id);
    if (!seedMediaType || seedId === 0) return;

    const seedRating = normalizeRating(group?.seed?.rating);
    const seedWeight = getSeedWeightByRating(seedRating);
    const seedTitle = resolveItemTitle(group?.seed);
    const seedKey = getPersonalRecommendationKey(seedMediaType, seedId);
    const seenWithinSeed = new Set();
    const results = Array.isArray(group?.results) ? group.results : [];

    results.forEach((rawItem, index) => {
      const itemId = normalizeId(rawItem?.id);
      if (itemId === 0) return;
      const itemMediaType = normalizeMediaType(rawItem?.media_type) || seedMediaType;
      const itemKey = getPersonalRecommendationKey(itemMediaType, itemId);
      if (!itemKey || libraryKeySet.has(itemKey) || seenWithinSeed.has(itemKey)) return;
      seenWithinSeed.add(itemKey);

      const rankWeight = 1 / (index + 1);
      const contribution = seedWeight * rankWeight;
      const voteAverage = Number(rawItem?.vote_average) || 0;

      const candidate = byCandidateKey.get(itemKey) || {
        item: {
          ...rawItem,
          id: itemId,
          mediaType: itemMediaType,
        },
        score: 0,
        bestRank: Number.POSITIVE_INFINITY,
        seedContributions: new Map(),
      };

      candidate.score += contribution;
      candidate.bestRank = Math.min(candidate.bestRank, index);

      const existingContribution = candidate.seedContributions.get(seedKey);
      if (!existingContribution || contribution > existingContribution.contribution) {
        candidate.seedContributions.set(seedKey, {
          mediaType: seedMediaType,
          id: seedId,
          title: seedTitle,
          rating: seedRating,
          contribution,
          rank: index,
        });
      }

      if (!candidate.item.title && !candidate.item.name) {
        candidate.item.title = resolveItemTitle(rawItem);
      }
      candidate.item.vote_average = Number.isFinite(voteAverage) ? voteAverage : 0;
      byCandidateKey.set(itemKey, candidate);
    });
  });

  const normalized = Array.from(byCandidateKey.values()).map((candidate) => {
    const reasonSeeds = Array.from(candidate.seedContributions.values())
      .sort((a, b) => (
        (b.contribution - a.contribution)
        || (a.rank - b.rank)
        || a.title.localeCompare(b.title)
      ))
      .slice(0, Math.max(1, maxReasonSeeds))
      .map((seed) => ({
        mediaType: seed.mediaType,
        id: seed.id,
        title: seed.title,
        rating: seed.rating,
      }));

    return {
      ...candidate.item,
      recommendationScore: Number(candidate.score.toFixed(6)),
      recommendationSeedCount: candidate.seedContributions.size,
      recommendationReasonSeeds: reasonSeeds,
      recommendationBestRank: candidate.bestRank,
    };
  });

  normalized.sort((a, b) => (
    (b.recommendationScore - a.recommendationScore)
    || (b.recommendationSeedCount - a.recommendationSeedCount)
    || (a.recommendationBestRank - b.recommendationBestRank)
    || ((Number(b.vote_average) || 0) - (Number(a.vote_average) || 0))
    || (a.id - b.id)
  ));

  const limit = Math.max(1, Number(maxResults) || PERSONAL_RECOMMENDATIONS_MAX_RESULTS);
  return normalized.slice(0, limit);
};
