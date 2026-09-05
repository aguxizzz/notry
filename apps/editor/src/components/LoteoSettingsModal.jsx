import { useState, useEffect } from 'react';
import { X, MapPin, Check } from 'lucide-react';
import { API_BASE, fetchWithTimeout, authHeaders } from '../api/config';

export default function LoteoSettingsModal({
  isOpen,
  onClose,
  loteoId,
  token,
  initialName,
  initialSnapThreshold,
  onSaved,
}) {
  const [name, setName] = useState(initialName ?? '');
  const [snapThreshold, setSnapThreshold] = useState(initialSnapThreshold ?? 5);
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'success' | 'error'
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName ?? '');
      setSnapThreshold(initialSnapThreshold ?? 5);
      setSaveStatus('idle');
      setSaveError(null);
    }
  }, [isOpen, initialName, initialSnapThreshold]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!loteoId || saveStatus === 'saving') return;
    setSaveStatus('saving');
    setSaveError(null);
    try {
      const body = {
        name: name.trim() || undefined,
        snap_threshold: snapThreshold,
      };
      const res = await fetchWithTimeout(`${API_BASE}/loteos/${loteoId}`, {
        method: 'PATCH',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const saved = await res.json();
      onSaved?.(saved);
      setSaveStatus('success');
      setTimeout(() => onClose(), 1200);
    } catch (err) {
      setSaveStatus('error');
      setSaveError(err.message);
    }
  };

  const isSaving = saveStatus === 'saving';
  const isSuccess = saveStatus === 'success';
  const isError = saveStatus === 'error';

  const saveBtnBg = isSuccess ? '#166534' : isError ? '#7f1d1d' : 'var(--accent)';
  const saveBtnColor = isSuccess ? '#4ade80' : isError ? '#ef4444' : '#111';
  const saveBtnBorder = isSuccess ? '1px solid #22c55e' : isError ? '1px solid #ef4444' : 'none';

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (!isSaving && e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#1a1a22', border: '1px solid #333',
        borderRadius: 14, padding: '28px 32px',
        width: 420, maxWidth: '90vw',
        boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <MapPin size={18} color="var(--accent)" />
            <span style={{ color: '#eee', fontWeight: 600, fontSize: 15 }}>Configuración del loteo</span>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            style={{ background: 'transparent', border: 'none', color: '#666', cursor: isSaving ? 'default' : 'pointer', padding: 4, lineHeight: 0, opacity: isSaving ? 0.4 : 1 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Nombre */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ color: '#aaa', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Nombre
          </span>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={isSaving || isSuccess}
            style={{
              background: '#26262e', border: '1px solid #383840', borderRadius: 8,
              color: '#eee', padding: '9px 12px', fontSize: 14,
              opacity: (isSaving || isSuccess) ? 0.6 : 1,
            }}
          />
        </label>

        {/* Snap threshold */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ color: '#aaa', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Snap threshold (px)
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="number"
              min="1"
              value={snapThreshold}
              onChange={e => setSnapThreshold(Math.max(1, Number(e.target.value)))}
              disabled={isSaving || isSuccess}
              style={{
                background: '#26262e', border: '1px solid #383840', borderRadius: 8,
                color: '#eee', padding: '9px 12px', fontSize: 14, width: 90,
                MozAppearance: 'textfield',
                appearance: 'textfield',
                opacity: (isSaving || isSuccess) ? 0.6 : 1,
              }}
              onWheel={e => e.currentTarget.blur()}
            />
            <span style={{ color: '#555', fontSize: 12 }}>
              Distancia mínima para unir vértices de lotes adyacentes
            </span>
          </div>
        </label>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 4 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onClose}
              disabled={isSaving || isSuccess}
              style={{
                background: 'transparent', border: '1px solid #444', borderRadius: 8,
                color: '#aaa', padding: '8px 20px', fontSize: 13,
                cursor: (isSaving || isSuccess) ? 'default' : 'pointer',
                opacity: (isSaving || isSuccess) ? 0.4 : 1,
              }}
            >
              Cancelar
            </button>
            <button
              onClick={isError ? handleSave : isSaving || isSuccess ? undefined : handleSave}
              disabled={isSaving || isSuccess}
              style={{
                background: saveBtnBg,
                border: saveBtnBorder,
                borderRadius: 8,
                color: saveBtnColor,
                fontWeight: 700,
                padding: '8px 24px',
                fontSize: 13,
                cursor: (isSaving || isSuccess) ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 7,
                minWidth: 110, justifyContent: 'center',
                transition: 'background 0.2s, color 0.2s',
              }}
            >
              {isSaving && <span className="modal-spinner" />}
              {isSuccess && <Check size={14} strokeWidth={3} />}
              {isSaving ? 'Guardando…' : isSuccess ? 'Guardado' : isError ? 'Reintentar' : 'Guardar'}
            </button>
          </div>

          {isError && saveError && (
            <span style={{ color: '#ef4444', fontSize: 12, textAlign: 'center' }}>
              {saveError}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
