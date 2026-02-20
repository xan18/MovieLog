import { describe, expect, it } from 'vitest';
import { buildPersonalRecommendations } from './personalRecommendations.js';

describe('buildPersonalRecommendations', () => {
  it('deduplicates strictly by (mediaType, id)', () => {
    const recommendations = buildPersonalRecommendations({
      library: [],
      seedGroups: [
        {
          seed: { mediaType: 'movie', id: 1, rating: 10, title: 'Seed A' },
          results: [
            { id: 501, title: 'Movie 501' },
            { id: 700, title: 'Movie 700' },
            { id: 501, title: 'Movie 501 duplicate in same list' },
          ],
        },
        {
          seed: { mediaType: 'movie', id: 2, rating: 9, title: 'Seed B' },
          results: [
            { id: 501, title: 'Movie 501 duplicate in second seed' },
          ],
        },
        {
          seed: { mediaType: 'tv', id: 3, rating: 9, title: 'Seed C' },
          results: [
            { id: 700, name: 'TV 700' },
          ],
        },
      ],
      maxResults: 20,
    });

    const movie501 = recommendations.filter((item) => item.mediaType === 'movie' && item.id === 501);
    const movie700 = recommendations.filter((item) => item.mediaType === 'movie' && item.id === 700);
    const tv700 = recommendations.filter((item) => item.mediaType === 'tv' && item.id === 700);

    expect(movie501).toHaveLength(1);
    expect(movie700).toHaveLength(1);
    expect(tv700).toHaveLength(1);
    expect(movie501[0].recommendationSeedCount).toBe(2);
  });

  it('filters library titles and ranks by seed rating + recommendation position', () => {
    const recommendations = buildPersonalRecommendations({
      library: [
        { mediaType: 'movie', id: 900 },
      ],
      seedGroups: [
        {
          seed: { mediaType: 'movie', id: 10, rating: 10, title: 'Seed A' },
          results: [
            { id: 200, title: 'Top for Seed A' },
            { id: 201, title: 'Second for Seed A' },
            { id: 900, title: 'Already in library' },
          ],
        },
        {
          seed: { mediaType: 'movie', id: 11, rating: 8, title: 'Seed B' },
          results: [
            { id: 201, title: 'Top for Seed B' },
            { id: 200, title: 'Second for Seed B' },
          ],
        },
      ],
      maxResults: 20,
    });

    expect(recommendations.map((item) => item.id)).toEqual([200, 201]);
    expect(recommendations.some((item) => item.id === 900)).toBe(false);
    expect(recommendations[0].recommendationScore).toBeGreaterThan(recommendations[1].recommendationScore);
    expect(recommendations[0].recommendationReasonSeeds[0].title).toBe('Seed A');
  });
});
