const { test, expect } = require('@playwright/test');
const { riskRegisterPayload } = require('../tests/risk-register-fixture');

test('commercial dossier distinguishes internal targets from recorded contractual client dates on desktop and mobile', async ({ page }) => {
  test.setTimeout(90000);
  const base = `http://127.0.0.1:${process.env.CONTRACTOR_AI_BROWSER_AUTH_PORT}`;
  const token = { Authorization: 'Bearer browser-office-token-at-least-32-characters' };
  const title = `Contractdatum browser ${Date.now()}`;
  const created = await page.request.post(`${base}/api/ledger/intake`, { headers: token,
    data: { title, targetCompletion: '2030-03-31', client: { name: 'Contractdatum klant' }, assignAutomatically: false } });
  expect(created.ok(), await created.text()).toBeTruthy();

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base);
  await page.locator('#operator-access-key').fill('browser-office-token-at-least-32-characters');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel(/^(Language|Taal)$/).selectOption('nl-NL');
  await page.getByRole('button', { name: 'Projecten', exact: true }).click();
  await page.getByRole('button', { name: `${title} openen`, exact: true }).click();
  const workspace = page.getByTestId('job-workspace');
  await workspace.getByRole('tab', { name: 'Financiën' }).click();
  const register = workspace.getByRole('region', { name: 'Contractuele klantdatums' });
  await expect(register.getByText(/nog geen controleerbare geaccepteerde offerte of wijziging/)).toBeVisible();
  await expect(register.getByRole('button', { name: 'Contractdatum vastleggen' })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  const geometry = await register.evaluate(element => ({ scroll: element.scrollWidth, client: element.clientWidth, page: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.client);
  expect(geometry.page).toBeLessThanOrEqual(geometry.viewport);
  await expect(register.getByText(/Streefdatums, planning en chatberichten zijn geen contractuele toezegging/)).toBeVisible();
});

test('office records source-bound contract-date impact inside a live recovery case', async ({ page }) => {
  test.setTimeout(90000);
  const base = `http://127.0.0.1:${process.env.CONTRACTOR_AI_BROWSER_AUTH_PORT}`;
  const office = { Authorization: 'Bearer browser-office-token-at-least-32-characters' };
  const owner = { Authorization: 'Bearer browser-owner-token-at-least-32-characters' };
  const title = `Contractimpact browser ${Date.now()}`;
  async function post(route, data, headers = office) {
    const response = await page.request.post(`${base}${route}`, { headers, data });
    expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
  }
  async function get(route) {
    const response = await page.request.get(`${base}${route}`, { headers: office });
    expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
  }
  const { job } = await post('/api/ledger/intake', { title, targetCompletion: '2030-03-31', client: { name: 'Impactklant' }, assignAutomatically: false });
  const scopeResult = await post(`/api/ledger/jobs/${job.id}/commercial-scope/revisions`, { entryKey: `contract-impact-scope-${Date.now()}`,
    title: 'Dakrenovatie', scopeSummary: 'De overeengekomen dakrenovatie op basis van de opname.', inclusions: ['Dakbedekking vervangen.'],
    assumptions: ['Toegang tot het dak is beschikbaar.'], exclusions: ['Onvoorzien houtrot.'], clientResponsibilities: ['Toegang verzorgen.'],
    contractorResponsibilities: ['Werk uitvoeren en opleveren.'], allowanceMode: 'none', noAllowanceReason: 'Geen stelposten.', reason: 'Contractimpact browser acceptatie.' });
  await post(`/api/ledger/approvals/${scopeResult.approval.id}/resolve`, { status: 'approved', reason: 'Scope geverifieerd.' }, owner);
  const riskResult = await post(`/api/ledger/jobs/${job.id}/risk-register/revisions`, riskRegisterPayload(`contract-impact-risk-${Date.now()}`, scopeResult.revision.id));
  await post(`/api/ledger/approvals/${riskResult.approval.id}/resolve`, { status: 'approved', reason: 'Risicoverantwoordelijkheid beoordeeld.' }, owner);
  const quoteResult = await post(`/api/ledger/jobs/${job.id}/quote`, { commercialScopeRevisionId: scopeResult.revision.id,
    lineItems: [{ description: 'Dakrenovatie', quantity: 1, unitPrice: 1000 }] });
  await post(`/api/ledger/approvals/${quoteResult.quote.approvalId}/resolve`, { status: 'approved', reason: 'Offerte gecontroleerd.' }, owner);
  const acceptance = await post(`/api/ledger/jobs/${job.id}/quotes/${quoteResult.quote.id}/acceptance`,
    { acceptedAt: '2026-09-24', evidenceReference: 'browser-ondertekende-offerte', notes: 'Ondertekende offerte ontvangen.' });
  await post(`/api/ledger/approvals/${acceptance.approval.id}/resolve`, { status: 'approved', reason: 'Acceptatiebewijs gecontroleerd.' }, owner);
  const dates = await get(`/api/ledger/jobs/${job.id}/client-date-commitments`), acceptedSource = dates.acceptedSources[0];
  await post(`/api/ledger/jobs/${job.id}/client-date-commitments`, { action: 'record', commandKey: `contract-impact-date-${Date.now()}`,
    entryKey: 'oplevering', sourceType: acceptedSource.type, sourceId: acceptedSource.id, acceptedSourceHash: acceptedSource.sourceHash,
    sourceHash: dates.sourceHash, dateKind: 'complete_by', date: '2030-04-30', label: 'Oplevering',
    contractWording: 'Uiterlijk 30 april 2030 opleveren.', evidenceReference: 'offerte, artikel 8.1' });
  await post(`/api/ledger/jobs/${job.id}/incidents`, { title: 'Tijdelijke werkblokkade', severity: 'low', status: 'reported', incidentType: 'other' });
  const scheduleSignal = (await get(`/api/ledger/jobs/${job.id}/operational-recovery`)).sources[0].impact.scheduleProjection;
  expect(scheduleSignal).toMatchObject({ baselineStatus: 'missing', pathStatus: 'not_comparable',
    contractComparisons: [{ relation: 'not_comparable' }] });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base);
  await page.locator('#operator-access-key').fill('browser-office-token-at-least-32-characters');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel(/^(Language|Taal)$/).selectOption('nl-NL');
  await page.getByRole('button', { name: 'Projecten', exact: true }).click();
  await page.getByRole('button', { name: `${title} openen`, exact: true }).click();
  const panel = page.getByRole('region', { name: 'Operationele herstelcasussen' });
  await panel.getByRole('checkbox', { name: /Veiligheidsmelding/ }).check();
  await panel.getByRole('button', { name: 'Herstelcasus aanmaken' }).click();
  await panel.getByLabel('Verantwoordelijke').fill('Werkvoorbereider');
  await panel.getByLabel('Opvolgen voor').fill('2030-04-20T09:00');
  await panel.getByLabel('Wat moet worden uitgezocht of voorbereid?').fill('Controleer het effect van de werkblokkade op de contractmijlpaal.');
  await panel.getByRole('button', { name: 'Herstel vastleggen' }).click();
  await expect(panel.getByText('Herstelcasus is bijgewerkt.')).toBeVisible();
  await expect(panel.getByText(/geen goedgekeurde basisplanning \/ niet vergelijkbaar \/ Oplevering: contractdatum niet te vergelijken/)).toBeVisible();
  await panel.getByText('Contractimpact beoordelen', { exact: true }).click();
  await panel.getByRole('combobox', { name: 'Beoordeling contractimpact' }).selectOption('at_risk');
  await panel.getByLabel('Waarom is deze mijlpaal wel of niet geraakt?').fill('De werkblokkade kan de resterende uitvoeringsperiode verkorten.');
  await panel.getByLabel('Opnieuw beoordelen op').fill('2030-04-22T09:00');
  await panel.getByRole('button', { name: 'Contractimpact vastleggen' }).click();
  await expect(panel.getByText('Contractimpact is vastgelegd. De contractdatum en klantcommunicatie zijn ongewijzigd.')).toBeVisible();
  const retained = await get(`/api/ledger/jobs/${job.id}/operational-recovery`), impactReview = retained.cases[0].clientDateImpactReviews[0];
  expect(impactReview).toMatchObject({ status: 'at_risk', current: true, commitment: { date: '2030-04-30', contractWording: 'Uiterlijk 30 april 2030 opleveren.' } });
  expect(retained.externalCommitments).toBe(0);
  expect((await get(`/api/ledger/jobs/${job.id}`)).job.targetCompletion).toBe('2030-03-31');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
});
