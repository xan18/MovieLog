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
  const libraryIndex = new Map(
    (Array.isArray(library) ? library : []).map((item) => [`${item.mediaType}-${item.id}`, item])
  );
  const filmographyGroups = Array.isArray(selectedPerson.filmographyGroups) && selectedPerson.filmographyGroups.length > 0
    ? selectedPerson.filmographyGroups
    : (selectedPerson.allMovies?.length > 0
      ? [{ key: 'all', label: t.fullFilmography, items: selectedPerson.allMovies }]
      : []);

  return (
    <div className={`fixed inset-0 z-[100] overflow-y-auto modal-overlay ${isClosing ? 'modal-exit' : 'modal-enter'}`} onClick={handleClose}>
      <div className="min-h-screen px-4 py-8">
        <div className="relative max-w-6xl mx-auto glass rounded-[3rem] border border-white/10 overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
          <button className="absolute top-8 right-8 text-white text-3xl font-black z-10" onClick={handleClose} title={t.close}>✕</button>

          <div className="p-8 space-y-6">
            <div className="flex items-start gap-6">
              {selectedPerson.profile_path && <LazyImg src={`${IMG_500}${selectedPerson.profile_path}`} className="w-32 md:w-40 aspect-[2/3] object-cover rounded-2xl shadow-2xl flex-shrink-0" alt={selectedPerson.name} />}
              <div className="flex-1">
                <h2 className="text-3xl md:text-4xl font-black mb-4">{selectedPerson.name}</h2>
                {selectedPerson.biography && <p className="text-sm opacity-80 mb-4 line-clamp-3 font-normal">{selectedPerson.biography}</p>}
                <div className="flex flex-wrap gap-4 text-sm font-medium">
                  {selectedPerson.birthday && <span className="opacity-60">🎂 {new Date(selectedPerson.birthday).toLocaleDateString(DATE_LOCALE)}</span>}
                  {selectedPerson.place_of_birth && <span className="opacity-60">📍 {selectedPerson.place_of_birth}</span>}
                  {selectedPerson.known_for_department && <span className="opacity-60">🎬 {selectedPerson.known_for_department}</span>}
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
                    <p className="text-2xl font-black">{selectedPerson.avgRating > 0 ? selectedPerson.avgRating : '—'}</p>
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
                        {item.rating > 0 && <div className="absolute top-2 left-2 bg-yellow-500 text-black text-xs font-black px-2 py-1 rounded-lg">★ {item.rating}</div>}
                      </div>
                      <h3 className="font-bold text-xs mb-1 line-clamp-2">{item.title || item.name}</h3>
                      <p className="text-[10px] opacity-40 font-normal">{getYear(item)}</p>
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
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {group.items.map((item, i) => (
                          <div key={`${group.key}-${item.mediaType}-${item.id}`} onClick={() => { handleClose(); getFullDetails(item); }} className="group cursor-pointer card-stagger" style={{ '--stagger-i': i }}>
                            <div className="relative mb-3 rounded-2xl overflow-hidden shadow-xl transition-transform group-hover:scale-105">
                              <LazyImg src={item.poster_path ? `${IMG_500}${item.poster_path}` : '/poster-placeholder.svg'} className="w-full aspect-[2/3] object-cover" alt={item.title || item.name} />
                              {(() => {
                                const libItem = libraryIndex.get(`${item.mediaType}-${item.id}`);
                                if (!libItem) return null;
                                const cfg = libItem && STATUS_BADGE_CONFIG[libItem.status];
                                return cfg ? (
                                  <div className="absolute top-2 right-2 text-white text-[8px] font-black px-1.5 py-0.5 rounded-lg uppercase flex items-center gap-1 shadow-lg" style={{ background: cfg.bg, backdropFilter: 'blur(4px)' }}>
                                    <span>{cfg.icon}</span><span>{cfg.label}</span>
                                  </div>
                                ) : (
                                  <div className="absolute top-2 right-2 bg-green-500 text-white text-[9px] font-black px-2 py-1 rounded-lg uppercase">✓</div>
                                );
                              })()}
                            </div>
                            <h3 className="font-bold text-[10px] mb-1 line-clamp-2">{item.title || item.name}</h3>
                            <p className="text-[9px] opacity-40 font-normal">{getYear(item)}</p>
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
