const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY;

let didWarnMissingKey = false;

const warnIfNoKey = () => {
  if (!TMDB_API_KEY && !didWarnMissingKey) {
    didWarnMissingKey = true;
    console.warn('Missing VITE_TMDB_API_KEY. Add it to your .env file.');
  }
};

export const tmdbUrl = (path, params = {}) => {
  warnIfNoKey();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${TMDB_BASE_URL}${normalizedPath}`);
  const query = { api_key: TMDB_API_KEY, ...params };

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
};

export const tmdbFetchJson = async (path, params = {}, options = {}) => {
  const response = await fetch(tmdbUrl(path, params), options);
  return response.json();
};
