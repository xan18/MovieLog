import React from 'react';
import { LazyImg } from '../ui.jsx';
import { getYear } from '../../utils/appUtils.js';
import { IMG_500 } from '../../constants/appConstants.js';

export default function PersonModal({
  selectedPerson,
  setSelectedPerson,
  isClosing,
  onClose,
  library,
  t,
  DATE_LOCALE,
  STATUS_BADGE_CONFIG,
  getFullDetails,
}) {
  if (!selectedPerson) return null;

  const handleClose = onClose || (() => setSelectedPerson(null));
  const isPersonLoading = Boolean(selectedPerson.isLoading);
  const personDisplayName = selectedPerson.name || (isPersonLoading ? (t.loading || 'Loading...') : '\u2014');
  const libraryIndex = new Map(
    (Array.isArray(library) ? library : []).map((item) => [`${item.mediaType}-${item.id}`, item])
  );
  const filmographyGroups = Array.isArray(selectedPerson.filmographyGroups) && selectedPerson.filmographyGroups.length > 0
    ? selectedPerson.filmographyGroups
    : (selectedPerson.allMovies?.length > 0
      ? [{ key: 'all', label: t.fullFilmography, items: selectedPerson.allMovies }]
      : []);
  const isRuLocale = typeof DATE_LOCALE === 'string' && DATE_LOCALE.toLowerCase().startsWith('ru');

  const getMediaTypeLabel = (mediaType) => {
    if (mediaType === 'tv') return isRuLocale ? '\u0421\u0435\u0440\u0438\u0430\u043b' : 'TV';
    if (mediaType === 'movie') return isRuLocale ? '\u0424\u0438\u043b\u044c\u043c' : 'Movie';
    return mediaType || '';
  };

  const renderLibraryStatusBadge = (libItem, { mobile = false } = {}) => {
    if (!libItem) return null;

    const cfg = STATUS_BADGE_CONFIG?.[libItem.status];

    if (mobile) {
      return cfg ? (
        <span
          className="person-filmography-mobile-status-chip"
          style={{ background: cfg.bg, backdropFilter: 'blur(4px)' }}
        >
          <span aria-hidden="true">{cfg.icon}</span>
          <span>{cfg.label}</span>
        </span>
      ) : (
        <span className="person-filmography-mobile-status-chip person-filmography-mobile-status-chip-fallback">
          <span aria-hidden="true">{'\u2713'}</span>
        </span>
      );
    }

    return cfg ? (
      <div
        className="absolute top-2 right-2 text-white text-[8px] font-black px-1.5 py-0.5 rounded-lg uppercase flex items-center gap-1 shadow-lg"
        style={{ background: cfg.bg, backdropFilter: 'blur(4px)' }}
      >
        <span>{cfg.icon}</span>
        <span>{cfg.label}</span>
      </div>
    ) : (
      <div className="absolute top-2 right-2 bg-green-500 text-white text-[9px] font-black px-2 py-1 rounded-lg uppercase">{'\u2713'}</div>
    );
  };

  return (
    <div className={`fixed inset-0 z-[100] overflow-y-auto modal-overlay ${isClosing ? 'modal-exit' : 'modal-enter'}`} onClick={handleClose}>
      <div className="min-h-screen px-4 py-8">
        <div className="relative max-w-6xl mx-auto glass rounded-[3rem] border border-white/10 overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
          <button className="absolute top-8 right-8 text-white text-3xl font-black z-10" onClick={handleClose} title={t.close}>{'\u2715'}</button>

          <div className="p-8 space-y-6">
            <div className="flex items-start gap-6">
              {selectedPerson.profile_path && <LazyImg src={`${IMG_500}${selectedPerson.profile_path}`} className="w-32 md:w-40 aspect-[2/3] object-cover rounded-2xl shadow-2xl flex-shrink-0" alt={selectedPerson.name} />}
              <div className="flex-1">
                <h2 className="text-3xl md:text-4xl font-black mb-4">{personDisplayName}</h2>
                {isPersonLoading && (
                  <p className="text-xs uppercase tracking-widest opacity-60 mb-3">{t.loading || 'Loading...'}</p>
                )}
                {selectedPerson.biography && <p className="text-sm opacity-80 mb-4 line-clamp-3 font-normal">{selectedPerson.biography}</p>}
                <div className="flex flex-wrap gap-4 text-sm font-medium">
                  {selectedPerson.birthday && <span className="opacity-60">{'\u{1F382}'} {new Date(selectedPerson.birthday).toLocaleDateString(DATE_LOCALE)}</span>}
                  {selectedPerson.place_of_birth && <span className="opacity-60">{'\u{1F4CD}'} {selectedPerson.place_of_birth}</span>}
                  {selectedPerson.known_for_department && <span className="opacity-60">{'\u{1F3AC}'} {selectedPerson.known_for_department}</span>}
                </div>
              </div>
            </div>

            {selectedPerson.moviesInLibrary?.length > 0 && (
              <div className="glass rounded-2xl p-6 border border-white/10">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="accent-text text-[10px] font-black uppercase mb-1 italic">{t.inLibrary}</p>
                    <p className="text-2xl font-black">{selectedPerson.moviesInLibrary.length}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-yellow-500 mb-1 italic">{t.avgPersonRating}</p>
                    <p className="text-2xl font-black">{selectedPerson.avgRating > 0 ? selectedPerson.avgRating : '\u2014'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-green-500 mb-1 italic">{t.totalWorks}</p>
                    <p className="text-2xl font-black">{selectedPerson.allMovies?.length || 0}</p>
                  </div>
                </div>
              </div>
            )}

            {selectedPerson.moviesInLibrary?.length > 0 && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-green-500 mb-4 italic">{t.inYourLibrary} ({selectedPerson.moviesInLibrary.length})</p>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {selectedPerson.moviesInLibrary.map((item, i) => (
                    <div key={`${item.mediaType}-${item.id}`} onClick={() => { handleClose(); getFullDetails(item); }} className="group cursor-pointer card-stagger" style={{ '--stagger-i': i }}>
                      <div className="relative mb-3 rounded-2xl overflow-hidden shadow-xl transition-transform group-hover:scale-105">
                        <LazyImg src={item.poster_path ? `${IMG_500}${item.poster_path}` : '/poster-placeholder.svg'} className="w-full aspect-[2/3] object-cover" alt={item.title || item.name} />
                        {item.rating > 0 && <div className="absolute top-2 left-2 bg-yellow-500 text-black text-xs font-black px-2 py-1 rounded-lg">{'\u2605'} {item.rating}</div>}
                      </div>
                      <h3 className="font-bold text-[15px] md:text-sm mb-1 line-clamp-2 leading-tight">{item.title || item.name}</h3>
                      <p className="text-[13px] md:text-xs opacity-40 font-normal">{getYear(item)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {filmographyGroups.length > 0 && (
              <div className="border-t border-white/5 pt-6">
                <p className="accent-text text-[10px] font-black uppercase tracking-widest mb-4 italic">{t.fullFilmography} ({selectedPerson.allMovies.length})</p>
                <div className="max-h-[650px] overflow-y-auto pr-2 no-scrollbar space-y-8">
                  {filmographyGroups.map((group) => (
                    <div key={group.key}>
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <p className="text-sm font-black uppercase tracking-wide">{group.label}</p>
                        <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-white/5 border border-white/10 opacity-80">{group.items.length}</span>
                      </div>

                      <div className="md:hidden person-filmography-mobile-list">
                        {group.items.map((item, i) => {
                          const libItem = libraryIndex.get(`${item.mediaType}-${item.id}`);
                          const statusBadge = renderLibraryStatusBadge(libItem, { mobile: true });
                          const hasRating = Number(libItem?.rating) > 0;
                          const roleLabel = item.character || item.job || item.department || '';
                          const mediaTypeLabel = getMediaTypeLabel(item.mediaType);

                          return (
                            <button
                              key={`${group.key}-mobile-${item.mediaType}-${item.id}`}
                              type="button"
                              onClick={() => { handleClose(); getFullDetails(item); }}
                              className="person-filmography-mobile-item card-stagger"
                              style={{ '--stagger-i': i }}
                            >
                              <div className="person-filmography-mobile-main">
                                <div className="person-filmography-mobile-poster-wrap">
                                  <LazyImg src={item.poster_path ? `${IMG_500}${item.poster_path}` : '/poster-placeholder.svg'} className="person-filmography-mobile-poster" alt={item.title || item.name} />
                                </div>
                                <div className="person-filmography-mobile-body">
                                  <div className="person-filmography-mobile-title-row">
                                    <h3 className="person-filmography-mobile-title">{item.title || item.name}</h3>
                                    <span className="person-filmography-mobile-year">{getYear(item) || '\u2014'}</span>
                                  </div>
                                  <div className="person-filmography-mobile-meta">
                                    {mediaTypeLabel && <span className="person-filmography-mobile-type">{mediaTypeLabel}</span>}
                                    {roleLabel && mediaTypeLabel && <span className="person-filmography-mobile-dot" aria-hidden="true">{'\u2022'}</span>}
                                    {roleLabel && <span className="person-filmography-mobile-role" title={roleLabel}>{roleLabel}</span>}
                                  </div>
                                  {(statusBadge || hasRating) && (
                                    <div className="person-filmography-mobile-chips">
                                      {statusBadge}
                                      {hasRating && (
                                        <span className="person-filmography-mobile-rating-chip">
                                          <span aria-hidden="true">{'\u2605'}</span>
                                          <span>{libItem.rating}</span>
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <div className="hidden md:grid md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {group.items.map((item, i) => (
                          <div key={`${group.key}-${item.mediaType}-${item.id}`} onClick={() => { handleClose(); getFullDetails(item); }} className="group cursor-pointer card-stagger" style={{ '--stagger-i': i }}>
                            <div className="relative mb-3 rounded-2xl overflow-hidden shadow-xl transition-transform group-hover:scale-105">
                              <LazyImg src={item.poster_path ? `${IMG_500}${item.poster_path}` : '/poster-placeholder.svg'} className="w-full aspect-[2/3] object-cover" alt={item.title || item.name} />
                              {renderLibraryStatusBadge(libraryIndex.get(`${item.mediaType}-${item.id}`))}
                            </div>
                            <h3 className="font-bold text-sm md:text-sm mb-1 line-clamp-2 leading-tight">{item.title || item.name}</h3>
                            <p className="text-xs md:text-xs opacity-40 font-normal">{getYear(item)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
