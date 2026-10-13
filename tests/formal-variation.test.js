const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { ContractorOperatingLedger } = require('../operating-ledger');

function temporaryLedger(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-formal-variation-'));
  const ledger = new ContractorOperatingLedger({ dbFile: path.join(directory, 'ledger.sqlite') });
  t.after(() => {
    ledger.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return ledger;
}

function configureOrganization(ledger) {
  ledger.updateOrganizationProfile({
    legalName: 'Formal Variation Contractor B.V.',
    tradingName: 'Formal Variation Contractor',
    registrationNumber: '12345678',
    vatNumber: 'NL123456789B01',
    email: 'commercial@variation.example',
    phone: '+31 20 555 0199',
    address: 'Contractstraat 9',
    postalCode: '1012 AB',
    city: 'Amsterdam',
    country: 'NL',
    iban: 'NL91 ABNA 0417 1643 00',
    defaultPaymentTermsDays: 30,
    defaultQuoteValidityDays: 30,
    quoteTerms: 'Changed work starts only after verified client acceptance.'
  }, { actor: 'owner' });
}

function variationPayload(entryKey, patch = {}) {
  return {
    entryKey,
    title: 'Revised access protection',
    scopeDelta: 'Add retained floor and wall protection for the revised access route.',
    variationType: 'client_request',
    initiatedBy: 'client',
    cause: 'The client instructed use of a different occupied-building access route.',
    justification: 'The retained contract scope priced direct access and does not include this additional protection.',
    contractReference: 'Retained contract scope section 3.2',
    noticeReference: 'CLIENT-INSTRUCTION-0042',
    requestedAt: '2026-07-21',
    responseDueAt: '2026-07-28',
    scheduleDeltaDays: 1,
    scheduleImpactNarrative: 'One additional calendar day is required for installation and removal of the protection.',
    riskImpact: 'medium',
    riskImpactStatement: 'Occupied access increases interface and damage exposure until protection is installed.',
    assumptions: ['The revised route remains available during the agreed working hours.'],
    exclusions: ['Out-of-hours access marshals are excluded.'],
    evidenceReferences: ['CLIENT-INSTRUCTION-0042', 'site-photo-access-0042'],
    taxRate: 21,
    status: 'submitted',
    lineItems: [{ description: 'Access protection', quantity: 2, unitPrice: 60, costCode: 'CO-ACCESS' }],
    ...patch
  };
}

function issueVariation(ledger, jobId, changeOrder) {
  const formalApproval = ledger.db.prepare('SELECT status FROM approvals WHERE id = ?').get(changeOrder.approvalId);
  if (formalApproval?.status === 'pending') {
    ledger.resolveApproval(changeOrder.approvalId, {
      status: 'approved',
      resolvedBy: 'commercial-approver',
      reason: 'Contract source, cause, price, schedule, risk, assumptions, and exclusions verified.'
    });
  }
  const issue = ledger.prepareChangeOrderIssuePackage(jobId, changeOrder.id, {}, { actor: 'commercial-operator' });
  ledger.resolveApproval(issue.approval.id, {
    status: 'approved',
    resolvedBy: 'delivery-approver',
    reason: 'Recipient and exact numbered package verified.'
  });
  ledger.recordCommunicationDelivery(issue.communication.id, {
    integration: 'verified-client-provider',
    providerMessageId: `provider-${changeOrder.id}`,
    receipt: { status: 'accepted-by-provider' }
  }, { actor: 'verified-integration' });
  return issue;
}

test('formal variations preserve exact replay, client revision control, and verified portal acceptance', t => {
  const ledger = temporaryLedger(t);
  configureOrganization(ledger);
  const job = ledger.createIntake({
    title: 'Occupied office refurbishment',
    client: { name: 'Variation Client', email: 'client@variation.example' },
    address: 'Projectstraat 12',
    city: 'Amsterdam',
    country: 'NL',
    contractValue: 1000,
    assignAutomatically: false
  }, { actor: 'intake' });

  const conversationOrigin = {
    evidenceKind: 'message_finding',
    accessId: 'private-portal-access-0042',
    messageId: 'private-message-0042',
    messageSourceHash: 'a'.repeat(64),
    quote: 'Please quote the revised <occupied> access route & keep it clear.',
    category: 'request',
    suggestion: 'Internal suggestion that must not appear in the customer package.',
    uncertainty: 'Internal uncertainty that must not appear in the customer package.',
    analysisIdentity: 'b'.repeat(64)
  };
  const first = ledger.createChangeOrder(job.id, variationPayload('formal-variation-entry-0001'), {
    actor: 'commercial-operator', conversationOrigin
  });
  assert.match(first.variationNumber, /^VAR-\d{4}-000001$/);
  assert.equal(first.revisionNumber, 1);
  assert.equal(first.integrityValid, true);
  assert.equal(first.sourceCurrent, true);
  assert.equal(first.workAuthorized, false);
  assert.equal(first.formalControl.workAuthorization, 'not_authorized_until_verified_client_acceptance');
  assert.equal(first.data.externalCommitments, 0);

  const replay = ledger.createChangeOrder(job.id, variationPayload('formal-variation-entry-0001'), {
    actor: 'retrying-operator', conversationOrigin
  });
  assert.equal(replay.id, first.id);
  assert.equal(replay.replayed, true);
  assert.equal(ledger.db.prepare('SELECT last_value FROM variation_number_sequences').get().last_value, 1);
  assert.throws(
    () => ledger.createChangeOrder(job.id, variationPayload('formal-variation-entry-0001', { scheduleDeltaDays: 2 })),
    error => error.code === 'variation_replay_conflict' && error.statusCode === 409
  );

  const firstIssue = issueVariation(ledger, job.id, first);
  assert.match(firstIssue.issueReference, /^CO-\d{4}-000001$/);
  assert.deepEqual(firstIssue.document.data.snapshot.changeOrder.conversationOrigin, conversationOrigin);
  const firstIssuePackage = ledger.getChangeOrderIssuePackage(firstIssue.document.id);
  assert.match(firstIssuePackage.html, /Customer request reference[\s\S]*Please quote the revised &lt;occupied&gt; access route &amp; keep it clear\./);
  assert.doesNotMatch(firstIssuePackage.html, /private-portal-access-0042|private-message-0042|Internal suggestion|Internal uncertainty|analysisIdentity/);
  const portalExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const access = ledger.createClientPortalAccess(job.id, { expiresAt: portalExpiry }, { actor: 'office' });
  ledger.resolveApproval(access.approval.id, { status: 'approved', resolvedBy: 'portal-approver' });
  const portal = ledger.getClientPortalSnapshot(access.portalToken);
  assert.equal(portal.job.variations.length, 1);
  assert.equal(portal.job.variations[0].variationNumber, first.variationNumber);
  assert.equal(portal.job.variations[0].responseAllowed, true);
  assert.equal(portal.job.variations[0].conversationOrigin, undefined);
  assert.equal(portal.job.variations[0].data, undefined);
  assert.doesNotMatch(JSON.stringify(portal), /private-portal-access-0042|private-message-0042|Internal suggestion|Internal uncertainty|analysisIdentity/);
  const downloaded = ledger.getClientPortalChangeOrderIssuePackage(access.portalToken, first.id);
  assert.equal(downloaded.packageHash, firstIssue.packageHash);
  assert.equal(downloaded.filename, `${first.variationNumber}-R1-${firstIssue.issueReference}.html`);
  assert.match(downloaded.html, /&lt;occupied&gt; access route &amp; keep it clear/);
  assert.doesNotMatch(downloaded.html, /private-portal-access-0042|private-message-0042|Internal suggestion|Internal uncertainty|analysisIdentity/);

  const requestedRevision = ledger.submitClientPortalChangeOrderResponse(access.portalToken, first.id, {
    responseId: 'variation-response-0001',
    decision: 'changes_requested',
    note: 'Please remove the wall protection and retain floor protection only.'
  });
  assert.equal(requestedRevision.approval.targetType, 'change_order_client_response');
  assert.equal(requestedRevision.response.status, 'pending_review');
  assert.equal(ledger.submitClientPortalChangeOrderResponse(access.portalToken, first.id, {
    responseId: 'variation-response-0001',
    decision: 'changes_requested',
    note: 'Please remove the wall protection and retain floor protection only.'
  }).replayed, true);
  ledger.resolveApproval(requestedRevision.approval.id, {
    status: 'approved',
    resolvedBy: 'client-response-reviewer',
    reason: 'The portal token, exact package, delivery receipt, and requested revision were verified.'
  });
  assert.equal(ledger.getJobDetail(job.id).changeOrders.find(item => item.id === first.id).status, 'changes_requested');
  assert.equal(ledger.getJobDetail(job.id).contractValue, 1000);
  const requestedFollowUp = ledger.buildTodayCommandPlan({ jobId: job.id }).actions.find(item => item.actionType === 'prepare_client_variation_revision');
  assert.equal(requestedFollowUp.data.changeOrderId, first.id);
  assert.equal(requestedFollowUp.data.clientResponseApprovalId, requestedRevision.approval.id);
  assert.equal(requestedFollowUp.safeDraftable, false);

  const revision = ledger.createChangeOrder(job.id, variationPayload('formal-variation-entry-0002', {
    supersedesChangeOrderId: first.id,
    title: 'Revised floor protection',
    scopeDelta: 'Add retained floor protection for the revised occupied-building access route.',
    justification: 'This revision implements the client request and removes wall protection from the prior proposal.',
    lineItems: [{ description: 'Floor protection', quantity: 2, unitPrice: 50, costCode: 'CO-ACCESS' }]
  }), { actor: 'commercial-operator' });
  assert.equal(revision.variationNumber, first.variationNumber);
  assert.equal(revision.revisionNumber, 2);
  assert.deepEqual(revision.snapshot.conversationOrigin, conversationOrigin);
  assert.deepEqual(revision.snapshot.revisionOrigin, {
    evidenceKind: 'client_variation_response',
    changeOrderId: first.id,
    variationNumber: first.variationNumber,
    revisionNumber: first.revisionNumber,
    approvalId: requestedRevision.approval.id,
    responseId: 'variation-response-0001',
    decision: 'changes_requested',
    note: 'Please remove the wall protection and retain floor protection only.',
    submittedAt: requestedRevision.response.submittedAt,
    portalAccessId: access.id,
    issueReference: firstIssue.issueReference,
    packageHash: firstIssue.packageHash,
    sourceBasisHash: firstIssue.document.data.snapshot.changeOrder.sourceBasisHash,
    formalSourceHash: first.sourceHash,
    formalSnapshotHash: first.snapshotHash
  });
  const revisionApproval = ledger.listApprovals({ status: 'pending' }).find(item => item.targetId === revision.id);
  assert.equal(revisionApproval.decision.preview.revisionOrigin.note, requestedRevision.response.note);
  const revisionIssue = issueVariation(ledger, job.id, revision);
  const revisionPackage = ledger.getChangeOrderIssuePackage(revisionIssue.document.id);
  assert.match(revisionPackage.html, /Customer revision request - response to VAR-[0-9]{4}-[0-9]{6} \/ R1[\s\S]*Please remove the wall protection and retain floor protection only\./);
  assert.doesNotMatch(revisionPackage.html, /private-portal-access-0042|private-message-0042|Internal suggestion|Internal uncertainty|analysisIdentity/);
  assert.equal(ledger.getJobDetail(job.id).changeOrders.find(item => item.id === first.id).status, 'superseded');

  assert.throws(
    () => ledger.submitClientPortalChangeOrderResponse(access.portalToken, revision.id, {
      responseId: 'variation-response-0002',
      decision: 'accepted',
      signerName: 'Authorized Client'
    }),
    error => error.code === 'variation_acceptance_authority_required'
  );
  const accepted = ledger.submitClientPortalChangeOrderResponse(access.portalToken, revision.id, {
    responseId: 'variation-response-0002',
    decision: 'accepted',
    signerName: 'Authorized Client',
    authorityConfirmed: true,
    note: 'Accepted against the downloaded numbered revision.'
  });
  assert.equal(accepted.response.packageHash, revisionIssue.packageHash);
  ledger.resolveApproval(accepted.approval.id, {
    status: 'approved',
    resolvedBy: 'contract-approver',
    reason: 'Signer authority, exact package, and verified delivery chain confirmed.'
  });

  const detail = ledger.getJobDetail(job.id, { includeAudit: true });
  const retainedRevision = detail.changeOrders.find(item => item.id === revision.id);
  assert.equal(retainedRevision.status, 'accepted');
  assert.equal(retainedRevision.workAuthorized, true);
  assert.equal(retainedRevision.data.acceptance.channel, 'client_portal');
  assert.equal(detail.contractValue, 1100);
  assert.ok(detail.audit.some(event => event.action === 'request_change_order_revision'));
  assert.ok(detail.audit.some(event => event.action === 'accept_change_order_contract'));

  const rejectedVariation = ledger.createChangeOrder(job.id, variationPayload('formal-variation-entry-0003', {
    title: 'Revised access marshal coverage',
    scopeDelta: 'Add an access marshal during occupied-building deliveries.',
    justification: 'The changed delivery route requires managed access during material arrival.',
    lineItems: [{ description: 'Access marshal', quantity: 1, unitPrice: 80, costCode: 'CO-ACCESS' }]
  }), { actor: 'commercial-operator' });
  const rejectedIssue = issueVariation(ledger, job.id, rejectedVariation);
  const rejectedResponse = ledger.submitClientPortalChangeOrderResponse(access.portalToken, rejectedVariation.id, {
    responseId: 'variation-response-0003',
    decision: 'rejected',
    note: 'Do not add a marshal; deliveries must remain within the existing site arrangement.'
  });
  ledger.resolveApproval(rejectedResponse.approval.id, {
    status: 'approved',
    resolvedBy: 'contract-approver',
    reason: 'Client response, authority, delivery and exact issued package verified.'
  });
  const rejectedFollowUp = ledger.buildTodayCommandPlan({ jobId: job.id }).actions.find(item => item.actionType === 'prepare_client_variation_revision');
  assert.equal(rejectedFollowUp.data.changeOrderId, rejectedVariation.id);
  assert.equal(rejectedFollowUp.data.clientResponseApprovalId, rejectedResponse.approval.id);
  const rejectionRevision = ledger.createChangeOrder(job.id, variationPayload('formal-variation-entry-0004', {
    supersedesChangeOrderId: rejectedVariation.id,
    title: 'Access arrangement without marshal',
    scopeDelta: 'Retain the existing site access arrangement without additional marshal coverage.',
    justification: 'This revision responds to the client rejection and removes the proposed marshal.',
    lineItems: [{ description: 'Access arrangement review', quantity: 1, unitPrice: 25, costCode: 'CO-ACCESS' }]
  }), { actor: 'commercial-operator' });
  ledger.resolveApproval(rejectionRevision.approvalId, {
    status: 'rejected',
    resolvedBy: 'commercial-approver',
    reason: 'The revised scope and price basis need additional internal evidence.'
  });
  const internalRejectionFollowUp = ledger.buildTodayCommandPlan({ jobId: job.id }).actions.find(item => item.actionType === 'prepare_client_variation_revision');
  assert.equal(internalRejectionFollowUp.data.changeOrderId, rejectionRevision.id);
  assert.match(internalRejectionFollowUp.message, /internal approval rejected/);
  const revisedAfterInternalRejection = ledger.createChangeOrder(job.id, variationPayload('formal-variation-entry-0005', {
    supersedesChangeOrderId: rejectionRevision.id,
    title: 'Access arrangement review revision',
    scopeDelta: 'Retain current site access and clarify the delivery coordination responsibilities.',
    justification: 'This revision addresses the internal review while preserving the client rejection as its source.',
    lineItems: [{ description: 'Access coordination review', quantity: 1, unitPrice: 30, costCode: 'CO-ACCESS' }]
  }), { actor: 'commercial-operator' });
  assert.equal(revisedAfterInternalRejection.revisionNumber, 3);
  assert.deepEqual(revisedAfterInternalRejection.snapshot.revisionOrigin, rejectionRevision.snapshot.revisionOrigin);
  ledger.resolveApproval(revisedAfterInternalRejection.approvalId, {
    status: 'approved',
    resolvedBy: 'commercial-approver',
    reason: 'Current contract source, revision response, scope and price verified.'
  });
  assert.equal(ledger.getJobDetail(job.id).changeOrders.find(item => item.id === rejectedVariation.id).status, 'superseded');
  assert.equal(ledger.getJobDetail(job.id).changeOrders.find(item => item.id === rejectionRevision.id).status, 'superseded');
  assert.equal(ledger.buildTodayCommandPlan({ jobId: job.id }).actions.some(item => item.actionType === 'prepare_client_variation_revision'), false);
  assert.equal(rejectionRevision.snapshot.revisionOrigin.decision, 'rejected');
  assert.equal(rejectionRevision.snapshot.revisionOrigin.issueReference, rejectedIssue.issueReference);
  assert.equal(rejectionRevision.snapshot.revisionOrigin.note, 'Do not add a marshal; deliveries must remain within the existing site arrangement.');
  const rejectionRevisionIssue = issueVariation(ledger, job.id, revisedAfterInternalRejection);
  const rejectionRevisionPackage = ledger.getChangeOrderIssuePackage(rejectionRevisionIssue.document.id);
  assert.match(rejectionRevisionPackage.html, /Customer rejection reason - response to VAR-[0-9]{4}-[0-9]{6} \/ R1[\s\S]*Do not add a marshal; deliveries must remain within the existing site arrangement\./);

  const diagnostics = ledger.diagnose();
  assert.equal(diagnostics.valid, true, JSON.stringify(diagnostics.issues));
  assert.equal(ledger.verifyAuditIntegrity().valid, true);
});

test('manual variation acceptance revalidates source and delivery at approval time', t => {
  const ledger = temporaryLedger(t);
  configureOrganization(ledger);
  const job = ledger.createIntake({
    title: 'Variation approval revalidation',
    client: { name: 'Approval Client', email: 'approval@variation.example' },
    address: 'Controleweg 4',
    city: 'Utrecht',
    country: 'NL',
    contractValue: 1000,
    assignAutomatically: false
  }, { actor: 'intake' });
  const variation = ledger.createChangeOrder(
    job.id,
    variationPayload('formal-variation-revalidation-0001'),
    { actor: 'commercial-operator' }
  );
  const issue = issueVariation(ledger, job.id, variation);
  const acceptance = ledger.requestChangeOrderAcceptance(job.id, variation.id, {
    acceptedAt: '2026-07-21T14:00:00.000Z',
    evidenceReference: 'signed-variation-revalidation-0001'
  }, { actor: 'office-commercial' });

  ledger.db.prepare('UPDATE jobs SET contract_value = 1001 WHERE id = ?').run(job.id);
  assert.throws(
    () => ledger.resolveApproval(acceptance.approval.id, {
      status: 'approved',
      resolvedBy: 'contract-approver',
      reason: 'Acceptance evidence reviewed.'
    }),
    error => error.code === 'formal_variation_source_stale' && error.statusCode === 409
  );
  assert.equal(ledger.db.prepare('SELECT status FROM approvals WHERE id = ?').get(acceptance.approval.id).status, 'pending');

  ledger.db.prepare('UPDATE jobs SET contract_value = 1000 WHERE id = ?').run(job.id);
  ledger.db.prepare("UPDATE communication_records SET status = 'draft' WHERE id = ?").run(issue.communication.id);
  assert.throws(
    () => ledger.resolveApproval(acceptance.approval.id, {
      status: 'approved',
      resolvedBy: 'contract-approver',
      reason: 'Acceptance evidence reviewed.'
    }),
    error => error.code === 'change_order_acceptance_issue_chain_invalid' && error.statusCode === 409
  );
  assert.equal(ledger.db.prepare('SELECT status FROM approvals WHERE id = ?').get(acceptance.approval.id).status, 'pending');

  ledger.db.prepare("UPDATE communication_records SET status = 'sent' WHERE id = ?").run(issue.communication.id);
  ledger.resolveApproval(acceptance.approval.id, {
    status: 'approved',
    resolvedBy: 'contract-approver',
    reason: 'Acceptance evidence and the exact delivery chain were verified.'
  });
  const retained = ledger.getJobDetail(job.id).changeOrders.find(item => item.id === variation.id);
  assert.equal(retained.status, 'accepted');
  assert.equal(retained.workAuthorized, true);
  assert.equal(ledger.getJobDetail(job.id).contractValue, 1120);
});
