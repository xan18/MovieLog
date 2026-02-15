import { isReleasedDate } from './releaseUtils.js';

const MOVIE_STATUSES = new Set(['planned', 'completed']);
const TV_STATUSES = new Set(['watching', 'planned', 'completed', 'dropped', 'on_hold']);

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

const clampRating = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, Math.round(n)));
};

const normalizeDateAdded = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : Date.now();
};

const normalizeEpisodeMap = (map) => {
  if (!isObject(map)) return {};
  return Object.entries(map).reduce((acc, [season, episodes]) => {
    if (!Array.isArray(episodes)) return acc;
    const validEpisodes = Array.from(
      new Set(
        episodes
          .map((ep) => Number(ep))
          .filter((ep) => Number.isInteger(ep) && ep > 0)
      )
    ).sort((a, b) => a - b);
    if (validEpisodes.length) acc[season] = validEpisodes;
    return acc;
  }, {});
};

const normalizeSeasonRatings = (map) => {
  if (!isObject(map)) return {};
  return Object.entries(map).reduce((acc, [season, rating]) => {
    const normalized = clampRating(rating);
    if (normalized > 0) acc[season] = normalized;
    return acc;
  }, {});
};

const normalizeGenres = (genres) => {
  if (!Array.isArray(genres)) return [];
  return genres.filter((g) => g && typeof g === 'object' && typeof g.name === 'string');
};

const normalizeCredits = (credits) => {
  if (!isObject(credits)) return undefined;
  const cast = Array.isArray(credits.cast) ? credits.cast : [];
  const crew = Array.isArray(credits.crew) ? credits.crew : [];
  return { ...credits, cast, crew };
};

export const sanitizeLibraryEntry = (entry) => {
  if (!isObject(entry)) return null;
  const mediaType = entry.mediaType === 'tv' ? 'tv' : entry.mediaType === 'movie' ? 'movie' : null;
  if (!mediaType || !entry.id) return null;

  if (mediaType === 'movie') {
    let status = MOVIE_STATUSES.has(entry.status) ? entry.status : 'planned';
    let rating = clampRating(entry.rating);
    const released = isReleasedDate(entry.release_date);
    if (!released && status === 'completed') {
      status = 'planned';
      rating = 0;
    }
    return {
      ...entry,
      mediaType,
      status,
      rating,
      genres: normalizeGenres(entry.genres),
      credits: normalizeCredits(entry.credits),
      dateAdded: normalizeDateAdded(entry.dateAdded),
    };
  }

  let status = TV_STATUSES.has(entry.status) ? entry.status : 'watching';
  let rating = clampRating(entry.rating);
  let watchedEpisodes = normalizeEpisodeMap(entry.watchedEpisodes);
  let seasonRatings = normalizeSeasonRatings(entry.seasonRatings);
  const released = isReleasedDate(entry.first_air_date);
  if (!released && status === 'completed') {
    status = 'planned';
    rating = 0;
    watchedEpisodes = {};
    seasonRatings = {};
  }
  return {
    ...entry,
    mediaType,
    status,
    rating,
    genres: normalizeGenres(entry.genres),
    credits: normalizeCredits(entry.credits),
    watchedEpisodes,
    seasonRatings,
    episodeRuntimes: isObject(entry.episodeRuntimes) ? entry.episodeRuntimes : {},
    dateAdded: normalizeDateAdded(entry.dateAdded),
  };
};

export const sanitizeLibraryData = (list) => {
  if (!Array.isArray(list)) return [];
  const deduped = new Map();
  list.forEach((item) => {
    const normalized = sanitizeLibraryEntry(item);
    if (!normalized) return;
    const key = `${normalized.mediaType}:${normalized.id}`;
    const existing = deduped.get(key);
    if (!existing || normalized.dateAdded >= existing.dateAdded) {
      deduped.set(key, normalized);
    }
  });
  return Array.from(deduped.values());
};
