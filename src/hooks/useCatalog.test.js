import { describe, expect, it } from 'vitest';
import { resolveCatalogSort } from './useCatalog.js';

describe('resolveCatalogSort', () => {
  it('maps cross-media newest sort to the correct field', () => {
    expect(resolveCatalogSort('tv', 'primary_release_date.desc')).toBe('first_air_date.desc');
    expect(resolveCatalogSort('movie', 'first_air_date.desc')).toBe('primary_release_date.desc');
  });

  it('keeps supported sort modes unchanged', () => {
    expect(resolveCatalogSort('movie', 'vote_average.desc')).toBe('vote_average.desc');
    expect(resolveCatalogSort('tv', 'popularity.desc')).toBe('popularity.desc');
  });

  it('falls back to popularity for unsupported values', () => {
    expect(resolveCatalogSort('movie', 'unknown')).toBe('popularity.desc');
    expect(resolveCatalogSort('tv', 'random')).toBe('popularity.desc');
  });
});
