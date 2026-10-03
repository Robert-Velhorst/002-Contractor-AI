const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { ContractorOperatingLedger, BID_DECISION_CRITERIA, BID_DECISION_GATES } = require('../operating-ledger');
const { SharedMaterialStock } = require('../shared-material-stock');

function temporaryLedger(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-bid-decision-'));
  const ledger = new ContractorOperatingLedger({ dbFile: path.join(directory, 'ledger.sqlite') });
  t.after(() => {
    ledger.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return ledger;
}

function marketPolicy(overrides = {}) {
  return {
    entryKey: 'bid-decision-market-policy-0001',
    reason: 'Set current market-fit evidence before governing pursuit decisions.',
    profileName: 'Bid decision market focus',
    services: ['Renovation'],
    clientSegments: ['Homeowner'],
    sourceChannels: ['Referral'],
    minJobValue: 5_000,
    maxJobValue: 150_000,
    fitThreshold: 70,
    serviceAreas: [{ label: 'Arnhem pursuit area', country: 'NL', postalPrefixes: ['68'], cities: ['Arnhem'] }],
    ...overrides
  };
}

function decisionPolicy(overrides = {}) {
  return {
    entryKey: 'bid-decision-policy-0001',
    reason: 'Adopt the weighted pursuit scorecard and explicit commercial gates.',
    policyName: 'Standard pursuit scorecard',
    bidThreshold: 70,
    noBidThreshold: 45,
    criteria: BID_DECISION_CRITERIA.map(criterion => ({
      key: criterion.key,
      weight: criterion.weight,
      minimumRating: criterion.minimumRating
    })),
    ...overrides
  };
}

function scorecard(overrides = {}) {
  return {
    criteria: BID_DECISION_CRITERIA.filter(criterion => criterion.source === 'operator').map(criterion => ({
      key: criterion.key,
      rating: 5,
      evidence: `${criterion.label} verified against current retained commercial evidence.`
    })),
    gates: BID_DECISION_GATES.map(gate => ({ key: gate.key, status: 'yes' })),
    ...overrides
  };
}

function approvedMarketFit(ledger) {
  const requested = ledger.requestMarketFitProfile(marketPolicy(), { actor: 'owner' });
  ledger.resolveApproval(requested.approval.id, {
    status: 'approved', resolvedBy: 'commercial-approver', reason: 'Market focus and service area verified.'
  });
}

function qualifiedOpportunity(ledger, suffix = 'primary', capacityForecast = null) {
  const opportunity = ledger.createOpportunity({
    clientName: `Pursuit Client ${suffix}`,
    title: `Arnhem renovation ${suffix}`,
    service: 'Renovation',
    clientSegment: 'Homeowner',
    sourceChannel: 'Referral',
    postalCode: '6811AA',
    city: 'Arnhem',
    country: 'NL',
    estimatedValue: 45_000,
    ...(capacityForecast ? { capacityForecast } : {})
  });
  ledger.retainOpportunityFitAssessment(opportunity.id, {
    entryKey: `bid-decision-fit-${suffix}-0001`
  }, { actor: 'office' });
  return opportunity;
}

test('bid recommendation derives trade-hour feasibility from current profiles and retained commitments', t => {
  const ledger = temporaryLedger(t);
  approvedMarketFit(ledger);
  const window = { windowStart: '2030-01-07', windowEnd: '2030-01-11' };
  const weekdayDemand = hours => [
    { date: '2030-01-07', hours }, { date: '2030-01-08', hours }, { date: '2030-01-09', hours },
    { date: '2030-01-10', hours }, { date: '2030-01-11', hours }
  ];
  const feasibleOpportunity = qualifiedOpportunity(ledger, 'crew-feasible', {
    ...window, trades: [{ role: 'Installer', hours: 32, dailyDemand: weekdayDemand(6.4).slice(0, 5) }]
  });
  const shortOpportunity = qualifiedOpportunity(ledger, 'crew-short', {
    ...window, trades: [{ role: 'Installer', hours: 41, dailyDemand: weekdayDemand(8.2) }]
  });
  const mixedOpportunity = qualifiedOpportunity(ledger, 'crew-mixed', {
    ...window, trades: [{ role: 'Installer', hours: 41, dailyDemand: weekdayDemand(8.2) }, { role: 'Carpenter', hours: 8, dailyDemand: [{ date: '2030-01-07', hours: 8 }] }]
  });
  const undatedOpportunity = qualifiedOpportunity(ledger, 'crew-undated', {
    ...window, trades: [{ role: 'Electrician', hours: 16, dailyDemand: [{ date: '2030-01-07', hours: 8 }, { date: '2030-01-08', hours: 8 }] }]
  });
  approvedDecisionPolicy(ledger);
  const worker = ledger.upsertWorker({ name: 'Forecast installer', role: 'Installer', status: 'available' });
  ledger.setCrewCapacityProfile(worker.id, {
    effectiveFrom: window.windowStart,
    timezone: 'Europe/Amsterdam',
    dailyHours: { sunday: 0, monday: 8, tuesday: 8, wednesday: 8, thursday: 8, friday: 8, saturday: 0 }
  });
  const electrician = ledger.upsertWorker({ name: 'Undated electrician', role: 'Electrician', status: 'available' });
  ledger.setCrewCapacityProfile(electrician.id, {
    effectiveFrom: window.windowStart,
    timezone: 'Europe/Amsterdam',
    dailyHours: { sunday: 0, monday: 8, tuesday: 8, wednesday: 8, thursday: 8, friday: 8, saturday: 0 }
  });
  const undatedJob = ledger.convertOpportunityToJob(undatedOpportunity.id, {}, { actor: 'office' }).job;
  ledger.addAssignment(undatedJob.id, {
    workerId: electrician.id,
    role: 'Electrician',
    status: 'confirmed'
  }, { actor: 'office' });

  const feasible = ledger.evaluateOpportunityBidDecision(feasibleOpportunity.id, scorecard());
  assert.equal(feasible.capacityAssessment.status, 'within_known_capacity');
  assert.equal(feasible.capacityAssessment.trades[0].knownRemainingHours, 40);
  assert.equal(feasible.recommendation, 'bid');
  assert.equal(feasible.capacityAssessment.safeguards.assignmentsChanged, 0);

  const undated = ledger.evaluateOpportunityBidDecision(undatedOpportunity.id, scorecard());
  assert.equal(undated.capacityAssessment.status, 'unknown');
  assert.ok(undated.capacityAssessment.gaps.some(gap => gap.code === 'assignment_window_unknown'));
  assert.equal(undated.recommendation, 'review');

  const shortfall = ledger.evaluateOpportunityBidDecision(shortOpportunity.id, scorecard());
  assert.equal(shortfall.capacityAssessment.status, 'shortfall');
  assert.equal(shortfall.gates.find(gate => gate.key === 'capacity_available').status, 'yes');
  assert.equal(shortfall.gates.find(gate => gate.key === 'capacity_available').outcome, 'block');
  assert.equal(shortfall.recommendation, 'no_bid');
  assert.ok(shortfall.blockers.includes('capacity_available'));

  const mixed = ledger.evaluateOpportunityBidDecision(mixedOpportunity.id, scorecard());
  assert.equal(mixed.capacityAssessment.status, 'shortfall');
  assert.ok(mixed.capacityAssessment.gaps.some(gap => gap.code === 'trade_role_not_in_workforce'));
  assert.equal(mixed.gates.find(gate => gate.key === 'capacity_available').outcome, 'block');
  assert.equal(mixed.recommendation, 'no_bid');

  ledger.setCrewCapacityProfile(worker.id, {
    effectiveFrom: window.windowStart,
    timezone: 'Europe/Amsterdam',
    dailyHours: { sunday: 0, monday: 10, tuesday: 10, wednesday: 10, thursday: 10, friday: 10, saturday: 0 },
    entryKey: 'bid-capacity-profile-expanded-01'
  });
  const refreshed = ledger.evaluateOpportunityBidDecision(shortOpportunity.id, scorecard());
  assert.equal(refreshed.capacityAssessment.status, 'within_known_capacity');
  assert.notEqual(refreshed.sourceHash, shortfall.sourceHash);
});

test('bid capacity does not let one assignment allocation cover another overlapping assignment', t => {
  const ledger = temporaryLedger(t);
  approvedMarketFit(ledger);
  const day = '2030-01-07';
  const opportunity = qualifiedOpportunity(ledger, 'crew-overlapping-assignments', {
    windowStart: day,
    windowEnd: day,
    trades: [{ role: 'Installer', hours: 4, dailyDemand: [{ date: day, hours: 4 }] }]
  });
  approvedDecisionPolicy(ledger);
  const worker = ledger.upsertWorker({ name: 'Overlapping installer', role: 'Installer', status: 'available' });
  ledger.setCrewCapacityProfile(worker.id, {
    effectiveFrom: day,
    timezone: 'Europe/Amsterdam',
    dailyHours: { sunday: 0, monday: 8, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 0 }
  });

  const retainedJob = ledger.createIntake({
    client: { name: 'First retained client', country: 'NL' },
    title: 'First overlapping shift',
    scheduledStart: `${day}T08:00:00.000Z`,
    scheduledEnd: `${day}T16:00:00.000Z`,
    assignAutomatically: false
  }, { actor: 'capacity-test' });
  const retainedAssignment = ledger.addAssignment(retainedJob.id, {
    workerId: worker.id,
    role: 'Installer',
    status: 'confirmed',
    scheduledStart: `${day}T08:00:00.000Z`,
    scheduledEnd: `${day}T12:00:00.000Z`
  }, { actor: 'capacity-test' });
  ledger.createCrewCapacityAllocation({
    assignmentId: retainedAssignment.id,
    workDate: day,
    plannedHours: 4
  }, { actor: 'capacity-test' });

  const secondJob = ledger.createIntake({
    client: { name: 'Second retained client', country: 'NL' },
    title: 'Second overlapping shift',
    scheduledStart: `${day}T12:00:00.000Z`,
    scheduledEnd: `${day}T16:00:00.000Z`,
    assignAutomatically: false
  }, { actor: 'capacity-test' });
  ledger.addAssignment(secondJob.id, {
    workerId: worker.id,
    role: 'Installer',
    status: 'confirmed',
    scheduledStart: `${day}T12:00:00.000Z`,
    scheduledEnd: `${day}T16:00:00.000Z`
  }, { actor: 'capacity-test' });

  const decision = ledger.evaluateOpportunityBidDecision(opportunity.id, scorecard());
  assert.equal(decision.capacityAssessment.status, 'shortfall');
  assert.equal(decision.capacityAssessment.trades[0].dailyDemandAssessment[0].knownAvailableHours, 0);
  assert.ok(decision.capacityAssessment.gaps.some(gap => gap.code === 'assignment_without_day_allocation' && gap.date === day));
  assert.equal(decision.gates.find(gate => gate.key === 'capacity_available').outcome, 'block');
  assert.equal(decision.recommendation, 'no_bid');
});

test('opportunity capacity requires a dated demand distribution before it can pass the capacity gate', t => {
  const ledger = temporaryLedger(t);
  approvedMarketFit(ledger);
  const opportunity = qualifiedOpportunity(ledger, 'crew-distribution-missing', {
    windowStart: '2030-01-07', windowEnd: '2030-01-11',
    trades: [{ role: 'Installer', hours: 16 }]
  });
  approvedDecisionPolicy(ledger);
  const worker = ledger.upsertWorker({ name: 'Unscheduled installer', role: 'Installer', status: 'available' });
  ledger.setCrewCapacityProfile(worker.id, {
    effectiveFrom: '2030-01-07', timezone: 'Europe/Amsterdam',
    dailyHours: { sunday: 0, monday: 8, tuesday: 8, wednesday: 8, thursday: 8, friday: 8, saturday: 0 }
  });
  const decision = ledger.evaluateOpportunityBidDecision(opportunity.id, scorecard());
  assert.equal(decision.capacityAssessment.status, 'unknown');
  assert.ok(decision.capacityAssessment.gaps.some(gap => gap.code === 'daily_demand_distribution_missing'));
  assert.equal(decision.gates.find(gate => gate.key === 'capacity_available').outcome, 'missing_evidence');
  assert.equal(decision.recommendation, 'review');
});

test('dated opportunity demand detects a daily peak despite sufficient total window hours', t => {
  const ledger = temporaryLedger(t);
  approvedMarketFit(ledger);
  const opportunity = qualifiedOpportunity(ledger, 'crew-daily-peak', {
    windowStart: '2030-01-07', windowEnd: '2030-01-11',
    trades: [{ role: 'Installer', hours: 32, dailyDemand: [
      { date: '2030-01-07', hours: 20 }, { date: '2030-01-08', hours: 3 },
      { date: '2030-01-09', hours: 3 }, { date: '2030-01-10', hours: 3 }, { date: '2030-01-11', hours: 3 }
    ] }]
  });
  approvedDecisionPolicy(ledger);
  const worker = ledger.upsertWorker({ name: 'Peak-limited installer', role: 'Installer', status: 'available' });
  ledger.setCrewCapacityProfile(worker.id, {
    effectiveFrom: '2030-01-07', timezone: 'Europe/Amsterdam',
    dailyHours: { sunday: 0, monday: 8, tuesday: 8, wednesday: 8, thursday: 8, friday: 8, saturday: 0 }
  });
  const decision = ledger.evaluateOpportunityBidDecision(opportunity.id, scorecard());
  assert.equal(decision.capacityAssessment.trades[0].knownRemainingHours, 40);
  assert.equal(decision.capacityAssessment.status, 'shortfall');
  assert.equal(decision.capacityAssessment.trades[0].dailyDemandAssessment[0].observedShortfall, true);
  assert.equal(decision.recommendation, 'no_bid');
});

test('required qualification evidence gates opportunity crew capacity and stales a pending decision approval', t => {
  const ledger = temporaryLedger(t);
  approvedMarketFit(ledger);
  const opportunity = qualifiedOpportunity(ledger, 'crew-qualified', {
    windowStart: '2030-01-07', windowEnd: '2030-01-07',
    trades: [{ role: 'Installer', hours: 8, requiredQualifications: ['vca'], dailyDemand: [{ date: '2030-01-07', hours: 8 }] }]
  });
  approvedDecisionPolicy(ledger);
  const worker = ledger.upsertWorker({ name: 'Installer with pending VCA', role: 'Installer', status: 'available' });
  ledger.setCrewCapacityProfile(worker.id, {
    effectiveFrom: '2030-01-07', timezone: 'Europe/Amsterdam',
    dailyHours: { sunday: 0, monday: 8, tuesday: 8, wednesday: 8, thursday: 8, friday: 8, saturday: 0 }
  });

  const withoutProof = ledger.evaluateOpportunityBidDecision(opportunity.id, scorecard());
  assert.equal(withoutProof.capacityAssessment.status, 'shortfall');
  assert.equal(withoutProof.capacityAssessment.trades[0].knownRemainingHours, 0);
  assert.equal(withoutProof.capacityAssessment.trades[0].qualificationReadiness.qualifiedWorkers, 0);
  assert.ok(withoutProof.capacityAssessment.gaps.some(gap => gap.code === 'worker_qualification_not_ready'));

  const requested = ledger.requestOpportunityBidDecision(opportunity.id, {
    entryKey: 'opportunity-qualified-capacity-0001',
    ...scorecard(),
    proposedDecision: 'no_bid',
    rationale: 'Do not pursue until required qualified workforce capacity is evidenced.'
  }, { actor: 'office' });
  const credential = ledger.requestWorkerCredential(worker.id, {
    credentialType: 'vca_basic',
    issuer: 'Verified VCA examination centre',
    credentialNumber: 'VCA-QUALIFIED-CAPACITY-001',
    issuedOn: new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10),
    expiresOn: new Date(Date.now() + 3650 * 86_400_000).toISOString().slice(0, 10),
    evidenceReference: 'Reviewed current certificate evidence for VCA-QUALIFIED-CAPACITY-001'
  }, { actor: 'office' });
  ledger.resolveApproval(credential.approval.id, {
    status: 'approved', resolvedBy: 'qualification-approver', reason: 'Issuer, identity, dates and certificate evidence checked.'
  });

  const withProof = ledger.evaluateOpportunityBidDecision(opportunity.id, scorecard());
  assert.equal(withProof.capacityAssessment.status, 'within_known_capacity');
  assert.equal(withProof.capacityAssessment.trades[0].knownRemainingHours, 8);
  assert.equal(withProof.capacityAssessment.trades[0].qualificationReadiness.qualifiedWorkers, 1);
  assert.notEqual(withProof.sourceHash, withoutProof.sourceHash);
  assert.throws(() => ledger.resolveApproval(requested.approval.id, {
    status: 'approved', resolvedBy: 'commercial-approver', reason: 'Try to approve the stale workforce decision.'
  }), error => error.code === 'bid_decision_stale' && error.statusCode === 409);
});

test('opportunity crew review separates exact worker-declared skill signals from verified capacity', t => {
  const ledger = temporaryLedger(t);
  approvedMarketFit(ledger);
  const opportunity = qualifiedOpportunity(ledger, 'declared-skills', {
    windowStart: '2030-01-07', windowEnd: '2030-01-07',
    trades: [{ role: 'Installer', hours: 8, requiredSkills: ['timber framing'], dailyDemand: [{ date: '2030-01-07', hours: 8 }] }]
  });
  approvedDecisionPolicy(ledger);
  const worker = ledger.upsertWorker({ name: 'Skill-listed installer', role: 'Installer', status: 'available', skills: ['Timber Framing'] });
  ledger.setCrewCapacityProfile(worker.id, {
    effectiveFrom: '2030-01-07', timezone: 'Europe/Amsterdam',
    dailyHours: { sunday: 0, monday: 8, tuesday: 8, wednesday: 8, thursday: 8, friday: 8, saturday: 0 }
  });
  const other = ledger.upsertWorker({ name: 'Installer without listed skill', role: 'Installer', status: 'available', skills: ['drywall'] });
  ledger.setCrewCapacityProfile(other.id, {
    effectiveFrom: '2030-01-07', timezone: 'Europe/Amsterdam',
    dailyHours: { sunday: 0, monday: 8, tuesday: 8, wednesday: 8, thursday: 8, friday: 8, saturday: 0 }
  });

  const decision = ledger.evaluateOpportunityBidDecision(opportunity.id, scorecard());
  const trade = decision.capacityAssessment.trades[0];
  assert.equal(trade.knownRemainingHours, 16);
  assert.equal(trade.declaredSkillReadiness.evidence, 'self_declared_unverified');
  assert.equal(trade.declaredSkillReadiness.matchedWorkers, 1);
  assert.equal(trade.declaredSkillReadiness.knownRemainingHours, 8);
  assert.equal(trade.declaredSkillReadiness.dailyDemandAssessment[0].observedShortfall, false);
  assert.ok(decision.capacityAssessment.gaps.some(gap => gap.code === 'worker_declared_skill_not_listed' && gap.workerId === other.id));
  assert.ok(decision.capacityAssessment.scopeLimits.includes('declared_skills_are_unverified'));

  ledger.upsertWorker({
    id: worker.id, name: worker.name, role: worker.role, status: worker.status,
    skills: [...worker.skills, 'Wall sheathing']
  });
  const changedWorkerAssessment = ledger.evaluateOpportunityBidDecision(opportunity.id, scorecard());
  assert.notEqual(changedWorkerAssessment.sourceHash, decision.sourceHash);
});

test('opportunity capacity separately models peak supervision headcount and checks the supervisor role', t => {
  const ledger = temporaryLedger(t);
  approvedMarketFit(ledger);
  const opportunity = qualifiedOpportunity(ledger, 'supervision-capacity', {
    windowStart: '2030-01-07', windowEnd: '2030-01-07',
    trades: [{ role: 'Installer', hours: 32, dailyDemand: [{ date: '2030-01-07', hours: 32 }], supervision: {
      role: 'Site Supervisor', workersPerSupervisor: 4,
      dailyDemand: [{ date: '2030-01-07', crewSize: 8, supervisorShiftHours: 8 }]
    } }]
  });
  approvedDecisionPolicy(ledger);
  for (let index = 0; index < 4; index += 1) {
    const worker = ledger.upsertWorker({ name: `Supervised installer ${index}`, role: 'Installer', status: 'available' });
    ledger.setCrewCapacityProfile(worker.id, {
      effectiveFrom: '2030-01-07', timezone: 'Europe/Amsterdam',
      dailyHours: { sunday: 0, monday: 8, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 0 }
    });
  }
  const supervisor = ledger.upsertWorker({ name: 'Available site supervisor', role: 'Site Supervisor', status: 'available' });
  ledger.setCrewCapacityProfile(supervisor.id, {
    effectiveFrom: '2030-01-07', timezone: 'Europe/Amsterdam',
    dailyHours: { sunday: 0, monday: 8, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 0 }
  });

  const oneSupervisor = ledger.evaluateOpportunityBidDecision(opportunity.id, scorecard());
  const supervision = oneSupervisor.capacityAssessment.trades.find(item => item.demandKind === 'supervision');
  assert.equal(supervision.role, 'Site Supervisor');
  assert.equal(supervision.requiredHours, 16);
  assert.equal(supervision.knownRemainingHours, 8);
  assert.equal(supervision.supervisionFor[0].supervisorsRequired, 2);
  assert.equal(supervision.supervisionFor[0].requiredHours, 16);
  assert.equal(oneSupervisor.capacityAssessment.status, 'shortfall');
  assert.ok(oneSupervisor.capacityAssessment.scopeLimits.includes('supervision_is_an_estimated_distinct_role'));

  const secondSupervisor = ledger.upsertWorker({ name: 'Second site supervisor', role: 'Site Supervisor', status: 'available' });
  ledger.setCrewCapacityProfile(secondSupervisor.id, {
    effectiveFrom: '2030-01-07', timezone: 'Europe/Amsterdam',
    dailyHours: { sunday: 0, monday: 8, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 0 }
  });
  const twoSupervisors = ledger.evaluateOpportunityBidDecision(opportunity.id, scorecard());
  assert.equal(twoSupervisors.capacityAssessment.status, 'within_known_capacity');
  assert.equal(twoSupervisors.capacityAssessment.trades.find(item => item.demandKind === 'supervision').knownRemainingHours, 16);
  assert.notEqual(twoSupervisors.sourceHash, oneSupervisor.sourceHash);
});

function approvedDecisionPolicy(ledger) {
  const requested = ledger.requestBidDecisionPolicy(decisionPolicy(), { actor: 'owner' });
  ledger.resolveApproval(requested.approval.id, {
    status: 'approved', resolvedBy: 'commercial-approver', reason: 'Pursuit weights, thresholds, and gates verified.'
  });
  return requested;
}

test('opportunity material readiness uses exact warehouse stock and marks competing pipeline demand without reserving', t => {
  const ledger = temporaryLedger(t);
  const stock = new SharedMaterialStock(ledger);
  const material = stock.count({ name: 'Exterior insulation board', sku: 'INS-001', unit: 'm2', countedQuantity: 10,
    reference: 'STOCK-INS-001', note: 'Verified warehouse count.', entryKey: 'stock-ins-001' }).material;
  const create = (suffix, quantity, unit = 'm2') => ledger.createOpportunity({
    clientName: `Material Client ${suffix}`,
    title: `Material forecast ${suffix}`,
    materialForecast: [{ materialId: material.id, quantity, unit }]
  }, { actor: 'office' });
  const current = create('current', 4);
  create('competing', 7);
  const committedJob = ledger.createIntake({ title: 'Existing reserved material job', clientName: 'Committed stock client', assignAutomatically: false });
  const requirement = ledger.addMaterialRequirement(committedJob.id, {
    name: material.name, materialId: material.id, quantity: 2, unit: material.unit
  });
  stock.reserve(committedJob.id, {
    materialRequirementId: requirement.id, quantity: 2, sourceReference: 'STOCK-INS-001', entryKey: 'reserve-ins-001'
  }, { actor: 'office' });
  approvedMarketFit(ledger);
  ledger.retainOpportunityFitAssessment(current.id, { entryKey: 'material-current-fit-0001' }, { actor: 'office' });
  approvedDecisionPolicy(ledger);

  const contested = ledger.evaluateOpportunityBidDecision(current.id).materialReadiness;
  assert.equal(contested.status, 'pipeline_contention');
  assert.equal(contested.materials[0].availableQuantity, 8);
  assert.equal(contested.materials[0].competingPipelineQuantity, 7);
  assert.equal(contested.materials[0].pipelineShortfallQuantity, 3);
  assert.equal(contested.safeguards.reservationsChanged, 0);
  assert.equal(contested.safeguards.ordersPlaced, 0);
  assert.equal(stock.list().materials.find(row => row.id === material.id).availableQuantity, 8);
  const decision = ledger.requestOpportunityBidDecision(current.id, {
    entryKey: 'material-readiness-decision-0001', ...scorecard(), proposedDecision: 'bid',
    rationale: 'Current material stock and competing pipeline demand were reviewed.',
    overrideReason: 'Retain this pursuit for review while reconciling the exact material needs.'
  }, { actor: 'office' });
  ledger.resolveApproval(decision.approval.id, {
    status: 'approved', resolvedBy: 'approver', reason: 'The internal pursuit decision was reviewed.'
  });
  assert.equal(ledger.bidDecisionRegister().opportunities.find(item => item.opportunity.id === current.id).stale, false);

  ledger.updateOpportunity(ledger.listOpportunities({ limit: 10 }).find(item => item.title.endsWith('competing')).id, {
    stage: 'lost', lostReason: 'Client selected another contractor.'
  }, { actor: 'office' });
  const uncontested = ledger.evaluateOpportunityBidDecision(current.id).materialReadiness;
  assert.equal(uncontested.status, 'within_known_stock');
  assert.equal(uncontested.materials[0].competingOpportunityCount, 0);
  assert.notEqual(uncontested.sourceHash, contested.sourceHash);

  stock.count({ materialId: material.id, countedQuantity: 3, reference: 'STOCK-INS-002', note: 'Recount after issue.', entryKey: 'stock-ins-002' });
  const shortfall = ledger.evaluateOpportunityBidDecision(current.id).materialReadiness;
  assert.equal(shortfall.status, 'shortfall');
  assert.equal(shortfall.materials[0].shortfallQuantity, 3);
  assert.notEqual(shortfall.sourceHash, uncontested.sourceHash);
  assert.equal(ledger.bidDecisionRegister().opportunities.find(item => item.opportunity.id === current.id).stale, true);
});

test('opportunity material forecasts require exact IDs, unique rows, and valid quantities and units', t => {
  const ledger = temporaryLedger(t);
  const base = { clientName: 'Material Validation Client', title: 'Material forecast validation' };
  assert.throws(() => ledger.createOpportunity({ ...base, materialForecast: [{ materialId: 'mat-a', quantity: 1, unit: 'm2' }, { materialId: 'mat-a', quantity: 2, unit: 'm2' }] }),
    error => error.code === 'opportunity_material_id_invalid');
  assert.throws(() => ledger.createOpportunity({ ...base, materialForecast: [{ materialId: 'mat-a', quantity: 0, unit: 'm2' }] }),
    error => error.code === 'opportunity_material_quantity_invalid');
  assert.throws(() => ledger.createOpportunity({ ...base, materialForecast: [{ materialId: 'mat-a', quantity: 1, unit: '' }] }),
    error => error.code === 'opportunity_material_unit_invalid');
});

test('bid/no-bid policy and pursuit decisions are replay-safe, approval-gated, source-bound, and stage-neutral', t => {
  const ledger = temporaryLedger(t);
  approvedMarketFit(ledger);
  const opportunity = qualifiedOpportunity(ledger);

  const requestedPolicy = ledger.requestBidDecisionPolicy(decisionPolicy(), { actor: 'owner' });
  assert.equal(requestedPolicy.policy.status, 'pending_approval');
  assert.equal(requestedPolicy.policy.integrityValid, true);
  assert.equal(ledger.activeBidDecisionPolicy(), null);
  assert.equal(ledger.requestBidDecisionPolicy(decisionPolicy(), { actor: 'owner' }).replayed, true);
  assert.throws(
    () => ledger.requestBidDecisionPolicy(decisionPolicy({ bidThreshold: 80 }), { actor: 'owner' }),
    error => error.code === 'bid_decision_policy_replay_conflict' && error.statusCode === 409
  );
  ledger.resolveApproval(requestedPolicy.approval.id, {
    status: 'approved', resolvedBy: 'commercial-approver', reason: 'Scorecard governance verified.'
  });
  assert.equal(ledger.activeBidDecisionPolicy().id, requestedPolicy.policy.id);

  const evaluation = ledger.evaluateOpportunityBidDecision(opportunity.id, scorecard());
  assert.equal(evaluation.score, 100);
  assert.equal(evaluation.recommendation, 'bid');
  assert.equal(evaluation.marketFit.current, true);
  assert.equal(evaluation.criteria.length, 6);
  assert.equal(evaluation.gates.length, 5);
  assert.deepEqual(evaluation.blockers, []);
  assert.deepEqual(evaluation.evidenceGaps, []);
  assert.equal(evaluation.opportunityStageMutation, false);
  assert.equal(evaluation.externalCommitments, 0);

  const requested = ledger.requestOpportunityBidDecision(opportunity.id, {
    entryKey: 'opportunity-bid-decision-0001',
    ...scorecard(),
    proposedDecision: 'bid',
    rationale: 'The retained evidence supports investing in this pursuit.'
  }, { actor: 'office' });
  assert.equal(requested.decision.status, 'pending_approval');
  assert.equal(requested.decision.integrityValid, true);
  assert.equal(requested.approval.targetType, 'opportunity_bid_decision');
  assert.equal(requested.approval.data.requiresExceptionOverride, false);
  assert.equal(ledger.requestOpportunityBidDecision(opportunity.id, {
    entryKey: 'opportunity-bid-decision-0001',
    ...scorecard(),
    proposedDecision: 'bid',
    rationale: 'The retained evidence supports investing in this pursuit.'
  }, { actor: 'office' }).replayed, true);
  assert.equal(ledger.getOpportunity(opportunity.id).stage, 'new');

  ledger.resolveApproval(requested.approval.id, {
    status: 'approved', resolvedBy: 'commercial-approver', reason: 'Pursuit evidence verified.'
  });
  let register = ledger.bidDecisionRegister();
  let row = register.opportunities.find(item => item.opportunity.id === opportunity.id);
  assert.equal(row.currentDecision.proposedDecision, 'bid');
  assert.equal(row.currentDecision.status, 'approved');
  assert.equal(row.stale, false);
  assert.equal(ledger.getOpportunity(opportunity.id).stage, 'new');

  const noBidScorecard = scorecard({
    gates: BID_DECISION_GATES.map(gate => ({
      key: gate.key,
      status: gate.key === 'contract_risk_acceptable' ? 'no' : 'yes'
    }))
  });
  const noBidEvaluation = ledger.evaluateOpportunityBidDecision(opportunity.id, noBidScorecard);
  assert.equal(noBidEvaluation.recommendation, 'no_bid');
  assert.deepEqual(noBidEvaluation.blockers, ['contract_risk_acceptable']);
  const noBid = ledger.requestOpportunityBidDecision(opportunity.id, {
    entryKey: 'opportunity-bid-decision-0002',
    ...noBidScorecard,
    proposedDecision: 'no_bid',
    rationale: 'The retained contract risk is outside the approved pursuit tolerance.'
  }, { actor: 'office' });
  ledger.resolveApproval(noBid.approval.id, {
    status: 'approved', resolvedBy: 'commercial-approver', reason: 'The contract-risk stop gate is supported.'
  });
  register = ledger.bidDecisionRegister();
  row = register.opportunities.find(item => item.opportunity.id === opportunity.id);
  assert.equal(row.currentDecision.proposedDecision, 'no_bid');
  assert.equal(ledger.getOpportunityBidDecision(requested.decision.id).status, 'superseded');
  assert.equal(ledger.getOpportunity(opportunity.id).stage, 'new');
  assert.equal(register.summary.noBid, 1);
  assert.equal(ledger.diagnose().valid, true);
  assert.equal(ledger.migrationStatus().currentVersion, '096_loading_read_indexes');
});

test('recommendation overrides require rationale and approval rejects stale pursuit evidence atomically', t => {
  const ledger = temporaryLedger(t);
  approvedMarketFit(ledger);
  const opportunity = qualifiedOpportunity(ledger, 'override');
  approvedDecisionPolicy(ledger);
  const blockedScorecard = scorecard({
    gates: BID_DECISION_GATES.map(gate => ({ key: gate.key, status: gate.key === 'capacity_available' ? 'no' : 'yes' }))
  });
  assert.equal(ledger.evaluateOpportunityBidDecision(opportunity.id, blockedScorecard).recommendation, 'no_bid');
  assert.throws(
    () => ledger.requestOpportunityBidDecision(opportunity.id, {
      entryKey: 'opportunity-bid-override-0001',
      ...blockedScorecard,
      proposedDecision: 'bid',
      rationale: 'Management wants to pursue this strategically important project.'
    }, { actor: 'office' }),
    error => error.code === 'bid_decision_override_reason_required'
  );
  const requested = ledger.requestOpportunityBidDecision(opportunity.id, {
    entryKey: 'opportunity-bid-override-0001',
    ...blockedScorecard,
    proposedDecision: 'bid',
    rationale: 'Management wants to pursue this strategically important project.',
    overrideReason: 'A verified subcontract capacity option is awaiting final confirmation.'
  }, { actor: 'office' });
  assert.equal(requested.decision.snapshot.override, true);
  assert.equal(requested.approval.data.requiresExceptionOverride, true);

  ledger.updateOpportunity(opportunity.id, { estimatedValue: 55_000 }, { actor: 'office' });
  assert.throws(
    () => ledger.resolveApproval(requested.approval.id, {
      status: 'approved', resolvedBy: 'commercial-approver', reason: 'Approve the documented exception.'
    }),
    error => error.code === 'bid_decision_stale' && error.statusCode === 409
  );
  assert.equal(ledger.listApprovals({ status: 'pending' }).some(approval => approval.id === requested.approval.id), true);
  assert.equal(ledger.getOpportunityBidDecision(requested.decision.id).status, 'pending_approval');
  ledger.resolveApproval(requested.approval.id, {
    status: 'rejected', resolvedBy: 'commercial-approver', reason: 'Refresh the scorecard against the changed opportunity value.'
  });
  assert.equal(ledger.getOpportunityBidDecision(requested.decision.id).status, 'rejected');
});

test('autonomous pursuit logic opens one internal review and never creates a decision or external action', t => {
  const ledger = temporaryLedger(t);
  approvedMarketFit(ledger);
  const opportunity = qualifiedOpportunity(ledger, 'automation');
  approvedDecisionPolicy(ledger);

  const preview = ledger.runAutonomousCycle({ dryRun: true, actionTypes: ['review_bid_decision'] });
  const action = preview.preview.find(item => item.opportunityId === opportunity.id);
  assert.ok(action);
  assert.match(action.message, /Automation cannot choose, close, or contact the lead/);
  const first = ledger.runAutonomousCycle({ actionTypes: ['review_bid_decision'] });
  assert.equal(first.applied.length, 1);
  assert.equal(first.applied[0].status, 'task_created');
  const activity = ledger.listOpportunityActivities({ opportunityId: opportunity.id })[0];
  assert.equal(activity.activityType, 'bid_decision_review');
  assert.equal(activity.data.internalOnly, true);
  assert.equal(activity.data.externalCommitments, 0);
  assert.equal(ledger.listOpportunityBidDecisions({ opportunityId: opportunity.id }).length, 0);
  assert.equal(ledger.runAutonomousCycle({ actionTypes: ['review_bid_decision'] }).applied.length, 0);
});

test('bid/no-bid diagnostics detect tampered policy and decision snapshots', t => {
  const ledger = temporaryLedger(t);
  approvedMarketFit(ledger);
  const opportunity = qualifiedOpportunity(ledger, 'integrity');
  const policy = approvedDecisionPolicy(ledger);
  const requested = ledger.requestOpportunityBidDecision(opportunity.id, {
    entryKey: 'opportunity-bid-integrity-0001',
    ...scorecard(),
    proposedDecision: 'bid',
    rationale: 'Retain a checksum-protected pursuit decision for integrity testing.'
  }, { actor: 'office' });
  ledger.resolveApproval(requested.approval.id, {
    status: 'approved', resolvedBy: 'approver', reason: 'Integrity evidence verified.'
  });

  ledger.db.prepare("UPDATE opportunity_bid_decisions SET snapshot_json = '{}' WHERE id = ?").run(requested.decision.id);
  let diagnostics = ledger.diagnose();
  assert.equal(diagnostics.valid, false);
  assert.ok(diagnostics.issues.some(issue => issue.message.includes(`Opportunity bid/no-bid decision ${requested.decision.id} failed retained snapshot verification`)));

  ledger.db.prepare("UPDATE bid_decision_policies SET snapshot_json = '{}' WHERE id = ?").run(policy.policy.id);
  diagnostics = ledger.diagnose();
  assert.equal(diagnostics.valid, false);
  assert.ok(diagnostics.issues.some(issue => issue.message.includes('Bid/no-bid policy v1 failed retained snapshot verification')));
});
