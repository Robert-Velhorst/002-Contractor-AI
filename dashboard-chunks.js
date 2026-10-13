export function moduleLoader(importModule) {
  let pending
  return () => {
    if (!pending) pending = Promise.resolve().then(importModule).catch(error => {
      pending = undefined
      throw error
    })
    return pending
  }
}

export const loadResources = moduleLoader(() => import('./components/ResourcesWorkspace'))
export const loadPipeline = moduleLoader(() => import('./components/PipelineWorkspace'))
export const loadBidPackages = moduleLoader(() => import('./components/BidPackageWorkspace'))
export const loadSchedule = moduleLoader(() => import('./components/PortfolioScheduleWorkspace'))
export const loadDispatch = moduleLoader(() => import('./components/DispatchWorkspace'))
export const loadHelp = moduleLoader(() => import('./components/HelpCenter'))
export const loadJobWorkspaceControls = moduleLoader(() => import('./components/JobWorkspaceControls'))
export const loadCloseoutRegister = moduleLoader(() => import('./components/CloseoutRegister'))
export const loadCommercialControl = moduleLoader(() => import('./components/CommercialControl'))
export const loadDayworkControl = moduleLoader(() => import('./components/DayworkControl'))
export const loadFieldAssuranceWorkspace = moduleLoader(() => import('./components/FieldAssuranceWorkspace'))
export const loadFieldRiskControl = moduleLoader(() => import('./components/FieldRiskControl'))
export const loadInspectionChecklistControl = moduleLoader(() => import('./components/InspectionChecklistControl'))
export const loadNonconformanceControl = moduleLoader(() => import('./components/NonconformanceControl'))
export const loadPhotoEvidenceControl = moduleLoader(() => import('./components/PhotoEvidenceControl'))
export const loadProductionControl = moduleLoader(() => import('./components/ProductionControl'))
export const loadProjectControls = moduleLoader(() => import('./components/ProjectControls'))
export const loadTakeoffControl = moduleLoader(() => import('./components/TakeoffControl'))
export const loadWorkPlanControl = moduleLoader(() => import('./components/WorkPlanControl'))
export const loadClients = moduleLoader(() => import('./components/ClientsWorkspace'))
export const loadAutomation = moduleLoader(() => import('./components/AutomationControl'))
export const loadCapabilitySetup = moduleLoader(() => import('./components/CapabilitySetupControl'))
export const loadFinance = moduleLoader(() => import('./components/FinanceWorkspace'))
export const loadFinanceActionDialog = moduleLoader(() => import('./components/FinanceActionDialog'))
export const loadResourceActionDialog = moduleLoader(() => import('./components/ResourceActionDialog'))
export const loadOperatorActionDialogs = moduleLoader(() => import('./components/OperatorActionDialogs'))
export const loadPerformance = moduleLoader(() => import('./components/PerformanceScorecard'))
export const loadRecovery = moduleLoader(() => import('./components/OperationalRecoveryPortfolio'))

export function intentPreloader(loaders, environment = () => globalThis.navigator) {
  let busy = false
  return key => {
    const browser = environment()
    const connection = browser?.connection
    if (busy || browser?.onLine === false || connection?.saveData
      || ['slow-2g', '2g'].includes(connection?.effectiveType) || !loaders[key]) return
    busy = true
    // Only code is warmed, one destination at a time; ledger reads stay explicit.
    void loaders[key]().catch(() => {}).finally(() => { busy = false })
  }
}

export const preloadDashboardSection = intentPreloader({
  pipeline: loadPipeline, schedule: loadSchedule, dispatch: loadDispatch,
  resources: loadResources, help: loadHelp, clients: loadClients,
  operations: loadAutomation, finance: loadFinance,
  performance: loadPerformance, recovery: loadRecovery,
})
