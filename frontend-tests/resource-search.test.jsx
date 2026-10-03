import { renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useRowSearchIndex, crewSearchFields, equipmentSearchFields, partnerSearchFields, receiptSearchFields, qualificationSearchFields, availabilitySearchFields } from '../resource-search'

it('projects 500 rows once, not once per typed character, and rebuilds when ledger rows change', () => {
  const rows = Array.from({ length: 500 }, (_, index) => ({ name: `Crew ${index}`, skills: ['roofing'] }))
  const project = vi.fn(crewSearchFields)
  const hook = renderHook(({ rows, query }) => useRowSearchIndex(rows, query, project), { initialProps: { rows, query: '' } })
  expect(hook.result.current).toBeNull()
  expect(project).not.toHaveBeenCalled()
  for (const query of ['r', 'ro', 'roo', 'roof', 'roofi', 'roofin', 'roofing']) hook.rerender({ rows, query })
  expect(project).toHaveBeenCalledTimes(500)
  expect(hook.result.current.get(rows[0])).toContain('roofing')
  const changedRows = [{ ...rows[0], skills: ['masonry'] }, ...rows.slice(1)]
  hook.rerender({ rows: changedRows, query: 'roofing' })
  expect(project).toHaveBeenCalledTimes(1000)
  expect(hook.result.current.get(changedRows[0])).not.toContain('roofing')
  hook.unmount()
})

it.each([
  [crewSearchFields, { phone: '+31612345678', skills: ['Metselaar'] }, 'metselaar'],
  [equipmentSearchFields, { data: { serialNumber: 'SER-777' }, inspection: { status: 'overdue' } }, 'ser-777'],
  [partnerSearchFields, { vatNumber: 'NL123', specialties: ['Installatie'] }, 'nl123'],
  [receiptSearchFields, { jobId: 'job-2', lines: [{ itemName: 'Koper' }], exceptions: [{ message: 'Tekort' }] }, 'tekort'],
  [qualificationSearchFields, { worker: { name: 'Evi' }, qualification: { credentials: [{ title: 'VCA', issuer: 'SSVV', credentialNumber: 987654 }] } }, '987654'],
  [availabilitySearchFields, { workerName: 'Evi', data: { operationalNotes: 'Reserve contact' } }, 'reserve contact'],
])('preserves searchable nested fields with %s', (project, row, query) => {
  const { result } = renderHook(() => useRowSearchIndex([row], query, project))
  expect(result.current.get(row)).toContain(query)
})

it('preserves the previous qualification and availability JSON search representations exactly', () => {
  const row = { worker: { name: 'Evi', role: 'Electrician' }, qualification: { credentials: [{ title: 'VCA', issuer: 'SSVV', credentialNumber: 1234 }] } }
  expect(JSON.stringify(qualificationSearchFields(row))).toBe(JSON.stringify({
    name: row.worker?.name, role: row.worker?.role,
    credentials: row.qualification?.credentials?.map(item => [item.title, item.issuer, item.credentialNumber]),
  }))
  const period = { workerName: 'Evi', workerRole: 'Electrician', title: 'Standby', periodLabel: 'Standby', data: { operationalNotes: 'Phone before arrival' } }
  expect(JSON.stringify(availabilitySearchFields(period))).toBe(JSON.stringify({
    workerName: period.workerName, workerRole: period.workerRole, title: period.title,
    periodType: period.periodLabel, notes: period.data?.operationalNotes,
  }))
  expect(JSON.stringify(qualificationSearchFields({}))).toBe('{}')
  expect(JSON.stringify(availabilitySearchFields({}))).toBe('{}')
})
