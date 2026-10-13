import { Fragment, lazy } from 'react'

const OperationalReplacementPlan = lazy(() => import('./OperationalReplacementPlan'))
const SupplierRecoveryLog = lazy(() => import('./SupplierRecoveryLog'))
const ClientAppointmentImpact = lazy(() => import('./ClientAppointmentImpact'))
const WarehouseMaterialRecovery = lazy(() => import('./WarehouseMaterialRecovery'))

export default function OperationalRecoveryActions({ api, canEdit, recoveryCase, sourceHash, draftScope = '', onChanged, onError, onNotice }) {
  const common = { api, canEdit, recoveryCase, sourceHash, draftScope, onError }
  function finish(notice, ...results) {
    onNotice?.(notice)
    onChanged?.(...results)
  }
  return recoveryCase.sources.map(source => {
    if (source.type === 'worker_availability') return <Fragment key={`worker-recovery:${source.id}`}>
      <OperationalReplacementPlan {...common} source={source}
        onSubmitted={result => { const approvalId = result.approval?.id || result.approvalId || 'vastgelegd in de goedkeuringswachtrij'
          finish(`Vervangingsplan wacht op goedkeuring (${approvalId}); bezetting niet gewijzigd.`) }} />
      <ClientAppointmentImpact {...common} source={source}
        onSubmitted={() => finish('Klantimpact vastgelegd; geen bericht verstuurd of afspraak gewijzigd.')} />
    </Fragment>
    if (['material_receipt', 'material_requirement_shortfall'].includes(source.type)) return <Fragment key={`material-recovery:${source.type}:${source.id}`}>
      {source.type === 'material_requirement_shortfall' && <WarehouseMaterialRecovery {...common} source={source}
        onSubmitted={result => finish(`Magazijnuitgifte ${result.warehouseMaterialIssue?.issueId || 'vastgelegd'}; aankomst op locatie moet nog worden bevestigd.`, result)} />}
      <SupplierRecoveryLog {...common} source={source}
        onSubmitted={result => finish(result.materialAvailabilityUpdated
          ? 'Prognose verwerkt; herbeoordeel verstoring en werkplan. Niets verstuurd.'
          : 'Leveranciersopvolging is brongebonden vastgelegd; er is niets verstuurd.', result)} />
    </Fragment>
    return null
  })
}
