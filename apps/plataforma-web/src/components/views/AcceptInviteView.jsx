import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button, Loader } from '../../ui/components';
import LoginBackground from '../LoginBackground';
import { validateInvite, acceptInvite } from '../../api/organizations';
import './LoginView.css';
import './AcceptInviteView.css';

const ROLE_LABELS = { owner: 'Dueño', admin: 'Administrador', member: 'Miembro' };

// Vuelve a la URL base (sin ?invite=) → la app bootea normal (login o dashboard).
function goToBase() {
  window.location.replace(window.location.origin + window.location.pathname);
}

export default function AcceptInviteView({ token }) {
  const [phase, setPhase] = useState('loading'); // loading | form | invalid
  const [invite, setInvite] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    let active = true;
    validateInvite(token)
      .then(data => { if (active) { setInvite(data); setPhase('form'); } })
      .catch(err => { if (active) { setErrorMsg(err.message); setPhase('invalid'); } });
    return () => { active = false; };
  }, [token]);

  async function handleNewAccount(e) {
    e.preventDefault();
    setSubmitError(null);
    if (password.length < 8) {
      setSubmitError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setSubmitError('Las contraseñas no coinciden.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await acceptInvite({ token, password });
      if (result.access_token) {
        localStorage.setItem('auth_token', result.access_token);
      }
      goToBase(); // recarga: useAuth toma el token y entra al dashboard
    } catch (err) {
      setSubmitError(err.message);
      setSubmitting(false);
    }
  }

  async function handleExistingAccount() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      await acceptInvite({ token }); // suma la membresía; debe loguearse con su contraseña
      goToBase();
    } catch (err) {
      setSubmitError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="login-container">
      <LoginBackground />
      <div className="login-card">
        {phase === 'loading' && (
          <div className="accept-centered">
            <Loader />
            <p className="accept-hint">Validando invitación…</p>
          </div>
        )}

        {phase === 'invalid' && (
          <>
            <div className="login-header">
              <h1>Notry</h1>
              <p>Invitación no disponible</p>
            </div>
            <div className="login-error">
              <AlertCircle size={18} />
              <span>{errorMsg}</span>
            </div>
            <p className="accept-hint">
              Pedile a quien te invitó que genere una nueva invitación.
            </p>
            <Button variant="outline" onClick={goToBase}>Ir al inicio</Button>
          </>
        )}

        {phase === 'form' && invite?.account_exists && (
          <>
            <div className="login-header">
              <h1>Sumate a {invite.org_name}</h1>
              <p>Ya tenés una cuenta de Notry</p>
            </div>
            <p className="accept-greeting">
              Vas a unirte a <strong>{invite.org_name}</strong> como{' '}
              <strong>{ROLE_LABELS[invite.role] ?? invite.role}</strong> con tu cuenta{' '}
              <strong>{invite.email}</strong>. Después iniciá sesión con tu contraseña habitual.
            </p>
            {submitError && (
              <div className="login-error"><AlertCircle size={18} /><span>{submitError}</span></div>
            )}
            <Button onClick={handleExistingAccount} disabled={submitting}>
              {submitting ? <Loader /> : 'Unirme e iniciar sesión'}
            </Button>
          </>
        )}

        {phase === 'form' && invite && !invite.account_exists && (
          <>
            <div className="login-header">
              <h1>Sumate a {invite.org_name}</h1>
              <p>Creá tu contraseña para entrar</p>
            </div>
            <form onSubmit={handleNewAccount}>
              <div className="form-group">
                <label>Nombre</label>
                <input className="accept-readonly" type="text" value={invite.full_name} disabled />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input className="accept-readonly" type="email" value={invite.email} disabled />
              </div>
              <div className="form-group">
                <label htmlFor="accept-password">Contraseña</label>
                <input
                  id="accept-password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  autoComplete="new-password"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="accept-confirm">Repetir contraseña</label>
                <input
                  id="accept-confirm"
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
              {submitError && (
                <div className="login-error"><AlertCircle size={18} /><span>{submitError}</span></div>
              )}
              <Button type="submit" disabled={submitting}>
                {submitting ? <Loader /> : 'Crear cuenta y entrar'}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
