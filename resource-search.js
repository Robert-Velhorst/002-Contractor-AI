import { useMemo } from 'react'

export function useRowSearchIndex(rows, query, project) {
  const enabled = Boolean(query.trim())
  return useMemo(() => enabled
    ? new Map((rows || []).map(row => [row, JSON.stringify(project(row)).toLowerCase()]))
    : null, [rows, enabled, project])
}

export const crewSearchFields = worker => ({
  name: worker.name, role: worker.role, email: worker.email, phone: worker.phone,
  homeRegion: worker.homeRegion, skills: worker.skills,
})

export const equipmentSearchFields = tool => ({
  name: tool.name, category: tool.category, status: tool.status,
  homeLocation: tool.homeLocation, currentLocation: tool.currentLocation,
  serialNumber: tool.data?.serialNumber, inspectionStatus: tool.inspection?.status,
  inspectionDueAt: tool.inspection?.dueAt, maintenanceStatus: tool.maintenance?.status,
  lastMaintainedAt: tool.maintenance?.lastMaintainedAt,
})

export const partnerSearchFields = partner => ({
  name: partner.name, partnerType: partner.partnerType, contactName: partner.contactName,
  email: partner.email, city: partner.city, registrationNumber: partner.registrationNumber,
  vatNumber: partner.vatNumber, specialties: partner.specialties,
})

export const receiptSearchFields = receipt => ({
  reference: receipt.receiptReference, job: receipt.jobTitle || receipt.jobId,
  receiver: receipt.receivedBy, lines: receipt.lines?.map(line => line.itemName),
  exceptions: receipt.exceptions?.map(item => item.message),
})

export const qualificationSearchFields = row => ({
  name: row.worker?.name,
  role: row.worker?.role,
  credentials: row.qualification?.credentials?.map(item => [item.title, item.issuer, item.credentialNumber]),
})

export const availabilitySearchFields = period => ({
  workerName: period.workerName,
  workerRole: period.workerRole,
  title: period.title,
  periodType: period.periodLabel,
  notes: period.data?.operationalNotes,
})
