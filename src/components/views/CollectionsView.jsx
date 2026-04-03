import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CustomSelect, LazyImg, SegmentedControl } from '../ui.jsx';
import { IMG_500 } from '../../constants/appConstants.js';
import { getYear } from '../../utils/appUtils.js';
import { tmdbFetchJson } from '../../services/tmdb.js';
import { supabase } from '../../services/supabase.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { useQuickActionGesture } from '../../hooks/useQuickActionGesture.js';
import { usePersonalRecommendations } from '../../hooks/usePersonalRecommendations.js';
import { useAutoLoadMoreOnScroll } from '../../hooks/useAutoLoadMoreOnScroll.js';

const createEmptyDraft = () => ({
  title_ru: '',
  title_en: '',
  description_ru: '',
  description_en: '',
  visibility: 'public',
});

const normalizeDraft = (draft) => ({
  title_ru: (draft.title_ru || '').trim(),
  title_en: (draft.title_en || '').trim(),
  description_ru: (draft.description_ru || '').trim(),
  description_en: (draft.description_en || '').trim(),
  visibility: draft.visibility === 'private' ? 'private' : 'public',
});

const getLocalized = (lang, ruValue, enValue) => {
  if (lang === 'ru') return (ruValue || enValue || '').trim();
  return (enValue || ruValue || '').trim();
};

const interpolate = (template, values = {}) => {
  let result = String(template || '');
  Object.entries(values).forEach(([key, value]) => {
    result = result.replaceAll(`{${key}}`, String(value ?? ''));
  });
  return result;
};

const COLLECTION_PREVIEW_COUNT = 3;
const COLLECTION_PREVIEW_MODE = 'latest'; // 'latest' | 'first'
const getCollectionPreviewKey = (mediaType, tmdbId) => `${mediaType}-${Number(tmdbId)}`;
const toTimestamp = (value) => {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
};
const COLLECTIONS_SORT_ORDER_SCHEMA_MESSAGE = 'Collections ordering requires sort_order column. Run supabase/collections_sort_order_schema.sql.';
const isMissingCollectionsSortOrderError = (error) => {
  const code = String(error?.code || '').trim().toUpperCase();
  if (code === '42703' || code === 'PGRST204' || code === 'PGRST205') return true;
  const message = String(error?.message || '').toLowerCase();
  return message.includes('sort_order') && (
    message.includes('column')
    || message.includes('schema cache')
    || message.includes('not found')
  );
};
const COLLECTIONS_FAVORITES_STORAGE_PREFIX = 'movielog:collections:favorites:v1';
const buildCollectionFavoritesStorageKey = (userId) => {
  const normalizedUserId = String(userId || 'anonymous').trim() || 'anonymous';
  return `${COLLECTIONS_FAVORITES_STORAGE_PREFIX}:${normalizedUserId}`;
};
const normalizeCollectionFavoriteIds = (favoriteIds) => (
  Array.from(new Set(
    (Array.isArray(favoriteIds) ? favoriteIds : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  ))
);
const readCollectionFavoriteIds = (userId) => {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  const storageKey = buildCollectionFavoritesStorageKey(userId);

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (!rawValue) return [];

    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      window.localStorage.removeItem(storageKey);
      return [];
    }

    const normalized = normalizeCollectionFavoriteIds(parsed);
    if (normalized.length !== parsed.length) {
      if (normalized.length === 0) window.localStorage.removeItem(storageKey);
      else window.localStorage.setItem(storageKey, JSON.stringify(normalized));
    }
    return normalized;
  } catch {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    return [];
  }
};
const writeCollectionFavoriteIds = (userId, favoriteIds) => {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  const storageKey = buildCollectionFavoritesStorageKey(userId);
  const normalized = normalizeCollectionFavoriteIds(favoriteIds);

  try {
    if (normalized.length === 0) window.localStorage.removeItem(storageKey);
    else window.localStorage.setItem(storageKey, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
};

export default function CollectionsView({
  t,
  lang,
  currentUserId,
  library,
  canAuthorMode,
  isAuthor,
  authorModeEnabled,
  setAuthorModeEnabled,
  hiddenRecommendationKeys = [],
  recommendationMinSeedRating = 8,
  setRecommendationMinSeedRating = () => {},
  recommendationMediaTypeFilter = 'all',
  setRecommendationMediaTypeFilter = () => {},
  getLibraryEntry,
  openQuickActions,
  onCardClick,
  STATUS_BADGE_CONFIG,
  autoLoadMoreOnScroll,
}) {
  const [collections, setCollections] = useState([]);
  const [collectionsLoading, setCollectionsLoading] = useState(true);
  const [collectionsError, setCollectionsError] = useState('');
  const [collectionsOrderSupported, setCollectionsOrderSupported] = useState(true);
  const [draggingCollectionCardId, setDraggingCollectionCardId] = useState('');
  const [dragOverCollectionCardId, setDragOverCollectionCardId] = useState('');
  const [dragOverCollectionCardPosition, setDragOverCollectionCardPosition] = useState('');
  const [selectedCollectionId, setSelectedCollectionId] = useState('');
  const [isCollectionModalOpen, setCollectionModalOpen] = useState(false);
  const [isCollectionModalClosing, setCollectionModalClosing] = useState(false);

  const [collectionRows, setCollectionRows] = useState([]);
  const [collectionItems, setCollectionItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState('');
  const [collectionPreviewMap, setCollectionPreviewMap] = useState({});

  const [createDraft, setCreateDraft] = useState(createEmptyDraft);
  const [editDraft, setEditDraft] = useState(createEmptyDraft);
  const [manageError, setManageError] = useState('');
  const [manageNotice, setManageNotice] = useState('');
  const [mutating, setMutating] = useState(false);
  const [draggingCollectionItemId, setDraggingCollectionItemId] = useState('');
  const [dragOverCollectionItemId, setDragOverCollectionItemId] = useState('');
  const [dragOverPosition, setDragOverPosition] = useState('');

  const [searchMediaType, setSearchMediaType] = useState('movie');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [collectionsSection, setCollectionsSection] = useState('forYou');
  const [curatedVisibilityFilter, setCuratedVisibilityFilter] = useState('public');
  const [favoriteCollectionIds, setFavoriteCollectionIds] = useState([]);
  const [favoritesHydratedKey, setFavoritesHydratedKey] = useState('');
  const [isForYouSettingsModalOpen, setForYouSettingsModalOpen] = useState(false);
  const debouncedSearchQuery = useDebounce(searchQuery.trim(), 350);
  const collectionModalCloseTimerRef = useRef(null);
  const collectionSearchInputRef = useRef(null);
  const collectionPreviewCacheRef = useRef(new Map());
  const suppressCollectionCardClickRef = useRef(false);

  const TMDB_LANG = lang === 'ru' ? 'ru-RU' : 'en-US';
  const openRecommendationQuickActions = useCallback((item, x, y) => {
    openQuickActions(item, x, y, { showHideFromForYou: true });
  }, [openQuickActions]);
  const {
    onContextMenu,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    consumeLongPress,
  } = useQuickActionGesture(openQuickActions);
  const {
    onContextMenu: onRecommendationContextMenu,
    onTouchStart: onRecommendationTouchStart,
    onTouchMove: onRecommendationTouchMove,
    onTouchEnd: onRecommendationTouchEnd,
    onTouchCancel: onRecommendationTouchCancel,
    consumeLongPress: consumeRecommendationLongPress,
  } = useQuickActionGesture(openRecommendationQuickActions);

  const handleCardClick = (item) => {
    if (consumeLongPress()) return;
    onCardClick(item);
  };
  const handleRecommendationCardClick = (item) => {
    if (consumeRecommendationLongPress()) return;
    onCardClick(item);
  };
  const toggleCollectionFavorite = useCallback((collectionId) => {
    const normalizedId = String(collectionId || '').trim();
    if (!normalizedId) return;

    setFavoriteCollectionIds((prev) => {
      if (prev.includes(normalizedId)) return prev.filter((id) => id !== normalizedId);
      return [normalizedId, ...prev];
    });
  }, []);

  const {
    seedCount: recommendationSeedCount,
    visibleRecommendations,
    loading: recommendationsLoading,
    error: recommendationsError,
    hasMore: recommendationsHasMore,
    showMore: showMoreRecommendations,
    refresh: refreshRecommendations,
  } = usePersonalRecommendations({
    library,
    lang,
    currentUserId,
    minSeedRating: recommendationMinSeedRating,
    mediaTypeFilter: recommendationMediaTypeFilter,
    enabled: collectionsSection === 'forYou',
    hiddenRecommendationKeys,
  });
  const recommendationsLoadMoreSentinelRef = useAutoLoadMoreOnScroll({
    enabled: Boolean(autoLoadMoreOnScroll) && collectionsSection === 'forYou',
    canLoadMore: recommendationsHasMore,
    isLoading: recommendationsLoading,
    itemCount: visibleRecommendations.length,
    onLoadMore: showMoreRecommendations,
  });

  const visibilityOptions = useMemo(() => ([
    { value: 'public', label: t.collectionsVisibilityPublic },
    { value: 'private', label: t.collectionsVisibilityPrivate },
  ]), [t.collectionsVisibilityPublic, t.collectionsVisibilityPrivate]);

  const searchTypeOptions = useMemo(() => ([
    { value: 'movie', label: t.movies },
    { value: 'tv', label: t.tvShows },
  ]), [t.movies, t.tvShows]);

  const collectionsSections = useMemo(() => ([
    { id: 'forYou', label: t.collectionsForYouTab },
    { id: 'curated', label: t.collections },
  ]), [t.collections, t.collectionsForYouTab]);
  const curatedVisibilityOptions = useMemo(() => ([
    { value: 'public', label: t.collectionsFilterPublic || t.collectionsVisibilityPublic },
    { value: 'personal', label: t.collectionsFilterPersonal || t.collectionsVisibilityPrivate },
    { value: 'favorites', label: t.collectionsFilterFavorites || t.collectionsFavoriteAdd || 'Favorites' },
  ]), [
    t.collectionsFavoriteAdd,
    t.collectionsFilterFavorites,
    t.collectionsFilterPersonal,
    t.collectionsFilterPublic,
    t.collectionsVisibilityPrivate,
    t.collectionsVisibilityPublic,
  ]);
  const forYouSeedThresholdOptions = useMemo(() => (
    Array.from({ length: 10 }, (_, index) => {
      const rating = index + 1;
      return {
        value: rating,
        label: interpolate(t.forYouSeedThresholdOption || 'From {rating}', { rating }),
      };
    })
  ), [t.forYouSeedThresholdOption]);
  const forYouMediaTypeFilterOptions = useMemo(() => ([
    { value: 'all', label: t.forYouFilterMediaTypeAll || t.contentTypeLabel },
    { value: 'movie', label: t.forYouFilterMediaTypeMovies || t.movies },
    { value: 'tv', label: t.forYouFilterMediaTypeTv || t.tvShows },
  ]), [t.contentTypeLabel, t.forYouFilterMediaTypeAll, t.forYouFilterMediaTypeMovies, t.forYouFilterMediaTypeTv, t.movies, t.tvShows]);

  const selectedCollection = useMemo(
    () => collections.find((collection) => collection.id === selectedCollectionId) || null,
    [collections, selectedCollectionId]
  );
  const favoriteCollectionIdSet = useMemo(
    () => new Set(favoriteCollectionIds),
    [favoriteCollectionIds]
  );
  const visibleCollections = useMemo(() => {
    const normalizedCurrentUserId = String(currentUserId || '').trim();
    const favoritePriority = new Map(favoriteCollectionIds.map((id, index) => [id, index]));
    const isOwner = (collection) => String(collection?.owner_user_id || '').trim() === normalizedCurrentUserId;
    const isPublicCollection = (collection) => String(collection?.visibility || 'public') !== 'private';
    const isPersonalCollection = (collection) => (
      String(collection?.visibility || 'public') === 'private'
      && Boolean(normalizedCurrentUserId)
      && isOwner(collection)
    );

    const filtered = collections.filter((collection) => {
      if (curatedVisibilityFilter === 'personal') return isPersonalCollection(collection);
      if (curatedVisibilityFilter === 'favorites') {
        const collectionId = String(collection?.id || '');
        if (!favoritePriority.has(collectionId)) return false;
        return isPublicCollection(collection) || isOwner(collection);
      }
      return isPublicCollection(collection);
    });

    if (curatedVisibilityFilter !== 'favorites') return filtered;

    return [...filtered].sort((left, right) => {
      const leftPriority = favoritePriority.get(String(left.id || '')) ?? Number.POSITIVE_INFINITY;
      const rightPriority = favoritePriority.get(String(right.id || '')) ?? Number.POSITIVE_INFINITY;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return 0;
    });
  }, [collections, currentUserId, curatedVisibilityFilter, favoriteCollectionIds]);
  const canReorderCollections = useMemo(() => (
    Boolean(
      isAuthor
      && collectionsOrderSupported
      && curatedVisibilityFilter !== 'favorites'
      && visibleCollections.length > 1
    )
  ), [collectionsOrderSupported, curatedVisibilityFilter, isAuthor, visibleCollections.length]);

  const canManageSelected = Boolean(
    isAuthor
    && selectedCollection
    && isCollectionModalOpen
  );
  const collectionItemKeySet = useMemo(
    () => new Set(collectionRows.map((row) => `${row.media_type}-${Number(row.tmdb_id)}`)),
    [collectionRows]
  );

  const getRecommendationReasonText = useCallback((item) => {
    const reasonSeeds = Array.isArray(item?.recommendationReasonSeeds)
      ? item.recommendationReasonSeeds.filter((seed) => seed?.title)
      : [];

    if (reasonSeeds.length === 0) return '';
    if (reasonSeeds.length === 1) {
      return interpolate(t.collectionsForYouBecauseSingle, { title: reasonSeeds[0].title });
    }

    return interpolate(t.collectionsForYouBecauseMany, {
      title1: reasonSeeds[0].title,
      title2: reasonSeeds[1].title,
    });
  }, [t.collectionsForYouBecauseMany, t.collectionsForYouBecauseSingle]);

  const loadCollections = useCallback(async () => {
    if (!supabase || !currentUserId) return;
    setCollectionsLoading(true);
    setCollectionsError('');

    const primaryResponse = await supabase
      .from('curated_collections')
      .select('id, owner_user_id, visibility, title_ru, title_en, description_ru, description_en, sort_order, created_at, updated_at')
      .order('sort_order', { ascending: true })
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (primaryResponse.error && isMissingCollectionsSortOrderError(primaryResponse.error)) {
      const fallbackResponse = await supabase
        .from('curated_collections')
        .select('id, owner_user_id, visibility, title_ru, title_en, description_ru, description_en, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false });

      if (fallbackResponse.error) {
        setCollections([]);
        setCollectionsOrderSupported(false);
        setCollectionsError(fallbackResponse.error.message);
        setCollectionsLoading(false);
        return;
      }

      const normalizedCollections = (fallbackResponse.data || []).map((collection, index) => ({
        ...collection,
        sort_order: index + 1,
      }));
      setCollections(normalizedCollections);
      setCollectionsOrderSupported(false);
      setCollectionsLoading(false);
      return;
    }

    if (primaryResponse.error) {
      setCollections([]);
      setCollectionsOrderSupported(true);
      setCollectionsError(primaryResponse.error.message);
      setCollectionsLoading(false);
      return;
    }

    setCollections(primaryResponse.data || []);
    setCollectionsOrderSupported(true);
    setCollectionsLoading(false);
  }, [currentUserId]);

  const loadCollectionItems = useCallback(async (collectionId) => {
    if (!collectionId) {
      setCollectionRows([]);
      setCollectionItems([]);
      return;
    }

    setItemsLoading(true);
    setItemsError('');

    const { data, error } = await supabase
      .from('curated_collection_items')
      .select('id, collection_id, media_type, tmdb_id, sort_order, created_at')
      .eq('collection_id', collectionId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      setCollectionRows([]);
      setCollectionItems([]);
      setItemsError(error.message);
      setItemsLoading(false);
      return;
    }

    const rows = data || [];
    setCollectionRows(rows);

    const detailedItems = await Promise.all(rows.map(async (row) => {
      try {
        const detail = await tmdbFetchJson(`/${row.media_type}/${row.tmdb_id}`, { language: TMDB_LANG });
        if (!detail?.id) throw new Error('Invalid TMDB payload');
        return {
          ...detail,
          mediaType: row.media_type,
          _collectionItemId: row.id,
          _sortOrder: row.sort_order || 0,
        };
      } catch (error) {
        console.warn(`Failed to load collection item details for ${row.media_type}:${row.tmdb_id}`, error);
        return {
          id: Number(row.tmdb_id),
          mediaType: row.media_type,
          title: `TMDB #${row.tmdb_id}`,
          name: `TMDB #${row.tmdb_id}`,
          overview: '',
          poster_path: null,
          vote_average: 0,
          _collectionItemId: row.id,
          _sortOrder: row.sort_order || 0,
        };
      }
    }));

    setCollectionItems(detailedItems);
    setItemsLoading(false);
  }, [TMDB_LANG]);

  useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  useEffect(() => {
    const storageKey = buildCollectionFavoritesStorageKey(currentUserId);
    const persistedFavorites = readCollectionFavoriteIds(currentUserId);
    setFavoriteCollectionIds(persistedFavorites);
    setFavoritesHydratedKey(storageKey);
  }, [currentUserId]);

  useEffect(() => {
    const storageKey = buildCollectionFavoritesStorageKey(currentUserId);
    if (favoritesHydratedKey !== storageKey) return;
    writeCollectionFavoriteIds(currentUserId, favoriteCollectionIds);
  }, [currentUserId, favoriteCollectionIds, favoritesHydratedKey]);

  useEffect(() => {
    setFavoriteCollectionIds((prev) => {
      if (prev.length === 0) return prev;
      const collectionIdSet = new Set(collections.map((collection) => String(collection.id || '')));
      const filtered = prev.filter((id) => collectionIdSet.has(id));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [collections]);

  useEffect(() => {
    let cancelled = false;

    const loadCollectionPreviews = async () => {
      if (!supabase || collections.length === 0) {
        setCollectionPreviewMap({});
        return;
      }

      const collectionIds = collections.map((collection) => collection.id).filter(Boolean);
      if (collectionIds.length === 0) {
        setCollectionPreviewMap({});
        return;
      }

      const { data, error } = await supabase
        .from('curated_collection_items')
        .select('collection_id, media_type, tmdb_id, sort_order, created_at')
        .in('collection_id', collectionIds)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (cancelled) return;

      if (error) {
        console.warn('Failed to load collection preview rows', error);
        setCollectionPreviewMap({});
        return;
      }

      const groupedRows = new Map(collectionIds.map((id) => [id, []]));
      (Array.isArray(data) ? data : []).forEach((row) => {
        if (!groupedRows.has(row.collection_id)) groupedRows.set(row.collection_id, []);
        groupedRows.get(row.collection_id).push(row);
      });

      const previewRowsByCollection = new Map();
      const neededKeys = new Set();

      groupedRows.forEach((rows, collectionId) => {
        const orderedRows = [...rows].sort((a, b) => (
          ((Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
          || (toTimestamp(a.created_at) - toTimestamp(b.created_at))
        ));
        const previewRows = COLLECTION_PREVIEW_MODE === 'first'
          ? orderedRows.slice(0, COLLECTION_PREVIEW_COUNT)
          : orderedRows.slice(-COLLECTION_PREVIEW_COUNT);
        previewRowsByCollection.set(collectionId, previewRows);

        previewRows.forEach((row) => {
          const tmdbId = Number(row.tmdb_id);
          if (!row.media_type || !Number.isFinite(tmdbId) || tmdbId <= 0) return;
          neededKeys.add(getCollectionPreviewKey(row.media_type, tmdbId));
        });
      });

      const previewCache = collectionPreviewCacheRef.current;
      const missingKeys = Array.from(neededKeys).filter((key) => !previewCache.has(key));

      if (missingKeys.length > 0) {
        await Promise.all(missingKeys.map(async (previewKey) => {
          const [mediaType, tmdbIdRaw] = String(previewKey).split('-');
          const tmdbId = Number(tmdbIdRaw);
          if (!mediaType || !Number.isFinite(tmdbId) || tmdbId <= 0) {
            previewCache.set(previewKey, null);
            return;
          }

          try {
            const detail = await tmdbFetchJson(`/${mediaType}/${tmdbId}`, { language: TMDB_LANG });
            previewCache.set(previewKey, {
              posterPath: detail?.poster_path || null,
              title: detail?.title || detail?.name || `TMDB #${tmdbId}`,
            });
          } catch (previewError) {
            console.warn(`Failed to load collection preview for ${previewKey}`, previewError);
            previewCache.set(previewKey, {
              posterPath: null,
              title: `TMDB #${tmdbId}`,
            });
          }
        }));
      }

      if (cancelled) return;

      const nextPreviewMap = {};
      collectionIds.forEach((collectionId) => {
        const previewRows = previewRowsByCollection.get(collectionId) || [];
        nextPreviewMap[collectionId] = previewRows.map((row) => {
          const key = getCollectionPreviewKey(row.media_type, row.tmdb_id);
          const cached = previewCache.get(key);
          return {
            key,
            mediaType: row.media_type,
            id: Number(row.tmdb_id),
            posterPath: cached?.posterPath || null,
            title: cached?.title || `TMDB #${row.tmdb_id}`,
          };
        });
      });

      setCollectionPreviewMap(nextPreviewMap);
    };

    loadCollectionPreviews();

    return () => {
      cancelled = true;
    };
  }, [collections, TMDB_LANG]);

  useEffect(() => {
    if (!collections.length) {
      setSelectedCollectionId('');
      setCollectionModalOpen(false);
      setCollectionModalClosing(false);
      return;
    }
    if (selectedCollectionId && !collections.some((collection) => collection.id === selectedCollectionId)) {
      setSelectedCollectionId('');
      setCollectionModalOpen(false);
      setCollectionModalClosing(false);
    }
  }, [collections, selectedCollectionId]);

  useEffect(() => {
    if (!isCollectionModalOpen) return;
    const onEsc = (event) => {
      if (event.key === 'Escape') closeCollectionModal();
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [isCollectionModalOpen, isCollectionModalClosing]);

  useEffect(() => () => {
    if (collectionModalCloseTimerRef.current) clearTimeout(collectionModalCloseTimerRef.current);
  }, []);

  useEffect(() => {
    if (!selectedCollection) {
      setEditDraft(createEmptyDraft());
      return;
    }
    setEditDraft({
      title_ru: selectedCollection.title_ru || '',
      title_en: selectedCollection.title_en || '',
      description_ru: selectedCollection.description_ru || '',
      description_en: selectedCollection.description_en || '',
      visibility: selectedCollection.visibility === 'private' ? 'private' : 'public',
    });
  }, [selectedCollectionId, selectedCollection]);

  useEffect(() => {
    loadCollectionItems(selectedCollectionId);
  }, [selectedCollectionId, loadCollectionItems]);

  const resetOrderDragState = useCallback(() => {
    setDraggingCollectionItemId('');
    setDragOverCollectionItemId('');
    setDragOverPosition('');
  }, []);

  useEffect(() => {
    resetOrderDragState();
  }, [selectedCollectionId, isCollectionModalOpen, resetOrderDragState]);

  const clearFeedback = () => {
    setManageError('');
    setManageNotice('');
  };

  const clearCollectionSearch = () => {
    setSearchQuery('');
    setSearchError('');
    setSearchResults([]);
    setSearchLoading(false);
    if (collectionSearchInputRef.current) collectionSearchInputRef.current.focus();
  };

  const openCollectionModal = (collectionId) => {
    if (collectionModalCloseTimerRef.current) {
      clearTimeout(collectionModalCloseTimerRef.current);
      collectionModalCloseTimerRef.current = null;
    }
    setCollectionModalClosing(false);
    setSelectedCollectionId(collectionId);
    setCollectionModalOpen(true);
    clearFeedback();
  };

  function closeCollectionModal() {
    if (isCollectionModalClosing || !isCollectionModalOpen) return;
    setCollectionModalClosing(true);
    collectionModalCloseTimerRef.current = setTimeout(() => {
      setCollectionModalOpen(false);
      setCollectionModalClosing(false);
      setSearchQuery('');
      setSearchError('');
      setSearchResults([]);
      collectionModalCloseTimerRef.current = null;
    }, 220);
  }

  useEffect(() => {
    if (collectionsSection === 'curated') return;
    setCollectionModalOpen(false);
    setCollectionModalClosing(false);
    setSelectedCollectionId('');
  }, [collectionsSection]);
  useEffect(() => {
    if (collectionsSection === 'forYou') return;
    setForYouSettingsModalOpen(false);
  }, [collectionsSection]);
  useEffect(() => {
    if (!isForYouSettingsModalOpen) return;
    const onEsc = (event) => {
      if (event.key === 'Escape') setForYouSettingsModalOpen(false);
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [isForYouSettingsModalOpen]);

  const handleCreateCollection = async (event) => {
    event.preventDefault();
    if (!isAuthor || !currentUserId) return;

    const payload = normalizeDraft(createDraft);
    if (!payload.title_ru && !payload.title_en) {
      setManageError(t.collectionsTitleRequired);
      setManageNotice('');
      return;
    }

    const nextCollectionSortOrder = collections.reduce((max, collection) => {
      const sortOrder = Number(collection?.sort_order) || 0;
      return Math.max(max, sortOrder);
    }, 0) + 1;
    const insertPayload = {
      owner_user_id: currentUserId,
      ...payload,
    };
    if (collectionsOrderSupported) {
      insertPayload.sort_order = nextCollectionSortOrder;
    }

    setMutating(true);
    clearFeedback();
    const { data, error } = await supabase
      .from('curated_collections')
      .insert(insertPayload)
      .select('id')
      .single();

    if (error) {
      setManageError(error.message);
      setMutating(false);
      return;
    }

    setCreateDraft(createEmptyDraft());
    setManageNotice(t.collectionsCreated);
    await loadCollections();
    if (data?.id) {
      setSelectedCollectionId(data.id);
      setCollectionModalOpen(true);
    }
    setMutating(false);
  };

  const handleUpdateCollection = async (event) => {
    event.preventDefault();
    if (!canManageSelected || !selectedCollectionId) return;

    const payload = normalizeDraft(editDraft);
    if (!payload.title_ru && !payload.title_en) {
      setManageError(t.collectionsTitleRequired);
      setManageNotice('');
      return;
    }

    setMutating(true);
    clearFeedback();
    const { error } = await supabase
      .from('curated_collections')
      .update(payload)
      .eq('id', selectedCollectionId);

    if (error) {
      setManageError(error.message);
      setMutating(false);
      return;
    }

    setManageNotice(t.collectionsUpdated);
    await loadCollections();
    setMutating(false);
  };

  const handleDeleteCollection = async () => {
    if (!canManageSelected || !selectedCollectionId) return;
    if (!window.confirm(t.collectionsDeleteConfirm)) return;

    setMutating(true);
    clearFeedback();
    const deletingId = selectedCollectionId;

    const { error } = await supabase
      .from('curated_collections')
      .delete()
      .eq('id', deletingId);

    if (error) {
      setManageError(error.message);
      setMutating(false);
      return;
    }

    setSelectedCollectionId('');
    setCollectionModalOpen(false);
    setCollectionModalClosing(false);
    setManageNotice(t.collectionsDeleted);
    await loadCollections();
    setMutating(false);
  };

  useEffect(() => {
    if (!canManageSelected) {
      setSearchLoading(false);
      setSearchError('');
      setSearchResults([]);
      return;
    }

    if (debouncedSearchQuery.length < 2) {
      setSearchLoading(false);
      setSearchError('');
      setSearchResults([]);
      return;
    }

    let cancelled = false;

    const search = async () => {
      setSearchLoading(true);
      setSearchError('');
      try {
        const payload = await tmdbFetchJson(`/search/${searchMediaType}`, {
          language: TMDB_LANG,
          query: debouncedSearchQuery,
          page: 1,
        });
        if (cancelled) return;
        const items = Array.isArray(payload?.results)
          ? payload.results.slice(0, 12).map((item) => ({ ...item, mediaType: searchMediaType }))
          : [];
        setSearchResults(items);
      } catch (error) {
        if (cancelled) return;
        console.error(`Collections search failed for ${searchMediaType}`, error);
        setSearchError(t.networkError);
        setSearchResults([]);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    };

    search();

    return () => {
      cancelled = true;
    };
  }, [TMDB_LANG, canManageSelected, debouncedSearchQuery, searchMediaType, t.networkError]);

  const addItemToCollection = async (item) => {
    if (!canManageSelected || !selectedCollectionId) return;
    setMutating(true);
    clearFeedback();

    const highestSortOrder = collectionRows.reduce((max, row) => Math.max(max, Number(row.sort_order) || 0), 0);
    const nextSortOrder = highestSortOrder + 1;
    const { data, error } = await supabase
      .from('curated_collection_items')
      .upsert({
        collection_id: selectedCollectionId,
        media_type: item.mediaType,
        tmdb_id: Number(item.id),
        sort_order: nextSortOrder,
      }, { onConflict: 'collection_id,media_type,tmdb_id' })
      .select('id, collection_id, media_type, tmdb_id, sort_order, created_at')
      .single();

    if (error) {
      setManageError(error.message);
      setMutating(false);
      return;
    }

    if (!data?.id) {
      setManageError(t.networkError);
      setMutating(false);
      return;
    }

    const insertedRow = {
      ...data,
      sort_order: Number(data.sort_order) || nextSortOrder,
    };

    setCollectionRows((prev) => {
      if (prev.some((row) => String(row.id) === String(insertedRow.id))) return prev;
      return [...prev, insertedRow];
    });

    setCollectionItems((prev) => {
      if (prev.some((entry) => String(entry._collectionItemId) === String(insertedRow.id))) return prev;
      return [
        ...prev,
        {
          ...item,
          id: Number(item.id),
          mediaType: item.mediaType,
          _collectionItemId: insertedRow.id,
          _sortOrder: insertedRow.sort_order,
        },
      ];
    });

    setManageNotice(t.collectionsItemAdded);
    setMutating(false);
  };

  const removeItemFromCollection = async (collectionItemId) => {
    if (!canManageSelected || !selectedCollectionId) return;
    setMutating(true);
    clearFeedback();

    const { error } = await supabase
      .from('curated_collection_items')
      .delete()
      .eq('id', collectionItemId);

    if (error) {
      setManageError(error.message);
      setMutating(false);
      return;
    }

    setCollectionRows((prev) => prev.filter((row) => String(row.id) !== String(collectionItemId)));
    setCollectionItems((prev) => prev.filter((item) => String(item._collectionItemId) !== String(collectionItemId)));
    setManageNotice(t.collectionsItemRemoved);
    setMutating(false);
  };

  const applyCollectionOrderLocally = (orderedRows) => {
    const normalizedRows = orderedRows.map((row, index) => ({
      ...row,
      sort_order: index + 1,
    }));

    const positionById = new Map(
      normalizedRows.map((row, index) => [String(row.id), index])
    );

    const normalizedItems = [...collectionItems]
      .sort((a, b) => {
        const aPos = positionById.get(String(a._collectionItemId));
        const bPos = positionById.get(String(b._collectionItemId));
        const fallback = normalizedRows.length + 1000;
        return (aPos ?? fallback) - (bPos ?? fallback);
      })
      .map((item, index) => ({
        ...item,
        _sortOrder: index + 1,
      }));

    setCollectionRows(normalizedRows);
    setCollectionItems(normalizedItems);
    return normalizedRows;
  };

  const persistCollectionOrder = async (reorderedRows, rollbackState = null) => {
    if (!canManageSelected || !selectedCollectionId) return false;
    if (!Array.isArray(reorderedRows) || reorderedRows.length === 0) return false;

    setMutating(true);
    clearFeedback();

    const updates = await Promise.all(
      reorderedRows.map((row, index) => supabase
        .from('curated_collection_items')
        .update({ sort_order: row.sort_order || (index + 1) })
        .eq('id', row.id))
    );

    const failed = updates.find((result) => result.error);
    if (failed?.error) {
      if (rollbackState?.rows && rollbackState?.items) {
        setCollectionRows(rollbackState.rows);
        setCollectionItems(rollbackState.items);
      }
      setManageError(failed.error.message);
      setMutating(false);
      return false;
    }

    setMutating(false);
    return true;
  };

  const moveItemToIndex = async (collectionItemId, targetIndex) => {
    if (!canManageSelected || !selectedCollectionId) return;
    const currentIndex = collectionRows.findIndex((row) => String(row.id) === String(collectionItemId));
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= collectionRows.length || currentIndex === targetIndex) return;

    const reordered = [...collectionRows];
    const [movedRow] = reordered.splice(currentIndex, 1);
    if (!movedRow) return;
    reordered.splice(targetIndex, 0, movedRow);

    const rollbackState = {
      rows: collectionRows,
      items: collectionItems,
    };
    const normalizedRows = applyCollectionOrderLocally(reordered);
    await persistCollectionOrder(normalizedRows, rollbackState);
  };

  const resolveDropIndex = useCallback((sourceId, targetId, position) => {
    const sourceIndex = collectionRows.findIndex((row) => String(row.id) === String(sourceId));
    const targetIndexBase = collectionRows.findIndex((row) => String(row.id) === String(targetId));
    if (sourceIndex < 0 || targetIndexBase < 0) return null;

    let nextIndex = targetIndexBase + (position === 'after' ? 1 : 0);
    if (sourceIndex < nextIndex) nextIndex -= 1;
    return { sourceIndex, nextIndex };
  }, [collectionRows]);

  const getDropPosition = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const midpoint = rect.top + (rect.height / 2);
    return event.clientY > midpoint ? 'after' : 'before';
  };

  const handleOrderDragStart = (event, collectionItemId) => {
    if (mutating) {
      event.preventDefault();
      return;
    }
    const normalizedId = String(collectionItemId);
    setDraggingCollectionItemId(normalizedId);
    setDragOverCollectionItemId(normalizedId);
    setDragOverPosition('before');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', normalizedId);
  };

  const handleOrderDragOver = (event, targetItemId) => {
    if (!draggingCollectionItemId || mutating) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverCollectionItemId(String(targetItemId));
    setDragOverPosition(getDropPosition(event));
  };

  const handleOrderDrop = async (event, targetItemId) => {
    event.preventDefault();
    if (mutating) {
      resetOrderDragState();
      return;
    }

    const draggedId = draggingCollectionItemId || event.dataTransfer.getData('text/plain');
    if (!draggedId) {
      resetOrderDragState();
      return;
    }

    const resolved = resolveDropIndex(draggedId, targetItemId, getDropPosition(event));
    resetOrderDragState();
    if (!resolved || resolved.nextIndex === resolved.sourceIndex) return;
    await moveItemToIndex(draggedId, resolved.nextIndex);
  };

  const handleOrderDragEnd = () => {
    resetOrderDragState();
  };

  const handleOrderTouchStart = (event, collectionItemId) => {
    if (mutating || event.touches.length !== 1) return;
    event.preventDefault();
    const normalizedId = String(collectionItemId);
    setDraggingCollectionItemId(normalizedId);
    setDragOverCollectionItemId(normalizedId);
    setDragOverPosition('before');
  };

  const handleOrderTouchMove = (event) => {
    if (!draggingCollectionItemId || mutating || event.touches.length !== 1) return;
    if (typeof document === 'undefined') return;
    event.preventDefault();
    const touch = event.touches[0];
    const targetElement = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('[data-order-item-id]');
    if (!targetElement) return;

    const targetItemId = targetElement.getAttribute('data-order-item-id');
    if (!targetItemId) return;
    const rect = targetElement.getBoundingClientRect();
    const position = touch.clientY > rect.top + (rect.height / 2) ? 'after' : 'before';
    setDragOverCollectionItemId(targetItemId);
    setDragOverPosition(position);
  };

  const handleOrderTouchEnd = async () => {
    const draggedId = draggingCollectionItemId;
    if (!draggedId || mutating) {
      resetOrderDragState();
      return;
    }

    const targetItemId = dragOverCollectionItemId || draggedId;
    const resolved = resolveDropIndex(draggedId, targetItemId, dragOverPosition || 'before');
    resetOrderDragState();
    if (!resolved || resolved.nextIndex === resolved.sourceIndex) return;
    await moveItemToIndex(draggedId, resolved.nextIndex);
  };

  const handleOrderTouchCancel = () => {
    resetOrderDragState();
  };
  const resetCollectionCardDragState = useCallback(() => {
    setDraggingCollectionCardId('');
    setDragOverCollectionCardId('');
    setDragOverCollectionCardPosition('');
  }, []);
  const resolveCollectionCardDropIndex = useCallback((sourceId, targetId, position) => {
    const sourceIndex = visibleCollections.findIndex((collection) => String(collection.id) === String(sourceId));
    const targetIndexBase = visibleCollections.findIndex((collection) => String(collection.id) === String(targetId));
    if (sourceIndex < 0 || targetIndexBase < 0) return null;

    let nextIndex = targetIndexBase + (position === 'after' ? 1 : 0);
    if (sourceIndex < nextIndex) nextIndex -= 1;
    return { sourceIndex, nextIndex };
  }, [visibleCollections]);
  const mergeVisibleCollectionsOrderLocally = useCallback((orderedVisibleCollections) => {
    if (!Array.isArray(orderedVisibleCollections) || orderedVisibleCollections.length === 0) return collections;

    const orderedVisibleSet = new Set(
      orderedVisibleCollections.map((collection) => String(collection?.id || ''))
    );
    const visibleSlotIndexes = [];
    collections.forEach((collection, index) => {
      if (orderedVisibleSet.has(String(collection?.id || ''))) visibleSlotIndexes.push(index);
    });

    const nextCollections = [...collections];
    visibleSlotIndexes.forEach((slotIndex, orderIndex) => {
      const nextCollection = orderedVisibleCollections[orderIndex];
      if (nextCollection) nextCollections[slotIndex] = nextCollection;
    });

    const normalizedCollections = nextCollections.map((collection, index) => ({
      ...collection,
      sort_order: index + 1,
    }));
    setCollections(normalizedCollections);
    return normalizedCollections;
  }, [collections]);
  const persistCollectionsOrder = useCallback(async (orderedCollections, rollbackCollections = null) => {
    if (!isAuthor || !collectionsOrderSupported) return false;
    if (!Array.isArray(orderedCollections) || orderedCollections.length === 0) return false;

    setMutating(true);
    clearFeedback();

    for (const collection of orderedCollections) {
      const { error } = await supabase
        .from('curated_collections')
        .update({ sort_order: Number(collection?.sort_order) || 1 })
        .eq('id', collection.id);

      if (error) {
        if (Array.isArray(rollbackCollections)) setCollections(rollbackCollections);
        if (isMissingCollectionsSortOrderError(error)) {
          setCollectionsOrderSupported(false);
          setManageError(t.collectionsReorderSchemaHint || COLLECTIONS_SORT_ORDER_SCHEMA_MESSAGE);
        } else {
          setManageError(error.message);
        }
        setMutating(false);
        return false;
      }
    }

    setManageNotice(t.collectionsOrderSaved || t.collectionsUpdated);
    setMutating(false);
    return true;
  }, [collectionsOrderSupported, isAuthor, t.collectionsOrderSaved, t.collectionsReorderSchemaHint, t.collectionsUpdated]);
  const moveCollectionCardToIndex = useCallback(async (collectionId, targetIndex) => {
    if (!canReorderCollections || mutating) return;

    const currentIndex = visibleCollections.findIndex((collection) => String(collection.id) === String(collectionId));
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= visibleCollections.length || currentIndex === targetIndex) return;

    const reorderedVisibleCollections = [...visibleCollections];
    const [movedCollection] = reorderedVisibleCollections.splice(currentIndex, 1);
    if (!movedCollection) return;
    reorderedVisibleCollections.splice(targetIndex, 0, movedCollection);

    const rollbackCollections = collections;
    const normalizedCollections = mergeVisibleCollectionsOrderLocally(reorderedVisibleCollections);
    await persistCollectionsOrder(normalizedCollections, rollbackCollections);
  }, [canReorderCollections, collections, mergeVisibleCollectionsOrderLocally, mutating, persistCollectionsOrder, visibleCollections]);
  const handleCollectionCardDragStart = (event, collectionId) => {
    if (!canReorderCollections || mutating) {
      event.preventDefault();
      return;
    }
    const normalizedId = String(collectionId);
    suppressCollectionCardClickRef.current = true;
    setDraggingCollectionCardId(normalizedId);
    setDragOverCollectionCardId(normalizedId);
    setDragOverCollectionCardPosition('before');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', normalizedId);
  };
  const handleCollectionCardDragOver = (event, targetCollectionId) => {
    if (!draggingCollectionCardId || mutating) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverCollectionCardId(String(targetCollectionId));
    setDragOverCollectionCardPosition(getDropPosition(event));
  };
  const handleCollectionCardDrop = async (event, targetCollectionId) => {
    event.preventDefault();
    if (mutating) {
      resetCollectionCardDragState();
      return;
    }

    const draggedId = draggingCollectionCardId || event.dataTransfer.getData('text/plain');
    if (!draggedId) {
      resetCollectionCardDragState();
      return;
    }

    const resolved = resolveCollectionCardDropIndex(draggedId, targetCollectionId, getDropPosition(event));
    resetCollectionCardDragState();
    if (!resolved || resolved.nextIndex === resolved.sourceIndex) return;
    await moveCollectionCardToIndex(draggedId, resolved.nextIndex);
  };
  const handleCollectionCardDragEnd = () => {
    resetCollectionCardDragState();
    window.setTimeout(() => {
      suppressCollectionCardClickRef.current = false;
    }, 120);
  };
  useEffect(() => {
    resetCollectionCardDragState();
    suppressCollectionCardClickRef.current = false;
  }, [collectionsSection, curatedVisibilityFilter, resetCollectionCardDragState]);
  const curatedEmptyTitle = curatedVisibilityFilter === 'favorites'
    ? (t.collectionsFavoritesEmptyTitle || t.collectionsFilterEmptyTitle || t.empty)
    : (t.collectionsFilterEmptyTitle || t.empty);
  const curatedEmptyHint = curatedVisibilityFilter === 'favorites'
    ? (t.collectionsFavoritesEmptyHint || t.collectionsFilterEmptyHint || t.collectionsNoCollectionsHint)
    : (t.collectionsFilterEmptyHint || t.collectionsNoCollectionsHint);

  return (
    <div className="view-stack">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="app-page-title">{t.recommendations.toUpperCase()}</h2>
          <p className="text-xs opacity-55 mt-2">{t.collectionsSubtitle}</p>
        </div>
        {canAuthorMode && (
          <div className="flex items-center gap-2 mt-2">
            <span className="tag h-fit">{t.collectionsAuthorMode}</span>
            <button
              type="button"
              role="switch"
              aria-checked={authorModeEnabled}
              aria-label={t.authorModeToggleLabel || t.collectionsAuthorMode}
              title={t.authorModeToggleLabel || t.collectionsAuthorMode}
              onClick={() => setAuthorModeEnabled((prev) => !prev)}
              className="relative inline-flex h-6 w-11 items-center rounded-full border px-[2px] transition-colors"
              style={authorModeEnabled
                ? {
                    borderColor: 'rgba(var(--accent-rgb), 0.62)',
                    background: 'rgba(var(--accent-rgb), 0.38)',
                  }
                : {
                    borderColor: 'rgba(148, 163, 184, 0.34)',
                    background: 'rgba(255, 255, 255, 0.06)',
                  }}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  authorModeEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        )}
      </div>

      <SegmentedControl
        items={collectionsSections}
        activeId={collectionsSection}
        onChange={setCollectionsSection}
      />

      {collectionsSection === 'curated' && (
        <>
      {collectionsError && (
        <div className="rounded-2xl border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {collectionsError}
        </div>
      )}

      {isAuthor && (
        <div className="glass app-panel overflow-visible p-5 space-y-4">
          <p className="text-sm font-black">{t.collectionsCreateTitle}</p>
          <form className="grid grid-cols-1 md:grid-cols-2 gap-3" onSubmit={handleCreateCollection}>
            <input
              value={createDraft.title_ru}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, title_ru: event.target.value }))}
              className="app-input w-full bg-white/5 border border-white/10 px-4 py-3 text-sm font-semibold"
              placeholder={t.collectionsTitleRu}
            />
            <input
              value={createDraft.title_en}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, title_en: event.target.value }))}
              className="app-input w-full bg-white/5 border border-white/10 px-4 py-3 text-sm font-semibold"
              placeholder={t.collectionsTitleEn}
            />
            <textarea
              value={createDraft.description_ru}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, description_ru: event.target.value }))}
              className="app-input w-full bg-white/5 border border-white/10 px-4 py-3 text-sm font-semibold min-h-[90px] md:col-span-2 resize-y"
              placeholder={t.collectionsDescriptionRu}
            />
            <textarea
              value={createDraft.description_en}
              onChange={(event) => setCreateDraft((prev) => ({ ...prev, description_en: event.target.value }))}
              className="app-input w-full bg-white/5 border border-white/10 px-4 py-3 text-sm font-semibold min-h-[90px] md:col-span-2 resize-y"
              placeholder={t.collectionsDescriptionEn}
            />
            <div className="md:col-span-1">
              <CustomSelect
                value={createDraft.visibility}
                options={visibilityOptions}
                onChange={(value) => setCreateDraft((prev) => ({ ...prev, visibility: value }))}
                ariaLabel={t.collectionsVisibilityLabel}
              />
            </div>
            <button
              type="submit"
              disabled={mutating}
              className="accent-soft py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-60"
            >
              {t.collectionsCreate}
            </button>
          </form>
        </div>
      )}

      {!collectionsLoading && collections.length > 0 && (
        <>
          <div className="collections-curated-toolbar">
            <div className="collections-curated-filter" role="tablist" aria-label={t.collectionsVisibilityLabel}>
              {curatedVisibilityOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={curatedVisibilityFilter === option.value}
                  onClick={() => setCuratedVisibilityFilter(option.value)}
                  className={`collections-curated-filter-btn ${curatedVisibilityFilter === option.value ? 'active' : ''}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          {isAuthor && (
            <p className="collections-reorder-hint">
              {collectionsOrderSupported
                ? (t.collectionsReorderHint || '')
                : (t.collectionsReorderSchemaHint || COLLECTIONS_SORT_ORDER_SCHEMA_MESSAGE)}
            </p>
          )}

          {visibleCollections.length > 0 ? (
            <div className="collections-grid">
              {visibleCollections.map((collection) => {
                const title = getLocalized(lang, collection.title_ru, collection.title_en) || t.collectionsUntitled;
                const description = getLocalized(lang, collection.description_ru, collection.description_en);
                const previewItems = (collectionPreviewMap[collection.id] || []).slice(0, COLLECTION_PREVIEW_COUNT);
                const updatedAt = collection.updated_at
                  ? new Date(collection.updated_at).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US')
                  : '';
                const isFavorite = favoriteCollectionIdSet.has(String(collection.id || ''));
                const collectionCardId = String(collection.id || '');
                const isDraggingCard = draggingCollectionCardId === collectionCardId;
                const isCardDragTarget = !isDraggingCard
                  && draggingCollectionCardId
                  && dragOverCollectionCardId === collectionCardId;
                const cardDragStateClass = isCardDragTarget
                  ? (dragOverCollectionCardPosition === 'after' ? 'drag-over-after' : 'drag-over-before')
                  : '';
                const cardClassName = [
                  'collections-large-card',
                  canReorderCollections ? 'reorderable' : '',
                  isDraggingCard ? 'dragging' : '',
                  cardDragStateClass,
                ].filter(Boolean).join(' ');

                return (
                  <article
                    key={collection.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (suppressCollectionCardClickRef.current) return;
                      openCollectionModal(collection.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openCollectionModal(collection.id);
                      }
                    }}
                    draggable={canReorderCollections && !mutating}
                    onDragStart={(event) => handleCollectionCardDragStart(event, collection.id)}
                    onDragOver={(event) => handleCollectionCardDragOver(event, collection.id)}
                    onDrop={(event) => handleCollectionCardDrop(event, collection.id)}
                    onDragEnd={handleCollectionCardDragEnd}
                    className={cardClassName}
                  >
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleCollectionFavorite(collection.id);
                      }}
                      draggable={false}
                      onDragStart={(event) => event.preventDefault()}
                      className={`collections-favorite-btn collections-favorite-btn-corner ${isFavorite ? 'active' : ''}`}
                      aria-label={isFavorite ? (t.collectionsFavoriteRemove || 'Remove from favorites') : (t.collectionsFavoriteAdd || 'Add to favorites')}
                      title={isFavorite ? (t.collectionsFavoriteRemove || 'Remove from favorites') : (t.collectionsFavoriteAdd || 'Add to favorites')}
                    >
                      <svg viewBox="0 0 24 24" className="collections-favorite-btn-icon" aria-hidden="true">
                        <path d="M12 2.6 14.96 8.6 21.58 9.56 16.79 14.22 17.92 20.8 12 17.68 6.08 20.8 7.21 14.22 2.42 9.56 9.04 8.6Z" />
                      </svg>
                    </button>
                    <div className="collections-large-card-head">
                      <div className="collections-large-card-copy">
                        <p className="collections-large-card-title">{title}</p>
                        <p className={`collections-large-card-description ${description ? '' : 'opacity-45'}`}>
                          {description || t.collectionsEmptyHint}
                        </p>
                      </div>
                      <div className="collections-inline-preview" aria-hidden="true">
                        {previewItems.length > 0 ? (
                          <div className={`collections-preview-stack count-${Math.min(previewItems.length, COLLECTION_PREVIEW_COUNT)}`}>
                            {previewItems.map((item, index) => (
                              <div key={`${collection.id}-${item.key}-${index}`} className="collections-preview-poster">
                                <LazyImg
                                  src={item.posterPath ? `${IMG_500}${item.posterPath}` : '/poster-placeholder.svg'}
                                  alt=""
                                  className="collections-preview-poster-img"
                                />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="collections-preview-empty">
                            <span className="collections-preview-empty-poster" />
                            <span className="collections-preview-empty-poster" />
                            <span className="collections-preview-empty-poster" />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="collections-large-card-foot">
                      <span className="text-xs opacity-55">{updatedAt}</span>
                      <span className="collections-large-card-open">{t.details}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-state compact">
              <div className="empty-state-icon" aria-hidden="true">{'\u{1F50D}'}</div>
              <p className="empty-state-title">{curatedEmptyTitle}</p>
              <p className="empty-state-hint">{curatedEmptyHint}</p>
            </div>
          )}
        </>
      )}

      {collectionsLoading && (
        <div className="glass app-panel p-5">
          <p className="text-sm opacity-80">{t.loading}</p>
        </div>
      )}

      {!collectionsLoading && collections.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">{'\u{1F4DA}'}</div>
          <p className="empty-state-title">{t.collectionsNoCollectionsTitle}</p>
          <p className="empty-state-hint">{t.collectionsNoCollectionsHint}</p>
        </div>
      )}

      {!isCollectionModalOpen && manageError && (
        <div className="rounded-2xl border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {manageError}
        </div>
      )}
      {!isCollectionModalOpen && manageNotice && (
        <div className="rounded-2xl border border-emerald-400/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {manageNotice}
        </div>
      )}

      {isCollectionModalOpen && selectedCollection && typeof document !== 'undefined' && createPortal((
        <div
          className={`fixed inset-0 z-[95] collections-modal-backdrop p-3 md:p-6 ${isCollectionModalClosing ? 'modal-exit' : 'modal-enter'}`}
          onClick={closeCollectionModal}
        >
          <div className="collections-modal-shell w-full h-full flex items-start md:items-center justify-center">
            <div
              className="collections-modal-panel w-full h-[92vh] overflow-y-auto space-y-4"
              onClick={(event) => event.stopPropagation()}
            >
            <div className="glass app-panel p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xl md:text-2xl font-black leading-tight">
                    {getLocalized(lang, selectedCollection.title_ru, selectedCollection.title_en) || t.collectionsUntitled}
                  </p>
                  {getLocalized(lang, selectedCollection.description_ru, selectedCollection.description_en) && (
                    <p className="text-sm opacity-80 leading-relaxed mt-2">
                      {getLocalized(lang, selectedCollection.description_ru, selectedCollection.description_en)}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={closeCollectionModal}
                  className="collections-modal-close"
                  aria-label={t.close}
                  title={t.close}
                >
                  {'\u2715'}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="tag">
                  {selectedCollection.visibility === 'private'
                    ? t.collectionsVisibilityPrivate
                    : t.collectionsVisibilityPublic}
                </span>
                <span className="tag">{collectionItems.length} {t.collectionsItemsCount}</span>
              </div>
            </div>

      {canManageSelected && (
        <div className="glass app-panel overflow-visible p-5 space-y-4">
          <p className="text-sm font-black">{t.collectionsEditTitle}</p>
          <form className="grid grid-cols-1 md:grid-cols-2 gap-3" onSubmit={handleUpdateCollection}>
            <input
              value={editDraft.title_ru}
              onChange={(event) => setEditDraft((prev) => ({ ...prev, title_ru: event.target.value }))}
              className="app-input w-full bg-white/5 border border-white/10 px-4 py-3 text-sm font-semibold"
              placeholder={t.collectionsTitleRu}
            />
            <input
              value={editDraft.title_en}
              onChange={(event) => setEditDraft((prev) => ({ ...prev, title_en: event.target.value }))}
              className="app-input w-full bg-white/5 border border-white/10 px-4 py-3 text-sm font-semibold"
              placeholder={t.collectionsTitleEn}
            />
            <textarea
              value={editDraft.description_ru}
              onChange={(event) => setEditDraft((prev) => ({ ...prev, description_ru: event.target.value }))}
              className="app-input w-full bg-white/5 border border-white/10 px-4 py-3 text-sm font-semibold min-h-[90px] md:col-span-2 resize-y"
              placeholder={t.collectionsDescriptionRu}
            />
            <textarea
              value={editDraft.description_en}
              onChange={(event) => setEditDraft((prev) => ({ ...prev, description_en: event.target.value }))}
              className="app-input w-full bg-white/5 border border-white/10 px-4 py-3 text-sm font-semibold min-h-[90px] md:col-span-2 resize-y"
              placeholder={t.collectionsDescriptionEn}
            />
            <div className="md:col-span-1">
              <CustomSelect
                value={editDraft.visibility}
                options={visibilityOptions}
                onChange={(value) => setEditDraft((prev) => ({ ...prev, visibility: value }))}
                ariaLabel={t.collectionsVisibilityLabel}
              />
            </div>
            <div className="md:col-span-1 flex gap-3">
              <button
                type="submit"
                disabled={mutating}
                className="accent-soft flex-1 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-60"
              >
                {t.collectionsSave}
              </button>
              <button
                type="button"
                onClick={handleDeleteCollection}
                disabled={mutating}
                className="flex-1 py-3 rounded-2xl border border-red-500/35 bg-red-500/15 hover:bg-red-500/25 text-red-100 font-black text-xs uppercase tracking-widest transition-all disabled:opacity-60"
              >
                {t.collectionsDelete}
              </button>
            </div>
          </form>
        </div>
      )}

      {canManageSelected && (
        <div className="glass app-panel overflow-visible p-5 space-y-4">
          <p className="text-sm font-black">{t.collectionsManageItemsTitle}</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-1">
              <CustomSelect
                value={searchMediaType}
                options={searchTypeOptions}
                onChange={setSearchMediaType}
                ariaLabel={t.collectionsSearchTypeLabel}
              />
            </div>
            <div className="md:col-span-3 relative">
              <input
                ref={collectionSearchInputRef}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t.collectionsSearchPlaceholder}
                className="app-input w-full bg-white/5 border border-white/10 px-4 pr-12 py-3 text-sm font-semibold"
              />
              {searchQuery.length > 0 && (
                <button
                  type="button"
                  onClick={clearCollectionSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full border border-white/20 bg-white/10 hover:bg-white/18 text-white/75 hover:text-white transition-all"
                  aria-label={t.collectionsSearchClear}
                  title={t.collectionsSearchClear}
                >
                  {'\u2715'}
                </button>
              )}
            </div>
          </div>
          <p className="text-[11px] opacity-60">{t.collectionsSearchAutoHint}</p>

          {searchError && (
            <div className="rounded-xl border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {searchError}
            </div>
          )}

          {searchLoading && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {Array.from({ length: 10 }).map((_, index) => (
                <div key={`collection-search-skeleton-${index}`} className="media-card">
                  <div className="media-poster catalog-skeleton-poster">
                    <div className="catalog-skeleton-shimmer" />
                  </div>
                  <div className="catalog-skeleton-line" style={{ width: '88%' }} />
                  <div className="catalog-skeleton-line" style={{ width: '46%' }} />
                </div>
              ))}
            </div>
          )}

          {!searchLoading && debouncedSearchQuery.length < 2 && (
            <p className="text-sm opacity-65">{t.collectionsSearchTypeHint}</p>
          )}

          {!searchLoading && debouncedSearchQuery.length >= 2 && searchResults.length === 0 && !searchError && (
            <p className="text-sm opacity-65">{t.collectionsSearchNoResults}</p>
          )}

          {!searchLoading && searchResults.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {searchResults.map((item) => {
                const alreadyInCollection = collectionItemKeySet.has(`${item.mediaType}-${Number(item.id)}`);
                const year = getYear(item);
                const genre = (item.genre_ids?.length > 0 || item.genres?.length > 0)
                  ? (item.genres?.[0]?.name || '')
                  : '';
                return (
                  <div
                    key={`search-${item.mediaType}-${item.id}`}
                    onClick={() => handleCardClick(item)}
                    onContextMenu={(event) => onContextMenu(event, item)}
                    onTouchStart={(event) => onTouchStart(event, item)}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                    onTouchCancel={onTouchCancel}
                    className="media-card group cursor-pointer"
                  >
                    <div className="media-poster">
                      <LazyImg
                        src={item.poster_path ? `${IMG_500}${item.poster_path}` : '/poster-placeholder.svg'}
                        className="w-full aspect-[2/3] object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                        alt={item.title || item.name}
                      />
                      {alreadyInCollection && (
                        <div className="media-pill absolute top-2 left-2 bg-emerald-500 text-black">
                          {t.collectionsAlreadyAdded}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!alreadyInCollection) addItemToCollection(item);
                        }}
                        disabled={mutating || alreadyInCollection}
                        className={`quick-action-trigger ${alreadyInCollection ? 'collections-added-trigger' : ''}`}
                        aria-label={alreadyInCollection ? t.collectionsAlreadyAdded : t.collectionsItemAdd}
                        title={alreadyInCollection ? t.collectionsAlreadyAdded : t.collectionsItemAdd}
                      >
                        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true">
                          {alreadyInCollection ? <path d="m5 12 4 4 10-10" /> : <path d="M12 5v14M5 12h14" />}
                        </svg>
                      </button>
                      <div className="card-info-overlay">
                        {item.vote_average > 0 && <p className="text-xs font-bold mb-0.5">{'\u2605'} {item.vote_average.toFixed(1)}</p>}
                        {genre && <p className="text-[10px] font-medium opacity-80">{genre}</p>}
                        {year && <p className="text-[10px] font-normal opacity-60">{year}</p>}
                      </div>
                    </div>
                    <h3 className="media-title line-clamp-2">{item.title || item.name}</h3>
                    <p className="media-meta">{year}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {manageError && (
        <div className="rounded-2xl border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {manageError}
        </div>
      )}
      {manageNotice && (
        <div className="rounded-2xl border border-emerald-400/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {manageNotice}
        </div>
      )}

      {itemsError && (
        <div className="rounded-2xl border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {itemsError}
        </div>
      )}

      {itemsLoading && (
        <div className="glass app-panel p-5">
          <p className="text-sm opacity-80">{t.loading}</p>
        </div>
      )}

      {!itemsLoading && selectedCollection && collectionItems.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">{'\u{1F381}'}</div>
          <p className="empty-state-title">{t.collectionsEmptyTitle}</p>
          <p className="empty-state-hint">{t.collectionsEmptyHint}</p>
        </div>
      )}

      {!itemsLoading && collectionItems.length > 0 && (
        <>
          {canManageSelected && (
            <div className="glass app-panel p-5 space-y-2">
              <p className="text-sm font-black mb-2">{t.collectionsOrderTitle}</p>
              {collectionItems.map((item, index) => {
                const itemId = String(item._collectionItemId);
                const isDragging = draggingCollectionItemId === itemId;
                const isDragTarget = !isDragging && draggingCollectionItemId && dragOverCollectionItemId === itemId;
                return (
                  <div
                    key={`manage-${item._collectionItemId}`}
                    className={`collections-order-row ${isDragging ? 'dragging' : ''} ${isDragTarget ? (dragOverPosition === 'after' ? 'drag-over-after' : 'drag-over-before') : ''}`}
                    data-order-item-id={itemId}
                    draggable={!mutating}
                    onDragStart={(event) => handleOrderDragStart(event, item._collectionItemId)}
                    onDragOver={(event) => handleOrderDragOver(event, item._collectionItemId)}
                    onDrop={(event) => handleOrderDrop(event, item._collectionItemId)}
                    onDragEnd={handleOrderDragEnd}
                  >
                    <div className="collections-order-main">
                      <span
                        className="collections-drag-grip"
                        aria-hidden="true"
                        onTouchStart={(event) => handleOrderTouchStart(event, item._collectionItemId)}
                        onTouchMove={handleOrderTouchMove}
                        onTouchEnd={handleOrderTouchEnd}
                        onTouchCancel={handleOrderTouchCancel}
                      >
                        <span />
                        <span />
                        <span />
                      </span>
                      <p className="text-sm font-semibold truncate">
                        {index + 1}. {item.title || item.name}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => removeItemFromCollection(item._collectionItemId)}
                        disabled={mutating}
                        draggable={false}
                        onDragStart={(event) => event.preventDefault()}
                        className="collections-action-btn danger"
                      >
                        {t.collectionsItemRemove}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {collectionItems.map((item) => {
              const libEntry = getLibraryEntry(item.mediaType, item.id);
              const badge = libEntry && STATUS_BADGE_CONFIG[libEntry.status];
              const year = getYear(item);
              const genre = Array.isArray(item.genres) && item.genres[0]?.name ? item.genres[0].name : '';
              return (
                <div
                  key={`collection-item-${item._collectionItemId || `${item.mediaType}-${item.id}`}`}
                  onClick={() => handleCardClick(item)}
                  onContextMenu={(event) => onContextMenu(event, item)}
                  onTouchStart={(event) => onTouchStart(event, item)}
                  onTouchMove={onTouchMove}
                  onTouchEnd={onTouchEnd}
                  onTouchCancel={onTouchCancel}
                  className="media-card group cursor-pointer"
                >
                  <div className="media-poster">
                    <LazyImg
                      src={item.poster_path ? `${IMG_500}${item.poster_path}` : '/poster-placeholder.svg'}
                      className="w-full aspect-[2/3] object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                      alt={item.title || item.name}
                    />
                    {badge && (
                      <div
                        className="media-pill absolute top-2 right-2 text-white uppercase flex items-center gap-1 shadow-lg"
                        style={{ background: badge.bg }}
                      >
                        <span>{badge.icon}</span>
                        <span>{badge.label}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openQuickActions(item, event.clientX, event.clientY);
                      }}
                      className="quick-action-trigger"
                      aria-label={t.quickActions}
                      title={t.quickActions}
                    >
                      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </button>
                    <div className="card-info-overlay">
                      {item.vote_average > 0 && <p className="text-xs font-bold mb-0.5">{'\u2605'} {item.vote_average.toFixed(1)}</p>}
                      {genre && <p className="text-[10px] font-medium opacity-80">{genre}</p>}
                      {year && <p className="text-[10px] font-normal opacity-60">{year}</p>}
                    </div>
                  </div>
                  <h3 className="media-title line-clamp-2">{item.title || item.name}</h3>
                  <p className="media-meta">{year}</p>
                </div>
              );
            })}
          </div>
        </>
      )}
            </div>
          </div>
        </div>
      ), document.body)}
        </>
      )}

      {collectionsSection === 'forYou' && (
        <>
          <div className="glass app-panel p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className="text-sm font-black">{t.collectionsForYouTitle}</p>
              <p className="text-xs opacity-65 mt-1">
                {interpolate(t.collectionsForYouSeedsCount, { count: recommendationSeedCount, rating: recommendationMinSeedRating })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setForYouSettingsModalOpen(true)}
                className="px-4 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-black uppercase tracking-widest transition-all"
              >
                {t.forYouSettingsButton || t.settings}
              </button>
              <button
                type="button"
                onClick={refreshRecommendations}
                disabled={recommendationsLoading}
                className="px-4 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-black uppercase tracking-widest transition-all disabled:opacity-60"
              >
                {t.collectionsForYouRefresh}
              </button>
            </div>
          </div>

          {recommendationsError && (
            <div className="rounded-2xl border border-red-400/35 bg-red-500/10 px-4 py-4 text-sm text-red-100 space-y-3">
              <p className="font-black">{t.collectionsForYouErrorTitle}</p>
              <p>{recommendationsError}</p>
              <button
                type="button"
                onClick={refreshRecommendations}
                className="px-4 py-2 rounded-xl border border-red-300/35 bg-red-400/20 hover:bg-red-400/30 text-xs font-black uppercase tracking-widest transition-all"
              >
                {t.collectionsForYouRetry}
              </button>
            </div>
          )}

          {recommendationsLoading && visibleRecommendations.length === 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {Array.from({ length: 10 }).map((_, index) => (
                <div key={`for-you-skeleton-${index}`} className="media-card">
                  <div className="media-poster catalog-skeleton-poster">
                    <div className="catalog-skeleton-shimmer" />
                  </div>
                  <div className="catalog-skeleton-line" style={{ width: '88%' }} />
                  <div className="catalog-skeleton-line" style={{ width: '46%' }} />
                </div>
              ))}
            </div>
          )}

          {!recommendationsLoading && !recommendationsError && recommendationSeedCount === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon" aria-hidden="true">{'\u2728'}</div>
              <p className="empty-state-title">{t.collectionsForYouSeedEmptyTitle}</p>
              <p className="empty-state-hint">{interpolate(t.collectionsForYouSeedEmptyHint, { rating: recommendationMinSeedRating })}</p>
            </div>
          )}

          {!recommendationsLoading && !recommendationsError && recommendationSeedCount > 0 && visibleRecommendations.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon" aria-hidden="true">{'\u{1F4AD}'}</div>
              <p className="empty-state-title">{t.collectionsForYouEmptyTitle}</p>
              <p className="empty-state-hint">{t.collectionsForYouEmptyHint}</p>
            </div>
          )}

          {visibleRecommendations.length > 0 && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {visibleRecommendations.map((item) => {
                  const libEntry = getLibraryEntry(item.mediaType, item.id);
                  const badge = libEntry && STATUS_BADGE_CONFIG[libEntry.status];
                  const year = getYear(item);
                  const genre = (item.genre_ids?.length > 0 || item.genres?.length > 0)
                    ? (item.genres?.[0]?.name || '')
                    : '';
                  const reasonText = getRecommendationReasonText(item);

                  return (
                    <div
                      key={`recommendation-${item.mediaType}-${item.id}`}
                      onClick={() => handleRecommendationCardClick(item)}
                      onContextMenu={(event) => onRecommendationContextMenu(event, item)}
                      onTouchStart={(event) => onRecommendationTouchStart(event, item)}
                      onTouchMove={onRecommendationTouchMove}
                      onTouchEnd={onRecommendationTouchEnd}
                      onTouchCancel={onRecommendationTouchCancel}
                      className="media-card group cursor-pointer"
                    >
                      <div className="media-poster">
                        <LazyImg
                          src={item.poster_path ? `${IMG_500}${item.poster_path}` : '/poster-placeholder.svg'}
                          className="w-full aspect-[2/3] object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                          alt={item.title || item.name}
                        />
                        {badge && (
                          <div
                            className="media-pill absolute top-2 right-2 text-white uppercase flex items-center gap-1 shadow-lg"
                            style={{ background: badge.bg }}
                          >
                            <span>{badge.icon}</span>
                            <span>{badge.label}</span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openQuickActions(item, event.clientX, event.clientY, { showHideFromForYou: true });
                          }}
                          className="quick-action-trigger"
                          aria-label={t.quickActions}
                          title={t.quickActions}
                        >
                          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true">
                            <path d="M12 5v14M5 12h14" />
                          </svg>
                        </button>
                        <div className="card-info-overlay">
                          {item.vote_average > 0 && <p className="text-xs font-bold mb-0.5">{'\u2605'} {item.vote_average.toFixed(1)}</p>}
                          {genre && <p className="text-[10px] font-medium opacity-80">{genre}</p>}
                          {year && <p className="text-[10px] font-normal opacity-60">{year}</p>}
                        </div>
                      </div>
                      <h3 className="media-title line-clamp-2">{item.title || item.name}</h3>
                      <p className="media-meta">{year}</p>
                      {reasonText && <p className="text-[11px] leading-snug opacity-70 mt-1">{reasonText}</p>}
                    </div>
                  );
                })}
              </div>

              {recommendationsHasMore && (
                <>
                  <div ref={recommendationsLoadMoreSentinelRef} className="h-px w-full" aria-hidden="true" />
                  <button
                    type="button"
                    onClick={showMoreRecommendations}
                    className="w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
                  >
                    {t.collectionsForYouShowMore}
                  </button>
                </>
              )}
            </>
          )}
        </>
      )}

      {isForYouSettingsModalOpen && typeof document !== 'undefined' && createPortal((
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-4" onClick={() => setForYouSettingsModalOpen(false)}>
          <div className="absolute inset-0 modal-overlay" />
          <div
            className="relative w-full max-w-xl glass app-panel-padded p-4 md:p-5 space-y-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-50 mb-2">{t.collectionsForYouTab}</p>
                <h3 className="text-xl md:text-2xl font-black leading-tight">{t.forYouSettingsModalTitle || t.forYouSettingsTitle}</h3>
                <p className="text-xs opacity-60 mt-1">{t.forYouSettingsModalHint || t.forYouSeedThresholdHint}</p>
              </div>
              <button
                type="button"
                onClick={() => setForYouSettingsModalOpen(false)}
                className="collections-modal-close"
                aria-label={t.close}
                title={t.close}
              >
                {'\u2715'}
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-widest opacity-50">{t.forYouSeedThresholdLabel || t.collectionsForYouTitle}</p>
              <p className="text-xs opacity-60">{t.forYouSeedThresholdHint || t.collectionsForYouSeedEmptyHint}</p>
              <CustomSelect
                value={recommendationMinSeedRating}
                options={forYouSeedThresholdOptions}
                onChange={setRecommendationMinSeedRating}
                ariaLabel={t.forYouSeedThresholdLabel || t.collectionsForYouTitle}
              />
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-widest opacity-50">{t.forYouFilterMediaTypeLabel || t.contentTypeLabel}</p>
              <p className="text-xs opacity-60">{t.forYouFilterMediaTypeHint || t.collectionsForYouTab}</p>
              <CustomSelect
                value={recommendationMediaTypeFilter}
                options={forYouMediaTypeFilterOptions}
                onChange={setRecommendationMediaTypeFilter}
                ariaLabel={t.forYouFilterMediaTypeLabel || t.contentTypeLabel}
              />
            </div>

            <button
              type="button"
              onClick={() => setForYouSettingsModalOpen(false)}
              className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
            >
              {t.close}
            </button>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}
