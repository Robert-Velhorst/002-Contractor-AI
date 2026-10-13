import { toIsoDateTime, toLocalDateTimeInput } from './dashboard-format'

export function emptyOpportunityDraft(opportunity = null) {
  const forecast = opportunity?.data?.capacityForecast
  return {
    clientName: opportunity?.client?.name || '',
    company: opportunity?.client?.company || '',
    email: opportunity?.client?.email || '',
    phone: opportunity?.client?.phone || '',
    title: opportunity?.title || '',
    stage: opportunity?.stage || 'new',
    service: opportunity?.service || '',
    sourceChannel: opportunity?.sourceChannel || 'manual',
    description: opportunity?.description || '',
    address: opportunity?.address || '',
    city: opportunity?.city || '',
    postalCode: opportunity?.postalCode || '',
    country: opportunity?.country || 'NL',
    clientSegment: opportunity?.data?.clientSegment || '',
    estimatedValue: opportunity ? String(opportunity.estimatedValue || '') : '',
    probabilityPercent: opportunity ? String(opportunity.probabilityPercent ?? 10) : '10',
    targetDecisionAt: toLocalDateTimeInput(opportunity?.targetDecisionAt),
    capacityWindowStart: forecast?.windowStart || '',
    capacityWindowEnd: forecast?.windowEnd || '',
    capacityTrades: forecast?.trades?.length ? forecast.trades.map(item => ({
      role: item.role,
      hours: String(item.hours),
      requiredQualifications: item.requiredQualifications || [],
      requiredSkillsText: (item.requiredSkills || []).join(', '),
      supervision: item.supervision ? {
        role: item.supervision.role,
        workersPerSupervisor: String(item.supervision.workersPerSupervisor),
        requiredQualifications: item.supervision.requiredQualifications || [],
        dailyDemand: (item.supervision.dailyDemand || []).map(day => ({
          date: day.date, crewSize: String(day.crewSize), supervisorShiftHours: String(day.supervisorShiftHours)
        }))
      } : null,
      dailyDemand: (item.dailyDemand || []).map(day => ({ date: day.date, hours: String(day.hours) }))
    })) : [{ role: '', hours: '', requiredQualifications: [], requiredSkillsText: '', supervision: null, dailyDemand: [] }],
    materialForecast: (opportunity?.data?.materialForecast || []).map(item => ({
      materialId: item.materialId,
      quantity: String(item.quantity),
      unit: item.unit
    })),
    nextFollowUpAt: toLocalDateTimeInput(opportunity?.nextFollowUpAt),
    ownerName: opportunity?.ownerName || '',
    lostReason: opportunity?.lostReason || '',
  }
}

export function opportunityPayload(opportunityDraft) {
  const { capacityWindowStart, capacityWindowEnd, capacityTrades, materialForecast, ...opportunityFields } = opportunityDraft
  const payload = {
    ...opportunityFields,
    estimatedValue: Number(opportunityDraft.estimatedValue) || 0,
    probabilityPercent: Number(opportunityDraft.probabilityPercent) || 0,
    targetDecisionAt: toIsoDateTime(opportunityDraft.targetDecisionAt),
    nextFollowUpAt: toIsoDateTime(opportunityDraft.nextFollowUpAt),
    capacityForecast: capacityWindowStart || capacityWindowEnd
      || capacityTrades.some(item => item.role.trim() || item.hours)
      ? {
        windowStart: capacityWindowStart,
        windowEnd: capacityWindowEnd,
        trades: capacityTrades.filter(item => item.role.trim() || item.hours).map(item => ({
          role: item.role,
          hours: Number(item.hours),
          requiredQualifications: item.requiredQualifications || [],
          requiredSkills: (item.requiredSkillsText || '').split(',').map(skill => skill.trim()).filter(Boolean),
          dailyDemand: (item.dailyDemand || []).filter(day => day.date && day.hours).map(day => ({ date: day.date, hours: Number(day.hours) })),
          supervision: item.supervision ? {
            role: item.supervision.role,
            workersPerSupervisor: Number(item.supervision.workersPerSupervisor),
            requiredQualifications: item.supervision.requiredQualifications || [],
            dailyDemand: (item.supervision.dailyDemand || []).filter(day => day.date && day.crewSize && day.supervisorShiftHours).map(day => ({
              date: day.date, crewSize: Number(day.crewSize), supervisorShiftHours: Number(day.supervisorShiftHours)
            }))
          } : null
        }))
      }
      : null,
    materialForecast: materialForecast.some(item => item.materialId && item.quantity)
      ? materialForecast.filter(item => item.materialId && item.quantity).map(item => ({
        materialId: item.materialId,
        quantity: Number(item.quantity),
        unit: item.unit
      }))
      : null,
  }
  return payload
}
