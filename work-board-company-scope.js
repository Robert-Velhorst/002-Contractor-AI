const { createHash } = require('node:crypto');

function json(value) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || '{}'); } catch { return null; }
}

function assignmentTradePartnerRequirement(db, assignment) {
  const data = json(assignment?.data || assignment?.data_json);
  if (!data) return { valid: false, requiredTradePartnerId: null };
  if (Object.hasOwn(data, 'requiredTradePartnerId')) {
    return { valid: true, requiredTradePartnerId: data.requiredTradePartnerId || null };
  }
  if (!data.workBoardPositionId) return { valid: true, requiredTradePartnerId: null };
  const row = db.prepare('SELECT job_id, status, data_json FROM work_board_positions WHERE id = ?').get(data.workBoardPositionId);
  if (!row) return { valid: true, requiredTradePartnerId: null };
  if (assignment?.job_id && row.job_id !== assignment.job_id) return { valid: false, requiredTradePartnerId: null };
  const position = row && json(row.data_json);
  if (!position) return { valid: false, requiredTradePartnerId: null };
  const { revision, publishedBy: _publishedBy, draftedBy: _draftedBy, ...terms } = position;
  const expected = createHash('sha256').update(JSON.stringify(terms)).digest('hex');
  if (revision !== expected) return { valid: false, requiredTradePartnerId: null };
  return { valid: true, requiredTradePartnerId: terms.targetTradePartnerId || null };
}

function workerHasVerifiedTradePartner(db, workerId, tradePartnerId) {
  if (!tradePartnerId) return true;
  const partner = db.prepare('SELECT partner_type, status FROM trade_partners WHERE id = ?').get(tradePartnerId);
  if (!partner || partner.status !== 'active' || !['subcontractor', 'both'].includes(partner.partner_type)) return false;
  return db.prepare("SELECT data_json FROM work_board_accounts WHERE worker_id = ? AND status = 'admitted'")
    .all(workerId).some(row => json(row.data_json)?.verifiedTradePartnerId === tradePartnerId);
}

function workerMatchesAssignmentTradePartner(db, assignment, workerId) {
  const requirement = assignmentTradePartnerRequirement(db, assignment);
  return requirement.valid && workerHasVerifiedTradePartner(db, workerId, requirement.requiredTradePartnerId);
}

function verifiedAssignmentsForWorker(db, assignments, workerId) {
  if (!workerId || !Array.isArray(assignments)) return [];
  const activeStatuses = new Set(['assigned', 'active', 'planned', 'in_progress']);
  return assignments.filter(assignment => (
    String(assignment.workerId || '') === String(workerId)
    && activeStatuses.has(String(assignment.status || '').toLowerCase())
    && workerMatchesAssignmentTradePartner(db, assignment, workerId)
  ));
}

function jobHasCompanyTargetedWork(db, jobId, assignments = []) {
  const activeStatuses = new Set(['assigned', 'active', 'planned', 'in_progress']);
  for (const assignment of assignments) {
    if (!activeStatuses.has(String(assignment.status || '').toLowerCase())) continue;
    const requirement = assignmentTradePartnerRequirement(db, assignment);
    if (!requirement.valid || requirement.requiredTradePartnerId) return true;
  }
  return db.prepare("SELECT data_json FROM work_board_positions WHERE job_id = ? AND status = 'open'")
    .all(jobId)
    .some(row => {
      const terms = json(row.data_json);
      return !terms || Boolean(terms.targetTradePartnerId);
    });
}

module.exports = {
  assignmentTradePartnerRequirement,
  jobHasCompanyTargetedWork,
  verifiedAssignmentsForWorker,
  workerHasVerifiedTradePartner,
  workerMatchesAssignmentTradePartner
};
