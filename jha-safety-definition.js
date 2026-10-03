const { createHash } = require('node:crypto');

function jhaSafetyDefinition(record = {}) {
  return {
    jobId: String(record.jobId || ''),
    title: String(record.title || ''),
    riskLevel: String(record.riskLevel || ''),
    hazards: Array.isArray(record.hazards) ? record.hazards : [],
    controls: Array.isArray(record.controls) ? record.controls : [],
    workMethod: record.data?.workMethod || null,
    ppe: Array.isArray(record.data?.ppe) ? record.data.ppe : [],
    stopWorkTriggers: Array.isArray(record.data?.stopWorkTriggers) ? record.data.stopWorkTriggers : [],
    linkedTaskIds: [...new Set(Array.isArray(record.data?.linkedTaskIds) ? record.data.linkedTaskIds.map(String) : [])].sort()
  };
}

function jhaSafetyDefinitionHash(record) {
  return createHash('sha256').update(JSON.stringify(jhaSafetyDefinition(record))).digest('hex');
}

function normalizeJhaLinkedTaskIds(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 50) {
    throw Object.assign(new Error('JHA linkedTaskIds must be an array containing no more than 50 task IDs.'), {
      statusCode: 400,
      code: 'jha_linked_tasks_invalid'
    });
  }
  const ids = [...new Set(value.map(item => String(item || '').trim()).filter(Boolean))].sort();
  if (ids.length !== value.filter(item => String(item || '').trim()).length) {
    throw Object.assign(new Error('JHA task IDs must be unique.'), { statusCode: 400, code: 'jha_linked_tasks_invalid' });
  }
  return ids;
}

module.exports = { jhaSafetyDefinition, jhaSafetyDefinitionHash, normalizeJhaLinkedTaskIds };
