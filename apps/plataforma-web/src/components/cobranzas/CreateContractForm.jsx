import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarClock,
  Check,
  CircleDollarSign,
  Landmark,
  UsersRound,
} from 'lucide-react';
import { Button, SegmentedControl, Select } from '../../ui/components';
import { formatContractAmount, formatContractDate, unitLabel } from './contractsFormat';
import { MAX_CONTRACT_AMOUNT, MAX_INTEREST_RATE_PERCENT } from './contractLimits';
import FormattedNumberInput from './FormattedNumberInput';

const todayInputValue = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
};

function addMonthsToInputDate(value, months) {
  if (!value) return '';
  const [year, month, day] = value.split('-').map(Number);
  if (![year, month, day].every(Number.isFinite)) return '';
  const targetMonth = month - 1 + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  const date = new Date(targetYear, normalizedMonth, Math.min(day, lastDay));
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function calculateInstallment(amount, count, interestEnabled, monthlyRate) {
  const principal = Number(amount);
  const months = Number(count);
  const rate = Number(monthlyRate) / 100;
  if (!Number.isFinite(principal) || principal <= 0 || !Number.isInteger(months) || months <= 0) return 0;
  if (!interestEnabled || !Number.isFinite(rate) || rate <= 0) return principal / months;
  return principal * (rate * (1 + rate) ** months) / ((1 + rate) ** months - 1);
}

function lotStatusLabel(status) {
  if (status === 'sold') return 'vendido';
  if (status === 'reserved') return 'reservado';
  return 'disponible';
}

function PreviewValue({ value, className = '' }) {
  return (
    <span key={value} className={`cob-live-value${className ? ` ${className}` : ''}`}>
      {value}
    </span>
  );
}

export default function CreateContractForm({
  lots,
  prospects,
  onBack,
  onCreate,
}) {
  const initialContractDate = todayInputValue();
  const [form, setForm] = useState({
    lote_id: '',
    prospect_id: '',
    contract_date: initialContractDate,
    first_due_date: addMonthsToInputDate(initialContractDate, 1),
    unit_type: 'pesos',
    amount: '',
    installments_count: '24',
    interest_enabled: false,
    interest_rate_percent: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const selectedLot = lots.find(lot => String(lot.id) === form.lote_id);
  const selectedProspect = prospects.find(prospect => String(prospect.id) === form.prospect_id);
  const { selectableLots, unavailableLots } = useMemo(() => {
    const prospectCounts = prospects.reduce((counts, prospect) => {
      if (prospect.lote_id === null || prospect.lote_id === undefined || prospect.lote_id === '') {
        return counts;
      }
      const lotId = String(prospect.lote_id);
      counts.set(lotId, (counts.get(lotId) || 0) + 1);
      return counts;
    }, new Map());
    const options = lots.map(lot => ({
      ...lot,
      prospectCount: prospectCounts.get(String(lot.id)) || 0,
    }));

    return {
      selectableLots: options
        .filter(lot => lot.prospectCount > 0)
        .sort((a, b) => (
          b.prospectCount - a.prospectCount
          || String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' })
        )),
      unavailableLots: options
        .filter(lot => lot.prospectCount === 0)
        .sort((a, b) => String(a.name || '').localeCompare(
          String(b.name || ''),
          'es',
          { sensitivity: 'base' },
        )),
    };
  }, [lots, prospects]);
  const relatedProspects = useMemo(
    () => form.lote_id
      ? prospects.filter(prospect => String(prospect.lote_id) === form.lote_id)
      : [],
    [form.lote_id, prospects],
  );
  const installmentAmount = useMemo(() => calculateInstallment(
    form.amount,
    Number(form.installments_count),
    form.interest_enabled,
    form.interest_rate_percent,
  ), [form.amount, form.installments_count, form.interest_enabled, form.interest_rate_percent]);
  const lotOptions = useMemo(() => [
    {
      value: '',
      label: selectableLots.length > 0 ? 'Seleccionar lote' : 'No hay lotes con prospectos',
      disabled: selectableLots.length === 0,
    },
    ...selectableLots.map(lot => ({
      value: String(lot.id),
      label: `${lot.name} · ${lot.loteo_name || 'Sin loteo'} · ${lot.prospectCount} prospecto${lot.prospectCount === 1 ? '' : 's'} · ${lotStatusLabel(lot.status)}`,
    })),
    ...unavailableLots.map(lot => ({
      value: `unavailable-${lot.id}`,
      label: `${lot.name} · ${lot.loteo_name || 'Sin loteo'} · sin prospectos`,
      disabled: true,
    })),
  ], [selectableLots, unavailableLots]);
  const prospectOptions = useMemo(() => [
    {
      value: '',
      label: !form.lote_id
        ? 'Primero seleccioná un lote'
        : relatedProspects.length === 0
          ? 'Sin prospectos vinculados'
          : 'Seleccionar comprador',
    },
    ...relatedProspects.map(prospect => ({
      value: String(prospect.id),
      label: `${prospect.name}${prospect.phone ? ` · ${prospect.phone}` : ''}`,
    })),
  ], [form.lote_id, relatedProspects]);

  const installmentSummary = Number(form.installments_count) > 0
    ? `${form.installments_count} × ${installmentAmount > 0
      ? formatContractAmount(installmentAmount, form.unit_type)
      : '—'}`
    : '— × —';
  const unitSummary = `${unitLabel(form.unit_type)}${form.interest_enabled ? ' · sistema francés' : ' · sin interés'}`;
  const lotSummary = selectedLot
    ? `${selectedLot.name} · ${selectedLot.loteo_name || 'Sin loteo'}`
    : 'Pendiente';
  const prospectSummary = selectedProspect?.name || 'Pendiente';
  const dueDateSummary = form.first_due_date
    ? formatContractDate(`${form.first_due_date}T12:00:00`)
    : 'Pendiente';
  const amountSummary = Number(form.amount) > 0
    ? formatContractAmount(form.amount, form.unit_type)
    : '—';

  const update = (field, value) => {
    setForm(current => ({ ...current, [field]: value }));
    setError('');
  };

  const updateLot = (loteId) => {
    setForm(current => ({
      ...current,
      lote_id: loteId,
      prospect_id: '',
    }));
    setError('');
  };

  const updateContractDate = (value) => {
    setForm(current => {
      const previousAutomaticDueDate = addMonthsToInputDate(current.contract_date, 1);
      const shouldKeepInSync = !current.first_due_date
        || current.first_due_date === previousAutomaticDueDate;
      return {
        ...current,
        contract_date: value,
        first_due_date: shouldKeepInSync
          ? addMonthsToInputDate(value, 1)
          : current.first_due_date,
      };
    });
    setError('');
  };

  const handleUnitChange = (unitType) => {
    setForm(current => ({
      ...current,
      unit_type: unitType,
      interest_enabled: unitType === 'pesos' ? current.interest_enabled : false,
      interest_rate_percent: unitType === 'pesos' ? current.interest_rate_percent : '',
    }));
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const amount = Number(form.amount);
    const installmentsCount = Number(form.installments_count);
    const interestRate = Number(form.interest_rate_percent);

    if (!form.lote_id) {
      setError('Seleccioná el lote del contrato.');
      return;
    }
    if (relatedProspects.length === 0) {
      setError('El lote seleccionado no tiene prospectos vinculados.');
      return;
    }
    if (
      !form.prospect_id
      || !selectedProspect
      || String(selectedProspect.lote_id) !== form.lote_id
    ) {
      setError('Seleccioná un comprador vinculado al lote.');
      return;
    }
    if (!form.contract_date) {
      setError('Indicá la fecha del contrato.');
      return;
    }
    if (!form.first_due_date) {
      setError('Indicá el primer vencimiento.');
      return;
    }
    if (form.first_due_date <= form.contract_date) {
      setError('El primer vencimiento debe ser posterior a la fecha del contrato.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Ingresá un monto mayor que cero.');
      return;
    }
    if (amount > MAX_CONTRACT_AMOUNT) {
      setError(`El monto no puede superar ${MAX_CONTRACT_AMOUNT.toLocaleString('es-AR')}.`);
      return;
    }
    if (!Number.isInteger(installmentsCount) || installmentsCount < 1) {
      setError('La cantidad de cuotas debe ser un número entero mayor que cero.');
      return;
    }
    if (form.interest_enabled && (!Number.isFinite(interestRate) || interestRate <= 0)) {
      setError('Ingresá una tasa mensual válida.');
      return;
    }
    if (form.interest_enabled && interestRate > MAX_INTEREST_RATE_PERCENT) {
      setError(`La tasa mensual no puede superar ${MAX_INTEREST_RATE_PERCENT}%.`);
      return;
    }

    const body = {
      lote_id: form.lote_id,
      prospect_id: form.prospect_id,
      contract_date: new Date(`${form.contract_date}T12:00:00`).toISOString(),
      first_due_date: new Date(`${form.first_due_date}T12:00:00`).toISOString(),
      unit_type: form.unit_type,
      installments_count: installmentsCount,
    };

    if (form.unit_type === 'pesos' && form.interest_enabled) {
      body.interest_base_amount = amount;
      body.interest_rate_percent = interestRate;
      body.interest_periodicity = 'mensual';
      body.amortization_type = 'frances';
    } else if (form.unit_type === 'pesos') {
      body.total_acordado = amount;
    } else {
      body.total_amount = amount;
    }

    setSubmitting(true);
    setError('');
    try {
      await onCreate(body);
    } catch (submitError) {
      setError(submitError.message || 'No pudimos crear el contrato.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="cob-create">
      <button type="button" className="cob-back" onClick={onBack}>
        <ArrowLeft size={16} />
        Volver a Cobranzas
      </button>

      <header className="cob-create-header">
        <div>
          <span className="cob-detail-eyebrow">Cobranzas · Alta</span>
          <h1>Nuevo contrato de cuotas</h1>
          <p>Definí la operación y revisá el plan estimado antes de confirmarla.</p>
        </div>
      </header>

      <form className="cob-create-layout" onSubmit={handleSubmit}>
        <div className="cob-create-fields">
          <section className="cob-form-section">
            <div className="cob-form-section-title">
              <span>1</span>
              <div>
                <h2>Operación</h2>
                <p>Elegí el lote para ver sus compradores vinculados.</p>
              </div>
            </div>

            <div className="cob-form-grid">
              <div className="cob-field">
                <label htmlFor="contract-lot"><Landmark size={14} /> Lote</label>
                <Select
                  id="contract-lot"
                  value={form.lote_id}
                  onChange={event => updateLot(event.target.value)}
                  disabled={submitting}
                  ariaLabel="Seleccionar lote del contrato"
                  options={lotOptions}
                />
                <span className="cob-field-help">
                  Los lotes con más prospectos aparecen primero.
                </span>
              </div>

              <div className="cob-field">
                <label htmlFor="contract-prospect"><UsersRound size={14} /> Comprador</label>
                <Select
                  id="contract-prospect"
                  value={form.prospect_id}
                  onChange={event => update('prospect_id', event.target.value)}
                  disabled={submitting || !form.lote_id || relatedProspects.length === 0}
                  ariaLabel="Seleccionar comprador"
                  ariaDescribedBy="contract-prospect-help"
                  options={prospectOptions}
                />
                <span
                  id="contract-prospect-help"
                  className={`cob-field-help${form.lote_id && relatedProspects.length === 0 ? ' is-warning' : ''}`}
                >
                  {!form.lote_id
                    ? 'El comprador se habilita después de elegir el lote.'
                    : relatedProspects.length === 0
                      ? 'Este lote no tiene prospectos vinculados. Asigná uno desde Clientes para continuar.'
                      : `${relatedProspects.length} prospecto${relatedProspects.length === 1 ? '' : 's'} vinculado${relatedProspects.length === 1 ? '' : 's'} a este lote.`}
                </span>
              </div>
            </div>
          </section>

          <section className="cob-form-section">
            <div className="cob-form-section-title">
              <span>2</span>
              <div>
                <h2>Términos económicos</h2>
                <p>La unidad define cómo se expresa el capital y cada cuota.</p>
              </div>
            </div>

            <SegmentedControl
              className="cob-unit-switch"
              value={form.unit_type}
              onChange={handleUnitChange}
              ariaLabel="Unidad de valor"
              disabled={submitting}
              stackOnMobile
              options={[
                { value: 'pesos', label: 'Pesos' },
                { value: 'dolares', label: 'Dólares' },
                { value: 'cemento', label: 'Cemento' },
              ]}
            />

            <div className="cob-form-grid">
              <div className="cob-field">
                <label htmlFor="contract-amount">
                  <CircleDollarSign size={14} />
                  {form.interest_enabled ? 'Capital financiado' : 'Monto total acordado'}
                </label>
                <FormattedNumberInput
                  id="contract-amount"
                  value={form.amount}
                  onChange={event => update('amount', event.target.value)}
                  placeholder="0,00"
                  disabled={submitting}
                />
              </div>

              <div className="cob-field">
                <label htmlFor="contract-installments">Cantidad de cuotas</label>
                <input
                  id="contract-installments"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={form.installments_count}
                  onChange={event => update('installments_count', event.target.value)}
                  disabled={submitting}
                />
              </div>

              <div className="cob-field cob-date-field">
                <label htmlFor="contract-date"><CalendarClock size={14} /> Fecha del contrato</label>
                <input
                  id="contract-date"
                  type="date"
                  value={form.contract_date}
                  onChange={event => updateContractDate(event.target.value)}
                  disabled={submitting}
                />
              </div>

              <div className="cob-field cob-date-field">
                <label htmlFor="contract-first-due"><CalendarClock size={14} /> Primer vencimiento</label>
                <input
                  id="contract-first-due"
                  type="date"
                  min={form.contract_date || undefined}
                  value={form.first_due_date}
                  onChange={event => update('first_due_date', event.target.value)}
                  disabled={submitting}
                />
                <span className="cob-field-help">
                  Las cuotas siguientes vencen mensualmente.
                </span>
              </div>

              {form.unit_type === 'pesos' && (
                <div className="cob-field cob-field--wide cob-reveal-field">
                  <label className="cob-toggle-row" htmlFor="contract-interest">
                    <input
                      id="contract-interest"
                      type="checkbox"
                      checked={form.interest_enabled}
                      onChange={event => update('interest_enabled', event.target.checked)}
                      disabled={submitting}
                    />
                    <span className="cob-toggle" aria-hidden="true"><i /></span>
                    <span>
                      Aplicar interés con sistema francés
                      <small>Cuota constante con componente de capital e interés.</small>
                    </span>
                  </label>
                </div>
              )}

              {form.interest_enabled && (
                <div className="cob-field cob-field--wide cob-reveal-field">
                  <label htmlFor="contract-interest-rate">Tasa mensual (%)</label>
                  <input
                    id="contract-interest-rate"
                    type="number"
                    min="0"
                    max={MAX_INTEREST_RATE_PERCENT}
                    step="0.01"
                    inputMode="decimal"
                    value={form.interest_rate_percent}
                    onChange={event => update('interest_rate_percent', event.target.value)}
                    placeholder="0,00"
                    disabled={submitting}
                  />
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="cob-plan-preview">
          <span className="cob-detail-eyebrow">Revisión</span>
          <h2>Plan estimado</h2>

          <div className="cob-plan-hero">
            <strong>
              <PreviewValue value={installmentSummary} />
            </strong>
            <PreviewValue value={unitSummary} />
          </div>

          <dl className="cob-plan-facts">
            <div><dt>Lote</dt><dd><PreviewValue value={lotSummary} /></dd></div>
            <div><dt>Comprador</dt><dd><PreviewValue value={prospectSummary} /></dd></div>
            <div>
              <dt>Primer vencimiento</dt>
              <dd><PreviewValue value={dueDateSummary} /></dd>
            </div>
            <div>
              <dt>{form.interest_enabled ? 'Capital' : 'Total'}</dt>
              <dd><PreviewValue value={amountSummary} /></dd>
            </div>
          </dl>

          <p className="cob-preview-note">
            La estimación orienta la revisión. El plan definitivo es el que devuelve el servidor al crear el contrato.
          </p>

          {error && <div className="cob-inline-error" role="alert">{error}</div>}

          <div className="cob-create-actions">
            <Button type="button" variant="outline" onClick={onBack} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" loading={submitting}>
              <Check size={16} />
              Crear contrato
            </Button>
          </div>
        </aside>
      </form>
    </div>
  );
}
