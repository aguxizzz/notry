import { useEffect, useState } from 'react';
import { AlertCircle, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { API_BASE } from '../../config';
import Button from '../../ui/components/Button';
import './LoginView.css';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || 'No pudimos completar la operación.');
  return body;
}

export default function BuyerAccessView({ invitationToken = '' }) {
  const isActivation = Boolean(invitationToken);
  const [invite, setInvite] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(isActivation);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isActivation) return;
    request(`/buyer-invitations/${encodeURIComponent(invitationToken)}`)
      .then(setInvite)
      .catch((loadError) => setError(loadError.message))
      .finally(() => setLoading(false));
  }, [invitationToken, isActivation]);

  const completeAccess = (token) => {
    localStorage.setItem('buyer_auth_token', token);
    window.location.assign(`${window.location.pathname}?portal=buyer`);
  };

  const handleActivation = async (event) => {
    event.preventDefault();
    if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
    if (password !== confirmation) return setError('Las contraseñas no coinciden.');
    setSubmitting(true); setError('');
    try {
      const result = await request(`/buyer-invitations/${encodeURIComponent(invitationToken)}/accept`, {
        method: 'POST', body: JSON.stringify({ password }),
      });
      completeAccess(result.access_token);
    } catch (submitError) { setError(submitError.message); } finally { setSubmitting(false); }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setSubmitting(true); setError('');
    try {
      const session = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      const me = await request('/auth/me', { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (me.role !== 'buyer') throw new Error('Este acceso es sólo para compradores.');
      completeAccess(session.access_token);
    } catch (submitError) { setError(submitError.message); } finally { setSubmitting(false); }
  };

  const title = isActivation ? 'Activá tu portal' : 'Ingresá a tu portal';
  const description = isActivation
    ? 'Elegí una contraseña para consultar la información de tu compra cuando quieras.'
    : 'Ingresá con el email y la contraseña con los que activaste tu cuenta.';

  if (loading) {
    return (
      <main className="login-page buyer-login-page">
        <div className="buyer-loading">
          <LoaderCircle className="buyer-loading-spinner is-spinning" aria-hidden="true" />
          <p>Verificando invitación…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="login-page buyer-login-page">
      <div className="login-brand" aria-label="Notry">
        <span className="login-brand-mark" aria-hidden="true" />
        <span>notry</span>
      </div>

      <section className="login-card" aria-labelledby="buyer-login-title">
        <header className="login-header">
          <p className="login-eyebrow">Portal del comprador</p>
          <h1 id="buyer-login-title">{title}</h1>
          <p>{description}</p>
        </header>

        {error && !invite && isActivation ? <div className="login-error" role="alert"><AlertCircle aria-hidden="true" /><span>{error}</span></div> : <form className="login-form" onSubmit={isActivation ? handleActivation : handleLogin}>
          <div className="login-fields">
            {!isActivation && <div className="login-field"><label htmlFor="buyer-login-email">Correo electrónico</label><div className="login-input-wrap"><input id="buyer-login-email" type="email" autoComplete="email" placeholder="nombre@email.com" value={email} onChange={e => setEmail(e.target.value)} required /><Mail aria-hidden="true" /></div></div>}
            <div className="login-field"><label htmlFor="buyer-login-password">{isActivation ? 'Nueva contraseña' : 'Contraseña'}</label><div className="login-input-wrap"><input id="buyer-login-password" type="password" autoComplete={isActivation ? 'new-password' : 'current-password'} placeholder={isActivation ? 'Creá una contraseña' : 'Tu contraseña'} value={password} onChange={e => setPassword(e.target.value)} required /><LockKeyhole aria-hidden="true" /></div></div>
            {isActivation && <div className="login-field"><label htmlFor="buyer-login-confirmation">Repetí tu contraseña</label><div className="login-input-wrap"><input id="buyer-login-confirmation" type="password" autoComplete="new-password" placeholder="Repetí tu contraseña" value={confirmation} onChange={e => setConfirmation(e.target.value)} required /><LockKeyhole aria-hidden="true" /></div></div>}
          </div>
          <Button type="submit" size="lg" loading={submitting}>{isActivation ? 'Activar mi portal' : 'Ingresar al portal'}</Button>
          {error && <div className="login-error" role="alert"><AlertCircle aria-hidden="true" /><span>{error}</span></div>}
          {isActivation ? <div className="login-security buyer-login-identity"><ShieldCheck aria-hidden="true" /><span>Esta invitación es para <strong>{invite?.full_name}</strong></span></div> : <div className="login-security"><ShieldCheck aria-hidden="true" /><span>Acceso seguro a la información de tu compra</span></div>}
        </form>}
      </section>

      <p className="login-note">Portal del comprador</p>
    </main>
  );
}
