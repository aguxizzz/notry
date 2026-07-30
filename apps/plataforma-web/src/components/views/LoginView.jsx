import React, { useState } from 'react';
import { AlertCircle, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import Button from '../../ui/components/Button';
import './LoginView.css';

export default function LoginView({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      await onLogin(email, password, { setLoading, setStatus });
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
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
          <p className="login-eyebrow">Acceso a la plataforma</p>
          <h1 id="login-title">Bienvenido de nuevo</h1>
          <p>Ingresá con los datos de tu organización.</p>
        </header>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-fields">
            <div className="login-field">
              <label htmlFor="login-email">Correo electrónico</label>
              <div className="login-input-wrap">
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nombre@empresa.com"
                  required
                  autoComplete="email"
                  aria-invalid={status?.type === 'error'}
                  aria-describedby={status?.type === 'error' ? 'login-error' : undefined}
                />
                <Mail aria-hidden="true" />
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
                  required
                  autoComplete="current-password"
                  aria-invalid={status?.type === 'error'}
                  aria-describedby={status?.type === 'error' ? 'login-error' : undefined}
                />
                <LockKeyhole aria-hidden="true" />
              </div>
            </div>
          </div>

          <Button type="submit" size="lg" loading={loading}>
            Ingresar a Notry
          </Button>

          {status?.type === 'error' ? (
            <div
              id="login-error"
              className="login-error"
              role="alert"
              aria-live="polite"
            >
              <AlertCircle size={18} aria-hidden="true" />
              <span>{status.message}</span>
            </div>
          ) : null}

          <div className="login-security">
            <ShieldCheck aria-hidden="true" />
            <span>Acceso seguro para tu organización</span>
          </div>
        </form>

        <div className="login-support-spacer" aria-hidden="true" />
      </section>

      <p className="login-note">Plataforma de gestión inmobiliaria</p>
    </main>
  );
}
