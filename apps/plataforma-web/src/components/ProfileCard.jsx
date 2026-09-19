import { useState, useEffect } from 'react';
import { Button, Panel } from '../ui/components';
import { updateUser, changePassword } from '../api/auth';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import './ProfileCard.css';

export default function ProfileCard({ user, setUser, apiFetch, addToast }) {
  const initial = user?.full_name?.[0]?.toUpperCase() ?? '?';

  // ── Nombre: siempre editable, se guarda al cerrar Configuración ───────────
  const [nameDraft, setNameDraft] = useState(user?.full_name ?? '');

  useEffect(() => { setNameDraft(user?.full_name ?? ''); }, [user?.full_name]);

  const nameDirty = nameDraft.trim() !== (user?.full_name ?? '');

  async function saveProfile() {
    const next = nameDraft.trim();
    if (next === (user?.full_name ?? '')) return true;
    if (!next) { addToast?.('El nombre no puede quedar vacío', 'error'); return false; }
    const prev = user?.full_name;
    setUser(u => ({ ...u, full_name: next }));
    try {
      await updateUser({ apiFetch, full_name: next });
      addToast?.('Perfil actualizado', 'success');
      return true;
    } catch (err) {
      setUser(u => ({ ...u, full_name: prev }));
      setNameDraft(prev ?? '');
      addToast?.(err.message || 'No se pudo actualizar el perfil', 'error');
      return false;
    }
  }

  useUnsavedChanges('profile', { dirty: nameDirty, save: saveProfile });

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
          <h3>Perfil</h3>
        </div>
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
            <label className="cfg-field-label" htmlFor="profile-name">Nombre</label>
            <input
              id="profile-name"
              className="cfg-input"
              type="text"
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              autoComplete="off"
            />
          </div>

          {/* Contraseña — acción propia, requiere la contraseña actual */}
          <div className="cfg-field">
            <span className="cfg-field-label">Contraseña</span>
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
