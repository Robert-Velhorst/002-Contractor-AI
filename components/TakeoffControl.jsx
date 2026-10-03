import './JobWorkspaceControls.css'
import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Calculator, ChevronRight, GitBranch, Pencil, Plus, Ruler, X } from 'lucide-react'
import { currency, EMPTY_LIST, formatStatus } from '../dashboard-format'
import { operatorText } from '../operator-locale'
import Empty from './EmptyState'
import { pricingModelLabel, rateMoney } from './job-pricing-display.mjs'



function takeoffMeasurementSummary(item = {}, t = (value) => value) {
  const dimensions = []
  if (item.measurementType !== 'manual') dimensions.push(`${item.count || 0}x`)
  if (['linear', 'area', 'volume'].includes(item.measurementType)) dimensions.push(`${item.length || 0} m`)
  if (['area', 'volume'].includes(item.measurementType)) dimensions.push(`x ${item.width || 0} m`)
  if (item.measurementType === 'volume') dimensions.push(`x ${item.height || 0} m`)
  if (item.wastePercent) dimensions.push(t('+ {percent}% waste', { percent: item.wastePercent }))
  return dimensions.length ? dimensions.join(' ') : t('Manual retained quantity')
}

function estimateRatePolicyDraft(activePolicy) {
  const snapshot = activePolicy?.snapshot || {}
  const burden = snapshot.labourBurden || {}
  const overhead = snapshot.overheadRecovery || {}
  return {
    policyName: snapshot.policyName || 'Standard estimating rates',
    currency: snapshot.currency || 'EUR',
    labourClasses: (snapshot.labourClasses || [{ code: 'STANDARD', name: 'Standard craft labour', baseHourlyRate: 35 }]).map((row) => ({
      code: row.code,
      name: row.name,
      baseHourlyRate: String(row.baseHourlyRate),
    })),
    paidLeavePercent: String(burden.paidLeavePercent ?? 12),
    statutoryEmployerCostsPercent: String(burden.statutoryEmployerCostsPercent ?? 25),
    pensionBenefitsPercent: String(burden.pensionBenefitsPercent ?? 8),
    insuranceOtherPercent: String(burden.insuranceOtherPercent ?? 3),
    productiveUtilizationPercent: String(burden.productiveUtilizationPercent ?? 75),
    overheadMethod: overhead.method || 'labor_hour',
    annualOverhead: String(overhead.annualOverhead ?? 60000),
    annualProductiveLabourHours: String(overhead.annualProductiveLabourHours ?? 2000),
    directCostPercent: String(overhead.directCostPercent ?? 10),
    targetMarginPercent: String(snapshot.targetMarginPercent ?? 25),
    reason: '',
  }
}

function unitRateDraft(activePolicy, item) {
  const retained = item?.rateBuildUp?.input || {}
  const defaultClass = activePolicy?.derived?.labourClasses?.[0]?.code || ''
  const retainedCost = Number(item?.unitCost || 0)
  const category = item?.category || 'other'
  return {
    labourClassCode: retained.labourClassCode || defaultClass,
    labourHoursPerUnit: String(retained.labourHoursPerUnit ?? (category === 'labor' ? 1 : 0)),
    materialCostPerUnit: String(retained.materialCostPerUnit ?? (category === 'material' ? retainedCost : 0)),
    equipmentCostPerUnit: String(retained.equipmentCostPerUnit ?? (category === 'equipment' ? retainedCost : 0)),
    subcontractCostPerUnit: String(retained.subcontractCostPerUnit ?? (category === 'subcontract' ? retainedCost : 0)),
    otherDirectCostPerUnit: String(retained.otherDirectCostPerUnit ?? (category === 'other' ? retainedCost : 0)),
    targetMarginPercent: String(retained.targetMarginPercent ?? activePolicy?.snapshot?.targetMarginPercent ?? 0),
    marginOverrideReason: retained.marginOverrideReason || '',
  }
}

function roundRateValue(value, decimals = 2) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  const factor = 10 ** decimals
  return Math.round((number + Number.EPSILON) * factor) / factor
}

function calculateRatePreview(activePolicy, draft) {
  if (!activePolicy || !draft) return null
  const labourClass = (activePolicy.derived?.labourClasses || EMPTY_LIST).find((row) => row.code === draft.labourClassCode)
  if (!labourClass) return null
  const labourHours = Number(draft.labourHoursPerUnit) || 0
  const labourCost = roundRateValue(labourHours * Number(labourClass.fullyBurdenedHourlyRate || 0))
  const directCost = roundRateValue(
    labourCost
      + (Number(draft.materialCostPerUnit) || 0)
      + (Number(draft.equipmentCostPerUnit) || 0)
      + (Number(draft.subcontractCostPerUnit) || 0)
      + (Number(draft.otherDirectCostPerUnit) || 0),
  )
  const overhead = activePolicy.derived?.overheadMethod === 'labor_hour'
    ? roundRateValue(labourHours * Number(activePolicy.derived?.overheadPerLabourHour || 0))
    : roundRateValue(directCost * Number(activePolicy.derived?.directCostPercent || 0) / 100)
  const unitCost = roundRateValue(directCost + overhead)
  const margin = Number(draft.targetMarginPercent) || 0
  const unitSellRate = margin < 100 ? roundRateValue(unitCost / (1 - margin / 100)) : 0
  const policyMargin = Number(activePolicy.snapshot?.targetMarginPercent || 0)
  return {
    labourCost,
    directCost,
    overhead,
    unitCost,
    unitSellRate,
    markupPercent: unitCost > 0 ? roundRateValue(((unitSellRate - unitCost) / unitCost) * 100) : 0,
    marginOverride: Math.abs(margin - policyMargin) > 0.0001,
  }
}

function TakeoffControl({
  job,
  estimateRates,
  locale,
  canCoordinate,
  canManagePolicy,
  submitting,
  onRequestRatePolicy,
  onApplyUnitRate,
  onNewTakeoff,
  onAddItem,
  onEditItem,
  onRemoveItem,
  onConvert,
}) {
  const t = (key, variables = {}) => operatorText(locale, key, variables)
  const activeRatePolicy = estimateRates?.activePolicy || null
  const currentPricingBasis = job.pricingBasis?.currentDecision || null
  const pricingBasisReady = Boolean(currentPricingBasis && job.pricingBasis?.stale !== true)
  const pendingRatePolicies = estimateRates?.pendingPolicies || EMPTY_LIST
  const takeoffs = job.takeoffs || EMPTY_LIST
  const draftCount = takeoffs.filter((takeoff) => takeoff.status === 'draft').length
  const convertedCount = takeoffs.filter((takeoff) => takeoff.status === 'converted').length
  const packageCount = takeoffs.reduce((sum, takeoff) => sum + Number(takeoff.workBreakdown?.packageCount || 0), 0)
  const draftValue = takeoffs
    .filter((takeoff) => takeoff.status === 'draft')
    .reduce((sum, takeoff) => sum + Number(takeoff.subtotal || 0), 0)
  const [editingRatePolicy, setEditingRatePolicy] = useState(false)
  const [ratePolicyDraft, setRatePolicyDraft] = useState(() => estimateRatePolicyDraft(activeRatePolicy))
  const [rateBuildUpTarget, setRateBuildUpTarget] = useState(null)
  const [rateBuildUpDraft, setRateBuildUpDraft] = useState(null)

  useEffect(() => {
    if (!editingRatePolicy) setRatePolicyDraft(estimateRatePolicyDraft(activeRatePolicy))
  }, [activeRatePolicy, editingRatePolicy])

  const ratePreview = useMemo(
    () => calculateRatePreview(activeRatePolicy, rateBuildUpDraft),
    [activeRatePolicy, rateBuildUpDraft],
  )

  function openRatePolicyEditor() {
    setRatePolicyDraft(estimateRatePolicyDraft(activeRatePolicy))
    setEditingRatePolicy(true)
  }

  function updateLabourClass(index, patch) {
    setRatePolicyDraft((current) => ({
      ...current,
      labourClasses: current.labourClasses.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    }))
  }

  async function submitRatePolicy(event) {
    event.preventDefault()
    const result = await onRequestRatePolicy({
      entryKey: `estimate-rate-policy:${Date.now()}`,
      policyName: ratePolicyDraft.policyName,
      currency: ratePolicyDraft.currency,
      labourClasses: ratePolicyDraft.labourClasses.map((row) => ({
        code: row.code,
        name: row.name,
        baseHourlyRate: Number(row.baseHourlyRate),
      })),
      labourBurden: {
        paidLeavePercent: Number(ratePolicyDraft.paidLeavePercent),
        statutoryEmployerCostsPercent: Number(ratePolicyDraft.statutoryEmployerCostsPercent),
        pensionBenefitsPercent: Number(ratePolicyDraft.pensionBenefitsPercent),
        insuranceOtherPercent: Number(ratePolicyDraft.insuranceOtherPercent),
        productiveUtilizationPercent: Number(ratePolicyDraft.productiveUtilizationPercent),
      },
      overheadRecovery: {
        method: ratePolicyDraft.overheadMethod,
        annualOverhead: Number(ratePolicyDraft.annualOverhead),
        annualProductiveLabourHours: Number(ratePolicyDraft.annualProductiveLabourHours),
        directCostPercent: Number(ratePolicyDraft.directCostPercent),
      },
      targetMarginPercent: Number(ratePolicyDraft.targetMarginPercent),
      reason: ratePolicyDraft.reason,
    })
    if (result) setEditingRatePolicy(false)
  }

  function openRateBuildUp(takeoff, item) {
    setRateBuildUpTarget({ takeoff, item })
    setRateBuildUpDraft(unitRateDraft(activeRatePolicy, item))
  }

  async function submitRateBuildUp(event) {
    event.preventDefault()
    if (!rateBuildUpTarget || !rateBuildUpDraft) return
    const result = await onApplyUnitRate(rateBuildUpTarget.takeoff, rateBuildUpTarget.item, {
      entryKey: `unit-rate:${rateBuildUpTarget.item.id}:${Date.now()}`,
      policyId: activeRatePolicy.id,
      labourClassCode: rateBuildUpDraft.labourClassCode,
      labourHoursPerUnit: Number(rateBuildUpDraft.labourHoursPerUnit),
      materialCostPerUnit: Number(rateBuildUpDraft.materialCostPerUnit),
      equipmentCostPerUnit: Number(rateBuildUpDraft.equipmentCostPerUnit),
      subcontractCostPerUnit: Number(rateBuildUpDraft.subcontractCostPerUnit),
      otherDirectCostPerUnit: Number(rateBuildUpDraft.otherDirectCostPerUnit),
      targetMarginPercent: Number(rateBuildUpDraft.targetMarginPercent),
      marginOverrideReason: rateBuildUpDraft.marginOverrideReason,
    })
    if (result) {
      setRateBuildUpTarget(null)
      setRateBuildUpDraft(null)
    }
  }
  const ratePolicyReady = ratePolicyDraft.policyName.trim().length >= 2
    && /^[A-Z]{3}$/.test(ratePolicyDraft.currency.trim().toUpperCase())
    && ratePolicyDraft.labourClasses.length > 0
    && ratePolicyDraft.labourClasses.every((row) => row.code.trim() && row.name.trim().length >= 2 && Number(row.baseHourlyRate) > 0)
    && Number(ratePolicyDraft.productiveUtilizationPercent) > 0
    && Number(ratePolicyDraft.productiveUtilizationPercent) <= 100
    && (ratePolicyDraft.overheadMethod !== 'labor_hour' || Number(ratePolicyDraft.annualProductiveLabourHours) > 0)
    && Number(ratePolicyDraft.targetMarginPercent) >= 0
    && Number(ratePolicyDraft.targetMarginPercent) <= 90
    && ratePolicyDraft.reason.trim().length >= 8
  const rateBuildUpReady = Boolean(
    ratePreview
    && ratePreview.unitCost > 0
    && Number(rateBuildUpDraft?.targetMarginPercent) >= 0
    && Number(rateBuildUpDraft?.targetMarginPercent) <= 90
    && (!ratePreview.marginOverride || rateBuildUpDraft?.marginOverrideReason.trim().length >= 8),
  )

  return (
    <section className="job-workspace-section takeoff-control" data-testid="takeoff-control">
      <div className="section-heading takeoff-heading">
        <Ruler size={18} />
        <div>
          <h3>{t('WBS & quantity takeoff')}</h3>
          <p>{t('Structure work packages, measure retained scope, and convert one sealed basis into the approval-gated estimate workflow.')}</p>
        </div>
        {canCoordinate ? (
          <button type="button" className="secondary-button" disabled={submitting} onClick={onNewTakeoff}>
            <Plus size={15} />
            {t('New takeoff')}
          </button>
        ) : null}
      </div>
      <div className={`estimate-rate-policy-strip ${activeRatePolicy ? 'rate-policy-active' : 'rate-policy-missing'}`} data-testid="estimate-rate-policy-control">
        <Calculator size={17} />
        <div>
          <strong>{activeRatePolicy ? `${activeRatePolicy.policyName} / v${activeRatePolicy.versionNumber}` : t('Estimating rate policy required')}</strong>
          <span>
            {activeRatePolicy
              ? t('{count} labour class(es) / {overhead} / {margin}% target margin', {
                  count: activeRatePolicy.derived?.labourClasses?.length || 0,
                  overhead: activeRatePolicy.derived?.overheadMethod === 'labor_hour'
                    ? t('{amount} overhead per labour hour', { amount: rateMoney(activeRatePolicy.derived?.overheadPerLabourHour, activeRatePolicy.currency) })
                    : t('{percent}% direct-cost overhead', { percent: activeRatePolicy.derived?.directCostPercent || 0 }),
                  margin: activeRatePolicy.snapshot?.targetMarginPercent || 0,
                })
              : t('No governed labour-burden and overhead basis is active.')}
          </span>
        </div>
        {pendingRatePolicies.length ? <span className="tag tag-amber">{t('{count} pending approval', { count: pendingRatePolicies.length })}</span> : null}
        {canManagePolicy ? (
          <button type="button" className="secondary-button" disabled={submitting || pendingRatePolicies.length > 0} onClick={openRatePolicyEditor}>
            <Pencil size={14} />
            {activeRatePolicy ? t('Revise rates') : t('Configure rates')}
          </button>
        ) : null}
      </div>
      <div className={`takeoff-pricing-basis-strip ${pricingBasisReady ? 'pricing-basis-active' : 'pricing-basis-missing'}`} data-testid="takeoff-pricing-basis">
        <GitBranch size={17} />
        <div>
          <strong>{pricingBasisReady ? t(pricingModelLabel(currentPricingBasis.selectedModel)) : job.pricingBasis?.stale ? t('Pricing basis is stale') : t('Pricing basis required')}</strong>
          <span>
            {pricingBasisReady
              ? t('Decision v{version} / {score}% fixed-price readiness / {basis}', {
                  version: currentPricingBasis.versionNumber,
                  score: currentPricingBasis.score,
                  basis: currentPricingBasis.snapshot?.override ? t('operator override retained') : t('recommendation followed'),
                })
              : t('Estimate approval remains blocked until current scope and estimate evidence have been assessed.')}
          </span>
        </div>
        {pricingBasisReady ? <span className="tag tag-green">{t('Source current')}</span> : <span className="tag tag-amber">{t('Action required')}</span>}
      </div>
      <div className="takeoff-summary" aria-label={t('Quantity takeoff summary')}>
        <div><span>{t('Sheets')}</span><strong>{takeoffs.length}</strong></div>
        <div><span>{t('Work packages')}</span><strong>{packageCount}</strong></div>
        <div><span>{t('Drafts')}</span><strong>{draftCount}</strong></div>
        <div><span>{t('Converted')}</span><strong>{convertedCount}</strong></div>
        <div><span>{t('Draft sell value')}</span><strong>{currency.format(draftValue)}</strong></div>
      </div>
      {takeoffs.length ? (
        <div className="takeoff-register">
          {takeoffs.map((takeoff) => (
            <article className="takeoff-sheet" key={takeoff.id} data-testid={`takeoff-sheet-${takeoff.id}`}>
              <div className="takeoff-sheet-heading">
                <div>
                  <div className="takeoff-sheet-title">
                    <strong>{takeoff.title}</strong>
                    <span className={`status status-${takeoff.status}`}>{t(formatStatus(takeoff.status))}</span>
                    {takeoff.status === 'converted' ? (
                      <span className={`tag ${takeoff.integrityValid ? 'tag-green' : 'tag-red'}`}>
                        {takeoff.integrityValid ? t('Snapshot verified') : t('Integrity failed')}
                      </span>
                    ) : null}
                  </div>
                  <small>
                    {t('{packages} work package(s) / {measurements} measurement(s) / VAT {vat}%', {
                      packages: takeoff.workBreakdown?.packageCount || 0,
                      measurements: takeoff.itemCount || 0,
                      vat: takeoff.taxRate || 0,
                    })}
                    {takeoff.quoteId ? ` / ${t('estimate {id}', { id: takeoff.quoteId })}` : ''}
                  </small>
                </div>
                {canCoordinate && takeoff.status === 'draft' ? (
                  <div className="takeoff-sheet-actions">
                    <button type="button" className="secondary-button" disabled={submitting || takeoff.itemCount >= 50} onClick={() => onAddItem(takeoff)}>
                      <Plus size={14} />
                      {t('Measurement')}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={submitting || !takeoff.itemCount || takeoff.subtotal <= 0 || !pricingBasisReady}
                      title={pricingBasisReady ? t('Prepare a {model} estimate', { model: t(pricingModelLabel(currentPricingBasis.selectedModel)).toLowerCase() }) : t('A current pricing-basis decision is required')}
                      onClick={() => onConvert(takeoff)}
                    >
                      <ArrowUpRight size={14} />
                      {t('Prepare estimate')}
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="takeoff-values" aria-label={t('{title} totals', { title: takeoff.title })}>
                <div><span>{t('Cost')}</span><strong>{currency.format(takeoff.totalCost || 0)}</strong></div>
                <div><span>{t('Sell net')}</span><strong>{currency.format(takeoff.subtotal || 0)}</strong></div>
                <div><span>{t('Margin')}</span><strong>{currency.format(takeoff.marginAmount || 0)} / {takeoff.marginPercent || 0}%</strong></div>
                <div><span>{t('Gross')}</span><strong>{currency.format(takeoff.total || 0)}</strong></div>
              </div>
              {takeoff.workBreakdown?.nodes?.length ? (
                <div className="takeoff-wbs" role="table" aria-label={t('{title} work breakdown', { title: takeoff.title })}>
                  <div className="takeoff-wbs-heading" role="row">
                    <strong role="columnheader">{t('WBS work package')}</strong>
                    <span role="columnheader">{t('Measurements')}</span>
                    <span role="columnheader">{t('Cost')}</span>
                    <span role="columnheader">{t('Sell')}</span>
                    <span role="columnheader">{t('Margin')}</span>
                  </div>
                  {takeoff.workBreakdown.nodes.map((node) => (
                    <div className="takeoff-wbs-row" role="row" key={node.code} data-testid={`takeoff-wbs-${takeoff.id}-${node.code}`}>
                      <div role="cell"><strong>{node.code}</strong><span>{node.name}</span></div>
                      <span role="cell"><small>{t('Measurements')}</small><strong>{node.itemCount}</strong></span>
                      <span role="cell"><small>{t('Cost')}</small><strong>{currency.format(node.totalCost || 0)}</strong></span>
                      <span role="cell"><small>{t('Sell')}</small><strong>{currency.format(node.totalPrice || 0)}</strong></span>
                      <span role="cell"><small>{t('Margin')}</small><strong>{currency.format(node.marginAmount || 0)} / {node.marginPercent || 0}%</strong></span>
                    </div>
                  ))}
                </div>
              ) : null}
              {takeoff.items?.length ? (
                <div className="takeoff-items" role="table" aria-label={t('{title} measurements', { title: takeoff.title })}>
                  {takeoff.items.map((item) => (
                    <div className="takeoff-item" role="row" key={item.id}>
                      <div className="takeoff-item-copy" role="cell">
                        <div>
                          <strong>{item.description}</strong>
                          <span className="tag tag-wbs">{item.wbsCode} / {item.workPackage}</span>
                          <span className="tag">{t(formatStatus(item.category))}</span>
                          {item.rateBuildUpHash ? (
                            <span className={`tag ${item.rateIntegrityValid ? 'tag-green' : 'tag-red'}`}>
                              {item.rateIntegrityValid ? t('Rate v{version}', { version: item.rateBuildUp?.policy?.versionNumber }) : t('Rate integrity failed')}
                            </span>
                          ) : null}
                        </div>
                        <small>{takeoffMeasurementSummary(item, t)} / {item.sourceReference || t('No drawing reference')}</small>
                        {item.rateBuildUp?.calculation ? (
                          <small className="takeoff-rate-summary">
                            {t('Labour {labour} / overhead {overhead} / cost {cost} / margin {margin}%', {
                              labour: rateMoney(item.rateBuildUp.calculation.labourCostPerUnit, takeoff.currency),
                              overhead: rateMoney(item.rateBuildUp.calculation.overheadRecoveryPerUnit, takeoff.currency),
                              cost: rateMoney(item.rateBuildUp.calculation.unitCost, takeoff.currency),
                              margin: item.rateBuildUp.calculation.targetMarginPercent,
                            })}
                          </small>
                        ) : null}
                      </div>
                      <div className="takeoff-item-quantity" role="cell">
                        <span>{t('Quantity')}</span>
                        <strong>{item.quantity} {item.unit}</strong>
                      </div>
                      <div className="takeoff-item-money" role="cell">
                        <span>{currency.format(item.unitPrice || 0)} / {item.unit}</span>
                        <strong>{currency.format(item.totalPrice || 0)}</strong>
                      </div>
                      {canCoordinate && takeoff.status === 'draft' ? (
                        <div className="takeoff-item-actions" role="cell">
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={t('Build rate {description}', { description: item.description })}
                            title={activeRatePolicy ? t('Unit-rate build-up') : t('Approve an estimating rate policy first')}
                            disabled={submitting || !activeRatePolicy}
                            onClick={() => openRateBuildUp(takeoff, item)}
                          >
                            <Calculator size={15} />
                          </button>
                          <button type="button" className="icon-button" aria-label={t('Edit {description}', { description: item.description })} disabled={submitting} onClick={() => onEditItem(takeoff, item)}>
                            <Pencil size={15} />
                          </button>
                          <button type="button" className="icon-button" aria-label={t('Remove {description}', { description: item.description })} disabled={submitting} onClick={() => onRemoveItem(takeoff, item)}>
                            <X size={15} />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="workflow-note">{t('No measurements retained yet. Add a count, length, area, volume, or manual quantity.')}</p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty title={t('No WBS or quantity takeoffs')} detail={t('Create a structured measured scope before preparing an estimate from drawings, surveys, or site dimensions.')} />
      )}
      {editingRatePolicy ? (
        <div className="estimate-rate-editor-wrap" role="presentation">
          <form className="estimate-rate-editor" role="dialog" aria-modal="true" aria-labelledby="estimate-rate-policy-title" onSubmit={submitRatePolicy}>
            <div className="panel-heading">
              <div>
                <h3 id="estimate-rate-policy-title">{t('Estimating rate policy revision')}</h3>
                <p>{t('Labour burden, productive utilization, overhead recovery, and target margin.')}</p>
              </div>
              <button type="button" className="icon-button" aria-label={t('Close estimating rate policy editor')} onClick={() => setEditingRatePolicy(false)}><X size={16} /></button>
            </div>
            <div className="form-grid estimate-rate-policy-grid">
              <label className="form-span">{t('Policy name')}<input autoFocus required minLength="2" maxLength="120" value={ratePolicyDraft.policyName} onChange={(event) => setRatePolicyDraft({ ...ratePolicyDraft, policyName: event.target.value })} /></label>
              <label>{t('Currency')}<input required maxLength="3" value={ratePolicyDraft.currency} onChange={(event) => setRatePolicyDraft({ ...ratePolicyDraft, currency: event.target.value.toUpperCase() })} /></label>
              <label>{t('Target margin (%)')}<input required type="number" min="0" max="90" step="0.01" value={ratePolicyDraft.targetMarginPercent} onChange={(event) => setRatePolicyDraft({ ...ratePolicyDraft, targetMarginPercent: event.target.value })} /></label>
            </div>
            <fieldset className="estimate-rate-fieldset">
              <legend>{t('Labour classes')}</legend>
              <div className="estimate-rate-labour-list">
                {ratePolicyDraft.labourClasses.map((row, index) => (
                  <div className="estimate-rate-labour-row" key={`${row.code}-${index}`}>
                    <label>{t('Class code')}<input required maxLength="24" value={row.code} onChange={(event) => updateLabourClass(index, { code: event.target.value.toUpperCase() })} /></label>
                    <label>{t('Class name')}<input required minLength="2" maxLength="80" value={row.name} onChange={(event) => updateLabourClass(index, { name: event.target.value })} /></label>
                    <label>{t('Base hourly rate')}<input required type="number" min="0.01" max="10000" step="0.01" value={row.baseHourlyRate} onChange={(event) => updateLabourClass(index, { baseHourlyRate: event.target.value })} /></label>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={t('Remove labour class {name}', { name: row.name || index + 1 })}
                      disabled={ratePolicyDraft.labourClasses.length === 1}
                      onClick={() => setRatePolicyDraft((current) => ({ ...current, labourClasses: current.labourClasses.filter((_, rowIndex) => rowIndex !== index) }))}
                    ><X size={15} /></button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="secondary-button"
                disabled={ratePolicyDraft.labourClasses.length >= 20}
                onClick={() => setRatePolicyDraft((current) => ({
                  ...current,
                  labourClasses: [...current.labourClasses, { code: `CLASS${current.labourClasses.length + 1}`, name: '', baseHourlyRate: '' }],
                }))}
              ><Plus size={14} /> {t('Labour class')}</button>
            </fieldset>
            <fieldset className="estimate-rate-fieldset">
              <legend>{t('Labour burden assumptions')}</legend>
              <div className="form-grid estimate-rate-assumption-grid">
                <label>{t('Paid leave (%)')}<input required type="number" min="0" max="100" step="0.01" value={ratePolicyDraft.paidLeavePercent} onChange={(event) => setRatePolicyDraft({ ...ratePolicyDraft, paidLeavePercent: event.target.value })} /></label>
                <label>{t('Employer costs (%)')}<input required type="number" min="0" max="100" step="0.01" value={ratePolicyDraft.statutoryEmployerCostsPercent} onChange={(event) => setRatePolicyDraft({ ...ratePolicyDraft, statutoryEmployerCostsPercent: event.target.value })} /></label>
                <label>{t('Pension and benefits (%)')}<input required type="number" min="0" max="100" step="0.01" value={ratePolicyDraft.pensionBenefitsPercent} onChange={(event) => setRatePolicyDraft({ ...ratePolicyDraft, pensionBenefitsPercent: event.target.value })} /></label>
                <label>{t('Insurance and other (%)')}<input required type="number" min="0" max="100" step="0.01" value={ratePolicyDraft.insuranceOtherPercent} onChange={(event) => setRatePolicyDraft({ ...ratePolicyDraft, insuranceOtherPercent: event.target.value })} /></label>
                <label>{t('Productive utilization (%)')}<input required type="number" min="1" max="100" step="0.01" value={ratePolicyDraft.productiveUtilizationPercent} onChange={(event) => setRatePolicyDraft({ ...ratePolicyDraft, productiveUtilizationPercent: event.target.value })} /></label>
              </div>
            </fieldset>
            <fieldset className="estimate-rate-fieldset">
              <legend>{t('Overhead recovery')}</legend>
              <div className="form-grid estimate-rate-assumption-grid">
                <label>{t('Method')}<select value={ratePolicyDraft.overheadMethod} onChange={(event) => setRatePolicyDraft({ ...ratePolicyDraft, overheadMethod: event.target.value })}><option value="labor_hour">{t('Per labour hour')}</option><option value="direct_cost_percent">{t('Direct-cost percentage')}</option></select></label>
                <label>{t('Annual overhead')}<input required type="number" min="0" max="1000000000" step="0.01" value={ratePolicyDraft.annualOverhead} onChange={(event) => setRatePolicyDraft({ ...ratePolicyDraft, annualOverhead: event.target.value })} /></label>
                <label>{t('Annual productive labour hours')}<input required={ratePolicyDraft.overheadMethod === 'labor_hour'} type="number" min={ratePolicyDraft.overheadMethod === 'labor_hour' ? '1' : '0'} max="10000000" step="0.01" value={ratePolicyDraft.annualProductiveLabourHours} onChange={(event) => setRatePolicyDraft({ ...ratePolicyDraft, annualProductiveLabourHours: event.target.value })} /></label>
                <label>{t('Direct-cost overhead (%)')}<input required type="number" min="0" max="500" step="0.01" value={ratePolicyDraft.directCostPercent} onChange={(event) => setRatePolicyDraft({ ...ratePolicyDraft, directCostPercent: event.target.value })} /></label>
              </div>
            </fieldset>
            <label className="estimate-rate-reason">{t('Revision reason')}<textarea required minLength="8" maxLength="500" value={ratePolicyDraft.reason} onChange={(event) => setRatePolicyDraft({ ...ratePolicyDraft, reason: event.target.value })} /></label>
            <p className="workflow-note">{t('Policy approval changes only future internal draft calculations. Worker directory rates and existing measurements remain unchanged.')}</p>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setEditingRatePolicy(false)}>{t('Cancel')}</button>
              <button className="primary-button" disabled={submitting || !ratePolicyReady}><ChevronRight size={15} /> {t('Request approval')}</button>
            </div>
          </form>
        </div>
      ) : null}
      {rateBuildUpTarget && rateBuildUpDraft && activeRatePolicy ? (
        <div className="estimate-rate-editor-wrap" role="presentation">
          <form className="estimate-rate-editor unit-rate-editor" role="dialog" aria-modal="true" aria-labelledby="unit-rate-title" onSubmit={submitRateBuildUp}>
            <div className="panel-heading">
              <div>
                <h3 id="unit-rate-title">{t('Unit-rate build-up')}</h3>
                <p>{rateBuildUpTarget.item.description} / {rateBuildUpTarget.item.unit}</p>
              </div>
              <button type="button" className="icon-button" aria-label={t('Close unit-rate build-up')} onClick={() => { setRateBuildUpTarget(null); setRateBuildUpDraft(null) }}><X size={16} /></button>
            </div>
            <div className="form-grid unit-rate-input-grid">
              <label>{t('Labour class')}<select value={rateBuildUpDraft.labourClassCode} onChange={(event) => setRateBuildUpDraft({ ...rateBuildUpDraft, labourClassCode: event.target.value })}>{(activeRatePolicy.derived?.labourClasses || EMPTY_LIST).map((row) => <option key={row.code} value={row.code}>{row.name} / {rateMoney(row.fullyBurdenedHourlyRate, activeRatePolicy.currency)}/h</option>)}</select></label>
              <label>{t('Labour hours / unit')}<input required type="number" min="0" max="1000000" step="0.0001" value={rateBuildUpDraft.labourHoursPerUnit} onChange={(event) => setRateBuildUpDraft({ ...rateBuildUpDraft, labourHoursPerUnit: event.target.value })} /></label>
              <label>{t('Material / unit')}<input required type="number" min="0" max="1000000000" step="0.01" value={rateBuildUpDraft.materialCostPerUnit} onChange={(event) => setRateBuildUpDraft({ ...rateBuildUpDraft, materialCostPerUnit: event.target.value })} /></label>
              <label>{t('Equipment / unit')}<input required type="number" min="0" max="1000000000" step="0.01" value={rateBuildUpDraft.equipmentCostPerUnit} onChange={(event) => setRateBuildUpDraft({ ...rateBuildUpDraft, equipmentCostPerUnit: event.target.value })} /></label>
              <label>{t('Subcontract / unit')}<input required type="number" min="0" max="1000000000" step="0.01" value={rateBuildUpDraft.subcontractCostPerUnit} onChange={(event) => setRateBuildUpDraft({ ...rateBuildUpDraft, subcontractCostPerUnit: event.target.value })} /></label>
              <label>{t('Other direct / unit')}<input required type="number" min="0" max="1000000000" step="0.01" value={rateBuildUpDraft.otherDirectCostPerUnit} onChange={(event) => setRateBuildUpDraft({ ...rateBuildUpDraft, otherDirectCostPerUnit: event.target.value })} /></label>
              <label>{t('Target margin (%)')}<input required type="number" min="0" max="90" step="0.01" value={rateBuildUpDraft.targetMarginPercent} onChange={(event) => setRateBuildUpDraft({ ...rateBuildUpDraft, targetMarginPercent: event.target.value })} /></label>
            </div>
            {ratePreview?.marginOverride ? <label className="estimate-rate-reason">{t('Margin override reason')}<textarea required minLength="8" maxLength="500" value={rateBuildUpDraft.marginOverrideReason} onChange={(event) => setRateBuildUpDraft({ ...rateBuildUpDraft, marginOverrideReason: event.target.value })} /></label> : null}
            {ratePreview ? (
              <div className="unit-rate-preview" aria-label={t('Unit-rate calculation preview')}>
                <div><span>{t('Burdened labour')}</span><strong>{rateMoney(ratePreview.labourCost, activeRatePolicy.currency)}</strong></div>
                <div><span>{t('Direct cost')}</span><strong>{rateMoney(ratePreview.directCost, activeRatePolicy.currency)}</strong></div>
                <div><span>{t('Overhead recovery')}</span><strong>{rateMoney(ratePreview.overhead, activeRatePolicy.currency)}</strong></div>
                <div><span>{t('Unit cost')}</span><strong>{rateMoney(ratePreview.unitCost, activeRatePolicy.currency)}</strong></div>
                <div><span>{t('Unit sell rate')}</span><strong>{rateMoney(ratePreview.unitSellRate, activeRatePolicy.currency)}</strong></div>
                <div><span>{t('Equivalent markup')}</span><strong>{ratePreview.markupPercent}%</strong></div>
              </div>
            ) : null}
            <p className="workflow-note">{t('This updates only the selected draft measurement. Estimate conversion remains approval-gated.')}</p>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => { setRateBuildUpTarget(null); setRateBuildUpDraft(null) }}>{t('Cancel')}</button>
              <button className="primary-button" disabled={submitting || !rateBuildUpReady}><Calculator size={15} /> {t('Apply build-up')}</button>
            </div>
          </form>
        </div>
      ) : null}
      <p className="workflow-note">
        {t('Takeoff conversion seals the WBS, measured basis, and package rollups into one internal quote approval. It does not issue a proposal, contact the client, or alter contract value.')}
      </p>
    </section>
  )
}



export default TakeoffControl

export { TakeoffControl }
