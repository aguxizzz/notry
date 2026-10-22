import { useState } from 'react';
import ConfirmDialog from './ConfirmDialog.jsx';

// Reemplazo de window.confirm: `await confirm({ title, message, confirmLabel })` → true/false.
export function useConfirm() {
  const [request, setRequest] = useState(null);

  const confirm = (opts) =>
    new Promise((resolve) => {
      setRequest({ ...opts, resolve });
    });

  const close = (result) => {
    request?.resolve(result);
    setRequest(null);
  };

  const dialog = request && <ConfirmDialog {...request} onClose={close} />;
  return [confirm, dialog];
}
