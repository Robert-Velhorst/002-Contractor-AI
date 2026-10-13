import { expect, it } from 'vitest'
import * as legacy from '../components/JobWorkspaceControls'
import * as loaders from '../dashboard-chunks'

it.each(['CloseoutRegister', 'CommercialControl', 'DayworkControl',
  'FieldAssuranceWorkspace', 'FieldRiskControl', 'InspectionChecklistControl',
  'NonconformanceControl', 'PhotoEvidenceControl', 'ProductionControl',
  'ProjectControls', 'TakeoffControl', 'WorkPlanControl'])('keeps the original %s export identical to its independent component', async name => {
  expect(legacy[name]).toBe((await loaders[`load${name}`]()).default)
})

it('retains all sixteen original public component names', () => {
  expect(Object.keys(legacy).sort()).toEqual(['AutomationControl', 'CapabilitySetupControl',
    'ClientSuccessWorkspace', 'ClientsWorkspace', 'CloseoutRegister', 'CommercialControl',
    'DayworkControl', 'FieldAssuranceWorkspace', 'FieldRiskControl', 'InspectionChecklistControl',
    'NonconformanceControl', 'PhotoEvidenceControl', 'ProductionControl', 'ProjectControls',
    'TakeoffControl', 'WorkPlanControl'].sort())
})
