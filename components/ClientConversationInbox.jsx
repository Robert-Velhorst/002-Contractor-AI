import { useEffect, useState } from 'react'
import { MessageSquareText } from 'lucide-react'
import './ClientConversationInbox.css'

export default function ClientConversationInbox({ api, locale, onOpen }) {
  const [inbox, setInbox] = useState({ messages: [], unreadCount: 0, truncated: false })
  const [error, setError] = useState('')
  const nl = locale.startsWith('nl')
  useEffect(() => {
    let stopped = false, timer, controller
    const available = () => !stopped && !document.hidden && navigator.onLine !== false
    const pause = () => {
      window.clearTimeout(timer)
      controller?.abort()
      controller = null
    }
    async function loadInbox() {
      if (!available() || controller) return
      const read = new AbortController()
      controller = read
      try {
        const result = await api('/api/ledger/client-conversations/inbox?limit=50', { signal: read.signal })
        if (available() && controller === read) { setInbox(result); setError('') }
      } catch (reason) {
        if (available() && controller === read) setError(reason.message)
      } finally {
        if (controller === read) {
          controller = null
          if (available()) timer = window.setTimeout(loadInbox, 30000)
        }
      }
    }
    const resume = () => { window.clearTimeout(timer); void loadInbox() }
    const visibility = () => { if (document.hidden) pause(); else resume() }
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('offline', pause)
    window.addEventListener('online', resume)
    void loadInbox()
    return () => {
      stopped = true
      pause()
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('offline', pause)
      window.removeEventListener('online', resume)
    }
  }, [api])
  if (error && !inbox.unreadCount) return <section className="panel client-inbox-panel"><p role="alert">{error}</p></section>
  if (!inbox.unreadCount && !error) return null
  return <section className="panel client-inbox-panel" aria-label={nl ? 'Nieuwe klantberichten' : 'New client messages'}>
    <div className="panel-heading"><div><h2>{nl ? 'Klantberichten' : 'Client messages'}</h2><p>{nl ? `${inbox.unreadCount} niet bekeken` : `${inbox.unreadCount} not reviewed`}</p></div><MessageSquareText size={19} /></div>
    {error ? <p role="alert">{error}</p> : null}
    <div className="queue-list">{inbox.messages.map(message => <button type="button" className="client-inbox-row" key={message.messageId} onClick={() => onOpen(message)}>
      <span><strong>{message.clientName || (nl ? 'Klant' : 'Client')}</strong><small>{message.jobTitle}</small></span>
      <time dateTime={message.createdAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(message.createdAt))}</time>
    </button>)}</div>
    {inbox.truncated ? <p>{nl ? 'Er zijn meer berichten; de lijst toont de 50 nieuwste.' : 'More messages exist; showing the 50 newest.'}</p> : null}
  </section>
}
