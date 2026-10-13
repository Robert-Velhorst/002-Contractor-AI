import { conversationRequest } from './conversation-request.mjs'

export function createPhotoReadQueue() {
  const pending = []
  let active = 0
  const aborted = () => new DOMException('Photo read cancelled.', 'AbortError')
  function pump() {
    while (active < 2 && pending.length) {
      const job = pending.shift()
      job.signal.removeEventListener('abort', job.cancel)
      if (job.signal.aborted) { job.reject(aborted()); continue }
      active += 1
      ;(async () => {
        try { job.resolve(await job.action()) }
        catch (error) { job.reject(error) }
        finally { active -= 1; pump() }
      })()
    }
  }
  return {
    read(action, signal, interactive = false) {
      if (signal.aborted) return Promise.reject(aborted())
      if (pending.length >= 64) return Promise.reject(new Error('Photo read queue is full. Retry shortly.'))
      return new Promise((resolve, reject) => {
        const job = { action, signal, resolve, reject, cancel: () => {
          const index = pending.indexOf(job)
          if (index >= 0) { pending.splice(index, 1); reject(aborted()) }
        } }
        signal.addEventListener('abort', job.cancel, { once: true })
        if (interactive) pending.unshift(job)
        else pending.push(job)
        pump()
      })
    },
    stats: () => ({ active, queued: pending.length })
  }
}

const photoReads = createPhotoReadQueue()
function retryDelay(signal, milliseconds) {
  return new Promise((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(new DOMException('Photo read cancelled.', 'AbortError')) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve() }, milliseconds)
    if (signal.aborted) cancel()
    else signal.addEventListener('abort', cancel, { once: true })
  })
}

export function readConversationPhoto(base, token, id, signal, original = false) {
  return photoReads.read(async () => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await conversationRequest(base, token,
          `/messages/${encodeURIComponent(id)}/photo${original ? '' : '?preview=1'}`, { signal })
        return await response.blob()
      } catch (error) {
        if (original || signal.aborted || error.status !== 503 || error.code !== 'image_processing_busy' || attempt >= 2) throw error
        await retryDelay(signal, 200 * (attempt + 1))
      }
    }
  }, signal, original)
}
