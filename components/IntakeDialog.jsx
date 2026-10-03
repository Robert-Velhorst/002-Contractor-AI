import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useSessionDraftRecovery } from '../draft-recovery'

function emptyIntake() {
  return { clientName: '', title: '', service: '', address: '', description: '', priority: 'medium' }
}

export default function IntakeDialog({ open, scope, enabled, submitting, onClose, onSave, onCreated }) {
  const [draft, setDraft] = useState(emptyIntake)
  const pendingRef = useRef(false)
  const activeRef = useRef(true)
  useSessionDraftRecovery({ enabled, scope, name: 'intake', value: draft, setValue: setDraft })
  useEffect(() => {
    activeRef.current = true
    return () => { activeRef.current = false }
  }, [])

  const change = event => {
    const { name, value } = event.target
    setDraft(current => ({ ...current, [name]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    if (submitting || pendingRef.current) return
    pendingRef.current = true
    try {
      if (await onSave(draft) && activeRef.current) {
        setDraft(emptyIntake())
        onCreated()
      }
    } finally {
      pendingRef.current = false
    }
  }

  // Keep draft ownership here even when closed; typing must not render the dashboard.
  if (!open) return null
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="intake-title">
        <div className="modal-heading">
          <div>
            <h2 id="intake-title">New intake</h2>
            <p>Create an auditable local job record.</p>
          </div>
          <button type="button" className="icon-button" aria-label="Close intake" disabled={submitting} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit}>
          <fieldset disabled={submitting} className="intake-fields">
            <div className="form-grid">
              <label>Client name<input required name="clientName" value={draft.clientName} onChange={change} /></label>
              <label>Job title<input required name="title" value={draft.title} onChange={change} /></label>
              <label>Service<input name="service" value={draft.service} onChange={change} placeholder="Renovation, maintenance..." /></label>
              <label>Location<input name="address" value={draft.address} onChange={change} /></label>
              <label>Priority
                <select name="priority" value={draft.priority} onChange={change}>
                  <option value="low">Low</option><option value="medium">Medium</option>
                  <option value="high">High</option><option value="critical">Critical</option>
                </select>
              </label>
              <label className="form-span">Scope
                <textarea name="description" value={draft.description} onChange={change} placeholder="Describe the work, constraints and desired timing." />
              </label>
            </div>
          </fieldset>
          <div className="modal-actions">
            <button type="button" className="secondary-button" disabled={submitting} onClick={onClose}>Cancel</button>
            <button className="primary-button" disabled={submitting}>{submitting ? 'Saving...' : 'Create intake'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}
