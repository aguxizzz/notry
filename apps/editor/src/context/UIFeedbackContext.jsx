import { useCallback, useRef, useState } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import ToastStack from '../components/ToastStack';
import { UIFeedbackContext } from './uiFeedbackContext';

export function UIFeedbackProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const [toasts, setToasts] = useState([]);
  const resolveRef = useRef(null);

  const confirm = useCallback((message, opts = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setDialog({ message, ...opts });
    });
  }, []);

  const settleDialog = useCallback((result) => {
    setDialog(null);
    resolveRef.current?.(result);
    resolveRef.current = null;
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback((message, opts = {}) => {
    const variant = opts.variant || 'info';
    const duration = opts.duration ?? (variant === 'error' ? 6000 : 4000);
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, variant }]);
    if (duration) {
      setTimeout(() => dismissToast(id), duration);
    }
    return id;
  }, [dismissToast]);

  return (
    <UIFeedbackContext.Provider value={{ confirm, notify }}>
      {children}
      <ConfirmDialog
        isOpen={!!dialog}
        title={dialog?.title}
        message={dialog?.message}
        danger={dialog?.danger}
        confirmLabel={dialog?.confirmLabel}
        cancelLabel={dialog?.cancelLabel}
        onConfirm={() => settleDialog(true)}
        onCancel={() => settleDialog(false)}
      />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </UIFeedbackContext.Provider>
  );
}
