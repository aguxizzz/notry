import React, { useEffect } from 'react';
import { Search, SlidersHorizontal, Pencil, Trash2, RotateCw, BookUser } from 'lucide-react';
import { Button, Select, ErrorBoundary, CommentTooltip } from '../../ui/components';
import CategoryPieChart from '../CategoryPieChart';
import NeglectedProspectsPanel from '../NeglectedProspectsPanel';
import { CATEGORY_DISPLAY, ORIGIN_DISPLAY, formatDate } from '../../constants';
import './ClientesView.css';

function ProspectosFilters({
  search,
  onSearchChange,
  categoryFilter,
  onCategoryChange,
  withoutAdvisor,
  onWithoutAdvisorChange,
  onOpenAddProspect,
}) {
  return (
    <div className="inventory-controls">
      <div className="inventory-search">
        <Search size={16} className="search-icon" />
        <input
          type="text"
          placeholder="Buscar por nombre o email..."
          className="search-input"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
        />
      </div>
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
    </div>
  );
}

function ProspectosTable({ prospectos, filteredProspectos, onEditProspect, onDeleteProspect, onUpdateContact, highlightedProspectId }) {
  const data = filteredProspectos ?? prospectos;

  useEffect(() => {
    if (!highlightedProspectId) return;
    const el = document.getElementById(`prospect-row-${highlightedProspectId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('row-highlight');
    const t = setTimeout(() => el.classList.remove('row-highlight'), 1800);
    return () => clearTimeout(t);
  }, [highlightedProspectId]);

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
            <th scope="col">Origen</th>
            <th scope="col">Último Contacto</th>
            <th scope="col">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={7} className="td-empty-row">No se encontraron prospectos.</td>
            </tr>
          ) : (
            data.map(p => (
              <tr key={p.id} id={`prospect-row-${p.id}`}>
                <td className="td-name">{p.name}</td>
                <td className="td-muted">{p.email || '—'}</td>
                <td className="td-muted">{p.phone || '—'}</td>
                <td>
                  <span className={`badge category-${p.category}`}>
                    {CATEGORY_DISPLAY[p.category] ?? p.category?.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="td-muted">
                  {ORIGIN_DISPLAY[p.origin] ?? '—'}
                </td>
                <td className="td-muted">
                  <div className="last-contact-cell">
                    <span>{formatDate(p.last_contact)}</span>
                    <CommentTooltip content={p.observation_notes} label="Observaciones" entityName={p.name} />
                  </div>
                </td>
                <td className="td-actions">
                  <button
                    className="action-btn update"
                    onClick={() => onUpdateContact(p.id, p.name)}
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
    </div>
  );
}

export default function ClientesView({
  allProspectosList,
  filteredProspectos,
  prospectosSearch,
  onSearchChange,
  prospectosCategoryFilter,
  onCategoryChange,
  prospectosWithoutAdvisor,
  onWithoutAdvisorChange,
  onOpenAddProspect,
  onEditProspect,
  onDeleteProspect,
  onUpdateContact,
  highlightedProspectId,
}) {
  return (
    <ErrorBoundary label="Error al cargar prospectos">
      <div className="charts-row">
        <CategoryPieChart prospects={allProspectosList} />
        <NeglectedProspectsPanel prospects={allProspectosList} />
      </div>
      <div className="inventory-section">
        <div className="clients-table-header has-deco-icon">
          <BookUser className="section-deco-icon clients-table-icon" size={72} aria-hidden="true" />
          <div className="chart-heading">
            <div className="stats-header-eyebrow">Directorio</div>
            <h2 className="chart-title">Clientes</h2>
            <p className="chart-subtitle">Gestiona contactos, etapa y último seguimiento</p>
          </div>
        </div>
        <ProspectosFilters
          search={prospectosSearch}
          onSearchChange={onSearchChange}
          categoryFilter={prospectosCategoryFilter}
          onCategoryChange={onCategoryChange}
          withoutAdvisor={prospectosWithoutAdvisor}
          onWithoutAdvisorChange={onWithoutAdvisorChange}
          onOpenAddProspect={onOpenAddProspect}
        />
        <ProspectosTable
          prospectos={allProspectosList}
          filteredProspectos={filteredProspectos}
          onEditProspect={onEditProspect}
          onDeleteProspect={onDeleteProspect}
          onUpdateContact={onUpdateContact}
          highlightedProspectId={highlightedProspectId}
        />
      </div>
    </ErrorBoundary>
  );
}
