import { useEffect, useRef, useState } from 'react'
import { Download, Image as PhotoIcon, RefreshCw } from 'lucide-react'
import { readConversationPhoto } from '../conversation-photo-reader.mjs'
import { observeConversationPhoto, prioritizeConversationPhoto } from '../conversation-photo-visibility.mjs'
import './ConversationPhoto.css'

export default function ConversationPhoto({ base, token, message, label, locale = 'nl-NL' }) {
  const element = useRef(null)
  const originalController = useRef(null)
  const downloadUrls = useRef(new Map())
  const [photo, setPhoto] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')
  const nl = locale.startsWith('nl')
  const downloadLabel = `${nl ? 'Origineel downloaden' : 'Download original'}: ${label}`
  const retryLabel = nl ? 'Foto opnieuw laden' : 'Retry photo'
  const loadLabel = `${nl ? 'Foto laden' : 'Load photo'}: ${label}`
  const current = photo?.base === base && photo?.token === token && photo?.id === message.id ? photo : null
  useEffect(() => {
    let controller, objectUrl, disposed = false
    setPhoto(null)
    setDownloading(false)
    setDownloadError('')
    function releasePreview() {
      controller?.abort()
      controller = null
      if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null }
      if (!disposed) setPhoto(null)
    }
    const cancel = observeConversationPhoto(element.current, () => {
      const request = new AbortController()
      controller = request
      setPhoto({ base, token, id: message.id, loading: true })
      readConversationPhoto(base, token, message.id, request.signal).then(blob => {
          if (disposed || request.signal.aborted || controller !== request) return
          objectUrl = URL.createObjectURL(blob)
          setPhoto({ base, token, id: message.id, url: objectUrl })
        }).catch(reason => { if (!disposed && !request.signal.aborted && controller === request) setPhoto({ base, token, id: message.id, error: reason.message }) })
    }, releasePreview)
    const urls = downloadUrls.current
    return () => {
      disposed = true
      cancel(); releasePreview(); originalController.current?.abort()
      originalController.current = null
      for (const [url, timer] of urls) { clearTimeout(timer); URL.revokeObjectURL(url) }
      urls.clear()
    }
  }, [base, token, message.id, attempt])
  async function downloadOriginal() {
    if (originalController.current) return
    const controller = new AbortController()
    originalController.current = controller
    setDownloading(true)
    setDownloadError('')
    try {
      const bytes = await readConversationPhoto(base, token, message.id, controller.signal, true)
      if (controller.signal.aborted) return
      const url = URL.createObjectURL(bytes)
      const urls = downloadUrls.current
      urls.set(url, setTimeout(() => { URL.revokeObjectURL(url); urls.delete(url) }, 1000))
      const link = document.createElement('a')
      link.href = url; link.download = label; link.hidden = true
      document.body.append(link)
      try { link.click() } finally { link.remove() }
    } catch (reason) { if (!controller.signal.aborted) setDownloadError(reason.message) }
    finally {
      if (originalController.current === controller) originalController.current = null
      if (!controller.signal.aborted) setDownloading(false)
    }
  }
  return <span ref={element} className="conversation-photo-slot">
    {current?.error ? <span className="conversation-photo-error"><span role="alert">{downloadError || current.error}</span><button type="button" title={retryLabel} aria-label={retryLabel} onClick={() => setAttempt(value => value + 1)}><RefreshCw size={16} /></button></span>
      : current?.url ? <a href={current.url} target="_blank" rel="noreferrer"><img src={current.url} alt={label} decoding="async" className="conversation-photo" /></a>
        : current?.loading ? <span role="status" aria-label={label}>...</span>
          : <button type="button" className="conversation-photo-load" title={loadLabel} aria-label={loadLabel} onClick={() => prioritizeConversationPhoto(element.current)}><PhotoIcon size={20} /></button>}
    {current?.url || current?.error ? <button type="button" className="conversation-photo-download" title={downloadLabel} aria-label={downloadLabel} disabled={downloading} aria-busy={downloading} onClick={downloadOriginal}><Download size={16} /></button> : null}
    {current?.url && downloadError ? <span role="alert" className="conversation-photo-download-error">{downloadError}</span> : null}
  </span>
}
