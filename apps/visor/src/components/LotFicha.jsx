import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { PrecalificacionForm, PrecalificacionOverlay } from './Precalificacion.jsx';
import { formatPrice, getSubmittedLotsSet, markLotAsSubmitted, STATUS_LABEL } from '../lotFormat.js';
import { hasServices } from '../serviceDefs.js';
import { I } from '../icons/uiIcons.js';
import { annId, lotStatus, lotArea, fmtArea, lotManzana, lotMedidas } from '../lotData.js';
import { Ico, IconWhatsApp, WhatsAppLink, LotNum, LotRow, ServicesList } from './LotUi.jsx';

function shareUrl(ann) {
  const url = new URL(window.location.href);
  url.searchParams.set('lote', ann.slug || annId(ann));
  return url.toString();
}

function Gallery({ images, title }) {
  const [index, setIndex] = useState(0);
  if (!images.length) return null;
  const i = Math.min(index, images.length - 1);
  return (
    <div className="lp-gallery">
      <img src={images[i]} alt={`${title} - imagen ${i + 1}`} draggable={false} />
      {images.length > 1 && (
        <div className="lp-gallery-dots">
          {images.map((_, k) => (
            <button key={k} type="button" aria-label={`Ver imagen ${k + 1}`} aria-current={k === i} onClick={() => setIndex(k)} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Ficha del lote abierto. Las props salen de useLotUi (`fichaProps`) más cómo
 * volver (`onBack`, `backLabel`) y, en celular, `onClose`. Se monta con
 * `key` del lote: cada lote arranca con su estado limpio.
 */
export function LotFicha({ ann, browser, services, contact, showPrice, onSelect, onHover, form, onBack, backLabel, onClose }) {
  const { labelOf, visibleLots, lots: allLots, filtersActive, clearFilters } = browser;
  const { whatsappPhone, hideContactForm, origin, loteoId, showcase } = contact;
  const { showForm, setShowForm, submitStatus, setSubmitStatus, resetForm } = form;
  const [copied, setCopied] = useState(false);
  const [submittedLots, setSubmittedLots] = useState(getSubmittedLotsSet);
  const id = annId(ann);
  const label = labelOf(ann);
  const status = lotStatus(ann);
  const area = lotArea(ann);
  const manzana = lotManzana(ann);
  const medidas = lotMedidas(ann);
  const images = Array.isArray(ann.image_urls) ? ann.image_urls : [];
  const title = ann.tooltip || label;
  const submittedKey = `${loteoId}:${id}`;
  const alreadySubmitted = submittedLots.has(submittedKey);

  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(false), 2200);
    return () => clearTimeout(t);
  }, [copied]);

  const i = visibleLots.findIndex((l) => annId(l) === id);
  const hasNav = i !== -1 && visibleLots.length > 1;
  // El lote se puede abrir igual desde el mapa aunque el filtro lo deje afuera.
  const outOfFilter = filtersActive && i === -1;
  const prev = hasNav ? visibleLots[(i - 1 + visibleLots.length) % visibleLots.length] : null;
  const next = hasNav ? visibleLots[(i + 1) % visibleLots.length] : null;

  const similar = useMemo(() => {
    if (status === 'available') return [];
    return allLots
      .filter((l) => lotStatus(l) === 'available' && annId(l) !== id)
      .sort((a, b) => Math.abs((lotArea(a) ?? 0) - (area ?? 0)) - Math.abs((lotArea(b) ?? 0) - (area ?? 0)))
      .slice(0, 3);
  }, [allLots, id, status, area]);

  const share = async () => {
    try { await navigator.clipboard.writeText(shareUrl(ann)); } catch (_) { /* sin permiso de portapapeles */ }
    setCopied(true);
  };

  const waTrack = { type: 'lote', id };
  const specs = [
    area != null && ['Superficie', fmtArea(area)],
    medidas && ['Medidas', medidas],
    ann.orientation && ['Orientación', ann.orientation],
    ['Precio', showPrice && ann.price ? formatPrice(ann.price) : null],
  ].filter(Boolean);

  return (
    <article className="lp-ficha" aria-labelledby="lp-ficha-title">
      <button type="button" className="lp-ficha-back" onClick={onBack}><Ico d={I.prev} />{backLabel}</button>
      <header className="lp-ficha-head">
        <LotNum label={label} status={status} large />
        <div className="lp-ficha-title">
          {manzana && <small>Manzana {manzana}</small>}
          <h2 id="lp-ficha-title">{title}</h2>
        </div>
        <div className="lp-ficha-tools">
          <button type="button" className="lp-icon-btn" onClick={share} aria-label="Copiar link del lote" title="Copiar link del lote"><Ico d={I.share} /></button>
          {onClose && <button type="button" className="lp-icon-btn" onClick={onClose} aria-label="Cerrar ficha" title="Cerrar"><Ico d={I.close} /></button>}
        </div>
      </header>
      {copied && createPortal(
        <div className="lp-toast" role="status"><Ico d={I.check} />Link del lote copiado</div>,
        document.body,
      )}
      <span className={`lp-st-pill s-${status}`}><i className={`lp-dot s-${status}`} />{STATUS_LABEL[status]}</span>

      {outOfFilter && (
        <p className="lp-off-filter" role="status">
          No coincide con tu filtro · <button type="button" className="lp-link" onClick={clearFilters}>Quitar filtro</button>
        </p>
      )}

      <Gallery images={images} title={title} />

      <dl className="lp-ficha-grid">
        {specs.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd className={v ? undefined : 'lp-muted'}>{v ?? 'A consultar'}</dd></div>
        ))}
      </dl>

      {ann.comments && (
        <div className="lp-comments">
          <span>Detalles del lote</span>
          <p>{ann.comments}</p>
        </div>
      )}

      {status === 'available' ? (
        <div className="lp-ficha-cta">
          {!hideContactForm && (alreadySubmitted ? (
            <p className="lp-note lp-note--ok">Ya enviaste una solicitud para este lote. Te vamos a contactar a la brevedad.</p>
          ) : showForm ? (
            <PrecalificacionForm
              lotDetail={{ title, markerId: id, estado: status }}
              origin={origin}
              loteoId={loteoId}
              onClose={resetForm}
              submitStatus={submitStatus}
              setSubmitStatus={setSubmitStatus}
              onSubmitted={() => {
                markLotAsSubmitted(submittedKey);
                setSubmittedLots((prevSet) => new Set(prevSet).add(submittedKey));
              }}
              showcase={showcase}
            />
          ) : (
            <button type="button" className="lp-btn lp-btn--primary lp-btn--block" onClick={() => setShowForm(true)}>Quiero info de este lote</button>
          ))}
          {whatsappPhone && (
            <WhatsAppLink
              className="lp-btn lp-btn--wa lp-btn--block"
              phone={whatsappPhone}
              text={`Hola, me interesa el ${title}. ${shareUrl(ann)}`}
              loteoId={loteoId}
              track={waTrack}
            >
              <IconWhatsApp />Consultar por WhatsApp
            </WhatsAppLink>
          )}
        </div>
      ) : (
        <div className="lp-ficha-alt">
          <p className="lp-alt-note">
            Este lote está <b>{STATUS_LABEL[status].toLowerCase()}</b>.
            {similar.length > 0 && ' Estos son parecidos y están disponibles:'}
          </p>
          {similar.length > 0 && (
            <div className="lp-lot-list lp-lot-list--compact">
              {similar.map((l) => (
                <LotRow key={annId(l)} ann={l} label={labelOf(l)} selected={false} onSelect={onSelect} onHover={onHover} />
              ))}
            </div>
          )}
          {whatsappPhone && (
            <WhatsAppLink
              className="lp-btn lp-btn--ghost lp-btn--block"
              phone={whatsappPhone}
              text={`Hola, quiero que me avisen si se libera el ${title}. ${shareUrl(ann)}`}
              loteoId={loteoId}
              track={waTrack}
            >
              <Ico d={I.bell} />Avisame si se libera
            </WhatsAppLink>
          )}
        </div>
      )}

      {hasServices(services) && (
        <section className="lp-ficha-more">
          <h3 className="lp-sub">Servicios del loteo</h3>
          <ServicesList services={services} />
        </section>
      )}

      {hasNav && (
        <nav className="lp-ficha-nav" aria-label="Otros lotes">
          <button type="button" onClick={() => onSelect(annId(prev))}><Ico d={I.prev} />{prev.tooltip || labelOf(prev)}</button>
          <span>{i + 1} de {visibleLots.length}</span>
          <button type="button" onClick={() => onSelect(annId(next))}>{next.tooltip || labelOf(next)}<Ico d={I.next} /></button>
        </nav>
      )}
    </article>
  );
}

// Carga / éxito / error del envío, encima de la ficha.
export function LotFormOverlay({ form }) {
  return (
    <PrecalificacionOverlay
      submitStatus={form.submitStatus}
      setSubmitStatus={form.setSubmitStatus}
      onClose={form.resetForm}
    />
  );
}
