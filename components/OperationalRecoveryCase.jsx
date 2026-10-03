import { lazy, Suspense, useMemo } from 'react'
import { createDateFormatter } from '../format-date.mjs'

const OperationalRecoveryActions = lazy(() => import('./OperationalRecoveryActions'))
const ClientDateImpactReview = lazy(() => import('./ClientDateImpactReview'))
const RecoveryCostImpactReview = lazy(() => import('./RecoveryCostImpactReview'))

const TYPE = { worker_availability: 'Beschikbaarheid uitvoerder', field_progress_blocker: 'Blokkade uitvoerende', material_receipt: 'Materiaaltekort of leveringsafwijking', material_requirement_shortfall: 'Materiaaltekort', safety_incident: 'Veiligheidsmelding', quality_nonconformance: 'Kwaliteitsafwijking', equipment_unavailable: 'Materieel niet inzetbaar' }
const PATH_STATUS = { critical_path_affected: 'kritieke pad geraakt', linked_noncritical_tasks: 'gekoppelde niet-kritieke taken geraakt', no_linked_tasks: 'geen taak rechtstreeks gekoppeld', not_comparable: 'niet vergelijkbaar' }
const BASELINE_STATUS = { approved_current: 'actuele goedgekeurde basisplanning', approved_stale: 'goedgekeurde basisplanning verouderd', pending_approval: 'basisplanning wacht op goedkeuring', missing: 'geen goedgekeurde basisplanning' }
const DATE_RELATION = { baseline_on_or_before_date: 'basisplanning eindigt op of voor deze contractdatum', baseline_after_date: 'basisplanning eindigt na deze contractdatum', not_comparable: 'contractdatum niet te vergelijken met huidige basisplanning' }
const MATERIAL_QUANTITIES = [['shortfallQuantity', 'tekort', ''], ['pendingInspectionQuantity', 'wacht op inspectie', ' (niet beschikbaar)'], ['siteDamagedQuantity', 'beschadigd', '']]

function materialSummary(lines) {
  return MATERIAL_QUANTITIES.map(([field, label, suffix]) => {
    const group = []
    for (const line of lines || []) {
      const quantity = line[field]
      if (quantity > 0) group.push(`${line.itemName}: ${quantity} ${line.unit}`)
    }
    return group.length ? ` / ${label} ${group.join(', ')}${suffix}` : ''
  }).join('')
}

export default function OperationalRecoveryCase({ item, data, api, canEdit, draftScope, commandButtonDisabled, resolution, setResolution, submit, onChanged, onError, onNotice, renderMaterialReadiness, timeZone }) {
  const currentTimeZone = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const formatDate = useMemo(() => createDateFormatter(currentTimeZone), [currentTimeZone])
  const taskBlockers = item.sources.filter(source => source.type === 'field_progress_blocker')
  const taskById = new Map()
  for (const source of taskBlockers) if (!taskById.has(source.id)) taskById.set(source.id, source)
  const instructionBySource = new Map()
  for (const instruction of item.fieldInstructions || []) instructionBySource.set(instruction.sourceId, instruction)
  const selectedReports = taskBlockers.map(source => ({ sourceId: source.id, progressId: resolution[`progress:${source.id}`] || '' }))
  const reportsReady = selectedReports.every(selection => taskById.get(selection.sourceId)?.impact?.followUpReports?.some(report => report.id === selection.progressId))
  const canAct = canEdit && item.sourceCurrent && ['open', 'monitoring'].includes(item.status)

  // Current source identities and material authority invalidate this view, not typing.
  const sourceSummary = useMemo(() => <ul>{item.sources.map(source => <li key={`${source.type}:${source.id}`}><span>{TYPE[source.type] || source.type}: {source.title}
      {source.impact?.schedule?.ready === false ? ' / planning geblokkeerd' : ''}
      {source.impact?.note ? ` / uitvoerdersmelding: ${source.impact.note}` : ''}
      {materialSummary(source.impact?.materialLines)}
      {source.impact?.materialShortfalls?.some(line => line.shortfallQuantity > 0) ? ' / materiaaltekort gekoppeld' : ''}</span>
      {source.type === 'equipment_unavailable' && source.impact?.fieldSafetyHold?.status === 'open' ? <small className="context-source-note">
        Uitvoerdersmelding ({source.impact.fieldSafetyHold.issueType}): {source.impact.fieldSafetyHold.note} / materieel blijft geblokkeerd tot inspectie of herstel is vastgelegd.
      </small> : null}
      {source.type === 'equipment_unavailable' && source.impact && <section className="context-source-note" aria-label="Materieelimpact over opdrachten">
        <strong>Geraakte reserveringen: {source.impact.affectedReservationCount ?? (source.impact.affectedReservations || []).length}</strong>
        {(source.impact.affectedReservations || []).length > 0 ? <ul>{source.impact.affectedReservations.map(reservation => <li key={reservation.reservationId}>
          {reservation.jobTitle} / {formatDate(reservation.neededFrom)} tot {formatDate(reservation.neededUntil)}
        </li>)}</ul> : <p>Geen andere actieve reserveringen gevonden.</p>}
        {source.impact.affectedReservationListComplete === false && <p role="status">De lijst is afgekapt; controleer alle reserveringen in het materieelregister.</p>}
        <strong>Mogelijke alternatieven: {(source.impact.replacementCandidates || []).length}</strong>
        {source.impact.replacementWindowKnown !== true && <p>Geen tijdvakvergelijking mogelijk: de reserveringsperiode is niet volledig of geldig vastgelegd.</p>}
        {(source.impact.replacementCandidates || []).length > 0 ? <ul>{source.impact.replacementCandidates.map(candidate => <li key={candidate.toolId}>
          {candidate.name} / categorie {candidate.category}{candidate.currentLocation ? ` / locatie ${candidate.currentLocation}` : ''} / inspectiestatus {candidate.inspectionStatus}
        </li>)}</ul> : <p>Geen kandidaat met dezelfde geregistreerde categorie en een vrij, bekend tijdvak gevonden.</p>}
        <p>Dit zijn alleen administratieve kandidaten. Technische geschiktheid, toebehoren, staat, locatie en veiligheid zijn niet vastgesteld. Laat dit door een bevoegd persoon controleren; er wordt niets automatisch gereserveerd of omgeboekt.</p>
        {source.impact.replacementCandidateListComplete === false && <p role="status">De kandidatencontrole is afgekapt; aanvullende materieelcontrole is nodig.</p>}
      </section>}
      {source.impact?.materialLines?.map(line => (line.discrepancyReceipts || []).map(receipt => (receipt.reviews || []).map(review => <small className="context-source-note" key={`${source.id}:${receipt.receiptReference}:${review.reviewReference}`}>
        {line.itemName} · ontvangst {receipt.receiptReference} · inspectie {review.reviewReference}: {review.acceptedQuantity} {line.unit} goedgekeurd, {review.damagedQuantity} {line.unit} beschadigd · bewijs {review.evidenceReference}
      </small>)))}
      {source.impact?.scheduleProjection && <small className="context-source-note">{BASELINE_STATUS[source.impact.scheduleProjection.baselineStatus] || 'Basisplanning onbekend'} / {PATH_STATUS[source.impact.scheduleProjection.pathStatus] || 'planningsimpact onbekend'}
        {source.impact.scheduleProjection.affectedTasks.length > 0 ? ` / taken: ${source.impact.scheduleProjection.affectedTasks.map(task => `${task.title}${task.critical ? ' (kritiek pad)' : ''}`).join(', ')}` : ''}
        {source.impact.scheduleProjection.contractComparisons.map(comparison => ` / ${comparison.label}: ${DATE_RELATION[comparison.relation] || 'niet vergelijkbaar'}`).join('')}
      </small>}
      {renderMaterialReadiness?.(source)}
    </li>)}</ul>, [item.sources, renderMaterialReadiness, formatDate])

  return <article className="balance-package">
    <h4>{item.recoveryAction}</h4><p><strong>{item.status === 'resolved' ? 'Afgerond' : item.status === 'cancelled' ? 'Geannuleerd' : item.status === 'monitoring' ? 'Volgen' : 'Open'}</strong>{!item.sourceCurrent ? ' / bron gewijzigd; herbeoordeling vereist' : ''}</p>
    <p>Eigenaar: {item.owner} / opvolgen voor {formatDate(item.dueAt)}</p>
    {item.resolutionBlockers?.length > 0 && <ul aria-label="Openstaande herstelcontroles">{item.resolutionBlockers.map(blocker => <li key={`${blocker.code}:${blocker.sourceId}:${blocker.appointmentId || blocker.commitmentEntryKey || ''}`}>{blocker.message}</li>)}</ul>}
    {sourceSummary}
    {taskBlockers.filter(source => source.impact?.taskId).map(source => {
      const latest = instructionBySource.get(source.id)
      return <form key={`field-instruction-${source.id}`} aria-label={`Bijgewerkte instructie voor taak ${source.impact.taskId}`}
        onSubmit={event => { event.preventDefault(); void submit({ action: 'field_instruction', entryKey: crypto.randomUUID(), caseId: item.id,
          caseHash: item.caseHash, sourceHash: data.sourceHash, sourceId: source.id, text: resolution[`instruction:${source.id}`] || '' }) }}>
        {latest && <p>Laatste instructie voor uitvoerder {source.impact.workerId}: {latest.text}</p>}
        {canAct && <>
          <label>Bijgewerkte instructie voor uitvoerder {source.impact.workerId}<textarea required minLength={3} maxLength={2000}
            value={resolution[`instruction:${source.id}`] || ''} disabled={commandButtonDisabled}
            onChange={event => setResolution(current => ({ ...current, [`instruction:${source.id}`]: event.target.value }))} /></label>
          <button type="submit" className="secondary-button" disabled={commandButtonDisabled || (resolution[`instruction:${source.id}`] || '').trim().length < 3}>Instructie in werkpakket zetten</button>
        </>}
      </form>
    })}
    <p>Klantafspraken moeten opnieuw worden beoordeeld voor een datumwijziging. Planningsvergelijkingen zijn signalen, geen voorspelde vertraging of nieuwe contracttoezegging. Vanuit deze weergave wordt geen klant- of leveranciersbericht verstuurd.</p>
    <Suspense fallback={<p role="status">Contractimpact laden...</p>}>
      <ClientDateImpactReview key={`${item.id}:${data.sourceHash}`} api={api} canEdit={canAct} recoveryCase={item} sourceHash={data.sourceHash} draftScope={draftScope}
        onSubmitted={() => { onNotice('Contractimpact is vastgelegd. De contractdatum en klantcommunicatie zijn ongewijzigd.'); onChanged() }} onError={onError} />
    </Suspense>
    <Suspense fallback={<p role="status">Kostenimpact laden...</p>}>
      <RecoveryCostImpactReview key={`${item.id}:${data.sourceHash}`} api={api} canEdit={canAct} recoveryCase={item} actualCostSources={data.actualCostSources || []} sourceHash={data.sourceHash} draftScope={draftScope}
        onSubmitted={() => { onNotice('Kostenimpact is vastgelegd als interne beoordeling; er is niets geboekt of toegezegd.'); onChanged() }} onError={onError} />
    </Suspense>
    <Suspense fallback={<p role="status">Herstelacties laden...</p>}>
      <OperationalRecoveryActions key={`${item.id}:${data.sourceHash}`} api={api} canEdit={canAct} recoveryCase={item} sourceHash={data.sourceHash} draftScope={draftScope}
        onChanged={onChanged} onError={onError} onNotice={onNotice} />
    </Suspense>
    {item.resolutionEvidence && <p>Herstelbewijs: {item.resolutionEvidence}</p>}
    {item.resolutionReports?.map(report => <p key={report.progressId}>Uitvoerder hervatte taak {report.taskId} op {formatDate(report.reportedAt)}: {report.note}</p>)}
    {canEdit && ['open', 'monitoring'].includes(item.status) && !item.sourceCurrent && <div className="context-actions">
      <label>Beoordeling van gewijzigde bron<input maxLength={2000} value={resolution[`review:${item.id}`] || ''} onChange={event => setResolution(current => ({ ...current, [`review:${item.id}`]: event.target.value }))} /></label>
      <button type="button" className="secondary-button" disabled={commandButtonDisabled || !(resolution[`review:${item.id}`] || '').trim()} onClick={() => void submit({ action: 'update', entryKey: crypto.randomUUID(), caseId: item.id,
        caseHash: item.caseHash, sourceHash: data.sourceHash, reassess: true, reviewNote: resolution[`review:${item.id}`], status: item.status,
        owner: item.owner, dueAt: item.dueAt, recoveryAction: item.recoveryAction })}>Bron opnieuw beoordelen</button>
    </div>}
    {canAct && <div className="context-actions">
      {taskBlockers.map(source => <label key={source.id}>Hervattingsmelding voor taak {source.impact?.taskId || 'zonder taak'}<select required value={resolution[`progress:${source.id}`] || ''} disabled={commandButtonDisabled}
        onChange={event => setResolution(current => ({ ...current, [`progress:${source.id}`]: event.target.value }))}>
        <option value="">Selecteer melding van dezelfde uitvoerende</option>
        {(source.impact?.followUpReports || []).map(report => <option key={report.id} value={report.id}>{formatDate(report.reportedAt)} / {report.note.slice(0, 180)}</option>)}
      </select>{!source.impact?.followUpReports?.length && <small>Wacht op een nieuwe taakvoortgangsmelding van de uitvoerende.</small>}</label>)}
      <label>Bewijs van herstel<input maxLength={2000} value={resolution[item.id] || ''} onChange={event => setResolution(current => ({ ...current, [item.id]: event.target.value }))} /></label>
      <button type="button" className="secondary-button" disabled={commandButtonDisabled || !(resolution[item.id] || '').trim() || item.resolutionBlockers?.length > 0 || taskBlockers.length > 0 && !reportsReady} onClick={() => void submit({ action: 'update', entryKey: crypto.randomUUID(), caseId: item.id,
        caseHash: item.caseHash, sourceHash: data.sourceHash, status: 'resolved', resolutionEvidence: resolution[item.id],
        ...(taskBlockers.length ? { resolutionReports: selectedReports } : {}) })}>Afronden met bewijs</button>
    </div>}
  </article>
}
