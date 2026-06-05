export default function DraftBanner({ draft, onRestore, onDiscard }) {
  if (!draft) return null;
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1001,
      background: '#3a3a00', color: '#ffeb3b', padding: '10px 16px',
      display: 'flex', alignItems: 'center', gap: '12px', fontSize: 'var(--text-md)'
    }}>
      <span>Hay cambios sin guardar de la sesión anterior ({new Date(draft.savedAt).toLocaleTimeString()}).</span>
      <button
        onClick={() => onRestore(draft)}
        style={{ background: '#ffeb3b', color: '#1a1a00', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontWeight: 'var(--weight-semibold)' }}
      >
        Restaurar
      </button>
      <button
        onClick={onDiscard}
        style={{ background: 'transparent', color: '#ffeb3b', border: '1px solid #ffeb3b', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}
      >
        Descartar
      </button>
    </div>
  );
}
