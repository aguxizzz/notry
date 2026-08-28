import { useState } from 'react';
import { API_BASE } from '../api/config';

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      onLogin(data.access_token);
    } catch {
      setError('Credenciales inválidas o error de conexión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.overlay}>
      <form onSubmit={handleSubmit} style={s.card}>
        <h1 style={s.title}>Notry Visor</h1>
        <p style={s.subtitle}>Ingresá tus credenciales para continuar</p>

        <label style={s.label}>Email</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoFocus
          style={s.input}
          placeholder="usuario@ejemplo.com"
        />

        <label style={s.label}>Contraseña</label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          style={s.input}
          placeholder="••••••••"
        />

        {error && <p style={s.error}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{ ...s.button, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}

const s = {
  overlay: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100vw',
    height: '100vh',
    background: '#1e1e24',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    background: '#2a2a30',
    border: '1px solid #383840',
    borderRadius: '12px',
    padding: '2.5rem',
    width: '100%',
    maxWidth: '380px',
  },
  title: {
    margin: '0 0 4px 0',
    fontSize: '2rem',
    fontWeight: 700,
    color: '#fff',
  },
  subtitle: {
    margin: '0 0 16px 0',
    fontSize: '0.9rem',
    color: '#888',
  },
  label: {
    fontSize: '0.875rem',
    color: '#888',
  },
  input: {
    background: '#1e1e24',
    border: '1px solid #383840',
    color: '#eee',
    padding: '10px',
    borderRadius: '6px',
    fontSize: '1rem',
    outline: 'none',
  },
  error: {
    margin: '4px 0 0 0',
    color: '#ef4444',
    fontSize: '0.875rem',
  },
  button: {
    marginTop: '8px',
    padding: '12px',
    background: '#c5a059',
    color: '#1a1a1a',
    border: 'none',
    borderRadius: '6px',
    fontWeight: 700,
    fontSize: '1rem',
  },
};
