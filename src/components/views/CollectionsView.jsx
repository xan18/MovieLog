import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CustomSelect, LazyImg } from '../ui.jsx';
import { IMG_500 } from '../../constants/appConstants.js';
import { getYear } from '../../utils/appUtils.js';
import { tmdbFetchJson } from '../../services/tmdb.js';
import { supabase } from '../../services/supabase.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { useQuickActionGesture } from '../../hooks/useQuickActionGesture.js';

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

export default function CollectionsView({
  t,
  lang,
  currentUserId,
  canAuthorMode,
  isAuthor,
  authorModeEnabled,
  setAuthorModeEnabled,
  getLibraryEntry,
  openQuickActions,
  onCardClick,
  STATUS_BADGE_CONFIG,
}) {
  const [collections, setCollections] = useState([]);
  const [collectionsLoading, setCollectionsLoading] = useState(true);
  const [collectionsError, setCollectionsError] = useState('');
  const [selectedCollectionId, setSelectedCollectionId] = useState('');
  const [isCollectionModalOpen, setCollectionModalOpen] = useState(false);
  const [isCollectionModalClosing, setCollectionModalClosing] = useState(false);

  const [collectionRows, setCollectionRows] = useState([]);
  const [collectionItems, setCollectionItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState('');

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
  const debouncedSearchQuery = useDebounce(searchQuery.trim(), 350);
  const collectionModalCloseTimerRef = useRef(null);
  const collectionSearchInputRef = useRef(null);

  const TMDB_LANG = lang === 'ru' ? 'ru-RU' : 'en-US';
  const {
    onContextMenu,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    consumeLongPress,
  } = useQuickActionGesture(openQuickActions);

  const handleCardClick = (item) => {
    if (consumeLongPress()) return;
    onCardClick(item);
  };

  const visibilityOptions = useMemo(() => ([
    { value: 'public', label: t.collectionsVisibilityPublic },
    { value: 'private', label: t.collectionsVisibilityPrivate },
  ]), [t.collectionsVisibilityPublic, t.collectionsVisibilityPrivate]);

  const searchTypeOptions = useMemo(() => ([
    { value: 'movie', label: t.movies },
    { value: 'tv', label: t.tvShows },
  ]), [t.movies, t.tvShows]);

  const selectedCollection = useMemo(
    () => collections.find((collection) => collection.id === selectedCollectionId) || null,
    [collections, selectedCollectionId]
  );

  const canManageSelected = Boolean(
    isAuthor
    && selectedCollection
    && isCollectionModalOpen
  );
  const collectionItemKeySet = useMemo(
    () => new Set(collectionRows.map((row) => `${row.media_type}-${Number(row.tmdb_id)}`)),
    [collectionRows]
  );

  const loadCollections = useCallback(async () => {
    if (!supabase || !currentUserId) return;
    setCollectionsLoading(true);
    setCollectionsError('');

    const { data, error } = await supabase
      .from('curated_collections')
      .select('id, owner_user_id, visibility, title_ru, title_en, description_ru, description_en, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      setCollections([]);
      setCollectionsError(error.message);
      setCollectionsLoading(false);
      return;
    }

    setCollections(data || []);
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

  const handleCreateCollection = async (event) => {
    event.preventDefault();
    if (!isAuthor || !currentUserId) return;

    const payload = normalizeDraft(createDraft);
    if (!payload.title_ru && !payload.title_en) {
      setManageError(t.collectionsTitleRequired);
      setManageNotice('');
      return;
    }

    setMutating(true);
    clearFeedback();
    const { data, error } = await supabase
      .from('curated_collections')
      .insert({
        owner_user_id: currentUserId,
        ...payload,
      })
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

  return (
    <div className="view-stack">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="app-page-title">{t.collections.toUpperCase()}</h2>
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
              className={`relative inline-flex h-6 w-11 items-center rounded-full border px-[2px] transition-colors ${
                authorModeEnabled
                  ? 'border-blue-300/70 bg-blue-500/60'
                  : 'border-slate-400/45 bg-slate-900/60'
              }`}
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

      {collectionsError && (
        <div className="rounded-2xl border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {collectionsError}
        </div>
      )}

      {!collectionsLoading && collections.length > 0 && (
        <div className="collections-grid">
          {collections.map((collection) => {
            const title = getLocalized(lang, collection.title_ru, collection.title_en) || t.collectionsUntitled;
            const description = getLocalized(lang, collection.description_ru, collection.description_en);
            const visibilityLabel = collection.visibility === 'private'
              ? t.collectionsVisibilityPrivate
              : t.collectionsVisibilityPublic;
            const updatedAt = collection.updated_at
              ? new Date(collection.updated_at).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US')
              : '';
            return (
              <button
                key={collection.id}
                type="button"
                onClick={() => openCollectionModal(collection.id)}
                className="collections-large-card"
              >
                <div className="collections-large-card-head">
                  <p className="collections-large-card-title">{title}</p>
                  <span className="tag shrink-0">{visibilityLabel}</span>
                </div>
                <p className={`collections-large-card-description ${description ? '' : 'opacity-45'}`}>
                  {description || t.collectionsEmptyHint}
                </p>
                <div className="collections-large-card-foot">
                  <span className="text-xs opacity-55">{updatedAt}</span>
                  <span className="collections-large-card-open">{t.details}</span>
                </div>
              </button>
            );
          })}
        </div>
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
    </div>
  );
}
