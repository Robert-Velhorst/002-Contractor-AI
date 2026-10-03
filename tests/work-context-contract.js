const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { WorkContext } = require('../work-context');
const { FieldWorkPack } = require('../field-work-pack');
const { ContractorReview } = require('../contractor-review');

function setup(ledger, jobOverrides = {}) {
  const context = new WorkContext(ledger);
  const job = ledger.createIntake({ title: 'Work context fixture', address: 'Original agreed address', client: { name: 'Customer', email: 'private-client@example.test' }, tasks: [{ title: 'Fit doors', durationHours: 8 }], assignAutomatically: false, ...jobOverrides });
  const other = ledger.createIntake({ title: 'Separate work order', client: { name: 'Other customer' }, tasks: [{ title: 'Other work' }], assignAutomatically: false });
  const worker = ledger.upsertWorker({ name: 'Named worker', role: 'Carpenter', status: 'available' });
  ledger.addAssignment(job.id, { workerId: worker.id, status: 'assigned', role: 'Carpenter' });
  const command = (action, record, jobId = job.id) => context.command(jobId, { action, record, sourceHash: context.read(jobId).sourceHash, entryKey: randomUUID() }, 'context-owner');
  return { context, ledger, job, other, worker, command, field: new FieldWorkPack(ledger) };
}
function hierarchy(f) {
  const site = f.command('save_place', { type: 'site', name: 'Workstraat 10', address: 'Workstraat 10' }).record;
  const building = f.command('save_place', { type: 'building', name: 'Woning', parentId: site.id }).record;
  const room = f.command('save_place', { type: 'space', name: 'Badkamer', parentId: building.id }).record;
  return { site, building, room };
}
function packageInput(f, placeId, quantityIds = []) {
  return { code: 'WP-01', title: 'Montage', outcome: 'Twee gemonteerde deuren', instructions: 'Controleer de maatvoering', stopPoint: 'Opening afzetten', handover: 'Foto en maat doorgeven', placeId, taskIds: [f.job.tasks[0].id], quantityIds };
}

function verifyContract(ledger) {
  const f = setup(ledger), { context, command, job, other, field, worker } = f;
  const { site, building, room } = hierarchy(f);
  assert.equal(ledger.getJobRow(job.id).address, 'Original agreed address');
  command('link_place', { placeId: room.id }, other.id);
  const beforeShared = context.read(other.id).sourceHash;
  command('save_place', { ...building, name: 'Hoofdwoning' });
  assert.notEqual(context.read(other.id).sourceHash, beforeShared);
  assert.throws(() => command('save_place', { ...site, parentId: room.id }), { statusCode: 400 });
  assert.throws(() => command('save_place', { ...room, type: 'site' }), { statusCode: 400 });
  assert.throws(() => command('archive_place', { id: site.id }), { statusCode: 409 });
  assert.equal(context.catalog({ search: 'BADKAMER' }).places[0].id, room.id);

  const takeoff = ledger.createTakeoff(job.id, { title: 'Doors', items: [{ description: 'Deur', measurementType: 'count', count: 2, unitCost: 80, unitPrice: 190 }] });
  const input = packageInput(f, room.id, [takeoff.items[0].id]);
  const item = command('save_package', input).record;
  assert.equal(context.read(job.id).packages[0].quantityIds[0], takeoff.items[0].id);
  assert.throws(() => ledger.removeTakeoffItem(job.id, takeoff.id, takeoff.items[0].id), { code: 'takeoff_item_in_work_package', statusCode: 409 });
  assert.throws(() => command('save_package', { ...input, code: 'WP-02' }), { statusCode: 409 });
  assert.throws(() => command('save_package', { ...input, id: item.id, taskIds: [other.tasks[0].id] }), { statusCode: 400 });
  assert.throws(() => command('save_package', { ...input, id: item.id }, other.id), { statusCode: 404 });
  const pack = field.read(job.id, worker.id);
  assert.equal(pack.know.workContext.packages[0].quantities[0].quantity, 2);
  for (const forbidden of ['unitCost', 'unitPrice', 'private-client@example.test']) assert.equal(JSON.stringify(pack).includes(forbidden), false);
  field.acknowledge(job.id, worker.id, { sourceHash: pack.sourceHash, entryKey: randomUUID(), understood: true }, 'worker');
  const party = command('save_party', { name: 'Private payer', roles: ['payer'], email: 'private-payer@example.test', shareWithField: false, reference: 'Reviewed agreement' }).record;
  assert.equal(field.read(job.id, worker.id).sourceHash, pack.sourceHash);
  command('save_party', { ...party, name: 'Revised payer' });
  assert.equal(field.read(job.id, worker.id).acknowledgment.current, true);
  assert.throws(() => command('save_party', { ...party, shareWithField: true }), { statusCode: 400 });
  const contact = command('save_party', { name: 'Site access', roles: ['site_contact', 'resident'], phone: '+31600000001', shareWithField: true, reference: 'Contact agreed' }).record;
  const changed = field.read(job.id, worker.id);
  assert.equal(changed.acknowledgment.current, false);
  assert.equal(changed.know.workContext.contacts.length, 1);
  assert.equal(changed.know.workContext.contacts[0].role, 'site_contact');
  assert.equal(JSON.stringify(changed).includes('private-payer'), false);
  assert.equal(changed.safetyClearance, false);
  field.acknowledge(job.id, worker.id, { sourceHash: changed.sourceHash, entryKey: randomUUID(), understood: true }, 'worker');
  command('save_party', { ...contact, shareWithField: false });
  assert.equal(JSON.stringify(field.read(job.id, worker.id)).includes('+31600000001'), false);
  const review = new ContractorReview(ledger), source = review.inspect(job.id).sourceHash;
  command('save_package', { ...item, instructions: 'Controleer de gewijzigde maatvoering' });
  assert.notEqual(review.inspect(job.id).sourceHash, source);
  assert.notEqual(field.read(job.id, worker.id).sourceHash, changed.sourceHash);
  assert.throws(() => command('archive_link', { id: context.read(job.id).links.find(link => link.placeId === room.id).id }), { statusCode: 409 });
  command('archive_package', { id: item.id });
  assert.equal(field.read(job.id, worker.id).know.workContext.packages.length, 0);
  command('restore_package', { id: item.id });
  assert.equal(field.read(job.id, worker.id).know.workContext.packages.length, 1);
  assert.equal(ledger.verifyAuditIntegrity().valid, true);
  assert.equal(context.exportRecords().work_packages.length, 1);
  return f;
}

module.exports = { setup, hierarchy, packageInput, verifyContract };
