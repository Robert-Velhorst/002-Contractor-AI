import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import FieldWorkPack from '../components/FieldWorkPack'

const pack = { sourceHash: 'a'.repeat(64), job: { id: 'job-1', title: 'Kitchen renovation', address: 'Teststraat 1' }, worker: { id: 'worker-1', name: 'Worker' }, assignments: [{ id: 'assignment-1', role: 'Carpenter', scheduledStart: '2026-10-02T07:30:00.000Z', scheduledEnd: '2026-10-02T15:30:00.000Z', allocationHours: 8, dailyBriefing: { status: 'not_recorded' } }], planningReadiness: { status: 'blocked', blockerCount: 2, missingCount: 1, warningCount: 0, checkedAt: '2026-10-02T06:30:00.000Z', authorizationGranted: false }, startRelease: { status: 'not_issued', permissionToStart: false, blockers: ['Dispatch and planning readiness must be fully ready without warnings.', 'A released start huddle for this exact worker assignment and shift is required before start release.'] }, startReleaseEligibility: [{ assignmentId: 'assignment-1', eligible: false, blockers: ['Dispatch and planning readiness must be fully ready without warnings.', 'A released start huddle for this exact worker assignment and shift is required before start release.'] }], can: [{ id: 'vca', title: 'VCA', status: 'missing', mandatory: true }], know: { instructions: [], drawings: [], safetyPlans: [] }, have: { materials: [], equipment: [] }, do: [{ id: 'task-1', title: 'Install frame', status: 'open' }], checks: { quality: [], photos: [] }, questions: [] }
function apiFixture() {
  return vi.fn().mockImplementation(async (url, options) => options ? { success: true } : url.includes('/jobs/') ? { pack, workers: [] } : { rows: [pack.job], nextCursor: null })
}

it('opens personal work and switches between the four phone views', async () => {
  const onOpenJob = vi.fn()
  render(<FieldWorkPack api={apiFixture()} canRespond onOpenJob={onOpenJob} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Open work pack Kitchen renovation' }))
  await screen.findByRole('heading', { name: 'Kitchen renovation' })
  await userEvent.click(screen.getByRole('tab', { name: 'Be qualified' }))
  await screen.findByText('VCA')
  await userEvent.click(screen.getByRole('tab', { name: 'Do' }))
  expect(await screen.findAllByText('Install frame')).not.toHaveLength(0)
  await userEvent.click(screen.getByRole('button', { name: 'Open execution' }))
  expect(onOpenJob).toHaveBeenCalledWith(pack.job)
})

it('shows the mixed-trade crew and each member role with the shared task', async () => {
  const crewPack = { ...pack, do: [{ ...pack.do[0], crew: [
    { workerId: 'worker-1', workerName: 'Milan', role: 'Timmerman' },
    { workerId: 'worker-2', workerName: 'Noor', role: 'Elektricien' }
  ] }] }
  const api = vi.fn().mockImplementation(async url => url.includes('/jobs/')
    ? { pack: crewPack, workers: [] }
    : { rows: [pack.job], nextCursor: null })
  render(<FieldWorkPack api={api} canRespond />)
  await userEvent.click(await screen.findByRole('button', { name: 'Open work pack Kitchen renovation' }))
  await userEvent.click(screen.getByRole('tab', { name: 'Do' }))
  const task = (await screen.findAllByText('Install frame')).find(element => element.tagName === 'STRONG')
  expect(task).toBeTruthy()
  expect(task.closest('li').textContent).toContain('Milan · Timmerman')
  expect(task.closest('li').textContent).toContain('Noor · Elektricien')
})

it('shows the configured supervision ratio and current supervisor check-ins', async () => {
  const supervisionPack = { ...pack, do: [{ ...pack.do[0], supervision: {
    required: true, ratio: { workersPerSupervisor: 2 }, requiredSupervisorCount: 2
  }, supervisions: [
    { workerId: 'lead-1', workerName: 'Lead One', role: 'Lead Installer', checkedIn: true },
    { workerId: 'lead-2', workerName: 'Lead Two', role: 'Lead Installer', checkedIn: false }
  ] }] }
  const api = vi.fn().mockImplementation(async url => url.includes('/jobs/')
    ? { pack: supervisionPack, workers: [] }
    : { rows: [pack.job], nextCursor: null })
  render(<FieldWorkPack api={api} canRespond />)
  await userEvent.click(await screen.findByRole('button', { name: 'Open work pack Kitchen renovation' }))
  await userEvent.click(screen.getByRole('tab', { name: 'Do' }))
  const task = (await screen.findAllByText('Install frame')).find(element => element.tagName === 'STRONG')
  const taskRow = task.closest('li')
  expect(taskRow.textContent).toContain('Lead One · Lead Installer · Checked in on site')
  expect(taskRow.textContent).toContain('Lead Two · Lead Installer · Supervisor not checked in')
  expect(taskRow.textContent).toContain('Required supervision ratio: one per 2 workers · Required supervisors checked in: 1 of 2')
})

it('shows approved task-linked hazard analyses and safety data in the worker knowledge view', async () => {
  const safetyPack = {
    ...pack,
    know: { ...pack.know, jhaApplicability: [{ taskId: 'task-1', title: 'Install frame', status: 'required' }], jhas: [{
      id: 'jha-approved', title: 'Frame installation JHA', riskLevel: 'high', dueAt: '2026-10-02',
      linkedTaskIds: ['task-1'], hazards: ['Falling frame'], controls: ['Use two-person lift'],
      workMethod: 'Install from stable platform.', ppe: ['Safety shoes'], stopWorkTriggers: ['Platform movement']
    }], sdsSheets: [{
      id: 'sds-approved', material: 'Frame adhesive', manufacturer: 'Example maker', productCode: 'FA-100',
      hazardClasses: ['Skin irritation'], requiredPpe: ['Protective gloves'], firstAidMeasures: 'Rinse with water.',
      fireMeasures: 'Use foam.', handlingStorage: 'Keep closed.', spillResponse: 'Absorb safely.',
      disposal: 'Use approved collector.', emergencyContact: 'Site desk', revisionNumber: 2,
      expiresAt: '2027-01-01T00:00:00.000Z',
      linkedMaterials: [{ id: 'material-1', name: 'Frame adhesive requirement' }],
      file: { filename: 'frame-adhesive-sds.pdf', mimeType: 'application/pdf', sizeBytes: 120, sha256: 'b'.repeat(64) }
    }] }
  }
  const api = vi.fn().mockImplementation(async url => url.includes('/jobs/')
    ? { pack: safetyPack, workers: [] }
    : { rows: [pack.job], nextCursor: null })
  render(<FieldWorkPack api={api} canRespond />)
  await userEvent.click(await screen.findByRole('button', { name: 'Open work pack Kitchen renovation' }))
  await userEvent.click(screen.getByRole('tab', { name: 'Know' }))
  expect(await screen.findByRole('heading', { name: 'Task JHA applicability' })).toBeTruthy()
  expect(screen.getByText('A task-specific JHA is required.')).toBeTruthy()
  const analyses = await screen.findByRole('heading', { name: 'Approved job hazard analyses' })
  expect(analyses.parentElement.textContent).toContain('Frame installation JHA')
  expect(analyses.parentElement.textContent).toContain('Install from stable platform.')
  expect(analyses.parentElement.textContent).toContain('Falling frame')
  expect(analyses.parentElement.textContent).toContain('Platform movement')
  const section = await screen.findByRole('heading', { name: 'Current safety data sheets' })
  expect(section.parentElement.textContent).toContain('Frame adhesive')
  expect(section.parentElement.textContent).toContain('Frame adhesive requirement')
  expect(section.parentElement.textContent).toContain('Protective gloves')
  expect(section.parentElement.textContent).toContain('Rinse with water.')
  expect(screen.getByRole('button', { name: 'Download approved safety data sheet PDF' })).toBeTruthy()
})

it('shows only released submittal references and task scope in the worker knowledge view', async () => {
  const submittalPack = { ...pack, know: { ...pack.know, submittals: [{
    id: 'submittal-window', title: 'Window specification', packageName: 'Windows', taskScope: 'tasks', taskIds: ['task-1'],
    attachments: [{ id: 'document-window', filename: 'window-specification.pdf', mimeType: 'application/pdf', sizeBytes: 1024, sha256: 'd'.repeat(64) }]
  }] } }
  const api = vi.fn().mockImplementation(async url => url.includes('/jobs/')
    ? { pack: submittalPack, workers: [] }
    : { rows: [pack.job], nextCursor: null })
  render(<FieldWorkPack api={api} canRespond />)
  await userEvent.click(await screen.findByRole('button', { name: 'Open work pack Kitchen renovation' }))
  await userEvent.click(screen.getByRole('tab', { name: 'Know' }))
  const approved = await screen.findByRole('heading', { name: 'Approved submittals' })
  expect(approved.parentElement.textContent).toContain('Window specification')
  expect(approved.parentElement.textContent).toContain('Applies to your assigned tasks: Install frame')
  expect(approved.parentElement.textContent).toContain('window-specification.pdf')
  expect(approved.parentElement.textContent).toContain('does not change your task, price, dates')
  expect(screen.queryByText(/storageRef|reviewer|pending approval/i)).toBeNull()
})

it('shows material SDS readiness and keeps required missing evidence visibly blocked', async () => {
  const safetyPack = {
    ...pack,
    know: {
      ...pack.know,
      sdsReadiness: {
        status: 'blocked',
        items: [{ materialRequirementId: 'material-1', material: 'Frame adhesive', requirement: 'required', sheetIds: [], ready: false }],
        blockers: [{ type: 'material_sds_missing', materialRequirementId: 'material-1', message: 'A current approved SDS PDF is missing for Frame adhesive.' }]
      }
    }
  }
  const api = vi.fn().mockImplementation(async url => url.includes('/jobs/')
    ? { pack: safetyPack, workers: [] }
    : { rows: [pack.job], nextCursor: null })
  render(<FieldWorkPack api={api} canRespond />)
  await userEvent.click(await screen.findByRole('button', { name: 'Open work pack Kitchen renovation' }))
  await userEvent.click(screen.getByRole('tab', { name: 'Know' }))
  const readiness = await screen.findByRole('region', { name: 'Material SDS readiness' })
  expect(readiness.textContent).toContain('Frame adhesive')
  expect(readiness.textContent).toContain('Required SDS unavailable')
  expect(readiness.querySelector('.work-pack-warning')).toBeTruthy()
})

it('shows the worker-specific shift rather than treating the project date as their work time', async () => {
  render(<FieldWorkPack api={apiFixture()} canRespond />)
  await userEvent.click(await screen.findByRole('button', { name: 'Open work pack Kitchen renovation' }))
  const shifts = await screen.findByRole('region', { name: 'My scheduled shifts' })
  expect(shifts.textContent).toContain('Carpenter')
  expect(shifts.textContent).toContain('8 allocated hours')
  expect(shifts.textContent).toContain('2026')
})

it('shows the exact shift briefing and warns a replacement whose assignment was not covered', async () => {
  const briefing = { status: 'ready', cycleId: 'cycle-1', workDate: '2026-10-02', shiftLabel: 'replacement',
    plannedWork: 'Brief the replacement on the updated wall sequence.',
    productionTarget: 'Complete the assigned installation and verify hold points.',
    siteConditions: 'Keep the access route clear.', safetyFocus: 'Use the task-linked lifting controls.',
    qualityHoldPoints: ['Check level before final fixing'], constraints: ['Confirm the delivery first'],
    evidenceReference: 'briefing:replacement' }
  const briefPack = { ...pack, assignments: [{ ...pack.assignments[0], dailyBriefing: briefing }] }
  const api = vi.fn().mockImplementation(async url => url.includes('/jobs/')
    ? { pack: briefPack, workers: [] } : { rows: [pack.job], nextCursor: null })
  render(<FieldWorkPack api={api} canRespond />)
  await userEvent.click(await screen.findByRole('button', { name: 'Open work pack Kitchen renovation' }))
  await userEvent.click(screen.getByRole('tab', { name: 'Know' }))
  const region = await screen.findByRole('region', { name: 'Daily shift briefing' })
  expect(region.textContent).toContain('updated wall sequence')
  expect(region.textContent).toContain('task-linked lifting controls')
  expect(region.textContent).toContain('briefing:replacement')

  const mismatchPack = { ...briefPack, assignments: [{ ...briefPack.assignments[0],
    dailyBriefing: { status: 'crew_update_required', workDate: '2026-10-02' } }] }
  api.mockImplementation(async url => url.includes('/jobs/')
    ? { pack: mismatchPack, workers: [] } : { rows: [pack.job], nextCursor: null })
  await userEvent.click(screen.getByRole('button', { name: 'Work packs' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Open work pack Kitchen renovation' }))
  await userEvent.click(screen.getByRole('tab', { name: 'Know' }))
  expect(await screen.findByText(/does not cover this exact worker shift/)).toBeTruthy()
})

it('shows current planning readiness while clearly withholding start permission', async () => {
  render(<FieldWorkPack api={apiFixture()} canRespond />)
  await userEvent.click(await screen.findByRole('button', { name: 'Open work pack Kitchen renovation' }))
  const readiness = await screen.findByRole('region', { name: 'Work planning readiness' })
  expect(readiness.textContent).toContain('blocked')
  expect(readiness.textContent).toContain('2 blockers, 1 missing items, 0 warnings')
  expect(readiness.textContent).toContain('not permission to start')
})

it('keeps supervisor start release blocked until the server-projected prerequisites are clear', async () => {
  render(<FieldWorkPack api={apiFixture()} canIssueStartRelease />)
  await userEvent.click(await screen.findByRole('button', { name: 'Open work pack Kitchen renovation' }))
  const release = await screen.findByRole('region', { name: 'Supervisor start release' })
  expect(release.textContent).toContain('Dispatch and planning readiness must be fully ready')
  expect(release.textContent).toContain('A released start huddle for this exact worker assignment and shift is required')
  expect(screen.getByRole('button', { name: 'Issue supervisor release' }).disabled).toBe(true)
})

it('lets an authorized office reviewer issue a checklist-backed shift release only for a ready worker pack', async () => {
  let currentPack = {
    ...pack,
    planningReadiness: { ...pack.planningReadiness, status: 'ready', blockerCount: 0, missingCount: 0 },
    acknowledgment: { current: true },
    startRelease: { status: 'not_issued', permissionToStart: false, blockers: [] },
    startReleaseEligibility: [{ assignmentId: 'assignment-1', eligible: true, blockers: [] }]
  }
  const api = vi.fn().mockImplementation(async (url, options) => {
    if (options && url.endsWith('/work-pack/start-release')) {
      currentPack = { ...currentPack, startRelease: { id: 'release-1', assignmentId: 'assignment-1', status: 'awaiting_worker', permissionToStart: false, expiresAt: '2026-10-02T11:30:00.000Z' } }
      return { success: true }
    }
    return url.includes('/jobs/') ? { pack: currentPack, workers: [] } : { rows: [pack.job], nextCursor: null }
  })
  render(<FieldWorkPack api={api} canIssueStartRelease />)
  await userEvent.click(await screen.findByRole('button', { name: 'Open work pack Kitchen renovation' }))
  for (const name of ['Current site conditions checked', 'Work method and controls reviewed', 'Required permits confirmed', 'Crew and qualifications checked', 'Equipment and PPE available', 'Emergency arrangements known']) {
    await userEvent.click(screen.getByRole('checkbox', { name }))
  }
  await userEvent.type(screen.getByRole('textbox', { name: 'Reason for release' }), 'Supervisor checked site and safe method.')
  await userEvent.type(screen.getByRole('textbox', { name: 'Site check or briefing reference' }), 'briefing:today')
  await userEvent.click(screen.getByRole('button', { name: 'Issue supervisor release' }))
  await screen.findByText('Supervisor release issued. The worker must confirm receipt.')
  const submission = JSON.parse(api.mock.calls.find(([url]) => url.endsWith('/work-pack/start-release'))[1].body)
  expect(submission.workerId).toBe('worker-1')
  expect(submission.assignmentId).toBe('assignment-1')
  expect(submission.checks).toHaveLength(6)
  expect(submission.sourceHash).toBe(pack.sourceHash)
})

it('requires the assigned worker to confirm release receipt and allows them to stop changed work', async () => {
  let currentPack = {
    ...pack,
    startRelease: { id: 'release-1', status: 'awaiting_worker', permissionToStart: false, expiresAt: '2026-10-02T11:30:00.000Z' },
    assignments: [{ ...pack.assignments[0], startReleaseRequired: true, workBoardTaskIds: ['task-1'],
      startRelease: { id: 'release-1', assignmentId: 'assignment-1', status: 'awaiting_worker', permissionToStart: false, expiresAt: '2026-10-02T11:30:00.000Z' } }],
    startReleaseEligibility: [{ assignmentId: 'assignment-1', eligible: false, blockers: [] }]
  }
  const api = vi.fn().mockImplementation(async (url, options) => {
    if (options && url.endsWith('/start-release/acknowledgment')) currentPack = { ...currentPack, startRelease: { ...currentPack.startRelease, status: 'active', permissionToStart: true }, assignments: currentPack.assignments.map(assignment => ({ ...assignment, startRelease: { ...assignment.startRelease, status: 'active', permissionToStart: true } })) }
    if (options && url.endsWith('/start-release/revoke')) currentPack = { ...currentPack, startRelease: { status: 'revoked', permissionToStart: false }, assignments: currentPack.assignments.map(assignment => ({ ...assignment, startRelease: { ...assignment.startRelease, status: 'revoked', permissionToStart: false } })) }
    return options ? { success: true } : url.includes('/jobs/') ? { pack: currentPack, workers: [] } : { rows: [pack.job], nextCursor: null }
  })
  render(<FieldWorkPack api={api} canRespond />)
  await userEvent.click(await screen.findByRole('button', { name: 'Open work pack Kitchen renovation' }))
  const confirm = screen.getByRole('button', { name: 'Confirm release received' })
  expect(confirm.disabled).toBe(true)
  await userEvent.click(screen.getByRole('checkbox', { name: 'I received this release and will stop if site conditions or controls differ.' }))
  await userEvent.click(confirm)
  await screen.findByText('Supervisor release receipt confirmed. Stop and contact the supervisor if conditions differ.')
  await userEvent.type(screen.getByRole('textbox', { name: 'Stop work: reason or changed condition' }), 'Unexpected site condition.')
  await userEvent.click(screen.getByRole('button', { name: 'Stop and notify office' }))
  await screen.findByText('Start release stopped and retained for review.')
  const acknowledgment = JSON.parse(api.mock.calls.find(([url]) => url.endsWith('/start-release/acknowledgment'))[1].body)
  expect(acknowledgment.workerId).toBeUndefined()
  expect(api.mock.calls.some(([url]) => url.endsWith('/start-release/revoke'))).toBe(true)
})

it('shows accepted scope changes as work context without implying tasks or dates were revised', async () => {
  const updatedPack = {
    ...pack,
    know: {
      ...pack.know,
      scopeChanges: [{ id: 'change-1', variationNumber: 'VAR-2026-000001', revisionNumber: 1, title: 'Access protection', scope: 'Install floor protection on the revised access route.', acceptedAt: '2026-09-11T10:00:00.000Z' }],
      scopeChangeReviewRequired: []
    }
  }
  const api = vi.fn().mockImplementation(async url => url.includes('/jobs/') ? { pack: updatedPack, workers: [] } : { rows: [updatedPack.job], nextCursor: null })
  render(<FieldWorkPack api={api} canRespond />)
  await userEvent.click(await screen.findByRole('button', { name: 'Open work pack Kitchen renovation' }))
  await userEvent.click(screen.getByRole('tab', { name: 'Know' }))
  await screen.findByRole('heading', { name: 'Accepted scope changes' })
  await screen.findByText('Install floor protection on the revised access route.')
  await screen.findByText(/Scope context only. Tasks, materials and dates stay separate/)
  expect(screen.queryByText(/EUR|contract value|risk statement/i)).toBeNull()
})

it('shows a case-linked office recovery instruction inside only the worker work-pack know view', async () => {
  const instructedPack = { ...pack, know: { ...pack.know, recoveryInstructions: [{ id: 'recovery-instruction-1',
    caseId: 'case-1', sourceId: 'progress-1', taskId: 'task-1', text: 'Check the replacement brackets and resume the frame installation.',
    recordedAt: '2026-09-24T10:00:00.000Z' }] } }
  const api = vi.fn().mockImplementation(async url => url.includes('/jobs/') ? { pack: instructedPack, workers: [] } : { rows: [pack.job], nextCursor: null })
  render(<FieldWorkPack api={api} canRespond />)
  await userEvent.click(await screen.findByRole('button', { name: 'Open work pack Kitchen renovation' }))
  await userEvent.click(screen.getByRole('tab', { name: 'Know' }))
  const instructions = await screen.findByRole('region', { name: 'Updated task instructions' })
  expect(instructions.textContent).toContain('Install frame')
  expect(instructions.textContent).toContain('Check the replacement brackets and resume the frame installation.')
  expect(instructions.textContent).toContain('do not release a permit')
})

it('shows an approved client answer linked to the worker task without exposing internal analysis', async () => {
  const clientUpdatePack = { ...pack, know: { ...pack.know, clientUpdates: [{ title: 'Opening dimensions', taskTitles: ['Install frame'],
    response: 'The office verified the approved opening is 900 mm. Check the current drawing before fitting.', answeredAt: '2026-09-25T10:00:00.000Z' }] } }
  const api = vi.fn().mockImplementation(async url => url.includes('/jobs/') ? { pack: clientUpdatePack, workers: [] } : { rows: [clientUpdatePack.job], nextCursor: null })
  render(<FieldWorkPack api={api} canRespond />)
  await userEvent.click(await screen.findByRole('button', { name: 'Open work pack Kitchen renovation' }))
  await userEvent.click(screen.getByRole('tab', { name: 'Know' }))
  const updates = await screen.findByRole('region', { name: 'Approved client updates' })
  expect(updates.textContent).toContain('Install frame')
  expect(updates.textContent).toContain('The office verified the approved opening is 900 mm.')
  expect(updates.textContent).not.toContain('AI suggestion')
  expect(updates.textContent).toContain('does not itself change task scope')
})

it('shows assignment-scoped safety dossier content without presenting it as start authorization', async () => {
  const safetyPack = {
    ...pack,
    know: {
      ...pack.know,
      safetyReview: { authorizationGranted: false, notice: 'Dossier information only; no permission to start.' },
      safetyPlans: [{
        id: 'plan-1', planNumber: 'PTP-2026-000001', revisionNumber: 2, title: 'Replace distribution panel',
        status: 'active', workDate: '2026-09-24', shiftLabel: 'Day shift', location: 'Plant room',
        definitionIntegrityValid: true, prerequisitesCurrent: true,
        ownAcknowledgement: { status: 'acknowledged', acknowledgedAt: '2026-09-24T08:00:00Z' },
        steps: [{ stepKey: 'isolate', description: 'Verify isolation', hazards: ['Stored energy'], controls: ['Lock out and test'] }],
        stopWorkTriggers: ['Isolation boundary changes'], blockers: [],
        permit: { id: 'permit-1', title: 'Electrical isolation', status: 'active', ownAcknowledgement: { status: 'acknowledged' }, hazards: [], controls: [], conditions: [], blockers: [] }
      }],
      lmraAssessments: [{
        id: 'lmra-1', workArea: 'Plant room', activity: 'Replace distribution panel', outcome: 'ready',
        assessedAt: '2026-09-24T08:00:00Z', validUntil: '2026-09-24T10:00:00Z', sourceCurrent: true,
        integrityValid: true, expired: false, isLatestForWorkerPlan: true, stopWorkReason: null,
        observedHazards: [], checks: { controls_in_place: true }, blockers: []
      }]
    }
  }
  const api = vi.fn().mockImplementation(async url => url.includes('/jobs/') ? { pack: safetyPack, workers: [] } : { rows: [pack.job], nextCursor: null })
  render(<FieldWorkPack api={api} canRespond />)
  await userEvent.click(await screen.findByRole('button', { name: 'Open work pack Kitchen renovation' }))
  await userEvent.click(screen.getByRole('tab', { name: 'Know' }))
  await screen.findByRole('region', { name: 'Safety dossier review' })
  await screen.findByText('Verify isolation')
  await screen.findByText(/Isolation boundary changes/)
  await screen.findByText(/Dossier information only; no permission to start/)
  expect(screen.queryByText(/authorization granted/i)).toBeNull()
})

it('requires explicit read confirmation and retains the exact current source', async () => {
  const api = apiFixture()
  render(<FieldWorkPack api={api} canRespond />)
  await userEvent.click(await screen.findByRole('button', { name: 'Open work pack Kitchen renovation' }))
  const button = await screen.findByRole('button', { name: 'Record read confirmation' })
  expect(button.disabled).toBe(true)
  await userEvent.click(screen.getByLabelText('I have read this work-pack version'))
  await userEvent.click(button)
  await waitFor(() => expect(api.mock.calls.some(([url]) => url.endsWith('/acknowledgments'))).toBe(true))
  const payload = JSON.parse(api.mock.calls.find(([url]) => url.endsWith('/acknowledgments'))[1].body)
  expect(payload.sourceHash).toBe(pack.sourceHash)
  expect(payload.understood).toBe(true)
  expect(payload.workerId).toBeUndefined()
})

it('office preview cannot impersonate a worker and failures remain retryable', async () => {
  const api = apiFixture()
  api.mockRejectedValueOnce(new Error('Connection unavailable'))
  render(<FieldWorkPack api={api} />)
  await screen.findByRole('alert')
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Open work pack Kitchen renovation' }))
  await screen.findByRole('heading', { name: 'Kitchen renovation' })
  expect(screen.queryByRole('button', { name: 'Record read confirmation' })).toBeNull()
})

it('reports progress against the selected task and retains it for office review', async () => {
  const api = apiFixture()
  render(<FieldWorkPack api={api} canRespond />)
  await userEvent.click(await screen.findByRole('button', { name: 'Open work pack Kitchen renovation' }))
  await screen.findByRole('heading', { name: 'Kitchen renovation' })
  await userEvent.selectOptions(screen.getByLabelText('Task'), 'task-1')
  await userEvent.selectOptions(screen.getByLabelText('Progress status'), 'blocked')
  await userEvent.clear(screen.getByLabelText('Progress (%)'))
  await userEvent.type(screen.getByLabelText('Progress (%)'), '35')
  await userEvent.type(screen.getByLabelText('What changed or blocks this task?'), 'The delivered frame is missing two required brackets.')
  await userEvent.click(screen.getByRole('button', { name: 'Report to office' }))
  await screen.findByText('Task update sent for office review.')
  const request = api.mock.calls.find(([url]) => url.endsWith('/progress'))
  expect(JSON.parse(request[1].body)).toMatchObject({ taskId: 'task-1', status: 'blocked', progressPercent: 35 })
})

it('lets a field worker report held equipment as a blocker and sends its exact custody scope', async () => {
  const equipmentPack = {
    ...pack,
    have: { ...pack.have, equipment: [{ id: 'reservation-1', taskId: 'task-1', toolName: 'Mixer', custody: { status: 'checked_out', heldByYou: true } }] }
  }
  const api = vi.fn().mockImplementation(async (url, options) => options ? { success: true } : url.includes('/jobs/') ? { pack: equipmentPack, workers: [] } : { rows: [pack.job], nextCursor: null })
  render(<FieldWorkPack api={api} canRespond />)
  await userEvent.click(await screen.findByRole('button', { name: 'Open work pack Kitchen renovation' }))
  await userEvent.selectOptions(screen.getByLabelText('Task'), 'task-1')
  await userEvent.selectOptions(screen.getByLabelText('Progress status'), 'blocked')
  await userEvent.selectOptions(screen.getByLabelText('Equipment condition'), 'reservation-1')
  await userEvent.selectOptions(screen.getByLabelText('Concern type'), 'malfunction')
  const note = 'Mixer trips after a few seconds under load.'
  await userEvent.type(screen.getByLabelText('What changed or blocks this task?'), note)
  await userEvent.click(screen.getByRole('button', { name: 'Report to office' }))
  await screen.findByText('Equipment has been put on hold and the task blocker sent to the office. An inspection is still required.')
  const request = api.mock.calls.find(([url]) => url.endsWith('/progress'))
  expect(JSON.parse(request[1].body)).toMatchObject({
    taskId: 'task-1', status: 'blocked',
    equipmentIssue: { reservationId: 'reservation-1', issueType: 'malfunction', note }
  })
})

it('shows supervised-only tasks without offering them for the workers progress reports', async () => {
  const supervisedPack = {
    ...pack,
    do: [...pack.do, {
      id: 'task-supervised', title: 'Install under supervision', status: 'open', assigneeId: 'worker-other', supervisingOnly: true,
      supervision: { required: true, workerId: 'worker-1', workerName: 'Worker', role: 'Lead Carpenter', checkedIn: true }
    }]
  }
  const api = vi.fn().mockImplementation(async url => url.includes('/jobs/') ? { pack: supervisedPack, workers: [] } : { rows: [pack.job], nextCursor: null })
  render(<FieldWorkPack api={api} canRespond />)
  await userEvent.click(await screen.findByRole('button', { name: 'Open work pack Kitchen renovation' }))
  await userEvent.click(screen.getByRole('tab', { name: 'Do' }))
  await screen.findByText('You are the designated supervisor for this task. Progress reports belong to its assigned worker.')
  const choices = screen.getByLabelText('Task')
  expect(Array.from(choices.options, option => option.value)).toEqual(['', 'task-1'])
})

it('explains and blocks in-progress reporting for a task awaiting its required start release', async () => {
  const controlledPack = {
    ...pack,
    assignments: [{ ...pack.assignments[0], startReleaseRequired: true, workBoardPositionId: 'position-1',
      workBoardTaskIds: ['task-1'], startRelease: { status: 'not_issued', permissionToStart: false } }]
  }
  const api = vi.fn().mockImplementation(async url => url.includes('/jobs/') ? { pack: controlledPack, workers: [] } : { rows: [pack.job], nextCursor: null })
  render(<FieldWorkPack api={api} canRespond />)
  await userEvent.click(await screen.findByRole('button', { name: 'Open work pack Kitchen renovation' }))
  await screen.findByText('A current supervisor start release and your receipt confirmation are required before this task can be reported in progress. You can still report a blocker.')
  const submit = screen.getByRole('button', { name: 'Report to office' })
  expect(submit.disabled).toBe(true)
  await userEvent.selectOptions(screen.getByLabelText('Progress status'), 'blocked')
  await userEvent.type(screen.getByLabelText('What changed or blocks this task?'), 'Access is not safe yet.')
  expect(submit.disabled).toBe(false)
  expect(api.mock.calls.some(([url]) => url.endsWith('/progress'))).toBe(false)
})

it('enables in-progress reporting after the required start release is current and acknowledged', async () => {
  const controlledPack = {
    ...pack,
    assignments: [{ ...pack.assignments[0], startReleaseRequired: true, workBoardPositionId: 'position-1',
      workBoardTaskIds: ['task-1'], startRelease: { status: 'active', permissionToStart: true } }]
  }
  const api = vi.fn().mockImplementation(async (url, options) => options ? { success: true }
    : url.includes('/jobs/') ? { pack: controlledPack, workers: [] } : { rows: [pack.job], nextCursor: null })
  render(<FieldWorkPack api={api} canRespond />)
  await userEvent.click(await screen.findByRole('button', { name: 'Open work pack Kitchen renovation' }))
  expect(screen.queryByText(/required before this task can be reported in progress/)).toBeNull()
  await userEvent.type(screen.getByLabelText('What changed or blocks this task?'), 'Starting the released task.')
  expect(screen.getByRole('button', { name: 'Report to office' }).disabled).toBe(false)
})

it('lets the assigned worker confirm a warehouse issue arrival with accepted and damaged quantities', async () => {
  const issuePack = { ...pack, have: { ...pack.have, siteIssues: [{ id: 'issue-1', materialName: 'Roofing membrane', unit: 'rolls',
    quantity: 5, receivedQuantity: 0, acceptedQuantity: 0, remainingQuantity: 5, status: 'in_transit',
    dispatchReference: 'PICK-77', expectedArrivalAt: '2026-10-02T10:00:00.000Z', receipts: [] }] } }
  const api = vi.fn().mockImplementation(async (url, options) => options ? { success: true } : url.includes('/jobs/') ? { pack: issuePack, workers: [] } : { rows: [pack.job], nextCursor: null })
  render(<FieldWorkPack api={api} canRespond />)
  await userEvent.click(await screen.findByRole('button', { name: 'Open work pack Kitchen renovation' }))
  await screen.findByRole('heading', { name: 'Kitchen renovation' })
  await userEvent.click(screen.getByRole('tab', { name: 'Have' }))
  await screen.findByText(/Dispatch reference: PICK-77/)
  await userEvent.type(screen.getByLabelText('Quantity received'), '3')
  expect(screen.getByLabelText('Quantity accepted').value).toBe('3')
  await userEvent.clear(screen.getByLabelText('Quantity accepted'))
  await userEvent.type(screen.getByLabelText('Quantity accepted'), '2')
  expect(await screen.findByText(/Awaiting inspection: 1 rolls/)).toBeTruthy()
  await userEvent.clear(screen.getByLabelText('Quantity damaged'))
  await userEvent.type(screen.getByLabelText('Quantity damaged'), '1')
  await userEvent.type(screen.getByLabelText('Receipt reference'), 'SITE-77')
  await userEvent.type(screen.getByLabelText('Arrival evidence reference'), 'photo:site-77')
  await userEvent.clear(screen.getByLabelText('Received at'))
  await userEvent.type(screen.getByLabelText('Received at'), 'Roof level')
  await userEvent.click(screen.getByRole('button', { name: 'Confirm arrival at site' }))
  await screen.findByText('Material arrival recorded for office review.')
  const request = api.mock.calls.find(([url]) => url.endsWith('/material-stock-site-issues/issue-1/receipts'))
  expect(JSON.parse(request[1].body)).toMatchObject({ receivedQuantity: 3, acceptedQuantity: 2, damagedQuantity: 1,
    receiptReference: 'SITE-77', evidenceReference: 'photo:site-77', location: 'Roof level' })
  expect(JSON.parse(request[1].body).receivedBy).toBeUndefined()
})

it('shows only an approved office answer in the field worker conversation', async () => {
  const question = { id: 'question-1', message: 'Which drawing revision should I follow?', recordedAt: '2026-09-24T09:00:00.000Z', replyStatus: 'pending_approval', response: null }
  const pendingApi = vi.fn().mockImplementation(async url => url.includes('/jobs/') ? { pack: { ...pack, questions: [question] }, workers: [] } : { rows: [pack.job], nextCursor: null })
  const view = render(<FieldWorkPack api={pendingApi} canRespond />)
  await userEvent.click(await screen.findByRole('button', { name: 'Open work pack Kitchen renovation' }))
  await screen.findByText(question.message)
  await screen.findByText(/Office reply pending approval/)
  expect(screen.queryByText('Use drawing revision B.')).toBeNull()

  view.unmount()
  const answeredApi = vi.fn().mockImplementation(async url => url.includes('/jobs/') ? {
    pack: { ...pack, questions: [{ ...question, replyStatus: 'answered', response: 'Use drawing revision B.' }] }, workers: []
  } : { rows: [pack.job], nextCursor: null })
  render(<FieldWorkPack api={answeredApi} canRespond />)
  await userEvent.click(await screen.findByRole('button', { name: 'Open work pack Kitchen renovation' }))
  await screen.findByText(/Office replied/)
  await screen.findByText('Use drawing revision B.')
})

it('refreshes replies while the assigned worker stays in an online work pack', async () => {
  const initial = { id: 'question-2', message: 'Can I start before the delivery arrives?', recordedAt: '2026-09-24T09:00:00.000Z', replyStatus: 'open', response: null }
  const replies = [
    { pack: { ...pack, questions: [initial] }, workers: [] },
    { pack: { ...pack, questions: [{ ...initial, replyStatus: 'answered', response: 'No. Wait for the delivery and confirmation.' }] }, workers: [] }
  ]
  const api = vi.fn().mockImplementation(async url => url.endsWith('/replies')
    ? { questions: replies[1].pack.questions }
    : url.includes('/jobs/') ? replies[0] : { rows: [pack.job], nextCursor: null })
  render(<FieldWorkPack api={api} canRespond pollIntervalMs={50} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Open work pack Kitchen renovation' }))
  await screen.findByText('No. Wait for the delivery and confirmation.', {}, { timeout: 3000 })
  await screen.findByText(/A new approved office reply is available/, {}, { timeout: 3000 })
  await screen.findByText(/Office replied/)
  expect(screen.queryByText(/Waiting for office reply/)).toBeNull()
  expect(api).toHaveBeenCalledWith('/api/ledger/jobs/job-1/work-pack/replies')
})
