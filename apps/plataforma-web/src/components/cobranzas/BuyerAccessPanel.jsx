import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, ExternalLink, KeyRound, Link2, LoaderCircle, Mail, Pencil, ShieldCheck, X } from 'lucide-react';
import { Button } from '../../ui/components';
import {
  buildBuyerInvitationUrl,
  buildBuyerPortalLoginUrl,
  createBuyerInvitation,
  fetchBuyerContractAccess,
  revokeBuyerInvitation,
} from '../../api/buyerInvitations';
import '../../ui/components/Modal.css';
import './BuyerAccessPanel.css';

function dateTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function BuyerAccessPanel({ isOpen, onClose, apiFetch, contract, lot, prospect, onAddBuyerEmail }) {
  const [access, setAccess] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [newInvitation, setNewInvitation] = useState(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const closeButtonRef = useRef(null);

  const load = useCallback(async () => {
    if (!contract?.id) return;
    setLoading(true);
    setError('');
    try {
      setAccess(await fetchBuyerContractAccess(apiFetch, contract.id));
    } catch (loadError) {
      setError(loadError.message || 'No pudimos consultar el acceso del comprador.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, contract?.id]);

  useEffect(() => {
    if (!isOpen) return undefined;
    setAccess(null);
    setError('');
    setNewInvitation(null);
    setConfirmRevoke(false);
    void load();
    closeButtonRef.current?.focus();
    return undefined;
  }, [isOpen, load]);

  if (!isOpen) return null;

  const invitation = access?.latest_invitation;
  const hasActiveAccess = (access?.active_accesses?.length || 0) > 0;
  const inviteUrl = newInvitation ? buildBuyerInvitationUrl(newInvitation.token) : '';
  const buyerPortalLoginUrl = buildBuyerPortalLoginUrl();
  // El backend devuelve este mensaje cuando el email del prospecto coincide con
  // el de una cuenta interna (admin/agente): la única salida es editar el email
  // del prospecto, igual que cuando no tiene uno cargado.
  const emailBelongsToInternalAccount = /cuenta interna/i.test(error);

  const copyInvitation = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('No pudimos copiar el enlace. Copialo manualmente antes de cerrar este panel.');
    }
  };

  const createInvitation = async () => {
    setCreating(true);
    setError('');
    try {
      const created = await createBuyerInvitation(apiFetch, contract.id);
      if (created.already_active) {
        setNewInvitation(null);
      } else {
        setNewInvitation(created);
      }
      await load();
    } catch (createError) {
      setError(createError.message || 'No pudimos generar la invitación.');
    } finally {
      setCreating(false);
    }
  };

  const revokeInvitation = async () => {
    if (!invitation?.id) return;
    setRevoking(true);
    setError('');
    try {
      await revokeBuyerInvitation(apiFetch, invitation.id);
      setConfirmRevoke(false);
      setNewInvitation(null);
      await load();
    } catch (revokeError) {
      setError(revokeError.message || 'No pudimos revocar la invitación.');
    } finally {
      setRevoking(false);
    }
  };

  const addBuyerEmail = () => {
    onAddBuyerEmail?.(prospect);
    onClose();
  };

  return createPortal(
    <div className="modal-overlay buyer-access-overlay" onMouseDown={onClose}>
      <section
        className="modal-card modal-card--wide buyer-access-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="buyer-access-title"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="buyer-access-panel__header">
          <div>
            <span className="buyer-access-panel__eyebrow">Portal del comprador</span>
            <h2 id="buyer-access-title">Habilitar acceso</h2>
          </div>
          <button ref={closeButtonRef} type="button" className="cob-icon-btn" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>

        <div className="buyer-access-panel__identity">
          <span><Mail size={16} /></span>
          <div>
            <strong>{prospect?.name || 'Comprador sin identificar'}</strong>
            <small>{prospect?.email || 'No hay email cargado'} · {lot?.name || 'Lote sin identificar'}</small>
          </div>
        </div>

        {loading ? (
          <div className="buyer-access-panel__loading"><LoaderCircle size={19} /> Consultando estado del acceso…</div>
        ) : error && !access ? (
          <div className="buyer-access-panel__missing-email" role="alert">
            <div className="buyer-access-panel__error">{error}</div>
            {!prospect?.email && onAddBuyerEmail && (
              <Button type="button" size="sm" onClick={addBuyerEmail}>
                <Pencil size={15} />
                Agregar email del comprador
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className={`buyer-access-panel__status${hasActiveAccess ? ' is-active' : ''}`}>
              <span>{hasActiveAccess ? <Check size={17} /> : <KeyRound size={17} />}</span>
              <div>
                <strong>{hasActiveAccess ? 'Acceso activo' : invitation?.status === 'pending' ? 'Invitación pendiente' : 'Sin acceso habilitado'}</strong>
                <p>{hasActiveAccess
                  ? `${access.active_accesses[0].full_name} puede ingresar con ${prospect?.email || 'su correo'} y consultar este contrato desde su portal.`
                  : invitation?.status === 'pending'
                    ? `El enlace vence el ${dateTime(invitation.expires_at)}.`
                    : 'Generá un enlace personal para que el comprador active su portal.'}</p>
              </div>
            </div>

            {newInvitation && (
              <section className="buyer-access-panel__link" aria-labelledby="buyer-access-link-title">
                <div>
                  <span className="buyer-access-panel__eyebrow">Invitación lista</span>
                  <h3 id="buyer-access-link-title">Compartí este enlace una sola vez</h3>
                </div>
                <p>Vence el {dateTime(newInvitation.expires_at)}. Al crear otro, este enlace deja de funcionar.</p>
                <div className="buyer-access-panel__link-box"><Link2 size={17} /><code>{inviteUrl}</code></div>
                <Button size="sm" onClick={copyInvitation}>
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  {copied ? 'Enlace copiado' : 'Copiar enlace'}
                </Button>
              </section>
            )}

            {error && (
              <div className="buyer-access-panel__missing-email" role="alert">
                <div className="buyer-access-panel__error">{error}</div>
                {emailBelongsToInternalAccount && onAddBuyerEmail && (
                  <Button type="button" size="sm" onClick={addBuyerEmail}>
                    <Pencil size={15} />
                    Editar email del comprador
                  </Button>
                )}
              </div>
            )}

            {invitation?.status === 'pending' && !newInvitation && (
              <div className="buyer-access-panel__pending">
                <span>Invitación creada el {dateTime(invitation.created_at)}</span>
                {!confirmRevoke ? (
                  <button type="button" onClick={() => setConfirmRevoke(true)}>Revocar invitación</button>
                ) : (
                  <div>
                    <span>¿Cancelar este enlace?</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => setConfirmRevoke(false)} disabled={revoking}>No</Button>
                    <Button type="button" size="sm" onClick={revokeInvitation} loading={revoking}>Sí, revocar</Button>
                  </div>
                )}
              </div>
            )}

            <footer className="buyer-access-panel__actions">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>Cerrar</Button>
              {hasActiveAccess && (
                <Button as="a" href={buyerPortalLoginUrl} target="_blank" rel="noreferrer" size="sm">
                  <ExternalLink size={15} />
                  Abrir portal
                </Button>
              )}
              {!hasActiveAccess && (
                <Button type="button" size="sm" onClick={createInvitation} loading={creating} disabled={loading}>
                  <ShieldCheck size={15} />
                  {invitation?.status === 'pending' ? 'Crear enlace nuevo' : 'Crear invitación'}
                </Button>
              )}
            </footer>
          </>
        )}
      </section>
    </div>,
    document.body,
  );
}
