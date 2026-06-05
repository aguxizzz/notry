export default function SessionExpiredBanner({ visible, onLogin }) {
  if (!visible) return null;
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1001,
      background: '#3a0000', color: '#ff8a80', padding: '10px 16px',
      display: 'flex', alignItems: 'center', gap: '12px', fontSize: 'var(--text-md)'
    }}>
      <span>Sesión expirada. Tu trabajo está guardado localmente.</span>
      <button
        onClick={onLogin}
        style={{ background: '#ff8a80', color: '#1a0000', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontWeight: 'var(--weight-semibold)' }}
      >
        Iniciar sesión
      </button>
    </div>
  );
}
