import { useEffect, useRef } from 'react';
import { Loader, Button } from './index';
import Select from './Select';

export default function EditEntityModal({
  isOpen,
  isClosing,
  title,
  fields,
  formData,
  onFormChange,
  onSubmit,
  onClose,
  loading,
  error,
  secondaryActions = [],
  submitLabel = 'Guardar',
  wide = false,
}) {
  const modalRef = useRef(null);
  const previousActiveElementRef = useRef(null);

  useEffect(() => {
    if (isOpen && !isClosing) {
      // Store the element that had focus before modal opened
      previousActiveElementRef.current = document.activeElement;

      // Move focus to first focusable element in modal
      const timer = setTimeout(() => {
        if (modalRef.current) {
          const focusableElements = modalRef.current.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          if (focusableElements.length > 0) {
            focusableElements[0].focus();
          }
        }
      }, 0);

      return () => clearTimeout(timer);
    }
  }, [isOpen, isClosing]);

  useEffect(() => {
    if (!isOpen && previousActiveElementRef.current) {
      // Restore focus to the element that triggered the modal
      previousActiveElementRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className={`modal-overlay${isClosing ? ' modal-overlay--closing' : ''}`}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className={`modal-card${wide ? ' modal-card--wide' : ''}`}
        onClick={e => e.stopPropagation()}
        aria-modal="true"
        role="dialog"
        aria-labelledby="modal-title"
      >
        <h3 className="modal-title" id="modal-title">{title}</h3>
        <form onSubmit={onSubmit}>
          {fields.map((field, idx) => {
            if (field.type === 'group') {
              if (field.fields.length === 1) {
                return renderField(field.fields[0], formData, onFormChange);
              }
              return (
                <div key={idx} className="form-row-2">
                  {field.fields.map(f => renderField(f, formData, onFormChange))}
                </div>
              );
            }
            return renderField(field, formData, onFormChange, idx);
          })}

          {error && <div className="status-message error">{error}</div>}

          <div className="modal-footer">
            {secondaryActions.length > 0 && (
              <div className="modal-footer-secondary">
                {secondaryActions.map((action, idx) => (
                  <Button
                    key={idx}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={action.onClick}
                    disabled={action.disabled}
                    loading={action.loading}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            )}
            <div className="modal-footer-actions">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={loading}
                loading={loading}
              >
                {submitLabel}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function renderField(field, formData, onFormChange, idx) {
  const { name, label, type = 'text', required = false, placeholder, step, options, disabled = false } = field;
  const value = formData[name] ?? '';

  if (type === 'select') {
    return (
      <Select
        key={name}
        id={`field-${name}`}
        label={label}
        value={value}
        onChange={e => onFormChange(name, e.target.value)}
        options={options}
        disabled={disabled}
      />
    );
  }

  if (type === 'textarea') {
    return (
      <div key={name} className="form-group">
        <label htmlFor={`field-${name}`}>{label}{required && ' *'}</label>
        <textarea
          id={`field-${name}`}
          required={required}
          value={value}
          onChange={e => onFormChange(name, e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
      </div>
    );
  }

  return (
    <div key={name} className="form-group">
      <label htmlFor={`field-${name}`}>{label}{required && ' *'}</label>
      <input
        id={`field-${name}`}
        type={type}
        required={required}
        value={value}
        onChange={e => onFormChange(name, e.target.value)}
        placeholder={placeholder}
        step={step}
        disabled={disabled}
      />
    </div>
  );
}
