export default function OfflineSafetyDossier({ know }) {
  return <>
    <h4>Veiligheidsdossier (geen startvrijgave)</h4>
    <p>{know.safetyReview?.notice || 'Dossierinformatie; geen toestemming om te starten.'}</p>
    {know.safetyPlans?.length ? know.safetyPlans.map(plan => <article key={plan.id}>
      <h5>{plan.planNumber} R{plan.revisionNumber}: {plan.title}</h5>
      <p>{plan.workDate} | {plan.shiftLabel} | {plan.location}</p>
      <p>Status: {plan.status} | Eigen bevestiging: {plan.ownAcknowledgement?.status || 'niet vastgelegd'}</p>
      <p>Bronnen actueel: {plan.prerequisitesCurrent ? 'ja' : 'nee'} | Integriteit: {plan.definitionIntegrityValid ? 'geverifieerd' : 'controleren'}</p>
      {plan.steps?.map((step, index) => <p key={step.stepKey || index}>{step.description} | Gevaren: {(step.hazards || []).join('; ')} | Maatregelen: {(step.controls || []).join('; ')}</p>)}
      {plan.emergencyArrangements ? <p>Noodmaatregelen: {plan.emergencyArrangements}</p> : null}
      {plan.stopWorkTriggers?.map((trigger, index) => <p key={index}>Stopwerk: {trigger}</p>)}
      {plan.blockers?.map((item, index) => <p key={index}>Controlepunt: {item}</p>)}
      {plan.permit ? <div><h5>Werkvergunning: {plan.permit.title}</h5><p>{plan.permit.status} | Eigen bevestiging: {plan.permit.ownAcknowledgement?.status || 'niet vastgelegd'}</p>{[...plan.permit.hazards, ...plan.permit.controls, ...plan.permit.conditions, ...plan.permit.blockers].map((item, index) => <p key={index}>{item}</p>)}</div> : null}
    </article>) : <p>Geen plan gekoppeld aan deze actieve inschrijving. Vraag kantoor of dit van toepassing is.</p>}
    {know.lmraAssessments?.map(item => <article key={item.id}>
      <h5>Mijn LMRA: {item.workArea} | {item.activity}</h5>
      <p>{item.outcome} | {item.assessedAt} | geldig tot {item.validUntil}</p>
      <p>Bronnen actueel: {item.sourceCurrent ? 'ja' : 'nee'} | Integriteit: {item.integrityValid ? 'geverifieerd' : 'controleren'} | {item.isLatestForWorkerPlan ? 'Meest recente beoordeling' : 'Vervangen door nieuwere beoordeling'}{item.expired ? ' | Verlopen' : ''}</p>
      {item.stopWorkReason ? <p>Stopwerk: {item.stopWorkReason}</p> : null}
      {item.observedHazards?.map((hazard, index) => <p key={index}>Waargenomen gevaar: {hazard}</p>)}
      {Object.entries(item.checks || {}).map(([key, passed]) => <p key={key}>{key}: {passed ? 'bevestigd' : 'niet bevestigd'}</p>)}
      {item.blockers?.map((blocker, index) => <p key={index}>Controlepunt: {blocker}</p>)}
    </article>)}
  </>
}
