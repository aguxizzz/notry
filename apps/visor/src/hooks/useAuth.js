import { useState } from 'react';

export function useAuth() {
  const [token, setToken] = useState(() => {
    const urlToken = new URLSearchParams(window.location.search).get('token');
    if (urlToken) {
      localStorage.setItem('notry_token', urlToken);
      const params = new URLSearchParams(window.location.search);
      params.delete('token');
      const cleaned = window.location.pathname + (params.toString() ? `?${params.toString()}` : '');
      window.history.replaceState({}, '', cleaned);
      return urlToken;
    }
    return localStorage.getItem('notry_token');
  });

  const handleLogin = (newToken) => {
    localStorage.setItem('notry_token', newToken);
    setToken(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('notry_token');
    setToken(null);
  };

  return { token, handleLogin, handleLogout };
}
