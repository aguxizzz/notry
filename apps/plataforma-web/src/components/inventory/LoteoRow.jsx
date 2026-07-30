// Fila de la tabla de Loteos. Soporta 2 variantes:
// - 'standalone': loteo suelto
// - 'group': loteo agrupado bajo un general (con badge de rol + conector tipo árbol)
//
// Stateless. Movida desde InventarioView.jsx en la Fase 6.

import { PencilLine, Trash2, Eye, Share2, Layers } from 'lucide-react';
import { API_BASE, VISOR_URL } from '../../config';

export default function LoteoRow({ row, onEditLoteo, onDeleteLoteo, onGroupLoteo, onSafeOpen, onOpenEditor, onOpenShareLoteo }) {
  const { loteo, variant, role, isFirst, isLast, groupHasGeneral } = row;
  const rowClass = [];
  if (variant === 'group') {
    rowClass.push('loteo-group-row');
    if (isFirst) rowClass.push('loteo-group-first');
    if (isLast) rowClass.push('loteo-group-last');
    rowClass.push(role === 'general' ? 'loteo-group-general' : 'loteo-group-etapa');
  }
  const isGrouped = !!loteo.grupo_id;

  return (
    <tr className={rowClass.join(' ')}>
      <td className="td-name">
        {variant === 'group' ? (
          <span className={`loteo-name-cell role-${role}${role === 'etapa' && !groupHasGeneral ? ' no-indent' : ''}`}>
            {role === 'etapa' && groupHasGeneral && <span className="loteo-tree-connector" aria-hidden="true" />}
            <span className="loteo-name-text">{loteo.name}</span>
            <span className={`loteo-role-badge ${role}`}>{role === 'general' ? 'General' : 'Etapa'}</span>
          </span>
        ) : (
          loteo.name
        )}
      </td>
      <td>
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
      <td>
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
            className={`action-btn group${isGrouped ? ' active' : ''}`}
            onClick={() => onGroupLoteo(loteo)}
            title={isGrouped ? 'Editar grupo' : 'Agrupar'}
            aria-label={`Agrupar ${loteo.name}`}
          >
            <Layers size={16} />
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
            onClick={() => window.open(`${VISOR_URL}/?data=${API_BASE}/loteos/${loteo.id}/group_visor_data`, '_blank', 'noopener,noreferrer')}
            title="Abrir visor"
            aria-label={`Abrir visor de ${loteo.name}`}
          >
            Visor
          </button>
          <button
            type="button"
            className="text-action-btn view"
            onClick={() => onOpenShareLoteo(loteo.id)}
            title="Copiar enlace compartible"
            aria-label={`Copiar enlace de ${loteo.name}`}
          >
            <Share2 size={16} style={{ marginRight: '6px' }} /> Compartir
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
    </tr>
  );
}