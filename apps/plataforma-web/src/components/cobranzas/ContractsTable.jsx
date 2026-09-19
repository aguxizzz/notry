import { ArrowRight, CalendarDays, Plus, WalletCards } from 'lucide-react';
import {
  Button,
  DataToolbar,
  SearchField,
  Select,
  SortHeader,
  TablePager,
} from '../../ui/components';
import { useTableSort } from '../../hooks/useTableSort';
import {
  contractProgress,
  contractState,
  formatContractAmount,
  formatContractDate,
  initials,
  isInstallmentOverdue,
  nextPendingInstallment,
} from './contractsFormat';

const CONTRACTS_PER_PAGE = 10;

const SORT_ACCESSORS = {
  lot: item => item.lot?.name || null,
  buyer: item => item.prospect?.name || null,
  progress: item => contractProgress(item.contract).percentage,
  due: item => {
    const next = nextPendingInstallment(item.contract);
    return next?.due_date ? new Date(next.due_date).getTime() : null;
  },
  state: item => contractState(item.contract).label,
};

function getRelativeDueCopy(installment) {
  if (!installment?.due_date) return 'Sin vencimiento';
  if (isInstallmentOverdue(installment)) return `Venció ${formatContractDate(installment.due_date, { withYear: false })}`;
  return formatContractDate(installment.due_date);
}

function ContractTableRow({ item, onOpen }) {
  const { contract, lot, prospect } = item;
  const progress = contractProgress(contract);
  const state = contractState(contract);
  const next = nextPendingInstallment(contract);

  const handleKeyDown = event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <tr
      className="cob-contract-table-row"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      aria-label={`Abrir contrato de ${lot?.name || 'lote'} con ${prospect?.name || 'comprador'}`}
    >
      <td className="cob-contract-lot">
        <strong>{lot?.name || 'Lote sin identificar'}</strong>
        <span>{lot?.loteo_name || 'Loteo sin identificar'}</span>
      </td>
      <td className="cob-contract-buyer">
        <div className="cob-contract-buyer-inner">
          <span className="cob-avatar" aria-hidden="true">{initials(prospect?.name)}</span>
          <div className="cob-contract-buyer-copy">
            <strong>{prospect?.name || 'Comprador sin identificar'}</strong>
            <span>{prospect?.phone || prospect?.email || 'Sin contacto'}</span>
          </div>
        </div>
      </td>
      <td className="cob-contract-progress">
        <div>
          <span>{progress.paid} / {progress.total} cuotas</span>
          <strong>{progress.percentage}%</strong>
        </div>
        <div className="cob-row-progress" aria-hidden="true">
          <i style={{ transform: `scaleX(${progress.percentage / 100})` }} />
        </div>
      </td>
      <td className={`cob-contract-due${state.key === 'overdue' ? ' is-overdue' : ''}`}>
        <strong>{state.key === 'completed' ? 'Saldado' : getRelativeDueCopy(next)}</strong>
        <span>
          {next
            ? `Cuota #${next.sequence_number} · ${formatContractAmount(next.amount, contract.unit_type)}`
            : 'Sin cuotas pendientes'}
        </span>
      </td>
      <td><span className={`cob-state cob-state--${state.key}`}>{state.label}</span></td>
      <td className="cob-contract-action"><ArrowRight size={17} aria-hidden="true" /></td>
    </tr>
  );
}

export default function ContractsTable({
  contracts,
  hasContracts,
  search,
  onSearchChange,
  dueFilter,
  dueFilters,
  onDueFilterChange,
  onOpen,
  onCreate,
}) {
  const { sort, handleSort, pageData, fillerRows, page, setPage, totalPages, total } = useTableSort(
    contracts,
    SORT_ACCESSORS,
    { perPage: CONTRACTS_PER_PAGE },
  );

  return (
    <>
      <DataToolbar className="cob-toolbar">
        <SearchField
          id="cobranzas-search"
          ariaLabel="Buscar contrato"
          value={search}
          onChange={event => onSearchChange(event.target.value)}
          placeholder="Buscar por lote, loteo o comprador…"
        />
        <div className="cob-due-filter">
          <CalendarDays size={15} aria-hidden="true" />
          <Select
            id="cobranzas-due-filter"
            className="cob-due-select"
            ariaLabel="Filtrar por vencimiento"
            value={dueFilter}
            onChange={event => onDueFilterChange(event.target.value)}
            options={dueFilters}
          />
        </div>
      </DataToolbar>

      {(search || dueFilter !== 'all') && (
        <div className="cob-filter-summary" role="status">
          <span>{total} {total === 1 ? 'contrato encontrado' : 'contratos encontrados'}</span>
          <button type="button" onClick={() => { onSearchChange(''); onDueFilterChange('all'); }}>
            Limpiar filtros
          </button>
        </div>
      )}

      <div className="inventory-table-wrapper cob-contract-table-wrapper">
        <table className="inventory-table cob-contract-table">
          <caption className="sr-only">Lista de contratos de cobranzas</caption>
          <thead>
            <tr>
              <SortHeader label="Lote" sortKey="lot" sort={sort} onSort={handleSort} />
              <SortHeader label="Comprador" sortKey="buyer" sort={sort} onSort={handleSort} />
              <SortHeader label="Avance" sortKey="progress" sort={sort} onSort={handleSort} className="cob-th-progress" />
              <SortHeader label="Próximo pago" sortKey="due" sort={sort} onSort={handleSort} className="cob-th-due" />
              <SortHeader label="Estado" sortKey="state" sort={sort} onSort={handleSort} />
              <th scope="col" aria-label="Abrir contrato" />
            </tr>
          </thead>
          <tbody>
            {total === 0 ? (
              <tr>
                <td colSpan={6} className="td-empty-row">
                  <WalletCards size={25} />
                  <strong>{hasContracts ? 'No encontramos coincidencias' : 'Todavía no hay contratos'}</strong>
                  <span>
                    {hasContracts
                      ? 'Probá con otra búsqueda o cambiá el filtro de vencimiento.'
                      : 'Creá el primer contrato para comenzar el seguimiento de cuotas.'}
                  </span>
                  {!hasContracts && onCreate && (
                    <Button size="sm" onClick={onCreate}>
                      <Plus size={15} />
                      Crear contrato
                    </Button>
                  )}
                </td>
              </tr>
            ) : (
              <>
                {pageData.map(item => (
                  <ContractTableRow item={item} key={item.contract.id} onOpen={() => onOpen(item.contract.id)} />
                ))}
                {Array.from({ length: fillerRows }).map((_, index) => (
                  <tr key={`filler-${index}`} className="table-filler-row" aria-hidden="true">
                    <td colSpan={6}>&nbsp;</td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
        {totalPages > 1 && (
          <TablePager
            page={page}
            totalPages={totalPages}
            total={total}
            perPage={CONTRACTS_PER_PAGE}
            onPage={setPage}
          />
        )}
      </div>
    </>
  );
}
