import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import ContractorReviewControl from '../components/ContractorReviewControl'

const portfolio = { coverage: { version: 1, sourceTables: Array.from({ length: 15 }, (_, index) => `table-${index}`), derivedSources: Array.from({ length: 7 }, (_, index) => `source-${index}`), checks: Array.from({ length: 10 }, (_, index) => `check-${index}`) }, dossiers: { rows: [{ id: 'job-1', title: 'Extension' }], nextCursor: 'job-1' }, progress: { coverageVersion: 1, coverageIncomplete: 0, checked: 10, total: 506, issueCount: 4, failed: 0, finished: false, lastBatch: [] } }
const takeoffItem = { id: 'item-1', description: 'Concrete pads', quantity: 4, unit: 'm3', unitCost: 120, unitPrice: 210, wbsCode: '01.20', workPackage: 'Foundations' }
const detail = { job: { id: 'job-1', title: 'Extension' }, schedule: { tasks: [{ id: 'task-1', title: 'Foundation', durationHours: 8 }] }, takeoffs: [{ id: 'takeoff-1', title: 'Foundation quantities', status: 'draft', currency: 'EUR', integrityValid: null, items: [takeoffItem] }], materialRequirements: [{ id: 'mat-1', name: 'Cement', quantity: 8, unit: 'bags', linkedTasks: [{ id: 'task-1', title: 'Foundation' }] }], reviews: [] }
const review = { sourceHash: 'a'.repeat(64), scenario: { taskId: 'task-1', durationHours: 16, costDelta: 300, revenueDelta: 450, reason: 'Extra excavation', currency: 'EUR', quantityChanges: [] }, schedule: { ready: true, beforeEnd: '2026-09-08T00:00:00Z', afterEnd: '2026-09-08T08:00:00Z', finishDeltaHours: 8, affectedTasks: [], targetExceeded: true, contractualCompletionDates: [{ entryKey: 'completion-1', label: 'Final handover', date: '2026-09-08', sourceCurrent: true, evidenceReference: 'Quote clause 8', currentForecast: { status: 'within_date', daysLate: 0 }, proposedForecast: { status: 'projected_late', daysLate: 1 } }] }, quantityImpact: { currencyMismatch: false, changes: [{ itemId: 'item-1', description: 'Concrete pads', currentQuantity: 4, proposedQuantity: 6, quantityDelta: 2, unit: 'm3', costDelta: 240, revenueDelta: 420, wbsCode: '01.20', workPackage: 'Foundations', currency: 'EUR' }] }, financial: { costDelta: 540, revenueDelta: 870, marginDelta: 330, currency: 'EUR' }, linked: { assignments: [], purchases: [], milestones: [], scopes: [], changes: [], takeoffs: [{ id: 'takeoff-1' }], pendingApprovals: [] } }

it('pages through all dossiers and respects suspension and role boundaries', async () => {
  const api = vi.fn().mockResolvedValue({ ...portfolio, automationSuspended: true })
  render(<ContractorReviewControl api={api} canAutomate />)
  await userEvent.click(screen.getByRole('button', { name: 'Dossier review' }))
  await screen.findByText('Extension')
  expect(await screen.findByText(/Coverage manifest v1: 15 source tables/)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Review next batch' }).disabled).toBe(true)
  await userEvent.click(screen.getByRole('button', { name: 'Next dossiers' }))
  await waitFor(() => expect(api.mock.calls.at(-1)[0]).toContain('after=job-1'))
  expect(screen.queryByRole('button', { name: 'Preview impact' })).toBeNull()
})

it('shows missing source evidence and never describes the round as complete', async () => {
  const api = vi.fn().mockResolvedValue({ ...portfolio, progress: { ...portfolio.progress, checked: 2, total: 2,
    finished: true, complete: false, coverageIncomplete: 1 } })
  render(<ContractorReviewControl api={api} />)
  await userEvent.click(screen.getByRole('button', { name: 'Dossier review' }))
  expect((await screen.findByRole('alert')).textContent).toContain('1 dossier reports lack complete source coverage evidence.')
  expect(screen.queryByText('Coverage complete for this round; findings still need review.')).toBeNull()
})

it('requires preview, clears stale previews on edit, and retains the exact source-bound scenario', async () => {
  const api = vi.fn().mockImplementation(async (url, options) => {
    if (options) return { review }
    return url.includes('change-impact') ? detail : portfolio
  })
  render(<ContractorReviewControl api={api} canEdit />)
  await userEvent.click(screen.getByRole('button', { name: 'Dossier review' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Analyse Extension' }))
  await userEvent.type(await screen.findByLabelText('Change reason'), 'Extra excavation')
  await userEvent.click(screen.getByRole('button', { name: 'Preview impact' }))
  await screen.findByText('Customer target exceeded')
  expect(screen.getByRole('list', { name: 'Contractual completion dates' }).textContent).toContain('Projected after contractual date (1 calendar day late)')
  await userEvent.type(screen.getByLabelText('Change reason'), '!')
  expect(screen.queryByRole('button', { name: 'Retain analysis' })).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Preview impact' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Retain analysis' }))
  const saved = api.mock.calls.map(([, options]) => options && JSON.parse(options.body)).find(payload => payload?.mode === 'retain')
  expect(saved.sourceHash).toBe(review.sourceHash)
  expect(saved.reason).toBe(review.scenario.reason)
  expect(saved.entryKey).toBeTruthy()
  await screen.findByText('Analysis retained. Agreements unchanged.')
})

it('shows verified contract-date impact in Dutch', async () => {
  const api = vi.fn().mockImplementation(async (url, options) => options ? { review } : url.includes('change-impact') ? detail : portfolio)
  render(<ContractorReviewControl api={api} locale="nl-NL" canEdit />)
  await userEvent.click(screen.getByRole('button', { name: 'Dossiercontrole' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Extension analyseren' }))
  await userEvent.type(await screen.findByLabelText('Reden van wijziging'), 'Extra excavation')
  await userEvent.click(screen.getByRole('button', { name: 'Gevolgen berekenen' }))
  const dates = await screen.findByRole('list', { name: 'Contractuele opleverdatums' })
  expect(dates.textContent).toContain('Binnen contractuele datum')
  expect(dates.textContent).toContain('Volgens planning na contractdatum (1 kalenderdag later)')
  expect(dates.textContent).toContain('Quote clause 8')
})

it('previews measured takeoff quantity changes using the retained item selection', async () => {
  const api = vi.fn().mockImplementation(async (url, options) => options ? { review } : url.includes('change-impact') ? detail : portfolio)
  render(<ContractorReviewControl api={api} canEdit />)
  await userEvent.click(screen.getByRole('button', { name: 'Dossier review' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Analyse Extension' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Add measured quantity' }))
  const quantity = screen.getByRole('spinbutton', { name: 'Proposed quantity 1' })
  await userEvent.clear(quantity)
  await userEvent.type(quantity, '6')
  await userEvent.type(screen.getByLabelText('Change reason'), 'Additional foundation volume')
  await userEvent.click(screen.getByRole('button', { name: 'Preview impact' }))
  await screen.findByText('Measured quantity impact')
  expect(screen.getByText('Concrete pads').closest('li').textContent).toMatch(/4 m3\s*>\s*6 m3/)
  const submitted = JSON.parse(api.mock.calls.find(([, options]) => options)?.[1].body)
  expect(submitted.quantityChanges).toEqual([{ itemId: 'item-1', quantity: '6' }])
})

it('previews material shortfall alongside accepted stock, linked orders and work-step connections', async () => {
  const materialReview = { ...review, scenario: { ...review.scenario, materialChanges: [{ requirementId: 'mat-1', quantity: '12' }] }, materialImpact: { affectedTaskCount: 1, changes: [{ requirementId: 'mat-1', name: 'Cement', unit: 'bags', currentQuantity: 8, proposedQuantity: 12, availableQuantity: 3, incomingQuantity: 4, currentShortfall: 1, proposedShortfall: 5, readiness: 'additional_supply_confirmation_required', affectedTasks: [{ id: 'task-1', title: 'Foundation' }], linkedPurchaseOrders: [{ purchaseOrderId: 'po-7', orderReference: 'PO-2026-007', supplier: 'Cement Supply B.V.', status: 'draft', requiredBy: '2026-09-15T00:00:00Z', orderedQuantity: 10, receivedQuantity: 2, acceptedQuantity: 2, damagedQuantity: 0, remainingQuantity: 8, orderIssued: false, externalCommitments: 0 }] }] } }
  const api = vi.fn().mockImplementation(async (url, options) => options ? { review: materialReview } : url.includes('change-impact') ? detail : portfolio)
  render(<ContractorReviewControl api={api} canEdit />)
  await userEvent.click(screen.getByRole('button', { name: 'Dossier review' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Analyse Extension' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Add material quantity' }))
  await userEvent.clear(screen.getByRole('spinbutton', { name: 'Proposed quantity 1' }))
  await userEvent.type(screen.getByRole('spinbutton', { name: 'Proposed quantity 1' }), '12')
  await userEvent.type(screen.getByLabelText('Change reason'), 'Higher cement demand')
  await userEvent.click(screen.getByRole('button', { name: 'Preview impact' }))
  const impact = await screen.findByRole('region', { name: 'Material availability impact' })
  expect(impact.textContent).toContain('Proposed uncovered quantity: 5 bags')
  expect(impact.textContent).toContain('Additional supply needs confirmation before linked work can proceed')
  expect(impact.textContent).toContain('Foundation')
  expect(impact.textContent).toContain('PO-2026-007')
  expect(impact.textContent).toContain('No external supplier commitment recorded')
  expect(impact.textContent).toContain('Still outstanding: 8 bags')
  const submitted = JSON.parse(api.mock.calls.find(([, options]) => options)?.[1].body)
  expect(submitted.materialChanges).toEqual([{ requirementId: 'mat-1', quantity: '12' }])
})

it('lets office users save reasoned decision links and previews the explicitly affected customer decision', async () => {
  const decision = { id: 'selection-1', title: 'Bathroom tile finish', status: 'pending_client', open: true, selectedOption: null, impactLinks: [] }
  const context = {
    scope: { state: 'current', current: null, pending: null },
    clientDecisions: [decision],
    impactTargets: { tasks: [{ id: 'task-1', title: 'Foundation', status: 'planned' }], materialRequirements: [{ id: 'mat-1', title: 'Cement', unit: 'bags', status: 'needed' }] }
  }
  const linkedReview = { ...review, contractualContext: context, affectedClientDecisions: [{
    ...decision,
    links: [{ targetType: 'task', targetId: 'task-1', targetTitle: 'Foundation', rationale: 'The finish determines this installation sequence.' }]
  }] }
  const api = vi.fn().mockImplementation(async (url, options) => {
    if (url.endsWith('/impact-links')) return { selection: { ...decision, impactLinks: JSON.parse(options.body).links }, changed: true }
    if (options) return { review: linkedReview }
    return url.includes('change-impact') ? { ...detail, contractualContext: context } : portfolio
  })
  render(<ContractorReviewControl api={api} canEdit locale="nl-NL" />)
  await userEvent.click(screen.getByRole('button', { name: 'Dossiercontrole' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Extension analyseren' }))
  await userEvent.type(await screen.findByLabelText('Reden van wijziging'), 'Adjust the installation sequence')
  await userEvent.click(screen.getByRole('button', { name: 'Gevolgen berekenen' }))
  await screen.findByRole('region', { name: 'Klantbesluiten geraakt door dit voorstel' })
  await userEvent.click(screen.getByText(/Werk gekoppeld aan deze keuze/))
  await userEvent.selectOptions(screen.getByLabelText('Type gekoppeld record'), 'material_requirement')
  await userEvent.selectOptions(screen.getByLabelText('Gekoppeld record'), 'mat-1')
  await userEvent.type(screen.getByLabelText('Waarom is deze keuze gekoppeld?'), 'Selected tile determines cement quantity.')
  await userEvent.click(screen.getByRole('button', { name: 'Werk koppelen' }))
  await userEvent.click(screen.getByRole('button', { name: 'Koppelingen opslaan' }))
  await screen.findByText('Koppelingen opgeslagen; eerdere impactanalyses zijn nu verouderd.')
  const saved = api.mock.calls.find(([url]) => url.endsWith('/impact-links'))
  expect(JSON.parse(saved[1].body).links).toEqual([{ targetType: 'material_requirement', targetId: 'mat-1', rationale: 'Selected tile determines cement quantity.' }])
})

it('previews a controlled drawing replacement without implying publication', async () => {
  const context = { scope: { state: 'current', current: null, pending: null }, clientDecisions: [],
    impactTargets: { tasks: [], materialRequirements: [], takeoffItems: [], drawingRevisions: [],
      drawingReplacements: [{ currentDrawingId: 'drawing-p01', proposedDrawingId: 'drawing-p02', title: 'A-101: P01 > P02' }] } }
  const drawingReview = { ...review, drawingImpact: [{ currentDrawingId: 'drawing-p01', sheetNumber: 'A-101', currentRevision: 'P01',
    proposedDrawingId: 'drawing-p02', proposedRevision: 'P02', approvalStatus: 'pending', status: 'pending_approval' }] }
  const api = vi.fn().mockImplementation(async (url, options) => options ? { review: drawingReview } : url.includes('change-impact') ? { ...detail, contractualContext: context } : portfolio)
  render(<ContractorReviewControl api={api} canEdit />)
  await userEvent.click(screen.getByRole('button', { name: 'Dossier review' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Analyse Extension' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Add drawing replacement' }))
  await userEvent.type(screen.getByLabelText('Change reason'), 'Review coordinated window dimensions')
  await userEvent.click(screen.getByRole('button', { name: 'Preview impact' }))
  const impact = await screen.findByRole('region', { name: 'Drawing revision impact' })
  expect(impact.textContent).toContain('A-101')
  expect(impact.textContent).toContain('Proposed revision P02')
  expect(impact.textContent).toContain('current drawing stays in force until approval')
  const submitted = JSON.parse(api.mock.calls.find(([, options]) => options)?.[1].body)
  expect(submitted.drawingChanges).toEqual([{ currentDrawingId: 'drawing-p01', proposedDrawingId: 'drawing-p02' }])
})

it('shows recoverable request errors instead of successful coverage', async () => {
  const api = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(portfolio)
  render(<ContractorReviewControl api={api} locale="nl-NL" />)
  await userEvent.click(screen.getByRole('button', { name: 'Dossiercontrole' }))
  await screen.findByRole('alert')
  await userEvent.click(screen.getByRole('button', { name: 'Opnieuw proberen' }))
  await screen.findByText('Extension')
})
