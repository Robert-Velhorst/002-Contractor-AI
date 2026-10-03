const RELEASED_JHA_STATUSES = new Set(['approved', 'issued', 'accepted', 'completed', 'signed_off', 'client_visible']);
const { jhaSafetyDefinitionHash } = require('./jha-safety-definition');

function hasApprovedDecision(ledger, record, targetType) {
  if (!record?.approvalId) return false;
  const approval = ledger.db.prepare(`
    SELECT status FROM approvals
    WHERE id = ? AND target_type = ? AND target_id = ?
  `).get(record.approvalId, targetType, record.id);
  return approval?.status === 'approved';
}

function fieldJhaRecords(ledger, records = [], visibleTaskIds = null) {
  return records.filter(record => {
    if (!RELEASED_JHA_STATUSES.has(String(record.status || '').toLowerCase())) return false;
    const approval = record.approvalId ? ledger.db.prepare(`
      SELECT status, data_json FROM approvals
      WHERE id = ? AND target_type = 'jha_record' AND target_id = ?
    `).get(record.approvalId, record.id) : null;
    if (approval?.status !== 'approved') return false;
    const linkedTaskIds = [...new Set((record.data?.linkedTaskIds || []).map(String))].sort();
    const hasTaskScope = visibleTaskIds instanceof Set;
    if (hasTaskScope && (!linkedTaskIds.length || !linkedTaskIds.some(id => visibleTaskIds.has(id)))) return false;
    if (linkedTaskIds.length) {
      let approvalData;
      try { approvalData = JSON.parse(approval.data_json || '{}'); } catch { return false; }
      const retainedHash = record.data?.safetyDefinitionHash;
      return /^[a-f0-9]{64}$/.test(retainedHash || '')
        && retainedHash === jhaSafetyDefinitionHash(record)
        && approvalData.safetyDefinitionHash === retainedHash
        && JSON.stringify([...new Set((approvalData.linkedTaskIds || []).map(String))].sort()) === JSON.stringify(linkedTaskIds);
    }
    return true;
  })
    .map(record => ({
      id: record.id,
      jobId: record.jobId,
      title: record.title,
      status: record.status,
      riskLevel: record.riskLevel,
      dueAt: record.dueAt,
      approvedAt: record.approvedAt,
      hazards: record.hazards,
      controls: record.controls,
      workMethod: record.data?.workMethod || null,
      ppe: record.data?.ppe || [],
      stopWorkTriggers: record.data?.stopWorkTriggers || [],
      linkedTaskIds: visibleTaskIds instanceof Set
        ? [...new Set((record.data?.linkedTaskIds || []).map(String))].filter(id => visibleTaskIds.has(id)).sort()
        : [...new Set((record.data?.linkedTaskIds || []).map(String))].sort()
    }));
}

function fieldSdsRecords(ledger, records = [], visibleMaterialIds = null) {
  return records.filter(record => record.current === true
    && record.expired === false
    && record.integrityValid === true
    && hasApprovedDecision(ledger, record, 'sds_sheet'))
    .map(record => {
      const linkedMaterialIds = [...new Set((record.linkedMaterialIds || []).map(String))].sort();
      const linkedMaterials = linkedMaterialIds.map(id => ledger.db.prepare(`
        SELECT id, name FROM material_requirements WHERE id = ? AND job_id = ? AND status <> 'cancelled'
      `).get(id, record.jobId)).filter(Boolean);
      const activeLinkedMaterialIds = linkedMaterials.map(row => row.id);
      const relevantMaterialIds = visibleMaterialIds instanceof Set
        ? activeLinkedMaterialIds.filter(id => visibleMaterialIds.has(id))
        : activeLinkedMaterialIds;
      return { record, relevantMaterialIds, linkedMaterials };
    })
    .filter(({ relevantMaterialIds }) => !(visibleMaterialIds instanceof Set) || relevantMaterialIds.length > 0)
    .map(({ record, relevantMaterialIds, linkedMaterials }) => ({
      id: record.id,
      jobId: record.jobId,
      material: record.material,
      manufacturer: record.manufacturer,
      productCode: record.productCode,
      language: record.language,
      issuedOn: record.issuedOn,
      expiresAt: record.expiresAt,
      status: record.status,
      revisionNumber: record.revisionNumber,
      documentReference: record.documentReference,
      hazardClasses: record.hazardClasses || [],
      requiredPpe: record.requiredPpe || [],
      linkedMaterialIds: relevantMaterialIds,
      linkedMaterials: linkedMaterials.filter(material => relevantMaterialIds.includes(material.id)),
      firstAidMeasures: record.firstAidMeasures,
      fireMeasures: record.fireMeasures,
      handlingStorage: record.handlingStorage,
      spillResponse: record.spillResponse,
      disposal: record.disposal,
      emergencyContact: record.emergencyContact,
      file: record.document
        && record.documentIntegrityValid === true
        && record.document.mimeType === 'application/pdf'
        && Number.isSafeInteger(record.document.sizeBytes)
        && record.document.sizeBytes > 0
        && record.document.sizeBytes <= 8 * 1024 * 1024
        && /^[a-f0-9]{64}$/.test(record.data?.documentChecksum || '')
        ? {
            filename: record.document.filename,
            mimeType: record.document.mimeType,
            sizeBytes: record.document.sizeBytes,
            sha256: record.data.documentChecksum
          }
        : null
    }));
}

module.exports = { fieldJhaRecords, fieldSdsRecords };
