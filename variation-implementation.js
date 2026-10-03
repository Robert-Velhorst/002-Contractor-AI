'use strict';

const crypto = require('node:crypto');

const TARGET_TYPE = 'variation_implementation_plan';
const MAX_TASKS = 30;
const MAX_MATERIALS = 100;

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function fail(code, message, statusCode = 409, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  Object.assign(error, details);
  throw error;
}

function requiredText(value, label, max = 2000) {
  const text = String(value || '').trim();
  if (text.length < 2 || text.length > max) fail('variation_implementation_invalid', `${label} must contain 2 to ${max} characters.`, 400);
  return text;
}

function normalizedPlan(payload = {}) {
  const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
  if (tasks.length < 1 || tasks.length > MAX_TASKS) fail('variation_implementation_invalid', `Add between 1 and ${MAX_TASKS} tasks.`, 400);
  return {
    tasks: tasks.map((task, taskIndex) => {
      const materials = Array.isArray(task.materials) ? task.materials : [];
      if (materials.length > 30) fail('variation_implementation_invalid', 'A task can have at most 30 material requirements.', 400);
      const durationHours = task.durationHours === '' || task.durationHours === null || task.durationHours === undefined
        ? null
        : Number(task.durationHours);
      if (durationHours !== null && (!Number.isFinite(durationHours) || durationHours <= 0 || durationHours > 2000)) {
        fail('variation_implementation_invalid', `Task ${taskIndex + 1} duration must be greater than 0 and at most 2000 hours.`, 400);
      }
      return {
        title: requiredText(task.title, `Task ${taskIndex + 1} title`, 180),
        description: String(task.description || '').trim().slice(0, 2000) || null,
        durationHours,
        materials: materials.map((material, materialIndex) => {
          const quantity = Number(material.quantity);
          if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000000) {
            fail('variation_implementation_invalid', `Material ${materialIndex + 1} quantity must be greater than 0.`, 400);
          }
          return {
            name: requiredText(material.name, `Material ${materialIndex + 1} name`, 180),
            quantity,
            unit: requiredText(material.unit || 'stuk', `Material ${materialIndex + 1} unit`, 40)
          };
        })
      };
    })
  };
}

function verifyPlanIntegrity(data) {
  try {
    const { planHash, application: _application, ...unsigned } = data || {};
    return data?.format === 'contractor-ai.variation-implementation.v1'
      && Boolean(planHash)
      && hash(unsigned) === planHash
      && hash(data.tasks) === hash(normalizedPlan({ tasks: data.tasks }).tasks);
  } catch {
    return false;
  }
}

function verifyAppliedVariationTask(ledger, job, task) {
  const rows = ledger.db.prepare("SELECT * FROM approvals WHERE target_type = ? AND job_id = ? AND status = 'approved'")
    .all(TARGET_TYPE, job.id);
  const applied = rows.map(row => ledger.mapApproval(row))
    .find(approval => approval.data?.application?.taskIds?.includes(task?.id));
  if (!applied) return { isVariationTask: false, valid: true };
  const planId = applied.targetId;
  const row = rows.find(candidate => candidate.target_id === planId);
  if (!row) return { isVariationTask: true, valid: false };
  const approval = applied;
  const data = approval.data;
  if (task?.data?.source !== TARGET_TYPE || task.data.targetId !== planId
    || !verifyPlanIntegrity(data) || !data.application?.taskIds?.length) return { isVariationTask: true, valid: false };
  const taskIndex = data.application.taskIds.indexOf(task.id);
  const expected = data.tasks[taskIndex];
  const change = job.changeOrders.find(item => item.id === data.changeOrderId);
  if (taskIndex < 0 || !expected || !change || change.status !== 'accepted' || !change.integrityValid || !change.workAuthorized
    || change.snapshotHash !== data.variationSnapshotHash || task.data.changeOrderId !== data.changeOrderId
    || task.data.variationSnapshotHash !== data.variationSnapshotHash || task.status !== 'open'
    || task.title !== expected.title || (task.description || null) !== (expected.description || null)
    || Number(task.durationHours || 0) !== Number(expected.durationHours || 0)) return { isVariationTask: true, valid: false };
  let source;
  try {
    source = new VariationImplementation(ledger).acceptanceBasis(job.id, data.changeOrderId);
  } catch {
    return { isVariationTask: true, valid: false };
  }
  if (source.variationSnapshotHash !== data.variationSnapshotHash || source.acceptanceHash !== data.acceptanceHash) {
    return { isVariationTask: true, valid: false };
  }
  const requirementIds = task.data.materialRequirementIds || [];
  if (requirementIds.length !== expected.materials.length) return { isVariationTask: true, valid: false };
  const actualMaterials = requirementIds.map(id => job.materials.find(item => item.id === id));
  if (actualMaterials.some((item, index) => !item
    || item.status !== 'needed' || item.supplier !== null || Number(item.cost) !== 0 || item.neededBy !== null
    || item.data?.source !== TARGET_TYPE || item.data?.targetId !== planId || Number(item.data?.taskIndex) !== taskIndex
    || item.name.toLocaleLowerCase() !== expected.materials[index].name.toLocaleLowerCase()
    || Number(item.quantity) !== Number(expected.materials[index].quantity)
    || item.unit.toLocaleLowerCase() !== expected.materials[index].unit.toLocaleLowerCase())) {
    return { isVariationTask: true, valid: false };
  }
  return { isVariationTask: true, valid: true, approval, change, taskIndex };
}

class VariationImplementation {
  constructor(ledger) {
    this.ledger = ledger;
  }

  operationalSnapshot(jobId) {
    const tasks = this.ledger.db.prepare(`
      SELECT id, title, description, status, priority, assignee_id, due_at, planned_start,
        planned_end, duration_hours, data_json, updated_at
      FROM job_tasks WHERE job_id = ? ORDER BY id
    `).all(jobId);
    const materials = this.ledger.db.prepare(`
      SELECT id, material_id, name, quantity, unit, status, supplier, cost, needed_by, data_json, updated_at
      FROM material_requirements WHERE job_id = ? ORDER BY id
    `).all(jobId);
    const dependencies = this.ledger.db.prepare(`
      SELECT id, predecessor_task_id, successor_task_id, dependency_type, lag_hours, status, data_json, updated_at
      FROM task_dependencies WHERE job_id = ? ORDER BY id
    `).all(jobId);
    return { tasks, materials, dependencies };
  }

  acceptanceBasis(jobId, changeOrderId) {
    const row = this.ledger.db.prepare('SELECT * FROM change_orders WHERE id = ? AND job_id = ?').get(changeOrderId, jobId);
    if (!row) fail('change_order_not_found', 'The accepted variation was not found for this job.', 404);
    const changeOrder = this.ledger.mapChangeOrder(row);
    if (changeOrder.status !== 'accepted' || !changeOrder.integrityValid || !changeOrder.workAuthorized) {
      fail('variation_not_authorized', 'Only an integrity-checked, formally accepted variation can be prepared for implementation.');
    }
    const acceptance = changeOrder.data?.acceptance;
    const issue = changeOrder.data?.issuePackage;
    if (!acceptance?.approvalId || !acceptance?.packageHash || !acceptance?.documentId || !acceptance?.deliveryCommunicationId
      || acceptance.packageHash !== issue?.packageHash
      || acceptance.documentId !== issue?.documentId
      || acceptance.deliveryCommunicationId !== issue?.communicationId
      || acceptance.issueReference !== issue?.issueReference
      || acceptance.sourceBasisHash !== issue?.sourceBasisHash) {
      fail('variation_acceptance_chain_invalid', 'The accepted variation no longer matches its verified issue and acceptance package.');
    }
    const acceptanceApproval = this.ledger.db.prepare("SELECT * FROM approvals WHERE id = ? AND target_type = 'change_order_acceptance' AND target_id = ? AND status = 'approved'")
      .get(acceptance.approvalId, changeOrderId);
    if (!acceptanceApproval) fail('variation_acceptance_chain_invalid', 'The acceptance approval is missing or no longer approved.');
    const approvalData = JSON.parse(acceptanceApproval.data_json || '{}');
    if (approvalData.packageHash !== acceptance.packageHash
      || approvalData.documentId !== acceptance.documentId
      || approvalData.deliveryCommunicationId !== acceptance.deliveryCommunicationId) {
      fail('variation_acceptance_chain_invalid', 'The verified acceptance does not bind to the retained package.');
    }
    const issuePackage = this.ledger.getChangeOrderIssuePackage(acceptance.documentId, { audit: false });
    if (issuePackage.packageHash !== acceptance.packageHash || issuePackage.document.data?.sourceRecordId !== changeOrderId) {
      fail('variation_acceptance_chain_invalid', 'The issued variation package checksum or source is no longer valid.');
    }
    const deliveryRow = this.ledger.db.prepare('SELECT * FROM communication_records WHERE id = ? AND job_id = ?')
      .get(acceptance.deliveryCommunicationId, jobId);
    const delivery = deliveryRow ? this.ledger.mapCommunication(deliveryRow) : null;
    if (delivery?.status !== 'sent'
      || delivery.data?.source !== 'change_order_issue_package'
      || delivery.data?.sourceRecordId !== changeOrderId
      || delivery.data?.packageHash !== acceptance.packageHash
      || !delivery.data?.deliveryReceipt) {
      fail('variation_acceptance_chain_invalid', 'The verified delivery receipt is missing or does not match the accepted variation.');
    }
    return {
      changeOrder,
      acceptance,
      acceptanceHash: hash(acceptance),
      variationSnapshotHash: changeOrder.snapshotHash,
      issuePackageHash: issuePackage.packageHash
    };
  }

  prepare(jobId, changeOrderId, payload = {}, options = {}) {
    return this.ledger.transaction(() => {
      this.ledger.requireJob(jobId);
      const entryKey = requiredText(payload.entryKey, 'Request key', 120);
      const tasks = normalizedPlan(payload).tasks;
      const materialCount = tasks.reduce((sum, task) => sum + task.materials.length, 0);
      if (materialCount > MAX_MATERIALS) fail('variation_implementation_invalid', `A plan can have at most ${MAX_MATERIALS} material requirements.`, 400);
      const source = this.acceptanceBasis(jobId, changeOrderId);
      const requestFingerprint = hash({ jobId, changeOrderId, tasks });
      const approvals = this.ledger.db.prepare("SELECT * FROM approvals WHERE target_type = ? AND job_id = ? ORDER BY created_at DESC")
        .all(TARGET_TYPE, jobId);
      const replay = approvals.map(row => this.ledger.mapApproval(row)).find(item => item.data?.entryKey === entryKey);
      if (replay) {
        if (replay.data.requestFingerprint !== requestFingerprint) {
          fail('variation_implementation_replay_conflict', 'This request key was already used for different implementation details.', 409);
        }
        return { approval: replay, replayed: true };
      }
      const existingPlan = approvals.map(row => this.ledger.mapApproval(row)).find(item => item.data?.changeOrderId === changeOrderId && ['pending', 'approved'].includes(item.status));
      if (existingPlan) fail('variation_implementation_already_exists', 'This accepted variation already has a pending or approved implementation plan.', 409, { approvalId: existingPlan.id });

      const data = {
        format: 'contractor-ai.variation-implementation.v1',
        entryKey,
        requestFingerprint,
        changeOrderId,
        variationNumber: source.changeOrder.variationNumber,
        revisionNumber: source.changeOrder.revisionNumber,
        variationTitle: source.changeOrder.title,
        acceptedScope: source.changeOrder.scopeDelta,
        variationSnapshotHash: source.variationSnapshotHash,
        acceptanceHash: source.acceptanceHash,
        issuePackageHash: source.issuePackageHash,
        operationalHash: hash(this.operationalSnapshot(jobId)),
        tasks,
        planHash: null,
        externalCommitments: 0
      };
      const { planHash: _unusedPlanHash, ...unsigned } = data;
      data.planHash = hash(unsigned);
      const targetId = `varimpl_${hash({ jobId, changeOrderId, entryKey }).slice(0, 32)}`;
      const approval = this.ledger.createApproval({
        id: `approval_${hash({ targetId, planHash: data.planHash }).slice(0, 32)}`,
        targetType: TARGET_TYPE,
        targetId,
        jobId,
        approvalType: 'variation_implementation',
        summary: `Review ${tasks.length} implementation task${tasks.length === 1 ? '' : 's'} for ${source.changeOrder.variationNumber || 'accepted variation'}`,
        reason: 'Translate the exact client-accepted scope into internal work steps and material needs. Approval creates unassigned open tasks and needs-only material records.',
        data
      }, { actor: options.actor || 'Contractor.AI' });
      this.ledger.audit({
        entityType: 'variation_implementation_plan', entityId: targetId, jobId,
        action: 'prepare_variation_implementation', actor: options.actor || 'Contractor.AI',
        after: approval,
        metadata: { approvalId: approval.id, changeOrderId, taskCount: tasks.length, materialCount, externalCommitments: 0 }
      });
      return { approval, replayed: false };
    });
  }

  validate(approval) {
    const data = approval?.data || {};
    if (!verifyPlanIntegrity(data)) {
      fail('variation_implementation_integrity_invalid', 'The implementation approval has no supported, checksummed plan.');
    }
    const source = this.acceptanceBasis(approval.jobId || approval.job_id, data.changeOrderId);
    if (source.variationSnapshotHash !== data.variationSnapshotHash
      || source.acceptanceHash !== data.acceptanceHash
      || source.issuePackageHash !== data.issuePackageHash) {
      fail('variation_implementation_source_changed', 'The accepted variation or its verified acceptance evidence changed after this plan was submitted.');
    }
    if (hash(this.operationalSnapshot(approval.jobId || approval.job_id)) !== data.operationalHash) {
      fail('variation_implementation_operational_state_changed', 'Job tasks, material needs, or dependencies changed after this plan was submitted; prepare it again against the current job state.');
    }
    return source;
  }

  apply(targetId) {
    const row = this.ledger.db.prepare("SELECT * FROM approvals WHERE target_type = ? AND target_id = ? AND status = 'approved'").get(TARGET_TYPE, targetId);
    if (!row) fail('variation_implementation_approval_required', 'An approved implementation plan is required.');
    const approval = this.ledger.mapApproval(row);
    this.validate(approval);
    const actor = approval.resolvedBy || 'approval';
    const taskIds = [];
    const materialRequirementIds = [];
    for (const [taskIndex, task] of approval.data.tasks.entries()) {
      const linkedRequirements = task.materials.map((material, materialIndex) => {
        const id = `varmat_${hash({ planId: targetId, taskIndex, materialIndex }).slice(0, 28)}`;
        const requirement = this.ledger.addMaterialRequirement(approval.jobId, {
          id,
          name: material.name,
          quantity: material.quantity,
          unit: material.unit,
          status: 'needed',
          supplier: null,
          cost: 0,
          neededBy: null,
          data: { source: TARGET_TYPE, targetId, taskIndex, taskTitle: task.title }
        }, { actor, audit: false });
        materialRequirementIds.push(requirement.id);
        return requirement.id;
      });
      const id = `vartask_${hash({ planId: targetId, taskIndex }).slice(0, 28)}`;
      const created = this.ledger.addTask(approval.jobId, {
        id,
        title: task.title,
        description: task.description,
        status: 'open',
        durationHours: task.durationHours,
        materialRequirementIds: linkedRequirements,
        source: TARGET_TYPE,
        data: { source: TARGET_TYPE, targetId, changeOrderId: approval.data.changeOrderId, variationSnapshotHash: approval.data.variationSnapshotHash }
      }, { actor, audit: false });
      taskIds.push(created.id);
      this.ledger.audit({ entityType: 'task', entityId: created.id, jobId: approval.jobId, action: 'create_variation_implementation_task', actor, after: created, metadata: { approvalId: approval.id, targetId, externalCommitments: 0 } });
    }
    for (const id of materialRequirementIds) {
      const requirement = this.ledger.mapMaterialRequirement(this.ledger.db.prepare('SELECT * FROM material_requirements WHERE id = ?').get(id));
      this.ledger.audit({ entityType: 'material_requirement', entityId: id, jobId: approval.jobId, action: 'create_variation_material_need', actor, after: requirement, metadata: { approvalId: approval.id, targetId, externalCommitments: 0 } });
    }
    const timestamp = new Date().toISOString();
    const application = { appliedAt: timestamp, appliedBy: actor, taskIds, materialRequirementIds, externalCommitments: 0 };
    const nextData = { ...approval.data, application };
    this.ledger.db.prepare('UPDATE approvals SET data_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(nextData), timestamp, approval.id);
    this.ledger.audit({
      entityType: 'variation_implementation_plan', entityId: targetId, jobId: approval.jobId,
      action: 'apply_variation_implementation', actor,
      before: approval, after: { ...approval, data: nextData },
      metadata: { approvalId: approval.id, changeOrderId: approval.data.changeOrderId, taskCount: taskIds.length, materialCount: materialRequirementIds.length, externalCommitments: 0 }
    });
  }
}

module.exports = { VariationImplementation, TARGET_TYPE, verifyPlanIntegrity, verifyAppliedVariationTask };
