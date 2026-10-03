import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Building2, Download, HardHat, LogOut, RefreshCw, ShieldCheck, X } from 'lucide-react'
import './components/Identity.css'

const roles = { owner: 'Eigenaar', approver: 'Goedkeurder', office_operator: 'Kantoormedewerker', field_worker: 'Uitvoerende' }
const states = { requested: 'Wacht op beoordeling', active: 'Toegelaten', suspended: 'Gepauzeerd', revoked: 'Ingetrokken' }

export default function IdentityPortal() {
  const [session, setSession] = useState(null), [mode, setMode] = useState('login')
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false)
  const [codes, setCodes] = useState([]), [invitation, setInvitation] = useState(null), [interaction, setInteraction] = useState(null)
  const [inviteToken, setInviteToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('invite') || '')
  const [interactionId] = useState(() => new URLSearchParams(window.location.search).get('interaction') || '')
  const [form, setForm] = useState({ loginName: '', name: '', email: '', password: '', confirmPassword: '', recoveryCode: '', privacyAccepted: false })
  const read = useCallback(async (route, options = {}) => {
    const response = await fetch(`/api/identity${route}`, { ...options, credentials: 'same-origin', cache: 'no-store' })
    const result = response.status === 204 ? {} : await response.json()
    if (!response.ok) throw new Error(result.error?.message || 'De aanvraag is niet gelukt.')
    return result
  }, [])
  const load = useCallback(async () => { const result = await read('/session'); setSession(result); return result }, [read])
  const post = useCallback((route, body = {}) => read(route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Identity-CSRF': session?.csrf || '' }, body: JSON.stringify(body) }), [read, session?.csrf])
  useEffect(() => { let live = true; read('/session').then(result => { if (live) setSession(result) }).catch(reason => { if (live) setError(reason.message) }); return () => { live = false } }, [read])
  useEffect(() => { if (inviteToken) window.history.replaceState(null, '', window.location.pathname + window.location.search) }, [inviteToken])
  useEffect(() => {
    if (!session?.csrf) return
    let live = true
    if (inviteToken) post('/invitations/inspect', { token: inviteToken }).then(result => { if (live) setInvitation(result) }).catch(reason => { if (live) setError(reason.message) })
    if (interactionId) read(`/interactions/${encodeURIComponent(interactionId)}`).then(result => { if (live) setInteraction(result) }).catch(reason => { if (live) setError(reason.message) })
    return () => { live = false }
  }, [session?.csrf, session?.identity?.id, inviteToken, interactionId, post, read])
  async function act(fn) { if (busy) return; setBusy(true); setError(''); setNotice(''); try { await fn() } catch (reason) { setError(reason.message) } finally { setBusy(false) } }
  const change = event => setForm(current => ({ ...current, [event.target.name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }))
  function downloadCodes() {
    const url = URL.createObjectURL(new Blob([`Contractor.AI herstelcodes\nAccount: ${form.loginName}\n\n${codes.join('\n')}\n`], { type: 'text/plain' }))
    const link = document.createElement('a'); link.href = url; link.download = 'contractor-herstelcodes.txt'; link.click(); URL.revokeObjectURL(url)
  }
  const continueInteraction = async action => { const result = await post(`/interactions/${encodeURIComponent(interactionId)}/${action}`); window.location.assign(result.redirectTo) }
  return <main className="identity-portal" lang="nl">
    <header className="identity-header"><a href="/identity.html"><HardHat size={24} aria-hidden="true" /><strong>Contractor.AI</strong></a><span>Mijn account</span>{session?.identity && <button aria-label="Uitloggen uit accountomgeving" title="Uitloggen uit accountomgeving" disabled={busy} onClick={() => act(async () => { await post('/logout'); setCodes([]); await load() })}><LogOut size={20} /></button>}</header>
    <div className="identity-body">
      {error && <p role="alert" className="identity-error">{error}</p>}{notice && <p role="status">{notice}</p>}
      {!session && <section><h1>Mijn account</h1><p role="status">{error ? 'Accountservice niet bereikbaar.' : 'Account laden...'}</p>{error && <button onClick={() => act(load)}><RefreshCw size={18} />Opnieuw proberen</button>}</section>}
      {codes.length > 0 && <section className="identity-recovery"><h2>Persoonlijke herstelcodes</h2><p>Eenmalig zichtbaar. Bewaar deze codes apart van je wachtwoord en deel ze niet.</p><ul>{codes.map(code => <li key={code}><code>{code}</code></li>)}</ul><div className="identity-actions"><button onClick={downloadCodes}><Download size={18} />Herstelcodes downloaden</button><button onClick={() => setCodes([])}><ShieldCheck size={18} />Veilig bewaard</button></div></section>}
      {session && !session.identity && <section className="identity-account-form"><h1>{mode === 'login' ? 'Inloggen' : mode === 'register' ? 'Account aanmaken' : 'Account herstellen'}</h1>
        <div className="identity-tabs" role="group" aria-label="Accountactie">{[['login', 'Inloggen'], ['register', 'Registreren'], ['recover', 'Herstellen']].map(([value, label]) => <button key={value} aria-pressed={mode === value} disabled={busy} onClick={() => { setMode(value); setForm(current => ({ ...current, password: '', confirmPassword: '', recoveryCode: '' })) }}>{label}</button>)}</div>
        <form onSubmit={event => { event.preventDefault(); void act(async () => {
          if (mode !== 'login' && form.password !== form.confirmPassword) throw new Error('De wachtwoorden komen niet overeen.')
          const result = await post(`/${mode}`, form)
          if (mode === 'register') { setCodes(result.recoveryCodes); setMode('login'); setNotice('Je account is aangemaakt. Bedrijfstoegang vereist afzonderlijke toelating.') }
          if (mode === 'recover') { setMode('login'); setNotice('Wachtwoord hersteld. Bestaande accountsessies zijn ingetrokken.'); setCodes(result.recoveryCodes || []) }
          setForm(current => ({ ...current, password: '', confirmPassword: '', recoveryCode: '' }))
          await load()
        }) }}>
          {mode === 'register' && <><label>Naam<input name="name" required maxLength={150} value={form.name} onChange={change} autoComplete="name" /></label><label>Contact-e-mail (optioneel)<input name="email" type="email" maxLength={254} value={form.email} onChange={change} autoComplete="email" /></label></>}
          <label>Gebruikersnaam<input name="loginName" required minLength={3} maxLength={100} value={form.loginName} onChange={change} autoComplete="username" autoCapitalize="none" spellCheck={false} /></label>
          {mode === 'recover' && <label>Eenmalige herstelcode<input name="recoveryCode" type="password" required maxLength={160} value={form.recoveryCode} onChange={change} autoComplete="off" autoCapitalize="none" spellCheck={false} /></label>}
          <label>{mode === 'recover' ? 'Nieuw wachtwoord' : 'Wachtwoord'}<input name="password" type="password" required minLength={mode === 'login' ? undefined : 16} maxLength={200} value={form.password} onChange={change} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
          {mode !== 'login' && <label>Herhaal wachtwoord<input name="confirmPassword" type="password" required value={form.confirmPassword} onChange={change} autoComplete="new-password" /></label>}
          {mode === 'register' && <label className="identity-check"><input name="privacyAccepted" type="checkbox" required checked={form.privacyAccepted} onChange={change} />Ik ga akkoord met verwerking van mijn accountgegevens en mijn bedrijfsaanvragen.</label>}
          <button className="identity-primary" disabled={busy}><ArrowRight size={18} />{busy ? 'Bezig...' : mode === 'login' ? 'Inloggen' : mode === 'register' ? 'Account aanmaken' : 'Wachtwoord herstellen'}</button>
        </form>
      </section>}
      {invitation && <section aria-label="Bedrijfsuitnodiging"><h2>Uitnodiging van {invitation.company.name}</h2><p>{roles[invitation.role]} | Geldig tot {new Date(invitation.expiresAt).toLocaleDateString('nl-NL')}</p><p>Acceptatie wordt gevolgd door beoordeling door het bedrijf.</p><button disabled={busy || !session?.identity} onClick={() => act(async () => { await post('/invitations/claim', { token: inviteToken }); setInviteToken(''); setInvitation(null); await load(); setNotice('Toegangsaanvraag ontvangen. Het bedrijf beoordeelt je toelating.') })}><ShieldCheck size={18} />Uitnodiging accepteren</button></section>}
      {interaction && <section aria-label="Bedrijfsaanmelding"><h2>Aanmelden bij {interaction.company.name}</h2><p>{session?.identity?.name || 'Niet ingelogd'} | {roles[session?.memberships.find(item => item.company.id === interaction.company.id)?.role] || 'Geen bedrijfstoegang'}</p>{session?.identity && !interaction.eligible && <p role="status">Er is nog geen actieve toelating bij dit bedrijf.</p>}<div className="identity-actions"><button className="identity-primary" disabled={busy || !interaction.eligible || !session?.identity} onClick={() => act(() => continueInteraction('continue'))}><ArrowRight size={18} />{interaction.prompt === 'consent' ? 'Toegang bevestigen' : 'Verder naar bedrijf'}</button><button disabled={busy} onClick={() => act(() => continueInteraction('cancel'))}><X size={18} />Annuleren</button></div></section>}
      {session?.identity && <section aria-label="Mijn bedrijven"><div className="identity-section-heading"><div><h1>{session.identity.name}</h1><p>{session.identity.loginName}</p></div><button title="Bedrijven verversen" aria-label="Bedrijven verversen" disabled={busy} onClick={() => act(load)}><RefreshCw size={19} /></button></div><h2>Mijn bedrijven</h2>{session.memberships.length === 0 && <p>Nog geen bedrijfsaanvragen of toelatingen.</p>}<ul className="identity-company-list">{session.memberships.map(member => <li key={member.id}><Building2 size={22} aria-hidden="true" /><div><h3>{member.company.name}</h3><p>{roles[member.role]} | {states[member.status]}</p></div>{member.status === 'active' && member.company.status === 'active' && <a href={`${member.company.origin}/api/auth/identity/start?returnTo=${member.role === 'field_worker' ? '/work-board.html' : '/'}`} aria-label={`Open ${member.company.name}`}><ArrowRight size={21} /></a>}</li>)}</ul></section>}
    </div>
  </main>
}
