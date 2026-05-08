import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button, Loader } from '../../ui/components';
import LoginBackground from '../LoginBackground';
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
    <div className="login-container">
      <LoginBackground />
      <div className="login-card">
        <div className="login-header">
          <h1>Notry</h1>
          <p>Ingresa para administrar tus lotes</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="login-email">Correo Electrónico</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="form-group">
            <label htmlFor="login-password">Contraseña</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? <Loader /> : 'Iniciar Sesión'}
          </Button>
        </form>
        {status?.type === 'error' && (
          <div className="login-error">
            <AlertCircle size={18} />
            <span>{status.message}</span>
          </div>
        )}
      </div>
    </div>
  );
}
