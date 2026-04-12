import React, { useState, useRef, useEffect } from 'react';
import './Select.css';

export default function Select({ id, label, value, onChange, options, disabled = false, className = '' }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  const selected = options.find(o => o.value === value);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (optValue) => {
    onChange({ target: { value: optValue } });
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(o => !o);
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'ArrowDown' && open) {
      e.preventDefault();
      const idx = options.findIndex(o => o.value === value);
      const next = options[Math.min(idx + 1, options.length - 1)];
      if (next) handleSelect(next.value);
    } else if (e.key === 'ArrowUp' && open) {
      e.preventDefault();
      const idx = options.findIndex(o => o.value === value);
      const prev = options[Math.max(idx - 1, 0)];
      if (prev) handleSelect(prev.value);
    }
  };

  return (
    <div className={`form-group ${className}`}>
      {label && <label htmlFor={id}>{label}</label>}
      <div className="select-wrapper" ref={wrapperRef}>
        <button
          type="button"
          id={id}
          className={`select-trigger${open ? ' select-trigger--open' : ''}`}
          onClick={() => !disabled && setOpen(o => !o)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={label}
        >
          <span className="select-trigger__label" aria-hidden="true">
            {selected ? selected.label : '—'}
          </span>
          <svg
            className="select-trigger__chevron"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        <div className={`select-dropdown${open ? ' select-dropdown--open' : ''}`} role="listbox">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              className={`select-option${opt.value === value ? ' select-option--selected' : ''}`}
              onClick={() => handleSelect(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
