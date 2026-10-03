import { lazy, Suspense, useState } from 'react'
import { formatDate } from '../format-date.mjs'

const SupplierRecoveryForm = lazy(() => import('./SupplierRecoveryForm'))
const STATUS = {
  contact_recorded: 'Contactmoment vastgelegd',
  no_response: 'Nog geen reactie',
  delivery_date_confirmed: 'Leverdatum bevestigd door leverancier',
  alternative_proposed: 'Alternatief voorgesteld'
}
export default function SupplierRecoveryLog({ api, canEdit, source, recoveryCase, sourceHash, draftScope = '', onSubmitted, onError }) {
  const [formOpened, setFormOpened] = useState(false)
  const order = source.impact?.purchaseOrder
  const entries = (recoveryCase.supplierFollowUps || []).filter(item => (item.sourceType || 'material_receipt') === source.type
    && (item.sourceId || item.materialReceiptId) === source.id)

  return <section className="work-context" aria-label={`Leveranciersopvolging ${source.id}`}>
    <h5>Leveranciersopvolging</h5>
    <p>Registratie verstuurt geen bericht.</p>
    {order ? <p>Bestelling {order.id} / {order.supplier || 'Leverancier niet vastgelegd'} / status {order.status}
      {order.requiredBy ? ` / gevraagd voor ${formatDate(order.requiredBy)}` : ''}</p>
      : <p>Er is nog geen aantoonbaar uitgegeven bestelling aan dit tekort gekoppeld. Een conceptbestelling geldt niet als leveringsdekking.</p>}
    {entries.length > 0 && <ul>{entries.map(item => <li key={item.id}>
      <strong>{STATUS[item.status] || item.status}</strong>: {item.summary}
      {item.expectedAt ? ` / leverdatum genoemd ${formatDate(item.expectedAt)}` : ''}
      {item.nextFollowUpAt ? ` / opnieuw opvolgen ${formatDate(item.nextFollowUpAt)}` : ''}
      {` / bewijsreferentie: ${item.evidenceReference} / handmatig geregistreerd door ${item.recordedBy}`}
    </li>)}</ul>}
    {(canEdit || formOpened) && recoveryCase.sourceCurrent && ['open', 'monitoring'].includes(recoveryCase.status) && order && <details onToggle={event => { if (event.currentTarget.open) setFormOpened(true) }}>
      <summary>Leverancierscontact registreren</summary>
      {formOpened && <Suspense fallback={<p role="status">Opvolgingsformulier laden...</p>}>
        <SupplierRecoveryForm api={api} canEdit={canEdit} source={source} recoveryCase={recoveryCase} sourceHash={sourceHash} draftScope={draftScope} onSubmitted={onSubmitted} onError={onError} />
      </Suspense>}
    </details>}
  </section>
}
