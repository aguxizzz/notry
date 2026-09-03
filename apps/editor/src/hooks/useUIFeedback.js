import { useContext } from 'react';
import { UIFeedbackContext } from '../context/uiFeedbackContext';

export function useUIFeedback() {
  const ctx = useContext(UIFeedbackContext);
  if (!ctx) throw new Error('useUIFeedback debe usarse dentro de UIFeedbackProvider');
  return ctx;
}
