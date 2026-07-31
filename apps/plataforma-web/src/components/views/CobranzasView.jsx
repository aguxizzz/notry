import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Plus,
  RefreshCw,
  ShieldAlert,
  WalletCards,
} from 'lucide-react';
import { fetchContractAdvisors } from '../../api/contracts';
import {
  Button,
  FeedbackState,
  PageHeader,
  PageLayout,
  SummaryBand,
  SummaryMetric,
} from '../../ui/components';
import ConfirmModal from '../ConfirmModal';
import ContractDetail from '../cobranzas/ContractDetail';
import CreateContractForm from '../cobranzas/CreateContractForm';
import ContractsTable from '../cobranzas/ContractsTable';
import {
  contractProgress,
  formatArsApprox,
  formatContractAmount,
  formatContractDate,
  isInstallmentOverdue,
} from '../cobranzas/contractsFormat';
import './CobranzasView.css';

const DUE_FILTERS = [
  { value: 'all', label: 'Cualquier vencimiento' },
  { value: 'overdue', label: 'Con cuotas vencidas' },
  { value: 'upcoming', label: 'Próximos 7 días' },
  { value: 'without-date', label: 'Sin vencimiento' },
];

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function matchesDueFilter(contract, dueFilter) {
  if (dueFilter === 'all') return true;
  const installments = contract.installments || [];
  if (dueFilter === 'overdue') return installments.some(isInstallmentOverdue);

  const pending = installments.filter(item => item.status === 'pending');
  if (dueFilter === 'without-date') return pending.some(item => !item.due_date);
  if (dueFilter !== 'upcoming') return true;

  const today = startOfToday();
  const limit = new Date(today);
  limit.setDate(limit.getDate() + 7);
  return pending.some(item => {
    if (!item.due_date) return false;
    const due = new Date(item.due_date);
    return due >= today && due <= limit;
  });
}

function DueList({ title, icon, items, emptyCopy, tone = 'neutral' }) {
  return (
    <section className={`cob-due-card cob-due-card--${tone}`}>
      <div className="cob-due-card-head">
        <div>
          {icon}
          <h2>{title}</h2>
        </div>
        <span>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="cob-due-empty">
          <CheckCircle2 size={19} />
          {emptyCopy}
        </div>
      ) : (
        <div className="cob-due-list">
          {items.slice(0, 5).map(({ installment, contract, lot, prospect }) => (
            <div className="cob-due-item" key={installment.id}>
              <div className="cob-date-block">
                <strong>{formatContractDate(installment.due_date, { withYear: false }).split(' ')[0]}</strong>
                <span>{new Intl.DateTimeFormat('es-AR', { month: 'short' }).format(new Date(installment.due_date))}</span>
              </div>
              <div>
                <strong>{prospect?.name || 'Comprador sin identificar'}</strong>
                <span>{lot?.name || 'Lote'} · cuota #{installment.sequence_number}</span>
              </div>
              <strong className="cob-due-amount">{formatContractAmount(installment.amount, contract.unit_type)}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function CobranzasView({
  apiFetch,
  inventoryLots = [],
  allProspectosList = [],
  advisorsList = [],
  contractsState,
}) {
  const {
    contracts,
    loading,
    refreshing,
    error,
    reload,
    createContract,
    deleteContract,
    payInstallment,
  } = contractsState;
  const [screen, setScreen] = useState('list');
  const [selectedContractId, setSelectedContractId] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingContract, setDeletingContract] = useState(false);
  const [search, setSearch] = useState('');
  const [dueFilter, setDueFilter] = useState('all');
  const [fetchedAdvisors, setFetchedAdvisors] = useState([]);
  const [advisorsLoading, setAdvisorsLoading] = useState(advisorsList.length === 0);

  useEffect(() => {
    if (advisorsList.length > 0) return;

    let active = true;
    fetchContractAdvisors(apiFetch)
      .then(data => {
        if (active) setFetchedAdvisors(data);
      })
      .catch(() => {
        if (active) setFetchedAdvisors([]);
      })
      .finally(() => {
        if (active) setAdvisorsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [apiFetch, advisorsList]);

  const contractAdvisors = advisorsList.length > 0 ? advisorsList : fetchedAdvisors;
  const contractAdvisorsLoading = advisorsList.length === 0 && advisorsLoading;

  const enrichedContracts = useMemo(() => contracts.map(contract => ({
    contract,
    lot: inventoryLots.find(lot => String(lot.id) === String(contract.lote_id)),
    prospect: allProspectosList.find(prospect => String(prospect.id) === String(contract.prospect_id)),
    advisor: contractAdvisors.find(advisor => String(advisor.id) === String(contract.sold_by_advisor_id)),
  })), [contracts, inventoryLots, allProspectosList, contractAdvisors]);

  const selectedItem = enrichedContracts.find(item => item.contract.id === selectedContractId);
  const isPermissionError = /asesor|administrador|permis|acceso/i.test(error);

  const filteredContracts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es');
    return enrichedContracts.filter(item => {
      const matchesDue = matchesDueFilter(item.contract, dueFilter);
      const haystack = [
        item.lot?.name,
        item.lot?.loteo_name,
        item.prospect?.name,
        item.prospect?.email,
        item.prospect?.phone,
      ].filter(Boolean).join(' ').toLocaleLowerCase('es');
      return matchesDue && (!query || haystack.includes(query));
    });
  }, [enrichedContracts, dueFilter, search]);

  const portfolio = useMemo(() => {
    const active = enrichedContracts.filter(item => item.contract.status !== 'cancelled');
    const paidCount = active.reduce((sum, item) => sum + contractProgress(item.contract).paid, 0);
    const totalCount = active.reduce((sum, item) => sum + contractProgress(item.contract).total, 0);
    const arsPending = active.reduce(
      (sum, item) => sum + Number(item.contract.total_pending_ars_approx || 0),
      0,
    );
    const installments = active.flatMap(item => (item.contract.installments || []).map(installment => ({
      ...item,
      installment,
    })));
    const overdue = installments
      .filter(item => isInstallmentOverdue(item.installment))
      .sort((a, b) => new Date(a.installment.due_date) - new Date(b.installment.due_date));
    const today = startOfToday();
    const upcomingLimit = new Date(today);
    upcomingLimit.setDate(upcomingLimit.getDate() + 7);
    const upcoming = installments
      .filter(item => {
        if (item.installment.status !== 'pending' || !item.installment.due_date) return false;
        const due = new Date(item.installment.due_date);
        return due >= today && due <= upcomingLimit;
      })
      .sort((a, b) => new Date(a.installment.due_date) - new Date(b.installment.due_date));

    return {
      activeCount: active.length,
      progress: totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 0,
      paidCount,
      totalCount,
      arsPending,
      overdue,
      upcoming,
      overdueBuyers: new Set(overdue.map(item => item.contract.prospect_id)).size,
    };
  }, [enrichedContracts]);

  const openDetail = (contractId) => {
    setSelectedContractId(contractId);
    setScreen('detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCreate = async (body) => {
    const created = await createContract(body);
    if (created?.id) {
      setSelectedContractId(created.id);
      setScreen('detail');
    } else {
      setScreen('list');
    }
  };

  const handleDeleteContract = async () => {
    if (!selectedContractId) return;

    setDeletingContract(true);
    try {
      await deleteContract(selectedContractId);
      setDeleteDialogOpen(false);
      setSelectedContractId(null);
      setScreen('list');
    } finally {
      setDeletingContract(false);
    }
  };

  if (screen === 'create') {
    return (
      <div className="cobranzas-view">
        <CreateContractForm
          lots={inventoryLots}
          prospects={allProspectosList}
          advisors={contractAdvisors}
          advisorsLoading={contractAdvisorsLoading}
          onBack={() => setScreen('list')}
          onCreate={handleCreate}
        />
      </div>
    );
  }

  if (screen === 'detail' && selectedItem) {
    return (
      <div className="cobranzas-view">
        <ContractDetail
          {...selectedItem}
          onBack={() => {
            setScreen('list');
            setSelectedContractId(null);
          }}
          onPayInstallment={payInstallment}
          onDelete={() => setDeleteDialogOpen(true)}
        />
        <ConfirmModal
          isOpen={deleteDialogOpen}
          title="¿Eliminar contrato definitivamente?"
          message="Se eliminarán el contrato, todas sus cuotas y los pagos registrados. Esta acción no se puede deshacer."
          confirmLabel="Eliminar contrato"
          loading={deletingContract}
          onConfirm={handleDeleteContract}
          onCancel={() => {
            if (!deletingContract) setDeleteDialogOpen(false);
          }}
        />
      </div>
    );
  }

  return (
    <PageLayout className="cobranzas-view">
      <PageHeader
        eyebrow="Cartera de contratos"
        title="Cobranzas"
        description="Cuotas, vencimientos y saldo pendiente en un único seguimiento."
        actions={
          <>
            <button
              type="button"
              className="cob-refresh"
              onClick={reload}
              disabled={refreshing}
              aria-label="Actualizar contratos"
            >
              <RefreshCw size={16} className={refreshing ? 'is-spinning' : ''} />
              <span>{refreshing ? 'Actualizando' : 'Actualizar'}</span>
            </button>
            <Button size="sm" onClick={() => setScreen('create')} disabled={Boolean(error)}>
              <Plus size={16} />
              Nuevo contrato
            </Button>
          </>
        }
      />

      {loading ? (
        <FeedbackState
          className="cob-feedback"
          busy
          title="Cargando cartera"
          description="Consultando contratos y planes de cuotas…"
        />
      ) : error ? (
        <FeedbackState
          className="cob-feedback"
          role="alert"
          tone="danger"
          icon={isPermissionError ? <ShieldAlert size={24} /> : <AlertTriangle size={24} />}
          title={isPermissionError
            ? 'Cobranzas todavía no está habilitado para tu rol'
            : 'No pudimos cargar Cobranzas'}
          description={isPermissionError
            ? 'El backend permite gestionar contratos a asesores y administradores, pero esta cuenta ingresa como propietaria del loteo.'
            : error}
          action={!isPermissionError && (
            <Button size="sm" variant="outline" onClick={reload}>Reintentar</Button>
          )}
        />
      ) : (
        <>
          <SummaryBand
            className="cob-portfolio"
            aria-label="Resumen de cartera"
            lead={
              <div className="cob-portfolio-lead">
                <span>Avance de cartera activa</span>
                <strong>{portfolio.progress}%</strong>
                <div className="cob-portfolio-track" aria-hidden="true">
                  <i style={{ transform: `scaleX(${portfolio.progress / 100})` }} />
                </div>
                <small>{portfolio.paidCount} de {portfolio.totalCount} cuotas canceladas</small>
              </div>
            }
          >
            <SummaryMetric
              icon={<WalletCards size={17} />}
              label="Saldo pendiente"
              hint="aprox. en ARS"
              value={formatArsApprox(portfolio.arsPending)}
            />
            <SummaryMetric
              icon={<AlertTriangle size={17} />}
              label="Cuotas vencidas"
              hint={`${portfolio.overdueBuyers} compradores`}
              value={portfolio.overdue.length}
              tone={portfolio.overdue.length > 0 ? 'danger' : 'neutral'}
            />
            <SummaryMetric
              icon={<CreditCard size={17} />}
              label="Contratos activos"
              hint="en seguimiento"
              value={portfolio.activeCount}
            />
          </SummaryBand>

          <section className="cob-contracts">
            <ContractsTable
              contracts={filteredContracts}
              hasContracts={enrichedContracts.length > 0}
              search={search}
              onSearchChange={setSearch}
              dueFilter={dueFilter}
              dueFilters={DUE_FILTERS}
              onDueFilterChange={setDueFilter}
              onOpen={openDetail}
              onCreate={() => setScreen('create')}
            />
          </section>

          <div className="cob-due-grid">
            <DueList
              title="Cuotas vencidas"
              icon={<AlertTriangle size={17} />}
              items={portfolio.overdue}
              emptyCopy="No hay cuotas vencidas."
              tone="alert"
            />
            <DueList
              title="Próximos 7 días"
              icon={<CalendarDays size={17} />}
              items={portfolio.upcoming}
              emptyCopy="No hay vencimientos en los próximos 7 días."
            />
          </div>
        </>
      )}
    </PageLayout>
  );
}
