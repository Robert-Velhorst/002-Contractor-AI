const { createHash } = require('node:crypto');

function taskJhaDefinition(task = {}) {
  const data = task.data && typeof task.data === 'object' ? task.data : {};
  return {
    taskId: String(task.id || ''),
    title: String(task.title || ''),
    description: String(task.description || ''),
    requiredTrade: String(data.requiredTrade || ''),
    materialRequirementIds: [...new Set(Array.isArray(data.materialRequirementIds) ? data.materialRequirementIds.map(String) : [])].sort()
  };
}

function taskJhaDefinitionHash(task = {}) {
  return createHash('sha256').update(JSON.stringify(taskJhaDefinition(task))).digest('hex');
}

function taskJhaApplicability(task = {}) {
  const data = task.data && typeof task.data === 'object' ? task.data : {};
  const retained = data.jhaApplicability && typeof data.jhaApplicability === 'object' ? data.jhaApplicability : null;
  if (!retained) return { status: 'unreviewed', reason: null, reviewedAt: null, reviewedBy: null };
  const current = retained.sourceHash === taskJhaDefinitionHash(task);
  return {
    status: current ? retained.status : 'needs_review',
    reason: current ? retained.reason : null,
    reviewedAt: current ? retained.reviewedAt : null,
    reviewedBy: current ? retained.reviewedBy : null,
    sourceHash: current ? retained.sourceHash : null
  };
}

module.exports = { taskJhaDefinitionHash, taskJhaApplicability };
