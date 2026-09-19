// Fila de la tabla de Loteos. La sección (proyecto / sin proyecto) la marcan
// los encabezados de LoteosTable; la fila en sí es igual en ambos casos.
//
// Responsive (ver useRowActionsMode): en 'inline' las columnas Acciones/Links
// se muestran como siempre; en 'accordion' clickear la fila las reemplaza por
// un panel expandido debajo (LoteoRowActions); en 'drawer' abre un bottom
// sheet con las mismas acciones. Movida desde InventarioView.jsx en la Fase 6.

import { Fragment } from 'react';
import { PencilLine, Trash2, Eye, Droplet, ExternalLink, SquarePen } from 'lucide-react';
import { API_BASE, VISOR_URL } from '../../config';

const openVisor = (loteo) =>
  window.open(`${VISOR_URL}/?data=${API_BASE}/loteos/${loteo.id}/group_visor_data`, '_blank', 'noopener,noreferrer');

// Acciones secundarias de un loteo (imagen, blueprint, gestión), en formato
// con label. Se reutiliza en el acordeón inline (768–1379px) y en el bottom
// sheet (<768px). Visor y Editor no van acá: siempre están a la vista (columnas
// Visor/Editor, o botones de la card) — la columna compacta de solo-ícono vive en
// LoteoRow.
export function LoteoRowActions({ loteo, onEditLoteo, onDeleteLoteo, onOpenLoteoServices, onSafeOpen }) {
  return (
    <>
      {loteo.image_url && (
        <button
          type="button"
          className="text-action-btn view"
          onClick={() => onSafeOpen(loteo.image_url)}
        >
          <Eye size={16} style={{ marginRight: '6px' }} /> Ver imagen
        </button>
      )}
      {loteo.blueprint_url && (
        <button
          type="button"
          className="text-action-btn view"
          onClick={() => onSafeOpen(loteo.blueprint_url)}
        >
          <Eye size={16} style={{ marginRight: '6px' }} /> Ver blueprint
        </button>
      )}
      <button className="action-btn edit labeled" onClick={() => onEditLoteo(loteo)}>
        <PencilLine size={16} /> Editar
      </button>
      <button
        className={`action-btn services labeled${loteo.services?.length ? ' active' : ''}`}
        onClick={() => onOpenLoteoServices(loteo)}
      >
        <Droplet size={16} /> Servicios
      </button>
      <button className="action-btn delete labeled" onClick={() => onDeleteLoteo(loteo)}>
        <Trash2 size={16} /> Eliminar
      </button>
    </>
  );
}

export default function LoteoRow({ row, mode, isExpanded, onToggleExpand, onOpenSheet, onEditLoteo, onDeleteLoteo, onOpenLoteoServices, onSafeOpen, onOpenEditor }) {
  const { loteo } = row;
  const rowClass = [];
  if (mode !== 'inline') rowClass.push('row-clickable');

  const handleRowClick = (e) => {
    if (mode === 'inline') return;
    if (e.target.closest('button, a')) return;
    if (mode === 'drawer') {
      onOpenSheet();
      return;
    }
    onToggleExpand();
  };

  // <768px ("drawer"): la fila pasa a ser una card apilada — ver nota en
  // table.css sobre `.td-card`/`.row-card`. Nombre y los accesos a Visor y
  // Editor quedan a la vista; el resto de las acciones (imagen, blueprint,
  // editar, servicios, eliminar) vive en el sheet (LoteoRowActions).
  if (mode === 'drawer') {
    return (
      <tr className={rowClass.join(' ')} onClick={handleRowClick}>
        <td colSpan={7} className="td-card">
          <div className="row-card">
            <div className="row-card-head">
              <span className="row-card-title">{loteo.name}</span>
            </div>
            <div className="row-card-cta">
              <button
                type="button"
                className="row-card-cta-btn visor"
                onClick={() => openVisor(loteo)}
              >
                <ExternalLink size={15} /> Abrir visor
              </button>
              <button
                type="button"
                className="row-card-cta-btn"
                onClick={() => onOpenEditor(loteo.id)}
              >
                <SquarePen size={15} /> Abrir editor
              </button>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <Fragment>
    <tr className={rowClass.join(' ')} onClick={handleRowClick}>
      <td className="td-name">{loteo.name}</td>
      <td className="td-secondary">
        {loteo.image_url ? (
          <button
            type="button"
            className="text-action-btn view"
            onClick={() => onSafeOpen(loteo.image_url)}
            title="Ver imagen"
            aria-label="Ver imagen"
          >
            <Eye size={16} style={{ marginRight: '6px' }} /> Ver
          </button>
        ) : (
          <span className="td-empty">—</span>
        )}
      </td>
      <td className="td-secondary">
        {loteo.blueprint_url ? (
          <button
            type="button"
            className="text-action-btn view"
            onClick={() => onSafeOpen(loteo.blueprint_url)}
            title="Ver blueprint"
            aria-label="Ver blueprint"
          >
            <Eye size={16} style={{ marginRight: '6px' }} /> Ver
          </button>
        ) : (
          <span className="td-empty">—</span>
        )}
      </td>
      <td className="td-actions">
        <div className="loteo-link-actions">
          <button
            className="action-btn edit"
            onClick={() => onEditLoteo(loteo)}
            title="Editar"
            aria-label={`Editar ${loteo.name}`}
          >
            <PencilLine size={16} />
          </button>
          <button
            className={`action-btn services${loteo.services?.length ? ' active' : ''}`}
            onClick={() => onOpenLoteoServices(loteo)}
            title="Servicios"
            aria-label={`Servicios de ${loteo.name}`}
          >
            <Droplet size={16} />
          </button>
          <button
            className="action-btn delete"
            onClick={() => onDeleteLoteo(loteo)}
            title="Eliminar"
            aria-label={`Eliminar ${loteo.name}`}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </td>
      <td className="td-links">
        <div className="loteo-link-actions">
          <button
            type="button"
            className="text-action-btn view"
            onClick={() => openVisor(loteo)}
            title="Abrir visor"
            aria-label={`Abrir visor de ${loteo.name}`}
          >
            Visor
          </button>
          <button
            type="button"
            className="text-action-btn view"
            onClick={() => onOpenEditor(loteo.id)}
            title="Abrir editor"
            aria-label={`Abrir editor de ${loteo.name}`}
          >
            Editor
          </button>
        </div>
      </td>
      <td className="td-tablet-link">
        <button
          type="button"
          className="text-action-btn view"
          onClick={() => openVisor(loteo)}
          title="Abrir visor"
          aria-label={`Abrir visor de ${loteo.name}`}
        >
          <ExternalLink size={16} style={{ marginRight: '6px' }} /> Abrir
        </button>
      </td>
      <td className="td-tablet-link">
        <button
          type="button"
          className="text-action-btn view"
          onClick={() => onOpenEditor(loteo.id)}
          title="Abrir editor"
          aria-label={`Abrir editor de ${loteo.name}`}
        >
          <SquarePen size={16} style={{ marginRight: '6px' }} /> Abrir
        </button>
      </td>
    </tr>
    {mode === 'accordion' && (
      <tr className="row-actions-expand">
        <td colSpan={7}>
          <div className="row-actions-drawer" data-open={isExpanded}>
            <div className="row-actions-drawer-inner">
              <div className="row-actions-drawer-content">
                <div className="row-actions-expand-inner">
                  <LoteoRowActions
                    loteo={loteo}
                    onEditLoteo={onEditLoteo}
                    onDeleteLoteo={onDeleteLoteo}
                    onOpenLoteoServices={onOpenLoteoServices}
                    onSafeOpen={onSafeOpen}
                  />
                </div>
              </div>
            </div>
          </div>
        </td>
      </tr>
    )}
    </Fragment>
  );
}
