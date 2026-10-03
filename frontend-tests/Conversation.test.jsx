import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import Conversation from '../components/Conversation'
import ConversationOperations from '../components/ConversationOperations'

const clientOutbox = vi.hoisted(() => ({
  messages: [],
  enqueue: vi.fn(async (payload) => { clientOutbox.messages.push({ ...structuredClone(payload), id: payload.entryKey, createdAt: new Date().toISOString(), expiresAt: Date.now() + 7 * 86400000, expired: false }); return { id: payload.entryKey, createdAt: new Date().toISOString(), expiresAt: Date.now() + 7 * 86400000 } }),
  list: vi.fn(async () => structuredClone(clientOutbox.messages)),
  remove: vi.fn(async id => { clientOutbox.messages = clientOutbox.messages.filter(item => item.id !== id) }),
  saveSnapshot: vi.fn(async (_kind, value) => ({ value, updatedAt: new Date().toISOString() })),
  readSnapshot: vi.fn(async () => null),
  removeSnapshot: vi.fn(async () => {})
}))
vi.mock('../client-message-outbox.mjs', () => ({
  enqueueClientMessage: (...args) => clientOutbox.enqueue(...args),
  listClientMessages: (...args) => clientOutbox.list(...args),
  removeClientMessage: (...args) => clientOutbox.remove(...args),
  saveClientSnapshot: (...args) => clientOutbox.saveSnapshot(...args),
  readClientSnapshot: (...args) => clientOutbox.readSnapshot(...args),
  removeClientSnapshot: (...args) => clientOutbox.removeSnapshot(...args)
}))

afterEach(() => vi.useRealTimers())

function fixture() {
  const fetchMock = vi.fn(async (url, options) => {
    if (options?.method === 'POST') return new Response(JSON.stringify({ success: true }), { headers: { 'content-type': 'application/json' } })
    const data = url.endsWith('/analysis') ? { capability: { enabled: false, reason: 'Local analysis is disabled.' } } : url.endsWith('/whatsapp') ? { enabled: false, receipts: [] } : { messages: [], nextCursor: null }
    return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

it('submits scoped multipart text with a stable retry key after an uncertain response', async () => {
  const fetchMock = fixture()
  const firstView = render(<Conversation base="/api/client-portal/conversation" token="private-token" draftScope="client:conversation-test" />)
  await screen.findByText('Nog geen berichten in dit gesprek.')
  await userEvent.type(screen.getByLabelText('Bericht'), 'Welke maat moet ik aanhouden?')
  fetchMock.mockRejectedValueOnce(new Error('Connection lost'))
  await userEvent.click(screen.getByRole('button', { name: 'Verstuur bericht' }))
  await screen.findByRole('alert')
  const first = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')[1]
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 220)) })
  firstView.unmount()
  render(<Conversation base="/api/client-portal/conversation" token="private-token" draftScope="client:conversation-test" />)
  await screen.findByDisplayValue('Welke maat moet ik aanhouden?')
  const storedDrafts = Array.from({ length: window.sessionStorage.length }, (_, index) => {
    const key = window.sessionStorage.key(index)
    return `${key} ${window.sessionStorage.getItem(key)}`
  }).join('\n')
  expect(storedDrafts).not.toContain('private-token')
  await userEvent.click(screen.getByRole('button', { name: 'Verstuur bericht' }))
  await screen.findByText('Bericht ontvangen.')
  const calls = fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')
  expect(calls[1][1].body.get('entryKey')).toBe(first.body.get('entryKey'))
  expect(new Headers(first.headers).get('Authorization')).toBe('Bearer private-token')
  expect(first.body.get('body')).toBe('Welke maat moet ik aanhouden?')
});

it('does not render customer-provided markup as executable HTML', async () => {
  fixture().mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: 'm1', body: '<img src=x onerror=alert(1)>', direction: 'inbound', createdAt: '2026-09-05T10:00:00Z', status: 'received' }], nextCursor: null }), { headers: { 'content-type': 'application/json' } }))
  const { container } = render(<Conversation base="/api/client-portal/conversation" token="private-token" />)
  await screen.findByText('<img src=x onerror=alert(1)>')
  expect(container.querySelector('img')).toBeNull()
});

it('loads verified historical messages on demand and imports one without sending it', async () => {
  const historical = { id: 'comm_historical_01', body: 'We selected the grey pavers.', createdAt: '2025-04-12T09:30:00.000Z' }
  let imported = false
  const fetchMock = vi.fn(async (url, options = {}) => {
    const path = String(url)
    if (path.includes('/legacy-messages/') && options.method === 'POST') {
      imported = true
      return new Response(JSON.stringify({ success: true, replayed: false }), { headers: { 'content-type': 'application/json' } })
    }
    if (path.includes('/legacy-messages?')) return new Response(JSON.stringify({ messages: imported ? [] : [historical], nextCursor: null }), { headers: { 'content-type': 'application/json' } })
    if (path.endsWith('/analysis')) return new Response(JSON.stringify({ capability: { enabled: false, reason: 'Local analysis is disabled.' } }), { headers: { 'content-type': 'application/json' } })
    if (path.endsWith('/whatsapp')) return new Response(JSON.stringify({ enabled: false, receipts: [] }), { headers: { 'content-type': 'application/json' } })
    return new Response(JSON.stringify({ messages: imported ? [{ ...historical, direction: 'inbound', status: 'received', channel: 'portal_compatibility' }] : [], nextCursor: null }), { headers: { 'content-type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<Conversation base="/api/ledger/jobs/job-1/conversations/access-1" office canApprove />)
  await waitFor(() => expect(fetchMock).toHaveBeenCalled())
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/legacy-messages?'))).toBe(false)
  await userEvent.click(screen.getByRole('button', { name: 'Oudere klantberichten controleren' }))
  await screen.findByText(historical.body)
  expect(screen.getByText(/Alleen oudere berichten die aantoonbaar/)).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: 'In dit gesprek opnemen' }))
  await screen.findByText('Oud klantbericht aan het gesprek gekoppeld. Er is niets naar de klant verzonden.')
  const importCall = fetchMock.mock.calls.find(([url, options]) => String(url).includes('/legacy-messages/') && options?.method === 'POST')
  expect(importCall).toBeTruthy()
  expect(importCall[1].body).toBe('{}')
  expect(screen.getByText(historical.body)).toBeTruthy()
});

it('loads older conversation pages before opening a cited analysis source', async () => {
  const source = { id: 'older-customer-source', body: 'De bestaande vloer blijkt hoger dan verwacht.', direction: 'inbound',
    createdAt: '2026-09-01T10:00:00Z', status: 'received', reviewedAt: new Date().toISOString() }
  const recent = Array.from({ length: 30 }, (_, index) => ({ id: `recent-${index}`, body: `Recent bericht ${index}`,
    direction: 'inbound', createdAt: `2026-09-${String(index + 2).padStart(2, '0')}T10:00:00Z`, status: 'received', reviewedAt: new Date().toISOString() }))
  const fetchMock = vi.fn(async (url) => {
    const path = String(url)
    if (path.endsWith('/analysis')) return new Response(JSON.stringify({ capability: { enabled: true }, analysis: {
      current: true, sources: [source], analysisBatchCount: 1, findings: [{ sourceId: source.id, quote: source.body,
        category: 'issue', suggestion: 'Controleer de aansluiting.', uncertainty: 'De benodigde aanpassing is niet vastgesteld.' }], observations: []
    } }), { headers: { 'content-type': 'application/json' } })
    if (path.endsWith('/whatsapp')) return new Response(JSON.stringify({ enabled: false, receipts: [] }), { headers: { 'content-type': 'application/json' } })
    if (path.includes('before=')) return new Response(JSON.stringify({ messages: [source], nextCursor: null }), { headers: { 'content-type': 'application/json' } })
    return new Response(JSON.stringify({ messages: recent, nextCursor: '100' }), { headers: { 'content-type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  const scroll = vi.fn()
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
  HTMLElement.prototype.scrollIntoView = scroll
  render(<Conversation base="/api/ledger/jobs/job-1/conversations/access-1" office />)
  await userEvent.click(await screen.findByText('Brongekoppelde analyse'))
  await userEvent.click(await screen.findByRole('link', { name: 'Bronbericht' }))
  const sourceText = await screen.findAllByText(source.body)
  expect(sourceText.some(element => element.closest('#message-older-customer-source'))).toBe(true)
  await waitFor(() => expect(scroll).toHaveBeenCalled())
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('before=100'))).toBe(true)
  if (originalScrollIntoView) HTMLElement.prototype.scrollIntoView = originalScrollIntoView
  else delete HTMLElement.prototype.scrollIntoView
})

it('checks for new counterpart messages while visible and announces them without forcing a scroll', async () => {
  vi.useFakeTimers()
  const incoming = { id: 'client-message-02', body: 'De levering is een dag later.', direction: 'inbound', createdAt: '2026-09-24T10:00:00Z', status: 'received' }
  let calls = 0
  const fetchMock = vi.fn(async () => {
    const url = String(fetchMock.mock.calls.at(-1)?.[0] || '')
    if (url.endsWith('/analysis')) return new Response(JSON.stringify({ capability: { enabled: false, reason: 'Local analysis is disabled.' } }), { headers: { 'content-type': 'application/json' } })
    if (url.endsWith('/analysis/rfi-responses')) return new Response(JSON.stringify({ responses: [] }), { headers: { 'content-type': 'application/json' } })
    if (url.endsWith('/whatsapp')) return new Response(JSON.stringify({ enabled: false, receipts: [] }), { headers: { 'content-type': 'application/json' } })
    if (url.endsWith('/field-reports')) return new Response(JSON.stringify({ reports: [] }), { headers: { 'content-type': 'application/json' } })
    if (!url.endsWith('/conversations/access-1')) return new Response(JSON.stringify({ messages: [], nextCursor: null }), { headers: { 'content-type': 'application/json' } })
    calls += 1
    const messages = calls === 1 ? [] : [incoming]
    return new Response(JSON.stringify({ messages, nextCursor: null }), { headers: { 'content-type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<Conversation base="/api/ledger/jobs/job-1/conversations/access-1" office />)
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
  expect(calls).toBe(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })
  expect(calls).toBe(2)
  expect(screen.getByText('1 nieuw bericht')).toBeTruthy()
  expect(screen.getByText(incoming.body)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Bekijken' })).toBeTruthy()
  vi.useRealTimers()
});

it('keeps external channel and AI actions disabled when providers are not configured', async () => {
  fixture()
  render(<Conversation base="/api/ledger/jobs/j/conversations/a" office isOwner />)
  await waitFor(() => expect(screen.getByText('Lokale AI-analyse is uitgeschakeld.')).toBeTruthy())
  expect(screen.getByRole('button', { name: 'Gesprek analyseren', hidden: true }).disabled).toBe(true)
  expect(screen.queryByRole('button', { name: 'Via WhatsApp verzenden', hidden: true })).toBeNull()
});

it('tests only local model status on explicit request and states that customer data was not sent', async () => {
  const fetchMock = vi.fn(async url => {
    if (String(url).endsWith('/analysis/check')) return new Response(JSON.stringify({ success: true, check: {
      model: 'qwen3:4b', modelInstalled: true, runtimeVersion: '0.33.3', automaticAnalysis: false, customerDataSent: false
    } }), { headers: { 'content-type': 'application/json' } })
    if (String(url).endsWith('/analysis')) return new Response(JSON.stringify({ capability: { enabled: true, autoAnalyze: false, model: 'qwen3:4b' } }), { headers: { 'content-type': 'application/json' } })
    if (String(url).endsWith('/whatsapp')) return new Response(JSON.stringify({ enabled: false, receipts: [] }), { headers: { 'content-type': 'application/json' } })
    return new Response(JSON.stringify({ messages: [], nextCursor: null }), { headers: { 'content-type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  const view = render(<Conversation base="/api/ledger/jobs/job-1/conversations/access-1" office />)
  await userEvent.click(await screen.findByRole('button', { name: 'Lokale modelverbinding testen' }))
  expect(await screen.findByText(/qwen3:4b \(Ollama 0\.33\.3\).*geen klantgegevens verstuurd.*Automatische analyse staat uit/)).toBeTruthy()
  const check = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/analysis/check'))
  expect(check[1].method).toBe('POST')
  expect(check[1].body).toBe('{}')
  expect(fetchMock.mock.calls.some(([url, options]) => String(url).endsWith('/api/chat') || options.body?.includes('Klant'))).toBe(false)
  view.unmount()
  render(<Conversation base="/api/ledger/jobs/job-1/conversations/access-1" office locale="en-GB" />)
  await userEvent.click(await screen.findByRole('button', { name: 'Test local model connection' }))
  expect(await screen.findByText(/Local model reachable: qwen3:4b.*No customer data was sent.*Automatic analysis is off/)).toBeTruthy()
});

it('shows durable background analysis state without running the model from the browser', async () => {
  const source = { id: 'client-new-automatic-01', body: 'De tegel is beschadigd.', direction: 'inbound', sourceHash: 'c'.repeat(64) }
  const fetchMock = vi.fn(async url => {
    if (String(url).endsWith('/whatsapp')) return new Response(JSON.stringify({ enabled: false, receipts: [] }), { headers: { 'content-type': 'application/json' } })
    if (String(url).endsWith('/analysis')) return new Response(JSON.stringify({ capability: { enabled: true, autoAnalyze: true, durableQueue: true, model: 'local-fixture' }, queue: { status: 'processing' }, analysis: null }), { headers: { 'content-type': 'application/json' } })
    return new Response('{}', { headers: { 'content-type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<ConversationOperations base="/api/ledger/jobs/job-1/conversations/access-1" messages={[source]} />)
  await screen.findByText('Onbeoordeelde klantberichten worden duurzaam lokaal verwerkt. De uitkomsten zijn uitsluitend interne voorstellen.')
  expect(await screen.findByText('Klantgesprek wordt lokaal geanalyseerd.')).toBeTruthy()
  expect(fetchMock.mock.calls.some(([url, options]) => String(url).endsWith('/analysis') && options?.method === 'POST')).toBe(false)
  expect(fetchMock.mock.calls.some(([url, options]) => options?.method === 'POST' && !String(url).endsWith('/analysis'))).toBe(false)
});

it('does not automatically analyze unreviewed messages when the separate auto-analysis opt-in is off', async () => {
  const source = { id: 'client-new-manual-01', body: 'De levering is incompleet.', direction: 'inbound', sourceHash: 'e'.repeat(64) }
  const fetchMock = vi.fn(async url => {
    if (String(url).endsWith('/whatsapp')) return new Response(JSON.stringify({ enabled: false, receipts: [] }), { headers: { 'content-type': 'application/json' } })
    if (String(url).endsWith('/analysis')) return new Response(JSON.stringify({ capability: { enabled: true, autoAnalyze: false, model: 'local-fixture' }, analysis: null }), { headers: { 'content-type': 'application/json' } })
    return new Response('{}', { headers: { 'content-type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<ConversationOperations base="/api/ledger/jobs/job-1/conversations/access-1" messages={[source]} />)
  await screen.findByText('Lokaal model: local-fixture')
  expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false)
  expect(screen.getByRole('button', { name: 'Gesprek analyseren', hidden: true }).disabled).toBe(false)
});

it('lets office assign a current client contradiction for source-linked internal follow-up', async () => {
  const source = { id: 'message-current-01', body: 'Ik dacht dat de extra sparing al in de prijs zat.', direction: 'inbound', sourceHash: 'a'.repeat(64) }
  const finding = { sourceId: source.id, quote: source.body, category: 'contradiction', suggestion: 'Vergelijk de offerte en eerdere klantcommunicatie op de opgenomen sparing.', uncertainty: 'De vastgelegde scope en de klantverwachting zijn nog niet met elkaar vergeleken.' }
  const analysis = { identity: 'b'.repeat(64), current: true, sources: [source], findings: [finding], observations: [], submittedPhotoCount: 0 }
  const fetchMock = vi.fn(async (url, options = {}) => {
    if (options.method === 'POST' && String(url).includes('/analysis/findings/')) return new Response(JSON.stringify({ success: true, replayed: false, rfi: { id: 'rfi-123', title: JSON.parse(options.body).title } }), { headers: { 'content-type': 'application/json' } })
    if (String(url).endsWith('/analysis')) return new Response(JSON.stringify({ capability: { enabled: true, model: 'local-fixture' }, analysis }), { headers: { 'content-type': 'application/json' } })
    if (String(url).endsWith('/whatsapp')) return new Response(JSON.stringify({ enabled: false, receipts: [] }), { headers: { 'content-type': 'application/json' } })
    return new Response(JSON.stringify({ messages: [{ ...source, createdAt: '2026-09-24T08:00:00Z', status: 'received' }], nextCursor: null }), { headers: { 'content-type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<Conversation base="/api/ledger/jobs/job-1/conversations/access-1" office isOwner fieldTasks={[{ id: 'task-frame', title: 'Montage kozijn', status: 'open' }]} />)
  await userEvent.click(await screen.findByText('Brongekoppelde analyse'))
  await userEvent.click(await screen.findByRole('button', { name: 'Als kantoor-RFI opvolgen' }))
  await userEvent.clear(screen.getByLabelText('Titel'))
  await userEvent.type(screen.getByLabelText('Titel'), 'Scope sparing met offerte vergelijken')
  await userEvent.clear(screen.getByLabelText('Vraag voor interne opvolging'))
  await userEvent.type(screen.getByLabelText('Vraag voor interne opvolging'), 'Vergelijk de maat met revisie C en meet de opening na.')
  await userEvent.type(screen.getByLabelText('Verantwoordelijke'), 'Werkvoorbereider')
  fireEvent.change(screen.getByLabelText('Opvolgen voor'), { target: { value: '2026-09-25T10:00' } })
  await userEvent.click(screen.getByLabelText('Deel het goedgekeurde antwoord met betrokken uitvoerders'))
  await userEvent.click(screen.getByLabelText('Montage kozijn'))
  await userEvent.click(screen.getByRole('button', { name: 'Interne RFI aanmaken' }))
  await screen.findByRole('status')
  expect(await screen.findByText(/is aan de interne opvolging toegevoegd/)).toBeTruthy()
  const post = fetchMock.mock.calls.find(([url, options]) => options?.method === 'POST' && String(url).includes('/analysis/findings/'))
  expect(post[0]).toContain(`/analysis/findings/${source.id}/rfi`)
  expect(JSON.parse(post[1].body)).toMatchObject({ analysisIdentity: analysis.identity, sourceId: source.id, quote: finding.quote, category: 'contradiction', responsible: 'Werkvoorbereider', shareWithField: true, fieldTaskIds: ['task-frame'] })
});

it('prepares a source-linked customer draft from an approved internal RFI without publishing it', async () => {
  const rfi = { id: 'rfi-approved-01', title: 'Scope sparing vergelijken',
    sourceQuote: 'Ik dacht dat de extra sparing al in de prijs zat.',
    response: 'De ondertekende offerte noemt de sparing niet; de eerdere e-mail vraagt alleen om een prijsindicatie.' }
  const fetchMock = vi.fn(async (url, options = {}) => {
    const path = String(url)
    if (path.endsWith('/analysis/rfi-responses/rfi-approved-01/draft') && options.method === 'POST') {
      return new Response(JSON.stringify({ success: true, replayed: false, message: { id: 'reply-draft-01' } }), { headers: { 'content-type': 'application/json' } })
    }
    if (path.endsWith('/analysis/rfi-responses')) return new Response(JSON.stringify({ responses: [rfi] }), { headers: { 'content-type': 'application/json' } })
    if (path.endsWith('/analysis')) return new Response(JSON.stringify({ capability: { enabled: false, reason: 'Local analysis is disabled.' } }), { headers: { 'content-type': 'application/json' } })
    if (path.endsWith('/whatsapp')) return new Response(JSON.stringify({ enabled: false, receipts: [] }), { headers: { 'content-type': 'application/json' } })
    return new Response(JSON.stringify({ messages: [], nextCursor: null }), { headers: { 'content-type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<ConversationOperations base="/api/ledger/jobs/job-1/conversations/access-1" messages={[]} />)

  expect(await screen.findByText(rfi.title)).toBeTruthy()
  expect(screen.getByText(rfi.response)).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: 'Klaarzetten als klantconcept' }))

  expect(await screen.findByText(/Een bevoegde medewerker moet dit concept nog afzonderlijk goedkeuren en publiceren/)).toBeTruthy()
  const post = fetchMock.mock.calls.find(([url, options]) => String(url).endsWith('/analysis/rfi-responses/rfi-approved-01/draft') && options?.method === 'POST')
  expect(post).toBeTruthy()
  expect(JSON.parse(post[1].body)).toEqual({})
});

it('lets the office prepare a private client message from an approved daily report', async () => {
  const report = { id: 'field-report-01', reportDate: '2026-09-27',
    workCompleted: 'Het kozijn is geplaatst en gecontroleerd.', sourceHash: 'd'.repeat(64) }
  const fetchMock = vi.fn(async (url, options = {}) => {
    const path = String(url)
    if (path.endsWith(`/field-reports/${report.id}/draft`) && options.method === 'POST') {
      return new Response(JSON.stringify({ success: true, replayed: false, message: { id: 'field-message-draft-01' } }), { headers: { 'content-type': 'application/json' } })
    }
    if (path.endsWith('/field-reports')) return new Response(JSON.stringify({ reports: [report] }), { headers: { 'content-type': 'application/json' } })
    if (path.endsWith('/analysis/rfi-responses')) return new Response(JSON.stringify({ responses: [] }), { headers: { 'content-type': 'application/json' } })
    if (path.endsWith('/analysis')) return new Response(JSON.stringify({ capability: { enabled: false, reason: 'Local analysis is disabled.' } }), { headers: { 'content-type': 'application/json' } })
    if (path.endsWith('/whatsapp')) return new Response(JSON.stringify({ enabled: false, receipts: [] }), { headers: { 'content-type': 'application/json' } })
    return new Response(JSON.stringify({ messages: [], nextCursor: null }), { headers: { 'content-type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  const onMessagesChanged = vi.fn()
  render(<ConversationOperations base="/api/ledger/jobs/job-1/conversations/access-1" messages={[]} onMessagesChanged={onMessagesChanged} />)
  await userEvent.click(await screen.findByText('Goedgekeurd dagrapport met klant delen'))
  await userEvent.selectOptions(screen.getByLabelText('Goedgekeurd dagrapport'), report.id)
  const body = screen.getByLabelText('Bericht aan de klant')
  expect(body.value).toBe(report.workCompleted)
  await userEvent.click(screen.getByRole('button', { name: 'Privé klantconcept aanmaken' }))
  expect(await screen.findByText(/Klantupdate opgeslagen als privé concept/)).toBeTruthy()
  const post = fetchMock.mock.calls.find(([url, options]) => String(url).endsWith(`/field-reports/${report.id}/draft`) && options?.method === 'POST')
  expect(JSON.parse(post[1].body)).toMatchObject({ sourceHash: report.sourceHash, body: report.workCompleted })
  expect(post[1].body).toMatch(/entryKey/)
  expect(onMessagesChanged).toHaveBeenCalledOnce()
})

it('lets the office prepare a private customer message from a released work photo', async () => {
  const photo = { id: 'capture-after-01', title: 'Dakbaan voortgang', taskTitle: 'Dakbaan aanbrengen', phase: 'after',
    caption: 'Aansluiting gecontroleerd.', capturedAt: '2026-09-27T10:00:00.000Z', origin: {
      setId: 'photo-set-01', setSourceHash: 'a'.repeat(64), setSnapshotHash: 'b'.repeat(64), captureId: 'capture-after-01',
      captureSourceHash: 'c'.repeat(64), captureSnapshotHash: 'd'.repeat(64), documentId: 'document-photo-01',
      sha256: 'e'.repeat(64), approvalId: 'approval-photo-01'
    } }
  const fetchMock = vi.fn(async (url, options = {}) => {
    const path = String(url)
    if (path.endsWith(`/photo-evidence/${photo.id}/draft`) && options.method === 'POST') {
      return new Response(JSON.stringify({ success: true, replayed: false, message: { id: 'photo-message-draft-01' } }), { headers: { 'content-type': 'application/json' } })
    }
    if (path.endsWith('/photo-evidence')) return new Response(JSON.stringify({ photos: [photo] }), { headers: { 'content-type': 'application/json' } })
    if (path.endsWith('/field-reports')) return new Response(JSON.stringify({ reports: [] }), { headers: { 'content-type': 'application/json' } })
    if (path.endsWith('/analysis/rfi-responses')) return new Response(JSON.stringify({ responses: [] }), { headers: { 'content-type': 'application/json' } })
    if (path.endsWith('/analysis')) return new Response(JSON.stringify({ capability: { enabled: false, reason: 'Local analysis is disabled.' } }), { headers: { 'content-type': 'application/json' } })
    if (path.endsWith('/whatsapp')) return new Response(JSON.stringify({ enabled: false, receipts: [] }), { headers: { 'content-type': 'application/json' } })
    return new Response(JSON.stringify({ messages: [], nextCursor: null }), { headers: { 'content-type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  const onMessagesChanged = vi.fn()
  render(<ConversationOperations base="/api/ledger/jobs/job-1/conversations/access-1" messages={[]} onMessagesChanged={onMessagesChanged} />)
  await userEvent.click(await screen.findByText('Vrijgegeven werkfoto met klant delen'))
  await userEvent.selectOptions(screen.getByLabelText('Vrijgegeven werkfoto'), photo.id)
  expect(screen.getByLabelText('Bericht aan de klant').value).toBe(photo.caption)
  await userEvent.click(screen.getByRole('button', { name: 'Privé klantconcept met foto aanmaken' }))
  expect(await screen.findByText(/Klantbericht met vrijgegeven werkfoto opgeslagen als privé concept/)).toBeTruthy()
  const post = fetchMock.mock.calls.find(([url, options]) => String(url).endsWith(`/photo-evidence/${photo.id}/draft`) && options?.method === 'POST')
  expect(JSON.parse(post[1].body)).toMatchObject({ origin: photo.origin, body: photo.caption })
  expect(post[1].body).toMatch(/entryKey/)
  expect(onMessagesChanged).toHaveBeenCalledOnce()
})

it('lets office turn a current uncertain photo observation into a source-bound internal RFI', async () => {
  const photoSha256 = 'f'.repeat(64)
  const source = { id: 'photo-current-01', body: 'Is deze kier een probleem?', direction: 'inbound', sourceHash: 'a'.repeat(64), attachment: { sha256: photoSha256, filename: 'sparing.png' } }
  const observation = { sourceId: source.id, sha256: photoSha256, observation: 'Mogelijke kier zichtbaar rond de sparing.', uncertainty: 'Afmeting en oorzaak zijn niet uit deze foto vast te stellen.' }
  const analysis = { identity: 'b'.repeat(64), current: true, sources: [source], findings: [], observations: [observation], submittedPhotoCount: 1 }
  const fetchMock = vi.fn(async (url, options = {}) => {
    if (options.method === 'POST' && String(url).includes('/analysis/observations/')) return new Response(JSON.stringify({ success: true, rfi: { id: 'rfi-photo-123', title: JSON.parse(options.body).title } }), { headers: { 'content-type': 'application/json' } })
    if (String(url).endsWith('/analysis')) return new Response(JSON.stringify({ capability: { enabled: true, model: 'local-fixture' }, analysis }), { headers: { 'content-type': 'application/json' } })
    if (String(url).endsWith('/whatsapp')) return new Response(JSON.stringify({ enabled: false, receipts: [] }), { headers: { 'content-type': 'application/json' } })
    return new Response(JSON.stringify({ messages: [{ ...source, createdAt: '2026-09-24T08:00:00Z', status: 'received' }], nextCursor: null }), { headers: { 'content-type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<Conversation base="/api/ledger/jobs/job-1/conversations/access-1" office isOwner />)
  await userEvent.click(await screen.findByText('Brongekoppelde analyse'))
  expect(await screen.findByText(/AI-waarneming, geen vastgesteld feit/)).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: 'Als foto-RFI opvolgen' }))
  expect(screen.getAllByText(/Afmeting en oorzaak zijn niet uit deze foto vast te stellen/)).toHaveLength(2)
  await userEvent.type(screen.getByLabelText('Verantwoordelijke'), 'Uitvoerder')
  const due = new Date(Date.now() + 48 * 60 * 60 * 1000)
  const localDue = new Date(due.getTime() - due.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
  fireEvent.change(screen.getByLabelText('Opvolgen voor'), { target: { value: localDue } })
  await userEvent.click(screen.getByRole('button', { name: 'Interne RFI aanmaken' }))
  expect(await screen.findByText(/is aan de interne opvolging toegevoegd/)).toBeTruthy()
  const post = fetchMock.mock.calls.find(([url, options]) => options?.method === 'POST' && String(url).includes('/analysis/observations/'))
  expect(post[0]).toContain(`/analysis/observations/${source.id}/rfi`)
  expect(JSON.parse(post[1].body)).toMatchObject({ analysisIdentity: analysis.identity, sourceId: source.id, photoSha256, observation: observation.observation, uncertainty: observation.uncertainty, responsible: 'Uitvoerder' })
});

it('lets office prepare a source-bound client variation with explicit human scope, cost, schedule and risk review', async () => {
  const source = { id: 'request-current-01', body: 'Kan de opening 15 cm breder?', direction: 'inbound', sourceHash: 'a'.repeat(64) }
  const finding = { sourceId: source.id, quote: source.body, category: 'request', suggestion: 'Beoordeel het verbreden van de opening.', uncertainty: 'Gewenste maat, constructieve haalbaarheid en contractimpact zijn niet vastgesteld.' }
  const analysis = { identity: 'b'.repeat(64), current: true, sources: [source], findings: [finding], observations: [], submittedPhotoCount: 0 }
  const fetchMock = vi.fn(async (url, options = {}) => {
    if (options.method === 'POST' && String(url).endsWith('/change-orders')) return new Response(JSON.stringify({ success: true, changeOrder: { id: 'variation-123', variationNumber: 'VAR-2026-000001', workAuthorized: false } }), { headers: { 'content-type': 'application/json' } })
    if (String(url).endsWith('/analysis')) return new Response(JSON.stringify({ capability: { enabled: true, model: 'local-fixture' }, analysis }), { headers: { 'content-type': 'application/json' } })
    if (String(url).endsWith('/whatsapp')) return new Response(JSON.stringify({ enabled: false, receipts: [] }), { headers: { 'content-type': 'application/json' } })
    return new Response(JSON.stringify({ messages: [{ ...source, createdAt: '2026-09-24T08:00:00Z', status: 'received' }], nextCursor: null }), { headers: { 'content-type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<Conversation base="/api/ledger/jobs/job-1/conversations/access-1" office isOwner />)
  await userEvent.click(await screen.findByText('Brongekoppelde analyse'))
  await userEvent.click(await screen.findByRole('button', { name: 'Wijzigingsconcept voorbereiden' }))
  expect(screen.getAllByText(/Onzekerheid:/)).toHaveLength(2)
  await userEvent.clear(screen.getByLabelText('Voorgestelde scope'))
  await userEvent.type(screen.getByLabelText('Voorgestelde scope'), 'Verbreden van de bestaande opening na controle ter plaatse.')
  await userEvent.clear(screen.getByLabelText('Onderbouwing kantoor'))
  await userEvent.type(screen.getByLabelText('Onderbouwing kantoor'), 'Klant vraagt expliciet om meer breedte.')
  await userEvent.type(screen.getByLabelText('Raming meer-/minderprijs excl. btw (€)'), '450')
  await userEvent.type(screen.getByLabelText('Geschatte planningsimpact (kalenderdagen)'), '1')
  await userEvent.type(screen.getByLabelText('Toelichting planningsimpact'), 'Een extra kalenderdag na controle van de draagconstructie.')
  await userEvent.type(screen.getByLabelText('Toelichting risico'), 'Draagconstructie en tijdelijke ondersteuning moeten worden beoordeeld.')
  await userEvent.click(screen.getByRole('button', { name: 'Intern wijzigingsconcept aanmaken' }))
  expect(await screen.findByText(/wacht op interne goedkeuring/)).toBeTruthy()
  const post = fetchMock.mock.calls.find(([url, options]) => options?.method === 'POST' && String(url).endsWith('/change-orders'))
  expect(post[0]).toBe('/api/ledger/jobs/job-1/change-orders')
  expect(JSON.parse(post[1].body)).toMatchObject({ analysisIdentity: analysis.identity, sourceId: source.id, quote: finding.quote,
    scopeDelta: 'Verbreden van de bestaande opening na controle ter plaatse.', amount: 450, scheduleDeltaDays: 1, riskImpact: 'medium' })
}, 15000);

it('prepares an unpublished customer-choice draft from a current request for internal approval', async () => {
  const source = { id: 'request-choice-01', body: 'Welke kleur wilt u voor de gevelsteen?', direction: 'inbound', sourceHash: 'd'.repeat(64) }
  const finding = { sourceId: source.id, quote: source.body, category: 'request', suggestion: 'Leg de gevelsteenkleur als klantkeuze ter beoordeling voor.', uncertainty: 'De opties en uiterste besteldatum moeten door kantoor worden vastgesteld.' }
  const analysis = { identity: 'e'.repeat(64), current: true, sources: [source], findings: [finding], observations: [], submittedPhotoCount: 0 }
  const fetchMock = vi.fn(async (url, options = {}) => {
    if (options.method === 'POST' && String(url).endsWith('/client-selection')) return new Response(JSON.stringify({ success: true, selection: { id: 'selection-123', title: JSON.parse(options.body).title, status: 'pending_approval', data: { clientVisible: false } } }), { headers: { 'content-type': 'application/json' } })
    if (String(url).endsWith('/analysis')) return new Response(JSON.stringify({ capability: { enabled: true, model: 'local-fixture' }, analysis }), { headers: { 'content-type': 'application/json' } })
    if (String(url).endsWith('/whatsapp')) return new Response(JSON.stringify({ enabled: false, receipts: [] }), { headers: { 'content-type': 'application/json' } })
    return new Response(JSON.stringify({ messages: [{ ...source, createdAt: '2026-09-24T08:00:00Z', status: 'received' }], nextCursor: null }), { headers: { 'content-type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<Conversation base="/api/ledger/jobs/job-1/conversations/access-1" office isOwner />)
  await userEvent.click(await screen.findByText('Brongekoppelde analyse'))
  await userEvent.click(await screen.findByRole('button', { name: 'Klantkeuze voorbereiden' }))
  await userEvent.clear(screen.getByLabelText('Klantvraag'))
  await userEvent.type(screen.getByLabelText('Klantvraag'), 'Welke kleur gevelsteen kiest u?')
  await userEvent.type(screen.getByLabelText('Antwoordopties, één per regel'), 'Roodbruin\nAntraciet')
  await userEvent.click(screen.getByRole('button', { name: 'Niet-zichtbaar concept ter goedkeuring indienen' }))
  expect(await screen.findByText(/is opgeslagen als niet-zichtbaar concept en wacht op interne goedkeuring/)).toBeTruthy()
  const post = fetchMock.mock.calls.find(([url, options]) => options?.method === 'POST' && String(url).endsWith('/client-selection'))
  expect(post[0]).toContain(`/analysis/findings/${source.id}/client-selection`)
  expect(JSON.parse(post[1].body)).toMatchObject({ analysisIdentity: analysis.identity, sourceId: source.id,
    quote: finding.quote, category: 'request', title: 'Welke kleur gevelsteen kiest u?', options: ['Roodbruin', 'Antraciet'] })
})

it('localizes the English office analysis and variation workflow while keeping external actions gated', async () => {
  const source = { id: 'request-en-01', body: 'Could the doorway be wider?', direction: 'inbound', sourceHash: 'a'.repeat(64) }
  const finding = { sourceId: source.id, quote: source.body, category: 'request', suggestion: 'Review widening the doorway.', uncertainty: 'Target width and structural impact have not been established.' }
  const analysis = { identity: 'b'.repeat(64), current: true, sources: [source], findings: [finding], observations: [], submittedPhotoCount: 0 }
  const fetchMock = vi.fn(async url => {
    if (String(url).endsWith('/analysis')) return new Response(JSON.stringify({ capability: { enabled: true, model: 'local-fixture' }, analysis }), { headers: { 'content-type': 'application/json' } })
    if (String(url).endsWith('/whatsapp')) return new Response(JSON.stringify({ enabled: false, reason: 'WhatsApp is disabled.', receipts: [] }), { headers: { 'content-type': 'application/json' } })
    return new Response(JSON.stringify({ messages: [{ ...source, createdAt: '2026-09-24T08:00:00Z', status: 'received' }], nextCursor: null }), { headers: { 'content-type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<Conversation base="/api/ledger/jobs/job-1/conversations/access-1" office isOwner locale="en-GB" />)
  await userEvent.click(await screen.findByText('Source-linked analysis'))
  expect(await screen.findByText('Local model: local-fixture')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Analyse conversation' })).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: 'Prepare variation draft' }))
  expect(screen.getByRole('form', { name: 'Convert client request into a variation draft' })).toBeTruthy()
  expect(screen.getByLabelText('Proposed scope')).toBeTruthy()
  expect(screen.getByLabelText('Office justification')).toBeTruthy()
  expect(screen.getByText(/An accepted quote or retained contract basis is required/)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Create internal variation draft' })).toBeTruthy()
  await userEvent.click(screen.getByText('WhatsApp'))
  expect(await screen.findByText('WhatsApp is disabled.')).toBeTruthy()
  expect(screen.getByLabelText('I confirm external sending to the linked client')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Send via WhatsApp' })).toBeNull()
  expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false)
})

it('keeps an offline client message and photo local across reload, then sends it with the same key after reconnect', async () => {
  clientOutbox.messages = []; clientOutbox.enqueue.mockClear(); clientOutbox.list.mockClear(); clientOutbox.remove.mockClear()
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false })
  Object.defineProperty(window, 'indexedDB', { configurable: true, value: {} })
  Object.defineProperty(window.crypto, 'subtle', { configurable: true, value: (await import('node:crypto')).webcrypto.subtle })
  if (!File.prototype.arrayBuffer) Object.defineProperty(File.prototype, 'arrayBuffer', { configurable: true, value() {
    return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsArrayBuffer(this) })
  } })
  const fetchMock = fixture()
  const props = { base: '/api/client-portal/conversation', token: 'complete-high-entropy-client-portal-token', draftScope: 'client-portal:scope:conversation', offlineShellReady: true }
  const firstView = render(<Conversation {...props} />)
  await screen.findByText('Nog geen berichten in dit gesprek.')
  await userEvent.type(screen.getByLabelText('Bericht'), 'De levering mag achterom.')
  await userEvent.upload(screen.getByLabelText('Foto toevoegen (max. 5 MB)'), new File(['offline-photo-data'], 'poort.png', { type: 'image/png' }))
  await userEvent.click(screen.getByRole('button', { name: 'Verstuur bericht' }))
  await screen.findByText('Alleen lokaal bewaard; nog niet door de aannemer ontvangen. Verzendt zodra je weer online bent.')
  expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false)
  expect(clientOutbox.enqueue).toHaveBeenCalledTimes(1)
  firstView.unmount()

  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
  render(<Conversation {...props} />)
  await screen.findByText(/offline bericht is door de aannemer ontvangen/)
  await waitFor(() => expect(clientOutbox.messages).toHaveLength(0))
  const post = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')
  expect(post[0]).toBe('/api/client-portal/conversation/messages')
  expect(post[1].body.get('body')).toBe('De levering mag achterom.')
  expect(post[1].body.get('evidenceFile').name).toBe('poort.png')
  expect(post[1].body.get('entryKey')).toBe(clientOutbox.enqueue.mock.calls[0][0].entryKey)
})

it('reports offline conversation readiness only after the encrypted snapshot write completes', async () => {
  clientOutbox.messages = []
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
  vi.stubGlobal('indexedDB', {})
  vi.stubGlobal('crypto', (await import('node:crypto')).webcrypto)
  let completeWrite
  clientOutbox.saveSnapshot.mockImplementationOnce(() => new Promise(resolve => { completeWrite = resolve }))
  fixture()
  render(<Conversation base="/api/client-portal/conversation" token="complete-client-token-for-snapshot-test"
    draftScope="client:delayed-snapshot" offlineShellReady />)
  await screen.findByText('Nog geen berichten in dit gesprek.')
  expect(screen.getByText(/Offline opslag wordt voorbereid/)).toBeTruthy()
  expect(screen.queryByText(/Gesprek offline bewaard/)).toBeNull()
  await act(async () => completeWrite({ updatedAt: new Date().toISOString() }))
  await screen.findByText(/Gesprek offline bewaard/)
  expect(screen.queryByText(/Offline opslag wordt voorbereid/)).toBeNull()
})

it('keeps the online conversation usable and warns when the snapshot cannot be stored', async () => {
  clientOutbox.messages = []
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
  vi.stubGlobal('indexedDB', {})
  vi.stubGlobal('crypto', (await import('node:crypto')).webcrypto)
  clientOutbox.saveSnapshot.mockRejectedValueOnce(new Error('Storage quota exceeded'))
  fixture()
  render(<Conversation base="/api/client-portal/conversation" token="complete-client-token-for-snapshot-test"
    draftScope="client:failed-snapshot" offlineShellReady />)
  await screen.findByText('Nog geen berichten in dit gesprek.')
  await screen.findByText(/De gesprekssnapshot kon niet lokaal worden opgeslagen/)
  expect(screen.queryByText(/Gesprek offline bewaard/)).toBeNull()
  expect(screen.queryByText(/Offline opslag wordt voorbereid/)).toBeNull()
  await userEvent.type(screen.getByLabelText('Bericht'), 'Dit online bericht blijft mogelijk.')
  expect(screen.getByRole('button', { name: 'Verstuur bericht' }).disabled).toBe(false)
})

it('does not apply a late snapshot confirmation to a different client scope', async () => {
  clientOutbox.messages = []
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
  vi.stubGlobal('indexedDB', {})
  vi.stubGlobal('crypto', (await import('node:crypto')).webcrypto)
  let finishOriginal
  let finishCurrent
  clientOutbox.saveSnapshot.mockImplementationOnce(() => new Promise(resolve => { finishOriginal = resolve }))
  clientOutbox.saveSnapshot.mockImplementationOnce(() => new Promise(resolve => { finishCurrent = resolve }))
  fixture()
  const props = { base: '/api/client-portal/conversation', token: 'original-client-token-for-snapshot-test',
    draftScope: 'client:original-snapshot', offlineShellReady: true }
  const view = render(<Conversation {...props} />)
  await screen.findByText('Nog geen berichten in dit gesprek.')
  view.rerender(<Conversation {...props} token="different-client-token-for-snapshot-test" draftScope="client:different-snapshot" />)
  await waitFor(() => expect(finishCurrent).toBeTypeOf('function'))
  await act(async () => finishOriginal({ updatedAt: new Date().toISOString() }))
  expect(screen.queryByText(/Gesprek offline bewaard/)).toBeNull()
  expect(screen.getByText(/Offline opslag wordt voorbereid/)).toBeTruthy()
  await act(async () => finishCurrent({ updatedAt: new Date().toISOString() }))
  await screen.findByText(/Gesprek offline bewaard/)
})
