import { describe, expect, it } from 'vitest';
import {
  buildPersonalRecommendations,
  buildPersonalRecommendationsCacheKey,
  pickRecommendationSeeds,
} from './personalRecommendations.js';

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

describe('pickRecommendationSeeds', () => {
  const sampleLibrary = [
    { mediaType: 'movie', id: 10, rating: 5, dateAdded: 1000, title: 'Five' },
    { mediaType: 'movie', id: 11, rating: 7, dateAdded: 1500, title: 'Seven' },
    { mediaType: 'movie', id: 20, rating: 8, dateAdded: 2000, title: 'Eight' },
  ];

  it('uses 8+ threshold by default', () => {
    const seeds = pickRecommendationSeeds(sampleLibrary);
    expect(seeds.map((seed) => seed.id)).toEqual([20]);
  });

  it('accepts any custom threshold from 1 to 10', () => {
    const seeds = pickRecommendationSeeds(sampleLibrary, { minSeedRating: 5 });
    expect(seeds.map((seed) => seed.id)).toEqual([20, 11, 10]);
  });
});

describe('buildPersonalRecommendationsCacheKey', () => {
  it('changes cache key when min seed rating changes', () => {
    const baseParams = {
      userId: 'u-1',
      language: 'en-US',
      libraryFingerprint: 'movie:10:8:1000',
    };

    const keyFor8 = buildPersonalRecommendationsCacheKey({
      ...baseParams,
      minSeedRating: 8,
    });
    const keyFor7 = buildPersonalRecommendationsCacheKey({
      ...baseParams,
      minSeedRating: 6,
    });

    expect(keyFor8).not.toBe(keyFor7);
  });

  it('normalizes out-of-range minSeedRating values', () => {
    const baseParams = {
      userId: 'u-1',
      language: 'en-US',
      libraryFingerprint: 'movie:10:8:1000',
    };

    const keyMin0 = buildPersonalRecommendationsCacheKey({
      ...baseParams,
      minSeedRating: 0,
    });
    const keyMin1 = buildPersonalRecommendationsCacheKey({
      ...baseParams,
      minSeedRating: 1,
    });
    const keyMin99 = buildPersonalRecommendationsCacheKey({
      ...baseParams,
      minSeedRating: 99,
    });
    const keyMin10 = buildPersonalRecommendationsCacheKey({
      ...baseParams,
      minSeedRating: 10,
    });

    expect(keyMin0).toBe(keyMin1);
    expect(keyMin99).toBe(keyMin10);
  });
});
