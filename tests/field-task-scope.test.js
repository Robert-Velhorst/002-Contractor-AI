const test = require('node:test');
const assert = require('node:assert/strict');
const { fieldTaskScope } = require('../field-task-scope');

test('an unrelated position assignment cannot leak its linked tasks through another job assignment', () => {
  const detail = {
    assignments: [
      { id: 'worker-a-unscoped', workerId: 'worker-a', status: 'assigned', data: {} },
      { id: 'worker-b-position', workerId: 'worker-b', status: 'assigned', data: { workBoardPositionId: 'position-b', workBoardTaskIds: ['task-b'] } }
    ],
    tasks: [
      { id: 'task-general', status: 'open' },
      { id: 'task-a', status: 'open', assigneeId: 'worker-a' },
      { id: 'task-b', status: 'open' }
    ]
  };

  const scope = fieldTaskScope(detail, 'worker-a');
  assert.equal(scope.hasPositionTaskScope, true);
  assert.deepEqual([...scope.visibleTaskIds], ['task-a']);
});

test('a worker retains their own linked tasks while another position stays hidden', () => {
  const detail = {
    assignments: [
      { id: 'worker-a-position', workerId: 'worker-a', status: 'assigned', data: { workBoardPositionId: 'position-a', workBoardTaskIds: ['task-a'] } },
      { id: 'worker-b-position', workerId: 'worker-b', status: 'assigned', data: { workBoardPositionId: 'position-b', workBoardTaskIds: ['task-b'] } }
    ],
    tasks: [
      { id: 'task-a', status: 'open' },
      { id: 'task-b', status: 'open' }
    ]
  };

  const scope = fieldTaskScope(detail, 'worker-a');
  assert.deepEqual([...scope.visibleTaskIds], ['task-a']);
});

test('a planned crew member sees their shared task without gaining a different position scope', () => {
  const detail = {
    assignments: [
      { id: 'worker-a-position', workerId: 'worker-a', status: 'assigned', data: { workBoardPositionId: 'position-a', workBoardTaskIds: ['task-a'] } },
      { id: 'worker-b-position', workerId: 'worker-b', status: 'assigned', data: { workBoardPositionId: 'position-b', workBoardTaskIds: ['task-b'] } }
    ],
    tasks: [
      { id: 'task-a', status: 'open', assigneeId: 'worker-a', data: { crewWorkerIds: ['worker-a', 'worker-c'] } },
      { id: 'task-b', status: 'open' }
    ]
  };

  const scope = fieldTaskScope(detail, 'worker-c', [{ id: 'worker-c-assignment', workerId: 'worker-c', status: 'assigned', data: {} }]);
  assert.deepEqual([...scope.visibleTaskIds], ['task-a']);
});

test('the task creator rejects out-of-range crew sizes', () => {
  const { ContractorOperatingLedger } = require('../operating-ledger');
  const ledger = new ContractorOperatingLedger({ dbFile: ':memory:' });
  try {
    const job = ledger.createIntake({ title: 'Crew size validation', tasks: [], assignAutomatically: false });
    assert.throws(() => ledger.addTask(job.id, { title: 'Invalid crew', requiredCrewSize: 13 }), { code: 'task_required_crew_size_invalid' });
    assert.throws(() => ledger.addTask(job.id, { title: 'Fractional crew', requiredCrewSize: 1.5 }), { code: 'task_required_crew_size_invalid' });
    assert.throws(() => ledger.addTask(job.id, { title: 'Duplicate trade groups', requiredCrewRequirements: [
      { role: 'Electrician', count: 1 }, { role: ' electrician ', count: 1 }
    ] }), { code: 'task_crew_requirements_invalid' });
    assert.throws(() => ledger.addTask(job.id, { title: 'Oversized mixed crew', requiredCrewRequirements: [
      { role: 'Carpenter', count: 7 }, { role: 'Electrician', count: 6 }
    ] }), { code: 'task_required_crew_size_invalid' });
    const task = ledger.addTask(job.id, { title: 'Valid mixed crew', requiredCrewRequirements: [
      { role: 'Carpenter', count: 2 }, { role: 'Electrician', count: 1 }
    ] });
    assert.equal(task.data.requiredCrewSize, 3);
    assert.deepEqual(task.data.requiredCrewRequirements, [{ role: 'Carpenter', count: 2 }, { role: 'Electrician', count: 1 }]);
    const supervisors = ['Lead A', 'Lead B'].map(name => ledger.upsertWorker({ name, role: 'Site Supervisor', status: 'available' }));
    for (const supervisor of supervisors) ledger.addAssignment(job.id, { workerId: supervisor.id, role: 'Site Supervisor', status: 'assigned' });
    const ratioTask = { title: 'Supervised mixed crew', requiredCrewRequirements: [{ role: 'Carpenter', count: 2 }],
      supervisionRatio: { workersPerSupervisor: 1 }, supervisorWorkerIds: supervisors.map(supervisor => supervisor.id), supervisorTrade: 'Site Supervisor' };
    assert.throws(() => ledger.addTask(job.id, { ...ratioTask, supervisorWorkerIds: [supervisors[0].id] }), { code: 'task_supervisor_count_insufficient' });
    const supervised = ledger.addTask(job.id, ratioTask);
    assert.deepEqual(supervised.data.supervisorWorkerIds, supervisors.map(supervisor => supervisor.id));
    assert.deepEqual(supervised.data.supervisionRatio, { workersPerSupervisor: 1, requiredSupervisorCount: 2 });
  } finally {
    ledger.close();
  }
});
