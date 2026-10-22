import { useState } from 'react';
import { login } from '../api.js';

const MailIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
);

const LockIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      onLogin(await login(email, password));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <div className="login-brand" aria-label="Notry">
        <span className="login-brand-mark" aria-hidden="true" />
        <span>notry</span>
      </div>

      <section className="login-card" aria-labelledby="login-title">
        <header className="login-header">
          <p className="login-eyebrow">Editor de edificios</p>
          <h1 id="login-title">Ingresá para editar</h1>
          <p>Usá la misma cuenta de la plataforma.</p>
        </header>

        <form className="login-form" onSubmit={submit}>
          <div className="login-field">
            <label htmlFor="login-email">Correo electrónico</label>
            <div className="login-input-wrap">
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nombre@empresa.com"
                autoComplete="email"
                aria-invalid={!!error}
                required
                autoFocus
              />
              <MailIcon />
            </div>
          </div>

          <div className="login-field">
            <label htmlFor="login-password">Contraseña</label>
            <div className="login-input-wrap">
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tu contraseña"
                autoComplete="current-password"
                aria-invalid={!!error}
                required
              />
              <LockIcon />
            </div>
          </div>

          <button type="submit" className="primary login-submit" disabled={loading}>
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}
        </form>
      </section>

      <p className="login-note">Herramienta interna</p>
    </main>
  );
}
