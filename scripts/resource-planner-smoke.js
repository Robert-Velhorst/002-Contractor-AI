// Execute against the packaged runtime, including its worker and solver dependency.
async function resourcePlannerSmoke() {
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { ContractorOperatingLedger } = require('./operating-ledger');
  const { ResourcePlanner } = require('./resource-planner');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-resource-smoke-'));
  let ledger;
  try {
    ledger = new ContractorOperatingLedger({ dbFile: path.join(directory, 'ledger.sqlite') });
    const plannedStart = '2026-10-05T06:00:00.000Z';
    const scheduledEnd = '2026-10-05T14:00:00.000Z';
    const job = ledger.createIntake({ title: 'Isolated packaged resource fixture', scheduledStart: plannedStart,
      scheduledEnd, tasks: [{ title: 'Install fixture', durationHours: 2, requiredTrade: 'Installer' }], assignAutomatically: false });
    const worker = ledger.upsertWorker({ name: 'Fixture installer', role: 'Installer', status: 'available' });
    ledger.addAssignment(job.id, { workerId: worker.id, role: 'Installer', status: 'planned', scheduledStart: plannedStart, scheduledEnd });
    const jobData = JSON.parse(ledger.db.prepare('SELECT data_json FROM jobs WHERE id = ?').get(job.id).data_json);
    jobData.preconstructionCapacityForecast = { format: 'contractor_ai_preconstruction_capacity_forecast_v1', snapshotHash: 'a'.repeat(64),
      forecast: { windowStart: '2026-10-05', windowEnd: '2026-10-05', trades: [{ role: 'Installer', hours: 2,
        dailyDemand: [{ date: '2026-10-05', hours: 2 }] }] } };
    ledger.db.prepare('UPDATE jobs SET data_json = ? WHERE id = ?').run(JSON.stringify(jobData), job.id);
    const before = ledger.getJobDetail(job.id);
    const proposal = await new ResourcePlanner(ledger).preview(job.id, { plannedStart, horizonDays: 1 });
    assert.equal(proposal.status, 'feasible_under_recorded_constraints', JSON.stringify(proposal.issues));
    assert.equal(proposal.tasks.length, 1);
    assert.equal(proposal.tasks[0].workerId, worker.id);
    assert.equal(proposal.preconstructionReconciliation.datedComparison.status, 'compared');
    assert.equal(proposal.preconstructionReconciliation.datedComparison.roles[0].days[0].varianceHours, 0);
    assert.deepEqual(ledger.getJobDetail(job.id), before, 'A preview must not write or approve a schedule.');
    process.stdout.write(`${JSON.stringify({ valid: true, packagedResourcePlanning: true, datedForecast: true, previewReadOnly: true })}\n`);
  } finally {
    ledger?.close();
    assert.equal(path.dirname(directory), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('contractor-resource-smoke-'));
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

const resourcePlannerSmokeCode = `(${resourcePlannerSmoke.toString()})().catch(error => { console.error(error); process.exitCode = 1; });`;
module.exports = { resourcePlannerSmoke, resourcePlannerSmokeCode };
