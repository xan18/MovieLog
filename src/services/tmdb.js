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

const parseTmdbError = async (response) => {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const messageFromPayload = typeof payload?.status_message === 'string'
    ? payload.status_message
    : null;

  return {
    status: response.status,
    statusCode: payload?.status_code ?? null,
    message: messageFromPayload || `TMDB request failed (${response.status})`,
    payload,
  };
};

export class TmdbRequestError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'TmdbRequestError';
    this.status = details.status ?? null;
    this.statusCode = details.statusCode ?? null;
    this.payload = details.payload ?? null;
  }
}

export const tmdbFetchJson = async (path, params = {}, options = {}) => {
  const response = await fetch(tmdbUrl(path, params), options);
  if (!response.ok) {
    const tmdbError = await parseTmdbError(response);
    throw new TmdbRequestError(tmdbError.message, tmdbError);
  }

  try {
    return await response.json();
  } catch {
    throw new TmdbRequestError('TMDB returned invalid JSON payload', {
      status: response.status,
      payload: null,
    });
  }
};

export const tmdbFetchManyJson = async (requests) => {
  if (!Array.isArray(requests)) return [];
  return Promise.all(
    requests.map((request) => tmdbFetchJson(
      request.path,
      request.params || {},
      request.options || {}
    ))
  );
};
