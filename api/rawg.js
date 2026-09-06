const RAWG_BASE_URL = 'https://api.rawg.io/api';

const ALLOWED_RESOURCES = [
  /^games$/,
  /^games\/\d+$/,
  /^games\/\d+\/suggested$/,
  /^games\/\d+\/game-series$/,
  /^genres$/,
  /^platforms$/,
  /^platforms\/lists\/parents$/,
];

const ALLOWED_PARAMS = new Set([
  'page', 'page_size', 'search', 'search_precise', 'ordering', 'dates',
  'genres', 'platforms', 'parent_platforms', 'exclude_additions',
  'exclude_parents', 'metacritic', 'tags',
]);

const setCorsHeaders = (response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

export default async function handler(request, response) {
  setCorsHeaders(response);
  if (request.method === 'OPTIONS') return response.status(204).end();
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.RAWG_API_KEY;
  if (!apiKey) return response.status(503).json({ error: 'RAWG API is not configured' });

  const resource = String(request.query.resource || '').replace(/^\/+|\/+$/g, '');
  if (!ALLOWED_RESOURCES.some((pattern) => pattern.test(resource))) {
    return response.status(400).json({ error: 'Unsupported RAWG resource' });
  }

  const upstreamUrl = new URL(`${RAWG_BASE_URL}/${resource}`);
  upstreamUrl.searchParams.set('key', apiKey);
  Object.entries(request.query).forEach(([key, rawValue]) => {
    if (key === 'resource' || !ALLOWED_PARAMS.has(key)) return;
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (value !== undefined && value !== null && String(value) !== '') {
      upstreamUrl.searchParams.set(key, String(value));
    }
  });

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { Accept: 'application/json' },
    });
    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      return response.status(upstream.status).json({
        error: payload?.detail || payload?.error || `RAWG request failed (${upstream.status})`,
      });
    }

    response.setHeader('Cache-Control', resource.match(/^games\/\d+$/)
      ? 's-maxage=21600, stale-while-revalidate=86400'
      : 's-maxage=1800, stale-while-revalidate=21600');
    return response.status(200).json(payload);
  } catch (error) {
    console.error('RAWG proxy request failed', error);
    return response.status(502).json({ error: 'RAWG is temporarily unavailable' });
  }
}
