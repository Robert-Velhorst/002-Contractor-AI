import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { companyApiUrl, companyFetch } from './company-request.mjs'
import { companyHeaders } from './company-scope.mjs'
import {
  Activity,
  Archive,
  ArrowUpRight,
  BadgeCheck,
  Ban,
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  CircleHelp,
  CloudOff,
  FileDown,
  FileUp,
  Copy,
  Eye,
  EyeOff,
  FolderArchive,
  Gauge,
  GitBranch,
  HardHat,
  LayoutDashboard,
  Leaf,
  Link2,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  MapPin,
  MessageSquareText,
  Menu,
  PackageCheck,
  Plus,
  ReceiptEuro,
  RefreshCw,
  ShieldCheck,
  Target,
  Timer,
  TriangleAlert,
  Undo2,
  Users,
  Wrench,
  X,
} from 'lucide-react'
import {
  createFieldEvidenceDraftId,
  enqueueFieldEvidenceDraft,
  enqueueFieldOperationDraft,
  fieldOutboxAvailable,
  fieldOutboxOperatorScope,
  fieldOutboxSnapshot,
  flushFieldOutbox,
  shouldQueueFieldMutation,
} from './field-outbox'
import {
  currency,
  EMPTY_LIST,
  formatDate,
  formatDateTime,
  formatStatus,
  futureDateInput,
  mondayDateInput,
  RESOURCE_ACTION_LABELS,
  roundDisplay,
  setDashboardLocale,
  toIsoDateTime,
  toIsoDateTimeInTimeZone,
  toLocalDateTimeInput,
} from './dashboard-format'
import { appText, normalizeLocale, preferredOperatorLocale, SUPPORTED_LOCALES } from './locale'
import {
  browserDraftStorage,
  clearSessionDraftScope,
  removeSessionDraft,
  useSessionDraftRecovery,
} from './draft-recovery'
import Empty from './components/EmptyState'
import LazyControlBoundary from './components/LazyControlBoundary'
import DialogLoading from './components/DialogLoading'
import DialogBoundary from './components/DialogBoundary'
import DeferredActionDialog from './components/DeferredActionDialog'
import { FINANCE_ACTION_LABELS } from './finance-actions'
import JobRegisterSearch from './components/JobRegisterSearch'
import IntakeDialog from './components/IntakeDialog'


import DashboardNavigation from './components/DashboardNavigation'
import TodayAgenda from './components/TodayAgenda'
import Metric from './components/DashboardMetric'
import { DossierSections, DossierSection } from './components/DossierSections'
import './App.css'
import './dashboard-design.css'
import {
loadResources, loadHelp, loadClients, loadAutomation, loadCapabilitySetup,
  loadPipeline, loadSchedule, loadDispatch,
  loadFinance, loadPerformance, loadRecovery, preloadDashboardSection,
  loadFinanceActionDialog, loadResourceActionDialog, loadOperatorActionDialogs,
  loadCloseoutRegister, loadCommercialControl, loadDayworkControl,
  loadFieldAssuranceWorkspace, loadFieldRiskControl, loadInspectionChecklistControl,
  loadNonconformanceControl, loadPhotoEvidenceControl, loadProductionControl,
  loadProjectControls, loadTakeoffControl, loadWorkPlanControl,
} from './dashboard-chunks'

const ResourcesWorkspace = lazy(loadResources)
const PipelineWorkspace = lazy(loadPipeline)
const PortfolioScheduleWorkspace = lazy(loadSchedule)
const DispatchWorkspace = lazy(loadDispatch)
const AVAILABILITY_TIME_ZONES = ['Europe/Amsterdam', 'Europe/Brussels', 'Europe/Berlin', 'Europe/Paris', 'Europe/London', 'Europe/Dublin', 'Europe/Madrid', 'Europe/Rome', 'Europe/Warsaw', 'Europe/Athens', 'UTC']
const HelpCenter = lazy(loadHelp)
const WorkBoardOffice = lazy(() => import('./components/WorkBoardOffice'))
const ContractorWorkbench = lazy(() => import('./components/ContractorWorkbench'))
const ContractorReviewControl = lazy(() => import('./components/ContractorReviewControl'))
const WorkContextControl = lazy(() => import('./components/WorkContextControl'))
const WorkDeliveryControl = lazy(() => import('./components/WorkDeliveryControl'))
const AssetHistoryControl = lazy(() => import('./components/AssetHistoryControl'))
const InspectionCoverageControl = lazy(() => import('./components/InspectionCoverageControl'))
const ClientDeliveryControl = lazy(() => import('./components/ClientDeliveryControl'))
const WorkBalanceControl = lazy(() => import('./components/WorkBalanceControl'))
const OperationalRecoveryControl = lazy(() => import('./components/OperationalRecoveryControl'))
const OfficeConversations = lazy(() => import('./components/Conversation').then(module => ({ default: module.OfficeConversations })))
const ClientConversationInbox = lazy(() => import('./components/ClientConversationInbox'))
const OpportunityEditor = lazy(() => import('./components/OpportunityEditor'))
const FieldWorkPack = lazy(() => import('./components/FieldWorkPack'))
const OperationalRecoveryPortfolio = lazy(loadRecovery)
const AuditHistory = lazy(() => import('./components/AuditHistory'))
const FinanceWorkspace = lazy(loadFinance)
const FinanceActionDialog = lazy(loadFinanceActionDialog)
const ResourceActionDialog = lazy(loadResourceActionDialog)
const PerformanceScorecard = lazy(loadPerformance)
const FrameworkWorkspace = lazy(() => import('./components/FrameworkWorkspace'))
const SiteSurveyControl = lazy(() => import('./components/SiteSurveyControl'))
const PreTaskPlanControl = lazy(() => import('./components/PreTaskPlanControl'))
const LmraControl = lazy(() => import('./components/LmraControl'))
const SdsRegisterControl = lazy(() => import('./components/SdsRegisterControl'))
const DrawingRegisterControl = lazy(() => import('./components/DrawingRegisterControl'))
const EnergyPerformanceControl = lazy(() => import('./components/EnergyPerformanceControl'))
const CrewCapacityBoard = lazy(() => import('./components/CrewCapacityBoard'))
const LastPlannerBoard = lazy(() => import('./components/LastPlannerBoard'))
const FiveSWorkspace = lazy(() => import('./components/FiveSWorkspace'))
const OrganizationOnboarding = lazy(() => import('./components/OrganizationOnboarding'))
const AutomationSafetyDialog = lazy(() => import('./components/AutomationSafetyDialog'))
const QaResetDialog = lazy(() => import('./components/QaResetDialog'))
const TeamAccessControl = lazy(() => import('./components/TeamAccessControl'))
const CompanyMembershipControl = lazy(() => import('./components/CompanyMembershipControl'))
const PrivacyRequestsControl = lazy(() => import('./components/PrivacyRequestsControl'))
const AutomationControl = lazy(loadAutomation)
const CapabilitySetupControl = lazy(loadCapabilitySetup)
const ClientsWorkspace = lazy(loadClients)
const CloseoutRegister = lazy(loadCloseoutRegister)
const CommercialControl = lazy(loadCommercialControl)
const DayworkControl = lazy(loadDayworkControl)
const FieldAssuranceWorkspace = lazy(loadFieldAssuranceWorkspace)
const FieldRiskControl = lazy(loadFieldRiskControl)
const InspectionChecklistControl = lazy(loadInspectionChecklistControl)
const NonconformanceControl = lazy(loadNonconformanceControl)
const PhotoEvidenceControl = lazy(loadPhotoEvidenceControl)
const ProductionControl = lazy(loadProductionControl)
const ProjectControls = lazy(loadProjectControls)
const TakeoffControl = lazy(loadTakeoffControl)
const WorkPlanControl = lazy(loadWorkPlanControl)

const JobLifecycleModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.JobLifecycleModalDialog })))
const WorkerEditorDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.WorkerEditorDialog })))
const WorkerRetirementModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.WorkerRetirementModalDialog })))
const CredentialEditorDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.CredentialEditorDialog })))
const QualificationRequirementEditorDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.QualificationRequirementEditorDialog })))
const QualificationRetirementModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.QualificationRetirementModalDialog })))
const AvailabilityEditorDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.AvailabilityEditorDialog })))
const AvailabilityCancellationModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.AvailabilityCancellationModalDialog })))
const EquipmentEditorDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.EquipmentEditorDialog })))
const EquipmentCheckoutModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.EquipmentCheckoutModalDialog })))
const EquipmentReturnModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.EquipmentReturnModalDialog })))
const EquipmentInspectionModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.EquipmentInspectionModalDialog })))
const EquipmentMaintenanceModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.EquipmentMaintenanceModalDialog })))
const EquipmentRetirementModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.EquipmentRetirementModalDialog })))
const TradePartnerEditorDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.TradePartnerEditorDialog })))
const TradePartnerRetirementModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.TradePartnerRetirementModalDialog })))
const ApprovalReviewModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.ApprovalReviewModalDialog })))
const ClientEditorModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.ClientEditorModalDialog })))
const TakeoffCreateModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.TakeoffCreateModalDialog })))
const TakeoffItemModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.TakeoffItemModalDialog })))
const TakeoffRemoveModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.TakeoffRemoveModalDialog })))
const TakeoffConvertModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.TakeoffConvertModalDialog })))
const CommercialDraftModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.CommercialDraftModalDialog })))
const CommercialAcceptanceModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.CommercialAcceptanceModalDialog })))
const CommercialDeliveryModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.CommercialDeliveryModalDialog })))
const TaskActionModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.TaskActionModalDialog })))
const OpportunityActivityModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.OpportunityActivityModalDialog })))
const BidPackageModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.BidPackageModalDialog })))
const BidReturnModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.BidReturnModalDialog })))
const BidSelectionModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.BidSelectionModalDialog })))
const BidCommitmentModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.BidCommitmentModalDialog })))
const BidOrderPackageModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.BidOrderPackageModalDialog })))
const BidOrderDeliveryModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.BidOrderDeliveryModalDialog })))
const BidAddParticipantsModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.BidAddParticipantsModalDialog })))
const MaterialReceiptModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.MaterialReceiptModalDialog })))
const MaterialReceiptReversalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.MaterialReceiptReversalDialog })))
const InvoiceDraftModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.InvoiceDraftModalDialog })))
const ClientLifecycleModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.ClientLifecycleModalDialog })))
const FinanceOrderDeliveryModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.FinanceOrderDeliveryModalDialog })))
const EnvironmentalReversalModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.EnvironmentalReversalModalDialog })))
const FieldAssuranceModalDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.FieldAssuranceModalDialog })))
const ResourcePlannerDialog = lazy(() => loadOperatorActionDialogs().then(module => ({ default: module.ResourcePlannerDialog })))

const navItems = [
  ['today', LayoutDashboard],
  ['pipeline', Target],
  ['jobs', BriefcaseBusiness],
  ['schedule', CalendarDays],
  ['approvals', ClipboardCheck],
  ['dispatch', MapPin],
  ['recovery', TriangleAlert],
  ['resources', Wrench],
  ['finance', ReceiptEuro],
  ['performance', Activity],
  ['clients', BadgeCheck],
  ['field', HardHat],
  ['operations', Gauge],
  ['help', CircleHelp],
]

const EQUIPMENT_EDITABLE_STATUSES = new Set(['available', 'in_use', 'maintenance', 'inspection_due', 'inactive', 'lost'])
const TRANSIENT_REQUEST_RETRY_DELAYS_MS = [250, 750]

function isTransientRequestError(error) {
  if (Number.isInteger(error?.status)) return false
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(String(error?.message || ''))
}

async function retryTransientRequest(operation, signal) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (signal?.aborted) throw error
      const delay = TRANSIENT_REQUEST_RETRY_DELAYS_MS[attempt]
      if (!isTransientRequestError(error) || delay === undefined) throw error
      await new Promise((resolve) => window.setTimeout(resolve, delay))
    }
  }
}

async function api(path, options = {}) {
  const request = async () => {
    const headers = options.body ? { 'Content-Type': 'application/json', ...(options.headers || {}) } : options.headers
    const response = await companyFetch(path, {
      ...options,
      credentials: 'same-origin',
      headers,
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(payload.error?.message || 'The ledger request could not be completed.')
      error.code = payload.error?.code || 'request_failed'
      error.status = response.status
      throw error
    }
    return payload
  }
  return String(options.method || 'GET').toUpperCase() === 'GET' ? retryTransientRequest(request, options.signal) : request()
}

async function recordFieldEvidence({
  operatorScope,
  id,
  jobId,
  notes,
  riskLevel,
  file,
  photoEvidenceSetId,
  photoEvidencePhase,
  capturedAt,
}) {
  const payload = new FormData()
  payload.append('evidenceFile', file)
  payload.append('jobId', jobId)
  payload.append('notes', notes)
  payload.append('riskLevel', riskLevel)
  payload.append('category', photoEvidenceSetId ? 'governed_field_photo' : file.type.startsWith('image/') ? 'field_photo' : 'document')
  payload.append('attachToBuild', 'false')
  if (photoEvidenceSetId) {
    payload.append('photoEvidenceSetId', photoEvidenceSetId)
    payload.append('photoEvidencePhase', photoEvidencePhase)
    payload.append('capturedAt', new Date(capturedAt).toISOString())
    payload.append('caption', notes)
    payload.append('photoEvidenceEntryKey', id || createFieldEvidenceDraftId())
  }
  const response = await companyFetch('/api/ledger/upload', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Idempotency-Key': id || createFieldEvidenceDraftId(), ...(operatorScope ? companyHeaders(operatorScope) : {}) },
    body: payload,
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(result.error?.message || 'Evidence could not be recorded.')
    error.code = result.error?.code || 'upload_failed'
    throw error
  }
  return result
}

function emptyFieldEvidenceDraft() {
  return {
    jobId: '',
    notes: '',
    riskLevel: 'medium',
    photoEvidenceSetId: '',
    photoEvidencePhase: 'before',
    capturedAt: toLocalDateTimeInput(new Date()),
  }
}

async function recordFieldOperation({ id, type, jobId, payload, operatorScope }) {
  const inspectionId = type === 'inspection_checklist' ? String(payload?.inspectionId || '') : ''
  const attendanceSessionId = type === 'attendance_check_out' ? String(payload?.sessionId || '') : ''
  const custodySessionId = type === 'equipment_return' ? String(payload?.custodySessionId || '') : ''
  const safetyMeetingId = type === 'safety_briefing_acknowledgement' ? String(payload?.meetingId || '') : ''
  const workPermitId = type === 'work_permit_acknowledgement' ? String(payload?.permitId || '') : ''
  const preTaskPlanId = ['pre_task_plan_acknowledgement', 'pre_task_plan_suspension'].includes(type) ? String(payload?.planId || '') : ''
  const dailyCycleId = type === 'daily_cycle_close' ? String(payload?.cycleId || '') : ''
  const fiveSLocationId = type === 'five_s_audit' ? String(payload?.locationId || '') : ''
  const route =
    type === 'daily_huddle'
      ? 'daily-cycles'
      : type === 'daily_cycle_close' && dailyCycleId
        ? `daily-cycles/${encodeURIComponent(dailyCycleId)}/end-of-day`
      : type === 'daily_log'
      ? 'daily-logs'
      : type === 'attendance_check_in'
        ? 'attendance/check-in'
      : type === 'attendance_check_out' && attendanceSessionId
          ? `attendance/${encodeURIComponent(attendanceSessionId)}/check-out`
      : type === 'safety_briefing_acknowledgement' && safetyMeetingId
        ? `safety-meetings/${encodeURIComponent(safetyMeetingId)}/acknowledgments`
      : type === 'work_permit_acknowledgement' && workPermitId
        ? `work-permits/${encodeURIComponent(workPermitId)}/acknowledgments`
      : type === 'pre_task_plan_acknowledgement' && preTaskPlanId
        ? `pre-task-plans/${encodeURIComponent(preTaskPlanId)}/acknowledgments`
      : type === 'pre_task_plan_suspension' && preTaskPlanId
        ? `pre-task-plans/${encodeURIComponent(preTaskPlanId)}/suspend`
      : type === 'lmra_assessment'
        ? 'lmra'
      : type === 'production_entry'
        ? 'production-entries'
      : type === 'daywork_ticket'
        ? 'daywork-tickets'
      : type === 'nonconformance'
        ? 'nonconformances'
      : type === 'material_receipt'
        ? 'material-receipts'
      : type === 'expense_receipt'
        ? 'expense-receipts'
      : type === 'environmental_activity'
        ? 'environmental-activities'
      : type === 'equipment_check_out'
        ? 'equipment-custody/check-out'
      : type === 'equipment_return' && custodySessionId
        ? `equipment-custody/${encodeURIComponent(custodySessionId)}/return`
      : type === 'five_s_audit' && fiveSLocationId
        ? `five-s/locations/${encodeURIComponent(fiveSLocationId)}/audits`
      : type === 'progress'
        ? 'progress'
        : type === 'observation'
          ? 'observations'
          : type === 'incident'
            ? 'incidents'
            : type === 'punch_item'
              ? 'punch-items'
              : type === 'inspection_checklist' && inspectionId
                ? `inspections/${encodeURIComponent(inspectionId)}/checklist-submissions`
                : null
  if (!route) throw new Error('This queued field operation is not supported.')
  const requestPayload = { ...payload, entryKey: id }
  delete requestPayload.inspectionId
  delete requestPayload.sessionId
  delete requestPayload.custodySessionId
  delete requestPayload.meetingId
  delete requestPayload.permitId
  delete requestPayload.planId
  delete requestPayload.cycleId
  delete requestPayload.locationId
  return api(`/api/ledger/jobs/${encodeURIComponent(jobId)}/${route}`, {
    method: 'POST',
    headers: operatorScope ? companyHeaders(operatorScope) : {},
    body: JSON.stringify(requestPayload),
  })
}

function suggestedEndInput(startValue, estimatedHours = 4) {
  const start = new Date(startValue)
  if (Number.isNaN(start.getTime())) return ''
  return toLocalDateTimeInput(new Date(start.getTime() + Math.max(1, Number(estimatedHours) || 4) * 60 * 60 * 1000))
}

function emptyFieldDailyLog() {
  return {
    entryKey: createFieldEvidenceDraftId(),
    jobId: '',
    cycleId: '',
    workerId: '',
    workDate: futureDateInput(0),
    hours: '',
    manpower: '1',
    weather: 'clear',
    workCompleted: '',
    blockers: '',
    planAchieved: true,
    varianceReasons: '',
    unresolvedActions: '',
    tomorrowPlan: '',
    evidenceReferences: '',
    safetyConcern: false,
    safetyRiskLevel: 'high',
    safetyNotes: '',
  }
}

function emptyFieldProgress() {
  return {
    entryKey: createFieldEvidenceDraftId(),
    jobId: '',
    progressPercent: '',
    status: 'in_progress',
    note: '',
  }
}

function emptyDailyHuddle() {
  return {
    entryKey: createFieldEvidenceDraftId(),
    jobId: '',
    workDate: futureDateInput(0),
    shiftLabel: 'day',
    facilitator: '',
    leadWorkerId: '',
    workerIds: [],
    plannedWork: '',
    productionTarget: '',
    weather: 'clear',
    siteConditions: '',
    safetyFocus: '',
    qualityHoldPoints: '',
    constraints: '',
    blockingIssues: '',
    stopWorkRequired: false,
    evidenceReference: '',
  }
}

function emptyMaterialReceiptLine(source = {}) {
  const remaining = Number(source.remainingQuantity ?? source.orderedQuantity ?? 0)
  return {
    lineKey: source.lineKey || '',
    materialRequirementId: source.materialRequirementId || '',
    itemName: source.itemName || '',
    unit: source.unit || 'unit',
    receivedQuantity: remaining > 0 ? String(remaining) : '1',
    acceptedQuantity: remaining > 0 ? String(remaining) : '1',
    damagedQuantity: '0',
    notes: '',
  }
}

function emptyMaterialReceiptDraft(plan = null) {
  const purchaseOrder = plan?.purchaseOrder || null
  const lines = (plan?.lines || []).filter((line) => !line.complete).map(emptyMaterialReceiptLine)
  return {
    entryKey: createFieldEvidenceDraftId(),
    jobId: purchaseOrder?.jobId || '',
    purchaseOrderId: purchaseOrder?.id || '',
    receiptReference: '',
    evidenceReference: '',
    deliveredAt: toLocalDateTimeInput(new Date()),
    receivedBy: '',
    location: '',
    stockDestination: 'job_site',
    finalDelivery: plan?.summary?.remainingLines === lines.length && lines.length > 0,
    notes: '',
    lines: lines.length ? lines : [emptyMaterialReceiptLine()],
  }
}

function emptyFieldExpenseReceiptDraft() {
  return {
    entryKey: createFieldEvidenceDraftId(),
    jobId: '',
    expenseDate: futureDateInput(0),
    category: 'materials',
    vendor: '',
    receiptReference: '',
    totalAmount: '',
    taxAmount: '',
    taxTreatment: 'recoverable',
    paymentMethod: 'company_card',
    costCode: 'MAT-100',
    notes: '',
  }
}

function emptyFieldEnvironmentalDraft() {
  return {
    entryKey: createFieldEvidenceDraftId(),
    jobId: '',
    activityDate: futureDateInput(0),
    category: 'fuel',
    ghgScope: 'scope_1',
    description: '',
    quantity: '',
    unit: 'litre',
    emissionFactor: '',
    factorSource: '',
    factorReference: '',
    evidenceReference: '',
    notes: '',
  }
}

function emptyEnvironmentalReportDraft() {
  const today = futureDateInput(0)
  return { periodStart: `${today.slice(0, 4)}-01-01`, periodEnd: today }
}

function emptyAttendanceDraft() {
  return {
    jobId: '',
    workerId: '',
    note: '',
    accessPoint: '',
  }
}

function emptySafetyBriefingDraft() {
  return {
    entryKey: createFieldEvidenceDraftId(),
    jobId: '',
    meetingId: '',
    title: '',
    scheduledAt: toLocalDateTimeInput(new Date()),
    topics: '',
    evidenceReference: '',
    acknowledged: false,
    completionEvidence: '',
    excusalReason: '',
  }
}

function emptyWorkPermitDraft() {
  return {
    entryKey: createFieldEvidenceDraftId(),
    jobId: '',
    permitId: '',
    permitType: 'general_work',
    title: '',
    location: '',
    validFrom: toLocalDateTimeInput(new Date()),
    expiresAt: toLocalDateTimeInput(new Date(Date.now() + 8 * 60 * 60 * 1000)),
    hazards: '',
    controls: '',
    conditions: '',
    sourceEvidence: '',
    acknowledgementEvidence: '',
    acknowledged: false,
    suspensionReason: '',
    suspensionEvidence: '',
    closureNote: '',
    closureEvidence: '',
  }
}





function emptyTaskDraft() {
  return {
    title: '',
    priority: 'medium',
    dueAt: futureDateInput(1),
    assigneeId: '',
    durationHours: '8',
    requiredCrewRequirements: [{ role: '', count: '1' }],
    supervisorWorkerIds: [],
    workersPerSupervisor: '',
    predecessorTaskId: '',
    materialRequirementIds: [],
  }
}

function emptyQuoteDraft(job = null) {
  return {
    validUntil: futureDateInput(30),
    taxRate: '21',
    notes: '',
    lineItems: [
      {
        description: job?.title || '',
        quantity: '1',
        unitPrice: job?.estimatedCost ? String(job.estimatedCost) : '',
        costCode: 'contract',
      },
    ],
  }
}

function emptyChangeOrderDraft(job = null, supersedes = null) {
  const referenceQuote = (job?.quotes || []).find((quote) => quote.status === 'accepted')
  const formalControl = supersedes?.formalControl || {}
  const clientResponse = supersedes?.data?.clientResponse || null
  const revisionOrigin = supersedes?.snapshot?.revisionOrigin || null
  const clientRevisionDecision = clientResponse?.decision || revisionOrigin?.decision || ''
  const clientRevisionNote = clientResponse?.note || revisionOrigin?.note || ''
  return {
    entryKey: createFieldEvidenceDraftId(),
    quoteId: referenceQuote?.id || '',
    supersedesChangeOrderId: supersedes?.id || '',
    title: supersedes?.title ? `${supersedes.title} - revision` : '',
    scopeDelta: supersedes?.scopeDelta || '',
    variationType: formalControl.variationType || 'client_request',
    initiatedBy: formalControl.initiatedBy || 'client',
    cause: formalControl.cause || '',
    justification: formalControl.justification || '',
    contractReference: formalControl.contractReference || referenceQuote?.id || 'Current retained contract baseline',
    noticeReference: formalControl.noticeReference || '',
    noticeNotApplicableReason: formalControl.noticeNotApplicableReason || '',
    requestedAt: new Date().toISOString().slice(0, 10),
    responseDueAt: futureDateInput(7),
    scheduleDeltaDays: supersedes?.scheduleDeltaDays == null ? '0' : String(supersedes.scheduleDeltaDays),
    scheduleImpactNarrative: formalControl.scheduleImpactNarrative || '',
    riskImpact: formalControl.riskImpact || 'medium',
    riskImpactStatement: formalControl.riskImpactStatement || '',
    assumptions: (formalControl.assumptions || []).join('\n'),
    exclusions: (formalControl.exclusions || []).join('\n'),
    evidenceReferences: (formalControl.evidenceReferences || []).join('\n'),
    taxRate: referenceQuote?.taxRate == null ? '21' : String(referenceQuote.taxRate),
    notes: supersedes?.data?.notes || '',
    lineItems: supersedes?.lineItems?.length
      ? supersedes.lineItems.map((item) => ({
          description: item.description || '',
          quantity: String(item.quantity ?? 1),
          unitPrice: String(item.unitPrice ?? ''),
          costCode: item.costCode || 'change_order',
        }))
      : [{ description: '', quantity: '1', unitPrice: '', costCode: 'change_order' }],
    clientRevisionRequest: ['changes_requested', 'rejected'].includes(clientRevisionDecision)
      ? clientRevisionNote
      : '',
    clientRevisionDecision,
  }
}

function emptyCommercialAcceptanceDraft() {
  return {
    acceptedAt: new Date().toISOString().slice(0, 10),
    evidenceReference: '',
    notes: '',
  }
}

function emptyFinanceActionDraft() {
  return {
    entryKey: createFieldEvidenceDraftId(),
    outcome: 'follow_up_recorded',
    amount: '',
    taxRate: '21',
    forecastAmount: '',
    workerId: '',
    hours: '',
    rate: '52',
    expenseAmount: '',
    plannedIssueAt: futureDateInput(7),
    dueAt: futureDateInput(7),
    paidAt: futureDateInput(0),
    method: 'bank_transfer',
    reference: '',
    vendor: '',
    category: 'materials',
    costCode: '00-100',
    description: '',
    targetSystem: 'FAB',
    exportFormat: 'json',
    percentComplete: '0',
    followUpChannel: 'internal',
    waiverType: 'conditional',
    invoiceNumber: '',
    invoiceDate: futureDateInput(0),
    taxAmount: '',
    taxTreatment: 'recoverable',
    paymentMethod: 'company_card',
    materialReceiptId: '',
    deliveryReference: '',
    notes: '',
  }
}

function emptyResourceActionDraft() {
  return {
    workerName: '',
    company: 'Internal crew',
    workDate: futureDateInput(0),
    hours: '',
    rate: '52',
    costCode: 'labor',
    materialStatus: 'available',
    availableQuantity: '',
    expectedAvailableAt: '',
    location: '',
    reference: '',
    supplier: '',
    tradePartnerId: '',
    amount: '',
    requiredBy: futureDateInput(7),
    notes: '',
  }
}

function emptyTradePartnerDraft(partner = null) {
  const data = partner?.data || {}
  return {
    id: partner?.id || '',
    name: partner?.name || '',
    partnerType: partner?.partnerType || 'supplier',
    status: partner?.status === 'on_hold' ? 'on_hold' : 'active',
    contactName: partner?.contactName || '',
    email: partner?.email || '',
    phone: partner?.phone || '',
    city: partner?.city || '',
    country: partner?.country || 'NL',
    registrationNumber: partner?.registrationNumber || '',
    vatNumber: partner?.vatNumber || '',
    vatExempt: data.vatExempt === true,
    specialties: (partner?.specialties || []).join(', '),
    requiresInsurance: data.requiresInsurance === true,
    insuranceExpiresAt: partner?.insuranceExpiresAt ? String(partner.insuranceExpiresAt).slice(0, 10) : '',
    requiresVca: data.requiresVca === true,
    vcaExpiresAt: partner?.vcaExpiresAt ? String(partner.vcaExpiresAt).slice(0, 10) : '',
    verificationReference: data.verificationReference || '',
    verifiedAt: data.verifiedAt ? String(data.verifiedAt).slice(0, 10) : new Date().toISOString().slice(0, 10),
    notes: data.notes || '',
  }
}

function emptyWorkerDraft(worker = null) {
  const data = worker?.data || {}
  return {
    id: worker?.id || '',
    name: worker?.name || '',
    role: worker?.role || '',
    status: worker?.status && worker.status !== 'retired' ? worker.status : 'available',
    email: worker?.email || '',
    phone: worker?.phone || '',
    homeRegion: worker?.homeRegion || '',
    hourlyRate: worker?.hourlyRate === null || worker?.hourlyRate === undefined ? '' : String(worker.hourlyRate),
    skills: (worker?.skills || []).join(', '),
    notes: data.notes || '',
  }
}

function emptyEquipmentDraft(tool = null) {
  const data = tool?.data || {}
  const retainedStatus = tool?.status || 'available'
  return {
    id: tool?.id || '',
    name: tool?.name || '',
    category: tool?.category || 'general',
    status: EQUIPMENT_EDITABLE_STATUSES.has(retainedStatus) ? retainedStatus : retainedStatus === 'retired' ? 'available' : 'in_use',
    homeLocation: tool?.homeLocation || '',
    currentLocation: tool?.currentLocation || '',
    serialNumber: data.serialNumber || '',
    inspectionRequired: data.inspectionRequired === true || Boolean(data.inspectionDueAt),
    inspectionDueAt: data.inspectionDueAt ? String(data.inspectionDueAt).slice(0, 10) : '',
    notes: data.notes || '',
  }
}

function emptyEquipmentInspectionDraft() {
  return {
    result: 'passed',
    inspector: '',
    inspectedAt: new Date().toISOString().slice(0, 10),
    nextDueAt: futureDateInput(365),
    reference: '',
    notes: '',
  }
}

function emptyEquipmentMaintenanceDraft() {
  return {
    outcome: 'completed',
    maintenanceType: 'corrective',
    performedBy: '',
    performedAt: new Date().toISOString().slice(0, 10),
    reference: '',
    notes: '',
  }
}

function emptyClientDraft(client = null) {
  const data = client?.data || {}
  return {
    id: client?.id || '',
    name: client?.name || '',
    company: client?.company || '',
    clientType: data.clientType || (client?.company ? 'business' : 'consumer'),
    email: client?.email || '',
    billingEmail: data.billingEmail || '',
    phone: client?.phone || '',
    address: client?.address || '',
    postalCode: data.postalCode || '',
    city: client?.city || '',
    country: client?.country || 'NL',
    registrationNumber: data.registrationNumber || '',
    vatNumber: client?.vatNumber || '',
    electronicAddressScheme: data.electronicAddressScheme || '',
    electronicAddress: data.electronicAddress || '',
    preferredLanguage: client?.preferredLanguage || 'nl',
    notes: data.notes || '',
  }
}

function organizationDraft(profile = {}) {
  return {
    legalName: profile.legalName || '',
    tradingName: profile.tradingName || '',
    registrationNumber: profile.registrationNumber || '',
    electronicAddressScheme: profile.data?.electronicAddressScheme || '',
    electronicAddress: profile.data?.electronicAddress || '',
    vatNumber: profile.vatNumber || '',
    vatExempt: profile.data?.vatExempt === true,
    email: profile.email || '',
    phone: profile.phone || '',
    website: profile.website || '',
    address: profile.address || '',
    postalCode: profile.postalCode || '',
    city: profile.city || '',
    country: profile.country || 'NL',
    iban: profile.iban || '',
    bic: profile.bic || '',
    defaultPaymentTermsDays: String(profile.defaultPaymentTermsDays || 30),
    defaultQuoteValidityDays: String(profile.defaultQuoteValidityDays || 30),
    quoteTerms: profile.data?.quoteTerms || '',
    notes: profile.data?.notes || '',
  }
}

function emptyInvoiceDraft() {
  return {
    billingMilestoneId: '',
    amount: '',
    taxRate: '21',
    dueAt: futureDateInput(14),
    peppolReady: true,
    buyerReference: '',
    purchaseOrderReference: '',
    buyerLegalName: '',
    buyerRegistrationNumber: '',
    buyerEndpointScheme: '0106',
    buyerEndpointId: '',
    buyerAddress: '',
    buyerPostalCode: '',
    buyerCity: '',
    buyerCountry: 'NL',
    notes: '',
  }
}


function emptyOpportunityActivityDraft() {
  return {
    activityType: 'follow_up',
    summary: '',
    dueAt: '',
    notes: '',
  }
}

function emptyEquipmentCheckoutDraft(plan = null) {
  const dueBackAt = plan?.reservation?.neededUntil
    ? toLocalDateTimeInput(new Date(plan.reservation.neededUntil))
    : toLocalDateTimeInput(new Date(Date.now() + 8 * 60 * 60 * 1000))
  return {
    jobId: plan?.reservation?.jobId || '',
    reservationId: plan?.reservation?.id || '',
    workerId: '',
    checkedOutAt: toLocalDateTimeInput(new Date()),
    dueBackAt,
    checkedOutBy: '',
    condition: 'good',
    location: '',
    meter: '',
    evidenceReference: '',
    notes: '',
    entryKey: createFieldEvidenceDraftId(),
  }
}

function emptyEquipmentReturnDraft(session = null) {
  return {
    jobId: session?.jobId || '',
    custodySessionId: session?.id || '',
    returnedAt: toLocalDateTimeInput(new Date()),
    returnedBy: '',
    condition: 'serviceable',
    location: session?.checkoutLocation || '',
    meter: session?.checkoutMeter === null || session?.checkoutMeter === undefined ? '' : String(session.checkoutMeter),
    evidenceReference: '',
    notes: '',
    entryKey: createFieldEvidenceDraftId(),
  }
}

function emptyWorkerCredentialDraft(worker = null) {
  return {
    workerId: worker?.id || '',
    credentialType: 'vca_basic',
    title: '',
    issuer: '',
    credentialNumber: '',
    issuedOn: new Date().toISOString().slice(0, 10),
    expiresOn: '',
    evidenceReference: '',
  }
}

function emptyQualificationRequirementDraft(job = null) {
  return {
    jobId: job?.id || '',
    credentialType: 'vca',
    title: '',
    role: '',
    mandatory: true,
  }
}

function emptyWorkerAvailabilityDraft(worker = null) {
  const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
  startsAt.setHours(8, 0, 0, 0)
  const endsAt = new Date(startsAt)
  endsAt.setHours(17, 0, 0, 0)
  const reviewAt = new Date(startsAt)
  reviewAt.setDate(reviewAt.getDate() + 3)
  return {
    workerId: worker?.id || '',
    periodType: 'leave',
    title: '',
    startsAt: toLocalDateTimeInput(startsAt.toISOString()),
    endsAt: toLocalDateTimeInput(endsAt.toISOString()),
    returnUnknown: false,
    reviewAt: toLocalDateTimeInput(reviewAt.toISOString()).slice(0, 10),
    repeatWeekly: false,
    recurrenceDays: [startsAt.getDay()],
    recurrenceUntil: '',
    recurrenceTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Amsterdam',
    notes: '',
  }
}

function workerAvailabilityReviewMinimum(startsAt) {
  if (!startsAt) return undefined
  const minimum = new Date(startsAt)
  minimum.setDate(minimum.getDate() + 1)
  return toLocalDateTimeInput(minimum.toISOString()).slice(0, 10)
}

function workPermitBlockerText(blocker, t) {
  switch (blocker?.type) {
    case 'permit_not_active':
      return t('Permit status is {status}.', { status: formatStatus(blocker.status || 'inactive') })
    case 'permit_not_started':
      return t('The permit validity window has not started.')
    case 'permit_expired':
      return t('The permit validity window has expired.')
    case 'permit_definition_integrity':
      return t('The retained permit definition does not match its approved snapshot.')
    case 'permit_attendees_missing':
      return t('No assigned worker is retained for this permit.')
    case 'permit_acknowledgements_outstanding':
      return t(
        blocker.count === 1
          ? '{count} assigned worker acknowledgement is outstanding.'
          : '{count} assigned worker acknowledgements are outstanding.',
        { count: blocker.count || 0 },
      )
    case 'permit_acknowledgement_integrity':
      return t('{count} acknowledgement record(s) failed integrity verification.', { count: blocker.count || 0 })
    default:
      return t(blocker?.message || 'Permit readiness blocker')
  }
}





function emptyTakeoffDraft(job = null) {
  return {
    title: job?.title ? `${job.title} measured scope` : '',
    taxRate: '21',
    notes: '',
  }
}

function emptyTakeoffItemDraft(item = null, takeoff = null) {
  const fallbackPackage = takeoff?.items?.[takeoff.items.length - 1] || null
  return {
    id: item?.id || '',
    description: item?.description || '',
    category: item?.category || 'material',
    measurementType: item?.measurementType || 'area',
    count: item ? String(item.count ?? 1) : '1',
    length: item ? String(item.length ?? 0) : '',
    width: item ? String(item.width ?? 0) : '',
    height: item ? String(item.height ?? 0) : '',
    quantity: item ? String(item.quantity ?? 0) : '',
    unit: item?.unit || 'm2',
    wastePercent: item ? String(item.wastePercent ?? 0) : '0',
    unitCost: item ? String(item.unitCost ?? 0) : '',
    unitPrice: item ? String(item.unitPrice ?? 0) : '',
    costCode: item?.costCode || 'estimate',
    wbsCode: item?.wbsCode || fallbackPackage?.wbsCode || '01',
    workPackage: item?.workPackage || fallbackPackage?.workPackage || 'General scope',
    sourceReference: item?.sourceReference || '',
  }
}

function emptyTakeoffConversionDraft() {
  return { validUntil: futureDateInput(30), notes: '' }
}

function takeoffDraftQuantity(draft = {}) {
  const type = draft.measurementType || 'manual'
  const count = Number(draft.count)
  const length = Number(draft.length)
  const width = Number(draft.width)
  const height = Number(draft.height)
  const manual = Number(draft.quantity)
  const waste = Number(draft.wastePercent)
  let quantity = 0
  if (type === 'manual') quantity = manual
  else if (type === 'count') quantity = count
  else if (type === 'linear') quantity = count * length
  else if (type === 'area') quantity = count * length * width
  else if (type === 'volume') quantity = count * length * width * height
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(waste) || waste < 0) return 0
  return Math.round(quantity * (1 + waste / 100) * 10_000) / 10_000
}



function emptyBidPackageDraft() {
  return {
    opportunityId: '',
    title: '',
    trade: '',
    scope: '',
    dueAt: futureDateInput(10),
    ownerName: '',
    tradePartnerIds: [],
  }
}

function emptyBidReturnDraft() {
  return {
    netAmount: '',
    taxRate: '21',
    receivedAt: futureDateInput(0),
    validUntil: futureDateInput(30),
    durationDays: '',
    evidenceReference: '',
    exclusions: '',
    qualifications: '',
  }
}

function emptyBidCommitmentDraft() {
  return {
    requiredBy: futureDateInput(21),
    costCode: 'SUBCONTRACT',
    notes: '',
  }
}

function emptyBidOrderDraft() {
  return { recipient: '', channel: 'email' }
}

function emptyBidOrderDeliveryDraft() {
  return { integration: '', providerMessageId: '', sentAt: toLocalDateTimeInput(new Date().toISOString()) }
}









function parseTransmittalRecipients(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const named = line.match(/^(.+?)\s*<([^<>]+)>$/)
      const email = (named?.[2] || line).trim()
      return {
        name: (named?.[1] || email.split('@')[0] || '').trim(),
        email,
      }
    })
}





function parseMeetingAttendees(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const named = line.match(/^(.+?)\s*<([^<>]+)>$/)
      return {
        name: (named?.[1] || line).trim(),
        email: named?.[2]?.trim() || '',
      }
    })
}

function parseMeetingLines(value) {
  return String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}



function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

function fieldScopedDashboard(jobs) {
  const active = jobs.filter((job) => !['archived', 'completed', 'cancelled', 'rejected'].includes(job.status))
  return {
    fieldScoped: true,
    metrics: {
      openJobs: active.length,
      completedJobs: jobs.filter((job) => job.status === 'completed').length,
      pendingApprovals: 0,
      dispatchReadyJobs: 0,
      storedDocuments: 0,
      fieldReports: 0,
      openIncidents: 0,
      safetyChecks: 0,
    },
    money: { estimatedPipeline: 0 },
    nextActions: [],
  }
}

function initialOperatorDashboard(jobs) {
  return { ...fieldScopedDashboard(jobs), fieldScoped: false }
}

function upsertById(records, record) {
  if (!record?.id) return records || EMPTY_LIST
  return [record, ...(records || EMPTY_LIST).filter((item) => item.id !== record.id)]
}

function reconcileJobCollections(data, job) {
  if (!data || !job?.id) return data
  const archived = job.status === 'archived'
  return {
    ...data,
    jobs: archived ? (data.jobs || EMPTY_LIST).filter((item) => item.id !== job.id) : upsertById(data.jobs, job),
    archivedJobs: archived
      ? upsertById(data.archivedJobs, job)
      : (data.archivedJobs || EMPTY_LIST).filter((item) => item.id !== job.id),
  }
}

function reconcileApprovalResolution(data, approvalId, dashboard = null) {
  if (!data) return data
  const currentDashboard = data.dashboard
  const nextDashboard = dashboard || (currentDashboard ? {
    ...currentDashboard,
    metrics: currentDashboard.metrics ? {
      ...currentDashboard.metrics,
      pendingApprovals: Math.max(0, Number(currentDashboard.metrics.pendingApprovals || 0) - 1),
    } : currentDashboard.metrics,
    nextActions: (currentDashboard.nextActions || EMPTY_LIST)
      .filter((action) => action.approvalId !== approvalId),
  } : currentDashboard)
  return {
    ...data,
    dashboard: nextDashboard,
    approvals: (data.approvals || EMPTY_LIST).filter((approval) => approval.id !== approvalId),
  }
}

const requestSectionData = api
async function loadSectionPatch(section, resourceView = 'workforce', fieldScoped = false, viewContext = {}) {
  const api = (path, options = {}) => requestSectionData(path, { ...options, signal: viewContext.signal })
  if (section === 'help') return {}
  if (section === 'today' && !fieldScoped) {
    const [organization, scheduler, capabilities] = await Promise.all([
      api('/api/ledger/organization').catch(() => null),
      api('/api/ledger/scheduler').catch(() => null),
      viewContext.operatorRole === 'owner' ? api('/api/operations/capabilities').catch(() => null) : Promise.resolve(null),
    ])
    return {
      organization: organization?.organization || null,
      scheduler: scheduler?.scheduler || null,
      operationsCapabilities: capabilities,
    }
  }
  if (section === 'pipeline') {
    const [opportunities, marketFit, bidDecisions, bids, partners] = await Promise.all([
      api('/api/ledger/opportunities?includeClosed=true&limit=500'),
      api('/api/ledger/market-fit?limit=500'),
      api('/api/ledger/bid-decisions?limit=500'),
      api('/api/ledger/bid-packages?includeClosed=true&limit=500'),
      api('/api/ledger/trade-partners?includeRetired=true&limit=500'),
    ])
    return {
      opportunities: opportunities.opportunities || [],
      opportunityForecast: opportunities.forecast || null,
      marketFit: marketFit.marketFit || null,
      bidDecisions: bidDecisions.bidDecisions || null,
      bidPackages: bids.bidPackages || [],
      bidPackageSummary: bids.summary || {},
      tradePartners: partners.partners || [],
      tradePartnerSummary: partners.summary || {},
    }
  }
  if (section === 'jobs') {
    const [jobs, templates] = await Promise.all([
      viewContext.jobsResult ? Promise.resolve(viewContext.jobsResult) : api('/api/ledger/jobs?limit=100'),
      api('/api/ledger/inspection-templates'),
    ])
    return { jobs: jobs.jobs || [], jobRegisterPagination: jobs.pagination || null, inspectionTemplates: templates.templates || [] }
  }
  if (section === 'schedule') {
    const lastPlannerParameters = new URLSearchParams()
    if (viewContext.lastPlannerWeekStart) lastPlannerParameters.set('weekStart', viewContext.lastPlannerWeekStart)
    const lastPlannerPath = `/api/ledger/last-planner${lastPlannerParameters.size ? `?${lastPlannerParameters.toString()}` : ''}`
    const [schedule, crewCapacity, lastPlanner] = await Promise.all([
      api('/api/ledger/schedule?horizonDays=180&limit=500'),
      api('/api/ledger/crew-capacity'),
      api(lastPlannerPath),
    ])
    return { schedule, crewCapacity: crewCapacity.board || null, lastPlanner: lastPlanner.board || null }
  }
  if (section === 'approvals') {
    const result = await api('/api/ledger/approvals?status=pending&limit=100')
    return { approvals: result.approvals || [] }
  }
  if (section === 'dispatch') {
    const [dispatch, partners] = await Promise.all([
      api('/api/ledger/dispatch?limit=100'),
      api('/api/ledger/trade-partners?includeRetired=true&limit=200'),
    ])
    return {
      dispatch,
      tradePartners: partners.partners || [],
      tradePartnerSummary: partners.summary || {},
    }
  }
  if (section === 'resources') {
    if (resourceView === 'timesheets') {
      const result = await api(`/api/ledger/timesheets?periodStart=${encodeURIComponent(mondayDateInput())}`)
      return { timesheets: result.timesheets || { rows: [], exports: [], summary: {} } }
    }
    if (resourceView === 'inventory') return { inventory: await api('/api/ledger/inventory?limit=100') }
    if (resourceView === 'receiving') {
      const result = await api('/api/ledger/material-receipts?limit=500')
      return { materialReceiving: result.materialReceiving || { summary: {}, receipts: [], purchaseOrders: [], actions: [], policy: {} } }
    }
    if (resourceView === 'equipment') {
      const [result, custody] = await Promise.all([
        api('/api/ledger/tools?limit=500'),
        api('/api/ledger/equipment-custody?limit=500'),
      ])
      return {
        tools: result.tools || [],
        toolSummary: result.summary || {},
        equipmentCustody: custody.equipmentCustody || { summary: {}, sessions: [], active: [], exceptions: [], actions: [], policy: {} },
      }
    }
    if (resourceView === 'five_s') {
      const [fiveS, tools] = await Promise.all([
        api('/api/ledger/five-s'),
        api('/api/ledger/tools?limit=500'),
      ])
      return {
        fiveS: fiveS.board || null,
        tools: tools.tools || [],
        toolSummary: tools.summary || {},
      }
    }
    if (resourceView === 'partners') {
      const result = await api('/api/ledger/trade-partners?includeRetired=true&limit=200')
      return { tradePartners: result.partners || [], tradePartnerSummary: result.summary || {} }
    }
    const [workforce, workers, qualifications, availability] = await Promise.all([
      api('/api/ledger/workforce?limit=100'),
      api('/api/ledger/workers?limit=500'),
      api('/api/ledger/qualifications'),
      api('/api/ledger/availability'),
    ])
    return {
      workforce,
      workers: workers.workers || [],
      workerSummary: workers.summary || {},
      qualificationRegister: qualifications.qualificationRegister || { catalog: { credentials: [], requirements: [] }, summary: {}, workers: [], requirements: [], jobs: [] },
      availabilityRegister: availability.availabilityRegister || { catalog: [], summary: {}, workers: [], periods: [], conflicts: [] },
    }
  }
  if (section === 'finance') {
    const [finance, cashFlow, workers] = await Promise.all([
      api('/api/ledger/finance?limit=100'),
      api('/api/ledger/cash-flow'),
      api('/api/ledger/workers?limit=500'),
    ])
    return {
      finance,
      cashFlow: cashFlow.cashFlow,
      workers: workers.workers || [],
      workerSummary: workers.summary || {},
    }
  }
  if (section === 'recovery') {
    return { recoveryPortfolio: await api('/api/ledger/operational-recovery?limit=200') }
  }
  if (section === 'performance') {
    const [result, catalog, frameworks] = await Promise.all([
      api('/api/ledger/performance-scorecard'),
      api('/api/ledger/frameworks/catalog?limit=1000&compact_families=true'),
      api('/api/ledger/frameworks?limit=2000'),
    ])
    return {
      performanceScorecard: result.scorecard,
      frameworkCatalog: catalog.catalog,
      frameworkWorkspace: frameworks.workspace,
    }
  }
  if (section === 'clients') {
    const [clientSuccess, directory] = await Promise.all([
      api('/api/ledger/client-success?limit=100'),
      api('/api/ledger/clients?limit=500'),
    ])
    return {
      clients: clientSuccess,
      clientDirectory: directory,
    }
  }
  if (section === 'field') {
    const [field, attendance, safetyBriefings, workPermits, workers] = await Promise.all([
      fieldScoped ? Promise.resolve({ rows: [], summary: {} }) : api('/api/ledger/field-assurance?limit=100'),
      api('/api/ledger/attendance?limit=250'),
      api('/api/ledger/safety-briefings?limit=100'),
      api('/api/ledger/work-permits?limit=100'),
      fieldScoped ? Promise.resolve(null) : api('/api/ledger/workers?limit=500'),
    ])
    return {
      field,
      attendance: attendance.attendance || { rows: [], summary: {} },
      safetyMeetings: safetyBriefings.safetyMeetings || [],
      workPermits: workPermits.workPermits || [],
      ...(workers
        ? { workers: workers.workers || [], workerSummary: workers.summary || {} }
        : {}),
    }
  }
  if (section === 'operations') {
    const [templates, scheduler, organization, backups, capabilities, archivedJobs, operatorRegister, workers, operatorScopeJobs, privacyRequests, clientDirectory, health, readiness] = await Promise.all([
      api('/api/ledger/inspection-templates'),
      api('/api/ledger/scheduler').catch(() => null),
      api('/api/ledger/organization'),
      api('/api/operations/backups').catch(() => ({ backups: [] })),
      viewContext.operatorRole === 'owner' ? api('/api/operations/capabilities').catch(() => null) : Promise.resolve(null),
      api('/api/ledger/jobs?archiveOnly=true&limit=100').catch(() => ({ jobs: [] })),
      api('/api/operations/operators'),
      api('/api/ledger/workers?limit=500'),
      api('/api/ledger/jobs?limit=500'),
      api('/api/operations/privacy/requests?status=all&limit=500'),
      api('/api/ledger/clients?limit=500'),
      api('/api/health'),
      api('/api/readiness').catch(() => ({ status: 'unavailable' })),
    ])
    return {
      inspectionTemplates: templates.templates || [],
      scheduler: scheduler?.scheduler || null,
      organization: organization.organization,
      backups: backups.backups || [],
      operationsCapabilities: capabilities,
      archivedJobs: archivedJobs.jobs || [],
      operatorRegister,
      operatorScopeJobs: operatorScopeJobs.jobs || [],
      privacyRequests: { requests: privacyRequests.requests || [], summary: privacyRequests.summary || {} },
      clientDirectory,
      workers: workers.workers || [],
      workerSummary: workers.summary || {},
      health,
      readiness,
    }
  }
  return {}
}


function localizedNextActionMessage(item, jobs, t) {
  const jobTitle = item.jobTitle
    || item.title
    || jobs.find((job) => job.id === item.jobId)?.title
    || t('This job')
  if (item.type === 'review_operational_recovery') {
    if (item.integrityFailure) return t('A recovery record failed its integrity check. Review the retained case before relying on its contents.')
    const owner = item.owner || t('the assigned owner')
    if (item.followUpType === 'recovery_case') {
      return item.overdue
        ? t('Recovery case for {job} is overdue. {owner} should review current evidence.', { job: jobTitle, owner })
        : t('Recovery case for {job} is due within seven days. {owner} should check the latest source before acting.', { job: jobTitle, owner })
    }
    if (item.followUpType === 'supplier_response') return item.overdue
      ? t('Supplier follow-up for {job} is overdue. Review the delivery evidence and record the outcome.', { job: jobTitle })
      : t('Supplier follow-up for {job} is due within seven days. Check the latest delivery evidence.', { job: jobTitle })
    if (item.followUpType === 'supplier_delivery') return item.overdue
      ? t('Supplier delivery review for {job} is overdue. Confirm actual receipt before updating availability.', { job: jobTitle })
      : t('Supplier delivery for {job} is expected within seven days. Confirm actual receipt before updating availability.', { job: jobTitle })
    if (item.followUpType === 'client_response') return item.overdue
      ? t('Customer follow-up for {job} is overdue. Review new inbound messages before acting.', { job: jobTitle })
      : t('Customer follow-up for {job} is due within seven days. Review new inbound messages before acting.', { job: jobTitle })
    if (item.followUpType === 'contract_review') return item.overdue
      ? t('Contract milestone follow-up for {job} is overdue. Recheck the current commitment and source.', { job: jobTitle })
      : t('Contract milestone follow-up for {job} is due within seven days. Recheck the current commitment and source.', { job: jobTitle })
  }
  if (item.type === 'assign_worker') {
    return t('{job} needs a worker assignment.', { job: jobTitle })
  }
  if (item.type === 'review_daily_cycle') {
    if (item.actionKind === 'worker_checkin_missing') {
      return t('{worker} has no recorded site check-in 30 minutes after the planned start on {job}. Confirm the situation; no absence is assumed.', {
        worker: item.workerName || t('The assigned worker'),
        job: jobTitle,
      })
    }
    if (item.actionKind === 'end_of_day_missing') {
      return t('{job} has an open {status} daily cycle and needs a retained end-of-day plan-versus-actual report.', {
        job: jobTitle,
        status: t(formatStatus(item.cycleStatus || 'open')),
      })
    }
    return t("{job} needs today's crew start huddle before the daily operating cycle is complete.", { job: jobTitle })
  }
  if (item.type === 'draft_field_report') {
    return t("{job} needs today's field report for jobsite evidence and office visibility.", { job: jobTitle })
  }
  if (item.type === 'create_budget_line') {
    return t('{job} needs a budget line so costs, commitments, and forecast can be tracked.', { job: jobTitle })
  }
  if (item.type === 'prepare_schedule_baseline') {
    return item.baselineReason === 'approved_baseline_stale'
      ? t('{job} changed after its approved work-plan baseline and needs a revised internal baseline.', { job: jobTitle })
      : t('{job} has schedulable tasks but no approved critical-path baseline.', { job: jobTitle })
  }
  return item.message || ''
}







function ApprovalQueueItem({ item, submitting, onReview }) {
  const decision = item.decision || {}
  return (
    <article className="approval-item">
      <div className="approval-icon">
        <ShieldCheck size={19} />
      </div>
      <div className="approval-copy">
        <div className="approval-title-row">
          <h3>{item.title || item.summary || formatStatus(item.targetType)}</h3>
          <span className={`tag tag-${decision.riskLevel === 'high' ? 'amber' : 'green'}`}>{decision.riskLevel || 'review'}</span>
        </div>
        <p>{decision.primaryEffect || item.summary || item.reason || 'Review this retained ledger decision.'}</p>
        <small>
          {item.jobTitle || item.jobId || 'Portfolio decision'} / {formatDate(item.createdAt)}
        </small>
      </div>
      <div className="approval-actions">
        <button className="secondary-button" disabled={submitting} onClick={() => onReview(item, 'rejected')}>
          Reject
        </button>
        <button className="primary-button" disabled={submitting} onClick={() => onReview(item, 'approved')}>
          Review and approve
        </button>
      </div>
    </article>
  )
}





function AuthenticationScreen({ checking, error, submitting, onLogin, identity }) {
  const [token, setToken] = useState('')
  const [visible, setVisible] = useState(false)

  async function submit(event) {
    event.preventDefault()
    const succeeded = await onLogin(token)
    if (succeeded) setToken('')
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-busy={checking || submitting}>
        <div className="auth-brand">
          <span className="brand-mark">
            <HardHat size={18} />
          </span>
          <strong>Contractor.AI</strong>
        </div>
        {checking ? (
          <div className="auth-loading">
            <LoaderCircle className="spin" size={25} />
            <span>Checking operator access</span>
          </div>
        ) : (
          <>
            <div className="auth-heading">
              <span className="auth-icon">
                <LockKeyhole size={21} />
              </span>
              <div>
                <h1>Operator sign in</h1>
                <p>Use the access key issued for your role.</p>
              </div>
            </div>
            {identity?.enabled && <div className="auth-form"><a className="primary-button" href={identity.signInUrl}>Inloggen met persoonlijk account</a><a href={identity.accountUrl}>Account aanmaken of herstellen</a></div>}
            <form className="auth-form" onSubmit={submit}>
              <label htmlFor="operator-access-key">Access key</label>
              <div className="auth-input-wrap">
                <input
                  id="operator-access-key"
                  autoComplete="current-password"
                  autoFocus
                  minLength="32"
                  required
                  type={visible ? 'text' : 'password'}
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={visible ? 'Hide access key' : 'Show access key'}
                  onClick={() => setVisible((current) => !current)}
                >
                  {visible ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {error ? (
                <div className="auth-error" role="alert">
                  <TriangleAlert size={16} />
                  <span>{error}</span>
                </div>
              ) : null}
              <button className="primary-button auth-submit" disabled={submitting || token.length < 32}>
                <LockKeyhole size={16} />
                {submitting ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  )
}

function App() {
  const [section, setSection] = useState('today')
  const [clientConversationTarget, setClientConversationTarget] = useState(null)
  const [pipelineView, setPipelineView] = useState('opportunities')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [data, setData] = useState(null)
  const [authState, setAuthState] = useState('checking')
  const [identityConfiguration, setIdentityConfiguration] = useState(null)
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [authError, setAuthError] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [sectionLoading, setSectionLoading] = useState(false)
  const [commandPlanLoading, setCommandPlanLoading] = useState(false)
  const [commandPlanError, setCommandPlanError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showIntake, setShowIntake] = useState(false)
  const [opportunityEditor, setOpportunityEditor] = useState(null)
  const [selectedOpportunity, setSelectedOpportunity] = useState(null)
  const [opportunityActivity, setOpportunityActivity] = useState(null)
  const [opportunityActivityDraft, setOpportunityActivityDraft] = useState(() => emptyOpportunityActivityDraft())
  const [bidPackageEditor, setBidPackageEditor] = useState(false)
  const [bidPackageDraft, setBidPackageDraft] = useState(() => emptyBidPackageDraft())
  const [selectedBidPackage, setSelectedBidPackage] = useState(null)
  const [bidPackageAction, setBidPackageAction] = useState(null)
  const [bidReturnDraft, setBidReturnDraft] = useState(() => emptyBidReturnDraft())
  const [bidSelectionRationale, setBidSelectionRationale] = useState('')
  const [bidAddPartnerIds, setBidAddPartnerIds] = useState([])
  const [bidCommitmentDraft, setBidCommitmentDraft] = useState(() => emptyBidCommitmentDraft())
  const [bidOrderDraft, setBidOrderDraft] = useState(() => emptyBidOrderDraft())
  const [bidOrderDeliveryDraft, setBidOrderDeliveryDraft] = useState(() => emptyBidOrderDeliveryDraft())
  const [approvalFocus, setApprovalFocus] = useState(null)
  const [approvalReview, setApprovalReview] = useState(null)
  const [approvalReason, setApprovalReason] = useState('')
  const [selectedJobId, setSelectedJobId] = useState(null)
  const [selectedJob, setSelectedJob] = useState(null)
  const [workContextRevision, setWorkContextRevision] = useState(0)
  const [scheduleRefreshRevision, setScheduleRefreshRevision] = useState(0)
  const [selectedJobLoading, setSelectedJobLoading] = useState(false)
  const [estimateRates, setEstimateRates] = useState(null)
  const [taskDraft, setTaskDraft] = useState(emptyTaskDraft)
  const [taskAction, setTaskAction] = useState(null)
  const [taskActionNote, setTaskActionNote] = useState('')
  const [takeoffDialog, setTakeoffDialog] = useState(null)
  const [takeoffDraft, setTakeoffDraft] = useState(() => emptyTakeoffDraft())
  const [takeoffItemDraft, setTakeoffItemDraft] = useState(() => emptyTakeoffItemDraft())
  const [takeoffConversionDraft, setTakeoffConversionDraft] = useState(emptyTakeoffConversionDraft)
  const [commercialDraftMode, setCommercialDraftMode] = useState(null)
  const [quoteDraft, setQuoteDraft] = useState(emptyQuoteDraft)
  const [changeOrderDraft, setChangeOrderDraft] = useState(emptyChangeOrderDraft)
  const [commercialAcceptance, setCommercialAcceptance] = useState(null)
  const [commercialAcceptanceDraft, setCommercialAcceptanceDraft] = useState(emptyCommercialAcceptanceDraft)
  const [commercialDelivery, setCommercialDelivery] = useState(null)
  const [commercialDeliveryDraft, setCommercialDeliveryDraft] = useState(() => emptyBidOrderDeliveryDraft())
  const [jobLifecycleAction, setJobLifecycleAction] = useState(null)
  const [jobLifecycleReason, setJobLifecycleReason] = useState('')
  const [showResourcePlanner, setShowResourcePlanner] = useState(false)
  const [resourceView, setResourceView] = useState('workforce')
  const [commandPlanView, setCommandPlanView] = useState('all')
  const [selectedCommandIds, setSelectedCommandIds] = useState([])
  const [automationControlDialog, setAutomationControlDialog] = useState(null)
  const [automationControlError, setAutomationControlError] = useState('')
  const automationControlOpenerRef = useRef(null)
  const [qaResetDialog, setQaResetDialog] = useState(null)
  const [qaResetError, setQaResetError] = useState('')
  const qaResetOpenerRef = useRef(null)
  const qaResetPreviewRequestRef = useRef(0)
  const [resourceAction, setResourceAction] = useState(null)
  const [resourceActionDraft, setResourceActionDraft] = useState(emptyResourceActionDraft)
  const [workerEditor, setWorkerEditor] = useState(null)
  const [workerDraft, setWorkerDraft] = useState(emptyWorkerDraft)
  const [workerRetirement, setWorkerRetirement] = useState(null)
  const [workerRetirementReason, setWorkerRetirementReason] = useState('')
  const [credentialEditor, setCredentialEditor] = useState(null)
  const [credentialDraft, setCredentialDraft] = useState(() => emptyWorkerCredentialDraft())
  const [qualificationRequirementEditor, setQualificationRequirementEditor] = useState(false)
  const [qualificationRequirementDraft, setQualificationRequirementDraft] = useState(() => emptyQualificationRequirementDraft())
  const [qualificationRequirementRetirement, setQualificationRequirementRetirement] = useState(null)
  const [qualificationRequirementRetirementReason, setQualificationRequirementRetirementReason] = useState('')
  const [availabilityEditor, setAvailabilityEditor] = useState(false)
  const [availabilityDraft, setAvailabilityDraft] = useState(() => emptyWorkerAvailabilityDraft())
  const [availabilityCancellation, setAvailabilityCancellation] = useState(null)
  const [availabilityCancellationReason, setAvailabilityCancellationReason] = useState('')
  const [materialReceiptEditor, setMaterialReceiptEditor] = useState(false)
  const [materialReceiptDraft, setMaterialReceiptDraft] = useState(() => emptyMaterialReceiptDraft())
  const [materialReceiptReversal, setMaterialReceiptReversal] = useState(null)
  const [materialReceiptReversalReason, setMaterialReceiptReversalReason] = useState('')
  const [equipmentEditor, setEquipmentEditor] = useState(null)
  const [equipmentDraft, setEquipmentDraft] = useState(emptyEquipmentDraft)
  const [equipmentInspection, setEquipmentInspection] = useState(null)
  const [equipmentInspectionDraft, setEquipmentInspectionDraft] = useState(emptyEquipmentInspectionDraft)
  const [equipmentMaintenance, setEquipmentMaintenance] = useState(null)
  const [equipmentMaintenanceDraft, setEquipmentMaintenanceDraft] = useState(emptyEquipmentMaintenanceDraft)
  const [equipmentRetirement, setEquipmentRetirement] = useState(null)
  const [equipmentRetirementReason, setEquipmentRetirementReason] = useState('')
  const [equipmentCheckoutEditor, setEquipmentCheckoutEditor] = useState(false)
  const [equipmentCheckoutDraft, setEquipmentCheckoutDraft] = useState(() => emptyEquipmentCheckoutDraft())
  const [equipmentCheckoutPlans, setEquipmentCheckoutPlans] = useState([])
  const [equipmentReturnEditor, setEquipmentReturnEditor] = useState(null)
  const [equipmentReturnDraft, setEquipmentReturnDraft] = useState(() => emptyEquipmentReturnDraft())
  const [tradePartnerEditor, setTradePartnerEditor] = useState(null)
  const [tradePartnerDraft, setTradePartnerDraft] = useState(emptyTradePartnerDraft)
  const [tradePartnerRetirement, setTradePartnerRetirement] = useState(null)
  const [tradePartnerRetirementReason, setTradePartnerRetirementReason] = useState('')
  const [organizationProfileDraft, setOrganizationProfileDraft] = useState(() => organizationDraft())
  const [showOrganizationOnboarding, setShowOrganizationOnboarding] = useState(false)
  const organizationOnboardingOpenerRef = useRef(null)
  const [invoiceJob, setInvoiceJob] = useState(null)
  const [invoiceDraft, setInvoiceDraft] = useState(() => emptyInvoiceDraft())
  const [financeAction, setFinanceAction] = useState(null)
  const [financeActionDraft, setFinanceActionDraft] = useState(emptyFinanceActionDraft)
  const [financeOrderDelivery, setFinanceOrderDelivery] = useState(null)
  const [financeOrderDeliveryDraft, setFinanceOrderDeliveryDraft] = useState(() => emptyBidOrderDeliveryDraft())
  const [clientEditor, setClientEditor] = useState(null)
  const [clientDraft, setClientDraft] = useState(() => emptyClientDraft())
  const [clientAction, setClientAction] = useState(null)
  const [clientActionNotes, setClientActionNotes] = useState('')
  const [clientActionOption, setClientActionOption] = useState('')
  const [clientActionReference, setClientActionReference] = useState('')
  const [fieldAction, setFieldAction] = useState(null)
  const [fieldActionNotes, setFieldActionNotes] = useState('')
  const [fieldActionDate, setFieldActionDate] = useState(futureDateInput(365))
  const [fieldActionReference, setFieldActionReference] = useState('')
  const [scheduleDraft, setScheduleDraft] = useState({ plannedStart: '', plannedEnd: '' })
  const [scheduleReview, setScheduleReview] = useState(null)
  const [weatherDraft, setWeatherDraft] = useState({ condition: 'workable', precipitationPercent: '0', weatherSensitive: false })
  const [resourceDraft, setResourceDraft] = useState({ workerId: '', toolId: '', toolTaskId: '' })
  const [resourceOptions, setResourceOptions] = useState({ workers: [], tools: [] })
  const [communicationDraft, setCommunicationDraft] = useState({ channel: 'email', subject: '', body: '', expectsReply: true })
  const [portalDraft, setPortalDraft] = useState({ label: 'Client job portal', expiresAt: futureDateInput(30), locale: 'nl-NL' })
  const [portalLink, setPortalLink] = useState('')
  const [notice, setNotice] = useState(null)
  const [localeSaving, setLocaleSaving] = useState(false)
  const [operatorLocaleOverride, setOperatorLocaleOverride] = useState(null)
  const [evidence, setEvidence] = useState(() => emptyFieldEvidenceDraft())
  const [fieldPhotoEvidenceSets, setFieldPhotoEvidenceSets] = useState([])
  const [fieldProgress, setFieldProgress] = useState(emptyFieldProgress)
  const [dailyHuddle, setDailyHuddle] = useState(emptyDailyHuddle)
  const [fieldDailyCycles, setFieldDailyCycles] = useState([])
  const [dailyCycleLoading, setDailyCycleLoading] = useState(false)
  const [fieldDailyLog, setFieldDailyLog] = useState(emptyFieldDailyLog)
  const [fieldMaterialReceipt, setFieldMaterialReceipt] = useState(() => emptyMaterialReceiptDraft())
  const [fieldMaterialReceiptPlans, setFieldMaterialReceiptPlans] = useState([])
  const [materialReceiptLoading, setMaterialReceiptLoading] = useState(false)
  const [fieldExpenseReceipt, setFieldExpenseReceipt] = useState(() => emptyFieldExpenseReceiptDraft())
  const [fieldExpenseReceipts, setFieldExpenseReceipts] = useState([])
  const [expenseReceiptLoading, setExpenseReceiptLoading] = useState(false)
  const [fieldEnvironmentalActivity, setFieldEnvironmentalActivity] = useState(() => emptyFieldEnvironmentalDraft())
  const [fieldEnvironmentalActivities, setFieldEnvironmentalActivities] = useState([])
  const [environmentalRegister, setEnvironmentalRegister] = useState(null)
  const [environmentalReports, setEnvironmentalReports] = useState([])
  const [environmentalLoading, setEnvironmentalLoading] = useState(false)
  const [environmentalReportDraft, setEnvironmentalReportDraft] = useState(() => emptyEnvironmentalReportDraft())
  const [environmentalReversal, setEnvironmentalReversal] = useState(null)
  const [environmentalReversalReason, setEnvironmentalReversalReason] = useState('')
  const [fieldEquipmentCheckout, setFieldEquipmentCheckout] = useState(() => emptyEquipmentCheckoutDraft())
  const [fieldEquipmentReturn, setFieldEquipmentReturn] = useState(() => emptyEquipmentReturnDraft())
  const [fieldEquipmentPlans, setFieldEquipmentPlans] = useState([])
  const [fieldEquipmentCustody, setFieldEquipmentCustody] = useState([])
  const [attendanceDraft, setAttendanceDraft] = useState(emptyAttendanceDraft)
  const [safetyBriefingDraft, setSafetyBriefingDraft] = useState(emptySafetyBriefingDraft)
  const [safetyBriefingLoading, setSafetyBriefingLoading] = useState(false)
  const [workPermitDraft, setWorkPermitDraft] = useState(emptyWorkPermitDraft)
  const [workPermitLoading, setWorkPermitLoading] = useState(false)
  const [outboxPending, setOutboxPending] = useState(0)
  const [outboxQuarantined, setOutboxQuarantined] = useState(0)
  const [outboxSyncing, setOutboxSyncing] = useState(false)
  const [networkOnline, setNetworkOnline] = useState(() => navigator.onLine !== false)
  const exportInputRef = useRef(null)
  const evidenceInputRef = useRef(null)
  const fieldCaptureRef = useRef(null)
  const workerDialogOpenerRef = useRef(null)
  const qualificationDialogOpenerRef = useRef(null)
  const availabilityDialogOpenerRef = useRef(null)
  const equipmentDialogOpenerRef = useRef(null)
  const equipmentInspectionOpenerRef = useRef(null)
  const equipmentMaintenanceOpenerRef = useRef(null)
  const commercialDialogOpenerRef = useRef(null)
  const commercialDialogReturnFocusRef = useRef(false)
  const noticeSequenceRef = useRef(0)
  const hasLoadedDataRef = useRef(false)
  const fullLoadSequenceRef = useRef(0)
  const sectionRef = useRef('today')
  const resourceViewRef = useRef('workforce')
  const sectionLoadSequenceRef = useRef(0)
  const dailyCycleLoadSequenceRef = useRef(0)
  const materialReceiptLoadSequenceRef = useRef(0)
  const expenseReceiptLoadSequenceRef = useRef(0)
  const environmentalLoadSequenceRef = useRef(0)
  const safetyBriefingLoadSequenceRef = useRef(0)
  const workPermitLoadSequenceRef = useRef(0)
  const lastPlannerWeekRef = useRef('')
  const sectionRequestRef = useRef(null)

  useEffect(() => () => {
    sectionRequestRef.current?.abort()
  }, [])

  useEffect(() => {
    const updateNetworkState = () => setNetworkOnline(navigator.onLine !== false)
    window.addEventListener('online', updateNetworkState)
    window.addEventListener('offline', updateNetworkState)
    return () => {
      window.removeEventListener('online', updateNetworkState)
      window.removeEventListener('offline', updateNetworkState)
    }
  }, [])

  const refresh = useCallback(async () => {
    sectionRequestRef.current?.abort()
    sectionRequestRef.current = null
    sectionLoadSequenceRef.current += 1
    setSectionLoading(false)
    const sequence = ++fullLoadSequenceRef.current
    setLoading(true)
    setError('')
    if (sectionRef.current === 'operations') {
      setData(current => current ? { ...current, health: null, readiness: null } : current)
    }
    try {
      const sessionResult = await api('/api/session')
      if (sequence !== fullLoadSequenceRef.current) return
      setIdentityConfiguration(sessionResult.identity || null)
      if (sessionResult.authentication?.required && !sessionResult.authentication.authenticated) {
        setData(null)
        setAuthState('required')
        return
      }
      setAuthState('active')
      setAuthError('')
      const operator = sessionResult.operator || { role: 'owner', capabilities: {} }
      const fieldScoped = operator.fieldScoped === true
      const jobsResult = await api('/api/ledger/jobs?limit=100')
      if (sequence !== fullLoadSequenceRef.current) return
      if (fieldScoped) {
        const scopedJobs = jobsResult.jobs || []
        hasLoadedDataRef.current = true
        setData({
          session: sessionResult,
          dashboard: fieldScopedDashboard(scopedJobs),
          jobs: scopedJobs,
          jobRegisterPagination: jobsResult.pagination || null,
          approvals: [],
          dispatch: { rows: [] },
          schedule: { jobs: [], summary: {}, window: null },
          crewCapacity: null,
          lastPlanner: null,
          workforce: { jobs: [], summary: {} },
          workers: [],
          workerSummary: {},
          qualificationRegister: { catalog: { credentials: [], requirements: [] }, summary: {}, workers: [], requirements: [], jobs: [] },
          availabilityRegister: { catalog: [], summary: {}, workers: [], periods: [], conflicts: [] },
          timesheets: { rows: [], exports: [], summary: {} },
          tools: [],
          toolSummary: {},
          inventory: { jobs: [], summary: {} },
          materialReceiving: { summary: {}, receipts: [], purchaseOrders: [], actions: [], policy: {} },
          equipmentCustody: { summary: {}, sessions: [], active: [], exceptions: [], actions: [], policy: {} },
          fiveS: null,
          tradePartners: [],
          tradePartnerSummary: {},
          finance: { jobs: [], summary: {} },
          clients: { jobs: [], summary: {} },
          field: { rows: [] },
          attendance: { rows: [], summary: {} },
          safetyMeetings: [],
          workPermits: [],
          inspectionTemplates: [],
          health: null,
          readiness: null,
          scheduler: null,
          commandPlan: null,
          backups: [],
          archivedJobs: [],
          operationsCapabilities: null,
          organization: null,
          opportunities: [],
          opportunityForecast: null,
          marketFit: null,
          bidDecisions: null,
          bidPackages: [],
          bidPackageSummary: {},
          performanceScorecard: null,
          frameworkCatalog: null,
          frameworkWorkspace: null,
        })
        return
      }
      if (!hasLoadedDataRef.current) {
        const initialJobs = jobsResult.jobs || []
        setData({
          session: sessionResult,
          dashboard: initialOperatorDashboard(initialJobs),
          jobs: initialJobs,
          jobRegisterPagination: jobsResult.pagination || null,
          approvals: [],
          dispatch: { rows: [] },
          schedule: { jobs: [], summary: {}, window: null },
          crewCapacity: null,
          lastPlanner: null,
          workforce: { jobs: [], summary: {} },
          workers: [],
          workerSummary: {},
          qualificationRegister: { catalog: { credentials: [], requirements: [] }, summary: {}, workers: [], requirements: [], jobs: [] },
          availabilityRegister: { catalog: [], summary: {}, workers: [], periods: [], conflicts: [] },
          timesheets: { rows: [], exports: [], summary: {} },
          tools: [],
          toolSummary: {},
          inventory: { jobs: [], summary: {} },
          materialReceiving: { summary: {}, receipts: [], purchaseOrders: [], actions: [], policy: {} },
          equipmentCustody: { summary: {}, sessions: [], active: [], exceptions: [], actions: [], policy: {} },
          fiveS: null,
          tradePartners: [],
          tradePartnerSummary: {},
          finance: { jobs: [], summary: {} },
          clients: { jobs: [], summary: {} },
          field: { rows: [] },
          attendance: { rows: [], summary: {} },
          safetyMeetings: [],
          workPermits: [],
          inspectionTemplates: [],
          health: null,
          readiness: null,
          scheduler: null,
          commandPlan: null,
          backups: [],
          archivedJobs: [],
          operationsCapabilities: null,
          organization: null,
          opportunities: [],
          opportunityForecast: null,
          marketFit: null,
          bidDecisions: null,
          bidPackages: [],
          bidPackageSummary: {},
          performanceScorecard: null,
          frameworkCatalog: null,
          frameworkWorkspace: null,
        })
      }
      const currentSection = sectionRef.current
      const [dashboardResult, approvalsResult, sectionPatch] = await Promise.all([
        api('/api/ledger/dashboard'),
        api('/api/ledger/approvals?status=pending&limit=100'),
        loadSectionPatch(currentSection, resourceViewRef.current, fieldScoped, {
          jobsResult,
          lastPlannerWeekStart: lastPlannerWeekRef.current,
          operatorRole: operator.role,
        }),
      ])
      if (sequence !== fullLoadSequenceRef.current) return
      const currentSectionPatch = sectionRef.current === currentSection ? sectionPatch : {}
      if (currentSectionPatch.lastPlanner?.week?.weekStart) {
        lastPlannerWeekRef.current = currentSectionPatch.lastPlanner.week.weekStart
      }
      if (currentSectionPatch.organization) setOrganizationProfileDraft(organizationDraft(currentSectionPatch.organization))
      hasLoadedDataRef.current = true
      setData((current) => ({
        ...current,
        ...currentSectionPatch,
        session: sessionResult,
        dashboard: dashboardResult.dashboard,
        jobs: jobsResult.jobs || [],
        jobRegisterPagination: jobsResult.pagination || null,
        approvals: approvalsResult.approvals || [],
      }))
    } catch (requestError) {
      if (sequence !== fullLoadSequenceRef.current) return
      if (requestError.status === 401 || requestError.code === 'authentication_required') {
        setData(null)
        setAuthState('required')
        setAuthError('Your operator session has expired. Sign in again.')
      } else {
        setAuthState('active')
        if (navigator.onLine === false && hasLoadedDataRef.current) setError('')
        else setError(requestError.message)
      }
    } finally {
      if (sequence === fullLoadSequenceRef.current) setLoading(false)
    }
  }, [])

  const dashboard = data?.dashboard
  const operator = data?.session?.operator || { role: 'owner' }
  const defaultLocale = preferredOperatorLocale(operator.preferences, navigator.languages?.length ? navigator.languages : [navigator.language])
  const operatorLocale = normalizeLocale(operatorLocaleOverride || defaultLocale, defaultLocale)
  const [operatorTranslator, setOperatorTranslator] = useState(null)
  const ot = (key, variables = {}, englishFallback = key) => operatorLocale === 'nl-NL' && operatorTranslator
    ? operatorTranslator(operatorLocale, key, variables, englishFallback)
    : Object.entries(variables).reduce(
        (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
        englishFallback,
      )

  useEffect(() => {
    if (operatorLocale !== 'nl-NL') return undefined
    let active = true
    import('./operator-locale').then((module) => {
      if (active) setOperatorTranslator(() => module.operatorText)
    })
    return () => { active = false }
  }, [operatorLocale])
  setDashboardLocale(operatorLocale)
  const fieldScoped = operator.fieldScoped === true
  const outboxScope = fieldOutboxOperatorScope(operator)
  const draftRecoveryEnabled = authState === 'active' && Boolean(data?.session?.operator)
  useEffect(() => {
    document.documentElement.lang = operatorLocale.slice(0, 2)
  }, [operatorLocale])
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'intake-open', value: showIntake, setValue: setShowIntake })
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'opportunity-editor', value: opportunityEditor, setValue: setOpportunityEditor })
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'bid-package-open', value: bidPackageEditor, setValue: setBidPackageEditor })
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'bid-package', value: bidPackageDraft, setValue: setBidPackageDraft })
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'task', value: taskDraft, setValue: setTaskDraft })
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'takeoff', value: takeoffDraft, setValue: setTakeoffDraft })
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'takeoff-item', value: takeoffItemDraft, setValue: setTakeoffItemDraft })
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'takeoff-conversion', value: takeoffConversionDraft, setValue: setTakeoffConversionDraft })
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'commercial-mode', value: commercialDraftMode, setValue: setCommercialDraftMode })
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'quote', value: quoteDraft, setValue: setQuoteDraft })
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'change-order', value: changeOrderDraft, setValue: setChangeOrderDraft })
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'worker-editor', value: workerEditor, setValue: setWorkerEditor })
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'worker', value: workerDraft, setValue: setWorkerDraft })
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'equipment-editor', value: equipmentEditor, setValue: setEquipmentEditor })
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'equipment', value: equipmentDraft, setValue: setEquipmentDraft })
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'trade-partner-editor', value: tradePartnerEditor, setValue: setTradePartnerEditor })
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'trade-partner', value: tradePartnerDraft, setValue: setTradePartnerDraft })
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'client-editor', value: clientEditor, setValue: setClientEditor })
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'client', value: clientDraft, setValue: setClientDraft })
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'schedule', value: scheduleDraft, setValue: setScheduleDraft })
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'weather', value: weatherDraft, setValue: setWeatherDraft })
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'resource', value: resourceDraft, setValue: setResourceDraft })
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'communication', value: communicationDraft, setValue: setCommunicationDraft })
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'portal-link', value: portalDraft, setValue: setPortalDraft })
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'field-progress', value: fieldProgress, setValue: setFieldProgress })
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'daily-huddle', value: dailyHuddle, setValue: setDailyHuddle })
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'daily-log', value: fieldDailyLog, setValue: setFieldDailyLog })
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'material-receipt', value: fieldMaterialReceipt, setValue: setFieldMaterialReceipt })
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'expense-receipt', value: fieldExpenseReceipt, setValue: setFieldExpenseReceipt })
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'environmental-activity', value: fieldEnvironmentalActivity, setValue: setFieldEnvironmentalActivity })
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'attendance', value: attendanceDraft, setValue: setAttendanceDraft })
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'safety-briefing', value: safetyBriefingDraft, setValue: setSafetyBriefingDraft })
  useSessionDraftRecovery({ enabled: draftRecoveryEnabled, scope: outboxScope, name: 'work-permit', value: workPermitDraft, setValue: setWorkPermitDraft })

  const sessionCapabilities = data?.session?.operator?.capabilities
  const capabilities = useMemo(() => sessionCapabilities || {}, [sessionCapabilities])
  const canCoordinate = !fieldScoped && capabilities.intake === true
  const canManageMarketFitPolicy = operator.role === 'owner'
  const operationCapabilities = data?.operationsCapabilities?.capabilities || null
  const automationControl = operationCapabilities?.automation?.control || data?.scheduler?.control || null
  const automationSuspended = automationControl?.suspended === true
  const evidenceStorageCapability = operationCapabilities?.evidenceStorage || null
  const haiPublication = operationCapabilities?.haiConnector?.publication || null
  const haiPublicationReady = haiPublication?.configured === true && haiPublication?.status !== 'invalid_configuration'
  const haiPublicationLabel = haiPublication?.status === 'published'
    ? ot('{count} action(s) published', { count: haiPublication.itemCount || 0 })
    : haiPublication?.status === 'not_published'
      ? ot('ready to publish')
      : haiPublication?.status === 'invalid_configuration' || haiPublication?.status === 'invalid_feed' || haiPublication?.status === 'unavailable'
        ? ot('attention')
        : ot('download only')
  const exportValidationAvailable = operationCapabilities?.export?.integrity === 'sha256'
  const localBackupAvailable = operationCapabilities?.backup?.available === true
  const localRestoreAvailable = operationCapabilities?.restore?.available === true
  const providerRecovery = operationCapabilities?.providerRecovery
  const loginRateLimitCapability = operationCapabilities?.authentication?.loginRateLimit
  const loginDefenseLabel =
    loginRateLimitCapability?.durability === 'ledger' && loginRateLimitCapability?.multiReplicaSafe
      ? `${loginRateLimitCapability.limit} failures / ${Math.round(loginRateLimitCapability.windowMs / 60_000)} min, durable`
      : operationCapabilities
        ? 'attention'
        : 'checking'
  const apiRateLimitCapability = operationCapabilities?.requestSafety?.apiRateLimit
  const apiDefenseLabel =
    apiRateLimitCapability?.durability === 'ledger' && apiRateLimitCapability?.multiReplicaSafe
      ? `${apiRateLimitCapability.limit} requests / ${Math.round(apiRateLimitCapability.windowMs / 60_000)} min, durable`
      : operationCapabilities
        ? 'attention'
        : 'checking'
  const auditIntegrityCapability = operationCapabilities?.auditIntegrity
  const auditIntegrityLabel =
    auditIntegrityCapability?.valid && auditIntegrityCapability?.appendMode === 'atomic_hash_chain'
      ? `verified / ${auditIntegrityCapability.eventCount || 0} event${auditIntegrityCapability.eventCount === 1 ? '' : 's'}`
      : operationCapabilities
        ? 'attention'
        : 'checking'
  const recoveryLabel = localRestoreAvailable
    ? 'verified local package'
    : operationCapabilities?.restore?.authorityReviewRequired
      ? ot('reviewed recovery required')
      : providerRecovery?.available
      ? `${providerRecovery.postgresBackupMode || 'provider backup'} + ${providerRecovery.objectVersioningEnabled ? 'versioned evidence' : 'object recovery pending'}`
      : 'checking'
  const evidenceStorageLabel = evidenceStorageCapability
    ? `${evidenceStorageCapability.mode} / ${evidenceStorageCapability.status}`
    : `${data?.health?.runtime?.storageMode || 'local'} / checking`
  const metrics = dashboard?.metrics || {}
  const jobs = data?.jobs ?? EMPTY_LIST
  const archivedJobs = data?.archivedJobs ?? EMPTY_LIST
  const workers = data?.workers ?? EMPTY_LIST
  const tools = data?.tools ?? EMPTY_LIST
  const tradePartners = data?.tradePartners ?? EMPTY_LIST
  const approvals = data?.approvals ?? EMPTY_LIST
  const inspectionTemplates = data?.inspectionTemplates ?? EMPTY_LIST
  const attendance = data?.attendance || { rows: EMPTY_LIST, summary: {} }
  const safetyMeetings = data?.safetyMeetings ?? EMPTY_LIST
  const workPermits = data?.workPermits ?? EMPTY_LIST
  const visibleApprovals = useMemo(() => {
    if (!approvalFocus) return approvals
    if (approvalFocus.approvalId) return approvals.filter((approval) => approval.id === approvalFocus.approvalId)
    return approvals.filter((approval) => approval.jobId === approvalFocus.jobId)
  }, [approvalFocus, approvals])
  const activeJobs = useMemo(
    () => jobs.filter((job) => !['archived', 'completed', 'cancelled', 'rejected'].includes(job.status)).slice(0, 8),
    [jobs],
  )
  const selectedFieldPhotoEvidenceSet = fieldPhotoEvidenceSets.find(set => set.id === evidence.photoEvidenceSetId) || null
  const availableFieldPhotoEvidenceSets = fieldPhotoEvidenceSets.filter(set => (
    !['captures_complete', 'pending_review', 'released'].includes(set.status)
    && set.integrityValid !== false
    && set.sourceCurrent !== false
  ))
  const selectedFieldMaterialReceiptPlan = fieldMaterialReceiptPlans.find(plan => plan.purchaseOrder?.id === fieldMaterialReceipt.purchaseOrderId) || null
  const selectedDailyCycle = fieldDailyCycles.find(cycle => cycle.id === fieldDailyLog.cycleId) || null
  const selectedEquipmentCheckoutPlan = equipmentCheckoutPlans.find(plan => plan.reservation?.id === equipmentCheckoutDraft.reservationId) || null
  const selectedFieldEquipmentPlan = fieldEquipmentPlans.find(plan => plan.reservation?.id === fieldEquipmentCheckout.reservationId) || null
  const attendanceWorkerId = fieldScoped ? operator.worker?.id || null : attendanceDraft.workerId || null
  const currentAttendanceSession = useMemo(
    () => (attendance.rows || []).find((session) => (
      session.status === 'checked_in'
      && (!attendanceDraft.jobId || session.jobId === attendanceDraft.jobId)
      && (!attendanceWorkerId || session.workerId === attendanceWorkerId)
    )) || null,
    [attendance.rows, attendanceDraft.jobId, attendanceWorkerId],
  )
  const selectedSafetyMeeting = safetyMeetings.find((meeting) => meeting.id === safetyBriefingDraft.meetingId) || null
  const selectedJobSafetyMeetings = safetyMeetings.filter((meeting) => meeting.jobId === safetyBriefingDraft.jobId)
  const selectedWorkPermit = workPermits.find((permit) => permit.id === workPermitDraft.permitId) || null
  const selectedJobWorkPermits = workPermits.filter((permit) => permit.jobId === workPermitDraft.jobId)
  const taskAssigneeOptions = Array.from(
    new Map(
      (selectedJob?.assignments || [])
        .filter(
          (assignment) => assignment.workerId && !['released', 'cancelled', 'completed', 'closed', 'rejected'].includes(assignment.status),
        )
        .map((assignment) => [assignment.workerId, { id: assignment.workerId, name: assignment.workerName || 'Crew member', role: assignment.role || assignment.workerRole || '' }]),
    ).values(),
  )
  const nextActions = dashboard?.nextActions?.slice(0, 6) || []
  const invoiceAmount = Number(invoiceDraft.amount) || 0
  const invoiceTaxAmount = roundMoney((invoiceAmount * (Number(invoiceDraft.taxRate) || 0)) / 100)
  const invoiceTotal = roundMoney(invoiceAmount + invoiceTaxAmount)
  const financeControlAmount = Number(financeActionDraft.amount) || 0
  const financeCreditTaxRate = Number(financeAction?.action?.taxRate) || 0
  const financeCreditTax = roundMoney((financeControlAmount * financeCreditTaxRate) / 100)
  const financeCreditTotal = roundMoney(financeControlAmount + financeCreditTax)
  const financeSupplierTax = Number(financeActionDraft.taxAmount) || 0
  const financeSupplierTotal = roundMoney(financeControlAmount + financeSupplierTax)
  const financeControlForecast = Number(financeActionDraft.forecastAmount) || 0
  const financeControlHours = Number(financeActionDraft.hours) || 0
  const financeControlRate = Number(financeActionDraft.rate) || 0
  const financeControlExpense = Number(financeActionDraft.expenseAmount) || 0
  const activeCommercialDraft = commercialDraftMode === 'quote' ? quoteDraft : changeOrderDraft
  const commercialDraftNet = roundMoney(
    (activeCommercialDraft.lineItems || []).reduce((sum, item) => {
      const quantity = Number(item.quantity)
      const unitPrice = Number(item.unitPrice)
      return sum + (Number.isFinite(quantity) && Number.isFinite(unitPrice) ? quantity * unitPrice : 0)
    }, 0),
  )
  const commercialDraftTax = roundMoney((commercialDraftNet * (Number(activeCommercialDraft.taxRate) || 0)) / 100)
  const commercialDraftTotal = roundMoney(commercialDraftNet + commercialDraftTax)
  const commercialLinesValid =
    (activeCommercialDraft.lineItems || []).length > 0 &&
    activeCommercialDraft.lineItems.every(
      (item) =>
        item.description.trim().length >= 2 &&
        Number.isFinite(Number(item.quantity)) &&
        Number(item.quantity) > 0 &&
        Number.isFinite(Number(item.unitPrice)),
    )
  const commercialDraftReady =
    commercialLinesValid &&
    (commercialDraftMode !== 'quote' || Boolean(
      selectedJob?.commercialScope?.ready === true
      && selectedJob?.pricingBasis?.currentDecision
      && selectedJob?.pricingBasis?.stale !== true
    )) &&
    (commercialDraftMode !== 'change_order' ||
      (changeOrderDraft.title.trim().length >= 2 &&
        changeOrderDraft.scopeDelta.trim().length >= 3 &&
        changeOrderDraft.cause.trim().length >= 8 &&
        changeOrderDraft.justification.trim().length >= 8 &&
        changeOrderDraft.contractReference.trim().length >= 3 &&
        (changeOrderDraft.noticeReference.trim().length >= 3 || changeOrderDraft.noticeNotApplicableReason.trim().length >= 8) &&
        changeOrderDraft.scheduleImpactNarrative.trim().length >= 8 &&
        changeOrderDraft.riskImpactStatement.trim().length >= 8 &&
        changeOrderDraft.assumptions.trim().length >= 3 &&
        changeOrderDraft.exclusions.trim().length >= 3))
  const takeoffPreviewQuantity = takeoffDraftQuantity(takeoffItemDraft)
  const takeoffPreviewCost = roundMoney(takeoffPreviewQuantity * (Number(takeoffItemDraft.unitCost) || 0))
  const takeoffPreviewSell = roundMoney(takeoffPreviewQuantity * (Number(takeoffItemDraft.unitPrice) || 0))
  const takeoffItemDraftReady =
    takeoffItemDraft.description.trim().length >= 2 &&
    /^[A-Za-z0-9][A-Za-z0-9-]{0,11}(?:\.[A-Za-z0-9][A-Za-z0-9-]{0,11}){0,7}$/.test(takeoffItemDraft.wbsCode.trim()) &&
    takeoffItemDraft.workPackage.trim().length >= 2 &&
    takeoffPreviewQuantity > 0 &&
    Number.isFinite(Number(takeoffItemDraft.unitCost)) &&
    Number(takeoffItemDraft.unitCost) >= 0 &&
    Number.isFinite(Number(takeoffItemDraft.unitPrice)) &&
    Number(takeoffItemDraft.unitPrice) >= 0 &&
    takeoffItemDraft.unit.trim().length > 0
  const initialDataLoading = !hasLoadedDataRef.current
  const visibleNavItems = useMemo(
    () =>
      navItems.filter(([key]) => {
        if (key === 'pipeline') return capabilities.pipeline
        if (key === 'schedule') return capabilities.schedule
        if (key === 'approvals') return capabilities.approvals
        if (key === 'dispatch') return capabilities.dispatch
        if (key === 'recovery') return ['owner', 'office_operator'].includes(operator.role)
        if (key === 'resources') return capabilities.resources
        if (key === 'finance') return capabilities.finance
        if (key === 'performance') return capabilities.performance
        if (key === 'clients') return capabilities.clientSuccess
        if (key === 'field') return capabilities.fieldEvidence
        if (key === 'operations') return capabilities.maintenance
        return true
      }).map(([key, icon]) => [key, appText(operatorLocale, `nav.${key}`), icon]),
    [capabilities, operator.role, operatorLocale],
  )

  async function refreshOperationsCommandPlan(sequence = sectionLoadSequenceRef.current) {
    setCommandPlanLoading(true)
    setCommandPlanError('')
    try {
      const commandPlan = await api('/api/ledger/command-plan?limit=100&jobLimit=12', { signal: sectionRequestRef.current?.signal })
      if (sequence !== sectionLoadSequenceRef.current || sectionRef.current !== 'operations') return
      setData((current) => current ? { ...current, commandPlan } : current)
    } catch (requestError) {
      if (sequence === sectionLoadSequenceRef.current && sectionRef.current === 'operations') {
        setCommandPlanError(requestError.message)
      }
    } finally {
      if (sequence === sectionLoadSequenceRef.current && sectionRef.current === 'operations') {
        setCommandPlanLoading(false)
      }
    }
  }

  function refreshCurrentView() {
    if (sectionRef.current === 'operations') {
      void refreshSection('operations', resourceViewRef.current)
      return
    }
    void refresh()
  }

  async function refreshSection(next, nextResourceView = resourceViewRef.current) {
    sectionRequestRef.current?.abort()
    const sequence = ++sectionLoadSequenceRef.current
    if (next === 'today') {
      sectionRequestRef.current = null
      setSectionLoading(false)
      return
    }
    const controller = new AbortController()
    sectionRequestRef.current = controller
    setSectionLoading(true)
    if (next === 'operations') {
      setData(current => current ? { ...current, health: null, readiness: null } : current)
    }
    setError('')
    try {
      const patch = await loadSectionPatch(next, nextResourceView, fieldScoped, {
        signal: controller.signal,
        lastPlannerWeekStart: lastPlannerWeekRef.current,
        operatorRole: operator.role,
      })
      if (sequence !== sectionLoadSequenceRef.current || sectionRef.current !== next || controller.signal.aborted) return
      if (patch.lastPlanner?.week?.weekStart) {
        lastPlannerWeekRef.current = patch.lastPlanner.week.weekStart
      }
      if (patch.organization) setOrganizationProfileDraft(organizationDraft(patch.organization))
      setData((current) => current ? { ...current, ...patch } : current)
      if (next === 'operations') void refreshOperationsCommandPlan(sequence)
    } catch (requestError) {
      if (sequence === sectionLoadSequenceRef.current && !controller.signal.aborted) setError(requestError.message)
    } finally {
      if (sequence === sectionLoadSequenceRef.current) setSectionLoading(false)
    }
  }

  const selectSection = (next) => {
    if (initialDataLoading && !['today', 'jobs'].includes(next)) return
    if (sectionRef.current === next) {
      setMobileNavOpen(false)
      return
    }
    setApprovalFocus(null)
    sectionRef.current = next
    setSection(next)
    setMobileNavOpen(false)
    void refreshSection(next)
  }
  const selectResourceView = (next) => {
    resourceViewRef.current = next
    setResourceView(next)
    if (sectionRef.current !== 'resources') return
    void refreshSection('resources', next)
  }

  async function loadTimesheetPeriod(periodStart) {
    const sequence = ++sectionLoadSequenceRef.current
    setSectionLoading(true)
    setError('')
    try {
      const result = await api(`/api/ledger/timesheets?periodStart=${encodeURIComponent(periodStart)}`)
      if (sequence !== sectionLoadSequenceRef.current) return
      setData((current) => current ? { ...current, timesheets: result.timesheets || { rows: [], exports: [], summary: {} } } : current)
    } catch (requestError) {
      if (sequence === sectionLoadSequenceRef.current) setError(requestError.message)
    } finally {
      if (sequence === sectionLoadSequenceRef.current) setSectionLoading(false)
    }
  }

  async function requestWorkerTimesheet(workerId, periodStart) {
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/workers/${encodeURIComponent(workerId)}/timesheets`, {
        method: 'POST',
        body: JSON.stringify({ periodStart }),
      })
      setData((current) => current ? {
        ...current,
        timesheets: result.timesheets || current.timesheets,
        approvals: result.approval ? upsertById(current.approvals, result.approval) : current.approvals,
      } : current)
      notify(result.replayed ? 'The current weekly timesheet review already exists.' : 'Weekly timesheet frozen and sent to the internal approval queue.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function prepareTimesheetHandoff(periodStart) {
    setSubmitting(true)
    setError('')
    try {
      const result = await api('/api/ledger/timesheet-exports', {
        method: 'POST',
        body: JSON.stringify({ periodStart }),
      })
      setData((current) => current ? { ...current, timesheets: result.timesheets || current.timesheets } : current)
      notify(result.replayed ? 'The current checksum-protected handoff already exists.' : 'Checksum-protected timesheet handoff prepared. No payroll or provider action was performed.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }
  const openApprovals = (focus = null) => {
    if (selectedJobId) closeJobWorkspace()
    setApprovalFocus(focus)
    sectionRef.current = 'approvals'
    setSection('approvals')
    setMobileNavOpen(false)
    if (focus?.approvalId || focus?.jobId) {
      const parameters = new URLSearchParams({ status: 'pending', limit: '100' })
      if (focus.approvalId) parameters.set('id', focus.approvalId)
      else parameters.set('jobId', focus.jobId)
      void api(`/api/ledger/approvals?${parameters.toString()}`)
        .then((result) => {
          const focusedApprovals = result.approvals || []
          if (!focusedApprovals.length) return
          setData((current) => {
            if (!current) return current
            const focusedIds = new Set(focusedApprovals.map((approval) => approval.id))
            return {
              ...current,
              approvals: [...focusedApprovals, ...(current.approvals || []).filter((approval) => !focusedIds.has(approval.id))],
            }
          })
        })
        .catch((requestError) => setError(requestError.message))
    }
  }
  const notify = useCallback((message) => {
    noticeSequenceRef.current += 1
    setNotice({ id: noticeSequenceRef.current, message })
  }, [])

  const loginOperator = useCallback(
    async (token) => {
      setAuthSubmitting(true)
      setAuthError('')
      try {
        await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ token }) })
        setOperatorLocaleOverride(null)
        await refresh()
        return true
      } catch (requestError) {
        setAuthError(requestError.message)
        return false
      } finally {
        setAuthSubmitting(false)
      }
    },
    [refresh],
  )

  const logoutOperator = useCallback(async () => {
    sectionRequestRef.current?.abort()
    sectionRequestRef.current = null
    sectionLoadSequenceRef.current += 1
    setSectionLoading(false)
    setSubmitting(true)
    try {
      await api('/api/auth/logout', { method: 'POST' })
      clearSessionDraftScope(browserDraftStorage(), outboxScope)
      setOperatorLocaleOverride(null)
      setData(null)
      setAuthError('')
      setAuthState('required')
      sectionRef.current = 'today'
      setSection('today')
      setOutboxPending(0)
      setOutboxQuarantined(0)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }, [outboxScope])

  async function updateOperatorLocale(nextLocale) {
    const locale = normalizeLocale(nextLocale)
    if (locale === operatorLocale || localeSaving) return
    setOperatorLocaleOverride(locale)
    setLocaleSaving(true)
    try {
      const result = await api('/api/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ locale }),
      })
      setData((current) => current ? {
        ...current,
        session: {
          ...current.session,
          operator: { ...current.session.operator, preferences: result.preferences },
        },
      } : current)
    } catch (requestError) {
      setOperatorLocaleOverride(null)
      setError(requestError.message)
    } finally {
      setLocaleSaving(false)
    }
  }

  const refreshOutboxState = useCallback(async () => {
    const snapshot = await fieldOutboxSnapshot(outboxScope)
    setOutboxPending(snapshot.pending)
    setOutboxQuarantined(snapshot.quarantined)
    return snapshot
  }, [outboxScope])

  const syncFieldOutbox = useCallback(
    async ({ announce = false } = {}) => {
      if (!fieldOutboxAvailable()) return
      setOutboxSyncing(true)
      try {
        const result = await flushFieldOutbox({
          operatorScope: outboxScope,
          sendEvidence: recordFieldEvidence,
          sendOperation: recordFieldOperation,
        })
        setOutboxPending(result.pending)
        setOutboxQuarantined(result.quarantined)
        if (result.sent) {
          if (announce) notify(`${result.sent} queued field update(s) were recorded in the operating ledger.`)
          await refresh()
          if (selectedJobId) {
            const selected = await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}`)
            setSelectedJob(selected.job)
          }
        }
        if (announce && result.stopped && result.stopped !== 'offline')
          setError(result.stopped.message || 'A queued field update could not be recorded.')
      } catch (requestError) {
        if (announce) setError(requestError.message)
      } finally {
        setOutboxSyncing(false)
      }
    },
    [notify, outboxScope, refresh, selectedJobId],
  )

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (
      !commercialDialogReturnFocusRef.current ||
      submitting ||
      commercialDraftMode ||
      commercialAcceptance ||
      commercialDelivery ||
      takeoffDialog
    )
      return
    const opener = commercialDialogOpenerRef.current
    commercialDialogReturnFocusRef.current = false
    commercialDialogOpenerRef.current = null
    requestAnimationFrame(() => {
      if (opener?.isConnected && !opener.disabled) opener.focus()
    })
  }, [commercialAcceptance, commercialDelivery, commercialDraftMode, submitting, takeoffDialog])

  useEffect(() => {
    if (!notice || loading || submitting || outboxSyncing) return undefined
    const timer = window.setTimeout(() => setNotice(null), 8000)
    return () => window.clearTimeout(timer)
  }, [loading, notice, outboxSyncing, submitting])

  useEffect(() => {
    if (!visibleNavItems.some(([key]) => key === section)) {
      sectionRef.current = 'today'
      setSection('today')
    }
  }, [section, visibleNavItems])

  useEffect(() => {
    const jobId = safetyBriefingDraft.jobId
    if (!jobId) return
    const currentIsValid = safetyMeetings.some((meeting) => (
      meeting.id === safetyBriefingDraft.meetingId && meeting.jobId === jobId
    ))
    if (currentIsValid) return
    const firstMeeting = safetyMeetings.find((meeting) => (
      meeting.jobId === jobId && ['scheduled', 'in_progress', 'pending_approval'].includes(meeting.status)
    )) || safetyMeetings.find((meeting) => meeting.jobId === jobId)
    if (!firstMeeting) return
    setSafetyBriefingDraft((current) => (
      current.jobId === jobId && current.meetingId !== firstMeeting.id
        ? { ...current, meetingId: firstMeeting.id }
        : current
    ))
  }, [safetyBriefingDraft.jobId, safetyBriefingDraft.meetingId, safetyMeetings])

  useEffect(() => {
    const jobId = workPermitDraft.jobId
    if (!jobId) return
    const currentIsValid = workPermits.some((permit) => (
      permit.id === workPermitDraft.permitId && permit.jobId === jobId
    ))
    if (currentIsValid) return
    const firstPermit = workPermits.find((permit) => (
      permit.jobId === jobId && ['active', 'pending_approval', 'suspended'].includes(permit.status)
    )) || workPermits.find((permit) => permit.jobId === jobId)
    if (!firstPermit) return
    setWorkPermitDraft((current) => (
      current.jobId === jobId && current.permitId !== firstPermit.id
        ? { ...current, permitId: firstPermit.id }
        : current
    ))
  }, [workPermitDraft.jobId, workPermitDraft.permitId, workPermits])

  useEffect(() => {
    if (authState !== 'active' || !fieldOutboxAvailable()) return undefined
    const initializeOutbox = async () => {
      try {
        const snapshot = await fieldOutboxSnapshot(outboxScope)
        setOutboxPending(snapshot.pending)
        setOutboxQuarantined(snapshot.quarantined)
        if (navigator.onLine !== false) await syncFieldOutbox()
      } catch {
        setOutboxPending(0)
        setOutboxQuarantined(0)
      }
    }
    initializeOutbox()
    const handleOnline = () => {
      syncFieldOutbox()
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [authState, outboxScope, syncFieldOutbox])

  function openApprovalReview(item, status) {
    setApprovalReview({ item, status })
    setApprovalReason('')
  }

  function closeApprovalReview() {
    if (submitting) return
    setApprovalReview(null)
    setApprovalReason('')
  }

  async function resolveApproval(event) {
    event.preventDefault()
    const reasonRequired =
      approvalReview?.status === 'rejected' ||
      (approvalReview?.status === 'approved' && approvalReview?.item?.data?.requiresExceptionOverride === true)
    if (!approvalReview || (reasonRequired && !approvalReason.trim())) return
    const { item, status } = approvalReview
    setSubmitting(true)
    try {
      const result = await api(`/api/ledger/approvals/${item.id}/resolve?includeDashboard=false`, {
        method: 'POST',
        body: JSON.stringify({
          status,
          resolvedBy: 'Owner',
          reason: approvalReason.trim() || `Reviewed ${item.summary || item.targetType} and its retained safeguards.`,
        }),
      })
      setApprovalReview(null)
      setApprovalReason('')
      notify(`Approval ${status}. The ledger and audit trail were updated.`)
      if (result.bidPackage) {
        setSelectedBidPackage(result.bidPackage)
        setData((current) => {
          if (!current) return current
          const next = reconcileApprovalResolution({
            ...current,
            bidPackages: upsertById(current.bidPackages, result.bidPackage),
          }, item.id, result.dashboard)
          return result.job ? reconcileJobCollections(next, result.job) : next
        })
        if (result.job && selectedJobId === result.job.id) setSelectedJob(result.job)
      } else if (result.job) {
        setData((current) => reconcileJobCollections(
          reconcileApprovalResolution(current, item.id, result.dashboard),
          result.job,
        ))
        if (selectedJobId === result.job.id) setSelectedJob(result.job)
      } else {
        await refresh()
      }
      if (item.targetType === 'opportunity_site_survey' && item.data?.opportunityId) {
        const detail = await api(`/api/ledger/opportunities/${encodeURIComponent(item.data.opportunityId)}`)
        setSelectedOpportunity((current) => current?.id === item.data.opportunityId ? detail.opportunity : current)
        setData((current) => current ? {
          ...current,
          opportunities: (current.opportunities || EMPTY_LIST).map((opportunity) =>
            opportunity.id === detail.opportunity.id ? detail.opportunity : opportunity,
          ),
        } : current)
      }
      setSubmitting(false)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function createIntake(intake) {
    setSubmitting(true)
    try {
      await api('/api/ledger/intake', { method: 'POST', body: JSON.stringify({ ...intake, actor: 'office_operator' }) })
      notify('New intake saved to the operating ledger.')
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    } finally {
      setSubmitting(false)
    }
  }

  function openOpportunityEditor(opportunity = null) {
    setError('')
    removeSessionDraft(browserDraftStorage(), outboxScope, 'opportunity')
    setOpportunityEditor({ mode: opportunity ? 'edit' : 'create', opportunity })
  }

  function closeOpportunityEditor() {
    removeSessionDraft(browserDraftStorage(), outboxScope, 'opportunity')
    setOpportunityEditor(null)
  }

  async function submitOpportunity(payload) {
    if (!opportunityEditor || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const result = opportunityEditor.mode === 'create'
        ? await api('/api/ledger/opportunities', { method: 'POST', body: JSON.stringify(payload) })
        : await api(`/api/ledger/opportunities/${encodeURIComponent(opportunityEditor.opportunity.id)}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
      closeOpportunityEditor()
      setData((current) => {
        if (!current || !result.opportunity) return current
        const retained = current.opportunities || []
        const opportunityExists = retained.some((opportunity) => opportunity.id === result.opportunity.id)
        return {
          ...current,
          opportunities: opportunityExists
            ? retained.map((opportunity) => (opportunity.id === result.opportunity.id ? result.opportunity : opportunity))
            : [result.opportunity, ...retained],
        }
      })
      setSelectedOpportunity(result.opportunity)
      notify(opportunityEditor.mode === 'create' ? 'Opportunity retained in the preconstruction pipeline.' : 'Opportunity updated in the ledger.')
      await refresh()
      if (result.opportunity?.id) {
        const detail = await api(`/api/ledger/opportunities/${encodeURIComponent(result.opportunity.id)}`)
        setSelectedOpportunity(detail.opportunity)
      }
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function selectOpportunity(opportunity) {
    if (!opportunity) {
      setSelectedOpportunity(null)
      return
    }
    setError('')
    try {
      const result = await api(`/api/ledger/opportunities/${encodeURIComponent(opportunity.id)}`)
      setSelectedOpportunity(result.opportunity)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function refreshOpportunityDetail(opportunityId) {
    const detail = await api(`/api/ledger/opportunities/${encodeURIComponent(opportunityId)}`)
    setSelectedOpportunity((current) => current?.id === opportunityId ? detail.opportunity : current)
    setData((current) => current ? {
      ...current,
      opportunities: (current.opportunities || EMPTY_LIST).map((opportunity) =>
        opportunity.id === opportunityId ? detail.opportunity : opportunity,
      ),
    } : current)
    return detail.opportunity
  }

  async function planOpportunitySiteSurvey(payload) {
    if (!selectedOpportunity?.id) return null
    const opportunityId = selectedOpportunity.id
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/opportunities/${encodeURIComponent(opportunityId)}/site-surveys`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      await refreshOpportunityDetail(opportunityId)
      notify(result.replayed ? 'The matching internal site-survey plan already exists.' : 'Internal site-survey plan retained. No appointment confirmation was sent.')
      return result
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function uploadOpportunitySiteSurveyEvidence(file) {
    if (!selectedOpportunity?.id || !file) return null
    const opportunityId = selectedOpportunity.id
    const payload = new FormData()
    payload.append('evidenceFile', file)
    payload.append('opportunityId', opportunityId)
    payload.append('title', file.name || 'Site-survey evidence')
    payload.append('category', 'site_survey_evidence')
    setSubmitting(true)
    setError('')
    try {
      const response = await companyFetch('/api/ledger/upload', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Idempotency-Key': `site-survey-upload:${opportunityId}:${globalThis.crypto.randomUUID()}` },
        body: payload,
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        const requestError = new Error(result.error?.message || 'Site-survey evidence could not be retained.')
        requestError.code = result.error?.code || 'site_survey_upload_failed'
        throw requestError
      }
      await refreshOpportunityDetail(opportunityId)
      notify('Private site-survey evidence retained with checksum verification.')
      return result
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function submitOpportunitySiteSurvey(surveyId, payload) {
    if (!selectedOpportunity?.id || !surveyId) return null
    const opportunityId = selectedOpportunity.id
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/opportunities/${encodeURIComponent(opportunityId)}/site-surveys/${encodeURIComponent(surveyId)}/submissions`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setData((current) => current && result.approval ? {
        ...current,
        approvals: upsertById(current.approvals, result.approval),
      } : current)
      await refreshOpportunityDetail(opportunityId)
      notify(result.replayed ? 'The matching site-survey submission already exists.' : 'Site survey retained for source-current office approval.')
      return result
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  function reviewOpportunitySiteSurveyApproval(approvalId) {
    if (!approvalId || !selectedOpportunity) return
    openApprovals({
      approvalId,
      jobTitle: `${selectedOpportunity.title} site survey`,
    })
  }

  function openOpportunityActivity(opportunity) {
    setOpportunityActivity(opportunity)
    setOpportunityActivityDraft(emptyOpportunityActivityDraft())
  }

  async function submitOpportunityActivity(event) {
    event.preventDefault()
    if (!opportunityActivity) return
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/opportunities/${encodeURIComponent(opportunityActivity.id)}/activities`, {
        method: 'POST',
        body: JSON.stringify({
          ...opportunityActivityDraft,
          dueAt: toIsoDateTime(opportunityActivityDraft.dueAt),
          internalOnly: true,
        }),
      })
      setOpportunityActivity(null)
      setOpportunityActivityDraft(emptyOpportunityActivityDraft())
      setSelectedOpportunity(result.opportunity)
      notify('Internal opportunity activity retained. No external message was sent.')
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function completeOpportunityActivity(opportunity, activity) {
    setSubmitting(true)
    setError('')
    try {
      const result = await api(
        `/api/ledger/opportunities/${encodeURIComponent(opportunity.id)}/activities/${encodeURIComponent(activity.id)}`,
        { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) },
      )
      setSelectedOpportunity(result.opportunity)
      notify('Opportunity activity completed in the internal ledger.')
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function convertOpportunity(opportunity) {
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/opportunities/${encodeURIComponent(opportunity.id)}/convert`, {
        method: 'POST',
        body: JSON.stringify({ priority: 'medium' }),
      })
      setData((current) => {
        if (!current || !result.opportunity) return current
        return {
          ...current,
          opportunities: (current.opportunities || []).map((record) =>
            record.id === result.opportunity.id ? result.opportunity : record,
          ),
        }
      })
      setSelectedOpportunity(result.opportunity)
      notify(result.replayed ? 'The existing linked job was reopened.' : 'Qualified opportunity converted to an internal job. No external commitment was made.')
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function openOpportunityJob(opportunity) {
    if (!opportunity.convertedJobId) return
    const linkedJob = jobs.find((job) => job.id === opportunity.convertedJobId) || {
      id: opportunity.convertedJobId,
      title: opportunity.title,
    }
    sectionRef.current = 'jobs'
    setSection('jobs')
    void openJobWorkspace(linkedJob)
  }

  async function requestMarketFitPolicy(payload) {
    setSubmitting(true)
    setError('')
    try {
      const result = await api('/api/ledger/market-fit/profiles', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setData((current) => (current ? { ...current, marketFit: result.marketFit || current.marketFit } : current))
      notify('Market-fit policy revision retained for approval.')
      return result
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function retainMarketFitAssessment(opportunityId, sourceHash) {
    setSubmitting(true)
    setError('')
    try {
      await api(`/api/ledger/opportunities/${encodeURIComponent(opportunityId)}/market-fit-assessments`, {
        method: 'POST',
        body: JSON.stringify({ entryKey: `fit:${opportunityId}:${String(sourceHash || '').slice(0, 32)}` }),
      })
      const [result, bidDecisionResult] = await Promise.all([
        api('/api/ledger/market-fit?limit=500'),
        api('/api/ledger/bid-decisions?limit=500'),
      ])
      setData((current) => (current ? {
        ...current,
        marketFit: result.marketFit || current.marketFit,
        bidDecisions: bidDecisionResult.bidDecisions || current.bidDecisions,
      } : current))
      notify('Current opportunity fit retained in the ledger.')
      return result
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function requestBidDecisionPolicy(payload) {
    setSubmitting(true)
    setError('')
    try {
      const result = await api('/api/ledger/bid-decisions/policies', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setData((current) => (current ? { ...current, bidDecisions: result.bidDecisions || current.bidDecisions } : current))
      notify('Bid/no-bid policy revision retained for approval.')
      return result
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function requestBidDecision(opportunityId, payload) {
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/opportunities/${encodeURIComponent(opportunityId)}/bid-decisions`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      const register = await api('/api/ledger/bid-decisions?limit=500')
      setData((current) => (current ? { ...current, bidDecisions: register.bidDecisions || current.bidDecisions } : current))
      if (selectedOpportunity?.id === opportunityId) {
        const detail = await api(`/api/ledger/opportunities/${encodeURIComponent(opportunityId)}`)
        setSelectedOpportunity(detail.opportunity)
      }
      notify(result.replayed ? 'The matching pursuit decision was already retained.' : 'Pursuit decision retained for explicit approval.')
      return result
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  function openBidPackageEditor() {
    const preferredOpportunity = selectedOpportunity && !['won', 'lost', 'archived'].includes(selectedOpportunity.stage)
      ? selectedOpportunity.id
      : ''
    setBidPackageDraft({ ...emptyBidPackageDraft(), opportunityId: preferredOpportunity })
    setBidPackageEditor(true)
  }

  async function submitBidPackage(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const result = await api('/api/ledger/bid-packages', {
        method: 'POST',
        body: JSON.stringify({ ...bidPackageDraft, dueAt: toIsoDateTime(bidPackageDraft.dueAt) }),
      })
      setBidPackageEditor(false)
      setBidPackageDraft(emptyBidPackageDraft())
      setSelectedBidPackage(result.bidPackage)
      setData((current) => current ? { ...current, bidPackages: upsertById(current.bidPackages, result.bidPackage) } : current)
      notify(ot('Internal bid package retained. No invitation or message was sent.'))
      await refreshSection('pipeline')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function selectBidPackage(bidPackage) {
    if (!bidPackage) {
      setSelectedBidPackage(null)
      return
    }
    setError('')
    try {
      const result = await api(`/api/ledger/bid-packages/${encodeURIComponent(bidPackage.id)}`)
      setSelectedBidPackage(result.bidPackage)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  function openBidReturn(bidPackage, participant) {
    setBidReturnDraft({
      ...emptyBidReturnDraft(),
      netAmount: participant.status === 'returned' ? String(participant.netAmount || '') : '',
      taxRate: String(participant.taxRate ?? 21),
      receivedAt: participant.receivedAt ? toLocalDateTimeInput(participant.receivedAt).slice(0, 10) : futureDateInput(0),
      validUntil: participant.validUntil ? toLocalDateTimeInput(participant.validUntil).slice(0, 10) : futureDateInput(30),
      durationDays: participant.durationDays === null ? '' : String(participant.durationDays),
      evidenceReference: participant.evidenceReference || '',
      exclusions: (participant.exclusions || []).join('\n'),
      qualifications: (participant.qualifications || []).join('\n'),
    })
    setBidPackageAction({ type: 'return', bidPackage, participant })
  }

  async function submitBidReturn(event) {
    event.preventDefault()
    if (bidPackageAction?.type !== 'return') return
    setSubmitting(true)
    setError('')
    try {
      const { bidPackage, participant } = bidPackageAction
      const result = await api(
        `/api/ledger/bid-packages/${encodeURIComponent(bidPackage.id)}/participants/${encodeURIComponent(participant.id)}/return`,
        {
          method: 'PUT',
          body: JSON.stringify({
            ...bidReturnDraft,
            netAmount: Number(bidReturnDraft.netAmount),
            taxRate: Number(bidReturnDraft.taxRate),
            durationDays: bidReturnDraft.durationDays === '' ? null : Number(bidReturnDraft.durationDays),
            receivedAt: toIsoDateTime(bidReturnDraft.receivedAt),
            validUntil: toIsoDateTime(bidReturnDraft.validUntil),
          }),
        },
      )
      setBidPackageAction(null)
      setBidReturnDraft(emptyBidReturnDraft())
      setSelectedBidPackage(result.bidPackage)
      setData((current) => current ? { ...current, bidPackages: upsertById(current.bidPackages, result.bidPackage) } : current)
      notify(ot('Bid return evidence retained for internal comparison. No bidder was contacted.'))
      await refreshSection('pipeline')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function openBidSelection(bidPackage, participant) {
    setBidSelectionRationale('')
    setBidPackageAction({ type: 'selection', bidPackage, participant })
  }

  async function submitBidSelection(event) {
    event.preventDefault()
    if (bidPackageAction?.type !== 'selection') return
    setSubmitting(true)
    setError('')
    try {
      const { bidPackage, participant } = bidPackageAction
      const result = await api(`/api/ledger/bid-packages/${encodeURIComponent(bidPackage.id)}/selection`, {
        method: 'POST',
        body: JSON.stringify({ participantId: participant.id, rationale: bidSelectionRationale }),
      })
      setBidPackageAction(null)
      setBidSelectionRationale('')
      setSelectedBidPackage(result.bidPackage)
      setData((current) => current ? {
        ...current,
        bidPackages: upsertById(current.bidPackages, result.bidPackage),
        approvals: upsertById(current.approvals, result.approval),
      } : current)
      notify(ot('Preferred-bidder selection added to approvals. No award, order, or message was issued.'))
      await refreshSection('pipeline')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function openAddBidParticipants(bidPackage) {
    setBidAddPartnerIds([])
    setBidPackageAction({ type: 'add_participants', bidPackage })
  }

  async function submitBidParticipants(event) {
    event.preventDefault()
    if (bidPackageAction?.type !== 'add_participants') return
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/bid-packages/${encodeURIComponent(bidPackageAction.bidPackage.id)}/participants`, {
        method: 'POST',
        body: JSON.stringify({ tradePartnerIds: bidAddPartnerIds }),
      })
      setBidPackageAction(null)
      setBidAddPartnerIds([])
      setSelectedBidPackage(result.bidPackage)
      setData((current) => current ? { ...current, bidPackages: upsertById(current.bidPackages, result.bidPackage) } : current)
      notify(result.replayed ? ot('All selected bidders were already retained.') : ot('Bidders added internally. No invitation or message was sent.'))
      await refreshSection('pipeline')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function reviewBidApproval(bidPackage) {
    openApprovals({
      approvalId: bidPackage.approvalId,
      jobId: bidPackage.jobId || null,
      jobTitle: `${bidPackage.packageNumber} ${bidPackage.title}`,
    })
  }

  function openBidCommitment(bidPackage) {
    setBidCommitmentDraft({
      ...emptyBidCommitmentDraft(),
      notes: ot('Prepare the exact selected return for {number} as an internal purchasing commitment.', { number: bidPackage.packageNumber }),
    })
    setBidPackageAction({ type: 'commitment', bidPackage })
  }

  async function submitBidCommitment(event) {
    event.preventDefault()
    if (bidPackageAction?.type !== 'commitment') return
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/bid-packages/${encodeURIComponent(bidPackageAction.bidPackage.id)}/commitment`, {
        method: 'POST',
        body: JSON.stringify(bidCommitmentDraft),
      })
      setBidPackageAction(null)
      setBidCommitmentDraft(emptyBidCommitmentDraft())
      setSelectedBidPackage(result.bidPackage)
      setData((current) => {
        if (!current) return current
        const next = {
          ...current,
          dashboard: result.dashboard || current.dashboard,
          bidPackages: upsertById(current.bidPackages, result.bidPackage),
          approvals: result.approval ? upsertById(current.approvals, result.approval) : current.approvals,
        }
        return result.job ? reconcileJobCollections(next, result.job) : next
      })
      notify(result.replayed
        ? ot('The existing verified purchasing commitment was reopened. No award or order was sent.')
        : ot('Selected bid frozen into purchasing approval. No supplier contact, award, order, or payment occurred.'))
      await refreshSection('pipeline')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function reviewBidCommitment(bidPackage) {
    openApprovals({
      approvalId: bidPackage.commitment?.approvalId,
      jobId: bidPackage.jobId || null,
      jobTitle: ot('{number} purchasing commitment', { number: bidPackage.packageNumber }),
    })
  }

  function openBidOrderPackage(bidPackage) {
    setBidOrderDraft({
      ...emptyBidOrderDraft(),
      recipient: bidPackage.selectedParticipant?.partner?.email || '',
    })
    setBidPackageAction({ type: 'order_package', bidPackage })
  }

  async function submitBidOrderPackage(event) {
    event.preventDefault()
    if (bidPackageAction?.type !== 'order_package') return
    const { bidPackage } = bidPackageAction
    const purchaseOrderId = bidPackage.commitment?.purchaseOrderId
    if (!bidPackage.jobId || !purchaseOrderId || !bidOrderDraft.recipient.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const result = await api(
        `/api/ledger/jobs/${encodeURIComponent(bidPackage.jobId)}/purchase-orders/${encodeURIComponent(purchaseOrderId)}/issue-package`,
        {
          method: 'POST',
          body: JSON.stringify({
            recipient: bidOrderDraft.recipient.trim(),
            channel: bidOrderDraft.channel,
          }),
        },
      )
      setBidPackageAction(null)
      setBidOrderDraft(emptyBidOrderDraft())
      if (result.bidPackage) setSelectedBidPackage(result.bidPackage)
      setData((current) => {
        if (!current) return current
        const next = {
          ...current,
          dashboard: result.dashboard || current.dashboard,
          finance: result.finance || current.finance,
          bidPackages: result.bidPackage ? upsertById(current.bidPackages, result.bidPackage) : current.bidPackages,
          approvals: result.approval ? upsertById(current.approvals, result.approval) : current.approvals,
        }
        return result.job ? reconcileJobCollections(next, result.job) : next
      })
      if (result.job && selectedJobId === result.job.id) setSelectedJob(result.job)
      notify(result.replayed
        ? ot('Purchase-order package {reference} reopened. Its delivery approval and attachments remain retained.', { reference: result.issueReference })
        : ot('Purchase-order package {reference} retained. Transmission still requires approval and a verified provider receipt.', { reference: result.issueReference }))
      await refreshSection('pipeline')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function reviewBidOrderDelivery(bidPackage) {
    openApprovals({
      approvalId: bidPackage.commitment?.issuePackage?.deliveryApprovalId,
      jobId: bidPackage.jobId || null,
      jobTitle: ot('{number} order transmission', { number: bidPackage.packageNumber }),
    })
  }

  function openBidOrderDelivery(bidPackage) {
    setBidOrderDeliveryDraft(emptyBidOrderDeliveryDraft())
    setBidPackageAction({ type: 'order_delivery', bidPackage })
  }

  async function submitBidOrderDelivery(event) {
    event.preventDefault()
    if (bidPackageAction?.type !== 'order_delivery') return
    const communicationId = bidPackageAction.bidPackage.commitment?.issuePackage?.communicationId
    if (!communicationId || !bidOrderDeliveryDraft.integration.trim() || !bidOrderDeliveryDraft.providerMessageId.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/communications/${encodeURIComponent(communicationId)}/delivery-receipt`, {
        method: 'POST',
        body: JSON.stringify({
          integration: bidOrderDeliveryDraft.integration.trim(),
          providerMessageId: bidOrderDeliveryDraft.providerMessageId.trim(),
          sentAt: bidOrderDeliveryDraft.sentAt ? toIsoDateTime(bidOrderDeliveryDraft.sentAt) : null,
        }),
      })
      setBidPackageAction(null)
      setBidOrderDeliveryDraft(emptyBidOrderDeliveryDraft())
      if (result.bidPackage) setSelectedBidPackage(result.bidPackage)
      setData((current) => {
        if (!current) return current
        const next = {
          ...current,
          dashboard: result.dashboard || current.dashboard,
          finance: result.finance || current.finance,
          bidPackages: result.bidPackage ? upsertById(current.bidPackages, result.bidPackage) : current.bidPackages,
        }
        return result.job ? reconcileJobCollections(next, result.job) : next
      })
      if (result.job && selectedJobId === result.job.id) setSelectedJob(result.job)
      notify(ot('Verified provider receipt retained for {reference}. The order is now an external commitment; no payment was initiated.', {
        reference: result.purchaseOrder?.issuePackage?.issueReference || ot('the purchase order'),
      }))
      await refreshSection('pipeline')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function runCycle() {
    setSubmitting(true)
    try {
      const result = await api('/api/ledger/scheduler/run', {
        method: 'POST',
        body: JSON.stringify({ actor: 'owner_scheduler', maxActions: 10 }),
      })
      setData((current) => current ? { ...current, scheduler: result.scheduler || current.scheduler } : current)
      setSubmitting(false)
      if (result.ran) {
        notify(
          `Durable cycle completed with ${result.result?.applied?.length || 0} internal draft action(s) and ${result.result?.blocked?.length || 0} blocked action(s). No external commitment was made.`,
        )
      } else {
        notify(`Durable cycle was not due: ${formatStatus(result.claim?.reason || 'lease retained')}.`)
      }
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function openAutomationControlDialog(suspend, opener) {
    automationControlOpenerRef.current = opener || document.activeElement
    setAutomationControlError('')
    setAutomationControlDialog({ suspend })
  }

  function closeAutomationControlDialog() {
    if (submitting) return
    setAutomationControlDialog(null)
    setAutomationControlError('')
    window.setTimeout(() => automationControlOpenerRef.current?.focus(), 0)
  }

  async function changeAutomationControl(reason) {
    const suspend = automationControlDialog?.suspend === true
    const action = suspend ? 'suspend' : 'resume'
    setSubmitting(true)
    setAutomationControlError('')
    try {
      const result = await api(`/api/operations/control/${action}`, {
        method: 'POST',
        body: JSON.stringify({
          confirmation: suspend ? 'SUSPEND_AUTOMATION' : 'RESUME_AUTOMATION',
          reason,
        }),
      })
      setData((current) => current ? {
        ...current,
        scheduler: result.scheduler || current.scheduler,
        operationsCapabilities: current.operationsCapabilities ? {
          ...current.operationsCapabilities,
          capabilities: {
            ...current.operationsCapabilities.capabilities,
            automation: {
              ...current.operationsCapabilities.capabilities?.automation,
              control: result.control,
            },
          },
        } : current.operationsCapabilities,
      } : current)
      notify(
        suspend
          ? 'Autonomous drafting suspended. Direct operator work, evidence capture, and approvals remain available.'
          : 'Autonomous drafting resumed. External commitments remain approval-gated.',
      )
      setAutomationControlDialog(null)
      window.setTimeout(() => automationControlOpenerRef.current?.focus(), 0)
      return true
    } catch (requestError) {
      setAutomationControlError(requestError.message)
      return false
    } finally {
      setSubmitting(false)
    }
  }

  function toggleCommandSelection(actionId, checked) {
    setSelectedCommandIds((current) => (checked ? [...new Set([...current, actionId])] : current.filter((id) => id !== actionId)))
  }

  async function applySelectedCommands() {
    if (!selectedCommandIds.length) return
    setSubmitting(true)
    try {
      const result = await api('/api/ledger/command-plan', {
        method: 'POST',
        body: JSON.stringify({
          actionIds: selectedCommandIds,
          limit: selectedCommandIds.length,
          jobLimit: 12,
          actor: 'owner_command_plan',
        }),
      })
      setSelectedCommandIds([])
      setData((current) => current ? {
        ...current,
        commandPlan: result.commandPlan || current.commandPlan,
        dashboard: result.dashboard || current.dashboard,
      } : current)
      setSubmitting(false)
      notify(
        `${result.summary?.applied || 0} safe command-plan draft(s) retained; ${result.summary?.skipped || 0} action(s) skipped. External commitments remain zero.`,
      )
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function backup() {
    setSubmitting(true)
    try {
      const result = await api('/api/operations/backup', { method: 'POST', body: JSON.stringify({ actor: 'office_operator' }) })
      notify(
        `Local backup created with ${result.backup.verification.checkedFiles} checksummed file(s), including ${result.backup.evidenceFiles || 0} evidence file(s).`,
      )
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function verifyBackup(backupId) {
    setSubmitting(true)
    try {
      const result = await api('/api/operations/restore/validate', { method: 'POST', body: JSON.stringify({ backupId }) })
      notify(`Backup ${result.verification.backupId} passed ${result.verification.checkedFiles} file checks and the SQLite restore check.`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function persistOrganizationProfile({ announce = true } = {}) {
    setSubmitting(true)
    try {
      const result = await api('/api/ledger/organization', {
        method: 'PUT',
        body: JSON.stringify({
          ...organizationProfileDraft,
          defaultPaymentTermsDays: Number(organizationProfileDraft.defaultPaymentTermsDays),
          defaultQuoteValidityDays: Number(organizationProfileDraft.defaultQuoteValidityDays),
        }),
      })
      setOrganizationProfileDraft(organizationDraft(result.organization))
      setData((current) => current ? { ...current, organization: result.organization } : current)
      if (announce) {
        notify(
          result.organization.readiness.ready
            ? ot('Business identity retained and ready for controlled commercial packages.')
            : ot('Business identity retained. {count} required item(s) remain.', { count: result.organization.readiness.missing.length }),
        )
      }
      return result.organization
    } catch (requestError) {
      setError(ot(requestError.message))
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function publishHaiLocalFeed() {
    setSubmitting(true)
    try {
      const result = await api('/api/integrations/hai/publish', {
        method: 'POST',
        body: JSON.stringify({ limit: 100 }),
      })
      setData((current) => current?.operationsCapabilities ? {
        ...current,
        operationsCapabilities: {
          ...current.operationsCapabilities,
          capabilities: {
            ...current.operationsCapabilities.capabilities,
            haiConnector: {
              ...current.operationsCapabilities.capabilities?.haiConnector,
              publication: result.publication,
            },
          },
        },
      } : current)
      notify(ot('HAI feed published with {count} read-only action(s).', { count: result.publication.itemCount || 0 }))
    } catch (requestError) {
      setError(ot(requestError.message))
    } finally {
      setSubmitting(false)
    }
  }

  async function saveOrganizationProfile(event) {
    event.preventDefault()
    await persistOrganizationProfile()
  }

  async function validateExport(file) {
    if (!file) return
    setSubmitting(true)
    try {
      const snapshot = JSON.parse(await file.text())
      const result = await api('/api/operations/exports/validate', { method: 'POST', body: JSON.stringify({ snapshot }) })
      notify(
        `Export checksum verified: ${result.counts.jobs} jobs and ${result.counts.approvals} approvals. This artifact is for reconciliation, not restore.`,
      )
    } catch (requestError) {
      setError(requestError instanceof SyntaxError ? 'The selected file is not valid JSON.' : requestError.message)
    } finally {
      if (exportInputRef.current) exportInputRef.current.value = ''
      setSubmitting(false)
    }
  }

  async function selectFieldEvidenceJob(jobId) {
    setEvidence({
      ...emptyFieldEvidenceDraft(),
      jobId,
    })
    setFieldPhotoEvidenceSets([])
    if (!jobId) return
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(jobId)}/photo-evidence`)
      setFieldPhotoEvidenceSets(result.photoEvidenceSets || [])
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function uploadEvidence(event) {
    event.preventDefault()
    const file = evidenceInputRef.current?.files?.[0]
    if (!evidence.jobId || !file) {
      setError('Choose a job and an evidence file before recording a field update.')
      return
    }
    if (evidence.photoEvidenceSetId && (
      !file.type.startsWith('image/')
      || !evidence.photoEvidencePhase
      || !evidence.capturedAt
      || evidence.notes.trim().length < 3
    )) {
      setError('Governed evidence requires an image, phase, device capture time, and a caption of at least 3 characters.')
      return
    }
    const draft = {
      id: createFieldEvidenceDraftId(),
      jobId: evidence.jobId,
      notes: evidence.notes,
      riskLevel: evidence.riskLevel,
      photoEvidenceSetId: evidence.photoEvidenceSetId,
      photoEvidencePhase: evidence.photoEvidencePhase,
      capturedAt: evidence.capturedAt,
      file,
      operatorScope: outboxScope,
    }
    setSubmitting(true)
    try {
      if (navigator.onLine === false) {
        await enqueueFieldEvidenceDraft(draft)
        await refreshOutboxState()
        const nextPhase = evidence.photoEvidenceSetId
          ? ['before', 'during', 'after'][['before', 'during', 'after'].indexOf(evidence.photoEvidencePhase) + 1]
          : null
        setEvidence(nextPhase ? {
          ...evidence,
          notes: '',
          photoEvidencePhase: nextPhase,
          capturedAt: toLocalDateTimeInput(new Date()),
        } : emptyFieldEvidenceDraft())
        if (!nextPhase) setFieldPhotoEvidenceSets([])
        evidenceInputRef.current.value = ''
        notify('Field evidence was saved locally and will be recorded when this device reconnects.')
        return
      }
      const result = await recordFieldEvidence(draft)
      const updatedPhotoEvidenceSet = result.ledgerFollowUp?.records?.photoEvidenceSet || null
      if (updatedPhotoEvidenceSet) {
        setFieldPhotoEvidenceSets((current) => upsertById(current, updatedPhotoEvidenceSet))
        setEvidence({
          ...evidence,
          notes: '',
          photoEvidencePhase: updatedPhotoEvidenceSet.missingPhases?.[0] || evidence.photoEvidencePhase,
          capturedAt: toLocalDateTimeInput(new Date()),
        })
      } else {
        setEvidence(emptyFieldEvidenceDraft())
        setFieldPhotoEvidenceSets([])
      }
      evidenceInputRef.current.value = ''
      notify(
        updatedPhotoEvidenceSet
          ? `${formatStatus(result.ledgerFollowUp.records.photoEvidenceCapture.phase)} photo retained. ${updatedPhotoEvidenceSet.complete ? 'The sequence is ready for office review.' : `${formatStatus(updatedPhotoEvidenceSet.missingPhases?.[0] || 'next')} evidence is next.`}`
          : `${result.ledgerDocument?.filename || file.name} was recorded in the operating ledger.`,
      )
      await refresh()
    } catch (requestError) {
      if (shouldQueueFieldMutation(requestError)) {
        try {
          await enqueueFieldEvidenceDraft(draft)
          await refreshOutboxState()
          const nextPhase = evidence.photoEvidenceSetId
            ? ['before', 'during', 'after'][['before', 'during', 'after'].indexOf(evidence.photoEvidencePhase) + 1]
            : null
          setEvidence(nextPhase ? {
            ...evidence,
            notes: '',
            photoEvidencePhase: nextPhase,
            capturedAt: toLocalDateTimeInput(new Date()),
          } : emptyFieldEvidenceDraft())
          if (!nextPhase) setFieldPhotoEvidenceSets([])
          evidenceInputRef.current.value = ''
          notify('Connection interrupted. Field evidence was saved locally for a controlled retry.')
          return
        } catch (outboxError) {
          setError(outboxError.message)
          return
        }
      }
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function recordFieldProgress(event) {
    event.preventDefault()
    const progressPercent = Number(fieldProgress.progressPercent)
    if (
      !fieldProgress.jobId ||
      !Number.isFinite(progressPercent) ||
      progressPercent < 0 ||
      progressPercent > 100 ||
      !fieldProgress.note.trim()
    ) {
      setError('Choose a job, enter a progress value from 0 to 100, and record a field note.')
      return
    }
    const payload = {
      status: fieldProgress.status,
      progressPercent,
      note: fieldProgress.note.trim(),
      source: 'field_dashboard',
    }
    const draft = {
      id: fieldProgress.entryKey,
      type: 'progress',
      jobId: fieldProgress.jobId,
      payload,
      operatorScope: outboxScope,
    }
    setSubmitting(true)
    try {
      if (navigator.onLine === false) {
        await enqueueFieldOperationDraft(draft)
        await refreshOutboxState()
        setFieldProgress(emptyFieldProgress())
        notify('Field progress was saved locally and will be recorded when this operator reconnects.')
        return
      }
      const result = await recordFieldOperation(draft)
      setFieldProgress(emptyFieldProgress())
      notify(
        result.progress?.replayed
          ? 'This field progress update was already retained; no duplicate was created.'
          : 'Field progress was recorded in the operating ledger.',
      )
      await refresh()
    } catch (requestError) {
      if (shouldQueueFieldMutation(requestError)) {
        try {
          await enqueueFieldOperationDraft(draft)
          await refreshOutboxState()
          setFieldProgress(emptyFieldProgress())
          notify('Connection interrupted. Field progress was saved locally for an exact retry.')
          return
        } catch (outboxError) {
          setError(outboxError.message)
          return
        }
      }
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function selectFieldMaterialReceiptJob(jobId) {
    const loadSequence = ++materialReceiptLoadSequenceRef.current
    const shouldLoad = Boolean(jobId) && navigator.onLine !== false
    setMaterialReceiptLoading(shouldLoad)
    setFieldMaterialReceipt({ ...emptyMaterialReceiptDraft(), jobId })
    setFieldMaterialReceiptPlans([])
    if (!shouldLoad) return
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(jobId)}/material-receiving-plan`)
      if (loadSequence !== materialReceiptLoadSequenceRef.current) return
      setFieldMaterialReceiptPlans(result.plans || [])
    } catch (requestError) {
      if (loadSequence === materialReceiptLoadSequenceRef.current) setError(requestError.message)
    } finally {
      if (loadSequence === materialReceiptLoadSequenceRef.current) setMaterialReceiptLoading(false)
    }
  }

  function selectFieldMaterialReceiptPlan(purchaseOrderId) {
    const plan = fieldMaterialReceiptPlans.find(item => item.purchaseOrder?.id === purchaseOrderId)
    if (!plan) {
      setFieldMaterialReceipt((current) => ({
        ...current,
        purchaseOrderId: '',
        lines: [emptyMaterialReceiptLine()],
        finalDelivery: false,
      }))
      return
    }
    const next = emptyMaterialReceiptDraft(plan)
    setFieldMaterialReceipt((current) => ({
      ...current,
      jobId: plan.purchaseOrder.jobId,
      purchaseOrderId,
      finalDelivery: plan.summary?.remainingLines === 1,
      lines: [next.lines[0]],
    }))
  }

  function selectFieldMaterialReceiptLine(lineKey) {
    const line = selectedFieldMaterialReceiptPlan?.lines.find(item => item.lineKey === lineKey)
    if (line) setFieldMaterialReceipt((current) => ({ ...current, lines: [emptyMaterialReceiptLine(line)] }))
  }

  function updateFieldMaterialReceipt(field, value) {
    setFieldMaterialReceipt((current) => ({ ...current, [field]: value }))
  }

  function updateFieldMaterialReceiptLine(field, value) {
    setFieldMaterialReceipt((current) => ({
      ...current,
      lines: [{ ...current.lines[0], [field]: value }],
    }))
  }

  async function recordFieldMaterialReceipt(event) {
    event.preventDefault()
    const line = fieldMaterialReceipt.lines[0]
    const receivedQuantity = Number(line?.receivedQuantity)
    const acceptedQuantity = Number(line?.acceptedQuantity)
    const damagedQuantity = Number(line?.damagedQuantity || 0)
    if (!fieldMaterialReceipt.jobId || fieldMaterialReceipt.receiptReference.trim().length < 3 || fieldMaterialReceipt.evidenceReference.trim().length < 3
      || line?.itemName.trim().length < 2 || !(receivedQuantity > 0) || acceptedQuantity < 0 || damagedQuantity < 0
      || acceptedQuantity + damagedQuantity > receivedQuantity) {
      setError('Choose a job and record a delivery reference, retained evidence, item, and valid received, accepted, and damaged quantities.')
      return
    }
    if (!fieldScoped && fieldMaterialReceipt.receivedBy.trim().length < 2) {
      setError('Record the person who physically received this delivery.')
      return
    }
    const payload = {
      purchaseOrderId: fieldMaterialReceipt.purchaseOrderId || null,
      receiptReference: fieldMaterialReceipt.receiptReference.trim(),
      evidenceReference: fieldMaterialReceipt.evidenceReference.trim(),
      deliveredAt: toIsoDateTime(fieldMaterialReceipt.deliveredAt),
      receivedBy: fieldMaterialReceipt.receivedBy.trim() || undefined,
      location: fieldMaterialReceipt.location.trim() || null,
      finalDelivery: fieldMaterialReceipt.finalDelivery,
      notes: fieldMaterialReceipt.notes.trim() || null,
      lines: [{
        lineKey: line.lineKey || undefined,
        materialRequirementId: line.materialRequirementId || undefined,
        itemName: line.itemName.trim(),
        unit: line.unit.trim() || 'unit',
        receivedQuantity,
        acceptedQuantity,
        damagedQuantity,
        notes: line.notes?.trim() || null,
      }],
    }
    const draft = {
      id: fieldMaterialReceipt.entryKey,
      type: 'material_receipt',
      jobId: fieldMaterialReceipt.jobId,
      payload,
      operatorScope: outboxScope,
    }
    setSubmitting(true)
    setError('')
    try {
      if (navigator.onLine === false) {
        await enqueueFieldOperationDraft(draft)
        await refreshOutboxState()
        setFieldMaterialReceipt(emptyMaterialReceiptDraft())
        setFieldMaterialReceiptPlans([])
        notify('Material delivery was saved locally with its quantities and evidence reference. It will sync after reconnection.')
        return
      }
      const result = await recordFieldOperation(draft)
      setFieldMaterialReceipt(emptyMaterialReceiptDraft())
      setFieldMaterialReceiptPlans([])
      notify(result.replayed ? 'This delivery ticket was already retained; no duplicate receipt was created.' : `Delivery ${result.receipt?.receiptReference || ''} was retained for office review.`)
      await refresh()
    } catch (requestError) {
      if (shouldQueueFieldMutation(requestError)) {
        try {
          await enqueueFieldOperationDraft(draft)
          await refreshOutboxState()
          setFieldMaterialReceipt(emptyMaterialReceiptDraft())
          setFieldMaterialReceiptPlans([])
          notify('Connection interrupted. The complete delivery ticket was saved locally for an exact retry.')
          return
        } catch (outboxError) {
          setError(outboxError.message)
          return
        }
      }
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function updateOrganizationProfile(field, value) {
    setOrganizationProfileDraft((current) => ({ ...current, [field]: value }))
  }

  function updateOrganizationVatExemption(vatExempt) {
    setOrganizationProfileDraft((current) => ({
      ...current,
      vatExempt,
      vatNumber: vatExempt ? '' : current.vatNumber,
    }))
  }

  function openOrganizationOnboarding(event) {
    organizationOnboardingOpenerRef.current = event.currentTarget
    setOrganizationProfileDraft(organizationDraft(data?.organization))
    setShowOrganizationOnboarding(true)
  }

  function closeOrganizationOnboarding() {
    if (submitting) return
    setOrganizationProfileDraft(organizationDraft(data?.organization))
    setShowOrganizationOnboarding(false)
    const opener = organizationOnboardingOpenerRef.current
    organizationOnboardingOpenerRef.current = null
    requestAnimationFrame(() => {
      if (opener?.isConnected && !opener.disabled) opener.focus()
    })
  }

  async function selectFieldExpenseJob(jobId) {
    const loadSequence = ++expenseReceiptLoadSequenceRef.current
    const shouldLoad = Boolean(jobId) && navigator.onLine !== false
    setExpenseReceiptLoading(shouldLoad)
    setFieldExpenseReceipt({ ...emptyFieldExpenseReceiptDraft(), jobId })
    setFieldExpenseReceipts([])
    if (!shouldLoad) return
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(jobId)}/expense-receipts?limit=8`)
      if (loadSequence !== expenseReceiptLoadSequenceRef.current) return
      setFieldExpenseReceipts(result.expenses || [])
    } catch (requestError) {
      if (loadSequence === expenseReceiptLoadSequenceRef.current) setError(requestError.message)
    } finally {
      if (loadSequence === expenseReceiptLoadSequenceRef.current) setExpenseReceiptLoading(false)
    }
  }

  function updateFieldExpenseReceipt(field, value) {
    setFieldExpenseReceipt((current) => ({ ...current, [field]: value }))
  }

  function updateFieldExpenseTaxTreatment(taxTreatment) {
    setFieldExpenseReceipt((current) => ({
      ...current,
      taxTreatment,
      taxAmount: ['exempt', 'reverse_charge'].includes(taxTreatment) ? '0' : current.taxAmount,
    }))
  }

  async function recordFieldExpenseReceipt(event) {
    event.preventDefault()
    const totalAmount = Number(fieldExpenseReceipt.totalAmount)
    const taxAmount = fieldExpenseReceipt.taxAmount === '' ? 0 : Number(fieldExpenseReceipt.taxAmount)
    const zeroTaxTreatment = ['exempt', 'reverse_charge'].includes(fieldExpenseReceipt.taxTreatment)
    if (
      !fieldExpenseReceipt.jobId ||
      !fieldExpenseReceipt.expenseDate ||
      fieldExpenseReceipt.vendor.trim().length < 2 ||
      fieldExpenseReceipt.receiptReference.trim().length < 3 ||
      !(totalAmount > 0) ||
      !Number.isFinite(taxAmount) ||
      taxAmount < 0 ||
      taxAmount > totalAmount ||
      (zeroTaxTreatment && taxAmount !== 0) ||
      fieldExpenseReceipt.costCode.trim().length < 2
    ) {
      setError('Choose a job and retain the date, vendor, receipt reference, positive gross total, valid VAT amount, treatment, and cost code.')
      return
    }
    const jobId = fieldExpenseReceipt.jobId
    const payload = {
      expenseDate: fieldExpenseReceipt.expenseDate,
      category: fieldExpenseReceipt.category,
      vendor: fieldExpenseReceipt.vendor.trim(),
      receiptReference: fieldExpenseReceipt.receiptReference.trim(),
      totalAmount: roundMoney(totalAmount),
      taxAmount: roundMoney(taxAmount),
      taxTreatment: fieldExpenseReceipt.taxTreatment,
      paymentMethod: fieldExpenseReceipt.paymentMethod,
      costCode: fieldExpenseReceipt.costCode.trim(),
      currency: 'EUR',
      notes: fieldExpenseReceipt.notes.trim() || null,
      source: 'field_dashboard',
    }
    const draft = {
      id: fieldExpenseReceipt.entryKey,
      type: 'expense_receipt',
      jobId,
      payload,
      operatorScope: outboxScope,
    }
    setSubmitting(true)
    setError('')
    try {
      if (navigator.onLine === false) {
        await enqueueFieldOperationDraft(draft)
        await refreshOutboxState()
        setFieldExpenseReceipt({ ...emptyFieldExpenseReceiptDraft(), jobId })
        notify('Expense receipt was saved locally with its VAT basis and will sync after reconnection.')
        return
      }
      const result = await recordFieldOperation(draft)
      notify(result.replayed
        ? 'This expense receipt was already retained; no duplicate cost record was created.'
        : `Receipt ${result.expense?.receiptReference || ''} was retained for approver review. No reimbursement or payment was initiated.`)
      await selectFieldExpenseJob(jobId)
      await refresh()
    } catch (requestError) {
      if (shouldQueueFieldMutation(requestError)) {
        try {
          await enqueueFieldOperationDraft(draft)
          await refreshOutboxState()
          setFieldExpenseReceipt({ ...emptyFieldExpenseReceiptDraft(), jobId })
          notify('Connection interrupted. The complete expense receipt was saved locally for an exact retry.')
          return
        } catch (outboxError) {
          setError(outboxError.message)
          return
        }
      }
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function selectFieldEnvironmentalJob(jobId) {
    const loadSequence = ++environmentalLoadSequenceRef.current
    const shouldLoad = Boolean(jobId) && navigator.onLine !== false
    setEnvironmentalLoading(shouldLoad)
    setFieldEnvironmentalActivity({ ...emptyFieldEnvironmentalDraft(), jobId })
    setFieldEnvironmentalActivities([])
    setEnvironmentalRegister(null)
    setEnvironmentalReports([])
    setEnvironmentalReportDraft(emptyEnvironmentalReportDraft())
    if (!shouldLoad) return
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(jobId)}/environmental-activities?limit=20`)
      if (loadSequence !== environmentalLoadSequenceRef.current) return
      setFieldEnvironmentalActivities(result.activities || [])
      setEnvironmentalRegister(result.register || null)
      setEnvironmentalReports(result.reports || [])
      if (result.register?.periodStart && result.register?.periodEnd) {
        setEnvironmentalReportDraft({ periodStart: result.register.periodStart, periodEnd: result.register.periodEnd })
      }
    } catch (requestError) {
      if (loadSequence === environmentalLoadSequenceRef.current) setError(requestError.message)
    } finally {
      if (loadSequence === environmentalLoadSequenceRef.current) setEnvironmentalLoading(false)
    }
  }

  function updateEnvironmentalCategory(category) {
    const defaults = {
      fuel: { unit: 'litre', ghgScope: 'scope_1' },
      electricity: { unit: 'kWh', ghgScope: 'scope_2' },
      district_heat: { unit: 'kWh', ghgScope: 'scope_2' },
      refrigerant: { unit: 'kg', ghgScope: 'scope_1' },
      transport: { unit: 'km', ghgScope: 'scope_3' },
      material: { unit: 'kg', ghgScope: 'scope_3' },
      waste: { unit: 'kg', ghgScope: 'scope_3' },
      water: { unit: 'm3', ghgScope: 'scope_3' },
      accommodation: { unit: 'night', ghgScope: 'scope_3' },
      other: { unit: 'unit', ghgScope: 'unclassified' },
    }
    setFieldEnvironmentalActivity((current) => ({ ...current, category, ...(defaults[category] || defaults.other) }))
  }

  function updateFieldEnvironmentalActivity(field, value) {
    setFieldEnvironmentalActivity((current) => ({ ...current, [field]: value }))
  }

  async function recordFieldEnvironmentalActivity(event) {
    event.preventDefault()
    const quantity = Number(fieldEnvironmentalActivity.quantity)
    const emissionFactor = Number(fieldEnvironmentalActivity.emissionFactor)
    if (
      !fieldEnvironmentalActivity.jobId ||
      !fieldEnvironmentalActivity.activityDate ||
      fieldEnvironmentalActivity.description.trim().length < 3 ||
      !(quantity > 0) ||
      !fieldEnvironmentalActivity.unit.trim() ||
      fieldEnvironmentalActivity.emissionFactor === '' ||
      !Number.isFinite(emissionFactor) ||
      emissionFactor < 0 ||
      fieldEnvironmentalActivity.factorSource.trim().length < 3 ||
      fieldEnvironmentalActivity.factorReference.trim().length < 3 ||
      fieldEnvironmentalActivity.evidenceReference.trim().length < 3
    ) {
      setError('Choose a job and retain the date, activity, positive quantity, unit, emission factor, factor source, and source evidence reference.')
      return
    }
    const jobId = fieldEnvironmentalActivity.jobId
    const payload = {
      activityDate: fieldEnvironmentalActivity.activityDate,
      category: fieldEnvironmentalActivity.category,
      ghgScope: fieldEnvironmentalActivity.ghgScope,
      description: fieldEnvironmentalActivity.description.trim(),
      quantity,
      unit: fieldEnvironmentalActivity.unit.trim(),
      emissionFactor,
      factorSource: fieldEnvironmentalActivity.factorSource.trim(),
      factorReference: fieldEnvironmentalActivity.factorReference.trim(),
      evidenceReference: fieldEnvironmentalActivity.evidenceReference.trim(),
      notes: fieldEnvironmentalActivity.notes.trim() || null,
      source: 'field_dashboard',
    }
    const draft = {
      id: fieldEnvironmentalActivity.entryKey,
      type: 'environmental_activity',
      jobId,
      payload,
      operatorScope: outboxScope,
    }
    setSubmitting(true)
    setError('')
    try {
      if (navigator.onLine === false) {
        await enqueueFieldOperationDraft(draft)
        await refreshOutboxState()
        setFieldEnvironmentalActivity({ ...emptyFieldEnvironmentalDraft(), jobId })
        notify('Environmental activity was saved locally with its source and factor provenance. It will sync after reconnection.')
        return
      }
      const result = await recordFieldOperation(draft)
      notify(result.replayed
        ? 'This environmental activity was already retained; no duplicate reporting source was created.'
        : `${result.activity?.description || 'Environmental activity'} was retained for source review. No certification or external submission was made.`)
      await selectFieldEnvironmentalJob(jobId)
      await refresh()
    } catch (requestError) {
      if (shouldQueueFieldMutation(requestError)) {
        try {
          await enqueueFieldOperationDraft(draft)
          await refreshOutboxState()
          setFieldEnvironmentalActivity({ ...emptyFieldEnvironmentalDraft(), jobId })
          notify('Connection interrupted. The complete environmental record was saved locally for an exact retry.')
          return
        } catch (outboxError) {
          setError(outboxError.message)
          return
        }
      }
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function prepareEnvironmentalReport(event) {
    event.preventDefault()
    const jobId = fieldEnvironmentalActivity.jobId
    if (!jobId || !environmentalReportDraft.periodStart || !environmentalReportDraft.periodEnd) return
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(jobId)}/environmental-reports`, {
        method: 'POST',
        body: JSON.stringify(environmentalReportDraft),
      })
      notify(result.replayed
        ? 'The current environmental report package is already retained.'
        : 'Environmental report package retained for approver review. Nothing was submitted or certified externally.')
      await selectFieldEnvironmentalJob(jobId)
      await refresh()
      if (capabilities.approvals && result.approval?.id) openApprovals({ jobId, approvalId: result.approval.id })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function submitEnvironmentalReversal(event) {
    event.preventDefault()
    if (!environmentalReversal || environmentalReversalReason.trim().length < 8) return
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(environmentalReversal.jobId)}/environmental-activities/${encodeURIComponent(environmentalReversal.id)}/reversal`, {
        method: 'POST',
        body: JSON.stringify({ reason: environmentalReversalReason.trim() }),
      })
      const jobId = environmentalReversal.jobId
      setEnvironmentalReversal(null)
      setEnvironmentalReversalReason('')
      notify('Environmental correction retained for approver review. The original source and historical reports remain available.')
      await selectFieldEnvironmentalJob(jobId)
      await refresh()
      if (capabilities.approvals && result.approval?.id) openApprovals({ jobId, approvalId: result.approval.id })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function selectFieldEquipmentJob(jobId) {
    setFieldEquipmentCheckout({ ...emptyEquipmentCheckoutDraft(), jobId })
    setFieldEquipmentReturn(emptyEquipmentReturnDraft())
    setFieldEquipmentPlans([])
    setFieldEquipmentCustody([])
    if (!jobId || navigator.onLine === false) return
    setError('')
    try {
      const [planResult, custodyResult] = await Promise.all([
        api(`/api/ledger/jobs/${encodeURIComponent(jobId)}/equipment-custody-plan`),
        api(`/api/ledger/jobs/${encodeURIComponent(jobId)}/equipment-custody`),
      ])
      const plans = planResult.plans || []
      const activeCustody = (custodyResult.custody || []).filter(session => session.status === 'checked_out')
      setFieldEquipmentPlans(plans)
      setFieldEquipmentCustody(activeCustody)
      const firstReady = plans.find(plan => plan.checkoutReady)
      if (firstReady) {
        setFieldEquipmentCheckout({
          ...emptyEquipmentCheckoutDraft(firstReady),
          jobId,
          location: firstReady.tool?.currentLocation || '',
        })
      }
      if (activeCustody.length === 1) setFieldEquipmentReturn(emptyEquipmentReturnDraft(activeCustody[0]))
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  function selectFieldEquipmentPlan(reservationId) {
    const plan = fieldEquipmentPlans.find(item => item.reservation?.id === reservationId)
    if (!plan) {
      setFieldEquipmentCheckout({ ...emptyEquipmentCheckoutDraft(), jobId: fieldEquipmentCheckout.jobId })
      return
    }
    setFieldEquipmentCheckout({
      ...emptyEquipmentCheckoutDraft(plan),
      jobId: fieldEquipmentCheckout.jobId,
      location: plan.tool?.currentLocation || '',
    })
  }

  async function recordFieldEquipmentCheckout(event) {
    event.preventDefault()
    const meter = fieldEquipmentCheckout.meter === '' ? null : Number(fieldEquipmentCheckout.meter)
    if (!fieldEquipmentCheckout.jobId || !fieldEquipmentCheckout.reservationId || fieldEquipmentCheckout.evidenceReference.trim().length < 3
      || (!fieldScoped && fieldEquipmentCheckout.checkedOutBy.trim().length < 2)
      || (meter !== null && (!Number.isFinite(meter) || meter < 0))) {
      setError(ot('Choose a checkout-ready reservation and retain the physical custodian, handoff evidence, and a valid meter value.'))
      return
    }
    const jobId = fieldEquipmentCheckout.jobId
    const payload = {
      reservationId: fieldEquipmentCheckout.reservationId,
      checkedOutAt: toIsoDateTime(fieldEquipmentCheckout.checkedOutAt),
      dueBackAt: fieldEquipmentCheckout.dueBackAt ? toIsoDateTime(fieldEquipmentCheckout.dueBackAt) : null,
      ...(fieldScoped ? {} : { checkedOutBy: fieldEquipmentCheckout.checkedOutBy.trim() }),
      condition: fieldEquipmentCheckout.condition,
      location: fieldEquipmentCheckout.location.trim() || null,
      meter,
      evidenceReference: fieldEquipmentCheckout.evidenceReference.trim(),
      notes: fieldEquipmentCheckout.notes.trim() || null,
    }
    const draft = {
      id: fieldEquipmentCheckout.entryKey,
      type: 'equipment_check_out',
      jobId,
      payload,
      operatorScope: outboxScope,
    }
    setSubmitting(true)
    setError('')
    try {
      if (navigator.onLine === false) {
        await enqueueFieldOperationDraft(draft)
        await refreshOutboxState()
        setFieldEquipmentCheckout(emptyEquipmentCheckoutDraft())
        setFieldEquipmentPlans([])
        setFieldEquipmentCustody([])
        notify(ot('Equipment handoff was saved locally with its custody evidence and will sync after reconnection.'))
        return
      }
      const result = await recordFieldOperation(draft)
      notify(result.replayed
        ? ot('This equipment handoff was already retained; no duplicate custody session was created.')
        : ot('{name} custody was retained for {custodian}.', {
            name: result.custody.toolName,
            custodian: result.custody.checkedOutBy,
          }))
      await selectFieldEquipmentJob(jobId)
      await refresh()
    } catch (requestError) {
      if (shouldQueueFieldMutation(requestError)) {
        try {
          await enqueueFieldOperationDraft(draft)
          await refreshOutboxState()
          setFieldEquipmentCheckout(emptyEquipmentCheckoutDraft())
          setFieldEquipmentPlans([])
          setFieldEquipmentCustody([])
          notify(ot('Connection interrupted. The equipment handoff was saved locally for an exact retry.'))
          return
        } catch (outboxError) {
          setError(outboxError.message)
          return
        }
      }
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function recordFieldEquipmentReturn(event) {
    event.preventDefault()
    const meter = fieldEquipmentReturn.meter === '' ? null : Number(fieldEquipmentReturn.meter)
    const exceptional = ['damaged', 'unsafe', 'lost'].includes(fieldEquipmentReturn.condition)
    if (!fieldEquipmentReturn.jobId || !fieldEquipmentReturn.custodySessionId || fieldEquipmentReturn.evidenceReference.trim().length < 3
      || (!fieldScoped && fieldEquipmentReturn.returnedBy.trim().length < 2)
      || (meter !== null && (!Number.isFinite(meter) || meter < 0))
      || (exceptional && fieldEquipmentReturn.notes.trim().length < 8)) {
      setError(ot('Retain the return condition and evidence, a valid meter, and findings for damaged, unsafe, or lost equipment.'))
      return
    }
    const jobId = fieldEquipmentReturn.jobId
    const payload = {
      custodySessionId: fieldEquipmentReturn.custodySessionId,
      returnedAt: toIsoDateTime(fieldEquipmentReturn.returnedAt),
      ...(fieldScoped ? {} : { returnedBy: fieldEquipmentReturn.returnedBy.trim() }),
      condition: fieldEquipmentReturn.condition,
      location: fieldEquipmentReturn.location.trim() || null,
      meter,
      evidenceReference: fieldEquipmentReturn.evidenceReference.trim(),
      notes: fieldEquipmentReturn.notes.trim() || null,
    }
    const draft = {
      id: fieldEquipmentReturn.entryKey,
      type: 'equipment_return',
      jobId,
      payload,
      operatorScope: outboxScope,
    }
    setSubmitting(true)
    setError('')
    try {
      if (navigator.onLine === false) {
        await enqueueFieldOperationDraft(draft)
        await refreshOutboxState()
        setFieldEquipmentReturn(emptyEquipmentReturnDraft())
        setFieldEquipmentCustody([])
        notify(ot('Equipment return was saved locally with its condition evidence and will sync after reconnection.'))
        return
      }
      const result = await recordFieldOperation(draft)
      notify(result.replayed
        ? ot('This equipment return was already retained; no duplicate evidence was created.')
        : exceptional
          ? ot('{name} was quarantined for internal review.', { name: result.custody.toolName })
          : ot('{name} was returned and released for availability.', { name: result.custody.toolName }))
      await selectFieldEquipmentJob(jobId)
      await refresh()
    } catch (requestError) {
      if (shouldQueueFieldMutation(requestError)) {
        try {
          await enqueueFieldOperationDraft(draft)
          await refreshOutboxState()
          setFieldEquipmentReturn(emptyEquipmentReturnDraft())
          setFieldEquipmentCustody([])
          notify(ot('Connection interrupted. The complete equipment return was saved locally for an exact retry.'))
          return
        } catch (outboxError) {
          setError(outboxError.message)
          return
        }
      }
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function submitFieldFiveSAudit({ id, jobId, locationId, payload }) {
    const draft = {
      id,
      type: 'five_s_audit',
      jobId,
      payload: { ...payload, locationId },
      operatorScope: outboxScope,
    }
    if (navigator.onLine === false) {
      await enqueueFieldOperationDraft(draft)
      await refreshOutboxState()
      notify('5S audit saved locally with the exact approved standard revision and will sync after reconnection.')
      return { queued: true }
    }
    try {
      const result = await recordFieldOperation(draft)
      notify(result.replayed
        ? 'This 5S audit was already retained; no duplicate evidence was created.'
        : '5S field condition and corrective actions were retained.')
      return result
    } catch (requestError) {
      if (!shouldQueueFieldMutation(requestError)) throw requestError
      await enqueueFieldOperationDraft(draft)
      await refreshOutboxState()
      notify('Connection interrupted. The complete 5S audit was saved locally for an exact retry.')
      return { queued: true }
    }
  }

  async function recordAttendance(event) {
    event.preventDefault()
    if (!attendanceDraft.jobId) {
      setError('Choose an assigned job before recording site attendance.')
      return
    }
    if (!fieldScoped && !attendanceDraft.workerId) {
      setError('Choose the assigned crew member whose attendance is being recorded.')
      return
    }
    const checkingOut = Boolean(currentAttendanceSession)
    const draft = {
      id: createFieldEvidenceDraftId(),
      type: checkingOut ? 'attendance_check_out' : 'attendance_check_in',
      jobId: attendanceDraft.jobId,
      payload: {
        ...(checkingOut ? { sessionId: currentAttendanceSession.id } : {}),
        ...(fieldScoped ? {} : { workerId: attendanceDraft.workerId }),
        occurredAt: new Date().toISOString(),
        note: attendanceDraft.note.trim() || null,
        accessPoint: attendanceDraft.accessPoint.trim() || null,
        source: 'attendance_control',
      },
      operatorScope: outboxScope,
    }
    setSubmitting(true)
    try {
      if (navigator.onLine === false) {
        await enqueueFieldOperationDraft(draft)
        await refreshOutboxState()
        setAttendanceDraft((current) => ({ ...current, note: '', accessPoint: '' }))
        notify(`${checkingOut ? 'Check-out' : 'Check-in'} was saved locally for an exact retry.`)
        return
      }
      const result = await recordFieldOperation(draft)
      setData((current) => current ? { ...current, attendance: result.attendance || current.attendance } : current)
      setAttendanceDraft((current) => ({ ...current, note: '', accessPoint: '' }))
      notify(
        result.replayed
          ? `This ${checkingOut ? 'check-out' : 'check-in'} was already retained; no duplicate was created.`
          : `${checkingOut ? 'Check-out' : 'Check-in'} retained on the live labor board.`,
      )
      void refresh()
    } catch (requestError) {
      if (shouldQueueFieldMutation(requestError)) {
        try {
          await enqueueFieldOperationDraft(draft)
          await refreshOutboxState()
          setAttendanceDraft((current) => ({ ...current, note: '', accessPoint: '' }))
          notify(`Connection interrupted. ${checkingOut ? 'Check-out' : 'Check-in'} was saved locally for an exact retry.`)
          return
        } catch (outboxError) {
          setError(outboxError.message)
          return
        }
      }
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function retainSafetyMeeting(meeting) {
    if (!meeting?.id) return
    setData((current) => current ? {
      ...current,
      safetyMeetings: [meeting, ...(current.safetyMeetings || []).filter((item) => item.id !== meeting.id)],
    } : current)
  }

  async function selectSafetyBriefingJob(jobId) {
    const loadSequence = ++safetyBriefingLoadSequenceRef.current
    const firstMeeting = safetyMeetings.find((meeting) => (
      meeting.jobId === jobId && ['scheduled', 'in_progress', 'pending_approval'].includes(meeting.status)
    )) || safetyMeetings.find((meeting) => meeting.jobId === jobId) || null
    setSafetyBriefingDraft({
      ...emptySafetyBriefingDraft(),
      jobId,
      meetingId: firstMeeting?.id || '',
    })
    const shouldLoad = Boolean(jobId) && navigator.onLine !== false
    setSafetyBriefingLoading(shouldLoad)
    if (!shouldLoad) return
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(jobId)}/safety-meetings`)
      if (loadSequence !== safetyBriefingLoadSequenceRef.current) return
      const meetings = result.safetyMeetings || []
      const selectedMeeting = meetings.find((meeting) => (
        ['scheduled', 'in_progress', 'pending_approval'].includes(meeting.status)
      )) || meetings[0] || null
      setData((current) => current ? {
        ...current,
        safetyMeetings: [
          ...meetings,
          ...(current.safetyMeetings || []).filter((meeting) => meeting.jobId !== jobId),
        ],
      } : current)
      setSafetyBriefingDraft((current) => (
        current.jobId === jobId ? { ...current, meetingId: selectedMeeting?.id || '' } : current
      ))
    } catch (requestError) {
      if (loadSequence === safetyBriefingLoadSequenceRef.current) setError(requestError.message)
    } finally {
      if (loadSequence === safetyBriefingLoadSequenceRef.current) setSafetyBriefingLoading(false)
    }
  }

  function updateSafetyBriefingDraft(field, value) {
    setSafetyBriefingDraft((current) => ({ ...current, [field]: value }))
  }

  async function createSafetyBriefing(event) {
    event.preventDefault()
    const topics = safetyBriefingDraft.topics.split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean)
    if (!canCoordinate || !safetyBriefingDraft.jobId || safetyBriefingDraft.title.trim().length < 2 || !topics.length) {
      setError('Choose a job and retain a briefing title plus at least one discussion topic.')
      return
    }
    if (navigator.onLine === false) {
      setError('Reconnect before scheduling a briefing so the assigned crew list can be frozen from the ledger.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(safetyBriefingDraft.jobId)}/safety-meetings`, {
        method: 'POST',
        body: JSON.stringify({
          entryKey: safetyBriefingDraft.entryKey,
          title: safetyBriefingDraft.title.trim(),
          scheduledAt: toIsoDateTime(safetyBriefingDraft.scheduledAt),
          topics,
          status: 'scheduled',
          source: 'field_dashboard',
        }),
      })
      retainSafetyMeeting(result.safetyMeeting)
      setSafetyBriefingDraft({
        ...emptySafetyBriefingDraft(),
        jobId: safetyBriefingDraft.jobId,
        meetingId: result.safetyMeeting.id,
      })
      notify(result.safetyMeeting.replayed
        ? 'This briefing was already retained; no duplicate session was scheduled.'
        : 'Safety briefing scheduled with the current assigned crew as expected attendees.')
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function acknowledgeSafetyBriefing(event) {
    event.preventDefault()
    if (!fieldScoped || !selectedSafetyMeeting || !safetyBriefingDraft.acknowledged || safetyBriefingDraft.evidenceReference.trim().length < 3) {
      setError('Select an assigned briefing, confirm the attestation, and retain an evidence reference.')
      return
    }
    const jobId = selectedSafetyMeeting.jobId
    const meetingId = selectedSafetyMeeting.id
    const draft = {
      id: safetyBriefingDraft.entryKey,
      type: 'safety_briefing_acknowledgement',
      jobId,
      payload: {
        meetingId,
        briefingContentHash: selectedSafetyMeeting.briefingContentHash,
        acknowledged: true,
        acknowledgedAt: new Date().toISOString(),
        evidenceReference: safetyBriefingDraft.evidenceReference.trim(),
        attestation: 'I attended this briefing, understood the retained topics, and will stop work if conditions or controls change.',
      },
      operatorScope: outboxScope,
    }
    setSubmitting(true)
    setError('')
    try {
      if (navigator.onLine === false) {
        await enqueueFieldOperationDraft(draft)
        await refreshOutboxState()
        setSafetyBriefingDraft((current) => ({ ...current, entryKey: createFieldEvidenceDraftId(), evidenceReference: '', acknowledged: false }))
        notify('Safety briefing acknowledgement was saved locally for an exact worker-scoped retry.')
        return
      }
      const result = await recordFieldOperation(draft)
      retainSafetyMeeting(result.safetyMeeting)
      setSafetyBriefingDraft((current) => ({ ...current, entryKey: createFieldEvidenceDraftId(), evidenceReference: '', acknowledged: false }))
      notify(result.replayed
        ? 'This acknowledgement was already retained; no duplicate attendance evidence was created.'
        : 'Your safety briefing acknowledgement was retained for facilitator signoff.')
      await refresh()
    } catch (requestError) {
      if (shouldQueueFieldMutation(requestError)) {
        try {
          await enqueueFieldOperationDraft(draft)
          await refreshOutboxState()
          setSafetyBriefingDraft((current) => ({ ...current, entryKey: createFieldEvidenceDraftId(), evidenceReference: '', acknowledged: false }))
          notify('Connection interrupted. The acknowledgement was saved locally for an exact retry.')
          return
        } catch (outboxError) {
          setError(outboxError.message)
          return
        }
      }
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function signOffSafetyBriefing(event) {
    event.preventDefault()
    if (!canCoordinate || !selectedSafetyMeeting || safetyBriefingDraft.completionEvidence.trim().length < 3) return
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedSafetyMeeting.jobId)}/safety-meetings/${encodeURIComponent(selectedSafetyMeeting.id)}/signoff`, {
        method: 'POST',
        body: JSON.stringify({ evidenceReference: safetyBriefingDraft.completionEvidence.trim(), status: 'completed' }),
      })
      retainSafetyMeeting(result.safetyMeeting)
      if (result.approval?.id) {
        setData((current) => current ? {
          ...current,
          approvals: upsertById(current.approvals, result.approval),
        } : current)
      }
      setSafetyBriefingDraft((current) => ({ ...current, completionEvidence: '' }))
      notify(result.replayed ? 'The briefing signoff request is already pending.' : 'Briefing evidence was frozen and sent to the approval queue.')
      if (capabilities.approvals && result.approval?.id) {
        openApprovals({ jobId: selectedSafetyMeeting.jobId, jobTitle: selectedSafetyMeeting.jobTitle, approvalId: result.approval.id })
      }
      void refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function excuseSafetyBriefingAttendee(attendee) {
    if (!canCoordinate || !selectedSafetyMeeting || !attendee?.id || safetyBriefingDraft.excusalReason.trim().length < 8) return
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedSafetyMeeting.jobId)}/safety-meetings/${encodeURIComponent(selectedSafetyMeeting.id)}/attendees/${encodeURIComponent(attendee.id)}/excuse`, {
        method: 'POST',
        body: JSON.stringify({ reason: safetyBriefingDraft.excusalReason.trim() }),
      })
      retainSafetyMeeting(result.safetyMeeting)
      setSafetyBriefingDraft((current) => ({ ...current, excusalReason: '' }))
      notify(`${attendee.attendeeName} was explicitly excused with the retained reason.`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function retainWorkPermit(permit) {
    if (!permit?.id) return
    setData((current) => current ? {
      ...current,
      workPermits: [permit, ...(current.workPermits || []).filter((item) => item.id !== permit.id)],
    } : current)
  }

  async function selectWorkPermitJob(jobId) {
    const loadSequence = ++workPermitLoadSequenceRef.current
    const firstPermit = workPermits.find((permit) => (
      permit.jobId === jobId && ['active', 'pending_approval', 'suspended'].includes(permit.status)
    )) || workPermits.find((permit) => permit.jobId === jobId) || null
    setWorkPermitDraft({
      ...emptyWorkPermitDraft(),
      jobId,
      permitId: firstPermit?.id || '',
    })
    const shouldLoad = Boolean(jobId) && navigator.onLine !== false
    setWorkPermitLoading(shouldLoad)
    if (!shouldLoad) return
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(jobId)}/work-permits`)
      if (loadSequence !== workPermitLoadSequenceRef.current) return
      const permits = result.workPermits || []
      const selectedPermit = permits.find((permit) => (
        ['active', 'pending_approval', 'suspended'].includes(permit.status)
      )) || permits[0] || null
      setData((current) => current ? {
        ...current,
        workPermits: [
          ...permits,
          ...(current.workPermits || []).filter((permit) => permit.jobId !== jobId),
        ],
      } : current)
      setWorkPermitDraft((current) => (
        current.jobId === jobId ? { ...current, permitId: selectedPermit?.id || '' } : current
      ))
    } catch (requestError) {
      if (loadSequence === workPermitLoadSequenceRef.current) setError(ot(requestError.message))
    } finally {
      if (loadSequence === workPermitLoadSequenceRef.current) setWorkPermitLoading(false)
    }
  }

  function updateWorkPermitDraft(field, value) {
    setWorkPermitDraft((current) => ({ ...current, [field]: value }))
  }

  async function createWorkPermit(event) {
    event.preventDefault()
    const hazards = workPermitDraft.hazards.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)
    const controls = workPermitDraft.controls.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)
    const conditions = workPermitDraft.conditions.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)
    if (
      !canCoordinate
      || !workPermitDraft.jobId
      || workPermitDraft.title.trim().length < 3
      || !hazards.length
      || !controls.length
      || workPermitDraft.sourceEvidence.trim().length < 3
    ) {
      setError(ot('Choose a job and retain the permit title, hazards, controls, validity, and source evidence.'))
      return
    }
    if (navigator.onLine === false) {
      setError(ot('Reconnect before requesting a permit so the current assigned crew and approval snapshot can be frozen from the ledger.'))
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(workPermitDraft.jobId)}/work-permits`, {
        method: 'POST',
        body: JSON.stringify({
          entryKey: workPermitDraft.entryKey,
          permitType: workPermitDraft.permitType,
          title: workPermitDraft.title.trim(),
          location: workPermitDraft.location.trim(),
          validFrom: toIsoDateTime(workPermitDraft.validFrom),
          expiresAt: toIsoDateTime(workPermitDraft.expiresAt),
          hazards,
          controls,
          conditions,
          evidenceReference: workPermitDraft.sourceEvidence.trim(),
          source: 'field_dashboard',
        }),
      })
      retainWorkPermit(result.workPermit)
      setWorkPermitDraft({
        ...emptyWorkPermitDraft(),
        jobId: workPermitDraft.jobId,
        permitId: result.workPermit.id,
      })
      notify(ot(result.replayed
        ? 'This permit request was already retained; no duplicate approval was created.'
        : 'Permit definition and assigned crew were frozen for approval.'))
      await refresh()
      if (capabilities.approvals && result.approval?.id) {
        openApprovals({ jobId: result.workPermit.jobId, jobTitle: result.workPermit.jobTitle, approvalId: result.approval.id })
      }
    } catch (requestError) {
      setError(ot(requestError.message))
    } finally {
      setSubmitting(false)
    }
  }

  async function acknowledgeWorkPermit(event) {
    event.preventDefault()
    if (!fieldScoped || !selectedWorkPermit || !workPermitDraft.acknowledged || workPermitDraft.acknowledgementEvidence.trim().length < 3) {
      setError(ot('Select an active assigned permit, confirm the attestation, and retain an evidence reference.'))
      return
    }
    const draft = {
      id: workPermitDraft.entryKey,
      type: 'work_permit_acknowledgement',
      jobId: selectedWorkPermit.jobId,
      payload: {
        permitId: selectedWorkPermit.id,
        acknowledged: true,
        acknowledgedAt: new Date().toISOString(),
        evidenceReference: workPermitDraft.acknowledgementEvidence.trim(),
        attestation: 'I reviewed this permit, understand the retained hazards and controls, and will stop work if conditions change.',
      },
      operatorScope: outboxScope,
    }
    setSubmitting(true)
    setError('')
    try {
      if (navigator.onLine === false) {
        await enqueueFieldOperationDraft(draft)
        await refreshOutboxState()
        setWorkPermitDraft((current) => ({ ...current, entryKey: createFieldEvidenceDraftId(), acknowledgementEvidence: '', acknowledged: false }))
        notify(ot('Permit acknowledgement was saved locally for an exact worker-scoped retry. Stop work until the live ledger confirms readiness.'))
        return
      }
      const result = await recordFieldOperation(draft)
      retainWorkPermit(result.workPermit)
      setWorkPermitDraft((current) => ({ ...current, entryKey: createFieldEvidenceDraftId(), acknowledgementEvidence: '', acknowledged: false }))
      notify(ot(result.replayed
        ? 'This permit acknowledgement was already retained; no duplicate evidence was created.'
        : result.workPermit.readyForWork
          ? 'Your acknowledgement was retained and this permit is ready for the assigned work.'
          : 'Your acknowledgement was retained. Other permit blockers remain.'))
      await refresh()
    } catch (requestError) {
      if (shouldQueueFieldMutation(requestError)) {
        try {
          await enqueueFieldOperationDraft(draft)
          await refreshOutboxState()
          setWorkPermitDraft((current) => ({ ...current, entryKey: createFieldEvidenceDraftId(), acknowledgementEvidence: '', acknowledged: false }))
          notify(ot('Connection interrupted. The permit acknowledgement was saved locally for an exact retry. Stop work until the live ledger confirms readiness.'))
          return
        } catch (outboxError) {
          setError(ot(outboxError.message))
          return
        }
      }
      setError(ot(requestError.message))
    } finally {
      setSubmitting(false)
    }
  }

  async function suspendWorkPermit(event) {
    event.preventDefault()
    if (!canCoordinate || !selectedWorkPermit || workPermitDraft.suspensionReason.trim().length < 8 || workPermitDraft.suspensionEvidence.trim().length < 3) {
      setError(ot('Retain a specific suspension reason and evidence reference before stopping this permit.'))
      return
    }
    if (navigator.onLine === false) {
      setError(ot('The permit cannot be synchronized while offline. Stop work on site now and reconnect to retain the suspension.'))
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedWorkPermit.jobId)}/work-permits/${encodeURIComponent(selectedWorkPermit.id)}/suspend`, {
        method: 'POST',
        body: JSON.stringify({
          entryKey: createFieldEvidenceDraftId(),
          reason: workPermitDraft.suspensionReason.trim(),
          evidenceReference: workPermitDraft.suspensionEvidence.trim(),
        }),
      })
      retainWorkPermit(result.permit)
      setWorkPermitDraft((current) => ({ ...current, suspensionReason: '', suspensionEvidence: '' }))
      notify(ot(result.replayed ? 'This stop-work suspension was already retained.' : 'Permit suspended. Work must remain stopped until a new approved permit is issued.'))
      await refresh()
    } catch (requestError) {
      setError(ot(requestError.message))
    } finally {
      setSubmitting(false)
    }
  }

  async function closeWorkPermit(event) {
    event.preventDefault()
    if (!canCoordinate || !selectedWorkPermit || workPermitDraft.closureNote.trim().length < 8 || workPermitDraft.closureEvidence.trim().length < 3) {
      setError(ot('Retain a completion note and closeout evidence reference before closing this permit.'))
      return
    }
    if (navigator.onLine === false) {
      setError(ot('Reconnect before closing the permit so closeout evidence is retained in the ledger.'))
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedWorkPermit.jobId)}/work-permits/${encodeURIComponent(selectedWorkPermit.id)}/close`, {
        method: 'POST',
        body: JSON.stringify({
          entryKey: createFieldEvidenceDraftId(),
          note: workPermitDraft.closureNote.trim(),
          evidenceReference: workPermitDraft.closureEvidence.trim(),
        }),
      })
      retainWorkPermit(result.permit)
      setWorkPermitDraft((current) => ({ ...current, closureNote: '', closureEvidence: '' }))
      notify(ot(result.replayed ? 'This permit closure was already retained.' : 'Permit closed with retained closeout evidence.'))
      await refresh()
    } catch (requestError) {
      setError(ot(requestError.message))
    } finally {
      setSubmitting(false)
    }
  }

  async function selectDailyCycleJob(jobId) {
    const loadSequence = ++dailyCycleLoadSequenceRef.current
    const shouldLoad = Boolean(jobId) && navigator.onLine !== false
    setDailyCycleLoading(shouldLoad)
    const workerIds = fieldScoped && operator.worker?.id ? [operator.worker.id] : []
    setDailyHuddle({
      ...emptyDailyHuddle(),
      jobId,
      facilitator: fieldScoped ? operator.worker?.name || '' : '',
      leadWorkerId: workerIds[0] || '',
      workerIds,
    })
    setFieldDailyLog({ ...emptyFieldDailyLog(), jobId })
    setFieldDailyCycles([])
    if (!shouldLoad) return
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(jobId)}/daily-cycles?limit=30`)
      if (loadSequence !== dailyCycleLoadSequenceRef.current) return
      const cycles = result.cycles || []
      const openCycle = cycles.find(cycle => ['released', 'blocked'].includes(cycle.status)) || null
      setFieldDailyCycles(cycles)
      if (openCycle) {
        setFieldDailyLog({
          ...emptyFieldDailyLog(),
          jobId,
          cycleId: openCycle.id,
          workDate: openCycle.workDate,
          weather: openCycle.weather || 'clear',
        })
      }
    } catch (requestError) {
      if (loadSequence === dailyCycleLoadSequenceRef.current) setError(requestError.message)
    } finally {
      if (loadSequence === dailyCycleLoadSequenceRef.current) setDailyCycleLoading(false)
    }
  }

  function updateDailyHuddle(field, value) {
    setDailyHuddle((current) => ({ ...current, [field]: value }))
  }

  function toggleDailyHuddleWorker(workerId, checked) {
    setDailyHuddle((current) => {
      const workerIds = checked
        ? [...new Set([...current.workerIds, workerId])]
        : current.workerIds.filter(id => id !== workerId)
      return {
        ...current,
        workerIds,
        leadWorkerId: workerIds.includes(current.leadWorkerId) ? current.leadWorkerId : workerIds[0] || '',
      }
    })
  }

  async function recordDailyStartHuddle(event) {
    event.preventDefault()
    if (
      !dailyHuddle.jobId || !dailyHuddle.workDate || dailyHuddle.plannedWork.trim().length < 8
      || dailyHuddle.productionTarget.trim().length < 3 || dailyHuddle.safetyFocus.trim().length < 5
      || dailyHuddle.evidenceReference.trim().length < 3
    ) {
      setError(ot('Choose a job and date, then retain the work plan, production target, safety focus, and huddle evidence reference.'))
      return
    }
    if (!fieldScoped && (dailyHuddle.facilitator.trim().length < 2 || !dailyHuddle.workerIds.length || !dailyHuddle.leadWorkerId)) {
      setError(ot('Record the facilitator, crew, and daily lead before retaining the start huddle.'))
      return
    }
    if (dailyHuddle.stopWorkRequired && !dailyHuddle.blockingIssues.trim()) {
      setError(ot('Record at least one blocking issue before setting the stop-work state.'))
      return
    }
    const payload = {
      workDate: dailyHuddle.workDate,
      shiftLabel: dailyHuddle.shiftLabel,
      facilitator: dailyHuddle.facilitator.trim() || undefined,
      leadWorkerId: dailyHuddle.leadWorkerId || undefined,
      workerIds: dailyHuddle.workerIds,
      plannedWork: dailyHuddle.plannedWork.trim(),
      productionTarget: dailyHuddle.productionTarget.trim(),
      weather: dailyHuddle.weather,
      siteConditions: dailyHuddle.siteConditions.trim(),
      safetyFocus: dailyHuddle.safetyFocus.trim(),
      qualityHoldPoints: dailyHuddle.qualityHoldPoints,
      constraints: dailyHuddle.constraints,
      blockingIssues: dailyHuddle.blockingIssues,
      stopWorkRequired: dailyHuddle.stopWorkRequired,
      evidenceReference: dailyHuddle.evidenceReference.trim(),
    }
    const draft = {
      id: dailyHuddle.entryKey,
      type: 'daily_huddle',
      jobId: dailyHuddle.jobId,
      payload,
      operatorScope: outboxScope,
    }
    setSubmitting(true)
    setError('')
    try {
      if (navigator.onLine === false) {
        await enqueueFieldOperationDraft(draft)
        await refreshOutboxState()
        setDailyHuddle(emptyDailyHuddle())
        notify(ot('Start huddle was saved locally with its frozen crew, plan, safety focus, and stop-work state. It will sync after reconnection.'))
        return
      }
      const result = await recordFieldOperation(draft)
      const cycle = result.cycle
      setFieldDailyCycles((current) => upsertById(current, cycle))
      setDailyHuddle({ ...emptyDailyHuddle(), jobId: dailyHuddle.jobId })
      setFieldDailyLog({
        ...emptyFieldDailyLog(),
        jobId: cycle.jobId,
        cycleId: cycle.id,
        workDate: cycle.workDate,
        weather: cycle.weather || 'clear',
      })
      notify(
        result.replayed
          ? ot('This start huddle was already retained; the existing daily cycle was returned.')
          : cycle.status === 'blocked'
            ? cycle.blockingIssues.length === 1
              ? ot('Start huddle retained with {count} blocking issue. Work is not released by this record.', { count: cycle.blockingIssues.length })
              : ot('Start huddle retained with {count} blocking issues. Work is not released by this record.', { count: cycle.blockingIssues.length })
            : ot('Start huddle retained with frozen crew, plan, safety focus, and hold points. This record does not replace a permit or safety clearance.'),
      )
      await refresh()
    } catch (requestError) {
      if (shouldQueueFieldMutation(requestError)) {
        try {
          await enqueueFieldOperationDraft(draft)
          await refreshOutboxState()
          setDailyHuddle(emptyDailyHuddle())
          notify(ot('Connection interrupted. The complete start huddle was saved locally for an exact retry.'))
          return
        } catch (outboxError) {
          setError(outboxError.message)
          return
        }
      }
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function recordFieldDailyLog(event) {
    event.preventDefault()
    const hours = Number(fieldDailyLog.hours)
    const manpower = Number(fieldDailyLog.manpower)
    if (
      !fieldDailyLog.jobId ||
      !fieldDailyLog.cycleId ||
      !fieldDailyLog.workDate ||
      !(hours > 0 && hours <= 24) ||
      !(manpower > 0 && manpower <= 500) ||
      !fieldDailyLog.workCompleted.trim()
    ) {
      setError(ot('Choose an open daily cycle, record positive hours and manpower, and describe the completed work.'))
      return
    }
    if (!fieldScoped && !fieldDailyLog.workerId) {
      setError(ot('Select the crew member whose time is being recorded.'))
      return
    }
    if (fieldDailyLog.safetyConcern && fieldDailyLog.safetyNotes.trim().length < 5) {
      setError(ot('Describe the safety concern before submitting the daily site log.'))
      return
    }
    if (!fieldDailyLog.planAchieved && !fieldDailyLog.varianceReasons.trim()) {
      setError(ot('Record at least one reason when the daily production target was not achieved.'))
      return
    }
    if (fieldDailyLog.tomorrowPlan.trim().length < 3 || fieldDailyLog.evidenceReferences.trim().length < 3) {
      setError(ot('Record tomorrow\'s plan and at least one retained EOD evidence reference.'))
      return
    }
    const payload = {
      cycleId: fieldDailyLog.cycleId,
      workerId: fieldScoped ? undefined : fieldDailyLog.workerId,
      workDate: fieldDailyLog.workDate,
      hours,
      manpower,
      weather: fieldDailyLog.weather,
      workCompleted: fieldDailyLog.workCompleted.trim(),
      blockers: fieldDailyLog.blockers,
      planAchieved: fieldDailyLog.planAchieved,
      varianceReasons: fieldDailyLog.varianceReasons,
      unresolvedActions: fieldDailyLog.unresolvedActions,
      tomorrowPlan: fieldDailyLog.tomorrowPlan.trim(),
      evidenceReferences: fieldDailyLog.evidenceReferences,
      safetyConcern: fieldDailyLog.safetyConcern,
      safetyRiskLevel: fieldDailyLog.safetyRiskLevel,
      safetyNotes: fieldDailyLog.safetyNotes.trim(),
      source: 'field_dashboard',
    }
    const draft = {
      id: fieldDailyLog.entryKey,
      type: 'daily_cycle_close',
      jobId: fieldDailyLog.jobId,
      payload,
      operatorScope: outboxScope,
    }
    setSubmitting(true)
    try {
      if (navigator.onLine === false) {
        await enqueueFieldOperationDraft(draft)
        await refreshOutboxState()
        setFieldDailyLog(emptyFieldDailyLog())
        notify(ot('End-of-day report was saved locally with its time, safety, variance, and handoff evidence. It will sync after reconnection.'))
        return
      }
      const result = await recordFieldOperation(draft)
      const approvalCount = Array.isArray(result.dailyLog?.approvals)
        ? result.dailyLog.approvals.length
        : Number(result.dailyLog?.approvals || 0)
      setFieldDailyCycles((current) => upsertById(current, result.cycle))
      setFieldDailyLog({ ...emptyFieldDailyLog(), jobId: fieldDailyLog.jobId })
      notify(
        result.replayed || result.dailyLog?.replayed
          ? ot('This end-of-day report was already retained; the existing daily cycle was returned without duplication.')
          : approvalCount === 1
            ? ot('End-of-day report retained with plan variance, time card, safety state, and tomorrow handoff. {count} review added to the ledger.', { count: approvalCount })
            : ot('End-of-day report retained with plan variance, time card, safety state, and tomorrow handoff. {count} reviews added to the ledger.', { count: approvalCount }),
      )
      await refresh()
    } catch (requestError) {
      if (shouldQueueFieldMutation(requestError)) {
        try {
          await enqueueFieldOperationDraft(draft)
          await refreshOutboxState()
          setFieldDailyLog(emptyFieldDailyLog())
          notify(ot('Connection interrupted. The complete end-of-day report was saved locally for an exact retry.'))
          return
        } catch (outboxError) {
          setError(outboxError.message)
          return
        }
      }
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function requestProductionBaseline(payload) {
    if (!selectedJobId || !Array.isArray(payload?.lines) || !payload.lines.length) {
      setError(ot('Add at least one measured production line before requesting baseline approval.'))
      return false
    }
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/production-baselines`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      if (result.job) setSelectedJob(result.job)
      notify(
        result.replayed
          ? ot('Production baseline v{version} is already retained.', { version: result.baseline?.versionNumber || '' })
          : ot('Production baseline v{version} retained for approval. No field output, schedule, budget, or external commitment was created.', { version: result.baseline?.versionNumber || '' }),
      )
      await refreshSection(sectionRef.current)
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    } finally {
      setSubmitting(false)
    }
  }

  async function recordProductionOutput(payload) {
    if (!selectedJobId || !payload?.entryKey) return false
    const draft = {
      id: payload.entryKey,
      type: 'production_entry',
      jobId: selectedJobId,
      payload: {
        baselineId: payload.baselineId,
        lineKey: payload.lineKey,
        workDate: payload.workDate,
        quantity: payload.quantity,
        crewHours: payload.crewHours,
        note: payload.note,
        source: payload.source || 'job_workspace',
      },
      operatorScope: outboxScope,
    }
    setSubmitting(true)
    setError('')
    try {
      if (navigator.onLine === false) {
        await enqueueFieldOperationDraft(draft)
        await refreshOutboxState()
        notify(ot('Production output was saved locally and will be recorded for this operator after reconnection.'))
        return true
      }
      const result = await recordFieldOperation(draft)
      if (result.job) setSelectedJob(result.job)
      notify(
        result.replayed || result.entry?.replayed
          ? ot('This production output was already retained; no duplicate was created.')
          : ot('Installed quantity and crew hours were recorded against the approved production baseline.'),
      )
      await refreshSection(sectionRef.current)
      return true
    } catch (requestError) {
      if (shouldQueueFieldMutation(requestError)) {
        try {
          await enqueueFieldOperationDraft(draft)
          await refreshOutboxState()
          notify(ot('Connection interrupted. Production output was saved locally for an exact retry.'))
          return true
        } catch (outboxError) {
          setError(outboxError.message)
          return false
        }
      }
      setError(requestError.message)
      return false
    } finally {
      setSubmitting(false)
    }
  }

  async function recordDayworkTicket(payload) {
    if (!selectedJobId || !payload?.entryKey) return false
    const draft = {
      id: payload.entryKey,
      type: 'daywork_ticket',
      jobId: selectedJobId,
      payload,
      operatorScope: outboxScope,
    }
    setSubmitting(true)
    setError('')
    try {
      if (navigator.onLine === false) {
        await enqueueFieldOperationDraft(draft)
        await refreshOutboxState()
        notify(ot('Daywork quantities were saved locally and will be submitted for review after reconnection.'))
        return true
      }
      const result = await recordFieldOperation(draft)
      if (result.job) setSelectedJob(result.job)
      notify(
        result.replayed
          ? ot('This daywork ticket was already retained; no duplicate was created.')
          : ot('{ticket} retained for quantity and evidence review. No price or external commitment was created.', { ticket: result.dayworkTicket?.ticketNumber || ot('Daywork ticket') }),
      )
      await refreshSection(sectionRef.current)
      return true
    } catch (requestError) {
      if (shouldQueueFieldMutation(requestError)) {
        try {
          await enqueueFieldOperationDraft(draft)
          await refreshOutboxState()
          notify(ot('Connection interrupted. Daywork quantities were saved locally for an exact retry.'))
          return true
        } catch (outboxError) {
          setError(outboxError.message)
          return false
        }
      }
      setError(requestError.message)
      return false
    } finally {
      setSubmitting(false)
    }
  }

  async function requestDayworkAcknowledgement(ticketId, payload) {
    if (!selectedJobId || !ticketId) return false
    setSubmitting(true)
    setError('')
    try {
      const result = await api(
        `/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/daywork-tickets/${encodeURIComponent(ticketId)}/acknowledgement`,
        { method: 'POST', body: JSON.stringify(payload) },
      )
      if (result.job) setSelectedJob(result.job)
      notify(
        result.replayed
          ? ot('This acknowledgement review is already pending.')
          : ot('Acknowledgement evidence was retained for review. It confirms receipt only and does not accept price or scope.'),
      )
      await refreshSection(sectionRef.current)
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    } finally {
      setSubmitting(false)
    }
  }

  async function convertDayworkTicket(ticketId, payload) {
    if (!selectedJobId || !ticketId) return false
    setSubmitting(true)
    setError('')
    try {
      const result = await api(
        `/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/daywork-tickets/${encodeURIComponent(ticketId)}/convert`,
        { method: 'POST', body: JSON.stringify(payload) },
      )
      if (result.job) setSelectedJob(result.job)
      notify(
        result.replayed
          ? ot('This daywork ticket is already linked to its retained change order.')
          : ot('A source-bound change order was prepared for approval. Contract value and external commitments remain unchanged.'),
      )
      await refreshSection(sectionRef.current)
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    } finally {
      setSubmitting(false)
    }
  }

  async function requestProductionReversal(entryId, reason) {
    if (!selectedJobId || !entryId || reason.length < 5) return false
    setSubmitting(true)
    setError('')
    try {
      const result = await api(
        `/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/production-entries/${encodeURIComponent(entryId)}/reversal`,
        { method: 'POST', body: JSON.stringify({ reason }) },
      )
      if (result.job) setSelectedJob(result.job)
      notify(
        result.replayed
          ? ot('The production reversal is already retained.')
          : ot('Production reversal retained for approval. The entry remains included until the decision is approved.'),
      )
      await refreshSection(sectionRef.current)
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    } finally {
      setSubmitting(false)
    }
  }

  async function loadSelectedJob(jobId) {
    setSelectedJobLoading(true)
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(jobId)}`)
      setSelectedJob(result.job)
      return result.job
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSelectedJobLoading(false)
    }
  }

  async function loadResourceOptions() {
    try {
      const [workersResult, toolsResult] = await Promise.all([api('/api/ledger/workers?limit=100'), api('/api/ledger/tools?limit=100')])
      setResourceOptions({
        workers: (workersResult.workers || []).filter((worker) => !['retired', 'inactive'].includes(worker.status)),
        tools: (toolsResult.tools || []).filter(
          (tool) => tool.status === 'available' && !tool.retirementApprovalId && tool.inspection?.reservationReady !== false,
        ),
      })
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function openJobWorkspace(job) {
    const start = toLocalDateTimeInput(job.replacementScheduledStart || job.scheduledStart || job.targetCompletion)
    const end = toLocalDateTimeInput(job.replacementScheduledEnd)
    setSelectedJobId(job.id)
    setSelectedJob(null)
    setShowResourcePlanner(false)
    setScheduleReview(null)
    setScheduleDraft({
      plannedStart: start,
      plannedEnd: end || suggestedEndInput(start, job.estimatedHours),
    })
    setWeatherDraft({
      condition: 'workable',
      precipitationPercent: '0',
      weatherSensitive: /garden|pav|roof|fence|outside|outdoor|painting|clean/i.test(
        `${job.jobType || ''} ${job.title || ''} ${job.description || ''}`,
      ),
    })
    setResourceDraft({ workerId: job.replacementWorkerId || '', toolId: '', toolTaskId: '' })
    setCommunicationDraft({ channel: 'email', subject: '', body: '', expectsReply: true })
    setPortalDraft({ label: 'Client job portal', expiresAt: futureDateInput(30), locale: 'nl-NL' })
    setPortalLink('')
    setTaskDraft(emptyTaskDraft())
    setTaskAction(null)
    setTaskActionNote('')
    await Promise.all([
      loadSelectedJob(job.id),
      capabilities.estimateRates === true
        ? api('/api/ledger/estimate-rates').then((result) => setEstimateRates(result.estimateRates || null))
        : Promise.resolve(),
      canCoordinate ? loadResourceOptions() : Promise.resolve(),
      canCoordinate
        ? api('/api/ledger/inspection-templates').then((result) => {
            setData((current) => current ? { ...current, inspectionTemplates: result.templates || [] } : current)
          })
      : Promise.resolve(),
    ])
    if (job.openResourcePlanner === true) setShowResourcePlanner(true)
  }

  function closeJobWorkspace() {
    setSelectedJobId(null)
    setSelectedJob(null)
    setScheduleReview(null)
    setPortalLink('')
    setShowResourcePlanner(false)
    setTaskAction(null)
    setTaskActionNote('')
    setCommercialDraftMode(null)
    setCommercialAcceptance(null)
  }

  async function applyCapabilitySetup(requirementKeys) {
    if (!selectedJobId || !canCoordinate || !requirementKeys.length) return null
    setSubmitting(true)
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/capability-plan`, {
        method: 'POST',
        body: JSON.stringify({ requirementKeys }),
      })
      setSelectedJob(result.job)
      await refresh()
      const created = result.created?.length || 0
      const blocked = result.blocked?.length || 0
      notify(
        `${created} internal setup draft${created === 1 ? '' : 's'} retained.${blocked ? ` ${blocked} manual gap${blocked === 1 ? '' : 's'} remained operator-controlled.` : ''}`,
      )
      return result
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function refreshWorkDelivery(jobId) {
    setWorkContextRevision(value => value + 1)
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(jobId)}`)
      setSelectedJob(current => current?.id === jobId ? { ...current, approvals: result.job.approvals, audit: result.job.audit } : current)
    } catch (requestError) { setError(requestError.message) }
  }

  async function requestEstimateRatePolicy(payload) {
    setSubmitting(true)
    setError('')
    try {
      const result = await api('/api/ledger/estimate-rates/policies', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setEstimateRates(result.estimateRates || estimateRates)
      notify('Estimating rate policy revision retained for approval.')
      return result
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function applyTakeoffUnitRate(takeoff, item, payload) {
    if (!selectedJobId || !takeoff?.id || !item?.id) return null
    setSubmitting(true)
    setError('')
    try {
      const result = await api(
        `/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/takeoffs/${encodeURIComponent(takeoff.id)}/items/${encodeURIComponent(item.id)}/rate-build-up`,
        { method: 'POST', body: JSON.stringify(payload) },
      )
      setSelectedJob(result.job)
      notify(result.replayed ? 'The matching unit-rate build-up was already retained.' : 'Unit-rate build-up calculated and retained on the draft measurement.')
      return result
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  function openTakeoffCreate() {
    if (!selectedJob) return
    commercialDialogReturnFocusRef.current = false
    commercialDialogOpenerRef.current = document.activeElement
    setTakeoffDraft(emptyTakeoffDraft(selectedJob))
    setTakeoffDialog({ mode: 'create' })
  }

  function openTakeoffItem(takeoff, item = null) {
    commercialDialogReturnFocusRef.current = false
    commercialDialogOpenerRef.current = document.activeElement
    setTakeoffItemDraft(emptyTakeoffItemDraft(item, takeoff))
    setTakeoffDialog({ mode: item ? 'edit_item' : 'add_item', takeoff, item })
  }

  function openTakeoffRemoval(takeoff, item) {
    commercialDialogReturnFocusRef.current = false
    commercialDialogOpenerRef.current = document.activeElement
    setTakeoffDialog({ mode: 'remove_item', takeoff, item })
  }

  function openTakeoffConversion(takeoff) {
    commercialDialogReturnFocusRef.current = false
    commercialDialogOpenerRef.current = document.activeElement
    setTakeoffConversionDraft(emptyTakeoffConversionDraft())
    setTakeoffDialog({ mode: 'convert', takeoff })
  }

  function closeTakeoffDialog() {
    if (submitting) return
    setTakeoffDialog(null)
    setTakeoffDraft(emptyTakeoffDraft())
    setTakeoffItemDraft(emptyTakeoffItemDraft())
    setTakeoffConversionDraft(emptyTakeoffConversionDraft())
    restoreCommercialDialogFocus()
  }

  function changeTakeoffMeasurementType(measurementType) {
    const unit = { count: 'ea', linear: 'm', area: 'm2', volume: 'm3', manual: 'unit' }[measurementType]
    setTakeoffItemDraft((current) => ({ ...current, measurementType, unit }))
  }

  async function submitTakeoff(event) {
    event.preventDefault()
    if (!selectedJobId || takeoffDraft.title.trim().length < 2) return
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/takeoffs`, {
        method: 'POST',
        body: JSON.stringify({
          title: takeoffDraft.title.trim(),
          taxRate: Number(takeoffDraft.taxRate),
          currency: 'EUR',
          notes: takeoffDraft.notes.trim() || null,
        }),
      })
      setSelectedJob(result.job)
      setTakeoffDialog(null)
      restoreCommercialDialogFocus()
      notify('Quantity takeoff retained as an internal draft. No estimate or external commitment was created.')
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function submitTakeoffItem(event) {
    event.preventDefault()
    if (!selectedJobId || !takeoffDialog?.takeoff || !takeoffItemDraftReady) return
    const editing = takeoffDialog.mode === 'edit_item'
    const base = `/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/takeoffs/${encodeURIComponent(takeoffDialog.takeoff.id)}/items`
    const route = editing ? `${base}/${encodeURIComponent(takeoffDialog.item.id)}` : base
    setSubmitting(true)
    setError('')
    try {
      const result = await api(route, {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify({
          description: takeoffItemDraft.description.trim(),
          category: takeoffItemDraft.category,
          measurementType: takeoffItemDraft.measurementType,
          count: Number(takeoffItemDraft.count),
          length: Number(takeoffItemDraft.length) || 0,
          width: Number(takeoffItemDraft.width) || 0,
          height: Number(takeoffItemDraft.height) || 0,
          quantity: Number(takeoffItemDraft.quantity) || 0,
          unit: takeoffItemDraft.unit.trim(),
          wastePercent: Number(takeoffItemDraft.wastePercent) || 0,
          unitCost: Number(takeoffItemDraft.unitCost) || 0,
          unitPrice: Number(takeoffItemDraft.unitPrice) || 0,
          costCode: takeoffItemDraft.costCode.trim() || 'estimate',
          wbsCode: takeoffItemDraft.wbsCode.trim().toUpperCase(),
          workPackage: takeoffItemDraft.workPackage.trim(),
          sourceReference: takeoffItemDraft.sourceReference.trim() || null,
        }),
      })
      setSelectedJob(result.job)
      setTakeoffDialog(null)
      restoreCommercialDialogFocus()
      notify(editing ? 'Takeoff measurement recalculated and retained.' : 'Takeoff measurement calculated and retained.')
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function removeTakeoffItem() {
    if (!selectedJobId || takeoffDialog?.mode !== 'remove_item') return
    setSubmitting(true)
    setError('')
    try {
      const result = await api(
        `/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/takeoffs/${encodeURIComponent(takeoffDialog.takeoff.id)}/items/${encodeURIComponent(takeoffDialog.item.id)}/remove`,
        { method: 'POST', body: JSON.stringify({}) },
      )
      setSelectedJob(result.job)
      setTakeoffDialog(null)
      restoreCommercialDialogFocus()
      notify('Takeoff measurement removed and sheet totals recalculated.')
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function convertTakeoff(event) {
    event.preventDefault()
    if (!selectedJobId || takeoffDialog?.mode !== 'convert') return
    const commercialScopeRevision = selectedJob?.commercialScope?.currentRevision
    if (!commercialScopeRevision || selectedJob?.commercialScope?.stale === true) {
      setError('Approve a current scope, assumptions, exclusions, and allowances revision before preparing the estimate.')
      return
    }
    const pricingDecision = selectedJob?.pricingBasis?.currentDecision
    const riskRegisterRevision = selectedJob?.riskRegister?.currentRevision
    if (!riskRegisterRevision || selectedJob?.riskRegister?.stale === true) {
      setError('Approve a current project risk register and premortem before preparing the estimate.')
      return
    }
    if (!pricingDecision || selectedJob?.pricingBasis?.stale === true) {
      setError('Retain a current fixed-price or time-and-materials decision before preparing the estimate.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const result = await api(
        `/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/takeoffs/${encodeURIComponent(takeoffDialog.takeoff.id)}/convert`,
        {
          method: 'POST',
          body: JSON.stringify({
            validUntil: takeoffConversionDraft.validUntil,
            notes: takeoffConversionDraft.notes.trim() || null,
            commercialScopeRevisionId: commercialScopeRevision.id,
            riskRegisterRevisionId: riskRegisterRevision.id,
            pricingDecisionId: pricingDecision.id,
          }),
        },
      )
      setSelectedJob(result.job)
      setTakeoffDialog(null)
      restoreCommercialDialogFocus()
      notify(`Measured scope sealed and estimate retained at ${currency.format(result.quote.subtotal)} net. Approval is required before issue.`)
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function openCommercialDraft(mode, supersedes = null) {
    if (!selectedJob) return
    if (mode === 'quote' && selectedJob.commercialScope?.ready !== true) {
      setError('Approve a current scope, assumptions, exclusions, and allowances revision before creating an estimate.')
      return
    }
    if (mode === 'quote' && selectedJob.riskRegister?.ready !== true) {
      setError('Approve a current project risk register and premortem before creating an estimate.')
      return
    }
    if (mode === 'quote' && (!selectedJob.pricingBasis?.currentDecision || selectedJob.pricingBasis?.stale === true)) {
      setError('Retain a current fixed-price or time-and-materials decision before creating an estimate.')
      return
    }
    commercialDialogReturnFocusRef.current = false
    commercialDialogOpenerRef.current = document.activeElement
    setCommercialDraftMode(mode)
    if (mode === 'quote') setQuoteDraft(emptyQuoteDraft(selectedJob))
    else setChangeOrderDraft(emptyChangeOrderDraft(selectedJob, supersedes))
  }

  function restoreCommercialDialogFocus() {
    commercialDialogReturnFocusRef.current = true
  }

  function closeCommercialDialog() {
    if (submitting) return
    setCommercialDraftMode(null)
    setCommercialAcceptance(null)
    setCommercialAcceptanceDraft(emptyCommercialAcceptanceDraft())
    setCommercialDelivery(null)
    setCommercialDeliveryDraft(emptyBidOrderDeliveryDraft())
    restoreCommercialDialogFocus()
  }

  function updateCommercialLineItem(mode, index, key, value) {
    const update = (current) => ({
      ...current,
      lineItems: current.lineItems.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)),
    })
    if (mode === 'quote') setQuoteDraft(update)
    else setChangeOrderDraft(update)
  }

  function addCommercialLineItem(mode) {
    const item = { description: '', quantity: '1', unitPrice: '', costCode: mode === 'quote' ? 'contract' : 'change_order' }
    if (mode === 'quote') setQuoteDraft((current) => ({ ...current, lineItems: [...current.lineItems, item] }))
    else setChangeOrderDraft((current) => ({ ...current, lineItems: [...current.lineItems, item] }))
  }

  function removeCommercialLineItem(mode, index) {
    const update = (current) => ({ ...current, lineItems: current.lineItems.filter((_, itemIndex) => itemIndex !== index) })
    if (mode === 'quote') setQuoteDraft(update)
    else setChangeOrderDraft(update)
  }

  async function submitCommercialDraft(event) {
    event.preventDefault()
    if (!selectedJobId || !commercialDraftMode) return
    const mode = commercialDraftMode
    const draft = mode === 'quote' ? quoteDraft : changeOrderDraft
    const lineItems = draft.lineItems.map((item) => ({
      description: item.description.trim(),
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      costCode: item.costCode.trim(),
    }))
    if (
      !lineItems.length ||
      lineItems.some(
        (item) => item.description.length < 2 || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unitPrice),
      )
    )
      return
    setSubmitting(true)
    try {
      const route = mode === 'quote' ? 'quote' : 'change-orders'
      const payload =
        mode === 'quote'
          ? {
              commercialScopeRevisionId: selectedJob?.commercialScope?.currentRevision?.id || null,
              riskRegisterRevisionId: selectedJob?.riskRegister?.currentRevision?.id || null,
              pricingDecisionId: selectedJob?.pricingBasis?.currentDecision?.id || null,
              currency: 'EUR',
              taxRate: Number(draft.taxRate),
              validUntil: draft.validUntil || null,
              notes: draft.notes.trim() || null,
              lineItems,
            }
          : {
              entryKey: draft.entryKey,
              quoteId: draft.quoteId || null,
              supersedesChangeOrderId: draft.supersedesChangeOrderId || null,
              title: draft.title.trim(),
              scopeDelta: draft.scopeDelta.trim(),
              variationType: draft.variationType,
              initiatedBy: draft.initiatedBy,
              cause: draft.cause.trim(),
              justification: draft.justification.trim(),
              contractReference: draft.contractReference.trim(),
              noticeReference: draft.noticeReference.trim() || null,
              noticeNotApplicableReason: draft.noticeReference.trim() ? null : draft.noticeNotApplicableReason.trim(),
              requestedAt: draft.requestedAt || null,
              responseDueAt: draft.responseDueAt || null,
              scheduleDeltaDays: Number(draft.scheduleDeltaDays),
              scheduleImpactNarrative: draft.scheduleImpactNarrative.trim(),
              riskImpact: draft.riskImpact,
              riskImpactStatement: draft.riskImpactStatement.trim(),
              assumptions: draft.assumptions.split('\n').map((item) => item.trim()).filter(Boolean),
              exclusions: draft.exclusions.split('\n').map((item) => item.trim()).filter(Boolean),
              evidenceReferences: draft.evidenceReferences.split('\n').map((item) => item.trim()).filter(Boolean),
              currency: 'EUR',
              taxRate: Number(draft.taxRate),
              notes: draft.notes.trim() || null,
              lineItems,
              status: 'submitted',
              requiresApproval: true,
            }
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/${route}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setSelectedJob(result.job)
      setData((current) => current
        ? reconcileJobCollections({ ...current, dashboard: result.dashboard || current.dashboard }, result.job)
        : current)
      setCommercialDraftMode(null)
      restoreCommercialDialogFocus()
      notify(
        mode === 'quote'
          ? `Estimate retained at ${currency.format(result.quote.subtotal)} net. Internal approval is required before issue.`
          : `Scope change retained at ${currency.format(result.changeOrder.amount)} net. Contract value remains unchanged until client acceptance is verified.`,
      )
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function prepareQuoteIssuePackage(quote) {
    if (!selectedJobId || !quote?.id) return
    setSubmitting(true)
    try {
      const result = await api(
        `/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/quotes/${encodeURIComponent(quote.id)}/issue-package`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        },
      )
      setSelectedJob(result.job)
      setData((current) => current
        ? reconcileJobCollections({ ...current, dashboard: result.dashboard || current.dashboard }, result.job)
        : current)
      notify(
        result.replayed
          ? `Quote package ${result.issueReference} is already retained with its delivery approval.`
          : `Quote package ${result.issueReference} retained. Delivery remains blocked until its separate approval is resolved.`,
      )
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function retainPricingBasisDecision(payload) {
    if (!selectedJobId) return false
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/pricing-decisions`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setSelectedJob(result.job)
      setData((current) => current
        ? reconcileJobCollections({ ...current, dashboard: result.dashboard || current.dashboard }, result.job)
        : current)
      notify(`${formatStatus(result.decision.selectedModel)} pricing basis v${result.decision.versionNumber} retained. Estimates now bind to this exact decision.`)
      return result
    } catch (requestError) {
      setError(requestError.message)
      return false
    } finally {
      setSubmitting(false)
    }
  }

  async function requestCommercialScopeRevision(payload) {
    if (!selectedJobId) return false
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/commercial-scope/revisions`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setSelectedJob(result.job)
      setData((current) => current
        ? reconcileJobCollections({ ...current, dashboard: result.dashboard || current.dashboard }, result.job)
        : current)
      notify(`Commercial scope v${result.revision.versionNumber} retained for approval. Pricing remains blocked until review.`)
      return result
    } catch (requestError) {
      setError(requestError.message)
      return false
    } finally {
      setSubmitting(false)
    }
  }

  async function prepareVariationImplementation(changeOrder, payload) {
    if (!selectedJobId || !changeOrder?.id) return false
    setSubmitting(true)
    setError('')
    try {
      const result = await api(
        `/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/change-orders/${encodeURIComponent(changeOrder.id)}/implementation-plans`,
        { method: 'POST', body: JSON.stringify(payload) },
      )
      setSelectedJob(result.job)
      setData((current) => current
        ? reconcileJobCollections({ ...current, dashboard: result.dashboard || current.dashboard }, result.job)
        : current)
      notify(result.replayed
        ? ot('Implementation request already retained.')
        : ot('Implementation tasks and material needs are awaiting internal approval.'))
      return result
    } catch (requestError) {
      setError(requestError.message)
      return false
    } finally {
      setSubmitting(false)
    }
  }

  async function requestRiskRegisterRevision(payload) {
    if (!selectedJobId) return false
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/risk-register/revisions`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setSelectedJob(result.job)
      setData((current) => current
        ? reconcileJobCollections({ ...current, dashboard: result.dashboard || current.dashboard }, result.job)
        : current)
      notify(`Project risk register v${result.revision.versionNumber} retained for approval. Pricing remains blocked until review.`)
      return result
    } catch (requestError) {
      setError(requestError.message)
      return false
    } finally {
      setSubmitting(false)
    }
  }

  async function prepareChangeOrderIssuePackage(changeOrder) {
    if (!selectedJobId || !changeOrder?.id) return
    setSubmitting(true)
    try {
      const result = await api(
        `/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/change-orders/${encodeURIComponent(changeOrder.id)}/issue-package`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        },
      )
      setSelectedJob(result.job)
      setData((current) => current
        ? reconcileJobCollections({ ...current, dashboard: result.dashboard || current.dashboard }, result.job)
        : current)
      notify(
        result.replayed
          ? `Change-order package ${result.issueReference} is already retained with its delivery approval.`
          : `Change-order package ${result.issueReference} retained. Delivery remains blocked until its separate approval and provider receipt are retained.`,
      )
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function openChangeOrderDelivery(changeOrder, communication) {
    if (!changeOrder?.id || !communication?.id) return
    commercialDialogReturnFocusRef.current = false
    commercialDialogOpenerRef.current = document.activeElement
    setCommercialDelivery({ changeOrder, communication })
    setCommercialDeliveryDraft(emptyBidOrderDeliveryDraft())
  }

  async function submitChangeOrderDelivery(event) {
    event.preventDefault()
    if (
      !commercialDelivery?.communication?.id ||
      !commercialDeliveryDraft.integration.trim() ||
      !commercialDeliveryDraft.providerMessageId.trim() ||
      !commercialDeliveryDraft.sentAt
    ) {
      return
    }
    setSubmitting(true)
    try {
      const result = await api(
        `/api/ledger/communications/${encodeURIComponent(commercialDelivery.communication.id)}/delivery-receipt`,
        {
          method: 'POST',
          body: JSON.stringify({
            integration: commercialDeliveryDraft.integration.trim(),
            providerMessageId: commercialDeliveryDraft.providerMessageId.trim(),
            sentAt: toIsoDateTime(commercialDeliveryDraft.sentAt),
          }),
        },
      )
      setSelectedJob(result.job)
      setCommercialDelivery(null)
      setCommercialDeliveryDraft(emptyBidOrderDeliveryDraft())
      restoreCommercialDialogFocus()
      notify(
        `Verified provider receipt retained for ${result.changeOrder?.data?.issuePackage?.issueReference || 'the change order'}. Client acceptance can now be recorded; contract value is unchanged.`,
      )
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function openCommercialAcceptance(type, record) {
    if (type === 'issue_package') {
      prepareQuoteIssuePackage(record)
      return
    }
    if (type === 'change_issue_package') {
      prepareChangeOrderIssuePackage(record)
      return
    }
    commercialDialogReturnFocusRef.current = false
    commercialDialogOpenerRef.current = document.activeElement
    setCommercialAcceptance({ type, record })
    setCommercialAcceptanceDraft(emptyCommercialAcceptanceDraft())
  }

  async function submitCommercialAcceptance(event) {
    event.preventDefault()
    if (!selectedJobId || !commercialAcceptance || commercialAcceptanceDraft.evidenceReference.trim().length < 3) return
    const { type, record } = commercialAcceptance
    const route =
      type === 'quote' ? `quotes/${encodeURIComponent(record.id)}/acceptance` : `change-orders/${encodeURIComponent(record.id)}/acceptance`
    setSubmitting(true)
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/${route}`, {
        method: 'POST',
        body: JSON.stringify({
          acceptedAt: commercialAcceptanceDraft.acceptedAt,
          evidenceReference: commercialAcceptanceDraft.evidenceReference.trim(),
          notes: commercialAcceptanceDraft.notes.trim() || null,
        }),
      })
      setSelectedJob(result.job)
      setData((current) => current
        ? reconcileJobCollections({ ...current, dashboard: result.dashboard || current.dashboard }, result.job)
        : current)
      setCommercialAcceptance(null)
      setCommercialAcceptanceDraft(emptyCommercialAcceptanceDraft())
      restoreCommercialDialogFocus()
      notify(
        result.replayed
          ? 'The existing client-acceptance verification is already waiting in Approvals.'
          : 'Client acceptance evidence retained. Contract value remains unchanged until an approver verifies it.',
      )
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function createJobTask(event) {
    event.preventDefault()
    const title = taskDraft.title.trim()
    if (!selectedJobId || !title) return
    setSubmitting(true)
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          title,
          priority: taskDraft.priority,
          assigneeId: taskDraft.assigneeId || null,
          durationHours: Number(taskDraft.durationHours),
          requiredCrewRequirements: (taskDraft.requiredCrewRequirements || [{ role: taskDraft.requiredTrade || '', count: taskDraft.requiredCrewSize || 1 }])
            .map(item => ({ role: String(item.role || '').trim(), count: Number(item.count || 1) })),
          supervisorWorkerIds: taskDraft.supervisorWorkerIds || [],
          ...(taskDraft.workersPerSupervisor ? { supervisionRatio: { workersPerSupervisor: Number(taskDraft.workersPerSupervisor) } } : {}),
          predecessorTaskId: taskDraft.predecessorTaskId || null,
          materialRequirementIds: taskDraft.materialRequirementIds || [],
          dueAt: taskDraft.dueAt ? new Date(`${taskDraft.dueAt}T17:00:00`).toISOString() : null,
          actor: 'office_operator',
        }),
      })
      setTaskDraft(emptyTaskDraft())
      await Promise.all([refresh(), loadSelectedJob(selectedJobId)])
      notify(`Task retained: ${result.task.title}.`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function updateJobTaskSchedule(task, patch) {
    if (!selectedJobId || !task?.id) return null
    setSubmitting(true)
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/tasks/${encodeURIComponent(task.id)}/schedule`, {
        method: 'PATCH',
        body: JSON.stringify({ ...patch, actor: 'office_operator' }),
      })
      setSelectedJob(result.job)
      await refresh()
      notify(`Planning duration updated for ${task.title}.`)
      return result.task
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function addJobTaskDependency(payload) {
    if (!selectedJobId) return null
    setSubmitting(true)
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/task-dependencies`, {
        method: 'POST',
        body: JSON.stringify({ ...payload, actor: 'office_operator' }),
      })
      setSelectedJob(result.job)
      await refresh()
      notify('Task dependency retained in the work plan.')
      return result.dependency
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function cancelJobTaskDependency(dependency) {
    if (!selectedJobId || !dependency?.id) return null
    setSubmitting(true)
    try {
      const result = await api(
        `/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/task-dependencies/${encodeURIComponent(dependency.id)}/cancel`,
        {
          method: 'POST',
          body: JSON.stringify({ reason: 'Removed from the current operator work plan.', actor: 'office_operator' }),
        },
      )
      setSelectedJob(result.job)
      await refresh()
      notify('Task dependency removed from the current plan and retained in history.')
      return result.dependency
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function calculateJobWorkPlan(payload) {
    if (!selectedJobId || !payload.plannedStart) return null
    setSubmitting(true)
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/work-plan/calculate`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      notify(result.plan.ready ? 'Work plan calculated.' : 'Complete the missing planning inputs.')
      return result.plan
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function requestJobScheduleBaseline(payload) {
    if (!selectedJobId || !payload.plannedStart) return null
    setSubmitting(true)
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/schedule-baselines`, {
        method: 'POST',
        body: JSON.stringify({ ...payload, reason: 'Operator work-plan baseline review.', actor: 'office_operator' }),
      })
      setSelectedJob(result.job)
      notify(result.idempotent ? 'The same work-plan baseline is already pending.' : 'Work-plan baseline added to the approval queue.')
      await refresh()
      return result
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function createProjectControl(type, draft) {
    if (!selectedJobId || !canCoordinate) return null
    const routes = {
      rfi: 'rfis',
      submittal: 'submittals',
      document: 'controlled-document-revisions',
      transmittal: 'document-transmittals',
      meeting: 'project-meetings',
    }
    const route = routes[type]
    if (!route) return null
    const payload = type === 'submittal'
      ? {
          ...draft,
          status: 'draft',
          attachments: Array.isArray(draft.attachmentDocumentIds)
            ? draft.attachmentDocumentIds
            : String(draft.attachments || '').split(',').map((value) => value.trim()).filter(Boolean),
        }
      : type === 'transmittal'
        ? {
            ...draft,
            recipients: parseTransmittalRecipients(draft.recipients),
            documentIds: draft.documentIds,
          }
        : type === 'meeting'
          ? {
              ...draft,
              scheduledAt: toIsoDateTime(draft.scheduledAt),
              attendees: parseMeetingAttendees(draft.attendees),
              agenda: parseMeetingLines(draft.agenda),
              decisions: parseMeetingLines(draft.decisions),
              actions: draft.actions.map((action) => ({
                title: action.title,
                ownerName: action.ownerName,
                dueAt: action.dueAt || null,
                priority: action.priority,
                description: action.description,
              })),
            }
        : { ...draft, status: type === 'rfi' ? 'open' : 'draft' }
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/${route}`, {
        method: 'POST',
        body: JSON.stringify({ ...payload, actor: 'office_operator' }),
      })
      setSelectedJob(result.job)
      notify(
        type === 'rfi'
          ? 'RFI retained in the project decision trail.'
          : type === 'submittal'
            ? 'Submittal draft retained for technical review.'
            : type === 'document'
              ? 'Controlled revision retained. The prior approved revision remains current until approval.'
              : type === 'transmittal'
                ? 'Transmittal package retained for approval. No files or messages were sent.'
                : 'Draft meeting minutes retained with decisions and proposed actions.',
      )
      return result
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function transitionProjectControl(type, record, payload) {
    if (!selectedJobId || !record?.id || !canCoordinate) return null
    setSubmitting(true)
    setError('')
    try {
      const result = await api(
        `/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/lifecycle/${encodeURIComponent(type)}/${encodeURIComponent(record.id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ ...payload, actor: 'office_operator' }),
        },
      )
      setSelectedJob(result.job)
      notify(
        result.approvalRequired
          ? `${record.title} is retained for explicit approval. No field or external reliance was created.`
          : `${record.title} is now ${formatStatus(payload.status)}.`,
      )
      return result
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function calculateResourceWorkPlan(payload) {
    if (!selectedJobId || !payload.plannedStart) return null
    setSubmitting(true)
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/work-plan/resource-preview`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      notify(result.plan.status === 'feasible_under_recorded_constraints' ? 'Resource proposal calculated.' : 'Resource proposal needs review or more information.')
      return result.plan
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function reserveJobWarehouseMaterial(constraint, payload) {
    if (!selectedJobId || !constraint?.materialRequirementId || !payload?.sourceReference?.trim()) return null
    setSubmitting(true)
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/material-stock-reservations`, {
        method: 'POST',
        body: JSON.stringify({
          materialRequirementId: constraint.materialRequirementId,
          quantity: Number(payload.quantity),
          sourceReference: payload.sourceReference.trim(),
          note: payload.note?.trim() || 'Reserved from the work-plan material review.',
          entryKey: `work-plan-reservation:${selectedJobId}:${constraint.materialRequirementId}:${globalThis.crypto.randomUUID()}`,
        }),
      })
      notify('Warehouse stock reserved for this job; site issue and arrival remain separate steps.')
      return result.allocation
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function issueJobWarehouseMaterial(constraint, payload) {
    if (!constraint?.warehouseAllocationId || !payload?.expectedArrivalAt
      || !payload.dispatchReference?.trim() || !payload.evidenceReference?.trim()
      || !Number.isFinite(Number(payload.quantity)) || Number(payload.quantity) <= 0) return null
    setSubmitting(true)
    try {
      const result = await api(`/api/ledger/material-stock-reservations/${encodeURIComponent(constraint.warehouseAllocationId)}/issue`, {
        method: 'POST',
        body: JSON.stringify({
          quantity: Number(payload.quantity),
          dispatchReference: payload.dispatchReference.trim(),
          evidenceReference: payload.evidenceReference.trim(),
          expectedArrivalAt: new Date(payload.expectedArrivalAt).toISOString(),
          note: payload.note?.trim() || 'Issued from the work-plan material review.',
          entryKey: `work-plan-issue:${constraint.warehouseAllocationId}:${globalThis.crypto.randomUUID()}`,
        }),
      })
      notify('Warehouse issue recorded; the field team must still confirm site receipt.')
      return result
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function saveJobSiteAccessCalendar(payload) {
    if (!selectedJobId) return null
    setSubmitting(true)
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/site-access-calendar`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setSelectedJob(result.job)
      notify(result.changed ? 'Site access hours saved for future resource previews.' : 'Site access hours are unchanged.')
      return result.calendar
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function saveJobTravelRoute(payload) {
    if (!selectedJobId) return null
    setSubmitting(true)
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/travel-routes`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setSelectedJob(result.job)
      notify(result.changed ? 'Sourced route saved for future resource previews.' : 'The sourced route is unchanged.')
      return result.route
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function requestResourceWorkPlanApproval(plan) {
    if (!selectedJobId || !plan || plan.status !== 'feasible_under_recorded_constraints') return null
    setSubmitting(true)
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/work-plan/resource-approval`, {
        method: 'POST',
        body: JSON.stringify({ plan, reason: 'Review the proposed task allocation before changing the field plan.' }),
      })
      notify(result.idempotent ? 'This resource proposal is already awaiting approval.' : 'Resource proposal sent for independent approval.')
      return result
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function submitEnergyPerformanceRecord(payload) {
    if (!selectedJobId || !canCoordinate) return null
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/energy-performance`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setSelectedJob(result.job)
      setData((current) => current
        ? reconcileJobCollections({ ...current, dashboard: result.dashboard || current.dashboard }, result.job)
        : current)
      notify(
        result.replayed
          ? 'The exact energy-performance evidence was already retained.'
          : 'Energy-performance evidence retained for independent review. Contractor.AI did not calculate, certify, or register it.',
      )
      await refresh()
      return result
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function issueDocumentTransmittal(record, payload) {
    if (!selectedJobId || !record?.id || !canCoordinate) return null
    setSubmitting(true)
    setError('')
    try {
      const result = await api(
        `/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/document-transmittals/${encodeURIComponent(record.id)}/issue`,
        { method: 'POST', body: JSON.stringify(payload) },
      )
      setSelectedJob(result.job)
      setSubmitting(false)
      notify(`${record.transmittalNumber} issue evidence retained. Contractor.AI did not send the package.`)
      return result
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function acknowledgeDocumentTransmittal(record, receiptId, payload) {
    if (!selectedJobId || !record?.id || !receiptId || !canCoordinate) return null
    setSubmitting(true)
    setError('')
    try {
      const result = await api(
        `/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/document-transmittals/${encodeURIComponent(record.id)}/receipts/${encodeURIComponent(receiptId)}/acknowledge`,
        { method: 'POST', body: JSON.stringify(payload) },
      )
      setSelectedJob(result.job)
      setSubmitting(false)
      notify(result.transmittal.status === 'acknowledged' ? `${record.transmittalNumber} is fully acknowledged.` : 'Recipient acknowledgment evidence retained.')
      return result
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function submitProjectMeeting(record, payload) {
    if (!selectedJobId || !record?.id || !canCoordinate) return null
    setSubmitting(true)
    setError('')
    try {
      const result = await api(
        `/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/project-meetings/${encodeURIComponent(record.id)}/submit`,
        { method: 'POST', body: JSON.stringify(payload) },
      )
      setSelectedJob(result.job)
      notify(result.replayed ? 'These meeting minutes are already pending approval.' : 'Meeting minutes added to the approval queue. Proposed actions are not active yet.')
      await refresh()
      return result
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function issueProjectMeeting(record, payload) {
    if (!selectedJobId || !record?.id || !canCoordinate) return null
    setSubmitting(true)
    setError('')
    try {
      const result = await api(
        `/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/project-meetings/${encodeURIComponent(record.id)}/issue`,
        { method: 'POST', body: JSON.stringify(payload) },
      )
      setSelectedJob(result.job)
      notify(`${record.meetingNumber} distribution evidence retained. Contractor.AI did not send the minutes.`)
      await refresh()
      return result
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function completeProjectMeetingAction(record, actionId, payload) {
    if (!selectedJobId || !record?.id || !actionId || !canCoordinate) return null
    setSubmitting(true)
    setError('')
    try {
      const result = await api(
        `/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/project-meetings/${encodeURIComponent(record.id)}/actions/${encodeURIComponent(actionId)}/complete`,
        { method: 'POST', body: JSON.stringify(payload) },
      )
      setSelectedJob(result.job)
      notify('Meeting action and its linked job task completed with retained evidence.')
      await refresh()
      return result
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function createProjectMeetingFollowUp(record, payload) {
    if (!selectedJobId || !record?.id || !canCoordinate) return null
    setSubmitting(true)
    setError('')
    try {
      const result = await api(
        `/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/project-meetings/${encodeURIComponent(record.id)}/follow-up`,
        { method: 'POST', body: JSON.stringify(payload) },
      )
      setSelectedJob(result.job)
      notify(`${result.carriedActionCount} unresolved action(s) retained on a new draft follow-up meeting.`)
      await refresh()
      return result
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function createInspectionTemplate(payload) {
    if (!canCoordinate) return null
    setSubmitting(true)
    setError('')
    try {
      const result = await api('/api/ledger/inspection-templates', {
        method: 'POST',
        body: JSON.stringify({ ...payload, actor: 'office_operator' }),
      })
      setData((current) => current ? {
        ...current,
        inspectionTemplates: [
          result.template,
          ...(current.inspectionTemplates || []).filter((template) => template.id !== result.template.id),
        ],
      } : current)
      notify(ot('{name} retained as reusable inspection template v{version}.', { name: result.template.name, version: result.template.versionNumber }))
      return result.template
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function schedulePhotoEvidenceSet(payload) {
    if (!selectedJobId || !canCoordinate) return null
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/photo-evidence`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setSelectedJob(result.job)
      notify(ot('{title} scheduled. Task completion now requires released before, during, and after evidence.', { title: result.photoEvidenceSet.title }))
      await refresh()
      return result.photoEvidenceSet
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function requestPhotoEvidenceReview(setId, payload) {
    if (!selectedJobId || !setId || !canCoordinate) return null
    setSubmitting(true)
    setError('')
    try {
      const result = await api(
        `/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/photo-evidence/${encodeURIComponent(setId)}/review`,
        { method: 'POST', body: JSON.stringify(payload) },
      )
      setSelectedJob(result.job)
      setData((current) => current && result.approval ? {
        ...current,
        approvals: upsertById(current.approvals || [], result.approval),
        dashboard: result.dashboard || current.dashboard,
      } : current)
      notify(
        result.replayed
          ? ot('The exact photo-evidence review request was already retained.')
          : ot('The checksum-protected before/during/after sequence is waiting for independent approval.'),
      )
      return result
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function scheduleInspectionChecklist(payload) {
    if (!selectedJobId || !canCoordinate) return null
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/inspection-checklists`, {
        method: 'POST',
        body: JSON.stringify({ ...payload, actor: 'office_operator' }),
      })
      setSelectedJob(result.job)
      notify(ot('{title} scheduled with an immutable template snapshot.', { title: result.inspection.title }))
      await refresh()
      return result.inspection
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function submitInspectionChecklist(inspection, payload) {
    const jobId = inspection?.jobId || selectedJobId
    if (!jobId || !inspection?.id) return null
    const draft = {
      id: payload.entryKey,
      type: 'inspection_checklist',
      jobId,
      payload: { ...payload, inspectionId: inspection.id },
      operatorScope: outboxScope,
    }
    setSubmitting(true)
    setError('')
    try {
      if (navigator.onLine === false) {
        await enqueueFieldOperationDraft(draft)
        await refreshOutboxState()
        notify(ot('Inspection checklist saved locally for this operator and scheduled for exact retry after reconnection.'))
        return { queued: true }
      }
      const result = await recordFieldOperation(draft)
      setSelectedJob(result.job)
      notify(
        result.replayed
          ? ot('This checklist submission was already retained; no duplicate observations or approval were created.')
          : result.submission.failedCount === 1
            ? ot('{count} failed item retained with corrective observations. Inspection sign-off is waiting for approval.', { count: result.submission.failedCount })
            : ot('{count} failed items retained with corrective observations. Inspection sign-off is waiting for approval.', { count: result.submission.failedCount }),
      )
      await refresh()
      return result
    } catch (requestError) {
      if (shouldQueueFieldMutation(requestError)) {
        try {
          await enqueueFieldOperationDraft(draft)
          await refreshOutboxState()
          notify(ot('Connection interrupted. The complete inspection checklist was saved locally for an exact retry.'))
          return { queued: true }
        } catch (outboxError) {
          setError(outboxError.message)
          return null
        }
      }
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function createNonconformance(values) {
    if (!selectedJobId || !values?.entryKey) return null
    const { entryKey, ...payload } = values
    const draft = {
      id: entryKey,
      type: 'nonconformance',
      jobId: selectedJobId,
      payload: { ...payload, source: 'job_nonconformance_register' },
      operatorScope: outboxScope,
    }
    setSubmitting(true)
    setError('')
    try {
      if (navigator.onLine === false) {
        await enqueueFieldOperationDraft(draft)
        await refreshOutboxState()
        notify('NCR saved locally for this operator and scheduled for exact retry after reconnection.')
        return { queued: true }
      }
      const result = await recordFieldOperation(draft)
      setSelectedJob(result.job)
      setData((current) => current ? reconcileJobCollections({ ...current, dashboard: result.dashboard || current.dashboard }, result.job) : current)
      notify(result.replayed ? 'This NCR was already retained; no duplicate record was created.' : `${result.nonconformance?.ncrNumber || 'NCR'} retained with immutable source evidence.`)
      await refresh()
      return result
    } catch (requestError) {
      if (shouldQueueFieldMutation(requestError)) {
        try {
          await enqueueFieldOperationDraft(draft)
          await refreshOutboxState()
          notify('Connection interrupted. The NCR was saved locally for an exact retry.')
          return { queued: true }
        } catch (outboxError) {
          setError(outboxError.message)
          return null
        }
      }
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function requestNonconformanceCorrection(recordId, payload) {
    if (!selectedJobId || !recordId || !canCoordinate || navigator.onLine === false) return null
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/nonconformances/${encodeURIComponent(recordId)}/corrective-action`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setSelectedJob(result.job)
      notify(result.replayed ? 'This corrective-action review is already pending.' : 'Corrective action retained for source-current approval. The NCR remains open.')
      await refresh()
      return result
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function requestNonconformanceClosure(recordId, payload) {
    if (!selectedJobId || !recordId || !canCoordinate || navigator.onLine === false) return null
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/nonconformances/${encodeURIComponent(recordId)}/closure`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setSelectedJob(result.job)
      notify(result.replayed ? 'This NCR closure review is already pending.' : 'Independent closure evidence retained for approval. Related inspection and closeout records remain unchanged.')
      await refresh()
      return result
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function createFieldRisk(type, values) {
    if (!selectedJobId || !['observation', 'incident'].includes(type)) return null
    const { entryKey, evidenceDocumentId, ...fields } = values
    const payload = type === 'incident'
      ? {
          ...fields,
          occurredAt: toIsoDateTime(fields.occurredAt),
          witnesses: String(fields.witnesses || '').split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
          evidenceDocumentIds: evidenceDocumentId ? [evidenceDocumentId] : [],
          status: 'reported',
          requiresApproval: true,
          source: 'field_risk_register',
        }
      : {
          ...fields,
          evidenceDocumentIds: evidenceDocumentId ? [evidenceDocumentId] : [],
          status: 'open',
          source: 'field_risk_register',
        }
    const draft = {
      id: entryKey,
      type,
      jobId: selectedJobId,
      payload,
      operatorScope: outboxScope,
    }
    setSubmitting(true)
    setError('')
    try {
      if (navigator.onLine === false) {
        await enqueueFieldOperationDraft(draft)
        await refreshOutboxState()
        notify(`${type === 'incident' ? 'Incident' : 'Observation'} saved locally for this operator and scheduled for exact retry after reconnection.`)
        return { queued: true }
      }
      const result = await recordFieldOperation(draft)
      setSelectedJob(result.job)
      setData((current) => current ? reconcileJobCollections({ ...current, dashboard: result.dashboard || current.dashboard }, result.job) : current)
      notify(
        result.replayed
          ? `This ${type} was already retained; no duplicate record or approval was created.`
          : type === 'incident'
            ? 'Incident retained for human review. No external notification, work clearance, or statutory filing was made.'
            : 'Observation retained in the field risk register.',
      )
      await refresh()
      return result
    } catch (requestError) {
      if (shouldQueueFieldMutation(requestError)) {
        try {
          await enqueueFieldOperationDraft(draft)
          await refreshOutboxState()
          notify(`Connection interrupted. The ${type} was saved locally for an exact retry.`)
          return { queued: true }
        } catch (outboxError) {
          setError(outboxError.message)
          return null
        }
      }
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function createCloseoutRecord(recordType, values) {
    if (!selectedJobId || !['punch_item', 'warranty_claim', 'aftercare', 'client_feedback'].includes(recordType)) return null
    if (recordType !== 'punch_item' && (!canCoordinate || navigator.onLine === false)) {
      setError(ot('Reconnect before retaining warranty, aftercare, or feedback records. Offline exact retry is limited to field punch capture.'))
      return null
    }

    if (recordType === 'punch_item') {
      const { entryKey, evidenceDocumentId, ...fields } = values
      const draft = {
        id: entryKey,
        type: recordType,
        jobId: selectedJobId,
        payload: {
          ...fields,
          evidenceDocumentIds: evidenceDocumentId ? [evidenceDocumentId] : [],
          status: 'open',
          source: 'closeout_register',
        },
        operatorScope: outboxScope,
      }
      setSubmitting(true)
      setError('')
      try {
        if (navigator.onLine === false) {
          await enqueueFieldOperationDraft(draft)
          await refreshOutboxState()
          notify(ot('Punch item saved locally for this operator and scheduled for exact retry after reconnection.'))
          return { queued: true }
        }
        const result = await recordFieldOperation(draft)
        setSelectedJob(result.job)
        setData((current) => current ? reconcileJobCollections({ ...current, dashboard: result.dashboard || current.dashboard }, result.job) : current)
        notify(result.replayed ? ot('This punch item was already retained; no duplicate record or approval was created.') : ot('Punch item retained. Resolution and client visibility remain approval-gated.'))
        await refresh()
        return result
      } catch (requestError) {
        if (shouldQueueFieldMutation(requestError)) {
          try {
            await enqueueFieldOperationDraft(draft)
            await refreshOutboxState()
            notify(ot('Connection interrupted. The punch item was saved locally for an exact retry.'))
            return { queued: true }
          } catch (outboxError) {
            setError(outboxError.message)
            return null
          }
        }
        setError(requestError.message)
        return null
      } finally {
        setSubmitting(false)
      }
    }

    const route = recordType === 'warranty_claim'
      ? 'warranty-claims'
      : recordType === 'client_feedback'
        ? 'client-feedback'
        : 'aftercare'
    const payload = recordType === 'warranty_claim'
      ? { ...values, status: 'open', source: 'closeout_register' }
      : recordType === 'client_feedback'
        ? { ...values, source: 'closeout_register' }
        : { ...values, status: 'open' }
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/${route}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setSelectedJob(result.job)
      setData((current) => current ? reconcileJobCollections({ ...current, dashboard: result.dashboard || current.dashboard }, result.job) : current)
      notify(recordType === 'warranty_claim'
        ? ot('Warranty claim retained for internal review. No liability, visit, remedy, or client commitment was accepted.')
        : recordType === 'client_feedback'
          ? ot('Client feedback retained as immutable NPS, satisfaction, and effort evidence. No review or referral request was sent.')
          : ot('Aftercare follow-up retained internally. No message was delivered and no work was booked.'))
      await refresh()
      return result
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSubmitting(false)
    }
  }

  async function transitionJobTask(task, status, note = '') {
    if (!selectedJobId || !task?.id) return
    setSubmitting(true)
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/lifecycle/task/${encodeURIComponent(task.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, notes: note.trim(), actor: fieldScoped ? 'field_worker' : 'office_operator' }),
      })
      setSelectedJob(result.job)
      setTaskAction(null)
      setTaskActionNote('')
      await refresh()
      notify(`${task.title} is now ${formatStatus(status)}.`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function openTaskTransition(task, status) {
    if (status === 'in_progress') {
      transitionJobTask(task, status, 'Task started from the job workspace.')
      return
    }
    setTaskAction({ task, status })
    setTaskActionNote('')
  }

  async function submitTaskTransition(event) {
    event.preventDefault()
    if (!taskAction || taskActionNote.trim().length < 4) return
    await transitionJobTask(taskAction.task, taskAction.status, taskActionNote)
  }

  function openJobLifecycle(mode, job) {
    setJobLifecycleAction({ mode, job })
    setJobLifecycleReason('')
  }

  function closeJobLifecycle() {
    if (submitting) return
    setJobLifecycleAction(null)
    setJobLifecycleReason('')
  }

  async function submitJobLifecycle(event) {
    event.preventDefault()
    if (!jobLifecycleAction || jobLifecycleReason.trim().length < 8) return
    const { mode, job } = jobLifecycleAction
    setSubmitting(true)
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(job.id)}/${mode}?includeDashboard=false`, {
        method: 'POST',
        body: JSON.stringify({ reason: jobLifecycleReason.trim(), actor: 'office_operator' }),
      })
      setJobLifecycleAction(null)
      setJobLifecycleReason('')
      if (selectedJobId === job.id) closeJobWorkspace()
      setSubmitting(false)
      notify(
        mode === 'archive'
          ? 'Archive decision retained. The job remains active until an approver confirms the exact effects.'
          : 'Restore decision retained. The job remains archived until an approver confirms the retained state.',
      )
      if (capabilities.approvals && result.approval?.id) {
        openApprovals({ jobId: job.id, jobTitle: job.title, approvalId: result.approval.id })
      }
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function plannedResourceWindow() {
    const scheduledStart = toIsoDateTime(scheduleDraft.plannedStart)
    const scheduledEnd = toIsoDateTime(scheduleDraft.plannedEnd)
    if (!scheduledStart || !scheduledEnd || new Date(scheduledEnd) <= new Date(scheduledStart)) {
      setError('Set a valid proposed start and end time before planning crew or equipment.')
      return null
    }
    return { scheduledStart, scheduledEnd }
  }

  async function assignWorker(event) {
    event.preventDefault()
    const worker = resourceOptions.workers.find((item) => item.id === resourceDraft.workerId)
    const window = plannedResourceWindow()
    if (!selectedJobId || !worker || !window) {
      if (!worker) setError('Choose an available crew member before adding an assignment.')
      return
    }
    setSubmitting(true)
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/assignments`, {
        method: 'POST',
        body: JSON.stringify({
          workerId: worker.id,
          workerName: worker.name,
          role: worker.role || 'Contractor',
          status: 'planned',
          ...window,
          actor: 'office_operator',
        }),
      })
      setResourceDraft((draft) => ({ ...draft, workerId: '' }))
      notify(
        result.assignment.requiresApproval
          ? 'Crew assignment was added as a conflict-aware approval request.'
          : 'Crew assignment was added to the internal work plan.',
      )
      await Promise.all([refresh(), loadSelectedJob(selectedJobId), loadResourceOptions()])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function reserveTool(event) {
    event.preventDefault()
    const tool = resourceOptions.tools.find((item) => item.id === resourceDraft.toolId)
    const window = plannedResourceWindow()
    if (!selectedJobId || !tool || !window) {
      if (!tool) setError('Choose equipment before adding a reservation.')
      return
    }
    setSubmitting(true)
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/tools`, {
        method: 'POST',
        body: JSON.stringify({
          toolId: tool.id,
          toolName: tool.name,
          taskId: resourceDraft.toolTaskId || undefined,
          status: 'reserved',
          neededFrom: window.scheduledStart,
          neededUntil: window.scheduledEnd,
          actor: 'office_operator',
        }),
      })
      setResourceDraft((draft) => ({ ...draft, toolId: '', toolTaskId: '' }))
      notify(
        result.toolReservation.requiresApproval
          ? 'Equipment reservation was added as a conflict-aware approval request.'
          : 'Equipment reservation was added to the internal work plan.',
      )
      await Promise.all([refresh(), loadSelectedJob(selectedJobId), loadResourceOptions()])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function releaseAssignment(assignmentId) {
    setSubmitting(true)
    try {
      await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/assignments/${encodeURIComponent(assignmentId)}/release`, {
        method: 'POST',
        body: JSON.stringify({ status: 'released', reason: 'Released from the operator job workspace.', actor: 'office_operator' }),
      })
      notify('Crew assignment released from the internal work plan.')
      await Promise.all([refresh(), loadSelectedJob(selectedJobId), loadResourceOptions()])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function releaseToolReservation(reservationId) {
    setSubmitting(true)
    try {
      await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/tools/${encodeURIComponent(reservationId)}/release`, {
        method: 'POST',
        body: JSON.stringify({ status: 'released', reason: 'Released from the operator job workspace.', actor: 'office_operator' }),
      })
      notify('Equipment reservation released from the internal work plan.')
      await Promise.all([refresh(), loadSelectedJob(selectedJobId), loadResourceOptions()])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function reviewSchedule(event) {
    event.preventDefault()
    const plannedStart = toIsoDateTime(scheduleDraft.plannedStart)
    const plannedEnd = toIsoDateTime(scheduleDraft.plannedEnd)
    if (!selectedJobId || !plannedStart || !plannedEnd || new Date(plannedEnd) <= new Date(plannedStart)) {
      setError('Enter a valid proposed start and end time before reviewing the schedule.')
      return
    }
    setSubmitting(true)
    try {
      const result = await api('/api/ledger/schedule/recommend', {
        method: 'POST',
        body: JSON.stringify({ jobId: selectedJobId, plannedStart, plannedEnd, actor: 'office_operator' }),
      })
      setScheduleReview(result.recommendation)
      notify('Schedule review completed. No date has been committed.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function requestScheduleApproval() {
    const plannedStart = toIsoDateTime(scheduleDraft.plannedStart)
    const plannedEnd = toIsoDateTime(scheduleDraft.plannedEnd)
    if (!selectedJobId || !plannedStart || !plannedEnd || new Date(plannedEnd) <= new Date(plannedStart)) {
      setError('Enter a valid proposed start and end time before requesting approval.')
      return
    }
    setSubmitting(true)
    try {
      const result = await api('/api/ledger/schedule/request-approval', {
        method: 'POST',
        body: JSON.stringify({ jobId: selectedJobId, plannedStart, plannedEnd, clientCommitment: true, actor: 'office_operator' }),
      })
      setScheduleReview(result.recommendation || scheduleReview)
      notify('Schedule approval was added to the ledger. The date remains uncommitted until it is resolved.')
      await Promise.all([refresh(), loadSelectedJob(selectedJobId)])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function recordWeatherAssessment(event) {
    event.preventDefault()
    const precipitationPercent = Number(weatherDraft.precipitationPercent)
    if (!selectedJobId || !Number.isFinite(precipitationPercent) || precipitationPercent < 0 || precipitationPercent > 100) {
      setError('Enter a precipitation risk from 0 to 100 before recording the weather assessment.')
      return
    }
    const plannedStartMs = Date.parse(scheduleDraft.plannedStart || '')
    const weatherTarget = Number.isFinite(plannedStartMs) ? new Date(plannedStartMs).toISOString() : null
    setSubmitting(true)
    try {
      const result = await api('/api/ledger/weather/assess', {
        method: 'POST',
        body: JSON.stringify({
          jobId: selectedJobId,
          condition: weatherDraft.condition,
          precipitationPercent,
          weatherSensitive: weatherDraft.weatherSensitive,
          ...(weatherTarget ? { forecastAt: weatherTarget, plannedStart: weatherTarget } : {}),
          actor: 'office_operator',
        }),
      })
      setScheduleReview(null)
      notify(`Weather assessment recorded: ${result.weather.recommendation}`)
      await Promise.all([refresh(), loadSelectedJob(selectedJobId)])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function createCommunicationDraft(event) {
    event.preventDefault()
    if (!selectedJobId || !communicationDraft.subject.trim() || !communicationDraft.body.trim()) {
      setError('Enter a subject and message before creating a client communication draft.')
      return
    }
    setSubmitting(true)
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/communication`, {
        method: 'POST',
        body: JSON.stringify({
          channel: communicationDraft.channel,
          direction: 'outbound',
          subject: communicationDraft.subject.trim(),
          body: communicationDraft.body.trim(),
          expectsReply: communicationDraft.expectsReply,
          actor: 'office_operator',
        }),
      })
      setCommunicationDraft({ channel: communicationDraft.channel, subject: '', body: '', expectsReply: true })
      notify(
        `Client ${communicationDraft.channel} draft created. Approval ${result.approval?.id ? 'is required before delivery' : 'status was recorded'}.`,
      )
      await Promise.all([refresh(), loadSelectedJob(selectedJobId)])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function requestClientPortalAccess(event) {
    event.preventDefault()
    if (!selectedJobId || !portalDraft.label.trim() || !portalDraft.expiresAt) {
      setError('Enter a portal label and future expiry before requesting client access.')
      return
    }
    setSubmitting(true)
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(selectedJobId)}/client-portal-access`, {
        method: 'POST',
        body: JSON.stringify({
          label: portalDraft.label.trim(),
          expiresAt: new Date(`${portalDraft.expiresAt}T23:59:59`).toISOString(),
          locale: portalDraft.locale,
          source: 'job_workspace',
          actor: 'office_operator',
        }),
      })
      setPortalLink(`${window.location.origin}/client-portal.html#token=${result.access.portalToken}`)
      notify('Client portal access is pending approval. The one-time link remains inactive until that approval is resolved.')
      await Promise.all([refresh(), loadSelectedJob(selectedJobId)])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function copyPortalLink() {
    if (!portalLink) return
    try {
      await navigator.clipboard.writeText(portalLink)
      notify('The client portal link was copied. Keep it secure until access is approved.')
    } catch {
      setError('The browser could not copy the portal link. Select and copy it manually before closing this workspace.')
    }
  }

  async function revokeClientPortalAccess(accessId) {
    setSubmitting(true)
    try {
      await api(`/api/ledger/client-portal-access/${encodeURIComponent(accessId)}/revoke`, {
        method: 'POST',
        body: JSON.stringify({ actor: 'office_operator' }),
      })
      notify('Client portal access was revoked and the link can no longer open the job portal.')
      await Promise.all([refresh(), loadSelectedJob(selectedJobId)])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function prepareDispatchPack(item) {
    if (!item?.jobId) {
      setError('The dispatch row is not linked to a retained ledger job.')
      return
    }
    setSubmitting(true)
    try {
      const result = await api('/api/ledger/schedule/prepare-dispatch', {
        method: 'POST',
        body: JSON.stringify({
          jobId: item.jobId,
          plannedStart: item.scheduledStart || item.targetCompletion || undefined,
          actor: 'office_operator',
        }),
      })
      const createdCount = result.created?.length || 0
      const skippedCount = result.skipped?.length || 0
      notify(
        createdCount
          ? `${createdCount} internal dispatch record(s) prepared; ${skippedCount} existing or inapplicable record(s) skipped.`
          : `Dispatch pack already retained; ${skippedCount} duplicate or inapplicable record(s) skipped.`,
      )
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function openResourcePlan(item) {
    const job = jobs.find((candidate) => candidate.id === item?.jobId)
    if (!job) {
      setError('The resource row is not linked to an available ledger job.')
      return
    }
    await openJobWorkspace(job)
    setShowResourcePlanner(true)
  }

  async function draftWorkerInstruction(item) {
    if (!item?.jobId) return
    const draftAction = item.nextActions?.find((action) => action.type === 'draft_worker_instruction')
    if (!draftAction) return
    setSubmitting(true)
    try {
      await api(`/api/ledger/jobs/${encodeURIComponent(item.jobId)}/worker-instructions`, {
        method: 'POST',
        body: JSON.stringify({
          assignmentId: draftAction?.assignmentId || item.latest?.assignment?.id,
          workerId: draftAction?.workerId || item.latest?.assignment?.workerId || null,
          audience: 'crew',
          channel: 'app',
          status: 'draft',
          title: `Crew brief: ${item.jobTitle || 'ledger job'}`,
          notes: 'Internal draft prepared from the retained job scope. Publishing remains approval-gated.',
          actor: 'office_operator',
        }),
      })
      notify(ot('Internal crew instructions were drafted. Nothing was published or delivered.'))
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function openWorkerEditor(worker = null) {
    workerDialogOpenerRef.current = document.activeElement
    setWorkerEditor(worker || { id: null })
    setWorkerDraft(emptyWorkerDraft(worker))
  }

  function closeWorkerEditor() {
    if (submitting) return
    const opener = workerDialogOpenerRef.current
    workerDialogOpenerRef.current = null
    setWorkerEditor(null)
    setWorkerDraft(emptyWorkerDraft())
    requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus()
    })
  }

  async function saveWorker(event) {
    event.preventDefault()
    if (workerDraft.name.trim().length < 2) {
      setError(ot('Record a crew member name with at least two characters before saving.'))
      return
    }
    setSubmitting(true)
    try {
      const editing = Boolean(workerDraft.id)
      const result = await api(editing ? `/api/ledger/workers/${encodeURIComponent(workerDraft.id)}` : '/api/ledger/workers', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify({
          name: workerDraft.name.trim(),
          role: workerDraft.role.trim() || null,
          status: workerDraft.status,
          email: workerDraft.email.trim() || null,
          phone: workerDraft.phone.trim() || null,
          homeRegion: workerDraft.homeRegion.trim() || null,
          hourlyRate: workerDraft.hourlyRate === '' ? 0 : Number(workerDraft.hourlyRate),
          skills: workerDraft.skills
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
          notes: workerDraft.notes.trim() || null,
          actor: 'office_operator',
        }),
      })
      setWorkerEditor(null)
      setWorkerDraft(emptyWorkerDraft())
      notify(ot('{name} retained as {status}. No schedule, payroll, or contact action was created.', {
        name: result.worker.name,
        status: formatStatus(result.worker.status),
      }))
      await refresh()
    } catch (requestError) {
      setError(ot(requestError.message))
    } finally {
      setSubmitting(false)
    }
  }

  function openWorkerRetirement(worker) {
    workerDialogOpenerRef.current = document.activeElement
    setWorkerRetirement(worker)
    setWorkerRetirementReason('')
  }

  function closeWorkerRetirement() {
    if (submitting) return
    const opener = workerDialogOpenerRef.current
    workerDialogOpenerRef.current = null
    setWorkerRetirement(null)
    setWorkerRetirementReason('')
    requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus()
    })
  }

  async function requestWorkerRetirement(event) {
    event.preventDefault()
    if (!workerRetirement || workerRetirementReason.trim().length < 8) return
    setSubmitting(true)
    try {
      const result = await api(`/api/ledger/workers/${encodeURIComponent(workerRetirement.id)}/retirement`, {
        method: 'POST',
        body: JSON.stringify({ reason: workerRetirementReason.trim(), actor: 'office_operator' }),
      })
      setWorkerRetirement(null)
      setWorkerRetirementReason('')
      notify(result.requiresApproval
        ? ot('Retirement approval requested for {name}. New assignments are now blocked.', { name: result.worker.name })
        : ot('{name} is already retired.', { name: result.worker.name }))
      await refresh()
    } catch (requestError) {
      setError(ot(requestError.message))
    } finally {
      setSubmitting(false)
    }
  }

  function openCredentialEditor(worker) {
    qualificationDialogOpenerRef.current = document.activeElement
    setCredentialEditor(worker)
    setCredentialDraft(emptyWorkerCredentialDraft(worker))
  }

  function closeCredentialEditor() {
    if (submitting) return
    const opener = qualificationDialogOpenerRef.current
    qualificationDialogOpenerRef.current = null
    setCredentialEditor(null)
    setCredentialDraft(emptyWorkerCredentialDraft())
    requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus()
    })
  }

  async function submitWorkerCredential(event) {
    event.preventDefault()
    if (!credentialEditor || credentialDraft.evidenceReference.trim().length < 4) return
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/workers/${encodeURIComponent(credentialEditor.id)}/credentials`, {
        method: 'POST',
        body: JSON.stringify({
          credentialType: credentialDraft.credentialType,
          title: credentialDraft.title.trim() || null,
          issuer: credentialDraft.issuer.trim() || null,
          credentialNumber: credentialDraft.credentialNumber.trim() || null,
          issuedOn: credentialDraft.issuedOn || null,
          expiresOn: credentialDraft.expiresOn || null,
          evidenceReference: credentialDraft.evidenceReference.trim(),
          actor: 'office_operator',
        }),
      })
      setCredentialEditor(null)
      setCredentialDraft(emptyWorkerCredentialDraft())
      setData((current) => current ? {
        ...current,
        workers: result.worker ? upsertById(current.workers, result.worker) : current.workers,
        qualificationRegister: result.qualificationRegister || current.qualificationRegister,
        dashboard: result.dashboard || current.dashboard,
      } : current)
      notify(result.replayed
        ? ot('The existing {title} review was reopened. No certificate was issued or renewed.', { title: result.credential.title })
        : ot('{title} evidence was retained for approval. It does not satisfy job readiness until verified.', { title: result.credential.title }))
    } catch (requestError) {
      setError(ot(requestError.message))
    } finally {
      setSubmitting(false)
    }
  }

  function openQualificationRequirementEditor() {
    qualificationDialogOpenerRef.current = document.activeElement
    const firstJob = (data?.jobs || EMPTY_LIST).find((job) => !['archived', 'cancelled', 'rejected'].includes(job.status)) || null
    setQualificationRequirementDraft(emptyQualificationRequirementDraft(firstJob))
    setQualificationRequirementEditor(true)
  }

  function closeQualificationRequirementEditor() {
    if (submitting) return
    const opener = qualificationDialogOpenerRef.current
    qualificationDialogOpenerRef.current = null
    setQualificationRequirementEditor(false)
    setQualificationRequirementDraft(emptyQualificationRequirementDraft())
    requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus()
    })
  }

  async function submitQualificationRequirement(event) {
    event.preventDefault()
    if (!qualificationRequirementDraft.jobId || !qualificationRequirementDraft.credentialType) return
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(qualificationRequirementDraft.jobId)}/qualification-requirements`, {
        method: 'POST',
        body: JSON.stringify({
          credentialType: qualificationRequirementDraft.credentialType,
          title: qualificationRequirementDraft.title.trim() || null,
          role: qualificationRequirementDraft.role.trim() || null,
          mandatory: qualificationRequirementDraft.mandatory,
          actor: 'office_operator',
        }),
      })
      setQualificationRequirementEditor(false)
      setQualificationRequirementDraft(emptyQualificationRequirementDraft())
      setData((current) => current ? {
        ...reconcileJobCollections(current, result.job),
        qualificationRegister: result.qualificationRegister || current.qualificationRegister,
        dashboard: result.dashboard || current.dashboard,
      } : current)
      notify(result.replayed
        ? ot('{title} is already enforced for this job and role.', { title: result.requirement.title })
        : ot('{title} is now enforced in assignment, dispatch, site-access, and attendance readiness.', { title: result.requirement.title }))
    } catch (requestError) {
      setError(ot(requestError.message))
    } finally {
      setSubmitting(false)
    }
  }

  function openQualificationRequirementRetirement(requirement) {
    qualificationDialogOpenerRef.current = document.activeElement
    setQualificationRequirementRetirement(requirement)
    setQualificationRequirementRetirementReason('')
  }

  function closeQualificationRequirementRetirement() {
    if (submitting) return
    const opener = qualificationDialogOpenerRef.current
    qualificationDialogOpenerRef.current = null
    setQualificationRequirementRetirement(null)
    setQualificationRequirementRetirementReason('')
    requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus()
    })
  }

  async function requestQualificationRequirementRetirement(event) {
    event.preventDefault()
    if (!qualificationRequirementRetirement || qualificationRequirementRetirementReason.trim().length < 8) return
    setSubmitting(true)
    setError('')
    try {
      const requirement = qualificationRequirementRetirement
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(requirement.jobId)}/qualification-requirements/${encodeURIComponent(requirement.id)}/retirement`, {
        method: 'POST',
        body: JSON.stringify({ reason: qualificationRequirementRetirementReason.trim(), actor: 'office_operator' }),
      })
      setQualificationRequirementRetirement(null)
      setQualificationRequirementRetirementReason('')
      setData((current) => current ? {
        ...reconcileJobCollections(current, result.job),
        qualificationRegister: result.qualificationRegister || current.qualificationRegister,
        dashboard: result.dashboard || current.dashboard,
      } : current)
      notify(ot('Removal approval requested for {title}. The requirement remains enforced until approval.', { title: result.requirement.title }))
    } catch (requestError) {
      setError(ot(requestError.message))
    } finally {
      setSubmitting(false)
    }
  }

  function openAvailabilityEditor(worker = null) {
    availabilityDialogOpenerRef.current = document.activeElement
    const firstWorker = worker || (data?.workers || EMPTY_LIST).find((item) => item.status !== 'retired') || null
    setAvailabilityDraft(emptyWorkerAvailabilityDraft(firstWorker))
    setAvailabilityEditor(true)
  }

  function closeAvailabilityEditor() {
    if (submitting) return
    const opener = availabilityDialogOpenerRef.current
    availabilityDialogOpenerRef.current = null
    setAvailabilityEditor(false)
    setAvailabilityDraft(emptyWorkerAvailabilityDraft())
    requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus()
    })
  }

  async function submitWorkerAvailability(event) {
    event.preventDefault()
    if (!availabilityDraft.workerId || !availabilityDraft.startsAt
      || (availabilityDraft.repeatWeekly && (!availabilityDraft.recurrenceUntil || !availabilityDraft.recurrenceDays.length))
      || (availabilityDraft.returnUnknown ? !availabilityDraft.reviewAt : !availabilityDraft.endsAt)) return
    setSubmitting(true)
    setError('')
    try {
      const recurrence = !availabilityDraft.returnUnknown && availabilityDraft.repeatWeekly ? {
        frequency: 'weekly', daysOfWeek: availabilityDraft.recurrenceDays,
        timeZone: availabilityDraft.recurrenceTimeZone, until: availabilityDraft.recurrenceUntil,
      } : null
      const result = await api(`/api/ledger/workers/${encodeURIComponent(availabilityDraft.workerId)}/availability`, {
        method: 'POST',
        body: JSON.stringify({
          periodType: availabilityDraft.periodType,
          title: availabilityDraft.title.trim() || null,
          startsAt: recurrence ? toIsoDateTimeInTimeZone(availabilityDraft.startsAt, recurrence.timeZone) : new Date(availabilityDraft.startsAt).toISOString(),
          endsAt: availabilityDraft.returnUnknown ? null : recurrence ? toIsoDateTimeInTimeZone(availabilityDraft.endsAt, recurrence.timeZone) : new Date(availabilityDraft.endsAt).toISOString(),
          returnUnknown: availabilityDraft.returnUnknown,
          reviewAt: availabilityDraft.returnUnknown ? availabilityDraft.reviewAt : null,
          ...(recurrence ? { recurrence } : {}),
          notes: availabilityDraft.notes.trim() || null,
          actor: 'office_operator',
        }),
      })
      setAvailabilityEditor(false)
      setAvailabilityDraft(emptyWorkerAvailabilityDraft())
      setData((current) => current ? {
        ...current,
        workers: result.worker ? upsertById(current.workers, result.worker) : current.workers,
        availabilityRegister: result.availabilityRegister || current.availabilityRegister,
        dashboard: result.dashboard || current.dashboard,
      } : current)
      const conflictCount = result.conflicts?.length || 0
      notify(result.replayed
        ? ot('{title} already exists with the same retained window.', { title: result.period.title })
        : conflictCount
          ? ot('{title} now blocks overlapping scheduling and exposes {count} assignment conflict(s).', { title: result.period.title, count: conflictCount })
          : ot('{title} now blocks overlapping scheduling.', { title: result.period.title }))
    } catch (requestError) {
      setError(ot(requestError.message))
    } finally {
      setSubmitting(false)
    }
  }

  function openAvailabilityCancellation(period) {
    availabilityDialogOpenerRef.current = document.activeElement
    setAvailabilityCancellation(period)
    setAvailabilityCancellationReason('')
  }

  function closeAvailabilityCancellation() {
    if (submitting) return
    const opener = availabilityDialogOpenerRef.current
    availabilityDialogOpenerRef.current = null
    setAvailabilityCancellation(null)
    setAvailabilityCancellationReason('')
    requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus()
    })
  }

  async function requestAvailabilityCancellation(event) {
    event.preventDefault()
    if (!availabilityCancellation || availabilityCancellationReason.trim().length < 8) return
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/workers/${encodeURIComponent(availabilityCancellation.workerId)}/availability/${encodeURIComponent(availabilityCancellation.id)}/cancellation`, {
        method: 'POST',
        body: JSON.stringify({ reason: availabilityCancellationReason.trim(), actor: 'office_operator' }),
      })
      setAvailabilityCancellation(null)
      setAvailabilityCancellationReason('')
      setData((current) => current ? {
        ...current,
        workers: result.worker ? upsertById(current.workers, result.worker) : current.workers,
        availabilityRegister: result.availabilityRegister || current.availabilityRegister,
        dashboard: result.dashboard || current.dashboard,
      } : current)
      notify(ot('Cancellation approval requested for {title}. The scheduling block remains active until approval.', { title: result.period.title }))
    } catch (requestError) {
      setError(ot(requestError.message))
    } finally {
      setSubmitting(false)
    }
  }

  async function requestAssignmentReplacement({ period, conflict, candidate, reason }) {
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(conflict.jobId)}/assignments/${encodeURIComponent(conflict.assignmentId)}/replacement`, {
        method: 'POST',
        body: JSON.stringify({ workerId: candidate.worker.id, availabilityPeriodId: period.id, reason, actor: 'office_operator' }),
      })
      setData((current) => current ? {
        ...current,
        availabilityRegister: result.availabilityRegister || current.availabilityRegister,
        dashboard: result.dashboard || current.dashboard,
      } : current)
      notify(ot('Pending approval.'))
      return true
    } catch (requestError) {
      setError(ot(requestError.message))
      return false
    } finally {
      setSubmitting(false)
    }
  }

  async function requestAvailabilityReplacementPlan({ period, selections, reason }) {
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/workers/${encodeURIComponent(period.workerId)}/availability/${encodeURIComponent(period.id)}/replacement-plan`, {
        method: 'POST',
        body: JSON.stringify({ assignments: selections, reason, actor: 'office_operator' }),
      })
      setData((current) => current ? {
        ...current,
        availabilityRegister: result.availabilityRegister || current.availabilityRegister,
        dashboard: result.dashboard || current.dashboard,
      } : current)
      notify(ot('Coordinated replacement plan submitted for approval. No assignment changes until it is approved.'))
      return true
    } catch (requestError) {
      setError(ot(requestError.message))
      return false
    } finally {
      setSubmitting(false)
    }
  }

  function openMaterialReceiptEditor(plan = null) {
    setMaterialReceiptDraft(emptyMaterialReceiptDraft(plan))
    setMaterialReceiptEditor(true)
  }

  function closeMaterialReceiptEditor() {
    if (submitting) return
    setMaterialReceiptEditor(false)
    setMaterialReceiptDraft(emptyMaterialReceiptDraft())
  }

  async function saveMaterialReceipt(event) {
    event.preventDefault()
    const lines = materialReceiptDraft.lines.map((line) => ({
      lineKey: line.lineKey || undefined,
      materialRequirementId: line.materialRequirementId || undefined,
      itemName: line.itemName.trim(),
      unit: line.unit.trim() || 'unit',
      receivedQuantity: Number(line.receivedQuantity),
      acceptedQuantity: Number(line.acceptedQuantity),
      damagedQuantity: Number(line.damagedQuantity || 0),
      notes: line.notes.trim() || null,
    }))
    const invalidLine = lines.find((line) => line.itemName.length < 2 || !(line.receivedQuantity > 0) || line.acceptedQuantity < 0
      || line.damagedQuantity < 0 || line.acceptedQuantity + line.damagedQuantity > line.receivedQuantity)
    if (!materialReceiptDraft.jobId || materialReceiptDraft.receiptReference.trim().length < 3
      || materialReceiptDraft.evidenceReference.trim().length < 3 || materialReceiptDraft.receivedBy.trim().length < 2 || invalidLine) {
      setError('Record the job, delivery reference, retained evidence, receiver, and a valid quantity breakdown for every line.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(materialReceiptDraft.jobId)}/material-receipts?compact=true`, {
        method: 'POST',
        body: JSON.stringify({
          entryKey: materialReceiptDraft.entryKey,
          purchaseOrderId: materialReceiptDraft.purchaseOrderId || null,
          receiptReference: materialReceiptDraft.receiptReference.trim(),
          evidenceReference: materialReceiptDraft.evidenceReference.trim(),
          deliveredAt: toIsoDateTime(materialReceiptDraft.deliveredAt),
          receivedBy: materialReceiptDraft.receivedBy.trim(),
          location: materialReceiptDraft.location.trim() || null,
          stockDestination: materialReceiptDraft.stockDestination,
          finalDelivery: materialReceiptDraft.finalDelivery,
          notes: materialReceiptDraft.notes.trim() || null,
          lines,
          actor: 'office_operator',
        }),
      })
      setMaterialReceiptEditor(false)
      setMaterialReceiptDraft(emptyMaterialReceiptDraft())
      setData((current) => {
        if (!current) return current
        const materialReceiving = current.materialReceiving || { receipts: [], purchaseOrders: [], actions: [], summary: {} }
        const receipts = [
          result.receipt,
          ...(materialReceiving.receipts || []).filter((receipt) => receipt.id !== result.receipt.id),
        ]
        return {
          ...current,
          materialReceiving: {
            ...materialReceiving,
            receipts,
            summary: {
              ...materialReceiving.summary,
              total: receipts.length,
              received: receipts.filter((receipt) => receipt.status === 'received').length,
              discrepancies: receipts.filter((receipt) => receipt.status === 'discrepancy').length,
              pendingReversal: receipts.filter((receipt) => receipt.status === 'pending_reversal').length,
            },
          },
        }
      })
      notify(result.replayed ? 'The matching delivery ticket was already retained; no duplicate was created.' : `Delivery ${result.receipt.receiptReference} retained as ${formatStatus(result.receipt.status)}.`)
      void refreshSection('resources', 'receiving')
    } catch (requestError) {
      setError(ot(requestError.message))
    } finally {
      setSubmitting(false)
    }
  }

  function openMaterialReceiptReversal(receipt) {
    setMaterialReceiptReversal(receipt)
    setMaterialReceiptReversalReason('')
  }

  async function requestMaterialReceiptReversal(event) {
    event.preventDefault()
    if (!materialReceiptReversal || materialReceiptReversalReason.trim().length < 8) return
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(materialReceiptReversal.jobId)}/material-receipts/${encodeURIComponent(materialReceiptReversal.id)}/reversal`, {
        method: 'POST',
        body: JSON.stringify({ reason: materialReceiptReversalReason.trim(), actor: 'office_operator' }),
      })
      setMaterialReceiptReversal(null)
      setMaterialReceiptReversalReason('')
      setData((current) => current ? { ...current, materialReceiving: result.materialReceiving || current.materialReceiving, dashboard: result.dashboard || current.dashboard } : current)
      notify('Receipt reversal approval requested. Accepted quantities remain active until an approver resolves it.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function openEquipmentEditor(tool = null) {
    equipmentDialogOpenerRef.current = document.activeElement
    setEquipmentEditor(tool || { id: null })
    setEquipmentDraft(emptyEquipmentDraft(tool))
  }

  function closeEquipmentEditor() {
    if (submitting) return
    const opener = equipmentDialogOpenerRef.current
    equipmentDialogOpenerRef.current = null
    setEquipmentEditor(null)
    setEquipmentDraft(emptyEquipmentDraft())
    requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus()
    })
  }

  async function saveEquipment(event) {
    event.preventDefault()
    if (equipmentDraft.name.trim().length < 2) {
      setError(ot('Record an equipment name with at least two characters before saving.'))
      return
    }
    if (equipmentDraft.inspectionRequired && !equipmentDraft.inspectionDueAt) {
      setError(ot('Record the next inspection due date before marking inspection as required.'))
      return
    }
    setSubmitting(true)
    try {
      const editing = Boolean(equipmentDraft.id)
      const result = await api(editing ? `/api/ledger/tools/${encodeURIComponent(equipmentDraft.id)}` : '/api/ledger/tools', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify({
          name: equipmentDraft.name.trim(),
          category: equipmentDraft.category.trim() || 'general',
          status: equipmentDraft.status,
          homeLocation: equipmentDraft.homeLocation.trim() || null,
          currentLocation: equipmentDraft.currentLocation.trim() || null,
          data: {
            serialNumber: equipmentDraft.serialNumber.trim() || null,
            inspectionRequired: equipmentDraft.inspectionRequired,
            inspectionDueAt: equipmentDraft.inspectionRequired ? equipmentDraft.inspectionDueAt || null : null,
            notes: equipmentDraft.notes.trim() || null,
          },
          actor: 'office_operator',
        }),
      })
      setEquipmentEditor(null)
      setEquipmentDraft(emptyEquipmentDraft())
      notify(ot('{name} retained as {status}. No dispatch, purchase, or assignment was created.', {
        name: result.tool.name,
        status: ot(result.tool.status.replaceAll('_', ' ')),
      }))
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function openEquipmentInspection(tool) {
    equipmentInspectionOpenerRef.current = document.activeElement
    setEquipmentInspection(tool)
    setEquipmentInspectionDraft(emptyEquipmentInspectionDraft())
  }

  function closeEquipmentInspection() {
    if (submitting) return
    const opener = equipmentInspectionOpenerRef.current
    equipmentInspectionOpenerRef.current = null
    setEquipmentInspection(null)
    setEquipmentInspectionDraft(emptyEquipmentInspectionDraft())
    requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus()
    })
  }

  async function recordEquipmentInspection(event) {
    event.preventDefault()
    if (!equipmentInspection || equipmentInspectionDraft.inspector.trim().length < 2) return
    const requiresNextDue = equipmentInspection.inspection?.required && equipmentInspectionDraft.result === 'passed'
    if (requiresNextDue && !equipmentInspectionDraft.nextDueAt) return
    if (equipmentInspectionDraft.result !== 'passed' && equipmentInspectionDraft.notes.trim().length < 8) return
    setSubmitting(true)
    try {
      const result = await api(`/api/ledger/tools/${encodeURIComponent(equipmentInspection.id)}/inspections`, {
        method: 'POST',
        body: JSON.stringify({
          result: equipmentInspectionDraft.result,
          inspector: equipmentInspectionDraft.inspector.trim(),
          inspectedAt: equipmentInspectionDraft.inspectedAt,
          nextDueAt: equipmentInspectionDraft.result === 'passed' ? equipmentInspectionDraft.nextDueAt || null : null,
          reference: equipmentInspectionDraft.reference.trim() || null,
          notes: equipmentInspectionDraft.notes.trim() || null,
          actor: 'office_operator',
        }),
      })
      setEquipmentInspection(null)
      setEquipmentInspectionDraft(emptyEquipmentInspectionDraft())
      notify(ot('{name} inspection retained as {result}. {readiness}', {
        name: result.tool.name,
        result: ot(result.inspection.result.replaceAll('_', ' ')),
        readiness: ot(result.reservationReady ? 'Inspection readiness is clear.' : 'New reservations remain blocked.'),
      }))
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function openEquipmentMaintenance(tool) {
    equipmentMaintenanceOpenerRef.current = document.activeElement
    setEquipmentMaintenance(tool)
    setEquipmentMaintenanceDraft(emptyEquipmentMaintenanceDraft())
  }

  function closeEquipmentMaintenance() {
    if (submitting) return
    const opener = equipmentMaintenanceOpenerRef.current
    equipmentMaintenanceOpenerRef.current = null
    setEquipmentMaintenance(null)
    setEquipmentMaintenanceDraft(emptyEquipmentMaintenanceDraft())
    requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus()
    })
  }

  async function recordEquipmentMaintenance(event) {
    event.preventDefault()
    if (
      !equipmentMaintenance ||
      equipmentMaintenanceDraft.performedBy.trim().length < 2 ||
      equipmentMaintenanceDraft.notes.trim().length < 8
    )
      return
    setSubmitting(true)
    try {
      const result = await api(`/api/ledger/tools/${encodeURIComponent(equipmentMaintenance.id)}/maintenance`, {
        method: 'POST',
        body: JSON.stringify({
          outcome: equipmentMaintenanceDraft.outcome,
          maintenanceType: equipmentMaintenanceDraft.maintenanceType,
          performedBy: equipmentMaintenanceDraft.performedBy.trim(),
          performedAt: equipmentMaintenanceDraft.performedAt,
          reference: equipmentMaintenanceDraft.reference.trim() || null,
          notes: equipmentMaintenanceDraft.notes.trim(),
          actor: 'office_operator',
        }),
      })
      setEquipmentMaintenance(null)
      setEquipmentMaintenanceDraft(emptyEquipmentMaintenanceDraft())
      notify(result.reinspectionRequired
        ? ot('{name} maintenance retained as completed. A passing reinspection is required before a new reservation.', {
            name: result.tool.name,
          })
        : ot('{name} maintenance retained as {outcome}. {readiness}', {
            name: result.tool.name,
            outcome: ot(result.maintenance.outcome.replaceAll('_', ' ')),
            readiness: ot(result.reservationReady ? 'Equipment readiness is clear.' : 'New reservations remain blocked.'),
          }))
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function openEquipmentRetirement(tool) {
    equipmentDialogOpenerRef.current = document.activeElement
    setEquipmentRetirement(tool)
    setEquipmentRetirementReason('')
  }

  function closeEquipmentRetirement() {
    if (submitting) return
    const opener = equipmentDialogOpenerRef.current
    equipmentDialogOpenerRef.current = null
    setEquipmentRetirement(null)
    setEquipmentRetirementReason('')
    requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus()
    })
  }

  async function requestEquipmentRetirement(event) {
    event.preventDefault()
    if (!equipmentRetirement || equipmentRetirementReason.trim().length < 8) return
    setSubmitting(true)
    try {
      const result = await api(`/api/ledger/tools/${encodeURIComponent(equipmentRetirement.id)}/retirement`, {
        method: 'POST',
        body: JSON.stringify({ reason: equipmentRetirementReason.trim(), actor: 'office_operator' }),
      })
      setEquipmentRetirement(null)
      setEquipmentRetirementReason('')
      notify(result.requiresApproval
        ? ot('Retirement approval requested for {name}. New reservations are now blocked.', { name: result.tool.name })
        : ot('{name} is already retired.', { name: result.tool.name }))
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function openTradePartnerEditor(partner = null) {
    setTradePartnerEditor(partner || { id: null })
    setTradePartnerDraft(emptyTradePartnerDraft(partner))
  }

  function closeTradePartnerEditor() {
    if (submitting) return
    setTradePartnerEditor(null)
    setTradePartnerDraft(emptyTradePartnerDraft())
  }

  async function saveTradePartner(event) {
    event.preventDefault()
    if (!tradePartnerDraft.name.trim()) {
      setError('Record the trade partner name before saving.')
      return
    }
    setSubmitting(true)
    try {
      const editing = Boolean(tradePartnerDraft.id)
      const result = await api(
        editing ? `/api/ledger/trade-partners/${encodeURIComponent(tradePartnerDraft.id)}` : '/api/ledger/trade-partners',
        {
          method: editing ? 'PUT' : 'POST',
          body: JSON.stringify({
            ...tradePartnerDraft,
            name: tradePartnerDraft.name.trim(),
            contactName: tradePartnerDraft.contactName.trim() || null,
            email: tradePartnerDraft.email.trim() || null,
            phone: tradePartnerDraft.phone.trim() || null,
            city: tradePartnerDraft.city.trim() || null,
            registrationNumber: tradePartnerDraft.registrationNumber.trim() || null,
            vatNumber: tradePartnerDraft.vatExempt ? null : tradePartnerDraft.vatNumber.trim() || null,
            specialties: tradePartnerDraft.specialties
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean),
            insuranceExpiresAt: tradePartnerDraft.insuranceExpiresAt || null,
            vcaExpiresAt: tradePartnerDraft.vcaExpiresAt || null,
            verificationReference: tradePartnerDraft.verificationReference.trim() || null,
            verifiedAt: tradePartnerDraft.verifiedAt || null,
            notes: tradePartnerDraft.notes.trim() || null,
            actor: 'office_operator',
          }),
        },
      )
      setTradePartnerEditor(null)
      setTradePartnerDraft(emptyTradePartnerDraft())
      notify(`${result.partner.name} retained with ${formatStatus(result.partner.compliance.status)} compliance status.`)
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function openTradePartnerRetirement(partner) {
    setTradePartnerRetirement(partner)
    setTradePartnerRetirementReason('')
  }

  function closeTradePartnerRetirement() {
    if (submitting) return
    setTradePartnerRetirement(null)
    setTradePartnerRetirementReason('')
  }

  async function requestTradePartnerRetirement(event) {
    event.preventDefault()
    if (!tradePartnerRetirement || tradePartnerRetirementReason.trim().length < 8) return
    setSubmitting(true)
    try {
      const result = await api(`/api/ledger/trade-partners/${encodeURIComponent(tradePartnerRetirement.id)}/retirement`, {
        method: 'POST',
        body: JSON.stringify({ reason: tradePartnerRetirementReason.trim(), actor: 'office_operator' }),
      })
      setTradePartnerRetirement(null)
      setTradePartnerRetirementReason('')
      notify(
        result.requiresApproval
          ? `Retirement approval requested for ${result.partner.name}. Existing purchasing records remain retained.`
          : `${result.partner.name} is already retired.`,
      )
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function openTradePartnerDirectory() {
    closeResourceControl()
    sectionRef.current = 'resources'
    setSection('resources')
    selectResourceView('partners')
  }

  async function prepareLoadingChecklist(item) {
    if (!item?.jobId || item.counts?.loadingPlans) return
    setSubmitting(true)
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(item.jobId)}/loading-plans`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'draft',
          vehicle: 'Vehicle assignment pending',
          notes: 'Internal loading checklist prepared from retained material and equipment requirements.',
          actor: 'office_operator',
        }),
      })
      const itemCount = result.loadingPlan?.data?.readiness?.itemCounts?.total || 0
      notify(`Loading checklist retained with ${itemCount} item(s). No vehicle or dispatch commitment was made.`)
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function draftProcurementOrder(item) {
    if (!item?.jobId || item.counts?.procurementOrders) return
    const materials = (item.materials || []).map((material) => ({
      name: material.name,
      quantity: material.quantity,
      unit: material.unit,
      unitCost: material.cost,
      supplier: material.supplier,
    }))
    const supplierName = materials.find((material) => material.supplier)?.supplier || ''
    const tradePartner = tradePartners.find(
      (partner) => partner.status === 'active' && partner.name.toLowerCase() === supplierName.toLowerCase(),
    )
    setSubmitting(true)
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(item.jobId)}/procurement-orders`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'draft',
          requiresApproval: true,
          items: materials,
          supplier: tradePartner?.name || supplierName || null,
          tradePartnerId: tradePartner?.id || null,
          amount: item.money?.materialCost || 0,
          requiredBy: item.scheduledStart || item.targetCompletion,
          notes: 'Approval-gated procurement draft. No supplier order or spending commitment has been made.',
          actor: 'office_operator',
        }),
      })
      notify(
        `Procurement draft retained for ${currency.format(result.procurementOrder?.amount || 0)}. Approval is required before supplier commitment.`,
      )
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function openResourceControl(item, action) {
    if (!item?.jobId || !action?.type || !RESOURCE_ACTION_LABELS[action.type]) {
      setError('The resource action is not linked to a supported ledger workflow.')
      return
    }
    const material = item.materials?.find((candidate) => candidate.id === action.materialRequirementId) || item.latest?.material || null
    const workerName = action.workerName || item.latest?.assignment?.workerName || item.workers?.[0]?.name || ''
    const procurementOrder = action.recordType === 'procurement_order' ? action.record : null
    const matchedPartner =
      tradePartners.find((partner) => partner.id === procurementOrder?.tradePartnerId) ||
      tradePartners.find((partner) => partner.name.toLowerCase() === String(procurementOrder?.supplier || '').toLowerCase())
    setResourceAction({ item, action, material, procurementOrder, label: RESOURCE_ACTION_LABELS[action.type] })
    setResourceActionDraft({
      ...emptyResourceActionDraft(),
      workerName,
      company: item.latest?.orientation?.company || action.company || 'Internal crew',
      rate: String(item.latest?.assignment?.hourlyRate || 52),
      availableQuantity: material?.quantity != null ? String(material.quantity) : '',
      expectedAvailableAt: material?.data?.expectedAvailableAt ? toLocalDateTimeInput(material.data.expectedAvailableAt) : '',
      location: material?.data?.location || '',
      reference: item.latest?.orientation?.data?.verificationReference || material?.data?.verificationReference || '',
      supplier: matchedPartner?.name || procurementOrder?.supplier || '',
      tradePartnerId: matchedPartner?.id || '',
      amount: procurementOrder?.amount != null ? String(procurementOrder.amount) : '',
      requiredBy: procurementOrder?.requiredBy ? String(procurementOrder.requiredBy).slice(0, 10) : futureDateInput(7),
    })
  }

  function reviewCrewEvidence(item, action) {
    if (!item?.jobId || !action?.recordType || !action?.recordId) {
      setError('The crew evidence action is not linked to a retained assignment record.')
      return
    }
    openFieldReview(item, {
      type: action.recordType,
      recordId: action.recordId,
      record: action.record,
      label: action.label,
      status: action.targetStatus,
    })
  }

  function closeResourceControl() {
    setResourceAction(null)
    setResourceActionDraft(emptyResourceActionDraft())
  }

  async function submitResourceControl(event) {
    event.preventDefault()
    const type = resourceAction?.action?.type
    const jobId = resourceAction?.item?.jobId
    const notes = resourceActionDraft.notes.trim()
    const reference = resourceActionDraft.reference.trim()
    const workerName = resourceActionDraft.workerName.trim()
    if (!jobId || !type || !notes) {
      setError('Record the internal resource evidence before continuing.')
      return
    }

    let route = ''
    let method = 'POST'
    let body = {}
    if (type === 'complete_worker_orientation') {
      if (!workerName || !reference) {
        setError('Worker name and orientation verification reference are required.')
        return
      }
      const orientationId = resourceAction.action.orientationId
      route = orientationId
        ? `/api/ledger/jobs/${encodeURIComponent(jobId)}/lifecycle/orientation/${encodeURIComponent(orientationId)}`
        : `/api/ledger/jobs/${encodeURIComponent(jobId)}/orientations`
      method = orientationId ? 'PATCH' : 'POST'
      body = {
        status: 'completed',
        requiresApproval: true,
        grantsAccess: true,
        assignmentId: resourceAction.action.assignmentId || null,
        workerId: resourceAction.action.workerId || null,
        workerName,
        company: resourceActionDraft.company.trim() || 'Internal crew',
        completedAt: new Date().toISOString(),
        verificationReference: reference,
        topics: ['Site rules', 'PPE and VCA controls', 'Emergency and stop-work procedure'],
        notes,
      }
    } else if (type === 'prepare_site_access') {
      if (!workerName || !resourceAction.action.orientationId) {
        setError('A current worker and approved orientation are required before preparing site access.')
        return
      }
      route = `/api/ledger/jobs/${encodeURIComponent(jobId)}/site-access?compact=true`
      body = {
        assignmentId: resourceAction.action.assignmentId || null,
        workerId: resourceAction.action.workerId || null,
        orientationId: resourceAction.action.orientationId,
        workerName,
        company: resourceActionDraft.company.trim() || 'Internal crew',
        status: 'blocked',
        orientationValid: true,
        accessPoint: 'Main site access',
        notes,
      }
    } else if (type === 'record_time_log') {
      const hours = Number(resourceActionDraft.hours)
      const rate = Number(resourceActionDraft.rate)
      if (!workerName || !resourceActionDraft.workDate || !(hours > 0 && hours <= 24) || !Number.isFinite(rate) || rate < 0) {
        setError('Record a worker, date, positive hours up to 24, and a non-negative rate.')
        return
      }
      route = `/api/ledger/jobs/${encodeURIComponent(jobId)}/time-logs`
      body = {
        workerId: resourceAction.action.workerId || null,
        workerName,
        workDate: resourceActionDraft.workDate,
        hours,
        billable: true,
        rate,
        status: 'submitted',
        costCode: resourceActionDraft.costCode.trim() || 'labor',
        verificationReference: reference || null,
        notes,
      }
    } else if (type === 'request_procurement_approval') {
      const procurementOrderId = resourceAction.action.procurementOrderId || resourceAction.procurementOrder?.id
      const amount = Number(resourceActionDraft.amount)
      if (
        !procurementOrderId ||
        !resourceActionDraft.tradePartnerId ||
        !resourceActionDraft.supplier.trim() ||
        !(amount > 0) ||
        !resourceActionDraft.requiredBy
      ) {
        setError('Select a retained trade partner, positive order value, and required-by date before requesting approval.')
        return
      }
      route = `/api/ledger/jobs/${encodeURIComponent(jobId)}/procurement-orders/${encodeURIComponent(procurementOrderId)}/request-approval`
      body = {
        supplier: resourceActionDraft.supplier.trim(),
        tradePartnerId: resourceActionDraft.tradePartnerId,
        amount: roundMoney(amount),
        requiredBy: new Date(`${resourceActionDraft.requiredBy}T23:59:59`).toISOString(),
        notes,
      }
    } else if (type === 'review_material_status') {
      const materialRequirementId = resourceAction.action.materialRequirementId || resourceAction.material?.id
      const availableQuantity = Number(resourceActionDraft.availableQuantity)
      const requiresStock = ['available', 'received', 'allocated', 'loaded', 'used'].includes(resourceActionDraft.materialStatus)
      if (!materialRequirementId || !Number.isFinite(availableQuantity) || availableQuantity < 0
        || (requiresStock && availableQuantity <= 0) || (availableQuantity > 0 && !resourceActionDraft.location.trim()) || !reference) {
        setError('Record the retained material quantity and an evidence or order reference; positive stock also needs a location.')
        return
      }
      if (resourceActionDraft.expectedAvailableAt && !reference) {
        setError('An evidence or order reference is required for an expected availability date.')
        return
      }
      route = `/api/ledger/jobs/${encodeURIComponent(jobId)}/materials/${encodeURIComponent(materialRequirementId)}/status`
      method = 'PATCH'
      body = {
        status: resourceActionDraft.materialStatus,
        availableQuantity,
        expectedAvailableAt: resourceActionDraft.expectedAvailableAt ? new Date(resourceActionDraft.expectedAvailableAt).toISOString() : null,
        location: resourceActionDraft.location.trim(),
        verificationReference: reference,
        notes,
      }
    }

    if (!route) {
      setError('This resource action is not available in the current ledger runtime.')
      return
    }

    setSubmitting(true)
    try {
      const result = await api(route, { method, body: JSON.stringify({ ...body, actor: 'office_operator' }) })
      let successMessage = ''
      if (type === 'complete_worker_orientation') {
        successMessage = 'Orientation completion evidence retained for approval. Site access remains blocked until review.'
      } else if (type === 'prepare_site_access') {
        successMessage = 'The assignment-scoped site-access gate was retained. Clearance still requires explicit approval.'
      } else if (type === 'request_procurement_approval') {
        successMessage = `Procurement approval requested for ${currency.format(result.procurementOrder?.amount || 0)}. No supplier order or spend commitment was made.`
      } else if (type === 'record_time_log') {
        successMessage = 'Worker time was recorded in the retained job ledger.'
      } else {
        successMessage = `${formatStatus(result.materialRequirement?.status)} material evidence retained. No supplier order or spend commitment was made.`
      }
      closeResourceControl()
      const originatingSection = sectionRef.current
      await refreshSection(
        originatingSection === 'dispatch' ? 'dispatch' : 'resources',
        resourceViewRef.current,
      )
      notify(successMessage)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function openInvoiceDraft(item, action = null) {
    if (!item?.jobId) {
      setError('The finance row is not linked to a retained ledger job.')
      return
    }
    setSubmitting(true)
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(item.jobId)}`)
      const quote =
        result.job?.quotes?.find((candidate) => !['cancelled', 'rejected', 'expired'].includes(candidate.status)) || result.job?.quotes?.[0]
      const milestone = action?.billingMilestoneId
        ? result.job?.billingMilestones?.find((candidate) => candidate.id === action.billingMilestoneId)
        : null
      const amount = Math.max(
        0,
        Number(milestone?.amount ?? action?.amount ?? item.money?.invoiceDraftAmount ?? quote?.subtotal ?? item.money?.contractValue ?? 0),
      )
      const client = result.job?.client || {}
      setInvoiceJob({ ...item, billingMilestone: milestone || null })
      setInvoiceDraft({
        ...emptyInvoiceDraft(),
        billingMilestoneId: milestone?.id || '',
        amount: amount ? amount.toFixed(2) : '',
        taxRate: milestone?.taxRate != null ? String(milestone.taxRate) : quote?.taxRate != null ? String(quote.taxRate) : '21',
        dueAt: milestone?.dueAt ? String(milestone.dueAt).slice(0, 10) : futureDateInput(14),
        peppolReady: true,
        buyerLegalName: client.company || client.name || item.clientName || '',
        buyerRegistrationNumber: client.data?.registrationNumber || '',
        buyerEndpointScheme: client.data?.electronicAddressScheme || '0106',
        buyerEndpointId: client.data?.electronicAddress || '',
        buyerAddress: client.address || result.job?.address || '',
        buyerPostalCode: client.data?.postalCode || '',
        buyerCity: client.city || result.job?.city || '',
        buyerCountry: client.country || result.job?.country || 'NL',
        notes: milestone
          ? `Approval-gated invoice draft derived from billing milestone ${milestone.sequenceNumber}: ${milestone.title}. No invoice has been issued or sent.`
          : 'Approval-gated invoice draft prepared from retained quote or contract value. No invoice has been issued or sent.',
      })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function closeInvoiceDraft() {
    setInvoiceJob(null)
    setInvoiceDraft(emptyInvoiceDraft())
  }

  async function createInvoiceDraft(event) {
    event.preventDefault()
    const amount = Number(invoiceDraft.amount)
    const taxRate = Number(invoiceDraft.taxRate)
    if (
      !invoiceJob?.jobId ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isFinite(taxRate) ||
      taxRate < 0 ||
      taxRate > 100 ||
      !invoiceDraft.dueAt
    ) {
      setError('Enter a positive invoice amount, a VAT rate from 0 to 100, and a due date.')
      return
    }
    if (
      invoiceDraft.peppolReady &&
      (!invoiceDraft.buyerLegalName.trim() ||
        !invoiceDraft.buyerAddress.trim() ||
        !invoiceDraft.buyerPostalCode.trim() ||
        !invoiceDraft.buyerCity.trim() ||
        !/^[A-Za-z]{2}$/.test(invoiceDraft.buyerCountry.trim()) ||
        !invoiceDraft.buyerEndpointScheme.trim() ||
        !invoiceDraft.buyerEndpointId.trim() ||
        (!invoiceDraft.buyerReference.trim() && !invoiceDraft.purchaseOrderReference.trim()))
    ) {
      setError('Complete the buyer identity, address, electronic endpoint, and buyer or order reference for the requested UBL export.')
      return
    }
    const taxAmount = roundMoney((amount * taxRate) / 100)
    const total = roundMoney(amount + taxAmount)
    setSubmitting(true)
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(invoiceJob.jobId)}/invoices`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'draft',
          currency: 'EUR',
          amount: roundMoney(amount),
          billingMilestoneId: invoiceDraft.billingMilestoneId || null,
          taxAmount,
          total,
          dueAt: new Date(`${invoiceDraft.dueAt}T23:59:59`).toISOString(),
          peppolReady: invoiceDraft.peppolReady,
          structuredExportRequested: invoiceDraft.peppolReady,
          buyerReference: invoiceDraft.buyerReference.trim(),
          purchaseOrderReference: invoiceDraft.purchaseOrderReference.trim(),
          buyerLegalName: invoiceDraft.buyerLegalName.trim(),
          buyerRegistrationNumber: invoiceDraft.buyerRegistrationNumber.trim(),
          buyerEndpointScheme: invoiceDraft.peppolReady ? invoiceDraft.buyerEndpointScheme.trim() : '',
          buyerEndpointId: invoiceDraft.peppolReady ? invoiceDraft.buyerEndpointId.trim() : '',
          buyerAddress: invoiceDraft.buyerAddress.trim(),
          buyerPostalCode: invoiceDraft.buyerPostalCode.trim(),
          buyerCity: invoiceDraft.buyerCity.trim(),
          buyerCountry: invoiceDraft.buyerCountry.trim().toUpperCase(),
          notes: invoiceDraft.notes.trim(),
          actor: 'office_operator',
        }),
      })
      notify(
        `Invoice draft retained for ${currency.format(total)}. Approval ${result.invoice?.approvalId ? 'is required before issue or delivery' : 'status needs review'}.`,
      )
      closeInvoiceDraft()
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function prepareFinancePackage(item, action) {
    const creditNotePackage = action?.type === 'prepare_credit_note_package'
    const purchaseOrderPackage = action?.type === 'prepare_purchase_order_package'
    const sourceId = purchaseOrderPackage ? action?.purchaseOrderId : creditNotePackage ? action?.creditNoteId : action?.invoiceId
    const sourceLabel = purchaseOrderPackage ? 'purchase order' : creditNotePackage ? 'credit note' : 'invoice'
    if (!item?.jobId || !sourceId) {
      setError(`The approved ${sourceLabel} is not linked to a retained finance row.`)
      return
    }
    setSubmitting(true)
    try {
      const route = purchaseOrderPackage
        ? `/api/ledger/jobs/${encodeURIComponent(item.jobId)}/purchase-orders/${encodeURIComponent(action.purchaseOrderId)}/issue-package`
        : creditNotePackage
          ? `/api/ledger/jobs/${encodeURIComponent(item.jobId)}/credit-notes/${encodeURIComponent(action.creditNoteId)}/issue-package`
          : `/api/ledger/jobs/${encodeURIComponent(item.jobId)}/invoices/${encodeURIComponent(action.invoiceId)}/issue-package`
      const result = await api(route, {
        method: 'POST',
        body: JSON.stringify({
          actor: 'office_operator',
          ...(purchaseOrderPackage ? { recipient: action.recipient || undefined, channel: 'email' } : {}),
        }),
      })
      if (purchaseOrderPackage) {
        notify(
          `Purchase order ${result.issueReference} retained with HTML and generic OASIS UBL 2.1 attachments. Transmission still requires approval and a verified provider receipt.`,
        )
      } else {
        notify(
          `${creditNotePackage ? 'Credit note' : 'Invoice'} ${result.issueReference} retained with ${result.structuredExportIncluded ? 'HTML and UBL attachments' : 'a human-readable attachment'}. ${creditNotePackage ? 'The receivable was adjusted; delivery' : 'Delivery'} still requires approval and a verified receipt.`,
        )
      }
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function openEquipmentCheckout() {
    equipmentDialogOpenerRef.current = document.activeElement
    setEquipmentCheckoutEditor(true)
    setEquipmentCheckoutDraft(emptyEquipmentCheckoutDraft())
    setEquipmentCheckoutPlans([])
  }

  function closeEquipmentCheckout() {
    if (submitting) return
    const opener = equipmentDialogOpenerRef.current
    equipmentDialogOpenerRef.current = null
    setEquipmentCheckoutEditor(false)
    setEquipmentCheckoutDraft(emptyEquipmentCheckoutDraft())
    setEquipmentCheckoutPlans([])
    requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus()
    })
  }

  async function selectEquipmentCheckoutJob(jobId) {
    const initial = { ...emptyEquipmentCheckoutDraft(), jobId }
    setEquipmentCheckoutDraft(initial)
    setEquipmentCheckoutPlans([])
    if (!jobId) return
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(jobId)}/equipment-custody-plan`)
      const plans = result.plans || []
      setEquipmentCheckoutPlans(plans)
      const firstReady = plans.find(plan => plan.checkoutReady)
      if (firstReady) {
        setEquipmentCheckoutDraft({
          ...emptyEquipmentCheckoutDraft(firstReady),
          jobId,
          location: firstReady.tool?.currentLocation || '',
        })
      }
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function selectEquipmentCheckoutPlan(reservationId) {
    const plan = equipmentCheckoutPlans.find(item => item.reservation?.id === reservationId)
    if (!plan) {
      setEquipmentCheckoutDraft({ ...emptyEquipmentCheckoutDraft(), jobId: equipmentCheckoutDraft.jobId })
      return
    }
    setEquipmentCheckoutDraft({
      ...emptyEquipmentCheckoutDraft(plan),
      jobId: equipmentCheckoutDraft.jobId,
      location: plan.tool?.currentLocation || '',
    })
  }

  async function saveEquipmentCheckout(event) {
    event.preventDefault()
    const meter = equipmentCheckoutDraft.meter === '' ? null : Number(equipmentCheckoutDraft.meter)
    if (!equipmentCheckoutDraft.jobId || !equipmentCheckoutDraft.reservationId || equipmentCheckoutDraft.checkedOutBy.trim().length < 2
      || equipmentCheckoutDraft.evidenceReference.trim().length < 3 || (meter !== null && (!Number.isFinite(meter) || meter < 0))) {
      setError(ot('Choose a checkout-ready reservation and retain the custodian, handoff evidence, and a valid meter value.'))
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(equipmentCheckoutDraft.jobId)}/equipment-custody/check-out`, {
        method: 'POST',
        body: JSON.stringify({
          reservationId: equipmentCheckoutDraft.reservationId,
          checkedOutAt: toIsoDateTime(equipmentCheckoutDraft.checkedOutAt),
          dueBackAt: equipmentCheckoutDraft.dueBackAt ? toIsoDateTime(equipmentCheckoutDraft.dueBackAt) : null,
          checkedOutBy: equipmentCheckoutDraft.checkedOutBy.trim(),
          condition: equipmentCheckoutDraft.condition,
          location: equipmentCheckoutDraft.location.trim() || null,
          meter,
          evidenceReference: equipmentCheckoutDraft.evidenceReference.trim(),
          entryKey: equipmentCheckoutDraft.entryKey,
          notes: equipmentCheckoutDraft.notes.trim() || null,
          actor: 'office_operator',
        }),
      })
      setEquipmentCheckoutEditor(false)
      setEquipmentCheckoutDraft(emptyEquipmentCheckoutDraft())
      setEquipmentCheckoutPlans([])
      setData((current) => current ? {
        ...current,
        equipmentCustody: result.equipmentCustody || current.equipmentCustody,
        dashboard: result.dashboard || current.dashboard,
      } : current)
      notify(result.replayed
        ? ot('This equipment handoff was already retained; no duplicate custody session was created.')
        : ot('{name} checked out to {custodian}.', {
            name: result.custody.toolName,
            custodian: result.custody.checkedOutBy,
          }))
      await refreshSection('resources', 'equipment')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function openEquipmentReturn(session) {
    equipmentDialogOpenerRef.current = document.activeElement
    setEquipmentReturnEditor(session)
    setEquipmentReturnDraft(emptyEquipmentReturnDraft(session))
  }

  function closeEquipmentReturn() {
    if (submitting) return
    const opener = equipmentDialogOpenerRef.current
    equipmentDialogOpenerRef.current = null
    setEquipmentReturnEditor(null)
    setEquipmentReturnDraft(emptyEquipmentReturnDraft())
    requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus()
    })
  }

  async function saveEquipmentReturn(event) {
    event.preventDefault()
    const meter = equipmentReturnDraft.meter === '' ? null : Number(equipmentReturnDraft.meter)
    const exceptional = ['damaged', 'unsafe', 'lost'].includes(equipmentReturnDraft.condition)
    if (!equipmentReturnEditor || equipmentReturnDraft.returnedBy.trim().length < 2
      || equipmentReturnDraft.evidenceReference.trim().length < 3 || (meter !== null && (!Number.isFinite(meter) || meter < 0))
      || (exceptional && equipmentReturnDraft.notes.trim().length < 8)) {
      setError(ot('Retain the returning person, condition evidence, a valid meter, and findings for damaged, unsafe, or lost equipment.'))
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(equipmentReturnDraft.jobId)}/equipment-custody/${encodeURIComponent(equipmentReturnDraft.custodySessionId)}/return`, {
        method: 'POST',
        body: JSON.stringify({
          returnedAt: toIsoDateTime(equipmentReturnDraft.returnedAt),
          returnedBy: equipmentReturnDraft.returnedBy.trim(),
          condition: equipmentReturnDraft.condition,
          location: equipmentReturnDraft.location.trim() || null,
          meter,
          evidenceReference: equipmentReturnDraft.evidenceReference.trim(),
          entryKey: equipmentReturnDraft.entryKey,
          notes: equipmentReturnDraft.notes.trim() || null,
          actor: 'office_operator',
        }),
      })
      setEquipmentReturnEditor(null)
      setEquipmentReturnDraft(emptyEquipmentReturnDraft())
      setData((current) => current ? {
        ...current,
        equipmentCustody: result.equipmentCustody || current.equipmentCustody,
        dashboard: result.dashboard || current.dashboard,
      } : current)
      notify(result.replayed
        ? ot('This equipment return was already retained; no duplicate evidence was created.')
        : exceptional
          ? ot('{name} returned as {condition} and moved to quarantine review.', {
              name: result.custody.toolName,
              condition: ot(result.custody.returnCondition.replaceAll('_', ' ')),
            })
          : ot('{name} returned and released for availability.', { name: result.custody.toolName }))
      await refreshSection('resources', 'equipment')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function requestCostForecastSnapshot(item) {
    if (!item?.jobId) {
      setError(ot('The cost forecast is not linked to a retained job.'))
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(item.jobId)}/cost-forecast/snapshots`, {
        method: 'POST',
        body: JSON.stringify({ actor: 'office_operator' }),
      })
      notify(
        result.replayed
          ? ot('Cost forecast {number} is already awaiting approval.', { number: result.snapshot?.forecastNumber || '' })
          : ot('Cost forecast {number} retained from the current cost-code evidence. Approval is required before it becomes the active forecast.', {
              number: result.snapshot?.forecastNumber || '',
            }),
      )
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function openFinanceControl(item, action) {
    if (!item?.jobId || !action?.type || !FINANCE_ACTION_LABELS[action.type]) {
      setError(ot('The finance action is not linked to a supported ledger workflow.'))
      return
    }
    if (action.type === 'record_purchase_order_delivery') {
      if (!action.communicationId || !action.purchaseOrderId) {
        setError('The approved purchase-order delivery is missing its retained communication link.')
        return
      }
      setFinanceOrderDelivery({ item, action })
      setFinanceOrderDeliveryDraft(emptyBidOrderDeliveryDraft())
      return
    }
    if (action.type === 'prepare_cost_forecast') {
      void requestCostForecastSnapshot(item)
      return
    }
    const paymentAmount = Number(
      action.availableAmount ||
        action.outstandingAmount ||
        item.money?.unpaidValue ||
        item.latest?.payment?.amount ||
        item.latest?.invoice?.total ||
        0,
    )
    const creditNoteAmount = Number(action.availableNetAmount || 0)
    const contractAmount = Number(item.money?.contractValue || item.money?.quotedNetValue || 0)
    const drawAmount = Number(item.latest?.invoice?.total || item.money?.invoiceValue || item.money?.unpaidValue || 0)
    const supplierInvoiceAmount = Number(action.committedAmount || 0)
    const suggestedMaterialReceipt = action.type === 'record_supplier_invoice'
      ? (action.materialReceipts || []).find((receipt) => receipt.status === 'received') || null
      : null
    const amount =
      action.type === 'request_expense_reversal'
        ? Number(action.totalAmount || action.amount || 0)
        : action.type === 'create_credit_note'
        ? creditNoteAmount
        : action.type === 'record_supplier_invoice'
          ? supplierInvoiceAmount
          : ['create_budget_line', 'create_billing_milestone'].includes(action.type)
            ? Number(action.suggestedAmount || contractAmount)
            : action.type === 'create_draw_request'
              ? drawAmount
              : paymentAmount
    setFinanceAction({ item, action, label: FINANCE_ACTION_LABELS[action.type] })
    setFinanceActionDraft({
      ...emptyFinanceActionDraft(),
      outcome: action.type === 'record_payment_reconciliation' ? 'received' : 'follow_up_recorded',
      amount: amount > 0 ? amount.toFixed(2) : '',
      taxRate: action.taxRate == null ? '21' : String(action.taxRate),
      taxAmount: action.type === 'record_supplier_invoice' && amount > 0 ? roundMoney(amount * 0.21).toFixed(2) : '',
      forecastAmount: contractAmount > 0 ? contractAmount.toFixed(2) : '',
      plannedIssueAt: action.plannedIssueAt ? String(action.plannedIssueAt).slice(0, 10) : futureDateInput(7),
      dueAt: action.dueAt
        ? String(action.dueAt).slice(0, 10)
        : futureDateInput(action.type === 'record_time_expense' ? 0 : action.type === 'create_billing_milestone' ? 37 : 7),
      reference: action.type === 'request_expense_reversal' ? action.receiptReference || '' : '',
      vendor: action.type === 'request_expense_reversal'
        ? action.vendor || item.latest?.expense?.vendor || ''
        : action.supplier || item.latest?.purchaseOrder?.supplier || '',
      materialReceiptId: suggestedMaterialReceipt?.id || '',
      deliveryReference: suggestedMaterialReceipt?.receiptReference || '',
      description:
        action.type === 'create_billing_milestone'
          ? `${item.jobTitle || 'Job'} billing milestone ${action.nextSequenceNumber || ''}`.trim()
          : `${item.jobTitle || 'Job'} finance baseline`,
      percentComplete: String(Math.max(0, Math.min(100, Number(item.progressPercent) || 0))),
    })
  }

  function closeFinanceControl() {
    setFinanceAction(null)
    setFinanceActionDraft(emptyFinanceActionDraft())
  }

  function closeFinanceOrderDelivery() {
    setFinanceOrderDelivery(null)
    setFinanceOrderDeliveryDraft(emptyBidOrderDeliveryDraft())
  }

  async function submitFinanceOrderDelivery(event) {
    event.preventDefault()
    const communicationId = financeOrderDelivery?.action?.communicationId
    if (
      !communicationId ||
      !financeOrderDeliveryDraft.integration.trim() ||
      !financeOrderDeliveryDraft.providerMessageId.trim() ||
      !financeOrderDeliveryDraft.sentAt
    ) {
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/communications/${encodeURIComponent(communicationId)}/delivery-receipt`, {
        method: 'POST',
        body: JSON.stringify({
          integration: financeOrderDeliveryDraft.integration.trim(),
          providerMessageId: financeOrderDeliveryDraft.providerMessageId.trim(),
          sentAt: toIsoDateTime(financeOrderDeliveryDraft.sentAt),
        }),
      })
      setData((current) => {
        if (!current) return current
        const next = {
          ...current,
          dashboard: result.dashboard || current.dashboard,
          finance: result.finance || current.finance,
        }
        return result.job ? reconcileJobCollections(next, result.job) : next
      })
      if (result.job && selectedJobId === result.job.id) setSelectedJob(result.job)
      notify(
        `Verified provider receipt retained for ${financeOrderDelivery.action.issueReference || 'the purchase order'}. The order is now an external commitment; no payment was initiated.`,
      )
      closeFinanceOrderDelivery()
      await refreshSection('finance')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function submitFinanceControl(event) {
    event.preventDefault()
    const type = financeAction?.action?.type
    const jobId = financeAction?.item?.jobId
    const notes = financeActionDraft.notes.trim()
    const reference = financeActionDraft.reference.trim()
    const vendor = financeActionDraft.vendor.trim()
    if (!jobId || !type || !notes) {
      setError('Record the internal finance evidence before continuing.')
      return
    }

    let route = ''
    let body = {}
    if (type === 'request_expense_reversal') {
      if (!financeAction.action.expenseId || notes.length < 8) {
        setError('Record at least eight characters explaining the corrected bookkeeping evidence for this reversal.')
        return
      }
      route = `/api/ledger/jobs/${encodeURIComponent(jobId)}/expense-receipts/${encodeURIComponent(financeAction.action.expenseId)}/reversal`
      body = { reason: notes }
    } else if (type === 'create_credit_note') {
      if (!(financeControlAmount > 0) || !financeAction.action.invoiceId) {
        setError('Record a positive net correction amount against the retained invoice.')
        return
      }
      const availableAmount = Number(financeAction.action.availableAmount || 0)
      if (availableAmount > 0 && financeCreditTotal - availableAmount > 0.01) {
        setError(`The credit-note total cannot exceed the available invoice balance of ${currency.format(availableAmount)}.`)
        return
      }
      route = `/api/ledger/jobs/${encodeURIComponent(jobId)}/invoices/${encodeURIComponent(financeAction.action.invoiceId)}/credit-notes`
      body = {
        amount: roundMoney(financeControlAmount),
        taxRate: financeCreditTaxRate,
        currency: 'EUR',
        reason: notes,
        description:
          financeActionDraft.description.trim() ||
          `Correction for invoice ${financeAction.action.invoiceReference || financeAction.action.invoiceId}`,
        structuredExportRequested: financeAction.action.structuredExportRequested === true,
      }
    } else if (type === 'record_supplier_invoice') {
      const invoiceNumber = financeActionDraft.invoiceNumber.trim()
      const deliveryReference = financeActionDraft.deliveryReference.trim()
      if (
        !(financeControlAmount > 0) ||
        financeSupplierTax < 0 ||
        !invoiceNumber ||
        !vendor ||
        !financeActionDraft.invoiceDate ||
        !financeActionDraft.dueAt ||
        (!financeActionDraft.materialReceiptId && !deliveryReference)
      ) {
        setError('Record the supplier, invoice number, positive net amount, VAT, invoice and due dates, and retained receipt or service evidence.')
        return
      }
      route = `/api/ledger/jobs/${encodeURIComponent(jobId)}/supplier-invoices`
      body = {
        purchaseOrderId: financeAction.action.purchaseOrderId || null,
        supplier: vendor,
        invoiceNumber,
        invoiceDate: financeActionDraft.invoiceDate,
        dueAt: new Date(`${financeActionDraft.dueAt}T23:59:59`).toISOString(),
        netAmount: roundMoney(financeControlAmount),
        taxAmount: roundMoney(financeSupplierTax),
        total: financeSupplierTotal,
        currency: financeAction.action.currency || 'EUR',
        materialReceiptId: financeActionDraft.materialReceiptId || null,
        deliveryReference,
        notes,
      }
    } else if (type === 'record_supplier_payment') {
      if (!(financeControlAmount > 0) || !financeAction.action.supplierInvoiceId || !reference || !financeActionDraft.paidAt) {
        setError('Record a positive supplier payment, retained supplier invoice, payment date, and bank or bookkeeping reference.')
        return
      }
      const availableAmount = Number(financeAction.action.availableAmount || financeAction.action.outstandingAmount || 0)
      if (availableAmount > 0 && financeControlAmount - availableAmount > 0.01) {
        setError(`The payment confirmation cannot exceed the available supplier balance of ${currency.format(availableAmount)}.`)
        return
      }
      route = `/api/ledger/jobs/${encodeURIComponent(jobId)}/supplier-invoices/${encodeURIComponent(financeAction.action.supplierInvoiceId)}/payments`
      body = {
        amount: roundMoney(financeControlAmount),
        paidAt: new Date(`${financeActionDraft.paidAt}T12:00:00`).toISOString(),
        method: financeActionDraft.method,
        reference,
        notes,
      }
    } else if (type === 'record_payment_reconciliation') {
      if (!(financeControlAmount > 0) || !financeAction.action.invoiceId || !reference) {
        setError('Record a positive settlement amount, retained invoice, and payment or authority reference.')
        return
      }
      const availableAmount = Number(financeAction.action.availableAmount || financeAction.action.outstandingAmount || 0)
      if (availableAmount > 0 && financeControlAmount - availableAmount > 0.01) {
        setError(`The settlement amount cannot exceed the available invoice balance of ${currency.format(availableAmount)}.`)
        return
      }
      route = `/api/ledger/jobs/${encodeURIComponent(jobId)}/invoices/${encodeURIComponent(financeAction.action.invoiceId)}/payments`
      body = {
        status: financeActionDraft.outcome,
        amount: roundMoney(financeControlAmount),
        paidAt:
          financeActionDraft.outcome === 'received' && financeActionDraft.paidAt
            ? new Date(`${financeActionDraft.paidAt}T12:00:00`).toISOString()
            : null,
        method: financeActionDraft.outcome === 'received' ? financeActionDraft.method : 'write_off',
        reference,
        notes,
      }
    } else if (type === 'record_payment_follow_up') {
      if (!(financeControlAmount > 0) || !financeActionDraft.dueAt) {
        setError('Record a positive receivable amount and the next follow-up date.')
        return
      }
      if (['received', 'written_off'].includes(financeActionDraft.outcome) && !reference) {
        setError('Payment confirmation and write-off requests require a retained reference.')
        return
      }
      const paymentId = financeAction.action.paymentId
      route = paymentId
        ? `/api/ledger/jobs/${encodeURIComponent(jobId)}/payments/${encodeURIComponent(paymentId)}/follow-up`
        : `/api/ledger/jobs/${encodeURIComponent(jobId)}/payments/follow-up`
      body = {
        invoiceId: financeAction.action.invoiceId || null,
        status: financeActionDraft.outcome,
        amount: roundMoney(financeControlAmount),
        nextFollowUpAt: new Date(`${financeActionDraft.dueAt}T23:59:59`).toISOString(),
        followUpChannel: financeActionDraft.followUpChannel,
        reference: reference || null,
        notes,
      }
    } else if (type === 'prepare_finance_handoff') {
      if (!financeActionDraft.targetSystem.trim()) {
        setError('Choose the bookkeeping target for this retained handoff package.')
        return
      }
      route = `/api/ledger/jobs/${encodeURIComponent(jobId)}/finance-handoffs/prepare`
      body = {
        targetSystem: financeActionDraft.targetSystem.trim(),
        packageType: 'job_finance',
        exportFormat: financeActionDraft.exportFormat,
        notes,
      }
    } else if (type === 'record_time_expense') {
      const selectedWorker = workers.find((worker) => worker.id === financeActionDraft.workerId) || null
      if (
        !(financeControlHours > 0 || financeControlExpense > 0) ||
        financeControlHours > 24 ||
        financeControlRate < 0 ||
        financeControlExpense < 0 ||
        (financeControlHours > 0 && !selectedWorker)
      ) {
        setError('Record positive hours or a positive expense. Labor also requires an active worker; hours cannot exceed 24 and the rate cannot be negative.')
        return
      }
      if (financeControlExpense > 0 && !vendor) {
        setError('Record the vendor for retained expense evidence.')
        return
      }
      const expenseTax = Number(financeActionDraft.taxAmount || 0)
      if (
        financeControlExpense > 0 && (
          !reference ||
          !Number.isFinite(expenseTax) ||
          expenseTax < 0 ||
          expenseTax > financeControlExpense ||
          (['exempt', 'reverse_charge'].includes(financeActionDraft.taxTreatment) && expenseTax !== 0)
        )
      ) {
        setError('Expense evidence requires a receipt reference and a VAT amount and treatment that reconcile to the gross total.')
        return
      }
      route = `/api/ledger/jobs/${encodeURIComponent(jobId)}/finance-costs`
      body = {
        timeLog:
          financeControlHours > 0
            ? {
                workerId: selectedWorker.id,
                workerName: selectedWorker.name,
                workDate: financeActionDraft.dueAt,
                hours: financeControlHours,
                rate: financeControlRate,
                billable: true,
                status: 'submitted',
                costCode: financeActionDraft.costCode.trim() || null,
                notes,
              }
            : {},
        expense:
          financeControlExpense > 0
            ? {
                category: financeActionDraft.category,
                amount: roundMoney(financeControlExpense),
                totalAmount: roundMoney(financeControlExpense),
                taxAmount: roundMoney(expenseTax),
                taxTreatment: financeActionDraft.taxTreatment,
                paymentMethod: financeActionDraft.paymentMethod,
                expenseDate: financeActionDraft.dueAt,
                entryKey: financeActionDraft.entryKey,
                vendor,
                receiptReference: reference,
                costCode: financeActionDraft.costCode.trim() || null,
                notes,
              }
            : {},
      }
    } else if (type === 'create_budget_line') {
      if (
        !(financeControlAmount > 0) ||
        financeControlForecast < 0 ||
        !financeActionDraft.costCode.trim() ||
        !financeActionDraft.description.trim()
      ) {
        setError('Record a positive budget, a valid forecast, cost code, and description.')
        return
      }
      route = `/api/ledger/jobs/${encodeURIComponent(jobId)}/budget-lines`
      body = {
        status: 'baseline',
        costCode: financeActionDraft.costCode.trim(),
        description: financeActionDraft.description.trim(),
        category: financeActionDraft.category,
        budgetAmount: roundMoney(financeControlAmount),
        forecastAmount: roundMoney(financeControlForecast || financeControlAmount),
        notes,
      }
    } else if (type === 'create_billing_milestone') {
      const taxRate = Number(financeActionDraft.taxRate)
      if (
        !(financeControlAmount > 0) ||
        !Number.isFinite(taxRate) ||
        taxRate < 0 ||
        taxRate > 100 ||
        !financeActionDraft.description.trim() ||
        !financeActionDraft.plannedIssueAt ||
        !financeActionDraft.dueAt
      ) {
        setError('Record a positive milestone amount, VAT rate, description, planned issue date, and due date.')
        return
      }
      const plannedIssueAt = new Date(`${financeActionDraft.plannedIssueAt}T00:00:00`).toISOString()
      const dueAt = new Date(`${financeActionDraft.dueAt}T23:59:59`).toISOString()
      if (Date.parse(dueAt) < Date.parse(plannedIssueAt)) {
        setError('The milestone due date must be on or after its planned issue date.')
        return
      }
      route = `/api/ledger/jobs/${encodeURIComponent(jobId)}/billing-milestones`
      body = {
        title: financeActionDraft.description.trim(),
        sequenceNumber: financeAction.action.nextSequenceNumber || undefined,
        amount: roundMoney(financeControlAmount),
        taxRate: roundMoney(taxRate),
        currency: 'EUR',
        plannedIssueAt,
        dueAt,
        notes,
      }
    } else if (type === 'create_draw_request') {
      const percentComplete = Number(financeActionDraft.percentComplete)
      if (
        !(financeControlAmount > 0) ||
        !financeActionDraft.dueAt ||
        !Number.isFinite(percentComplete) ||
        percentComplete < 0 ||
        percentComplete > 100
      ) {
        setError('Record a positive draw amount, due date, and completion percentage from 0 to 100.')
        return
      }
      route = `/api/ledger/jobs/${encodeURIComponent(jobId)}/draw-requests`
      body = {
        invoiceId: financeAction.action.invoiceId || null,
        status: 'approved',
        title: `${financeAction.item.jobTitle || 'Job'} progress draw`,
        requestedAmount: roundMoney(financeControlAmount),
        percentComplete,
        dueAt: new Date(`${financeActionDraft.dueAt}T23:59:59`).toISOString(),
        notes,
      }
    } else if (type === 'request_lien_waiver') {
      if (!(financeControlAmount > 0) || !vendor || !financeActionDraft.dueAt) {
        setError('Record a positive waiver amount, supplier, and due date.')
        return
      }
      route = `/api/ledger/jobs/${encodeURIComponent(jobId)}/lien-waivers`
      body = {
        paymentId: financeAction.action.paymentId || null,
        status: 'requested',
        waiverType: financeActionDraft.waiverType,
        amount: roundMoney(financeControlAmount),
        supplier: vendor,
        dueAt: new Date(`${financeActionDraft.dueAt}T23:59:59`).toISOString(),
        notes,
      }
    }

    if (!route) {
      setError('This finance action is not available in the current ledger runtime.')
      return
    }

    setSubmitting(true)
    try {
      const result = await api(route, { method: 'POST', body: JSON.stringify({ ...body, actor: 'office_operator' }) })
      const financePatch = await loadSectionPatch('finance', resourceViewRef.current, fieldScoped)
      setData((current) => {
        if (!current) return current
        const next = {
          ...current,
          ...financePatch,
          dashboard: result.dashboard || current.dashboard,
        }
        return result.job ? reconcileJobCollections(next, result.job) : next
      })
      if (type === 'request_expense_reversal') {
        notify(`Expense ${result.expense?.receiptReference || reference || ''} is pending reversal approval. The original evidence remains retained and no funds moved.`)
      } else if (type === 'create_credit_note') {
        notify(
          `Credit-note draft retained for ${currency.format(financeCreditTotal)} against ${financeAction.action.invoiceReference || 'the issued invoice'}. Approval and immutable package preparation are required before the receivable changes.`,
        )
      } else if (type === 'record_payment_reconciliation') {
        notify('Payment reconciliation retained for approver review. The invoice balance is unchanged until approval and no funds moved.')
      } else if (type === 'record_supplier_invoice') {
        notify(
          `Supplier invoice ${result.supplierInvoice?.invoiceNumber || ''} retained for ${currency.format(result.supplierInvoice?.total || financeSupplierTotal)}. Match evidence and payable recognition remain approval-gated.`,
        )
      } else if (type === 'record_supplier_payment') {
        notify(
          'Supplier payment evidence retained for approver review. The payable balance is unchanged and Contractor.AI did not move funds.',
        )
      } else if (type === 'record_payment_follow_up') {
        notify(
          result.payment?.approvalId
            ? 'Payment outcome retained for approver confirmation. No funds moved and no client message was sent.'
            : 'Internal payment follow-up retained. No reminder or external message was sent.',
        )
      } else if (type === 'record_time_expense') {
        notify(
          result.costs?.expense
            ? 'Time was retained and the expense receipt is pending source review. No reimbursement, payment, or export was initiated.'
            : 'Time evidence was retained in the job ledger.',
        )
      } else if (type === 'create_billing_milestone') {
        notify(
          `Billing milestone retained for ${currency.format(result.billingMilestone?.total || financeControlAmount)}. Approval is required before an invoice can be derived.`,
        )
      } else if (type === 'request_lien_waiver') {
        notify('Internal waiver request retained. No supplier request or release was sent.')
      } else {
        notify(`${FINANCE_ACTION_LABELS[type]} retained for approver review. No export, funding request, or external commitment was made.`)
      }
      closeFinanceControl()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function openClientEditor(client = null) {
    if (!canCoordinate) return
    setClientEditor({ mode: client ? 'edit' : 'create', client })
    setClientDraft(emptyClientDraft(client))
  }

  function closeClientEditor() {
    setClientEditor(null)
    setClientDraft(emptyClientDraft())
  }

  async function submitClientEditor(event) {
    event.preventDefault()
    if (!canCoordinate || !clientEditor) return
    setSubmitting(true)
    setError('')
    try {
      const { id, ...payload } = clientDraft
      const route = id ? `/api/ledger/clients/${encodeURIComponent(id)}` : '/api/ledger/clients'
      const result = await api(route, {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      })
      const patch = await loadSectionPatch('clients', resourceViewRef.current, fieldScoped)
      setData((current) => current ? {
        ...current,
        ...patch,
        jobs: (current.jobs || EMPTY_LIST).map((job) => job.clientId === result.client.id
          ? {
              ...job,
              clientName: result.client.name,
              clientEmail: result.client.email,
              clientPhone: result.client.phone,
            }
          : job),
      } : current)
      notify(id
        ? ot('Client identity updated in the ledger. Existing commercial snapshots remain immutable.')
        : ot('Client identity retained. No message, project, quote, or invoice was created.'))
      closeClientEditor()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function prepareClientCloseout(item) {
    if (!item?.jobId || !item.flags?.closeoutReady || item.flags?.approvalRequired) return
    setSubmitting(true)
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(item.jobId)}/closeout`, {
        method: 'POST',
        body: JSON.stringify({
          markCompleted: false,
          createRecurringPlan: false,
          completionNote: ot('Closeout preparation does not change job completion status.'),
          actor: 'office_operator',
        }),
      })
      const reused = Object.values(result.closeout?.reused || {}).filter(Boolean).length
      notify(
        reused
          ? ot('The existing closeout package was retained without creating duplicates.')
          : ot('Closeout package retained. Invoice issue and client handover remain approval-gated; nothing was sent.'),
      )
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function prepareClientHandover(item) {
    if (!item?.jobId || !item.nextActions?.some((action) => action.type === 'prepare_handover_package') || item.flags?.approvalRequired)
      return
    setSubmitting(true)
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(item.jobId)}/handover-packages`, {
        method: 'POST',
        body: JSON.stringify({
          channel: item.clientEmail ? 'email' : 'portal',
          actor: 'office_operator',
        }),
      })
      notify(
        result.package?.replayed
          ? ot('The current handover dossier was verified and retained without creating duplicates.')
          : ot('Immutable handover dossier retained. Client delivery is a separate approval-gated step.'),
      )
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function draftClientFollowup(item) {
    if (!item?.jobId || item.counts?.outboundDrafts || item.flags?.approvalRequired) return
    const selection = item.latest?.selection
    const subject = selection?.title
      ? ot('Selection reminder: {selection}', { selection: selection.title })
      : ot('Client follow-up: {project}', { project: item.jobTitle || ot('project update') })
    const body = selection?.title
      ? ot('Please review the retained options for {selection}. Confirm the preferred selection so planning can continue; no choice has been assumed.', { selection: selection.title })
      : ot('Please confirm the outstanding decision or reply for {project}. This is a draft for internal review and has not been sent.', { project: item.jobTitle || ot('this project') })
    setSubmitting(true)
    try {
      await api(`/api/ledger/jobs/${encodeURIComponent(item.jobId)}/communication`, {
        method: 'POST',
        body: JSON.stringify({
          channel: item.clientEmail ? 'email' : 'portal',
          direction: 'outbound',
          subject,
          body,
          expectsReply: true,
          replyBy: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          requiresApproval: true,
          actor: 'office_operator',
        }),
      })
      notify(ot('Client follow-up drafted behind an approval gate. No message was delivered.'))
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function draftRecurringPlan(item) {
    if (!item?.jobId || item.counts?.recurringPlans || item.flags?.approvalRequired) return
    setSubmitting(true)
    try {
      await api(`/api/ledger/jobs/${encodeURIComponent(item.jobId)}/recurring-plans`, {
        method: 'POST',
        body: JSON.stringify({
          service: item.jobType || 'maintenance',
          status: 'draft',
          intervalRule: 'quarterly',
          nextDueAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          approvalRequiredBeforeBooking: true,
          notes: ot('Internal recurring-service proposal. Scope, price, date, and client acceptance remain uncommitted.'),
          actor: 'office_operator',
        }),
      })
      notify(ot('Recurring-service proposal retained as an internal draft. Nothing was booked or offered to the client.'))
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function openClientLifecycle(item, type, recordId) {
    if (!item?.jobId || !recordId) {
      setError(ot('The client action is not linked to a retained lifecycle record.'))
      return
    }
    const labels = {
      selection: 'Record client selection',
      punch_item: 'Punch resolution review',
      warranty_claim: 'Warranty resolution review',
      aftercare: 'Complete aftercare follow-up',
    }
    const record = type === 'selection' ? item.latest?.selection : null
    setClientAction({ item, type, recordId, record, label: ot(labels[type] || 'Client lifecycle review') })
    setClientActionNotes('')
    setClientActionOption(record?.data?.selectedOption || record?.options?.[0] || '')
    setClientActionReference('')
  }

  function openJobCloseoutLifecycle(type, record) {
    if (!selectedJob?.id || !record?.id || !['punch_item', 'warranty_claim', 'aftercare'].includes(type)) {
      setError(ot('The closeout action is not linked to a retained job record.'))
      return
    }
    openClientLifecycle({
      jobId: selectedJob.id,
      jobTitle: selectedJob.title,
      clientName: selectedJob.clientName,
      latest: {
        punchItem: type === 'punch_item' ? record : null,
        warrantyClaim: type === 'warranty_claim' ? record : null,
        aftercare: type === 'aftercare' ? record : null,
      },
    }, type, record.id)
  }

  function closeClientLifecycle() {
    setClientAction(null)
    setClientActionNotes('')
    setClientActionOption('')
    setClientActionReference('')
  }

  async function submitClientLifecycle(event) {
    event.preventDefault()
    const notes = clientActionNotes.trim()
    const selectionDecision = clientAction?.type === 'selection'
    if (!clientAction?.item?.jobId || !clientAction.recordId || !notes) {
      setError(ot('Record the evidence or outcome before changing this client lifecycle state.'))
      return
    }
    if (selectionDecision && (!clientActionOption || !clientActionReference.trim())) {
      setError(ot('Choose the retained client option and record its confirmation reference.'))
      return
    }
    const status = clientAction.type === 'aftercare' ? 'completed' : selectionDecision ? 'selected' : 'resolved'
    const payload = { status, notes, resolution: notes, actor: 'office_operator' }
    if (selectionDecision) {
      payload.selectedOption = clientActionOption
      payload.verificationReference = clientActionReference.trim()
      payload.clientConfirmed = true
      payload.source = 'operator_confirmation'
    }
    setSubmitting(true)
    try {
      const result = await api(
        `/api/ledger/jobs/${encodeURIComponent(clientAction.item.jobId)}/lifecycle/${encodeURIComponent(clientAction.type)}/${encodeURIComponent(clientAction.recordId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        },
      )
      if (result.job?.id === selectedJobId) {
        setSelectedJob(result.job)
        setData((current) => current ? reconcileJobCollections({ ...current, dashboard: result.dashboard || current.dashboard }, result.job) : current)
      }
      notify(
        result.approvalRequired
          ? ot('{action} retained as a pending approval; the client-facing outcome has not been committed.', { action: clientAction.label })
          : ot('Aftercare outcome completed in the internal ledger. No client message was sent.'),
      )
      closeClientLifecycle()
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function prepareFieldSafetyPack(item) {
    if (!item?.jobId || !item.flags?.safetyGap || item.flags?.approvalRequired) return
    setSubmitting(true)
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(item.jobId)}/field-assurance-pack`, {
        method: 'POST',
        body: JSON.stringify({ actor: 'office_operator' }),
      })
      const reused = Object.values(result.pack?.reused || {}).filter(Boolean).length
      notify(
        reused
          ? 'Existing safety planning records were retained without duplicates.'
          : 'Internal safety pack retained. It does not grant access, publish evidence, or authorize field work.',
      )
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function openDispatchControl(item, action) {
    if (!item?.jobId || !action?.recordId || !action?.recordType) {
      setError('The dispatch control is not linked to a retained lifecycle record.')
      return
    }
    if (action.recordType === 'selection') {
      openClientLifecycle({ ...item, latest: { selection: action.record } }, 'selection', action.recordId)
      return
    }
    if (action.recordType === 'procurement_order') {
      openResourceControl(
        { ...item, inventoryStatus: item.readinessStatus },
        { ...action, type: 'request_procurement_approval', procurementOrderId: action.recordId, label: action.message },
      )
      return
    }
    if (action.recordType === 'material_requirement') {
      openResourceControl(
        { ...item, inventoryStatus: item.readinessStatus, materials: [action.record], latest: { material: action.record } },
        { ...action, type: 'review_material_status', materialRequirementId: action.recordId, label: action.message },
      )
      return
    }
    openFieldReview(item, {
      type: action.recordType,
      recordId: action.recordId,
      record: action.record,
      label: action.actionLabel || 'Resolve design control',
      status: action.targetStatus,
    })
  }

  function reviewDispatchEquipment() {
    sectionRef.current = 'resources'
    setSection('resources')
    selectResourceView('equipment')
  }

  function reviewDispatchWorkforce() {
    sectionRef.current = 'resources'
    setSection('resources')
    selectResourceView('workforce')
  }

  async function loadCrewCapacityWindow(referenceDate) {
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/crew-capacity?referenceDate=${encodeURIComponent(referenceDate)}`)
      setData((current) => current ? { ...current, crewCapacity: result.board || current.crewCapacity } : current)
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    } finally {
      setSubmitting(false)
    }
  }

  async function saveCrewCapacityProfile(workerId, payload) {
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/workers/${encodeURIComponent(workerId)}/capacity-profile`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
      setData((current) => current ? { ...current, crewCapacity: result.board || current.crewCapacity } : current)
      notify(result.unchanged ? 'The current capacity profile already retains these hours.' : 'Versioned crew capacity profile retained. Existing approved plans now show stale when their source changed.')
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    } finally {
      setSubmitting(false)
    }
  }

  async function createCrewCapacityAllocation(payload) {
    setSubmitting(true)
    setError('')
    try {
      const result = await api('/api/ledger/crew-capacity/allocations', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setData((current) => current ? { ...current, crewCapacity: result.board || current.crewCapacity } : current)
      notify(result.replayed ? 'The exact crew allocation was already retained.' : 'Day-level crew allocation retained without notifications or external commitments.')
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    } finally {
      setSubmitting(false)
    }
  }

  async function cancelCrewCapacityAllocation(allocationId, payload) {
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/crew-capacity/allocations/${encodeURIComponent(allocationId)}/cancel`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setData((current) => current ? { ...current, crewCapacity: result.board || current.crewCapacity } : current)
      notify(result.replayed ? 'This crew allocation was already cancelled.' : 'Crew allocation cancelled with retained reason evidence.')
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    } finally {
      setSubmitting(false)
    }
  }

  async function requestCrewLookaheadApproval(referenceDate) {
    setSubmitting(true)
    setError('')
    try {
      const result = await api('/api/ledger/crew-lookahead/plans', {
        method: 'POST',
        body: JSON.stringify({
          referenceDate,
          reason: 'Capacity, availability, assignment, task coverage, and schedule evidence reviewed in the two-week board.',
        }),
      })
      setData((current) => current ? {
        ...current,
        crewCapacity: result.board || current.crewCapacity,
        approvals: result.approval ? upsertById(current.approvals, result.approval) : current.approvals,
      } : current)
      notify(result.replayed ? 'The source-current crew plan is already waiting for approval.' : 'Immutable two-week crew plan sent to the internal approval queue. No notifications or commitments were made.')
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    } finally {
      setSubmitting(false)
    }
  }

  function reviewCrewLookaheadApproval(plan) {
    if (!plan?.approvalId) {
      setError('The retained crew plan is not linked to an approval decision.')
      return
    }
    openApprovals({ approvalId: plan.approvalId, jobTitle: `Crew look-ahead v${plan.versionNumber}` })
  }

  function openCrewCapacityJob(jobId) {
    const job = jobs.find((candidate) => candidate.id === jobId)
    if (!job) {
      setError('The crew-planning record is not linked to an active job in this view.')
      return
    }
    openJobWorkspace(job)
  }

  async function loadLastPlannerWeek(weekStart) {
    const sequence = ++sectionLoadSequenceRef.current
    setSectionLoading(false)
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/last-planner?weekStart=${encodeURIComponent(weekStart)}`)
      if (sequence !== sectionLoadSequenceRef.current || sectionRef.current !== 'schedule') return false
      if (result.board?.week?.weekStart) lastPlannerWeekRef.current = result.board.week.weekStart
      setData((current) => current ? { ...current, lastPlanner: result.board || current.lastPlanner } : current)
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    } finally {
      setSubmitting(false)
    }
  }

  async function createLastPlannerConstraint(jobId, payload) {
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(jobId)}/last-planner/constraints`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setData((current) => current ? { ...current, lastPlanner: result.board || current.lastPlanner } : current)
      notify(result.replayed ? 'The exact make-ready constraint was already retained.' : 'Make-ready constraint retained without changing the schedule or creating external commitments.')
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    } finally {
      setSubmitting(false)
    }
  }

  async function releaseLastPlannerConstraint(jobId, constraintId, payload) {
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(jobId)}/last-planner/constraints/${encodeURIComponent(constraintId)}/release`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setData((current) => current ? { ...current, lastPlanner: result.board || current.lastPlanner } : current)
      notify(result.replayed ? 'This make-ready release was already retained.' : 'Constraint released against retained evidence. No permit or compliance claim was created.')
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    } finally {
      setSubmitting(false)
    }
  }

  async function requestLastPlannerPlan(jobId, payload) {
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(jobId)}/last-planner/plans`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setData((current) => current ? {
        ...current,
        lastPlanner: result.board || current.lastPlanner,
        approvals: result.approval ? upsertById(current.approvals, result.approval) : current.approvals,
      } : current)
      notify(result.replayed ? 'The exact weekly plan is already waiting for review.' : 'Immutable weekly promises sent to the internal approval queue. No schedule or external commitment was changed.')
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    } finally {
      setSubmitting(false)
    }
  }

  function reviewLastPlannerApproval(plan) {
    if (!plan?.approvalId) {
      setError('The retained weekly plan is not linked to an approval decision.')
      return
    }
    openApprovals({ approvalId: plan.approvalId, jobTitle: `${plan.jobTitle || 'Weekly plan'} / ${formatDate(plan.weekStart)}` })
  }

  async function recordLastPlannerOutcome(jobId, planId, commitmentId, payload) {
    setSubmitting(true)
    setError('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(jobId)}/last-planner/plans/${encodeURIComponent(planId)}/commitments/${encodeURIComponent(commitmentId)}/outcome`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setData((current) => current ? { ...current, lastPlanner: result.board || current.lastPlanner } : current)
      notify(result.replayed ? 'The exact weekly outcome was already retained.' : 'Weekly outcome retained against closed daily-cycle evidence and included in PPC.')
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    } finally {
      setSubmitting(false)
    }
  }

  function reviewPortfolioDispatch() {
    sectionRef.current = 'dispatch'
    setSection('dispatch')
    setMobileNavOpen(false)
    void refreshSection('dispatch')
  }

  function openFieldReview(item, target) {
    if (!item?.jobId || !target?.recordId) {
      setError(ot('The assurance action is not linked to a retained ledger record.'))
      return
    }
    setFieldAction({ item, ...target })
    setFieldActionNotes('')
    setFieldActionDate(futureDateInput(365))
    setFieldActionReference('')
  }

  function closeFieldReview() {
    setFieldAction(null)
    setFieldActionNotes('')
    setFieldActionDate(futureDateInput(365))
    setFieldActionReference('')
  }

  async function submitFieldReview(event) {
    event.preventDefault()
    const notes = fieldActionNotes.trim()
    if (!fieldAction?.item?.jobId || !fieldAction.recordId || !notes) {
      setError(ot('Record the review evidence before requesting this assurance transition.'))
      return
    }
    const requiresDate = ['permit', 'sds'].includes(fieldAction.type)
    const requiresReference = ['sds', 'safety_meeting', 'orientation', 'document'].includes(fieldAction.type)
    const reference = fieldActionReference.trim()
    if (requiresDate && !fieldActionDate) {
      setError(
        fieldAction.type === 'sds'
          ? ot('Record the SDS expiry before requesting approval.')
          : ot('Record the proposed permit expiry before requesting approval.'),
      )
      return
    }
    if (requiresReference && !reference) {
      setError(ot('Record the required attendance or document reference before requesting approval.'))
      return
    }
    const payload = {
      status: fieldAction.status,
      notes,
      resolution: notes,
      actor: 'office_operator',
    }
    if (fieldAction.type === 'incident' && fieldAction.status === 'resolved') {
      payload.correctiveAction = notes
    }
    if (fieldAction.type === 'rfi') payload.response = notes
    if (fieldAction.type === 'permit') payload.expiresAt = new Date(`${fieldActionDate}T23:59:59`).toISOString()
    if (fieldAction.type === 'sds') {
      payload.documentRef = reference
      payload.expiresAt = new Date(`${fieldActionDate}T23:59:59`).toISOString()
    }
    if (fieldAction.type === 'safety_meeting') payload.attendees = reference
    if (fieldAction.type === 'orientation') payload.verificationReference = reference
    if (fieldAction.type === 'document') payload.verificationReference = reference
    if (fieldAction.type === 'inspection') {
      payload.result = 'passed'
      payload.defects = []
    }
    if (fieldAction.type === 'quality_check') {
      payload.result = 'passed'
      payload.defects = []
    }
    setSubmitting(true)
    try {
      const result = await api(
        `/api/ledger/jobs/${encodeURIComponent(fieldAction.item.jobId)}/lifecycle/${encodeURIComponent(fieldAction.type)}/${encodeURIComponent(fieldAction.recordId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        },
      )
      notify(
        result.approvalRequired
          ? ot('{action} retained for approver review. No field reliance or external commitment was made.', { action: fieldAction.label })
          : ot('{action} recorded in the internal ledger.', { action: fieldAction.label }),
      )
      closeFieldReview()
      await refresh()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function focusFieldCapture(item) {
    if (!item?.jobId) return
    setEvidence((current) => ({ ...current, jobId: item.jobId }))
    window.setTimeout(() => fieldCaptureRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  async function loadQaResetPreview() {
    const requestId = ++qaResetPreviewRequestRef.current
    setQaResetError('')
    setQaResetDialog((current) => ({ ...(current || {}), loading: true }))
    try {
      const preview = await api('/api/operations/reset-qa/preview')
      if (requestId !== qaResetPreviewRequestRef.current) return null
      setQaResetDialog({ loading: false, plan: preview })
      return preview
    } catch (requestError) {
      if (requestId !== qaResetPreviewRequestRef.current) return null
      setQaResetDialog((current) => ({ ...(current || {}), loading: false, plan: null }))
      setQaResetError(requestError.message)
      return null
    }
  }

  function openWorkPackCapture(job) {
    setData(current => current ? { ...current, jobs: upsertById(current.jobs || [], job) } : current)
    selectSection('field')
    void selectFieldEvidenceJob(job.id)
    focusFieldCapture({ jobId: job.id })
  }

  async function openQaResetDialog(opener) {
    qaResetOpenerRef.current = opener || document.activeElement
    setQaResetError('')
    setQaResetDialog({ loading: true, plan: null })
    await loadQaResetPreview()
  }

  function closeQaResetDialog() {
    if (submitting) return
    qaResetPreviewRequestRef.current += 1
    setQaResetDialog(null)
    setQaResetError('')
    window.setTimeout(() => qaResetOpenerRef.current?.focus(), 0)
  }

  async function resetQa({ reason, planHash }) {
    setSubmitting(true)
    setQaResetError('')
    try {
      const result = await api('/api/operations/reset-qa', {
        method: 'POST',
        body: JSON.stringify({ confirmation: 'RESET_QA', planHash, reason }),
      })
      notify(`${result.archivedCount} QA/demo record(s) archived or retired after backup ${result.backup?.backupId || 'verification'}.`)
      qaResetPreviewRequestRef.current += 1
      setQaResetDialog(null)
      await refresh()
      window.setTimeout(() => qaResetOpenerRef.current?.focus(), 0)
      return true
    } catch (requestError) {
      if (requestError.code === 'qa_reset_plan_changed') {
        const refreshed = await loadQaResetPreview()
        setQaResetError(
          refreshed
            ? `${requestError.message} The preview is current now; review it and confirm again.`
            : requestError.message,
        )
      } else {
        setQaResetError(requestError.message)
      }
      return false
    } finally {
      setSubmitting(false)
    }
  }

  if (authState === 'checking' || authState === 'required') {
    return (
      <AuthenticationScreen checking={authState === 'checking'} error={authError} submitting={authSubmitting} onLogin={loginOperator} identity={identityConfiguration} />
    )
  }

  const pageTitle = visibleNavItems.find(([key]) => key === section)?.[1] || appText(operatorLocale, 'nav.today')

  return (
    <div className="app-shell">
      <a className="skip-to-workspace" href="#main-workspace">{operatorLocale === 'nl-NL' ? 'Naar werkruimte' : 'Skip to workspace'}</a>
      <aside
        className={`side-nav ${mobileNavOpen ? 'side-nav-open' : ''}`}
        aria-label={appText(operatorLocale, 'shell.primaryNavigation')}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setMobileNavOpen(false)
        }}
      >
        <div className="brand">
          <span className="brand-mark">
            <HardHat size={18} />
          </span>
          <span>Contractor.AI</span>
          <button
            type="button"
            className="nav-close mobile-only"
            aria-label={appText(operatorLocale, 'shell.closeNavigation')}
            onClick={() => setMobileNavOpen(false)}
          >
            <X size={19} />
          </button>
        </div>
        <DashboardNavigation items={visibleNavItems} section={section} onSelect={selectSection} onIntent={preloadDashboardSection} locale={operatorLocale} pendingApprovals={metrics.pendingApprovals} loading={initialDataLoading} />
        <div className="nav-footer">
          {data?.session?.identity?.enabled && <a className="company-switch-link" href={data.session.identity.accountUrl}><Building2 size={17} />{operatorLocale === 'nl-NL' ? 'Mijn bedrijven' : 'My companies'}</a>}
          <CloudOff size={16} />
          <span>{networkOnline ? appText(operatorLocale, 'shell.localLedger') : appText(operatorLocale, 'shell.offlineLedger')}</span>
          <small>{appText(operatorLocale, 'shell.approvalNotice')}</small>
        </div>
      </aside>

      <main
        className="workspace"
        id="main-workspace"
        tabIndex={-1}
        aria-busy={loading || sectionLoading}
      >
        <header className="topbar">
          <button className="icon-button mobile-only" aria-label={appText(operatorLocale, 'shell.openNavigation')} onClick={() => setMobileNavOpen(true)}>
            <Menu size={20} />
          </button>
          <div>
            <h1>{pageTitle}</h1>
            <p>
              {dashboard
                ? appText(operatorLocale, 'shell.activeSummary', { jobs: metrics.openJobs || 0, approvals: metrics.pendingApprovals || 0 })
                : appText(operatorLocale, 'shell.loadingLedger')}
            </p>
          </div>
          <div className="topbar-actions">
            <span className="sync-state">
              <CloudOff size={15} />
              {networkOnline
                ? (fieldScoped ? appText(operatorLocale, 'shell.fieldScope') : appText(operatorLocale, 'shell.localFirst'))
                : appText(operatorLocale, 'shell.offlineQueue')}
            </span>
            <label className="locale-select">
              <span className="visually-hidden">{appText(operatorLocale, 'shell.language')}</span>
              <select
                aria-label={appText(operatorLocale, 'shell.language')}
                value={operatorLocale}
                disabled={localeSaving || initialDataLoading}
                onChange={(event) => updateOperatorLocale(event.target.value)}
              >
                {SUPPORTED_LOCALES.map((option) => <option key={option.value} value={option.value}>{option.shortLabel}</option>)}
              </select>
            </label>
            {operator.authenticated ? (
              <span className="operator-session" title={formatStatus(operator.role)}>
                <ShieldCheck size={14} />
                <span>{operator.name || formatStatus(operator.role)}</span>
              </span>
            ) : null}
            <button className="icon-button" title={appText(operatorLocale, 'shell.refresh')} aria-label={appText(operatorLocale, 'shell.refresh')} onClick={refreshCurrentView} disabled={loading || sectionLoading}>
              <RefreshCw size={18} className={loading || sectionLoading ? 'spin' : ''} />
            </button>
            {operator.authenticated ? (
              <button className="icon-button" aria-label={appText(operatorLocale, 'shell.signOut')} title={appText(operatorLocale, 'shell.signOut')} onClick={logoutOperator} disabled={submitting}>
                <LogOut size={17} />
              </button>
            ) : null}
            {capabilities.intake && capabilities.pipeline ? (
              <button className="primary-button" onClick={() => openOpportunityEditor()} disabled={initialDataLoading}>
                <Plus size={17} />
                {appText(operatorLocale, 'shell.newOpportunity')}
              </button>
            ) : null}
          </div>
        </header>

        {notice ? (
          <div className="notice">
            <Check size={16} />
            {notice.message}
            <button aria-label={appText(operatorLocale, 'shell.dismissNotice')} onClick={() => setNotice(null)}>
              <X size={15} />
            </button>
          </div>
        ) : null}
        {error ? (
          <div className="error-banner">
            <TriangleAlert size={18} />
            <span>{error}</span>
            <button onClick={refreshCurrentView}>{appText(operatorLocale, 'shell.retry')}</button>
          </div>
        ) : null}
        {automationSuspended ? (
          <div className="safety-stop-banner" role="alert" data-testid="automation-safety-stop-banner">
            <Ban size={18} />
            <span>
              <strong>{ot('Autonomous drafting suspended.')}</strong> {automationControl.reason} {ot('Direct operator work, evidence capture, and approvals remain available.')}
            </span>
            {capabilities.maintenance ? (
              <button
                className="secondary-button"
                disabled={submitting}
                onClick={(event) => openAutomationControlDialog(false, event.currentTarget)}
              >
                {ot('Resume')}
              </button>
            ) : null}
          </div>
        ) : null}

        {loading && !data ? (
          <div className="loading">
            <LoaderCircle className="spin" size={26} />
            {ot('Loading the operating ledger')}
          </div>
        ) : null}
        {data ? (
          <>
            {sectionLoading ? (
              <div className="loading section-loading" role="status">
                <LoaderCircle className="spin" size={26} />
                {appText(operatorLocale, 'shell.loadingPage', { page: pageTitle.toLowerCase() })}
              </div>
            ) : null}
              <div className="workspace-content" inert={loading || sectionLoading ? true : undefined}>
            {section === 'today' && (
              <section className="page-grid today-page">
                <div className="today-heading">
                  <div><h2>{operatorLocale === 'nl-NL' ? 'Dagoverzicht' : 'Daily overview'}</h2><p>{new Intl.DateTimeFormat(operatorLocale, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p></div>
                  <span className="today-context">{fieldScoped ? appText(operatorLocale, 'shell.fieldScope') : appText(operatorLocale, 'shell.localFirst')}</span>
                </div>
                {fieldScoped ? <LazyControlBoundary label="personal work packs"><FieldWorkPack api={api} locale={operatorLocale} refreshKey={dashboard.generatedAt} canRespond onOpenJob={openJobWorkspace} onCapture={openWorkPackCapture} /></LazyControlBoundary> : null}
                {capabilities.maintenance && data.organization && !data.organization.readiness?.ready ? (
                  <section className="panel first-run-panel" data-testid="first-run-setup">
                    <div>
                      <p className="eyebrow">{ot('Owner setup')}</p>
                      <h2>{ot('Complete the business identity')}</h2>
                      <p>{ot('Commercial issue packages stay blocked until {count} required identity item(s) are retained.', { count: data.organization.readiness.missing.length })}</p>
                    </div>
                    <button className="primary-button" onClick={openOrganizationOnboarding}>
                      <Building2 size={16} />
                      {ot('Finish setup')}
                    </button>
                  </section>
                ) : null}
                <div className="metrics-grid">
                  <Metric
                    icon={BriefcaseBusiness}
                    label={operatorLocale === 'nl-NL' ? 'Open opdrachten' : 'Open jobs'}
                    value={metrics.openJobs || 0}
                    hint={ot('{count} completed', { count: metrics.completedJobs || 0 })}
                  />
                  <Metric
                    icon={MapPin}
                    label={ot('Dispatch ready')}
                    value={metrics.dispatchReadyJobs || 0}
                    hint={ot('Mobilize when cleared')}
                    tone="blue"
                  />
                  <Metric
                    icon={ClipboardCheck}
                    label={ot('Approvals')}
                    value={metrics.pendingApprovals || 0}
                    hint={ot('Operator decision required')}
                    tone="amber"
                  />
                  <Metric
                    icon={Gauge}
                    label={ot('Weighted pipeline')}
                    value={currency.format(dashboard.preconstruction?.summary?.weightedValue || 0)}
                    hint={ot('{count} open opportunities', { count: dashboard.preconstruction?.summary?.open || 0 })}
                    tone="green"
                  />
                </div>
                {!fieldScoped && capabilities.clientSuccess ? <LazyControlBoundary label="client messages">
                  <ClientConversationInbox api={api} locale={operatorLocale} onOpen={(message) => {
                    setClientConversationTarget({ jobId: message.jobId, accessId: message.accessId })
                    selectSection('clients')
                  }} />
                </LazyControlBoundary> : null}
                <div className={fieldScoped ? undefined : 'today-work-grid'}>
                {!fieldScoped && !initialDataLoading ? (
                  <LazyControlBoundary label="daily workbench">
                    <ContractorWorkbench
                      api={api}
                      locale={operatorLocale}
                      refreshKey={dashboard.generatedAt}
                      canAutomate={operator.role === 'owner'}
                      canResolveAttendance={['owner', 'office_operator'].includes(operator.role)}
                      suspended={automationSuspended}
                      onChanged={refresh}
                      formatMessage={(action) => localizedNextActionMessage({ ...action.data, ...action, type: action.actionType }, jobs, ot)}
                      onOpenAction={(action) => {
                        if (action.approvalId && capabilities.approvals) {
                          openApprovals({ jobId: action.jobId, jobTitle: action.jobTitle, approvalId: action.approvalId })
                        } else if (action.jobId) {
                          void openJobWorkspace(jobs.find(job => job.id === action.jobId) || { id: action.jobId, title: action.jobTitle || ot('Ledger job') })
                        } else if (action.data?.opportunityId && capabilities.pipeline) {
                          selectSection('pipeline')
                          void selectOpportunity({ id: action.data.opportunityId })
                        } else {
                          const destination = { approval: 'approvals', dispatch: 'dispatch', workforce: 'resources', inventory: 'resources', field_assurance: 'field', finance: 'finance', client_success: 'clients', learning: 'performance', operations: 'performance', capability: 'jobs' }[action.stream] || 'jobs'
                          selectSection(visibleNavItems.some(([key]) => key === destination) ? destination : 'jobs')
                        }
                      }}
                    />
                  </LazyControlBoundary>
                ) : null}
                {!fieldScoped && !initialDataLoading ? <TodayAgenda jobs={activeJobs} locale={operatorLocale} onOpenJob={openJobWorkspace} onOpenSchedule={visibleNavItems.some(([key]) => key === 'schedule') ? () => selectSection('schedule') : undefined} /> : null}
                </div>
                {!fieldScoped && !initialDataLoading ? <LazyControlBoundary label="dossier review">
                  <ContractorReviewControl api={api} locale={operatorLocale} refreshKey={dashboard.generatedAt} canAutomate={operator.role === 'owner'} canEdit={['owner', 'office_operator'].includes(operator.role)} suspended={automationSuspended} onOpenJob={job => void openJobWorkspace(job)} />
                </LazyControlBoundary> : null}
                <div className={`content-grid ${fieldScoped ? '' : 'today-schedule-grid'}`}>
                  {fieldScoped ? <section className="panel command-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>{fieldScoped ? ot('My field work') : ot('Command queue')}</h2>
                        <p>
                          {fieldScoped ? ot('Your assigned ledger jobs and retained field updates') : ot('Ranked internal work and approval gates')}
                        </p>
                      </div>
                      {capabilities.approvals ? (
                        <button className="text-button" onClick={() => selectSection('approvals')}>
                          {ot('Open approvals')} <ChevronRight size={15} />
                        </button>
                      ) : null}
                    </div>
                    {nextActions.length ? (
                      <div className="queue-list">
                        {nextActions.map((item, index) => (
                          <div className="queue-row" key={`${item.type}-${item.taskId || item.assignmentId || item.workerId || item.jobId || index}`}>
                            <span className={`severity severity-${item.severity || 'medium'}`}>
                              <TriangleAlert size={15} />
                            </span>
                            <div>
                              <strong>{item.title || ot(formatStatus(item.type))}</strong>
                              <p>{localizedNextActionMessage(item, jobs, ot)}</p>
                            </div>
                            {item.actionKind === 'worker_checkin_missing'
                              ? <span className="tag tag-amber">{ot('Check required')}</span>
                              : item.requiresApproval ? <span className="tag tag-amber">{ot('Approval')}</span> : <span className="tag">{ot('Draft')}</span>}
                            {item.jobId ? (
                              <button
                                className="icon-button table-action"
                                aria-label={ot('Open {title}', { title: item.jobTitle || item.title || ot('linked job') })}
                                onClick={() =>
                                  openJobWorkspace(
                                    jobs.find((job) => job.id === item.jobId) || {
                                      id: item.jobId,
                                      title: item.jobTitle || item.title || ot('Ledger job'),
                                    },
                                  )
                                }
                              >
                                <ArrowUpRight size={16} />
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Empty title={ot('Queue is clear')} detail={ot('No immediate ledger action needs review.')} />
                    )}
                  </section> : null}
                  <section className="panel schedule-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>{ot('Jobs schedule')}</h2>
                        <p>{ot('Live work from the ledger')}</p>
                      </div>
                      <button className="text-button" onClick={() => selectSection('jobs')}>
                        {ot('All jobs')} <ChevronRight size={15} />
                      </button>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>{ot('When')}</th>
                            <th>{ot('Job')}</th>
                            <th>{ot('Location')}</th>
                            <th>{ot('Status')}</th>
                            <th aria-label={ot('Open job')} />
                          </tr>
                        </thead>
                        <tbody>
                          {!activeJobs.length ? <tr><td colSpan={5}><Empty title={operatorLocale === 'nl-NL' ? 'Nog geen actieve opdrachten' : 'No active jobs'} /></td></tr> : null}
                          {activeJobs.slice(0, 6).map((job) => (
                            <tr key={job.id}>
                              <td>{job.scheduledStart || job.targetCompletion ? formatDate(job.scheduledStart || job.targetCompletion) : ot('Not scheduled')}</td>
                              <td>
                                <strong>{job.title}</strong>
                                <small>{job.clientName || ot('Client pending')}</small>
                              </td>
                              <td>{job.city || job.address || ot('Location pending')}</td>
                              <td>
                                <span className={`status status-${job.status}`}>{ot(formatStatus(job.status))}</span>
                              </td>
                              <td>
                                <button
                                  className="icon-button table-action"
                                  aria-label={ot('Open {title}', { title: job.title })}
                                  disabled={loading}
                                  onClick={() => openJobWorkspace(job)}
                                >
                                  <ArrowUpRight size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
                <div className="bottom-grid">
                  {capabilities.approvals ? (
                    <section className="panel compact-panel">
                      <div className="panel-heading">
                        <h2>{ot('Approval queue')}</h2>
                        <button className="text-button" onClick={() => selectSection('approvals')}>
                          {ot('Review all')} <ChevronRight size={15} />
                        </button>
                      </div>
                      {data.approvals.slice(0, 4).map((item) => (
                        <div className="compact-row" key={item.id}>
                          <ClipboardCheck size={16} />
                          <div>
                            <strong>{item.title || ot(formatStatus(item.targetType))}</strong>
                            <small>{item.jobTitle || item.summary || ot('Ledger decision')}</small>
                          </div>
                          <span>{formatDate(item.createdAt)}</span>
                        </div>
                      ))}
                    </section>
                  ) : null}
                  {capabilities.fieldEvidence ? (
                    <section className="panel compact-panel">
                      <div className="panel-heading">
                        <h2>{ot('Field evidence')}</h2>
                        <button className="text-button" onClick={() => selectSection('field')}>
                          {ot('Open field')} <ChevronRight size={15} />
                        </button>
                      </div>
                      <div className="field-summary">
                        <PackageCheck size={26} />
                        <div>
                          <strong>{ot('{count} stored records', { count: metrics.storedDocuments || 0 })}</strong>
                          <p>{ot('{reports} field reports, {incidents} open incidents', { reports: metrics.fieldReports || 0, incidents: metrics.openIncidents || 0 })}</p>
                        </div>
                      </div>
                      <button className="secondary-button full-button" onClick={() => selectSection('field')}>
                        <HardHat size={16} />
                        {ot('Review field assurance')}
                      </button>
                    </section>
                  ) : null}
                  {capabilities.maintenance ? (
                    <section className="panel compact-panel">
                      <div className="panel-heading">
                        <h2>{ot('Automation')}</h2>
                        <span className="tag tag-green">{ot('Ledger-only')}</span>
                      </div>
                      <p className="panel-copy">
                        {ot('The durable cycle creates internal drafts and approval requests. It cannot send messages, commit spend, or confirm dates.')}
                      </p>
                      <button className="secondary-button full-button" disabled={submitting || automationSuspended} onClick={runCycle}>
                        <Activity size={16} />
                        {automationSuspended ? ot('Safety stop active') : ot('Run due cycle')}
                      </button>
                    </section>
                  ) : null}
                </div>
              </section>
            )}

            {section === 'help' && (
              <LazyControlBoundary label={operatorLocale === 'nl-NL' ? 'praktische hulp' : 'practical help'}>
                <HelpCenter
                  key={fieldScoped ? 'field' : 'office'}
                  locale={operatorLocale}
                  fieldScoped={fieldScoped}
                  destinations={visibleNavItems.map(([key]) => key)}
                  onNavigate={selectSection}
                />
              </LazyControlBoundary>
            )}

            {section === 'pipeline' && capabilities.pipeline ? (
              <LazyControlBoundary label="opportunity pipeline">
              <PipelineWorkspace
                request={api}
                locale={operatorLocale}
                text={ot}
                view={pipelineView}
                onViewChange={setPipelineView}
                opportunities={data.opportunities || EMPTY_LIST}
                forecast={data.opportunityForecast}
                marketFit={data.marketFit}
                bidDecisions={data.bidDecisions}
                bidPackages={data.bidPackages || EMPTY_LIST}
                bidSummary={data.bidPackageSummary || {}}
                selectedBidPackage={selectedBidPackage}
                selectedOpportunity={selectedOpportunity}
                canCoordinate={canCoordinate}
                canManagePolicy={canManageMarketFitPolicy}
                canApprove={capabilities.approvals === true}
                submitting={submitting}
                onCreate={() => openOpportunityEditor()}
                onEdit={openOpportunityEditor}
                onSelect={selectOpportunity}
                onFollowUp={openOpportunityActivity}
                onCompleteActivity={completeOpportunityActivity}
                onConvert={convertOpportunity}
                onRequestMarketFitPolicy={requestMarketFitPolicy}
                onRetainMarketFitAssessment={retainMarketFitAssessment}
                onRequestBidDecisionPolicy={requestBidDecisionPolicy}
                onRequestBidDecision={requestBidDecision}
                onPlanSiteSurvey={planOpportunitySiteSurvey}
                onUploadSiteSurveyEvidence={uploadOpportunitySiteSurveyEvidence}
                onSubmitSiteSurvey={submitOpportunitySiteSurvey}
                onReviewSiteSurveyApproval={reviewOpportunitySiteSurveyApproval}
                onOpenJob={openOpportunityJob}
                onCreateBidPackage={openBidPackageEditor}
                onSelectBidPackage={selectBidPackage}
                onAddBidders={openAddBidParticipants}
                onRecordBidReturn={openBidReturn}
                onRequestBidSelection={openBidSelection}
                onReviewBidApproval={reviewBidApproval}
                onPrepareBidCommitment={openBidCommitment}
                onReviewBidCommitment={reviewBidCommitment}
                onPrepareBidOrderPackage={openBidOrderPackage}
                onReviewBidOrderDelivery={reviewBidOrderDelivery}
                onRecordBidOrderDelivery={openBidOrderDelivery}
              />
              </LazyControlBoundary>
            ) : null}

            {section === 'jobs' && (
              <section className="panel page-panel">
                <div className="panel-heading">
                  <div>
                    <h2>{fieldScoped ? ot('My assigned jobs') : ot('All jobs')}</h2>
                    <p>
                      {fieldScoped
                        ? ot('Only jobs available to your field assignment.')
                        : ot('Persisted operational work, ordered by latest update.')}
                    </p>
                  </div>
                  {capabilities.intake ? (
                    <button className="primary-button" onClick={() => setShowIntake(true)}>
                      <Plus size={16} />
                      {ot('New job')}
                    </button>
                  ) : null}
                </div>
                <JobRegisterSearch
                  api={api}
                  initialJobs={jobs}
                  initialPagination={data?.jobRegisterPagination}
                  t={ot}
                >
                  {(registerJobs) => (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>{ot('Job')}</th>
                            <th>{ot('Client')}</th>
                            <th>{ot('Location')}</th>
                            {!fieldScoped ? <th>{ot('Value')}</th> : null}
                            <th>{ot('Progress')}</th>
                            <th>{ot('Status')}</th>
                            <th aria-label={ot('Open job')} />
                          </tr>
                        </thead>
                        <tbody>
                          {registerJobs.length ? registerJobs.map((job) => (
                            <tr key={job.id}>
                              <td>
                                <strong>{job.title}</strong>
                                <small>{ot(formatStatus(job.jobType))}</small>
                              </td>
                              <td>{job.clientName || ot('Not set')}</td>
                              <td>{job.city || job.address || ot('Not set')}</td>
                              {!fieldScoped ? <td>{currency.format(job.contractValue || job.estimatedCost || 0)}</td> : null}
                              <td>
                                <div className="progress">
                                  <span style={{ width: `${Math.min(100, job.progressPercent || 0)}%` }} />
                                </div>
                                <small>{Math.round(job.progressPercent || 0)}%</small>
                              </td>
                              <td>
                                <span className={`status status-${job.status}`}>{ot(formatStatus(job.status))}</span>
                              </td>
                              <td>
                                <button
                                  className="icon-button table-action"
                                  aria-label={ot('Open {title}', { title: job.title })}
                                  disabled={loading || sectionLoading}
                                  onClick={() => openJobWorkspace(job)}
                                >
                                  <ArrowUpRight size={16} />
                                </button>
                              </td>
                            </tr>
                          )) : <tr><td colSpan={fieldScoped ? 6 : 7}><Empty title={ot('No jobs to show.')} /></td></tr>}
                        </tbody>
                      </table>
                    </div>
                  )}
                </JobRegisterSearch>
              </section>
            )}

            {section === 'recovery' && ['owner', 'office_operator'].includes(operator.role) ? (
              <Suspense fallback={<div className="loading" role="status">{ot('Loading recovery cases...')}</div>}>
                <OperationalRecoveryPortfolio
                  data={data.recoveryPortfolio}
                  locale={operatorLocale}
                  loading={sectionLoading}
                  error={error}
                  onRefresh={() => void refreshSection('recovery')}
                  onOpen={item => {
                    void openJobWorkspace({ id: item.jobId, title: item.jobTitle }).then(() => {
                      const navigateToRecovery = attempt => {
                        if (!document.getElementById('job-operational-recovery') && attempt < 20) {
                          window.setTimeout(() => navigateToRecovery(attempt + 1), 50)
                          return
                        }
                        window.dispatchEvent(new CustomEvent('contractor:dossier-navigate', {
                        detail: { area: 'planning', targetId: 'job-operational-recovery', jobId: item.jobId,
                          sourceType: item.kind === 'unassigned_source' ? item.sourceType : undefined,
                          sourceId: item.kind === 'unassigned_source' ? item.sourceId : undefined },
                        }))
                      }
                      navigateToRecovery(0)
                    })
                  }}
                />
              </Suspense>
            ) : null}

            {section === 'schedule' && capabilities.schedule ? (
              <>
                <LazyControlBoundary label="portfolio schedule">
              <PortfolioScheduleWorkspace
                  api={api}
                  schedule={data.schedule}
                  jobs={jobs}
                  canApprove={capabilities.approvals === true}
                  onOpenApprovals={openApprovals}
                  onOpenDispatch={reviewPortfolioDispatch}
                  onOpen={openJobWorkspace}
                />
              </LazyControlBoundary>
                <LazyControlBoundary label="crew capacity board">
                  <CrewCapacityBoard
                    locale={operatorLocale}
                    board={data.crewCapacity}
                    draftScope={draftRecoveryEnabled ? outboxScope : ''}
                    canApprove={capabilities.approvals === true}
                    submitting={submitting}
                    onLoadWindow={loadCrewCapacityWindow}
                    onSaveProfile={saveCrewCapacityProfile}
                    onCreateAllocation={createCrewCapacityAllocation}
                    onCancelAllocation={cancelCrewCapacityAllocation}
                    onRequestPlan={requestCrewLookaheadApproval}
                    onReviewApproval={reviewCrewLookaheadApproval}
                    onOpenJob={openCrewCapacityJob}
                  />
                </LazyControlBoundary>
                <LazyControlBoundary label="Last Planner weekly control">
                  <LastPlannerBoard
                    locale={operatorLocale}
                    board={data.lastPlanner}
                    jobs={data.operatorScopeJobs || jobs}
                    canApprove={capabilities.approvals === true}
                    submitting={submitting}
                    onLoadWeek={loadLastPlannerWeek}
                    onCreateConstraint={createLastPlannerConstraint}
                    onReleaseConstraint={releaseLastPlannerConstraint}
                    onRequestPlan={requestLastPlannerPlan}
                    onReviewApproval={reviewLastPlannerApproval}
                    onRecordOutcome={recordLastPlannerOutcome}
                    onOpenJob={openCrewCapacityJob}
                  />
                </LazyControlBoundary>
              </>
            ) : null}

            {section === 'approvals' && capabilities.approvals && (
              <section className="panel page-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Approval queue</h2>
                    <p>
                      {approvalFocus
                        ? `Focused on the retained decision for ${approvalFocus.jobTitle || 'this job'}.`
                        : 'Review the exact effects and safeguards before resolving a retained decision.'}
                    </p>
                  </div>
                  {approvalFocus ? (
                    <button className="text-button" onClick={() => setApprovalFocus(null)}>
                      Show all approvals <span className="count-badge">{approvals.length}</span>
                    </button>
                  ) : (
                    <span className="count-badge">{approvals.length}</span>
                  )}
                </div>
                {visibleApprovals.length ? (
                  <div className="approval-list">
                    {visibleApprovals.map((item) => (
                      <ApprovalQueueItem key={item.id} item={item} submitting={submitting} onReview={openApprovalReview} />
                    ))}
                  </div>
                ) : (
                  <Empty
                    title={approvalFocus ? 'Decision no longer waiting' : 'No approvals waiting'}
                    detail={
                      approvalFocus
                        ? 'The focused decision was resolved or is no longer pending. Show all approvals to continue reviewing the queue.'
                        : 'The current ledger has no pending consequential decision.'
                    }
                  />
                )}
              </section>
            )}

            {section === 'dispatch' && capabilities.dispatch ? (
              <LazyControlBoundary label="dispatch workspace">
              <DispatchWorkspace
                dispatch={data.dispatch}
                jobs={jobs}
                canCoordinate={canCoordinate}
                canApprove={capabilities.approvals === true}
                submitting={submitting}
                onPrepare={prepareDispatchPack}
                onControl={openDispatchControl}
                onReviewWorkforce={reviewDispatchWorkforce}
                onReviewEquipment={reviewDispatchEquipment}
                onOpenApprovals={openApprovals}
                onOpen={openJobWorkspace}
              />
              </LazyControlBoundary>
            ) : null}

            {section === 'resources' && capabilities.resources ? (
              <LazyControlBoundary label="resource controls">
                <ResourcesWorkspace
                  locale={operatorLocale}
                  workforce={data.workforce}
                  inventory={data.inventory}
                  workers={workers}
                  workerSummary={data.workerSummary}
                  qualificationRegister={data.qualificationRegister}
                  availabilityRegister={data.availabilityRegister}
                  materialReceiving={data.materialReceiving}
                  tools={tools}
                  toolSummary={data.toolSummary}
                  equipmentCustody={data.equipmentCustody}
                  fiveS={data.fiveS}
                  tradePartners={tradePartners}
                  tradePartnerSummary={data.tradePartnerSummary}
                  timesheets={data.timesheets}
                  jobs={jobs}
                  view={resourceView}
                  onViewChange={selectResourceView}
                  canCoordinate={canCoordinate}
                  canApprove={capabilities.approvals === true}
                  submitting={submitting}
                  onPlan={openResourcePlan}
                  onDraftInstruction={draftWorkerInstruction}
                  onReviewCrewEvidence={reviewCrewEvidence}
                  onPrepareLoading={prepareLoadingChecklist}
                  onDraftProcurement={draftProcurementOrder}
                  onAction={openResourceControl}
                  onCreateWorker={() => openWorkerEditor()}
                  onEditWorker={openWorkerEditor}
                  onRetireWorker={openWorkerRetirement}
                  onAddCredential={openCredentialEditor}
                  onCreateQualificationRequirement={openQualificationRequirementEditor}
                  onRetireQualificationRequirement={openQualificationRequirementRetirement}
                  onCreateAvailability={openAvailabilityEditor}
                  onCancelAvailability={openAvailabilityCancellation}
                  onRequestAssignmentReplacement={requestAssignmentReplacement}
                  onRequestAvailabilityReplacementPlan={requestAvailabilityReplacementPlan}
                  onCreateMaterialReceipt={openMaterialReceiptEditor}
                  onReverseMaterialReceipt={openMaterialReceiptReversal}
                  onCreateEquipment={() => openEquipmentEditor()}
                  onEditEquipment={openEquipmentEditor}
                  onInspectEquipment={openEquipmentInspection}
                  onMaintainEquipment={openEquipmentMaintenance}
                  onRetireEquipment={openEquipmentRetirement}
                  onCheckoutEquipment={openEquipmentCheckout}
                  onReturnEquipment={openEquipmentReturn}
                  onCreatePartner={() => openTradePartnerEditor()}
                  onEditPartner={openTradePartnerEditor}
                  onRetirePartner={openTradePartnerRetirement}
                  onTimesheetPeriodChange={loadTimesheetPeriod}
                  onRequestTimesheet={requestWorkerTimesheet}
                  onPrepareTimesheetExport={prepareTimesheetHandoff}
                  onOpenApprovals={openApprovals}
                  onOpen={openJobWorkspace}
                  request={api}
                />
              </LazyControlBoundary>
            ) : null}

            {section === 'finance' && capabilities.finance ? (
              <LazyControlBoundary label={ot('Finance')}>
              <FinanceWorkspace
                request={api}
                locale={operatorLocale}
                text={ot}
                finance={data.finance}
                cashFlow={data.cashFlow}
                jobs={jobs}
                canCoordinate={canCoordinate}
                canApprove={capabilities.approvals === true}
                submitting={submitting}
                onDraftInvoice={openInvoiceDraft}
                onPreparePackage={prepareFinancePackage}
                onAction={openFinanceControl}
                onOpenApprovals={openApprovals}
                onOpen={openJobWorkspace}
                onCashFlowChange={(cashFlow) => setData((current) => ({ ...current, cashFlow }))}
              />
              </LazyControlBoundary>
            ) : null}

            {section === 'performance' && capabilities.performance ? (
              <>
                <LazyControlBoundary label="performance scorecard">
                  <PerformanceScorecard
                    scorecard={data.performanceScorecard}
                    request={api}
                    canCoordinate={canCoordinate}
                    locale={operatorLocale}
                    canApprove={capabilities.approvals === true}
                    onChange={(performanceScorecard) => setData((current) => ({ ...current, performanceScorecard }))}
                    onOpenApprovals={openApprovals}
                  />
                </LazyControlBoundary>
                <LazyControlBoundary label="operating frameworks">
                  <FrameworkWorkspace
                    catalog={data.frameworkCatalog}
                    workspace={data.frameworkWorkspace}
                    jobs={jobs}
                    request={api}
                    canCoordinate={canCoordinate}
                    locale={operatorLocale}
                    onChange={(frameworkWorkspace) => setData((current) => ({ ...current, frameworkWorkspace }))}
                  />
                </LazyControlBoundary>
              </>
            ) : null}

            {section === 'clients' && capabilities.clientSuccess ? (
              <LazyControlBoundary label="client controls">
                <OfficeConversations jobs={jobs} api={api} locale={operatorLocale} canApprove={capabilities.approvals === true} isOwner={operator.role === 'owner'} onApprovals={openApprovals} draftScope={draftRecoveryEnabled ? outboxScope : ''} target={clientConversationTarget} />
                <ClientsWorkspace
                  clients={data.clients}
                  directory={data.clientDirectory}
                  jobs={jobs}
                  locale={operatorLocale}
                  canCoordinate={canCoordinate}
                  canApprove={capabilities.approvals === true}
                  submitting={submitting}
                  onPrepareCloseout={prepareClientCloseout}
                  onPrepareHandover={prepareClientHandover}
                  onDraftFollowup={draftClientFollowup}
                  onDraftRecurring={draftRecurringPlan}
                  onLifecycle={openClientLifecycle}
                  onOpenApprovals={openApprovals}
                  onOpen={openJobWorkspace}
                  onCreateClient={() => openClientEditor()}
                  onEditClient={openClientEditor}
                />
              </LazyControlBoundary>
            ) : null}

            {section === 'field' && capabilities.fieldEvidence && (
              <section className="panel page-panel field-workspace" data-testid="field-workspace" aria-busy={loading || undefined}>
                {!fieldScoped ? <LazyControlBoundary label="worker work packs"><FieldWorkPack api={api} locale={operatorLocale} canIssueStartRelease={['owner', 'approver'].includes(operator.role)} refreshKey={dashboard.generatedAt} onOpenJob={openJobWorkspace} /></LazyControlBoundary> : null}
                <div className="panel-heading">
                  <div>
                    <h2>{ot('Field updates')}</h2>
                    <p>{ot('Evidence, safety and quality assurance from the operating ledger.')}</p>
                  </div>
                  <button className="secondary-button" onClick={() => selectSection('jobs')}>
                    <BriefcaseBusiness size={16} />
                    {ot('Open jobs')}
                  </button>
                </div>
                {!fieldScoped ? (
                  <LazyControlBoundary label={ot('field assurance controls')}>
                    <FieldAssuranceWorkspace
                      field={data.field}
                      jobs={jobs}
                      locale={operatorLocale}
                      canCoordinate={canCoordinate}
                      canApprove={capabilities.approvals === true}
                      submitting={submitting}
                      onPrepareSafety={prepareFieldSafetyPack}
                      onReview={openFieldReview}
                      onCapture={focusFieldCapture}
                      onOpenApprovals={openApprovals}
                      onOpen={openJobWorkspace}
                    />
                  </LazyControlBoundary>
                ) : null}
                <div className="field-grid">
                  <Metric icon={FolderArchive} label={ot('Evidence stored')} value={metrics.storedDocuments || 0} hint={ot('Photos and documents')} />
                  <Metric
                    icon={TriangleAlert}
                    label={ot('Open incidents')}
                    value={metrics.openIncidents || 0}
                    hint={ot('Require a review')}
                    tone="amber"
                  />
                  <Metric
                    icon={ShieldCheck}
                    label={ot('Safety checks')}
                    value={metrics.safetyChecks || 0}
                    hint={ot('Ledger safety controls')}
                    tone="green"
                  />
                </div>
                <div className="field-note">
                  <HardHat size={20} />
                  <div>
                    <strong>{ot('Field records remain local and auditable.')}</strong>
                    <p>
                      {ot('Evidence, progress, time, and daily safety records use a bounded offline outbox. Exact retries are scoped to this operator and cannot create duplicate ledger entries.')}
                    </p>
                  </div>
                  <div className="field-outbox-status" aria-live="polite">
                    {outboxPending ? (
                      <span className="tag tag-amber">{ot('{count} queued', { count: outboxPending })}</span>
                    ) : (
                      <span className="tag tag-green">{ot('Outbox clear')}</span>
                    )}
                    {outboxQuarantined ? <span className="tag">{ot('{count} other scope', { count: outboxQuarantined })}</span> : null}
                  </div>
                </div>
                <section className="attendance-control" data-testid="attendance-control">
                  <div className="panel-heading">
                    <div>
                      <h2>Site attendance</h2>
                      <p>Assignment and approved access are checked before presence reaches the labor board.</p>
                    </div>
                    <div className="attendance-summary" aria-label="Attendance summary">
                      <span className="tag tag-green">{attendance.summary?.checkedIn || 0} on site</span>
                      {attendance.summary?.stale ? <span className="tag tag-amber">{attendance.summary.stale} review</span> : null}
                    </div>
                  </div>
                  <form className="attendance-form" onSubmit={recordAttendance}>
                    <div className="form-grid">
                      <label>
                        Job
                        <select
                          required
                          value={attendanceDraft.jobId}
                          onChange={(event) => setAttendanceDraft({ ...attendanceDraft, jobId: event.target.value })}
                        >
                          <option value="">Select an assigned job</option>
                          {activeJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
                        </select>
                      </label>
                      {!fieldScoped ? (
                        <label>
                          Crew member
                          <select
                            required
                            value={attendanceDraft.workerId}
                            onChange={(event) => setAttendanceDraft({ ...attendanceDraft, workerId: event.target.value })}
                          >
                            <option value="">Select assigned crew</option>
                            {workers.filter((worker) => !['retired', 'inactive', 'offline', 'unavailable'].includes(worker.status)).map((worker) => (
                              <option key={worker.id} value={worker.id}>{worker.name}</option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      <label>
                        Access point
                        <input
                          maxLength="160"
                          value={attendanceDraft.accessPoint}
                          onChange={(event) => setAttendanceDraft({ ...attendanceDraft, accessPoint: event.target.value })}
                          placeholder="Gate or site entrance"
                        />
                      </label>
                      <label className="form-span">
                        Attendance note
                        <textarea
                          maxLength="2000"
                          value={attendanceDraft.note}
                          onChange={(event) => setAttendanceDraft({ ...attendanceDraft, note: event.target.value })}
                          placeholder="Optional handover or access note"
                        />
                      </label>
                    </div>
                    <div className="modal-actions">
                      <button className={`primary-button ${currentAttendanceSession ? 'attendance-checkout-button' : ''}`} disabled={submitting}>
                        {currentAttendanceSession ? <LogOut size={16} /> : <Timer size={16} />}
                        {submitting
                          ? 'Recording...'
                          : navigator.onLine === false
                            ? `Save ${currentAttendanceSession ? 'check-out' : 'check-in'} offline`
                            : currentAttendanceSession
                              ? 'Check out'
                              : 'Check in'}
                      </button>
                    </div>
                  </form>
                  <div className="attendance-board" aria-live="polite">
                    {(attendance.rows || []).slice(0, 12).map((session) => {
                      const job = jobs.find((item) => item.id === session.jobId)
                      return (
                        <div className="attendance-row" key={session.id}>
                          <span className={`attendance-presence ${session.status === 'checked_in' ? 'attendance-present' : ''}`} aria-hidden="true" />
                          <div>
                            <strong>{session.workerName || 'Crew member'}</strong>
                            <small>{job?.title || session.jobId} / {formatDateTime(session.effectiveCheckInAt)}</small>
                          </div>
                          <div className="attendance-row-state">
                            <span className={`status status-${session.stale ? 'attention' : session.status}`}>{session.stale ? 'review' : formatStatus(session.status)}</span>
                            {session.status === 'checked_in' ? (
                              <button
                                type="button"
                                className="icon-button"
                                title="Select for check-out"
                                aria-label={`Select ${session.workerName || 'crew member'} for check-out`}
                                onClick={() => setAttendanceDraft({
                                  jobId: session.jobId,
                                  workerId: fieldScoped ? '' : session.workerId,
                                  note: '',
                                  accessPoint: session.accessPoint || '',
                                })}
                              >
                                <ChevronRight size={16} />
                              </button>
                            ) : <span>{session.durationHours?.toFixed?.(2) || '0.00'} h</span>}
                          </div>
                        </div>
                      )
                    })}
                    {!attendance.rows?.length ? (
                      <div className="attendance-empty"><Users size={20} /><span>No retained attendance sessions.</span></div>
                    ) : null}
                  </div>
                  <p className="attendance-policy">Operational self-reported presence only. Payroll, statutory registers, and location tracking remain separate.</p>
                </section>
                <section className="safety-briefing-control" data-testid="safety-briefing-control" aria-busy={safetyBriefingLoading}>
                  <div className="panel-heading">
                    <div>
                      <h2>Safety briefings</h2>
                      <p>Worker-scoped acknowledgement, explicit attendance exceptions, and approval-backed facilitator signoff.</p>
                    </div>
                    <div className="safety-briefing-summary" aria-label="Safety briefing summary">
                      <span className="tag">{safetyMeetings.filter((meeting) => ['scheduled', 'in_progress'].includes(meeting.status)).length} active</span>
                      {safetyMeetings.some((meeting) => meeting.status === 'pending_approval') ? <span className="tag tag-amber">Signoff review</span> : null}
                    </div>
                  </div>
                  <div className="safety-briefing-selector">
                    <label>
                      Job
                      <select required value={safetyBriefingDraft.jobId} onChange={(event) => void selectSafetyBriefingJob(event.target.value)}>
                        <option value="">Select an assigned job</option>
                        {activeJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
                      </select>
                    </label>
                    <label>
                      Briefing
                      <select
                        value={safetyBriefingDraft.meetingId}
                        disabled={safetyBriefingLoading || !safetyBriefingDraft.jobId || !selectedJobSafetyMeetings.length}
                        onChange={(event) => {
                          const meetingId = event.target.value
                          setSafetyBriefingDraft((current) => ({ ...current, meetingId, evidenceReference: '', acknowledged: false, completionEvidence: '', excusalReason: '' }))
                        }}
                      >
                        <option value="">{selectedJobSafetyMeetings.length ? 'Select a briefing' : 'No retained briefing'}</option>
                        {selectedJobSafetyMeetings.map((meeting) => (
                          <option key={meeting.id} value={meeting.id}>{meeting.title} / {formatStatus(meeting.status)}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {selectedSafetyMeeting ? (
                    <div className="safety-briefing-detail" aria-live="polite">
                      <div className="safety-briefing-context">
                        <div>
                          <strong>{selectedSafetyMeeting.title}</strong>
                          <small>{formatDateTime(selectedSafetyMeeting.scheduledAt)} / {selectedSafetyMeeting.facilitator || 'Facilitator not assigned'}</small>
                        </div>
                        <span className={`status status-${selectedSafetyMeeting.status}`}>{formatStatus(selectedSafetyMeeting.status)}</span>
                      </div>
                      <div className="safety-briefing-topics">
                        <strong>Retained topics</strong>
                        <ul>{(selectedSafetyMeeting.topics || []).map((topic) => <li key={topic}>{topic}</li>)}</ul>
                      </div>
                      <div className="safety-attendee-list" aria-label="Briefing attendance">
                        {(selectedSafetyMeeting.attendeeRecords || []).map((attendee) => (
                          <div className="safety-attendee-row" key={attendee.id}>
                            <span className={`attendance-presence ${attendee.status === 'acknowledged' ? 'attendance-present' : ''}`} aria-hidden="true" />
                            <div>
                              <strong>{attendee.attendeeName}</strong>
                              <small>{attendee.company || 'Assigned crew'}{attendee.acknowledgedAt ? ` / ${formatDateTime(attendee.acknowledgedAt)}` : ''}</small>
                            </div>
                            <span className={`status status-${attendee.status}`}>{formatStatus(attendee.status)}</span>
                            {canCoordinate && attendee.status === 'expected' ? (
                              <button
                                type="button"
                                className="secondary-button"
                                disabled={submitting || safetyBriefingDraft.excusalReason.trim().length < 8}
                                onClick={() => void excuseSafetyBriefingAttendee(attendee)}
                              >
                                <Ban size={15} /> Excuse
                              </button>
                            ) : null}
                          </div>
                        ))}
                        {!selectedSafetyMeeting.attendeeRecords?.length ? <div className="attendance-empty"><Users size={20} /><span>No assigned attendee is retained for this briefing.</span></div> : null}
                      </div>
                      {fieldScoped && ['scheduled', 'in_progress'].includes(selectedSafetyMeeting.status) ? (
                        <form className="safety-acknowledgement-form" onSubmit={acknowledgeSafetyBriefing}>
                          <label>
                            {ot('Evidence reference')}
                            <input
                              required
                              minLength="3"
                              maxLength="240"
                              value={safetyBriefingDraft.evidenceReference}
                              onChange={(event) => updateSafetyBriefingDraft('evidenceReference', event.target.value)}
                              placeholder={ot('Device, badge, signature, or retained field record')}
                            />
                          </label>
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={safetyBriefingDraft.acknowledged}
                              onChange={(event) => updateSafetyBriefingDraft('acknowledged', event.target.checked)}
                            />
                            I attended, understood the retained topics, and will stop work if conditions or controls change.
                          </label>
                          <button
                            className="primary-button"
                            disabled={submitting || selectedSafetyMeeting.attendeeRecords?.[0]?.status === 'acknowledged'}
                          >
                            <ShieldCheck size={16} />
                            {selectedSafetyMeeting.attendeeRecords?.[0]?.status === 'acknowledged'
                              ? 'Acknowledged'
                              : navigator.onLine === false ? 'Save acknowledgement offline' : 'Acknowledge briefing'}
                          </button>
                        </form>
                      ) : null}
                      {canCoordinate && ['scheduled', 'in_progress'].includes(selectedSafetyMeeting.status) ? (
                        <form className="safety-signoff-form" onSubmit={signOffSafetyBriefing}>
                          {selectedSafetyMeeting.attendanceSummary?.expected ? (
                            <label>
                              Attendance exception reason
                              <input
                                minLength="8"
                                maxLength="500"
                                value={safetyBriefingDraft.excusalReason}
                                onChange={(event) => updateSafetyBriefingDraft('excusalReason', event.target.value)}
                                placeholder="Retained reason for an expected attendee absence"
                              />
                            </label>
                          ) : null}
                          <label>
                            Completion evidence
                            <input
                              required
                              minLength="3"
                              maxLength="240"
                              value={safetyBriefingDraft.completionEvidence}
                              onChange={(event) => updateSafetyBriefingDraft('completionEvidence', event.target.value)}
                              placeholder="Signed register, minutes, photo, or document reference"
                            />
                          </label>
                          <button className="primary-button" disabled={submitting || !selectedSafetyMeeting.attendanceSummary?.readyForSignoff}>
                            <ClipboardCheck size={16} /> Request signoff approval
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ) : safetyBriefingDraft.jobId ? (
                    <div className="attendance-empty"><ClipboardList size={20} /><span>No briefing is retained for this job.</span></div>
                  ) : null}
                  {canCoordinate ? (
                    <form className="safety-briefing-create" aria-busy={safetyBriefingLoading || submitting} inert={safetyBriefingLoading || submitting ? true : undefined} onSubmit={createSafetyBriefing}>
                      <div className="safety-briefing-create-heading">
                        <strong>Schedule briefing</strong>
                        <span>Assigned crew are frozen as expected attendees.</span>
                      </div>
                      <label>
                        Title
                        <input required disabled={safetyBriefingLoading || submitting} minLength="2" maxLength="240" value={safetyBriefingDraft.title} onChange={(event) => updateSafetyBriefingDraft('title', event.target.value)} placeholder="Pre-start or toolbox talk" />
                      </label>
                      <label>
                        Scheduled time
                        <input required disabled={safetyBriefingLoading || submitting} type="datetime-local" value={safetyBriefingDraft.scheduledAt} onChange={(event) => updateSafetyBriefingDraft('scheduledAt', event.target.value)} />
                      </label>
                      <label className="form-span">
                        Discussion topics
                        <textarea required disabled={safetyBriefingLoading || submitting} minLength="2" maxLength="4000" value={safetyBriefingDraft.topics} onChange={(event) => updateSafetyBriefingDraft('topics', event.target.value)} placeholder="One retained topic per line" />
                      </label>
                      <button className="secondary-button" disabled={safetyBriefingLoading || submitting || !safetyBriefingDraft.jobId}>
                        <Plus size={16} /> Schedule briefing
                      </button>
                    </form>
                  ) : null}
                  <p className="attendance-policy">Acknowledgements prove only the retained briefing event. They do not certify legal compliance, worker competence, or unchanged site conditions.</p>
                </section>
                <LazyControlBoundary label="drawing register controls">
                  <DrawingRegisterControl
                    jobs={activeJobs}
                    fieldScoped={fieldScoped}
                    canCoordinate={canCoordinate}
                    apiRequest={api}
                    notify={notify}
                    refresh={refresh}
                    onOpenApprovals={openApprovals}
                    draftScope={draftRecoveryEnabled ? outboxScope : ''}
                  />
                </LazyControlBoundary>
                <LazyControlBoundary label="SDS register controls">
                  <SdsRegisterControl
                    jobs={activeJobs}
                    fieldScoped={fieldScoped}
                    canCoordinate={canCoordinate}
                    operatorRole={operator?.role}
                    text={ot}
                    apiRequest={api}
                    notify={notify}
                    refresh={refresh}
                    onOpenApprovals={openApprovals}
                  />
                </LazyControlBoundary>
                <LazyControlBoundary label="pre-task plan controls">
                  <PreTaskPlanControl
                    jobs={activeJobs}
                    operator={operator}
                    fieldScoped={fieldScoped}
                    canCoordinate={canCoordinate}
                    apiRequest={api}
                    recordFieldOperation={recordFieldOperation}
                    notify={notify}
                    refresh={refresh}
                    outboxScope={outboxScope}
                    refreshOutboxState={refreshOutboxState}
                  />
                </LazyControlBoundary>
                <LazyControlBoundary label="last-minute risk assessment controls">
                  <LmraControl
                    locale={operatorLocale}
                    jobs={activeJobs}
                    fieldScoped={fieldScoped}
                    apiRequest={api}
                    recordFieldOperation={recordFieldOperation}
                    notify={notify}
                    refresh={refresh}
                    outboxScope={outboxScope}
                    refreshOutboxState={refreshOutboxState}
                  />
                </LazyControlBoundary>
                <section className="work-permit-control" data-testid="work-permit-control" aria-busy={workPermitLoading}>
                  <div className="panel-heading">
                    <div>
                      <h2>{ot('Work permits')}</h2>
                      <p>{ot('Approved hazards, controls, validity, and assigned-worker acceptance')}</p>
                    </div>
                    <div className="work-permit-summary" aria-label={ot('Work permit summary')}>
                      <span className="tag">{ot('{count} active', { count: workPermits.filter((permit) => permit.status === 'active').length })}</span>
                      {workPermits.some((permit) => permit.status === 'active' && permit.attendanceSummary?.expected > 0) ? <span className="tag tag-amber">{ot('Crew action')}</span> : null}
                      {workPermits.some((permit) => permit.status === 'suspended') ? <span className="tag tag-red">{ot('Stop work')}</span> : null}
                    </div>
                  </div>
                  <div className="work-permit-selector">
                    <label>
                      {ot('Job')}
                      <select required value={workPermitDraft.jobId} onChange={(event) => void selectWorkPermitJob(event.target.value)}>
                        <option value="">{ot('Select an assigned job')}</option>
                        {activeJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
                      </select>
                    </label>
                    <label>
                      {ot('Permit')}
                      <select
                        value={workPermitDraft.permitId}
                        disabled={workPermitLoading || !workPermitDraft.jobId || !selectedJobWorkPermits.length}
                        onChange={(event) => {
                          const permitId = event.target.value
                          setWorkPermitDraft((current) => ({
                            ...current,
                            permitId,
                            acknowledgementEvidence: '',
                            acknowledged: false,
                            suspensionReason: '',
                            suspensionEvidence: '',
                            closureNote: '',
                            closureEvidence: '',
                          }))
                        }}
                      >
                        <option value="">{selectedJobWorkPermits.length ? ot('Select a permit') : ot('No retained permit')}</option>
                        {selectedJobWorkPermits.map((permit) => (
                          <option key={permit.id} value={permit.id}>{permit.title} / {formatStatus(permit.effectiveStatus || permit.status)}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {selectedWorkPermit ? (
                    <div className="work-permit-detail" aria-live="polite">
                      <div className="work-permit-context">
                        <div>
                          <strong>{selectedWorkPermit.title}</strong>
                          <small>{formatStatus(selectedWorkPermit.permitType)} / {selectedWorkPermit.location || ot('Jobsite')} / {selectedWorkPermit.holder || ot('Project team')}</small>
                        </div>
                        <div className="work-permit-state">
                          {selectedWorkPermit.readyForWork ? <span className="tag tag-green"><Check size={13} /> {ot('Ready')}</span> : null}
                          <span className={`status status-${selectedWorkPermit.status}`}>{formatStatus(selectedWorkPermit.effectiveStatus || selectedWorkPermit.status)}</span>
                        </div>
                      </div>
                      <div className="work-permit-validity">
                        <span><strong>{ot('Valid from')}</strong>{formatDateTime(selectedWorkPermit.validFrom)}</span>
                        <span><strong>{ot('Expires')}</strong>{formatDateTime(selectedWorkPermit.expiresAt)}</span>
                        <span><strong>{ot('Source')}</strong>{selectedWorkPermit.evidenceReference || ot('Not retained')}</span>
                      </div>
                      <div className="work-permit-definition">
                        <div>
                          <strong>{ot('Hazards')}</strong>
                          <ul>{(selectedWorkPermit.hazards || []).map((hazard) => <li key={hazard}>{hazard}</li>)}</ul>
                        </div>
                        <div>
                          <strong>{ot('Controls')}</strong>
                          <ul>{(selectedWorkPermit.controls || []).map((control) => <li key={control}>{control}</li>)}</ul>
                        </div>
                        {selectedWorkPermit.conditions?.length ? (
                          <div>
                            <strong>{ot('Conditions')}</strong>
                            <ul>{selectedWorkPermit.conditions.map((condition) => <li key={condition}>{condition}</li>)}</ul>
                          </div>
                        ) : null}
                      </div>
                      <div className="safety-attendee-list" aria-label={ot('Permit crew acknowledgements')}>
                        {(selectedWorkPermit.attendees || []).map((attendee) => (
                          <div className="safety-attendee-row" key={attendee.id}>
                            <span className={`attendance-presence ${attendee.status === 'acknowledged' ? 'attendance-present' : ''}`} aria-hidden="true" />
                            <div>
                              <strong>{attendee.attendeeName}</strong>
                              <small>{attendee.company || ot('Assigned crew')}{attendee.acknowledgedAt ? ` / ${formatDateTime(attendee.acknowledgedAt)}` : ''}</small>
                            </div>
                            <span className={`status status-${attendee.status}`}>{formatStatus(attendee.status)}</span>
                          </div>
                        ))}
                        {!selectedWorkPermit.attendees?.length ? <div className="attendance-empty"><Users size={20} /><span>{ot('No assigned permit worker is retained.')}</span></div> : null}
                      </div>
                      {selectedWorkPermit.blockers?.length ? (
                        <div className="work-permit-blockers" role="status">
                          <TriangleAlert size={17} />
                          <ul>{selectedWorkPermit.blockers.map((blocker) => <li key={blocker.type}>{workPermitBlockerText(blocker, ot)}</li>)}</ul>
                        </div>
                      ) : null}
                      {fieldScoped && selectedWorkPermit.status === 'active' ? (
                        <form className="work-permit-acknowledgement" onSubmit={acknowledgeWorkPermit}>
                          <label>
                            Evidence reference
                            <input
                              required
                              minLength="3"
                              maxLength="240"
                              value={workPermitDraft.acknowledgementEvidence}
                              onChange={(event) => updateWorkPermitDraft('acknowledgementEvidence', event.target.value)}
                              placeholder={ot('Device, badge, signature, or retained field record')}
                            />
                          </label>
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={workPermitDraft.acknowledged}
                              onChange={(event) => updateWorkPermitDraft('acknowledged', event.target.checked)}
                            />
                            {ot('I reviewed this permit, understand the hazards and controls, and will stop work if conditions change.')}
                          </label>
                          <button
                            className="primary-button"
                            disabled={submitting || selectedWorkPermit.attendees?.[0]?.status === 'acknowledged' || selectedWorkPermit.notStarted || selectedWorkPermit.expired}
                          >
                            <ShieldCheck size={16} />
                            {selectedWorkPermit.attendees?.[0]?.status === 'acknowledged'
                              ? ot('Acknowledged')
                              : navigator.onLine === false ? ot('Save acknowledgement offline') : ot('Acknowledge permit')}
                          </button>
                        </form>
                      ) : null}
                      {canCoordinate && ['active', 'suspended'].includes(selectedWorkPermit.status) ? (
                        <div className="work-permit-actions">
                          {selectedWorkPermit.status === 'active' ? (
                            <form onSubmit={suspendWorkPermit}>
                              <div className="work-permit-action-heading">
                                <strong>{ot('Suspend permit')}</strong>
                                <span>{ot('Stops reliance on this permit immediately.')}</span>
                              </div>
                              <label>
                                {ot('Stop-work reason')}
                                <input required disabled={submitting} minLength="8" maxLength="500" value={workPermitDraft.suspensionReason} onChange={(event) => updateWorkPermitDraft('suspensionReason', event.target.value)} />
                              </label>
                              <label>
                                {ot('Evidence reference')}
                                <input required disabled={submitting} minLength="3" maxLength="240" value={workPermitDraft.suspensionEvidence} onChange={(event) => updateWorkPermitDraft('suspensionEvidence', event.target.value)} />
                              </label>
                              <button className="secondary-button danger-button" disabled={submitting}><Ban size={15} /> {ot('Suspend')}</button>
                            </form>
                          ) : null}
                          <form onSubmit={closeWorkPermit}>
                            <div className="work-permit-action-heading">
                              <strong>{ot('Close permit')}</strong>
                              <span>{ot('Retains completion and hand-back evidence.')}</span>
                            </div>
                            <label>
                              {ot('Completion note')}
                              <input required disabled={submitting} minLength="8" maxLength="500" value={workPermitDraft.closureNote} onChange={(event) => updateWorkPermitDraft('closureNote', event.target.value)} />
                            </label>
                            <label>
                              {ot('Closeout evidence')}
                              <input required disabled={submitting} minLength="3" maxLength="240" value={workPermitDraft.closureEvidence} onChange={(event) => updateWorkPermitDraft('closureEvidence', event.target.value)} />
                            </label>
                            <button className="secondary-button" disabled={submitting}><Check size={15} /> {ot('Close permit')}</button>
                          </form>
                        </div>
                      ) : null}
                    </div>
                  ) : workPermitDraft.jobId ? (
                    <div className="attendance-empty"><LockKeyhole size={20} /><span>{ot('No governed work permit is retained for this job.')}</span></div>
                  ) : null}
                  {canCoordinate ? (
                    <form className="work-permit-create" aria-busy={workPermitLoading || submitting} inert={workPermitLoading || submitting ? true : undefined} onSubmit={createWorkPermit}>
                      <div className="work-permit-create-heading">
                        <strong>{ot('Request permit activation')}</strong>
                        <span>{ot('Current assigned crew are frozen into the approval snapshot.')}</span>
                      </div>
                      <div className="work-permit-field">
                        <label htmlFor="work-permit-type">{ot('Permit type')}</label>
                        <select id="work-permit-type" disabled={workPermitLoading || submitting} value={workPermitDraft.permitType} onChange={(event) => updateWorkPermitDraft('permitType', event.target.value)}>
                          <option value="general_work">{ot('General work')}</option>
                          <option value="hot_work">{ot('Hot work')}</option>
                          <option value="confined_space">{ot('Confined space')}</option>
                          <option value="electrical_isolation">{ot('Electrical isolation')}</option>
                          <option value="excavation">{ot('Excavation')}</option>
                          <option value="lifting">{ot('Lifting')}</option>
                          <option value="work_at_height">{ot('Work at height')}</option>
                        </select>
                      </div>
                      <div className="work-permit-field">
                        <label htmlFor="work-permit-title">{ot('Title')}</label>
                        <input id="work-permit-title" required disabled={workPermitLoading || submitting} minLength="3" maxLength="240" value={workPermitDraft.title} onChange={(event) => updateWorkPermitDraft('title', event.target.value)} />
                      </div>
                      <div className="work-permit-field">
                        <label htmlFor="work-permit-location">{ot('Location')}</label>
                        <input id="work-permit-location" disabled={workPermitLoading || submitting} maxLength="240" value={workPermitDraft.location} onChange={(event) => updateWorkPermitDraft('location', event.target.value)} />
                      </div>
                      <div className="work-permit-field">
                        <label htmlFor="work-permit-valid-from">{ot('Valid from')}</label>
                        <input id="work-permit-valid-from" required disabled={workPermitLoading || submitting} type="datetime-local" value={workPermitDraft.validFrom} onChange={(event) => updateWorkPermitDraft('validFrom', event.target.value)} />
                      </div>
                      <div className="work-permit-field">
                        <label htmlFor="work-permit-expires-at">{ot('Expires')}</label>
                        <input id="work-permit-expires-at" required disabled={workPermitLoading || submitting} type="datetime-local" value={workPermitDraft.expiresAt} onChange={(event) => updateWorkPermitDraft('expiresAt', event.target.value)} />
                      </div>
                      <div className="work-permit-field">
                        <label htmlFor="work-permit-source-evidence">{ot('Source evidence')}</label>
                        <input id="work-permit-source-evidence" required disabled={workPermitLoading || submitting} minLength="3" maxLength="240" value={workPermitDraft.sourceEvidence} onChange={(event) => updateWorkPermitDraft('sourceEvidence', event.target.value)} />
                      </div>
                      <div className="work-permit-field">
                        <label htmlFor="work-permit-hazards">{ot('Hazards')}</label>
                        <textarea id="work-permit-hazards" required disabled={workPermitLoading || submitting} minLength="2" maxLength="4000" value={workPermitDraft.hazards} onChange={(event) => updateWorkPermitDraft('hazards', event.target.value)} placeholder={ot('One retained hazard per line')} />
                      </div>
                      <div className="work-permit-field">
                        <label htmlFor="work-permit-controls">{ot('Controls')}</label>
                        <textarea id="work-permit-controls" required disabled={workPermitLoading || submitting} minLength="2" maxLength="4000" value={workPermitDraft.controls} onChange={(event) => updateWorkPermitDraft('controls', event.target.value)} placeholder={ot('One retained control per line')} />
                      </div>
                      <div className="work-permit-field">
                        <label htmlFor="work-permit-conditions">{ot('Conditions')}</label>
                        <textarea id="work-permit-conditions" disabled={workPermitLoading || submitting} maxLength="4000" value={workPermitDraft.conditions} onChange={(event) => updateWorkPermitDraft('conditions', event.target.value)} placeholder={ot('One stop or revalidation condition per line')} />
                      </div>
                      <button className="secondary-button" disabled={workPermitLoading || submitting || !workPermitDraft.jobId}><Plus size={16} /> {ot('Request approval')}</button>
                    </form>
                  ) : null}
                  <p className="attendance-policy">{ot('Permit readiness is derived from approval, validity, retained integrity, and every assigned worker acknowledgement. Changed conditions require stop work and a current permit.')}</p>
                </section>
                <section className="equipment-handoff-control" data-testid="field-equipment-custody">
                  <div className="panel-heading">
                    <div>
                      <h2>{ot('Equipment handoff')}</h2>
                      <p>{ot('Physical custody and return condition')}</p>
                    </div>
                    <div className="equipment-handoff-summary" aria-live="polite">
                      {fieldEquipmentCustody.length ? <span className="tag tag-amber">{ot('{count} checked out', { count: fieldEquipmentCustody.length })}</span> : null}
                      <Wrench size={20} />
                    </div>
                  </div>
                  <div className="equipment-field-selector">
                    <label>
                      {ot('Job')}
                      <select required value={fieldEquipmentCheckout.jobId || fieldEquipmentReturn.jobId} onChange={(event) => void selectFieldEquipmentJob(event.target.value)}>
                        <option value="">{ot('Select an active job')}</option>
                        {activeJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
                      </select>
                    </label>
                    {navigator.onLine === false && !fieldEquipmentPlans.length && !fieldEquipmentCustody.length ? (
                      <p className="workflow-note">{ot('Reconnect to load the retained reservations and active custody for this job.')}</p>
                    ) : null}
                  </div>
                  {fieldEquipmentCustody.length ? (
                    <div className="equipment-field-custody-list" aria-label={ot('Active equipment custody')}>
                      {fieldEquipmentCustody.map((session) => (
                        <div className="equipment-field-custody-row" key={session.id}>
                          <span className={`equipment-custody-marker ${session.overdue ? 'equipment-custody-marker-alert' : ''}`} aria-hidden="true" />
                          <div>
                            <strong>{session.toolName}</strong>
                            <small>{session.workerName || session.checkedOutBy} / {ot('due {date}', { date: session.dueBackAt ? formatDateTime(session.dueBackAt) : ot('open') })}</small>
                          </div>
                          <button type="button" className="secondary-button" disabled={submitting} onClick={() => setFieldEquipmentReturn(emptyEquipmentReturnDraft(session))}>
                            <PackageCheck size={15} /> {ot('Return')}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {fieldEquipmentReturn.custodySessionId ? (
                    <form className="equipment-field-form equipment-return-form" data-testid="field-equipment-return-form" onSubmit={recordFieldEquipmentReturn}>
                      <div className="equipment-field-form-heading">
                        <strong>{ot('Return {name}', { name: fieldEquipmentCustody.find(session => session.id === fieldEquipmentReturn.custodySessionId)?.toolName || ot('equipment') })}</strong>
                        <button type="button" className="icon-button" aria-label={ot('Cancel equipment return')} onClick={() => setFieldEquipmentReturn(emptyEquipmentReturnDraft())}><X size={16} /></button>
                      </div>
                      <div className="form-grid">
                        <label>
                          {ot('Returned at')}
                          <input required type="datetime-local" max={toLocalDateTimeInput(new Date())} value={fieldEquipmentReturn.returnedAt} onChange={(event) => setFieldEquipmentReturn({ ...fieldEquipmentReturn, returnedAt: event.target.value })} />
                        </label>
                        {!fieldScoped ? (
                          <label>
                            {ot('Returned by')}
                            <input required minLength="2" maxLength="160" value={fieldEquipmentReturn.returnedBy} onChange={(event) => setFieldEquipmentReturn({ ...fieldEquipmentReturn, returnedBy: event.target.value })} />
                          </label>
                        ) : null}
                        <label>
                          {ot('Return condition')}
                          <select value={fieldEquipmentReturn.condition} onChange={(event) => setFieldEquipmentReturn({ ...fieldEquipmentReturn, condition: event.target.value })}>
                            <option value="serviceable">{ot('Serviceable')}</option>
                            <option value="good">{ot('Good')}</option>
                            <option value="damaged">{ot('Damaged')}</option>
                            <option value="unsafe">{ot('Unsafe')}</option>
                            <option value="lost">{ot('Lost')}</option>
                          </select>
                        </label>
                        <label>
                          {ot('Return location')}
                          <input maxLength="240" value={fieldEquipmentReturn.location} onChange={(event) => setFieldEquipmentReturn({ ...fieldEquipmentReturn, location: event.target.value })} placeholder={ot('Depot, yard, or quarantine bay')} />
                        </label>
                        <label>
                          {ot('Meter')}
                          <input type="number" min="0" step="any" inputMode="decimal" value={fieldEquipmentReturn.meter} onChange={(event) => setFieldEquipmentReturn({ ...fieldEquipmentReturn, meter: event.target.value })} />
                        </label>
                        <label className="form-span">
                          {ot('Return evidence reference')}
                          <input required minLength="3" maxLength="240" value={fieldEquipmentReturn.evidenceReference} onChange={(event) => setFieldEquipmentReturn({ ...fieldEquipmentReturn, evidenceReference: event.target.value })} placeholder={ot('Photo, checklist, or signed handoff')} />
                        </label>
                        <label className="form-span">
                          {ot('Return findings')}
                          <textarea required={['damaged', 'unsafe', 'lost'].includes(fieldEquipmentReturn.condition)} minLength={['damaged', 'unsafe', 'lost'].includes(fieldEquipmentReturn.condition) ? 8 : undefined} maxLength="2000" value={fieldEquipmentReturn.notes} onChange={(event) => setFieldEquipmentReturn({ ...fieldEquipmentReturn, notes: event.target.value })} placeholder={ot('Condition, missing parts, or isolation detail')} />
                        </label>
                      </div>
                      <div className="modal-actions">
                        <button className="primary-button" disabled={submitting}>
                          <PackageCheck size={16} />
                          {submitting ? ot('Recording...') : navigator.onLine === false ? ot('Save return offline') : ot('Retain return')}
                        </button>
                      </div>
                    </form>
                  ) : null}
                  {fieldEquipmentPlans.length ? (
                    <form className="equipment-field-form equipment-checkout-form" data-testid="field-equipment-checkout-form" onSubmit={recordFieldEquipmentCheckout}>
                      <div className="equipment-field-form-heading"><strong>{ot('Check out reserved equipment')}</strong></div>
                      <div className="form-grid">
                        <label className="form-span">
                          {ot('Reservation')}
                          <select required value={fieldEquipmentCheckout.reservationId} onChange={(event) => selectFieldEquipmentPlan(event.target.value)}>
                            <option value="">{ot('Select a checkout-ready reservation')}</option>
                            {fieldEquipmentPlans.map((plan) => (
                              <option key={plan.reservation.id} value={plan.reservation.id} disabled={!plan.checkoutReady}>
                                {plan.tool.name} / {plan.checkoutReady ? ot('ready') : plan.activeCustody ? ot('already checked out') : ot('{status} - blocked', { status: ot(plan.tool.status.replaceAll('_', ' ')) })}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          {ot('Checked out at')}
                          <input required type="datetime-local" max={toLocalDateTimeInput(new Date())} value={fieldEquipmentCheckout.checkedOutAt} onChange={(event) => setFieldEquipmentCheckout({ ...fieldEquipmentCheckout, checkedOutAt: event.target.value })} />
                        </label>
                        <label>
                          {ot('Due back')}
                          <input type="datetime-local" min={fieldEquipmentCheckout.checkedOutAt} value={fieldEquipmentCheckout.dueBackAt} onChange={(event) => setFieldEquipmentCheckout({ ...fieldEquipmentCheckout, dueBackAt: event.target.value })} />
                        </label>
                        {!fieldScoped ? (
                          <label>
                            {ot('Physical custodian')}
                            <input required minLength="2" maxLength="160" value={fieldEquipmentCheckout.checkedOutBy} onChange={(event) => setFieldEquipmentCheckout({ ...fieldEquipmentCheckout, checkedOutBy: event.target.value })} />
                          </label>
                        ) : null}
                        <label>
                          {ot('Checkout condition')}
                          <select value={fieldEquipmentCheckout.condition} onChange={(event) => setFieldEquipmentCheckout({ ...fieldEquipmentCheckout, condition: event.target.value })}>
                            <option value="good">{ot('Good')}</option>
                            <option value="serviceable">{ot('Serviceable')}</option>
                          </select>
                        </label>
                        <label>
                          {ot('Handoff location')}
                          <input maxLength="240" value={fieldEquipmentCheckout.location} onChange={(event) => setFieldEquipmentCheckout({ ...fieldEquipmentCheckout, location: event.target.value })} placeholder={ot('Depot, yard, or project gate')} />
                        </label>
                        <label>
                          {ot('Meter')}
                          <input type="number" min="0" step="any" inputMode="decimal" value={fieldEquipmentCheckout.meter} onChange={(event) => setFieldEquipmentCheckout({ ...fieldEquipmentCheckout, meter: event.target.value })} />
                        </label>
                        <label className="form-span">
                          {ot('Handoff evidence reference')}
                          <input required minLength="3" maxLength="240" value={fieldEquipmentCheckout.evidenceReference} onChange={(event) => setFieldEquipmentCheckout({ ...fieldEquipmentCheckout, evidenceReference: event.target.value })} placeholder={ot('Photo, checklist, or signed handoff')} />
                        </label>
                        <label className="form-span">
                          {ot('Handoff note')}
                          <textarea maxLength="2000" value={fieldEquipmentCheckout.notes} onChange={(event) => setFieldEquipmentCheckout({ ...fieldEquipmentCheckout, notes: event.target.value })} placeholder={ot('Keys, accessories, restrictions, or visible condition')} />
                        </label>
                      </div>
                      <div className="modal-actions">
                        <button className="primary-button" disabled={submitting || !selectedFieldEquipmentPlan?.checkoutReady}>
                          <ArrowUpRight size={16} />
                          {submitting ? ot('Recording...') : navigator.onLine === false ? ot('Save handoff offline') : ot('Retain checkout')}
                        </button>
                      </div>
                    </form>
                  ) : null}
                  {fieldEquipmentCheckout.jobId && navigator.onLine !== false && !fieldEquipmentPlans.length && !fieldEquipmentCustody.length ? (
                    <Empty title={ot('No equipment handoff available')} detail={ot('This job has no checkout-ready retained equipment reservation.')} />
                  ) : null}
                  <p className="attendance-policy">{ot('Custody records are internal operational evidence. External hire, spend, and statutory inspection remain separately governed.')}</p>
                </section>
                <section className="evidence-form field-five-s-panel">
                  <LazyControlBoundary label="5S field controls">
                    <FiveSWorkspace
                      locale={operatorLocale}
                      request={api}
                      jobs={activeJobs}
                      fieldMode
                      operatorName={operator.name || operator.worker?.name || ''}
                      onSubmitFieldAudit={submitFieldFiveSAudit}
                    />
                  </LazyControlBoundary>
                </section>
                <section className="evidence-form field-environmental-panel" data-testid="field-environmental-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Environmental activity</h2>
                      <p>Retain measured site activity with the exact evidence and emission-factor source used for the calculation.</p>
                    </div>
                    <Leaf size={20} />
                  </div>
                  <form data-testid="field-environmental-activity-form" aria-busy={environmentalLoading} onSubmit={recordFieldEnvironmentalActivity}>
                    <div className="form-grid environmental-job-grid">
                      <label>
                        Job
                        <select required value={fieldEnvironmentalActivity.jobId} onChange={(event) => void selectFieldEnvironmentalJob(event.target.value)}>
                          <option value="">Select an active job</option>
                          {activeJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
                        </select>
                      </label>
                    </div>
                    <fieldset className="form-grid environmental-fieldset" disabled={environmentalLoading}>
                      <label>
                        Activity date
                        <input required type="date" max={futureDateInput(0)} value={fieldEnvironmentalActivity.activityDate} onChange={(event) => updateFieldEnvironmentalActivity('activityDate', event.target.value)} />
                      </label>
                      <label>
                        Category
                        <select value={fieldEnvironmentalActivity.category} onChange={(event) => updateEnvironmentalCategory(event.target.value)}>
                          <option value="fuel">Fuel</option>
                          <option value="electricity">Electricity</option>
                          <option value="district_heat">District heat</option>
                          <option value="refrigerant">Refrigerant</option>
                          <option value="transport">Transport</option>
                          <option value="material">Material</option>
                          <option value="waste">Waste</option>
                          <option value="water">Water</option>
                          <option value="accommodation">Accommodation</option>
                          <option value="other">Other</option>
                        </select>
                      </label>
                      <label>
                        GHG scope
                        <select value={fieldEnvironmentalActivity.ghgScope} onChange={(event) => updateFieldEnvironmentalActivity('ghgScope', event.target.value)}>
                          <option value="scope_1">Scope 1</option>
                          <option value="scope_2">Scope 2</option>
                          <option value="scope_3">Scope 3</option>
                          <option value="unclassified">Unclassified</option>
                        </select>
                      </label>
                      <label className="form-span">
                        Activity description
                        <input required minLength="3" maxLength="240" value={fieldEnvironmentalActivity.description} onChange={(event) => updateFieldEnvironmentalActivity('description', event.target.value)} placeholder="Generator diesel, temporary power, delivery distance, waste transfer" />
                      </label>
                      <label>
                        Quantity
                        <input required type="number" min="0.000001" step="any" inputMode="decimal" value={fieldEnvironmentalActivity.quantity} onChange={(event) => updateFieldEnvironmentalActivity('quantity', event.target.value)} />
                      </label>
                      <label>
                        Unit
                        <input required maxLength="24" value={fieldEnvironmentalActivity.unit} onChange={(event) => updateFieldEnvironmentalActivity('unit', event.target.value)} placeholder="litre, kWh, kg, km" />
                      </label>
                      <label>
                        Factor (kg CO2e / unit)
                        <input required type="number" min="0" step="any" inputMode="decimal" value={fieldEnvironmentalActivity.emissionFactor} onChange={(event) => updateFieldEnvironmentalActivity('emissionFactor', event.target.value)} />
                      </label>
                      <div className="environmental-calculation" aria-live="polite">
                        <span>Calculated emissions</span>
                        <strong>{roundDisplay(Number(fieldEnvironmentalActivity.quantity || 0) * Number(fieldEnvironmentalActivity.emissionFactor || 0))} kg CO2e</strong>
                      </div>
                      <label>
                        Factor source
                        <input required minLength="3" maxLength="240" value={fieldEnvironmentalActivity.factorSource} onChange={(event) => updateFieldEnvironmentalActivity('factorSource', event.target.value)} placeholder="Authority, supplier, or retained factor library" />
                      </label>
                      <label>
                        Factor reference
                        <input required minLength="3" maxLength="500" value={fieldEnvironmentalActivity.factorReference} onChange={(event) => updateFieldEnvironmentalActivity('factorReference', event.target.value)} placeholder="Publication version, URL, or controlled record ID" />
                      </label>
                      <label className="form-span">
                        Activity evidence reference
                        <input required minLength="3" maxLength="500" value={fieldEnvironmentalActivity.evidenceReference} onChange={(event) => updateFieldEnvironmentalActivity('evidenceReference', event.target.value)} placeholder="Meter statement, delivery ticket, fuel receipt, or waste transfer note" />
                      </label>
                      <label className="form-span">
                        Review note
                        <textarea maxLength="2000" value={fieldEnvironmentalActivity.notes} onChange={(event) => updateFieldEnvironmentalActivity('notes', event.target.value)} placeholder="Measurement boundary, allocation basis, or retained context" />
                      </label>
                    </fieldset>
                    <div className="modal-actions">
                      <button className="primary-button" disabled={submitting || environmentalLoading}>
                        <Leaf size={16} />
                        {submitting ? 'Recording...' : environmentalLoading ? 'Loading sources...' : navigator.onLine === false ? 'Save activity offline' : 'Request source review'}
                      </button>
                    </div>
                  </form>
                  {environmentalRegister?.summary ? (
                    <div className="environmental-summary" aria-label="Environmental register summary">
                      <div><span>Recognized</span><strong>{roundDisplay(environmentalRegister.summary.totalKgCo2e || 0)} kg CO2e</strong></div>
                      <div><span>Approved sources</span><strong>{environmentalRegister.summary.recognizedRecords || 0}</strong></div>
                      <div><span>Pending review</span><strong>{environmentalRegister.summary.pendingRecords || 0}</strong></div>
                      <div><span>Pending correction</span><strong>{environmentalRegister.summary.pendingReversals || 0}</strong></div>
                    </div>
                  ) : null}
                  {fieldEnvironmentalActivities.length ? (
                    <div className="field-environmental-list" aria-label="Recent environmental activities">
                      {fieldEnvironmentalActivities.map((activity) => (
                        <div className="field-environmental-row" key={activity.id}>
                          <div>
                            <strong>{activity.description}</strong>
                            <small>{formatDate(activity.activityDate)} / {formatStatus(activity.category)} / {roundDisplay(activity.quantity)} {activity.unit} x {roundDisplay(activity.emissionFactor)}</small>
                            <small>{activity.factorSource} / {activity.evidenceReference}</small>
                          </div>
                          <div>
                            <strong>{roundDisplay(activity.emissionsKgCo2e)} kg CO2e</strong>
                            <span className={`status status-${activity.status}`}>{formatStatus(activity.status)}</span>
                            {!fieldScoped && activity.status === 'approved' ? (
                              <button
                                type="button"
                                className="icon-button icon-button-small"
                                aria-label={`Request reversal for ${activity.description}`}
                                title="Request compensating reversal"
                                onClick={() => {
                                  setEnvironmentalReversal(activity)
                                  setEnvironmentalReversalReason('')
                                }}
                              >
                                <Undo2 size={14} />
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : fieldEnvironmentalActivity.jobId && navigator.onLine !== false ? (
                    <Empty title="No environmental activity retained" detail="Record the first measured source before preparing a report." />
                  ) : null}
                  {!fieldScoped && fieldEnvironmentalActivity.jobId ? (
                    <form className="environmental-report-control" data-testid="environmental-report-form" onSubmit={prepareEnvironmentalReport}>
                      <div>
                        <strong>Environmental report</strong>
                        <small>Freeze approved sources into a checksum-protected CSV package.</small>
                      </div>
                      <label>
                        From
                        <input required type="date" max={environmentalReportDraft.periodEnd} value={environmentalReportDraft.periodStart} onChange={(event) => setEnvironmentalReportDraft({ ...environmentalReportDraft, periodStart: event.target.value })} />
                      </label>
                      <label>
                        Through
                        <input required type="date" min={environmentalReportDraft.periodStart} max={futureDateInput(0)} value={environmentalReportDraft.periodEnd} onChange={(event) => setEnvironmentalReportDraft({ ...environmentalReportDraft, periodEnd: event.target.value })} />
                      </label>
                      <button className="secondary-button" disabled={submitting || !environmentalRegister?.readyForReport}>
                        <FileDown size={16} />
                        Prepare report
                      </button>
                    </form>
                  ) : null}
                  {!fieldScoped && environmentalReports.length ? (
                    <div className="environmental-report-list" aria-label="Environmental reports">
                      {environmentalReports.map((report) => (
                        <div key={report.id}>
                          <span>
                            <strong>{formatDate(report.periodStart)} to {formatDate(report.periodEnd)}</strong>
                            <small>{report.activityCount} source(s) / {roundDisplay(report.summary?.totalKgCo2e || 0)} kg CO2e</small>
                          </span>
                          <span className={`status status-${report.status}`}>{formatStatus(report.status)}</span>
                          {report.status === 'approved' ? (
                            <a className="icon-button icon-button-small" href={companyApiUrl(report.downloadPath)} aria-label={`Download environmental report ${report.periodStart} to ${report.periodEnd}`} title="Download verified CSV">
                              <FileDown size={14} />
                            </a>
                          ) : null}
                          {!report.sourceCurrent ? <span className="status status-attention">Source changed</span> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <p className="attendance-policy">Calculations use the retained operator-supplied factor source. Approval does not certify a footprint, submit a report, or buy offsets.</p>
                </section>
                <form className="evidence-form field-expense-receipt-form" data-testid="field-expense-receipt-form" aria-busy={expenseReceiptLoading} onSubmit={recordFieldExpenseReceipt}>
                  <div className="panel-heading">
                    <div>
                      <h2>Expense receipt</h2>
                      <p>Retain the original receipt identity, VAT basis, payment method, and job allocation for approval.</p>
                    </div>
                    <ReceiptEuro size={20} />
                  </div>
                  <div className="form-grid expense-receipt-job-grid">
                    <label>
                      Job
                      <select required value={fieldExpenseReceipt.jobId} onChange={(event) => void selectFieldExpenseJob(event.target.value)}>
                        <option value="">Select an active job</option>
                        {activeJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
                      </select>
                    </label>
                  </div>
                  <fieldset className="form-grid expense-receipt-fieldset" disabled={expenseReceiptLoading}>
                    <label>
                      Expense date
                      <input required type="date" max={futureDateInput(0)} value={fieldExpenseReceipt.expenseDate} onChange={(event) => updateFieldExpenseReceipt('expenseDate', event.target.value)} />
                    </label>
                    <label>
                      Category
                      <select value={fieldExpenseReceipt.category} onChange={(event) => updateFieldExpenseReceipt('category', event.target.value)}>
                        <option value="materials">Materials</option>
                        <option value="equipment">Equipment</option>
                        <option value="travel">Travel</option>
                        <option value="parking">Parking</option>
                        <option value="fuel">Fuel</option>
                        <option value="accommodation">Accommodation</option>
                        <option value="meals">Meals</option>
                        <option value="subcontractor">Subcontractor</option>
                        <option value="general">General</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <label>
                      Vendor
                      <input required minLength="2" maxLength="160" value={fieldExpenseReceipt.vendor} onChange={(event) => updateFieldExpenseReceipt('vendor', event.target.value)} placeholder="Supplier or merchant" />
                    </label>
                    <label>
                      Receipt reference
                      <input required minLength="3" maxLength="240" value={fieldExpenseReceipt.receiptReference} onChange={(event) => updateFieldExpenseReceipt('receiptReference', event.target.value)} placeholder="Receipt number or retained evidence reference" />
                    </label>
                    <label>
                      Gross total (EUR)
                      <input required type="number" min="0.01" step="0.01" inputMode="decimal" value={fieldExpenseReceipt.totalAmount} onChange={(event) => updateFieldExpenseReceipt('totalAmount', event.target.value)} />
                    </label>
                    <label>
                      VAT amount (EUR)
                      <input required type="number" min="0" max={fieldExpenseReceipt.totalAmount || undefined} step="0.01" inputMode="decimal" value={fieldExpenseReceipt.taxAmount} onChange={(event) => updateFieldExpenseReceipt('taxAmount', event.target.value)} />
                    </label>
                    <label>
                      VAT treatment
                      <select value={fieldExpenseReceipt.taxTreatment} onChange={(event) => updateFieldExpenseTaxTreatment(event.target.value)}>
                        <option value="recoverable">Recoverable VAT</option>
                        <option value="non_recoverable">Non-recoverable VAT</option>
                        <option value="exempt">VAT exempt</option>
                        <option value="reverse_charge">Reverse charge</option>
                      </select>
                    </label>
                    <label>
                      Payment method
                      <select value={fieldExpenseReceipt.paymentMethod} onChange={(event) => updateFieldExpenseReceipt('paymentMethod', event.target.value)}>
                        <option value="company_card">Company card</option>
                        <option value="personal_card">Personal card</option>
                        <option value="cash">Cash</option>
                        <option value="bank_transfer">Bank transfer</option>
                        <option value="direct_debit">Direct debit</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <label>
                      Cost code
                      <input required minLength="2" maxLength="80" value={fieldExpenseReceipt.costCode} onChange={(event) => updateFieldExpenseReceipt('costCode', event.target.value)} />
                    </label>
                    <label className="form-span">
                      Receipt note
                      <textarea maxLength="2000" value={fieldExpenseReceipt.notes} onChange={(event) => updateFieldExpenseReceipt('notes', event.target.value)} placeholder="Purpose, allocation, or review context" />
                    </label>
                  </fieldset>
                  {fieldExpenseReceipts.length ? (
                    <div className="field-expense-receipt-list" aria-label="Recent expense receipts">
                      {fieldExpenseReceipts.map((expense) => (
                        <div className="field-expense-receipt-row" key={expense.id}>
                          <div>
                            <strong>{expense.vendor}</strong>
                            <small>{expense.receiptReference} / {formatDate(expense.expenseDate)} / {formatStatus(expense.taxTreatment)}</small>
                          </div>
                          <div>
                            <strong>{currency.format(expense.totalAmount || 0)}</strong>
                            <span className={`status status-${expense.status}`}>{formatStatus(expense.status)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="modal-actions">
                    <button className="primary-button" disabled={submitting || expenseReceiptLoading}>
                      <ReceiptEuro size={16} />
                      {submitting ? 'Recording...' : expenseReceiptLoading ? 'Loading receipts...' : navigator.onLine === false ? 'Save receipt offline' : 'Request expense approval'}
                    </button>
                  </div>
                  <p className="attendance-policy">Approval recognizes the job cost only. Reimbursement, card settlement, bookkeeping export, and supplier contact remain separate.</p>
                </form>
                <form className="evidence-form material-receipt-form" data-testid="field-material-receipt-form" aria-busy={materialReceiptLoading || submitting} onSubmit={recordFieldMaterialReceipt}>
                  <div className="panel-heading">
                    <div>
                      <h2>Receive materials</h2>
                      <p>Retain the delivery note, physical receiver, and accepted or damaged quantities at the point of receipt.</p>
                    </div>
                    <PackageCheck size={20} />
                  </div>
                  <fieldset className="material-receipt-fieldset" disabled={materialReceiptLoading || submitting}>
                  <div className="form-grid">
                    <label>
                      Job
                      <select required value={fieldMaterialReceipt.jobId} onChange={(event) => void selectFieldMaterialReceiptJob(event.target.value)}>
                        <option value="">Select an active job</option>
                        {activeJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
                      </select>
                    </label>
                    {fieldMaterialReceiptPlans.length ? (
                      <label>
                        Purchase order
                        <select value={fieldMaterialReceipt.purchaseOrderId} onChange={(event) => selectFieldMaterialReceiptPlan(event.target.value)}>
                          <option value="">Unlinked delivery</option>
                          {fieldMaterialReceiptPlans.map((plan) => (
                            <option key={plan.purchaseOrder.id} value={plan.purchaseOrder.id}>
                              {plan.purchaseOrder.issueReference || plan.purchaseOrder.id} / {plan.summary.remainingLines} line(s) open
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {selectedFieldMaterialReceiptPlan?.lines.filter((line) => !line.complete).length > 1 ? (
                      <label>
                        Order line
                        <select value={fieldMaterialReceipt.lines[0].lineKey} onChange={(event) => selectFieldMaterialReceiptLine(event.target.value)}>
                          {selectedFieldMaterialReceiptPlan.lines.filter((line) => !line.complete).map((line) => (
                            <option key={line.lineKey} value={line.lineKey}>{line.itemName} / {roundDisplay(line.remainingQuantity)} {line.unit}</option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <label>
                      Delivery-note reference
                      <input required minLength="3" maxLength="160" value={fieldMaterialReceipt.receiptReference} onChange={(event) => updateFieldMaterialReceipt('receiptReference', event.target.value)} placeholder="Supplier ticket number" />
                    </label>
                    <label>
                      Delivered at
                      <input required type="datetime-local" max={toLocalDateTimeInput(new Date())} value={fieldMaterialReceipt.deliveredAt} onChange={(event) => updateFieldMaterialReceipt('deliveredAt', event.target.value)} />
                    </label>
                    {!fieldScoped ? (
                      <label>
                        Received by
                        <input required minLength="2" maxLength="160" value={fieldMaterialReceipt.receivedBy} onChange={(event) => updateFieldMaterialReceipt('receivedBy', event.target.value)} />
                      </label>
                    ) : null}
                    <label>
                      Delivery location
                      <input maxLength="240" value={fieldMaterialReceipt.location} onChange={(event) => updateFieldMaterialReceipt('location', event.target.value)} placeholder="Gate, floor, or storage area" />
                    </label>
                    <label>
                      Item
                      <input required minLength="2" maxLength="240" value={fieldMaterialReceipt.lines[0].itemName} onChange={(event) => updateFieldMaterialReceiptLine('itemName', event.target.value)} placeholder="Match the planned material name when possible" />
                    </label>
                    <label>
                      Unit
                      <input required maxLength="40" value={fieldMaterialReceipt.lines[0].unit} onChange={(event) => updateFieldMaterialReceiptLine('unit', event.target.value)} />
                    </label>
                    <label>
                      Received
                      <input required type="number" min="0.000001" step="any" inputMode="decimal" value={fieldMaterialReceipt.lines[0].receivedQuantity} onChange={(event) => updateFieldMaterialReceiptLine('receivedQuantity', event.target.value)} />
                    </label>
                    <label>
                      Accepted
                      <input required type="number" min="0" step="any" inputMode="decimal" value={fieldMaterialReceipt.lines[0].acceptedQuantity} onChange={(event) => updateFieldMaterialReceiptLine('acceptedQuantity', event.target.value)} />
                    </label>
                    <label>
                      Damaged
                      <input required type="number" min="0" step="any" inputMode="decimal" value={fieldMaterialReceipt.lines[0].damagedQuantity} onChange={(event) => updateFieldMaterialReceiptLine('damagedQuantity', event.target.value)} />
                    </label>
                    <label className="form-span">
                      Evidence reference
                      <input required minLength="3" maxLength="240" value={fieldMaterialReceipt.evidenceReference} onChange={(event) => updateFieldMaterialReceipt('evidenceReference', event.target.value)} placeholder="Signed ticket, photo, or retained document reference" />
                    </label>
                    <label className="form-span">
                      Delivery note
                      <textarea maxLength="4000" value={fieldMaterialReceipt.notes} onChange={(event) => updateFieldMaterialReceipt('notes', event.target.value)} placeholder="Damage, rejection, storage, or follow-up detail" />
                    </label>
                    <label className="checkbox-label form-span">
                      <input type="checkbox" checked={fieldMaterialReceipt.finalDelivery} onChange={(event) => updateFieldMaterialReceipt('finalDelivery', event.target.checked)} />
                      This is the final delivery against the order
                    </label>
                  </div>
                  </fieldset>
                  <div className="modal-actions">
                    <button className="primary-button" disabled={submitting}>
                      <PackageCheck size={16} />
                      {submitting ? 'Recording...' : navigator.onLine === false ? 'Save receipt offline' : 'Retain delivery ticket'}
                    </button>
                  </div>
                </form>
                <form className="evidence-form daily-cycle-form" data-testid="daily-start-huddle-form" aria-busy={dailyCycleLoading} onSubmit={recordDailyStartHuddle}>
                  <div className="panel-heading">
                    <div>
                      <h2>{ot('Daily start huddle')}</h2>
                      <p>{ot("Freeze today's crew, production target, safety focus, hold points, constraints, and stop-work state before the shift.")}</p>
                    </div>
                    <span className="tag">{ot('Internal control')}</span>
                  </div>
                  <div className="form-grid daily-cycle-job-grid">
                    <label>
                      {ot('Job')}
                      <select required value={dailyHuddle.jobId} onChange={(event) => void selectDailyCycleJob(event.target.value)}>
                        <option value="">{ot('Select an active job')}</option>
                        {activeJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
                      </select>
                    </label>
                  </div>
                  <fieldset className="form-grid daily-cycle-fieldset" disabled={dailyCycleLoading}>
                    <label>
                      {ot('Work date')}
                      <input required type="date" value={dailyHuddle.workDate} onChange={(event) => updateDailyHuddle('workDate', event.target.value)} />
                    </label>
                    <label>
                      {ot('Shift')}
                      <select value={dailyHuddle.shiftLabel} onChange={(event) => updateDailyHuddle('shiftLabel', event.target.value)}>
                        <option value="day">{ot('Day')}</option>
                        <option value="early">{ot('Early')}</option>
                        <option value="late">{ot('Late')}</option>
                        <option value="night">{ot('Night')}</option>
                      </select>
                    </label>
                    <label>
                      {ot('Weather')}
                      <select value={dailyHuddle.weather} onChange={(event) => updateDailyHuddle('weather', event.target.value)}>
                        <option value="clear">{ot('Clear')}</option>
                        <option value="cloudy">{ot('Cloudy')}</option>
                        <option value="rain">{ot('Rain')}</option>
                        <option value="wind">{ot('High wind')}</option>
                        <option value="heat">{ot('Heat')}</option>
                        <option value="cold">{ot('Cold')}</option>
                      </select>
                    </label>
                    {!fieldScoped ? (
                      <>
                        <label>
                          {ot('Facilitator')}
                          <input required minLength="2" maxLength="160" value={dailyHuddle.facilitator} onChange={(event) => updateDailyHuddle('facilitator', event.target.value)} placeholder={ot('Crew lead or supervisor')} />
                        </label>
                        <label>
                          {ot('Daily lead')}
                          <select required value={dailyHuddle.leadWorkerId} onChange={(event) => updateDailyHuddle('leadWorkerId', event.target.value)}>
                            <option value="">{ot('Select retained crew first')}</option>
                            {workers.filter(worker => dailyHuddle.workerIds.includes(worker.id)).map(worker => <option key={worker.id} value={worker.id}>{worker.name}</option>)}
                          </select>
                        </label>
                        <fieldset className="daily-crew-picker form-span">
                          <legend>{ot('Huddle crew')}</legend>
                          <div>
                            {workers.filter(worker => !['retired', 'inactive'].includes(worker.status)).map(worker => (
                              <label className="checkbox-label" key={worker.id}>
                                <input type="checkbox" checked={dailyHuddle.workerIds.includes(worker.id)} onChange={(event) => toggleDailyHuddleWorker(worker.id, event.target.checked)} />
                                <span>{worker.name}<small>{worker.role || ot('Crew')}</small></span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      </>
                    ) : (
                      <div className="daily-field-identity form-span">
                        <Users size={18} />
                        <span><strong>{operator.worker?.name || ot('Field worker')}</strong><small>{ot('Your authenticated field identity is the retained huddle lead and attendee.')}</small></span>
                      </div>
                    )}
                    <label className="form-span">
                      {ot('Planned work')}
                      <textarea required minLength="8" maxLength="4000" value={dailyHuddle.plannedWork} onChange={(event) => updateDailyHuddle('plannedWork', event.target.value)} placeholder={ot('Specific work areas, sequence, and handoffs for this shift.')} />
                    </label>
                    <label className="form-span">
                      {ot('Production target')}
                      <textarea required minLength="3" maxLength="1000" value={dailyHuddle.productionTarget} onChange={(event) => updateDailyHuddle('productionTarget', event.target.value)} placeholder={ot('A measurable quantity, milestone, or completion state.')} />
                    </label>
                    <label className="form-span">
                      {ot('Site conditions')}
                      <textarea maxLength="2000" value={dailyHuddle.siteConditions} onChange={(event) => updateDailyHuddle('siteConditions', event.target.value)} placeholder={ot('Access, occupants, logistics, weather exposure, or changed conditions.')} />
                    </label>
                    <label className="form-span">
                      {ot('Safety focus')}
                      <textarea required minLength="5" maxLength="2000" value={dailyHuddle.safetyFocus} onChange={(event) => updateDailyHuddle('safetyFocus', event.target.value)} placeholder={ot("Today's hazards, controls, LMRA trigger, and stop-work condition.")} />
                    </label>
                    <label className="form-span">
                      {ot('Quality hold points')}
                      <textarea value={dailyHuddle.qualityHoldPoints} onChange={(event) => updateDailyHuddle('qualityHoldPoints', event.target.value)} placeholder={ot('One inspection, witness, or approval hold point per line.')} />
                    </label>
                    <label className="form-span">
                      {ot('Constraints')}
                      <textarea value={dailyHuddle.constraints} onChange={(event) => updateDailyHuddle('constraints', event.target.value)} placeholder={ot('Materials, information, access, equipment, or third-party dependencies.')} />
                    </label>
                    <label className="form-span">
                      {ot('Blocking issues')}
                      <textarea value={dailyHuddle.blockingIssues} onChange={(event) => updateDailyHuddle('blockingIssues', event.target.value)} placeholder={ot('Only conditions that prevent planned work; one per line.')} />
                    </label>
                    <label className="checkbox-label form-span daily-stop-work">
                      <input type="checkbox" checked={dailyHuddle.stopWorkRequired} onChange={(event) => updateDailyHuddle('stopWorkRequired', event.target.checked)} />
                      {ot('Stop work until the retained blocking issues are resolved')}
                    </label>
                    <label className="form-span">
                      {ot('Huddle evidence reference')}
                      <input required minLength="3" maxLength="500" value={dailyHuddle.evidenceReference} onChange={(event) => updateDailyHuddle('evidenceReference', event.target.value)} placeholder={ot('Signed sheet, attendance photo, or retained document reference')} />
                    </label>
                  </fieldset>
                  <div className="modal-actions">
                    <button className="primary-button" disabled={submitting || dailyCycleLoading}>
                      <ClipboardCheck size={16} />
                      {submitting ? ot('Retaining...') : dailyCycleLoading ? ot('Loading daily cycles...') : navigator.onLine === false ? ot('Save huddle offline') : ot('Retain start huddle')}
                    </button>
                  </div>
                  <p className="attendance-policy">{ot('A released huddle is an internal coordination record. It does not create a permit, certify compliance, notify the crew, or authorize hazardous work.')}</p>
                </form>
                <form className="evidence-form daily-site-log" data-testid="daily-site-log-form" onSubmit={recordFieldDailyLog}>
                  <div className="panel-heading">
                    <div>
                      <h2>{ot('End-of-day report')}</h2>
                      <p>{ot("Close an open huddle with plan-versus-actual evidence, time, safety state, unresolved actions, and tomorrow's handoff.")}</p>
                    </div>
                    {fieldScoped && operator.worker?.name ? <span className="tag tag-green">{operator.worker.name}</span> : null}
                  </div>
                  <div className="form-grid">
                    <label>
                      {ot('Job')}
                      <select
                        required
                        value={fieldDailyLog.jobId}
                        onChange={(event) => void selectDailyCycleJob(event.target.value)}
                      >
                        <option value="">{ot('Select an active job')}</option>
                        {activeJobs.map((job) => (
                          <option key={job.id} value={job.id}>
                            {job.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {ot('Open daily cycle')}
                      <select
                        required
                        value={fieldDailyLog.cycleId}
                        onChange={(event) => {
                          const cycle = fieldDailyCycles.find(item => item.id === event.target.value)
                          setFieldDailyLog({
                            ...fieldDailyLog,
                            cycleId: event.target.value,
                            workDate: cycle?.workDate || fieldDailyLog.workDate,
                            weather: cycle?.weather || fieldDailyLog.weather,
                          })
                        }}
                      >
                        <option value="">{ot('Select a released or blocked huddle')}</option>
                        {fieldDailyCycles.filter(cycle => ['released', 'blocked'].includes(cycle.status)).map(cycle => (
                          <option key={cycle.id} value={cycle.id}>{formatDate(cycle.workDate)} / {ot(formatStatus(cycle.shiftLabel))} / {ot(formatStatus(cycle.status))}</option>
                        ))}
                      </select>
                    </label>
                    {selectedDailyCycle ? (
                      <div className={`daily-cycle-source form-span daily-cycle-source-${selectedDailyCycle.status}`}>
                        <div><span>{ot('Production target')}</span><strong>{selectedDailyCycle.productionTarget}</strong></div>
                        <div><span>{ot('Safety focus')}</span><strong>{selectedDailyCycle.safetyFocus}</strong></div>
                        <div><span>{ot('Start state')}</span><strong>{ot(formatStatus(selectedDailyCycle.status))}</strong></div>
                      </div>
                    ) : null}
                    {!fieldScoped ? (
                      <label>
                        {ot('Crew member')}
                        <select
                          required
                          value={fieldDailyLog.workerId}
                          onChange={(event) => setFieldDailyLog({ ...fieldDailyLog, workerId: event.target.value })}
                        >
                          <option value="">{ot('Select a crew member')}</option>
                          {workers
                            .filter((worker) => !['retired', 'inactive'].includes(worker.status))
                            .map((worker) => (
                              <option key={worker.id} value={worker.id}>
                                {worker.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    ) : null}
                    <label>
                      {ot('Work date')}
                      <input
                        required
                        type="date"
                        value={fieldDailyLog.workDate}
                        onChange={(event) => setFieldDailyLog({ ...fieldDailyLog, workDate: event.target.value })}
                      />
                    </label>
                    <label>
                      {ot('Hours worked')}
                      <input
                        required
                        type="number"
                        min="0.25"
                        max="24"
                        step="0.25"
                        inputMode="decimal"
                        value={fieldDailyLog.hours}
                        onChange={(event) => setFieldDailyLog({ ...fieldDailyLog, hours: event.target.value })}
                      />
                    </label>
                    <label>
                      {ot('People on site')}
                      <input
                        required
                        type="number"
                        min="1"
                        max="500"
                        step="1"
                        inputMode="numeric"
                        value={fieldDailyLog.manpower}
                        onChange={(event) => setFieldDailyLog({ ...fieldDailyLog, manpower: event.target.value })}
                      />
                    </label>
                    <label>
                      {ot('Weather')}
                      <select
                        value={fieldDailyLog.weather}
                        onChange={(event) => setFieldDailyLog({ ...fieldDailyLog, weather: event.target.value })}
                      >
                        <option value="clear">{ot('Clear')}</option>
                        <option value="cloudy">{ot('Cloudy')}</option>
                        <option value="rain">{ot('Rain')}</option>
                        <option value="wind">{ot('High wind')}</option>
                        <option value="heat">{ot('Heat')}</option>
                        <option value="cold">{ot('Cold')}</option>
                      </select>
                    </label>
                    <label className="form-span">
                      {ot('Work completed')}
                      <textarea
                        required
                        minLength="3"
                        value={fieldDailyLog.workCompleted}
                        onChange={(event) => setFieldDailyLog({ ...fieldDailyLog, workCompleted: event.target.value })}
                        placeholder={ot('Record the work completed during this shift.')}
                      />
                    </label>
                    <label className="form-span">
                      {ot('Blockers or follow-up')}
                      <textarea
                        value={fieldDailyLog.blockers}
                        onChange={(event) => setFieldDailyLog({ ...fieldDailyLog, blockers: event.target.value })}
                        placeholder={ot('One blocker or follow-up per line.')}
                      />
                    </label>
                    <label className="form-span checkbox-label daily-target-check">
                      <input
                        type="checkbox"
                        checked={fieldDailyLog.planAchieved}
                        onChange={(event) => setFieldDailyLog({ ...fieldDailyLog, planAchieved: event.target.checked })}
                      />
                      {ot('The retained production target was achieved')}
                    </label>
                    {!fieldDailyLog.planAchieved ? (
                      <label className="form-span">
                        {ot('Reasons for variance')}
                        <textarea
                          required
                          value={fieldDailyLog.varianceReasons}
                          onChange={(event) => setFieldDailyLog({ ...fieldDailyLog, varianceReasons: event.target.value })}
                          placeholder={ot('One source-grounded reason per line; do not infer causes.')}
                        />
                      </label>
                    ) : null}
                    <label className="form-span">
                      {ot('Unresolved actions')}
                      <textarea
                        value={fieldDailyLog.unresolvedActions}
                        onChange={(event) => setFieldDailyLog({ ...fieldDailyLog, unresolvedActions: event.target.value })}
                        placeholder={ot('Owner, decision, material, access, quality, or safety action still open.')}
                      />
                    </label>
                    <label className="form-span">
                      {ot("Tomorrow's plan")}
                      <textarea
                        required
                        minLength="3"
                        maxLength="4000"
                        value={fieldDailyLog.tomorrowPlan}
                        onChange={(event) => setFieldDailyLog({ ...fieldDailyLog, tomorrowPlan: event.target.value })}
                        placeholder={ot('Next work sequence, first handoff, and constraint-removal priority.')}
                      />
                    </label>
                    <label className="form-span">
                      {ot('EOD evidence references')}
                      <textarea
                        required
                        minLength="3"
                        value={fieldDailyLog.evidenceReferences}
                        onChange={(event) => setFieldDailyLog({ ...fieldDailyLog, evidenceReferences: event.target.value })}
                        placeholder={ot('Photo set, delivery ticket, inspection, measurement, or retained document reference; one per line.')}
                      />
                    </label>
                    <label className="form-span checkbox-label">
                      <input
                        type="checkbox"
                        checked={fieldDailyLog.safetyConcern}
                        onChange={(event) => setFieldDailyLog({ ...fieldDailyLog, safetyConcern: event.target.checked })}
                      />
                      {ot('A safety concern requires office review')}
                    </label>
                    {fieldDailyLog.safetyConcern ? (
                      <>
                        <label>
                          {ot('Risk level')}
                          <select
                            value={fieldDailyLog.safetyRiskLevel}
                            onChange={(event) => setFieldDailyLog({ ...fieldDailyLog, safetyRiskLevel: event.target.value })}
                          >
                            <option value="medium">{ot('Medium')}</option>
                            <option value="high">{ot('High')}</option>
                            <option value="critical">{ot('Critical')}</option>
                          </select>
                        </label>
                        <label className="form-span">
                          {ot('Safety concern')}
                          <textarea
                            required
                            minLength="5"
                            value={fieldDailyLog.safetyNotes}
                            onChange={(event) => setFieldDailyLog({ ...fieldDailyLog, safetyNotes: event.target.value })}
                            placeholder={ot('Describe the hazard, immediate control, and required follow-up.')}
                          />
                        </label>
                      </>
                    ) : null}
                  </div>
                  <div className="modal-actions">
                    <button className="primary-button" disabled={submitting}>
                      <ClipboardList size={16} />
                      {submitting ? ot('Submitting...') : navigator.onLine === false ? ot('Save EOD report offline') : ot('Submit EOD report')}
                    </button>
                  </div>
                  <p className="attendance-policy">{ot('Approval recognizes the retained daily evidence. It does not send a client update, change the schedule, order materials, or certify safety compliance.')}</p>
                </form>
                <form ref={fieldCaptureRef} className="evidence-form" data-testid="field-evidence-form" onSubmit={uploadEvidence}>
                  <div className="panel-heading">
                    <div>
                      <h2>Record field evidence</h2>
                      <p>Photos, PDFs, and DOCX files remain behind authenticated ledger access.</p>
                    </div>
                    {outboxPending ? <span className="tag tag-amber">{outboxPending} queued</span> : null}
                  </div>
                  <div className="form-grid">
                    <label>
                      Job
                      <select required value={evidence.jobId} onChange={(event) => void selectFieldEvidenceJob(event.target.value)}>
                        <option value="">{ot('Select an active job')}</option>
                        {activeJobs.map((job) => (
                          <option key={job.id} value={job.id}>
                            {job.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Evidence workflow
                      <select
                        value={evidence.photoEvidenceSetId}
                        onChange={(event) => {
                          const selected = fieldPhotoEvidenceSets.find(set => set.id === event.target.value)
                          setEvidence({
                            ...evidence,
                            photoEvidenceSetId: event.target.value,
                            photoEvidencePhase: selected?.status === 'rejected' ? 'before' : selected?.missingPhases?.[0] || 'before',
                            capturedAt: toLocalDateTimeInput(new Date()),
                          })
                        }}
                      >
                        <option value="">General job evidence</option>
                        {availableFieldPhotoEvidenceSets.map((set) => (
                          <option key={set.id} value={set.id}>
                            {set.taskTitle || set.title} / {set.workLocation}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Risk level
                      <select value={evidence.riskLevel} onChange={(event) => setEvidence({ ...evidence, riskLevel: event.target.value })}>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </label>
                    {selectedFieldPhotoEvidenceSet ? (
                      <>
                        <label>
                          Evidence phase
                          <select
                            required
                            value={evidence.photoEvidencePhase}
                            onChange={(event) => setEvidence({ ...evidence, photoEvidencePhase: event.target.value })}
                          >
                            <option value="before">Before</option>
                            <option value="during">During</option>
                            <option value="after">After</option>
                          </select>
                        </label>
                        <label>
                          Device capture time
                          <input
                            required
                            type="datetime-local"
                            max={toLocalDateTimeInput(new Date())}
                            value={evidence.capturedAt}
                            onChange={(event) => setEvidence({ ...evidence, capturedAt: event.target.value })}
                          />
                        </label>
                        <div className="form-span evidence-governance-context" data-testid="photo-evidence-context">
                          <strong>{selectedFieldPhotoEvidenceSet.taskTitle || selectedFieldPhotoEvidenceSet.title}</strong>
                          <span>{selectedFieldPhotoEvidenceSet.workLocation}</span>
                          <span>
                            Cycle {selectedFieldPhotoEvidenceSet.currentCycle}
                            {' / '}
                            {selectedFieldPhotoEvidenceSet.captureCount || 0} of 3 phases retained
                          </span>
                        </div>
                      </>
                    ) : null}
                    <label className="form-span">
                      Evidence file
                      <input
                        ref={evidenceInputRef}
                        required
                        type="file"
                        accept={selectedFieldPhotoEvidenceSet
                          ? 'image/jpeg,image/png,image/webp'
                          : 'image/jpeg,image/png,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'}
                      />
                    </label>
                    <label className="form-span">
                      {selectedFieldPhotoEvidenceSet ? 'Photo caption' : 'Site note'}
                      <textarea
                        required={Boolean(selectedFieldPhotoEvidenceSet)}
                        minLength={selectedFieldPhotoEvidenceSet ? 3 : undefined}
                        maxLength={600}
                        value={evidence.notes}
                        onChange={(event) => setEvidence({ ...evidence, notes: event.target.value })}
                        placeholder={selectedFieldPhotoEvidenceSet
                          ? 'Describe the visible condition, exact location, and what this phase proves.'
                          : 'Describe what this file proves, what changed, or what needs review.'}
                      />
                    </label>
                  </div>
                  {selectedFieldPhotoEvidenceSet ? (
                    <p className="attendance-policy">
                      Captures sync in sequence and remain private. Offline capture can queue files and metadata, but cannot request review, release evidence, or complete the task.
                    </p>
                  ) : null}
                  <div className="modal-actions">
                    {outboxPending ? (
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={outboxSyncing || submitting || navigator.onLine === false}
                        onClick={() => syncFieldOutbox({ announce: true })}
                      >
                        <RefreshCw size={16} className={outboxSyncing ? 'spin' : ''} />
                        {outboxSyncing ? 'Syncing...' : `Sync ${outboxPending} queued`}
                      </button>
                    ) : null}
                    <button className="primary-button" disabled={submitting}>
                      <FileUp size={16} />
                      {submitting ? 'Recording...' : navigator.onLine === false ? 'Save offline draft' : 'Record evidence'}
                    </button>
                  </div>
                </form>
                <form className="evidence-form" data-testid="field-progress-form" onSubmit={recordFieldProgress}>
                  <div className="panel-heading">
                    <div>
                      <h2>Record progress</h2>
                      <p>Field updates stay auditable. Completing a job remains an office-controlled decision.</p>
                    </div>
                  </div>
                  <div className="form-grid">
                    <label>
                      Job
                      <select
                        required
                        value={fieldProgress.jobId}
                        onChange={(event) => setFieldProgress({ ...fieldProgress, jobId: event.target.value })}
                      >
                        <option value="">Select an active job</option>
                        {activeJobs.map((job) => (
                          <option key={job.id} value={job.id}>
                            {job.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Work state
                      <select
                        value={fieldProgress.status}
                        onChange={(event) => setFieldProgress({ ...fieldProgress, status: event.target.value })}
                      >
                        <option value="in_progress">In progress</option>
                        <option value="blocked">Blocked</option>
                        <option value="on_hold">On hold</option>
                      </select>
                    </label>
                    <label>
                      Progress (%)
                      <input
                        required
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={fieldProgress.progressPercent}
                        onChange={(event) => setFieldProgress({ ...fieldProgress, progressPercent: event.target.value })}
                      />
                    </label>
                    <label className="form-span">
                      Field note
                      <textarea
                        required
                        value={fieldProgress.note}
                        onChange={(event) => setFieldProgress({ ...fieldProgress, note: event.target.value })}
                        placeholder="Record completed work, blocker, or site condition for the office team."
                      />
                    </label>
                  </div>
                  <div className="modal-actions">
                    <button className="primary-button" disabled={submitting}>
                      <Activity size={16} />
                      {submitting ? 'Recording...' : navigator.onLine === false ? 'Save progress offline' : 'Record progress'}
                    </button>
                  </div>
                </form>
              </section>
            )}

            {section === 'operations' && capabilities.maintenance && (
              <section className="operations-grid">
                {data.session?.identity?.enabled && <LazyControlBoundary label="bedrijfstoegang"><CompanyMembershipControl api={api} workers={data.workers} /></LazyControlBoundary>}
                <LazyControlBoundary label="toelating uitvoerenden"><WorkBoardOffice api={api} isOwner={operator.role === 'owner'} /></LazyControlBoundary>
                <LazyControlBoundary label={ot('team access')}>
                  <TeamAccessControl
                    request={api}
                    register={data.operatorRegister}
                    workers={data.workers}
                    jobs={jobs}
                    onRegisterChange={(operatorRegister) => setData((current) => current ? { ...current, operatorRegister } : current)}
                    onError={setError}
                    onNotice={notify}
                    locale={operatorLocale}
                  />
                </LazyControlBoundary>
                <LazyControlBoundary label={ot('privacy requests')}>
                  <PrivacyRequestsControl
                    request={api}
                    register={data.privacyRequests}
                    clients={data.clientDirectory?.clients || EMPTY_LIST}
                    workers={data.workers}
                    onRegisterChange={(privacyRequests) => setData((current) => current ? { ...current, privacyRequests } : current)}
                    onOpenApprovals={openApprovals}
                    onError={setError}
                    onNotice={notify}
                  />
                </LazyControlBoundary>
                <section className="panel page-panel organization-profile-panel" data-testid="organization-profile-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>{ot('Business identity')}</h2>
                      <p>{ot('The legal, electronic, and payment details captured in controlled quote and invoice packages.')}</p>
                    </div>
                    <span className={`status ${data.organization?.readiness?.ready ? 'status-ready' : 'status-attention'}`}>
                      {data.organization?.readiness?.ready ? ot('issue ready') : ot('incomplete')}
                    </span>
                  </div>
                  <form onSubmit={saveOrganizationProfile} aria-busy={submitting || sectionLoading}>
                    <fieldset className="form-fieldset" disabled={submitting || sectionLoading}>
                    <div className="form-grid organization-profile-form">
                      <label>
                        {ot('Legal name')}
                        <input
                          value={organizationProfileDraft.legalName}
                          onChange={(event) => updateOrganizationProfile('legalName', event.target.value)}
                        />
                      </label>
                      <label>
                        {ot('Trading name')}
                        <input
                          value={organizationProfileDraft.tradingName}
                          onChange={(event) => updateOrganizationProfile('tradingName', event.target.value)}
                        />
                      </label>
                      <label>
                        {ot('Registration number')}
                        <input
                          value={organizationProfileDraft.registrationNumber}
                          onChange={(event) => updateOrganizationProfile('registrationNumber', event.target.value)}
                          placeholder={ot('KVK or national registry number')}
                        />
                      </label>
                      <label>
                        {ot('Electronic address scheme')}
                        <input
                          value={organizationProfileDraft.electronicAddressScheme}
                          onChange={(event) => updateOrganizationProfile('electronicAddressScheme', event.target.value)}
                          placeholder={ot('0106 for KVK')}
                        />
                      </label>
                      <label>
                        {ot('Electronic address')}
                        <input
                          value={organizationProfileDraft.electronicAddress}
                          onChange={(event) => updateOrganizationProfile('electronicAddress', event.target.value)}
                          placeholder={ot('Defaults to KVK for Dutch entities')}
                        />
                      </label>
                      <label>
                        {ot('VAT number')}
                        <input
                          disabled={organizationProfileDraft.vatExempt}
                          value={organizationProfileDraft.vatNumber}
                          onChange={(event) => updateOrganizationProfile('vatNumber', event.target.value)}
                        />
                      </label>
                      <label className="checkbox-label form-span">
                        <input
                          type="checkbox"
                          checked={organizationProfileDraft.vatExempt}
                          onChange={(event) => updateOrganizationVatExemption(event.target.checked)}
                        />
                        {ot('This legal entity is VAT exempt')}
                      </label>
                      <label>
                        {ot('Email')}
                        <input
                          type="email"
                          value={organizationProfileDraft.email}
                          onChange={(event) => updateOrganizationProfile('email', event.target.value)}
                        />
                      </label>
                      <label>
                        {ot('Phone')}
                        <input
                          value={organizationProfileDraft.phone}
                          onChange={(event) => updateOrganizationProfile('phone', event.target.value)}
                        />
                      </label>
                      <label className="form-span">
                        {ot('Website')}
                        <input
                          type="url"
                          value={organizationProfileDraft.website}
                          onChange={(event) => updateOrganizationProfile('website', event.target.value)}
                          placeholder="https://"
                        />
                      </label>
                      <label className="form-span">
                        {ot('Registered address')}
                        <input
                          value={organizationProfileDraft.address}
                          onChange={(event) => updateOrganizationProfile('address', event.target.value)}
                        />
                      </label>
                      <label>
                        {ot('Postal code')}
                        <input
                          value={organizationProfileDraft.postalCode}
                          onChange={(event) => updateOrganizationProfile('postalCode', event.target.value)}
                        />
                      </label>
                      <label>
                        {ot('City')}
                        <input
                          value={organizationProfileDraft.city}
                          onChange={(event) => updateOrganizationProfile('city', event.target.value)}
                        />
                      </label>
                      <label>
                        {ot('Country code')}
                        <input
                          required
                          maxLength="2"
                          value={organizationProfileDraft.country}
                          onChange={(event) => updateOrganizationProfile('country', event.target.value.toUpperCase())}
                        />
                      </label>
                      <label>
                        IBAN
                        <input
                          value={organizationProfileDraft.iban}
                          onChange={(event) => updateOrganizationProfile('iban', event.target.value)}
                        />
                      </label>
                      <label>
                        BIC
                        <input
                          value={organizationProfileDraft.bic}
                          onChange={(event) => updateOrganizationProfile('bic', event.target.value)}
                        />
                      </label>
                      <label>
                        {ot('Payment terms (days)')}
                        <input
                          required
                          type="number"
                          min="1"
                          max="365"
                          value={organizationProfileDraft.defaultPaymentTermsDays}
                          onChange={(event) => updateOrganizationProfile('defaultPaymentTermsDays', event.target.value)}
                        />
                      </label>
                      <label>
                        {ot('Quote validity default (days)')}
                        <input
                          required
                          type="number"
                          min="1"
                          max="365"
                          value={organizationProfileDraft.defaultQuoteValidityDays}
                          onChange={(event) => updateOrganizationProfile('defaultQuoteValidityDays', event.target.value)}
                        />
                      </label>
                      <label className="form-span">
                        {ot('Quote terms')}
                        <textarea
                          value={organizationProfileDraft.quoteTerms}
                          onChange={(event) => updateOrganizationProfile('quoteTerms', event.target.value)}
                          placeholder={ot('Commercial terms shown on every new issue package.')}
                        />
                      </label>
                      <label className="form-span">
                        {ot('Internal notes')}
                        <textarea
                          value={organizationProfileDraft.notes}
                          onChange={(event) => updateOrganizationProfile('notes', event.target.value)}
                        />
                      </label>
                    </div>
                    {data.organization?.readiness?.missing?.length ? (
                      <p className="organization-profile-missing">
                        <TriangleAlert size={15} />
                        {ot('Required before quote issue: {fields}.', { fields: data.organization.readiness.missing.map((item) => ot(item.label)).join(', ') })}
                      </p>
                    ) : (
                      <p className="organization-profile-ready">
                        <ShieldCheck size={15} />
                        {ot('Identity is ready. Each package still requires an internally approved quote and a separate delivery approval.')}
                      </p>
                    )}
                    <div className="modal-actions">
                      <button className="primary-button" disabled={submitting}>
                        <Building2 size={16} />
                        {sectionLoading ? ot('Loading identity...') : submitting ? ot('Saving...') : ot('Save business identity')}
                      </button>
                    </div>
                    </fieldset>
                  </form>
                </section>
                <LazyControlBoundary label="automation controls">
                  <AutomationControl
                    commandPlan={data.commandPlan}
                    scheduler={data.scheduler}
                    jobs={jobs}
                    loading={commandPlanLoading}
                    error={commandPlanError}
                    view={commandPlanView}
                    selectedIds={selectedCommandIds}
                    submitting={submitting || automationSuspended}
                    onViewChange={setCommandPlanView}
                    onToggle={toggleCommandSelection}
                    onSelectVisible={setSelectedCommandIds}
                    onApply={applySelectedCommands}
                    onRun={runCycle}
                    onRetry={() => refreshOperationsCommandPlan()}
                    onOpenApprovals={openApprovals}
                    onOpen={openJobWorkspace}
                  />
                </LazyControlBoundary>
                <section className={`panel page-panel automation-safety-panel ${automationSuspended ? 'automation-safety-panel-active' : ''}`} data-testid="automation-safety-control">
                  <div className="panel-heading">
                    <div>
                      <h2>{ot('Autonomous-work safety stop')}</h2>
                      <p>{ot('Owner control for manual command plans and the durable scheduler.')}</p>
                    </div>
                    <span className={`status ${automationSuspended ? 'status-attention' : 'status-ready'}`}>
                      {automationSuspended ? ot('suspended') : ot('active')}
                    </span>
                  </div>
                  <p className="panel-copy">
                    {automationSuspended
                      ? ot('{reason} Direct operator entries, evidence, and approvals are unaffected.', { reason: automationControl.reason })
                      : ot('Autonomous work can create internal drafts and review tasks only. External commitments remain approval-gated.')}
                  </p>
                  <div className="operations-actions">
                    <button
                      className={automationSuspended ? 'primary-button' : 'danger-button'}
                      disabled={submitting}
                      onClick={(event) => openAutomationControlDialog(!automationSuspended, event.currentTarget)}
                    >
                      {automationSuspended ? <Activity size={16} /> : <Ban size={16} />}
                      {automationSuspended ? ot('Resume autonomous drafting') : ot('Suspend autonomous drafting')}
                    </button>
                    <a className="secondary-button" href={companyApiUrl('/api/operations/support-bundle')} download>
                      <FileDown size={16} />
                      {ot('Download support bundle')}
                    </a>
                  </div>
                  <p className="panel-copy">
                    {ot('The support bundle contains runtime, migration, aggregate-count, integrity, and control diagnostics only. It excludes customer records, evidence, logs, environment values, and credentials.')}
                  </p>
                </section>
                {data.health ? <section className="panel page-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Runtime readiness</h2>
                      <p>Local-first operational health and EU-hosting prerequisites.</p>
                    </div>
                    <span className={`status ${data.readiness?.status === 'ready' ? 'status-ready' : 'status-attention'}`}>
                      {data.readiness?.status || 'checking'}
                    </span>
                  </div>
                  <div className="readiness-list">
                    <div>
                      <span>Runtime</span>
                      <strong>{data.health.runtime?.mode || 'local'}</strong>
                    </div>
                    <div data-testid="runtime-exposure-readiness">
                      <span>Access</span>
                      <strong>
                        {data.health.runtime?.exposure?.publicTunnel
                          ? data.health.runtime.exposure.publicTunnelVerified
                            ? ot('verified authenticated tunnel')
                            : ot('tunnel attention')
                          : data.health.runtime?.exposure?.publicTunnelVerificationPending
                            ? ot('tunnel verification pending')
                          : data.health.runtime?.exposure?.loopbackOnly
                            ? 'this computer only'
                            : data.health.runtime?.mode === 'hosted'
                              ? 'hosted ingress'
                              : 'local network'}
                      </strong>
                    </div>
                    <div data-testid="storage-readiness">
                      <span>Storage</span>
                      <strong>{evidenceStorageLabel}</strong>
                    </div>
                    <div>
                      <span>Authorization</span>
                      <strong>
                        {data.health.runtime?.auth?.configuredRoles?.length
                          ? data.health.runtime.auth.configuredRoles.join(', ')
                          : data.health.runtime?.auth?.legacyOwnerTokenConfigured
                            ? 'owner token'
                            : 'local owner'}
                      </strong>
                    </div>
                    <div data-testid="login-defense-readiness">
                      <span>Login defense</span>
                      <strong>{loginDefenseLabel}</strong>
                    </div>
                    <div data-testid="api-defense-readiness">
                      <span>API defense</span>
                      <strong>{apiDefenseLabel}</strong>
                    </div>
                    <div data-testid="audit-integrity-readiness">
                      <span>Audit integrity</span>
                      <strong>{auditIntegrityLabel}</strong>
                    </div>
                    <div>
                      <span>Scheduler</span>
                      <strong>{data.scheduler?.enabled ? `every ${data.scheduler.intervalSeconds}s` : 'manual only'}</strong>
                    </div>
                    <div>
                      <span>Field retries</span>
                      <strong>
                        {operationCapabilities?.requestSafety?.evidenceUploadIdempotency === 'durable' &&
                        operationCapabilities?.requestSafety?.progressEntryKey === 'durable' &&
                        operationCapabilities?.requestSafety?.dailyLogEntryKey === 'durable' &&
                        operationCapabilities?.requestSafety?.materialReceiptEntryKey === 'durable'
                          ? 'scoped + deduplicated'
                          : 'checking'}
                      </strong>
                    </div>
                    <div>
                      <span>Backups</span>
                      <strong>
                        {operationCapabilities?.backup?.portableDownload
                          ? 'verified + portable'
                          : providerRecovery?.available
                            ? 'provider-managed'
                            : operationCapabilities
                              ? 'unavailable'
                              : 'checking'}
                      </strong>
                    </div>
                    <div>
                      <span>EU migration</span>
                      <strong>
                        {operationCapabilities?.hostedMigration?.available
                          ? 'backup to hosted'
                          : operationCapabilities
                            ? 'provider recovery'
                            : 'checking'}
                      </strong>
                    </div>
                    <div data-testid="hai-connector-readiness">
                      <span>{ot('HAI feed')}</span>
                      <strong>{operationCapabilities?.haiConnector?.available ? haiPublicationLabel : ot('checking')}</strong>
                    </div>
                    <div>
                      <span>Recovery</span>
                      <strong>{recoveryLabel}</strong>
                    </div>
                    <div>
                      <span>Data residency</span>
                      <strong>{data.health.runtime?.hosting?.dataResidency || 'local'}</strong>
                    </div>
                    <div>
                      <span>DPA</span>
                      <strong>
                        {data.health.runtime?.mode === 'hosted'
                          ? data.health.runtime?.hosting?.dpaConfigured
                            ? 'configured'
                            : 'attention'
                          : 'not applicable'}
                      </strong>
                    </div>
                    <div>
                      <span>Ledger</span>
                      <strong>{data.health.services.ledger}</strong>
                    </div>
                    <div>
                      <span>Diagnostics</span>
                      <strong>{data.health.diagnostics.issueCount} issue(s)</strong>
                    </div>
                  </div>
                  <p className="panel-copy">
                    Hosted mode fails closed until EU object storage, managed PostgreSQL, HTTPS, authentication, DPA, residency, and
                    recovery declarations are ready.
                  </p>
                </section> : <section className="panel page-panel" role="status">
                  <h2>Runtime readiness</h2>
                  <p>{sectionLoading || loading ? 'Checking runtime readiness...' : 'Runtime diagnostics unavailable.'}</p>
                </section>}
                <section className="panel page-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Data safety</h2>
                      <p>
                        {localBackupAvailable
                          ? 'Create a verified recovery package before operational maintenance.'
                          : 'Hosted recovery is controlled by the configured provider policy.'}
                      </p>
                    </div>
                  </div>
                  <div className="operations-actions">
                    <a className="secondary-button" href={companyApiUrl('/api/operations/export')}>
                      <FileDown size={16} />
                      Export ledger
                    </a>
                    <a className="secondary-button" href={companyApiUrl('/api/integrations/hai/feed?limit=100')} download="contractor-ai.json">
                      <GitBranch size={16} />
                      {ot('Download HAI feed')}
                    </a>
                    <button
                      className="secondary-button"
                      disabled={submitting || !haiPublicationReady}
                      title={
                        haiPublicationReady
                          ? ot('Publish the current read-only actions to the configured HAI local feed')
                          : ot('Configure an absolute HAI local-feed path to enable direct publication')
                      }
                      onClick={publishHaiLocalFeed}
                    >
                      <RefreshCw size={16} />
                      {ot('Publish to HAI')}
                    </button>
                    <button
                      className="secondary-button"
                      disabled={submitting || !localBackupAvailable}
                      title={localBackupAvailable ? 'Create verified local backup' : 'Hosted backups are provider-managed'}
                      onClick={backup}
                    >
                      <FolderArchive size={16} />
                      Create backup
                    </button>
                    <input
                      ref={exportInputRef}
                      className="visually-hidden"
                      type="file"
                      accept="application/json"
                      aria-label="Ledger export JSON file"
                      onChange={(event) => validateExport(event.target.files?.[0])}
                    />
                    <button
                      className="secondary-button"
                      disabled={submitting || !exportValidationAvailable}
                      title="Verify the checksum of a human-readable ledger export"
                      onClick={() => exportInputRef.current?.click()}
                    >
                      <FileUp size={16} />
                      Validate export
                    </button>
                    <button
                      ref={qaResetOpenerRef}
                      className="danger-button"
                      disabled={submitting || !localBackupAvailable}
                      title={
                        localBackupAvailable ? ot('Archive QA records after backup') : ot('Hosted maintenance requires a provider recovery point')
                      }
                      onClick={(event) => openQaResetDialog(event.currentTarget)}
                    >
                      <Archive size={16} />
                      {ot('Archive QA records')}
                    </button>
                  </div>
                  <p className="panel-copy">
                    The JSON export is a checksummed, human-readable reconciliation record. It cannot restore the database or evidence
                    files.
                  </p>
                  {data.backups?.length ? (
                    <div className="backup-list">
                      {data.backups.slice(0, 5).map((backup) => (
                        <div className="compact-row" key={backup.backupId}>
                          <FolderArchive size={16} />
                          <div>
                            <strong>{formatDate(backup.createdAt)}</strong>
                            <small>
                              {backup.databaseMode} / {backup.files} protected file(s) / {backup.evidenceFiles || 0} evidence
                            </small>
                          </div>
                          <span className="backup-actions">
                            <button
                              className="secondary-button"
                              aria-label={`Check restore for backup ${backup.backupId}`}
                              title={operationCapabilities?.restore?.authorityReviewRequired ? ot('reviewed recovery required') : ot('Verify file checksums and SQLite restore readiness')}
                              disabled={submitting || !localRestoreAvailable || backup.manifestStatus === 'unreadable'}
                              onClick={() => verifyBackup(backup.backupId)}
                            >
                              <ShieldCheck size={15} />
                              Check restore
                            </button>
                            {backup.downloadAvailable ? (
                              <a
                                className="secondary-button"
                                aria-label={`Download backup ${backup.backupId}`}
                                href={companyApiUrl(`/api/operations/backups/${encodeURIComponent(backup.backupId)}/download`)}
                                download
                              >
                                <FileDown size={15} />
                                Download
                              </a>
                            ) : null}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="panel-copy">
                      {localBackupAvailable ? 'No controlled local backup has been created yet.' : `Provider recovery: ${recoveryLabel}.`}
                    </p>
                  )}
                  <p className="panel-copy">
                    {operationCapabilities?.restore?.authorityReviewRequired
                      ? ot('Company authority recovery requires review. Generic restore is blocked.')
                      : localBackupAvailable
                      ? 'Signed local backup v3 is the recovery artifact: it retains the SQLite ledger and private evidence with authenticated checksums. Download it to encrypted off-device storage; restore it only while the application is stopped.'
                      : 'Application-local packages are disabled in hosted mode because they cannot contain managed PostgreSQL and private object-store data.'}
                  </p>
                </section>
                <LazyControlBoundary label="audit history">
                  <AuditHistory locale={operatorLocale} request={api} totalEvents={auditIntegrityCapability?.eventCount || 0} />
                </LazyControlBoundary>
                <section className="panel page-panel archive-registry-panel" data-testid="job-archive-registry">
                  <div className="panel-heading">
                    <div>
                      <h2>Archived jobs</h2>
                      <p>Retained work removed from active operations, with approval-gated restore.</p>
                    </div>
                    <span className="count-badge">{archivedJobs.length}</span>
                  </div>
                  {archivedJobs.length ? (
                    <div className="archive-registry-list">
                      {archivedJobs.map((job) => {
                        const pendingRestore = approvals.find(
                          (approval) => approval.jobId === job.id && approval.targetType === 'job_restore',
                        )
                        return (
                          <div className="archive-registry-row" key={job.id}>
                            <span className="archive-registry-icon">
                              <Archive size={16} />
                            </span>
                            <div className="archive-registry-copy">
                              <strong>{job.title}</strong>
                              <small>
                                {job.clientName || 'Client pending'} · archived {formatDate(job.data?.archive?.approvedAt || job.updatedAt)}{' '}
                                · from {formatStatus(job.data?.archive?.previousStatus || 'retained state')}
                              </small>
                              {job.data?.archive?.reason ? <p>{job.data.archive.reason}</p> : null}
                            </div>
                            <button
                              className="secondary-button"
                              disabled={submitting || Boolean(pendingRestore)}
                              onClick={() => openJobLifecycle('restore', job)}
                            >
                              <RefreshCw size={15} />
                              {pendingRestore ? 'Restore pending' : 'Request restore'}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <Empty title="No archived jobs" detail="Approved archives will remain available here for controlled restore." />
                  )}
                </section>
              </section>
            )}
              </div>
          </>
        ) : null}
      </main>

      {showOrganizationOnboarding ? (
        <Suspense fallback={<div className="modal-backdrop" role="status"><div className="loading"><LoaderCircle className="spin" size={20} /> {ot('Loading business setup')}</div></div>}>
          <OrganizationOnboarding
            draft={organizationProfileDraft}
            organization={data?.organization}
            busy={submitting}
            onChange={updateOrganizationProfile}
            onVatExemptChange={updateOrganizationVatExemption}
            onSave={() => persistOrganizationProfile({ announce: false })}
            onClose={closeOrganizationOnboarding}
            locale={operatorLocale}
          />
        </Suspense>
      ) : null}

      {jobLifecycleAction ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{jobLifecycleAction.mode === 'archive' ? 'Request job archive' : 'Request job restore'}</>} onClose={closeJobLifecycle}>
<JobLifecycleModalDialog closeJobLifecycle={closeJobLifecycle} jobLifecycleAction={jobLifecycleAction} jobLifecycleReason={jobLifecycleReason} setJobLifecycleReason={setJobLifecycleReason} submitJobLifecycle={submitJobLifecycle} submitting={submitting} />
</DeferredActionDialog>
      ) : null}

      {workerEditor ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{workerDraft.id ? ot('Edit {name}', { name: workerDraft.name || ot('crew member') }) : ot('Add crew member')}</>} onClose={closeWorkerEditor}>
<WorkerEditorDialog closeWorkerEditor={closeWorkerEditor} ot={ot} saveWorker={saveWorker} setWorkerDraft={setWorkerDraft} submitting={submitting} workerDraft={workerDraft} />
</DeferredActionDialog>
      ) : null}

      {workerRetirement ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{ot('Request crew retirement')}</>} onClose={closeWorkerRetirement}>
<WorkerRetirementModalDialog closeWorkerRetirement={closeWorkerRetirement} ot={ot} requestWorkerRetirement={requestWorkerRetirement} setWorkerRetirementReason={setWorkerRetirementReason} submitting={submitting} workerRetirement={workerRetirement} workerRetirementReason={workerRetirementReason} />
</DeferredActionDialog>
      ) : null}

      {credentialEditor ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{ot('Add credential for {name}', { name: credentialEditor.name })}</>} onClose={closeCredentialEditor}>
<CredentialEditorDialog closeCredentialEditor={closeCredentialEditor} credentialDraft={credentialDraft} credentialEditor={credentialEditor} data={data} ot={ot} setCredentialDraft={setCredentialDraft} submitWorkerCredential={submitWorkerCredential} submitting={submitting} />
</DeferredActionDialog>
      ) : null}

      {qualificationRequirementEditor ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{ot('Add qualification requirement')}</>} onClose={closeQualificationRequirementEditor}>
<QualificationRequirementEditorDialog closeQualificationRequirementEditor={closeQualificationRequirementEditor} data={data} jobs={jobs} ot={ot} qualificationRequirementDraft={qualificationRequirementDraft} setQualificationRequirementDraft={setQualificationRequirementDraft} submitQualificationRequirement={submitQualificationRequirement} submitting={submitting} />
</DeferredActionDialog>
      ) : null}

      {qualificationRequirementRetirement ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{ot('Request requirement removal')}</>} onClose={closeQualificationRequirementRetirement}>
<QualificationRetirementModalDialog closeQualificationRequirementRetirement={closeQualificationRequirementRetirement} ot={ot} qualificationRequirementRetirement={qualificationRequirementRetirement} qualificationRequirementRetirementReason={qualificationRequirementRetirementReason} requestQualificationRequirementRetirement={requestQualificationRequirementRetirement} setQualificationRequirementRetirementReason={setQualificationRequirementRetirementReason} submitting={submitting} />
</DeferredActionDialog>
      ) : null}

      {availabilityEditor ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{ot('Add worker unavailability')}</>} onClose={closeAvailabilityEditor}>
<AvailabilityEditorDialog AVAILABILITY_TIME_ZONES={AVAILABILITY_TIME_ZONES} availabilityDraft={availabilityDraft} closeAvailabilityEditor={closeAvailabilityEditor} data={data} ot={ot} setAvailabilityDraft={setAvailabilityDraft} submitWorkerAvailability={submitWorkerAvailability} submitting={submitting} workerAvailabilityReviewMinimum={workerAvailabilityReviewMinimum} />
</DeferredActionDialog>
      ) : null}

      {availabilityCancellation ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{ot('Request availability cancellation')}</>} onClose={closeAvailabilityCancellation}>
<AvailabilityCancellationModalDialog availabilityCancellation={availabilityCancellation} availabilityCancellationReason={availabilityCancellationReason} closeAvailabilityCancellation={closeAvailabilityCancellation} ot={ot} requestAvailabilityCancellation={requestAvailabilityCancellation} setAvailabilityCancellationReason={setAvailabilityCancellationReason} submitting={submitting} />
</DeferredActionDialog>
      ) : null}

      {equipmentEditor ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{equipmentDraft.id ? ot('Edit {name}', { name: equipmentDraft.name || ot('equipment') }) : ot('Add equipment')}</>} onClose={closeEquipmentEditor}>
<EquipmentEditorDialog closeEquipmentEditor={closeEquipmentEditor} equipmentDraft={equipmentDraft} equipmentEditor={equipmentEditor} ot={ot} saveEquipment={saveEquipment} setEquipmentDraft={setEquipmentDraft} submitting={submitting} />
</DeferredActionDialog>
      ) : null}

      {equipmentCheckoutEditor ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{ot('Check out reserved equipment')}</>} onClose={closeEquipmentCheckout}>
<EquipmentCheckoutModalDialog closeEquipmentCheckout={closeEquipmentCheckout} equipmentCheckoutDraft={equipmentCheckoutDraft} equipmentCheckoutPlans={equipmentCheckoutPlans} jobs={jobs} ot={ot} saveEquipmentCheckout={saveEquipmentCheckout} selectEquipmentCheckoutJob={selectEquipmentCheckoutJob} selectEquipmentCheckoutPlan={selectEquipmentCheckoutPlan} selectedEquipmentCheckoutPlan={selectedEquipmentCheckoutPlan} setEquipmentCheckoutDraft={setEquipmentCheckoutDraft} submitting={submitting} />
</DeferredActionDialog>
      ) : null}

      {equipmentReturnEditor ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{ot('Return {name}', { name: equipmentReturnEditor.toolName })}</>} onClose={closeEquipmentReturn}>
<EquipmentReturnModalDialog closeEquipmentReturn={closeEquipmentReturn} equipmentReturnDraft={equipmentReturnDraft} equipmentReturnEditor={equipmentReturnEditor} ot={ot} saveEquipmentReturn={saveEquipmentReturn} setEquipmentReturnDraft={setEquipmentReturnDraft} submitting={submitting} />
</DeferredActionDialog>
      ) : null}

      {equipmentInspection ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{ot('Record equipment inspection')}</>} onClose={closeEquipmentInspection}>
<EquipmentInspectionModalDialog closeEquipmentInspection={closeEquipmentInspection} equipmentInspection={equipmentInspection} equipmentInspectionDraft={equipmentInspectionDraft} ot={ot} recordEquipmentInspection={recordEquipmentInspection} setEquipmentInspectionDraft={setEquipmentInspectionDraft} submitting={submitting} />
</DeferredActionDialog>
      ) : null}

      {equipmentMaintenance ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{ot('Record equipment maintenance')}</>} onClose={closeEquipmentMaintenance}>
<EquipmentMaintenanceModalDialog closeEquipmentMaintenance={closeEquipmentMaintenance} equipmentMaintenance={equipmentMaintenance} equipmentMaintenanceDraft={equipmentMaintenanceDraft} ot={ot} recordEquipmentMaintenance={recordEquipmentMaintenance} setEquipmentMaintenanceDraft={setEquipmentMaintenanceDraft} submitting={submitting} />
</DeferredActionDialog>
      ) : null}

      {equipmentRetirement ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{ot('Request equipment retirement')}</>} onClose={closeEquipmentRetirement}>
<EquipmentRetirementModalDialog closeEquipmentRetirement={closeEquipmentRetirement} equipmentRetirement={equipmentRetirement} equipmentRetirementReason={equipmentRetirementReason} ot={ot} requestEquipmentRetirement={requestEquipmentRetirement} setEquipmentRetirementReason={setEquipmentRetirementReason} submitting={submitting} />
</DeferredActionDialog>
      ) : null}

      {tradePartnerEditor ? (
        <DeferredActionDialog locale={operatorLocale} title={<>
                  {tradePartnerDraft.id ? `Edit ${tradePartnerDraft.name || 'trade partner'}` : 'Add trade partner'}
                </>} onClose={closeTradePartnerEditor}>
<TradePartnerEditorDialog closeTradePartnerEditor={closeTradePartnerEditor} ot={ot} saveTradePartner={saveTradePartner} setTradePartnerDraft={setTradePartnerDraft} submitting={submitting} tradePartnerDraft={tradePartnerDraft} />
</DeferredActionDialog>
      ) : null}

      {tradePartnerRetirement ? (
        <DeferredActionDialog locale={operatorLocale} title={<>Request partner retirement</>} onClose={closeTradePartnerRetirement}>
<TradePartnerRetirementModalDialog closeTradePartnerRetirement={closeTradePartnerRetirement} ot={ot} requestTradePartnerRetirement={requestTradePartnerRetirement} setTradePartnerRetirementReason={setTradePartnerRetirementReason} submitting={submitting} tradePartnerRetirement={tradePartnerRetirement} tradePartnerRetirementReason={tradePartnerRetirementReason} />
</DeferredActionDialog>
      ) : null}

      {approvalReview ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{approvalReview.status === 'approved' ? 'Approve decision' : 'Reject decision'}</>} onClose={closeApprovalReview}>
<ApprovalReviewModalDialog approvalReason={approvalReason} approvalReview={approvalReview} closeApprovalReview={closeApprovalReview} ot={ot} resolveApproval={resolveApproval} setApprovalReason={setApprovalReason} submitting={submitting} />
</DeferredActionDialog>
      ) : null}

      {clientEditor ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{clientEditor.mode === 'edit' ? ot('Edit client') : ot('New client')}</>} onClose={closeClientEditor}>
<ClientEditorModalDialog clientDraft={clientDraft} clientEditor={clientEditor} closeClientEditor={closeClientEditor} ot={ot} setClientDraft={setClientDraft} submitClientEditor={submitClientEditor} submitting={submitting} />
</DeferredActionDialog>
      ) : null}

      {selectedJobId ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal job-workspace"
            role="dialog"
            aria-modal="true"
            aria-labelledby="job-workspace-title"
            data-testid="job-workspace"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{ot('Ledger job workspace')}</p>
                <h2 id="job-workspace-title">{selectedJob?.title || ot('Loading job record')}</h2>
                <p>
                  {selectedJob?.clientName || ot('Client pending')}
                  {selectedJob?.city ? ` / ${selectedJob.city}` : ''}
                </p>
              </div>
              <div className="modal-heading-actions">
                {selectedJob && canCoordinate ? (
                  <button
                    className="secondary-button job-resource-button"
                    type="button"
                    aria-label={ot('Open resource planner')}
                    onClick={() => setShowResourcePlanner(true)}
                  >
                    <Users size={16} />
                    {ot('Resources')}
                  </button>
                ) : null}
                <button className="icon-button" aria-label={ot('Close job workspace')} onClick={closeJobWorkspace}>
                  <X size={18} />
                </button>
              </div>
            </div>
            {selectedJobLoading || !selectedJob ? (
              <div className="loading job-workspace-loading">
                <LoaderCircle className="spin" size={24} />
                {ot('Loading the retained job record')}
              </div>
            ) : (
              <div className="job-workspace-body">
                <div className="job-facts">
                  <div>
                    <span>{ot('State')}</span>
                    <strong>
                      <span className={`status status-${selectedJob.status}`}>{ot(formatStatus(selectedJob.status))}</span>
                    </strong>
                  </div>
                  <div>
                    <span>{ot('Progress')}</span>
                    <strong>{Math.round(selectedJob.progressPercent || 0)}%</strong>
                  </div>
                  <div>
                    <span>{ot('Proposed work')}</span>
                    <strong>{selectedJob.scheduledStart || selectedJob.targetCompletion ? formatDate(selectedJob.scheduledStart || selectedJob.targetCompletion) : ot('Not scheduled')}</strong>
                  </div>
                  <div>
                    <span>{ot('Open approvals')}</span>
                    <strong>{(selectedJob.approvals || []).filter((item) => item.status === 'pending').length}</strong>
                  </div>
                </div>
                <DossierSections key={selectedJob.id} locale={operatorLocale} fieldScoped={fieldScoped}>
                {!fieldScoped && <DossierSection areas={['work']}><LazyControlBoundary label="werkdossier"><WorkContextControl key={selectedJob.id} api={api} jobId={selectedJob.id} canEdit={['owner', 'office_operator'].includes(operator.role)} onChanged={() => setWorkContextRevision(value => value + 1)} /></LazyControlBoundary></DossierSection>}
                {!fieldScoped && <DossierSection areas={['work', 'planning']}><LazyControlBoundary label="werkbalans"><WorkBalanceControl key={`${selectedJob.id}:${draftRecoveryEnabled ? outboxScope : 'local'}`} api={api} jobId={selectedJob.id} canEdit={['owner', 'office_operator'].includes(operator.role)} draftScope={draftRecoveryEnabled ? outboxScope : ''} refreshKey={`${workContextRevision}:${selectedJob.updatedAt}`} onChanged={() => { setWorkContextRevision(value => value + 1); void refreshWorkDelivery(selectedJob.id) }} /></LazyControlBoundary></DossierSection>}
                {!fieldScoped && <DossierSection areas={['work', 'planning', 'safety']}><LazyControlBoundary label="verstoringen en herstel"><OperationalRecoveryControl key={`${selectedJob.id}:${draftRecoveryEnabled ? outboxScope : 'local'}`} api={api} jobId={selectedJob.id} canEdit={['owner', 'office_operator'].includes(operator.role)} draftScope={draftRecoveryEnabled ? outboxScope : ''} refreshKey={`${workContextRevision}:${selectedJob.updatedAt}`} onChanged={async result => { setWorkContextRevision(value => value + 1); if (result?.materialAvailabilityUpdated) { const refreshedJob = await loadSelectedJob(selectedJob.id); if (refreshedJob) setScheduleRefreshRevision(value => value + 1) } }} /></LazyControlBoundary></DossierSection>}
                {!fieldScoped && <DossierSection areas={['work', 'planning']}><LazyControlBoundary label="open posities"><WorkBoardOffice api={api} jobId={selectedJob.id} isOwner={operator.role === 'owner'} refreshKey={workContextRevision} /></LazyControlBoundary></DossierSection>}
                {!fieldScoped && <DossierSection areas={['work', 'quality', 'finance']}><LazyControlBoundary label="deelopleveringen"><WorkDeliveryControl key={selectedJob.id} api={api} jobId={selectedJob.id} canEdit={['owner', 'office_operator'].includes(operator.role)} refreshKey={`${workContextRevision}:${selectedJob.updatedAt}`} onChanged={() => { void refreshWorkDelivery(selectedJob.id) }} /></LazyControlBoundary></DossierSection>}
                {!fieldScoped && <DossierSection areas={['work', 'quality']}><LazyControlBoundary label="keuringsdekking"><InspectionCoverageControl key={selectedJob.id} api={api} jobId={selectedJob.id} canEdit={['owner', 'office_operator'].includes(operator.role)} refreshKey={`${workContextRevision}:${selectedJob.updatedAt}`} onChanged={() => { void refreshWorkDelivery(selectedJob.id) }} /></LazyControlBoundary></DossierSection>}
                {!fieldScoped && <DossierSection areas={['work', 'quality', 'client']}><LazyControlBoundary label="klantopleveringen"><ClientDeliveryControl key={selectedJob.id} api={api} jobId={selectedJob.id} canEdit={['owner', 'office_operator'].includes(operator.role)} refreshKey={`${workContextRevision}:${selectedJob.updatedAt}`} onChanged={() => { void refreshWorkDelivery(selectedJob.id) }} /></LazyControlBoundary></DossierSection>}
                {!fieldScoped && <DossierSection areas={['work', 'quality', 'client']}><LazyControlBoundary label="installatiehistorie"><AssetHistoryControl key={selectedJob.id} api={api} jobId={selectedJob.id} canEdit={['owner', 'office_operator'].includes(operator.role)} refreshKey={`${workContextRevision}:${selectedJob.updatedAt}`} onChanged={() => setWorkContextRevision(value => value + 1)} onOpenJob={jobId => { void loadSelectedJob(jobId) }} /></LazyControlBoundary></DossierSection>}
                <LazyControlBoundary label={ot('job controls')} mode="job">
                  <DossierSection areas={['work', 'finance']}>
                  {!fieldScoped ? (
                    <TakeoffControl
                      job={selectedJob}
                      estimateRates={estimateRates}
                      locale={operatorLocale}
                      canCoordinate={canCoordinate}
                      canManagePolicy={canManageMarketFitPolicy}
                      submitting={submitting}
                      onRequestRatePolicy={requestEstimateRatePolicy}
                      onApplyUnitRate={applyTakeoffUnitRate}
                      onNewTakeoff={openTakeoffCreate}
                      onAddItem={(takeoff) => openTakeoffItem(takeoff)}
                      onEditItem={openTakeoffItem}
                      onRemoveItem={openTakeoffRemoval}
                      onConvert={openTakeoffConversion}
                    />
                  ) : null}
                  </DossierSection>
                  <DossierSection areas={['work']}>
                  <ProductionControl
                    job={selectedJob}
                    locale={operatorLocale}
                    canCoordinate={canCoordinate}
                    canReport={canCoordinate || capabilities.fieldEvidence === true}
                    canApprove={capabilities.approvals === true}
                    submitting={submitting}
                    outboxPending={outboxPending}
                    outboxSyncing={outboxSyncing}
                    onRequestBaseline={requestProductionBaseline}
                    onRecordEntry={recordProductionOutput}
                    onRequestReversal={requestProductionReversal}
                    onOpenApprovals={openApprovals}
                    onSyncOutbox={() => syncFieldOutbox({ announce: true })}
                  />
                  </DossierSection>
                  <DossierSection areas={['work', 'finance']}>
                  <DayworkControl
                    job={selectedJob}
                    locale={operatorLocale}
                    canReport={canCoordinate || capabilities.fieldEvidence === true}
                    canCoordinate={canCoordinate}
                    canApprove={capabilities.approvals === true}
                    submitting={submitting}
                    outboxPending={outboxPending}
                    outboxSyncing={outboxSyncing}
                    onSubmit={recordDayworkTicket}
                    onRequestAcknowledgement={requestDayworkAcknowledgement}
                    onConvert={convertDayworkTicket}
                    onOpenApprovals={openApprovals}
                    onSyncOutbox={() => syncFieldOutbox({ announce: true })}
                  />
                  </DossierSection>
                  <DossierSection areas={['finance']}>
                  {!fieldScoped ? (
                    <CommercialControl
                      job={selectedJob}
                      api={api}
                      locale={operatorLocale}
                      canCoordinate={canCoordinate}
                      canApprove={capabilities.approvals === true}
                      submitting={submitting}
                      onNewQuote={() => openCommercialDraft('quote')}
                      onNewChangeOrder={(supersedes) => openCommercialDraft('change_order', supersedes)}
                      onRequestAcceptance={openCommercialAcceptance}
                      onPrepareVariationImplementation={prepareVariationImplementation}
                      onRecordChangeDelivery={openChangeOrderDelivery}
                      onOpenApprovals={openApprovals}
                      onRequestCommercialScope={requestCommercialScopeRevision}
                      onRequestRiskRegister={requestRiskRegisterRevision}
                      onRetainPricingBasis={retainPricingBasisDecision}
                    />
                  ) : null}
                  </DossierSection>
                  <DossierSection areas={['work']}>
                  {!fieldScoped ? (
                    <CapabilitySetupControl
                      job={selectedJob}
                      locale={operatorLocale}
                      canCoordinate={canCoordinate}
                      submitting={submitting}
                      onApply={applyCapabilitySetup}
                    />
                  ) : null}
                  </DossierSection>
                  <DossierSection areas={['work', 'planning']}>
                  <WorkPlanControl
                    job={selectedJob}
                    refreshScheduleKey={scheduleRefreshRevision}
                    locale={operatorLocale}
                    canCoordinate={canCoordinate}
                    canApprove={capabilities.approvals === true}
                    fieldScoped={fieldScoped}
                    operator={operator}
                    submitting={submitting}
                    taskDraft={taskDraft}
                    setTaskDraft={setTaskDraft}
                    assignees={taskAssigneeOptions}
                    onCreateTask={createJobTask}
                    onTaskTransition={openTaskTransition}
                    onUpdateTaskSchedule={updateJobTaskSchedule}
                    onAddDependency={addJobTaskDependency}
                    onCancelDependency={cancelJobTaskDependency}
                    onCalculate={calculateJobWorkPlan}
                    onReserveWarehouseMaterial={reserveJobWarehouseMaterial}
                    onIssueWarehouseMaterial={issueJobWarehouseMaterial}
                    onCalculateResources={calculateResourceWorkPlan}
                    onSaveSiteAccessCalendar={saveJobSiteAccessCalendar}
                    onSaveTravelRoute={saveJobTravelRoute}
                    onRequestResourceApproval={requestResourceWorkPlanApproval}
                    onRequestBaseline={requestJobScheduleBaseline}
                    onOpenApprovals={openApprovals}
                  />
                  </DossierSection>
                  <DossierSection areas={['documents']}>
                  <ProjectControls
                    job={selectedJob}
                    locale={operatorLocale}
                    canCoordinate={canCoordinate}
                    canApprove={capabilities.approvals === true}
                    submitting={submitting}
                    onCreate={createProjectControl}
                    onTransition={transitionProjectControl}
                    onIssueTransmittal={issueDocumentTransmittal}
                    onAcknowledgeTransmittal={acknowledgeDocumentTransmittal}
                    onSubmitMeeting={submitProjectMeeting}
                    onIssueMeeting={issueProjectMeeting}
                    onCompleteMeetingAction={completeProjectMeetingAction}
                    onCreateMeetingFollowUp={createProjectMeetingFollowUp}
                    onOpenApprovals={openApprovals}
                  />
                  </DossierSection>
                  <DossierSection areas={['quality']}>
                  {!fieldScoped ? (
                    <EnergyPerformanceControl
                      job={selectedJob}
                      canCoordinate={canCoordinate}
                      canApprove={capabilities.approvals === true}
                      submitting={submitting}
                      onSubmit={submitEnergyPerformanceRecord}
                      onOpenApprovals={openApprovals}
                    />
                  ) : null}
                  </DossierSection>
                  <DossierSection areas={['documents', 'quality']}>
                  <PhotoEvidenceControl
                    job={selectedJob}
                    locale={operatorLocale}
                    canCoordinate={canCoordinate}
                    canApprove={capabilities.approvals === true}
                    submitting={submitting}
                    onSchedule={schedulePhotoEvidenceSet}
                    onRequestReview={requestPhotoEvidenceReview}
                    onOpenApprovals={openApprovals}
                  />
                  </DossierSection>
                  <DossierSection areas={['quality']}>
                  <InspectionChecklistControl
                    job={selectedJob}
                    templates={inspectionTemplates}
                    locale={operatorLocale}
                    canCoordinate={canCoordinate}
                    canApprove={capabilities.approvals === true}
                    fieldScoped={fieldScoped}
                    operator={operator}
                    submitting={submitting}
                    onCreateTemplate={createInspectionTemplate}
                    onSchedule={scheduleInspectionChecklist}
                    onSubmit={submitInspectionChecklist}
                    onOpenApprovals={openApprovals}
                  />
                  <NonconformanceControl
                    job={selectedJob}
                    locale={operatorLocale}
                    canReport={canCoordinate || capabilities.fieldEvidence === true}
                    canCoordinate={canCoordinate}
                    canApprove={capabilities.approvals === true}
                    fieldScoped={fieldScoped}
                    operator={operator}
                    submitting={submitting}
                    onCreate={createNonconformance}
                    onRequestCorrection={requestNonconformanceCorrection}
                    onRequestClosure={requestNonconformanceClosure}
                    onOpenApprovals={openApprovals}
                  />
                  <FieldRiskControl
                    job={selectedJob}
                    locale={operatorLocale}
                    canReport={canCoordinate || capabilities.fieldEvidence === true}
                    canCoordinate={canCoordinate}
                    canApprove={capabilities.approvals === true}
                    fieldScoped={fieldScoped}
                    operator={operator}
                    submitting={submitting}
                    onCreate={createFieldRisk}
                    onReview={openFieldReview}
                    onOpenApprovals={openApprovals}
                  />
                  <CloseoutRegister
                    job={selectedJob}
                    locale={operatorLocale}
                    canReportPunch={canCoordinate || capabilities.fieldEvidence === true}
                    canCoordinate={canCoordinate}
                    canApprove={capabilities.approvals === true}
                    fieldScoped={fieldScoped}
                    operator={operator}
                    submitting={submitting}
                    onCreate={createCloseoutRecord}
                    onLifecycle={openJobCloseoutLifecycle}
                    onOpenApprovals={openApprovals}
                  />
                  </DossierSection>
                </LazyControlBoundary>
                <DossierSection areas={[]}>
                {canCoordinate ? (
                  <div className="job-workspace-lifecycle" data-testid="job-archive-control">
                    <div>
                      <Archive size={18} />
                      <span>
                        <strong>Archive control</strong>
                        <small>Remove this job from active operations after approval while retaining its complete ledger.</small>
                      </span>
                    </div>
                    <button
                      type="button"
                      className="danger-button"
                      data-testid="request-job-archive"
                      disabled={submitting || (selectedJob.approvals || []).some((item) => item.status === 'pending')}
                      title={
                        (selectedJob.approvals || []).some((item) => item.status === 'pending')
                          ? 'Resolve pending job decisions before archive'
                          : 'Request approval to archive this job'
                      }
                      onClick={() => openJobLifecycle('archive', selectedJob)}
                    >
                      <Archive size={15} />
                      {(selectedJob.approvals || []).some((item) => item.status === 'pending' && item.targetType === 'job_archive')
                        ? 'Archive pending'
                        : (selectedJob.approvals || []).some((item) => item.status === 'pending')
                          ? 'Resolve approvals first'
                          : 'Request archive'}
                    </button>
                  </div>
                ) : null}
                </DossierSection>
                {canCoordinate ? (
                  <>
                    <DossierSection areas={['planning']}>
                    <section className="job-workspace-section">
                      <div className="section-heading">
                        <CalendarDays size={18} />
                        <div>
                          <h3>Schedule review</h3>
                          <p>Review planning readiness first. A client or crew commitment is created only through the approval queue.</p>
                        </div>
                      </div>
                      <form className="form-grid compact-form" onSubmit={reviewSchedule}>
                        <label>
                          Proposed start
                          <input
                            required
                            type="datetime-local"
                            value={scheduleDraft.plannedStart}
                            onChange={(event) =>
                              setScheduleDraft({
                                ...scheduleDraft,
                                plannedStart: event.target.value,
                                plannedEnd: scheduleDraft.plannedEnd || suggestedEndInput(event.target.value, selectedJob.estimatedHours),
                              })
                            }
                          />
                        </label>
                        <label>
                          Proposed end
                          <input
                            required
                            type="datetime-local"
                            value={scheduleDraft.plannedEnd}
                            onChange={(event) => setScheduleDraft({ ...scheduleDraft, plannedEnd: event.target.value })}
                          />
                        </label>
                        <div className="form-actions form-span">
                          <button className="secondary-button" disabled={submitting}>
                            <CalendarDays size={16} />
                            Review schedule
                          </button>
                          <button type="button" className="primary-button" disabled={submitting} onClick={requestScheduleApproval}>
                            <ShieldCheck size={16} />
                            Request approval
                          </button>
                        </div>
                      </form>
                      {scheduleReview ? (
                        <div className="workflow-result">
                          <div>
                            <strong>{formatStatus(scheduleReview.status)}</strong>
                            <span>{scheduleReview.nextAction}</span>
                          </div>
                          {scheduleReview.recommendedWorker?.name ? (
                            <span className="tag tag-green">Worker: {scheduleReview.recommendedWorker.name}</span>
                          ) : null}
                          {scheduleReview.blockers?.length ? (
                            <ul>
                              {scheduleReview.blockers.slice(0, 3).map((blocker) => (
                                <li key={blocker.type}>{blocker.message}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ) : null}
                    </section>
                    <section className="job-workspace-section">
                      <div className="section-heading">
                        <CloudOff size={18} />
                        <div>
                          <h3>Weather assessment</h3>
                          <p>Record conditions for the current planned start. Reassess after a schedule change and check conditions again before dispatch; this never commits a date.</p>
                        </div>
                      </div>
                      <form className="form-grid compact-form" onSubmit={recordWeatherAssessment}>
                        <label>
                          Condition
                          <select
                            value={weatherDraft.condition}
                            onChange={(event) => setWeatherDraft({ ...weatherDraft, condition: event.target.value })}
                          >
                            <option value="workable">Workable</option>
                            <option value="rain_risk">Rain risk</option>
                            <option value="wind_risk">Wind risk</option>
                            <option value="heat_risk">Heat risk</option>
                            <option value="unsafe">Unsafe</option>
                          </select>
                        </label>
                        <label>
                          Precipitation risk (%)
                          <input
                            required
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={weatherDraft.precipitationPercent}
                            onChange={(event) => setWeatherDraft({ ...weatherDraft, precipitationPercent: event.target.value })}
                          />
                        </label>
                        <label className="form-span checkbox-label">
                          <input
                            type="checkbox"
                            checked={weatherDraft.weatherSensitive}
                            onChange={(event) => setWeatherDraft({ ...weatherDraft, weatherSensitive: event.target.checked })}
                          />
                          This work is weather-sensitive
                        </label>
                        <div className="form-actions form-span">
                          <button className="secondary-button" disabled={submitting}>
                            <CloudOff size={16} />
                            Record assessment
                          </button>
                        </div>
                      </form>
                      {selectedJob.weather?.[0] ? (
                        <p className="workflow-note">
                          <strong>Latest:</strong> {formatStatus(selectedJob.weather[0].condition)} ·{' '}
                          {selectedJob.weather[0].precipitationPercent}% · {selectedJob.weather[0].recommendation}
                        </p>
                      ) : null}
                    </section>
                    </DossierSection>
                    <DossierSection areas={['client']}>
                    <section className="job-workspace-section">
                      <div className="section-heading">
                        <MessageSquareText size={18} />
                        <div>
                          <h3>Client communication draft</h3>
                          <p>Creates a retained draft and approval record. This interface cannot deliver a message.</p>
                        </div>
                      </div>
                      <form className="form-grid compact-form" onSubmit={createCommunicationDraft}>
                        <label>
                          Channel
                          <select
                            value={communicationDraft.channel}
                            onChange={(event) => setCommunicationDraft({ ...communicationDraft, channel: event.target.value })}
                          >
                            <option value="email">Email</option>
                            <option value="portal">Client portal</option>
                            <option value="phone">Phone follow-up</option>
                          </select>
                        </label>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={communicationDraft.expectsReply}
                            onChange={(event) => setCommunicationDraft({ ...communicationDraft, expectsReply: event.target.checked })}
                          />
                          Reply expected
                        </label>
                        <label className="form-span">
                          Subject
                          <input
                            required
                            value={communicationDraft.subject}
                            onChange={(event) => setCommunicationDraft({ ...communicationDraft, subject: event.target.value })}
                            placeholder="Describe the client decision or update"
                          />
                        </label>
                        <label className="form-span">
                          Draft message
                          <textarea
                            required
                            value={communicationDraft.body}
                            onChange={(event) => setCommunicationDraft({ ...communicationDraft, body: event.target.value })}
                            placeholder="Prepare the approved wording. Delivery stays blocked until a verified integration receipt is recorded."
                          />
                        </label>
                        <div className="form-actions form-span">
                          <button className="primary-button" disabled={submitting}>
                            <MessageSquareText size={16} />
                            Create approval-gated draft
                          </button>
                        </div>
                      </form>
                    </section>
                    <section className="job-workspace-section">
                      <div className="section-heading">
                        <Link2 size={18} />
                        <div>
                          <h3>Client portal access</h3>
                          <p>Generate a restricted job portal link. The client cannot open it until the access approval is resolved.</p>
                        </div>
                      </div>
                      <form className="form-grid compact-form" onSubmit={requestClientPortalAccess}>
                        <label>
                          Portal label
                          <input
                            required
                            value={portalDraft.label}
                            onChange={(event) => setPortalDraft({ ...portalDraft, label: event.target.value })}
                          />
                        </label>
                        <label>
                          Expiry
                          <input
                            required
                            type="date"
                            value={portalDraft.expiresAt}
                            onChange={(event) => setPortalDraft({ ...portalDraft, expiresAt: event.target.value })}
                          />
                        </label>
                        <label>
                          Portal language
                          <select
                            value={portalDraft.locale}
                            onChange={(event) => setPortalDraft({ ...portalDraft, locale: event.target.value })}
                          >
                            {SUPPORTED_LOCALES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        </label>
                        <div className="form-actions form-span">
                          <button className="secondary-button" disabled={submitting}>
                            <Link2 size={16} />
                            Request portal access
                          </button>
                        </div>
                      </form>
                      {portalLink ? (
                        <div className="workflow-result portal-secret">
                          <div>
                            <strong>One-time portal link</strong>
                            <span>
                              Copy this link securely now. It is inactive until approval and cannot be recovered from the ledger after this
                              workspace closes.
                            </span>
                          </div>
                          <input aria-label="One-time client portal link" readOnly value={portalLink} />
                          <button type="button" className="secondary-button" onClick={copyPortalLink}>
                            <Copy size={16} />
                            Copy link
                          </button>
                        </div>
                      ) : null}
                      {selectedJob.portalAccess?.length ? (
                        <div className="activity-list">
                          {selectedJob.portalAccess.slice(0, 3).map((access) => (
                            <div className="activity-row" key={access.id}>
                              <div>
                                <strong>{access.data?.label || 'Client job portal'}</strong>
                                <small>
                                  {access.data?.locale === 'en-GB' ? 'EN' : 'NL'} / Expires {formatDate(access.expiresAt)} / {formatStatus(access.status)}
                                </small>
                              </div>
                              {!['revoked', 'expired'].includes(access.status) ? (
                                <button
                                  type="button"
                                  className="secondary-button"
                                  disabled={submitting}
                                  onClick={() => revokeClientPortalAccess(access.id)}
                                >
                                  <Ban size={15} />
                                  Revoke
                                </button>
                              ) : (
                                <span className={`status status-${access.status}`}>{formatStatus(access.status)}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </section>
                    </DossierSection>
                  </>
                ) : (
                  <div className="field-note">
                    <ShieldCheck size={20} />
                    <div>
                      <strong>Field-scoped job workspace</strong>
                      <p>
                        Task updates and field records remain available. Schedule and client communication actions stay reserved for the
                        office role.
                      </p>
                    </div>
                  </div>
                )}
                <DossierSection areas={['client']}>
                <section className="job-workspace-section activity-section">
                  <div className="section-heading">
                    <Bell size={18} />
                    <div>
                      <h3>Recent communications</h3>
                      <p>Every client record remains linked to approval and delivery evidence.</p>
                    </div>
                  </div>
                  {selectedJob.communications?.length ? (
                    <div className="activity-list">
                      {selectedJob.communications.slice(0, 5).map((item) => (
                        <div className="activity-row" key={item.id}>
                          <div>
                            <strong>{item.subject || formatStatus(item.channel)}</strong>
                            <small>
                              {formatStatus(item.direction)} · {formatDate(item.createdAt)}
                            </small>
                          </div>
                          <span className={`status status-${item.status}`}>{formatStatus(item.status)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="workflow-note">No client communication has been recorded for this job.</p>
                  )}
                </section>
                </DossierSection>
                </DossierSections>
              </div>
            )}
          </section>
        </div>
      ) : null}
      {takeoffDialog?.mode === 'create' ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{ot('New quantity takeoff')}</>} onClose={closeTakeoffDialog}>
<TakeoffCreateModalDialog closeTakeoffDialog={closeTakeoffDialog} ot={ot} selectedJob={selectedJob} setTakeoffDraft={setTakeoffDraft} submitTakeoff={submitTakeoff} submitting={submitting} takeoffDraft={takeoffDraft} />
</DeferredActionDialog>
      ) : null}

      {['add_item', 'edit_item'].includes(takeoffDialog?.mode) ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{takeoffDialog.mode === 'edit_item' ? ot('Edit measurement') : ot('Add measurement')}</>} onClose={closeTakeoffDialog}>
<TakeoffItemModalDialog changeTakeoffMeasurementType={changeTakeoffMeasurementType} closeTakeoffDialog={closeTakeoffDialog} ot={ot} setTakeoffItemDraft={setTakeoffItemDraft} submitTakeoffItem={submitTakeoffItem} submitting={submitting} takeoffDialog={takeoffDialog} takeoffItemDraft={takeoffItemDraft} takeoffItemDraftReady={takeoffItemDraftReady} takeoffPreviewCost={takeoffPreviewCost} takeoffPreviewQuantity={takeoffPreviewQuantity} takeoffPreviewSell={takeoffPreviewSell} />
</DeferredActionDialog>
      ) : null}

      {takeoffDialog?.mode === 'remove_item' ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{ot('Remove measurement?')}</>} onClose={closeTakeoffDialog}>
<TakeoffRemoveModalDialog closeTakeoffDialog={closeTakeoffDialog} ot={ot} removeTakeoffItem={removeTakeoffItem} submitting={submitting} takeoffDialog={takeoffDialog} />
</DeferredActionDialog>
      ) : null}

      {takeoffDialog?.mode === 'convert' ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{ot('Prepare estimate')}</>} onClose={closeTakeoffDialog}>
<TakeoffConvertModalDialog closeTakeoffDialog={closeTakeoffDialog} convertTakeoff={convertTakeoff} ot={ot} selectedJob={selectedJob} setTakeoffConversionDraft={setTakeoffConversionDraft} submitting={submitting} takeoffConversionDraft={takeoffConversionDraft} takeoffDialog={takeoffDialog} />
</DeferredActionDialog>
      ) : null}

      {commercialDraftMode ? (
        <DeferredActionDialog locale={operatorLocale} title={<>
                  {commercialDraftMode === 'quote'
                    ? selectedJob?.pricingBasis?.currentDecision?.selectedModel === 'time_and_materials' ? ot('New T&M budget estimate') : ot('New fixed-price estimate')
                    : ot('New scope change')}
                </>} onClose={closeCommercialDialog}>
<CommercialDraftModalDialog activeCommercialDraft={activeCommercialDraft} addCommercialLineItem={addCommercialLineItem} changeOrderDraft={changeOrderDraft} closeCommercialDialog={closeCommercialDialog} commercialDraftMode={commercialDraftMode} commercialDraftNet={commercialDraftNet} commercialDraftReady={commercialDraftReady} commercialDraftTax={commercialDraftTax} commercialDraftTotal={commercialDraftTotal} ot={ot} quoteDraft={quoteDraft} removeCommercialLineItem={removeCommercialLineItem} selectedJob={selectedJob} setChangeOrderDraft={setChangeOrderDraft} setQuoteDraft={setQuoteDraft} submitCommercialDraft={submitCommercialDraft} submitting={submitting} updateCommercialLineItem={updateCommercialLineItem} />
</DeferredActionDialog>
      ) : null}

      {commercialAcceptance ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{ot('Record client acceptance')}</>} onClose={closeCommercialDialog}>
<CommercialAcceptanceModalDialog closeCommercialDialog={closeCommercialDialog} commercialAcceptance={commercialAcceptance} commercialAcceptanceDraft={commercialAcceptanceDraft} ot={ot} setCommercialAcceptanceDraft={setCommercialAcceptanceDraft} submitCommercialAcceptance={submitCommercialAcceptance} submitting={submitting} />
</DeferredActionDialog>
      ) : null}

      {commercialDelivery ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{ot('Record change-order delivery')}</>} onClose={closeCommercialDialog}>
<CommercialDeliveryModalDialog closeCommercialDialog={closeCommercialDialog} commercialDelivery={commercialDelivery} commercialDeliveryDraft={commercialDeliveryDraft} ot={ot} setCommercialDeliveryDraft={setCommercialDeliveryDraft} submitChangeOrderDelivery={submitChangeOrderDelivery} submitting={submitting} />
</DeferredActionDialog>
      ) : null}

      {taskAction ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{formatStatus(taskAction.status)} task</>} onClose={() => {
                  setTaskAction(null)
                  setTaskActionNote('')
                }}>
<TaskActionModalDialog setTaskAction={setTaskAction} setTaskActionNote={setTaskActionNote} submitTaskTransition={submitTaskTransition} submitting={submitting} taskAction={taskAction} taskActionNote={taskActionNote} />
</DeferredActionDialog>
      ) : null}
      {opportunityEditor && canCoordinate ? (
        <Suspense fallback={<div className="modal-backdrop opportunity-backdrop" role="presentation">
          <section className="modal opportunity-modal" role="dialog" aria-modal="true" aria-label={ot('Loading opportunity editor')}>
            <div className="modal-heading"><p role="status"><LoaderCircle className="spin" size={16} /> {ot('Loading opportunity editor')}</p>
              <button type="button" className="icon-button" aria-label="Close opportunity" disabled={submitting} onClick={closeOpportunityEditor}><X size={18} /></button>
            </div>
          </section>
        </div>}>
          <OpportunityEditor key={outboxScope + ':' + opportunityEditor.mode + ':' + (opportunityEditor.opportunity?.id || 'new')} editor={opportunityEditor} scope={outboxScope} enabled={draftRecoveryEnabled}
            api={api} ot={ot} submitting={submitting} error={error} onClose={closeOpportunityEditor} onSave={submitOpportunity} />
        </Suspense>
      ) : null}

      {opportunityActivity ? (
        <DeferredActionDialog locale={operatorLocale} title={<>Add pipeline activity</>} onClose={() => setOpportunityActivity(null)}>
<OpportunityActivityModalDialog opportunityActivity={opportunityActivity} opportunityActivityDraft={opportunityActivityDraft} setOpportunityActivity={setOpportunityActivity} setOpportunityActivityDraft={setOpportunityActivityDraft} submitOpportunityActivity={submitOpportunityActivity} submitting={submitting} />
</DeferredActionDialog>
      ) : null}

      {bidPackageEditor ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{ot('New bid package')}</>} onClose={() => setBidPackageEditor(false)}>
<BidPackageModalDialog bidPackageDraft={bidPackageDraft} data={data} ot={ot} setBidPackageDraft={setBidPackageDraft} setBidPackageEditor={setBidPackageEditor} submitBidPackage={submitBidPackage} submitting={submitting} />
</DeferredActionDialog>
      ) : null}

      {bidPackageAction?.type === 'return' ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{ot('Record bid return')}</>} onClose={() => setBidPackageAction(null)}>
<BidReturnModalDialog bidPackageAction={bidPackageAction} bidReturnDraft={bidReturnDraft} ot={ot} setBidPackageAction={setBidPackageAction} setBidReturnDraft={setBidReturnDraft} submitBidReturn={submitBidReturn} submitting={submitting} />
</DeferredActionDialog>
      ) : null}

      {bidPackageAction?.type === 'selection' ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{ot('Request preferred-bidder approval')}</>} onClose={() => setBidPackageAction(null)}>
<BidSelectionModalDialog bidPackageAction={bidPackageAction} bidSelectionRationale={bidSelectionRationale} ot={ot} setBidPackageAction={setBidPackageAction} setBidSelectionRationale={setBidSelectionRationale} submitBidSelection={submitBidSelection} submitting={submitting} />
</DeferredActionDialog>
      ) : null}

      {bidPackageAction?.type === 'commitment' ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{ot('Prepare purchasing commitment')}</>} onClose={() => setBidPackageAction(null)}>
<BidCommitmentModalDialog bidCommitmentDraft={bidCommitmentDraft} bidPackageAction={bidPackageAction} ot={ot} setBidCommitmentDraft={setBidCommitmentDraft} setBidPackageAction={setBidPackageAction} submitBidCommitment={submitBidCommitment} submitting={submitting} />
</DeferredActionDialog>
      ) : null}

      {bidPackageAction?.type === 'order_package' ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{ot('Prepare purchase-order package')}</>} onClose={() => setBidPackageAction(null)}>
<BidOrderPackageModalDialog bidOrderDraft={bidOrderDraft} bidPackageAction={bidPackageAction} ot={ot} setBidOrderDraft={setBidOrderDraft} setBidPackageAction={setBidPackageAction} submitBidOrderPackage={submitBidOrderPackage} submitting={submitting} />
</DeferredActionDialog>
      ) : null}

      {bidPackageAction?.type === 'order_delivery' ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{ot('Record provider receipt')}</>} onClose={() => setBidPackageAction(null)}>
<BidOrderDeliveryModalDialog bidOrderDeliveryDraft={bidOrderDeliveryDraft} bidPackageAction={bidPackageAction} ot={ot} setBidOrderDeliveryDraft={setBidOrderDeliveryDraft} setBidPackageAction={setBidPackageAction} submitBidOrderDelivery={submitBidOrderDelivery} submitting={submitting} />
</DeferredActionDialog>
      ) : null}

      {bidPackageAction?.type === 'add_participants' ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{ot('Add internal bidders')}</>} onClose={() => setBidPackageAction(null)}>
<BidAddParticipantsModalDialog bidAddPartnerIds={bidAddPartnerIds} bidPackageAction={bidPackageAction} data={data} ot={ot} setBidAddPartnerIds={setBidAddPartnerIds} setBidPackageAction={setBidPackageAction} submitBidParticipants={submitBidParticipants} submitting={submitting} />
</DeferredActionDialog>
      ) : null}

      {canCoordinate ? (
        <IntakeDialog key={outboxScope} open={showIntake} scope={outboxScope} enabled={draftRecoveryEnabled}
          submitting={submitting} onClose={() => setShowIntake(false)} onSave={createIntake}
          onCreated={() => { setShowIntake(false); void refresh() }} />
      ) : null}
      {materialReceiptEditor ? (
        <DeferredActionDialog locale={operatorLocale} title={<>Record material delivery</>} onClose={closeMaterialReceiptEditor}>
<MaterialReceiptModalDialog activeJobs={activeJobs} closeMaterialReceiptEditor={closeMaterialReceiptEditor} emptyMaterialReceiptLine={emptyMaterialReceiptLine} materialReceiptDraft={materialReceiptDraft} saveMaterialReceipt={saveMaterialReceipt} setMaterialReceiptDraft={setMaterialReceiptDraft} submitting={submitting} />
</DeferredActionDialog>
      ) : null}
      {materialReceiptReversal ? (
        <DeferredActionDialog locale={operatorLocale} title={<>Request receipt reversal</>} onClose={() => setMaterialReceiptReversal(null)}>
<MaterialReceiptReversalDialog materialReceiptReversal={materialReceiptReversal} materialReceiptReversalReason={materialReceiptReversalReason} requestMaterialReceiptReversal={requestMaterialReceiptReversal} setMaterialReceiptReversal={setMaterialReceiptReversal} setMaterialReceiptReversalReason={setMaterialReceiptReversalReason} submitting={submitting} />
</DeferredActionDialog>
      ) : null}
      {resourceAction ? (
        <DialogBoundary locale={operatorLocale} title={resourceAction.label} onClose={closeResourceControl}>
        <Suspense fallback={<DialogLoading locale={operatorLocale} title={resourceAction.label} onClose={closeResourceControl} />}>
          <ResourceActionDialog
            resourceAction={resourceAction}
            resourceActionDraft={resourceActionDraft}
            closeResourceControl={closeResourceControl}
            submitResourceControl={submitResourceControl}
            setResourceActionDraft={setResourceActionDraft}
            tradePartners={tradePartners}
            openTradePartnerDirectory={openTradePartnerDirectory}
            submitting={submitting}
            ot={ot}
          />
        </Suspense>
        </DialogBoundary>
      ) : null}
      {invoiceJob ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{invoiceJob.billingMilestone ? 'Draft milestone invoice' : 'Draft invoice'}</>} onClose={closeInvoiceDraft}>
<InvoiceDraftModalDialog closeInvoiceDraft={closeInvoiceDraft} createInvoiceDraft={createInvoiceDraft} invoiceAmount={invoiceAmount} invoiceDraft={invoiceDraft} invoiceJob={invoiceJob} invoiceTaxAmount={invoiceTaxAmount} invoiceTotal={invoiceTotal} setInvoiceDraft={setInvoiceDraft} submitting={submitting} />
</DeferredActionDialog>
      ) : null}
      {clientAction ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{clientAction.label}</>} onClose={closeClientLifecycle}>
<ClientLifecycleModalDialog clientAction={clientAction} clientActionNotes={clientActionNotes} clientActionOption={clientActionOption} clientActionReference={clientActionReference} closeClientLifecycle={closeClientLifecycle} ot={ot} setClientActionNotes={setClientActionNotes} setClientActionOption={setClientActionOption} setClientActionReference={setClientActionReference} submitClientLifecycle={submitClientLifecycle} submitting={submitting} />
</DeferredActionDialog>
      ) : null}
      {financeOrderDelivery ? (
        <DeferredActionDialog locale={operatorLocale} title={<>Record provider receipt</>} onClose={closeFinanceOrderDelivery}>
<FinanceOrderDeliveryModalDialog closeFinanceOrderDelivery={closeFinanceOrderDelivery} financeOrderDelivery={financeOrderDelivery} financeOrderDeliveryDraft={financeOrderDeliveryDraft} ot={ot} setFinanceOrderDeliveryDraft={setFinanceOrderDeliveryDraft} submitFinanceOrderDelivery={submitFinanceOrderDelivery} submitting={submitting} />
</DeferredActionDialog>
      ) : null}
      {environmentalReversal ? (
        <DeferredActionDialog locale={operatorLocale} title={<>Reverse environmental activity</>} onClose={() => {
                setEnvironmentalReversal(null)
                setEnvironmentalReversalReason('')
              }}>
<EnvironmentalReversalModalDialog environmentalReversal={environmentalReversal} environmentalReversalReason={environmentalReversalReason} setEnvironmentalReversal={setEnvironmentalReversal} setEnvironmentalReversalReason={setEnvironmentalReversalReason} submitEnvironmentalReversal={submitEnvironmentalReversal} submitting={submitting} />
</DeferredActionDialog>
      ) : null}
      {financeAction ? (
        <DialogBoundary locale={operatorLocale} title={financeAction.label} onClose={closeFinanceControl}>
        <Suspense fallback={<DialogLoading locale={operatorLocale} title={financeAction.label} onClose={closeFinanceControl} />}>
          <FinanceActionDialog
            financeAction={financeAction}
            closeFinanceControl={closeFinanceControl}
            submitFinanceControl={submitFinanceControl}
            financeActionDraft={financeActionDraft}
            setFinanceActionDraft={setFinanceActionDraft}
            financeCreditTaxRate={financeCreditTaxRate}
            financeControlAmount={financeControlAmount}
            financeCreditTax={financeCreditTax}
            financeCreditTotal={financeCreditTotal}
            financeSupplierTax={financeSupplierTax}
            financeSupplierTotal={financeSupplierTotal}
            financeControlHours={financeControlHours}
            workers={workers}
            financeControlExpense={financeControlExpense}
            roundMoney={roundMoney}
            submitting={submitting}
          />
        </Suspense>
        </DialogBoundary>
      ) : null}
      {fieldAction ? (
        <DeferredActionDialog locale={operatorLocale} title={<>{fieldAction.label}</>} onClose={closeFieldReview}>
<FieldAssuranceModalDialog closeFieldReview={closeFieldReview} fieldAction={fieldAction} fieldActionDate={fieldActionDate} fieldActionNotes={fieldActionNotes} fieldActionReference={fieldActionReference} ot={ot} setFieldActionDate={setFieldActionDate} setFieldActionNotes={setFieldActionNotes} setFieldActionReference={setFieldActionReference} submitFieldReview={submitFieldReview} submitting={submitting} />
</DeferredActionDialog>
      ) : null}
      {automationControlDialog ? (
        <Suspense fallback={null}>
          <AutomationSafetyDialog
            suspend={automationControlDialog.suspend}
            control={automationControl}
            busy={submitting}
            error={automationControlError}
            onClose={closeAutomationControlDialog}
            onSubmit={changeAutomationControl}
            locale={operatorLocale}
          />
        </Suspense>
      ) : null}
      {qaResetDialog ? (
        <Suspense fallback={null}>
          <QaResetDialog
            plan={qaResetDialog.plan}
            loading={qaResetDialog.loading}
            busy={submitting}
            error={qaResetError}
            onClose={closeQaResetDialog}
            onReload={loadQaResetPreview}
            onSubmit={resetQa}
            locale={operatorLocale}
          />
        </Suspense>
      ) : null}
      {showResourcePlanner && selectedJob ? (
        <DeferredActionDialog locale={operatorLocale} title={<>Crew and equipment</>} onClose={() => setShowResourcePlanner(false)}>
<ResourcePlannerDialog assignWorker={assignWorker} releaseAssignment={releaseAssignment} releaseToolReservation={releaseToolReservation} reserveTool={reserveTool} resourceDraft={resourceDraft} resourceOptions={resourceOptions} scheduleDraft={scheduleDraft} selectedJob={selectedJob} setResourceDraft={setResourceDraft} setShowResourcePlanner={setShowResourcePlanner} submitting={submitting} />
</DeferredActionDialog>
      ) : null}
      {mobileNavOpen ? <button className="nav-scrim" aria-label="Close navigation overlay" onClick={() => setMobileNavOpen(false)} /> : null}
    </div>
  )
}

export default App
