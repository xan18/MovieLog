import { isReleasedDate } from './releaseUtils.js';

const MOVIE_STATUSES = new Set(['planned', 'completed']);
const TV_STATUSES = new Set(['watching', 'planned', 'completed', 'dropped']);

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

const normalizeDateModified = (value, fallbackDateAdded) => {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n;
  const fallback = Number(fallbackDateAdded);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : Date.now();
};

const normalizeEpisodeMap = (map) => {
  if (!isObject(map)) return {};
  return Object.entries(map).reduce((acc, [season, episodes]) => {
    const seasonNum = Number(season);
    if (!Number.isInteger(seasonNum) || seasonNum <= 0) return acc;
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

const sanitizeCreditPerson = (person) => {
  if (!isObject(person)) return null;
  const id = Number(person.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    id,
    name: typeof person.name === 'string' ? person.name : '',
    original_name: typeof person.original_name === 'string' ? person.original_name : '',
    profile_path: typeof person.profile_path === 'string' ? person.profile_path : null,
    character: typeof person.character === 'string' ? person.character : '',
    job: typeof person.job === 'string' ? person.job : '',
    department: typeof person.department === 'string' ? person.department : '',
    known_for_department: typeof person.known_for_department === 'string' ? person.known_for_department : '',
    order: Number.isFinite(Number(person.order)) ? Number(person.order) : 0,
  };
};

const normalizeCredits = (credits) => {
  if (!isObject(credits)) return undefined;
  const cast = (Array.isArray(credits.cast) ? credits.cast : [])
    .map(sanitizeCreditPerson)
    .filter(Boolean)
    .slice(0, 12);
  const crew = (Array.isArray(credits.crew) ? credits.crew : [])
    .map(sanitizeCreditPerson)
    .filter((person) => person && person.job === 'Director')
    .slice(0, 8);
  return { cast, crew };
};

const normalizeCreatedBy = (createdBy) => {
  if (!Array.isArray(createdBy)) return [];
  return createdBy
    .map((person) => {
      if (!isObject(person)) return null;
      const id = Number(person.id);
      if (!Number.isFinite(id) || id <= 0) return null;
      return {
        id,
        name: typeof person.name === 'string' ? person.name : '',
        original_name: typeof person.original_name === 'string' ? person.original_name : '',
        profile_path: typeof person.profile_path === 'string' ? person.profile_path : null,
      };
    })
    .filter(Boolean)
    .slice(0, 8);
};

const normalizeTvSeasons = (seasons) => {
  if (!Array.isArray(seasons)) return [];
  return seasons
    .map((season) => {
      if (!isObject(season)) return null;
      const seasonNumber = Number(season.season_number);
      if (!Number.isFinite(seasonNumber) || seasonNumber < 0) return null;
      const id = Number(season.id);
      const episodeCount = Number(season.episode_count);
      return {
        id: Number.isFinite(id) && id > 0 ? id : undefined,
        season_number: seasonNumber,
        name: typeof season.name === 'string' ? season.name : '',
        air_date: typeof season.air_date === 'string' ? season.air_date : '',
        episode_count: Number.isFinite(episodeCount) && episodeCount > 0 ? episodeCount : 0,
        poster_path: typeof season.poster_path === 'string' ? season.poster_path : null,
        vote_average: Number.isFinite(Number(season.vote_average)) ? Number(season.vote_average) : 0,
      };
    })
    .filter(Boolean);
};

const stripHeavyFields = (entry) => {
  if (!isObject(entry)) return entry;
  const next = { ...entry };
  [
    'recommendations',
    'collectionParts',
    'relatedShows',
    'videos',
    'images',
    'keywords',
    'similar',
    'detailsLoading',
    'detailsExtrasLoading',
  ].forEach((key) => {
    delete next[key];
  });
  return next;
};

export const sanitizeLibraryEntry = (entry) => {
  if (!isObject(entry)) return null;
  const mediaType = entry.mediaType === 'tv' ? 'tv' : entry.mediaType === 'movie' ? 'movie' : null;
  if (!mediaType || !entry.id) return null;

  if (mediaType === 'movie') {
    let status = MOVIE_STATUSES.has(entry.status) ? entry.status : 'planned';
    let rating = clampRating(entry.rating);
    const released = isReleasedDate(entry.release_date);
    const dateAdded = normalizeDateAdded(entry.dateAdded);
    if (!released && status === 'completed') {
      status = 'planned';
      rating = 0;
    }
    return stripHeavyFields({
      ...entry,
      mediaType,
      status,
      rating,
      genres: normalizeGenres(entry.genres),
      credits: normalizeCredits(entry.credits),
      dateAdded,
      dateModified: normalizeDateModified(entry.dateModified, dateAdded),
    });
  }

  const normalizedInputStatus = entry.status === 'on_hold' ? 'watching' : entry.status;
  let status = TV_STATUSES.has(normalizedInputStatus) ? normalizedInputStatus : 'watching';
  let rating = clampRating(entry.rating);
  let watchedEpisodes = normalizeEpisodeMap(entry.watchedEpisodes);
  let seasonRatings = normalizeSeasonRatings(entry.seasonRatings);
  const released = isReleasedDate(entry.first_air_date);
  const dateAdded = normalizeDateAdded(entry.dateAdded);
  if (!released && status === 'completed') {
    status = 'planned';
    rating = 0;
    watchedEpisodes = {};
    seasonRatings = {};
  }
  return stripHeavyFields({
    ...entry,
    mediaType,
    status,
    rating,
    genres: normalizeGenres(entry.genres),
    credits: normalizeCredits(entry.credits),
    created_by: normalizeCreatedBy(entry.created_by),
    watchedEpisodes,
    seasonRatings,
    episodeRuntimes: isObject(entry.episodeRuntimes) ? entry.episodeRuntimes : {},
    seasons: normalizeTvSeasons(entry.seasons),
    dateAdded,
    dateModified: normalizeDateModified(entry.dateModified, dateAdded),
  });
};

export const sanitizeLibraryData = (list) => {
  if (!Array.isArray(list)) return [];
  const deduped = new Map();
  list.forEach((item) => {
    const normalized = sanitizeLibraryEntry(item);
    if (!normalized) return;
    const key = `${normalized.mediaType}:${normalized.id}`;
    const existing = deduped.get(key);
    const normalizedTimestamp = Math.max(normalized.dateModified || 0, normalized.dateAdded || 0);
    const existingTimestamp = existing ? Math.max(existing.dateModified || 0, existing.dateAdded || 0) : 0;
    if (!existing || normalizedTimestamp >= existingTimestamp) {
      deduped.set(key, normalized);
    }
  });
  return Array.from(deduped.values());
};
