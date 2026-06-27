import { useState, useEffect } from 'react';
import { Lock, User, Pencil, Check, X } from 'lucide-react';
import { updateUser, changePassword } from '../api/auth';
import './ProfileCard.css';

export default function ProfileCard({ user, setUser, apiFetch, addToast }) {
  const initial = user?.full_name?.[0]?.toUpperCase() ?? '?';

  // ── Nombre inline edit ───────────────────────────────────────────────────
  const [nameEditing, setNameEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  useEffect(() => { if (!nameEditing) setNameDraft(user?.full_name ?? ''); }, [user?.full_name, nameEditing]);

  function startNameEdit() { setNameDraft(user?.full_name ?? ''); setNameEditing(true); }
  function cancelNameEdit() { setNameEditing(false); }

  async function handleSaveName() {
    const next = nameDraft.trim();
    if (!next || next === user?.full_name) { setNameEditing(false); return; }
    const prev = user?.full_name;
    setUser(u => ({ ...u, full_name: next }));
    setNameEditing(false);
    try {
      await updateUser({ apiFetch, full_name: next });
      addToast?.('Nombre actualizado', 'success');
    } catch (err) {
      setUser(u => ({ ...u, full_name: prev }));
      addToast?.(err.message || 'No se pudo actualizar el nombre', 'error');
    }
  }

  // ── Cambio de contraseña ─────────────────────────────────────────────────
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

      <div className="profile-fields">
        {/* Nombre */}
        <div className="profile-field">
          <span className="profile-field-label">
            <User size={14} /> Nombre
          </span>
          {nameEditing ? (
            <div className="profile-inline-edit">
              <input
                className="org-phone-input"
                type="text"
                value={nameDraft}
                onChange={e => setNameDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') cancelNameEdit(); }}
                autoFocus
              />
              <button type="button" className="org-icon-btn org-icon-save" onClick={handleSaveName} title="Guardar">
                <Check size={16} />
              </button>
              <button type="button" className="org-icon-btn" onClick={cancelNameEdit} title="Cancelar">
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="profile-inline-view">
              <span className="profile-field-value">{user?.full_name ?? '—'}</span>
              <button type="button" className="org-icon-btn" onClick={startNameEdit} title="Editar nombre">
                <Pencil size={15} />
              </button>
            </div>
          )}
        </div>

        {/* Contraseña */}
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
                  className="btn-primary"
                  onClick={handleSavePassword}
                  disabled={pwSaving || !currentPw || !newPw}
                >
                  {pwSaving ? 'Guardando...' : 'Cambiar contraseña'}
                </button>
                <button type="button" className="btn-ghost" onClick={cancelPwEdit} disabled={pwSaving}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="profile-inline-view">
              <span className="profile-field-value profile-password">••••••••</span>
              <button type="button" className="org-icon-btn" onClick={startPwEdit} title="Cambiar contraseña">
                <Pencil size={15} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
