import './JobWorkspaceControls.css'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { companyApiUrl } from '../company-request.mjs'
import { Check, ChevronRight, ClipboardList, ClipboardPenLine, FileDown, GitBranch, MailCheck, Plus, ReceiptEuro, ShieldCheck, TriangleAlert, X } from 'lucide-react'
import { currency, EMPTY_LIST, formatDate, formatDateTime, formatStatus } from '../dashboard-format'
import { operatorText } from '../operator-locale'
import { pricingModelLabel, rateMoney } from './job-pricing-display.mjs'



const ClientDateCommitmentsControl = lazy(() => import('./ClientDateCommitmentsControl'))

const FALLBACK_PRICING_BASIS_FACTORS = [
  { key: 'scope_defined', label: 'Scope is fully defined', weight: 15, critical: true },
  { key: 'design_complete', label: 'Design information is complete', weight: 10, critical: true },
  { key: 'quantities_verifiable', label: 'Quantities can be verified', weight: 15, critical: true },
  { key: 'site_conditions_known', label: 'Site conditions are known', weight: 15, critical: true },
  { key: 'selections_locked', label: 'Client selections are locked', weight: 10, critical: false },
  { key: 'productivity_predictable', label: 'Productivity is predictable', weight: 10, critical: false },
  { key: 'schedule_constraints_defined', label: 'Schedule constraints are defined', weight: 5, critical: false },
  { key: 'price_exposure_controlled', label: 'Supplier and price exposure is controlled', weight: 10, critical: false },
  { key: 'change_risk_low', label: 'Change risk is low', weight: 10, critical: false },
]

function commercialScopeDraft(job = {}, commercialScope = {}) {
  const snapshot = commercialScope.currentRevision?.snapshot || commercialScope.latestRevision?.snapshot || {}
  return {
    title: snapshot.title || `${job.title || 'Project'} scope schedule`,
    scopeSummary: snapshot.scopeSummary || job.description || '',
    inclusions: (snapshot.inclusions || EMPTY_LIST).join('\n'),
    assumptions: (snapshot.assumptions || EMPTY_LIST).join('\n'),
    exclusions: (snapshot.exclusions || EMPTY_LIST).join('\n'),
    clientResponsibilities: (snapshot.clientResponsibilities || EMPTY_LIST).join('\n'),
    contractorResponsibilities: (snapshot.contractorResponsibilities || EMPTY_LIST).join('\n'),
    allowanceMode: snapshot.allowanceMode || 'none',
    noAllowanceReason: snapshot.noAllowanceReason || 'No provisional sums or selection allowances are included in this revision.',
    clarificationDeadline: snapshot.clarificationDeadline ? String(snapshot.clarificationDeadline).slice(0, 10) : '',
    allowances: (snapshot.allowances || EMPTY_LIST).map((allowance) => ({
      allowanceKey: allowance.allowanceKey || '',
      allowanceType: allowance.allowanceType || 'selection_allowance',
      title: allowance.title || '',
      description: allowance.description || '',
      quantity: String(allowance.quantity ?? 1),
      unit: allowance.unit || 'item',
      unitRate: String(allowance.unitRate ?? ''),
      reconciliationMethod: allowance.reconciliationMethod || 'actual_cost_variation',
      selectionBy: allowance.selectionBy || 'client',
      dueAt: allowance.dueAt ? String(allowance.dueAt).slice(0, 10) : '',
      evidenceReference: allowance.evidenceReference || '',
      notes: allowance.notes || '',
    })),
    reason: commercialScope.currentRevision ? '' : 'Establish the initial written commercial scope schedule.',
  }
}

function scopeLines(value) {
  return String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

function emptyScopeAllowance(index = 0) {
  return {
    allowanceKey: `ALLOW-${String(index + 1).padStart(2, '0')}`,
    allowanceType: 'selection_allowance',
    title: '',
    description: '',
    quantity: '1',
    unit: 'item',
    unitRate: '',
    reconciliationMethod: 'actual_cost_variation',
    selectionBy: 'client',
    dueAt: '',
    evidenceReference: '',
    notes: '',
  }
}

function emptyProjectRisk(index = 0) {
  return {
    riskKey: `RISK-${String(index + 1).padStart(2, '0')}`,
    category: 'schedule',
    title: '',
    cause: '',
    event: '',
    consequence: '',
    owner: '',
    probability: '3',
    impact: '3',
    responseStrategy: 'mitigate',
    mitigationAction: '',
    contingencyAction: '',
    trigger: '',
    dueAt: '',
    residualProbability: '2',
    residualImpact: '2',
    costExposureAmount: '0',
    scheduleExposureDays: '0',
    status: 'open',
    acceptanceReason: '',
    evidenceReference: '',
    failureMode: '',
    earlyWarning: '',
    prevention: '',
  }
}

function projectRiskDraft(job = {}, register = {}) {
  const snapshot = register.currentRevision?.snapshot || register.latestRevision?.snapshot || {}
  const failureModes = snapshot.premortem?.failureModes || EMPTY_LIST
  const risks = (snapshot.risks || EMPTY_LIST).map((risk) => {
    const failureMode = failureModes.find((item) => item.riskKey === risk.riskKey) || {}
    return {
      ...emptyProjectRisk(),
      ...risk,
      probability: String(risk.probability ?? 3),
      impact: String(risk.impact ?? 3),
      residualProbability: String(risk.residualProbability ?? 2),
      residualImpact: String(risk.residualImpact ?? 2),
      costExposureAmount: String(risk.costExposureAmount ?? 0),
      scheduleExposureDays: String(risk.scheduleExposureDays ?? 0),
      dueAt: risk.dueAt ? String(risk.dueAt).slice(0, 10) : '',
      acceptanceReason: risk.acceptanceReason || '',
      evidenceReference: risk.evidenceReference || '',
      failureMode: failureMode.failureMode || '',
      earlyWarning: failureMode.earlyWarning || '',
      prevention: failureMode.prevention || '',
    }
  })
  return {
    title: snapshot.title || `${job.title || 'Project'} risk register`,
    workshopDate: snapshot.premortem?.workshopDate ? String(snapshot.premortem.workshopDate).slice(0, 10) : new Date().toISOString().slice(0, 10),
    failureStatement: snapshot.premortem?.failureStatement || '',
    facilitator: snapshot.premortem?.facilitator || '',
    participants: (snapshot.premortem?.participants || EMPTY_LIST).join('\n'),
    risks: risks.length ? risks : [emptyProjectRisk()],
    reason: register.currentRevision ? '' : 'Retain the initial project risk register and premortem before pricing.',
  }
}

function projectRiskScore(risk, residual = false) {
  const probability = Number(residual ? risk.residualProbability : risk.probability) || 0
  const impact = Number(residual ? risk.residualImpact : risk.impact) || 0
  return probability * impact
}

function projectRiskBand(score) {
  if (score >= 20) return 'critical'
  if (score >= 15) return 'high'
  if (score >= 8) return 'medium'
  return 'low'
}

function pricingBasisDraft(pricingBasis = {}) {
  const definitions = pricingBasis.factors?.length ? pricingBasis.factors : FALLBACK_PRICING_BASIS_FACTORS
  const retained = pricingBasis.currentDecision?.snapshot?.factors || EMPTY_LIST
  return {
    selectedModel: pricingBasis.currentDecision?.selectedModel || 'fixed_price',
    rationale: pricingBasis.currentDecision?.snapshot?.rationale || '',
    overrideReason: '',
    factors: definitions.map((definition) => {
      const current = retained.find((factor) => factor.key === definition.key)
      return {
        ...definition,
        status: current?.status || 'unknown',
        evidence: current?.evidence || '',
      }
    }),
  }
}

function pricingBasisPreview(factors = EMPTY_LIST) {
  const blockers = factors.filter((factor) => factor.critical && factor.status === 'no')
  const evidenceGaps = factors.filter((factor) => factor.status === 'unknown')
  const score = factors.reduce((sum, factor) => sum + (factor.status === 'yes' ? Number(factor.weight || 0) : 0), 0)
  const recommendation = evidenceGaps.length
    ? 'review'
    : blockers.length
      ? 'time_and_materials'
      : score >= 75
        ? 'fixed_price'
        : 'time_and_materials'
  return { blockers, evidenceGaps, score, recommendation }
}

function CommercialControl({
  job,
  api,
  locale,
  canCoordinate,
  canApprove,
  submitting,
  onNewQuote,
  onNewChangeOrder,
  onRequestAcceptance,
  onPrepareVariationImplementation,
  onRecordChangeDelivery,
  onOpenApprovals,
  onRequestCommercialScope,
  onRequestRiskRegister,
  onRetainPricingBasis,
}) {
  const t = (key, variables = {}) => operatorText(locale, key, variables)
  const quotes = job.quotes || EMPTY_LIST
  const changeOrders = job.changeOrders || EMPTY_LIST
  const commercialScope = useMemo(() => job.commercialScope || {}, [job.commercialScope])
  const currentScope = commercialScope.currentRevision || null
  const pendingScope = commercialScope.pendingRevision || null
  const commercialScopeReady = Boolean(currentScope && commercialScope.stale !== true)
  const pricingBasis = useMemo(() => job.pricingBasis || {}, [job.pricingBasis])
  const currentPricingBasis = pricingBasis.currentDecision || null
  const pricingBasisReady = Boolean(currentPricingBasis && pricingBasis.stale !== true)
  const pendingApprovals = job.approvals?.filter((approval) => approval.status === 'pending') || EMPTY_LIST
  const pendingFor = (targetType, targetId) =>
    pendingApprovals.find((approval) => approval.targetType === targetType && approval.targetId === targetId)
  const pendingScopeApproval = pendingScope ? pendingFor('commercial_scope', pendingScope.id) : null
  const riskRegister = useMemo(() => job.riskRegister || {}, [job.riskRegister])
  const currentRiskRegister = riskRegister.currentRevision || null
  const pendingRiskRegister = riskRegister.pendingRevision || null
  const riskRegisterReady = Boolean(currentRiskRegister && riskRegister.stale !== true)
  const pendingRiskApproval = pendingRiskRegister ? pendingFor('risk_register', pendingRiskRegister.id) : null
  const acceptedQuote = quotes.find((quote) => quote.status === 'accepted')
  const acceptedChanges = changeOrders.filter((changeOrder) => changeOrder.status === 'accepted')
  const acceptedChangeNet = acceptedChanges.reduce((sum, changeOrder) => sum + Number(changeOrder.amount || 0), 0)
  const commercialCurrency = acceptedQuote?.currency || quotes[0]?.currency || 'EUR'
  const acceptedPricingModel = acceptedQuote?.pricingModel || job.data?.commercialPricingModel || null
  const [editingCommercialScope, setEditingCommercialScope] = useState(false)
  const [scopeDraft, setScopeDraft] = useState(() => commercialScopeDraft(job, commercialScope))
  const [editingRiskRegister, setEditingRiskRegister] = useState(false)
  const [riskDraft, setRiskDraft] = useState(() => projectRiskDraft(job, riskRegister))
  const [editingPricingBasis, setEditingPricingBasis] = useState(false)
  const [pricingDraft, setPricingDraft] = useState(() => pricingBasisDraft(pricingBasis))
  const [editingImplementationFor, setEditingImplementationFor] = useState(null)
  const [implementationDraft, setImplementationDraft] = useState({ entryKey: '', tasks: [] })
  const pricingPreview = useMemo(() => pricingBasisPreview(pricingDraft.factors), [pricingDraft.factors])
  const pricingOverride = pricingDraft.selectedModel !== pricingPreview.recommendation
  const pricingDraftReady = pricingDraft.factors.length > 0
    && pricingDraft.factors.every((factor) => ['yes', 'no', 'unknown'].includes(factor.status) && factor.evidence.trim().length >= 8)
    && ['fixed_price', 'time_and_materials'].includes(pricingDraft.selectedModel)
    && pricingDraft.rationale.trim().length >= 8
    && (!pricingOverride || pricingDraft.overrideReason.trim().length >= 12)
  const riskDraftReady = riskDraft.title.trim().length >= 3
    && riskDraft.workshopDate
    && riskDraft.failureStatement.trim().length >= 12
    && riskDraft.facilitator.trim().length >= 2
    && scopeLines(riskDraft.participants).length > 0
    && riskDraft.reason.trim().length >= 8
    && riskDraft.risks.length > 0
    && riskDraft.risks.every((risk) => {
      const residualScore = projectRiskScore(risk, true)
      return risk.riskKey.trim().length > 0
        && risk.title.trim().length >= 3
        && risk.cause.trim().length >= 8
        && risk.event.trim().length >= 8
        && risk.consequence.trim().length >= 8
        && risk.owner.trim().length >= 2
        && risk.mitigationAction.trim().length >= 8
        && risk.contingencyAction.trim().length >= 8
        && risk.trigger.trim().length >= 8
        && risk.failureMode.trim().length >= 8
        && risk.earlyWarning.trim().length >= 8
        && risk.prevention.trim().length >= 8
        && (residualScore < 15 || risk.acceptanceReason.trim().length >= 8)
    })
  const scopeAllowanceTotal = scopeDraft.allowances.reduce((sum, allowance) => {
    const quantity = Number(allowance.quantity)
    const unitRate = Number(allowance.unitRate)
    return sum + (Number.isFinite(quantity) && Number.isFinite(unitRate) ? quantity * unitRate : 0)
  }, 0)
  const scopeDraftReady = scopeDraft.title.trim().length >= 3
    && scopeDraft.scopeSummary.trim().length >= 12
    && scopeLines(scopeDraft.inclusions).length > 0
    && scopeLines(scopeDraft.assumptions).length > 0
    && scopeLines(scopeDraft.exclusions).length > 0
    && scopeDraft.reason.trim().length >= 8
    && (scopeDraft.allowanceMode === 'none'
      ? scopeDraft.noAllowanceReason.trim().length >= 8 && scopeDraft.allowances.length === 0
      : scopeDraft.allowances.length > 0 && scopeDraft.allowances.every((allowance) => (
        allowance.allowanceKey.trim().length > 0
        && allowance.title.trim().length >= 3
        && allowance.description.trim().length >= 3
        && Number(allowance.quantity) > 0
        && Number(allowance.unitRate) >= 0
        && allowance.unit.trim().length > 0
      )))

  useEffect(() => {
    if (!editingCommercialScope) setScopeDraft(commercialScopeDraft(job, commercialScope))
  }, [editingCommercialScope, job, commercialScope, currentScope?.id, pendingScope?.id])

  useEffect(() => {
    if (!editingPricingBasis) setPricingDraft(pricingBasisDraft(pricingBasis))
  }, [editingPricingBasis, job.id, currentPricingBasis?.id, pricingBasis, pricingBasis.stale])

  useEffect(() => {
    if (!editingRiskRegister) setRiskDraft(projectRiskDraft(job, riskRegister))
  }, [editingRiskRegister, job, riskRegister, currentRiskRegister?.id, pendingRiskRegister?.id])

  function openCommercialScopeEditor() {
    setScopeDraft(commercialScopeDraft(job, commercialScope))
    setEditingCommercialScope(true)
  }

  function openVariationImplementation(changeOrder) {
    setImplementationDraft({
      entryKey: `variation-implementation-${changeOrder.id}-${globalThis.crypto?.randomUUID?.() || Date.now()}`,
      tasks: [{ title: t('Implementation: {title}', { title: changeOrder.title }).slice(0, 180), description: changeOrder.scopeDelta || '', durationHours: '', materials: [] }],
    })
    setEditingImplementationFor(changeOrder.id)
  }

  function updateImplementationTask(taskIndex, patch) {
    setImplementationDraft((current) => ({
      ...current,
      tasks: current.tasks.map((task, index) => index === taskIndex ? { ...task, ...patch } : task),
    }))
  }

  function updateImplementationMaterial(taskIndex, materialIndex, patch) {
    setImplementationDraft((current) => ({
      ...current,
      tasks: current.tasks.map((task, index) => index === taskIndex ? {
        ...task,
        materials: task.materials.map((material, index) => index === materialIndex ? { ...material, ...patch } : material),
      } : task),
    }))
  }

  async function submitVariationImplementation(event, changeOrder) {
    event.preventDefault()
    const result = await onPrepareVariationImplementation(changeOrder, implementationDraft)
    if (result) setEditingImplementationFor(null)
  }

  function updateScopeAllowance(index, patch) {
    setScopeDraft((current) => ({
      ...current,
      allowances: current.allowances.map((allowance, allowanceIndex) => allowanceIndex === index ? { ...allowance, ...patch } : allowance),
    }))
  }

  async function submitCommercialScope(event) {
    event.preventDefault()
    if (!scopeDraftReady) return
    const result = await onRequestCommercialScope({
      entryKey: `commercial-scope:${job.id}:${Date.now()}`,
      title: scopeDraft.title.trim(),
      scopeSummary: scopeDraft.scopeSummary.trim(),
      inclusions: scopeLines(scopeDraft.inclusions),
      assumptions: scopeLines(scopeDraft.assumptions),
      exclusions: scopeLines(scopeDraft.exclusions),
      clientResponsibilities: scopeLines(scopeDraft.clientResponsibilities),
      contractorResponsibilities: scopeLines(scopeDraft.contractorResponsibilities),
      currency: 'EUR',
      allowanceMode: scopeDraft.allowanceMode,
      noAllowanceReason: scopeDraft.allowanceMode === 'none' ? scopeDraft.noAllowanceReason.trim() : null,
      clarificationDeadline: scopeDraft.clarificationDeadline || null,
      allowances: scopeDraft.allowanceMode === 'defined' ? scopeDraft.allowances.map((allowance) => ({
        allowanceKey: allowance.allowanceKey.trim(),
        allowanceType: allowance.allowanceType,
        title: allowance.title.trim(),
        description: allowance.description.trim(),
        quantity: Number(allowance.quantity),
        unit: allowance.unit.trim(),
        unitRate: Number(allowance.unitRate),
        reconciliationMethod: allowance.reconciliationMethod,
        selectionBy: allowance.selectionBy,
        dueAt: allowance.dueAt || null,
        evidenceReference: allowance.evidenceReference.trim() || null,
        notes: allowance.notes.trim() || null,
      })) : [],
      reason: scopeDraft.reason.trim(),
    })
    if (result) setEditingCommercialScope(false)
  }

  function openPricingBasisEditor() {
    setPricingDraft(pricingBasisDraft(pricingBasis))
    setEditingPricingBasis(true)
  }

  function updatePricingFactor(index, patch) {
    setPricingDraft((current) => ({
      ...current,
      factors: current.factors.map((factor, factorIndex) => factorIndex === index ? { ...factor, ...patch } : factor),
    }))
  }

  async function submitPricingBasis(event) {
    event.preventDefault()
    if (!pricingDraftReady) return
    const retained = await onRetainPricingBasis({
      entryKey: `pricing-basis:${job.id}:${Date.now()}`,
      commercialScopeRevisionId: currentScope?.id || null,
      riskRegisterRevisionId: currentRiskRegister?.id || null,
      selectedModel: pricingDraft.selectedModel,
      rationale: pricingDraft.rationale.trim(),
      overrideReason: pricingOverride ? pricingDraft.overrideReason.trim() : null,
      factors: pricingDraft.factors.map((factor) => ({
        key: factor.key,
        status: factor.status,
        evidence: factor.evidence.trim(),
      })),
    })
    if (retained) setEditingPricingBasis(false)
  }

  function updateProjectRisk(index, patch) {
    setRiskDraft((current) => ({
      ...current,
      risks: current.risks.map((risk, riskIndex) => riskIndex === index ? { ...risk, ...patch } : risk),
    }))
  }

  async function submitRiskRegister(event) {
    event.preventDefault()
    if (!riskDraftReady) return
    const result = await onRequestRiskRegister({
      entryKey: `risk-register:${job.id}:${Date.now()}`,
      commercialScopeRevisionId: currentScope?.id || null,
      title: riskDraft.title.trim(),
      currency: 'EUR',
      risks: riskDraft.risks.map((risk) => ({
        riskKey: risk.riskKey.trim().toUpperCase(),
        category: risk.category,
        title: risk.title.trim(),
        cause: risk.cause.trim(),
        event: risk.event.trim(),
        consequence: risk.consequence.trim(),
        owner: risk.owner.trim(),
        probability: Number(risk.probability),
        impact: Number(risk.impact),
        responseStrategy: risk.responseStrategy,
        mitigationAction: risk.mitigationAction.trim(),
        contingencyAction: risk.contingencyAction.trim(),
        trigger: risk.trigger.trim(),
        dueAt: risk.dueAt || null,
        residualProbability: Number(risk.residualProbability),
        residualImpact: Number(risk.residualImpact),
        costExposureAmount: Number(risk.costExposureAmount) || 0,
        scheduleExposureDays: Number(risk.scheduleExposureDays) || 0,
        status: risk.status,
        acceptanceReason: risk.acceptanceReason.trim() || null,
        evidenceReference: risk.evidenceReference.trim() || null,
      })),
      premortem: {
        workshopDate: riskDraft.workshopDate,
        failureStatement: riskDraft.failureStatement.trim(),
        facilitator: riskDraft.facilitator.trim(),
        participants: scopeLines(riskDraft.participants),
        failureModes: riskDraft.risks.map((risk) => ({
          riskKey: risk.riskKey.trim().toUpperCase(),
          failureMode: risk.failureMode.trim(),
          earlyWarning: risk.earlyWarning.trim(),
          prevention: risk.prevention.trim(),
        })),
      },
      reason: riskDraft.reason.trim(),
    })
    if (result) setEditingRiskRegister(false)
  }

  return (
    <section className="job-workspace-section commercial-control" data-testid="commercial-control">
      <div className="section-heading commercial-heading">
        <ReceiptEuro size={18} />
        <div>
          <h3>{t('Commercial control')}</h3>
          <p>{t('Separate internal approval from retained client acceptance before contract value changes.')}</p>
        </div>
      </div>
      <div className={`scope-definition-strip ${commercialScopeReady ? 'scope-definition-active' : 'scope-definition-missing'}`} data-testid="commercial-scope-control">
        <ClipboardList size={18} />
        <div className="scope-definition-copy">
          <div>
            <strong>{commercialScopeReady ? currentScope.title : pendingScope ? t('Commercial scope awaiting approval') : commercialScope.stale ? t('Commercial scope requires revision') : t('Commercial scope not retained')}</strong>
            {currentScope ? <span className="tag">v{currentScope.versionNumber}</span> : null}
            {pendingScope ? <span className="tag tag-amber">v{pendingScope.versionNumber} {t('pending')}</span> : null}
          </div>
          <span>
            {commercialScopeReady
              ? t('{inclusions} inclusions / {assumptions} assumptions / {exclusions} exclusions / {allowances} allowances totaling {total}', {
                  inclusions: currentScope.snapshot?.inclusions?.length || 0,
                  assumptions: currentScope.snapshot?.assumptions?.length || 0,
                  exclusions: currentScope.snapshot?.exclusions?.length || 0,
                  allowances: currentScope.snapshot?.allowances?.length || 0,
                  total: rateMoney(currentScope.allowanceTotal, currentScope.currency),
                })
              : pendingScope
                ? t('Pricing and quote approval remain blocked until an approver accepts this exact source-bound revision.')
                : t('Write the promised work, assumptions, exclusions, responsibilities, and allowance reconciliation before selecting a pricing model.')}
          </span>
        </div>
        {commercialScope.stale ? <span className="tag tag-amber">{t('Source changed')}</span> : commercialScopeReady ? <span className="tag tag-green">{t('Approved + current')}</span> : null}
        {pendingScopeApproval && canApprove ? (
          <button type="button" className="secondary-button" disabled={submitting} onClick={() => onOpenApprovals({ approvalId: pendingScopeApproval.id })}>
            <ShieldCheck size={14} />{t('Review scope')}
          </button>
        ) : canCoordinate ? (
          <button type="button" className="secondary-button" disabled={submitting || Boolean(pendingScope)} title={pendingScope ? t('Resolve the pending scope revision first') : currentScope ? t('Prepare a new source-bound revision') : t('Prepare the initial commercial scope')} onClick={openCommercialScopeEditor}>
            <ClipboardPenLine size={14} />{currentScope ? t('Revise scope') : t('Write scope')}
          </button>
        ) : null}
      </div>
      <div className={`project-risk-strip ${riskRegisterReady ? 'project-risk-active' : 'project-risk-missing'}`} data-testid="project-risk-register-control">
        <TriangleAlert size={18} />
        <div className="project-risk-copy">
          <div>
            <strong>{riskRegisterReady ? currentRiskRegister.title : pendingRiskRegister ? t('Project risk review awaiting approval') : riskRegister.stale ? t('Project risk review requires revision') : t('Project risk register not retained')}</strong>
            {currentRiskRegister ? <span className="tag">v{currentRiskRegister.versionNumber}</span> : null}
            {pendingRiskRegister ? <span className="tag tag-amber">v{pendingRiskRegister.versionNumber} {t('pending')}</span> : null}
          </div>
          <span>
            {riskRegisterReady
              ? t('{risks} risks / {high} high residual / {exposure} expected exposure / {modes} premortem modes', {
                  risks: currentRiskRegister.riskCount,
                  high: currentRiskRegister.highRiskCount,
                  exposure: rateMoney(currentRiskRegister.totalExpectedValue, currentRiskRegister.currency),
                  modes: currentRiskRegister.snapshot?.summary?.premortemFailureModeCount || 0,
                })
              : pendingRiskRegister
                ? t('Pricing and quote approval remain blocked until an approver verifies ownership, treatments, exposure, and premortem links.')
                : t('Run the premortem, identify causes, events, consequences, owners, triggers, treatments, and residual exposure before pricing.')}
          </span>
        </div>
        {riskRegister.stale ? <span className="tag tag-amber">{t('Source changed')}</span> : riskRegisterReady ? <span className="tag tag-green">{t('Approved + current')}</span> : null}
        {pendingRiskApproval && canApprove ? (
          <button type="button" className="secondary-button" disabled={submitting} onClick={() => onOpenApprovals({ approvalId: pendingRiskApproval.id })}>
            <ShieldCheck size={14} />{t('Review risks')}
          </button>
        ) : canCoordinate ? (
          <button type="button" className="secondary-button" disabled={submitting || !commercialScopeReady || Boolean(pendingRiskRegister)} title={!commercialScopeReady ? t('Approve the commercial scope first') : pendingRiskRegister ? t('Resolve the pending risk revision first') : t('Prepare a source-bound project risk review')} onClick={() => { setRiskDraft(projectRiskDraft(job, riskRegister)); setEditingRiskRegister(true) }}>
            <ClipboardPenLine size={14} />{currentRiskRegister ? t('Revise risks') : t('Run premortem')}
          </button>
        ) : null}
      </div>
      <div className={`pricing-basis-strip ${pricingBasisReady ? 'pricing-basis-active' : 'pricing-basis-missing'}`} data-testid="pricing-basis-control">
        <GitBranch size={18} />
        <div className="pricing-basis-copy">
          <div>
            <strong>{pricingBasisReady ? t(pricingModelLabel(currentPricingBasis.selectedModel)) : pricingBasis.stale ? t('Commercial basis requires reassessment') : t('Commercial pricing basis not retained')}</strong>
            {currentPricingBasis ? <span className="tag">v{currentPricingBasis.versionNumber}</span> : null}
            {currentPricingBasis?.snapshot?.override ? <span className="tag tag-amber">{t('Override')}</span> : null}
          </div>
          <span>
            {currentPricingBasis
              ? t('{score}% fixed-price readiness / recommendation {recommendation} / {rationale}', { score: currentPricingBasis.score, recommendation: t(pricingModelLabel(currentPricingBasis.recommendation)).toLowerCase(), rationale: currentPricingBasis.snapshot?.rationale || t('No rationale retained') })
              : t('No quote can enter approval until the current scope, quantities, site conditions, selections, productivity, schedule, price exposure, and change risk have been assessed.')}
          </span>
        </div>
        {pricingBasis.stale ? <span className="tag tag-amber">{t('Source changed')}</span> : pricingBasisReady ? <span className="tag tag-green">{t('Source current')}</span> : null}
        {canCoordinate ? (
          <button type="button" className="secondary-button" disabled={submitting || !commercialScopeReady || !riskRegisterReady} title={commercialScopeReady && riskRegisterReady ? t('Assess the current approved scope and project risk register') : t('Approve a current commercial scope and project risk register first')} onClick={openPricingBasisEditor}>
            <ClipboardPenLine size={14} />
            {currentPricingBasis ? t('Reassess') : t('Assess basis')}
          </button>
        ) : null}
      </div>
      <div className="commercial-summary" aria-label={t('Accepted commercial value')}>
        <div>
          <span>{acceptedPricingModel === 'time_and_materials' ? t('Recorded contract value') : t('Accepted contract net')}</span>
          <strong>{currency.format(job.contractValue || 0)}</strong>
        </div>
        <div>
          <span>{acceptedPricingModel === 'time_and_materials' ? t('Accepted T&M budget') : t('Accepted quote')}</span>
          <strong>{acceptedQuote ? currency.format(acceptedQuote.subtotal || 0) : t('Not retained')}</strong>
        </div>
        <div>
          <span>{t('Accepted changes')}</span>
          <strong>{currency.format(acceptedChangeNet)}</strong>
        </div>
        <div>
          <span>{t('Pending decisions')}</span>
          <strong>
            {
              pendingApprovals.filter((approval) =>
                ['quote', 'quote_acceptance', 'change_order', 'change_order_acceptance'].includes(approval.targetType),
              ).length
            }
          </strong>
        </div>
      </div>
      {canCoordinate ? (
        <div className="commercial-actions">
          <button type="button" className="secondary-button" disabled={submitting || !commercialScopeReady || !riskRegisterReady || !pricingBasisReady} title={commercialScopeReady && riskRegisterReady && pricingBasisReady ? t('Create a {model} estimate', { model: t(pricingModelLabel(currentPricingBasis.selectedModel)).toLowerCase() }) : t('Approve current scope and risk revisions and retain a current pricing-basis decision first')} onClick={onNewQuote}>
            <Plus size={15} />
            {t('New estimate')}
          </button>
          <button type="button" className="secondary-button" disabled={submitting} onClick={onNewChangeOrder}>
            <Plus size={15} />
            {t('Scope change')}
          </button>
        </div>
      ) : null}
      {editingCommercialScope ? (
        <div className="modal-backdrop commercial-scope-backdrop" role="presentation">
          <form className="modal commercial-scope-modal" role="dialog" aria-modal="true" aria-labelledby="commercial-scope-title" data-testid="commercial-scope-form" onSubmit={submitCommercialScope}>
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{t('Approval-gated contract schedule')}</p>
                <h2 id="commercial-scope-title">{t('Scope, assumptions, exclusions, and allowances')}</h2>
                <p>{job.title} / {t('source-bound revision {version}', { version: Number(currentScope?.versionNumber || 0) + 1 })}</p>
              </div>
              <button type="button" className="icon-button" aria-label={t('Close commercial scope')} onClick={() => setEditingCommercialScope(false)}><X size={17} /></button>
            </div>
            <div className="commercial-scope-body">
              <div className="commercial-scope-overview">
                <label>{t('Schedule title')}<input required minLength="3" maxLength="160" value={scopeDraft.title} onChange={(event) => setScopeDraft({ ...scopeDraft, title: event.target.value })} /></label>
                <label>{t('Clarification deadline')}<input type="date" value={scopeDraft.clarificationDeadline} onChange={(event) => setScopeDraft({ ...scopeDraft, clarificationDeadline: event.target.value })} /></label>
                <label className="scope-wide">{t('Scope summary')}<textarea required minLength="12" maxLength="4000" rows={4} value={scopeDraft.scopeSummary} onChange={(event) => setScopeDraft({ ...scopeDraft, scopeSummary: event.target.value })} placeholder={t('Describe the complete work boundary and intended outcome.')} /></label>
              </div>
              <div className="commercial-scope-lists">
                <label>{t('Included work')}<textarea required rows={6} value={scopeDraft.inclusions} onChange={(event) => setScopeDraft({ ...scopeDraft, inclusions: event.target.value })} placeholder={t('One explicit inclusion per line')} /></label>
                <label>{t('Assumptions')}<textarea required rows={6} value={scopeDraft.assumptions} onChange={(event) => setScopeDraft({ ...scopeDraft, assumptions: event.target.value })} placeholder={t('One estimating or delivery assumption per line')} /></label>
                <label>{t('Exclusions')}<textarea required rows={6} value={scopeDraft.exclusions} onChange={(event) => setScopeDraft({ ...scopeDraft, exclusions: event.target.value })} placeholder={t('One explicit exclusion per line')} /></label>
                <label>{t('Client responsibilities')}<textarea rows={6} value={scopeDraft.clientResponsibilities} onChange={(event) => setScopeDraft({ ...scopeDraft, clientResponsibilities: event.target.value })} placeholder={t('Access, selections, utilities, approvals, or enabling work')} /></label>
                <label>{t('Contractor responsibilities')}<textarea rows={6} value={scopeDraft.contractorResponsibilities} onChange={(event) => setScopeDraft({ ...scopeDraft, contractorResponsibilities: event.target.value })} placeholder={t('Protection, coordination, cleanup, evidence, or handover')} /></label>
              </div>
              <fieldset className="pricing-model-fieldset scope-allowance-mode">
                <legend>{t('Allowance treatment')}</legend>
                <div className="pricing-model-options">
                  <label className={scopeDraft.allowanceMode === 'none' ? 'selected' : ''}><input type="radio" name="scope-allowance-mode" value="none" checked={scopeDraft.allowanceMode === 'none'} onChange={() => setScopeDraft({ ...scopeDraft, allowanceMode: 'none', allowances: [] })} /><span>{t('No allowances')}</span></label>
                  <label className={scopeDraft.allowanceMode === 'defined' ? 'selected' : ''}><input type="radio" name="scope-allowance-mode" value="defined" checked={scopeDraft.allowanceMode === 'defined'} onChange={() => setScopeDraft({ ...scopeDraft, allowanceMode: 'defined', allowances: scopeDraft.allowances.length ? scopeDraft.allowances : [emptyScopeAllowance()] })} /><span>{t('Defined allowances')}</span></label>
                </div>
              </fieldset>
              {scopeDraft.allowanceMode === 'none' ? (
                <label className="scope-no-allowance">{t('No-allowance statement')}<textarea required minLength="8" maxLength="500" rows={3} value={scopeDraft.noAllowanceReason} onChange={(event) => setScopeDraft({ ...scopeDraft, noAllowanceReason: event.target.value })} /></label>
              ) : (
                <section className="scope-allowance-section" aria-labelledby="scope-allowance-title">
                  <div className="commercial-line-heading">
                    <div><h3 id="scope-allowance-title">{t('Allowances and provisional sums')}</h3><p>{t('Each amount is server-recalculated from quantity and unit rate.')}</p></div>
                    <button type="button" className="secondary-button" onClick={() => setScopeDraft((current) => ({ ...current, allowances: [...current.allowances, emptyScopeAllowance(current.allowances.length)] }))}><Plus size={14} />{t('Add allowance')}</button>
                  </div>
                  <div className="scope-allowance-list">
                    {scopeDraft.allowances.map((allowance, index) => (
                      <fieldset className="scope-allowance-row" key={`${allowance.allowanceKey}-${index}`}>
                        <legend>{t('Allowance {number}', { number: index + 1 })}</legend>
                        <label>{t('Key')}<input required maxLength="40" value={allowance.allowanceKey} onChange={(event) => updateScopeAllowance(index, { allowanceKey: event.target.value.toUpperCase() })} /></label>
                        <label>{t('Type')}<select value={allowance.allowanceType} onChange={(event) => updateScopeAllowance(index, { allowanceType: event.target.value })}><option value="selection_allowance">{t('Selection allowance')}</option><option value="provisional_sum">{t('Provisional sum')}</option><option value="unit_rate">{t('Unit rate')}</option></select></label>
                        <label className="scope-allowance-title-field">{t('Title')}<input required minLength="3" maxLength="160" value={allowance.title} onChange={(event) => updateScopeAllowance(index, { title: event.target.value })} /></label>
                        <label className="scope-allowance-description">{t('Description')}<textarea required minLength="3" maxLength="500" rows={2} value={allowance.description} onChange={(event) => updateScopeAllowance(index, { description: event.target.value })} /></label>
                        <label>{t('Quantity')}<input required type="number" min="0.0001" max="1000000" step="0.0001" value={allowance.quantity} onChange={(event) => updateScopeAllowance(index, { quantity: event.target.value })} /></label>
                        <label>{t('Unit')}<input required maxLength="40" value={allowance.unit} onChange={(event) => updateScopeAllowance(index, { unit: event.target.value })} /></label>
                        <label>{t('Unit rate')}<input required type="number" min="0" max="1000000000" step="0.01" value={allowance.unitRate} onChange={(event) => updateScopeAllowance(index, { unitRate: event.target.value })} /></label>
                        <label>{t('Reconciliation')}<select value={allowance.reconciliationMethod} onChange={(event) => updateScopeAllowance(index, { reconciliationMethod: event.target.value })}><option value="actual_cost_variation">{t('Actual cost variation')}</option><option value="fixed_included">{t('Fixed included amount')}</option><option value="remeasured_unit_rate">{t('Remeasured unit rate')}</option></select></label>
                        <label>{t('Selection by')}<select value={allowance.selectionBy} onChange={(event) => updateScopeAllowance(index, { selectionBy: event.target.value })}><option value="client">{t('Client')}</option><option value="contractor">{t('Contractor')}</option><option value="joint">{t('Joint')}</option></select></label>
                        <label>{t('Selection due')}<input type="date" value={allowance.dueAt} onChange={(event) => updateScopeAllowance(index, { dueAt: event.target.value })} /></label>
                        <label className="scope-allowance-description">{t('Evidence reference')}<input maxLength="500" value={allowance.evidenceReference} onChange={(event) => updateScopeAllowance(index, { evidenceReference: event.target.value })} placeholder={t('Drawing, survey, supplier quotation, or selection reference')} /></label>
                        <div className="scope-allowance-calculated"><span>{t('Calculated amount')}</span><strong>{rateMoney((Number(allowance.quantity) || 0) * (Number(allowance.unitRate) || 0))}</strong></div>
                        <button type="button" className="icon-button scope-allowance-remove" aria-label={t('Remove allowance {number}', { number: index + 1 })} onClick={() => setScopeDraft((current) => ({ ...current, allowances: current.allowances.filter((_, allowanceIndex) => allowanceIndex !== index) }))}><X size={15} /></button>
                      </fieldset>
                    ))}
                  </div>
                  <div className="scope-allowance-total"><span>{t('Total retained allowance')}</span><strong>{rateMoney(scopeAllowanceTotal)}</strong></div>
                </section>
              )}
              <label className="pricing-basis-textarea">{t('Revision reason')}<textarea required minLength="8" maxLength="500" value={scopeDraft.reason} onChange={(event) => setScopeDraft({ ...scopeDraft, reason: event.target.value })} placeholder={t('Explain why this scope revision is being requested.')} /></label>
              <p className="workflow-note">{t('Approval activates this revision as the exact source for pricing and quotes. It does not send terms, accept client instructions, authorize changed work, commit spend or dates, invoice, or move funds.')}</p>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setEditingCommercialScope(false)}>{t('Cancel')}</button>
              <button className="primary-button" disabled={submitting || !scopeDraftReady}><ShieldCheck size={15} />{submitting ? t('Requesting...') : t('Request approval')}</button>
            </div>
          </form>
        </div>
      ) : null}
      {editingRiskRegister ? (
        <div className="modal-backdrop project-risk-backdrop" role="presentation">
          <form className="modal project-risk-modal" role="dialog" aria-modal="true" aria-labelledby="project-risk-title" data-testid="project-risk-register-form" onSubmit={submitRiskRegister}>
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{t('Approval-gated project review')}</p>
                <h2 id="project-risk-title">{t('Project risk register and premortem')}</h2>
                <p>{job.title} / {t('source-bound revision {version}', { version: Number(currentRiskRegister?.versionNumber || 0) + 1 })}</p>
              </div>
              <button type="button" className="icon-button" aria-label={t('Close project risk register')} onClick={() => setEditingRiskRegister(false)}><X size={17} /></button>
            </div>
            <div className="project-risk-modal-body">
              <div className="project-risk-summary" aria-label={t('Draft project risk summary')}>
                <div><span>{t('Risks')}</span><strong>{riskDraft.risks.length}</strong></div>
                <div><span>{t('High residual')}</span><strong>{riskDraft.risks.filter((risk) => projectRiskScore(risk, true) >= 15).length}</strong></div>
                <div><span>{t('Expected exposure')}</span><strong>{rateMoney(riskDraft.risks.reduce((sum, risk) => sum + ((Number(risk.costExposureAmount) || 0) * ({ 1: 0.1, 2: 0.3, 3: 0.5, 4: 0.7, 5: 0.9 }[Number(risk.residualProbability)] || 0)), 0))}</strong></div>
                <div><span>{t('Schedule exposure')}</span><strong>{t('{days} days', { days: Math.max(0, ...riskDraft.risks.map((risk) => Number(risk.scheduleExposureDays) || 0)) })}</strong></div>
              </div>
              <section className="premortem-workshop" aria-labelledby="premortem-workshop-title">
                <div className="commercial-line-heading">
                  <div><h3 id="premortem-workshop-title">{t('Premortem workshop')}</h3><p>{t('Assume the project failed, then link each failure mode to a controlled risk.')}</p></div>
                </div>
                <div className="premortem-fields">
                  <label>{t('Register title')}<input required minLength="3" maxLength="160" value={riskDraft.title} onChange={(event) => setRiskDraft({ ...riskDraft, title: event.target.value })} /></label>
                  <label>{t('Workshop date')}<input required type="date" value={riskDraft.workshopDate} onChange={(event) => setRiskDraft({ ...riskDraft, workshopDate: event.target.value })} /></label>
                  <label>{t('Facilitator')}<input required minLength="2" maxLength="160" value={riskDraft.facilitator} onChange={(event) => setRiskDraft({ ...riskDraft, facilitator: event.target.value })} /></label>
                  <label className="project-risk-wide">{t('Failure statement')}<textarea required minLength="12" maxLength="2000" rows={3} value={riskDraft.failureStatement} onChange={(event) => setRiskDraft({ ...riskDraft, failureStatement: event.target.value })} placeholder={t('The project failed because...')} /></label>
                  <label className="project-risk-wide">{t('Participants')}<textarea required rows={3} value={riskDraft.participants} onChange={(event) => setRiskDraft({ ...riskDraft, participants: event.target.value })} placeholder={t('One participant per line')} /></label>
                </div>
              </section>
              <section className="project-risk-editor" aria-labelledby="project-risk-editor-title">
                <div className="commercial-line-heading">
                  <div><h3 id="project-risk-editor-title">{t('Risk treatments and failure modes')}</h3><p>{t('Probability and impact use a 1 to 5 scale. Scores and monetary exposure are recalculated by the server.')}</p></div>
                  <button type="button" className="secondary-button" onClick={() => setRiskDraft((current) => ({ ...current, risks: [...current.risks, emptyProjectRisk(current.risks.length)] }))}><Plus size={14} />{t('Add risk')}</button>
                </div>
                <div className="project-risk-list">
                  {riskDraft.risks.map((risk, index) => {
                    const inherentScore = projectRiskScore(risk)
                    const residualScore = projectRiskScore(risk, true)
                    return (
                      <fieldset className="project-risk-row" key={`${risk.riskKey}-${index}`} data-testid={`project-risk-row-${index}`}>
                        <legend>{t('Risk {number}', { number: index + 1 })}</legend>
                        <div className="project-risk-score" aria-label={t('Risk {number} scores', { number: index + 1 })}>
                          <span className={`risk-band risk-band-${projectRiskBand(inherentScore)}`}>{t('Inherent {score}', { score: inherentScore })}</span>
                          <ChevronRight size={15} />
                          <span className={`risk-band risk-band-${projectRiskBand(residualScore)}`}>{t('Residual {score}', { score: residualScore })}</span>
                        </div>
                        <label>{t('Key')}<input required maxLength="40" value={risk.riskKey} onChange={(event) => updateProjectRisk(index, { riskKey: event.target.value.toUpperCase() })} /></label>
                        <label>{t('Category')}<select value={risk.category} onChange={(event) => updateProjectRisk(index, { category: event.target.value })}><option value="commercial">{t('Commercial')}</option><option value="contract">{t('Contract')}</option><option value="design">{t('Design')}</option><option value="site_condition">{t('Site condition')}</option><option value="schedule">{t('Schedule')}</option><option value="resource">{t('Resource')}</option><option value="supply_chain">{t('Supply chain')}</option><option value="financial">{t('Financial')}</option><option value="safety">{t('Safety')}</option><option value="quality">{t('Quality')}</option><option value="environment">{t('Environment')}</option><option value="regulatory">{t('Regulatory')}</option><option value="client">{t('Client')}</option><option value="third_party">{t('Third party')}</option><option value="other">{t('Other')}</option></select></label>
                        <label className="project-risk-title-field">{t('Title')}<input required minLength="3" maxLength="160" value={risk.title} onChange={(event) => updateProjectRisk(index, { title: event.target.value })} /></label>
                        <label>{t('Owner')}<input required minLength="2" maxLength="160" value={risk.owner} onChange={(event) => updateProjectRisk(index, { owner: event.target.value })} /></label>
                        <label>{t('Probability')}<select value={risk.probability} onChange={(event) => updateProjectRisk(index, { probability: event.target.value })}>{[1, 2, 3, 4, 5].map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
                        <label>{t('Impact')}<select value={risk.impact} onChange={(event) => updateProjectRisk(index, { impact: event.target.value })}>{[1, 2, 3, 4, 5].map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
                        <label className="project-risk-wide">{t('Cause')}<textarea required minLength="8" maxLength="1000" rows={2} value={risk.cause} onChange={(event) => updateProjectRisk(index, { cause: event.target.value })} /></label>
                        <label className="project-risk-wide">{t('Risk event')}<textarea required minLength="8" maxLength="1000" rows={2} value={risk.event} onChange={(event) => updateProjectRisk(index, { event: event.target.value })} /></label>
                        <label className="project-risk-wide">{t('Consequence')}<textarea required minLength="8" maxLength="1000" rows={2} value={risk.consequence} onChange={(event) => updateProjectRisk(index, { consequence: event.target.value })} /></label>
                        <label>{t('Response')}<select value={risk.responseStrategy} onChange={(event) => updateProjectRisk(index, { responseStrategy: event.target.value })}><option value="avoid">{t('Avoid')}</option><option value="mitigate">{t('Mitigate')}</option><option value="transfer">{t('Transfer')}</option><option value="accept">{t('Accept')}</option></select></label>
                        <label>{t('Status')}<select value={risk.status} onChange={(event) => updateProjectRisk(index, { status: event.target.value })}><option value="open">{t('Open')}</option><option value="monitoring">{t('Monitoring')}</option><option value="treatment_due">{t('Treatment due')}</option><option value="accepted">{t('Accepted')}</option><option value="closed">{t('Closed')}</option></select></label>
                        <label>{t('Treatment due')}<input type="date" value={risk.dueAt} onChange={(event) => updateProjectRisk(index, { dueAt: event.target.value })} /></label>
                        <label className="project-risk-wide">{t('Mitigation action')}<textarea required minLength="8" maxLength="2000" rows={2} value={risk.mitigationAction} onChange={(event) => updateProjectRisk(index, { mitigationAction: event.target.value })} /></label>
                        <label className="project-risk-wide">{t('Contingency action')}<textarea required minLength="8" maxLength="2000" rows={2} value={risk.contingencyAction} onChange={(event) => updateProjectRisk(index, { contingencyAction: event.target.value })} /></label>
                        <label className="project-risk-wide">{t('Trigger or early warning')}<textarea required minLength="8" maxLength="1000" rows={2} value={risk.trigger} onChange={(event) => updateProjectRisk(index, { trigger: event.target.value })} /></label>
                        <label>{t('Residual probability')}<select value={risk.residualProbability} onChange={(event) => updateProjectRisk(index, { residualProbability: event.target.value })}>{[1, 2, 3, 4, 5].map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
                        <label>{t('Residual impact')}<select value={risk.residualImpact} onChange={(event) => updateProjectRisk(index, { residualImpact: event.target.value })}>{[1, 2, 3, 4, 5].map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
                        <label>{t('Cost exposure')}<input type="number" min="0" max="1000000000" step="0.01" value={risk.costExposureAmount} onChange={(event) => updateProjectRisk(index, { costExposureAmount: event.target.value })} /></label>
                        <label>{t('Schedule days')}<input type="number" min="0" max="10000" step="0.25" value={risk.scheduleExposureDays} onChange={(event) => updateProjectRisk(index, { scheduleExposureDays: event.target.value })} /></label>
                        {residualScore >= 15 || risk.responseStrategy === 'accept' || risk.status === 'accepted' ? <label className="project-risk-wide risk-acceptance">{t('Acceptance or escalation reason')}<textarea required minLength="8" maxLength="1000" rows={2} value={risk.acceptanceReason} onChange={(event) => updateProjectRisk(index, { acceptanceReason: event.target.value })} /></label> : null}
                        <label className="project-risk-wide">{t('Evidence reference')}<input maxLength="500" value={risk.evidenceReference} onChange={(event) => updateProjectRisk(index, { evidenceReference: event.target.value })} /></label>
                        <div className="premortem-link-heading"><TriangleAlert size={15} /><strong>{t('Linked premortem failure mode')}</strong></div>
                        <label className="project-risk-wide">{t('Failure mode')}<textarea required minLength="8" maxLength="1000" rows={2} value={risk.failureMode} onChange={(event) => updateProjectRisk(index, { failureMode: event.target.value })} /></label>
                        <label className="project-risk-wide">{t('Early warning')}<textarea required minLength="8" maxLength="1000" rows={2} value={risk.earlyWarning} onChange={(event) => updateProjectRisk(index, { earlyWarning: event.target.value })} /></label>
                        <label className="project-risk-wide">{t('Prevention')}<textarea required minLength="8" maxLength="2000" rows={2} value={risk.prevention} onChange={(event) => updateProjectRisk(index, { prevention: event.target.value })} /></label>
                        <button type="button" className="icon-button project-risk-remove" aria-label={t('Remove risk {number}', { number: index + 1 })} disabled={riskDraft.risks.length === 1} onClick={() => setRiskDraft((current) => ({ ...current, risks: current.risks.filter((_, riskIndex) => riskIndex !== index) }))}><X size={15} /></button>
                      </fieldset>
                    )
                  })}
                </div>
              </section>
              {riskRegister.revisions?.length ? (
                <details className="project-risk-history"><summary>{t('Revision history ({count})', { count: riskRegister.revisions.length })}</summary><div>{riskRegister.revisions.map((revision) => <span key={revision.id}>v{revision.versionNumber} / {t(formatStatus(revision.status))} / {t('{count} risks', { count: revision.riskCount })} / {formatDateTime(revision.updatedAt)}</span>)}</div></details>
              ) : null}
              <label className="pricing-basis-textarea">{t('Revision reason')}<textarea required minLength="8" maxLength="500" value={riskDraft.reason} onChange={(event) => setRiskDraft({ ...riskDraft, reason: event.target.value })} placeholder={t('Explain why this project risk review is being requested.')} /></label>
              <p className="workflow-note">{t('Approval makes this the exact risk source for pricing and quotes. Automation may flag the missing review, but it cannot author risks, accept liability, promise dates, commit spend, issue a quote, send a message, invoice, or move funds.')}</p>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setEditingRiskRegister(false)}>{t('Cancel')}</button>
              <button className="primary-button" disabled={submitting || !riskDraftReady}><ShieldCheck size={15} />{submitting ? t('Requesting...') : t('Request approval')}</button>
            </div>
          </form>
        </div>
      ) : null}
      {editingPricingBasis ? (
        <div className="modal-backdrop pricing-basis-backdrop" role="presentation">
          <form className="modal pricing-basis-modal" role="dialog" aria-modal="true" aria-labelledby="pricing-basis-title" data-testid="pricing-basis-form" onSubmit={submitPricingBasis}>
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{t('Source-bound commercial decision')}</p>
                <h2 id="pricing-basis-title">{t('Fixed price or time and materials')}</h2>
                <p>{job.title} / {t('decision history remains retained')}</p>
              </div>
              <button type="button" className="icon-button" aria-label={t('Close pricing-basis assessment')} onClick={() => setEditingPricingBasis(false)}><X size={17} /></button>
            </div>
            <div className="pricing-basis-modal-body">
              <div className="pricing-basis-preview" aria-label={t('Pricing-basis recommendation')}>
                <div><span>{t('Recommendation')}</span><strong>{t(pricingModelLabel(pricingPreview.recommendation))}</strong></div>
                <div><span>{t('Fixed-price readiness')}</span><strong>{pricingPreview.score}%</strong></div>
                <div><span>{t('Critical blockers')}</span><strong>{pricingPreview.blockers.length}</strong></div>
                <div><span>{t('Evidence gaps')}</span><strong>{pricingPreview.evidenceGaps.length}</strong></div>
              </div>
              <div className="pricing-factor-list">
                {pricingDraft.factors.map((factor, index) => (
                  <div className="pricing-factor-row" key={factor.key} data-testid={`pricing-factor-${factor.key}`}>
                    <div><strong>{t(factor.label)}</strong><small>{t('{weight}% weight{critical}', { weight: factor.weight, critical: factor.critical ? ` / ${t('critical')}` : '' })}</small></div>
                    <label>
                      {t('Assessment')}
                      <select value={factor.status} onChange={(event) => updatePricingFactor(index, { status: event.target.value })}>
                        <option value="yes">{t('Yes')}</option>
                        <option value="no">{t('No')}</option>
                        <option value="unknown">{t('Unknown')}</option>
                      </select>
                    </label>
                    <label>
                      {t('Retained evidence')}
                      <input required minLength="8" maxLength="500" value={factor.evidence} onChange={(event) => updatePricingFactor(index, { evidence: event.target.value })} placeholder={t('Reference the scope, survey, drawing, takeoff, selection, schedule, or supplier evidence.')} />
                    </label>
                  </div>
                ))}
              </div>
              <fieldset className="pricing-model-fieldset">
                <legend>{t('Selected commercial model')}</legend>
                <div className="pricing-model-options">
                  <label className={pricingDraft.selectedModel === 'fixed_price' ? 'selected' : ''}><input type="radio" name="pricing-model" value="fixed_price" checked={pricingDraft.selectedModel === 'fixed_price'} onChange={(event) => setPricingDraft({ ...pricingDraft, selectedModel: event.target.value })} /><span>{t('Fixed price')}</span></label>
                  <label className={pricingDraft.selectedModel === 'time_and_materials' ? 'selected' : ''}><input type="radio" name="pricing-model" value="time_and_materials" checked={pricingDraft.selectedModel === 'time_and_materials'} onChange={(event) => setPricingDraft({ ...pricingDraft, selectedModel: event.target.value })} /><span>{t('Time and materials')}</span></label>
                </div>
              </fieldset>
              <label className="pricing-basis-textarea">{t('Decision rationale')}<textarea required minLength="8" maxLength="1000" value={pricingDraft.rationale} onChange={(event) => setPricingDraft({ ...pricingDraft, rationale: event.target.value })} placeholder={t('State why this model fits the retained risk and estimate basis.')} /></label>
              {pricingOverride ? (
                <label className="pricing-basis-textarea pricing-override-reason">{t('Override reason')}<textarea required minLength="12" maxLength="500" value={pricingDraft.overrideReason} onChange={(event) => setPricingDraft({ ...pricingDraft, overrideReason: event.target.value })} placeholder={t('Explain the commercial control that justifies departing from the recommendation or proceeding with evidence gaps.')} /></label>
              ) : null}
              <p className="workflow-note">{t('This retains an internal commercial decision. Quote issue, client acceptance, schedule commitments, supplier spend, invoices, and payments remain separately gated.')}</p>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setEditingPricingBasis(false)}>{t('Cancel')}</button>
              <button className="primary-button" disabled={submitting || !pricingDraftReady}><ShieldCheck size={15} />{submitting ? t('Retaining...') : t('Retain pricing basis')}</button>
            </div>
          </form>
        </div>
      ) : null}
      <div className="commercial-ledger">
        <Suspense fallback={<p role="status">Contractuele datums laden...</p>}><ClientDateCommitmentsControl api={api} jobId={job.id} canEdit={canCoordinate} /></Suspense>
        <section aria-labelledby="quote-ledger-title">
          <div className="commercial-list-heading">
            <h4 id="quote-ledger-title">{t('Estimates and quotes')}</h4>
            <span>{quotes.length}</span>
          </div>
          {quotes.length ? (
            <div className="activity-list commercial-list">
              {quotes.map((quote) => {
                const issueApproval = pendingFor('quote', quote.id)
                const acceptanceApproval = pendingFor('quote_acceptance', quote.id)
                const issuePackage = job.documents?.find(
                  (document) => document.type === 'quote_issue_package' && document.data?.sourceRecordId === quote.id,
                )
                const deliveryDraft = issuePackage
                  ? job.communications?.find(
                      (communication) =>
                        communication.data?.source === 'quote_issue_package' && communication.data?.sourceRecordId === quote.id,
                    )
                  : null
                const deliveryApproval = deliveryDraft ? pendingFor('communication', deliveryDraft.id) : null
                const canPrepare = ['approved', 'accepted'].includes(quote.status)
                  && canCoordinate
                  && !issuePackage
                  && quote.commercialScopeIntegrityValid === true
                  && quote.commercialScopeCurrent === true
                  && quote.riskRegisterIntegrityValid === true
                  && quote.riskRegisterCurrent === true
                  && quote.pricingBasisIntegrityValid !== false
                  && quote.pricingBasisCurrent !== false
                return (
                  <div className="activity-row commercial-row" key={quote.id} data-testid={`commercial-quote-${quote.id}`}>
                    <div className="commercial-record">
                      <div>
                        <strong>{currency.format(quote.subtotal || 0)} {quote.pricingModel === 'time_and_materials' ? t('budget net') : t('net')}</strong>
                        <span className={`status status-${quote.status}`}>{t(formatStatus(quote.status))}</span>
                        {quote.pricingModel ? <span className="tag">{t(pricingModelLabel(quote.pricingModel))}</span> : null}
                        {quote.commercialScope ? <span className="tag">{t('Scope v{version}', { version: quote.commercialScope.versionNumber })}</span> : null}
                        {quote.commercialScopeIntegrityValid === false ? <span className="tag tag-red">{t('Scope integrity failed')}</span> : null}
                        {issueApproval && quote.commercialScopeCurrent === false ? <span className="tag tag-amber">{t('Scope revision required')}</span> : null}
                        {quote.riskRegister ? <span className="tag">{t('Risk v{version}', { version: quote.riskRegister.versionNumber })}</span> : null}
                        {quote.riskRegisterIntegrityValid === false ? <span className="tag tag-red">{t('Risk integrity failed')}</span> : null}
                        {issueApproval && quote.riskRegisterCurrent === false ? <span className="tag tag-amber">{t('Risk review required')}</span> : null}
                        {quote.pricingBasisIntegrityValid === false ? <span className="tag tag-red">{t('Basis integrity failed')}</span> : null}
                        {issueApproval && quote.pricingBasisCurrent === false ? <span className="tag tag-amber">{t('Reassessment required')}</span> : null}
                      </div>
                      <small>
                        {t('{count} line item(s) / VAT {vat}% / gross {gross}', { count: quote.lineItems?.length || 0, vat: quote.taxRate || 0, gross: currency.format(quote.total || 0) })}
                      </small>
                      <small>
                        {t('Valid until {date}', { date: formatDate(quote.validUntil) })}
                        {issuePackage ? ` · ${t('package {reference}', { reference: issuePackage.data?.issueReference || t('retained') })}` : ''}
                        {quote.data?.acceptance?.evidenceReference ? ` · ${t('evidence {reference}', { reference: quote.data.acceptance.evidenceReference })}` : ''}
                      </small>
                    </div>
                    <div className="commercial-row-actions">
                      {issueApproval && canApprove ? (
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={submitting || quote.commercialScopeIntegrityValid !== true || quote.commercialScopeCurrent !== true || quote.pricingBasisIntegrityValid === false || quote.pricingBasisCurrent === false}
                          title={quote.commercialScopeCurrent === false ? t('Approve a current commercial scope revision before approving this quote') : quote.pricingBasisCurrent === false ? t('Reassess the pricing basis before approving this quote') : t('Review quote approval')}
                          onClick={() => onOpenApprovals({ approvalId: issueApproval.id })}
                        >
                          <ShieldCheck size={15} />
                          {t('Review quote')}
                        </button>
                      ) : null}
                      {canPrepare ? (
                        <button
                          type="button"
                          className="secondary-button"
                          data-testid={`prepare-quote-package-${quote.id}`}
                          disabled={submitting}
                          title={t('Prepare an immutable quote package and approval-gated delivery draft')}
                          onClick={() => onRequestAcceptance('issue_package', quote)}
                        >
                          <FileDown size={15} />
                          {t('Prepare issue package')}
                        </button>
                      ) : null}
                      {issuePackage ? (
                        <a
                          className="secondary-button"
                          data-testid={`download-quote-package-${quote.id}`}
                          href={companyApiUrl(`/api/ledger/documents/${encodeURIComponent(issuePackage.id)}/issue-package`)}
                          download
                        >
                          <FileDown size={15} />
                          {t('Download package')}
                        </a>
                      ) : null}
                      {deliveryApproval && canApprove ? (
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={submitting}
                          onClick={() => onOpenApprovals({ approvalId: deliveryApproval.id })}
                        >
                          <ShieldCheck size={15} />
                          {t('Review delivery')}
                        </button>
                      ) : null}
                      {acceptanceApproval && canApprove ? (
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={submitting}
                          onClick={() => onOpenApprovals({ approvalId: acceptanceApproval.id })}
                        >
                          <ShieldCheck size={15} />
                          {t('Verify acceptance')}
                        </button>
                      ) : null}
                      {quote.status === 'approved' && canCoordinate && !acceptanceApproval ? (
                        <button
                          type="button"
                          className="primary-button"
                          disabled={submitting}
                          onClick={() => onRequestAcceptance('quote', quote)}
                        >
                          <Check size={15} />
                          {t('Record acceptance')}
                        </button>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="workflow-note">{t('No retained estimate exists for this job.')}</p>
          )}
        </section>
        <section aria-labelledby="change-ledger-title">
          <div className="commercial-list-heading">
            <h4 id="change-ledger-title">{t('Scope changes')}</h4>
            <span>{changeOrders.length}</span>
          </div>
          {changeOrders.length ? (
            <div className="activity-list commercial-list">
              {changeOrders.map((changeOrder) => {
                const approval = pendingFor('change_order', changeOrder.id)
                const acceptanceApproval = pendingFor('change_order_acceptance', changeOrder.id)
                const clientResponseApproval = pendingApprovals.find(
                  (item) => item.targetType === 'change_order_client_response' && item.data?.changeOrderId === changeOrder.id,
                )
                const issuePackage = job.documents?.find(
                  (document) =>
                    document.type === 'change_order_issue_package' && document.data?.sourceRecordId === changeOrder.id,
                )
                const deliveryDraft = issuePackage
                  ? job.communications?.find(
                      (communication) =>
                        communication.data?.source === 'change_order_issue_package' &&
                        communication.data?.sourceRecordId === changeOrder.id,
                    )
                  : null
                const deliveryApproval = deliveryDraft ? pendingFor('communication', deliveryDraft.id) : null
                const implementationApproval = [...(job.approvals || [])]
                  .filter((item) => item.targetType === 'variation_implementation_plan' && item.data?.changeOrderId === changeOrder.id)
                  .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))[0] || null
                const canPrepareImplementation = changeOrder.status === 'accepted'
                  && changeOrder.integrityValid && changeOrder.workAuthorized && canCoordinate
                  && !['pending', 'approved'].includes(implementationApproval?.status)
                const canPrepare = changeOrder.status === 'approved' && canCoordinate && !issuePackage && changeOrder.integrityValid && changeOrder.sourceCurrent
                const canRecordDelivery =
                  changeOrder.status === 'approved' && deliveryDraft?.status === 'approved' && canCoordinate
                const canRevise = ['changes_requested', 'rejected_by_client', 'rejected', 'cancelled'].includes(changeOrder.status) && canCoordinate
                return (
                  <div className="activity-row commercial-row" key={changeOrder.id} data-testid={`commercial-change-${changeOrder.id}`}>
                    <div className="commercial-record">
                      <div>
                        <strong>{changeOrder.variationNumber ? `${changeOrder.variationNumber} / R${changeOrder.revisionNumber} - ` : ''}{changeOrder.title}</strong>
                        <span className={`status status-${changeOrder.status}`}>{t(formatStatus(changeOrder.status))}</span>
                      </div>
                      <small>
                        {t('{amount} net / {days} day schedule impact', { amount: currency.format(changeOrder.amount || 0), days: changeOrder.scheduleDeltaDays || 0 })} ·{' '}
                        {commercialCurrency}
                      </small>
                      <small>
                        {changeOrder.scopeDelta || t('Scope evidence not retained')}
                        {issuePackage ? ` · ${t('package {reference}', { reference: issuePackage.data?.issueReference || t('retained') })}` : ''}
                        {changeOrder.data?.issuePackage?.transportStatus
                          ? ` · ${t(formatStatus(changeOrder.data.issuePackage.transportStatus))}`
                          : ''}
                        {changeOrder.data?.acceptance?.evidenceReference
                          ? ` · ${t('evidence {reference}', { reference: changeOrder.data.acceptance.evidenceReference })}`
                          : ''}
                      </small>
                      <small>
                        {t(formatStatus(changeOrder.formalControl?.variationType || 'legacy record'))} · {t('initiated by {initiator}', { initiator: t(formatStatus(changeOrder.formalControl?.initiatedBy || 'not retained')) })} · {t('risk {risk}', { risk: t(formatStatus(changeOrder.formalControl?.riskImpact || 'not retained')) })} · {changeOrder.integrityValid ? t('snapshot verified') : t('snapshot invalid')} · {changeOrder.sourceCurrent ? t('contract source current') : t('contract source stale')} · {changeOrder.workAuthorized ? t('work authorized') : t('work not authorized')}
                      </small>
                    </div>
                    <div className="commercial-row-actions">
                      {approval && canApprove ? (
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={submitting}
                          onClick={() => onOpenApprovals({ approvalId: approval.id })}
                        >
                          <ShieldCheck size={15} />
                          {t('Review change')}
                        </button>
                      ) : null}
                      {canPrepare ? (
                        <button
                          type="button"
                          className="secondary-button"
                          data-testid={`prepare-change-package-${changeOrder.id}`}
                          disabled={submitting}
                          title={t('Prepare an immutable change-order package and approval-gated delivery draft')}
                          onClick={() => onRequestAcceptance('change_issue_package', changeOrder)}
                        >
                          <FileDown size={15} />
                          {t('Prepare issue package')}
                        </button>
                      ) : null}
                      {issuePackage ? (
                        <a
                          className="secondary-button"
                          data-testid={`download-change-package-${changeOrder.id}`}
                          href={companyApiUrl(`/api/ledger/documents/${encodeURIComponent(issuePackage.id)}/issue-package`)}
                          download
                        >
                          <FileDown size={15} />
                          {t('Download package')}
                        </a>
                      ) : null}
                      {deliveryApproval && canApprove ? (
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={submitting}
                          onClick={() => onOpenApprovals({ approvalId: deliveryApproval.id })}
                        >
                          <ShieldCheck size={15} />
                          {t('Review delivery')}
                        </button>
                      ) : null}
                      {canRecordDelivery ? (
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={submitting}
                          onClick={() => onRecordChangeDelivery(changeOrder, deliveryDraft)}
                        >
                          <MailCheck size={15} />
                          {t('Record delivery receipt')}
                        </button>
                      ) : null}
                      {acceptanceApproval && canApprove ? (
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={submitting}
                          onClick={() => onOpenApprovals({ approvalId: acceptanceApproval.id })}
                        >
                          <ShieldCheck size={15} />
                          {t('Verify acceptance')}
                        </button>
                      ) : null}
                      {clientResponseApproval && canApprove ? (
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={submitting}
                          onClick={() => onOpenApprovals({ approvalId: clientResponseApproval.id })}
                        >
                          <ShieldCheck size={15} />
                          {t('Review client response')}
                        </button>
                      ) : null}
                      {changeOrder.status === 'issued' && canCoordinate && !acceptanceApproval && !clientResponseApproval ? (
                        <button
                          type="button"
                          className="primary-button"
                          disabled={submitting}
                          onClick={() => onRequestAcceptance('change_order', changeOrder)}
                        >
                          <Check size={15} />
                          {t('Record acceptance')}
                        </button>
                      ) : null}
                      {canRevise ? (
                        <button
                          type="button"
                          className="primary-button"
                          disabled={submitting}
                          onClick={() => onNewChangeOrder(changeOrder)}
                        >
                          <FileDown size={15} />
                          {t('Prepare revision')}
                        </button>
                      ) : null}
                      {implementationApproval?.status === 'pending' && canApprove ? (
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={submitting}
                          onClick={() => onOpenApprovals({ approvalId: implementationApproval.id })}
                        >
                          <ShieldCheck size={15} />
                          {t('Review work plan')}
                        </button>
                      ) : null}
                      {canPrepareImplementation && editingImplementationFor !== changeOrder.id ? (
                        <button
                          type="button"
                          className="primary-button"
                          data-testid={`prepare-variation-work-${changeOrder.id}`}
                          disabled={submitting}
                          onClick={() => openVariationImplementation(changeOrder)}
                        >
                          <ClipboardList size={15} />
                          {t('Prepare work steps')}
                        </button>
                      ) : null}
                      {implementationApproval?.status === 'approved' ? (
                        <span className="status status-approved" data-testid={`variation-work-created-${changeOrder.id}`}>
                          {t('{tasks} tasks / {materials} material needs', {
                            tasks: implementationApproval.data?.application?.taskIds?.length || 0,
                            materials: implementationApproval.data?.application?.materialRequirementIds?.length || 0,
                          })}
                        </span>
                      ) : null}
                    </div>
                    {editingImplementationFor === changeOrder.id ? (
                      <form className="variation-implementation-editor" aria-label={t('Variation implementation form')} onSubmit={(event) => submitVariationImplementation(event, changeOrder)}>
                        <div className="variation-implementation-heading">
                          <div>
                            <strong>{t('Work steps for accepted scope')}</strong>
                            <small>{changeOrder.variationNumber || changeOrder.title} · {t('Internal review required')}</small>
                          </div>
                          <button type="button" className="icon-button" aria-label={t('Close')} onClick={() => setEditingImplementationFor(null)}><X size={16} /></button>
                        </div>
                        {implementationDraft.tasks.map((task, taskIndex) => (
                          <fieldset className="variation-implementation-task" key={`task-${taskIndex}`}>
                            <legend>{t('Work step {number}', { number: taskIndex + 1 })}</legend>
                            <div className="variation-implementation-fields">
                              <label>{t('Task title')}<input required maxLength={180} value={task.title} onChange={(event) => updateImplementationTask(taskIndex, { title: event.target.value })} /></label>
                              <label>{t('Estimated hours')}<input type="number" min="0.25" max="2000" step="0.25" value={task.durationHours} onChange={(event) => updateImplementationTask(taskIndex, { durationHours: event.target.value })} /></label>
                              <label className="variation-implementation-wide">{t('Work description')}<textarea maxLength={2000} rows={2} value={task.description} onChange={(event) => updateImplementationTask(taskIndex, { description: event.target.value })} /></label>
                            </div>
                            <div className="variation-implementation-materials">
                              <strong>{t('Material needs')}</strong>
                              {task.materials.map((material, materialIndex) => (
                                <div className="variation-implementation-material" key={`material-${materialIndex}`}>
                                  <label>{t('Material')}<input required maxLength={180} value={material.name} onChange={(event) => updateImplementationMaterial(taskIndex, materialIndex, { name: event.target.value })} /></label>
                                  <label>{t('Quantity')}<input type="number" required min="0.001" step="any" value={material.quantity} onChange={(event) => updateImplementationMaterial(taskIndex, materialIndex, { quantity: event.target.value })} /></label>
                                  <label>{t('Unit')}<input required maxLength={40} value={material.unit} onChange={(event) => updateImplementationMaterial(taskIndex, materialIndex, { unit: event.target.value })} /></label>
                                  <button type="button" className="icon-button" aria-label={t('Remove material')} onClick={() => updateImplementationTask(taskIndex, { materials: task.materials.filter((_, index) => index !== materialIndex) })}><X size={15} /></button>
                                </div>
                              ))}
                              <button type="button" className="secondary-button" onClick={() => updateImplementationTask(taskIndex, { materials: [...task.materials, { name: '', quantity: '1', unit: 'stuk' }] })}><Plus size={14} />{t('Add material')}</button>
                            </div>
                            {implementationDraft.tasks.length > 1 ? <button type="button" className="text-button" onClick={() => setImplementationDraft((current) => ({ ...current, tasks: current.tasks.filter((_, index) => index !== taskIndex) }))}>{t('Remove work step')}</button> : null}
                          </fieldset>
                        ))}
                        <div className="variation-implementation-footer">
                          <small>{t('Approval creates open, unassigned tasks and needs-only materials. No dates, supplier, prices, orders, or client messages are added.')}</small>
                          <div>
                            <button type="button" className="secondary-button" disabled={implementationDraft.tasks.length >= 30} onClick={() => setImplementationDraft((current) => ({ ...current, tasks: [...current.tasks, { title: '', description: '', durationHours: '', materials: [] }] }))}><Plus size={14} />{t('Add work step')}</button>
                            <button type="submit" className="primary-button" disabled={submitting || !implementationDraft.tasks.length}><ShieldCheck size={15} />{t('Submit for approval')}</button>
                          </div>
                        </div>
                      </form>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="workflow-note">{t('No retained scope change exists for this job.')}</p>
          )}
        </section>
      </div>
    </section>
  )
}



export default CommercialControl

export { CommercialControl }
