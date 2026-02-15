import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RATINGS } from '../utils/appUtils';

const RATING_EMOJI_MAP = {
  1: '😫',
  2: '😞',
  3: '😕',
  4: '😐',
  5: '🙂',
  6: '😊',
  7: '😌',
  8: '😃',
  9: '🤩',
  10: '🏆',
};

export const SegmentedControl = React.memo(({ items, activeId, onChange }) => (
  <div className="flex gap-3">
    {items.map((item) => (
      <button
        key={item.id}
        onClick={() => onChange(item.id)}
        className={`seg-btn flex-1 py-4 rounded-2xl font-bold text-sm uppercase tracking-widest transition-all ${activeId === item.id ? 'active' : ''}`}
      >
        {item.label}
      </button>
    ))}
  </div>
));

export const CustomSelect = React.memo(({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
  menuClassName = '',
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const selectedOption = useMemo(() => (
    options.find((option) => String(option.value) === String(value)) || options[0] || null
  ), [options, value]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  const hasOptions = options.length > 0;
  const triggerLabel = selectedOption?.label || '';
  const wrapClassName = ['ctrl-select-wrap', open ? 'open' : '', className].filter(Boolean).join(' ');
  const panelClassName = ['ctrl-select-menu', menuClassName].filter(Boolean).join(' ');

  const selectOption = (nextValue) => {
    if (String(nextValue) !== String(value)) onChange(nextValue);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={wrapClassName}>
      <button
        type="button"
        className="ctrl-select"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(prev => !prev)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        disabled={!hasOptions}
      >
        <span className="ctrl-select-label">{triggerLabel}</span>
        <svg viewBox="0 0 24 24" className="ctrl-select-chevron" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <path d="m7 10 5 5 5-5" />
        </svg>
      </button>

      {open && hasOptions && (
        <div className={panelClassName} role="listbox" aria-label={ariaLabel}>
          {options.map((option) => {
            const isSelected = String(option.value) === String(value);
            return (
              <button
                key={String(option.value)}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => selectOption(option.value)}
                className={`ctrl-select-option ${isSelected ? 'active' : ''}`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

export const StatCard = React.memo(({ label, value, color, border }) => (
  <div className={`bg-white/5 rounded-xl p-4 ${border ? `border ${border}` : ''}`}>
    <p className={`text-[9px] font-black uppercase ${color} mb-1`}>{label}</p>
    <p className="text-2xl font-black">{value}</p>
  </div>
));

export const RatingModal = React.memo(({
  title,
  subtitle,
  currentRating,
  onRate,
  onRemove,
  onClose,
  removeLabel = 'Remove rating',
  cancelLabel = 'Cancel',
  confirmLabel = 'Confirm',
}) => {
  const [selectedRating, setSelectedRating] = useState(currentRating || 0);

  useEffect(() => {
    setSelectedRating(currentRating || 0);
  }, [currentRating]);

  const activeEmoji = useMemo(() => RATING_EMOJI_MAP[selectedRating] || '🙂', [selectedRating]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 p-4 modal-enter"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md glass app-panel-padded p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-6">
          <h3 className="text-2xl font-black mb-2">{title}</h3>
          <p className="text-xs opacity-60 uppercase tracking-widest font-medium">{subtitle}</p>
          <div className="mt-3 text-3xl leading-none">{activeEmoji}</div>
        </div>
        <div className="grid grid-cols-5 gap-3 mb-6">
          {RATINGS.map((r, i) => (
            <button
              key={r}
              onClick={() => setSelectedRating(r)}
              className={`aspect-square rounded-2xl font-black text-xl transition-all star-animated ${
                selectedRating === r
                  ? 'bg-yellow-500 text-black scale-110 shadow-xl'
                  : 'bg-white/10 hover:bg-white/20 border border-white/20'
              }`}
              style={{ '--star-i': i }}
            >
              {r}
            </button>
          ))}
        </div>
        <button
          onClick={() => onRate(selectedRating)}
          disabled={selectedRating < 1}
          className={`w-full py-3 rounded-2xl font-bold text-xs uppercase tracking-widest transition-all ${
            selectedRating < 1
              ? 'bg-white/8 text-white/40 border border-white/10 cursor-not-allowed'
              : 'accent-btn'
          }`}
        >
          {confirmLabel}
        </button>
        {onRemove && (
          <button
            onClick={onRemove}
            className="w-full mt-3 py-3 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 rounded-2xl font-bold text-xs uppercase tracking-widest transition-all"
          >
            {removeLabel}
          </button>
        )}
        <button
          onClick={onClose}
          className="w-full mt-3 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-bold text-xs uppercase tracking-widest transition-all"
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  );
});

export const LazyImg = React.memo(({ src, alt, className }) => (
  <img loading="lazy" src={src} alt={alt || ''} className={className} />
));
