import { useCallback, useEffect } from 'react';
import { tmdbFetchJson, tmdbFetchManyJson } from '../services/tmdb.js';

export function useTmdbDetailsApi({
  library,
  setLibrary,
  setSelectedItem,
  setSelectedPerson,
  setSeasonEpisodes,
  seasonEpisodes,
  setLoadingSeason,
  TMDB_LANG,
  networkErrorMessage,
  onError,
}) {
  const notifyError = useCallback((context, error) => {
    const message = error?.message || networkErrorMessage;
    console.error(context, error);
    onError?.(message);
  }, [networkErrorMessage, onError]);

  useEffect(() => {
    if (!Array.isArray(library) || library.length === 0) return;

    const localeKey = TMDB_LANG === 'ru-RU' ? 'ru' : 'en';
    const getLocalizedField = (item) => (
      item.mediaType === 'tv'
        ? (localeKey === 'ru' ? 'name_ru' : 'name_en')
        : (localeKey === 'ru' ? 'title_ru' : 'title_en')
    );
    const getBaseField = (item) => (item.mediaType === 'tv' ? 'name' : 'title');

    const itemsToFetch = library.filter((item) => {
      const localizedField = getLocalizedField(item);
      return !String(item?.[localizedField] || '').trim();
    });

    if (itemsToFetch.length === 0) return;

    let cancelled = false;

    const hydrateLocalizedLibraryTitles = async () => {
      const updates = new Map();
      const chunkSize = 6;

      for (let index = 0; index < itemsToFetch.length; index += chunkSize) {
        if (cancelled) return;
        const chunk = itemsToFetch.slice(index, index + chunkSize);
        const results = await Promise.all(
          chunk.map(async (item) => {
            try {
              const detail = await tmdbFetchJson(`/${item.mediaType}/${item.id}`, { language: TMDB_LANG });
              const localizedTitle = item.mediaType === 'tv'
                ? (detail.name || detail.original_name || '')
                : (detail.title || detail.original_title || '');
              if (!localizedTitle) return null;
              return { key: `${item.mediaType}-${item.id}`, localizedTitle };
            } catch (error) {
              console.warn(`Failed to hydrate localized title for ${item.mediaType}:${item.id}`, error);
              return null;
            }
          })
        );

        results.forEach((result) => {
          if (!result) return;
          updates.set(result.key, result.localizedTitle);
        });
      }

      if (cancelled || updates.size === 0) return;

      setLibrary((prev) => {
        let changed = false;
        const next = prev.map((item) => {
          const key = `${item.mediaType}-${item.id}`;
          const localizedTitle = updates.get(key);
          if (!localizedTitle) return item;

          const localizedField = getLocalizedField(item);
          const baseField = getBaseField(item);
          const currentLocalizedValue = String(item?.[localizedField] || '').trim();
          const currentBaseValue = String(item?.[baseField] || '').trim();

          if (currentLocalizedValue === localizedTitle && currentBaseValue === localizedTitle) return item;
          changed = true;
          return {
            ...item,
            [localizedField]: localizedTitle,
            [baseField]: localizedTitle,
          };
        });

        return changed ? next : prev;
      });
    };

    hydrateLocalizedLibraryTitles();

    return () => {
      cancelled = true;
    };
  }, [library, setLibrary, TMDB_LANG]);

  const getFullDetails = useCallback(async (item) => {
    try {
      const [detail, credits, videos, recs] = await tmdbFetchManyJson([
        { path: `/${item.mediaType}/${item.id}`, params: { language: TMDB_LANG } },
        { path: `/${item.mediaType}/${item.id}/credits` },
        { path: `/${item.mediaType}/${item.id}/videos`, params: { language: TMDB_LANG } },
        { path: `/${item.mediaType}/${item.id}/recommendations`, params: { language: TMDB_LANG } },
      ]);

      const trailer = (videos?.results || []).find((video) => video.type === 'Trailer' && video.site === 'YouTube');
      const libEntry = library.find((entry) => entry.mediaType === item.mediaType && entry.id === item.id);

      let collectionParts = null;
      if (item.mediaType === 'movie' && detail.belongs_to_collection) {
        try {
          const colData = await tmdbFetchJson(
            `/collection/${detail.belongs_to_collection.id}`,
            { language: TMDB_LANG }
          );
          if (colData?.parts) {
            collectionParts = {
              name: colData.name,
              parts: colData.parts.sort(
                (a, b) => (a.release_date || '9999').localeCompare(b.release_date || '9999')
              ),
            };
          }
        } catch (error) {
          console.warn(`Failed to load collection parts for movie ${item.id}`, error);
        }
      }

      let relatedShows = null;
      if (item.mediaType === 'tv') {
        try {
          const keywordsData = await tmdbFetchJson(`/tv/${item.id}/keywords`);
          const rawKeywords = (keywordsData?.results || []).filter((keyword) => keyword?.id && keyword?.name);

          const genericKeywordPatterns = [
            /^(tv|television|series|show|drama|comedy|thriller|mystery)$/i,
            /^(miniseries|mini[- ]?series)$/i,
            /^(based on (a )?(novel|book|comic|manga))$/i,
            /^(female protagonist|male protagonist)$/i,
            /^(period drama|historical fiction)$/i,
          ];

          const filteredKeywords = rawKeywords
            .filter((keyword) => !genericKeywordPatterns.some((regex) => regex.test(keyword.name.trim())))
            .slice(0, 8);

          const keywordLists = await Promise.all(
            filteredKeywords.map(async (keyword) => {
              try {
                const data = await tmdbFetchJson(
                  `/keyword/${keyword.id}/tv`,
                  { language: TMDB_LANG, page: 1 }
                );
                return { keyword, data };
              } catch (error) {
                console.warn(`Failed to load keyword list ${keyword.id} for tv ${item.id}`, error);
                return null;
              }
            })
          );

          const scored = new Map();
          keywordLists.filter(Boolean).forEach(({ data }) => {
            const total = Number(data?.total_results || 0);
            if (total < 2 || total > 12) return;

            (data?.results || []).forEach((show) => {
              if (!show?.id || show.id === detail.id) return;
              const previous = scored.get(show.id) || { ...show, score: 0 };
              previous.score += 1;
              scored.set(show.id, previous);
            });
          });

          const relatedOnly = Array.from(scored.values())
            .filter((show) => show.score > 0)
            .sort(
              (a, b) => (b.score - a.score)
                || (a.first_air_date || '9999').localeCompare(b.first_air_date || '9999')
            )
            .slice(0, 20);

          if (relatedOnly.length > 0) {
            relatedShows = [
              {
                id: detail.id,
                name: detail.name,
                poster_path: detail.poster_path,
                first_air_date: detail.first_air_date,
                vote_average: detail.vote_average,
              },
              ...relatedOnly,
            ];
          }
        } catch (error) {
          console.warn(`Failed to load related shows for tv ${item.id}`, error);
        }
      }

      setSelectedItem({
        ...detail,
        mediaType: item.mediaType,
        credits,
        trailer: trailer?.key || null,
        recommendations: (recs?.results || []).slice(0, 10),
        rating: libEntry?.rating || 0,
        watchedEpisodes: libEntry?.watchedEpisodes || {},
        seasonRatings: libEntry?.seasonRatings || {},
        collectionParts,
        relatedShows,
      });
      setSeasonEpisodes({});
    } catch (error) {
      notifyError(`Failed to load details for ${item.mediaType}:${item.id}`, error);
    }
  }, [TMDB_LANG, library, notifyError, setSeasonEpisodes, setSelectedItem]);

  const getPersonDetails = useCallback(async (personId) => {
    try {
      const [person, credits] = await tmdbFetchManyJson([
        { path: `/person/${personId}`, params: { language: TMDB_LANG } },
        { path: `/person/${personId}/combined_credits`, params: { language: TMDB_LANG } },
      ]);

      const allMovies = (credits.cast || [])
        .filter((item) => item.media_type === 'movie')
        .map((item) => ({ ...item, mediaType: 'movie' }));
      const allTvShows = (credits.cast || [])
        .filter((item) => item.media_type === 'tv')
        .map((item) => ({ ...item, mediaType: 'tv' }));
      const directedMovies = (credits.crew || [])
        .filter((item) => item.job === 'Director' && item.media_type === 'movie')
        .map((item) => ({ ...item, mediaType: 'movie' }));

      const uniqueContent = Array.from(
        new Map(
          [...allMovies, ...allTvShows, ...directedMovies]
            .map((content) => [`${content.mediaType}:${content.id}`, content])
        ).values()
      ).sort(
        (a, b) => (b.release_date || b.first_air_date || '').localeCompare(a.release_date || a.first_air_date || '')
      );

      const moviesInLibrary = uniqueContent
        .map((content) => {
          const libEntry = library.find(
            (entry) => entry.mediaType === content.mediaType && entry.id === content.id
          );
          if (!libEntry) return null;
          return { ...content, rating: libEntry.rating, inLibrary: true };
        })
        .filter(Boolean);

      const ratedInLib = moviesInLibrary.filter((movie) => movie.rating > 0);
      const avgRating = ratedInLib.length > 0
        ? (ratedInLib.reduce((sum, movie) => sum + movie.rating, 0) / ratedInLib.length).toFixed(1)
        : 0;

      setSelectedPerson({
        ...person,
        allMovies: uniqueContent,
        moviesInLibrary,
        avgRating: Number.isNaN(Number(avgRating)) ? 0 : avgRating,
      });
    } catch (error) {
      notifyError(`Failed to load person details for ${personId}`, error);
    }
  }, [TMDB_LANG, library, notifyError, setSelectedPerson]);

  const loadSeasonEpisodes = useCallback(async (tvId, seasonNumber) => {
    if (seasonEpisodes[seasonNumber]) return;
    setLoadingSeason(seasonNumber);

    try {
      const data = await tmdbFetchJson(
        `/tv/${tvId}/season/${seasonNumber}`,
        { language: TMDB_LANG }
      );

      const episodes = data.episodes || [];
      setSeasonEpisodes((prev) => ({ ...prev, [seasonNumber]: episodes }));

      const runtimeMap = {};
      episodes.forEach((episode) => {
        if (episode.runtime > 0) {
          runtimeMap[episode.episode_number] = episode.runtime;
        }
      });

      if (Object.keys(runtimeMap).length > 0) {
        setLibrary((prev) => prev.map((entry) => {
          if (entry.mediaType === 'tv' && entry.id === tvId) {
            const episodeRuntimes = { ...(entry.episodeRuntimes || {}), [seasonNumber]: runtimeMap };
            return { ...entry, episodeRuntimes };
          }
          return entry;
        }));
      }
    } catch (error) {
      notifyError(`Failed to load season ${seasonNumber} for tv ${tvId}`, error);
    } finally {
      setLoadingSeason(null);
    }
  }, [TMDB_LANG, notifyError, seasonEpisodes, setLibrary, setLoadingSeason, setSeasonEpisodes]);

  return {
    getFullDetails,
    getPersonDetails,
    loadSeasonEpisodes,
  };
}
