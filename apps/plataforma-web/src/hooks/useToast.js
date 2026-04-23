import { useState, useCallback } from 'react';

/**
 * useToast — manages a toast notification queue.
 *
 * @param {number} duration - Auto-dismiss duration for success toasts (ms). Default 4000.
 */
export function useToast(duration = 4000) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    if (type === 'success') {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
  }, [duration]);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
}
