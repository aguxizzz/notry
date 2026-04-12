import { useState } from 'react';

const API_BASE = 'https://notry-back.onrender.com/api/v1';

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
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Error ${res.status}`);
      }
      const data = await res.json();
      onLogin(data.access_token);
    } catch (err) {
      setError('Credenciales inválidas o error de conexión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <h1 style={styles.title}>Notry Editor</h1>
        <p style={styles.subtitle}>Ingresa tus credenciales para continuar</p>

        <label style={styles.label}>Email</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoFocus
          style={styles.input}
          placeholder="usuario@ejemplo.com"
        />

        <label style={styles.label}>Contraseña</label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          style={styles.input}
          placeholder="••••••••"
        />

        {error && <p style={styles.error}>{error}</p>}

        <button 
          type="submit" 
          disabled={loading} 
          style={{
            ...styles.button,
            background: loading ? 'var(--border)' : 'var(--accent)',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}

const styles = {
  overlay: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100vw',
    height: '100vh',
    background: 'var(--panel-deep)',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    background: 'var(--panel-bg)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '2.5rem',
    width: '100%',
    maxWidth: '380px',
  },
  title: {
    margin: '0 0 4px 0',
    fontSize: 'var(--text-4xl)',
    fontWeight: 'var(--weight-bold)',
    color: '#fff',
  },
  subtitle: {
    margin: '0 0 16px 0',
    fontSize: 'var(--text-lg)',
    color: 'var(--text-muted)',
  },
  label: {
    fontSize: 'var(--text-md)',
    color: 'var(--text-muted)',
  },
  input: {
    background: 'var(--panel-deep)',
    border: '1px solid var(--border)',
    color: '#eee',
    padding: '10px',
    borderRadius: '6px',
    fontSize: 'var(--text-xl)',
    outline: 'none',
  },
  error: {
    margin: '4px 0 0 0',
    color: 'var(--color-danger)',
    fontSize: 'var(--text-md)',
  },
  button: {
    marginTop: '8px',
    padding: '12px',
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontWeight: 'var(--weight-bold)',
    fontSize: 'var(--text-xl)',
  },
};
