import { describe, expect, it } from 'vitest';
import { isReleasedDate, isReleasedItem } from './releaseUtils.js';

const toIsoDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

describe('isReleasedDate', () => {
  it('returns false for invalid values', () => {
    expect(isReleasedDate('')).toBe(false);
    expect(isReleasedDate('invalid-date')).toBe(false);
  });

  it('returns true for today and false for future date', () => {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    expect(isReleasedDate(toIsoDate(today))).toBe(true);
    expect(isReleasedDate(toIsoDate(tomorrow))).toBe(false);
  });
});

describe('isReleasedItem', () => {
  it('uses mediaType-specific release field', () => {
    const movie = { mediaType: 'movie', release_date: '2000-01-01' };
    const show = { mediaType: 'tv', first_air_date: '2005-05-05' };
    const unknown = { mediaType: 'movie', release_date: '' };

    expect(isReleasedItem(movie)).toBe(true);
    expect(isReleasedItem(show)).toBe(true);
    expect(isReleasedItem(unknown)).toBe(false);
  });
});
