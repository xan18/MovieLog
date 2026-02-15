export const getCatalogSortOptions = (t, mediaType) => ([
  { value: 'popularity.desc', label: t.popular },
  { value: 'vote_average.desc', label: t.rating },
  { value: mediaType === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc', label: t.newest },
]);

export const getReleaseFilterOptions = (t) => ([
  { value: 'all', label: t.releaseAll },
  { value: 'released', label: t.releaseReleased },
  { value: 'upcoming', label: t.releaseUpcoming },
]);

export const getLanguageOptions = (t) => ([
  { id: 'ru', label: t.langRu, flag: 'RU' },
  { id: 'en', label: t.langEn, flag: 'EN' },
]);

export const getThemeOptions = (t) => ([
  { id: 'black', label: t.themeBlack, color: '#000000', textColor: '#fff' },
  { id: 'dark', label: t.themeDark, color: '#23262b', textColor: '#fff' },
  { id: 'night', label: t.themeNight, color: '#0f172a', textColor: '#dbeafe' },
  { id: 'light', label: t.themeLight, color: '#f1f5f9', textColor: '#0f172a' },
]);
