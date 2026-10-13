const COMPANY = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const LEDGER = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

export function scopedCompany(operator) {
  return COMPANY.test(operator?.companyId || '') && LEDGER.test(operator?.ledgerId || '')
    ? { id: operator.companyId, ledgerId: operator.ledgerId } : null;
}

export function parseCompanyScope(scope) {
  const match = /^company:([^:]+):ledger:([^:]+):([a-z_]+):(.+)$/.exec(String(scope || ''));
  if (!match || !COMPANY.test(match[1]) || !LEDGER.test(match[2])) return null;
  return { id: match[1], ledgerId: match[2], role: match[3], principalId: match[4] };
}

export function companyHeaders(scope) {
  const company = parseCompanyScope(scope);
  if (!company) throw new Error('This saved response has no verified company environment. It remains on this device and cannot be sent automatically.');
  return { 'X-Contractor-Company': company.id, 'X-Contractor-Ledger': company.ledgerId };
}
