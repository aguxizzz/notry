import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

const VARIANT_ICON = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

export default function ToastStack({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map(({ id, message, variant }) => {
        const Icon = VARIANT_ICON[variant] || Info;
        return (
          <div key={id} className={`toast toast--${variant}`}>
            <Icon size={16} className="toast__icon" />
            <span className="toast__message">{message}</span>
            <button
              type="button"
              className="toast__dismiss"
              aria-label="Cerrar"
              onClick={() => onDismiss(id)}
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
