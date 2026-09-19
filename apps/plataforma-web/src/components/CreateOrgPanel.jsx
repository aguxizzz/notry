import { useState } from 'react';
import { Link2, Copy, Check, MessageCircle, ArrowRightLeft } from 'lucide-react';
import { Select, Button, Panel } from '../ui/components';
import { createOrganization, createInvite, buildInviteUrl } from '../api/organizations';
import './TeamPanel.css';
import '../ui/components/Modal.css';

const PLAN_OPTIONS = [
  { value: 'full', label: 'Completo' },
  { value: 'visor_only', label: 'Solo visor' },
];

const PLAN_HINTS = {
  full: 'Acceso a toda la plataforma: Inicio, Clientes, Cobranzas, Inventario, Proyectos y Análisis.',
  visor_only: 'Solo Proyectos, Inventario y Análisis. Sin Kanban ni Cobranzas.',
};

// Solo para super_admin: alta de una organización cliente nueva. Crea la org
// (sin owner) y después invita a la primera cuenta, que queda como dueño —
// reusa el mismo flujo de invitación por link que TeamPanel, sin duplicar
// lógica de creación de cuenta.
export default function CreateOrgPanel({ apiFetch, addToast, setActiveOrgId, onOrgCreated }) {
  const [orgName, setOrgName] = useState('');
  const [plan, setPlan] = useState('full');
  const [creating, setCreating] = useState(false);
  const [createdOrg, setCreatedOrg] = useState(null);

  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);
  const [copied, setCopied] = useState(false);

  async function handleCreateOrg(e) {
    e.preventDefault();
    const name = orgName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const org = await createOrganization({ apiFetch, org_name: name, plan });
      setCreatedOrg(org);
      setOrgName('');
      setPlan('full');
      addToast?.(`Organización "${org.org_name}" creada`, 'success');
      onOrgCreated?.();
    } catch (err) {
      addToast?.(err.message || 'No se pudo crear la organización', 'error');
    } finally {
      setCreating(false);
    }
  }

  async function handleInviteOwner(e) {
    e.preventDefault();
    if (!createdOrg) return;
    setInviting(true);
    try {
      const invite = await createInvite({
        apiFetch,
        email: ownerEmail.trim(),
        full_name: ownerName.trim(),
        role: 'owner',
        orgId: createdOrg.org_id,
      });
      setInviteResult(invite);
    } catch (err) {
      addToast?.(err.message || 'No se pudo generar la invitación', 'error');
    } finally {
      setInviting(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(buildInviteUrl(inviteResult.token));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast?.('No se pudo copiar', 'error');
    }
  }

  function shareWhatsApp() {
    const url = buildInviteUrl(inviteResult.token);
    const msg = `Hola! Te invito a crear tu cuenta en Notry para "${createdOrg.org_name}". Entrá a este link:\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  }

  function reset() {
    setCreatedOrg(null);
    setInviteResult(null);
    setOwnerName('');
    setOwnerEmail('');
  }

  return (
    <Panel as="section" className="cfg-card create-org-panel" flush>
      <div className="cfg-card-head">
        <div className="cfg-card-head-title">
          <h3>Crear organización</h3>
        </div>
      </div>

      <div className="cfg-card-body">
        {!createdOrg ? (
          <form className="team-invite-form" onSubmit={handleCreateOrg}>
            <div className="form-group">
              <label htmlFor="new-org-name">Nombre de la organización</label>
              <input
                id="new-org-name"
                className="form-input"
                type="text"
                placeholder="Ej: Inmobiliaria del Sur"
                value={orgName}
                onChange={e => setOrgName(e.target.value)}
                required
                autoComplete="off"
              />
            </div>
            <Select
              id="new-org-plan"
              label="Plan"
              value={plan}
              onChange={e => setPlan(e.target.value)}
              options={PLAN_OPTIONS}
            />
            <p className="team-invite-hint">{PLAN_HINTS[plan]}</p>
            <div className="team-invite-form-actions">
              <Button type="submit" disabled={creating || !orgName.trim()}>
                {creating ? 'Creando...' : 'Crear organización'}
              </Button>
            </div>
          </form>
        ) : !inviteResult ? (
          <form className="team-invite-form" onSubmit={handleInviteOwner}>
            <p className="team-invite-hint">
              Organización <strong>{createdOrg.org_name}</strong> creada
              {' '}({PLAN_OPTIONS.find(p => p.value === createdOrg.plan)?.label}).
              {' '}Ahora invitá a la primera cuenta: quedará como dueño de la organización.
            </p>
            <div className="form-group">
              <label htmlFor="owner-full-name">Nombre completo</label>
              <input
                id="owner-full-name"
                className="form-input"
                type="text"
                placeholder="Ej: Martina Soto"
                value={ownerName}
                onChange={e => setOwnerName(e.target.value)}
                required
                autoComplete="off"
              />
            </div>
            <div className="form-group">
              <label htmlFor="owner-email">Email</label>
              <input
                id="owner-email"
                className="form-input"
                type="email"
                placeholder="martina@empresa.com"
                value={ownerEmail}
                onChange={e => setOwnerEmail(e.target.value)}
                required
                autoComplete="off"
              />
            </div>
            <div className="team-invite-form-actions">
              <Button type="submit" disabled={inviting || !ownerName.trim() || !ownerEmail.trim()}>
                {inviting ? 'Generando...' : 'Generar invitación'}
              </Button>
              <Button type="button" variant="outline" onClick={reset}>
                Hacerlo más tarde
              </Button>
            </div>
          </form>
        ) : (
          <div className="team-invite-result-inline">
            <p className="team-temp-password-desc">
              Compartí este link con <strong>{inviteResult.email}</strong> para que cree su cuenta
              como dueño de <strong>{createdOrg.org_name}</strong>.
            </p>
            <div className="team-invite-link-box">
              <Link2 size={15} className="team-invite-link-icon" />
              <span className="team-invite-link-text">{buildInviteUrl(inviteResult.token)}</span>
            </div>
            <div className="team-invite-share-row">
              <Button size="sm" variant="outline" onClick={copyLink}>
                {copied ? <><Check size={15} /> Copiado</> : <><Copy size={15} /> Copiar link</>}
              </Button>
              <Button size="sm" variant="outline" onClick={shareWhatsApp}>
                <MessageCircle size={15} /> WhatsApp
              </Button>
              {setActiveOrgId && (
                <Button size="sm" variant="outline" onClick={() => setActiveOrgId(createdOrg.org_id)}>
                  <ArrowRightLeft size={15} /> Operar esta org
                </Button>
              )}
            </div>
            <div className="team-invite-form-actions">
              <Button size="sm" onClick={reset}>Crear otra organización</Button>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
