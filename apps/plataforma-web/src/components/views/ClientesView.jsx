import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { SlidersHorizontal, Pencil, Trash2, RotateCw, MessageCircle, X } from 'lucide-react';
import { Button, Loader, Select, ErrorBoundary } from '../../ui/components';
import CategoryPieChart from '../CategoryPieChart';
import { CATEGORY_DISPLAY, formatDate } from '../../constants';

function ProspectosFilters({
  categoryFilter,
  onCategoryChange,
  withoutAdvisor,
  onWithoutAdvisorChange,
  onOpenAddProspect,
  loading,
}) {
  return (
    <div className="inventory-controls">
      <div className="inventory-filters">
        <SlidersHorizontal size={16} className="filter-icon" />
        <Select
          id="prospects-category-filter"
          value={categoryFilter}
          onChange={e => onCategoryChange(e.target.value)}
          options={[
            { value: '', label: 'Categoría: Todas' },
            ...Object.entries(CATEGORY_DISPLAY).map(([val, label]) => ({
              value: val,
              label,
            })),
          ]}
        />
        <label className="filter-toggle" htmlFor="filter-no-advisor">
          <input
            id="filter-no-advisor"
            type="checkbox"
            checked={withoutAdvisor}
            onChange={e => onWithoutAdvisorChange(e.target.checked)}
          />
          Sin asesor
        </label>
      </div>
      <Button size="sm" onClick={onOpenAddProspect}>
        + Nuevo Prospecto
      </Button>
      {loading && <Loader size="sm" />}
    </div>
  );
}

function CommentTooltip({ observation, prospectName }) {
  const [isOpen, setIsOpen] = useState(false);
  const [positionBottom, setPositionBottom] = useState(false);
  const [coords, setCoords] = useState({});
  const tooltipRef = useRef(null);
  const triggerRef = useRef(null);
  const hasObservation = observation && observation.trim().length > 0;

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
          bottom: 'auto'
        });
      } else {
        setCoords({
          bottom: window.innerHeight - triggerRect.top + 8,
          right: window.innerWidth - triggerRect.right,
          top: 'auto'
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
      if (tooltipRef.current && !tooltipRef.current.contains(e.target) &&
          triggerRef.current && !triggerRef.current.contains(e.target)) {
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

  const tooltipElement = isOpen && hasObservation ? (
    <div 
      ref={tooltipRef} 
      className={`comment-tooltip-content ${positionBottom ? 'bottom' : ''}`}
      style={{
        position: 'fixed',
        margin: 0,
        ...coords
      }}
    >
      <div className="comment-tooltip-header">
        <span className="comment-tooltip-title">Observaciones</span>
        <button
          className="comment-tooltip-close"
          onClick={() => setIsOpen(false)}
          aria-label="Cerrar"
        >
          <X size={14} />
        </button>
      </div>
      <p className="comment-tooltip-text">{observation}</p>
    </div>
  ) : null;

  return (
    <div className="comment-tooltip-wrapper">
      <button
        ref={triggerRef}
        className={`comment-tooltip-trigger ${hasObservation ? 'has-comment' : 'empty'}`}
        onClick={() => setIsOpen(!isOpen)}
        title={hasObservation ? `Ver observaciones de ${prospectName}` : 'Sin observaciones'}
        aria-label={hasObservation ? `Ver observaciones de ${prospectName}` : 'Sin observaciones'}
        aria-expanded={isOpen}
        disabled={!hasObservation}
      >
        <MessageCircle size={16} />
      </button>
      {tooltipElement && createPortal(tooltipElement, document.body)}
    </div>
  );
}

function ProspectosTable({ prospectos, filteredProspectos, loadingMore, hasMore, onLoadMore, onEditProspect, onDeleteProspect, onUpdateContact }) {
  const data = filteredProspectos ?? prospectos;
  return (
    <div className="inventory-table-wrapper">
      <table className="inventory-table">
        <caption className="sr-only">Lista de prospectos</caption>
        <thead>
          <tr>
            <th scope="col">Nombre</th>
            <th scope="col">Email</th>
            <th scope="col">Teléfono</th>
            <th scope="col">Categoría</th>
            <th scope="col">Último Contacto</th>
            <th scope="col">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={6} className="td-empty-row">No se encontraron prospectos.</td>
            </tr>
          ) : (
            data.map(p => (
              <tr key={p.id}>
                <td className="td-name">{p.name}</td>
                <td className="td-muted">{p.email || '—'}</td>
                <td className="td-muted">{p.phone || '—'}</td>
                <td>
                  <span className={`badge category-${p.category}`}>
                    {CATEGORY_DISPLAY[p.category] ?? p.category?.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="td-muted">
                  <div className="last-contact-cell">
                    <span>{formatDate(p.last_contact)}</span>
                    <CommentTooltip observation={p.observation_notes} prospectName={p.name} />
                  </div>
                </td>
                <td className="td-actions">
                  <button
                    className="action-btn update"
                    onClick={() => onUpdateContact(p.id)}
                    title="Actualizar Contacto"
                    aria-label={`Actualizar contacto ${p.name}`}
                  >
                    <RotateCw size={16} />
                  </button>
                  <button
                    className="action-btn edit"
                    onClick={() => onEditProspect(p)}
                    title="Editar"
                    aria-label={`Editar ${p.name}`}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="action-btn delete"
                    onClick={() => onDeleteProspect(p)}
                    title="Eliminar"
                    aria-label={`Eliminar ${p.name}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {hasMore && (
        <div className="load-more-row">
          <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? <Loader size="sm" /> : 'Cargar más prospectos'}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function ClientesView({
  allProspectosList,
  prospectosList,
  filteredProspectos,
  prospectosLoading,
  prospectosLoadingMore,
  prospectosHasMore,
  prospectosCategoryFilter,
  onCategoryChange,
  prospectosWithoutAdvisor,
  onWithoutAdvisorChange,
  onOpenAddProspect,
  onEditProspect,
  onDeleteProspect,
  onLoadMore,
  onUpdateContact,
}) {
  return (
    <ErrorBoundary label="Error al cargar prospectos">
      <div className="charts-row">
        <CategoryPieChart prospects={allProspectosList} />
      </div>
      <div className="inventory-section">
        <ProspectosFilters
          categoryFilter={prospectosCategoryFilter}
          onCategoryChange={onCategoryChange}
          withoutAdvisor={prospectosWithoutAdvisor}
          onWithoutAdvisorChange={onWithoutAdvisorChange}
          onOpenAddProspect={onOpenAddProspect}
          loading={prospectosLoading}
        />
        <ProspectosTable
          prospectos={prospectosList}
          filteredProspectos={filteredProspectos}
          loadingMore={prospectosLoadingMore}
          hasMore={prospectosHasMore}
          onLoadMore={onLoadMore}
          onEditProspect={onEditProspect}
          onDeleteProspect={onDeleteProspect}
          onUpdateContact={onUpdateContact}
        />
      </div>
    </ErrorBoundary>
  );
}
