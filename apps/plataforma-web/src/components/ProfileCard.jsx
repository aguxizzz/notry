import { useState, useEffect } from 'react';
import { Lock, User, Pencil } from 'lucide-react';
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
    <div className="profile-card">
      <div className="profile-avatar">{initial}</div>

      <div className="profile-head">
        <span className="profile-head-title">Perfil</span>
        {!editing ? (
          <button type="button" className="btn-ghost btn-sm" onClick={startEdit}>
            <Pencil size={14} /> Editar
          </button>
        ) : (
          <div className="profile-head-actions">
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={handleSave}
              disabled={saving || !nameDraft.trim()}
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={cancelEdit} disabled={saving}>
              Cancelar
            </button>
          </div>
        )}
      </div>

      <div className="profile-fields">
        {/* Nombre */}
        <div className="profile-field">
          <span className="profile-field-label">
            <User size={14} /> Nombre
          </span>
          {editing ? (
            <input
              className="org-phone-input"
              type="text"
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') cancelEdit(); }}
              disabled={saving}
              autoFocus
            />
          ) : (
            <span className="profile-field-value">{user?.full_name ?? '—'}</span>
          )}
        </div>

        {/* Contraseña — acción propia, requiere la contraseña actual */}
        <div className="profile-field">
          <span className="profile-field-label">
            <Lock size={14} /> Contraseña
          </span>
          {pwEditing ? (
            <div className="profile-pw-form">
              <input
                className="org-phone-input"
                type="password"
                placeholder="Contraseña actual"
                value={currentPw}
                onChange={e => setCurrentPw(e.target.value)}
                disabled={pwSaving}
                autoFocus
              />
              <input
                className="org-phone-input"
                type="password"
                placeholder="Nueva contraseña (mín. 8 caracteres)"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                disabled={pwSaving}
                onKeyDown={e => { if (e.key === 'Enter') handleSavePassword(); if (e.key === 'Escape') cancelPwEdit(); }}
              />
              {pwError && <p className="profile-pw-error">{pwError}</p>}
              <div className="profile-pw-actions">
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={handleSavePassword}
                  disabled={pwSaving || !currentPw || !newPw}
                >
                  {pwSaving ? 'Guardando...' : 'Cambiar contraseña'}
                </button>
                <button type="button" className="btn-ghost btn-sm" onClick={cancelPwEdit} disabled={pwSaving}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="profile-inline-view">
              <span className="profile-field-value profile-password">••••••••</span>
              <button type="button" className="btn-ghost btn-sm" onClick={startPwEdit}>
                Cambiar contraseña
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
