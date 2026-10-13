import { useId } from 'react'
import { LoaderCircle, X } from 'lucide-react'

export default function DialogLoading({ locale, title, onClose, failed = false }) {
  const titleId = useId()
  const nl = locale.startsWith('nl')
  return <div className="modal-backdrop" role="presentation">
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={!failed}>
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-button" title={nl ? 'Sluiten' : 'Close'} aria-label={nl ? 'Sluiten' : 'Close'} onClick={onClose}><X size={18} /></button>
      </div>
      {failed ? <p role="alert">{nl ? 'Het formulier kon niet worden geladen.' : 'The form could not load.'}</p>
        : <div className="loading" role="status"><LoaderCircle className="spin" size={20} />{nl ? 'Laden...' : 'Loading...'}</div>}
    </section>
  </div>
}
