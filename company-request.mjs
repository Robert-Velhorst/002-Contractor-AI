function mismatch() {
  return Object.assign(new Error('De bedrijfsomgeving is gewijzigd. Heropen de oorspronkelijke omgeving; deze actie is niet bevestigd.'), { code: 'company_runtime_mismatch', status: 409 });
}

export function createCompanyFetch(fetchImpl = (...args) => globalThis.fetch(...args)) {
  let company = null;
  function apiUrl(url) {
    if (typeof url !== 'string' || !url.startsWith('/api/')) throw new Error('Company requests must use a same-origin API path.');
    const parsed = new URL(url, 'https://contractor-ai.invalid');
    if (parsed.origin !== 'https://contractor-ai.invalid' || !parsed.pathname.startsWith('/api/')) throw new Error('Company requests must use a same-origin API path.');
    return parsed;
  }
  const request = async (url, options = {}) => {
    apiUrl(url);
    const headers = new Headers(options.headers);
    if (company) {
      for (const [name, value] of Object.entries(company)) {
        if (headers.has(name) && headers.get(name) !== value) throw mismatch();
        headers.set(name, value);
      }
    }
    const response = await fetchImpl(url, { ...options, headers });
    const id = response.headers?.get('X-Contractor-Company');
    const ledgerId = response.headers?.get('X-Contractor-Ledger');
    if (id && ledgerId) {
      const returned = { 'X-Contractor-Company': id, 'X-Contractor-Ledger': ledgerId };
      for (const [name, value] of Object.entries(returned)) {
        if ((company && company[name] !== value) || (headers.has(name) && headers.get(name) !== value)) throw mismatch();
      }
      // Keep the first environment for this page, including across sign-out and retries.
      company = returned;
    } else if (company && response.ok) {
      throw Object.assign(new Error('De server bevestigt de bedrijfsomgeving niet. Vernieuw de pagina voordat je verdergaat.'), { code: 'company_identity_missing', status: 409 });
    }
    return response;
  };
  // Native downloads cannot carry custom headers. These non-secret assertions
  // bind the destination while preserving streaming, new tabs and filenames.
  request.url = url => {
    const parsed = apiUrl(url);
    if (!company) return undefined;
    for (const [key, header] of [['__company', 'X-Contractor-Company'], ['__ledger', 'X-Contractor-Ledger']]) {
      const values = parsed.searchParams.getAll(key);
      if (values.some(value => value !== company[header])) throw mismatch();
      parsed.searchParams.set(key, company[header]);
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  };
  return request;
}

export const companyFetch = createCompanyFetch();
export const companyApiUrl = url => companyFetch.url(url);
