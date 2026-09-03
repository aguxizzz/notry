import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CircleDollarSign,
  History,
  KeyRound,
  Landmark,
  MessageCircle,
  ReceiptText,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { Button } from '../../ui/components';
import {
  contractProgress,
  contractState,
  formatContractAmount,
  formatContractDate,
  initials,
  isInstallmentOverdue,
  unitLabel,
} from './contractsFormat';
import FormattedNumberInput from './FormattedNumberInput';
import BuyerAccessPanel from './BuyerAccessPanel';
import '../../ui/components/Modal.css';

const INSTALLMENTS_BEFORE_CURRENT = 3;
const INSTALLMENTS_AFTER_CURRENT = 6;
const VISIBLE_PAYMENT_HISTORY_LIMIT = 5;

const localDateTimeInputValue = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 16);
};

const installmentPaidAmount = installment => Number(installment?.paid_amount || 0);

const installmentRemainingAmount = (installment) => {
  if (installment?.remaining_amount != null) {
    return Math.max(Number(installment.remaining_amount) || 0, 0);
  }
  return Math.max(Number(installment?.amount || 0) - installmentPaidAmount(installment), 0);
};

const formatPaymentDate = (value) => {
  if (!value) return 'Fecha no informada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha no informada';
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

function PaymentPanel({ installment, unitType, maxPayable, orgRate, loading, onCancel, onConfirm }) {
  const installmentRemaining = installmentRemainingAmount(installment);
  const [amount, setAmount] = useState(String(installmentRemaining));
  const [paidAt, setPaidAt] = useState(localDateTimeInputValue);
  const [error, setError] = useState('');
  const isQuotedUnit = unitType === 'dolares' || unitType === 'cemento';
  const availableAmount = Number(maxPayable ?? installmentRemaining);
  const parsedAmount = Number(amount);
  const paymentImpact = useMemo(() => {
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return null;
    if (parsedAmount < installmentRemaining - 0.01) {
      return {
        tone: 'partial',
        title: 'Pago parcial',
        copy: `La cuota quedará con ${formatContractAmount(
          installmentRemaining - parsedAmount,
          unitType,
        )} pendientes.`,
      };
    }
    if (parsedAmount > installmentRemaining + 0.01) {
      return {
        tone: 'excess',
        title: 'Pago con excedente',
        copy: `${formatContractAmount(
          parsedAmount - installmentRemaining,
          unitType,
        )} se aplicarán a las cuotas siguientes.`,
      };
    }
    return {
      tone: 'full',
      title: 'Cancelación completa',
      copy: 'Esta cuota quedará pagada.',
    };
  }, [installmentRemaining, parsedAmount, unitType]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Ingresá un monto válido.');
      return;
    }
    if (parsedAmount > availableAmount + 0.01) {
      setError(`El importe supera el saldo disponible de ${formatContractAmount(availableAmount, unitType)}.`);
      return;
    }
    if (!paidAt) {
      setError('Indicá la fecha del pago.');
      return;
    }

    const body = {
      amount: parsedAmount,
      paid_at: new Date(paidAt).toISOString(),
    };
    if (isQuotedUnit) {
      const parsedRate = Number(orgRate);
      if (Number.isFinite(parsedRate) && parsedRate > 0) {
        if (unitType === 'dolares') body.rate_ars_per_usd = parsedRate;
        if (unitType === 'cemento') body.rate_ars_per_cement_bag = parsedRate;
      }
    }

    setError('');
    try {
      await onConfirm(body);
    } catch (submitError) {
      setError(submitError.message || 'No pudimos registrar el pago.');
    }
  };

  return (
    <aside className="cob-payment-panel" aria-labelledby="payment-panel-title">
      <div className="cob-payment-head">
        <div>
          <span className="cob-detail-eyebrow">Registrar pago</span>
          <h3 id="payment-panel-title">Cuota #{installment.sequence_number}</h3>
        </div>
        <button type="button" className="cob-icon-btn" onClick={onCancel} aria-label="Cerrar registro de pago">
          <X size={18} />
        </button>
      </div>

      <form className="cob-payment-form" onSubmit={handleSubmit}>
        <div className="cob-field">
          <label htmlFor="payment-amount">Importe a registrar</label>
          <div className="cob-input-affix">
            <span>{unitType === 'pesos' ? '$' : unitType === 'dolares' ? 'USD' : 'Bolsas'}</span>
            <FormattedNumberInput
              id="payment-amount"
              value={amount}
              onChange={event => setAmount(event.target.value)}
              disabled={loading}
            />
          </div>
          <span className="cob-field-help">
            Cuota: {formatContractAmount(installmentRemaining, unitType)}
            {availableAmount > installmentRemaining
              ? ` · disponible hasta ${formatContractAmount(availableAmount, unitType)}`
              : ''}
          </span>
        </div>

        <div className="cob-field cob-date-field">
          <label htmlFor="payment-date">Fecha del pago</label>
          <input
            id="payment-date"
            type="datetime-local"
            value={paidAt}
            onChange={event => setPaidAt(event.target.value)}
            disabled={loading}
          />
        </div>

        {paymentImpact && (
          <div
            key={`${paymentImpact.tone}-${paymentImpact.copy}`}
            className={`cob-payment-impact cob-payment-impact--${paymentImpact.tone}`}
            role="status"
          >
            <strong>{paymentImpact.title}</strong>
            <span>{paymentImpact.copy}</span>
          </div>
        )}
        {error && <div className="cob-inline-error" role="alert">{error}</div>}

        <div className="cob-payment-actions">
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" loading={loading}>
            <Check size={15} />
            Confirmar pago
          </Button>
        </div>
      </form>
    </aside>
  );
}

function PaymentHistoryRow({ payment, unitType }) {
  const sequences = payment.allocations
    .map(allocation => allocation.sequenceNumber)
    .filter(sequence => sequence != null);
  const allocationLabel = sequences.length === 1
    ? `Cuota #${sequences[0]}`
    : `Cuotas ${sequences.map(sequence => `#${sequence}`).join(', ')}`;
  const rate = payment.allocations.find(allocation => allocation.rate)?.rate;

  return (
    <article className="cob-payment-history-row">
      <span className="cob-payment-history-icon" aria-hidden="true">
        <Check size={15} />
      </span>
      <div className="cob-payment-history-main">
        <strong>{allocationLabel}</strong>
        <span>{formatPaymentDate(payment.paidAt)}</span>
      </div>
      <div className="cob-payment-history-value">
        <strong>{formatContractAmount(payment.amount, unitType)}</strong>
        {rate && (
          <span>
            Cotización: {formatContractAmount(rate, 'pesos')}
          </span>
        )}
      </div>
    </article>
  );
}

function PaymentHistory({ payments, unitType, onShowAll }) {
  const visiblePayments = payments.slice(0, VISIBLE_PAYMENT_HISTORY_LIMIT);
  const hasMore = payments.length > visiblePayments.length;

  return (
    <section className="cob-payment-history" aria-labelledby="payment-history-title">
      <div className="cob-section-heading">
        <div>
          <span className="cob-detail-eyebrow">Movimientos registrados</span>
          <h2 id="payment-history-title">Historial de pagos</h2>
        </div>
        <History size={20} aria-hidden="true" />
      </div>

      {payments.length === 0 ? (
        <p className="cob-payment-history-empty">Todavía no hay pagos registrados.</p>
      ) : (
        <div className="cob-payment-history-list">
          {visiblePayments.map(payment => (
            <PaymentHistoryRow key={payment.id} payment={payment} unitType={unitType} />
          ))}
        </div>
      )}

      {hasMore && (
        <button type="button" className="cob-show-all" onClick={onShowAll}>
          Ver historial completo
        </button>
      )}
    </section>
  );
}

function PaymentHistoryModal({ isOpen, onClose, payments, unitType }) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-overlay" onMouseDown={onClose}>
      <section
        className="modal-card modal-card--wide cob-installments-modal cobranzas-view"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-history-modal-title"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="cob-installments-modal__header">
          <div>
            <span className="cob-detail-eyebrow">Movimientos registrados</span>
            <h2 id="payment-history-modal-title">Historial completo ({payments.length})</h2>
          </div>
          <button type="button" className="cob-icon-btn" onClick={onClose} aria-label="Cerrar historial completo">
            <X size={18} />
          </button>
        </header>

        <div className="cob-installments-modal__body">
          <div className="cob-payment-history-list">
            {payments.map(payment => (
              <PaymentHistoryRow key={payment.id} payment={payment} unitType={unitType} />
            ))}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function InstallmentRow({ installment, contract, isCurrent, onSelect }) {
  const overdue = isInstallmentOverdue(installment);
  const paid = installment.status === 'paid';
  const paidOnInstallment = installmentPaidAmount(installment);
  const remainingOnInstallment = installmentRemainingAmount(installment);
  const partial = !paid && paidOnInstallment > 0;
  const statusKey = paid ? 'paid' : partial ? 'partial' : overdue ? 'overdue' : 'pending';
  const statusLabel = paid ? 'Pagada' : partial ? 'Parcial' : overdue ? 'Vencida' : 'Pendiente';

  return (
    <div
      className={`cob-installment-row${overdue ? ' is-overdue' : ''}${paid ? ' is-paid' : ''}${partial ? ' is-partial' : ''}${isCurrent ? ' is-current' : ''}`}
      role="row"
    >
      <span role="cell" className="cob-installment-number">#{installment.sequence_number}</span>
      <span role="cell">{formatContractDate(installment.due_date)}</span>
      <span role="cell" className="cob-installment-amount">
        <strong>{formatContractAmount(installment.amount, contract.unit_type)}</strong>
        {partial && (
          <small>Restan {formatContractAmount(remainingOnInstallment, contract.unit_type)}</small>
        )}
      </span>
      <span role="cell">
        <span className={`cob-installment-status cob-installment-status--${statusKey}`}>
          {statusLabel}
        </span>
      </span>
      <span role="cell" className="cob-installment-action">
        {isCurrent && contract.status !== 'cancelled' && (
          <button
            type="button"
            onClick={() => onSelect(installment)}
            aria-label={`Registrar pago de cuota ${installment.sequence_number}`}
          >
            <CircleDollarSign size={14} aria-hidden="true" />
            Registrar pago
          </button>
        )}
      </span>
    </div>
  );
}

function InstallmentsModal({ isOpen, onClose, installments, contract, currentInstallmentId, onSelect }) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-overlay" onMouseDown={onClose}>
      <section
        className="modal-card modal-card--wide cob-installments-modal cobranzas-view"
        role="dialog"
        aria-modal="true"
        aria-labelledby="installments-modal-title"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="cob-installments-modal__header">
          <div>
            <span className="cob-detail-eyebrow">Plan completo</span>
            <h2 id="installments-modal-title">Todas las cuotas ({installments.length})</h2>
          </div>
          <button type="button" className="cob-icon-btn" onClick={onClose} aria-label="Cerrar plan completo">
            <X size={18} />
          </button>
        </header>

        <div className="cob-installments-modal__body">
          <div className="cob-installment-table" role="table" aria-label="Todas las cuotas del contrato">
            <div className="cob-installment-row cob-installment-row--head" role="row">
              <span role="columnheader">Cuota</span>
              <span role="columnheader">Vencimiento</span>
              <span role="columnheader">Importe</span>
              <span role="columnheader">Estado</span>
              <span role="columnheader">Acción</span>
            </div>

            {installments.map(installment => (
              <InstallmentRow
                key={installment.id}
                installment={installment}
                contract={contract}
                isCurrent={installment.id === currentInstallmentId}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}

export default function ContractDetail({
  contract,
  lot,
  prospect,
  advisor,
  onBack,
  onDelete,
  onPayInstallment,
  apiFetch,
  onAddBuyerEmail,
  orgCementRate,
  orgUsdRate,
}) {
  const [installmentsModalOpen, setInstallmentsModalOpen] = useState(false);
  const [paymentHistoryModalOpen, setPaymentHistoryModalOpen] = useState(false);
  const [buyerAccessOpen, setBuyerAccessOpen] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const progress = contractProgress(contract);
  const state = contractState(contract);
  const installments = useMemo(
    () => [...(contract.installments || [])].sort((a, b) => a.sequence_number - b.sequence_number),
    [contract.installments],
  );
  const currentInstallmentIndex = installments.findIndex(item => item.status !== 'paid');
  const currentInstallmentId = currentInstallmentIndex >= 0 ? installments[currentInstallmentIndex].id : null;
  const windowStart = currentInstallmentIndex === -1
    ? Math.max(0, installments.length - (INSTALLMENTS_BEFORE_CURRENT + INSTALLMENTS_AFTER_CURRENT + 1))
    : Math.max(0, currentInstallmentIndex - INSTALLMENTS_BEFORE_CURRENT);
  const windowEnd = currentInstallmentIndex === -1
    ? installments.length
    : Math.min(installments.length, currentInstallmentIndex + INSTALLMENTS_AFTER_CURRENT + 1);
  const isWindowed = windowStart > 0 || windowEnd < installments.length;
  const displayedInstallments = installments.slice(windowStart, windowEnd);
  const orgRate = contract.unit_type === 'dolares'
    ? orgUsdRate
    : contract.unit_type === 'cemento'
      ? orgCementRate
      : null;
  const pendingAmount = contract.total_pending_amount
    ?? installments.reduce((sum, item) => sum + installmentRemainingAmount(item), 0);
  const paidAmount = Math.max(Number(contract.total_amount || 0) - Number(pendingAmount || 0), 0);
  const selectedInstallmentIndex = selectedInstallment
    ? installments.findIndex(item => item.id === selectedInstallment.id)
    : -1;
  const selectedMaxPayable = selectedInstallmentIndex >= 0
    ? installments
      .slice(selectedInstallmentIndex)
      .reduce((sum, item) => sum + installmentRemainingAmount(item), 0)
    : 0;
  const paymentHistory = useMemo(() => {
    const grouped = new Map();

    installments.forEach((installment) => {
      (installment.payments || []).forEach((payment) => {
        const groupId = payment.payment_batch_id || payment.id;
        const existing = grouped.get(groupId) || {
          id: groupId,
          amount: 0,
          paidAt: payment.paid_at || payment.created_at,
          allocations: [],
        };
        existing.amount += Number(payment.amount || 0);
        existing.allocations.push({
          sequenceNumber: installment.sequence_number,
          rate: payment.rate_ars_per_usd || payment.rate_ars_per_cement_bag,
        });
        grouped.set(groupId, existing);
      });
    });

    return [...grouped.values()].sort(
      (a, b) => new Date(b.paidAt || 0).getTime() - new Date(a.paidAt || 0).getTime(),
    );
  }, [installments]);

  const handlePayment = async (body) => {
    setPaymentLoading(true);
    // The portfolio is updated optimistically by useContracts; close the
    // editor immediately and let the request reconcile in the background.
    setSelectedInstallment(null);
    setPaymentLoading(false);
    void onPayInstallment(selectedInstallment.id, body);
  };

  const phoneHref = prospect?.phone
    ? `https://wa.me/${String(prospect.phone).replace(/\D/g, '')}`
    : '';

  return (
    <div className="cob-detail">
      <button type="button" className="cob-back" onClick={onBack}>
        <ArrowLeft size={16} />
        Volver a Cobranzas
      </button>

      <header className="cob-detail-header">
        <div className="cob-detail-identity">
          <span className="cob-detail-eyebrow">{lot?.loteo_name || 'Contrato de venta'}</span>
          <div className="cob-detail-title-row">
            <h1>{lot?.name || 'Lote sin identificar'}</h1>
            <span className={`cob-state cob-detail-state cob-state--${state.key}`}>
              <i aria-hidden="true" />
              {state.label}
            </span>
          </div>
          <p>
            {prospect?.name || 'Comprador sin identificar'}
            <span aria-hidden="true"> · </span>
            {progress.total} cuotas en {unitLabel(contract.unit_type).toLowerCase()}
          </p>
        </div>
        <div className="cob-detail-actions">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setBuyerAccessOpen(true)}
          >
            <KeyRound size={15} aria-hidden="true" />
            Portal comprador
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="btn-danger"
            onClick={onDelete}
          >
            <Trash2 size={15} aria-hidden="true" />
            Eliminar contrato
          </Button>
        </div>
      </header>

      <section className="cob-detail-summary" aria-label="Resumen del contrato">
        <div>
          <span>Total del contrato</span>
          <strong>{formatContractAmount(contract.total_amount, contract.unit_type)}</strong>
        </div>
        <div>
          <span>Pagado</span>
          <strong>{formatContractAmount(paidAmount, contract.unit_type)}</strong>
        </div>
        <div>
          <span>Saldo pendiente</span>
          <strong>{formatContractAmount(pendingAmount, contract.unit_type)}</strong>
        </div>
        <div>
          <span>Fecha del contrato</span>
          <strong>{formatContractDate(contract.contract_date)}</strong>
        </div>
      </section>

      <div className={`cob-detail-layout${selectedInstallment ? ' has-payment' : ''}`}>
        <section className="cob-installments">
          <div className="cob-section-heading">
            <div>
              <span className="cob-detail-eyebrow">Seguimiento auditable</span>
              <h2>Plan de cuotas</h2>
            </div>
            <span className="cob-progress-copy">{progress.percentage}% cobrado</span>
          </div>

          <div
            className="cob-progress-track"
            role="progressbar"
            aria-label="Avance del contrato"
            aria-valuenow={progress.percentage}
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <i style={{ transform: `scaleX(${progress.percentage / 100})` }} />
          </div>

          {isWindowed && (
            <p className="cob-installment-window-note">
              Mostrando cuotas {windowStart + 1}–{windowEnd} de {installments.length}.
            </p>
          )}

          <div className="cob-installment-table" role="table" aria-label="Cuotas del contrato">
            <div className="cob-installment-row cob-installment-row--head" role="row">
              <span role="columnheader">Cuota</span>
              <span role="columnheader">Vencimiento</span>
              <span role="columnheader">Importe</span>
              <span role="columnheader">Estado</span>
              <span role="columnheader">Acción</span>
            </div>

            {displayedInstallments.map(installment => (
              <InstallmentRow
                key={installment.id}
                installment={installment}
                contract={contract}
                isCurrent={installment.id === currentInstallmentId}
                onSelect={setSelectedInstallment}
              />
            ))}
          </div>

          {installments.length > windowEnd - windowStart && (
            <button
              type="button"
              className="cob-show-all"
              onClick={() => setInstallmentsModalOpen(true)}
            >
              Ver plan completo
            </button>
          )}

          {!contract.detailAvailable && (
            <div className="cob-inline-error" role="status">
              El resumen está disponible, pero no se pudo consultar el plan de cuotas.
            </div>
          )}
        </section>

        {selectedInstallment && (
          <PaymentPanel
            key={selectedInstallment.id}
            installment={selectedInstallment}
            unitType={contract.unit_type}
            maxPayable={selectedMaxPayable}
            orgRate={orgRate}
            loading={paymentLoading}
            onCancel={() => setSelectedInstallment(null)}
            onConfirm={handlePayment}
          />
        )}
      </div>

      <PaymentHistory
        payments={paymentHistory}
        unitType={contract.unit_type}
        onShowAll={() => setPaymentHistoryModalOpen(true)}
      />

      <section className="cob-contract-meta">
        <div className="cob-meta-block">
          <div className="cob-meta-title"><ReceiptText size={17} /> Datos del contrato</div>
          <dl>
            <div><dt>Identificador</dt><dd>{contract.id}</dd></div>
            <div><dt>Unidad</dt><dd>{unitLabel(contract.unit_type)}</dd></div>
            <div>
              <dt>Interés</dt>
              <dd>
                {contract.interest_rate_percent
                  ? `${contract.interest_rate_percent}% ${contract.interest_periodicity || ''}`
                  : 'Sin interés informado'}
              </dd>
            </div>
          </dl>
        </div>

        <div className="cob-meta-block">
          <div className="cob-meta-title"><UserRound size={17} /> Comprador y gestión</div>
          <div className="cob-contact">
            <span className="cob-contact-avatar">{initials(prospect?.name)}</span>
            <div>
              <strong>{prospect?.name || 'Sin identificar'}</strong>
              <span>{prospect?.phone || prospect?.email || 'Sin datos de contacto'}</span>
            </div>
          </div>
          <dl>
            <div><dt><Landmark size={14} /> Loteo</dt><dd>{lot?.loteo_name || '—'}</dd></div>
            <div><dt><CircleDollarSign size={14} /> Asesor</dt><dd>{advisor?.full_name || 'Sin asesor asignado'}</dd></div>
            <div><dt><CalendarDays size={14} /> Alta</dt><dd>{formatContractDate(contract.contract_date)}</dd></div>
          </dl>
          {phoneHref && (
            <a className="cob-whatsapp" href={phoneHref} target="_blank" rel="noreferrer">
              <MessageCircle size={16} />
              Recordar por WhatsApp
            </a>
          )}
        </div>
      </section>

      <BuyerAccessPanel
        isOpen={buyerAccessOpen}
        onClose={() => setBuyerAccessOpen(false)}
        apiFetch={apiFetch}
        contract={contract}
        lot={lot}
        prospect={prospect}
        onAddBuyerEmail={onAddBuyerEmail}
      />

      <InstallmentsModal
        isOpen={installmentsModalOpen}
        onClose={() => setInstallmentsModalOpen(false)}
        installments={installments}
        contract={contract}
        currentInstallmentId={currentInstallmentId}
        onSelect={(installment) => {
          setInstallmentsModalOpen(false);
          setSelectedInstallment(installment);
        }}
      />

      <PaymentHistoryModal
        isOpen={paymentHistoryModalOpen}
        onClose={() => setPaymentHistoryModalOpen(false)}
        payments={paymentHistory}
        unitType={contract.unit_type}
      />
    </div>
  );
}
