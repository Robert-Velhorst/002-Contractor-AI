const { randomUUID } = require('node:crypto');
const { WorkContext, digest } = require('./work-context');
const { WorkDelivery } = require('./work-delivery');

const TABLES = ['installed_asset_profiles', 'asset_service_events', 'asset_service_links', 'asset_history_commands'];
const COLUMNS = {
  installed_asset_profiles: ['data_json', 'revision', 'created_at', 'updated_at'],
  asset_service_events: ['job_id', 'asset_id', 'kind', 'delivery_id', 'document_id', 'replacement_id', 'paired_asset_id', 'status', 'snapshot_json', 'snapshot_hash', 'sharing_json', 'correction_json'],
  asset_service_links: ['job_id', 'asset_id', 'kind', 'record_id', 'active'],
  asset_history_commands: ['job_id', 'request_hash', 'response_json']
};
const RELATIONS = {
  warranty: { table: 'warranty_claims', map: 'mapWarrantyClaim' },
  aftercare: { table: 'aftercare_items', map: 'mapAftercareItem' },
  recurring: { table: 'recurring_plans', map: 'mapRecurringPlan' }
};
const KINDS = ['installed', 'serviced', 'repaired', 'inspected', 'removed', 'prior_record'];
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { code: 'asset_history_invalid', statusCode }); };
function text(value, label, max = 200, optional = false) {
  if (optional && (value == null || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.length > max || [...value].some(char => char.charCodeAt(0) < 32 && !['\n', '\r', '\t'].includes(char))) fail(`${label} ontbreekt of is ongeldig.`);
  return value.trim();
}
function date(value, today) {
  const result = text(value, 'Werkdatum', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result || result > today) fail('Kies een geldige datum, niet in de toekomst.');
  return result;
}
function retained(row) {
  const snapshot = JSON.parse(row.snapshot_json);
  if (digest(snapshot) !== row.snapshot_hash) fail('De installatiehistorie heeft een ongeldige controlesom.', 409);
  return snapshot;
}
function migrateAssetHistory(db) {
  db.exec(`
    CREATE TABLE installed_asset_profiles (
      id TEXT PRIMARY KEY REFERENCES work_places(id), data_json TEXT NOT NULL,
      revision INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE asset_service_events (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), asset_id TEXT NOT NULL REFERENCES work_places(id),
      kind TEXT NOT NULL CHECK(kind IN ('installed','serviced','repaired','inspected','removed','prior_record')),
      delivery_id TEXT REFERENCES work_deliveries(id), document_id TEXT REFERENCES documents(id),
      replacement_id TEXT, paired_asset_id TEXT REFERENCES work_places(id),
      status TEXT NOT NULL CHECK(status IN ('retained','voided')), snapshot_json TEXT NOT NULL, snapshot_hash TEXT NOT NULL,
      sharing_json TEXT NOT NULL, correction_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      CHECK((delivery_id IS NOT NULL AND document_id IS NULL AND kind <> 'prior_record') OR (delivery_id IS NULL AND document_id IS NOT NULL AND kind = 'prior_record')),
      CHECK((replacement_id IS NULL AND paired_asset_id IS NULL) OR (replacement_id IS NOT NULL AND paired_asset_id IS NOT NULL AND paired_asset_id <> asset_id))
    );
    CREATE INDEX idx_asset_service_events_asset ON asset_service_events(asset_id, created_at, id);
    CREATE INDEX idx_asset_service_events_job ON asset_service_events(job_id);
    CREATE UNIQUE INDEX idx_asset_service_delivery_active ON asset_service_events(asset_id, delivery_id, kind) WHERE status = 'retained' AND delivery_id IS NOT NULL;
    CREATE UNIQUE INDEX idx_asset_service_document_active ON asset_service_events(asset_id, document_id) WHERE status = 'retained' AND document_id IS NOT NULL;
    CREATE TABLE asset_service_links (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), asset_id TEXT NOT NULL REFERENCES work_places(id),
      kind TEXT NOT NULL CHECK(kind IN ('warranty','aftercare','recurring')), record_id TEXT NOT NULL,
      active INTEGER NOT NULL CHECK(active IN (0,1)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(asset_id,kind,record_id)
    );
    CREATE INDEX idx_asset_service_links_job ON asset_service_links(job_id, active);
    CREATE INDEX idx_asset_service_links_record ON asset_service_links(kind, record_id, active);
    CREATE TABLE asset_history_commands (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), request_hash TEXT NOT NULL,
      response_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX idx_asset_history_commands_job ON asset_history_commands(job_id);
  `);
  require('./company-authority').installAuthorityGuards(db, TABLES);
}

class AssetHistory {
  constructor(ledger) { this.ledger = ledger; this.db = ledger.db; this.context = new WorkContext(ledger); this.delivery = new WorkDelivery(ledger); }
  now() { return this.ledger.clock().toISOString(); }
  assets(jobId) { return this.context.source(jobId).places.filter(row => row.type === 'asset'); }
  asset(jobId, id, active = true) {
    const asset = this.assets(jobId).find(row => row.id === text(id, 'Installatie', 150));
    if (!asset) fail('Koppel deze installatie eerst aan de opdracht.', 404);
    if (active) {
      const context = this.context.source(jobId);
      if (this.context.placesFor([id]).some(row => row.archived) || (!context.links.some(row => row.placeId === id && !row.archived) && !context.packages.some(row => row.placeId === id && !row.archived))) fail('Herstel de installatie of haar actieve dossierkoppeling eerst.', 409);
    }
    return asset;
  }
  profile(id) {
    const row = this.db.prepare('SELECT * FROM installed_asset_profiles WHERE id = ?').get(id);
    return row ? { ...JSON.parse(row.data_json), revision: Number(row.revision), updatedAt: row.updated_at } : null;
  }
  sourceBasis(jobId, deliveryId, documentId) {
    if (deliveryId) {
      const row = this.delivery.row(jobId, deliveryId), snapshot = JSON.parse(row.snapshot_json);
      if (digest(snapshot) !== row.snapshot_hash) fail('De bronoplevering heeft een ongeldige controlesom.', 409);
      const physical = this.delivery.physical(jobId, row.package_id, snapshot.entryIds, snapshot.taskIds);
      if (row.status !== 'retained' || digest(physical) !== digest(snapshot.physical)) fail('De uitvoeringsbron is gewijzigd of gecorrigeerd.', 409);
      return { type: 'delivery', id: row.id, packageId: row.package_id, placeId: physical.package.placeId,
        snapshotHash: row.snapshot_hash, title: snapshot.title,
        workDates: [...physical.entries.map(item => item.workDate), ...physical.tasks.map(item => item.completedAt?.slice(0, 10))].filter(Boolean).sort() };
    }
    const row = this.db.prepare('SELECT * FROM documents WHERE id = ? AND job_id = ?').get(text(documentId, 'Bronstuk', 150), jobId);
    if (!row || ['deleted', 'rejected', 'quarantined'].includes(row.status) || row.type === 'drawing_revision') fail('Kies een beschikbaar afzonderlijk bronstuk van deze opdracht.', 409);
    if (!row.storage_ref && !String(JSON.parse(row.data_json || '{}').reference || '').trim()) fail('Het bronstuk vereist een opgeslagen bestand of herleidbare externe bron.');
    return { type: 'document', id: row.id, hash: digest(row), title: row.title };
  }
  describe(row) {
    const snapshot = retained(row); let current = false;
    try { current = digest(this.sourceBasis(row.job_id, row.delivery_id, row.document_id)) === digest(snapshot.source); }
    catch (error) { if (![400, 404, 409].includes(error.statusCode)) throw error; }
    return { id: row.id, assetId: row.asset_id, jobId: row.job_id, status: row.status,
      kind: row.kind, ...snapshot, sourceCurrent: current, sharing: JSON.parse(row.sharing_json),
      correction: JSON.parse(row.correction_json), createdAt: row.created_at };
  }
  relations(assetId) {
    return this.db.prepare('SELECT * FROM asset_service_links WHERE asset_id = ? ORDER BY id').all(assetId).map(link => {
      const config = RELATIONS[link.kind], row = this.db.prepare(`SELECT * FROM ${config.table} WHERE id = ? AND job_id = ?`).get(link.record_id, link.job_id);
      if (!row) fail('Een gekoppelde onderhoudsregistratie ontbreekt.', 409);
      return { id: link.id, jobId: link.job_id, kind: link.kind, active: Boolean(link.active), record: this.ledger[config.map](row) };
    });
  }
  source(jobId) {
    return this.assets(jobId).map(asset => ({ asset, profile: this.profile(asset.id),
      events: this.db.prepare('SELECT * FROM asset_service_events WHERE asset_id = ? ORDER BY created_at,id').all(asset.id).map(row => this.describe(row)).sort((a, b) => a.performedAt.localeCompare(b.performedAt) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
      links: this.relations(asset.id) }));
  }
  read(jobId) {
    const records = this.source(jobId), context = this.context.read(jobId);
    const options = { deliveries: this.delivery.field(jobId, context.packages.map(row => row.id)).filter(row => row.physicalStatus === 'reported'),
      documents: this.db.prepare("SELECT * FROM documents WHERE job_id = ? AND type <> 'drawing_revision' AND status NOT IN ('deleted','rejected','quarantined') ORDER BY id").all(jobId)
        .map(row => ({ id: row.id, title: row.title, hash: digest(row), contentAvailable: Boolean(row.storage_ref), reference: JSON.parse(row.data_json || '{}').reference || null })) };
    for (const [kind, config] of Object.entries(RELATIONS)) options[kind] = this.db.prepare(`SELECT * FROM ${config.table} WHERE job_id = ? ORDER BY id`).all(jobId).map(row => this.ledger[config.map](row));
    return { format: 'contractor-asset-history/v1', jobId, records, options, sourceHash: digest({ records, options, contextHash: context.sourceHash }) };
  }
  field(jobId, visiblePackageIds) {
    const context = this.context.source(jobId), assetIds = new Set(context.packages.filter(row => visiblePackageIds.includes(row.id) && !row.archived).map(row => row.placeId));
    return context.places.filter(row => row.type === 'asset' && assetIds.has(row.id) && !row.archived).map(asset => ({
      id: asset.id, name: asset.name, profile: this.profile(asset.id),
      events: this.db.prepare('SELECT * FROM asset_service_events WHERE asset_id = ? ORDER BY created_at,id').all(asset.id)
        .filter(row => JSON.parse(row.sharing_json).enabled === true).map(row => {
          const event = this.describe(row);
          return { id: event.id, kind: event.kind, performedAt: event.performedAt, summary: event.sharing.summary,
            status: event.status, sourceCurrent: event.sourceCurrent };
        })
    }));
  }
  privateEvidenceIds(jobId) {
    return new Set([...this.db.prepare("SELECT id FROM documents WHERE job_id = ? AND type = 'asset_history_evidence'").all(jobId).map(row => row.id),
      ...this.db.prepare('SELECT document_id FROM asset_service_events WHERE job_id = ? AND document_id IS NOT NULL').all(jobId).map(row => row.document_id)]);
  }
  command(jobId, input, actor) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || !input.record || typeof input.record !== 'object' || Array.isArray(input.record)) fail('Ongeldige installatiehistorieactie.');
    const key = text(input.entryKey, 'Wijzigingssleutel', 150), sourceHash = text(input.sourceHash, 'Bronversie', 64);
    if (!/^[a-f0-9]{64}$/.test(sourceHash) || !['profile', 'record', 'replace', 'void', 'share', 'link', 'prepare_recurring'].includes(input.action)) fail('Ongeldige actie of bronversie.');
    const id = digest({ jobId, key }), requestHash = digest(input);
    return this.ledger.transaction(() => {
      this.delivery.lock(jobId); this.ledger.requireJob(jobId, { allowInactive: input.action === 'share' && input.record.enabled === false });
      for (const { table } of Object.values(RELATIONS)) this.db.prepare(`UPDATE ${table} SET status = status WHERE job_id = ?`).run(jobId);
      const previous = this.db.prepare('SELECT * FROM asset_history_commands WHERE id = ? AND job_id = ?').get(id, jobId);
      if (previous) {
        if (previous.request_hash !== requestHash) fail('Deze wijzigingssleutel is al voor andere gegevens gebruikt.', 409);
        return { ...JSON.parse(previous.response_json), replayed: true };
      }
      if (this.read(jobId).sourceHash !== sourceHash) fail('De installatiehistorie is gewijzigd. Ververs en controleer opnieuw.', 409);
      const asset = this.asset(jobId, input.record.assetId, !['share', 'void'].includes(input.action));
      let result;
      if (input.action === 'profile') result = this.saveProfile(asset, input.record);
      else if (input.action === 'record') result = { eventIds: [this.record(jobId, asset, input.record)] };
      else if (input.action === 'replace') {
        const replacement = this.asset(jobId, input.record.replacementAssetId);
        if (replacement.id === asset.id) fail('Een vervangende installatie krijgt een eigen identiteit.');
        const replacementId = randomUUID();
        result = { eventIds: [this.record(jobId, asset, { ...input.record, kind: 'removed' }, { replacementId, pairedAssetId: replacement.id }),
          this.record(jobId, replacement, { ...input.record, kind: 'installed' }, { replacementId, pairedAssetId: asset.id })] };
      } else if (input.action === 'link') result = this.link(jobId, asset.id, input.record);
      else if (input.action === 'prepare_recurring') result = this.prepareRecurring(jobId, asset.id, input.record, actor);
      else result = this.changeEvent(jobId, asset.id, input.action, input.record, actor);
      const response = { assetId: asset.id, ...result, replayed: false, externalCommitments: 0 };
      this.ledger.audit({ entityType: 'installed_asset', entityId: asset.id, jobId, action: `asset_history_${input.action}`, actor,
        after: { ...response, record: input.record }, metadata: { entryKey: key, grantsSafetyPermission: false } });
      this.db.prepare('INSERT INTO asset_history_commands (id,job_id,request_hash,response_json,created_at) VALUES (?,?,?,?,?)').run(id, jobId, requestHash, JSON.stringify(response), this.now());
      return response;
    });
  }
  saveProfile(asset, input) {
    const before = this.profile(asset.id), data = { manufacturer: text(input.manufacturer, 'Fabrikant', 200, true), model: text(input.model, 'Model', 200, true), serialNumber: text(input.serialNumber, 'Serienummer', 200, true) };
    const reason = text(input.reason, 'Bron / reden identiteitscorrectie', 1000);
    if (before && before.serialNumber && data.serialNumber !== before.serialNumber && this.db.prepare("SELECT id FROM asset_service_events WHERE asset_id = ? AND status = 'retained' LIMIT 1").get(asset.id)) fail('Een installatie met werkhistorie behoudt haar serienummer. Registreer een vervangend onderdeel als nieuwe installatie.', 409);
    if (before) this.db.prepare('UPDATE installed_asset_profiles SET data_json = ?, revision = revision + 1, updated_at = ? WHERE id = ?').run(JSON.stringify(data), this.now(), asset.id);
    else this.db.prepare('INSERT INTO installed_asset_profiles (id,data_json,revision,created_at,updated_at) VALUES (?,?,1,?,?)').run(asset.id, JSON.stringify(data), this.now(), this.now());
    return { reason, profile: this.profile(asset.id) };
  }
  record(jobId, asset, input, pair = {}) {
    if (!KINDS.includes(input.kind)) fail('Kies een geldige werkregistratie.');
    const performedAt = date(input.performedAt, this.now().slice(0, 10)), summary = text(input.summary, 'Uitgevoerd werk / bronbeschrijving', 3000);
    const deliveryId = input.kind === 'prior_record' ? null : text(input.deliveryId, 'Deeloplevering', 150);
    const documentId = input.kind === 'prior_record' ? text(input.documentId, 'Bronstuk', 150) : null;
    const source = this.sourceBasis(jobId, deliveryId, documentId);
    if (source.type === 'delivery' && (!source.placeId || !this.context.placesFor([asset.id]).some(row => row.id === source.placeId))) fail('De bronoplevering moet deze installatie of haar bovenliggende locatie betreffen.', 409);
    if (source.workDates?.at(-1) > performedAt) fail('De werkdatum ligt voor de gekoppelde uitvoering.');
    const duplicate = deliveryId
      ? this.db.prepare("SELECT id FROM asset_service_events WHERE asset_id = ? AND delivery_id = ? AND kind = ? AND status = 'retained'").get(asset.id, deliveryId, input.kind)
      : this.db.prepare("SELECT id FROM asset_service_events WHERE asset_id = ? AND document_id = ? AND status = 'retained'").get(asset.id, documentId);
    if (duplicate) fail('Deze bron is al voor deze installatieregistratie gebruikt.', 409);
    const id = randomUUID(), snapshot = { format: 'contractor-asset-event/v1', assetId: asset.id, jobId, kind: input.kind, performedAt, summary, source,
      assetAtEvent: { ...asset, profile: this.profile(asset.id) }, replacementId: pair.replacementId || null, pairedAssetId: pair.pairedAssetId || null };
    this.db.prepare("INSERT INTO asset_service_events (id,job_id,asset_id,kind,delivery_id,document_id,replacement_id,paired_asset_id,status,snapshot_json,snapshot_hash,sharing_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'retained',?,?,'{\"enabled\":false,\"summary\":\"\"}',?,?)")
      .run(id, jobId, asset.id, input.kind, deliveryId, documentId, pair.replacementId || null, pair.pairedAssetId || null, JSON.stringify(snapshot), digest(snapshot), this.now(), this.now());
    return id;
  }
  changeEvent(jobId, assetId, action, input, actor) {
    const row = this.db.prepare('SELECT * FROM asset_service_events WHERE id = ? AND job_id = ? AND asset_id = ?').get(text(input.id, 'Registratie', 150), jobId, assetId);
    if (!row) fail('Wijzig de registratie vanuit haar oorspronkelijke opdracht.', 404);
    retained(row);
    if (action === 'share') {
      if (typeof input.enabled !== 'boolean') fail('Kies expliciet of deze samenvatting gedeeld wordt.');
      if (input.enabled && row.status !== 'retained') fail('Een gecorrigeerde registratie kan niet opnieuw gedeeld worden.', 409);
      const sharing = { enabled: input.enabled, summary: input.enabled ? text(input.fieldSummary, 'Operationele samenvatting', 1500) : '' };
      this.db.prepare('UPDATE asset_service_events SET sharing_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(sharing), this.now(), row.id);
      return { eventIds: [row.id] };
    }
    if (row.status !== 'retained') fail('Deze registratie is al gecorrigeerd.', 409);
    const reason = text(input.reason, 'Reden correctie', 1500);
    const rows = row.replacement_id ? this.db.prepare('SELECT * FROM asset_service_events WHERE replacement_id = ? ORDER BY id').all(row.replacement_id) : [row];
    for (const item of rows) this.db.prepare("UPDATE asset_service_events SET status = 'voided', correction_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify({ reason, actor, at: this.now() }), this.now(), item.id);
    return { eventIds: rows.map(item => item.id) };
  }
  link(jobId, assetId, input) {
    if (!Object.hasOwn(RELATIONS, input.kind) || !Array.isArray(input.recordIds) || input.recordIds.length > 100 || new Set(input.recordIds).size !== input.recordIds.length) fail('Ongeldige registerkoppelingen.');
    const config = RELATIONS[input.kind], selected = input.recordIds.map(id => text(id, 'Registerkoppeling', 150));
    for (const id of selected) if (!this.db.prepare(`SELECT id FROM ${config.table} WHERE id = ? AND job_id = ?`).get(id, jobId)) fail('De gekoppelde registratie hoort niet bij deze opdracht.', 409);
    this.db.prepare('UPDATE asset_service_links SET active = 0, updated_at = ? WHERE job_id = ? AND asset_id = ? AND kind = ?').run(this.now(), jobId, assetId, input.kind);
    for (const id of selected) {
      const prior = this.db.prepare('SELECT id FROM asset_service_links WHERE asset_id = ? AND kind = ? AND record_id = ?').get(assetId, input.kind, id);
      if (prior) this.db.prepare('UPDATE asset_service_links SET active = 1, updated_at = ? WHERE id = ?').run(this.now(), prior.id);
      else this.db.prepare('INSERT INTO asset_service_links (id,job_id,asset_id,kind,record_id,active,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?)').run(randomUUID(), jobId, assetId, input.kind, id, this.now(), this.now());
    }
    return { linked: selected.length };
  }
  inheritRecurring(planId, jobId, actor) {
    const links = this.db.prepare("SELECT DISTINCT asset_id FROM asset_service_links WHERE kind = 'recurring' AND record_id = ? AND active = 1 ORDER BY asset_id").all(planId);
    for (const { asset_id: assetId } of links) {
      const asset = this.context.place(assetId);
      this.context.linkPlace(jobId, assetId);
      const task = this.ledger.addTask(jobId, { title: `Onderhoud beoordelen: ${asset.name}`, description: 'Bevestig actuele scope, bronstukken en uitvoeringsvoorwaarden voordat werk wordt ingepland.', status: 'open', source: 'installed_asset_recurring' }, { actor });
      this.context.savePackage(jobId, { code: `ASSET-${assetId}`, title: `Onderhoud ${asset.name}`, outcome: 'Onderhoudsbehoefte vaststellen en uitvoering voorbereiden.', placeId: assetId, taskIds: [task.id], quantityIds: [] }, this.context.source(jobId));
    }
    return links.map(row => row.asset_id);
  }
  prepareRecurring(jobId, assetId, input, actor) {
    const planId = text(input.planId, 'Onderhoudsplan', 150);
    const link = this.db.prepare("SELECT id FROM asset_service_links WHERE asset_id = ? AND job_id = ? AND kind = 'recurring' AND record_id = ? AND active = 1").get(assetId, jobId, planId);
    const plan = this.db.prepare('SELECT * FROM recurring_plans WHERE id = ? AND job_id = ?').get(planId, jobId);
    if (!link || !plan || plan.status !== 'active') fail('Koppel eerst een actief onderhoudsplan van deze opdracht.', 409);
    const previous = plan.last_created_job_id && this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(plan.last_created_job_id);
    if (previous && !['completed', 'closed', 'cancelled', 'canceled', 'archived'].includes(previous.status)) {
      const expected = this.db.prepare("SELECT asset_id FROM asset_service_links WHERE kind = 'recurring' AND record_id = ? AND active = 1 ORDER BY asset_id").all(planId).map(row => row.asset_id);
      const context = this.context.source(previous.id), actual = [...new Set(context.packages.filter(row => !row.archived && context.places.some(place => place.id === row.placeId && place.type === 'asset')).map(row => row.placeId))].sort();
      if (digest(expected) !== digest(actual)) fail('Het bestaande onderhoudsdossier heeft andere installatiekoppelingen. Open het dossier en stem de gewijzigde scope af.', 409);
      return { preparedJobId: previous.id, reusedOpenDraft: true };
    }
    const result = this.ledger.prepareRecurringServiceJob(planId, {}, { actor });
    return { preparedJobId: result.recurringJob.id, reusedOpenDraft: false };
  }
  exportRecords() { return Object.fromEntries(TABLES.map(table => [table, this.db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()])); }
}

function verifyAssetHistory(db) {
  for (const row of db.prepare('SELECT * FROM installed_asset_profiles').all()) {
    const asset = db.prepare('SELECT data_json FROM work_places WHERE id = ?').get(row.id);
    if (!asset || JSON.parse(asset.data_json).type !== 'asset') fail('Installatieprofiel verwijst niet naar een installatie.', 409);
  }
  const events = db.prepare('SELECT * FROM asset_service_events').all();
  const pairs = new Map();
  for (const row of events) if (row.replacement_id) pairs.set(row.replacement_id, [...(pairs.get(row.replacement_id) || []), row]);
  for (const row of events) {
    const snapshot = retained(row), asset = db.prepare('SELECT data_json FROM work_places WHERE id = ?').get(row.asset_id);
    if (!asset || JSON.parse(asset.data_json).type !== 'asset' || snapshot.assetId !== row.asset_id || snapshot.jobId !== row.job_id || snapshot.kind !== row.kind
      || snapshot.replacementId !== row.replacement_id || snapshot.pairedAssetId !== row.paired_asset_id || snapshot.source.id !== (row.delivery_id || row.document_id)) fail('De installatiehistorie heeft een ongeldige bronkoppeling.', 409);
    const source = db.prepare(`SELECT job_id FROM ${row.delivery_id ? 'work_deliveries' : 'documents'} WHERE id = ?`).get(row.delivery_id || row.document_id);
    if (!source || source.job_id !== row.job_id) fail('De installatiehistorie verwijst naar een ander dossier.', 409);
    if (row.replacement_id) {
      const pair = pairs.get(row.replacement_id);
      if (pair.length !== 2 || !pair.some(item => item.kind === 'installed') || !pair.some(item => item.kind === 'removed')
        || pair.some(item => item.asset_id === item.paired_asset_id || item.status !== row.status || item.job_id !== row.job_id || item.delivery_id !== row.delivery_id)
        || !pair.some(item => item.asset_id === row.paired_asset_id && item.paired_asset_id === row.asset_id)) fail('De vervangingsregistratie is onvolledig.', 409);
    }
  }
  for (const link of db.prepare('SELECT * FROM asset_service_links').all()) {
    const config = RELATIONS[link.kind], source = config && db.prepare(`SELECT job_id FROM ${config.table} WHERE id = ?`).get(link.record_id);
    const asset = db.prepare('SELECT data_json FROM work_places WHERE id = ?').get(link.asset_id);
    if (!source || source.job_id !== link.job_id || !asset || JSON.parse(asset.data_json).type !== 'asset') fail('Een installatievervolgactie heeft een ongeldige dossierkoppeling.', 409);
  }
  return { valid: true, events: events.length };
}

module.exports = { AssetHistory, migrateAssetHistory, verifyAssetHistory, TABLES, COLUMNS };
