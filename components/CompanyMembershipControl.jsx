import { useCallback, useEffect, useId, useState } from 'react'
import { ExternalLink, Plus, RefreshCw, ShieldCheck, X } from 'lucide-react'
import './Identity.css'

const roles = { owner: 'Eigenaar', approver: 'Goedkeurder', office_operator: 'Kantoormedewerker', field_worker: 'Uitvoerende' }
const states = { requested: 'Wacht op beoordeling', active: 'Toegelaten', suspended: 'Gepauzeerd', revoked: 'Ingetrokken' }
const empty = () => ({ role: 'field_worker', workerId: '', reference: '', contactHint: '', ownerConfirmed: false })
function WorkerSelect({ workers, value, onChange }) {
  const id = useId()
  return <div className="identity-field"><label htmlFor={id}>Uitvoerdersprofiel</label><select id={id} required value={value} onChange={event => onChange(event.target.value)}><option value="">Selecteer profiel</option>{workers.map(worker => <option key={worker.id} value={worker.id}>{worker.name}</option>)}</select></div>
}
function MembershipDecision({ member, workers, legacyAccounts, save, busy }) {
  const [role, setRole] = useState(member.role), [workerId, setWorkerId] = useState(member.workerId || '')
  const [status, setStatus] = useState(member.status === 'requested' ? 'active' : member.status), [reference, setReference] = useState('')
  const [ownerConfirmed, setOwnerConfirmed] = useState(false), [retire, setRetire] = useState(false)
  const legacy = role === 'field_worker' ? legacyAccounts.filter(account => account.workerId === workerId) : []
  return <article><h4>{member.identity.name}</h4><p>{member.identity.loginName} | {roles[member.role]} | {states[member.status]}</p><p>{member.identity.email ? `${member.identity.email} (contactadres, niet geverifieerd)` : 'Geen contactadres opgegeven'}</p>
    <details><summary>Toelating beoordelen</summary><form onSubmit={event => { event.preventDefault(); void save({ status, role, workerId: role === 'field_worker' ? workerId : null, reference, expectedVersion: member.version,
      confirmation: ownerConfirmed ? 'ADMIT_COMPANY_OWNER' : undefined, legacyAccountId: legacy.length === 1 ? legacy[0].id : undefined, retireLegacyLogin: retire }) }}>
      <label>Bedrijfsrol<select value={role} onChange={event => setRole(event.target.value)}>{Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {role === 'field_worker' && <WorkerSelect workers={workers} value={workerId} onChange={setWorkerId} />}
      <label>Besluit<select value={status} onChange={event => setStatus(event.target.value)}>{['active', 'suspended', 'revoked'].map(value => <option key={value} value={value}>{states[value]}</option>)}</select></label>
      <label>Referentie identiteits- en toelatingscontrole<input required maxLength={1000} value={reference} onChange={event => setReference(event.target.value)} /></label>
      {role === 'owner' && status === 'active' && <label className="identity-check"><input type="checkbox" required checked={ownerConfirmed} onChange={event => setOwnerConfirmed(event.target.checked)} />Ik verleen eigenaarsrechten voor dit bedrijf.</label>}
      {legacy.length > 0 && status === 'active' && <label className="identity-check"><input type="checkbox" required checked={retire} onChange={event => setRetire(event.target.checked)} />Ik heb de koppeling met {legacy.map(account => `${account.name} (${account.email})`).join(', ')} gecontroleerd. De oude werkbordinloggegevens vervallen; bestaande inschrijvingen blijven behouden.</label>}
      <button disabled={busy}><ShieldCheck size={18} />Besluit vastleggen</button>
    </form></details>
  </article>
}

export default function CompanyMembershipControl({ api, workers = [] }) {
  const [register, setRegister] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState(empty), [invitationUrl, setInvitationUrl] = useState('')
  const load = useCallback(async () => { const result = await api('/api/operations/identity'); setRegister(result) }, [api])
  useEffect(() => { let live = true; api('/api/operations/identity').then(result => { if (live) setRegister(result) }).catch(reason => { if (live) setError(reason.message) }); return () => { live = false } }, [api])
  async function act(fn, message = '') { if (busy) return; setBusy(true); setError(''); setNotice(''); try { await fn(); await load(); setNotice(message) } catch (reason) { setError(reason.message) } finally { setBusy(false) } }
  const post = (route, body = {}) => api(`/api/operations/identity${route}`, { method: 'POST', body: JSON.stringify(body) })
  return <section className="identity-control" aria-label="Bedrijfstoegang" lang="nl"><header className="identity-section-heading"><div><h3>Bedrijfstoegang</h3><p>{register?.company.name || 'Persoonlijke accounts'}</p></div><button title="Bedrijfstoegang verversen" aria-label="Bedrijfstoegang verversen" disabled={busy} onClick={() => act(load)}><RefreshCw size={18} /></button></header>
    {error && <p role="alert" className="identity-error">{error}</p>}{notice && <p role="status">{notice}</p>}{!register && !error && <p role="status">Bedrijfstoegang laden...</p>}
    {register && <><a href={register.accountUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} />Mijn account en bedrijven</a>
      {invitationUrl && <div><label>Persoonlijke uitnodigingslink (eenmalig zichtbaar)<input readOnly value={invitationUrl} onFocus={event => event.target.select()} /></label><button title="Uitnodigingslink verbergen" aria-label="Uitnodigingslink verbergen" onClick={() => setInvitationUrl('')}><X size={18} /></button></div>}
      <details><summary>Nieuwe bedrijfsuitnodiging</summary><form onSubmit={event => { event.preventDefault(); void act(async () => {
        const result = await post('/invitations', { ...draft, workerId: draft.role === 'field_worker' ? draft.workerId : null, confirmation: draft.ownerConfirmed ? 'INVITE_COMPANY_OWNER' : undefined })
        setInvitationUrl(result.invitationUrl); setDraft(empty())
      }, 'Uitnodiging aangemaakt. Er is geen bericht verzonden.') }}>
        <label>Bedrijfsrol<select value={draft.role} onChange={event => setDraft(current => ({ ...current, role: event.target.value }))}>{Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {draft.role === 'field_worker' && <WorkerSelect workers={workers} value={draft.workerId} onChange={workerId => setDraft(current => ({ ...current, workerId }))} />}
        <label>Contactreferentie (optioneel)<input maxLength={254} value={draft.contactHint} onChange={event => setDraft(current => ({ ...current, contactHint: event.target.value }))} /></label>
        <label>Referentie uitnodigingscontrole<input required maxLength={1000} value={draft.reference} onChange={event => setDraft(current => ({ ...current, reference: event.target.value }))} /></label>
        {draft.role === 'owner' && <label className="identity-check"><input type="checkbox" required checked={draft.ownerConfirmed} onChange={event => setDraft(current => ({ ...current, ownerConfirmed: event.target.checked }))} />Dit is een uitnodiging voor eigenaarsrechten.</label>}
        <button disabled={busy}><Plus size={18} />Uitnodiging aanmaken</button>
      </form></details>
      <h4>Toelatingen</h4>{register.memberships.length === 0 && <p>Nog geen toegangsaanvragen.</p>}{register.memberships.map(member => <MembershipDecision key={`${member.id}:${member.version}`} member={member} workers={workers} legacyAccounts={register.legacyAccounts || []} busy={busy} save={body => act(() => post(`/memberships/${member.id}/decision`, body), 'Besluit vastgelegd. Bestaande werkafspraken zijn niet automatisch gewijzigd.')} />)}
      <h4>Open uitnodigingen</h4>{register.invitations.filter(invite => invite.status === 'open').length === 0 && <p>Geen open uitnodigingen.</p>}{register.invitations.filter(invite => invite.status === 'open').map(invite => <article key={invite.id}><p>{roles[invite.role]} | {invite.contactHint || 'Geen contactreferentie'} | Geldig tot {new Date(invite.expiresAt).toLocaleDateString('nl-NL')}</p><button disabled={busy} onClick={() => act(() => post(`/invitations/${invite.id}/revoke`), 'Uitnodiging ingetrokken.')}><X size={17} />Uitnodiging intrekken</button></article>)}
    </>}
  </section>
}
