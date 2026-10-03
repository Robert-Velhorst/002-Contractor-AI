const test = require('node:test');
const assert = require('node:assert/strict');
const { portfolioSourceSummary, triageOperationalSources } = require('../operational-recovery');

test('deterministic recovery triage prioritizes safety, schedule and near-term material risks', () => {
  const safety = portfolioSourceSummary({ type: 'safety_incident', status: 'reported', severity: 'high', impact: {} });
  assert.deepEqual(triageOperationalSources([safety], Date.parse('2026-09-25T10:00:00Z')),
    { priority: 'immediate', action: 'safety_review' });

  const absence = portfolioSourceSummary({ type: 'worker_availability', status: 'active', title: 'Robin: niet beschikbaar', impact: {
    crossJobConflicts: [{ jobId: 'job-2', scheduledStart: '2026-09-26T08:00:00Z' }], crossJobConflictListComplete: true
  } });
  assert.deepEqual(triageOperationalSources([absence], Date.parse('2026-09-25T10:00:00Z')),
    { priority: 'today', action: 'confirm_workforce_coverage' });

  const futureAbsence = portfolioSourceSummary({ type: 'worker_availability', status: 'active', title: 'Robin: niet beschikbaar', impact: {
    crossJobConflicts: [{ jobId: 'job-2', scheduledStart: '2026-10-10T08:00:00Z' }], crossJobConflictListComplete: true
  } });
  assert.deepEqual(triageOperationalSources([futureAbsence], Date.parse('2026-09-25T10:00:00Z')),
    { priority: 'plan', action: 'confirm_workforce_coverage' });

  const material = portfolioSourceSummary({ type: 'material_requirement_shortfall', status: 'shortfall', impact: {
    materialLines: [{ itemName: 'Platen', shortfallQuantity: 3, neededBy: '2026-09-26T08:00:00Z' }]
  } });
  assert.deepEqual(triageOperationalSources([material], Date.parse('2026-09-25T10:00:00Z')),
    { priority: 'today', action: 'secure_material' });

  const planned = portfolioSourceSummary({ type: 'equipment_unavailable', status: 'blocked', impact: { toolName: 'Steiger' } });
  assert.deepEqual(triageOperationalSources([planned]), { priority: 'plan', action: 'check_equipment' });
});

test('portfolio source summaries retain useful impact but exclude free-text personal details', () => {
  const absence = portfolioSourceSummary({
    type: 'worker_availability', id: 'availability-1', status: 'active',
    title: 'Robin: griep en afspraak bij de arts',
    impact: {
      note: 'Medische toelichting die niet breed gedeeld mag worden.',
      crossJobConflicts: [{ jobId: 'job-2', jobTitle: 'Ander project' }],
      crossJobConflictListComplete: true,
      clientAppointments: [{ id: 'appointment-1' }],
      clientAppointmentsComplete: true,
      scheduleProjection: {
        affectedTaskCount: 3, criticalTaskCount: 1, pathStatus: 'critical_path_affected',
        contractComparisons: [{ relation: 'baseline_after_date' }]
      }
    }
  });

  assert.equal(absence.title, 'Robin: uitvoerder niet beschikbaar');
  assert.equal(absence.operationalImpact.crossJobConflictCount, 1);
  assert.equal(absence.operationalImpact.clientAppointmentCount, 1);
  assert.equal(absence.operationalImpact.affectedTaskCount, 3);
  assert.equal(absence.operationalImpact.criticalTaskCount, 1);
  assert.equal(absence.operationalImpact.impactedCommitmentCount, 1);
  assert.equal(JSON.stringify(absence).includes('griep'), false);
  assert.equal(JSON.stringify(absence).includes('arts'), false);
  assert.equal(JSON.stringify(absence).includes('Medische toelichting'), false);
  assert.equal(Object.hasOwn(absence.operationalImpact, 'note'), false);
});

test('safety summaries keep severity and review requirement but not incident text', () => {
  const safety = portfolioSourceSummary({
    type: 'safety_incident', id: 'incident-1', status: 'reported', severity: 'high',
    title: 'Werknemer viel van steiger bij woning aan de Dorpsstraat',
    impact: { note: 'Persoonlijke details van betrokkenen.' }
  });

  assert.equal(safety.title, 'Veiligheidsmelding');
  assert.equal(safety.severity, 'high');
  assert.equal(safety.operationalImpact.safetyReviewRequired, true);
  assert.equal(JSON.stringify(safety).includes('Dorpsstraat'), false);
  assert.equal(JSON.stringify(safety).includes('Persoonlijke details'), false);
});

test('quality summaries expose controlled status and severity without NCR content', () => {
  const quality = portfolioSourceSummary({
    type: 'quality_nonconformance', id: 'ncr-1', status: 'pending_closure_approval', severity: 'critical',
    title: 'Free text containing client and worker details',
    impact: {
      dueAt: '2035-05-25', integrityValid: true, correctionIntegrityValid: true,
      closureIntegrityValid: true, correctiveActionRecorded: true,
      notes: 'Internal investigation details must not leave the NCR dossier.'
    }
  });

  assert.equal(quality.title, 'Kwaliteitsafwijking');
  assert.equal(quality.severity, 'critical');
  assert.equal(quality.operationalImpact.qualityReviewRequired, true);
  assert.equal(quality.operationalImpact.qualityDueAt, '2035-05-25');
  assert.equal(quality.operationalImpact.qualityCorrectiveActionRecorded, true);
  assert.equal(JSON.stringify(quality).includes('Free text'), false);
  assert.equal(JSON.stringify(quality).includes('investigation details'), false);
});

test('material and equipment summaries expose only structured planning fields', () => {
  const material = portfolioSourceSummary({
    type: 'material_requirement_shortfall', id: 'material-1', status: 'needed',
    title: 'Onveilige vrije invoer',
    impact: {
      materialLines: [{ itemName: 'Tegellijm', unit: 'zakken', shortfallQuantity: '4',
        requiredQuantity: 12, acceptedToDate: 8, neededBy: '2035-05-25',
        affectedTasks: [{ id: 'task-1' }] }],
      note: 'Vrije tekst hoort niet in de portfolio-samenvatting.',
      scheduleProjection: { pathStatus: 'critical_path_affected', affectedTaskCount: 2, criticalTaskCount: 1 }
    }
  });
  const equipment = portfolioSourceSummary({
    type: 'equipment_unavailable', id: 'equipment-1', status: 'blocked', title: 'Vrije omschrijving',
    impact: { toolName: 'Hoogwerker', toolStatus: 'maintenance', inspectionStatus: 'expired',
      inspectionBlocksReservation: true, neededFrom: '2035-05-25', neededUntil: '2035-05-27' }
  });

  assert.equal(material.title, 'Materiaaltekort');
  assert.equal(material.operationalImpact.materialLines[0].shortfallQuantity, 4);
  assert.equal(material.operationalImpact.materialLines[0].affectedTaskCount, 1);
  assert.equal(material.operationalImpact.criticalTaskCount, 1);
  assert.equal(JSON.stringify(material).includes('Onveilige vrije invoer'), false);
  assert.equal(JSON.stringify(material).includes('Vrije tekst'), false);
  assert.deepEqual(equipment.operationalImpact.equipment, {
    name: 'Hoogwerker', status: 'maintenance', inspectionStatus: 'expired',
    fieldSafetyHoldOpen: false, fieldSafetyIssueType: null,
    neededFrom: '2035-05-25', neededUntil: '2035-05-27',
    affectedReservationCount: 0, affectedReservationListComplete: false,
    replacementCandidateCount: 0, replacementCandidateListComplete: false,
    replacementCompatibilityVerified: false, inspectionBlocksReservation: true
  });
  assert.equal(equipment.title, 'Hoogwerker: materieel niet inzetbaar');
});
