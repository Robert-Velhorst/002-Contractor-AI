import { useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { fieldOutboxOperatorScope } from './field-outbox'
import { companyFetch } from './company-request.mjs'
import './components/Conversation.css'

async function request(path, options = {}) {
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData
  const response = await companyFetch(path, { ...options, headers: { ...(options.body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...options.headers } })
  const result = await response.json()
  if (!response.ok) throw Object.assign(new Error(result.error?.message || 'Aanmelden vereist.'), { status: response.status })
  return result
}

export default function OfflineDownload({ pack, locale }) {
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const nl = locale.startsWith('nl')

  async function save(event) {
    event.preventDefault()
    if (saving.current) return
    saving.current = true
    setBusy(true); setMessage('')
    try {
      const session = await request('/api/session')
      if (!session.operator?.authenticated || session.operator.role !== 'field_worker') throw new Error('Meld je aan als uitvoerende.')
      const current = await request(`/api/ledger/jobs/${pack.job.id}/work-pack`)
      const { downloadWorkPackFiles } = await import('./offline-drawings.mjs')
      const { downloadWorkPack } = await import('./offline-work-packs.mjs')
      const offlineFiles = await downloadWorkPackFiles(current.pack, companyFetch)
      const verified = await request(`/api/ledger/jobs/${pack.job.id}/work-pack`)
      if (verified.pack.sourceHash !== current.pack.sourceHash) throw new Error('Werkpakket gewijzigd tijdens downloaden. Probeer opnieuw.')
      const inbox = await request('/api/work-board/notifications')
      await navigator.serviceWorker.register('/field-sw.js')
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Offline installatie niet voltooid. Probeer opnieuw terwijl je online bent.')), 30000)
        navigator.serviceWorker.ready.then(value => { clearTimeout(timeout); resolve(value) }, error => { clearTimeout(timeout); reject(error) })
      })
      await downloadWorkPack({ ...current.pack, offlineFiles }, password, fieldOutboxOperatorScope(session.operator), inbox)
      setPassword(''); setMessage(nl ? 'Versleuteld opgeslagen voor maximaal 7 dagen.' : 'Encrypted and saved for up to 7 days.')
    } catch (error) { setMessage(error.message) }
    finally { saving.current = false; setBusy(false) }
  }

  return <details className="conversation"><summary>{nl ? 'Offline werkmap' : 'Offline work folder'}</summary><form onSubmit={save}>
    <label>{nl ? 'Offline wachtzin (minimaal 10 tekens)' : 'Offline passphrase (at least 10 characters)'}<input type="password" autoComplete="new-password" required minLength={10} maxLength={200} disabled={busy} value={password} onChange={event => setPassword(event.target.value)} /></label>
    <button type="submit" disabled={busy}><Download size={16} />{nl ? 'Werkpakket offline bewaren' : 'Save work pack offline'}</button>
    <p role="status">{message}</p><a href="/field-offline.html">{nl ? 'Offline werkmap openen' : 'Open offline work folder'}</a>
  </form></details>
}
