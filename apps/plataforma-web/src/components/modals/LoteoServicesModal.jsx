import React, { useState } from 'react';
import { Droplet, Flame, Zap, ShieldCheck, Lightbulb, Trash2, Check, Clock, X } from 'lucide-react';
import { Button, Loader } from '../../ui/components';
import '../../ui/components/Modal.css';
import './LoteoServicesModal.css';

const SERVICE_DEFS = [
  { tipo: 'water', label: 'Agua potable', Icon: Droplet },
  { tipo: 'electricity', label: 'Luz eléctrica', Icon: Zap },
  { tipo: 'gas', label: 'Gas', Icon: Flame },
  { tipo: 'lighting', label: 'Alumbrado público', Icon: Lightbulb },
  { tipo: 'security', label: 'Seguridad', Icon: ShieldCheck },
  { tipo: 'waste', label: 'Recolección de residuos', Icon: Trash2 },
];

const STATUS_OPTIONS = [
  { value: 'available', label: 'Disponible', Icon: Check },
  { value: 'in_progress', label: 'En obra', Icon: Clock },
  { value: 'unavailable', label: 'No disponible', Icon: X },
];

function servicesToState(services) {
  const state = {};
  for (const s of services || []) {
    if (s?.tipo) state[s.tipo] = s.estado || 'available';
  }
  return state;
}

export default function LoteoServicesModal({ isOpen, onClose, loteo, onSubmit, loading, error }) {
  const [state, setState] = useState(() => servicesToState(loteo?.services));
  const [openedFor, setOpenedFor] = useState(null);

  if (isOpen && loteo?.id !== openedFor) {
    setOpenedFor(loteo?.id ?? null);
    setState(servicesToState(loteo?.services));
  }

  if (!isOpen || !loteo) return null;

  const setEstado = (tipo, estado) => {
    setState((prev) => {
      if (prev[tipo] === estado) {
        const next = { ...prev };
        delete next[tipo];
        return next;
      }
      return { ...prev, [tipo]: estado };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const services = Object.entries(state).map(([tipo, estado]) => ({ tipo, estado }));
    onSubmit(services);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card--wide" onClick={e => e.stopPropagation()} aria-modal="true" role="dialog">
        <h3 className="modal-title">Servicios de "{loteo.name}"</h3>
        <form onSubmit={handleSubmit}>
          <div className="loteo-services-list">
            {SERVICE_DEFS.map((service) => {
              const { tipo, label } = service;
              const RowIcon = service.Icon;
              return (
                <div key={tipo} className="loteo-service-row">
                  <div className="loteo-service-row-icon">
                    <RowIcon size={15} />
                  </div>
                  <span className="loteo-service-row-label">{label}</span>
                  <div className="loteo-service-status-icons">
                    {STATUS_OPTIONS.map((status) => {
                      const StatusIcon = status.Icon;
                      return (
                        <button
                          key={status.value}
                          type="button"
                          className={`loteo-service-status-btn is-${status.value}${state[tipo] === status.value ? ' is-active' : ''}`}
                          onClick={() => setEstado(tipo, status.value)}
                          aria-pressed={state[tipo] === status.value}
                          aria-label={`${label}: ${status.label}`}
                          title={status.label}
                        >
                          <StatusIcon size={13} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="loteo-services-legend">
            {STATUS_OPTIONS.map(({ value, label: statusLabel }) => (
              <span key={value} className="loteo-services-legend-item">
                <span className={`loteo-services-legend-dot is-${value}`} />
                {statusLabel}
              </span>
            ))}
          </div>

          {error && <div className="status-message error">{error}</div>}

          <div className="modal-footer">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" loading={loading}>
              {loading ? <Loader size="sm" /> : 'Guardar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
