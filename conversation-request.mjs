import { companyFetch } from './company-request.mjs'

export async function conversationRequest(base, token, suffix = '', options = {}) {
  const response = await companyFetch(base + suffix, {
    ...options,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  })
  if (!response.ok) {
    const result = await response.json().catch(() => ({}))
    throw Object.assign(new Error(result.error?.message || `Request failed (${response.status})`), { status: response.status, code: result.error?.code })
  }
  return response
}
