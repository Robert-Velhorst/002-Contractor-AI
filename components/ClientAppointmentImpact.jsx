import { lazy, Suspense } from 'react'

const AppointmentReview = lazy(() => import('./ClientAppointmentReview'))

export default function ClientAppointmentImpact({ api, canEdit, source, recoveryCase, sourceHash, draftScope = '', onSubmitted, onError }) {
  const appointments = source.impact?.clientAppointments || []
  if (!appointments.length) return null
  return <section className="work-context" aria-label={`Klantafspraken ${source.id}`}>
    <h5>Bevestigde klantafspraken tijdens afwezigheid</h5>
    <p>Alleen goedgekeurde bezoeken en inkomende berichten uit de bijbehorende klantgesprekken. Dit zijn afspraken om te beoordelen, geen automatisch gewijzigde klantdatums.</p>
    {!source.impact.clientAppointmentsComplete && <p role="status">De gevonden afsprakenlijst is begrensd; beoordeel zichtbare afspraken als risico, maar markeer ze niet als ongeraakt.</p>}
    <ul>{appointments.map(appointment => <Suspense key={appointment.id} fallback={<li role="status">Klantimpact laden...</li>}><AppointmentReview api={api} canEdit={canEdit} source={source}
      recoveryCase={recoveryCase} sourceHash={sourceHash} appointment={appointment} draftScope={draftScope} onSubmitted={onSubmitted} onError={onError} /></Suspense>)}</ul>
  </section>
}
