// Vista previa del visor-deptos encima del editor: un iframe a preview.html, que es el visor
// real servido por esta misma app (ver src/preview.js). Muestra lo guardado, no el estado local.
import { useEffect, useRef, useState } from 'react';
import Icon from './icons.jsx';

const DEVICES = [
  { id: 'desktop', label: 'Escritorio', icon: 'monitor' },
  { id: 'phone', label: 'Celular', icon: 'phone' },
];

/** `busy`: hay cambios guardándose; el iframe no carga hasta que terminan, si no muestra lo de antes. */
export default function VisorPreview({ buildingId, busy, onClose }) {
  const [device, setDevice] = useState('desktop');
  // Sube con "Recargar": cambiar la key del iframe lo vuelve a montar desde cero.
  const [reloads, setReloads] = useState(0);
  const [ready, setReady] = useState(!busy);
  const panel = useRef(null);

  // Una vez que se guardó todo, carga; después no vuelve a esperar (con el panel abierto
  // no se edita nada). Se ajusta en el render, como recomienda React para estado derivado.
  if (!ready && !busy) setReady(true);

  // El foco adentro del panel (clase .modal) apaga los atajos del editor (isTypingOrModal).
  useEffect(() => panel.current?.focus(), []);

  useEffect(() => {
    // Esc solo llega acá con el foco en el editor; adentro del iframe es del visor.
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Por id y no por slug: anda aunque el edificio no tenga slug o se esté por cambiar.
  const src = `${import.meta.env.BASE_URL}preview.html?edificio=${encodeURIComponent(buildingId)}`;

  return (
    <div className="modal-backdrop preview-backdrop">
      <div ref={panel} className="modal card preview-panel" role="dialog" aria-modal="true" aria-label="Vista previa del visor" tabIndex={-1}>
        <div className="preview-bar">
          <h3>Vista previa</h3>
          <div className="preview-devices" role="group" aria-label="Tamaño de pantalla">
            {DEVICES.map((d) => (
              <button
                key={d.id}
                className={`icon-btn ${device === d.id ? 'active' : ''}`}
                title={d.label}
                aria-label={d.label}
                aria-pressed={device === d.id}
                onClick={() => setDevice(d.id)}
              >
                <Icon name={d.icon} />
              </button>
            ))}
          </div>
          <span className="spacer" />
          <button className="icon-btn" title="Recargar" aria-label="Recargar" onClick={() => setReloads((n) => n + 1)}>
            <Icon name="refresh" />
          </button>
          <button className="icon-btn" title="Abrir en otra pestaña" aria-label="Abrir en otra pestaña" onClick={() => window.open(src, '_blank', 'noopener')}>
            <Icon name="external" />
          </button>
          <button className="icon-btn" title="Cerrar (Esc)" aria-label="Cerrar" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className={`preview-stage preview-stage--${device}`}>
          {ready ? (
            <iframe key={reloads} src={src} title="Visor de unidades" />
          ) : (
            <p className="muted">Esperando que terminen de guardarse los cambios…</p>
          )}
        </div>
      </div>
    </div>
  );
}
