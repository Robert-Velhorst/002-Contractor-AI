const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test('new worker registers, receives admission and self-enrolls in a published job position', async ({ page, request }, testInfo) => {
  const marker = Date.now();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const intake = await request.post('/api/ledger/intake', { data: { title: `Board QA ${marker}`, address: 'Private street 42', city: 'Arnhem', client: { name: 'Private client' }, assignAutomatically: false } });
  expect(intake.ok()).toBeTruthy();
  const payload = await intake.json();
  const job = payload.job;
  const taskResponse = await request.post(`/api/ledger/jobs/${job.id}/tasks`, { data: { title: 'Fit roof battens', description: 'Use the approved installation detail.' } });
  expect(taskResponse.ok()).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/work-board.html');
  const workerConfig = await request.get('/api/work-board/config');
  expect(await workerConfig.json()).toMatchObject({ enabled: true, registrationEnabled: true });
  await page.getByRole('button', { name: 'Registreren', exact: true }).click();
  await page.getByLabel('Naam', { exact: true }).fill(`Worker ${marker}`);
  await page.getByLabel('Telefoon', { exact: true }).fill('0612345678');
  await page.getByLabel('Plaatsen of gebieden', { exact: true }).fill('Arnhem');
  await page.getByLabel("Vakgebieden (gescheiden door komma's)", { exact: true }).fill('Carpenter');
  await page.getByLabel('E-mailadres', { exact: true }).fill(`worker-${marker}@example.test`);
  await page.getByLabel('Wachtwoord', { exact: true }).fill('Browser passphrase 12345');
  await page.getByLabel('Ik geef mijn gegevens aan deze aannemer voor toelating en planning van werk.', { exact: true }).check();
  await page.getByRole('button', { name: 'Account aanmaken', exact: true }).click();
  await expect(page.getByText(/Aanmelding ontvangen/)).toBeVisible();
  await page.getByLabel('Wachtwoord', { exact: true }).fill('Browser passphrase 12345');
  await page.locator('form').getByRole('button', { name: 'Inloggen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Beschikbaar werk' })).toBeVisible();
  const list = await request.get('/api/ledger/work-board/accounts');
  const account = (await list.json()).accounts.find(row => row.email === `worker-${marker}@example.test`);
  expect((await request.post(`/api/ledger/work-board/accounts/${account.id}/admit`, { data: { reference: 'Browser QA contact review' } })).ok()).toBeTruthy();
  const published = await request.post(`/api/ledger/jobs/${job.id}/work-board`, { data: { entryKey: `browser-position-${marker}`, title: 'Deuren plaatsen', role: 'Carpenter', city: 'Arnhem', startsAt: '2030-06-01T08:00:00Z', endsAt: '2030-06-01T16:00:00Z', hours: 8, capacity: 1, rate: 45, description: 'Deuren afhangen', materials: 'Op locatie', equipment: 'Handgereedschap', prerequisites: 'Dagstart', confirmPublication: true } });
  expect(published.ok()).toBeTruthy();
  const position = (await published.json()).position;
  await page.getByRole('button', { name: 'Posities verversen' }).click();
  await expect(page.getByRole('heading', { name: 'Deuren plaatsen' })).toBeVisible();
  await expect(page.getByText('Private street 42', { exact: false })).toHaveCount(0);
  await expect(page.getByText('8 uur per persoon')).toBeVisible();
  await page.getByLabel('Zoek op opdracht of plaats').fill('Nijmegen');
  await expect(page.getByText('Geen open posities gevonden. Pas je zoekterm of vakgebied aan.')).toBeVisible();
  await page.getByLabel('Zoek op opdracht of plaats').fill('deuren plaatsen');
  await expect(page.getByRole('heading', { name: 'Deuren plaatsen' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Vakgebied' }).selectOption('Carpenter');
  await page.getByRole('button', { name: 'Voorwaarden accepteren en inschrijven' }).click();
  await expect(page.getByRole('button', { name: 'Werkpakket openen' })).toBeVisible();
  const placementNotice = page.getByRole('link', { name: 'Je bent geplaatst' });
  await expect(placementNotice).toHaveAttribute('href', '/work-board.html#applications');
  const notification = placementNotice.locator('..');
  await expect(notification).toContainText('Private street 42, Arnhem');
  await expect(notification).toContainText('8 uur');
  await expect(notification).toContainText('geen startvrijgave');
  await placementNotice.click();
  await expect(page).toHaveURL(/#applications$/);
  await expect(page.getByRole('heading', { name: 'Mijn inschrijvingen' })).toBeInViewport();
  const waitlistProfile = { name: `Waitlist ${marker}`, email: `waitlist-${marker}@example.test`, phone: '0612345678', region: 'Arnhem', skills: ['Carpenter'], password: 'Waitlist passphrase 12345', privacyAccepted: true };
  expect((await request.post('/api/work-board/register', { data: waitlistProfile })).ok()).toBeTruthy();
  const waitlistLogin = await request.post('/api/work-board/login', { data: { email: waitlistProfile.email, password: waitlistProfile.password } });
  expect(waitlistLogin.ok()).toBeTruthy();
  const waitlistToken = (await waitlistLogin.json()).token;
  const waitlistEntry = await request.post(`/api/work-board/positions/${position.id}/enroll`, { data: { revision: position.revision }, headers: { Authorization: `Bearer ${waitlistToken}` } });
  expect((await waitlistEntry.json()).application.status).toBe('waitlisted');
  const waitlistPage = await page.context().newPage();
  await waitlistPage.setViewportSize({ width: 390, height: 844 });
  await waitlistPage.goto('/work-board.html');
  await waitlistPage.getByLabel('E-mailadres', { exact: true }).fill(waitlistProfile.email);
  await waitlistPage.getByLabel('Wachtwoord', { exact: true }).fill(waitlistProfile.password);
  await waitlistPage.locator('form').getByRole('button', { name: 'Inloggen', exact: true }).click();
  await expect(waitlistPage.getByText(/Op de wachtlijst · plek 1/)).toBeVisible();
  expect(await waitlistPage.getByRole('button', { name: 'Wachtlijst · plek 1', exact: true }).isDisabled()).toBe(true);
  await waitlistPage.getByRole('button', { name: 'Wachtlijst verlaten', exact: true }).click();
  await expect(waitlistPage.getByText('Je wachtlijstplek is ingetrokken.')).toBeVisible();
  await page.getByLabel('Vanaf', { exact: true }).fill('2030-06-01T10:00');
  await page.getByLabel('Tot', { exact: true }).fill('2030-06-01T18:00');
  await page.reload();
  await expect(page.getByLabel('Vanaf', { exact: true })).toHaveValue('2030-06-01T10:00');
  await expect(page.getByLabel('Tot', { exact: true })).toHaveValue('2030-06-01T18:00');
  await page.getByRole('button', { name: 'Verhindering melden', exact: true }).click();
  await expect(page.getByText(/1 geplande opdracht is geraakt/)).toBeVisible();
  await expect(page.getByText('De aannemer beoordeelt de bezetting.', { exact: false })).toBeVisible();
  await page.getByText('Gemelde beschikbaarheidsperioden', { exact: true }).click();
  await page.getByRole('button', { name: 'Eerder beschikbaar melden', exact: true }).click();
  await expect(page.getByText(/blijft actief totdat de aannemer de wijziging heeft beoordeeld/)).toBeVisible();
  await expect(page.getByText('wijziging in beoordeling', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: `Board QA ${marker}` })).toBeVisible();
  const standbyStart = '2030-06-03T08:00:00Z', standbyEnd = '2030-06-03T16:00:00Z';
  const standbyPosition = await request.post(`/api/ledger/jobs/${job.id}/work-board`, { data: { entryKey: `browser-standby-position-${marker}`, title: 'Afroep montage', role: 'Carpenter', city: 'Arnhem', startsAt: standbyStart, endsAt: standbyEnd, hours: 8, capacity: 1, rate: 45, description: 'Montage op afroep', materials: 'Op locatie', equipment: 'Handgereedschap', prerequisites: 'Dagstart', confirmPublication: true } });
  expect(standbyPosition.ok()).toBeTruthy();
  await page.getByRole('button', { name: 'Posities verversen' }).click();
  await expect(page.getByRole('heading', { name: 'Afroep montage' })).toBeVisible();
  await page.getByRole('button', { name: 'Standby op afroep' }).click();
  await page.getByLabel('Vanaf', { exact: true }).fill('2030-06-03T08:00');
  await page.getByLabel('Tot', { exact: true }).fill('2030-06-03T16:00');
  await page.getByRole('button', { name: 'Standby vastleggen', exact: true }).click();
  await expect(page.getByText(/Standby geregistreerd/)).toBeVisible();
  const workerBoard = await standbyPosition.json();
  await page.getByRole('button', { name: 'Posities verversen' }).click();
  const standbyCard = page.locator('.wb-positions article').filter({ hasText: 'Afroep montage' });
  await standbyCard.getByRole('button', { name: 'Voorwaarden accepteren en inschrijven' }).click();
  await expect(standbyCard.getByRole('button', { name: 'Standby, beoordeling vereist' })).toBeVisible();
  const ownerView = await request.get(`/api/ledger/jobs/${job.id}/work-board`);
  expect((await ownerView.json()).applications.some(application => application.positionId === workerBoard.position.id && application.holdReasons.includes('standby_confirmation_required'))).toBe(true);
  await page.getByRole('button', { name: 'Belangstelling intrekken', exact: true }).click();
  await expect(page.getByText(/Je belangstelling is ingetrokken/)).toBeVisible();
  await expect(page.getByText('Belangstelling ingetrokken. Je kunt je opnieuw inschrijven zolang de positie open is.')).toBeVisible();
  expect((await (await request.get(`/api/ledger/jobs/${job.id}/work-board`)).json()).applications
    .some(application => application.positionId === workerBoard.position.id && application.status === 'withdrawn')).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('worker-board-mobile.png'), fullPage: true });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Werkpakket openen' }).click();
  await expect(page.getByText('Private street 42', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Voortgang of blokkade melden' })).toBeVisible();
  await page.getByRole('button', { name: 'Geblokkeerd', exact: true }).click();
  await page.getByLabel('Wat houdt het werk tegen?').fill('Bevestigingsmateriaal ontbreekt op de bouwplaats.');
  await page.getByRole('button', { name: 'Blokkade melden', exact: true }).click();
  await expect(page.getByText(/Blokkade vastgelegd voor de aannemer/)).toBeVisible();
  const recovery = await request.get(`/api/ledger/jobs/${job.id}/operational-recovery`);
  expect((await recovery.json()).sources.some(source => source.type === 'field_progress_blocker' && source.impact.note === 'Bevestigingsmateriaal ontbreekt op de bouwplaats.')).toBe(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Werkpakket openen' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('worker explicitly accepts an expiring position offer before internal placement', async ({ page, request }) => {
  const marker = Date.now();
  const profile = { name: `Offer worker ${marker}`, email: `offer-worker-${marker}@example.test`, phone: '0612345678', region: 'Arnhem', skills: ['Carpenter'], password: 'Offer passphrase 12345', privacyAccepted: true };
  const registration = await request.post('/api/work-board/register', { data: profile });
  expect(registration.ok()).toBeTruthy();
  const login = await request.post('/api/work-board/login', { data: { email: profile.email, password: profile.password } });
  expect(login.ok()).toBeTruthy();
  const token = (await login.json()).token;
  const accounts = await request.get('/api/ledger/work-board/accounts');
  const registered = (await accounts.json()).accounts.find(row => row.email === profile.email);
  expect((await request.post(`/api/ledger/work-board/accounts/${registered.id}/admit`, { data: { reference: 'Offer workflow browser admission' } })).ok()).toBeTruthy();
  const jobResponse = await request.post('/api/ledger/intake', { data: { title: `Offer workflow ${marker}`, city: 'Arnhem', client: { name: 'Private client' }, assignAutomatically: false } });
  const job = (await jobResponse.json()).job;
  const startsAt = '2030-08-01T08:00:00Z', endsAt = '2030-08-01T16:00:00Z';
  const positionResponse = await request.post(`/api/ledger/jobs/${job.id}/work-board`, { data: {
    entryKey: `offer-workflow-${marker}`, title: 'Dakwerk', role: 'Carpenter', city: 'Arnhem', startsAt, endsAt, hours: 8, capacity: 1, rate: 45,
    description: 'Dakwerk uitvoeren', materials: 'Op locatie', equipment: 'Handgereedschap', prerequisites: 'Dagstart', confirmPublication: true
  } });
  const position = (await positionResponse.json()).position;
  const standby = await request.post('/api/work-board/availability', { data: { mode: 'standby', startsAt, endsAt }, headers: { Authorization: `Bearer ${token}` } });
  expect(standby.ok()).toBeTruthy();
  const enrollment = await request.post(`/api/work-board/positions/${position.id}/enroll`, { data: { revision: position.revision }, headers: { Authorization: `Bearer ${token}` } });
  const application = (await enrollment.json()).application;
  expect(application.status).toBe('interested');
  expect(application.assignmentId).toBeNull();
  const offer = await request.post(`/api/ledger/work-board/applications/${application.id}/offer`, { data: { expiresAt: new Date(Date.now() + 3600000).toISOString() } });
  expect(offer.ok()).toBeTruthy();
  expect((await offer.json()).application.status).toBe('offer_pending');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/work-board.html');
  await page.getByLabel('E-mailadres', { exact: true }).fill(profile.email);
  await page.getByLabel('Wachtwoord', { exact: true }).fill(profile.password);
  await page.locator('form').getByRole('button', { name: 'Inloggen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Aanbod accepteren' })).toBeVisible();
  await expect(page.getByText(/Je hebt een concreet aanbod/)).toBeVisible();
  await page.getByRole('button', { name: 'Aanbod accepteren' }).click();
  await expect(page.getByText(/Aanbod geaccepteerd en intern gepland/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Werkpakket openen' })).toBeVisible();
  const accepted = (await (await request.get(`/api/ledger/jobs/${job.id}/work-board`)).json()).applications.find(item => item.id === application.id);
  expect(accepted.status).toBe('assigned');
  expect(accepted.offer.status).toBe('accepted');
  expect(accepted.assignmentId).toBeTruthy();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('owner publishes position terms and admits an applicant through real dashboard controls', async ({ page, request }, testInfo) => {
  const marker = Date.now(), title = `Office board ${marker}`;
  const intake = await request.post('/api/ledger/intake', { data: { title, city: 'Arnhem', client: { name: 'Office test client' }, assignAutomatically: false } });
  expect(intake.ok()).toBeTruthy();
  const job = (await intake.json()).job;
  const taskResponse = await request.post(`/api/ledger/jobs/${job.id}/tasks`, { data: {
    title: `Taak ${marker}`, description: 'Werk volgens de goedgekeurde details.', requiredTrade: 'Carpenter', durationHours: 8,
    plannedStart: '2030-07-01T08:00:00Z', plannedEnd: '2030-07-01T16:00:00Z'
  } });
  expect(taskResponse.ok()).toBeTruthy();
  expect((await taskResponse.json()).task.id).toBeTruthy();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/work-board.html');
  await page.getByRole('link', { name: 'Verder als beheerder' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByLabel(/^(Language|Taal)$/).selectOption('nl-NL');
  await page.getByRole('button', { name: 'Projecten', exact: true }).click();
  await page.getByRole('button', { name: `${title} openen`, exact: true }).click();
  const dossier = page.getByTestId('job-workspace');
  await dossier.getByRole('tab', { name: 'Werkzaamheden', exact: true }).click();
  const board = dossier.getByRole('region', { name: 'Open posities', exact: true });
  await board.getByRole('button', { name: 'Concepten voorbereiden uit 1 open werkzaamheid/werkzaamheden' }).click();
  await expect(board.getByRole('status').filter({ hasText: '1 positieconcept(en) klaargezet; niet gepubliceerd en niet toegewezen.' })).toBeVisible();
  const draft = (await (await request.get(`/api/ledger/jobs/${job.id}/work-board`)).json()).positions
    .find(position => position.status === 'draft');
  expect(draft).toBeTruthy();
  expect(draft.missingFields).toContain('uurvergoeding');
  const fieldProfile = { name: `Draft check ${marker}`, email: `draft-check-${marker}@example.test`, phone: '0612345678',
    region: 'Arnhem', skills: ['Carpenter'], password: 'Draft check passphrase 123', privacyAccepted: true };
  expect((await request.post('/api/work-board/register', { data: fieldProfile })).ok()).toBeTruthy();
  const fieldLogin = await request.post('/api/work-board/login', { data: { email: fieldProfile.email, password: fieldProfile.password } });
  expect(fieldLogin.ok()).toBeTruthy();
  const fieldHeaders = { Authorization: `Bearer ${(await fieldLogin.json()).token}` };
  expect((await (await request.get('/api/work-board/positions', { headers: fieldHeaders })).json()).positions.some(position => position.id === draft.id)).toBe(false);
  await board.getByRole('button', { name: 'Concept verder bewerken', exact: true }).click();
  const fields = { 'Openbare titel': `Montage ${marker}`, Vakgebied: 'Carpenter', Plaats: 'Arnhem',
    Start: await board.getByLabel('Start', { exact: true }).inputValue(), Einde: await board.getByLabel('Einde', { exact: true }).inputValue(),
    'Arbeidsduur per persoon (uren)': '8', 'Aantal personen': '2', 'Uurvergoeding (EUR, excl. btw)': '45' };
  for (const [label, value] of Object.entries(fields)) await board.getByLabel(label, { exact: true }).fill(value);
  await board.locator('textarea[name="description"]').fill('Montage volgens tekening');
  await board.locator('textarea[name="materials"]').fill('Aannemer levert materiaal');
  await board.locator('textarea[name="equipment"]').fill('Eigen handgereedschap');
  await board.locator('textarea[name="prerequisites"]').fill('Dagstart verplicht');
  await board.getByRole('checkbox', { name: /Ik heb de openbare inhoud gecontroleerd/ }).check();
  await board.getByRole('button', { name: 'Positie vrijgeven', exact: true }).click();
  await expect(board.getByText(`Montage ${marker}`, { exact: true })).toBeVisible();
  const released = (await (await request.get(`/api/ledger/jobs/${job.id}/work-board`)).json()).positions
    .find(position => position.id === draft.id);
  expect(released.status).toBe('open');
  expect((await (await request.get('/api/work-board/positions', { headers: fieldHeaders })).json()).positions.some(position => position.id === draft.id)).toBe(true);
  await expect(board.locator('details')).not.toHaveAttribute('open');
  await board.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('office-position-desktop.png'), fullPage: false });
  await dossier.getByRole('button', { name: 'Opdrachtwerkruimte sluiten' }).click();
  const name = `Admission ${marker}`;
  expect((await request.post('/api/work-board/register', { data: { name, email: `admit-${marker}@example.test`, phone: '0612345678', skills: ['Carpenter'], region: 'Arnhem', password: 'Another long passphrase 123', privacyAccepted: true } })).ok()).toBeTruthy();
  await page.getByRole('button', { name: 'Beheer', exact: true }).click();
  const applicant = page.getByRole('region', { name: 'Toelating uitvoerenden' }).locator('article').filter({ hasText: name });
  await applicant.getByLabel('Referentie contact- en toelatingscontrole').fill('Contact and background checked');
  await applicant.getByRole('button', { name: 'Toelaten', exact: true }).click();
  await expect(applicant.getByText('Toegelaten', { exact: true })).toBeVisible();

  const outageLogin = await request.post('/api/work-board/login', { data: { email: `admit-${marker}@example.test`, password: 'Another long passphrase 123' } });
  expect(outageLogin.ok()).toBeTruthy();
  const fieldToken = (await outageLogin.json()).token;
  const fieldBoard = await request.get('/api/work-board/positions', { headers: { Authorization: `Bearer ${fieldToken}` } });
  const fieldPosition = (await fieldBoard.json()).positions.find(position => position.id === draft.id);
  expect(fieldPosition).toBeTruthy();
  const enrollment = await request.post(`/api/work-board/positions/${draft.id}/enroll`, {
    data: { revision: fieldPosition.revision }, headers: { Authorization: `Bearer ${fieldToken}` }
  });
  expect((await enrollment.json()).application.status).toBe('assigned');
  const outage = await request.post('/api/work-board/availability', {
    data: { mode: 'unavailable', startsAt: '2030-07-01T10:00:00Z', endsAt: '2030-07-01T12:00:00Z' },
    headers: { Authorization: `Bearer ${fieldToken}` }
  });
  expect((await outage.json()).conflicts.length).toBe(1);
  await page.getByRole('button', { name: 'Projecten', exact: true }).click();
  await page.getByRole('button', { name: `${title} openen`, exact: true }).click();
  const updatedDossier = page.getByTestId('job-workspace');
  await updatedDossier.getByRole('tab', { name: 'Werkzaamheden', exact: true }).click();
  const updatedBoard = updatedDossier.getByRole('region', { name: 'Open posities', exact: true });
  await expect(updatedBoard.getByRole('region', { name: 'Uitval en vervanging' })).toBeVisible();
  await expect(updatedBoard.getByText(/Geen geschikte standby-uitvoerder gevonden/)).toBeVisible();
  await updatedBoard.getByRole('button', { name: 'Open verstoringen en herstel' }).click();
  await expect(updatedDossier.getByRole('tab', { name: 'Planning', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(updatedDossier.getByRole('region', { name: 'Operationele herstelcasussen' })).toBeVisible();
  await expect(updatedDossier.getByRole('checkbox', { name: /Beschikbaarheid uitvoerder/ })).toBeChecked();
});

test('assigned worker requests release and the office approval closes the linked placement', async ({ page, request }) => {
  const marker = Date.now();
  const profile = { name: `Release worker ${marker}`, email: `release-${marker}@example.test`, phone: '0612345678',
    region: 'Arnhem', skills: ['Carpenter'], password: 'Release request passphrase 123', privacyAccepted: true };
  const intake = await request.post('/api/ledger/intake', { data: { title: `Release review ${marker}`, city: 'Arnhem',
    client: { name: `Release client ${marker}` }, assignAutomatically: false } });
  expect(intake.ok()).toBeTruthy();
  const job = (await intake.json()).job;
  expect((await request.post('/api/work-board/register', { data: profile })).ok()).toBeTruthy();
  const registered = await (await request.get('/api/ledger/work-board/accounts')).json();
  const account = registered.accounts.find(item => item.email === profile.email);
  expect((await request.post(`/api/ledger/work-board/accounts/${account.id}/admit`, { data: { reference: 'Release flow identity checked' } })).ok()).toBeTruthy();
  const positionResponse = await request.post(`/api/ledger/jobs/${job.id}/work-board`, { data: {
    entryKey: `release-position-${marker}`, title: 'Montage op locatie', role: 'Carpenter', city: 'Arnhem',
    startsAt: '2030-08-01T08:00:00Z', endsAt: '2030-08-01T16:00:00Z', hours: 8, capacity: 1, rate: 45,
    description: 'Montage volgens de actuele werkmap.', materials: 'Op locatie aanwezig.', equipment: 'Eigen handgereedschap.',
    prerequisites: 'Controleer de startvoorwaarden.', confirmPublication: true
  } });
  expect(positionResponse.ok()).toBeTruthy();
  const position = (await positionResponse.json()).position;
  const login = await request.post('/api/work-board/login', { data: { email: profile.email, password: profile.password } });
  expect(login.ok()).toBeTruthy();
  const workerToken = (await login.json()).token;
  const enrollment = await request.post(`/api/work-board/positions/${position.id}/enroll`, {
    data: { revision: position.revision }, headers: { Authorization: `Bearer ${workerToken}` }
  });
  const assignedApplication = (await enrollment.json()).application;
  expect(assignedApplication.status).toBe('assigned');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/work-board.html');
  await page.getByLabel('E-mailadres', { exact: true }).fill(profile.email);
  await page.getByLabel('Wachtwoord', { exact: true }).fill(profile.password);
  await page.locator('form').getByRole('button', { name: 'Inloggen', exact: true }).click();
  const releaseForm = page.getByRole('form', { name: 'Verzoek wijziging Montage op locatie' });
  await releaseForm.getByLabel('Reden').selectOption('family_care');
  const releaseResponsePromise = page.waitForResponse(response =>
    response.url().includes(`/api/work-board/applications/${assignedApplication.id}/release-request`)
      && response.request().method() === 'POST');
  await releaseForm.getByRole('button', { name: 'Vrijgave aanvragen' }).click();
  const releaseResponse = await releaseResponsePromise;
  expect(releaseResponse.ok()).toBeTruthy();
  const releaseRequest = (await releaseResponse.json()).request;
  await expect(page.getByText(/Je verzoek tot vrijgave wacht op beoordeling/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Werkpakket openen' })).toBeVisible();

  const pending = (await (await request.get('/api/ledger/approvals?status=pending&limit=100')).json()).approvals;
  const approval = pending.find(item => item.id === releaseRequest.id);
  expect(approval).toBeTruthy();
  expect(JSON.stringify(approval.data)).not.toContain('medical');
  expect((await request.post(`/api/ledger/approvals/${approval.id}/resolve`, {
    data: { status: 'approved', reason: 'Coverage and site handover reviewed.' }
  })).ok()).toBeTruthy();

  await page.getByRole('button', { name: 'Posities verversen' }).click();
  await expect(page.getByText('Plaatsing door de aannemer vrijgegeven')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Werkpakket openen' })).toHaveCount(0);
  const released = (await (await request.get(`/api/ledger/jobs/${job.id}/work-board`)).json())
    .applications.find(item => item.id === assignedApplication.id);
  expect(released.status).toBe('released');
  expect(released.assignmentStatus).toBe('released');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
