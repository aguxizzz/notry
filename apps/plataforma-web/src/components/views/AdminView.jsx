import React from 'react';
import { Button, Loader } from '../../ui/components';
import { Badge } from '../../ui/components';
import { API_BASE, VISOR_URL } from '../../config';
import './AdminView.css';

export default function AdminView({
  lots,
  loteos,
  selectedLot,
  loading,
  adminSubView,
  onSelectLot,
  onFetchLots,
  onFetchLoteos,
  copyToClipboard,
}) {
  return (
    <div className="admin-layout">
      <div className="side-panel">
        {adminSubView === 'lotes' ? (
          <div className="details-card">
            <h3>Detalles del Lote</h3>
            {selectedLot ? (
              <div className="lot-details">
                <div className="detail-row">
                  <label>ID</label>
                  <div className="id-cell">
                    <span>{selectedLot.id.substring(0, 12)}...</span>
                    <button
                      onClick={() => copyToClipboard(selectedLot.id)}
                      className="copy-btn-inline"
                      aria-label="Copiar ID del lote"
                    >
                      📋
                    </button>
                  </div>
                </div>
                <div className="detail-row">
                  <label>Nombre</label>
                  <p>{selectedLot.name}</p>
                </div>
                <div className="detail-row">
                  <label>Slug</label>
                  <p>{selectedLot.slug}</p>
                </div>
                <div className="detail-row">
                  <label>Estado</label>
                  <Badge value={selectedLot.status} />
                </div>
                <div className="detail-row">
                  <label>Área</label>
                  <p>{selectedLot.area_m2 ? `${selectedLot.area_m2} m²` : '-'}</p>
                </div>
                <div className="detail-row">
                  <label>Precio</label>
                  <p className="price-tag">{selectedLot.price ? `$${selectedLot.price}` : '-'}</p>
                </div>
              </div>
            ) : (
              <p className="placeholder-text">Selecciona un lote para ver los detalles</p>
            )}
          </div>
        ) : (
          <div className="loteos-view">
            <h3>Gestión de Loteos</h3>
            <div className="loteos-container">
              {loteos?.map(loteo => (
                <div key={loteo.id} className="loteo-item">
                  <div className="loteo-info">
                    <h4>{loteo.name}</h4>
                    <span>{loteo.id.substring(0, 8)}...</span>
                  </div>
                  <Button
                    as="a"
                    size="sm"
                    className="visor-link"
                    href={`${VISOR_URL}/?data=${API_BASE}/loteos/${loteo.id}/visor_data`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    👁️ Visor
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="side-nav-footer">
          <Button
            onClick={adminSubView === 'loteos' ? onFetchLots : onFetchLoteos}
            size="sm"
          >
            {adminSubView === 'loteos' ? 'Volver a Lotes' : 'Listar Loteos'}
          </Button>
        </div>
      </div>

      <div className="list-panel">
        <header className="panel-header">
          <h2>{adminSubView === 'lotes' ? 'Todos los Lotes' : 'Loteos Disponibles'}</h2>
          {loading && <Loader size="sm" />}
        </header>

        <div className="scroll-area">
          {adminSubView === 'lotes' ? (
            <div className="selectable-list">
              {lots?.map(lot => (
                <div
                  key={lot.id}
                  className={`list-item ${selectedLot?.id === lot.id ? 'selected' : ''}`}
                  onClick={() => onSelectLot(lot)}
                >
                  <div className="item-main">
                    <span className="item-name">{lot.name}</span>
                    <span className="item-slug">{lot.slug}</span>
                  </div>
                  <Badge value={lot.status} />
                </div>
              ))}
            </div>
          ) : (
            <p className="info-text">Administra tus loteos desde el panel izquierdo.</p>
          )}
        </div>
      </div>
    </div>
  );
}
