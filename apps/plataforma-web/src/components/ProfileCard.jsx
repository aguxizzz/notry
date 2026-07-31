import { useState, useEffect } from 'react';
import { Lock, User, Pencil } from 'lucide-react';
import { Button, Panel } from '../ui/components';
import { updateUser, changePassword } from '../api/auth';
import './ProfileCard.css';

export default function ProfileCard({ user, setUser, apiFetch, addToast }) {
  const initial = user?.full_name?.[0]?.toUpperCase() ?? '?';

  // ── Edición del perfil (Nombre) por sección ──────────────────────────────
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!editing) setNameDraft(user?.full_name ?? ''); }, [user?.full_name, editing]);

  function startEdit() { setNameDraft(user?.full_name ?? ''); setEditing(true); }
  function cancelEdit() { setEditing(false); }

  async function handleSave() {
    const next = nameDraft.trim();
    if (!next) { addToast?.('El nombre no puede quedar vacío', 'error'); return; }
    if (next === user?.full_name) { setEditing(false); return; }
    const prev = user?.full_name;
    setSaving(true);
    setUser(u => ({ ...u, full_name: next }));
    try {
      await updateUser({ apiFetch, full_name: next });
      addToast?.('Perfil actualizado', 'success');
      setEditing(false);
    } catch (err) {
      setUser(u => ({ ...u, full_name: prev }));
      addToast?.(err.message || 'No se pudo actualizar el perfil', 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Cambio de contraseña (acción propia: requiere contraseña actual) ──────
  const [pwEditing, setPwEditing] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState(null);

  function startPwEdit() { setCurrentPw(''); setNewPw(''); setPwError(null); setPwEditing(true); }
  function cancelPwEdit() { setPwEditing(false); setPwError(null); }

  async function handleSavePassword() {
    setPwError(null);
    if (newPw.length < 8) { setPwError('La nueva contraseña debe tener al menos 8 caracteres'); return; }
    setPwSaving(true);
    try {
      await changePassword({ apiFetch, current_password: currentPw, new_password: newPw });
      addToast?.('Contraseña actualizada', 'success');
      setPwEditing(false);
    } catch (err) {
      setPwError(err.message || 'Contraseña actual incorrecta');
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <Panel as="section" className="cfg-card profile-card" flush>
      <div className="cfg-card-head">
        <div className="cfg-card-head-title">
          <span className="cfg-card-badge"><User size={16} /></span>
          <h3>Perfil</h3>
        </div>
        {!editing ? (
          <Button type="button" variant="outline" size="sm" onClick={startEdit}>
            <Pencil size={14} /> Editar
          </Button>
        ) : (
          <div className="cfg-head-actions">
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={saving || !nameDraft.trim()}
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={cancelEdit} disabled={saving}>
              Cancelar
            </Button>
          </div>
        )}
      </div>

      <div className="cfg-card-body">
        <div className="profile-top">
          <div className="profile-avatar">{initial}</div>
          <div className="profile-top-id">
            <span className="profile-top-name">{user?.full_name ?? '—'}</span>
            <span className="profile-top-email">{user?.email}</span>
          </div>
        </div>

        <div className="cfg-fields">
          {/* Nombre */}
          <div className="cfg-field">
            <span className="cfg-field-label">
              <User size={13} /> Nombre
            </span>
            {editing ? (
              <input
                className="cfg-input"
                type="text"
                value={nameDraft}
                onChange={e => setNameDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') cancelEdit(); }}
                disabled={saving}
                autoFocus
              />
            ) : (
              <span className="cfg-field-value">{user?.full_name ?? '—'}</span>
            )}
          </div>

          {/* Contraseña — acción propia, requiere la contraseña actual */}
          <div className="cfg-field">
            <span className="cfg-field-label">
              <Lock size={13} /> Contraseña
            </span>
            {pwEditing ? (
              <div className="profile-pw-form">
                <input
                  className="cfg-input"
                  type="password"
                  placeholder="Contraseña actual"
                  value={currentPw}
                  onChange={e => setCurrentPw(e.target.value)}
                  disabled={pwSaving}
                  autoFocus
                />
                <input
                  className="cfg-input"
                  type="password"
                  placeholder="Nueva contraseña (mín. 8 caracteres)"
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  disabled={pwSaving}
                  onKeyDown={e => { if (e.key === 'Enter') handleSavePassword(); if (e.key === 'Escape') cancelPwEdit(); }}
                />
                {pwError && <p className="profile-pw-error">{pwError}</p>}
                <div className="profile-pw-actions">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSavePassword}
                    disabled={pwSaving || !currentPw || !newPw}
                  >
                    {pwSaving ? 'Guardando...' : 'Cambiar contraseña'}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={cancelPwEdit} disabled={pwSaving}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="cfg-field-row">
                <span className="cfg-field-value is-mono">••••••••</span>
                <Button type="button" variant="outline" size="sm" onClick={startPwEdit}>
                  Cambiar contraseña
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}
