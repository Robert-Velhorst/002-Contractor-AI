import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, RefreshCw, UserCheck, Plus, X } from 'lucide-react'
import './WorkBoard.css'

const initialTerms = () => ({ entryKey: crypto.randomUUID(), title: '', role: '', requiredSkills: [], city: '', startsAt: '', endsAt: '', hours: '', capacity: '', rate: '', description: '', materials: '', equipment: '', prerequisites: '', startReleaseRequired: false, waitlistOfferPolicy: 'manual', automaticStandbyCallouts: false, targetTradePartnerId: '', confirmPublication: false })
const localDate = value => { if (!value) return ''; const date = new Date(value); return Number.isFinite(date.getTime()) ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '' }
const companyNameMismatch = (declaredName, registeredName) => Boolean(declaredName?.trim() && registeredName
  && declaredName.trim().toLocaleLowerCase() !== registeredName.trim().toLocaleLowerCase())

export default function WorkBoardOffice({ api, jobId, isOwner = false, refreshKey }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('')
  const [terms, setTerms] = useState(initialTerms), [references, setReferences] = useState({})
  const [skillReferences, setSkillReferences] = useState({})
  const [publishing, setPublishing] = useState(false)
  const url = jobId ? `/api/ledger/jobs/${jobId}/work-board` : '/api/ledger/work-board/accounts'
  const load = useCallback(async () => { const result = await api(url); setData(result); return result }, [api, url])
  useEffect(() => { let live = true; api(url).then(result => { if (live) setData(result) }).catch(reason => { if (live) setError(reason.message) }); return () => { live = false } }, [api, url, refreshKey])
  async function act(fn, message) { if (busy) return; setBusy(true); setError(''); setNotice(''); try { await fn(); await load(); setNotice(message) } catch (reason) { setError(reason.message) } finally { setBusy(false) } }
  const post = (route, body = {}) => api(route, { method: 'POST', body: JSON.stringify(body) })
  const change = event => setTerms(current => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value
    const next = { ...current, [event.target.name]: value }
    if (event.target.name === 'role') {
      const compatible = new Set((data?.suggestions || []).filter(row => !row.role
        || row.role.toLocaleLowerCase() === String(value).trim().toLocaleLowerCase()).map(row => row.sourceTaskId))
      next.sourceTaskIds = (current.sourceTaskIds || []).filter(id => compatible.has(id))
    }
    return next
  })
  const drafts = data?.positions?.filter(position => position.status === 'draft') || []
  const releasedPositions = data?.positions?.filter(position => position.status !== 'draft') || []
  const stalePositions = data?.positions?.filter(position => position.workPackageCurrent === false && position.status === 'open') || []
  const privacyReviewPositions = data?.positions?.filter(position => position.privacyReviewRequired && position.status === 'open') || []
  const selectedPackage = data?.workPackages?.find(item => item.id === terms.workPackageId)
  const coveredTaskIds = new Set((data?.positions || [])
    .filter(position => position.status === 'draft' || (position.status === 'open' && position.workPackageCurrent !== false))
    .flatMap(position => position.sourceTaskIds || []))
  const uncoveredSuggestions = (data?.suggestions || []).filter(suggestion => !coveredTaskIds.has(suggestion.sourceTaskId))
  async function createSuggestedDrafts() {
    if (busy || !uncoveredSuggestions.length) return
    setBusy(true); setError(''); setNotice('')
    const failures = []
    try {
      for (const suggestion of uncoveredSuggestions) {
        const matchingPackages = (data?.workPackages || []).filter(item => !item.blocked && (item.taskIds || []).includes(suggestion.sourceTaskId))
        const workPackage = matchingPackages.length === 1 ? matchingPackages[0] : null
        const linkedMaterials = suggestion.linkedMaterials || []
        const materials = suggestion.materialsText || linkedMaterials.map(item =>
          `${item.name}: ${item.quantity} ${item.unit} (levering te bevestigen)`).join('\n')
        try {
          await post(url, {
            intent: 'save_draft', entryKey: `task-suggestion:${suggestion.sourceTaskId}`,
            title: suggestion.title, role: suggestion.role || '', city: suggestion.city || '',
            description: suggestion.description || '', startsAt: suggestion.startsAt || '', endsAt: suggestion.endsAt || '',
            hours: suggestion.hours ?? '', capacity: '', rate: '', materials, equipment: '', prerequisites: '',
            sourceTaskIds: [suggestion.sourceTaskId], workPackageId: workPackage?.id || '',
            workPackageSourceHash: workPackage?.sourceHash || ''
          })
        } catch (reason) {
          failures.push(`${suggestion.title}: ${reason.message}`)
        }
      }
      const refreshed = await load()
      const savedTaskIds = new Set((refreshed.positions || []).filter(position => position.status === 'draft')
        .flatMap(position => position.sourceTaskIds || []))
      const saved = uncoveredSuggestions.filter(suggestion => savedTaskIds.has(suggestion.sourceTaskId)).length
      setNotice(`${saved} positieconcept(en) klaargezet; niet gepubliceerd en niet toegewezen.${failures.length ? ` ${failures.length} taak/taken moeten handmatig worden beoordeeld.` : ''}`)
      if (failures.length) setError(failures.slice(0, 3).join(' '))
    } catch (reason) {
      setError(reason.message)
    } finally {
      setBusy(false)
    }
  }
  return <section id={jobId ? `work-board-positions-${jobId}` : undefined} className="work-board-office job-workspace-section" aria-label={jobId ? 'Open posities' : 'Toelating uitvoerenden'}>
    <header><h3>{jobId ? 'Open posities' : 'Toelating uitvoerenden'}</h3><a href="/work-board.html" target="_blank" rel="noreferrer"><ExternalLink size={16} />Uitvoerendenportaal</a><button type="button" title="Inschrijvingen verversen" aria-label="Inschrijvingen verversen" disabled={busy} onClick={() => act(load, '')}><RefreshCw size={17} /></button></header>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!data && !error && <p role="status">Laden...</p>}
    {jobId ? <>
      {!!data?.replacementOpportunities?.length && <section aria-label="Uitval en vervanging">
        <h4>Uitval en vervanging</h4>
        <p>Gemelde onbeschikbaarheid die geplande diensten raakt. Gezondheidsredenen worden niet getoond. Beoordeel de verstoring in het opdrachtdossier; een plaatsing verandert pas na de vereiste controle en goedkeuring.</p>
        {data.replacementOpportunities.map(opportunity => <article key={`${opportunity.assignmentId}-${opportunity.availabilityPeriodId}`}>
          <strong>{opportunity.originalWorkerName} · {opportunity.role}</strong>
          <p>{new Date(opportunity.scheduledStart).toLocaleString('nl-NL')} tot {new Date(opportunity.scheduledEnd).toLocaleString('nl-NL')}</p>
          <p>Gemelde verhindering: {new Date(opportunity.availabilityStartsAt).toLocaleString('nl-NL')} tot {opportunity.availabilityReturnUnknown || !opportunity.availabilityEndsAt ? 'tot nader bericht' : new Date(opportunity.availabilityEndsAt).toLocaleString('nl-NL')}{opportunity.availabilityStatus === 'pending_cancellation' ? ' · wijziging wacht op beoordeling' : ''}</p>
          <button type="button" disabled={busy} onClick={() => window.dispatchEvent(new CustomEvent('contractor:dossier-navigate', {
            detail: { area: 'planning', targetId: 'job-operational-recovery', jobId, sourceType: 'worker_availability', sourceId: opportunity.availabilityPeriodId }
          }))}>Open verstoringen en herstel</button>
          {opportunity.standbyAutomation?.status === 'ready' && <p role="status">Automatische stand-byoproep staat klaar voor de eerstvolgende geschikte kandidaat. De planner maakt alleen een tijdelijk aanbod in het uitvoerdersportaal; vervanging blijft apart goedkeuringsplichtig.</p>}
          {opportunity.standbyAutomation?.status === 'waiting_for_response' && <p role="status">Er staat al een tijdelijk stand-by-aanbod open tot {new Date(opportunity.standbyAutomation.expiresAt).toLocaleString('nl-NL')}. Er wordt geen tweede kandidaat benaderd.</p>}
          {opportunity.standbyAutomation?.status === 'worker_accepted' && <p role="status">De stand-by-uitvoerder heeft geaccepteerd. De aannemer kan nu een afzonderlijk vervangingsvoorstel ter goedkeuring indienen.</p>}
          {opportunity.standbyAutomation?.status === 'replacement_pending' && <p role="status">De uitvoerende heeft geaccepteerd; het vervangingsvoorstel wacht op de afzonderlijke goedkeuring.</p>}
          {opportunity.standbyAutomation?.status === 'replacement_placed' && <p role="status">De vervanging is goedgekeurd. Controleer de actuele planning en opdrachtinformatie.</p>}
          {opportunity.standbyAutomation?.status === 'owner_review' && <p role="alert">Automatische stand-byoproep gestopt voor beoordeling: {opportunity.standbyAutomation.reason}</p>}
          {!opportunity.candidates?.length && <p role="status">Geen geschikte standby-uitvoerder gevonden. Beoordeel handmatige herplanning of een andere herstelroute.</p>}
          {opportunity.candidates.map(candidate => {
            const existing = data.standbyCallouts?.find(item => item.assignmentId === opportunity.assignmentId && item.workerId === candidate.id && item.standbyPeriodId === candidate.standbyPeriodId)
            const automationHasOffer = ['waiting_for_response', 'worker_accepted', 'replacement_pending', 'replacement_placed'].includes(opportunity.standbyAutomation?.status)
            return <div className="wb-callout-candidate" key={`${candidate.id}-${candidate.standbyPeriodId}`}>
              <span>{candidate.name} · {candidate.role} · standby {new Date(candidate.standbyStartsAt).toLocaleDateString('nl-NL')}–{new Date(candidate.standbyEndsAt).toLocaleDateString('nl-NL')} · minimaal {candidate.minimumNoticeHours || 0} uur aankondiging</span>
              {!existing && !automationHasOffer && isOwner && <button type="button" disabled={busy} onClick={() => act(() => post(`/api/ledger/jobs/${jobId}/assignments/${opportunity.assignmentId}/standby-callouts`, {
                workerId: candidate.id, standbyPeriodId: candidate.standbyPeriodId, availabilityPeriodId: opportunity.availabilityPeriodId,
                reason: 'Oproep na gemelde verhindering; bekijk de opdracht, periode en voorwaarden voordat je reageert.',
                expiresAt: new Date(Math.min(Date.now() + 48 * 3600000, Date.parse(opportunity.scheduledStart) - 60000)).toISOString()
              }), 'Oproep staat klaar op het persoonlijke werkbord van de uitvoerende; er is geen externe melding verzonden.')}><UserCheck size={16} />Oproep klaarzetten</button>}
              {existing && <span>{existing.status === 'offered' ? 'Oproep aangeboden' : existing.status === 'accepted' ? 'Geaccepteerd, nog niet geplaatst' : existing.status === 'pending_approval' ? 'Vervanging wacht op onafhankelijke goedkeuring' : existing.status === 'placed' ? 'Vervanging goedgekeurd' : existing.status === 'declined' ? 'Afgewezen' : existing.status === 'expired' ? 'Verlopen' : 'Ingetrokken'}</span>}
              {existing?.status === 'accepted' && isOwner && <button type="button" disabled={busy} onClick={() => act(() => post(`/api/ledger/work-board/standby-callouts/${existing.id}/request-replacement`, {
                reason: 'Uitvoerende heeft de specifieke standby-oproep geaccepteerd; plan en actuele voorwaarden opnieuw controleren.'
              }), 'Vervangingsvoorstel aangemaakt. De bestaande opdracht blijft staan tot een bevoegde onafhankelijke goedkeurder beslist.')}><UserCheck size={16} />Vervanging ter goedkeuring voorstellen</button>}
            </div>
          })}
        </article>)}
      </section>}
      {!!data?.standbyCallouts?.length && <section aria-label="Historie standby-oproepen"><h4>Oproepen en reacties</h4>{data.standbyCallouts.map(item => <p key={item.id}>{item.workerId} · {item.status === 'offered' ? 'Aangeboden' : item.status === 'accepted' ? 'Geaccepteerd' : item.status === 'pending_approval' ? 'Ter goedkeuring' : item.status === 'placed' ? 'Goedgekeurd' : item.status === 'declined' ? 'Afgewezen' : item.status === 'expired' ? 'Verlopen' : 'Ingetrokken'}</p>)}</section>}
      {data?.applications?.some(application => ['interested', 'waitlisted', 'offer_pending'].includes(application.status)) && <section aria-label="Belangstelling uitvoerenden"><h4>Belangstelling en wachtlijst</h4>{data.applications.filter(application => ['interested', 'waitlisted', 'offer_pending'].includes(application.status)).sort((a, b) => a.status === b.status ? (a.waitlistPosition || 0) - (b.waitlistPosition || 0) : a.status === 'waitlisted' ? -1 : 1).map(application => <article key={application.id}>
        <strong>{application.applicant.name}</strong><p>{application.applicant.skills.join(', ')} | {application.applicant.region} | {application.position.title}</p>
        {application.status === 'waitlisted' && <p>Wachtlijstplek {application.waitlistPosition} · positie bezet {application.position.filled}/{application.position.capacity}. Een aanbod kan pas als er ruimte is.</p>}
        {application.status === 'offer_pending' && <p>Dit concrete aanbod wacht op reactie van de uitvoerende. Er is nog geen plaatsing.</p>}
        {application.offer && <p role="status">Laatste aanbod: {application.offer.status === 'offered' ? Date.parse(application.offer.expiresAt) <= Date.now() ? 'verlopen' : `wacht op reactie tot ${new Date(application.offer.expiresAt).toLocaleString('nl-NL')}` : application.offer.status === 'accepted' ? 'geaccepteerd' : application.offer.status === 'declined' ? 'geweigerd' : application.offer.status === 'expired' ? 'verlopen' : 'ingetrokken'}</p>}
        {application.placementReview && <div className="wb-placement-review"><strong>Actuele profiel- en plaatsingscontrole</strong><small>Profielvaardigheden zijn zelf opgegeven; kwalificaties en agenda worden opnieuw gecontroleerd bij plaatsing.</small>{application.placementReview.blockers.length > 0 && <ul aria-label="Blokkades voor plaatsing">{application.placementReview.blockers.map((item, index) => <li key={`blocker-${index}`}>{item}</li>)}</ul>}{application.placementReview.advisories.length > 0 && <ul aria-label="Aandachtspunten voor plaatsing">{application.placementReview.advisories.map((item, index) => <li key={`advisory-${index}`}>{item}</li>)}</ul>}{application.placementReview.blockers.length === 0 && application.placementReview.advisories.length === 0 && <p>Geen blokkades gevonden in de huidige controle. Voorwaarden worden bij aanbod en plaatsing opnieuw gecontroleerd.</p>}</div>}
        {application.applicant.status !== 'admitted' ? <p>Toelating is nog niet afgerond.</p> : application.holdReason === 'materials_or_source'
          ? <><p>Plaatsing wacht op bevestiging van de gekoppelde materialen of controle van de werkzaamheid.</p><ul>{application.readiness?.blockers.map((blocker, index) => <li key={`${blocker.code}-${blocker.materialId || index}`}>{blocker.label}</li>)}</ul></>
          : application.holdReasons?.includes('standby_confirmation_required')
            ? <p>Deze uitvoerende staat op afroep voor de positieperiode. Automatische plaatsing is overgeslagen; controleer de afspraak voordat je de plaatsing bevestigt.</p>
          : <p>Beschikbaar voor plaatsing; actuele kwalificaties, capaciteit en agenda worden bij bevestiging opnieuw gecontroleerd.</p>}
        {isOwner && (application.status !== 'offer_pending' || Date.parse(application.offer?.expiresAt || 0) <= Date.now()) && <button type="button" disabled={busy || application.applicant.status !== 'admitted' || !application.readiness?.ready || application.position.filled >= application.position.capacity || Boolean(application.placementReview?.blockers.length)} onClick={() => act(() => post(`/api/ledger/work-board/applications/${application.id}/offer`, { expiresAt: new Date(Date.now() + 48 * 3600000).toISOString() }), 'Concreet aanbod klaargezet op het werkbord. Plaatsing volgt pas na acceptatie en een nieuwe controle.') }><UserCheck size={16} />{application.offer?.status === 'offered' ? 'Nieuw aanbod sturen' : 'Concreet aanbod sturen'}</button>}
      </article>)}</section>}
      {!!drafts.length && <section aria-label="Positieconcepten"><h4>Positieconcepten</h4><p>Concepten zijn alleen zichtbaar voor het kantoorteam. Ze zijn nog niet gepubliceerd en uitvoerenden kunnen zich er niet op inschrijven.</p>
        {drafts.map(draft => <article key={draft.id}><strong>{draft.title || 'Concept zonder titel'}</strong><p>{draft.role || 'Vakgebied ontbreekt'} | {draft.city || 'Plaats ontbreekt'} | Nog niet vrijgegeven</p>
          {!!draft.missingFields?.length && <p>Ontbreekt nog: {draft.missingFields.join(', ')}</p>}
          {!draft.workPackageCurrent && <p role="status">De bron is gewijzigd. Selecteer de actuele werkzaamheid opnieuw en controleer de voorwaarden.</p>}
          <button type="button" disabled={busy} onClick={() => { setTerms({ ...initialTerms(), ...draft, startsAt: localDate(draft.startsAt), endsAt: localDate(draft.endsAt), hours: draft.hours ?? '', capacity: draft.capacity ?? '', rate: draft.rate ?? '', confirmPublication: false }); setPublishing(true) }}>Concept verder bewerken</button>
        </article>)}
      </section>}
      {releasedPositions.length === 0 && <p>Nog geen posities vrijgegeven.</p>}
      {!!stalePositions.length && <p role="status">Gekoppelde werkzaamheden of werkpakketten zijn gewijzigd voor: {stalePositions.map(position => position.title).join(', ')}. Sluit de verouderde positie(s) en geef de gecontroleerde voorwaarden opnieuw vrij. Bestaande plaatsingen blijven behouden.</p>}
      {!!privacyReviewPositions.length && <p role="alert">Openbare voorwaarden bevatten mogelijk gegevens uit het klantdossier voor: {privacyReviewPositions.map(position => position.title).join(', ')}. Deze posities zijn verborgen voor nieuwe uitvoerenden. Controleer ze, sluit de oude inschrijving en geef veilige voorwaarden opnieuw vrij. Bestaande plaatsingen blijven behouden.</p>}
      {releasedPositions.map(position => <article key={position.id}><strong>{position.title}</strong><p>{position.role} | {position.city} | {position.filled}/{position.capacity} bezet | {position.status === 'open' ? 'Open' : 'Gesloten'}</p>{position.targetTradePartnerId && <p>Alleen zichtbaar voor geverifieerde uitvoerenden van {data?.tradePartners?.find(item => item.id === position.targetTradePartnerId)?.name || 'het geselecteerde onderaannemersbedrijf'}.</p>}{position.requiredSkills?.length > 0 && <p>Vereiste aanvullende vaardigheden: {position.requiredSkills.join(', ')}</p>}<p>{new Date(position.startsAt).toLocaleString('nl-NL')} tot {new Date(position.endsAt).toLocaleString('nl-NL')} | {position.hours} uur | {new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(position.rate)} / uur excl. btw</p>{position.startReleaseRequired && <p>Startvrijgave door aannemer en bevestiging door uitvoerende vereist</p>}{position.waitlistOfferPolicy === 'automatic_once' && <p role={position.waitlistAutomation?.status === 'owner_review' ? 'alert' : 'status'}>Wachtlijst: {{ waiting_for_applicants: 'wacht op belangstelling', waiting_for_vacancy: 'wacht op een vrije plek', waiting_for_response: `aanbod wacht op reactie tot ${new Date(position.waitlistAutomation.expiresAt).toLocaleString('nl-NL')}`, ready: 'klaar om de eerste wachtende een aanbod te doen', offered: 'aanbod klaargezet', owner_review: `automatisering wacht op controle${position.waitlistAutomation.reason ? `: ${position.waitlistAutomation.reason}` : ''}` }[position.waitlistAutomation?.status] || 'actief'}. Er wordt nooit automatisch overgeslagen of definitief geplaatst.</p>}{isOwner && position.status === 'open' && <button type="button" disabled={busy} onClick={() => act(() => post(`/api/ledger/work-board/positions/${position.id}/close`), 'Inschrijving gesloten. Bestaande plaatsingen blijven behouden.')}><X size={16} />Inschrijving sluiten</button>}</article>)}
      {isOwner && uncoveredSuggestions.length > 0 && <button type="button" disabled={busy} onClick={() => void createSuggestedDrafts()}>
        <Plus size={16} />Concepten voorbereiden uit {uncoveredSuggestions.length} open werkzaamheid/werkzaamheden
      </button>}
      {isOwner && <details open={publishing} onToggle={event => setPublishing(event.currentTarget.open)}><summary>Positie vrijgeven</summary>
        {data?.suggestions.length > 0 && <label>Uit bestaande werkzaamheid<select aria-label="Uit bestaande werkzaamheid" defaultValue="" onChange={event => {
          const suggestion = data.suggestions.find(row => row.sourceTaskId === event.target.value)
          if (suggestion) setTerms({ ...initialTerms(), workPackageId: '', workPackageSourceHash: '', title: suggestion.title, role: suggestion.role || '', description: suggestion.description, city: suggestion.city, hours: suggestion.hours || '', startsAt: localDate(suggestion.startsAt), endsAt: localDate(suggestion.endsAt), sourceTaskIds: [suggestion.sourceTaskId], materials: suggestion.sourceType === 'accepted_variation_implementation' ? suggestion.materialsText : data.materials, equipment: data.equipment })
        }}><option value="">Selecteer werkzaamheid</option>{data.suggestions.map(row => <option key={row.sourceTaskId} value={row.sourceTaskId}>{row.title}{row.role ? ` · ${row.role}` : ' · vakrol ontbreekt'}{row.variationNumber ? ` · ${row.variationNumber} R${row.variationRevision}` : ''}{row.linkedMaterials?.length ? ` · ${row.linkedMaterials.length} materiaalregels` : ''}</option>)}</select></label>}
        <form onSubmit={event => { event.preventDefault(); void act(async () => { await post(url, { ...terms, startsAt: new Date(terms.startsAt).toISOString(), endsAt: new Date(terms.endsAt).toISOString() }); setTerms(initialTerms()); setPublishing(false) }, 'Positie vrijgegeven voor inschrijving.') }}>
          <div className="wb-fields">
            <label>Voor wie is deze positie?<select aria-label="Voor wie is deze positie?" value={terms.targetTradePartnerId || ''} onChange={event => setTerms(current => ({ ...current, targetTradePartnerId: event.target.value }))}><option value="">Open voor alle toegelaten uitvoerenden</option>{data?.tradePartners?.map(partner => <option key={partner.id} value={partner.id}>{partner.name}</option>)}</select><small>Een bedrijfsgerichte positie is alleen zichtbaar voor accounts die jij bij toelating aan dit bedrijf hebt gekoppeld. Een zelf opgegeven bedrijfsnaam geeft geen toegang.</small></label>
            <label>Werkpakket<select value={terms.workPackageId || ''} onChange={event => {
              const selected = data.workPackages.find(item => item.id === event.target.value)
              const scope = selected?.remainingScope?.length ? `Nog te doen volgens de actuele werkbalans: ${selected.remainingScope.join('; ')}.` : ''
              const suggested = selected ? [selected.outcome, scope].filter(Boolean).join('\n') : ''
              setTerms(current => ({ ...current, workPackageId: selected?.id || '', workPackageSourceHash: selected?.sourceHash || '', sourceTaskIds: [],
                title: current.title || selected?.title || '', description: current.description || suggested }))
            }}><option value="">Selecteer een gekoppeld werkpakket</option>{data?.workPackages?.map(item => <option key={item.id} value={item.id} disabled={Boolean(item.blocked)}>{item.code} / {item.title}{item.remainingScope?.length ? ` / Resterend: ${item.remainingScope.join('; ')}` : ''}{item.remainingLaborEstimate != null ? ` / ${item.remainingLaborEstimate} richturen` : ''}{item.blocked ? ' (controleren)' : ''}</option>)}</select></label>
            {selectedPackage && <label>Werkzaamheden voor deze positie<select aria-label="Werkzaamheden voor deze positie" multiple size={Math.min(6, Math.max(2, selectedPackage.taskIds.length))}
              value={terms.sourceTaskIds || []} onChange={event => setTerms(current => ({ ...current,
                sourceTaskIds: Array.from(event.target.selectedOptions, option => option.value) }))}>
              {(data?.suggestions || []).filter(row => selectedPackage.taskIds.includes(row.sourceTaskId)).map(row => {
                const roleMismatch = row.role && terms.role && row.role.toLocaleLowerCase() !== terms.role.trim().toLocaleLowerCase()
                return <option key={row.sourceTaskId} value={row.sourceTaskId} disabled={Boolean(roleMismatch)}>
                  {row.title} · {row.role || 'vakrol ontbreekt'}{roleMismatch ? ' · andere vakrol' : ''}
                </option>
              })}
            </select><small>Selecteer alleen werkzaamheden voor dezelfde vakrol. Een gemengd werkpakket vraagt meerdere afzonderlijke posities.</small></label>}
            {[['title', 'Openbare titel', 'text'], ['role', 'Vakgebied', 'text'], ['city', 'Plaats', 'text'], ['startsAt', 'Start', 'datetime-local'], ['endsAt', 'Einde', 'datetime-local'], ['hours', 'Arbeidsduur per persoon (uren)', 'number'], ['capacity', 'Aantal personen', 'number'], ['rate', 'Uurvergoeding (EUR, excl. btw)', 'number']].map(([name, label, type]) => <label key={name}>{label}<input required name={name} type={type} min={name === 'capacity' ? '1' : type === 'number' ? '0.01' : undefined} max={name === 'capacity' ? '50' : undefined} step={name === 'capacity' ? '1' : type === 'number' ? '0.01' : undefined} value={terms[name]} onChange={change} /></label>)}
          </div>
          <label>Aanvullende vereiste vaardigheden<input aria-label="Aanvullende vereiste vaardigheden" maxLength={1238} value={(terms.requiredSkills || []).join(', ')} onChange={event => setTerms(current => ({ ...current, requiredSkills: event.target.value.split(',').map(value => value.trim()).filter(Boolean) }))} placeholder="Bijvoorbeeld: tegelzetten, badkamerafdichting" /><small>Maximaal 20 komma-gescheiden vaardigheden. Ze vervangen geen verplichte diploma- of certificaatcontrole.</small></label>
          {[['description', 'Werkzaamheden'], ['materials', 'Materialen en wie ze levert'], ['equipment', 'Gereedschap en wat men meeneemt'], ['prerequisites', 'Startvoorwaarden en veiligheid']].map(([name, label]) => <label key={name}>{label}<textarea required name={name} maxLength={2000} value={terms[name]} onChange={change} /></label>)}
          <label className="wb-check"><input type="checkbox" name="startReleaseRequired" checked={terms.startReleaseRequired} onChange={change} />Werk mag pas als in uitvoering worden gemeld nadat de aannemer een startvrijgave heeft gegeven en de uitvoerende die heeft bevestigd. Koppel hiervoor minstens één concrete werkzaamheid.</label>
          {terms.startReleaseRequired && !terms.sourceTaskIds?.length && <p role="status">Kies eerst een gekoppelde werkzaamheid of werkpakket om deze startvoorwaarde te gebruiken.</p>}
          <label className="wb-check"><input type="checkbox" checked={terms.waitlistOfferPolicy === 'automatic_once'} onChange={event => setTerms(current => ({ ...current, waitlistOfferPolicy: event.target.checked ? 'automatic_once' : 'manual' }))} />Als een plek vrijkomt, mag Contractor.AI de oudste geschikte wachtende één keer een tijdelijk aanbod in het uitvoerdersportaal doen. Dit loopt alleen wanneer de autonome planner is ingeschakeld. Geen e-mail of WhatsApp, geen kandidaten overslaan en geen definitieve plaatsing zonder acceptatie en nieuwe controles.</label>
          <label className="wb-check"><input type="checkbox" name="automaticStandbyCallouts" checked={terms.automaticStandbyCallouts === true} onChange={change} />Bij een gemelde verhindering mag Contractor.AI maximaal drie geschikte uitvoerenden na elkaar een tijdelijk aanbod doen, steeds één tegelijk en alleen na afwijzing of verlopen reactietermijn. Alleen met de autonome planner. Geen e-mail of WhatsApp en geen automatische vervanging: acceptatie en aparte goedkeuring blijven nodig.</label>
          <label className="wb-check"><input type="checkbox" name="confirmPublication" required checked={terms.confirmPublication} onChange={change} />Ik heb de openbare inhoud gecontroleerd op klantgegevens en geef deze voorwaarden vrij voor automatische interne plaatsing.</label>
          <button type="button" disabled={busy} onClick={() => act(() => post(url, { ...terms, intent: 'save_draft', startsAt: terms.startsAt ? new Date(terms.startsAt).toISOString() : '', endsAt: terms.endsAt ? new Date(terms.endsAt).toISOString() : '' }), 'Concept veilig opgeslagen. Het staat nog niet op het uitvoerdersbord.')}>Concept bewaren</button>
          <button disabled={busy || (terms.startReleaseRequired && !terms.sourceTaskIds?.length)}><Plus size={17} />Positie vrijgeven</button>
        </form>
      </details>}
    </> : <>
      {data?.accounts.length === 0 && <p>Nog geen nieuwe aanmeldingen.</p>}
      {data?.accounts.map(account => <article key={account.id}><h4>{account.name}</h4><p>{account.email} | {account.phone}</p><p>{account.skills.join(', ')} | {account.region} | Opgegeven bedrijf: {account.company || 'niet opgegeven'}</p><p>{account.verifiedTradePartner ? `Geverifieerd onderaannemersbedrijf: ${account.verifiedTradePartner.name}` : 'Geen geverifieerd onderaannemersbedrijf'}</p><p>{account.status === 'pending' ? 'Wacht op toelating' : account.status === 'admitted' ? 'Toegelaten' : 'Geblokkeerd'}</p>
        {account.pendingSkillsChange && <section aria-label={`Vaardigheidsvoorstel van ${account.name}`}><h5>Vaardigheidswijziging ter beoordeling</h5><p>Huidig profiel: {account.skills.join(', ')}</p><p>Voorgesteld: {account.pendingSkillsChange.skills.join(', ')}</p><label>Referentie beoordeling<input required maxLength={1000} value={skillReferences[account.id] || ''} onChange={event => setSkillReferences(current => ({ ...current, [account.id]: event.target.value }))} /></label><div className="wb-mode-options"><button type="button" disabled={busy || !skillReferences[account.id]?.trim()} onClick={() => act(() => post(`/api/ledger/work-board/accounts/${account.id}/review-skills`, { decision: 'approve', reference: skillReferences[account.id] }), 'Vaardigheden gecontroleerd en profiel bijgewerkt.')}><UserCheck size={16} />Goedkeuren en profiel bijwerken</button><button type="button" disabled={busy || !skillReferences[account.id]?.trim()} onClick={() => act(() => post(`/api/ledger/work-board/accounts/${account.id}/review-skills`, { decision: 'reject', reference: skillReferences[account.id] }), 'Vaardigheidsvoorstel afgewezen; het huidige profiel blijft actief.')}><X size={16} />Afwijzen</button></div></section>}
        {(account.status !== 'admitted' || !account.verifiedTradePartner) && <form onSubmit={event => { event.preventDefault(); const draft = references[account.id] || {}; void act(() => post(`/api/ledger/work-board/accounts/${account.id}/admit`, { reference: draft.reference, companyMismatchReviewed: draft.companyMismatchReviewed === true, ...(draft.tradePartnerId ? { tradePartnerId: draft.tradePartnerId } : {}) }), account.status === 'admitted' ? 'Bedrijfskoppeling gecontroleerd en vastgelegd.' : 'Uitvoerende toegelaten. Verplichte kwalificaties worden per positie apart gecontroleerd.') }}>
          <label>Geverifieerd onderaannemersbedrijf<select value={references[account.id]?.tradePartnerId ?? account.verifiedTradePartner?.id ?? ''} onChange={event => setReferences(current => ({ ...current, [account.id]: { ...current[account.id], tradePartnerId: event.target.value, companyMismatchReviewed: false } }))}><option value="">Geen bedrijfskoppeling</option>{data?.tradePartners?.map(partner => <option key={partner.id} value={partner.id}>{partner.name}</option>)}</select></label>
          {companyNameMismatch(account.company, data?.tradePartners?.find(partner => partner.id === (references[account.id]?.tradePartnerId || account.verifiedTradePartner?.id))?.name) && <label className="wb-check"><input type="checkbox" checked={references[account.id]?.companyMismatchReviewed === true} onChange={event => setReferences(current => ({ ...current, [account.id]: { ...current[account.id], companyMismatchReviewed: event.target.checked } }))} />De opgegeven bedrijfsnaam wijkt af; ik heb de juridische bedrijfsidentiteit apart gecontroleerd.</label>}
          <label>Referentie contact- en toelatingscontrole<input required maxLength={1000} value={references[account.id]?.reference || ''} onChange={event => setReferences(current => ({ ...current, [account.id]: { ...current[account.id], reference: event.target.value } }))} /></label><button disabled={busy || !references[account.id]?.reference?.trim() || (account.status === 'admitted' && !references[account.id]?.tradePartnerId) || (companyNameMismatch(account.company, data?.tradePartners?.find(partner => partner.id === (references[account.id]?.tradePartnerId || account.verifiedTradePartner?.id))?.name) && references[account.id]?.companyMismatchReviewed !== true)}><UserCheck size={17} />{account.status === 'admitted' ? 'Bedrijf koppelen' : 'Toelaten'}</button>
        </form>}
        {account.status !== 'suspended' && <button type="button" disabled={busy} onClick={() => act(() => post(`/api/ledger/work-board/accounts/${account.id}/suspend`), 'Portaaltoegang geblokkeerd. Controleer bestaande plaatsingen afzonderlijk.')}><X size={17} />Portaaltoegang blokkeren</button>}
      </article>)}
    </>}
  </section>
}
