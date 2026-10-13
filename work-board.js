const { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } = require('node:crypto');
const { promisify } = require('node:util');
const { verifyAppliedVariationTask } = require('./variation-implementation');
const { assignmentTradePartnerRequirement, workerHasVerifiedTradePartner, workerMatchesAssignmentTradePartner } = require('./work-board-company-scope');
const derive = promisify(scrypt);
const MAX_AUTOMATED_STANDBY_CALLOUTS = 3;
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (message, statusCode = 400, details = {}) => { throw Object.assign(new Error(message), { statusCode, ...details }); };
const legacyIntakeCoordinationTasks = new Map([
  ['Validate scope and site constraints', 1.5],
  ['Prepare quote and approval package', 2],
  ['Reserve crew, tools, and materials', 2],
  ['Create client update draft', 1]
]);
function isCoordinationTask(task, job) {
  if (task.data?.workforcePositionEligible === false || task.data?.workCategory === 'coordination'
      || task.data?.source === 'job_intake_default') return true;
  const legacyDuration = legacyIntakeCoordinationTasks.get(task.title);
  return legacyDuration !== undefined && !task.description && !task.data?.requiredTrade
    && !task.plannedStart && !task.plannedEnd && task.durationHours === legacyDuration
    && task.dueAt === (job.targetCompletion || job.scheduledStart || null);
}
function text(value, label, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`${label} ontbreekt of is te lang.`);
  return value.trim();
}

function publicPositionPrivacyWarnings(job, position) {
  const client = job.client || {};
  const publicFields = [position.title, position.role, position.city, position.description,
    position.materials, position.equipment, position.prerequisites];
  const normalizedPublic = publicFields.join('\n').normalize('NFKD').replace(/\p{M}/gu, '')
    .toLocaleLowerCase('nl-NL').replace(/[^\p{L}\p{N}]+/gu, ' ');
  const publicDigits = publicFields.join('\n').replace(/\D/g, '');
  const privatePhrases = [
    { value: job.address, label: 'het exacte adres' },
    { value: client.address, label: 'het exacte adres' },
    { value: client.name, label: 'de klantnaam' },
    { value: client.company, label: 'de klantnaam of bedrijfsnaam' }
  ];
  const warnings = new Set();
  for (const item of privatePhrases) {
    if (typeof item.value !== 'string') continue;
    const phrase = item.value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('nl-NL')
      .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const tokenCount = phrase.split(' ').filter(Boolean).length;
    if ((phrase.length >= 8 || tokenCount >= 2) && normalizedPublic.includes(phrase)) warnings.add(item.label);
  }
  for (const value of [client.email]) {
    if (typeof value === 'string' && value.includes('@') && publicFields.join('\n').toLocaleLowerCase('nl-NL').includes(value.toLocaleLowerCase('nl-NL'))) {
      warnings.add('klantcontactgegevens');
    }
  }
  const privatePhone = typeof client.phone === 'string' ? client.phone.replace(/\D/g, '') : '';
  if (privatePhone.length >= 8 && publicDigits.includes(privatePhone)) warnings.add('klantcontactgegevens');
  return [...warnings];
}

function normalizeRequiredSkills(value, role, optional = false) {
  if (value === undefined && optional) return [];
  if (!Array.isArray(value) || value.length > 20) fail('Geef maximaal 20 aanvullende vaardigheden op.');
  const roleKey = String(role || '').trim().toLocaleLowerCase();
  const seen = new Set();
  return value.map(skill => {
    const label = text(skill, 'Vereiste vaardigheid', 60);
    const key = label.toLocaleLowerCase();
    if (key === roleKey || seen.has(key)) return null;
    seen.add(key);
    return label;
  }).filter(Boolean);
}

function missingPositionSkills(position, profiles) {
  const declared = new Set(profiles.flatMap(profile => profile || []).map(skill => String(skill).trim().toLocaleLowerCase()));
  return (position.requiredSkills || []).filter(skill => !declared.has(skill.toLocaleLowerCase()));
}

function normalizeProfileSkills(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) fail('Kies 1 tot 20 vakgebieden of aanvullende vaardigheden.');
  const seen = new Set();
  const skills = value.map(item => text(item, 'Vaardigheid', 80)).filter(skill => {
    const key = skill.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!skills.length) fail('Kies ten minste één vaardigheid.');
  return skills;
}

function areaKey(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function normalizeWorkRegions(value, { allowEmpty = false } = {}) {
  const input = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[;,]/) : null;
  if (!input || input.length > 20) fail('Geef maximaal 20 werkgebieden op.');
  const seen = new Set(), regions = [];
  for (const item of input) {
    if (typeof item !== 'string' || item.length > 80) fail('Een werkgebied is ongeldig of te lang.');
    const label = item.trim();
    if (!label) continue;
    const key = areaKey(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    regions.push(label);
  }
  if (!allowEmpty && !regions.length) fail('Geef ten minste één werkgebied op of kies landelijke beschikbaarheid.');
  return regions;
}

function workerRegionPreference(account) {
  if (account.allRegions === true || (!Array.isArray(account.workRegions) && areaKey(account.region) === 'heel nederland')) {
    return { allRegions: true, regions: [] };
  }
  const declared = Array.isArray(account.workRegions) ? account.workRegions
    : typeof account.region === 'string' ? account.region.split(/[;,]/) : [];
  return { allRegions: false, regions: declared.filter(item => typeof item === 'string' && item.trim()) };
}

function notificationDate(value) {
  const instant = Date.parse(value);
  return Number.isFinite(instant)
    ? new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', dateStyle: 'medium', timeStyle: 'short' }).format(instant)
    : 'Tijd wordt nog afgestemd';
}

function positionAssignmentNotice(position, assignment, job, href = '/work-board.html#applications') {
  const location = [job.address, position.city || job.city].filter(Boolean).join(', ');
  const hours = Number(assignment.allocationHours || position.hours);
  return {
    title: 'Je bent geplaatst',
    body: `${position.title} · ${position.role}\n${notificationDate(assignment.scheduledStart)} – ${notificationDate(assignment.scheduledEnd)}${hours > 0 ? ` · ${hours} uur` : ''}\n${location || 'Locatie wordt nog afgestemd'}\nOpen het actuele werkpakket vóór vertrek. Een plaatsing is geen startvrijgave.`,
    href
  };
}

function workBoardTaskSourceHash(job, taskIds) {
  if (!taskIds.length) return null;
  const tasks = new Map(job.tasks.map(task => [task.id, task]));
  const source = taskIds.map(id => {
    const task = tasks.get(id);
    if (!task) return { id, missing: true };
    return { id: task.id, title: task.title, description: task.description, status: task.status,
      plannedStart: task.plannedStart || null, plannedEnd: task.plannedEnd || null,
      durationHours: task.durationHours ?? null, data: task.data || {} };
  });
  return hash(JSON.stringify(source));
}

function migrateWorkBoard(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_board_accounts (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      salt TEXT NOT NULL, status TEXT NOT NULL, worker_id TEXT,
      data_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS work_board_positions (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), status TEXT NOT NULL,
      data_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS work_board_applications (
      id TEXT PRIMARY KEY, position_id TEXT NOT NULL REFERENCES work_board_positions(id),
      account_id TEXT NOT NULL REFERENCES work_board_accounts(id), status TEXT NOT NULL,
      assignment_id TEXT, created_at TEXT NOT NULL, UNIQUE(position_id, account_id)
    );
    CREATE INDEX IF NOT EXISTS idx_work_board_positions_job ON work_board_positions(job_id, status);
    CREATE INDEX IF NOT EXISTS idx_work_board_applications_position ON work_board_applications(position_id, status);
  `);
}

function migrateStandbyCallouts(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS standby_callouts (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id),
      assignment_id TEXT NOT NULL REFERENCES assignments(id),
      worker_id TEXT NOT NULL REFERENCES workers(id),
      unavailability_period_id TEXT NOT NULL REFERENCES worker_availability_periods(id),
      standby_period_id TEXT NOT NULL REFERENCES worker_availability_periods(id),
      status TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      approval_id TEXT REFERENCES approvals(id) ON DELETE SET NULL,
      data_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(assignment_id, worker_id, standby_period_id),
      CHECK(status IN ('offered', 'accepted', 'declined', 'pending_approval', 'placed', 'revoked', 'expired'))
    );
    CREATE INDEX IF NOT EXISTS idx_standby_callouts_worker_status ON standby_callouts(worker_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_standby_callouts_assignment_status ON standby_callouts(assignment_id, status, created_at DESC);
  `);
  require('./company-authority').installAuthorityGuards(db, ['standby_callouts']);
}

function migrateWorkBoardSessions(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_board_sessions (
      token_hash TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES work_board_accounts(id) ON DELETE CASCADE,
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      revocation_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_work_board_sessions_expiry ON work_board_sessions(expires_at, revoked_at);
    CREATE INDEX IF NOT EXISTS idx_work_board_sessions_account ON work_board_sessions(account_id, expires_at, revoked_at);
  `);
  require('./company-authority').installAuthorityGuards(db, ['work_board_sessions']);
}

function migratePositionOffers(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_board_position_offers (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL REFERENCES work_board_applications(id),
      terms_revision TEXT NOT NULL,
      return_status TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('offered', 'accepted', 'declined', 'expired', 'revoked')),
      expires_at TEXT NOT NULL,
      responded_at TEXT,
      actor TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_work_board_offers_application ON work_board_position_offers(application_id, created_at DESC);
  `);
  require('./company-authority').installAuthorityGuards(db, ['work_board_position_offers']);
}

function migrateWorkBoardNotifications(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_board_notifications (
      id TEXT PRIMARY KEY,
      worker_id TEXT NOT NULL REFERENCES workers(id),
      job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
      notification_type TEXT NOT NULL CHECK(notification_type IN ('standby_callout', 'position_offer', 'position_assigned')),
      source_id TEXT NOT NULL,
      source_hash TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      href TEXT NOT NULL,
      created_at TEXT NOT NULL,
      read_at TEXT,
      UNIQUE(worker_id, notification_type, source_id, source_hash)
    );
    CREATE INDEX IF NOT EXISTS idx_work_board_notifications_worker_created
      ON work_board_notifications(worker_id, created_at DESC, id);
    CREATE INDEX IF NOT EXISTS idx_work_board_notifications_worker_unread
      ON work_board_notifications(worker_id, read_at, created_at DESC);
  `);
  require('./company-authority').installAuthorityGuards(db, ['work_board_notifications']);
}

function migrateWorkerFieldReplyNotifications(db, { databaseMode = 'sqlite' } = {}) {
  if (databaseMode === 'postgres') {
    db.exec(`ALTER TABLE work_board_notifications DROP CONSTRAINT IF EXISTS work_board_notifications_notification_type_check;
      ALTER TABLE work_board_notifications ADD CONSTRAINT work_board_notifications_notification_type_check
      CHECK (notification_type IN ('standby_callout', 'position_offer', 'position_assigned', 'field_reply'));`);
  } else {
    const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'work_board_notifications'").get()?.sql || '';
    if (!schema.includes("'field_reply'")) {
      db.exec(`DROP INDEX IF EXISTS idx_work_board_notifications_worker_created;
        DROP INDEX IF EXISTS idx_work_board_notifications_worker_unread;
        CREATE TABLE work_board_notifications_next (
          id TEXT PRIMARY KEY,
          worker_id TEXT NOT NULL REFERENCES workers(id),
          job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
          notification_type TEXT NOT NULL CHECK(notification_type IN ('standby_callout', 'position_offer', 'position_assigned', 'field_reply')),
          source_id TEXT NOT NULL,
          source_hash TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          href TEXT NOT NULL,
          created_at TEXT NOT NULL,
          read_at TEXT,
          UNIQUE(worker_id, notification_type, source_id, source_hash)
        );
        INSERT INTO work_board_notifications_next
          (id, worker_id, job_id, notification_type, source_id, source_hash, title, body, href, created_at, read_at)
          SELECT id, worker_id, job_id, notification_type, source_id, source_hash, title, body, href, created_at, read_at
          FROM work_board_notifications;
        DROP TABLE work_board_notifications;
        ALTER TABLE work_board_notifications_next RENAME TO work_board_notifications;
        CREATE INDEX idx_work_board_notifications_worker_created
          ON work_board_notifications(worker_id, created_at DESC, id);
        CREATE INDEX idx_work_board_notifications_worker_unread
          ON work_board_notifications(worker_id, read_at, created_at DESC);`);
    }
  }
  require('./company-authority').installAuthorityGuards(db, ['work_board_notifications']);
}

class WorkBoard {
  constructor(ledger) { this.ledger = ledger; }
  workerCanAccessJob(workerId, jobId) {
    if (!workerId || !jobId) return false;
    const activeStatusSql = this.ledger.activeAssignmentStatusSql();
    return this.ledger.db.prepare(`SELECT * FROM assignments WHERE worker_id = ? AND job_id = ? AND ${activeStatusSql}`)
      .all(workerId, jobId).some(assignment => workerMatchesAssignmentTradePartner(this.ledger.db, assignment, workerId));
  }
  workerCanAccessStandbyCallout(workerId, calloutId) {
    const callout = this.ledger.db.prepare('SELECT * FROM standby_callouts WHERE id = ? AND worker_id = ?').get(calloutId, workerId);
    const assignment = callout && this.ledger.db.prepare('SELECT * FROM assignments WHERE id = ? AND job_id = ?').get(callout.assignment_id, callout.job_id);
    return Boolean(assignment && workerMatchesAssignmentTradePartner(this.ledger.db, assignment, workerId));
  }
  workerCanAccessApplication(workerId, applicationId) {
    const row = this.ledger.db.prepare(`SELECT applications.position_id FROM work_board_applications applications
      JOIN work_board_accounts accounts ON accounts.id = applications.account_id
      WHERE applications.id = ? AND accounts.worker_id = ?`).get(applicationId, workerId);
    if (!row) return false;
    const position = this.position(row.position_id);
    return !position.targetTradePartnerId || workerHasVerifiedTradePartner(this.ledger.db, workerId, position.targetTradePartnerId);
  }
  workerCanAccessNotification(workerId, notification) {
    if (notification.type === 'position_offer') {
      const source = this.ledger.db.prepare(`SELECT application_id AS applicationId FROM work_board_position_offers WHERE id = ?`).get(notification.sourceId);
      return Boolean(source && this.workerCanAccessApplication(workerId, source.applicationId));
    }
    if (notification.type === 'position_assigned') return this.workerCanAccessApplication(workerId, notification.sourceId);
    if (notification.type === 'standby_callout') return this.workerCanAccessStandbyCallout(workerId, notification.sourceId);
    return !notification.jobId || this.workerCanAccessJob(workerId, notification.jobId);
  }
  clientFieldRfiVisibleToWorker(workerId, rfi) {
    const source = rfi?.data || {};
    if (source.fieldShareEnabled !== true || !Array.isArray(source.fieldTaskIds) || !source.fieldTaskIds.length) return null;
    const approval = rfi.approvalId ? this.ledger.db.prepare('SELECT status FROM approvals WHERE id = ? AND target_type = ? AND target_id = ?')
      .get(rfi.approvalId, 'rfi_record', rfi.id) : null;
    if (!approval || approval.status !== 'approved' || !['answered', 'resolved', 'closed'].includes(rfi.status)
      || typeof rfi.response !== 'string' || !rfi.response.trim()) return null;
    if (!new (require('./client-conversation').ClientConversation)(this.ledger)
      .isCurrentRfiOrigin(source.conversationOrigin, rfi.jobId)) return false;
    try {
      const pack = new (require('./field-work-pack').FieldWorkPack)(this.ledger).snapshot(rfi.jobId, workerId);
      const visibleTaskIds = new Set(pack.do.map(task => task.id));
      return source.fieldTaskIds.some(taskId => visibleTaskIds.has(taskId)) ? pack : null;
    } catch {
      return null;
    }
  }
  notifyWorker({ workerId, jobId = null, type, sourceId, sourceVersion, title, body, href = '/work-board.html' }) {
    const sourceHash = hash(JSON.stringify(sourceVersion));
    const id = `work_notice_${hash(JSON.stringify([workerId, type, sourceId, sourceHash])).slice(0, 40)}`;
    const createdAt = new Date().toISOString();
    const result = this.ledger.db.prepare(`INSERT INTO work_board_notifications
      (id, worker_id, job_id, notification_type, source_id, source_hash, title, body, href, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(worker_id, notification_type, source_id, source_hash) DO NOTHING`)
      .run(id, workerId, jobId, type, sourceId, sourceHash, title, body, href, createdAt);
    if (result.changes) this.ledger.audit({ entityType: 'work_board_notification', entityId: id, jobId,
      action: 'retain_worker_notification', actor: 'system:work_board', after: { workerId, type, sourceId, sourceHash },
      metadata: { externalMessages: 0, externalCommitments: 0 } });
    return id;
  }
  notifyStandbyCalloutStatus(calloutId, status) {
    if (!['expired', 'revoked'].includes(status)) fail('Ongeldige oproepstatus voor melding.', 400);
    const callout = this.mapStandbyCallout(calloutId);
    if (callout.status !== status) fail('De oproepstatus is gewijzigd.', 409);
    const role = callout.snapshot?.role || 'Uitvoering';
    const window = `${notificationDate(callout.snapshot?.scheduledStart)} – ${notificationDate(callout.snapshot?.scheduledEnd)}`;
    const message = status === 'revoked'
      ? 'De oproep is ingetrokken omdat je beschikbaarheid is gewijzigd.'
      : 'De reactietermijn is verstreken; deze oproep is niet meer beschikbaar.';
    return this.notifyWorker({ workerId: callout.workerId, jobId: callout.jobId, type: 'standby_callout', sourceId: callout.id,
      sourceVersion: { status, updatedAt: callout.updatedAt },
      title: status === 'revoked' ? 'Standby-oproep ingetrokken' : 'Standby-oproep verlopen',
      body: `${callout.jobTitle} · ${role}\n${window}\n${message}`, href: '/work-board.html#callouts' });
  }
  notifyWorkerRfiResponse(rfiId, approvalId) {
    const row = this.ledger.db.prepare('SELECT * FROM rfi_records WHERE id = ?').get(rfiId);
    if (!row) return null;
    const rfi = this.ledger.mapRfi(row);
    const approval = rfi.approvalId ? this.ledger.db.prepare('SELECT id, status, resolved_at FROM approvals WHERE id = ? AND target_type = ? AND target_id = ?').get(rfi.approvalId, 'rfi_record', rfiId) : null;
    const source = rfi.data || {};
    const response = typeof rfi.response === 'string' ? rfi.response.trim() : '';
    if (rfi.approvalId !== approvalId || approval?.status !== 'approved' || !approval.resolved_at
      || !response || !['answered', 'resolved', 'closed'].includes(rfi.status)) return null;
    const job = this.ledger.requireJob(rfi.jobId);
    if (source.conversationOrigin === 'worker_work_pack' && typeof source.workerId === 'string' && source.workerId.trim()) {
      return this.notifyWorker({ workerId: source.workerId, jobId: rfi.jobId, type: 'field_reply', sourceId: rfiId,
        sourceVersion: { approvalId, resolvedAt: approval.resolved_at, response },
        title: 'Antwoord op je werkvraag',
        body: `${job.title}\n${response.slice(0, 1200)}${response.length > 1200 ? '…' : ''}`,
        href: '/work-board.html#applications' });
    }
    if (source.fieldShareEnabled !== true || !Array.isArray(source.fieldTaskIds)
      || !new (require('./client-conversation').ClientConversation)(this.ledger)
        .isCurrentRfiOrigin(source.conversationOrigin, rfi.jobId)) return null;
    const taskIds = source.fieldTaskIds.filter(id => this.ledger.db.prepare('SELECT id FROM job_tasks WHERE id = ? AND job_id = ?').get(id, rfi.jobId));
    if (!taskIds.length) return null;
    const workerIds = this.ledger.db.prepare(`SELECT DISTINCT worker_id FROM assignments WHERE job_id = ? AND ${this.ledger.activeAssignmentStatusSql()}`).all(rfi.jobId).map(row => row.worker_id);
    const notified = [];
    for (const workerId of workerIds) {
      const pack = this.clientFieldRfiVisibleToWorker(workerId, rfi);
      if (!pack) continue;
      const linkedTaskIds = taskIds.filter(id => pack.do.some(task => task.id === id));
      if (!linkedTaskIds.length) continue;
      const visibleTaskNames = linkedTaskIds.map(id => pack.do.find(task => task.id === id)?.title).filter(Boolean);
      notified.push(this.notifyWorker({ workerId, jobId: rfi.jobId, type: 'field_reply', sourceId: rfiId,
        sourceVersion: { approvalId, resolvedAt: approval.resolved_at, responseHash: hash(response), taskIds: linkedTaskIds },
        title: 'Nieuwe goedgekeurde klantinformatie',
        body: `${job.title}\nControleer nieuwe kantoor-goedgekeurde informatie in je werkpakket voor: ${visibleTaskNames.join(', ')}.`,
        href: '/work-board.html#applications' }));
    }
    return notified;
  }
  workerNotifications(accountId) {
    const account = this.account(accountId);
    if (!account.workerId) return { notifications: [], unreadCount: 0 };
    return this.workerNotificationsForWorker(account.workerId);
  }
  workerNotificationsForWorker(workerId) {
    if (typeof workerId !== 'string' || !workerId.trim()) fail('Een gekoppelde uitvoerder is vereist.', 403);
    const unreadCount = Number(this.ledger.db.prepare('SELECT COUNT(*) AS count FROM work_board_notifications WHERE worker_id = ? AND read_at IS NULL').get(workerId).count || 0);
    const notifications = this.ledger.db.prepare(`SELECT id, job_id AS jobId, notification_type AS type, source_id AS sourceId,
      title, body, href, created_at AS createdAt, read_at AS readAt
      FROM work_board_notifications WHERE worker_id = ? ORDER BY created_at DESC, id DESC LIMIT 100`).all(workerId);
    const safeNotifications = notifications.map(notification => {
      if (!this.workerCanAccessNotification(workerId, notification)) {
        return { ...notification, title: 'Toegang wordt gecontroleerd', body: 'Neem contact op met de aannemer voordat je deze opdracht opent.', href: '/work-board.html#applications' };
      }
      if (notification.type === 'field_reply') {
        const row = this.ledger.db.prepare('SELECT * FROM rfi_records WHERE id = ? AND job_id = ?').get(notification.sourceId, notification.jobId);
        const rfi = row ? this.ledger.mapRfi(row) : null;
        if (rfi?.data?.fieldShareEnabled === true && !this.clientFieldRfiVisibleToWorker(workerId, rfi)) {
          return { ...notification, title: 'Klantinformatie gewijzigd', body: 'Deze informatie is niet meer actueel. Open het huidige werkpakket en stem de actuele situatie af met kantoor.', href: '/work-board.html#applications' };
        }
      }
      if (notification.type !== 'position_offer') return notification;
      const source = this.ledger.db.prepare(`SELECT applications.position_id AS positionId, applications.status AS applicationStatus
        FROM work_board_position_offers offers
        JOIN work_board_applications applications ON applications.id = offers.application_id
        JOIN work_board_accounts accounts ON accounts.id = applications.account_id
        WHERE offers.id = ? AND accounts.worker_id = ?`).get(notification.sourceId, workerId);
      if (!source || source.applicationStatus === 'assigned') return notification;
      const position = this.position(source.positionId);
      if (position.status === 'open' && !position.privacyReviewRequired && position.workPackageCurrent) return notification;
      const closed = position.status !== 'open';
      return { ...notification, title: closed ? 'Aanbod ingetrokken' : 'Aanbod tijdelijk in hercontrole',
        body: closed ? 'De aannemer heeft de positie gesloten. Dit aanbod is niet meer beschikbaar.'
          : 'De opdrachtvoorwaarden worden opnieuw gecontroleerd. De aannemer kan na controle een nieuw aanbod klaarzetten.',
        href: '/work-board.html#applications' };
    });
    return { notifications: safeNotifications, unreadCount };
  }
  markWorkerNotificationRead(accountId, notificationId) {
    const account = this.account(accountId);
    if (!account.workerId) fail('Melding niet gevonden.', 404);
    return this.markWorkerNotificationReadForWorker(account.workerId, notificationId);
  }
  markWorkerNotificationReadForWorker(workerId, notificationId) {
    if (typeof workerId !== 'string' || !workerId.trim()) fail('Melding niet gevonden.', 404);
    return this.ledger.transaction(() => {
      const row = this.ledger.db.prepare('SELECT * FROM work_board_notifications WHERE id = ? AND worker_id = ?').get(notificationId, workerId);
      if (!row) fail('Melding niet gevonden.', 404);
      if (!row.read_at) {
        const readAt = new Date().toISOString();
        this.ledger.db.prepare('UPDATE work_board_notifications SET read_at = ? WHERE id = ? AND worker_id = ? AND read_at IS NULL').run(readAt, notificationId, workerId);
        this.ledger.audit({ entityType: 'work_board_notification', entityId: notificationId, jobId: row.job_id,
          action: 'mark_worker_notification_read', actor: `field_worker:${workerId}`,
          before: { readAt: null }, after: { readAt }, metadata: { externalCommitments: 0 } });
      }
      return this.workerNotificationsForWorker(workerId).notifications.find(item => item.id === notificationId);
    });
  }
  account(id) {
    const row = this.ledger.db.prepare('SELECT * FROM work_board_accounts WHERE id = ?').get(id);
    if (!row) fail('Profiel niet gevonden.', 404);
    const data = JSON.parse(row.data_json);
    const worker = row.auth_source === 'identity' ? this.ledger.getWorker(row.worker_id) : null;
    let verifiedTradePartner = null;
    if (data.verifiedTradePartnerId) {
      try {
        const partner = this.ledger.getTradePartner(data.verifiedTradePartnerId);
        if (partner.status === 'active' && ['subcontractor', 'both'].includes(partner.partnerType)) verifiedTradePartner = { id: partner.id, name: partner.name };
      } catch { /* A removed partner never grants access. */ }
    }
    const { tradePartnerVerificationReference: _verificationReference, tradePartnerVerifiedBy: _verifiedBy,
      tradePartnerVerifiedAt: _verifiedAt, companyNameMismatchReviewed: _mismatchReviewed, ...safeData } = data;
    return { ...safeData, verifiedTradePartner, ...(worker ? { name: worker.name, skills: worker.skills } : {}), id: row.id, email: row.auth_source === 'identity' ? null : row.email,
      ...(row.auth_source === 'identity' ? { authSource: 'identity', membershipId: row.membership_id } : {}),
      status: row.status, workerId: row.worker_id };
  }
  accounts() { return this.ledger.db.prepare('SELECT id FROM work_board_accounts ORDER BY created_at DESC LIMIT 500').all().map(row => this.account(row.id)); }
  async register(input) {
    const email = text(input.email, 'E-mail', 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Vul een geldig e-mailadres in.');
    const password = this.password(input.password);
    if (input.privacyAccepted !== true) fail('Bevestig de verwerking van je aanmeldgegevens.');
    const skills = normalizeProfileSkills(input.skills);
    const allRegions = input.allRegions === true;
    const workRegions = allRegions ? [] : normalizeWorkRegions(input.region);
    const data = { name: text(input.name, 'Naam'), phone: text(input.phone, 'Telefoon', 40),
      region: allRegions ? 'Heel Nederland' : workRegions.join(', '), workRegions, allRegions, skills,
      company: typeof input.company === 'string' ? input.company.slice(0, 200) : '', privacyAcceptedAt: new Date().toISOString() };
    const salt = randomBytes(16).toString('hex');
    const passwordHash = (await derive(password, salt, 64)).toString('hex');
    return this.ledger.transaction(() => {
      if (this.ledger.db.prepare('SELECT id FROM work_board_accounts WHERE email = ?').get(email)) fail('Registratie niet mogelijk. Gebruik inloggen of neem contact op met de aannemer.', 409);
      const id = randomUUID();
      this.ledger.db.prepare('INSERT INTO work_board_accounts (id, email, password_hash, salt, status, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, email, passwordHash, salt, 'pending', JSON.stringify(data), new Date().toISOString());
      this.ledger.audit({ entityType: 'work_board_account', entityId: id, action: 'register', actor: `applicant:${id}`, after: { status: 'pending' } });
      return this.account(id);
    });
  }
  password(value) {
    if (typeof value !== 'string' || value.length < 12 || value.length > 200) fail('Gebruik een wachtwoord van 12 tot 200 tekens.');
    return value;
  }
  async login(input) {
    const email = text(input.email, 'E-mail', 254).toLowerCase();
    const password = typeof input.password === 'string' && input.password.length <= 200 ? input.password : '';
    const row = this.ledger.db.prepare('SELECT * FROM work_board_accounts WHERE email = ?').get(email);
    const actual = await derive(password, row?.salt || 'invalid-account-constant-salt', 64);
    if (!row || row.auth_source === 'identity' || Buffer.from(row.password_hash, 'hex').length !== actual.length
        || !timingSafeEqual(actual, Buffer.from(row.password_hash, 'hex')) || row.status === 'suspended') fail('Inloggen niet gelukt.', 401);
    const token = randomBytes(32).toString('hex');
    const tokenHash = hash(token), issuedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 8 * 3600000).toISOString();
    this.ledger.transaction(() => {
      this.ledger.db.prepare('DELETE FROM work_board_sessions WHERE expires_at <= ?').run(issuedAt);
      const retentionCutoff = new Date(Date.now() - 30 * 86400000).toISOString();
      this.ledger.db.prepare('DELETE FROM work_board_sessions WHERE revoked_at IS NOT NULL AND updated_at <= ?').run(retentionCutoff);
      this.ledger.db.prepare(`UPDATE work_board_sessions SET revoked_at = ?, revocation_reason = 'replaced_by_login', updated_at = ?
        WHERE account_id = ? AND revoked_at IS NULL`).run(issuedAt, issuedAt, row.id);
      const active = Number(this.ledger.db.prepare('SELECT COUNT(*) AS count FROM work_board_sessions WHERE revoked_at IS NULL AND expires_at > ?').get(issuedAt).count);
      if (active >= 10000) fail('Probeer later opnieuw.', 503);
      this.ledger.db.prepare(`INSERT INTO work_board_sessions
        (token_hash, account_id, issued_at, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(tokenHash, row.id, issuedAt, expiresAt, issuedAt, issuedAt);
    });
    const { admission: _admission, ...account } = this.account(row.id);
    return { token, account };
  }
  updateSkills(accountId, input) {
    const skills = normalizeProfileSkills(input.skills);
    return this.ledger.transaction(() => {
      const account = this.account(accountId);
      if (account.status === 'suspended') fail('Account geblokkeerd.', 403);
      if (account.authSource === 'identity') fail('Werk je vaardigheden bij via Bedrijfstoegang; het gekoppelde personeelsprofiel wordt daar beheerd.', 409);
      this.ledger.assertDataSubjectProcessingAllowed('worker', account.workerId || account.id, 'work_board_skill_update');
      const row = this.ledger.db.prepare('SELECT data_json FROM work_board_accounts WHERE id = ?').get(accountId);
      const data = JSON.parse(row.data_json);
      if (account.status !== 'admitted') {
        const beforeSkills = account.skills;
        data.skills = skills;
        this.ledger.db.prepare('UPDATE work_board_accounts SET data_json = ? WHERE id = ?').run(JSON.stringify(data), accountId);
        this.ledger.audit({ entityType: 'work_board_account', entityId: accountId, action: 'update_applicant_declared_skills',
          actor: `applicant:${accountId}`, before: { skills: beforeSkills }, after: { skills, status: account.status } });
        return { account: this.account(accountId), reviewRequired: false };
      }
      if (!account.workerId) fail('Het gekoppelde uitvoerdersprofiel ontbreekt. Neem contact op met de aannemer.', 409);
      const previousProposal = data.pendingSkillsChange || null;
      if (JSON.stringify(account.skills) === JSON.stringify(skills) && !previousProposal) return { account, reviewRequired: false, unchanged: true };
      if (JSON.stringify(account.skills) === JSON.stringify(skills) && previousProposal) {
        delete data.pendingSkillsChange;
        this.ledger.db.prepare('UPDATE work_board_accounts SET data_json = ? WHERE id = ?').run(JSON.stringify(data), accountId);
        this.ledger.audit({ entityType: 'work_board_account', entityId: accountId, action: 'withdraw_worker_skills_change',
          actor: `field_worker:${account.workerId}`, before: { pendingSkills: previousProposal.skills }, after: { pendingSkills: null } });
        return { account: this.account(accountId), reviewRequired: false, withdrawn: true };
      }
      const proposal = { skills, submittedAt: new Date().toISOString() };
      data.pendingSkillsChange = proposal;
      this.ledger.db.prepare('UPDATE work_board_accounts SET data_json = ? WHERE id = ?').run(JSON.stringify(data), accountId);
      this.ledger.audit({ entityType: 'work_board_account', entityId: accountId, action: 'propose_worker_skills_change',
        actor: `field_worker:${account.workerId}`, before: { pendingSkills: previousProposal?.skills || null }, after: { pendingSkills: skills } });
      return { account: this.account(accountId), reviewRequired: true };
    });
  }
  updateWorkRegions(accountId, input) {
    const allRegions = input.allRegions === true;
    const regions = allRegions ? [] : normalizeWorkRegions(input.regions);
    return this.ledger.transaction(() => {
      const account = this.account(accountId);
      if (account.status === 'suspended') fail('Account geblokkeerd.', 403);
      this.ledger.assertDataSubjectProcessingAllowed('worker', account.workerId || account.id, 'work_board_region_update');
      const row = this.ledger.db.prepare('SELECT data_json FROM work_board_accounts WHERE id = ?').get(accountId);
      const data = JSON.parse(row.data_json), previous = workerRegionPreference(account);
      if (previous.allRegions === allRegions && JSON.stringify(previous.regions) === JSON.stringify(regions)) {
        return { account, unchanged: true };
      }
      data.workRegions = regions;
      data.allRegions = allRegions;
      data.region = allRegions ? 'Heel Nederland' : regions.join(', ');
      this.ledger.db.prepare('UPDATE work_board_accounts SET data_json = ? WHERE id = ?').run(JSON.stringify(data), accountId);
      this.ledger.audit({ entityType: 'work_board_account', entityId: accountId, action: 'update_work_regions',
        actor: account.workerId ? `field_worker:${account.workerId}` : `applicant:${accountId}`,
        before: previous, after: { allRegions, regions } });
      return { account: this.account(accountId), unchanged: false };
    });
  }
  reviewSkillsChange(accountId, input, actor) {
    if (!['approve', 'reject'].includes(input.decision)) fail('Kies goedkeuren of afwijzen.');
    const reference = text(input.reference, 'Referentie vaardigheidsbeoordeling', 1000);
    return this.ledger.transaction(() => {
      const account = this.account(accountId);
      if (account.authSource === 'identity') fail('Beheer dit profiel via Bedrijfstoegang.', 409);
      if (account.status === 'suspended') fail('Een geblokkeerd account kan niet worden bijgewerkt.', 409);
      if (account.status !== 'admitted' || !account.workerId) fail('Alleen een toegelaten uitvoerende kan dit profielvoorstel indienen.', 409);
      this.ledger.assertDataSubjectProcessingAllowed('worker', account.workerId, 'work_board_admission');
      const row = this.ledger.db.prepare('SELECT data_json FROM work_board_accounts WHERE id = ?').get(accountId);
      const data = JSON.parse(row.data_json), proposal = data.pendingSkillsChange;
      if (!proposal?.skills?.length) fail('Er staat geen vaardigheidsvoorstel klaar.', 409);
      const proposedSkills = normalizeProfileSkills(proposal.skills);
      if (input.decision === 'approve') {
        this.ledger.upsertWorker({ id: account.workerId, skills: proposedSkills }, { actor, audit: false });
        data.skills = proposedSkills;
      }
      delete data.pendingSkillsChange;
      this.ledger.db.prepare('UPDATE work_board_accounts SET data_json = ? WHERE id = ?').run(JSON.stringify(data), accountId);
      this.ledger.audit({ entityType: 'work_board_account', entityId: accountId,
        action: input.decision === 'approve' ? 'approve_worker_skills_change' : 'reject_worker_skills_change',
        actor, before: { skills: account.skills, proposedSkills },
        after: { skills: input.decision === 'approve' ? proposedSkills : account.skills, reference } });
      return this.account(accountId);
    });
  }
  authenticate(token) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) fail('Log in als uitvoerende.', 401);
    const now = new Date().toISOString();
    const session = this.ledger.db.prepare('SELECT account_id, expires_at FROM work_board_sessions WHERE token_hash = ? AND revoked_at IS NULL').get(hash(token));
    if (!session || session.expires_at <= now) fail('Log opnieuw in.', 401);
    const account = this.account(session.account_id);
    if (account.status === 'suspended' || account.authSource === 'identity') {
      this.revokeSession(hash(token), account.authSource === 'identity' ? 'identity_linked' : 'account_suspended', now);
      fail('Account geblokkeerd of overgezet. Meld je opnieuw aan.', 401);
    }
    return account;
  }
  revokeSession(tokenHash, reason, at = new Date().toISOString()) {
    return this.ledger.db.prepare(`UPDATE work_board_sessions SET revoked_at = ?, revocation_reason = ?, updated_at = ?
      WHERE token_hash = ? AND revoked_at IS NULL`).run(at, reason, at, tokenHash).changes > 0;
  }
  prepareIdentityLink(member, input) {
    if (member.role !== 'field_worker') return null;
    const bound = this.ledger.db.prepare('SELECT worker_id, person_id FROM work_board_accounts WHERE membership_id = ?').get(member.id);
    if (bound && (bound.worker_id !== member.workerId || bound.person_id !== member.identity.id)) fail('Een bestaande persoonlijke profielkoppeling kan niet stilzwijgend worden vervangen.', 409);
    const worker = this.ledger.getWorker(member.workerId);
    const candidates = this.ledger.db.prepare('SELECT * FROM work_board_accounts WHERE worker_id = ?').all(worker.id);
    if (candidates.length > 1 || candidates.some(row => row.auth_source === 'identity' && row.membership_id !== member.id)) fail('Dit uitvoerdersprofiel heeft een andere of onduidelijke accountkoppeling. Laat deze eerst beoordelen.', 409);
    const previous = candidates[0];
    if (previous && previous.auth_source !== 'identity'
        && (input.legacyAccountId !== previous.id || input.retireLegacyLogin !== true)) fail('Bevestig expliciet het overzetten van het bestaande werkbordaccount en het uitschakelen van de oude inloggegevens.', 409);
    return { worker, previous };
  }
  bindIdentityMember(member, input, actor) {
    if (member.role !== 'field_worker' || member.status !== 'active') return;
    return this.ledger.transaction(() => {
      const { worker, previous } = this.prepareIdentityLink(member, input);
      const id = previous?.id || randomUUID();
      const data = { ...(previous ? JSON.parse(previous.data_json) : {}), name: worker.name, phone: worker.phone || '',
        skills: worker.skills, region: worker.city || '', admission: { actor, reference: member.reference, at: new Date().toISOString() } };
      if (previous) this.ledger.db.prepare("UPDATE work_board_accounts SET auth_source = 'identity', membership_id = ?, person_id = ?, password_hash = '', salt = '', status = 'admitted', data_json = ? WHERE id = ?")
        .run(member.id, member.identity.id, JSON.stringify(data), id);
      else this.ledger.db.prepare(`INSERT INTO work_board_accounts (id, email, password_hash, salt, status, worker_id, data_json, created_at, auth_source, membership_id, person_id)
        VALUES (?, ?, '', '', 'admitted', ?, ?, ?, 'identity', ?, ?)`)
        .run(id, `identity:${member.id}`, worker.id, JSON.stringify(data), new Date().toISOString(), member.id, member.identity.id);
      if (previous) {
        const timestamp = new Date().toISOString();
        this.ledger.db.prepare(`UPDATE work_board_sessions SET revoked_at = ?, revocation_reason = 'identity_linked', updated_at = ?
          WHERE account_id = ? AND revoked_at IS NULL`).run(timestamp, timestamp, id);
      }
      this.ledger.audit({ entityType: 'work_board_account', entityId: id, action: 'bind_reviewed_identity', actor,
        after: { personId: member.identity.id, membershipId: member.id, workerId: worker.id, legacyLoginRetired: Boolean(previous), reference: member.reference } });
      return this.account(id);
    });
  }
  identityAccount(operator) {
    if (!operator?.authenticated || operator.source !== 'identity' || operator.role !== 'field_worker') fail('Meld je aan als toegelaten uitvoerende.', 401);
    const row = this.ledger.db.prepare("SELECT id FROM work_board_accounts WHERE membership_id = ? AND person_id = ? AND worker_id = ? AND auth_source = 'identity' AND status = 'admitted'")
      .get(operator.membershipId, operator.personId, operator.scope.workerId);
    if (!row) fail('De beoordeelde uitvoerderskoppeling ontbreekt.', 403);
    const account = this.account(row.id), worker = this.ledger.getWorker(account.workerId);
    return { ...account, name: worker.name, skills: worker.skills };
  }
  logout(token) { return typeof token === 'string' ? this.revokeSession(hash(token), 'worker_logout') : false; }
  admit(id, input, actor) {
    const reference = text(input.reference, 'Referentie toelatingscontrole', 1000);
    return this.ledger.transaction(() => {
      const account = this.account(id);
      if (account.authSource === 'identity') fail('Beheer deze toelating via Bedrijfstoegang.', 409);
      const tradePartnerId = input.tradePartnerId ? text(input.tradePartnerId, 'Onderaannemersbedrijf', 150) : null;
      const partner = tradePartnerId ? this.ledger.getTradePartner(tradePartnerId) : null;
      if (partner && (partner.status !== 'active' || !['subcontractor', 'both'].includes(partner.partnerType))) fail('Kies een actief onderaannemersbedrijf uit het register.', 409);
      const companyNameMismatch = Boolean(partner && account.company
        && account.company.trim().toLocaleLowerCase() !== partner.name.trim().toLocaleLowerCase());
      if (companyNameMismatch && input.companyMismatchReviewed !== true) {
        fail('De opgegeven bedrijfsnaam wijkt af van het register. Bevestig dat je de bedrijfsidentiteit apart hebt gecontroleerd.', 409);
      }
      if (account.status === 'admitted' && input.tradePartnerId === undefined) return account;
      if (account.status === 'admitted' && !partner) fail('Kies een onderaannemersbedrijf om de bestaande bedrijfsverificatie bij te werken.', 400);
      const pendingPrivacyDecision = this.ledger.db.prepare(`
        SELECT id FROM data_subject_requests
        WHERE subject_type = 'worker' AND subject_id = ? AND status = 'pending_approval'
        ORDER BY created_at DESC LIMIT 1
      `).get(account.workerId || account.id);
      if (pendingPrivacyDecision) fail('Rond eerst de lopende goedkeuring van je privacyverzoek af.', 409);
      this.ledger.assertDataSubjectProcessingAllowed('worker', account.workerId || account.id, 'work_board_admission');
      const worker = account.workerId ? this.ledger.getWorker(account.workerId) : this.ledger.upsertWorker({ id: account.id, name: account.name, email: account.email, phone: account.phone, skills: account.skills, role: account.skills[0], status: 'available', data: account.privacy ? { privacy: account.privacy } : {} }, { actor, id: account.id });
      const data = { name: account.name, phone: account.phone, skills: account.skills, region: account.region, company: account.company,
        privacyAcceptedAt: account.privacyAcceptedAt, ...(account.privacy ? { privacy: account.privacy } : {}),
        ...(partner ? { verifiedTradePartnerId: partner.id, tradePartnerVerificationReference: reference,
          tradePartnerVerifiedBy: actor, tradePartnerVerifiedAt: new Date().toISOString(),
          companyNameMismatchReviewed: companyNameMismatch } : {}),
        admission: { reference, actor, at: new Date().toISOString() } };
      this.ledger.db.prepare('UPDATE work_board_accounts SET status = ?, worker_id = ?, data_json = ? WHERE id = ?').run('admitted', worker.id, JSON.stringify(data), id);
      this.ledger.audit({ entityType: 'work_board_account', entityId: id, action: partner ? 'admit_and_verify_trade_partner' : 'admit', actor,
        after: { workerId: worker.id, reference, verifiedTradePartnerId: partner?.id || null, companyNameMismatchReviewed: companyNameMismatch } });
      return this.account(id);
    });
  }
  suspend(id, actor) {
    if (this.account(id).authSource === 'identity') fail('Beheer deze toelating via Bedrijfstoegang.', 409);
    this.ledger.transaction(() => {
      this.ledger.db.prepare('UPDATE work_board_accounts SET status = ? WHERE id = ?').run('suspended', id);
      if (this.account(id).workerId) this.ledger.invalidateWorkerStandbyCallouts(this.account(id).workerId, {
        actor, reason: 'De uitvoerdersaccount is opgeschort; de oproep moet opnieuw worden beoordeeld.'
      });
      const timestamp = new Date().toISOString();
      this.ledger.db.prepare(`UPDATE work_board_sessions SET revoked_at = ?, revocation_reason = 'account_suspended', updated_at = ?
        WHERE account_id = ? AND revoked_at IS NULL`).run(timestamp, timestamp, id);
      this.ledger.audit({ entityType: 'work_board_account', entityId: id, action: 'suspend', actor, after: { status: 'suspended' } });
    });
  }
  verifiedMissingCheckinRecovery(assignment, availabilityPeriodId, now = Date.now()) {
    if (!assignment?.scheduled_start || !assignment?.scheduled_end
      || now < Date.parse(assignment.scheduled_start) || now >= Date.parse(assignment.scheduled_end)) return false;
    const row = this.ledger.db.prepare(`SELECT starts_at, ends_at, status, data_json FROM worker_availability_periods
      WHERE id = ? AND worker_id = ? AND period_type = 'unavailable'`).get(availabilityPeriodId, assignment.worker_id);
    if (!row || !['active', 'pending_cancellation'].includes(row.status)
      || row.starts_at !== assignment.scheduled_start || row.ends_at !== assignment.scheduled_end) return false;
    let data;
    try { data = JSON.parse(row.data_json || '{}'); } catch { return false; }
    return data.source === 'office_confirmed_missing_checkin'
      && /^[a-f0-9]{64}$/i.test(data.sourceReferenceHash || '');
  }
  standbyCalloutCandidates(jobId, assignmentId, { noticeAt = new Date().toISOString(), availabilityPeriodId = null, excludeCalloutId = null, excludeOpenOverlappingCallouts = false } = {}) {
    const assignment = this.ledger.db.prepare('SELECT * FROM assignments WHERE id = ? AND job_id = ?').get(assignmentId, jobId);
    if (!assignment) fail('Opdrachttoewijzing niet gevonden.', 404);
    const workerIds = this.ledger.db.prepare("SELECT DISTINCT worker_id FROM worker_availability_periods WHERE period_type = 'standby' AND status = 'active'").all().map(row => row.worker_id);
    const standby = this.ledger.findWorkerStandbyConflicts({ workerIds,
      scheduledStart: assignment.scheduled_start,
      scheduledEnd: assignment.scheduled_end
    });
    return standby.flatMap(period => {
      const account = this.ledger.db.prepare("SELECT id, status FROM work_board_accounts WHERE worker_id = ? AND status = 'admitted' LIMIT 1").get(period.workerId);
      if (!account) return [];
      if (excludeOpenOverlappingCallouts) {
        const openCallouts = this.ledger.db.prepare(`SELECT assignments.scheduled_start AS scheduledStart, assignments.scheduled_end AS scheduledEnd
          FROM standby_callouts callouts JOIN assignments ON assignments.id = callouts.assignment_id
          WHERE callouts.worker_id = ? AND callouts.id <> COALESCE(?, '')
            AND (callouts.status IN ('accepted', 'pending_approval') OR (callouts.status = 'offered' AND callouts.expires_at > ?))`)
          .all(period.workerId, excludeCalloutId, new Date().toISOString());
        if (openCallouts.some(callout => this.ledger.assignmentWindowsOverlap(
          assignment.scheduled_start, assignment.scheduled_end, callout.scheduledStart, callout.scheduledEnd
        ))) return [];
      }
      const candidate = this.ledger.workerReplacementCandidates(assignment, { allowStandbyWorkerId: period.workerId })
        .find(item => item.worker.id === period.workerId);
      if (!candidate) return [];
      const noticeHours = Math.max(0, Number(period.minimumNoticeHours) || 0);
      const missedCheckinRecovery = availabilityPeriodId
        && this.verifiedMissingCheckinRecovery(assignment, availabilityPeriodId);
      if (Date.parse(assignment.scheduled_start) - Date.parse(noticeAt) < noticeHours * 3600000
        && !(missedCheckinRecovery && noticeHours === 0)) return [];
      return [{ ...candidate.worker, standbyPeriodId: period.id, standbyStartsAt: period.startsAt,
        standbyEndsAt: period.endsAt, minimumNoticeHours: noticeHours }];
    });
  }
  createStandbyCallout(jobId, assignmentId, input, actor) {
    const workerId = text(input.workerId, 'Uitvoerende', 200);
    const standbyPeriodId = text(input.standbyPeriodId, 'Standby-periode', 200);
    const reason = text(input.reason, 'Toelichting oproep', 1000);
    const expiresAtMs = Date.parse(input.expiresAt);
    return this.ledger.transaction(() => {
      const assignment = this.ledger.db.prepare('SELECT * FROM assignments WHERE id = ? AND job_id = ?').get(assignmentId, jobId);
      if (!assignment) fail('Opdrachttoewijzing niet gevonden.', 404);
      const unavailabilityPeriodId = text(input.availabilityPeriodId, 'Verhinderingsperiode', 200);
      const unavailable = this.ledger.db.prepare("SELECT * FROM worker_availability_periods WHERE id = ? AND worker_id = ? AND status IN ('active', 'pending_cancellation')")
        .get(unavailabilityPeriodId, assignment.worker_id);
      if (!unavailable || !this.ledger.workerAvailabilityPeriodOverlapsAssignment({ workerId: assignment.worker_id,
        periodId: unavailable.id, scheduledStart: assignment.scheduled_start, scheduledEnd: assignment.scheduled_end })) fail('De gemelde verhindering overlapt niet meer met deze opdracht.', 409);
      const now = Date.now(), shiftStarted = Date.parse(assignment.scheduled_start) <= now;
      const missedCheckinRecovery = this.verifiedMissingCheckinRecovery(assignment, unavailabilityPeriodId, now);
      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now
        || (shiftStarted
          ? !missedCheckinRecovery || expiresAtMs > Date.parse(assignment.scheduled_end)
          : expiresAtMs > Date.parse(assignment.scheduled_start))) {
        fail(shiftStarted
          ? 'Een oproep tijdens een lopende dienst vereist een actuele, kantoorbevestigde check-inuitval en moet vóór het einde van de dienst verlopen.'
          : 'De oproep moet verlopen vóór de start van de opdracht.', 400);
      }
      const prior = this.ledger.db.prepare('SELECT * FROM standby_callouts WHERE assignment_id = ? AND worker_id = ? AND standby_period_id = ?').get(assignmentId, workerId, standbyPeriodId);
      if (prior) {
        if (prior.status === 'offered' || prior.status === 'accepted' || prior.status === 'pending_approval' || prior.status === 'placed') return this.mapStandbyCallout(prior.id);
        fail('Er bestaat al een afgeronde oproep voor deze uitvoerende en standby-periode.', 409);
      }
      const candidate = this.standbyCalloutCandidates(jobId, assignmentId, { availabilityPeriodId: unavailabilityPeriodId })
        .find(item => item.id === workerId && item.standbyPeriodId === standbyPeriodId);
      if (!candidate) fail('Deze uitvoerende voldoet niet meer aan de actuele beschikbaarheids-, vak- en kwalificatiecontroles.', 409);
      const id = randomUUID(), timestamp = new Date().toISOString();
      const job = this.ledger.getJobDetail(jobId, { includeAudit: false });
      const snapshot = { assignmentId, workerId, role: assignment.role, scheduledStart: assignment.scheduled_start, scheduledEnd: assignment.scheduled_end,
        assignmentUpdatedAt: assignment.updated_at, minimumNoticeHours: candidate.minimumNoticeHours,
        requiredTradePartnerId: assignmentTradePartnerRequirement(this.ledger.db, assignment).requiredTradePartnerId };
      this.ledger.db.prepare(`INSERT INTO standby_callouts
        (id, job_id, assignment_id, worker_id, unavailability_period_id, standby_period_id, status, expires_at, data_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'offered', ?, ?, ?, ?)`)
        .run(id, jobId, assignmentId, workerId, unavailabilityPeriodId, standbyPeriodId, new Date(expiresAtMs).toISOString(), JSON.stringify({ reason, snapshot, jobTitle: job.title, city: job.city || '' }), timestamp, timestamp);
      this.ledger.audit({ entityType: 'standby_callout', entityId: id, jobId, action: 'offer_standby_callout', actor,
        after: { workerId, assignmentId, status: 'offered', expiresAt: new Date(expiresAtMs).toISOString() }, metadata: { externalMessages: 0, externalCommitments: 0 } });
      this.notifyWorker({ workerId, jobId, type: 'standby_callout', sourceId: id,
        sourceVersion: { status: 'offered', expiresAt: new Date(expiresAtMs).toISOString() },
        title: 'Stand-byoproep ontvangen',
        body: `${job.title} · ${assignment.role}\n${notificationDate(assignment.scheduled_start)} – ${notificationDate(assignment.scheduled_end)}\n${job.city || 'Locatie wordt nog afgestemd'}\nReageer vóór ${notificationDate(new Date(expiresAtMs).toISOString())}.`,
        href: '/work-board.html#callouts' });
      return this.mapStandbyCallout(id);
    });
  }
  mapStandbyCallout(id) {
    const row = this.ledger.db.prepare('SELECT * FROM standby_callouts WHERE id = ?').get(id);
    if (!row) fail('Oproep niet gevonden.', 404);
    return { id: row.id, jobId: row.job_id, assignmentId: row.assignment_id, workerId: row.worker_id,
      availabilityPeriodId: row.unavailability_period_id, standbyPeriodId: row.standby_period_id,
      status: row.status, expiresAt: row.expires_at, approvalId: row.approval_id, ...JSON.parse(row.data_json), createdAt: row.created_at, updatedAt: row.updated_at };
  }
  workerStandbyCallouts(workerId) {
    return this.ledger.transaction(() => {
      const rows = this.ledger.db.prepare("SELECT id FROM standby_callouts WHERE worker_id = ? ORDER BY created_at DESC LIMIT 100").all(workerId);
      const timestamp = new Date().toISOString();
      for (const row of rows) {
        const expired = this.ledger.db.prepare("UPDATE standby_callouts SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'offered' AND expires_at <= ?")
          .run(timestamp, row.id, timestamp);
        if (expired.changes) {
          const callout = this.mapStandbyCallout(row.id);
          this.ledger.audit({ entityType: 'standby_callout', entityId: row.id, action: 'expire_standby_callout', actor: 'system:work_board', after: { status: 'expired' }, metadata: { externalCommitments: 0 } });
          this.notifyStandbyCalloutStatus(callout.id, 'expired');
        }
      }
      return rows.map(row => {
        const callout = this.mapStandbyCallout(row.id);
        return this.workerCanAccessStandbyCallout(workerId, callout.id) ? callout : {
          id: callout.id, status: callout.status, expiresAt: callout.expiresAt,
          createdAt: callout.createdAt, updatedAt: callout.updatedAt, accessReviewRequired: true
        };
      });
    });
  }
  replacementOpportunities(jobId) {
    const job = this.ledger.getJobDetail(jobId, { includeAudit: false });
    return job.assignments.filter(assignment => ['planned', 'scheduled', 'active', 'in_progress', 'pending_approval'].includes(assignment.status))
      .flatMap(assignment => {
        const unavailable = this.ledger.findWorkerAvailabilityConflicts({ workerId: assignment.workerId,
          scheduledStart: assignment.scheduledStart, scheduledEnd: assignment.scheduledEnd });
        if (!unavailable.length) return [];
        return unavailable.map(period => ({ assignmentId: assignment.id, assignmentStatus: assignment.status,
          jobId, jobTitle: job.title, originalWorkerName: assignment.workerName || assignment.workerId,
          role: assignment.role, scheduledStart: assignment.scheduledStart, scheduledEnd: assignment.scheduledEnd,
          availabilityPeriodId: period.id, availabilityStartsAt: period.startsAt, availabilityEndsAt: period.endsAt,
          availabilityReturnUnknown: period.returnUnknown, availabilityStatus: period.status,
          candidates: this.standbyCalloutCandidates(jobId, assignment.id, { availabilityPeriodId: period.id }),
          standbyAutomation: this.standbyCalloutAutomationStatus(jobId, assignment.id, period.id) }));
      });
  }
  standbyCalloutAutomationPosition(jobId, assignmentId) {
    const row = this.ledger.db.prepare('SELECT data_json FROM assignments WHERE id = ? AND job_id = ?').get(assignmentId, jobId);
    if (!row) return null;
    let assignmentData;
    try { assignmentData = JSON.parse(row.data_json || '{}'); } catch { return null; }
    if (!assignmentData.workBoardPositionId) return null;
    try {
      const position = this.position(assignmentData.workBoardPositionId);
      return position.automaticStandbyCallouts === true ? position : null;
    } catch (error) {
      if (error.statusCode) return null;
      throw error;
    }
  }
  standbyCalloutAutomationStatus(jobId, assignmentId, availabilityPeriodId) {
    const position = this.standbyCalloutAutomationPosition(jobId, assignmentId);
    if (!position) return { status: 'manual' };
    if (position.privacyReviewRequired || !position.workPackageCurrent) return { status: 'owner_review', reason: 'De vrijgegeven werkbron is gewijzigd of vraagt om een privacycontrole.' };
    const active = this.ledger.db.prepare(`SELECT status, expires_at FROM standby_callouts
      WHERE assignment_id = ? AND status IN ('offered','accepted','pending_approval','placed')
      ORDER BY created_at DESC LIMIT 1`).get(assignmentId);
    if (active?.status === 'accepted') return { status: 'worker_accepted' };
    if (active?.status === 'pending_approval') return { status: 'replacement_pending' };
    if (active?.status === 'placed') return { status: 'replacement_placed' };
    if (active?.status === 'offered' && active.expires_at > new Date().toISOString()) {
      return { status: 'waiting_for_response', expiresAt: active.expires_at };
    }
    if (active) return { status: 'owner_review', reason: 'De eerdere oproep is verlopen; controleer de vervolgactie.' };
    const previous = this.ledger.db.prepare(`SELECT worker_id, status FROM standby_callouts
      WHERE assignment_id = ? AND unavailability_period_id = ? ORDER BY created_at, id`).all(assignmentId, availabilityPeriodId);
    if (previous.some(callout => !['declined', 'expired'].includes(callout.status))) {
      return { status: 'owner_review', reason: 'Een eerdere oproep vraagt om beoordeling; er wordt geen volgende uitvoerende benaderd.' };
    }
    if (previous.length >= MAX_AUTOMATED_STANDBY_CALLOUTS) {
      return { status: 'owner_review', reason: 'Het maximum van drie stand-byoproepen is bereikt; beoordeel zelf de vervolgstap.' };
    }
    const attempted = new Set(previous.map(callout => callout.worker_id));
    const candidate = this.standbyCalloutCandidates(jobId, assignmentId, {
      availabilityPeriodId, excludeOpenOverlappingCallouts: true
    })
      .find(item => !attempted.has(item.id));
    return candidate
      ? { status: 'ready', workerId: candidate.id, standbyPeriodId: candidate.standbyPeriodId, waitlistPosition: previous.length + 1 }
      : { status: 'owner_review', reason: 'Er is geen actueel geschikte stand-by-uitvoerder met voldoende aankondigingstijd.' };
  }
  expireDueStandbyCallouts(now = new Date().toISOString()) {
    const due = this.ledger.db.prepare(`SELECT id, job_id FROM standby_callouts
      WHERE status = 'offered' AND expires_at <= ? ORDER BY expires_at, id LIMIT 500`).all(now);
    let expired = 0;
    for (const row of due) {
      const changed = this.ledger.transaction(() => {
        const result = this.ledger.db.prepare(`UPDATE standby_callouts SET status = 'expired', updated_at = ?
          WHERE id = ? AND status = 'offered' AND expires_at <= ?`).run(now, row.id, now);
        if (!result.changes) return false;
        this.ledger.audit({ entityType: 'standby_callout', entityId: row.id, jobId: row.job_id,
          action: 'expire_standby_callout', actor: 'system:work_board', after: { status: 'expired' },
          metadata: { externalCommitments: 0 } });
        this.notifyStandbyCalloutStatus(row.id, 'expired');
        return true;
      });
      if (changed) expired += 1;
    }
    return expired;
  }
  runStandbyCalloutSweep(options = {}) {
    const expired = this.expireDueStandbyCallouts(options.now || new Date().toISOString());
    const jobIds = this.ledger.db.prepare(`SELECT DISTINCT assignments.job_id FROM assignments
      JOIN jobs ON jobs.id = assignments.job_id
      WHERE assignments.status IN ('planned','scheduled','active','in_progress','pending_approval')
        AND jobs.status NOT IN ('archived','cancelled','completed') ORDER BY assignments.job_id LIMIT 500`).all().map(row => row.job_id);
    const seen = new Set(), results = [];
    for (const jobId of jobIds) {
      for (const opportunity of this.replacementOpportunities(jobId)) {
        if (seen.has(opportunity.assignmentId)) continue;
        seen.add(opportunity.assignmentId);
        const status = this.standbyCalloutAutomationStatus(jobId, opportunity.assignmentId, opportunity.availabilityPeriodId);
        if (status.status !== 'ready') {
          if (status.status !== 'manual') results.push({ assignmentId: opportunity.assignmentId, status: status.status, reason: status.reason || null });
          continue;
        }
        const now = Date.now();
        const shiftStarted = Date.parse(opportunity.scheduledStart) <= now;
        const responseLimit = shiftStarted ? Math.min(now + 30 * 60000, Date.parse(opportunity.scheduledEnd) - 60000)
          : Math.min(now + 24 * 3600000, Date.parse(opportunity.scheduledStart) - 60000);
        const expiration = new Date(responseLimit).toISOString();
        if (responseLimit <= now + 15 * 60000) {
          results.push({ assignmentId: opportunity.assignmentId, status: 'owner_review', reason: shiftStarted
            ? 'Er is onvoldoende tijd over in de dienst voor een redelijke reactietermijn.'
            : 'Er is onvoldoende tijd voor een redelijke reactietermijn vóór de dienst.' });
          continue;
        }
        try {
          const callout = this.createStandbyCallout(jobId, opportunity.assignmentId, {
            workerId: status.workerId, standbyPeriodId: status.standbyPeriodId,
            availabilityPeriodId: opportunity.availabilityPeriodId,
            reason: 'Een gewijzigde beschikbaarheid raakt deze ingeplande dienst. Bekijk de tijd, locatie en opdracht voordat je reageert.',
            expiresAt: expiration
          }, options.actor || 'durable_scheduler');
          results.push({ assignmentId: opportunity.assignmentId, status: callout.status === 'offered' ? 'offered' : callout.status, calloutId: callout.id });
        } catch (error) {
          if (error.statusCode) results.push({ assignmentId: opportunity.assignmentId, status: 'owner_review', reason: error.message });
          else throw error;
        }
      }
    }
    return { scannedJobs: jobIds.length, expired, offered: results.filter(item => item.status === 'offered').length,
      reviewRequired: results.filter(item => item.status === 'owner_review').length, results };
  }
  respondToStandbyCallout(workerId, id, decision) {
    if (!['accept', 'decline'].includes(decision)) fail('Kies accepteren of afwijzen.');
    return this.ledger.transaction(() => {
      const row = this.ledger.db.prepare('SELECT * FROM standby_callouts WHERE id = ? AND worker_id = ?').get(id, workerId);
      if (!row) fail('Oproep niet gevonden.', 404);
      if (row.status === (decision === 'accept' ? 'accepted' : 'declined')) return this.mapStandbyCallout(id);
      if (row.status !== 'offered' || Date.parse(row.expires_at) <= Date.now()) fail('Deze oproep is niet meer beschikbaar.', 409);
      if (decision === 'decline') {
        const timestamp = new Date().toISOString();
        this.ledger.db.prepare('UPDATE standby_callouts SET status = ?, updated_at = ? WHERE id = ? AND status = ?').run('declined', timestamp, id, 'offered');
        this.ledger.audit({ entityType: 'standby_callout', entityId: id, jobId: row.job_id, action: 'worker_decline_standby_callout', actor: `field_worker:${workerId}`,
          after: { status: 'declined' }, metadata: { externalCommitments: 0 } });
        return this.mapStandbyCallout(id);
      }
      const assignment = this.ledger.db.prepare('SELECT * FROM assignments WHERE id = ?').get(row.assignment_id);
      const standby = this.ledger.db.prepare("SELECT * FROM worker_availability_periods WHERE id = ? AND worker_id = ? AND period_type = 'standby' AND status = 'active'").get(row.standby_period_id, workerId);
      const unavailable = assignment && this.ledger.db.prepare("SELECT * FROM worker_availability_periods WHERE id = ? AND worker_id = ? AND status IN ('active', 'pending_cancellation')")
        .get(row.unavailability_period_id, assignment.worker_id);
      if (!assignment || !standby || !unavailable || assignment.updated_at !== JSON.parse(row.data_json).snapshot.assignmentUpdatedAt
          || !this.ledger.workerAvailabilityPeriodOverlapsAssignment({ workerId: assignment.worker_id, periodId: unavailable.id,
            scheduledStart: assignment.scheduled_start, scheduledEnd: assignment.scheduled_end })
          || !this.ledger.workerAvailabilityPeriodOverlapsAssignment({ workerId, periodId: standby.id, periodType: 'standby',
            scheduledStart: assignment.scheduled_start, scheduledEnd: assignment.scheduled_end })
          || Number(JSON.parse(standby.data_json).minimumNoticeHours || 0) !== Number(JSON.parse(row.data_json).snapshot.minimumNoticeHours || 0)
          || !this.standbyCalloutCandidates(row.job_id, row.assignment_id, {
            noticeAt: row.created_at, availabilityPeriodId: row.unavailability_period_id, excludeCalloutId: id
          }).some(candidate => candidate.id === workerId && candidate.standbyPeriodId === row.standby_period_id)) {
        fail('De opdracht, beschikbaarheid, vak of kwalificaties zijn gewijzigd; vraag de aannemer om een nieuwe oproep.', 409);
      }
      const otherAccepted = this.ledger.db.prepare("SELECT id, assignment_id FROM standby_callouts WHERE worker_id = ? AND id <> ? AND status IN ('accepted', 'pending_approval')").all(workerId, id);
      const overlapping = otherAccepted.some(other => {
        const otherAssignment = this.ledger.db.prepare('SELECT scheduled_start, scheduled_end FROM assignments WHERE id = ?').get(other.assignment_id);
        return otherAssignment && this.ledger.assignmentWindowsOverlap(assignment.scheduled_start, assignment.scheduled_end,
          otherAssignment.scheduled_start, otherAssignment.scheduled_end);
      });
      if (overlapping) fail('Je hebt al een geaccepteerde oproep voor een overlappende periode. Vraag de aannemer om de oproepen af te stemmen.', 409);
      const status = 'accepted', timestamp = new Date().toISOString();
      this.ledger.db.prepare('UPDATE standby_callouts SET status = ?, updated_at = ? WHERE id = ? AND status = ?').run(status, timestamp, id, 'offered');
      this.ledger.audit({ entityType: 'standby_callout', entityId: id, jobId: row.job_id, action: `worker_${decision}_standby_callout`, actor: `field_worker:${workerId}`,
        after: { status }, metadata: { externalCommitments: 0 } });
      return this.mapStandbyCallout(id);
    });
  }
  position(id) {
    const row = this.ledger.db.prepare('SELECT * FROM work_board_positions WHERE id = ?').get(id);
    if (!row) fail('Positie niet gevonden.', 404);
    const filled = Number(this.ledger.db.prepare(`SELECT COUNT(*) AS n FROM work_board_applications applications
      JOIN assignments ON assignments.id = applications.assignment_id
      WHERE applications.position_id = ? AND applications.status = 'assigned'
        AND assignments.status NOT IN ('released', 'cancelled', 'completed', 'closed', 'rejected', 'declined', 'offline')`).get(id).n);
    const data = JSON.parse(row.data_json);
    const { revision, publishedBy: _publishedBy, draftedBy: _draftedBy, ...terms } = data;
    if (hash(JSON.stringify(terms)) !== revision) fail('De vastgelegde positievoorwaarden konden niet worden geverifieerd.', 409);
    let workPackageCurrent = true;
    if (!data.workPackageId && new (require('./work-balance').WorkBalance)(this.ledger).enabled(row.job_id)) workPackageCurrent = false;
    if (data.workPackageId) {
      try { workPackageCurrent = new (require('./work-context').WorkContext)(this.ledger).packageBasis(row.job_id, data.workPackageId).sourceHash === data.workPackageSourceHash; }
      catch (error) { if (!error.statusCode) throw error; workPackageCurrent = false; }
    }
    const job = this.ledger.getJobDetail(row.job_id, { includeAudit: false });
    const privacyWarnings = publicPositionPrivacyWarnings(job, data);
    const sourceTasksCurrent = !data.sourceTaskIds?.length
      || Boolean(data.sourceTasksHash && workBoardTaskSourceHash(job, data.sourceTaskIds) === data.sourceTasksHash);
    const missingFields = row.status === 'draft'
      ? [['title', 'openbare titel'], ['role', 'vakgebied'], ['city', 'plaats'], ['startsAt', 'startmoment'], ['endsAt', 'eindmoment'],
        ['hours', 'arbeidsduur per persoon'], ['capacity', 'aantal personen'], ['rate', 'uurvergoeding'], ['description', 'werkzaamheden'],
        ['materials', 'materialen en levering'], ['equipment', 'gereedschap'], ['prerequisites', 'startvoorwaarden']]
        .filter(([field]) => data[field] === null || data[field] === undefined || data[field] === '')
        .map(([, label]) => label)
      : [];
    return { id: row.id, jobId: row.job_id, status: row.status, ...data, filled, missingFields,
      privacyWarnings, privacyReviewRequired: privacyWarnings.length > 0,
      sourceTasksCurrent, workPackageCurrent: workPackageCurrent && sourceTasksCurrent };
  }
  waitlistAutomationStatus(position) {
    if (position.waitlistOfferPolicy !== 'automatic_once') return { status: 'manual' };
    const activeOffer = this.ledger.db.prepare(`SELECT offers.expires_at FROM work_board_position_offers offers
      JOIN work_board_applications applications ON applications.id = offers.application_id
      WHERE applications.position_id = ? AND offers.status = 'offered' AND offers.expires_at > ?
      ORDER BY offers.created_at DESC LIMIT 1`).get(position.id, new Date().toISOString());
    if (activeOffer) return { status: 'waiting_for_response', expiresAt: activeOffer.expires_at };
    const first = this.ledger.db.prepare(`SELECT applications.*, accounts.status AS account_status
      FROM work_board_applications applications JOIN work_board_accounts accounts ON accounts.id = applications.account_id
      WHERE applications.position_id = ? AND applications.status = 'waitlisted'
      ORDER BY applications.created_at, applications.id LIMIT 1`).get(position.id);
    if (!first) return { status: 'waiting_for_applicants' };
    if (position.status !== 'open' || !position.workPackageCurrent || position.privacyReviewRequired) return { status: 'owner_review' };
    if (position.filled >= position.capacity) return { status: 'waiting_for_vacancy', waitlistPosition: 1 };
    const pending = this.ledger.db.prepare("SELECT id, expires_at, return_status FROM work_board_position_offers WHERE application_id = ? AND status = 'offered' ORDER BY created_at DESC LIMIT 1").get(first.id);
    if (pending && pending.expires_at > new Date().toISOString()) return { status: 'waiting_for_response', waitlistPosition: 1, expiresAt: pending.expires_at };
    const prior = this.ledger.db.prepare('SELECT status FROM work_board_position_offers WHERE application_id = ? ORDER BY created_at DESC LIMIT 1').get(first.id);
    if (prior) return { status: 'owner_review', waitlistPosition: 1,
      reason: prior.status === 'declined' ? 'De eerste kandidaat heeft het aanbod geweigerd; beoordeel zelf de volgende stap.'
        : prior.status === 'expired' ? 'Het aanbod aan de eerste kandidaat is verlopen; beoordeel zelf de volgende stap.'
          : 'De eerste kandidaat heeft eerder al een aanbod ontvangen; beoordeling door de aannemer is nodig.' };
    if (first.account_status !== 'admitted') return { status: 'owner_review', waitlistPosition: 1, reason: 'De eerste kandidaat moet eerst door de aannemer worden toegelaten.' };
    try {
      this.placementPreflight(first);
      return { status: 'ready', waitlistPosition: 1, applicationId: first.id };
    } catch (error) {
      return { status: 'owner_review', waitlistPosition: 1, reason: error.message };
    }
  }
  offerNextWaitlisted(positionId, options = {}) {
    return this.ledger.transaction(() => {
      const position = this.position(positionId);
      if (position.waitlistOfferPolicy !== 'automatic_once') return { status: 'manual' };
      new (require('./work-context').WorkContext)(this.ledger).lock(position.jobId);
      this.ledger.db.prepare('UPDATE work_board_positions SET status = status WHERE id = ?').run(positionId);
      const current = this.position(positionId);
      const expiredOffers = this.ledger.db.prepare(`SELECT offers.id, offers.application_id, offers.return_status
        FROM work_board_position_offers offers JOIN work_board_applications applications ON applications.id = offers.application_id
        WHERE applications.position_id = ? AND offers.status = 'offered' AND offers.expires_at <= ?`).all(positionId, new Date().toISOString());
      for (const offer of expiredOffers) {
        const now = new Date().toISOString();
        this.ledger.db.prepare("UPDATE work_board_position_offers SET status = 'expired', responded_at = ? WHERE id = ? AND status = 'offered'").run(now, offer.id);
        this.ledger.db.prepare("UPDATE work_board_applications SET status = ? WHERE id = ? AND status = 'offer_pending'").run(offer.return_status, offer.application_id);
        this.ledger.audit({ entityType: 'work_board_position_offer', entityId: offer.id, jobId: current.jobId,
          action: 'expire_position_offer', actor: options.actor || 'durable_scheduler', before: { status: 'offered' }, after: { status: 'expired' } });
      }
      const status = this.waitlistAutomationStatus(current);
      if (status.status !== 'ready') return status;
      const expiration = Math.min(Date.now() + 48 * 3600000, Date.parse(current.startsAt) - 60000);
      if (expiration <= Date.now() + 15 * 60000) return { status: 'owner_review', waitlistPosition: 1, reason: 'Er is onvoldoende tijd voor een redelijke reactietermijn vóór de start.' };
      const application = this.createPositionOffer(status.applicationId, { expiresAt: new Date(expiration).toISOString() }, options.actor || 'durable_scheduler');
      return { status: 'offered', applicationId: application.id, expiresAt: application.offer?.expiresAt || null };
    });
  }
  runWaitlistOfferSweep(options = {}) {
    const ids = this.ledger.db.prepare("SELECT id FROM work_board_positions WHERE status = 'open'").all()
      .filter(row => this.position(row.id).waitlistOfferPolicy === 'automatic_once').map(row => row.id);
    const results = ids.map(positionId => ({ positionId, ...this.offerNextWaitlisted(positionId, options) }));
    return { scanned: ids.length, offered: results.filter(item => item.status === 'offered').length,
      reviewRequired: results.filter(item => item.status === 'owner_review').length, results };
  }
  positions({ jobId, office = false } = {}) {
    const rows = jobId
      ? this.ledger.db.prepare('SELECT id FROM work_board_positions WHERE job_id = ? ORDER BY created_at DESC LIMIT 500').all(jobId)
      : this.ledger.db.prepare('SELECT id FROM work_board_positions ORDER BY created_at DESC LIMIT 500').all();
    return rows.map(row => this.position(row.id)).filter(position => office || (!position.privacyReviewRequired && position.workPackageCurrent && position.status === 'open' && Date.parse(position.startsAt) > Date.now()
      && !['archived', 'cancelled', 'completed'].includes(this.ledger.db.prepare('SELECT status FROM jobs WHERE id = ?').get(position.jobId)?.status)))
      .map(position => {
        const readiness = this.positionReadiness(position);
        if (office) return { ...position, materialReadiness: readiness, waitlistAutomation: this.waitlistAutomationStatus(position) };
        const { publishedBy: _by, draftedBy: _draftedBy, sourceTasksHash: _sourceTasksHash, sourceTaskIds: _tasks, entryKey: _key,
          waitlistOfferPolicy: _waitlistOfferPolicy, automaticStandbyCallouts: _automaticStandbyCallouts, ...safe } = position;
        return { ...safe, materialsReady: readiness.ready };
    });
  }
  positionsForAccount(accountId) {
    const account = this.account(accountId);
    return this.positions().filter(position => !position.targetTradePartnerId
      || account.verifiedTradePartner?.id === position.targetTradePartnerId);
  }
  enrollmentCheck(accountId, positionId) {
    const account = this.account(accountId);
    if (account.status === 'suspended') fail('Account geblokkeerd.', 403);
    const position = this.position(positionId);
    if (position.targetTradePartnerId && account.verifiedTradePartner?.id !== position.targetTradePartnerId) fail('Positie niet gevonden.', 404);
    if (position.privacyReviewRequired) return { canApply: false, revision: position.revision,
      blockers: ['Deze positie is tijdelijk verborgen omdat de openbare voorwaarden mogelijk dossiergegevens bevatten. De aannemer moet de voorwaarden opnieuw controleren en veilig vrijgeven.'], advisories: [] };
    const job = this.ledger.getJobDetail(position.jobId, { includeAudit: false });
    const blockers = [], advisories = [];
    const regionPreference = workerRegionPreference(account);
    if (!regionPreference.allRegions && position.city && regionPreference.regions.length
        && !regionPreference.regions.some(region => areaKey(region) === areaKey(position.city))) {
      advisories.push(`De projectplaats ${position.city} staat niet in je opgegeven werkgebieden. Je kunt alsnog belangstelling tonen en dit met de aannemer afstemmen.`);
    }
    if (!position.workPackageCurrent) blockers.push('De gekoppelde werkzaamheid of het werkpakket is gewijzigd; de aannemer moet de positie opnieuw beoordelen.');
    if (position.status !== 'open' || Date.parse(position.startsAt) <= Date.now()
      || ['archived', 'cancelled', 'completed'].includes(job.status)) blockers.push('Deze positie is niet meer actief.');
    if (account.status !== 'admitted') {
      advisories.push('Je kunt belangstelling aangeven, maar de aannemer moet je toelating afronden voordat plaatsing mogelijk is.');
      if (!account.skills.some(skill => skill.toLowerCase() === position.role.toLowerCase())) {
        advisories.push('Je opgegeven vakgebied komt niet overeen; bespreek dit bij je toelating.');
      }
      const missing = missingPositionSkills(position, [account.skills]);
      if (missing.length) advisories.push(`Je profiel noemt deze aanvullende vaardigheden niet: ${missing.join(', ')}. Bespreek dit bij je toelating.`);
    } else {
      const worker = account.workerId ? this.ledger.getWorker(account.workerId) : null;
      if (!worker) blockers.push('Je uitvoerdersprofiel is niet gekoppeld; neem contact op met de aannemer.');
      else {
        if (worker.status !== 'available') blockers.push('Je actuele beschikbaarheidsstatus staat deze plaatsing niet toe.');
        const matchesRole = skill => skill.toLowerCase() === position.role.toLowerCase();
        if (!account.skills.some(matchesRole) || !worker.skills.some(matchesRole)) blockers.push('Je actuele vakprofiel komt niet overeen met deze positie.');
        const missing = missingPositionSkills(position, [account.skills, worker.skills]);
        if (missing.length) blockers.push(`Je actuele profiel mist aanvullende vaardigheden: ${missing.join(', ')}.`);
        const qualifications = this.ledger.assessWorkerQualifications(worker.id, { jobId: position.jobId, role: position.role, at: position.endsAt });
        for (const item of qualifications.items.filter(item => item.requirement.mandatory && !item.ready)) {
          const label = item.status === 'pending_approval' ? 'wacht op goedkeuring'
            : item.status === 'expired' ? 'is verlopen'
              : item.status === 'integrity_failed' ? 'kon niet worden gecontroleerd' : 'ontbreekt';
          blockers.push(`Verplichte kwalificatie ${item.requirement.title} ${label}.`);
        }
        if (this.ledger.findAssignmentConflicts({ workerId: worker.id, scheduledStart: position.startsAt, scheduledEnd: position.endsAt }).length) {
          blockers.push('Deze periode overlapt met een andere opdracht in je planning.');
        }
        if (this.ledger.findWorkerAvailabilityConflicts({ workerId: worker.id, scheduledStart: position.startsAt, scheduledEnd: position.endsAt }).length) {
          blockers.push('Je hebt een gemelde verhindering tijdens deze periode.');
        }
        if (this.standbyOverlap(worker.id, position)) advisories.push('Je staat in deze periode op standby; de aannemer moet je belangstelling beoordelen.');
      }
    }
    if (!this.positionReadiness(position, job).ready) advisories.push('Materialen of opdrachtinformatie zijn nog niet volledig gecontroleerd; plaatsing wacht daarop.');
    if (position.filled >= position.capacity) advisories.push('De positie is vol; belangstelling wordt op de wachtlijst gezet.');
    return { canApply: blockers.length === 0, revision: position.revision, blockers, advisories };
  }
  suggest(jobId) {
    const job = this.ledger.getJobDetail(jobId, { includeAudit: false });
    const context = new (require('./work-context').WorkContext)(this.ledger);
    const changesById = new Map(job.changeOrders.map(change => [change.id, change]));
    const workPackages = context.read(jobId).packages.filter(row => !row.archived).map(row => {
      try { return { id: row.id, title: row.title, code: row.code, ...context.packageBasis(jobId, row.id) }; }
      catch (error) { if (!error.statusCode) throw error; return { id: row.id, title: row.title, code: row.code, blocked: error.message }; }
    });
    const suggestions = job.tasks.filter(row => !['completed', 'cancelled'].includes(row.status) && !isCoordinationTask(row, job)).flatMap(row => {
      const verified = verifyAppliedVariationTask(this.ledger, job, row);
      const variationTask = verified.isVariationTask;
      const change = variationTask ? verified.change || changesById.get(row.data.changeOrderId) : null;
      if (variationTask && (!verified.valid || !change || change.status !== 'accepted' || change.integrityValid !== true
        || change.workAuthorized !== true || change.snapshotHash !== row.data.variationSnapshotHash)) return [];
      const linkedMaterials = (row.data?.materialRequirementIds || [])
        .map(id => job.materials.find(material => material.id === id))
        .filter(material => material && material.status !== 'cancelled')
        .map(material => ({ id: material.id, name: material.name, quantity: material.quantity, unit: material.unit, status: material.status }));
      const materialsText = linkedMaterials.length
        ? linkedMaterials.map(material => `${material.name}: ${material.quantity} ${material.unit} (levering te bevestigen)`).join('\n')
        : '';
      return [{
        sourceTaskId: row.id,
        title: row.title,
        description: row.description || '',
        hours: row.durationHours || null,
        startsAt: row.plannedStart || job.scheduledStart || null,
        endsAt: row.plannedEnd || job.scheduledEnd || null,
        city: job.city || '',
        role: row.data?.requiredTrade || null,
        rate: null,
        capacity: null,
        sourceType: variationTask ? 'accepted_variation_implementation' : 'job_task',
        variationNumber: variationTask ? change.variationNumber : null,
        variationRevision: variationTask ? change.revisionNumber : null,
        linkedMaterials,
        materialsText
      }];
    });
    const missing = ['rate', 'capacity', 'public_content_review'];
    if (!suggestions.length || suggestions.some(row => !row.role)) missing.unshift('role');
    return { jobId, workPackages, requiresWorkPackage: new (require('./work-balance').WorkBalance)(this.ledger).enabled(jobId), materials: job.materials.map(row => `${row.name}: ${row.quantity} ${row.unit}`).join('\n'),
      equipment: job.tools.map(row => row.toolName).join('\n'),
      suggestions,
      method: 'retained_tasks', missing };
  }
  publish(jobId, input, actor) {
    if (input.confirmPublication !== true) fail('Bevestig vrijgave van deze voorwaarden en automatische interne plaatsing.');
    const key = text(input.entryKey, 'Publicatiesleutel', 100);
    const starts = Date.parse(input.startsAt), ends = Date.parse(input.endsAt);
    if (!Number.isFinite(starts) || !Number.isFinite(ends) || starts <= Date.now() || ends <= starts || ends - starts > 31 * 86400000) fail('Geef een toekomstige periode van maximaal 31 dagen op.');
    const hours = Number(input.hours), rate = Number(input.rate), capacity = Number(input.capacity);
    if (!Number.isFinite(hours) || hours <= 0 || hours > (ends - starts) / 3600000 || !Number.isFinite(rate) || rate <= 0 || !Number.isInteger(capacity) || capacity < 1 || capacity > 50) fail('Controleer duur, uurvergoeding en aantal plaatsen.');
    const data = { entryKey: key, title: text(input.title, 'Openbare titel'), role: text(input.role, 'Vakgebied', 80), city: text(input.city, 'Plaats'),
      description: text(input.description, 'Werkzaamheden', 3000), materials: text(input.materials, 'Materialen', 2000), equipment: text(input.equipment, 'Gereedschap', 2000),
      prerequisites: text(input.prerequisites, 'Startvoorwaarden', 2000), startsAt: new Date(starts).toISOString(), endsAt: new Date(ends).toISOString(), hours, rate, capacity,
      currency: 'EUR', rateBasis: 'per_hour_ex_vat', sourceTaskIds: Array.isArray(input.sourceTaskIds) ? input.sourceTaskIds.slice(0, 50).map(String) : [] };
    data.targetTradePartnerId = input.targetTradePartnerId ? text(input.targetTradePartnerId, 'Onderaannemersbedrijf', 150) : null;
    data.waitlistOfferPolicy = input.waitlistOfferPolicy === 'automatic_once' ? 'automatic_once' : 'manual';
    data.automaticStandbyCallouts = input.automaticStandbyCallouts === true;
    data.requiredSkills = normalizeRequiredSkills(input.requiredSkills || [], data.role);
    data.startReleaseRequired = input.startReleaseRequired === true;
    if (data.startReleaseRequired && data.sourceTaskIds.length === 0) fail('Koppel startvrijgave aan ten minste één concrete werkzaamheid.', 400);
    if (input.workPackageId) {
      data.workPackageId = text(input.workPackageId, 'Werkpakket', 150);
      data.workPackageSourceHash = text(input.workPackageSourceHash, 'Werkpakketversie', 64);
    }
    const id = `position_${hash(`${jobId}:${key}`).slice(0, 32)}`;
    return this.ledger.transaction(() => {
      const context = new (require('./work-context').WorkContext)(this.ledger);
      context.lock(jobId);
      const job = this.ledger.getJobDetail(jobId, { includeAudit: false });
      if (data.targetTradePartnerId) {
        const partner = this.ledger.getTradePartner(data.targetTradePartnerId);
        if (partner.status !== 'active' || !['subcontractor', 'both'].includes(partner.partnerType)) fail('De doelonderaannemer moet actief in het register staan.', 409);
      }
      if (['archived', 'cancelled', 'completed'].includes(job.status)) fail('Opdracht is niet actief.', 409);
      const privacyWarnings = publicPositionPrivacyWarnings(job, data);
      if (privacyWarnings.length) fail(`De openbare positie bevat mogelijk privégegevens uit het dossier (${privacyWarnings.join(', ')}). Verwijder klant- en contactgegevens; gebruik voor de openbare kaart alleen de plaatsnaam.`, 400);
      if (data.sourceTaskIds.some(taskId => !job.tasks.some(task => task.id === taskId))) fail('Bronwerkzaamheid hoort niet bij deze opdracht.');
      for (const taskId of data.sourceTaskIds) {
        const task = job.tasks.find(item => item.id === taskId);
        if (['completed', 'cancelled'].includes(task.status)) fail('Een afgeronde of geannuleerde werkzaamheid kan geen nieuwe positiebron zijn.', 409);
        if (isCoordinationTask(task, job)) fail('Een interne intake- of coördinatietaak kan niet als uitvoerderspositie worden gepubliceerd.', 409);
        const requiredTrade = task.data?.requiredTrade;
        if (requiredTrade && requiredTrade.trim().toLocaleLowerCase() !== data.role.toLocaleLowerCase()) {
          fail(`De vakrol van de positie komt niet overeen met de gekoppelde werkzaamheid (${requiredTrade}).`, 409);
        }
        const verified = verifyAppliedVariationTask(this.ledger, job, task);
        if (verified.isVariationTask && !verified.valid) fail('De goedgekeurde variatietaak of materiaalbehoefte is gewijzigd; beoordeel en herstel het uitvoeringsplan voordat je publiceert.', 409);
      }
      data.sourceTasksHash = workBoardTaskSourceHash(job, data.sourceTaskIds);
      const revision = hash(JSON.stringify(data));
      const existing = this.ledger.db.prepare('SELECT id FROM work_board_positions WHERE id = ?').get(id);
      if (existing) {
        const retained = this.position(id);
        if (retained.status === 'draft') {
          if (!retained.workPackageCurrent) fail('De conceptbron is gewijzigd. Sla de actuele taak- en werkpakketgegevens opnieuw op voordat je vrijgeeft.', 409);
          this.ledger.db.prepare("UPDATE work_board_positions SET status = 'open', data_json = ? WHERE id = ? AND status = 'draft'")
            .run(JSON.stringify({ ...data, revision, publishedBy: actor }), id);
          this.ledger.audit({ entityType: 'work_board_position', entityId: id, jobId,
            action: 'approve_publication', actor, before: { status: 'draft' }, after: { status: 'open', revision, ...data } });
          return this.position(id);
        }
        if (retained.revision !== revision) fail('Publicatiesleutel is al gebruikt voor andere voorwaarden.', 409);
        return retained;
      }
      if (!data.workPackageId && new (require('./work-balance').WorkBalance)(this.ledger).enabled(jobId)) fail('Koppel de positie aan de actuele gecontroleerde werkbalans.', 409);
      if (data.workPackageId) {
        const basis = context.packageBasis(jobId, data.workPackageId);
        if (basis.sourceHash !== data.workPackageSourceHash || !data.sourceTaskIds.length || data.sourceTaskIds.some(taskId => !basis.taskIds.includes(taskId))) fail('Controleer de actuele werkpakketversie en de bijbehorende werkzaamheden.', 409);
      }
      this.ledger.db.prepare('INSERT INTO work_board_positions (id, job_id, status, data_json, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(id, jobId, 'open', JSON.stringify({ ...data, revision, publishedBy: actor }), new Date().toISOString());
      this.ledger.audit({ entityType: 'work_board_position', entityId: id, jobId, action: 'approve_publication', actor, after: { revision, ...data } });
      return this.position(id);
    });
  }
  saveDraft(jobId, input, actor) {
    const key = text(input.entryKey, 'Conceptsleutel', 100);
    const draftText = (value, label, max) => {
      if (value === null || value === undefined || value === '') return '';
      if (typeof value !== 'string' || value.length > max) fail(`${label} is ongeldig of te lang.`);
      return value.trim();
    };
    const draftDate = (value, label) => {
      if (!value) return null;
      const parsed = Date.parse(value);
      if (!Number.isFinite(parsed)) fail(`${label} is geen geldige datum.`);
      return new Date(parsed).toISOString();
    };
    const draftNumber = (value, label, predicate) => {
      if (value === null || value === undefined || value === '') return null;
      const number = Number(value);
      if (!Number.isFinite(number) || !predicate(number)) fail(`${label} is ongeldig.`);
      return number;
    };
    const data = {
      entryKey: key,
      title: draftText(input.title, 'Titel', 200), role: draftText(input.role, 'Vakgebied', 80), city: draftText(input.city, 'Plaats', 200),
      startsAt: draftDate(input.startsAt, 'Start'), endsAt: draftDate(input.endsAt, 'Einde'),
      hours: draftNumber(input.hours, 'Arbeidsduur', value => value > 0),
      capacity: draftNumber(input.capacity, 'Aantal personen', value => Number.isInteger(value) && value > 0 && value <= 50),
      rate: draftNumber(input.rate, 'Uurvergoeding', value => value > 0),
      description: draftText(input.description, 'Werkzaamheden', 3000), materials: draftText(input.materials, 'Materialen', 2000),
      equipment: draftText(input.equipment, 'Gereedschap', 2000), prerequisites: draftText(input.prerequisites, 'Startvoorwaarden', 2000),
      startReleaseRequired: input.startReleaseRequired === true,
      waitlistOfferPolicy: input.waitlistOfferPolicy === 'automatic_once' ? 'automatic_once' : 'manual',
      automaticStandbyCallouts: input.automaticStandbyCallouts === true,
      targetTradePartnerId: input.targetTradePartnerId ? text(input.targetTradePartnerId, 'Onderaannemersbedrijf', 150) : null,
      currency: 'EUR', rateBasis: 'per_hour_ex_vat',
      sourceTaskIds: Array.isArray(input.sourceTaskIds) ? [...new Set(input.sourceTaskIds.slice(0, 50).map(String))] : []
    };
    data.requiredSkills = normalizeRequiredSkills(input.requiredSkills || [], data.role);
    if (!data.title && !data.sourceTaskIds.length) fail('Voeg een titel of een gekoppelde werkzaamheid toe voordat je het concept bewaart.');
    if (input.workPackageId) {
      data.workPackageId = text(input.workPackageId, 'Werkpakket', 150);
      data.workPackageSourceHash = text(input.workPackageSourceHash, 'Werkpakketversie', 64);
    }
    if (data.startsAt && data.endsAt && Date.parse(data.endsAt) <= Date.parse(data.startsAt)) fail('Einde moet na de start liggen.');
    if (data.hours && data.startsAt && data.endsAt && data.hours > (Date.parse(data.endsAt) - Date.parse(data.startsAt)) / 3600000) fail('Arbeidsduur past niet binnen de geselecteerde periode.');
    const id = `position_${hash(`${jobId}:${key}`).slice(0, 32)}`;
    return this.ledger.transaction(() => {
      const context = new (require('./work-context').WorkContext)(this.ledger);
      context.lock(jobId);
      const job = this.ledger.getJobDetail(jobId, { includeAudit: false });
      if (data.targetTradePartnerId) {
        const partner = this.ledger.getTradePartner(data.targetTradePartnerId);
        if (partner.status !== 'active' || !['subcontractor', 'both'].includes(partner.partnerType)) fail('De doelonderaannemer moet actief in het register staan.', 409);
      }
      if (['archived', 'cancelled', 'completed'].includes(job.status)) fail('Opdracht is niet actief.', 409);
      const tasks = new Map(job.tasks.map(task => [task.id, task]));
      for (const taskId of data.sourceTaskIds) {
        const task = tasks.get(taskId);
        if (!task || ['completed', 'cancelled'].includes(task.status)) fail('Een concept kan alleen actuele werkzaamheden uit deze opdracht gebruiken.', 409);
        if (isCoordinationTask(task, job)) fail('Een interne intake- of coördinatietaak kan niet als uitvoerderspositie worden gebruikt.', 409);
        const requiredTrade = task.data?.requiredTrade;
        if (requiredTrade && data.role && requiredTrade.trim().toLocaleLowerCase() !== data.role.toLocaleLowerCase()) {
          fail(`De vakrol van het concept komt niet overeen met de gekoppelde werkzaamheid (${requiredTrade}).`, 409);
        }
        const verified = verifyAppliedVariationTask(this.ledger, job, task);
        if (verified.isVariationTask && !verified.valid) fail('De goedgekeurde variatietaak is gewijzigd; herstel eerst het uitvoeringsplan.', 409);
      }
      data.sourceTasksHash = workBoardTaskSourceHash(job, data.sourceTaskIds);
      if (data.workPackageId) {
        const basis = context.packageBasis(jobId, data.workPackageId);
        if (basis.sourceHash !== data.workPackageSourceHash || !data.sourceTaskIds.length
            || data.sourceTaskIds.some(taskId => !basis.taskIds.includes(taskId))) fail('Controleer de actuele werkpakketversie en gekoppelde werkzaamheden.', 409);
      }
      const revision = hash(JSON.stringify(data));
      const existing = this.ledger.db.prepare('SELECT id, status, data_json FROM work_board_positions WHERE id = ?').get(id);
      if (existing && existing.status !== 'draft') fail('Een vrijgegeven positie kan niet opnieuw als concept worden opgeslagen.', 409);
      if (existing && JSON.parse(existing.data_json).revision === revision) return this.position(id);
      const timestamp = new Date().toISOString();
      if (existing) {
        this.ledger.db.prepare('UPDATE work_board_positions SET data_json = ? WHERE id = ? AND status = ?')
          .run(JSON.stringify({ ...data, revision, draftedBy: actor }), id, 'draft');
      } else {
        this.ledger.db.prepare('INSERT INTO work_board_positions (id, job_id, status, data_json, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(id, jobId, 'draft', JSON.stringify({ ...data, revision, draftedBy: actor }), timestamp);
      }
      this.ledger.audit({ entityType: 'work_board_position', entityId: id, jobId,
        action: existing ? 'update_position_draft' : 'create_position_draft', actor,
        before: existing ? { status: 'draft' } : null, after: { status: 'draft', revision, ...data } });
      return this.position(id);
    });
  }
  applications(accountId) {
    return this.ledger.db.prepare('SELECT * FROM work_board_applications WHERE account_id = ? ORDER BY created_at DESC LIMIT 500').all(accountId)
      .map(row => this.applicationRecord(row));
  }
  positionsForApplication(id) {
    const { publishedBy: _by, draftedBy: _draftedBy, sourceTasksHash: _sourceTasksHash, sourceTaskIds: _tasks, entryKey: _key,
      waitlistOfferPolicy: _waitlistOfferPolicy, automaticStandbyCallouts: _automaticStandbyCallouts, ...safe } = this.position(id);
    return safe;
  }
  standbyOverlap(workerId, position) {
    if (!workerId) return false;
    return this.ledger.findWorkerStandbyConflicts({ workerId, scheduledStart: position.startsAt, scheduledEnd: position.endsAt }).length > 0;
  }
  standbyAcceptanceDeadline(workerId, position) {
    const periods = this.ledger.findWorkerStandbyConflicts({ workerId,
      scheduledStart: position.startsAt, scheduledEnd: position.endsAt });
    if (!periods.length) return null;
    return Math.min(...periods.map(period => Date.parse(position.startsAt)
      - Math.max(0, Number(period.minimumNoticeHours) || 0) * 3600000));
  }
  assertStandbyNotice(workerId, position, noticeAt = Date.now()) {
    const deadline = this.standbyAcceptanceDeadline(workerId, position);
    if (deadline !== null && noticeAt > deadline) {
      fail('De minimale oproeptermijn voor deze stand-byperiode kan niet meer worden gehaald.', 409,
        { code: 'worker_standby_notice_insufficient' });
    }
  }
  positionReadiness(position, job = this.ledger.getJobDetail(position.jobId, { includeAudit: false })) {
    const materials = new Map(job.materials.map(item => [item.id, item]));
    const linkedIds = new Set(), blockers = [];
    for (const taskId of position.sourceTaskIds || []) {
      const task = job.tasks.find(item => item.id === taskId);
      if (!task) {
        blockers.push({ code: 'source_task_missing', label: 'Bronwerkzaamheid ontbreekt' });
        continue;
      }
      const verified = verifyAppliedVariationTask(this.ledger, job, task);
      if (verified.isVariationTask && !verified.valid) blockers.push({ code: 'variation_source_changed', label: 'Goedgekeurde variatietaak is gewijzigd' });
      for (const id of task.data?.materialRequirementIds || []) linkedIds.add(id);
    }
    for (const id of linkedIds) {
      const material = materials.get(id);
      if (!material) {
        blockers.push({ code: 'material_missing', label: 'Gekoppelde materiaalregel ontbreekt' });
        continue;
      }
      const availableQuantity = Number(material.data?.availableQuantity);
      const readyStatus = ['available', 'received', 'allocated', 'loaded', 'used', 'delivered'].includes(material.status);
      if (!readyStatus || (Number.isFinite(availableQuantity) && availableQuantity < Number(material.quantity))) {
        blockers.push({ code: 'material_not_ready', materialId: material.id, label: `${material.name}: ${material.quantity} ${material.unit} nog niet volledig bevestigd` });
      }
    }
    return { ready: blockers.length === 0, linkedMaterialCount: linkedIds.size, blockers };
  }
  applicationRecord(row) {
    const position = this.position(row.position_id), account = this.account(row.account_id);
    const activeInterest = ['interested', 'waitlisted'].includes(row.status);
    const privacyReviewRequired = position.privacyReviewRequired && row.status !== 'assigned';
    const readiness = activeInterest && !privacyReviewRequired ? this.positionReadiness(position) : null;
    const waitlistPosition = row.status === 'waitlisted'
      ? Number(this.ledger.db.prepare(`SELECT COUNT(*) AS n FROM work_board_applications
          WHERE position_id = ? AND status = 'waitlisted'
            AND (created_at < ? OR (created_at = ? AND id <= ?))`)
        .get(row.position_id, row.created_at, row.created_at, row.id).n)
      : null;
    const holdReasons = [];
    if (activeInterest) {
      if (privacyReviewRequired) holdReasons.push('privacy_review_required');
      else if (account.status !== 'admitted') holdReasons.push('admission_required');
      else {
        if (!readiness?.ready) holdReasons.push('materials_or_source');
        if (this.standbyOverlap(account.workerId, position)) holdReasons.push('standby_confirmation_required');
      }
    }
    const holdReason = holdReasons[0] || null;
    const offer = this.ledger.db.prepare('SELECT id, terms_revision, status, expires_at, responded_at FROM work_board_position_offers WHERE application_id = ? ORDER BY created_at DESC LIMIT 1').get(row.id);
    const assignment = row.assignment_id ? this.ledger.db.prepare('SELECT status FROM assignments WHERE id = ? AND job_id = ? AND worker_id = ?')
      .get(row.assignment_id, position.jobId, account.workerId) : null;
    const releaseRow = row.assignment_id ? this.ledger.db.prepare(`SELECT * FROM approvals
      WHERE target_type = 'worker_assignment_release_request' AND target_id = ? ORDER BY created_at DESC LIMIT 1`).get(row.assignment_id) : null;
    let releaseData = null;
    try { releaseData = releaseRow ? JSON.parse(releaseRow.data_json || '{}') : null; } catch { releaseData = null; }
    const releaseRequest = releaseData?.workerId === account.workerId ? {
      id: releaseRow.id, status: releaseRow.status, reasonCategory: releaseData.reasonCategory,
      requestedAt: releaseRow.created_at, resolvedAt: releaseRow.resolved_at || null,
      resolutionReason: releaseRow.status === 'rejected' ? releaseRow.reason || null : null
    } : null;
    return { id: row.id, accountId: row.account_id, positionId: row.position_id, status: row.status, assignmentId: row.assignment_id, waitlistPosition,
      assignmentStatus: assignment?.status || null, releaseRequest,
      offer: offer ? { id: offer.id, termsRevision: offer.terms_revision, status: offer.status, expiresAt: offer.expires_at, respondedAt: offer.responded_at } : null,
      holdReason, holdReasons, readiness, position: this.positionsForApplication(row.position_id) };
  }

  workerApplicationPosition(row) {
    const position = this.positionsForApplication(row.positionId || row.position_id);
    const account = this.account(row.accountId || row.account_id);
    if (position.targetTradePartnerId && account.verifiedTradePartner?.id !== position.targetTradePartnerId) {
      return { id: position.id, status: position.status, reviewRequired: true, reviewReason: 'company', title: 'Opdracht niet meer beschikbaar voor dit account' };
    }
    if ((!position.privacyReviewRequired && position.workPackageCurrent && position.status === 'open') || row.status === 'assigned') return position;
    const reviewReason = position.privacyReviewRequired ? 'privacy' : !position.workPackageCurrent ? 'source' : 'closed';
    return { id: position.id, jobId: position.jobId, status: position.status, revision: position.revision,
      reviewRequired: true, reviewReason, title: 'Opdracht wordt opnieuw gecontroleerd' };
  }

  requestAssignmentRelease(accountId, applicationId, input = {}) {
    const reasonLabels = {
      sudden_unavailability: 'Onverwachte verhindering',
      family_care: 'Zorg voor gezin of naaste',
      travel_or_site_issue: 'Reis- of locatieprobleem',
      other: 'Anders'
    };
    return this.ledger.transaction(() => {
      const row = this.ledger.db.prepare('SELECT * FROM work_board_applications WHERE id = ? AND account_id = ?').get(applicationId, accountId);
      if (!row) fail('Plaatsing niet gevonden.', 404);
      const account = this.account(accountId);
      if (account.status !== 'admitted' || !account.workerId) fail('Alleen toegelaten uitvoerenden kunnen een wijziging aanvragen.', 403);
      if (row.status !== 'assigned' || !row.assignment_id) fail('Alleen een bestaande plaatsing kan worden vrijgave aangevraagd.', 409);
      const position = this.position(row.position_id);
      new (require('./work-context').WorkContext)(this.ledger).lock(position.jobId);
      const assignment = this.ledger.db.prepare('SELECT * FROM assignments WHERE id = ? AND job_id = ? AND worker_id = ?')
        .get(row.assignment_id, position.jobId, account.workerId);
      if (!assignment || !['planned', 'scheduled'].includes(assignment.status)) fail('Deze plaatsing is niet meer actief of wacht al op een andere beoordeling.', 409);
      const reasonCategory = input.reasonCategory;
      if (!Object.hasOwn(reasonLabels, reasonCategory)) fail('Kies een reden voor je verzoek.', 400);
      const existing = this.ledger.db.prepare(`SELECT * FROM approvals
        WHERE target_type = 'worker_assignment_release_request' AND target_id = ? AND status = 'pending'`).get(assignment.id);
      if (existing) {
        const data = JSON.parse(existing.data_json || '{}');
        if (data.workerId === account.workerId && data.reasonCategory === reasonCategory) return { request: this.mapReleaseRequest(existing), replayed: true };
        fail('Er staat al een verzoek voor deze plaatsing open.', 409);
      }
      const snapshot = {
        assignmentId: assignment.id, jobId: assignment.job_id, workerId: assignment.worker_id,
        accountId, status: assignment.status, scheduledStart: assignment.scheduled_start, scheduledEnd: assignment.scheduled_end,
        updatedAt: assignment.updated_at, applicationId: row.id, positionId: position.id, positionRevision: position.revision
      };
      const request = this.ledger.createApproval({
        targetType: 'worker_assignment_release_request', targetId: assignment.id, jobId: assignment.job_id,
        approvalType: 'worker_assignment_release_request', requestedBy: `field_worker:${account.workerId}`,
        summary: `Review release request from ${account.name} for ${position.title}`,
        reason: reasonLabels[reasonCategory],
        data: { ...snapshot, reasonCategory, workerName: account.name, positionTitle: position.title }
      }, { actor: `field_worker:${account.workerId}`, audit: false });
      this.ledger.audit({ entityType: 'assignment', entityId: assignment.id, jobId: assignment.job_id,
        action: 'request_worker_assignment_release', actor: `field_worker:${account.workerId}`,
        before: { status: assignment.status }, after: { status: assignment.status, releaseRequestId: request.id },
        metadata: { approvalId: request.id, reasonCategory, externalCommitments: 0 } });
      return { request: this.mapReleaseRequest(this.ledger.db.prepare('SELECT * FROM approvals WHERE id = ?').get(request.id)), replayed: false };
    });
  }

  mapReleaseRequest(row) {
    const data = JSON.parse(row.data_json || '{}');
    return { id: row.id, assignmentId: data.assignmentId, jobId: data.jobId, workerId: data.workerId,
      status: row.status, reasonCategory: data.reasonCategory, requestedAt: row.created_at,
      resolvedAt: row.resolved_at || null };
  }
  jobApplications(jobId) {
    return this.ledger.db.prepare(`SELECT applications.* FROM work_board_applications applications
      JOIN work_board_positions positions ON positions.id = applications.position_id
      WHERE positions.job_id = ? ORDER BY applications.created_at DESC LIMIT 500`).all(jobId).map(row => {
      const application = this.applicationRecord(row), account = this.account(row.account_id);
      const activeReview = ['interested', 'waitlisted', 'offer_pending'].includes(row.status) && account.status !== 'suspended';
      const check = activeReview ? this.enrollmentCheck(account.id, application.positionId) : null;
      return { ...application,
        applicant: { name: account.name, skills: account.skills, region: account.region, status: account.status },
        ...(check ? { placementReview: { blockers: check.blockers, advisories: check.advisories } } : {})
      };
    });
  }
  assignApplication(applicationId, actor) {
    const row = this.ledger.db.prepare('SELECT * FROM work_board_applications WHERE id = ?').get(applicationId);
    if (!row) fail('Inschrijving niet gevonden.', 404);
    const position = this.position(row.position_id);
    new (require('./work-context').WorkContext)(this.ledger).lock(position.jobId);
    this.ledger.db.prepare('UPDATE work_board_accounts SET status = status WHERE id = ?').run(row.account_id);
    this.ledger.db.prepare('UPDATE work_board_positions SET status = status WHERE id = ?').run(position.id);
    const latest = this.ledger.db.prepare('SELECT * FROM work_board_applications WHERE id = ?').get(applicationId);
    if (latest.status === 'assigned') return this.applicationRecord(latest);
    if (!['interested', 'waitlisted', 'offer_pending'].includes(latest.status)) fail('Alleen een open belangstelling, aanbod of wachtlijstinschrijving kan worden bevestigd.', 409);
    const account = this.account(latest.account_id);
    if (account.status !== 'admitted' || !account.workerId) fail('De uitvoerende moet eerst zijn toegelaten.', 409);
    const currentPosition = this.position(position.id);
    if (currentPosition.revision !== position.revision || !currentPosition.workPackageCurrent) fail('De positievoorwaarden, gekoppelde werkzaamheid of het werkpakket zijn gewijzigd; sluit en beoordeel de positie opnieuw.', 409);
    if (currentPosition.privacyReviewRequired) fail('Deze positie is tijdelijk geblokkeerd omdat de openbare voorwaarden mogelijk dossiergegevens bevatten. Sluit de positie en geef gecontroleerde voorwaarden opnieuw vrij.', 409);
    const job = this.ledger.getJobDetail(position.jobId, { includeAudit: false });
    if (['archived', 'cancelled', 'completed'].includes(job.status) || currentPosition.status !== 'open'
      || Date.parse(currentPosition.startsAt) <= Date.now()) fail('De opdracht of positie is niet meer actief.', 409);
    if (currentPosition.filled >= currentPosition.capacity) fail('Alle plaatsen zijn inmiddels bezet.', 409);
    const readiness = this.positionReadiness(currentPosition, job);
    if (!readiness.ready) fail('Plaatsing wacht: controleer eerst de gekoppelde materiaalbehoeften en taakbron.', 409);
    const worker = this.ledger.getWorker(account.workerId);
    if (worker.status !== 'available') fail('De actuele beschikbaarheidsstatus staat plaatsing niet toe.', 409);
    this.assertStandbyNotice(worker.id, currentPosition);
    const matchesRole = skill => skill.toLowerCase() === currentPosition.role.toLowerCase();
    if (!account.skills.some(matchesRole) || !worker.skills.some(matchesRole)) fail('Dit vakgebied is niet meer toegelaten in het actuele profiel.', 409);
    const missingSkills = missingPositionSkills(currentPosition, [account.skills, worker.skills]);
    if (missingSkills.length) fail(`Vereiste aanvullende vaardigheden ontbreken in het actuele profiel: ${missingSkills.join(', ')}.`, 409);
    if (!this.ledger.assessWorkerQualifications(worker.id, { jobId: currentPosition.jobId, role: currentPosition.role, at: currentPosition.endsAt }).ready) fail('Vereiste kwalificaties ontbreken, zijn verlopen of nog niet goedgekeurd.', 409);
    const window = { workerId: worker.id, scheduledStart: currentPosition.startsAt, scheduledEnd: currentPosition.endsAt };
    if (this.ledger.findAssignmentConflicts(window).length || this.ledger.findWorkerAvailabilityConflicts(window).length) fail('Deze periode overlapt inmiddels met een opdracht of verhindering.', 409);
    const assignment = this.ledger.addAssignment(currentPosition.jobId, { ...window, role: currentPosition.role, status: 'planned', allocationHours: currentPosition.hours,
      startReleaseRequired: currentPosition.startReleaseRequired === true, workBoardPositionId: currentPosition.id,
      requiredTradePartnerId: currentPosition.targetTradePartnerId || null,
      workBoardTermsRevision: currentPosition.revision, workBoardTaskIds: currentPosition.sourceTaskIds,
      notes: `Work board ${currentPosition.id}, terms ${currentPosition.revision}; material-ready owner confirmation` }, { actor, optional: false });
    if (assignment.requiresApproval) fail('Deze plaatsing vereist aanvullende beoordeling.', 409);
    this.ledger.db.prepare("UPDATE work_board_applications SET status = 'assigned', assignment_id = ? WHERE id = ? AND status IN ('interested', 'waitlisted')")
      .run(assignment.id, applicationId);
    this.ledger.audit({ entityType: 'work_board_application', entityId: applicationId, jobId: currentPosition.jobId,
      action: latest.status === 'waitlisted' ? 'confirm_waitlist_placement' : 'confirm_material_ready_placement', actor, before: { status: latest.status }, after: { status: 'assigned', assignmentId: assignment.id },
      metadata: { positionId: currentPosition.id, workerId: worker.id, linkedMaterialCount: readiness.linkedMaterialCount } });
    const notice = positionAssignmentNotice(currentPosition, assignment, job);
    this.notifyWorker({ workerId: worker.id, jobId: currentPosition.jobId, type: 'position_assigned', sourceId: applicationId,
      sourceVersion: { assignmentId: assignment.id, positionRevision: currentPosition.revision },
      ...notice });
    return this.applicationRecord(this.ledger.db.prepare('SELECT * FROM work_board_applications WHERE id = ?').get(applicationId));
  }
  enroll(accountId, positionId, revision) {
    return this.ledger.transaction(() => {
      const retainedPosition = this.position(positionId);
      new (require('./work-context').WorkContext)(this.ledger).lock(retainedPosition.jobId);
      // Serialize capacity and same-account enrollment checks on both database adapters.
      this.ledger.db.prepare('UPDATE work_board_accounts SET status = status WHERE id = ?').run(accountId);
      this.ledger.db.prepare('UPDATE work_board_positions SET status = status WHERE id = ?').run(positionId);
      const account = this.account(accountId), position = this.position(positionId);
      if (account.status === 'suspended') fail('Account geblokkeerd.', 403);
      if (position.targetTradePartnerId && account.verifiedTradePartner?.id !== position.targetTradePartnerId) fail('Positie niet gevonden.', 404);
      this.ledger.assertDataSubjectProcessingAllowed('worker', account.workerId || account.id, 'work_board_enrollment');
      if (revision !== position.revision) fail('Voorwaarden zijn gewijzigd. Lees de positie opnieuw.', 409);
      if (position.privacyReviewRequired) fail('Deze positie is tijdelijk verborgen omdat de openbare voorwaarden mogelijk dossiergegevens bevatten. De aannemer moet de voorwaarden opnieuw controleren en veilig vrijgeven.', 409);
      const existing = this.ledger.db.prepare('SELECT * FROM work_board_applications WHERE account_id = ? AND position_id = ?').get(accountId, positionId);
      if (existing?.status === 'assigned') return { id: existing.id, status: existing.status, assignmentId: existing.assignment_id };
      if (!position.workPackageCurrent) fail('De gekoppelde werkzaamheid of het werkpakket is gewijzigd. De aannemer moet de positie opnieuw beoordelen en vrijgeven.', 409);
      const job = this.ledger.getJobDetail(position.jobId, { includeAudit: false });
      if (position.status !== 'open' || Date.parse(position.startsAt) <= Date.now() || ['archived', 'cancelled', 'completed'].includes(job.status)) fail('Positie is gesloten.', 409);
      let worker = null, readiness = this.positionReadiness(position, job), standby = false;
      let holdReason = account.status === 'admitted' ? null : 'admission_required';
      if (account.status === 'admitted') {
        worker = this.ledger.getWorker(account.workerId);
        if (worker.status !== 'available') fail('Je beschikbaarheidsstatus staat plaatsing niet toe.', 409);
        const matchesRole = skill => skill.toLowerCase() === position.role.toLowerCase();
        if (!account.skills.some(matchesRole) || !worker.skills.some(matchesRole)) fail('Dit vakgebied is niet meer toegelaten in je actuele profiel.', 409);
        const missingSkills = missingPositionSkills(position, [account.skills, worker.skills]);
        if (missingSkills.length) fail(`Vereiste aanvullende vaardigheden ontbreken in je actuele profiel: ${missingSkills.join(', ')}.`, 409);
        if (!this.ledger.assessWorkerQualifications(worker.id, { jobId: position.jobId, role: position.role, at: position.endsAt }).ready) fail('Vereiste kwalificaties ontbreken, zijn verlopen of nog niet goedgekeurd.', 409);
        const window = { workerId: worker.id, scheduledStart: position.startsAt, scheduledEnd: position.endsAt };
        if (this.ledger.findAssignmentConflicts(window).length || this.ledger.findWorkerAvailabilityConflicts(window).length) fail('Deze periode overlapt met een opdracht of verhindering.', 409);
        standby = this.standbyOverlap(worker.id, position);
        if (!readiness.ready) holdReason = 'materials_or_source';
        else if (standby) holdReason = 'standby_confirmation_required';
      }
      if (position.filled >= position.capacity) {
        if (existing?.status === 'waitlisted') return { ...this.applicationRecord(existing), assignmentId: null };
        if (existing && !['withdrawn', 'interested'].includes(existing.status)) fail('Deze inschrijving kan niet op de wachtlijst worden gezet.', 409);
        const id = existing?.id || randomUUID(), createdAt = existing?.status === 'interested' ? existing.created_at : new Date().toISOString();
        if (existing) this.ledger.db.prepare("UPDATE work_board_applications SET status = 'waitlisted', assignment_id = NULL, created_at = ? WHERE id = ?").run(createdAt, id);
        else this.ledger.db.prepare("INSERT INTO work_board_applications (id, position_id, account_id, status, assignment_id, created_at) VALUES (?, ?, ?, 'waitlisted', NULL, ?)").run(id, positionId, accountId, createdAt);
        const application = this.ledger.db.prepare('SELECT * FROM work_board_applications WHERE id = ?').get(id);
        const result = this.applicationRecord(application);
        this.ledger.audit({ entityType: 'work_board_application', entityId: id, jobId: position.jobId,
          action: 'join_position_waitlist', actor: `applicant:${accountId}`,
          before: existing ? { status: existing.status } : null,
          after: { positionId, revision, waitlistPosition: result.waitlistPosition, holdReason } });
        return { ...result, assignmentId: null };
      }
      let assignment = null;
      if (worker) {
        const window = { workerId: worker.id, scheduledStart: position.startsAt, scheduledEnd: position.endsAt };
        if (readiness.ready && !standby) {
          assignment = this.ledger.addAssignment(position.jobId, { ...window, role: position.role, status: 'planned', allocationHours: position.hours,
            startReleaseRequired: position.startReleaseRequired === true, workBoardPositionId: position.id,
            requiredTradePartnerId: position.targetTradePartnerId || null,
            workBoardTermsRevision: position.revision, workBoardTaskIds: position.sourceTaskIds,
            notes: `Work board ${position.id}, terms ${revision}; internal placement only` }, { actor: `worker:${worker.id}`, optional: false });
          if (assignment.requiresApproval) fail('Deze plaatsing vereist aanvullende beoordeling.', 409);
        } else if (!readiness.ready) holdReason = 'materials_or_source';
        else holdReason = 'standby_confirmation_required';
      }
      const id = existing?.id || randomUUID(), status = assignment ? 'assigned' : 'interested';
      if (existing) this.ledger.db.prepare('UPDATE work_board_applications SET status = ?, assignment_id = ? WHERE id = ?').run(status, assignment?.id || null, id);
      else this.ledger.db.prepare('INSERT INTO work_board_applications (id, position_id, account_id, status, assignment_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, positionId, accountId, status, assignment?.id || null, new Date().toISOString());
      this.ledger.audit({ entityType: 'work_board_application', entityId: id, jobId: position.jobId, action: status, actor: `applicant:${accountId}`, after: { positionId, revision, assignmentId: assignment?.id || null, holdReason } });
      if (assignment) this.notifyWorker({ workerId: worker.id, jobId: position.jobId, type: 'position_assigned', sourceId: id,
        sourceVersion: { assignmentId: assignment.id, positionRevision: position.revision },
        ...positionAssignmentNotice(position, assignment, job) });
      return { id, status, assignmentId: assignment?.id || null, holdReason };
    });
  }
  confirmApplication(applicationId) {
    const current = this.ledger.db.prepare('SELECT * FROM work_board_applications WHERE id = ?').get(applicationId);
    if (!current) fail('Inschrijving niet gevonden.', 404);
    if (current.status === 'assigned') return this.applicationRecord(current);
    fail('Een kantoor kan belangstelling niet omzetten in een plaatsing. Stuur een concreet aanbod; de uitvoerende moet dit zelf accepteren.', 409);
  }
  createPositionOffer(applicationId, input, actor) {
    const expiresAt = text(input.expiresAt, 'Verlooptijd aanbod', 40);
    const expiration = Date.parse(expiresAt);
    if (!Number.isFinite(expiration) || expiration <= Date.now() || expiration > Date.now() + 14 * 86400000) fail('Kies een toekomstige reactietermijn van maximaal 14 dagen.');
    return this.ledger.transaction(() => {
      const row = this.ledger.db.prepare('SELECT * FROM work_board_applications WHERE id = ?').get(applicationId);
      if (!row) fail('Inschrijving niet gevonden.', 404);
      const position = this.position(row.position_id);
      new (require('./work-context').WorkContext)(this.ledger).lock(position.jobId);
      this.ledger.db.prepare('UPDATE work_board_accounts SET status = status WHERE id = ?').run(row.account_id);
      this.ledger.db.prepare('UPDATE work_board_positions SET status = status WHERE id = ?').run(position.id);
      const latest = this.ledger.db.prepare('SELECT * FROM work_board_applications WHERE id = ?').get(applicationId);
      if (latest.status === 'offer_pending') {
        const previous = this.ledger.db.prepare('SELECT * FROM work_board_position_offers WHERE application_id = ? ORDER BY created_at DESC LIMIT 1').get(applicationId);
        if (!previous || previous.status !== 'offered' || previous.expires_at > new Date().toISOString()) fail('Er staat al een geldig aanbod open.', 409);
        const now = new Date().toISOString();
        this.ledger.db.prepare("UPDATE work_board_position_offers SET status = 'expired', responded_at = ? WHERE id = ? AND status = 'offered'").run(now, previous.id);
        this.ledger.db.prepare('UPDATE work_board_applications SET status = ? WHERE id = ? AND status = ?').run(previous.return_status, applicationId, 'offer_pending');
      }
      const current = this.ledger.db.prepare('SELECT * FROM work_board_applications WHERE id = ?').get(applicationId);
      if (!['interested', 'waitlisted'].includes(current.status)) fail('Alleen open belangstelling of een wachtlijstinschrijving kan een aanbod krijgen.', 409);
      const preflight = this.placementPreflight(current);
      const acceptanceDeadline = this.standbyAcceptanceDeadline(preflight.worker.id, preflight.position);
      if (acceptanceDeadline !== null && Date.now() > acceptanceDeadline) {
        fail('De minimale oproeptermijn voor deze stand-byperiode kan niet meer worden gehaald.', 409,
          { code: 'worker_standby_notice_insufficient' });
      }
      if (acceptanceDeadline !== null && expiration > acceptanceDeadline) {
        fail('Laat het aanbod uiterlijk verlopen vóór de minimale oproeptermijn afloopt.', 400,
          { code: 'worker_standby_offer_expiry_after_notice' });
      }
      const activeOffer = this.ledger.db.prepare("SELECT id FROM work_board_position_offers WHERE application_id = ? AND status = 'offered' AND expires_at > ?").get(applicationId, new Date().toISOString());
      if (activeOffer) fail('Er staat al een geldig aanbod open.', 409);
      const id = randomUUID(), createdAt = new Date().toISOString();
      this.ledger.db.prepare(`INSERT INTO work_board_position_offers
        (id, application_id, terms_revision, return_status, status, expires_at, actor, created_at)
        VALUES (?, ?, ?, ?, 'offered', ?, ?, ?)`)
        .run(id, applicationId, preflight.position.revision, current.status, new Date(expiration).toISOString(), actor, createdAt);
      this.ledger.db.prepare("UPDATE work_board_applications SET status = 'offer_pending' WHERE id = ?").run(applicationId);
      this.ledger.audit({ entityType: 'work_board_position_offer', entityId: id, jobId: position.jobId,
        action: 'offer_position_to_worker', actor, after: { applicationId, workerId: preflight.worker.id,
          termsRevision: preflight.position.revision, expiresAt: new Date(expiration).toISOString(), externalCommunication: false } });
      this.notifyWorker({ workerId: preflight.worker.id, jobId: position.jobId, type: 'position_offer', sourceId: id,
        sourceVersion: { termsRevision: preflight.position.revision, expiresAt: new Date(expiration).toISOString() },
        title: 'Werkpositie aan je aangeboden',
        body: `${preflight.position.title} · ${preflight.position.role}\n${notificationDate(preflight.position.startsAt)} – ${notificationDate(preflight.position.endsAt)} · ${preflight.position.hours} uur\n${preflight.position.city}\nReageer vóór ${notificationDate(new Date(expiration).toISOString())}.`,
        href: '/work-board.html#applications' });
      return this.applicationRecord(this.ledger.db.prepare('SELECT * FROM work_board_applications WHERE id = ?').get(applicationId));
    });
  }
  respondPositionOffer(accountId, applicationId, decision) {
    if (!['accept', 'decline'].includes(decision)) fail('Kies accepteren of weigeren.');
    return this.ledger.transaction(() => {
      const row = this.ledger.db.prepare('SELECT * FROM work_board_applications WHERE id = ? AND account_id = ?').get(applicationId, accountId);
      if (!row) fail('Aanbod niet gevonden.', 404);
      const position = this.position(row.position_id);
      new (require('./work-context').WorkContext)(this.ledger).lock(position.jobId);
      this.ledger.db.prepare('UPDATE work_board_accounts SET status = status WHERE id = ?').run(accountId);
      this.ledger.db.prepare('UPDATE work_board_positions SET status = status WHERE id = ?').run(position.id);
      const offer = this.ledger.db.prepare("SELECT * FROM work_board_position_offers WHERE application_id = ? AND status = 'offered' ORDER BY created_at DESC LIMIT 1").get(applicationId);
      if (!offer || row.status !== 'offer_pending') fail('Er staat geen open aanbod op deze inschrijving.', 409);
      const now = new Date().toISOString();
      if (offer.expires_at <= now) {
        this.ledger.db.prepare("UPDATE work_board_position_offers SET status = 'expired', responded_at = ? WHERE id = ? AND status = 'offered'").run(now, offer.id);
        this.ledger.db.prepare('UPDATE work_board_applications SET status = ? WHERE id = ? AND status = ?').run(offer.return_status, applicationId, 'offer_pending');
        this.ledger.audit({ entityType: 'work_board_position_offer', entityId: offer.id, jobId: position.jobId,
          action: 'expire_position_offer', actor: `worker:${accountId}`, before: { status: 'offered' }, after: { status: 'expired' } });
        return this.applicationRecord(this.ledger.db.prepare('SELECT * FROM work_board_applications WHERE id = ?').get(applicationId));
      }
      if (decision === 'decline') {
        this.ledger.db.prepare("UPDATE work_board_position_offers SET status = 'declined', responded_at = ? WHERE id = ? AND status = 'offered'").run(now, offer.id);
        this.ledger.db.prepare('UPDATE work_board_applications SET status = ? WHERE id = ? AND status = ?').run(offer.return_status, applicationId, 'offer_pending');
        this.ledger.audit({ entityType: 'work_board_position_offer', entityId: offer.id, jobId: position.jobId,
          action: 'decline_position_offer', actor: `worker:${accountId}`, before: { status: 'offered' }, after: { status: 'declined' } });
        return this.applicationRecord(this.ledger.db.prepare('SELECT * FROM work_board_applications WHERE id = ?').get(applicationId));
      }
      if (position.privacyReviewRequired || !position.workPackageCurrent) fail('Dit aanbod is gepauzeerd omdat de openbare opdrachtvoorwaarden zijn gewijzigd of opnieuw op privacy moeten worden gecontroleerd. Wacht op bijgewerkte voorwaarden van de aannemer.', 409);
      if (position.revision !== offer.terms_revision) fail('De positievoorwaarden zijn gewijzigd. Vraag een nieuw aanbod aan.', 409);
      this.ledger.db.prepare("UPDATE work_board_position_offers SET status = 'accepted', responded_at = ? WHERE id = ? AND status = 'offered'").run(now, offer.id);
      this.ledger.db.prepare('UPDATE work_board_applications SET status = ? WHERE id = ? AND status = ?').run(offer.return_status, applicationId, 'offer_pending');
      const placed = this.assignApplication(applicationId, `worker:${accountId}`);
      this.ledger.audit({ entityType: 'work_board_position_offer', entityId: offer.id, jobId: position.jobId,
        action: 'accept_position_offer', actor: `worker:${accountId}`, before: { status: 'offered' },
        after: { status: 'accepted', assignmentId: placed.assignmentId } });
      return placed;
    });
  }
  placementPreflight(row) {
    const position = this.position(row.position_id), account = this.account(row.account_id);
    if (account.status !== 'admitted' || !account.workerId) fail('De uitvoerende moet eerst zijn toegelaten.', 409);
    if (position.targetTradePartnerId && account.verifiedTradePartner?.id !== position.targetTradePartnerId) fail('De uitvoerende heeft geen geldige bedrijfsverificatie voor deze positie.', 409);
    if (!position.workPackageCurrent) fail('De positievoorwaarden, gekoppelde werkzaamheid of het werkpakket zijn gewijzigd; sluit en beoordeel de positie opnieuw.', 409);
    if (position.privacyReviewRequired) fail('Deze positie is tijdelijk geblokkeerd omdat de openbare voorwaarden mogelijk dossiergegevens bevatten. Sluit de positie en geef gecontroleerde voorwaarden opnieuw vrij.', 409);
    const job = this.ledger.getJobDetail(position.jobId, { includeAudit: false });
    if (['archived', 'cancelled', 'completed'].includes(job.status) || position.status !== 'open' || Date.parse(position.startsAt) <= Date.now()) fail('De opdracht of positie is niet meer actief.', 409);
    if (position.filled >= position.capacity) fail('Alle plaatsen zijn inmiddels bezet.', 409);
    const readiness = this.positionReadiness(position, job);
    if (!readiness.ready) fail('Plaatsing wacht: controleer eerst de gekoppelde materiaalbehoeften en taakbron.', 409);
    const worker = this.ledger.getWorker(account.workerId);
    if (worker.status !== 'available') fail('De actuele beschikbaarheidsstatus staat plaatsing niet toe.', 409);
    const matchesRole = skill => skill.toLowerCase() === position.role.toLowerCase();
    if (!account.skills.some(matchesRole) || !worker.skills.some(matchesRole)) fail('Dit vakgebied is niet meer toegelaten in het actuele profiel.', 409);
    const missingSkills = missingPositionSkills(position, [account.skills, worker.skills]);
    if (missingSkills.length) fail(`Vereiste aanvullende vaardigheden ontbreken in het actuele profiel: ${missingSkills.join(', ')}.`, 409);
    if (!this.ledger.assessWorkerQualifications(worker.id, { jobId: position.jobId, role: position.role, at: position.endsAt }).ready) fail('Vereiste kwalificaties ontbreken, zijn verlopen of nog niet goedgekeurd.', 409);
    const window = { workerId: worker.id, scheduledStart: position.startsAt, scheduledEnd: position.endsAt };
    if (this.ledger.findAssignmentConflicts(window).length || this.ledger.findWorkerAvailabilityConflicts(window).length) fail('Deze periode overlapt inmiddels met een opdracht of verhindering.', 409);
    return { position, account, worker, window, readiness };
  }
  withdrawInterest(accountId, applicationId) {
    return this.ledger.transaction(() => {
      const row = this.ledger.db.prepare('SELECT * FROM work_board_applications WHERE id = ? AND account_id = ?').get(applicationId, accountId);
      if (!row) fail('Inschrijving niet gevonden.', 404);
      const position = this.position(row.position_id);
      new (require('./work-context').WorkContext)(this.ledger).lock(position.jobId);
      this.ledger.db.prepare('UPDATE work_board_accounts SET status = status WHERE id = ?').run(accountId);
      this.ledger.db.prepare('UPDATE work_board_positions SET status = status WHERE id = ?').run(position.id);
      const current = this.ledger.db.prepare('SELECT * FROM work_board_applications WHERE id = ? AND account_id = ?').get(applicationId, accountId);
      if (current.status === 'withdrawn') return this.applicationRecord(current);
      if (!['interested', 'waitlisted'].includes(current.status) || current.assignment_id) fail('Alleen een nog niet geplaatste belangstelling of wachtlijstplek kan worden ingetrokken. Meld verhindering voor een bestaande plaatsing.', 409);
      this.ledger.db.prepare("UPDATE work_board_applications SET status = 'withdrawn' WHERE id = ? AND account_id = ? AND status IN ('interested', 'waitlisted')")
        .run(applicationId, accountId);
      this.ledger.audit({ entityType: 'work_board_application', entityId: applicationId, jobId: position.jobId,
        action: 'withdraw_worker_interest', actor: `applicant:${accountId}`, before: { status: current.status },
        after: { status: 'withdrawn', assignmentId: null }, metadata: { positionId: position.id, externalCommitments: 0 } });
      return this.applicationRecord(this.ledger.db.prepare('SELECT * FROM work_board_applications WHERE id = ?').get(applicationId));
    });
  }
  close(id, actor) {
    return this.ledger.transaction(() => {
      const position = this.position(id);
      this.ledger.db.prepare('UPDATE work_board_positions SET status = ? WHERE id = ?').run('closed', id);
      this.ledger.audit({ entityType: 'work_board_position', entityId: id, jobId: position.jobId, action: 'close_enrollment', actor, after: { status: 'closed' } });
      const offers = this.ledger.db.prepare(`SELECT offers.id, offers.application_id AS applicationId, offers.return_status AS returnStatus,
        applications.status AS applicationStatus
        FROM work_board_position_offers offers JOIN work_board_applications applications ON applications.id = offers.application_id
        WHERE applications.position_id = ? AND offers.status = 'offered'`).all(id);
      const now = new Date().toISOString();
      for (const offer of offers) {
        this.ledger.db.prepare("UPDATE work_board_position_offers SET status = 'revoked', responded_at = ? WHERE id = ? AND status = 'offered'").run(now, offer.id);
        if (offer.applicationStatus === 'offer_pending') {
          this.ledger.db.prepare("UPDATE work_board_applications SET status = ? WHERE id = ? AND status = 'offer_pending'").run(offer.returnStatus, offer.applicationId);
        }
        const applicationStatus = offer.applicationStatus === 'offer_pending' ? offer.returnStatus : offer.applicationStatus;
        this.ledger.audit({ entityType: 'work_board_position_offer', entityId: offer.id, jobId: position.jobId,
          action: 'revoke_position_offer_on_position_close', actor,
          before: { status: 'offered', applicationStatus: offer.applicationStatus },
          after: { status: 'revoked', applicationStatus }, metadata: { externalMessages: 0, externalCommitments: 0 } });
      }
      return this.position(id);
    });
  }
}
module.exports = { WorkBoard, migrateWorkBoard, migrateStandbyCallouts, migrateWorkBoardSessions, migratePositionOffers, migrateWorkBoardNotifications, migrateWorkerFieldReplyNotifications, fail, text };
