import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { formatStatus } from '../dashboard-format'
import { useSessionDraftRecovery } from '../draft-recovery'
import { emptyOpportunityDraft, opportunityPayload } from '../opportunity-draft.mjs'

const PIPELINE_STAGES = ['new', 'qualifying', 'site_visit', 'estimating', 'proposal', 'negotiating', 'won', 'lost', 'archived']

export default function OpportunityEditor({ editor: opportunityEditor, scope, enabled, api, ot, submitting: parentSubmitting, error, onClose, onSave }) {
  const [opportunityDraft, setOpportunityDraft] = useState(() => emptyOpportunityDraft(opportunityEditor.opportunity))
  const [opportunityMaterialCatalog, setOpportunityMaterialCatalog] = useState([])
  const [opportunityQualificationCatalog, setOpportunityQualificationCatalog] = useState([])
  const [catalogError, setCatalogError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const pendingRef = useRef(false)
  const activeRef = useRef(true)
  const submitting = parentSubmitting || saving
  useSessionDraftRecovery({ enabled, scope, name: 'opportunity', value: opportunityDraft, setValue: setOpportunityDraft })
  useEffect(() => {
    activeRef.current = true
    return () => { activeRef.current = false }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      api('/api/ledger/material-stock/catalog', { signal: controller.signal }),
      api('/api/ledger/qualifications/catalog', { signal: controller.signal }),
    ]).then(([materials, qualifications]) => {
      if (controller.signal.aborted) return
      setOpportunityMaterialCatalog(materials.materials || [])
      setOpportunityQualificationCatalog(qualifications.catalog || [])
    }).catch(error => {
      if (!controller.signal.aborted) { setCatalogError(error.message); controller.abort() }
    })
    return () => controller.abort()
  }, [api])

  async function submitOpportunity(event) {
    event.preventDefault()
    if (submitting || pendingRef.current) return
    pendingRef.current = true
    setSaving(true)
    setSaveError('')
    try { await onSave(opportunityPayload(opportunityDraft)) }
    catch (error) { if (activeRef.current) setSaveError(error.message) }
    finally {
      pendingRef.current = false
      if (activeRef.current) setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop opportunity-backdrop" role="presentation">
      <section
        className="modal opportunity-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="opportunity-title"
        data-testid="opportunity-modal"
        onKeyDown={event => { if (event.key === 'Escape' && !submitting) onClose() }}
      >
        <div className="modal-heading">
          <div>
            <h2 id="opportunity-title">{opportunityEditor.mode === 'create' ? 'New opportunity' : 'Edit opportunity'}</h2>
            <p>Retain qualification and forecast data before operational job creation.</p>
          </div>
          <button className="icon-button" aria-label="Close opportunity" disabled={submitting} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {catalogError || saveError || error ? <p role="alert">{saveError || error || catalogError}</p> : null}
        <form onSubmit={submitOpportunity}>
          <fieldset className="opportunity-fields" disabled={submitting}>
          <div className="form-grid opportunity-form-grid">
            <label>
              Client name
              <input
                required
                autoFocus={opportunityEditor.mode === 'create'}
                disabled={opportunityEditor.mode === 'edit'}
                value={opportunityDraft.clientName}
                onChange={(event) => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, clientName: event.target.value }))}
              />
            </label>
            <label>
              Company
              <input
                disabled={opportunityEditor.mode === 'edit'}
                value={opportunityDraft.company}
                onChange={(event) => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, company: event.target.value }))}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                disabled={opportunityEditor.mode === 'edit'}
                value={opportunityDraft.email}
                onChange={(event) => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, email: event.target.value }))}
              />
            </label>
            <label>
              Phone
              <input
                disabled={opportunityEditor.mode === 'edit'}
                value={opportunityDraft.phone}
                onChange={(event) => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, phone: event.target.value }))}
              />
            </label>
            <label className="form-span">
              Opportunity title
              <input
                required
                minLength="2"
                autoFocus={opportunityEditor.mode === 'edit'}
                value={opportunityDraft.title}
                onChange={(event) => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, title: event.target.value }))}
              />
            </label>
            <label>
              Stage
              <select
                value={opportunityDraft.stage}
                disabled={opportunityDraft.stage === 'won'}
                onChange={(event) => {
                  const nextStage = event.target.value
                  const defaultProbability = {
                    new: 10,
                    qualifying: 20,
                    site_visit: 35,
                    estimating: 50,
                    proposal: 65,
                    negotiating: 80,
                    lost: 0,
                    archived: 0,
                  }[nextStage]
                  setOpportunityDraft(opportunityDraft => ({
                    ...opportunityDraft,
                    stage: nextStage,
                    probabilityPercent: String(defaultProbability ?? opportunityDraft.probabilityPercent),
                  }))
                }}
              >
                {PIPELINE_STAGES.map((option) => (
                  <option key={option} value={option} disabled={option === 'won' && opportunityDraft.stage !== 'won'}>
                    {formatStatus(option)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Probability
              <div className="probability-control">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  disabled={['won', 'lost', 'archived'].includes(opportunityDraft.stage)}
                  value={opportunityDraft.probabilityPercent}
                  onChange={(event) => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, probabilityPercent: event.target.value }))}
                />
                <output>{opportunityDraft.probabilityPercent}%</output>
              </div>
            </label>
            <label>
              Service
              <input
                value={opportunityDraft.service}
                onChange={(event) => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, service: event.target.value }))}
                placeholder="Renovation, maintenance..."
              />
            </label>
            <label>
              Source
              <input
                value={opportunityDraft.sourceChannel}
                onChange={(event) => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, sourceChannel: event.target.value }))}
                placeholder="Referral, website, tender..."
              />
            </label>
            <label>
              Client segment
              <input
                value={opportunityDraft.clientSegment}
                onChange={(event) => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, clientSegment: event.target.value }))}
                placeholder="Homeowner, housing association..."
              />
            </label>
            <label>
              Estimated value
              <input
                type="number"
                min="0"
                step="0.01"
                value={opportunityDraft.estimatedValue}
                onChange={(event) => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, estimatedValue: event.target.value }))}
              />
            </label>
            <label>
              Owner
              <input
                value={opportunityDraft.ownerName}
                onChange={(event) => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, ownerName: event.target.value }))}
              />
            </label>
            <label>
              Next follow-up
              <input
                type="datetime-local"
                value={opportunityDraft.nextFollowUpAt}
                onChange={(event) => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, nextFollowUpAt: event.target.value }))}
              />
            </label>
            <label>
              Decision target
              <input
                type="datetime-local"
                value={opportunityDraft.targetDecisionAt}
                onChange={(event) => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, targetDecisionAt: event.target.value }))}
              />
            </label>
            <fieldset className="form-span opportunity-capacity-forecast">
              <legend>{ot('Expected delivery window and crew demand')}</legend>
              <p>{ot('Used for an advisory comparison with retained crew profiles and commitments. Add dated workday hours to verify day-level capacity. This does not reserve or assign workers.')}</p>
              <div className="form-grid">
                <label>{ot('Expected work start')}<input type="date" value={opportunityDraft.capacityWindowStart} onChange={event => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, capacityWindowStart: event.target.value }))} /></label>
                <label>{ot('Expected work end')}<input type="date" value={opportunityDraft.capacityWindowEnd} onChange={event => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, capacityWindowEnd: event.target.value }))} /></label>
              </div>
              {opportunityDraft.capacityTrades.map((item, index) => <div className="opportunity-capacity-trade" key={`capacity-trade-${index}`}>
                <div className="form-grid opportunity-capacity-row">
                  <label>{ot('Required trade role')}<input required={Boolean(item.hours)} maxLength={100} value={item.role} onChange={event => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, capacityTrades: opportunityDraft.capacityTrades.map((current, row) => row === index ? { ...current, role: event.target.value } : current) }))} placeholder={ot('For example: Installer')} /></label>
                  <label>{ot('Estimated crew hours')}<input required={Boolean(item.role)} type="number" min="0.5" max="20000" step="0.5" value={item.hours} onChange={event => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, capacityTrades: opportunityDraft.capacityTrades.map((current, row) => row === index ? { ...current, hours: event.target.value } : current) }))} /></label>
                  {opportunityDraft.capacityTrades.length > 1 ? <button type="button" className="icon-button" aria-label={ot('Remove trade row {number}', { number: index + 1 })} title={ot('Remove trade row')} onClick={() => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, capacityTrades: opportunityDraft.capacityTrades.filter((_, row) => row !== index) }))}><X size={16} /></button> : null}
                </div>
                <fieldset className="opportunity-qualification-list">
                  <legend>{ot('Required qualifications')}</legend>
                  <div>{opportunityQualificationCatalog.map(requirement => <label key={requirement.key}>
                    <input type="checkbox" checked={(item.requiredQualifications || []).includes(requirement.key)} onChange={event => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, capacityTrades: opportunityDraft.capacityTrades.map((current, row) => row === index ? {
                      ...current,
                      requiredQualifications: event.target.checked
                        ? [...new Set([...(current.requiredQualifications || []), requirement.key])]
                        : (current.requiredQualifications || []).filter(key => key !== requirement.key)
                    } : current) }))} />
                    <span>{ot(requirement.label)}</span>
                  </label>)}</div>
                  {opportunityQualificationCatalog.length === 0 ? <small>{ot('Qualification catalogue unavailable. Refresh the page before recording required credentials.')}</small> : null}
                </fieldset>
                <label className="opportunity-declared-skills">{ot('Required declared skills')}
                  <input
                    maxLength={1600}
                    value={item.requiredSkillsText || ''}
                    onChange={event => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, capacityTrades: opportunityDraft.capacityTrades.map((current, row) => row === index ? { ...current, requiredSkillsText: event.target.value } : current) }))}
                    placeholder={ot('For example: timber framing, roof insulation')}
                    aria-describedby={`opportunity-skills-help-${index}`}
                  />
                  <small id={`opportunity-skills-help-${index}`}>{ot('Compared with worker-declared skills only; not verified evidence.')}</small>
                </label>
                <label className="opportunity-supervision-toggle">
                  <input type="checkbox" checked={Boolean(item.supervision)} onChange={event => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, capacityTrades: opportunityDraft.capacityTrades.map((current, row) => row === index ? {
                    ...current,
                    supervision: event.target.checked ? {
                      role: '', workersPerSupervisor: '', requiredQualifications: [],
                      dailyDemand: (current.dailyDemand || []).filter(day => day.date).map(day => ({ date: day.date, crewSize: '', supervisorShiftHours: '' }))
                    } : null
                  } : current) }))} />
                  <span>{ot('Estimate required supervision')}</span>
                </label>
                {item.supervision ? <div className="opportunity-supervision-panel" data-testid={`opportunity-supervision-${index}`}>
                  <p>{ot('Set peak crew size and supervisor shift hours for each day. This checks a separate role; it does not validate legal supervision rules or assign anyone.')}</p>
                  <div className="form-grid">
                    <label>{ot('Supervisor role')}<input required minLength={2} maxLength={100} value={item.supervision.role} onChange={event => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, capacityTrades: opportunityDraft.capacityTrades.map((current, row) => row === index ? { ...current, supervision: { ...current.supervision, role: event.target.value } } : current) }))} /></label>
                    <label>{ot('Maximum workers per supervisor')}<input required type="number" min="1" max="12" step="1" value={item.supervision.workersPerSupervisor} onChange={event => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, capacityTrades: opportunityDraft.capacityTrades.map((current, row) => row === index ? { ...current, supervision: { ...current.supervision, workersPerSupervisor: event.target.value } } : current) }))} /></label>
                  </div>
                  <fieldset className="opportunity-qualification-list">
                    <legend>{ot('Required supervisor qualifications')}</legend>
                    <div>{opportunityQualificationCatalog.map(requirement => <label key={`supervisor-${requirement.key}`}>
                      <input type="checkbox" checked={(item.supervision.requiredQualifications || []).includes(requirement.key)} onChange={event => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, capacityTrades: opportunityDraft.capacityTrades.map((current, row) => row === index ? {
                        ...current,
                        supervision: { ...current.supervision, requiredQualifications: event.target.checked
                          ? [...new Set([...(current.supervision.requiredQualifications || []), requirement.key])]
                          : (current.supervision.requiredQualifications || []).filter(key => key !== requirement.key) }
                      } : current) }))} />
                      <span>{ot(requirement.label)}</span>
                    </label>)}</div>
                  </fieldset>
                  <div className="opportunity-capacity-days">
                    <div className="panel-heading"><strong>{ot('Daily supervision demand')}</strong><span>{ot('Peak headcount determines the number of supervisors.')}</span></div>
                    {(item.supervision.dailyDemand || []).map((day, dayIndex) => <div className="form-grid opportunity-capacity-day" key={`supervision-day-${dayIndex}`}>
                      <label>{ot('Supervision work date {number}', { number: dayIndex + 1 })}<input required type="date" min={opportunityDraft.capacityWindowStart || undefined} max={opportunityDraft.capacityWindowEnd || undefined} value={day.date} onChange={event => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, capacityTrades: opportunityDraft.capacityTrades.map((current, row) => row === index ? { ...current, supervision: { ...current.supervision, dailyDemand: current.supervision.dailyDemand.map((entry, entryIndex) => entryIndex === dayIndex ? { ...entry, date: event.target.value } : entry) } } : current) }))} /></label>
                      <label>{ot('Peak crew members')}<input required type="number" min="1" max="500" step="1" value={day.crewSize} onChange={event => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, capacityTrades: opportunityDraft.capacityTrades.map((current, row) => row === index ? { ...current, supervision: { ...current.supervision, dailyDemand: current.supervision.dailyDemand.map((entry, entryIndex) => entryIndex === dayIndex ? { ...entry, crewSize: event.target.value } : entry) } } : current) }))} /></label>
                      <label>{ot('Hours per supervisor')}<input required type="number" min="0.5" max="24" step="0.5" value={day.supervisorShiftHours} onChange={event => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, capacityTrades: opportunityDraft.capacityTrades.map((current, row) => row === index ? { ...current, supervision: { ...current.supervision, dailyDemand: current.supervision.dailyDemand.map((entry, entryIndex) => entryIndex === dayIndex ? { ...entry, supervisorShiftHours: event.target.value } : entry) } } : current) }))} /></label>
                      <button type="button" className="icon-button" aria-label={ot('Remove supervision workday {number}', { number: dayIndex + 1 })} onClick={() => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, capacityTrades: opportunityDraft.capacityTrades.map((current, row) => row === index ? { ...current, supervision: { ...current.supervision, dailyDemand: current.supervision.dailyDemand.filter((_, entryIndex) => entryIndex !== dayIndex) } } : current) }))}><X size={16} /></button>
                    </div>)}
                    <button type="button" className="secondary-button" disabled={item.supervision.dailyDemand.length >= 90} onClick={() => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, capacityTrades: opportunityDraft.capacityTrades.map((current, row) => row === index ? { ...current, supervision: { ...current.supervision, dailyDemand: [...current.supervision.dailyDemand, { date: current.dailyDemand.find(day => day.date)?.date || opportunityDraft.capacityWindowStart, crewSize: '', supervisorShiftHours: '' }] } } : current) }))}>{ot('Add supervision workday')}</button>
                  </div>
                </div> : null}
                <div className="opportunity-capacity-days">
                  <div className="panel-heading"><strong>{ot('Expected work by day')}</strong><span>{ot('Day totals must match estimated crew hours.')}</span></div>
                  {(item.dailyDemand || []).map((day, dayIndex) => <div className="form-grid opportunity-capacity-day" key={`capacity-day-${dayIndex}`}>
                    <label>{ot('Work date {number}', { number: dayIndex + 1 })}<input type="date" min={opportunityDraft.capacityWindowStart || undefined} max={opportunityDraft.capacityWindowEnd || undefined} value={day.date} onChange={event => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, capacityTrades: opportunityDraft.capacityTrades.map((current, row) => row === index ? { ...current, dailyDemand: current.dailyDemand.map((entry, entryIndex) => entryIndex === dayIndex ? { ...entry, date: event.target.value } : entry) } : current) }))} /></label>
                    <label>{ot('Expected hours for this role')}<input type="number" min="0.5" max="20000" step="0.5" value={day.hours} onChange={event => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, capacityTrades: opportunityDraft.capacityTrades.map((current, row) => row === index ? { ...current, dailyDemand: current.dailyDemand.map((entry, entryIndex) => entryIndex === dayIndex ? { ...entry, hours: event.target.value } : entry) } : current) }))} /></label>
                    <button type="button" className="icon-button" aria-label={ot('Remove workday {number}', { number: dayIndex + 1 })} onClick={() => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, capacityTrades: opportunityDraft.capacityTrades.map((current, row) => row === index ? { ...current, dailyDemand: current.dailyDemand.filter((_, entryIndex) => entryIndex !== dayIndex) } : current) }))}><X size={16} /></button>
                  </div>)}
                  <button type="button" className="secondary-button" disabled={!opportunityDraft.capacityWindowStart || !opportunityDraft.capacityWindowEnd || item.dailyDemand.length >= 90} onClick={() => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, capacityTrades: opportunityDraft.capacityTrades.map((current, row) => row === index ? { ...current, dailyDemand: [...current.dailyDemand, { date: opportunityDraft.capacityWindowStart, hours: '' }] } : current) }))}>{ot('Add expected workday')}</button>
                </div>
              </div>)}
              <button type="button" className="secondary-button" disabled={opportunityDraft.capacityTrades.length >= 12} onClick={() => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, capacityTrades: [...opportunityDraft.capacityTrades, { role: '', hours: '', requiredQualifications: [], requiredSkillsText: '', supervision: null, dailyDemand: [] }] }))}>{ot('Add required trade')}</button>
            </fieldset>
            <fieldset className="form-span opportunity-material-forecast">
              <legend>{ot('Expected materials')}</legend>
              <p>{ot('Compare exact catalogue items with free warehouse stock and other open opportunities. This is advisory only; it does not reserve stock or create an order.')}</p>
              {opportunityDraft.materialForecast.map((item, index) => <div className="form-grid opportunity-material-row" key={`material-forecast-${index}`}>
                <label>{ot('Catalogue material')}<select required value={item.materialId} onChange={event => {
                  const selected = opportunityMaterialCatalog.find(material => material.id === event.target.value)
                  setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, materialForecast: opportunityDraft.materialForecast.map((current, row) => row === index ? { ...current, materialId: event.target.value, unit: selected?.unit || '' } : current) }))
                }}>
                  <option value="">{ot('Select a known material')}</option>
                  {item.materialId && !opportunityMaterialCatalog.some(material => material.id === item.materialId) ? <option value={item.materialId}>{ot('Material no longer in catalogue')} ({item.materialId})</option> : null}
                  {opportunityMaterialCatalog.map(material => <option key={material.id} value={material.id}>{material.name}{material.sku ? ` · ${material.sku}` : ''} ({material.availableQuantity} {material.unit} {ot('available')})</option>)}
                </select></label>
                <label>{ot('Required quantity')}<input required type="number" min="0.0001" max="1000000000" step="0.0001" value={item.quantity} onChange={event => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, materialForecast: opportunityDraft.materialForecast.map((current, row) => row === index ? { ...current, quantity: event.target.value } : current) }))} /></label>
                <span className="opportunity-material-unit">{item.unit || ot('Unit follows catalogue')}</span>
                <button type="button" className="icon-button" aria-label={ot('Remove material row {number}', { number: index + 1 })} onClick={() => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, materialForecast: opportunityDraft.materialForecast.filter((_, row) => row !== index) }))}><X size={16} /></button>
              </div>)}
              <button type="button" className="secondary-button" disabled={opportunityDraft.materialForecast.length >= 50 || opportunityMaterialCatalog.length === 0} onClick={() => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, materialForecast: [...opportunityDraft.materialForecast, { materialId: '', quantity: '', unit: '' }] }))}>{ot('Add expected material')}</button>
              {opportunityMaterialCatalog.length === 0 ? <small>{ot('Add materials to the company catalogue before estimating exact stock readiness.')}</small> : null}
            </fieldset>
            <label>
              Address
              <input
                value={opportunityDraft.address}
                onChange={(event) => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, address: event.target.value }))}
              />
            </label>
            <label>
              {ot('City')}
              <input
                value={opportunityDraft.city}
                onChange={(event) => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, city: event.target.value }))}
              />
            </label>
            <label>
              {ot('Postal code')}
              <input
                value={opportunityDraft.postalCode}
                onChange={(event) => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, postalCode: event.target.value }))}
                placeholder="6811 AA"
              />
            </label>
            <label>
              Country
              <input
                value={opportunityDraft.country}
                onChange={(event) => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, country: event.target.value }))}
                placeholder="NL"
              />
            </label>
            {opportunityDraft.stage === 'lost' ? (
              <label className="form-span">
                Loss reason
                <textarea
                  required
                  minLength="4"
                  value={opportunityDraft.lostReason}
                  onChange={(event) => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, lostReason: event.target.value }))}
                  placeholder="Retain why this opportunity was not won."
                />
              </label>
            ) : null}
            <label className="form-span">
              Scope and qualification notes
              <textarea
                value={opportunityDraft.description}
                onChange={(event) => setOpportunityDraft(opportunityDraft => ({ ...opportunityDraft, description: event.target.value }))}
                placeholder="Need, access, constraints, decision process and scope assumptions."
              />
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" className="secondary-button" disabled={submitting} onClick={onClose}>
              Cancel
            </button>
            <button className="primary-button" disabled={submitting || opportunityDraft.title.trim().length < 2}>
              {submitting ? 'Saving...' : opportunityEditor.mode === 'create' ? 'Retain opportunity' : 'Save changes'}
            </button>
          </div>
          </fieldset>
        </form>
      </section>
    </div>
  )
}
