const { parentPort, workerData } = require('node:worker_threads');
const { init, killThreads } = require('z3-solver');

async function run() {
  const api = await init();
  try {
    const ctx = api.Context(`resource-plan-${workerData.jobId}`);
    const { Optimize, Int, Bool, If, Implies, And, Or, Not, Sum } = ctx;
    const optimizer = new Optimize();
    optimizer.set('timeout', workerData.timeoutMs);
    const taskVars = new Map();
    const choicesByWorker = new Map();
    const starts = [];
    const preferences = [];

    for (const task of workerData.tasks) {
      const start = Int.const(`start_${task.id}`);
      const end = Int.const(`end_${task.id}`);
      optimizer.add(start.ge(task.earliestStartSlot));
      if (Number.isInteger(task.lockedStartSlot)) optimizer.add(start.eq(task.lockedStartSlot));
      optimizer.add(end.eq(start.add(task.durationSlots)));
      optimizer.add(end.le(workerData.horizonSlots));
      if (task.dueSlot !== null) optimizer.add(end.le(task.dueSlot));
      const choices = [];

      for (const candidate of task.candidates) {
        const selected = Bool.const(`task_${task.id}_candidate_${choices.length}`);
        const inWindow = candidate.windows.map(window => And(start.ge(window.startSlot), end.le(window.endSlot)));
        optimizer.add(Implies(selected, inWindow.length ? Or(...inWindow) : ctx.Bool.val(false)));
        for (const block of candidate.blocks) {
          optimizer.add(Implies(selected, Or(end.le(block.startSlot), start.ge(block.endSlot))));
        }
        choices.push({ selected, workerId: candidate.workerId, role: candidate.role, roleKey: candidate.roleKey,
          supervisorWorkerIds: candidate.supervisorWorkerIds || (candidate.supervisorWorkerId ? [candidate.supervisorWorkerId] : []),
          jobId: task.jobId || null, travelMinutesByJobId: task.travelMinutesByJobId || {} });
        if (Array.isArray(task.fixedCrewWorkerAssignments)) {
          const fixed = task.fixedCrewWorkerAssignments.some(member => member.workerId === candidate.workerId
            && String(member.role || '').normalize('NFKC').trim().toLocaleLowerCase('nl-NL').replace(/[^\p{L}\p{N}]+/gu, ' ') === candidate.roleKey);
          optimizer.add(fixed ? selected : Not(selected));
        }
        const workerChoices = choicesByWorker.get(candidate.workerId) || [];
        workerChoices.push({ selected, start, end, jobId: task.jobId || null, travelMinutesByJobId: task.travelMinutesByJobId || {} });
        choicesByWorker.set(candidate.workerId, workerChoices);
        if (task.currentWorkerId === candidate.workerId) preferences.push(If(selected, 1, 0));
      }
      const crewRequirements = task.crewRequirements?.length
        ? task.crewRequirements
        : [{ roleKey: task.candidates[0]?.roleKey, count: task.requiredCrewSize || 1 }];
      for (const requirement of crewRequirements) {
        const roleChoices = choices.filter(choice => choice.roleKey === requirement.roleKey);
        optimizer.add(Sum(...roleChoices.map(choice => If(choice.selected, 1, 0))).eq(requirement.count));
      }
      const taskSelected = Or(...choices.map(choice => choice.selected));
      for (const supervisorWorkerId of task.supervisorWorkerIds || (task.supervisorWorkerId ? [task.supervisorWorkerId] : [])) {
        const supervisorChoices = choicesByWorker.get(supervisorWorkerId) || [];
        supervisorChoices.push({ selected: taskSelected, start, end, jobId: task.jobId || null,
          travelMinutesByJobId: task.travelMinutesByJobId || {} });
        choicesByWorker.set(supervisorWorkerId, supervisorChoices);
      }
      if (task.currentWorkerId && !Array.isArray(task.fixedCrewWorkerAssignments)) {
        const currentChoices = choices.filter(choice => choice.workerId === task.currentWorkerId);
        optimizer.add(currentChoices.length ? Or(...currentChoices.map(choice => choice.selected)) : ctx.Bool.val(false));
      }
      taskVars.set(task.id, { start, end, choices, task });
      starts.push(start);
    }

    for (const { start, task } of taskVars.values()) {
      for (const predecessorId of task.predecessorIds) {
        const predecessor = taskVars.get(predecessorId);
        if (predecessor) optimizer.add(start.ge(predecessor.end.add(task.lagSlots[predecessorId] || 0)));
      }
    }

    for (const pairs of choicesByWorker.values()) {
      for (let left = 0; left < pairs.length; left += 1) {
        for (let right = left + 1; right < pairs.length; right += 1) {
          const a = pairs[left];
          const b = pairs[right];
          if (!a.jobId || !b.jobId || a.jobId === b.jobId) {
            optimizer.add(Implies(And(a.selected, b.selected), Or(a.end.le(b.start), b.end.le(a.start))));
          } else {
            const minutesAToB = Number(a.travelMinutesByJobId[b.jobId]);
            const minutesBToA = Number(b.travelMinutesByJobId[a.jobId]);
            if (!Number.isFinite(minutesAToB) || !Number.isFinite(minutesBToA)) {
              optimizer.add(Not(And(a.selected, b.selected)));
            } else {
              const travelAToB = Math.ceil(minutesAToB / 30);
              const travelBToA = Math.ceil(minutesBToA / 30);
              optimizer.add(Implies(And(a.selected, b.selected), Or(
                a.end.add(travelAToB).le(b.start), b.end.add(travelBToA).le(a.start)
              )));
            }
          }
        }
      }
    }

    optimizer.minimize(Sum(...starts));
    if (preferences.length) optimizer.maximize(Sum(...preferences));
    const status = await optimizer.check();
    if (String(status) === 'unsat') return { status: 'infeasible', ready: false };
    if (String(status) !== 'sat') {
      const reason = String(optimizer.reasonUnknown?.() || 'solver_unknown');
      return { status: /timeout/i.test(reason) ? 'timed_out' : 'solver_unknown', ready: false, reason };
    }

    const model = optimizer.model();
    const assignments = [];
    for (const { start, choices, task } of taskVars.values()) {
      const startValue = Number(model.eval(start).toString());
      const crewMembers = choices.filter(choice => model.eval(choice.selected).toString() === 'true')
        .map(choice => ({ workerId: choice.workerId, role: choice.role })).sort((a, b) => `${a.workerId}:${a.role}`.localeCompare(`${b.workerId}:${b.role}`));
      if (!crewMembers.length || !Number.isFinite(startValue)) return { status: 'solver_unknown', ready: false, reason: 'model_value_missing' };
      const lead = crewMembers.find(member => member.workerId === task.currentWorkerId) || crewMembers[0];
      assignments.push({ taskId: task.id, workerId: lead.workerId, workerIds: crewMembers.map(member => member.workerId),
        crewMembers, supervisorWorkerIds: task.supervisorWorkerIds || (task.supervisorWorkerId ? [task.supervisorWorkerId] : []),
        supervisorWorkerId: task.supervisorWorkerIds?.[0] || task.supervisorWorkerId || null, startSlot: startValue });
    }
    return { status: 'feasible', ready: true, assignments, objective: { totalStartSlots: assignments.reduce((sum, row) => sum + row.startSlot, 0) } };
  } finally {
    await killThreads(api.em);
  }
}

run().then(result => parentPort.postMessage(result)).catch(error => parentPort.postMessage({
  status: 'solver_error',
  ready: false,
  reason: error?.message || 'solver_error'
}));
