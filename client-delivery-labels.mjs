export const clientDeliveryLabels = {
  pending: ['Publicatie ter beoordeling', 'Publication awaiting review'], available: ['Reactie mogelijk', 'Open for response'],
  rejected: ['Publicatie afgewezen', 'Publication rejected'], cancelled: ['Publicatie geannuleerd', 'Publication cancelled'],
  withdrawn: ['Aanbod ingetrokken', 'Offer withdrawn'], expired: ['Reactietermijn verlopen', 'Response period expired'], source_changed: ['Scope of bewijs gewijzigd', 'Scope or evidence changed'],
  pending_review: ['Reactie ter beoordeling', 'Response awaiting review'], recorded: ['Reactie gecontroleerd vastgelegd', 'Response reviewed and recorded'],
  review_rejected: ['Reactie niet bevestigd door beoordelaar', 'Response not confirmed by reviewer'], review_cancelled: ['Beoordeling geannuleerd', 'Review cancelled'],
  accepted: ['Akkoord', 'Accepted'], accepted_with_reservations: ['Akkoord met voorbehoud', 'Accepted with reservations'], disputed: ['Bezwaar', 'Disputed']
}
export const clientCoverageLabels = {
  not_configured: ['Geen controleplan vastgelegd', 'No inspection plan retained'], pending_review: ['Controles ter beoordeling', 'Inspection coverage awaiting review'],
  evidence_required: ['Controlebewijs ontbreekt', 'Inspection evidence required'], covered: ['Vastgelegde controles afgedekt', 'Listed inspections covered'],
  source_changed: ['Controlescope of bewijs gewijzigd', 'Inspection scope or evidence changed']
}
export const clientDeliveryLabel = (key, locale = 'nl-NL', coverage = false) => (coverage ? clientCoverageLabels : clientDeliveryLabels)[key]?.[locale.startsWith('nl') ? 0 : 1] || key
