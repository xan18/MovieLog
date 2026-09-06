import { describe, expect, it, vi } from 'vitest';
import { getLibraryTitleFields, hydrateLibraryTitles } from './libraryTitleHydration.js';

describe('library title hydration', () => {
  it('maps localized title fields for movies and shows', () => {
    expect(getLibraryTitleFields({ mediaType: 'movie' }, 'ru-RU')).toEqual({
      localized: 'title_ru',
      base: 'title',
    });
    expect(getLibraryTitleFields({ mediaType: 'tv' }, 'en-US')).toEqual({
      localized: 'name_en',
      base: 'name',
    });
  });

  it('hydrates in batches of two and does not request completed entries again', async () => {
    const items = [
      { id: 1, mediaType: 'movie' },
      { id: 2, mediaType: 'tv' },
      { id: 3, mediaType: 'movie' },
      { id: 4, mediaType: 'movie', title_ru: 'Уже загружено' },
    ];
    const attempted = new Set();
    const requested = [];
    const batches = [];
    const controller = new AbortController();
    const fetchDetails = vi.fn(async (path) => {
      requested.push(path);
      return path.startsWith('/tv/') ? { name: `Название ${path}` } : { title: `Название ${path}` };
    });

    await hydrateLibraryTitles({
      getItems: () => items,
      language: 'ru-RU',
      signal: controller.signal,
      attempted,
      fetchDetails,
      onBatch: (updates) => batches.push([...updates.keys()]),
      pause: async () => {},
    });

    expect(requested).toEqual(['/movie/1', '/tv/2', '/movie/3']);
    expect(batches).toEqual([['movie:1', 'tv:2', 'movie:3']]);
    expect(attempted).toEqual(new Set(['movie:1', 'tv:2', 'movie:3']));
  });
});
