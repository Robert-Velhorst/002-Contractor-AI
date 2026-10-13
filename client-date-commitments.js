const crypto = require('node:crypto');
const { stableJson } = require('./backup-manifest');

const digest = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex');
const fail = (code, message, statusCode = 400) => { throw Object.assign(new Error(message), { code, statusCode }); };
function text(value, label, max = 500) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || [...value].some(char => char.charCodeAt(0) < 32 && !'\t\r\n'.includes(char))) {
    fail('client_date_commitment_input_invalid', `${label} ontbreekt of is ongeldig.`);
  }
  return value.trim();
}

class ClientDateCommitments {
  constructor(ledger) { this.ledger = ledger; this.db = ledger.db; }

  source(jobId, type, id) {
    const table = type === 'quote' ? 'quotes' : type === 'change_order' ? 'change_orders' : null;
    if (!table) return null;
    const row = this.db.prepare(`SELECT * FROM ${table} WHERE id = ? AND job_id = ?`).get(id, jobId);
    if (!row) return null;
    const item = type === 'quote' ? this.ledger.mapQuote(row) : this.ledger.mapChangeOrder(row);
    const approvalId = item.data?.acceptance?.approvalId;
    if (item.status !== 'accepted' || !approvalId) return null;
    const approval = type === 'quote'
      ? this.db.prepare(`SELECT * FROM approvals WHERE id = ? AND job_id = ? AND target_type = 'quote_acceptance' AND target_id = ? AND status = 'approved'`)
        .get(approvalId, jobId, id)
      : this.db.prepare(`SELECT * FROM approvals WHERE id = ? AND job_id = ? AND status = 'approved'
          AND ((target_type = 'change_order_acceptance' AND target_id = ?)
            OR (target_type = 'change_order_client_response' AND target_id = ?))`)
        .get(approvalId, jobId, id, approvalId);
    if (!approval || approval.resolved_by !== item.data.acceptance.verifiedBy || approval.resolved_at !== item.data.acceptance.verifiedAt) return null;
    let approvalData;
    try { approvalData = JSON.parse(approval.data_json || '{}'); } catch { return null; }
    if (type === 'change_order' && approval.target_type === 'change_order_client_response'
      && (approvalData.changeOrderId !== id || approvalData.decision !== 'accepted' || approvalData.authorityConfirmed !== true)) return null;
    if (approvalData.evidenceReference !== item.data.acceptance.evidenceReference
      || approvalData.acceptedAt !== item.data.acceptance.acceptedAt) return null;
    if (type === 'change_order') {
      const acceptance = item.data.acceptance, issue = item.data.issuePackage;
      if (item.integrityValid !== true || item.sourceCurrent !== true
        || acceptance.packageHash !== issue?.packageHash || acceptance.issueReference !== issue?.issueReference
        || acceptance.deliveryCommunicationId !== issue?.communicationId || acceptance.documentId !== issue?.documentId
        || approvalData.packageHash !== acceptance.packageHash || approvalData.issueReference !== acceptance.issueReference
        || approvalData.deliveryCommunicationId !== acceptance.deliveryCommunicationId) return null;
      try {
        const packageRecord = this.ledger.getChangeOrderIssuePackage(issue.documentId, { audit: false });
        const delivery = this.ledger.getCommunication(issue.communicationId);
        if (packageRecord.packageHash !== acceptance.packageHash || delivery.status !== 'sent'
          || delivery.data?.sourceRecordId !== id || delivery.data?.packageHash !== acceptance.packageHash
          || delivery.data?.deliveryReceipt?.providerMessageId !== acceptance.providerMessageId
          || !delivery.data?.deliveryReceipt) return null;
      } catch { return null; }
    }
    const basis = { type, id, title: type === 'quote' ? `Offerte ${id}` : item.title,
      acceptedAt: item.data.acceptance.acceptedAt, evidenceReference: item.data.acceptance.evidenceReference,
      approvalId, verifiedAt: item.data.acceptance.verifiedAt,
      packageHash: type === 'change_order' ? item.data.acceptance.packageHash : null };
    return { ...basis, sourceHash: digest(basis) };
  }

  commitments(jobId) {
    return this.db.prepare(`SELECT * FROM audit_events WHERE job_id = ? AND entity_type = 'client_date_commitment' ORDER BY sequence_number, id`)
      .all(jobId).map(row => {
        let after;
        try { after = JSON.parse(row.after_json || 'null'); } catch { after = null; }
        return after && typeof after === 'object' ? after : null;
      }).filter(Boolean);
  }

  view(jobId) {
    if (!this.db.prepare('SELECT id FROM jobs WHERE id = ?').get(jobId)) fail('job_not_found', 'Opdracht niet gevonden.', 404);
    const acceptedSources = [
      ...this.db.prepare("SELECT id FROM quotes WHERE job_id = ? AND status = 'accepted' ORDER BY id").all(jobId).map(row => this.source(jobId, 'quote', row.id)),
      ...this.db.prepare("SELECT id FROM change_orders WHERE job_id = ? AND status = 'accepted' ORDER BY id").all(jobId).map(row => this.source(jobId, 'change_order', row.id))
    ].filter(Boolean);
    const histories = new Map();
    for (const item of this.commitments(jobId)) {
      const list = histories.get(item.entryKey) || [];
      list.push(item); histories.set(item.entryKey, list);
    }
    const commitments = [...histories.values()].map(rows => {
      const current = rows.at(-1);
      const source = current.status === 'active' ? this.source(jobId, current.source.type, current.source.id) : null;
      return { ...current, commitmentHash: digest(current), sourceCurrent: current.status !== 'active' || Boolean(source && source.sourceHash === current.source.sourceHash),
        history: rows };
    }).sort((a, b) => a.entryKey.localeCompare(b.entryKey));
    const sourceHash = digest({ acceptedSources, commitments });
    return { jobId, acceptedSources, commitments, sourceHash, externalCommitments: 0 };
  }

  command(jobId, input, actor) {
    if (!input || !['record', 'withdraw'].includes(input.action)) fail('client_date_commitment_action_invalid', 'Kies vastleggen of intrekken.');
    const entryKey = text(input.entryKey, 'Mijlpaalsleutel', 120), commandKey = text(input.commandKey, 'Wijzigingssleutel', 160);
    const requestHash = digest(input), entityId = digest({ jobId, entryKey });
    return this.ledger.transaction(() => {
      const view = this.view(jobId);
      const events = this.db.prepare("SELECT metadata_json, after_json FROM audit_events WHERE job_id = ? AND entity_type = 'client_date_commitment' ORDER BY sequence_number, id").all(jobId);
      for (const event of events) {
        let metadata;
        try { metadata = JSON.parse(event.metadata_json || '{}'); } catch { continue; }
        if (metadata.commandKey === commandKey) {
          if (metadata.requestHash === requestHash) return { ...JSON.parse(event.after_json), replayed: true, externalCommitments: 0 };
          fail('client_date_commitment_replay_conflict', 'Deze mijlpaalsleutel is al voor andere gegevens gebruikt.', 409);
        }
      }
      if (input.sourceHash !== view.sourceHash) fail('client_date_commitment_source_changed', 'Contractbron of datums zijn gewijzigd. Ververs en controleer opnieuw.', 409);
      const prior = view.commitments.find(item => item.entryKey === entryKey);
      let after;
      if (input.action === 'record') {
        const source = view.acceptedSources.find(item => item.type === input.sourceType && item.id === input.sourceId);
        if (!source || source.sourceHash !== input.acceptedSourceHash) fail('client_date_commitment_source_invalid', 'Kies een actuele, gecontroleerd geaccepteerde contractbron.', 409);
        if (!['start_on', 'milestone_by', 'complete_by'].includes(input.dateKind)) fail('client_date_commitment_date_kind_invalid', 'Kies een geldig type contractdatum.');
        if (typeof input.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date) || new Date(`${input.date}T00:00:00.000Z`).toISOString().slice(0, 10) !== input.date) {
          fail('client_date_commitment_date_invalid', 'Vul een bestaande kalenderdatum in als JJJJ-MM-DD.');
        }
        if (prior && (input.expectedCommitmentHash !== prior.commitmentHash || prior.status !== 'active')) fail('client_date_commitment_revision_conflict', 'De mijlpaal is gewijzigd of ingetrokken. Ververs voordat je een nieuwe versie vastlegt.', 409);
        if (!prior && input.expectedCommitmentHash) fail('client_date_commitment_revision_conflict', 'Deze mijlpaal bestaat nog niet in het actuele overzicht.', 409);
        after = { id: entityId, jobId, entryKey, revision: (prior?.revision || 0) + 1, status: 'active', dateKind: input.dateKind,
          date: input.date, label: text(input.label, 'Mijlpaal', 160), contractWording: text(input.contractWording, 'Letterlijke contracttekst', 1000),
          evidenceReference: text(input.evidenceReference, 'Contractdocument en paginaverwijzing', 300), source,
          recordedBy: actor, recordedAt: this.ledger.clock().toISOString() };
      } else {
        if (!prior || prior.status !== 'active' || input.expectedCommitmentHash !== prior.commitmentHash) fail('client_date_commitment_revision_conflict', 'Alleen de actuele actieve mijlpaal kan worden ingetrokken.', 409);
        after = { ...prior, revision: prior.revision + 1, status: 'withdrawn', withdrawalReason: text(input.withdrawalReason, 'Reden van intrekking', 500),
          recordedBy: actor, recordedAt: this.ledger.clock().toISOString() };
      }
      this.ledger.audit({ entityType: 'client_date_commitment', entityId, jobId, action: `client_date_commitment_${input.action}`, actor,
        before: prior || null, after, metadata: { entryKey, commandKey, requestHash, externalCommitments: 0 } });
      return { ...after, replayed: false, sourceHash: this.view(jobId).sourceHash, externalCommitments: 0 };
    });
  }
}

module.exports = { ClientDateCommitments, digest };
