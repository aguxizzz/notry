import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleDollarSign, X } from 'lucide-react';
import { Button } from '../../ui/components';
import FormattedNumberInput from './FormattedNumberInput';
import '../../ui/components/Modal.css';

export default function RatesModal({ isOpen, initialCementRate, initialUsdRate, onClose, onSave }) {
  const [cementValue, setCementValue] = useState('');
  const [usdValue, setUsdValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!isOpen) return;
    setCementValue(initialCementRate == null ? '' : String(initialCementRate));
    setUsdValue(initialUsdRate == null ? '' : String(initialUsdRate));
    setErrors({});
  }, [isOpen, initialCementRate, initialUsdRate]);

  if (!isOpen) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    const numericCement = Number(cementValue);
    const numericUsd = Number(usdValue);
    const nextErrors = {};
    if (!Number.isFinite(numericCement) || numericCement <= 0) {
      nextErrors.cement = 'Ingresá un valor mayor a cero.';
    }
    if (!Number.isFinite(numericUsd) || numericUsd <= 0) {
      nextErrors.usd = 'Ingresá un valor mayor a cero.';
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    setErrors({});
    try {
      await onSave({ cementRate: cementValue, usdRate: usdValue });
      onClose();
    } catch (saveError) {
      setErrors({ form: saveError.message || 'No pudimos guardar las cotizaciones.' });
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="modal-overlay" onMouseDown={() => !saving && onClose()}>
      <section
        className="modal-card cob-cement-modal cobranzas-view"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rates-modal-title"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="cob-cement-modal__head">
          <h2 id="rates-modal-title">Cotizaciones</h2>
          <button type="button" className="cob-icon-btn" onClick={onClose} disabled={saving} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <form className="cob-rates-form" onSubmit={handleSubmit}>
          <div className="cob-field">
            <label htmlFor="rates-modal-cement">
              <CircleDollarSign size={14} />
              ARS por bolsa de cemento
            </label>
            <FormattedNumberInput
              id="rates-modal-cement"
              value={cementValue}
              onChange={event => setCementValue(event.target.value)}
              placeholder="0,00"
              disabled={saving}
              autoFocus
            />
            <span className="cob-field-help">
              Se propondrá en los próximos pagos de contratos en bolsas. Los pagos ya registrados no cambian.
            </span>
            {errors.cement && <span className="cob-field-help is-error" role="alert">{errors.cement}</span>}
          </div>

          <div className="cob-field">
            <label htmlFor="rates-modal-usd">
              <CircleDollarSign size={14} />
              ARS por dólar
            </label>
            <FormattedNumberInput
              id="rates-modal-usd"
              value={usdValue}
              onChange={event => setUsdValue(event.target.value)}
              placeholder="0,00"
              disabled={saving}
            />
            <span className="cob-field-help">
              Se usa para convertir el precio en USD de los lotes a UCB en el simulador de compra.
            </span>
            {errors.usd && <span className="cob-field-help is-error" role="alert">{errors.usd}</span>}
          </div>

          {errors.form && <p className="cob-inline-error" role="alert">{errors.form}</p>}

          <div className="modal-actions cob-cement-modal__actions">
            <Button type="submit" loading={saving}>Guardar cotizaciones</Button>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}
