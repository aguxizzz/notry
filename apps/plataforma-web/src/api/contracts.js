import { API_BASE } from '../config';

export async function fetchContracts(apiFetch) {
  const data = await apiFetch(`${API_BASE}/contracts`, { retries: 1 });
  return Array.isArray(data?.contracts) ? data.contracts : [];
}

export async function fetchContractInstallments(apiFetch) {
  const data = await apiFetch(`${API_BASE}/contracts/installments`, { retries: 1 });
  return Array.isArray(data?.installments) ? data.installments : [];
}

export async function fetchContractsPortfolio(apiFetch) {
  const [contracts, installments] = await Promise.all([
    fetchContracts(apiFetch),
    fetchContractInstallments(apiFetch),
  ]);
  const installmentsByContract = new Map();

  for (const installment of installments) {
    const contractId = String(installment.contract_id);
    const current = installmentsByContract.get(contractId) || [];
    current.push(installment);
    installmentsByContract.set(contractId, current);
  }

  return contracts.map(contract => ({
    ...contract,
    installments: installmentsByContract.get(String(contract.id)) || [],
    detailAvailable: true,
  }));
}

export async function createContract(apiFetch, body) {
  return apiFetch(`${API_BASE}/contracts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    // Financial writes must not be replayed after an ambiguous network failure.
    retries: 1,
  });
}

export async function deleteContract(apiFetch, contractId) {
  return apiFetch(`${API_BASE}/contracts/${contractId}`, {
    method: 'DELETE',
    // A deletion must not be replayed after an ambiguous network failure.
    retries: 1,
  });
}

export async function payInstallment(apiFetch, installmentId, body) {
  return apiFetch(`${API_BASE}/contracts/installments/${installmentId}/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    // A repeated request could register the same payment twice.
    retries: 1,
  });
}

export async function fetchContractAdvisors(apiFetch) {
  const data = await apiFetch(`${API_BASE}/advisors`, { retries: 1 });
  return Array.isArray(data) ? data : [];
}
