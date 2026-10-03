const { WorkBoard, fail } = require('./work-board');
const { FieldWorkPack } = require('./field-work-pack');
const isWorkBoardPath = path => path === '/api/work-board' || path.startsWith('/api/work-board/');

function registerWorkBoardRoutes(app, { ledger, sendError, actor, authLimit, originAllowed, enabled = true }) {
  const board = new WorkBoard(ledger), packs = new FieldWorkPack(ledger);
  const token = req => String(req.headers.authorization || '').replace(/^Bearer /, '');
  const run = fn => async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (!enabled) fail('Het werkbord is niet geactiveerd voor deze omgeving.', 503);
      if (req.method === 'POST' && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) fail('Een JSON-object is vereist.');
      res.json({ success: true, ...await fn(req) });
    }
    catch (error) { sendError(req, res, error.statusCode || 500, error.code || 'work_board_failed', error.statusCode ? error.message : 'Aanvraag mislukt.'); }
  };
  const owner = req => { if (req.operator?.role !== 'owner') fail('Alleen de eigenaar kan dit beheren.', 403); };
  const account = req => token(req) ? board.authenticate(token(req)) : board.identityAccount(req.operator);
  const notificationWorker = req => {
    if (/^[a-f0-9]{64}$/.test(token(req))) {
      const self = board.authenticate(token(req));
      return self.workerId || null;
    }
    const operator = req.operator;
    if (!operator?.authenticated || operator.role !== 'field_worker' || !operator.scope?.workerId) fail('Meld je aan als gekoppelde uitvoerende.', 401);
    if (operator.source === 'identity') return board.identityAccount(operator).workerId;
    return operator.scope.workerId;
  };
  app.use('/api/work-board', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && (!req.is('application/json') || !originAllowed(req))) return sendError(req, res, 403, 'work_board_request_forbidden', 'Gebruik een vertrouwde aanvraag met JSON.');
    next();
  });
  app.post('/api/work-board/register', authLimit, run(async req => ({ account: await board.register(req.body) })));
  app.post('/api/work-board/login', authLimit, run(req => board.login(req.body)));
  app.post('/api/work-board/logout', run(req => { board.logout(token(req)); return {}; }));
  app.get('/api/work-board/me', run(req => { const self = account(req); const { admission: _admission, ...safe } = self; const applications = board.applications(self.id).map(row => ({ ...row, position: board.workerApplicationPosition(row) })); return { account: safe, applications, standbyCallouts: self.status === 'admitted' && self.workerId ? board.workerStandbyCallouts(self.workerId) : [], notifications: board.workerNotifications(self.id) }; }));
  app.post('/api/work-board/profile/skills', run(req => {
    const result = board.updateSkills(account(req).id, req.body);
    const { admission: _admission, ...safe } = result.account;
    return { ...result, account: safe };
  }));
  app.post('/api/work-board/profile/regions', run(req => {
    const result = board.updateWorkRegions(account(req).id, req.body);
    const { admission: _admission, ...safe } = result.account;
    return { ...result, account: safe };
  }));
  app.get('/api/work-board/notifications', run(req => { const workerId = notificationWorker(req); return workerId ? board.workerNotificationsForWorker(workerId) : { notifications: [], unreadCount: 0 }; }));
  app.post('/api/work-board/notifications/:id/read', run(req => ({ notification: board.markWorkerNotificationReadForWorker(notificationWorker(req), req.params.id) })));
  app.get('/api/work-board/privacy/requests', run(req => {
    const self = account(req), subjectId = self.workerId || self.id;
    const result = ledger.listDataSubjectRequests({ subjectType: 'worker', status: 'all', limit: 500 });
    return { requests: result.requests.filter(item => item.subjectId === subjectId) };
  }));
  app.post('/api/work-board/privacy/requests', run(req => {
    const self = account(req), subjectId = self.workerId || self.id;
    const request = ledger.createDataSubjectRequest({
      subjectType: 'worker', subjectId,
      requestType: req.body.requestType || req.body.request_type,
      channel: 'work_board',
      requesterReference: `authenticated_work_board_account:${self.id}`,
      details: req.body.details || req.body.notes
    }, { actor: `work_board_account:${self.id}` });
    return { request };
  }));
  app.get('/api/work-board/privacy/requests/:requestId', run(req => {
    const self = account(req), request = ledger.getDataSubjectRequest(req.params.requestId);
    if (request.subjectType !== 'worker' || request.subjectId !== (self.workerId || self.id)) fail('Verzoek niet gevonden.', 404);
    return { request, inventory: ledger.dataSubjectInventory(request.subjectType, request.subjectId) };
  }));
  app.get('/api/work-board/positions', run(req => { const self = account(req); return { positions: board.positionsForAccount(self.id) }; }));
  app.get('/api/work-board/positions/:id/enrollment-check', run(req => ({ check: board.enrollmentCheck(account(req).id, req.params.id) })));
  const admittedWorker = req => {
    const self = account(req);
    if (self.status !== 'admitted' || !self.workerId) fail('Alleen toegelaten uitvoerenden kunnen een verhindering melden.', 403);
    return self;
  };
  const ownAvailability = workerId => {
    const periods = ledger.listWorkerAvailability({ workerId, limit: 250 });
    const horizonEnd = new Date(Date.now() + 366 * 24 * 60 * 60 * 1000).toISOString();
    const conflicts = periods.flatMap(period => ledger.expandWorkerAvailabilityPeriods(
      [period], new Date().toISOString(), horizonEnd
    ).flatMap(occurrence => ledger.findAssignmentConflicts({
      workerId, scheduledStart: occurrence.startsAt, scheduledEnd: occurrence.endsAt
    }).map(item => ({ assignmentId: item.assignmentId, jobTitle: item.jobTitle,
      scheduledStart: item.scheduledStart, scheduledEnd: item.scheduledEnd,
      status: period.status, periodId: period.id }))));
    return { periods, conflicts };
  };
  app.get('/api/work-board/availability', run(req => ({ availability: ownAvailability(admittedWorker(req).workerId) })));
  app.post('/api/work-board/availability', run(req => {
    const self = admittedWorker(req);
    const mode = req.body.mode || 'unavailable';
    if (!['unavailable', 'standby'].includes(mode)) fail('Kies verhindering of standby op afroep.');
    const payload = { ...req.body,
      periodType: mode === 'standby' ? 'standby' : 'unavailable',
      title: mode === 'standby' ? 'Beschikbaar op afroep' : 'Niet beschikbaar',
      source: 'field_worker_portal' };
    delete payload.workerId;
    delete payload.worker_id;
    delete payload.notes;
    delete payload.operationalNotes;
    delete payload.operational_notes;
    delete payload.medicalDetails;
    delete payload.medical_details;
    delete payload.healthDetails;
    delete payload.health_details;
    delete payload.diagnosis;
    delete payload.illness;
    const result = ledger.transaction(() => {
      const availability = ledger.createWorkerAvailabilityPeriod(self.workerId, payload, { actor: `field_worker:${self.workerId}` });
      for (const invalidated of availability.invalidatedCallouts || []) {
        board.notifyStandbyCalloutStatus(invalidated.calloutId, 'revoked');
      }
      return availability;
    });
    const availability = ownAvailability(self.workerId);
    const conflicts = availability.conflicts.filter(item => item.periodId === result.period.id);
    return { period: result.period, conflicts, replayed: result.replayed, invalidatedCallouts: result.invalidatedCallouts || [] };
  }));
  app.post('/api/work-board/availability/:id/request-cancellation', run(req => {
    const self = admittedWorker(req);
    const result = ledger.requestWorkerAvailabilityCancellation(self.workerId, req.params.id,
      { reason: 'De uitvoerende meldt gewijzigde beschikbaarheid en vraagt herbeoordeling.' },
      { actor: `field_worker:${self.workerId}` });
    return { period: result.period, approvalId: result.approval?.id || result.period.cancellationApprovalId || null, replayed: result.replayed };
  }));
  app.post('/api/work-board/standby-callouts/:id/respond', run(req => {
    const self = admittedWorker(req);
    return { callout: board.respondToStandbyCallout(self.workerId, req.params.id, req.body.decision) };
  }));
  app.post('/api/work-board/positions/:id/enroll', run(req => ({ application: board.enroll(account(req).id, req.params.id, req.body.revision) })));
  app.post('/api/work-board/applications/:id/withdraw', run(req => ({ application: board.withdrawInterest(account(req).id, req.params.id) })));
  app.post('/api/work-board/applications/:id/release-request', run(req => {
    const self = admittedWorker(req);
    return board.requestAssignmentRelease(self.id, req.params.id, req.body || {});
  }));
  app.post('/api/work-board/applications/:id/offer/respond', run(req => ({ application: board.respondPositionOffer(account(req).id, req.params.id, req.body.decision) })));
  const assigned = req => {
    const self = account(req);
    if (self.status !== 'admitted') fail('Toelating vereist.', 403);
    const application = board.applications(self.id).find(row => row.positionId === req.params.id && row.status === 'assigned');
    if (!application) fail('Geen plaatsing voor deze positie.', 403);
    packs.assertAssigned(application.position.jobId, self.workerId);
    if (!application.assignmentId) fail('De plaatsing mist een gekoppelde dienst. Neem contact op met de aannemer.', 409);
    return { jobId: application.position.jobId, workerId: self.workerId, assignmentId: application.assignmentId };
  };
  app.get('/api/work-board/positions/:id/pack', run(req => {
    const scope = assigned(req), pack = packs.read(scope.jobId, scope.workerId);
    const positionAssignment = pack.assignments.find(row => row.id === scope.assignmentId);
    if (!positionAssignment) fail('De dienst is niet langer actief in dit werkpakket. Vernieuw de opdracht.', 409);
    return { pack: { ...pack, positionId: req.params.id, positionAssignment } };
  }));
  app.post('/api/work-board/positions/:id/progress', run(req => {
    const scope = assigned(req);
    return packs.progress(scope.jobId, scope.workerId, req.body, `field_worker:${scope.workerId}`);
  }));
  app.get('/api/ledger/work-board/accounts', run(req => { owner(req); return {
    accounts: board.accounts().filter(item => item.authSource !== 'identity'),
    tradePartners: ledger.listTradePartners({ status: 'active', partnerType: 'subcontractor', limit: 500 })
      .map(({ id, name }) => ({ id, name }))
  }; }));
  app.post('/api/ledger/work-board/accounts/:id/admit', run(req => { owner(req); return { account: board.admit(req.params.id, req.body, actor(req)) }; }));
  app.post('/api/ledger/work-board/accounts/:id/review-skills', run(req => { owner(req); return { account: board.reviewSkillsChange(req.params.id, req.body, actor(req)) }; }));
  app.post('/api/ledger/work-board/accounts/:id/suspend', run(req => { owner(req); board.suspend(req.params.id, actor(req)); return {}; }));
  app.get('/api/ledger/jobs/:id/work-board', run(req => {
    if (!['owner', 'office_operator', 'approver'].includes(req.operator?.role)) fail('Kantoortoegang vereist.', 403);
    const callouts = ledger.db.prepare('SELECT id FROM standby_callouts WHERE job_id = ? ORDER BY created_at DESC LIMIT 100').all(req.params.id).map(row => board.mapStandbyCallout(row.id));
    return { positions: board.positions({ jobId: req.params.id, office: true }),
      tradePartners: ledger.listTradePartners({ status: 'active', partnerType: 'subcontractor', limit: 500 }).map(({ id, name }) => ({ id, name })),
      applications: board.jobApplications(req.params.id),
      replacementOpportunities: board.replacementOpportunities(req.params.id), standbyCallouts: callouts, ...board.suggest(req.params.id) };
  }));
  app.post('/api/ledger/jobs/:id/assignments/:assignmentId/standby-callouts', run(req => {
    owner(req);
    return { callout: board.createStandbyCallout(req.params.id, req.params.assignmentId, req.body, actor(req)) };
  }));
  app.post('/api/ledger/work-board/standby-callouts/:id/request-replacement', run(req => {
    owner(req);
    const callout = board.mapStandbyCallout(req.params.id);
    if (!['accepted'].includes(callout.status)) fail('De uitvoerende moet deze oproep eerst accepteren.', 409);
    return ledger.requestAssignmentReplacement(callout.jobId, callout.assignmentId, {
      workerId: callout.workerId, availabilityPeriodId: callout.availabilityPeriodId,
      standbyCalloutId: callout.id, reason: req.body.reason || callout.reason
    }, { actor: actor(req) });
  }));
  app.post('/api/ledger/jobs/:id/work-board', run(req => {
    owner(req);
    const position = req.body.intent === 'save_draft'
      ? board.saveDraft(req.params.id, req.body, actor(req))
      : board.publish(req.params.id, req.body, actor(req));
    return { position };
  }));
  app.post('/api/ledger/work-board/applications/:id/confirm', run(req => { owner(req); return { application: board.confirmApplication(req.params.id) }; }));
  app.post('/api/ledger/work-board/applications/:id/offer', run(req => {
    if (!['owner', 'office_operator', 'approver'].includes(req.operator?.role)) fail('Kantoortoegang vereist.', 403);
    return { application: board.createPositionOffer(req.params.id, req.body, actor(req)) };
  }));
  app.post('/api/ledger/work-board/positions/:id/close', run(req => { owner(req); return { position: board.close(req.params.id, actor(req)) }; }));
  return board;
}
module.exports = { registerWorkBoardRoutes, isWorkBoardPath };
