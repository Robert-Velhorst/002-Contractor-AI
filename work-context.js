const { createHash, randomUUID } = require('node:crypto');
const { stableJson } = require('./backup-manifest');
const { isValidEmailAddress } = require('./email-validation');

const TABLES = ['work_context_control', 'work_places', 'job_places', 'job_parties', 'work_packages', 'work_package_tasks', 'work_package_quantities', 'work_context_commands'];
const PLACE_TYPES = ['site', 'building', 'floor', 'space', 'zone', 'asset'];
const PARTY_ROLES = ['customer', 'owner', 'resident', 'payer', 'decision_maker', 'site_contact', 'designer', 'inspector'];
const PARENTS = { site: [], building: ['site'], floor: ['building'], space: ['building', 'floor'], zone: ['site', 'building', 'floor', 'space'], asset: ['site', 'building', 'floor', 'space', 'zone'] };
const digest = value => createHash('sha256').update(stableJson(value)).digest('hex');
function fail(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode, code: 'work_context_invalid' }); }
function text(value, label, max = 200, optional = false) {
  if (optional && (value == null || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.length > max || [...value].some(char => char.charCodeAt(0) < 32 && !['\n', '\r', '\t'].includes(char))) fail(`${label} ontbreekt of is ongeldig.`);
  return value.trim();
}
function ids(value, label) {
  if (!Array.isArray(value) || value.length > 200) fail(`${label}: maximaal 200 koppelingen.`);
  const result = value.map(id => text(id, label, 150));
  if (new Set(result).size !== result.length) fail(`${label} bevat dubbele koppelingen.`);
  return result.sort();
}
function map(row) {
  const { data_json, ...record } = row;
  return { ...JSON.parse(data_json || '{}'), id: record.id, ...(record.job_id ? { jobId: record.job_id } : {}),
    ...(Object.hasOwn(record, 'parent_id') ? { parentId: record.parent_id } : {}),
    ...(record.place_id ? { placeId: record.place_id } : {}),
    revision: Number(record.revision), archived: Boolean(record.archived), createdAt: record.created_at, updatedAt: record.updated_at };
}

function migrateWorkContext(db) {
  db.exec(`
    CREATE TABLE work_context_control (id TEXT PRIMARY KEY CHECK(id = 'current'), revision INTEGER NOT NULL);
    INSERT INTO work_context_control (id, revision) VALUES ('current', 0);
    CREATE TABLE work_places (
      id TEXT PRIMARY KEY, parent_id TEXT REFERENCES work_places(id), data_json TEXT NOT NULL,
      revision INTEGER NOT NULL, archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_work_places_parent ON work_places(parent_id, archived);
    CREATE TABLE job_places (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      place_id TEXT NOT NULL REFERENCES work_places(id), data_json TEXT NOT NULL DEFAULT '{}',
      revision INTEGER NOT NULL, archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(job_id, place_id)
    );
    CREATE INDEX idx_job_places_place ON job_places(place_id, archived);
    CREATE TABLE job_parties (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE, data_json TEXT NOT NULL,
      revision INTEGER NOT NULL, archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_job_parties_job ON job_parties(job_id, archived);
    CREATE TABLE work_packages (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE, place_id TEXT REFERENCES work_places(id), data_json TEXT NOT NULL,
      revision INTEGER NOT NULL, archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_work_packages_job ON work_packages(job_id, archived);
    CREATE TABLE work_package_tasks (
      id TEXT PRIMARY KEY, package_id TEXT NOT NULL REFERENCES work_packages(id) ON DELETE CASCADE,
      task_id TEXT NOT NULL UNIQUE REFERENCES job_tasks(id), UNIQUE(package_id, task_id)
    );
    CREATE TABLE work_package_quantities (
      id TEXT PRIMARY KEY, package_id TEXT NOT NULL REFERENCES work_packages(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL UNIQUE REFERENCES takeoff_items(id), UNIQUE(package_id, item_id)
    );
    CREATE TABLE work_context_commands (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      request_hash TEXT NOT NULL, response_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX idx_work_context_commands_job ON work_context_commands(job_id);
  `);
  // New business tables retain the same database-native authority boundary as 076.
  require('./company-authority').installAuthorityGuards(db, TABLES);
}

class WorkContext {
  constructor(ledger) { this.ledger = ledger; this.db = ledger.db; }
  lock(jobId) {
    this.db.prepare("UPDATE work_context_control SET revision = revision WHERE id = 'current'").run();
    this.db.prepare('UPDATE jobs SET title = title WHERE id = ?').run(jobId);
    this.db.prepare('UPDATE job_tasks SET title = title WHERE job_id = ?').run(jobId);
    this.db.prepare('UPDATE takeoff_sheets SET title = title WHERE job_id = ?').run(jobId);
    this.db.prepare('UPDATE takeoff_items SET description = description WHERE takeoff_id IN (SELECT id FROM takeoff_sheets WHERE job_id = ?)').run(jobId);
  }
  catalog({ after = '', search = '' } = {}) {
    const query = text(search, 'Zoekterm', 120, true).toLowerCase();
    const rows = this.db.prepare('SELECT * FROM work_places WHERE id > ? ORDER BY id').all(text(after, 'Cursor', 150, true))
      .map(map).filter(row => !query || row.name.toLowerCase().includes(query));
    return { places: rows.slice(0, 100), nextCursor: rows.length > 100 ? rows[99].id : null };
  }
  place(id) {
    const row = this.db.prepare('SELECT * FROM work_places WHERE id = ?').get(id);
    if (!row) fail('Locatie niet gevonden.', 404);
    return map(row);
  }
  placesFor(idsToRead) {
    const retained = new Map();
    for (const id of idsToRead) {
      const seen = new Set(); let next = id;
      while (next) {
        if (seen.has(next) || seen.size >= 10) fail('Locatiehierarchie vereist herstel.', 409);
        seen.add(next);
        const place = this.place(next); retained.set(next, place); next = place.parentId;
      }
    }
    return [...retained.values()].sort((a, b) => a.id.localeCompare(b.id));
  }
  source(jobId) {
    this.ledger.requireJob(jobId, { allowInactive: true });
    const links = this.db.prepare('SELECT * FROM job_places WHERE job_id = ? ORDER BY id').all(jobId).map(map);
    const packages = this.db.prepare('SELECT * FROM work_packages WHERE job_id = ? ORDER BY id').all(jobId).map(map).map(item => ({ ...item,
      taskIds: this.db.prepare('SELECT task_id FROM work_package_tasks WHERE package_id = ? ORDER BY task_id').all(item.id).map(row => row.task_id),
      quantityIds: this.db.prepare('SELECT item_id FROM work_package_quantities WHERE package_id = ? ORDER BY item_id').all(item.id).map(row => row.item_id) }));
    return { format: 'contractor-work-context/v1', jobId, links, places: this.placesFor([...new Set([...links.map(row => row.placeId), ...packages.map(row => row.placeId).filter(Boolean)])]),
      parties: this.db.prepare('SELECT * FROM job_parties WHERE job_id = ? ORDER BY id').all(jobId).map(map), packages,
      tasks: this.db.prepare('SELECT * FROM job_tasks WHERE job_id = ? ORDER BY id').all(jobId).map(row => this.ledger.mapTask(row)),
      quantities: this.db.prepare('SELECT takeoff_items.*, takeoff_sheets.status AS sheet_status FROM takeoff_items JOIN takeoff_sheets ON takeoff_sheets.id = takeoff_items.takeoff_id WHERE takeoff_sheets.job_id = ? ORDER BY takeoff_items.id')
        .all(jobId).map(row => ({ ...this.ledger.mapTakeoffItem(row), sheetStatus: row.sheet_status })) };
  }
  read(jobId) {
    const source = this.source(jobId);
    return { ...source, sourceHash: digest(source) };
  }
  field(jobId, visibleTaskIds) {
    const context = this.source(jobId), visible = new Set(visibleTaskIds);
    const packages = context.packages.filter(row => !row.archived && row.taskIds.some(id => visible.has(id))).map(row => ({
      id: row.id, code: row.code, title: row.title, outcome: row.outcome, instructions: row.instructions, stopPoint: row.stopPoint,
      handover: row.handover, placeId: row.placeId || null, revision: row.revision,
      taskIds: row.taskIds.filter(id => visible.has(id)),
      quantities: row.quantityIds.map(id => context.quantities.find(item => item.id === id)).filter(Boolean)
        .map(item => ({ id: item.id, description: item.description, quantity: item.quantity, unit: item.unit, sourceReference: item.sourceReference, sheetStatus: item.sheetStatus }))
    }));
    const places = this.placesFor([...new Set([...context.links.filter(row => !row.archived).map(row => row.placeId), ...packages.map(row => row.placeId).filter(Boolean)])])
      .map(({ id, parentId, type, name, address, revision, archived }) => ({ id, parentId, type, name, address, revision, archived }));
    const contacts = context.parties.filter(row => !row.archived && row.shareWithField && row.roles.includes('site_contact'))
      .map(row => ({ id: row.id, name: row.name, phone: row.phone, email: row.email, role: 'site_contact' }));
    const deliveries = new (require('./work-delivery').WorkDelivery)(this.ledger).field(jobId, packages.map(row => row.id));
    const installedAssets = new (require('./asset-history').AssetHistory)(this.ledger).field(jobId, packages.map(row => row.id));
    const balance = new (require('./work-balance').WorkBalance)(this.ledger).field(jobId, packages.map(row => row.id));
    return { places, contacts, packages, deliveries, installedAssets, balance };
  }
  packageBasis(jobId, packageId) {
    const source = this.source(jobId), item = source.packages.find(row => row.id === packageId && !row.archived);
    if (!item) fail('Werkpakket is niet actief binnen deze opdracht.', 409);
    const tasks = item.taskIds.map(id => source.tasks.find(row => row.id === id));
    if (!tasks.length || tasks.every(row => row?.status === 'completed') || tasks.some(row => !row || row.data?.excludeFromWorkPlan === true || ['cancelled', 'canceled', 'deleted'].includes(row.status))) fail('Werkpakket heeft geen geldige open werkzaamheden.', 409);
    const places = this.placesFor(item.placeId ? [item.placeId] : []);
    if (places.some(row => row.archived)) fail('Werkpakket verwijst naar een gearchiveerde locatie.', 409);
    const quantities = item.quantityIds.map(id => source.quantities.find(row => row.id === id));
    const balance = new (require('./work-balance').WorkBalance)(this.ledger).positionBasis(jobId, packageId);
    return { packageId, sourceHash: digest({ item, places, tasks: tasks.map(task => ({ ...Object.fromEntries(Object.entries(task).filter(([key]) => !['status', 'completedAt', 'updatedAt'].includes(key))), completed: task.status === 'completed' })), quantities,
      ...(balance ? { balanceHash: balance.sourceHash } : {}) }), taskIds: balance?.taskIds || item.taskIds,
      ...(balance ? { remainingScope: balance.scope, remainingLaborEstimate: balance.remainingLaborEstimate } : {}) };
  }
  command(jobId, input, actor) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Ongeldige wijziging.');
    if (!input.record || typeof input.record !== 'object' || Array.isArray(input.record)) fail('Ongeldig werkdossieronderdeel.');
    if (Object.hasOwn(input.record, 'id')) text(input.record.id, 'Identificatie', 150);
    const entryKey = text(input.entryKey, 'Wijzigingssleutel', 150), sourceHash = text(input.sourceHash, 'Bronversie', 64);
    if (!/^[a-f0-9]{64}$/.test(sourceHash)) fail('Ongeldige bronversie.');
    const actions = ['save_place', 'link_place', 'save_party', 'save_package', 'archive_place', 'archive_link', 'archive_party', 'archive_package', 'restore_place', 'restore_link', 'restore_party', 'restore_package'];
    if (!actions.includes(input.action)) fail('Onbekende werkdossieractie.');
    const commandId = digest({ jobId, entryKey }), requestHash = digest(input);
    return this.ledger.transaction(() => {
      this.lock(jobId);
      this.ledger.requireJob(jobId);
      const previous = this.db.prepare('SELECT * FROM work_context_commands WHERE id = ? AND job_id = ?').get(commandId, jobId);
      if (previous) {
        if (previous.request_hash !== requestHash) fail('Deze wijzigingssleutel is al voor andere gegevens gebruikt.', 409);
        return { ...JSON.parse(previous.response_json), replayed: true };
      }
      const before = this.read(jobId);
      if (before.sourceHash !== sourceHash) fail('Het werkdossier is gewijzigd. Ververs en controleer je invoer opnieuw.', 409);
      let record;
      if (input.action === 'save_place') record = this.savePlace(jobId, input.record || {}, before);
      else if (input.action === 'link_place') record = this.linkPlace(jobId, input.record?.placeId);
      else if (input.action === 'save_party') record = this.saveParty(jobId, input.record || {});
      else if (input.action === 'save_package') record = this.savePackage(jobId, input.record || {}, before);
      else record = this.setArchived(jobId, input, before);
      const after = this.read(jobId), response = { record, sourceHash: after.sourceHash, replayed: false, externalCommitments: 0 };
      this.ledger.audit({ entityType: 'work_context', entityId: record.id, jobId, action: input.action, actor,
        before: { sourceHash: before.sourceHash, record: [...before.places, ...before.links, ...before.parties, ...before.packages].find(row => row.id === record.id) || null },
        after: { sourceHash: after.sourceHash, record }, metadata: { entryKey, grantsAuthority: false } });
      this.db.prepare('INSERT INTO work_context_commands (id, job_id, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(commandId, jobId, requestHash, JSON.stringify(response), new Date().toISOString());
      return response;
    });
  }
  existing(table, jobId, id) {
    if (!id) return null;
    const row = this.db.prepare(`SELECT * FROM ${table} WHERE id = ? AND job_id = ?`).get(text(id, 'Identificatie', 150), jobId);
    if (!row) fail('Onderdeel hoort niet bij deze opdracht.', 404);
    if (row.archived) fail('Herstel het gearchiveerde onderdeel eerst.', 409);
    return row;
  }
  save(table, columns, values, previous) {
    const now = new Date().toISOString(), id = previous?.id || randomUUID();
    if (previous) this.db.prepare(`UPDATE ${table} SET ${columns.map(column => `${column} = ?`).join(', ')}, revision = revision + 1, updated_at = ? WHERE id = ?`).run(...values, now, id);
    else this.db.prepare(`INSERT INTO ${table} (id, ${columns.join(', ')}, revision, created_at, updated_at) VALUES (?, ${columns.map(() => '?').join(', ')}, 1, ?, ?)`).run(id, ...values, now, now);
    return map(this.db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id));
  }
  savePlace(jobId, input, context) {
    const previous = input.id ? this.db.prepare('SELECT * FROM work_places WHERE id = ?').get(text(input.id, 'Locatie', 150)) : null;
    if (input.id && (!previous || !context.places.some(row => row.id === input.id))) fail('Koppel deze locatie eerst aan de opdracht.', 404);
    if (previous?.archived) fail('Herstel de locatie eerst.', 409);
    if (!PLACE_TYPES.includes(input.type)) fail('Kies een geldig locatietype.');
    const parentId = input.parentId ? text(input.parentId, 'Bovenliggende locatie', 150) : null;
    if (input.type !== 'site' && !parentId) fail('Kies een bovenliggende locatie.');
    if (parentId) {
      const ancestors = this.placesFor([parentId]), parent = this.place(parentId);
      if (!PARENTS[input.type].includes(parent.type) || ancestors.some(row => row.archived || row.id === input.id) || ancestors.length >= 9) fail('Ongeldige locatiehierarchie.');
    }
    if (previous && JSON.parse(previous.data_json).type !== input.type) fail('Het type van een bestaande locatie blijft behouden.');
    const data = { type: input.type, name: text(input.name, 'Locatienaam'), address: text(input.address, 'Locatieadres', 500, true) };
    const result = this.save('work_places', ['parent_id', 'data_json'], [parentId, JSON.stringify(data)], previous);
    this.linkPlace(jobId, result.id);
    return result;
  }
  linkPlace(jobId, placeId) {
    const id = text(placeId, 'Locatie', 150);
    if (this.placesFor([id]).some(row => row.archived)) fail('Herstel de locatie eerst.', 409);
    const previous = this.db.prepare('SELECT * FROM job_places WHERE job_id = ? AND place_id = ?').get(jobId, id);
    if (previous?.archived) fail('Herstel de eerdere locatiekoppeling eerst.', 409);
    return previous ? map(previous) : this.save('job_places', ['job_id', 'place_id'], [jobId, id]);
  }
  saveParty(jobId, input) {
    const previous = this.existing('job_parties', jobId, input.id);
    const roles = ids(input.roles, 'Rollen');
    if (!roles.length || roles.some(role => !PARTY_ROLES.includes(role))) fail('Kies een geldige betrokken rol.');
    if (input.shareWithField !== true && input.shareWithField !== false) fail('Geef expliciet aan of het locatiecontact gedeeld mag worden.');
    if (input.shareWithField && !roles.includes('site_contact')) fail('Alleen een locatiecontact kan met uitvoerenden worden gedeeld.');
    const email = text(input.email, 'E-mail', 254, true);
    if (email && !isValidEmailAddress(email)) fail('Vul een geldig e-mailadres in.');
    const data = { name: text(input.name, 'Naam'), organization: text(input.organization, 'Organisatie', 200, true), roles,
      phone: text(input.phone, 'Telefoon', 50, true), email, shareWithField: input.shareWithField,
      reference: text(input.reference, 'Bron of afstemming', 1000) };
    return this.save('job_parties', ['job_id', 'data_json'], [jobId, JSON.stringify(data)], previous);
  }
  savePackage(jobId, input, context) {
    const previous = this.existing('work_packages', jobId, input.id);
    const taskIds = ids(input.taskIds, 'Werkzaamheden'), quantityIds = ids(input.quantityIds, 'Hoeveelheden');
    if (taskIds.some(id => !context.tasks.some(row => row.id === id))) fail('Werkzaamheid hoort niet bij deze opdracht.');
    if (quantityIds.some(id => !context.quantities.some(row => row.id === id))) fail('Hoeveelheid hoort niet bij deze opdracht.');
    const placeId = input.placeId ? text(input.placeId, 'Locatie', 150) : null;
    if (placeId && (!context.links.some(row => row.placeId === placeId && !row.archived) || this.placesFor([placeId]).some(row => row.archived))) fail('Koppel eerst een actieve locatie aan de opdracht.');
    const data = { code: text(input.code, 'Werkpakketcode', 80), title: text(input.title, 'Werkpakketnaam'),
      outcome: text(input.outcome, 'Beoogd resultaat', 3000), instructions: text(input.instructions, 'Werkinstructie', 4000, true),
      stopPoint: text(input.stopPoint, 'Veilig stoppunt', 2000, true), handover: text(input.handover, 'Overdracht', 2000, true) };
    if (context.packages.some(row => row.id !== input.id && row.code.toLowerCase() === data.code.toLowerCase())) fail('Werkpakketcode bestaat al in deze opdracht.', 409);
    for (const [table, column, links] of [['work_package_tasks', 'task_id', taskIds], ['work_package_quantities', 'item_id', quantityIds]]) {
      for (const id of links) {
        const assigned = this.db.prepare(`SELECT package_id FROM ${table} WHERE ${column} = ?`).get(id);
        if (assigned && assigned.package_id !== input.id) fail('Dit onderdeel hoort al bij een ander werkpakket. Pas die koppeling eerst aan.', 409);
      }
    }
    const record = this.save('work_packages', ['job_id', 'place_id', 'data_json'], [jobId, placeId, JSON.stringify(data)], previous);
    for (const [table, column, links] of [['work_package_tasks', 'task_id', taskIds], ['work_package_quantities', 'item_id', quantityIds]]) {
      this.db.prepare(`DELETE FROM ${table} WHERE package_id = ?`).run(record.id);
      for (const id of links) this.db.prepare(`INSERT INTO ${table} (id, package_id, ${column}) VALUES (?, ?, ?)`).run(randomUUID(), record.id, id);
    }
    return { ...record, taskIds, quantityIds };
  }
  setArchived(jobId, input, context) {
    const [operation, kind] = input.action.split('_'), archived = operation === 'archive' ? 1 : 0;
    const table = { place: 'work_places', link: 'job_places', party: 'job_parties', package: 'work_packages' }[kind];
    const id = text(input.record?.id, 'Onderdeel', 150);
    const record = this.db.prepare(`SELECT * FROM ${table} WHERE id = ?${kind === 'place' ? '' : ' AND job_id = ?'}`).get(...(kind === 'place' ? [id] : [id, jobId]));
    if (!record || (kind === 'place' && !context.places.some(row => row.id === id))) fail('Onderdeel niet gevonden in deze opdracht.', 404);
    if (kind === 'place' && archived && (this.db.prepare('SELECT id FROM work_places WHERE parent_id = ? AND archived = 0').get(id)
      || this.db.prepare('SELECT id FROM job_places WHERE place_id = ? AND archived = 0').get(id)
      || this.db.prepare('SELECT id FROM work_packages WHERE place_id = ? AND archived = 0').get(id))) fail('Locatie is nog in gebruik. Archiveer eerst de actieve koppelingen en onderliggende locaties.', 409);
    if (kind === 'link' && archived && context.packages.some(row => !row.archived && row.placeId === record.place_id)) fail('Locatie is nog aan een actief werkpakket gekoppeld.', 409);
    const placeId = kind === 'place' ? record.parent_id : record.place_id;
    if (!archived && placeId && this.placesFor([placeId]).some(row => row.archived)) fail('Herstel eerst de bovenliggende locatie.', 409);
    if (!archived && kind === 'package' && record.place_id && !context.links.some(row => row.placeId === record.place_id && !row.archived)) fail('Herstel eerst de locatiekoppeling.', 409);
    this.db.prepare(`UPDATE ${table} SET archived = ?, revision = revision + 1, updated_at = ? WHERE id = ?`).run(archived, new Date().toISOString(), id);
    const result = map(this.db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id));
    return kind === 'package' ? { ...context.packages.find(row => row.id === id), ...result } : result;
  }
  exportRecords() {
    return Object.fromEntries(TABLES.filter(table => table !== 'work_context_control').map(table => [table, this.db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()]));
  }
}

module.exports = { WorkContext, migrateWorkContext, TABLES, PLACE_TYPES, PARTY_ROLES, digest };
