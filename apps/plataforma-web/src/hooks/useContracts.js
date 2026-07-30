import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createContract as createContractRequest,
  deleteContract as deleteContractRequest,
  fetchContractsPortfolio,
  payInstallment as payInstallmentRequest,
} from '../api/contracts';

function installmentRemaining(installment) {
  if (installment?.remaining_amount != null) {
    return Math.max(Number(installment.remaining_amount) || 0, 0);
  }
  return Math.max(
    Number(installment?.amount || 0) - Number(installment?.paid_amount || 0),
    0,
  );
}

export function useContracts({ apiFetch, addToast, enabled = true }) {
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const requestIdRef = useRef(0);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!enabled) return;

    const requestId = ++requestIdRef.current;
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const portfolio = await fetchContractsPortfolio(apiFetch);

      if (requestId !== requestIdRef.current) return;
      setContracts(portfolio);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) return;
      setError(loadError.message || 'No pudimos cargar los contratos.');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoaded(true);
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [apiFetch, enabled]);

  useEffect(() => {
    if (!enabled) {
      requestIdRef.current += 1;
      setContracts([]);
      setLoading(false);
      setLoaded(false);
      setRefreshing(false);
      setError('');
      return;
    }

    load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [enabled, load]);

  const createContract = useCallback(async (body) => {
    const created = await createContractRequest(apiFetch, body);
    addToast?.('Contrato creado.', 'success');
    await load({ quiet: true });
    return created;
  }, [apiFetch, addToast, load]);

  const payInstallment = useCallback(async (installmentId, body) => {
    const optimisticPaymentId = `optimistic-payment-${Date.now()}`;
    const previousContracts = contracts;

    setContracts(previous => {
      const amountToApply = Number(body.amount) || 0;
      const target = previous.find(contract =>
        contract.installments?.some(item => String(item.id) === String(installmentId))
      );
      if (!target || amountToApply <= 0) return previous;

      let remainingToApply = amountToApply;
      let started = false;
      const installments = target.installments.map(item => {
        if (String(item.id) === String(installmentId)) started = true;
        if (!started || remainingToApply <= 0) return item;

        const remaining = installmentRemaining(item);
        const applied = Math.min(remaining, remainingToApply);
        remainingToApply -= applied;
        const nextPaidAmount = Number(item.paid_amount || 0) + applied;
        const nextRemaining = Math.max(remaining - applied, 0);
        return {
          ...item,
          paid_amount: nextPaidAmount,
          remaining_amount: nextRemaining,
          status: nextRemaining <= 0.01 ? 'paid' : 'pending',
          payments: applied > 0
            ? [...(item.payments || []), {
              id: `${optimisticPaymentId}-${item.id}`,
              payment_batch_id: optimisticPaymentId,
              amount: applied,
              paid_at: body.paid_at,
              rate_ars_per_usd: body.rate_ars_per_usd,
              rate_ars_per_cement_bag: body.rate_ars_per_cement_bag,
            }]
            : item.payments,
        };
      });

      const totalPending = installments.reduce((sum, item) => sum + installmentRemaining(item), 0);
      return previous.map(contract => contract === target ? {
        ...contract,
        installments,
        total_pending_amount: totalPending,
        paid_count: installments.filter(item => item.status === 'paid').length,
        pending_count: installments.filter(item => item.status !== 'paid').length,
      } : contract);
    });

    try {
      const result = await payInstallmentRequest(apiFetch, installmentId, body);
      addToast?.('Pago registrado.', 'success');
      // Reconcile quietly; don't make the user wait for the full portfolio.
      void load({ quiet: true });
      return result;
    } catch (error) {
      if (previousContracts) setContracts(previousContracts);
      addToast?.(error.message || 'No pudimos registrar el pago.', 'error');
      throw error;
    }
  }, [apiFetch, addToast, contracts, load]);

  const deleteContract = useCallback(async (contractId) => {
    await deleteContractRequest(apiFetch, contractId);
    addToast?.('Contrato eliminado definitivamente.', 'success');
    await load({ quiet: true });
  }, [apiFetch, addToast, load]);

  return {
    contracts,
    loading: enabled && (!loaded || loading),
    refreshing,
    error,
    reload: () => load({ quiet: true }),
    createContract,
    deleteContract,
    payInstallment,
  };
}
