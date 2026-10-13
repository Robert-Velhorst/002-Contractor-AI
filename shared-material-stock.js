const { randomUUID, createHash } = require('node:crypto');

const fail = (code, message, statusCode = 400) => { throw Object.assign(new Error(message), { code, statusCode }); };
const text = (value, label, max = 240) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || [...value].some(char => char.charCodeAt(0) < 32 && !'\t\r\n'.includes(char))) fail('material_stock_input_invalid', `${label} ontbreekt of is ongeldig.`);
  return value.trim();
};
function quantity(value, zero = false) {
  if (!['number', 'string'].includes(typeof value) || value === '' || !Number.isFinite(Number(value))) fail('material_stock_quantity_invalid', 'Vul een geldige hoeveelheid in.');
  const number = Number(value), scaled = Math.round(number * 10000);
  if (number < 0 || (!zero && number === 0) || number > 1e9 || Math.abs(scaled / 10000 - number) > Math.max(1e-9, number * Number.EPSILON)) fail('material_stock_quantity_invalid', 'Hoeveelheden moeten positief zijn met maximaal vier decimalen.');
  return scaled;
}
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const asQuantity = value => Math.round(Number(value || 0) * 10000) / 10000;

function migrateSharedMaterialStock(db) {
  db.exec(`
    CREATE TABLE shared_material_stock_movements (
      id TEXT PRIMARY KEY, material_id TEXT NOT NULL REFERENCES materials(id), movement_type TEXT NOT NULL CHECK(movement_type IN ('stocktake','consumption','release')),
      quantity_delta REAL NOT NULL, quantity_after REAL NOT NULL, reference TEXT NOT NULL, note TEXT NOT NULL,
      entry_key TEXT NOT NULL UNIQUE, entry_fingerprint TEXT NOT NULL, allocation_id TEXT,
      actor TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX idx_shared_stock_movements_material ON shared_material_stock_movements(material_id,created_at);
    CREATE TABLE shared_material_allocations (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), material_requirement_id TEXT NOT NULL REFERENCES material_requirements(id),
      material_id TEXT NOT NULL REFERENCES materials(id), quantity REAL NOT NULL CHECK(quantity > 0), consumed_quantity REAL NOT NULL DEFAULT 0 CHECK(consumed_quantity >= 0),
      status TEXT NOT NULL CHECK(status IN ('reserved','released','consumed')), entry_key TEXT NOT NULL UNIQUE, entry_fingerprint TEXT NOT NULL,
      source_reference TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', actor TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      released_at TEXT, consumed_at TEXT
    );
    CREATE UNIQUE INDEX idx_shared_stock_one_open_allocation_per_requirement ON shared_material_allocations(material_requirement_id) WHERE status = 'reserved';
    CREATE INDEX idx_shared_stock_allocations_material ON shared_material_allocations(material_id,status);
    CREATE INDEX idx_shared_stock_allocations_job ON shared_material_allocations(job_id,status);
  `);
  require('./company-authority').installAuthorityGuards(db, ['shared_material_stock_movements', 'shared_material_allocations']);
}

function migrateSharedMaterialReceiptStock(db) {
  db.exec(`
    CREATE TABLE shared_material_receipt_movements (
      id TEXT PRIMARY KEY, material_id TEXT NOT NULL REFERENCES materials(id),
      receipt_id TEXT NOT NULL REFERENCES material_receipts(id) ON DELETE RESTRICT,
      receipt_line_id TEXT NOT NULL REFERENCES material_receipt_lines(id) ON DELETE RESTRICT,
      movement_type TEXT NOT NULL CHECK(movement_type IN ('receipt','receipt_reversal')),
      quantity_delta REAL NOT NULL CHECK(quantity_delta <> 0), quantity_after REAL NOT NULL CHECK(quantity_after >= 0),
      reference TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', entry_key TEXT NOT NULL UNIQUE,
      entry_fingerprint TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(receipt_line_id,movement_type)
    );
    CREATE INDEX idx_shared_stock_receipt_movements_material
      ON shared_material_receipt_movements(material_id,created_at);
    CREATE INDEX idx_shared_stock_receipt_movements_receipt
      ON shared_material_receipt_movements(receipt_id,movement_type);
  `);
  require('./company-authority').installAuthorityGuards(db, ['shared_material_receipt_movements']);
}

function migrateSharedMaterialSiteIssues(db, options = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS shared_material_site_issues (
      id TEXT PRIMARY KEY, allocation_id TEXT NOT NULL REFERENCES shared_material_allocations(id),
      job_id TEXT NOT NULL REFERENCES jobs(id), material_requirement_id TEXT NOT NULL REFERENCES material_requirements(id),
      material_id TEXT NOT NULL REFERENCES materials(id), quantity REAL NOT NULL CHECK(quantity > 0),
      dispatch_reference TEXT NOT NULL UNIQUE, expected_arrival_at TEXT NOT NULL,
      evidence_reference TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', received_quantity REAL NOT NULL DEFAULT 0 CHECK(received_quantity >= 0 AND received_quantity <= quantity),
      accepted_quantity REAL NOT NULL DEFAULT 0 CHECK(accepted_quantity >= 0 AND accepted_quantity <= received_quantity),
      stock_movement_id TEXT NOT NULL UNIQUE REFERENCES shared_material_stock_movements(id),
      entry_key TEXT NOT NULL UNIQUE, entry_fingerprint TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS shared_material_site_issue_receipts (
      id TEXT PRIMARY KEY, issue_id TEXT NOT NULL REFERENCES shared_material_site_issues(id),
      received_quantity REAL NOT NULL CHECK(received_quantity > 0), accepted_quantity REAL NOT NULL CHECK(accepted_quantity >= 0),
      damaged_quantity REAL NOT NULL CHECK(damaged_quantity >= 0), receipt_reference TEXT NOT NULL,
      received_by TEXT NOT NULL, location TEXT NOT NULL, evidence_reference TEXT NOT NULL,
      entry_key TEXT NOT NULL UNIQUE, entry_fingerprint TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL,
      CHECK(accepted_quantity + damaged_quantity <= received_quantity)
    );
    CREATE INDEX IF NOT EXISTS idx_shared_material_site_issues_requirement ON shared_material_site_issues(material_requirement_id,created_at);
    CREATE INDEX IF NOT EXISTS idx_shared_material_site_issues_job ON shared_material_site_issues(job_id,expected_arrival_at);
    CREATE INDEX IF NOT EXISTS idx_shared_material_site_issue_receipts_issue ON shared_material_site_issue_receipts(issue_id,created_at);
  `);
  require('./company-authority').installAuthorityGuards(db, ['shared_material_site_issues', 'shared_material_site_issue_receipts']);

  const requirements = db.prepare('SELECT * FROM material_requirements').all();
  const receipts = db.prepare(`SELECT lines.material_requirement_id,lines.accepted_quantity,receipts.id AS receipt_id,
      receipts.status,receipts.delivered_at,receipts.data_json
    FROM material_receipt_lines lines JOIN material_receipts receipts ON receipts.id=lines.receipt_id
    WHERE lines.material_requirement_id IS NOT NULL
      AND receipts.status IN ('received','discrepancy','pending_reversal')`).all();
  const byRequirement = new Map();
  for (const receipt of receipts) {
    let destination = 'job_site';
    try { destination = JSON.parse(receipt.data_json || '{}').stockDestination || destination; } catch { /* Legacy rows default to direct-to-site receipts. */ }
    if (destination === 'company_warehouse') continue;
    const bucket = byRequirement.get(receipt.material_requirement_id) || { accepted: 0, receipts: new Set(), lastDeliveredAt: null };
    bucket.accepted += Number(receipt.accepted_quantity || 0);
    bucket.receipts.add(receipt.receipt_id);
    if (!bucket.lastDeliveredAt || String(receipt.delivered_at) > bucket.lastDeliveredAt) bucket.lastDeliveredAt = receipt.delivered_at;
    byRequirement.set(receipt.material_requirement_id, bucket);
  }
  for (const row of requirements) {
    let data = {};
    try { data = JSON.parse(row.data_json || '{}'); } catch { /* Rebuild an invalid projection from retained receipt rows. */ }
    const beforeQuantity = Number(data.availableQuantity || 0);
    const bucket = byRequirement.get(row.id) || { accepted: 0, receipts: new Set(), lastDeliveredAt: null };
    const accepted = Math.round(bucket.accepted * 10000) / 10000;
    const priorControl = data.receiptControl || {};
    const restoredStatus = priorControl.previousStatus || (['available', 'received'].includes(row.status) && beforeQuantity > 0 ? 'needed' : row.status || 'needed');
    const status = accepted <= 0 ? restoredStatus
      : accepted >= Number(row.quantity || 0) - 0.000001 ? 'available' : 'received';
    if (Math.abs(beforeQuantity - accepted) < 0.000001 && row.status === status) continue;
    const timestamp = new Date().toISOString();
    const receiptControl = { ...priorControl, previousStatus: restoredStatus,
      acceptedQuantity: accepted, receiptCount: bucket.receipts.size, lastDeliveredAt: bucket.lastDeliveredAt, updatedAt: timestamp, source: 'material_receipts' };
    const nextData = { ...data, availableQuantity: accepted, receiptControl };
    db.prepare('UPDATE material_requirements SET status=?,data_json=?,updated_at=? WHERE id=?')
      .run(status, JSON.stringify(nextData), timestamp, row.id);
    options.audit?.({ entityType: 'material_requirement', entityId: row.id, jobId: row.job_id,
      action: 'reconcile_site_material_receipt_projection', actor: 'ledger_migration_087', before: { status: row.status, availableQuantity: beforeQuantity },
      after: { status, availableQuantity: accepted, receiptControl },
      metadata: { reason: 'Company-warehouse receipts are not job-site availability.', migration: '087_warehouse_to_site_material_flow', externalCommitments: 0 }, createdAt: timestamp });
  }
}

function migrateSharedMaterialSiteIssueReceiptReviews(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS shared_material_site_issue_receipt_reviews (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id),
      issue_id TEXT NOT NULL REFERENCES shared_material_site_issues(id),
      receipt_id TEXT NOT NULL REFERENCES shared_material_site_issue_receipts(id) ON DELETE RESTRICT,
      accepted_quantity REAL NOT NULL CHECK(accepted_quantity >= 0),
      damaged_quantity REAL NOT NULL CHECK(damaged_quantity >= 0),
      review_reference TEXT NOT NULL,
      evidence_reference TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      entry_key TEXT NOT NULL UNIQUE,
      entry_fingerprint TEXT NOT NULL,
      actor TEXT NOT NULL,
      created_at TEXT NOT NULL,
      CHECK(accepted_quantity + damaged_quantity > 0)
    );
    CREATE INDEX IF NOT EXISTS idx_site_receipt_reviews_receipt
      ON shared_material_site_issue_receipt_reviews(receipt_id,created_at,id);
    CREATE INDEX IF NOT EXISTS idx_site_receipt_reviews_issue
      ON shared_material_site_issue_receipt_reviews(issue_id,created_at,id);
  `);
  require('./company-authority').installAuthorityGuards(db, ['shared_material_site_issue_receipt_reviews']);
}

class SharedMaterialStock {
  constructor(ledger) { this.ledger = ledger; this.db = ledger.db; }
  now() { return this.ledger.clock().toISOString(); }
  lockedMaterial(id) {
    const suffix = this.ledger.databaseMode === 'postgres' ? ' FOR UPDATE' : '';
    const material = this.db.prepare(`SELECT * FROM materials WHERE id = ?${suffix}`).get(id);
    if (!material) fail('material_stock_not_found', 'Materiaal niet gevonden.', 404);
    return material;
  }
  replay(table, entryKey, fingerprint) {
    const row = this.db.prepare(`SELECT * FROM ${table} WHERE entry_key = ?`).get(entryKey);
    if (!row) return null;
    if (row.entry_fingerprint !== fingerprint) fail('material_stock_replay_conflict', 'Deze invoersleutel is eerder met andere gegevens gebruikt.', 409);
    return row;
  }
  availabilityCatalog() {
    return this.db.prepare(`
      SELECT m.id,m.name,m.sku,m.unit,
        m.stock_quantity,
        COALESCE(SUM(CASE WHEN a.status='reserved' THEN a.quantity-a.consumed_quantity ELSE 0 END),0) AS reserved_quantity
      FROM materials m LEFT JOIN shared_material_allocations a ON a.material_id=m.id
      GROUP BY m.id ORDER BY lower(m.name),m.id
    `).all().map(row => ({
      id: row.id, name: row.name, sku: row.sku, unit: row.unit,
      stockQuantity: asQuantity(row.stock_quantity), reservedQuantity: asQuantity(row.reserved_quantity),
      availableQuantity: asQuantity(Math.max(0, Number(row.stock_quantity || 0) - Number(row.reserved_quantity || 0)))
    }));
  }
  list() {
    const materials = this.db.prepare(`
      SELECT m.*, COALESCE(SUM(CASE WHEN a.status = 'reserved' THEN a.quantity - a.consumed_quantity ELSE 0 END),0) AS reserved_quantity
      FROM materials m LEFT JOIN shared_material_allocations a ON a.material_id = m.id
      GROUP BY m.id ORDER BY lower(m.name),m.id
    `).all().map(row => ({
      id: row.id, name: row.name, sku: row.sku, unit: row.unit, stockQuantity: asQuantity(row.stock_quantity),
      reservedQuantity: asQuantity(row.reserved_quantity), availableQuantity: asQuantity(Math.max(0, row.stock_quantity - row.reserved_quantity)),
      reorderPoint: asQuantity(row.reorder_point), supplier: row.supplier, costPerUnit: Number(row.cost_per_unit || 0)
    }));
    const allocations = this.db.prepare(`
      SELECT a.*, m.name AS material_name,m.unit AS material_unit,j.title AS job_title,r.name AS requirement_name
      FROM shared_material_allocations a JOIN materials m ON m.id=a.material_id JOIN jobs j ON j.id=a.job_id
      JOIN material_requirements r ON r.id=a.material_requirement_id
      ORDER BY CASE a.status WHEN 'reserved' THEN 0 ELSE 1 END,a.updated_at DESC LIMIT 200
    `).all().map(row => ({
      id: row.id, jobId: row.job_id, jobTitle: row.job_title, requirementId: row.material_requirement_id,
      requirementName: row.requirement_name, materialId: row.material_id, materialName: row.material_name,
      unit: row.material_unit, quantity: asQuantity(row.quantity), consumedQuantity: asQuantity(row.consumed_quantity),
      remainingQuantity: asQuantity(row.quantity - row.consumed_quantity), status: row.status, sourceReference: row.source_reference,
      note: row.note, actor: row.actor, createdAt: row.created_at, updatedAt: row.updated_at
    }));
    const requirements = this.db.prepare(`
      SELECT r.id,r.job_id,r.material_id,r.name,r.quantity,r.unit,r.status,j.title AS job_title,m.name AS material_name,m.unit AS material_unit
      FROM material_requirements r JOIN jobs j ON j.id=r.job_id JOIN materials m ON m.id=r.material_id
      WHERE r.status NOT IN ('cancelled','rejected','used') ORDER BY j.title,r.name
    `).all().map(row => ({ id: row.id, jobId: row.job_id, jobTitle: row.job_title, materialId: row.material_id,
      materialName: row.material_name, name: row.name, quantity: asQuantity(row.quantity), unit: row.unit, status: row.status }));
    const movementRows = [
      ...this.db.prepare(`SELECT id,material_id,movement_type,quantity_delta,quantity_after,reference,note,actor,created_at
        FROM shared_material_stock_movements WHERE id NOT IN (SELECT stock_movement_id FROM shared_material_site_issues)
        ORDER BY created_at DESC LIMIT 100`).all(),
      ...this.db.prepare('SELECT id,material_id,movement_type,quantity_delta,quantity_after,reference,note,actor,created_at FROM shared_material_receipt_movements ORDER BY created_at DESC LIMIT 100').all(),
      ...this.db.prepare(`SELECT movement.id,movement.material_id,'site_issue' AS movement_type,movement.quantity_delta,movement.quantity_after,
          issue.dispatch_reference AS reference,issue.note,issue.actor,movement.created_at
        FROM shared_material_site_issues issue JOIN shared_material_stock_movements movement ON movement.id=issue.stock_movement_id
        ORDER BY movement.created_at DESC LIMIT 100`).all()
    ].sort((left, right) => String(right.created_at).localeCompare(String(left.created_at))).slice(0, 100);
    const movements = movementRows.map(row => ({ id: row.id, materialId: row.material_id, type: row.movement_type, quantityDelta: asQuantity(row.quantity_delta),
      quantityAfter: asQuantity(row.quantity_after), reference: row.reference, note: row.note, actor: row.actor, createdAt: row.created_at }));
    const siteIssues = this.listSiteIssues();
    return { materials, allocations, requirements, movements, summary: { materials: materials.length,
      availableItems: materials.filter(item => item.availableQuantity > 0).length,
      activeAllocations: allocations.filter(item => item.status === 'reserved').length,
      shortItems: materials.filter(item => item.availableQuantity < item.reorderPoint).length }, siteIssues };
  }
  listSiteIssues(jobId = null) {
    const rows = this.db.prepare(`SELECT issue.*,material.name AS material_name,material.unit AS material_unit,job.title AS job_title
      FROM shared_material_site_issues issue JOIN materials material ON material.id=issue.material_id
      JOIN jobs job ON job.id=issue.job_id ${jobId ? 'WHERE issue.job_id=?' : ''}
      ORDER BY issue.expected_arrival_at,issue.created_at`).all(...(jobId ? [jobId] : []));
    return rows.map(issue => {
      const receipts = this.db.prepare('SELECT * FROM shared_material_site_issue_receipts WHERE issue_id=? ORDER BY created_at,id').all(issue.id);
      const receiptViews = receipts.map(receipt => {
        const reviews = this.db.prepare(`SELECT * FROM shared_material_site_issue_receipt_reviews WHERE receipt_id=? ORDER BY created_at,id`).all(receipt.id);
        const reviewedAcceptedQuantity = reviews.reduce((total, review) => total + Number(review.accepted_quantity), 0);
        const reviewedDamagedQuantity = reviews.reduce((total, review) => total + Number(review.damaged_quantity), 0);
        return { id: receipt.id, receivedQuantity: asQuantity(receipt.received_quantity),
          acceptedQuantity: asQuantity(Number(receipt.accepted_quantity) + reviewedAcceptedQuantity),
          damagedQuantity: asQuantity(Number(receipt.damaged_quantity) + reviewedDamagedQuantity),
          pendingInspectionQuantity: asQuantity(Math.max(0, Number(receipt.received_quantity) - Number(receipt.accepted_quantity)
            - Number(receipt.damaged_quantity) - reviewedAcceptedQuantity - reviewedDamagedQuantity)),
          receiptReference: receipt.receipt_reference, receivedBy: receipt.received_by, location: receipt.location,
          evidenceReference: receipt.evidence_reference, receivedAt: receipt.created_at,
          reviews: reviews.map(review => ({ id: review.id, acceptedQuantity: asQuantity(review.accepted_quantity),
            damagedQuantity: asQuantity(review.damaged_quantity), reviewReference: review.review_reference,
            evidenceReference: review.evidence_reference, note: review.note, reviewedBy: review.actor, reviewedAt: review.created_at })) };
      });
      const pendingInspectionQuantity = receiptViews.reduce((total, receipt) => total + receipt.pendingInspectionQuantity, 0);
      const acceptedQuantity = receiptViews.reduce((total, receipt) => total + receipt.acceptedQuantity, 0);
      const damagedQuantity = receiptViews.reduce((total, receipt) => total + receipt.damagedQuantity, 0);
      return { id: issue.id, jobId: issue.job_id, jobTitle: issue.job_title, allocationId: issue.allocation_id,
        requirementId: issue.material_requirement_id, materialId: issue.material_id, materialName: issue.material_name, unit: issue.material_unit,
        quantity: asQuantity(issue.quantity), receivedQuantity: asQuantity(issue.received_quantity), acceptedQuantity: asQuantity(acceptedQuantity),
        pendingInspectionQuantity: asQuantity(pendingInspectionQuantity), damagedQuantity: asQuantity(damagedQuantity),
        remainingQuantity: asQuantity(Math.max(0, issue.quantity - issue.received_quantity)), dispatchReference: issue.dispatch_reference,
        expectedArrivalAt: issue.expected_arrival_at, evidenceReference: issue.evidence_reference, note: issue.note,
        status: issue.received_quantity >= issue.quantity - 0.000001 ? 'received' : issue.received_quantity > 0 ? 'partial' : 'in_transit',
        receipts: receiptViews };
    });
  }
  receiveCompanyWarehouseReceipt(receipt, options = {}) {
    if (receipt?.stockDestination !== 'company_warehouse') return { movements: [], replayed: true };
    return this.ledger.transaction(() => {
      const actor = options.actor || 'material_receiving';
      const movements = [];
      for (const line of receipt.lines || []) {
        const accepted = quantity(line.acceptedQuantity, true) / 10000;
        if (accepted === 0) continue;
        const materialId = text(line.data?.stockMaterialId || '', 'Gekoppeld voorraadartikel');
        const material = this.lockedMaterial(materialId);
        if (String(material.unit).trim().toLowerCase() !== String(line.unit).trim().toLowerCase()) {
          fail('material_receipt_stock_unit_mismatch', 'Eenheid van de ontvangst en het gekoppelde voorraadartikel wijkt af.', 409);
        }
        const entryKey = `material-receipt:${receipt.id}:${line.id}:receive`;
        const fingerprint = digest({ action: 'company_warehouse_receipt', receiptId: receipt.id, lineId: line.id, materialId, accepted });
        const replay = this.replay('shared_material_receipt_movements', entryKey, fingerprint);
        if (replay) {
          movements.push({ id: replay.id, replayed: true });
          continue;
        }
        const nextStock = asQuantity(Number(material.stock_quantity || 0) + accepted), timestamp = this.now();
        this.db.prepare('UPDATE materials SET stock_quantity=?,updated_at=? WHERE id=?').run(nextStock, timestamp, material.id);
        const id = `stock_${randomUUID()}`;
        this.db.prepare(`INSERT INTO shared_material_receipt_movements
          (id,material_id,receipt_id,receipt_line_id,movement_type,quantity_delta,quantity_after,reference,note,entry_key,entry_fingerprint,actor,created_at)
          VALUES (?, ?, ?, ?, 'receipt', ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, material.id, receipt.id, line.id, accepted, nextStock,
          receipt.receiptReference, line.data?.notes || `Accepted delivery at ${receipt.location || 'company warehouse'}.`, entryKey, fingerprint, actor, timestamp);
        this.ledger.audit({ entityType: 'material_stock', entityId: material.id, jobId: receipt.jobId,
          action: 'receive_company_warehouse_material', actor,
          after: { receiptId: receipt.id, receiptLineId: line.id, quantity: accepted, stockQuantity: nextStock, reference: receipt.receiptReference } });
        movements.push({ id, replayed: false });
      }
      return { movements, replayed: movements.length > 0 && movements.every(movement => movement.replayed) };
    });
  }
  reverseCompanyWarehouseReceipt(receiptId, options = {}) {
    return this.ledger.transaction(() => {
      const actor = options.actor || 'receipt_approver';
      const sourceMovements = this.db.prepare(`SELECT * FROM shared_material_receipt_movements
        WHERE receipt_id=? AND movement_type='receipt' ORDER BY receipt_line_id`).all(receiptId);
      const reversed = [];
      for (const source of sourceMovements) {
        const entryKey = `material-receipt:${receiptId}:${source.receipt_line_id}:reverse`;
        const fingerprint = digest({ action: 'company_warehouse_receipt_reversal', receiptId, sourceMovementId: source.id, quantity: source.quantity_delta });
        const replay = this.replay('shared_material_receipt_movements', entryKey, fingerprint);
        if (replay) {
          reversed.push({ id: replay.id, replayed: true });
          continue;
        }
        const material = this.lockedMaterial(source.material_id);
        const amount = Number(source.quantity_delta);
        const nextStock = asQuantity(Number(material.stock_quantity || 0) - amount);
        const reserved = Number(this.db.prepare("SELECT COALESCE(SUM(quantity-consumed_quantity),0) AS quantity FROM shared_material_allocations WHERE material_id=? AND status='reserved'").get(material.id).quantity || 0);
        if (nextStock < -0.000001 || nextStock + 0.000001 < reserved) {
          fail('material_receipt_stock_reversal_blocked', `Ontvangst kan niet uit de magazijnvoorraad worden teruggeboekt: ${asQuantity(material.stock_quantity)} ${material.unit} geteld, ${asQuantity(reserved)} ${material.unit} gereserveerd en ${asQuantity(amount)} ${material.unit} te corrigeren.`, 409);
        }
        const balance = Math.max(0, nextStock), timestamp = this.now();
        this.db.prepare('UPDATE materials SET stock_quantity=?,updated_at=? WHERE id=?').run(balance, timestamp, material.id);
        const id = `stock_${randomUUID()}`;
        this.db.prepare(`INSERT INTO shared_material_receipt_movements
          (id,material_id,receipt_id,receipt_line_id,movement_type,quantity_delta,quantity_after,reference,note,entry_key,entry_fingerprint,actor,created_at)
          VALUES (?, ?, ?, ?, 'receipt_reversal', ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, material.id, receiptId, source.receipt_line_id, -amount, balance,
          source.reference, 'Approved receipt reversal; warehouse balance corrected.', entryKey, fingerprint, actor, timestamp);
        this.ledger.audit({ entityType: 'material_stock', entityId: material.id, action: 'reverse_company_warehouse_material_receipt', actor,
          after: { receiptId, receiptLineId: source.receipt_line_id, quantity: -amount, stockQuantity: balance, reference: source.reference } });
        reversed.push({ id, replayed: false });
      }
      return { movements: reversed, replayed: reversed.length > 0 && reversed.every(movement => movement.replayed) };
    });
  }
  count(payload = {}, options = {}) {
    const entryKey = text(payload.entryKey || payload.entry_key, 'Invoersleutel', 160);
    const reference = text(payload.reference || payload.verificationReference, 'Tel- of bewijsreferentie', 240);
    const note = text(payload.note || payload.notes, 'Toelichting', 1000);
    const counted = quantity(payload.countedQuantity ?? payload.counted_quantity, true) / 10000;
    return this.ledger.transaction(() => {
      let material = payload.materialId ? this.lockedMaterial(text(payload.materialId, 'Materiaal')) : null;
      const name = material?.name || text(payload.name, 'Materiaalnaam', 200);
      const unit = material?.unit || text(payload.unit || 'stuk', 'Eenheid', 40);
      const fingerprint = digest({ action: 'stocktake', materialId: material?.id || null, name, unit, counted, reference, note });
      const replay = this.replay('shared_material_stock_movements', entryKey, fingerprint);
      if (replay) return { replayed: true, material: this.list().materials.find(item => item.id === replay.material_id), movementId: replay.id };
      if (!material) {
        material = this.db.prepare('SELECT * FROM materials WHERE lower(name)=lower(?) AND lower(unit)=lower(?) LIMIT 1').get(name, unit);
        if (material) material = this.lockedMaterial(material.id);
        else {
          material = { id: `mat_${randomUUID()}`, name, unit, stock_quantity: 0 };
          this.db.prepare(`INSERT INTO materials (id,name,sku,unit,stock_quantity,reorder_point,supplier,cost_per_unit,data_json,created_at,updated_at)
            VALUES (?, ?, ?, ?, 0, ?, ?, ?, '{}', ?, ?)`)
            .run(material.id, name, payload.sku ? text(payload.sku, 'SKU', 100) : null, unit,
              payload.reorderPoint === undefined ? 0 : quantity(payload.reorderPoint, true) / 10000,
              payload.supplier ? text(payload.supplier, 'Leverancier', 200) : null,
              Number.isFinite(Number(payload.costPerUnit)) ? Number(payload.costPerUnit) : 0, this.now(), this.now());
        }
      }
      const reserved = Number(this.db.prepare("SELECT COALESCE(SUM(quantity-consumed_quantity),0) AS quantity FROM shared_material_allocations WHERE material_id=? AND status='reserved'").get(material.id).quantity || 0);
      if (counted + 0.000001 < reserved) fail('material_stock_below_reservations', `Getelde voorraad (${counted} ${unit}) is lager dan actieve reserveringen (${asQuantity(reserved)} ${unit}). Geef eerst reserveringen vrij of tel de voorraad opnieuw.`, 409);
      const before = Number(material.stock_quantity || 0), delta = asQuantity(counted - before), timestamp = this.now();
      this.db.prepare('UPDATE materials SET stock_quantity=?,updated_at=? WHERE id=?').run(counted, timestamp, material.id);
      const movementId = `stock_${randomUUID()}`;
      this.db.prepare(`INSERT INTO shared_material_stock_movements
        (id,material_id,movement_type,quantity_delta,quantity_after,reference,note,entry_key,entry_fingerprint,actor,created_at)
        VALUES (?,?,'stocktake',?,?,?,?,?,?,?,?)`).run(movementId, material.id, delta, counted, reference, note, entryKey, fingerprint, options.actor || 'dashboard', timestamp);
      this.ledger.audit({ entityType: 'material_stock', entityId: material.id, action: 'record_material_stocktake', actor: options.actor || 'dashboard', after: { materialId: material.id, countedQuantity: counted, quantityDelta: delta, reference, note } });
      return { replayed: false, material: this.list().materials.find(item => item.id === material.id), movementId };
    });
  }
  reserve(jobId, payload = {}, options = {}) {
    const requirementId = text(payload.materialRequirementId || payload.requirementId, 'Opdrachtmateriaal');
    const entryKey = text(payload.entryKey || payload.entry_key, 'Invoersleutel', 160);
    const sourceReference = text(payload.sourceReference || payload.reference, 'Voorraadtelreferentie', 240);
    const note = payload.note ? text(payload.note, 'Toelichting', 1000) : '';
    const amount = quantity(payload.quantity) / 10000;
    return this.ledger.transaction(() => {
      this.ledger.requireJob(jobId);
      const requirement = this.db.prepare('SELECT * FROM material_requirements WHERE id=? AND job_id=?').get(requirementId, jobId);
      if (!requirement) fail('material_requirement_not_found', 'Materiaalbehoefte niet gevonden bij deze opdracht.', 404);
      if (!requirement.material_id) fail('material_catalog_link_required', 'Koppel deze materiaalbehoefte eerst aan een gedeelde voorraadpost.', 409);
      const material = this.lockedMaterial(requirement.material_id);
      if (String(material.unit).trim().toLowerCase() !== String(requirement.unit).trim().toLowerCase()) fail('material_stock_unit_mismatch', 'De eenheid van de opdracht en voorraadpost moet gelijk zijn.', 409);
      const requirementData = (() => { try { return JSON.parse(requirement.data_json || '{}'); } catch { return {}; } })();
      const siteAvailable = Number(requirementData.availableQuantity || 0);
      const inTransit = Number(this.db.prepare(`SELECT COALESCE(SUM(quantity-received_quantity),0) AS quantity
        FROM shared_material_site_issues WHERE material_requirement_id=?`).get(requirementId).quantity || 0);
      const remainingNeed = Math.max(0, Number(requirement.quantity) - siteAvailable - inTransit);
      if (amount > remainingNeed + 0.000001) fail('material_stock_requirement_limit', `Reservering is groter dan de resterende behoefte van ${asQuantity(remainingNeed)} ${requirement.unit} na bouwplaatsontvangsten en uitgiften onderweg.`, 409);
      const fingerprint = digest({ action: 'reserve', jobId, requirementId, materialId: material.id, amount, sourceReference, note });
      const replay = this.replay('shared_material_allocations', entryKey, fingerprint);
      if (replay) return { replayed: true, allocation: this.getAllocation(replay.id) };
      const existing = this.db.prepare("SELECT id FROM shared_material_allocations WHERE material_requirement_id=? AND status='reserved'").get(requirementId);
      if (existing) fail('material_requirement_already_reserved', 'Deze materiaalbehoefte heeft al een actieve reservering.', 409);
      const reserved = Number(this.db.prepare("SELECT COALESCE(SUM(quantity-consumed_quantity),0) AS quantity FROM shared_material_allocations WHERE material_id=? AND status='reserved'").get(material.id).quantity || 0);
      const available = Number(material.stock_quantity || 0) - reserved;
      if (amount > available + 0.000001) fail('material_stock_insufficient', `Onvoldoende vrije voorraad: ${asQuantity(Math.max(0, available))} ${material.unit} beschikbaar; ${amount} gevraagd.`, 409);
      const id = `alloc_${randomUUID()}`, timestamp = this.now();
      this.db.prepare(`INSERT INTO shared_material_allocations
        (id,job_id,material_requirement_id,material_id,quantity,status,entry_key,entry_fingerprint,source_reference,note,actor,created_at,updated_at)
        VALUES (?,?,?,?,?,'reserved',?,?,?,?,?,?,?)`).run(id, jobId, requirementId, material.id, amount, entryKey, fingerprint, sourceReference, note, options.actor || 'dashboard', timestamp, timestamp);
      this.ledger.audit({ entityType: 'material_allocation', entityId: id, jobId, action: 'reserve_shared_material_stock', actor: options.actor || 'dashboard', after: { id, materialId: material.id, requirementId, quantity: amount, sourceReference } });
      return { replayed: false, allocation: this.getAllocation(id) };
    });
  }
  getAllocation(id) {
    const data = this.list().allocations.find(item => item.id === id);
    if (!data) fail('material_allocation_not_found', 'Voorraadreservering niet gevonden.', 404);
    return data;
  }
  transition(allocationId, action, payload = {}, options = {}) {
    const entryKey = text(payload.entryKey || payload.entry_key, 'Invoersleutel', 160);
    const note = text(payload.note || payload.notes, 'Toelichting', 1000);
    const reference = action === 'consume' ? text(payload.evidenceReference || payload.reference, 'Verbruiksbewijs', 240) : null;
    const requested = action === 'consume' ? quantity(payload.quantity) / 10000 : null;
    return this.ledger.transaction(() => {
      const lookup = this.db.prepare('SELECT * FROM shared_material_allocations WHERE id=?').get(allocationId);
      if (!lookup) fail('material_allocation_not_found', 'Voorraadreservering niet gevonden.', 404);
      const material = this.lockedMaterial(lookup.material_id);
      const fingerprint = digest({ action, allocationId, requested, reference, note });
      const replay = this.replay('shared_material_stock_movements', entryKey, fingerprint);
      if (replay) return { replayed: true, allocation: this.getAllocation(allocationId), movementId: replay.id };
      const allocation = this.db.prepare('SELECT * FROM shared_material_allocations WHERE id=?').get(allocationId);
      if (allocation.status !== 'reserved') fail('material_allocation_not_active', 'Alleen een actieve reservering kan worden aangepast.', 409);
      const timestamp = this.now(), actor = options.actor || 'dashboard';
      if (action === 'release') {
        this.db.prepare("UPDATE shared_material_allocations SET status='released',note=?,actor=?,updated_at=?,released_at=? WHERE id=? AND status='reserved'").run(note, actor, timestamp, timestamp, allocationId);
        const movementId = `stock_${randomUUID()}`;
        this.db.prepare(`INSERT INTO shared_material_stock_movements
          (id,material_id,movement_type,quantity_delta,quantity_after,reference,note,entry_key,entry_fingerprint,allocation_id,actor,created_at)
          VALUES (?,?,'release',0,?,?,?,?,?,?,?,?)`).run(movementId, material.id, Number(material.stock_quantity), lookup.source_reference, note, entryKey, fingerprint, allocationId, actor, timestamp);
        this.ledger.audit({ entityType: 'material_allocation', entityId: allocationId, jobId: allocation.job_id, action: 'release_shared_material_stock', actor, before: { status: 'reserved' }, after: { status: 'released', note } });
        return { replayed: false, allocation: this.getAllocation(allocationId), movementId };
      }
      const remaining = Number(allocation.quantity) - Number(allocation.consumed_quantity);
      if (requested > remaining + 0.000001 || requested > Number(material.stock_quantity) + 0.000001) fail('material_allocation_consume_limit', 'De verbruikte hoeveelheid mag niet groter zijn dan de reservering of getelde voorraad.', 409);
      const nextStock = asQuantity(Number(material.stock_quantity) - requested), nextConsumed = asQuantity(Number(allocation.consumed_quantity) + requested);
      const nextStatus = nextConsumed >= Number(allocation.quantity) - 0.000001 ? 'consumed' : 'reserved';
      this.db.prepare('UPDATE materials SET stock_quantity=?,updated_at=? WHERE id=?').run(nextStock, timestamp, material.id);
      this.db.prepare("UPDATE shared_material_allocations SET consumed_quantity=?,status=?,note=?,actor=?,updated_at=?,consumed_at=? WHERE id=? AND status='reserved'")
        .run(nextConsumed, nextStatus, note, actor, timestamp, nextStatus === 'consumed' ? timestamp : null, allocationId);
      const movementId = `stock_${randomUUID()}`;
      this.db.prepare(`INSERT INTO shared_material_stock_movements
        (id,material_id,movement_type,quantity_delta,quantity_after,reference,note,entry_key,entry_fingerprint,allocation_id,actor,created_at)
        VALUES (?,?,'consumption',?,?,?,?,?,?,?,?,?)`).run(movementId, material.id, -requested, nextStock, reference, note, entryKey, fingerprint, allocationId, actor, timestamp);
      this.ledger.audit({ entityType: 'material_allocation', entityId: allocationId, jobId: allocation.job_id, action: 'consume_shared_material_stock', actor, before: { stockQuantity: material.stock_quantity, consumedQuantity: allocation.consumed_quantity }, after: { stockQuantity: nextStock, consumedQuantity: nextConsumed, reference } });
      return { replayed: false, allocation: this.getAllocation(allocationId), movementId };
    });
  }
  issue(allocationId, payload = {}, options = {}) {
    const entryKey = text(payload.entryKey || payload.entry_key, 'Invoersleutel', 160);
    const dispatchReference = text(payload.dispatchReference || payload.dispatch_reference, 'Uitgifte- of transportreferentie', 240);
    const evidenceReference = text(payload.evidenceReference || payload.evidence_reference, 'Bewijs van uitgifte', 240);
    const expectedArrivalAt = this.ledger.normalizeReservationDate(payload.expectedArrivalAt || payload.expected_arrival_at, 'expectedArrivalAt');
    const note = payload.note ? text(payload.note, 'Toelichting', 1000) : '';
    const requested = quantity(payload.quantity) / 10000;
    return this.ledger.transaction(() => {
      const initial = this.db.prepare('SELECT * FROM shared_material_allocations WHERE id=?').get(allocationId);
      if (!initial) fail('material_allocation_not_found', 'Voorraadreservering niet gevonden.', 404);
      const material = this.lockedMaterial(initial.material_id);
      const fingerprint = digest({ action: 'issue_to_job_site', allocationId, requested, dispatchReference, evidenceReference, expectedArrivalAt, note });
      const replay = this.replay('shared_material_site_issues', entryKey, fingerprint);
      if (replay) return { replayed: true, allocation: this.getAllocation(allocationId), issueId: replay.id };
      const allocation = this.db.prepare('SELECT * FROM shared_material_allocations WHERE id=?').get(allocationId);
      if (allocation.status !== 'reserved') fail('material_allocation_not_active', 'Alleen een actieve reservering kan aan de bouwplaats worden uitgegeven.', 409);
      const remaining = Number(allocation.quantity) - Number(allocation.consumed_quantity);
      if (requested > remaining + 0.000001 || requested > Number(material.stock_quantity) + 0.000001) {
        fail('material_allocation_issue_limit', 'De uitgifte mag niet groter zijn dan de resterende reservering of getelde voorraad.', 409);
      }
      const requirement = this.db.prepare('SELECT * FROM material_requirements WHERE id=? AND job_id=?').get(allocation.material_requirement_id, allocation.job_id);
      if (!requirement) fail('material_requirement_not_found', 'De gekoppelde opdrachtbehoefte bestaat niet meer.', 409);
      const data = (() => { try { return JSON.parse(requirement.data_json || '{}'); } catch { return {}; } })();
      const issues = this.db.prepare('SELECT expected_arrival_at FROM shared_material_site_issues WHERE material_requirement_id=? AND received_quantity < quantity').all(requirement.id);
      const plannedArrival = [...issues.map(item => item.expected_arrival_at), expectedArrivalAt].sort().at(-1);
      const availableAtSite = Number(data.availableQuantity || 0);
      if (availableAtSite >= Number(requirement.quantity) - 0.000001) fail('material_requirement_already_fulfilled', 'Deze materiaalbehoefte is al op de bouwplaats ontvangen.', 409);

      const timestamp = this.now(), actor = options.actor || 'warehouse_operator';
      const nextStock = asQuantity(Number(material.stock_quantity) - requested);
      const nextConsumed = asQuantity(Number(allocation.consumed_quantity) + requested);
      const nextStatus = nextConsumed >= Number(allocation.quantity) - 0.000001 ? 'consumed' : 'reserved';
      const movementId = `stock_${randomUUID()}`;
      this.db.prepare('UPDATE materials SET stock_quantity=?,updated_at=? WHERE id=?').run(nextStock, timestamp, material.id);
      this.db.prepare("UPDATE shared_material_allocations SET consumed_quantity=?,status=?,note=?,actor=?,updated_at=?,consumed_at=? WHERE id=? AND status='reserved'")
        .run(nextConsumed, nextStatus, note, actor, timestamp, nextStatus === 'consumed' ? timestamp : null, allocationId);
      this.db.prepare(`INSERT INTO shared_material_stock_movements
        (id,material_id,movement_type,quantity_delta,quantity_after,reference,note,entry_key,entry_fingerprint,allocation_id,actor,created_at)
        VALUES (?,?,'consumption',?,?,?,?,?,?,?,?,?)`).run(movementId, material.id, -requested, nextStock, dispatchReference,
          `Issued to job site. ${note}`.trim(), entryKey, fingerprint, allocationId, actor, timestamp);
      const issueId = `issue_${randomUUID()}`;
      this.db.prepare(`INSERT INTO shared_material_site_issues
        (id,allocation_id,job_id,material_requirement_id,material_id,quantity,dispatch_reference,expected_arrival_at,evidence_reference,note,
          stock_movement_id,entry_key,entry_fingerprint,actor,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(issueId, allocationId, allocation.job_id, requirement.id, material.id, requested,
          dispatchReference, expectedArrivalAt, evidenceReference, note, movementId, entryKey, fingerprint, actor, timestamp);
      const status = availableAtSite >= Number(requirement.quantity) - 0.000001 ? 'available' : availableAtSite > 0 ? 'received' : 'needed';
      this.ledger.updateMaterialRequirementStatus(allocation.job_id, requirement.id, { status, availableQuantity: availableAtSite,
        expectedAvailableAt: plannedArrival, verificationReference: dispatchReference,
        notes: `Warehouse issue ${dispatchReference}; expected at job site ${expectedArrivalAt}. ${note}`.trim() }, { actor });
      this.ledger.audit({ entityType: 'material_site_issue', entityId: issueId, jobId: allocation.job_id, action: 'issue_shared_stock_to_job_site', actor,
        after: { id: issueId, allocationId, requirementId: requirement.id, materialId: material.id, quantity: requested,
          dispatchReference, expectedArrivalAt, evidenceReference, stockQuantity: nextStock } });
      return { replayed: false, allocation: this.getAllocation(allocationId), issueId, movementId };
    });
  }
  receiveAtJobSite(jobId, issueId, payload = {}, options = {}) {
    const entryKey = text(payload.entryKey || payload.entry_key, 'Invoersleutel', 160);
    const receiptReference = text(payload.receiptReference || payload.receipt_reference, 'Ontvangstreferentie', 240);
    const receivedBy = text(payload.receivedBy || payload.received_by, 'Ontvanger', 160);
    const location = text(payload.location, 'Ontvangstlocatie', 240);
    const evidenceReference = text(payload.evidenceReference || payload.evidence_reference, 'Bewijs van bouwplaatsontvangst', 240);
    const received = quantity(payload.receivedQuantity || payload.received_quantity);
    const accepted = quantity(payload.acceptedQuantity ?? payload.accepted_quantity, true);
    const damaged = quantity(payload.damagedQuantity ?? payload.damaged_quantity ?? 0, true);
    if (accepted + damaged > received) fail('material_site_receipt_breakdown_invalid', 'Geaccepteerde en beschadigde aantallen kunnen samen niet groter zijn dan de ontvangen hoeveelheid.');
    const expectedDispatchReference = payload.expectedDispatchReference ? text(payload.expectedDispatchReference, 'Verwachte uitgiftereferentie', 240) : null;
    const expectedRemainingQuantity = payload.expectedRemainingQuantity !== undefined
      ? quantity(payload.expectedRemainingQuantity) / 10000 : null;
    const sourceHash = payload.sourceHash === undefined ? null : String(payload.sourceHash);
    if (sourceHash !== null && !/^[a-f0-9]{64}$/.test(sourceHash)) fail('material_site_receipt_source_invalid', 'De opgeslagen werkpakketversie is ongeldig. Vernieuw de werkmap voordat je synchroniseert.');
    return this.ledger.transaction(() => {
      const lockSuffix = this.ledger.databaseMode === 'postgres' ? ' FOR UPDATE' : '';
      const issue = this.db.prepare(`SELECT * FROM shared_material_site_issues WHERE id=? AND job_id=?${lockSuffix}`).get(issueId, jobId);
      if (!issue) fail('material_site_issue_not_found', 'De uitgifte hoort niet bij deze opdracht.', 404);
      const fingerprint = digest({ action: 'receive_site_issue', jobId, issueId, receiptReference, receivedBy, location, evidenceReference,
        received, accepted, damaged, expectedDispatchReference, expectedRemainingQuantity, sourceHash });
      const replay = this.replay('shared_material_site_issue_receipts', entryKey, fingerprint);
      if (replay) return { replayed: true, receipt: this.listSiteIssues(jobId).find(item => item.id === issueId)?.receipts.find(item => item.id === replay.id) || null };
      if (expectedDispatchReference && expectedDispatchReference !== issue.dispatch_reference) {
        fail('material_site_issue_changed', 'De uitgiftereferentie is gewijzigd. Controleer de actuele levering voordat je synchroniseert.', 409);
      }
      const remaining = Number(issue.quantity) - Number(issue.received_quantity);
      if (expectedRemainingQuantity !== null && Math.abs(expectedRemainingQuantity - asQuantity(remaining)) > 0.000001) {
        fail('material_site_issue_changed', 'De open hoeveelheid is gewijzigd sinds dit offline werkpakket is opgeslagen. Controleer de levering met kantoor.', 409);
      }
      if (received / 10000 > remaining + 0.000001) fail('material_site_receipt_issue_limit', `Deze uitgifte heeft nog ${asQuantity(remaining)} van de uitgegeven hoeveelheid onderweg.`, 409);
      const receiptId = `site_receipt_${randomUUID()}`, timestamp = this.now(), actor = options.actor || 'field_worker';
      this.db.prepare(`INSERT INTO shared_material_site_issue_receipts
        (id,issue_id,received_quantity,accepted_quantity,damaged_quantity,receipt_reference,received_by,location,evidence_reference,entry_key,entry_fingerprint,actor,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(receiptId, issueId, received / 10000, accepted / 10000, damaged / 10000,
          receiptReference, receivedBy, location, evidenceReference, entryKey, fingerprint, actor, timestamp);
      this.db.prepare(`UPDATE shared_material_site_issues SET received_quantity=received_quantity+?,accepted_quantity=accepted_quantity+? WHERE id=?`)
        .run(received / 10000, accepted / 10000, issueId);
      this.ledger.synchronizeMaterialRequirementReceiptStatus(issue.material_requirement_id, { actor, siteIssueReceiptId: receiptId });
      this.ledger.audit({ entityType: 'material_site_issue_receipt', entityId: receiptId, jobId, action: 'confirm_warehouse_issue_arrival', actor,
        after: { id: receiptId, issueId, receiptReference, receivedBy, location, evidenceReference,
          receivedQuantity: received / 10000, acceptedQuantity: accepted / 10000, damagedQuantity: damaged / 10000, sourceHash } });
      const updated = this.listSiteIssues(jobId).find(item => item.id === issueId);
      return { replayed: false, receipt: updated?.receipts.find(item => item.id === receiptId), issue: updated };
    });
  }

  reviewAtJobSite(jobId, issueId, receiptId, payload = {}, options = {}) {
    const entryKey = text(payload.entryKey || payload.entry_key, 'Invoersleutel', 160);
    const accepted = quantity(payload.acceptedQuantity ?? payload.accepted_quantity ?? 0, true);
    const damaged = quantity(payload.damagedQuantity ?? payload.damaged_quantity ?? 0, true);
    const expectedPending = quantity(payload.expectedPendingInspectionQuantity ?? payload.expected_pending_inspection_quantity);
    if (accepted + damaged === 0) fail('material_site_review_breakdown_invalid', 'Verdeel de inspectiehoeveelheid over goedgekeurd of beschadigd materiaal.');
    const reviewReference = text(payload.reviewReference || payload.review_reference, 'Inspectiereferentie', 240);
    const evidenceReference = text(payload.evidenceReference || payload.evidence_reference, 'Inspectiebewijs', 500);
    const note = payload.note ? text(payload.note, 'Inspectienotitie', 1000) : '';
    const fingerprint = digest({ action: 'review_site_receipt', jobId, issueId, receiptId, accepted, damaged,
      expectedPending, reviewReference, evidenceReference, note });
    return this.ledger.transaction(() => {
      const lockSuffix = this.ledger.databaseMode === 'postgres' ? ' FOR UPDATE' : '';
      const issue = this.db.prepare(`SELECT * FROM shared_material_site_issues WHERE id=? AND job_id=?${lockSuffix}`).get(issueId, jobId);
      if (!issue) fail('material_site_issue_not_found', 'De uitgifte hoort niet bij deze opdracht.', 404);
      const receipt = this.db.prepare(`SELECT * FROM shared_material_site_issue_receipts WHERE id=? AND issue_id=?${lockSuffix}`).get(receiptId, issueId);
      if (!receipt) fail('material_site_receipt_not_found', 'De bouwplaatsontvangst hoort niet bij deze uitgifte.', 404);
      const replay = this.replay('shared_material_site_issue_receipt_reviews', entryKey, fingerprint);
      if (replay) return { replayed: true, review: this.getSiteReceiptReview(replay.id), issue: this.listSiteIssues(jobId).find(item => item.id === issueId) };
      const previous = this.db.prepare(`SELECT COALESCE(SUM(accepted_quantity),0) AS accepted,COALESCE(SUM(damaged_quantity),0) AS damaged
        FROM shared_material_site_issue_receipt_reviews WHERE receipt_id=?`).get(receiptId);
      const pending = asQuantity(Math.max(0, Number(receipt.received_quantity) - Number(receipt.accepted_quantity)
        - Number(receipt.damaged_quantity) - Number(previous.accepted) - Number(previous.damaged)));
      if (Math.abs(expectedPending / 10000 - pending) > 0.000001) fail('material_site_receipt_review_stale', 'Deze inspectiehoeveelheid is gewijzigd. Ververs de voorraadweergave en beoordeel opnieuw.', 409);
      if ((accepted + damaged) / 10000 > pending + 0.000001) fail('material_site_receipt_review_limit', `Er staat nog ${pending} te inspecteren; de beoordeelde hoeveelheid is groter.`, 409);
      const id = `site_review_${randomUUID()}`, actor = options.actor || 'office_operator', timestamp = this.now();
      const review = { id, jobId, issueId, receiptId, acceptedQuantity: accepted / 10000, damagedQuantity: damaged / 10000,
        reviewReference, evidenceReference, note, reviewedBy: actor, reviewedAt: timestamp };
      this.db.prepare(`INSERT INTO shared_material_site_issue_receipt_reviews
        (id,job_id,issue_id,receipt_id,accepted_quantity,damaged_quantity,review_reference,evidence_reference,note,entry_key,entry_fingerprint,actor,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, jobId, issueId, receiptId, review.acceptedQuantity, review.damagedQuantity,
        reviewReference, evidenceReference, note, entryKey, fingerprint, actor, timestamp);
      this.ledger.synchronizeMaterialRequirementReceiptStatus(issue.material_requirement_id, { actor, siteIssueReceiptReviewId: id });
      this.ledger.audit({ entityType: 'material_site_issue_receipt_review', entityId: id, jobId,
        action: 'review_warehouse_issue_site_receipt', actor, after: review,
        metadata: { entryKey, fingerprint, sourceReceiptId: receiptId, expectedPendingInspectionQuantity: pending,
          externalCommitments: 0 } });
      return { replayed: false, review, issue: this.listSiteIssues(jobId).find(item => item.id === issueId) };
    });
  }

  getSiteReceiptReview(id) {
    const row = this.db.prepare('SELECT * FROM shared_material_site_issue_receipt_reviews WHERE id=?').get(id);
    if (!row) return null;
    return { id: row.id, jobId: row.job_id, issueId: row.issue_id, receiptId: row.receipt_id,
      acceptedQuantity: asQuantity(row.accepted_quantity), damagedQuantity: asQuantity(row.damaged_quantity),
      reviewReference: row.review_reference, evidenceReference: row.evidence_reference, note: row.note,
      reviewedBy: row.actor, reviewedAt: row.created_at };
  }
}

module.exports = { SharedMaterialStock, migrateSharedMaterialStock, migrateSharedMaterialReceiptStock, migrateSharedMaterialSiteIssues,
  migrateSharedMaterialSiteIssueReceiptReviews };
