import { useState, useEffect } from 'react';
import './TeamPanel.css';
import '../ui/components/Modal.css';
import { Phone, Pencil, X, UserPlus, Trash2, Crown, Shield, User, Link2, Copy, Check, MessageCircle, Clock } from 'lucide-react';
import { Select, Button } from '../ui/components';
import ConfirmModal from './ConfirmModal';
import { createInvite, fetchInvites, revokeInvite, buildInviteUrl, removeMember, updateOrg, updateMemberRole } from '../api/organizations';

// Roles con permiso para editar los datos de la organización (nombre, WhatsApp).
const CAN_EDIT_ORG = ['owner', 'admin'];

const ROLE_LABELS = { owner: 'Dueño', admin: 'Admin', member: 'Miembro' };
const ROLE_ICONS = { owner: Crown, admin: Shield, member: User };
const ROLE_OPTIONS = [
  { value: 'member', label: 'Miembro' },
  { value: 'admin', label: 'Administrador' },
];

function daysUntil(iso) {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

export default function TeamPanel({ user, apiFetch, addToast, org, orgLoading, setOrg }) {
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', full_name: '', role: 'member' });
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState(null); // invitación recién creada (modal con link)
  const [invites, setInvites] = useState([]);             // invitaciones pendientes
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);       // feedback "copiado" por botón
  const [removingId, setRemovingId] = useState(null);
  const [updatingRoleId, setUpdatingRoleId] = useState(null);
  const [optimisticRoles, setOptimisticRoles] = useState({});
  const [memberToRemove, setMemberToRemove] = useState(null);
  const [inviteToRevoke, setInviteToRevoke] = useState(null);
  const [revoking, setRevoking] = useState(false);

  const isOwner = user?.org_role === 'owner';
  const canEditOrg = CAN_EDIT_ORG.includes(user?.org_role);

  // Número de WhatsApp de la organización (uno por org, no por usuario).
  const phone = org?.phone ?? '';
  const [phoneEditing, setPhoneEditing] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState(phone);
  // Nombre de la organización editable (solo owner/admin)
  const orgName = org?.org_name ?? '';
  const [orgNameEditing, setOrgNameEditing] = useState(false);
  const [orgNameDraft, setOrgNameDraft] = useState(orgName);

  useEffect(() => { setOrgNameDraft(orgName); }, [orgName]);

  function startOrgNameEdit() { setOrgNameDraft(orgName); setOrgNameEditing(true); }
  function cancelOrgNameEdit() { setOrgNameDraft(orgName); setOrgNameEditing(false); }

  async function handleSaveOrgName() {
    const next = orgNameDraft.trim();
    if (!next || next === orgName) { setOrgNameEditing(false); return; }
    const prev = orgName;
    setOrg(o => ({ ...o, org_name: next }));
    setOrgNameEditing(false);
    try {
      await updateOrg({ apiFetch, org_name: next });
      addToast?.('Nombre de organización actualizado', 'success');
    } catch (err) {
      setOrg(o => ({ ...o, org_name: prev }));
      addToast?.(err.message || 'No se pudo actualizar el nombre', 'error');
    }
  }

  // Mantiene el draft sincronizado si el número cambia desde afuera.
  useEffect(() => { setPhoneDraft(phone); }, [phone]);

  function startPhoneEdit() { setPhoneDraft(phone); setPhoneEditing(true); }
  function cancelPhoneEdit() { setPhoneDraft(phone); setPhoneEditing(false); }

  async function handleSavePhone() {
    const next = phoneDraft.trim();
    if (next === phone) { setPhoneEditing(false); return; }
    const prevPhone = phone;
    setOrg(prev => ({ ...prev, phone: next || null }));
    setPhoneEditing(false);
    try {
      await updateOrg({ apiFetch, phone: next || null });
      addToast?.('Número actualizado', 'success');
    } catch (err) {
      setOrg(prev => ({ ...prev, phone: prevPhone }));
      addToast?.(err.message || 'No se pudo actualizar el número', 'error');
    }
  }

  // Las invitaciones pendientes solo las puede ver/gestionar el owner.
  useEffect(() => {
    if (!isOwner) return;
    setInvitesLoading(true);
    fetchInvites({ apiFetch })
      .then(setInvites)
      .catch(() => {}) // silencioso: la lista es secundaria
      .finally(() => setInvitesLoading(false));
  }, [isOwner]); // eslint-disable-line react-hooks/exhaustive-deps

  async function copyText(text, key) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(k => (k === key ? null : k)), 2000);
    } catch {
      addToast?.('No se pudo copiar', 'error');
    }
  }

  function shareWhatsApp(token) {
    const url = buildInviteUrl(token);
    const msg = `Hola! Te invito a sumarte al equipo de ${org?.org_name ?? 'Notry'}. Entrá a este link para crear tu cuenta:\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  }

  async function handleInvite(e) {
    e.preventDefault();
    setInviting(true);
    try {
      const invite = await createInvite({ apiFetch, ...inviteForm });
      // La invitación reemplaza cualquier pendiente previa del mismo email (igual que el backend).
      setInvites(prev => [invite, ...prev.filter(i => i.email !== invite.email)]);
      setInviteResult(invite);
      setInviteForm({ email: '', full_name: '', role: 'member' });
      setShowInviteForm(false);
    } catch (err) {
      addToast?.(err.message || 'No se pudo generar la invitación', 'error');
    } finally {
      setInviting(false);
    }
  }

  async function handleRevokeConfirmed() {
    if (!inviteToRevoke) return;
    setRevoking(true);
    try {
      await revokeInvite({ apiFetch, inviteId: inviteToRevoke.id });
      setInvites(prev => prev.filter(i => i.id !== inviteToRevoke.id));
      addToast?.('Invitación cancelada', 'success');
      setInviteToRevoke(null);
    } catch {
      addToast?.('No se pudo cancelar la invitación', 'error');
    } finally {
      setRevoking(false);
    }
  }

  async function handleChangeRole(member, newRole) {
    if (newRole === member.role) return;
    const id = member.user_id;
    const prevRole = member.role;
    setUpdatingRoleId(id);
    setOptimisticRoles(prev => ({ ...prev, [id]: newRole }));
    try {
      await updateMemberRole({ apiFetch, userId: id, role: newRole });
      setOrg(prev => ({
        ...prev,
        members: prev.members.map(m => m.user_id === id ? { ...m, role: newRole } : m),
      }));
      addToast?.(`Rol de ${member.full_name} actualizado`, 'success');
    } catch {
      setOptimisticRoles(prev => ({ ...prev, [id]: prevRole }));
      addToast?.('No se pudo cambiar el rol', 'error');
    } finally {
      setUpdatingRoleId(null);
      setOptimisticRoles(prev => { const n = { ...prev }; delete n[id]; return n; });
    }
  }

  async function handleRemoveConfirmed() {
    if (!memberToRemove) return;
    const { user_id: memberId, full_name: memberName } = memberToRemove;
    setRemovingId(memberId);
    try {
      await removeMember({ apiFetch, userId: memberId });
      addToast?.(`${memberName} fue removido del equipo`, 'success');
      setOrg(prev => ({ ...prev, members: prev.members.filter(m => m.user_id !== memberId) }));
      setMemberToRemove(null);
    } catch {
      addToast?.('Error al remover miembro', 'error');
    } finally {
      setRemovingId(null);
    }
  }

  if (orgLoading) {
    return <div className="team-panel-loading">Cargando equipo...</div>;
  }

  const resultUrl = inviteResult ? buildInviteUrl(inviteResult.token) : '';

  return (
    <div className="team-panel">
      <div className="org-section">
        <div className="org-section-head">
          <h3 className="org-section-title">Organización</h3>
          {orgNameEditing ? (
            <div className="org-phone-edit" style={{ width: '100%' }}>
              <input
                className="org-phone-input"
                type="text"
                value={orgNameDraft}
                onChange={e => setOrgNameDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveOrgName(); if (e.key === 'Escape') cancelOrgNameEdit(); }}
                autoFocus
              />
              <button type="button" className="org-icon-btn org-icon-save" onClick={handleSaveOrgName} title="Guardar">
                <Check size={16} />
              </button>
              <button type="button" className="org-icon-btn" onClick={cancelOrgNameEdit} title="Cancelar">
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="org-phone-view">
              {org?.org_name && <p className="org-section-name" style={{ margin: 0 }}>{org.org_name}</p>}
              {canEditOrg && (
                <button type="button" className="org-icon-btn" onClick={startOrgNameEdit} title="Editar nombre">
                  <Pencil size={15} />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="org-card-field">
          <span className="org-card-field-label">
            <Phone size={14} /> WhatsApp
            <span className="org-card-field-note">
              Se usa para el botón del visor público
            </span>
          </span>

          {phoneEditing ? (
            <div className="org-phone-edit">
              <input
                className="org-phone-input"
                type="tel"
                inputMode="tel"
                placeholder="+54 9 11 1234-5678"
                value={phoneDraft}
                onChange={e => setPhoneDraft(e.target.value)}
                autoFocus
              />
              <button
                type="button"
                className="org-icon-btn org-icon-save"
                onClick={handleSavePhone}
                title="Guardar"
              >
                <Check size={16} />
              </button>
              <button
                type="button"
                className="org-icon-btn"
                onClick={cancelPhoneEdit}
                title="Cancelar"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="org-phone-view">
              <span className={`org-card-field-value ${phone ? '' : 'org-empty'}`}>
                {phone || 'Sin número configurado'}
              </span>
              {canEditOrg && (
                <button
                  type="button"
                  className="org-icon-btn"
                  onClick={startPhoneEdit}
                  title="Editar número"
                >
                  <Pencil size={15} />
                </button>
              )}
            </div>
          )}
        </div>

      </div>

      <div className="team-members-section">
        <span className="team-section-label">Miembros de la organización</span>
        <div className="team-members-list">
        {org?.members?.map(member => {
          const RoleIcon = ROLE_ICONS[member.role] ?? User;
          const isSelf = member.user_id === user?.id;
          return (
            <div key={member.user_id} className="team-member-row">
              <div className="team-member-avatar">
                {member.full_name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="team-member-info">
                <span className="team-member-name">
                  {member.full_name}
                  {isSelf && <span className="team-member-you"> (vos)</span>}
                </span>
                <span className="team-member-email">{member.email}</span>
              </div>
              {isOwner && !isSelf && member.role !== 'owner' ? (
                <Select
                  id={`role-${member.user_id}`}
                  value={optimisticRoles[member.user_id] ?? member.role}
                  onChange={e => handleChangeRole(member, e.target.value)}
                  options={ROLE_OPTIONS}
                  disabled={updatingRoleId === member.user_id}
                  className="team-member-role-picker"
                />
              ) : (
                <div className="team-member-role">
                  <RoleIcon size={13} />
                  <span>{ROLE_LABELS[member.role] ?? member.role}</span>
                </div>
              )}
              {isOwner && !isSelf && (
                <button
                  className="team-member-remove"
                  onClick={() => setMemberToRemove(member)}
                  disabled={removingId === member.user_id}
                  title="Remover miembro"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          );
        })}
        </div>
      </div>

      {/* Invitaciones pendientes (aún no aceptadas) */}
      {isOwner && (invitesLoading || invites.length > 0) && (
        <div className="team-invites-section">
          <span className="team-section-label">Invitaciones pendientes</span>
          {invitesLoading ? (
            <div className="team-invites-loading">Cargando invitaciones...</div>
          ) : (
            <div className="team-invites-list">
            {invites.map(inv => {
              const left = daysUntil(inv.expires_at);
              return (
                <div key={inv.id} className="team-invite-row">
                  <div className="team-invite-row-icon"><Clock size={15} /></div>
                  <div className="team-member-info">
                    <span className="team-member-name">{inv.email}</span>
                    <span className="team-member-email">
                      {ROLE_LABELS[inv.role] ?? inv.role} · {left > 0 ? `vence en ${left} día${left !== 1 ? 's' : ''}` : 'vencida'}
                    </span>
                  </div>
                  <button
                    className="team-invite-action"
                    onClick={() => copyText(buildInviteUrl(inv.token), `inv-${inv.id}`)}
                    title="Copiar link de invitación"
                  >
                    {copiedKey === `inv-${inv.id}` ? <Check size={15} /> : <Link2 size={15} />}
                  </button>
                  <button
                    className="team-invite-action"
                    onClick={() => shareWhatsApp(inv.token)}
                    title="Compartir por WhatsApp"
                  >
                    <MessageCircle size={15} />
                  </button>
                  <button
                    className="team-member-remove"
                    onClick={() => setInviteToRevoke(inv)}
                    title="Cancelar invitación"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
            </div>
          )}
        </div>
      )}

      {isOwner && (
        <div className="team-invite-section">
          {!showInviteForm ? (
            <button className="team-invite-btn" onClick={() => setShowInviteForm(true)}>
              <UserPlus size={15} />
              Invitar miembro
            </button>
          ) : (
            <form className="team-invite-form" onSubmit={handleInvite}>
              <h4>Invitar nuevo miembro</h4>
              <div className="form-group">
                <label htmlFor="invite-full-name">Nombre completo</label>
                <input
                  id="invite-full-name"
                  className="form-input"
                  type="text"
                  placeholder="Ej: Martina Soto"
                  value={inviteForm.full_name}
                  onChange={e => setInviteForm(f => ({ ...f, full_name: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="invite-email">Email</label>
                <input
                  id="invite-email"
                  className="form-input"
                  type="email"
                  placeholder="martina@empresa.com"
                  value={inviteForm.email}
                  onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                  required
                />
              </div>
              <Select
                id="invite-role"
                label="Rol"
                value={inviteForm.role}
                onChange={e => setInviteForm(f => ({ ...f, role: e.target.value }))}
                options={ROLE_OPTIONS}
              />
              <p className="team-invite-hint">
                Los administradores pueden gestionar el equipo. Los miembros acceden a la operación diaria.
              </p>
              <div className="team-invite-form-actions">
                <button type="submit" className="btn-primary" disabled={inviting}>
                  {inviting ? 'Generando...' : 'Generar invitación'}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => { setShowInviteForm(false); setInviteForm({ email: '', full_name: '', role: 'member' }); }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {inviteResult && (
        <div className="modal-overlay" onClick={() => setInviteResult(null)}>
          <div className="modal-card team-invite-result" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <h3 className="modal-title">Invitación lista</h3>
            <p className="team-temp-password-desc">
              Compartí este link con <strong>{inviteResult.email}</strong>. Al abrirlo, podrá crear su cuenta y unirse al equipo.
            </p>

            <div className="team-invite-link-box">
              <Link2 size={15} className="team-invite-link-icon" />
              <span className="team-invite-link-text">{resultUrl}</span>
            </div>

            <div className="team-invite-share-row">
              <Button size="sm" variant="outline" onClick={() => copyText(resultUrl, 'result-link')}>
                {copiedKey === 'result-link' ? <><Check size={15} /> Copiado</> : <><Copy size={15} /> Copiar link</>}
              </Button>
              <Button size="sm" variant="outline" onClick={() => shareWhatsApp(inviteResult.token)}>
                <MessageCircle size={15} /> WhatsApp
              </Button>
            </div>

            <p className="team-invite-expiry-note">El link vence en {daysUntil(inviteResult.expires_at)} días.</p>

            <div className="modal-actions">
              <Button size="sm" onClick={() => setInviteResult(null)}>Listo</Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!memberToRemove}
        title="¿Remover miembro?"
        message={memberToRemove ? `Estás a punto de remover a "${memberToRemove.full_name}" del equipo. Esta acción no se puede deshacer.` : ''}
        confirmLabel="Remover"
        loading={!!removingId}
        onConfirm={handleRemoveConfirmed}
        onCancel={() => setMemberToRemove(null)}
      />

      <ConfirmModal
        isOpen={!!inviteToRevoke}
        title="¿Cancelar invitación?"
        message={inviteToRevoke ? `El link enviado a "${inviteToRevoke.email}" dejará de funcionar.` : ''}
        confirmLabel="Cancelar invitación"
        cancelLabel="Volver"
        loading={revoking}
        onConfirm={handleRevokeConfirmed}
        onCancel={() => setInviteToRevoke(null)}
      />
    </div>
  );
}
