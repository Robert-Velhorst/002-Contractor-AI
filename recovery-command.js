import { useRef, useState } from 'react'

// Keep uncertain writes replayable; only a definitive rejection permits edits.
export function useRecoveryCommand({ api, jobId, url, canEdit, pending, setPending, onError }) {
  const locked = useRef(false)
  const [busy, setBusy] = useState(false)

  async function execute(command, onSubmitted) {
    if (!canEdit || locked.current) return false
    const retained = pending || command
    locked.current = true
    setBusy(true)
    setPending(retained)
    let result
    try {
      result = await api(url || `/api/ledger/jobs/${encodeURIComponent(jobId)}/operational-recovery`, {
        method: 'POST', body: JSON.stringify(retained),
      })
      setPending(null)
    } catch (error) {
      if ([400, 403, 404, 409, 413, 423].includes(error.status || error.statusCode)) setPending(null)
      onError?.(error)
      return false
    } finally {
      locked.current = false
      setBusy(false)
    }
    onSubmitted?.(result)
    return true
  }

  return { busy, execute }
}
