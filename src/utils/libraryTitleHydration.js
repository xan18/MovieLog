const BATCH_SIZE = 2;
const COMMIT_BATCH_SIZE = 20;

export const getLibraryTitleFields = (item, language) => ({
  localized: `${item.mediaType === 'tv' ? 'name' : 'title'}_${language === 'ru-RU' ? 'ru' : 'en'}`,
  base: item.mediaType === 'tv' ? 'name' : 'title',
});

// Keep this queue independent of React renders: a rating edit must not restart
// hundreds of background title requests or discard already fetched batches.
export const hydrateLibraryTitles = async ({
  getItems,
  language,
  signal,
  attempted,
  fetchDetails,
  onBatch,
  pause,
}) => {
  await pause(1500);
  const bufferedUpdates = new Map();
  while (!signal.aborted) {
    const pending = getItems().filter((item) => {
      const key = `${item.mediaType}:${item.id}`;
      const { localized } = getLibraryTitleFields(item, language);
      return !attempted.has(key) && !String(item?.[localized] || '').trim();
    }).slice(0, BATCH_SIZE);
    if (pending.length === 0) {
      if (bufferedUpdates.size > 0) onBatch(new Map(bufferedUpdates));
      return;
    }

    const results = await Promise.all(pending.map(async (item) => {
      const key = `${item.mediaType}:${item.id}`;
      try {
        const detail = await fetchDetails(`/${item.mediaType}/${item.id}`, { language }, { signal });
        const title = item.mediaType === 'tv'
          ? (detail.name || detail.original_name || '')
          : (detail.title || detail.original_title || '');
        if (signal.aborted) return null;
        attempted.add(key);
        return title ? { key, title } : null;
      } catch {
        // Retry failed metadata on the next session, rather than creating a
        // request loop for unavailable or deleted TMDB entries.
        if (!signal.aborted) attempted.add(key);
        return null;
      }
    }));

    if (signal.aborted) return;
    results.filter(Boolean).forEach(({ key, title }) => bufferedUpdates.set(key, title));
    if (bufferedUpdates.size >= COMMIT_BATCH_SIZE) {
      onBatch(new Map(bufferedUpdates));
      bufferedUpdates.clear();
    }
    await pause(350);
  }
};

export const pauseTitleHydration = (milliseconds, signal) => new Promise((resolve) => {
  if (signal.aborted) {
    resolve();
    return;
  }
  const finish = () => {
    clearTimeout(timer);
    signal.removeEventListener('abort', finish);
    resolve();
  };
  const timer = setTimeout(finish, milliseconds);
  signal.addEventListener('abort', finish, { once: true });
});
