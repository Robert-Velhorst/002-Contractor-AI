import { useState } from 'react'
import { ArrowUpRight, Check, RefreshCw, TriangleAlert } from 'lucide-react'
import './OperationalRecoveryPortfolio.css'

const TYPES = {
  worker_availability: ['Uitvoerder afwezig', 'Worker unavailable'],
  field_progress_blocker: ['Blokkade buiten gemeld', 'Field blocker reported'],
  material_receipt: ['Afwijking bij levering', 'Delivery discrepancy'],
  material_requirement_shortfall: ['Materiaaltekort', 'Material shortfall'],
  safety_incident: ['Veiligheidsmelding', 'Safety incident'],
  quality_nonconformance: ['Kwaliteitsafwijking', 'Quality nonconformance'],
  equipment_unavailable: ['Materieel niet inzetbaar', 'Equipment unavailable'],
}
const PRIORITIES = {
  immediate: ['Direct beoordelen', 'Review immediately'],
  today: ['Vandaag beoordelen', 'Review today'],
  plan: ['Inplannen', 'Plan follow-up'],
  review: ['Bron controleren', 'Verify source'],
}
const ACTIONS = {
  safety_review: ['Veiligheid direct beoordelen', 'Review safety immediately'],
  quality_review: ['Kwaliteitsafwijking onafhankelijk beoordelen', 'Independently review quality issue'],
  protect_critical_path: ['Kritieke werkzaamheden en afhankelijkheden beoordelen', 'Review critical work and dependencies'],
  confirm_workforce_coverage: ['Vervanging en alle geraakte opdrachten beoordelen', 'Review replacement and all affected jobs'],
  review_client_appointments: ['Klantafspraken en gevolgen beoordelen', 'Review client appointments and impact'],
  review_contract_dates: ['Contractuele mijlpalen beoordelen', 'Review contractual milestones'],
  secure_material: ['Materiaalbeschikbaarheid en alternatief controleren', 'Check material availability and alternatives'],
  review_material_receipt: ['Ontvangst controleren vóór gebruik', 'Review receipt before use'],
  coordinate_field_recovery: ['Herstel met de uitvoerende afstemmen', 'Coordinate recovery with the field worker'],
  check_equipment: ['Materieelstatus en veilige inzetbaarheid controleren', 'Check equipment status and safe availability'],
  verify_source: ['Broninformatie controleren en verantwoordelijke kiezen', 'Verify source information and assign an owner'],
}

function dateLabel(value, locale, options = {}) {
  if (!value || !Number.isFinite(Date.parse(value))) return locale === 'nl-NL' ? 'Niet gepland' : 'Not scheduled'
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', ...options }).format(new Date(value))
}

function describeImpact(source, locale) {
  const nl = locale === 'nl-NL'
  const impact = source.operationalImpact || {}
  const lines = []
  const number = value => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)
  for (const material of impact.materialLines || []) {
    if (material.shortfallQuantity > 0) {
      lines.push(nl
        ? `${material.itemName}: ${number(material.shortfallQuantity)} ${material.unit || ''} tekort${material.neededBy ? `; nodig ${dateLabel(material.neededBy, locale)}` : ''}`
        : `${material.itemName}: ${number(material.shortfallQuantity)} ${material.unit || ''} short${material.neededBy ? `; needed ${dateLabel(material.neededBy, locale)}` : ''}`)
    }
    if (material.pendingInspectionQuantity > 0) lines.push(nl
      ? `${material.itemName}: ${number(material.pendingInspectionQuantity)} ${material.unit || ''} wacht op inspectie en is niet beschikbaar`
      : `${material.itemName}: ${number(material.pendingInspectionQuantity)} ${material.unit || ''} awaiting inspection and unavailable`)
    if (material.siteDamagedQuantity > 0) lines.push(nl
      ? `${material.itemName}: ${number(material.siteDamagedQuantity)} ${material.unit || ''} beschadigd op locatie`
      : `${material.itemName}: ${number(material.siteDamagedQuantity)} ${material.unit || ''} damaged at site`)
  }
  if (impact.crossJobConflictCount > 0) lines.push(nl
    ? `${impact.crossJobConflictCount} roosterconflict(en)${impact.crossJobConflictListComplete ? '' : ' (lijst onvolledig)'}`
    : `${impact.crossJobConflictCount} schedule conflict(s)${impact.crossJobConflictListComplete ? '' : ' (list incomplete)'}`)
  if (impact.clientAppointmentCount > 0) lines.push(nl
    ? `${impact.clientAppointmentCount} klantafspraak/-afspraken${impact.clientAppointmentsComplete ? '' : ' (lijst onvolledig)'}`
    : `${impact.clientAppointmentCount} client appointment(s)${impact.clientAppointmentsComplete ? '' : ' (list incomplete)'}`)
  if (impact.affectedTaskCount > 0) {
    const critical = impact.criticalTaskCount > 0
    lines.push(nl
      ? `${impact.affectedTaskCount} geraakte taak/ taken${critical ? `; ${impact.criticalTaskCount} kritiek` : ''}`
      : `${impact.affectedTaskCount} affected task(s)${critical ? `; ${impact.criticalTaskCount} critical` : ''}`)
  }
  if (impact.impactedCommitmentCount > 0) lines.push(nl
    ? `${impact.impactedCommitmentCount} contractuele mijlpaal/mijlpalen opnieuw beoordelen`
    : `${impact.impactedCommitmentCount} contract milestone(s) need review`)
  if (impact.safetyReviewRequired) {
    const severity = source.severity ? ` (${source.severity})` : ''
    lines.push(`${nl ? 'Menselijke veiligheidsbeoordeling vereist' : 'Human safety review required'}${severity}`)
  }
  if (impact.qualityReviewRequired) {
    const due = impact.qualityDueAt ? `; ${nl ? 'termijn' : 'due'} ${dateLabel(impact.qualityDueAt, locale)}` : ''
    const integrityFailed = impact.qualityIntegrityValid !== true || impact.qualityCorrectionIntegrityValid !== true
      || (source.status === 'closed' && impact.qualityClosureIntegrityValid !== true)
    lines.push(`${nl ? 'Onafhankelijke kwaliteitsafsluiting vereist' : 'Independent quality closure required'}${due}${integrityFailed ? `; ${nl ? 'integriteitscontrole vereist' : 'integrity review required'}` : ''}`)
  }
  if (impact.progressPercent != null || impact.blockerCount > 0) lines.push(nl
    ? `Voortgang ${impact.progressPercent == null ? 'onbekend' : `${number(impact.progressPercent)}%`}; blokkades ${impact.blockerCount ?? 0}`
    : `Progress ${impact.progressPercent == null ? 'unknown' : `${number(impact.progressPercent)}%`}; blockers ${impact.blockerCount ?? 0}`)
  if (impact.equipment) {
    const equipment = impact.equipment
    const dates = equipment.neededFrom || equipment.neededUntil
      ? `; ${dateLabel(equipment.neededFrom, locale)} - ${dateLabel(equipment.neededUntil, locale)}` : ''
    lines.push(`${nl ? 'Materieel' : 'Equipment'}${equipment.name ? ` ${equipment.name}` : ''}: ${equipment.status || (nl ? 'status onbekend' : 'status unknown')}${equipment.inspectionStatus ? `; ${nl ? 'keuring' : 'inspection'} ${equipment.inspectionStatus}` : ''}${equipment.fieldSafetyHoldOpen ? `; ${nl ? 'veldwerker meldt' : 'field report'} ${equipment.fieldSafetyIssueType || (nl ? 'conditie onderzoeken' : 'condition review')}` : ''}${dates}`)
  }
  const scheduleLabels = {
    critical_path_affected: nl ? 'kritieke route geraakt' : 'critical path affected',
    linked_noncritical_tasks: nl ? 'gekoppelde taken geraakt' : 'linked tasks affected',
    no_linked_tasks: nl ? 'geen gekoppelde taken' : 'no linked tasks',
    not_comparable: nl ? 'planningsimpact niet vergelijkbaar' : 'schedule impact not comparable',
  }
  if (impact.schedulePathStatus && impact.schedulePathStatus !== 'no_linked_tasks') {
    const path = scheduleLabels[impact.schedulePathStatus] || impact.schedulePathStatus
    if (!lines.some(line => line.includes(path))) lines.push(path)
  }
  return lines
}

function impactRank(item) {
  const sources = item.sources || []
  if (sources.some(source => source.operationalImpact?.safetyReviewRequired
    && ['critical', 'high'].includes(source.severity))) return 0
  if (sources.some(source => source.type === 'quality_nonconformance' && source.severity === 'critical')) return 1
  if (sources.some(source => source.operationalImpact?.safetyReviewRequired)) return 1
  if (sources.some(source => source.type === 'quality_nonconformance' && source.severity === 'high')) return 2
  if (sources.some(source => (source.operationalImpact?.materialLines || []).some(line => line.shortfallQuantity > 0)
    || source.operationalImpact?.equipment?.inspectionBlocksReservation
    || source.operationalImpact?.blockerCount > 0)) return 2
  if (sources.some(source => source.operationalImpact?.crossJobConflictCount > 0
    || source.operationalImpact?.clientAppointmentCount > 0
    || source.operationalImpact?.impactedCommitmentCount > 0
    || source.operationalImpact?.schedulePathStatus === 'critical_path_affected')) return 3
  return 4
}

function hasUnresolvedImpact(item) {
  return (item.sources || []).some(source => {
    const impact = source.operationalImpact || {}
    return source.type === 'quality_nonconformance'
      || source.type === 'equipment_unavailable'
      || impact.safetyReviewRequired
      || impact.qualityReviewRequired
      || impact.qualityIntegrityValid === false
      || impact.qualityCorrectionIntegrityValid === false
      || (impact.materialLines || []).some(line => line.shortfallQuantity > 0
        || line.pendingInspectionQuantity > 0 || line.siteDamagedQuantity > 0)
      || impact.equipment?.inspectionBlocksReservation
      || impact.equipment?.fieldSafetyHoldOpen
      || impact.blockerCount > 0
      || impact.crossJobConflictCount > 0
      || impact.clientAppointmentCount > 0
      || impact.impactedCommitmentCount > 0
      || impact.schedulePathStatus === 'critical_path_affected'
  })
}

export default function OperationalRecoveryPortfolio({ data, locale = 'nl-NL', loading = false, error = '', onRefresh, onOpen }) {
  const [filter, setFilter] = useState('all')
  const nl = locale === 'nl-NL'
  const now = Date.now()
  const sortedCases = [...(data?.cases || [])].sort((a, b) => {
    const triageRank = item => ({ immediate: 0, today: 1, plan: 2, review: 3 }[item.triage?.priority] ?? 4)
    const evidenceReview = item => !item.integrityValid || item.sourceCurrent !== true
    const overdue = item => Number.isFinite(Date.parse(item.dueAt || '')) && Date.parse(item.dueAt) <= now
    const rank = item => evidenceReview(item) || triageRank(item) === 0 ? 0
      : overdue(item) ? 1
        : triageRank(item) === 1 ? 2
          : hasUnresolvedImpact(item) ? 3
            : triageRank(item) === 2 ? 4
              : triageRank(item) === 3 ? 5 : 6
    if (rank(a) !== rank(b)) return rank(a) - rank(b)
    if (impactRank(a) !== impactRank(b)) return impactRank(a) - impactRank(b)
    const date = item => Date.parse(item.dueAt || '') || Number.MAX_SAFE_INTEGER
    return date(a) - date(b) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
  })
  const needsAttention = item => !item.integrityValid || item.sourceCurrent !== true
    || !Number.isFinite(Date.parse(item.dueAt || '')) || Date.parse(item.dueAt) <= now || hasUnresolvedImpact(item)
  const visibleCases = sortedCases.filter(item => filter === 'all'
    || filter === 'action' && needsAttention(item)
    || filter === 'monitor' && !needsAttention(item))

  return <section className="panel recovery-portfolio" aria-labelledby="recovery-portfolio-title">
    <header className="recovery-portfolio-heading">
      <div>
        <p className="eyebrow">{nl ? 'Bedrijfsbreed' : 'Company-wide'}</p>
        <h2 id="recovery-portfolio-title">{nl ? 'Verstoringen en herstel' : 'Disruptions and recovery'}</h2>
        <p>{nl ? 'Actieve herstelcasussen over opdrachten heen. Controleer de actuele bron voordat je herstel uitvoert.' : 'Active recovery cases across jobs. Verify current evidence before carrying out recovery.'}</p>
      </div>
      <button type="button" className="icon-button" aria-label={nl ? 'Overzicht vernieuwen' : 'Refresh overview'} title={nl ? 'Vernieuwen' : 'Refresh'} onClick={onRefresh} disabled={loading}>
        <RefreshCw size={17} />
      </button>
    </header>
    <div className="recovery-portfolio-toolbar">
      <div className="segmented-control" role="group" aria-label={nl ? 'Filter herstelcasussen' : 'Filter recovery cases'}>
        {[[ 'action', nl ? 'Actie nodig' : 'Needs action' ], [ 'monitor', nl ? 'Monitoren' : 'Monitor' ], [ 'all', nl ? 'Alles' : 'All' ]].map(([value, label]) =>
          <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
      </div>
      <span className="recovery-portfolio-count">{visibleCases.length} / {data?.total || 0} {nl ? 'actieve signalen' : 'active disruptions'}</span>
  </div>
    {error ? <p className="recovery-portfolio-error" role="alert">{error}</p> : null}
    {loading && !data ? <p role="status">{nl ? 'Herstelcasussen laden...' : 'Loading recovery cases...'}</p> : null}
    {!loading && data?.truncated ? <p className="recovery-portfolio-note">
      {nl ? 'Door een scanlimiet of bronfout kon niet alles worden gecontroleerd.' : 'A scan limit or source error prevented a complete check.'}
      {Number.isInteger(data?.sourceJobsScanned) ? ` ${data.sourceJobsScanned} ${nl ? 'opdrachten gecontroleerd.' : 'jobs checked.'}` : ''}
    </p> : null}
    {!loading && visibleCases.length === 0 ? <div className="recovery-portfolio-empty">
      <strong>{nl ? 'Geen casussen in deze weergave' : 'No cases in this view'}</strong>
      <span>{nl ? 'Nieuwe verstoringen zijn per opdracht te koppelen aan een verantwoordelijke en opvolgdatum.' : 'New disruptions can be assigned an owner and follow-up date within each job.'}</span>
    </div> : null}
    <div className="recovery-portfolio-list">
      {visibleCases.map(item => {
        const due = Date.parse(item.dueAt || '')
        const urgent = needsAttention(item)
        const impactLines = item.sources?.flatMap(source => describeImpact(source, locale)).filter(Boolean) || []
        const issue = !item.integrityValid ? (nl ? 'Integriteitscontrole mislukt' : 'Integrity check failed')
          : item.sourceCurrent === false ? (nl ? 'Bron gewijzigd; herbeoordeling nodig' : 'Source changed; review required')
            : item.sourceCurrent !== true ? (nl ? 'Bronstatus kon niet worden gecontroleerd' : 'Source status could not be verified')
              : !Number.isFinite(due) ? (nl ? 'Opvolgdatum ontbreekt' : 'Follow-up date missing')
                : due <= now ? (nl ? 'Opvolgdatum verstreken' : 'Follow-up overdue') : null
        const priority = PRIORITIES[item.triage?.priority]
        const nextAction = ACTIONS[item.triage?.action]
        return <article className={`recovery-portfolio-row${urgent ? ' is-urgent' : ''}`} key={item.id}>
          <span className={`recovery-portfolio-status${urgent ? ' is-urgent' : ''}`} aria-label={issue || (nl ? 'Actief' : 'Active')}>
            {urgent ? <TriangleAlert size={17} /> : <Check size={17} />}
          </span>
          <div className="recovery-portfolio-main">
            <div className="recovery-portfolio-jobline">
              <strong>{item.jobTitle}</strong>
              <span className="tag">{item.kind === 'unassigned_source' ? (nl ? 'Nog niet opgevolgd' : 'Unassigned')
                : item.status === 'monitoring' ? (nl ? 'Monitoren' : 'Monitoring') : (nl ? 'Open' : 'Open')}</span>
              {priority ? <span className={`recovery-triage-badge is-${item.triage.priority}`}>{priority[nl ? 0 : 1]}</span> : null}
            </div>
            <p>{item.sources?.length ? item.sources.map(source => {
              const type = TYPES[source.type]?.[nl ? 0 : 1] || source.type
              if (source.type === 'worker_availability' && source.title?.includes(':')) return `${type}: ${source.title.split(':', 1)[0]}`
              return type
            }).join(' · ') : nl ? 'Bron niet beschikbaar' : 'Source unavailable'}</p>
            {impactLines.length ? (
        <small className="recovery-portfolio-impact">{impactLines.join(' · ')}</small>
            ) : null}
            {nextAction ? <small className="recovery-portfolio-next-action">{nl ? 'Eerstvolgende controle:' : 'Next review:'} {nextAction[nl ? 0 : 1]}</small> : null}
            {issue ? <small className="recovery-portfolio-warning">{issue}</small> : null}
            {item.affectedJobs?.length ? <small>{nl ? 'Ook geraakt:' : 'Also affected:'} {item.affectedJobs.map(job => job.title).join(', ')}</small> : null}
          </div>
          <div className="recovery-portfolio-meta">
            <span>{nl ? 'Verantwoordelijk' : 'Owner'}</span><strong>{item.owner || (nl ? 'Niet toegewezen' : 'Unassigned')}</strong>
            <span>{nl ? 'Opvolgen voor' : 'Due'}</span><strong>{dateLabel(item.dueAt, locale, { ...(item.dueAt ? { timeStyle: 'short' } : {}) })}</strong>
          </div>
          <button type="button" className="icon-button table-action" aria-label={`${nl ? 'Open opdracht' : 'Open job'}: ${item.jobTitle}`} onClick={() => onOpen?.(item)}>
            <ArrowUpRight size={17} />
          </button>
        </article>
      })}
    </div>
  </section>
}
