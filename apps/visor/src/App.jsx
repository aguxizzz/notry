import { useCallback } from 'react';
import LoginScreen from './components/LoginScreen.jsx';
import LoteoSelector from './components/LoteoSelector.jsx';
import ViewerExperience, { getDataUrlFromQuery } from './components/ViewerExperience.jsx';
import { useAuth } from './hooks/useAuth.js';
import { API_BASE } from './api/config.js';

// La URL decide qué experiencia se monta:
//   sin ?data=  → login + selector de loteos (flujo interno)
//   ?data=...   → visor 360°
const hasDataParam = !!getDataUrlFromQuery();

export default function App() {
  const { token, handleLogin, handleLogout } = useAuth();

  const handleLoteoSelect = useCallback((loteoId) => {
    const dataUrl = `${API_BASE}/loteos/${loteoId}/group_visor_data`;
    const url = `${window.location.origin}${window.location.pathname}?data=${encodeURIComponent(dataUrl)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  if (!hasDataParam) {
    if (!token) return <LoginScreen onLogin={handleLogin} />;
    return <LoteoSelector token={token} onSelect={handleLoteoSelect} onLogout={handleLogout} />;
  }

  return <ViewerExperience />;
}
