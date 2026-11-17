import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle, X } from 'lucide-react';

// `preview`: el disparador muestra el comienzo del texto (una línea) en vez
// del ícono solo, y sin contenido se muestra "—" en vez de un ícono apagado.
// `children`: el propio contenido pasado es el disparador (ej. la fecha de
// último contacto); sin comentario se renderiza como texto común.
export default function CommentTooltip({ content, label, entityName, preview = false, children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [positionBottom, setPositionBottom] = useState(false);
  const [coords, setCoords] = useState({});
  const tooltipRef = useRef(null);
  const triggerRef = useRef(null);
  const hasContent = content && content.trim().length > 0;

  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const checkPosition = () => {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipHeight = tooltipRef.current ? tooltipRef.current.offsetHeight : 150;
      const spaceAbove = triggerRect.top;
      const spaceBelow = window.innerHeight - triggerRect.bottom;
      const threshold = 16;

      const isBottom = spaceAbove < tooltipHeight + threshold && spaceBelow > tooltipHeight + threshold;
      setPositionBottom(isBottom);

      if (isBottom) {
        setCoords({
          top: triggerRect.bottom + 8,
          right: window.innerWidth - triggerRect.right,
          bottom: 'auto',
        });
      } else {
        setCoords({
          bottom: window.innerHeight - triggerRect.top + 8,
          right: window.innerWidth - triggerRect.right,
          top: 'auto',
        });
      }
    };

    checkPosition();
    const timeout = setTimeout(checkPosition, 0);

    window.addEventListener('scroll', checkPosition, true);
    window.addEventListener('resize', checkPosition);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener('scroll', checkPosition, true);
      window.removeEventListener('resize', checkPosition);
    };
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        tooltipRef.current && !tooltipRef.current.contains(e.target) &&
        triggerRef.current && !triggerRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const tooltipElement = isOpen && hasContent ? (
    <div
      ref={tooltipRef}
      className={`comment-tooltip-content ${positionBottom ? 'bottom' : ''}`}
      style={{ position: 'fixed', margin: 0, ...coords }}
    >
      <div className="comment-tooltip-header">
        <span className="comment-tooltip-title">{label}</span>
        <button
          className="comment-tooltip-close"
          onClick={() => setIsOpen(false)}
          aria-label="Cerrar"
        >
          <X size={14} />
        </button>
      </div>
      <p className="comment-tooltip-text">{content}</p>
    </div>
  ) : null;

  if (children !== undefined) {
    if (!hasContent) return children;
    return (
      <span className="comment-tooltip-wrapper">
        <button
          ref={triggerRef}
          type="button"
          className="comment-tooltip-inline"
          onClick={() => setIsOpen(!isOpen)}
          title={`Ver ${label.toLowerCase()} de ${entityName}`}
          aria-expanded={isOpen}
        >
          {children}
        </button>
        {tooltipElement && createPortal(tooltipElement, document.body)}
      </span>
    );
  }

  if (preview && !hasContent) return <span className="td-empty">—</span>;

  if (preview) {
    return (
      <div className="comment-tooltip-wrapper comment-tooltip-wrapper--preview">
        <button
          ref={triggerRef}
          className="comment-tooltip-preview"
          onClick={() => setIsOpen(!isOpen)}
          title={`Ver ${label.toLowerCase()} de ${entityName}`}
          aria-expanded={isOpen}
        >
          <MessageCircle size={14} aria-hidden="true" />
          <span className="comment-tooltip-preview-text">{content.trim()}</span>
        </button>
        {tooltipElement && createPortal(tooltipElement, document.body)}
      </div>
    );
  }

  return (
    <div className="comment-tooltip-wrapper">
      <button
        ref={triggerRef}
        className={`comment-tooltip-trigger ${hasContent ? 'has-comment' : 'empty'}`}
        onClick={() => setIsOpen(!isOpen)}
        title={hasContent ? `Ver ${label.toLowerCase()} de ${entityName}` : `Sin ${label.toLowerCase()}`}
        aria-label={hasContent ? `Ver ${label.toLowerCase()} de ${entityName}` : `Sin ${label.toLowerCase()}`}
        aria-expanded={isOpen}
        disabled={!hasContent}
      >
        <MessageCircle size={16} />
      </button>
      {tooltipElement && createPortal(tooltipElement, document.body)}
    </div>
  );
}
