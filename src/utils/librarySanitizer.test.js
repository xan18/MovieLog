import { describe, expect, it } from 'vitest';
import { sanitizeLibraryData, sanitizeLibraryEntry } from './librarySanitizer.js';

const toIsoDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

describe('sanitizeLibraryData', () => {
  it('deduplicates items by mediaType + id and keeps newest entry', () => {
    const result = sanitizeLibraryData([
      { mediaType: 'movie', id: 10, status: 'planned', dateAdded: 100 },
      { mediaType: 'movie', id: 10, status: 'completed', rating: 8, dateAdded: 200, release_date: '2010-01-01' },
      { mediaType: 'tv', id: 10, status: 'watching', dateAdded: 150, first_air_date: '2011-01-01' },
    ]);

    expect(result).toHaveLength(2);
    expect(result.find((item) => item.mediaType === 'movie')?.status).toBe('completed');
    expect(result.find((item) => item.mediaType === 'tv')).toBeTruthy();
  });
});

describe('sanitizeLibraryEntry', () => {
  it('forces unreleased movie out of completed state', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const entry = sanitizeLibraryEntry({
      mediaType: 'movie',
      id: 21,
      status: 'completed',
      rating: 9,
      release_date: toIsoDate(tomorrow),
      dateAdded: 123,
    });

    expect(entry?.status).toBe('planned');
    expect(entry?.rating).toBe(0);
  });

  it('preserves a completed movie when release metadata is missing', () => {
    const entry = sanitizeLibraryEntry({
      mediaType: 'movie',
      id: 22,
      status: 'completed',
      rating: 9,
      dateAdded: 123,
    });

    expect(entry?.status).toBe('completed');
    expect(entry?.rating).toBe(9);
  });

  it('normalizes watched episodes and season ratings for tv entries', () => {
    const entry = sanitizeLibraryEntry({
      mediaType: 'tv',
      id: 42,
      status: 'watching',
      rating: 4.6,
      first_air_date: '2019-04-01',
      watchedEpisodes: { 1: [3, 1, 1, -2, '4', 2.2], 2: 'bad' },
      seasonRatings: { 1: 7.7, 2: -5, 3: '9' },
      dateAdded: 456,
    });

    expect(entry?.watchedEpisodes).toEqual({ 1: [1, 3, 4] });
    expect(entry?.seasonRatings).toEqual({ 1: 8, 3: 9 });
    expect(entry?.rating).toBe(5);
  });

  it('migrates legacy on_hold tv status to watching', () => {
    const entry = sanitizeLibraryEntry({
      mediaType: 'tv',
      id: 77,
      status: 'on_hold',
      first_air_date: '2020-01-01',
      watchedEpisodes: { 1: [1, 2] },
      seasonRatings: { 1: 8 },
      rating: 8,
      dateAdded: 789,
    });

    expect(entry?.status).toBe('watching');
    expect(entry?.watchedEpisodes).toEqual({ 1: [1, 2] });
    expect(entry?.seasonRatings).toEqual({ 1: 8 });
    expect(entry?.rating).toBe(8);
  });

  it('keeps game status, platform and compact RAWG metadata', () => {
    const entry = sanitizeLibraryEntry({
      mediaType: 'game',
      id: 3498,
      name: 'Grand Theft Auto V',
      status: 'playing',
      platform: 'PC',
      rating: 9,
      background_image: 'discarded',
      posterUrl: 'https://example.com/game.jpg',
      genres: [{ id: 4, name: 'Action', slug: 'action' }],
      platforms: [{ id: 4, name: 'PC', slug: 'pc' }],
      parentPlatforms: [{ platform: { id: 1, name: 'PC', slug: 'pc' } }],
      short_screenshots: [{ id: 1 }],
      dateAdded: 100,
    });

    expect(entry).toMatchObject({ mediaType: 'game', status: 'playing', platform: 'PC', rating: 9 });
    expect(entry?.platforms).toEqual([{ id: 4, name: 'PC', slug: 'pc' }]);
    expect(entry?.parentPlatforms).toEqual([{ id: 1, name: 'PC', slug: 'pc' }]);
    expect(entry).not.toHaveProperty('short_screenshots');
    expect(entry).not.toHaveProperty('background_image');
  });
});
