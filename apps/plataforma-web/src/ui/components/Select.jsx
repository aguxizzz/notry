import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './Select.css';

export default function Select({ id, label, value, onChange, options, disabled = false, className = '' }) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [dropdownStyle, setDropdownStyle] = useState({});
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);

  const selected = options.find(o => o.value === value);
  const listboxId = `${id}-listbox`;
  const activeOptionId = activeIdx >= 0 ? `${id}-option-${options[activeIdx]?.value}` : undefined;

  useEffect(() => {
    if (!open || !triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const estimatedHeight = options.length * 34 + 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < estimatedHeight + 8 && rect.top > estimatedHeight + 8;

    setDropdownStyle(openUpward
      ? { position: 'fixed', bottom: window.innerHeight - rect.top + 6, top: 'auto', left: rect.left, width: rect.width }
      : { position: 'fixed', top: rect.bottom + 6, left: rect.left, width: rect.width }
    );

    const closeInstant = () => {
      const el = document.getElementById(listboxId);
      if (el) el.classList.add('select-dropdown--instant');
      setOpen(false);
      setActiveIdx(-1);
    };

    window.addEventListener('scroll', closeInstant, true);
    window.addEventListener('resize', closeInstant);
    return () => {
      window.removeEventListener('scroll', closeInstant, true);
      window.removeEventListener('resize', closeInstant);
    };
  }, [open, options.length, listboxId]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      const dropdownEl = document.getElementById(listboxId);
      if (
        wrapperRef.current && !wrapperRef.current.contains(e.target) &&
        (!dropdownEl || !dropdownEl.contains(e.target))
      ) {
        setOpen(false);
        setActiveIdx(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [listboxId]);

  const handleToggle = () => {
    if (disabled) return;
    if (!open) {
      // Remove instant-close class before opening so the open animation plays normally
      const el = document.getElementById(listboxId);
      if (el) el.classList.remove('select-dropdown--instant');
    }
    setOpen(o => !o);
  };

  const handleSelect = (optValue) => {
    onChange({ target: { value: optValue } });
    setOpen(false);
    setActiveIdx(-1);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggle();
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIdx(-1);
    } else if (e.key === 'ArrowDown' && open) {
      e.preventDefault();
      const idx = options.findIndex(o => o.value === value);
      const nextIdx = Math.min(idx + 1, options.length - 1);
      setActiveIdx(nextIdx);
      handleSelect(options[nextIdx].value);
    } else if (e.key === 'ArrowUp' && open) {
      e.preventDefault();
      const idx = options.findIndex(o => o.value === value);
      const prevIdx = Math.max(idx - 1, 0);
      setActiveIdx(prevIdx);
      handleSelect(options[prevIdx].value);
    }
  };

  return (
    <div className={`form-group ${className}`}>
      {label && <label htmlFor={id}>{label}</label>}
      <div className="select-wrapper" ref={wrapperRef}>
        <button
          ref={triggerRef}
          type="button"
          id={id}
          className={`select-trigger${open ? ' select-trigger--open' : ''}`}
          onClick={handleToggle}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={open ? activeOptionId : undefined}
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

        {createPortal(
          <div
            id={listboxId}
            className={`select-dropdown${open ? ' select-dropdown--open' : ''}`}
            role="listbox"
            aria-label={label}
            style={dropdownStyle}
          >
            {options.map((opt, idx) => (
              <button
                key={opt.value}
                id={`${id}-option-${opt.value}`}
                type="button"
                role="option"
                aria-selected={opt.value === value}
                className={`select-option${opt.value === value ? ' select-option--selected' : ''}`}
                onClick={() => handleSelect(opt.value)}
                onMouseEnter={() => setActiveIdx(idx)}
              >
                {opt.label}
              </button>
            ))}
          </div>,
          document.body
        )}
      </div>
    </div>
  );
}
