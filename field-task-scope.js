const ACTIVE_ASSIGNMENT_STATUSES = new Set(['assigned', 'active', 'planned', 'in_progress']);
const CLOSED_TASK_STATUSES = new Set(['cancelled', 'canceled', 'deleted']);

function activeAssignmentsForWorker(detail = {}, workerId) {
  if (!workerId) return [];
  return (detail.assignments || []).filter(assignment => (
    String(assignment.workerId || '') === String(workerId)
    && ACTIVE_ASSIGNMENT_STATUSES.has(String(assignment.status || '').toLowerCase())
  ));
}

function fieldTaskScope(detail = {}, workerId, assignments = activeAssignmentsForWorker(detail, workerId)) {
  const workerAssignmentIds = new Set(assignments.map(assignment => assignment.id));
  const positionTaskIds = new Set(assignments.flatMap(assignment => (
    assignment.data?.workBoardPositionId && Array.isArray(assignment.data.workBoardTaskIds)
      ? assignment.data.workBoardTaskIds
      : []
  )));
  const hasOtherPositionTaskScope = (detail.assignments || []).some(assignment => (
    ACTIVE_ASSIGNMENT_STATUSES.has(String(assignment.status || '').toLowerCase())
    && !workerAssignmentIds.has(assignment.id)
    && assignment.data?.workBoardPositionId
    && Array.isArray(assignment.data.workBoardTaskIds)
    && assignment.data.workBoardTaskIds.length > 0
  ));
  const hasPositionTaskScope = positionTaskIds.size > 0 || hasOtherPositionTaskScope;
  const canSeeTask = task => {
    if (!workerId) return false;
    if (CLOSED_TASK_STATUSES.has(String(task.status || '').toLowerCase()) || task.data?.excludeFromWorkPlan === true) return false;
    const crewWorkerIds = Array.isArray(task.data?.crewWorkerIds) ? task.data.crewWorkerIds : [];
    const assignedToWorker = Boolean(workerId) && (task.assigneeId === workerId || crewWorkerIds.includes(workerId));
    const supervisorWorkerIds = Array.isArray(task.data?.supervisorWorkerIds) && task.data.supervisorWorkerIds.length
      ? task.data.supervisorWorkerIds : task.data?.supervisorWorkerId ? [task.data.supervisorWorkerId] : [];
    const supervisingWorker = Boolean(workerId) && supervisorWorkerIds.includes(workerId);
    if (task.assigneeId && !assignedToWorker && !supervisingWorker) return false;
    return !hasPositionTaskScope || assignedToWorker || supervisingWorker || positionTaskIds.has(task.id);
  };
  const visibleTaskIds = new Set((detail.tasks || []).filter(canSeeTask).map(task => task.id));
  return { positionTaskIds, hasPositionTaskScope, visibleTaskIds, canSeeTask };
}

module.exports = { activeAssignmentsForWorker, fieldTaskScope };
