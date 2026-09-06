const normalizePlatform = (entry) => {
  const platform = entry?.platform || entry;
  const id = Number(platform?.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    id,
    name: String(platform?.name || ''),
    slug: String(platform?.slug || ''),
  };
};

export const normalizeRawgGame = (game) => {
  if (!game?.id) return null;
  const platforms = (Array.isArray(game.platforms) ? game.platforms : [])
    .map(normalizePlatform)
    .filter(Boolean);
  const parentPlatforms = (Array.isArray(game.parent_platforms) ? game.parent_platforms : [])
    .map(normalizePlatform)
    .filter(Boolean);

  return {
    ...game,
    id: Number(game.id),
    mediaType: 'game',
    name: String(game.name || ''),
    release_date: game.released || '',
    posterUrl: game.background_image || null,
    rawgRating: Number(game.rating) || 0,
    metacritic: Number(game.metacritic) || 0,
    playtime: Number(game.playtime) || 0,
    genres: Array.isArray(game.genres) ? game.genres : [],
    platforms,
    parentPlatforms,
  };
};

export const rawgFetchJson = async (resource, params = {}, options = {}) => {
  const url = new URL('/api/rawg', window.location.origin);
  url.searchParams.set('resource', String(resource).replace(/^\/+/, ''));
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url, options);
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || `RAWG request failed (${response.status})`);
  return payload;
};

export const getGameImage = (game) => game?.posterUrl || game?.background_image || '/poster-placeholder.svg';
