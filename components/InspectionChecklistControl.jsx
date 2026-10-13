import './JobWorkspaceControls.css'
import { createElement, useState } from 'react'
import { Ban, CalendarDays, Check, ClipboardCheck, ClipboardList, Plus, ShieldCheck, TriangleAlert, X } from 'lucide-react'
import { createFieldEvidenceDraftId } from '../field-outbox'
import { EMPTY_LIST, formatDateTime, formatStatus, toIsoDateTime, toLocalDateTimeInput } from '../dashboard-format'
import { operatorText } from '../operator-locale'



function InspectionChecklistControl({
  job,
  templates,
  locale,
  canCoordinate,
  canApprove,
  fieldScoped,
  operator,
  submitting,
  onCreateTemplate,
  onSchedule,
  onSubmit,
  onOpenApprovals,
}) {
  const t = (key, variables = {}) => operatorText(locale, key, variables)
  const checklistInspections = (job.inspections || EMPTY_LIST).filter((inspection) => inspection.checklist?.configured)
  const activeAssignments = (job.assignments || EMPTY_LIST).filter((assignment) =>
    !['released', 'cancelled', 'completed', 'closed', 'rejected', 'pending_approval'].includes(assignment.status)
  )
  const eligibleTasks = (job.tasks || EMPTY_LIST).filter((task) =>
    !['completed', 'cancelled', 'canceled', 'closed'].includes(task.status)
  )
  const installationStages = [
    ['pre_installation', t('Pre-installation')],
    ['first_work', t('First work')],
    ['in_process', t('In process')],
    ['pre_concealment', t('Pre-concealment')],
    ['testing', t('Testing')],
    ['final_acceptance', t('Final acceptance')],
  ]
  const controlPoints = [['check', t('Check')], ['witness', t('Witness')], ['hold', t('Hold')]]
  const [scheduleDraft, setScheduleDraft] = useState(null)
  const [templateDraft, setTemplateDraft] = useState(null)
  const [activeInspection, setActiveInspection] = useState(null)
  const [responses, setResponses] = useState({})
  const [submissionNotes, setSubmissionNotes] = useState('')

  const resetTemplateDraft = () => ({
    name: '',
    templateKey: '',
    inspectionType: 'site_inspection',
    discipline: 'quality',
    notes: '',
    installationQc: false,
    defaultInstallationStage: 'in_process',
    defaultControlPoint: 'check',
    items: [
      { key: 'item_1', prompt: '', acceptanceCriteria: '', controlPoint: 'check', required: true, allowNotApplicable: false, evidenceRequired: false, measurementRequired: false, measurementUnit: '', failureSeverity: 'medium' },
      { key: 'item_2', prompt: '', acceptanceCriteria: '', controlPoint: 'check', required: true, allowNotApplicable: false, evidenceRequired: false, measurementRequired: false, measurementUnit: '', failureSeverity: 'medium' },
    ],
  })

  const createScheduleDraft = (template) => {
    const firstTask = eligibleTasks.find((task) =>
      !task.assigneeId || activeAssignments.some((assignment) => assignment.workerId === task.assigneeId)
    ) || eligibleTasks[0]
    const firstAssignment = activeAssignments.find((assignment) => assignment.workerId === firstTask?.assigneeId)
      || activeAssignments[0]
    return {
      templateId: template?.id || '',
      title: template?.name || '',
      scheduledAt: toLocalDateTimeInput(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()),
      inspector: template?.data?.installationQc ? firstAssignment?.workerName || '' : operator?.name || '',
      notes: '',
      taskId: firstTask?.id || '',
      assignmentId: firstAssignment?.id || '',
      assignedWorkerId: firstAssignment?.workerId || '',
      workLocation: job.siteAddress || job.location || '',
      installationStage: template?.data?.defaultInstallationStage || 'in_process',
      controlPoint: template?.data?.defaultControlPoint || 'check',
      referenceBasis: '',
      referenceDocumentIds: [],
    }
  }

  const beginSchedule = () => {
    const first = templates.find((template) => template.status === 'active')
    setScheduleDraft(createScheduleDraft(first))
    setTemplateDraft(null)
  }

  const beginChecklist = (inspection) => {
    const latest = inspection.checklist?.submissions?.[0]?.snapshot?.responses || EMPTY_LIST
    setResponses(
      Object.fromEntries(
        (inspection.checklist?.snapshot?.items || EMPTY_LIST).map((item) => {
          const prior = latest.find((response) => response.itemKey === item.key)
          return [item.key, {
            result: prior?.result || '',
            notes: prior?.notes || '',
            evidenceDocumentId: prior?.evidenceDocumentIds?.[0] || '',
            observedValue: prior?.observedValue || '',
            witnessName: prior?.witnessName || '',
            witnessRole: prior?.witnessRole || '',
          }]
        }),
      ),
    )
    setSubmissionNotes(inspection.checklist?.submissions?.[0]?.snapshot?.notes || '')
    setActiveInspection(inspection)
    setScheduleDraft(null)
    setTemplateDraft(null)
  }

  const updateResponse = (itemKey, patch) => {
    setResponses((current) => ({ ...current, [itemKey]: { ...current[itemKey], ...patch } }))
  }

  const scheduleTemplate = templates.find((template) => template.id === scheduleDraft?.templateId)
  const installationScheduleReady = scheduleTemplate?.data?.installationQc !== true || Boolean(
    scheduleDraft?.taskId
    && scheduleDraft?.assignmentId
    && scheduleDraft?.assignedWorkerId
    && scheduleDraft?.workLocation?.trim().length >= 2
    && scheduleDraft?.referenceBasis?.trim().length >= 3
  )
  const checklistItems = activeInspection?.checklist?.snapshot?.items || EMPTY_LIST
  const activeInstallationQc = activeInspection?.installationQc || null
  const checklistReady = checklistItems.length > 0 && checklistItems.every((item) => {
    const response = responses[item.key]
    if (!response?.result) return !item.required
    if (response.result === 'fail' && !response.notes.trim() && !response.evidenceDocumentId) return false
    if (response.result === 'pass' && item.evidenceRequired && !response.evidenceDocumentId) return false
    if (response.result === 'pass' && item.measurementRequired && !response.observedValue.trim()) return false
    if (response.result === 'pass' && item.controlPoint === 'witness' && (
      response.witnessName.trim().length < 2 || response.witnessRole.trim().length < 2
    )) return false
    return response.result !== 'not_applicable' || item.allowNotApplicable
  })

  async function submitSchedule(event) {
    event.preventDefault()
    if (!scheduleDraft?.templateId || !toIsoDateTime(scheduleDraft.scheduledAt)) return
    if (scheduleTemplate?.data?.installationQc && (
      !scheduleDraft.taskId
      || !scheduleDraft.assignmentId
      || !scheduleDraft.assignedWorkerId
      || scheduleDraft.workLocation.trim().length < 2
      || scheduleDraft.referenceBasis.trim().length < 3
    )) return
    const result = await onSchedule({
      ...scheduleDraft,
      scheduledAt: toIsoDateTime(scheduleDraft.scheduledAt),
      entryKey: createFieldEvidenceDraftId(),
    })
    if (result) setScheduleDraft(null)
  }

  async function submitTemplate(event) {
    event.preventDefault()
    if (!templateDraft) return
    const result = await onCreateTemplate({ ...templateDraft })
    if (result) {
      setTemplateDraft(null)
      setScheduleDraft(createScheduleDraft(result))
    }
  }

  async function submitChecklist(event) {
    event.preventDefault()
    if (!activeInspection || !checklistReady) return
    const result = await onSubmit(activeInspection, {
      entryKey: createFieldEvidenceDraftId(),
      notes: submissionNotes.trim(),
      capturedAt: new Date().toISOString(),
      responses: checklistItems
        .filter((item) => responses[item.key]?.result)
        .map((item) => ({
          itemKey: item.key,
          result: responses[item.key].result,
          notes: responses[item.key].notes.trim(),
          observedValue: responses[item.key].observedValue.trim(),
          witnessName: responses[item.key].witnessName.trim(),
          witnessRole: responses[item.key].witnessRole.trim(),
          evidenceDocumentIds: responses[item.key].evidenceDocumentId ? [responses[item.key].evidenceDocumentId] : [],
        })),
    })
    if (result) setActiveInspection(null)
  }

  return (
    <section className="job-workspace-section inspection-checklist-control" data-testid="inspection-checklist-control">
      <div className="section-heading inspection-checklist-heading">
        <ClipboardCheck size={18} />
        <div>
          <h3>{t('Inspection checklists')}</h3>
          <p>{t('Versioned questions, field responses, corrective observations, and approval-backed sign-off.')}</p>
        </div>
        {canCoordinate ? (
          <div className="inspection-checklist-heading-actions">
            <button type="button" className="icon-button" aria-label={t('Create inspection template')} title={t('Create inspection template')} onClick={() => { setTemplateDraft(resetTemplateDraft()); setScheduleDraft(null); setActiveInspection(null) }}>
              <Plus size={17} />
            </button>
            <button type="button" className="secondary-button" disabled={!templates.length || submitting} onClick={beginSchedule}>
              <CalendarDays size={15} />{t('Schedule')}
            </button>
          </div>
        ) : null}
      </div>

      {templateDraft ? (
        <form className="inspection-template-editor" data-testid="inspection-template-form" onSubmit={submitTemplate}>
          <div className="form-grid compact-form">
            <label>{t('Template name')}<input autoFocus required minLength="3" maxLength="160" value={templateDraft.name} onChange={(event) => setTemplateDraft({ ...templateDraft, name: event.target.value })} /></label>
            <label>{t('Template key')}<input required pattern="[A-Za-z0-9_ \-]+" value={templateDraft.templateKey} onChange={(event) => setTemplateDraft({ ...templateDraft, templateKey: event.target.value })} placeholder="facade_quality" /></label>
            <label>{t('Type')}<input required value={templateDraft.inspectionType} onChange={(event) => setTemplateDraft({ ...templateDraft, inspectionType: event.target.value })} /></label>
            <label>{t('Discipline')}<select value={templateDraft.discipline} onChange={(event) => setTemplateDraft({ ...templateDraft, discipline: event.target.value })}><option value="quality">{t('Quality')}</option><option value="safety">{t('Safety')}</option><option value="closeout">{t('Closeout')}</option><option value="general">{t('General')}</option></select></label>
            <label className="checkbox-label form-span"><input type="checkbox" checked={templateDraft.installationQc} onChange={(event) => setTemplateDraft({
              ...templateDraft,
              installationQc: event.target.checked,
              inspectionType: event.target.checked ? 'installation_qc' : templateDraft.inspectionType,
              discipline: event.target.checked ? 'quality' : templateDraft.discipline,
            })} />{t('Govern task completion as installation QC')}</label>
            {templateDraft.installationQc ? (
              <>
                <label>{t('Default installation stage')}<select value={templateDraft.defaultInstallationStage} onChange={(event) => setTemplateDraft({ ...templateDraft, defaultInstallationStage: event.target.value })}>{installationStages.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                <label>{t('Default control point')}<select value={templateDraft.defaultControlPoint} onChange={(event) => setTemplateDraft({ ...templateDraft, defaultControlPoint: event.target.value })}>{controlPoints.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              </>
            ) : null}
          </div>
          <fieldset className="inspection-template-items">
            <legend>{t('Checklist items')}</legend>
            {templateDraft.items.map((item, index) => (
              <div className="inspection-template-item" key={`${item.key}-${index}`}>
                <label className="inspection-template-prompt">{t('Prompt')}<input required minLength="3" maxLength="300" value={item.prompt} onChange={(event) => setTemplateDraft({ ...templateDraft, items: templateDraft.items.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, prompt: event.target.value } : candidate) })} /></label>
                {templateDraft.installationQc ? <label className="inspection-template-criteria">{t('Acceptance criteria')}<textarea required minLength="3" maxLength="600" value={item.acceptanceCriteria} onChange={(event) => setTemplateDraft({ ...templateDraft, items: templateDraft.items.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, acceptanceCriteria: event.target.value } : candidate) })} /></label> : null}
                <label>{t('Failure severity')}<select value={item.failureSeverity} onChange={(event) => setTemplateDraft({ ...templateDraft, items: templateDraft.items.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, failureSeverity: event.target.value } : candidate) })}><option value="low">{t('Low')}</option><option value="medium">{t('Medium')}</option><option value="high">{t('High')}</option><option value="critical">{t('Critical')}</option></select></label>
                {templateDraft.installationQc ? <label>{t('Control point')}<select value={item.controlPoint} onChange={(event) => setTemplateDraft({ ...templateDraft, items: templateDraft.items.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, controlPoint: event.target.value } : candidate) })}>{controlPoints.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label> : null}
                <label className="checkbox-label"><input type="checkbox" checked={item.allowNotApplicable} onChange={(event) => setTemplateDraft({ ...templateDraft, items: templateDraft.items.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, allowNotApplicable: event.target.checked } : candidate) })} />{t('Allow N/A')}</label>
                {templateDraft.installationQc ? (
                  <>
                    <label className="checkbox-label"><input type="checkbox" checked={item.evidenceRequired} onChange={(event) => setTemplateDraft({ ...templateDraft, items: templateDraft.items.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, evidenceRequired: event.target.checked } : candidate) })} />{t('Evidence required to pass')}</label>
                    <label className="checkbox-label"><input type="checkbox" checked={item.measurementRequired} onChange={(event) => setTemplateDraft({ ...templateDraft, items: templateDraft.items.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, measurementRequired: event.target.checked } : candidate) })} />{t('Measured value required')}</label>
                    {item.measurementRequired ? <label>{t('Measurement unit')}<input maxLength="40" value={item.measurementUnit} onChange={(event) => setTemplateDraft({ ...templateDraft, items: templateDraft.items.map((candidate, itemIndex) => itemIndex === index ? { ...candidate, measurementUnit: event.target.value } : candidate) })} placeholder="mm, bar, Nm" /></label> : null}
                  </>
                ) : null}
                <button type="button" className="icon-button" aria-label={t('Remove checklist item {number}', { number: index + 1 })} disabled={templateDraft.items.length <= 2} onClick={() => setTemplateDraft({ ...templateDraft, items: templateDraft.items.filter((_, itemIndex) => itemIndex !== index).map((candidate, itemIndex) => ({ ...candidate, key: `item_${itemIndex + 1}` })) })}><X size={15} /></button>
              </div>
            ))}
            <button type="button" className="secondary-button" disabled={templateDraft.items.length >= 50} onClick={() => setTemplateDraft({ ...templateDraft, items: [...templateDraft.items, { key: `item_${templateDraft.items.length + 1}`, prompt: '', acceptanceCriteria: '', controlPoint: 'check', required: true, allowNotApplicable: false, evidenceRequired: false, measurementRequired: false, measurementUnit: '', failureSeverity: 'medium' }] })}><Plus size={15} />{t('Add item')}</button>
          </fieldset>
          <div className="form-actions"><button className="primary-button" disabled={submitting || templateDraft.items.some((item) => item.prompt.trim().length < 3 || (templateDraft.installationQc && item.acceptanceCriteria.trim().length < 3))}><ClipboardCheck size={15} />{t('Retain template')}</button><button type="button" className="secondary-button" onClick={() => setTemplateDraft(null)}>{t('Cancel')}</button></div>
        </form>
      ) : null}

      {scheduleDraft ? (
        <form className="inspection-schedule-form form-grid compact-form" data-testid="inspection-schedule-form" onSubmit={submitSchedule}>
          <label>{t('Template')}<select required value={scheduleDraft.templateId} onChange={(event) => {
            const template = templates.find((candidate) => candidate.id === event.target.value)
            setScheduleDraft({
              ...createScheduleDraft(template),
              scheduledAt: scheduleDraft.scheduledAt,
              notes: scheduleDraft.notes,
            })
          }}>{templates.filter((template) => template.status === 'active').map((template) => <option key={template.id} value={template.id}>{template.name} / v{template.versionNumber}{template.data?.installationQc ? ` / ${t('installation QC')}` : ''}</option>)}</select></label>
          <label>{t('Scheduled date and time')}<input required type="datetime-local" value={scheduleDraft.scheduledAt} onChange={(event) => setScheduleDraft({ ...scheduleDraft, scheduledAt: event.target.value })} /></label>
          <label className="form-span">{t('Inspection title')}<input required minLength="3" maxLength="240" value={scheduleDraft.title} onChange={(event) => setScheduleDraft({ ...scheduleDraft, title: event.target.value })} /></label>
          {scheduleTemplate?.data?.installationQc ? (
            <>
              <label>{t('Installation task')}<select required value={scheduleDraft.taskId} onChange={(event) => {
                const task = eligibleTasks.find((candidate) => candidate.id === event.target.value)
                const assignment = activeAssignments.find((candidate) => candidate.workerId === task?.assigneeId)
                  || activeAssignments.find((candidate) => candidate.id === scheduleDraft.assignmentId)
                  || activeAssignments[0]
                setScheduleDraft({
                  ...scheduleDraft,
                  taskId: event.target.value,
                  assignmentId: assignment?.id || '',
                  assignedWorkerId: assignment?.workerId || '',
                  inspector: assignment?.workerName || '',
                })
              }}><option value="">{t('Select active task')}</option>{eligibleTasks.map((task) => <option value={task.id} key={task.id}>{task.title}{task.assigneeId ? ` / ${t('assigned')}` : ''}</option>)}</select></label>
              <label>{t('Assigned inspector')}<select required value={scheduleDraft.assignmentId} onChange={(event) => {
                const assignment = activeAssignments.find((candidate) => candidate.id === event.target.value)
                setScheduleDraft({
                  ...scheduleDraft,
                  assignmentId: event.target.value,
                  assignedWorkerId: assignment?.workerId || '',
                  inspector: assignment?.workerName || '',
                })
              }}><option value="">{t('Select active assignment')}</option>{activeAssignments.map((assignment) => <option value={assignment.id} key={assignment.id}>{assignment.workerName || assignment.workerId} / {t(formatStatus(assignment.status))}</option>)}</select></label>
              <label>{t('Work location')}<input required minLength="2" maxLength="240" value={scheduleDraft.workLocation} onChange={(event) => setScheduleDraft({ ...scheduleDraft, workLocation: event.target.value })} placeholder={t('Building, level, room, grid, or asset')} /></label>
              <label>{t('Installation stage')}<select value={scheduleDraft.installationStage} onChange={(event) => setScheduleDraft({ ...scheduleDraft, installationStage: event.target.value })}>{installationStages.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label>{t('Control point')}<select value={scheduleDraft.controlPoint} onChange={(event) => setScheduleDraft({ ...scheduleDraft, controlPoint: event.target.value })}>{controlPoints.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label className="form-span">{t('Reference basis')}<textarea required minLength="3" maxLength="600" value={scheduleDraft.referenceBasis} onChange={(event) => setScheduleDraft({ ...scheduleDraft, referenceBasis: event.target.value })} placeholder={t('Approved drawing, specification clause, method statement, manufacturer requirement, or accepted sample.')} /></label>
              <fieldset className="installation-qc-reference-documents form-span">
                <legend>{t('Current retained references')}</legend>
                {(job.documents || EMPTY_LIST).length ? (job.documents || EMPTY_LIST).map((document) => (
                  <label className="checkbox-label" key={document.id}><input type="checkbox" checked={scheduleDraft.referenceDocumentIds.includes(document.id)} onChange={(event) => setScheduleDraft({
                    ...scheduleDraft,
                    referenceDocumentIds: event.target.checked
                      ? [...scheduleDraft.referenceDocumentIds, document.id]
                      : scheduleDraft.referenceDocumentIds.filter((id) => id !== document.id),
                  })} />{document.title || document.filename || document.id}{document.revision ? ` / ${t('rev')} ${document.revision}` : ''}</label>
                )) : <span>{t('No retained job documents. The written reference basis remains mandatory.')}</span>}
              </fieldset>
            </>
          ) : <label>{t('Inspector')}<input value={scheduleDraft.inspector} onChange={(event) => setScheduleDraft({ ...scheduleDraft, inspector: event.target.value })} /></label>}
          <div className="inspection-template-summary"><strong>{t('{count} checks', { count: scheduleTemplate?.items?.length || 0 })}</strong><span>{t(formatStatus(scheduleTemplate?.discipline || 'general'))} / {t('immutable')} v{scheduleTemplate?.versionNumber || '-'}</span></div>
          {scheduleTemplate?.data?.installationQc && (!eligibleTasks.length || !activeAssignments.length) ? <p className="workflow-note form-span">{t('Create an active task and approved worker assignment before scheduling installation QC.')}</p> : null}
          <div className="form-actions form-span"><button className="primary-button" disabled={submitting || !scheduleDraft.templateId || !toIsoDateTime(scheduleDraft.scheduledAt) || !installationScheduleReady}><CalendarDays size={15} />{scheduleTemplate?.data?.installationQc ? t('Schedule control point') : t('Schedule checklist')}</button><button type="button" className="secondary-button" onClick={() => setScheduleDraft(null)}>{t('Cancel')}</button></div>
        </form>
      ) : null}

      {activeInspection ? (
        <form className="inspection-checklist-form" data-testid="inspection-checklist-form" onSubmit={submitChecklist}>
          <div className="inspection-checklist-run-heading"><div><strong>{activeInspection.title}</strong><small>{activeInspection.checklist.snapshot.templateName} / v{activeInspection.checklist.snapshot.templateVersion}</small></div><span className={`status status-${activeInspection.status}`}>{t(formatStatus(activeInspection.status))}</span></div>
          {activeInstallationQc ? (
            <div className="installation-qc-context" data-testid="installation-qc-context">
              <div><span>{t('Location')}</span><strong>{activeInstallationQc.workLocation}</strong></div>
              <div><span>{t('Stage')}</span><strong>{t(formatStatus(activeInstallationQc.installationStage))}</strong></div>
              <div><span>{t('Control')}</span><strong>{t(formatStatus(activeInstallationQc.controlPoint))}</strong></div>
              <div><span>{t('Assigned worker')}</span><strong>{activeInstallationQc.assignedWorkerName || activeInstallationQc.assignedWorkerId}</strong></div>
              <p><strong>{t('Reference basis')}:</strong> {activeInstallationQc.referenceBasis}</p>
              {!activeInstallationQc.sourceCurrent ? <p className="installation-qc-blocked"><TriangleAlert size={15} />{t('Source changed. Office review and a newly scheduled control are required before submission.')}</p> : null}
            </div>
          ) : null}
          <div className="inspection-checklist-items">
            {checklistItems.map((item, index) => {
              const response = responses[item.key] || { result: '', notes: '', evidenceDocumentId: '', observedValue: '', witnessName: '', witnessRole: '' }
              return (
                <fieldset className={`inspection-checklist-item inspection-result-${response.result || 'pending'}`} key={item.key}>
                  <legend>{index + 1}. {item.prompt}</legend>
                  {activeInstallationQc ? <p className="inspection-acceptance-criteria"><strong>{t('Accept when')}:</strong> {item.acceptanceCriteria || item.prompt}</p> : null}
                  <div className="inspection-result-options" role="radiogroup" aria-label={t('Result for {prompt}', { prompt: item.prompt })}>
                    {[['pass', t('Pass'), Check], ['fail', t('Fail'), TriangleAlert], ...(item.allowNotApplicable ? [['not_applicable', t('N/A'), Ban]] : [])].map(([value, label, Icon]) => (
                      <label key={value} className={response.result === value ? 'selected' : ''}><input required={item.required} type="radio" name={`inspection-${item.key}`} value={value} checked={response.result === value} onChange={() => updateResponse(item.key, { result: value })} />{createElement(Icon, { size: 15 })}{label}</label>
                    ))}
                  </div>
                  <label>{t('Item notes')}<textarea required={response.result === 'fail' && !response.evidenceDocumentId} value={response.notes} onChange={(event) => updateResponse(item.key, { notes: event.target.value })} placeholder={response.result === 'fail' ? t('Describe the defect, immediate control, or required correction.') : t('Optional retained context.')} /></label>
                  <label>{t('Evidence link')}<select required={response.result === 'pass' && item.evidenceRequired} value={response.evidenceDocumentId} onChange={(event) => updateResponse(item.key, { evidenceDocumentId: event.target.value })}><option value="">{t('No linked document')}</option>{(job.documents || EMPTY_LIST).map((document) => <option value={document.id} key={document.id}>{document.title || document.filename || document.id}</option>)}</select></label>
                  {item.measurementRequired ? <label>{t('Observed value')}{item.measurementUnit ? ` (${item.measurementUnit})` : ''}<input required={response.result === 'pass'} maxLength="500" value={response.observedValue} onChange={(event) => updateResponse(item.key, { observedValue: event.target.value })} placeholder={t('Retained measured result')} /></label> : null}
                  {item.controlPoint === 'witness' ? (
                    <>
                      <label>{t('Witness name')}<input required={response.result === 'pass'} minLength="2" maxLength="160" value={response.witnessName} onChange={(event) => updateResponse(item.key, { witnessName: event.target.value })} /></label>
                      <label>{t('Witness role')}<input required={response.result === 'pass'} minLength="2" maxLength="160" value={response.witnessRole} onChange={(event) => updateResponse(item.key, { witnessRole: event.target.value })} /></label>
                    </>
                  ) : null}
                  <small>{t('{point} point / {severity} failure severity{evidence}{na}', {
                    point: t(formatStatus(item.controlPoint || 'check')),
                    severity: t(formatStatus(item.failureSeverity)),
                    evidence: item.evidenceRequired ? ` / ${t('pass evidence required')}` : '',
                    na: item.allowNotApplicable ? ` / ${t('N/A allowed')}` : '',
                  })}</small>
                </fieldset>
              )
            })}
          </div>
          <label className="inspection-run-notes">{t('Inspection summary')}<textarea maxLength="4000" value={submissionNotes} onChange={(event) => setSubmissionNotes(event.target.value)} placeholder={t('Record overall context, limitations, and follow-up.')} /></label>
          <p className="workflow-note">{t('Submission freezes these responses, creates corrective observations for failed items, and requests an independent approval. Offline capture may queue evidence, but never releases a hold point or completes the task.')}</p>
          <div className="form-actions"><button className="primary-button" disabled={submitting || !checklistReady || activeInstallationQc?.sourceCurrent === false}><ShieldCheck size={15} />{navigator.onLine === false ? t('Save checklist offline') : t('Submit for review')}</button><button type="button" className="secondary-button" onClick={() => setActiveInspection(null)}>{t('Cancel')}</button></div>
        </form>
      ) : null}

      <div className="inspection-checklist-register">
        {checklistInspections.length ? checklistInspections.map((inspection) => {
          const summary = inspection.checklist.summary
          const pending = (job.approvals || EMPTY_LIST).find((approval) => approval.id === inspection.approvalId && approval.status === 'pending')
          const installationQc = inspection.installationQc
          const workerCanFill = !installationQc
            || operator?.authenticated !== true
            || (fieldScoped && operator?.worker?.id === installationQc.assignedWorkerId)
          const canFill = ['scheduled', 'in_progress', 'pending_review', 'failed', 'rejected'].includes(inspection.status)
            && !pending
            && workerCanFill
            && installationQc?.sourceCurrent !== false
          return (
            <article className="inspection-checklist-row" key={inspection.id} data-testid={`inspection-checklist-${inspection.id}`}>
              <div>
                <strong>{inspection.title}</strong>
                <small>{inspection.checklist.snapshot.templateName} / v{inspection.checklist.snapshot.templateVersion} / {formatDateTime(inspection.scheduledAt)}</small>
                {installationQc ? <span>{installationQc.workLocation} / {t(formatStatus(installationQc.installationStage))} / {t(formatStatus(installationQc.controlPoint))} / {installationQc.assignedWorkerName || installationQc.assignedWorkerId}</span> : null}
                <span>{summary
                  ? t('{responses} responses / {failed} failed', { responses: summary.responseCount, failed: summary.failedCount })
                  : t('{count} checks waiting', { count: inspection.checklist.snapshot.items.length })}</span>
                {installationQc && installationQc.sourceCurrent === false ? <span className="installation-qc-stale">{t('Retained source is stale; release and task completion are blocked.')}</span> : null}
              </div>
              <div className="inspection-checklist-row-actions"><span className={`status status-${installationQc?.effectiveStatus || inspection.status}`}>{t(formatStatus(installationQc?.effectiveStatus || inspection.status))}</span>{pending && canApprove ? <button type="button" className="secondary-button" onClick={() => onOpenApprovals({ approvalId: pending.id })}><ShieldCheck size={14} />{t('Review')}</button> : null}{canFill ? <button type="button" className="secondary-button" disabled={submitting} onClick={() => beginChecklist(inspection)}><ClipboardList size={14} />{inspection.checklist.submissions.length ? t('Correct and resubmit') : t('Complete')}</button> : null}</div>
            </article>
          )
        }) : <p className="workflow-note">{t('No versioned inspection checklist has been scheduled for this job.')}</p>}
      </div>
      {fieldScoped ? <p className="workflow-note">{t('Assigned field workers can complete scheduled checklists. Template and schedule control remain with the office.')}</p> : null}
    </section>
  )
}



export default InspectionChecklistControl

export { InspectionChecklistControl }
